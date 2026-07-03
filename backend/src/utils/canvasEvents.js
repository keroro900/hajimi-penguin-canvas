const canvasEventClients = new Set();

function writeSse(client, event, payload) {
  const data = JSON.stringify(payload || {});
  client.write(`event: ${event}\n`);
  client.write(`data: ${data}\n\n`);
}

function broadcastCanvasEvent(event, payload) {
  for (const client of canvasEventClients) {
    try {
      writeSse(client, event, payload);
    } catch {
      canvasEventClients.delete(client);
    }
  }
}

function handleCanvasEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(': hakimi canvas events connected\n\n');
  canvasEventClients.add(res);
  req.on('close', () => {
    canvasEventClients.delete(res);
  });
}

module.exports = {
  broadcastCanvasEvent,
  handleCanvasEvents,
  writeSse,
};
