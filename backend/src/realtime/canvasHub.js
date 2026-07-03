const WebSocket = require('ws');

const REALTIME_PATH = '/api/canvas/realtime';
const HEARTBEAT_MS = 30000;
const VALID_OP_TYPES = new Set([
  'node:add',
  'node:update',
  'node:remove',
  'nodes:replace',
  'edge:add',
  'edge:remove',
  'edges:replace',
  'viewport:update',
  'canvas:snapshot',
]);

function safeRealtimeText(value, fallback = '', maxLength = 240) {
  const text = String(value || fallback || '').replace(/\0/g, '').trim();
  return text.slice(0, maxLength);
}

function sendJson(client, message) {
  if (!client || client.readyState !== WebSocket.OPEN) return false;
  try {
    client.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function normalizeRealtimeOp(input, session) {
  const canvasId = safeRealtimeText(input?.canvasId || session.canvasId);
  const clientId = safeRealtimeText(input?.clientId || session.clientId);
  const opId = safeRealtimeText(input?.opId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const type = safeRealtimeText(input?.type);
  if (!canvasId) throw new Error('canvasId is required');
  if (!clientId) throw new Error('clientId is required');
  if (!VALID_OP_TYPES.has(type)) throw new Error(`unsupported op type: ${type || 'empty'}`);
  const payload = input?.payload && typeof input.payload === 'object' ? input.payload : {};
  const createdAt = Number.isFinite(Number(input?.createdAt)) ? Number(input.createdAt) : Date.now();
  return { opId, canvasId, clientId, type, payload, createdAt };
}

function createCanvasRealtimeHub(options = {}) {
  const logger = options.logger || console;
  const rooms = new Map();
  const sessions = new Map();
  const wss = new WebSocket.Server({ noServer: true });

  function roomFor(canvasId) {
    const id = safeRealtimeText(canvasId);
    if (!rooms.has(id)) rooms.set(id, new Set());
    return rooms.get(id);
  }

  function broadcastToCanvasRoom(canvasId, message, exceptClient = null) {
    const room = rooms.get(canvasId);
    if (!room) return 0;
    let sent = 0;
    for (const client of room) {
      if (client === exceptClient) continue;
      if (sendJson(client, message)) sent += 1;
    }
    return sent;
  }

  function leaveCanvasRoom(client) {
    const session = sessions.get(client);
    if (!session) return;
    const room = rooms.get(session.canvasId);
    if (room) {
      room.delete(client);
      if (room.size === 0) rooms.delete(session.canvasId);
    }
    sessions.delete(client);
    broadcastToCanvasRoom(session.canvasId, {
      type: 'presence:leave',
      canvasId: session.canvasId,
      clientId: session.clientId,
      createdAt: Date.now(),
    }, client);
  }

  function joinCanvasRoom(client, session) {
    sessions.set(client, session);
    roomFor(session.canvasId).add(client);
    sendJson(client, {
      type: 'session:ready',
      canvasId: session.canvasId,
      clientId: session.clientId,
      createdAt: Date.now(),
    });
    broadcastToCanvasRoom(session.canvasId, {
      type: 'presence:join',
      canvasId: session.canvasId,
      clientId: session.clientId,
      createdAt: Date.now(),
    }, client);
  }

  function handleMessage(client, raw) {
    const session = sessions.get(client);
    if (!session) return;
    let message = null;
    try {
      message = JSON.parse(String(raw || '{}'));
    } catch {
      sendJson(client, { type: 'error', error: 'invalid_json', createdAt: Date.now() });
      return;
    }
    if (message?.type === 'ping') {
      sendJson(client, { type: 'pong', createdAt: Date.now() });
      return;
    }
    try {
      const op = normalizeRealtimeOp(message, session);
      broadcastToCanvasRoom(op.canvasId, { type: 'canvas:op', op, createdAt: Date.now() }, client);
    } catch (error) {
      sendJson(client, { type: 'error', error: error?.message || String(error), createdAt: Date.now() });
    }
  }

  function handleConnection(client, request, params) {
    const canvasId = safeRealtimeText(params.get('canvasId'));
    const clientId = safeRealtimeText(params.get('clientId'), `client-${Date.now()}`);
    if (!canvasId || !clientId) {
      client.close(1008, 'canvasId and clientId are required');
      return;
    }
    client.isAlive = true;
    client.on('pong', () => {
      client.isAlive = true;
    });
    joinCanvasRoom(client, {
      canvasId,
      clientId,
      ip: request.socket?.remoteAddress || '',
      connectedAt: Date.now(),
    });
    client.on('message', (raw) => handleMessage(client, raw));
    client.on('close', () => leaveCanvasRoom(client));
    client.on('error', (error) => {
      logger.warn?.(`[canvas-realtime] websocket error: ${error?.message || error}`);
      leaveCanvasRoom(client);
    });
  }

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        leaveCanvasRoom(client);
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        leaveCanvasRoom(client);
        client.terminate();
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  wss.on('close', () => clearInterval(heartbeat));

  function handleUpgrade(request, socket, head) {
    let url;
    try {
      url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    } catch {
      socket.destroy();
      return true;
    }
    if (url.pathname !== REALTIME_PATH) return false;
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request, url.searchParams);
    });
    return true;
  }

  wss.on('connection', handleConnection);

  return {
    handleUpgrade,
    rooms,
    sessions,
    wss,
    normalizeRealtimeOp,
    joinCanvasRoom,
    broadcastToCanvasRoom,
  };
}

function attachCanvasRealtimeHub(server, hub) {
  server.on('upgrade', (request, socket, head) => {
    if (!hub.handleUpgrade(request, socket, head)) {
      socket.destroy();
    }
  });
}

module.exports = { createCanvasRealtimeHub, attachCanvasRealtimeHub };
