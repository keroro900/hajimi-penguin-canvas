import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('backend wires canvas realtime websocket hub through the HTTP server upgrade path', () => {
  const server = read('../backend/src/server.js');
  const backendPackage = read('../backend/package.json');

  assert.match(server, /require\('http'\)/);
  assert.match(server, /createServer\(app\)/);
  assert.match(server, /createCanvasRealtimeHub/);
  assert.match(server, /attachCanvasRealtimeHub/);
  assert.match(server, /server\.listen\(PORT,\s*HOST/);
  assert.match(backendPackage, /"ws"\s*:/);
});

test('canvas realtime hub validates rooms and broadcasts operations without echoing sender', () => {
  const hub = read('../backend/src/realtime/canvasHub.js');

  assert.match(hub, /const WebSocket = require\('ws'\)/);
  assert.match(hub, /function safeRealtimeText/);
  assert.match(hub, /function normalizeRealtimeOp/);
  assert.match(hub, /function joinCanvasRoom/);
  assert.match(hub, /function broadcastToCanvasRoom/);
  assert.match(hub, /if\s*\(client === exceptClient\)\s*continue/);
  assert.match(hub, /type:\s*'presence:join'/);
  assert.match(hub, /type:\s*'presence:leave'/);
  assert.match(hub, /type:\s*'canvas:op'/);
  assert.match(hub, /module\.exports\s*=\s*{\s*createCanvasRealtimeHub/);
});
