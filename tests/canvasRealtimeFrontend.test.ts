import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('frontend exposes a canvas realtime websocket client', () => {
  const service = read('../src/services/canvasRealtime.ts');

  assert.match(service, /class CanvasRealtimeClient/);
  assert.match(service, /new WebSocket/);
  assert.match(service, /\/api\/canvas\/realtime/);
  assert.match(service, /sendOp/);
  assert.match(service, /canvas:op/);
  assert.match(service, /reconnectTimer/);
});

test('Canvas subscribes to active canvas realtime operations and broadcasts snapshots', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const viteConfig = read('../vite.config.ts');

  assert.match(canvas, /CanvasRealtimeClient/);
  assert.match(canvas, /makeCanvasRealtimeClientId/);
  assert.match(canvas, /applyCanvasRealtimeOp/);
  assert.match(canvas, /realtimeClientRef/);
  assert.match(canvas, /canvas:snapshot/);
  assert.match(canvas, /applyingRemoteRealtimeRef/);
  assert.match(viteConfig, /ws:\s*true/);
});
