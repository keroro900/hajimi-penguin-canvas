import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCanvasRealtimeOp,
  makeCanvasRealtimeClientId,
  normalizeCanvasRealtimeOp,
} from '../src/utils/canvasRealtime.ts';

function baseCanvas() {
  return {
    nodes: [
      { id: 'node-a', type: 'text', position: { x: 10, y: 20 }, data: { text: 'A' } },
      { id: 'node-b', type: 'image', position: { x: 300, y: 20 }, data: { imageUrl: '/cat.png' } },
    ] as any[],
    edges: [
      { id: 'edge-a-b', source: 'node-a', target: 'node-b' },
    ] as any[],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

test('canvas realtime ops add update and remove nodes by id', () => {
  const addOp = normalizeCanvasRealtimeOp({
    opId: 'op-add',
    canvasId: 'canvas-a',
    clientId: 'client-a',
    type: 'node:add',
    payload: {
      node: { id: 'node-cat', type: 'image', position: { x: 40, y: 90 }, data: { label: 'cat' } },
    },
  });

  const added = applyCanvasRealtimeOp(baseCanvas(), addOp);
  assert.equal(added.changed, true);
  assert.equal(added.canvas.nodes.some((node: any) => node.id === 'node-cat'), true);

  const updated = applyCanvasRealtimeOp(added.canvas, normalizeCanvasRealtimeOp({
    opId: 'op-update',
    canvasId: 'canvas-a',
    clientId: 'client-a',
    type: 'node:update',
    payload: {
      id: 'node-cat',
      patch: { position: { x: 88, y: 120 }, data: { label: 'black cat', imageUrl: '/black-cat.png' } },
    },
  }));
  const cat = updated.canvas.nodes.find((node: any) => node.id === 'node-cat');
  assert.deepEqual(cat?.position, { x: 88, y: 120 });
  assert.deepEqual(cat?.data, { label: 'black cat', imageUrl: '/black-cat.png' });

  const removed = applyCanvasRealtimeOp(updated.canvas, normalizeCanvasRealtimeOp({
    opId: 'op-remove',
    canvasId: 'canvas-a',
    clientId: 'client-b',
    type: 'node:remove',
    payload: { ids: ['node-cat', 'node-a'] },
  }));
  assert.deepEqual(removed.canvas.nodes.map((node: any) => node.id), ['node-b']);
  assert.deepEqual(removed.canvas.edges, []);
});

test('canvas realtime ops add and remove edges by id', () => {
  const added = applyCanvasRealtimeOp(baseCanvas(), normalizeCanvasRealtimeOp({
    opId: 'op-edge',
    canvasId: 'canvas-a',
    clientId: 'client-a',
    type: 'edge:add',
    payload: { edge: { id: 'edge-extra', source: 'node-b', target: 'node-a' } },
  }));

  assert.deepEqual(added.canvas.edges.map((edge: any) => edge.id), ['edge-a-b', 'edge-extra']);

  const removed = applyCanvasRealtimeOp(added.canvas, normalizeCanvasRealtimeOp({
    opId: 'op-edge-remove',
    canvasId: 'canvas-a',
    clientId: 'client-b',
    type: 'edge:remove',
    payload: { ids: ['edge-a-b'] },
  }));
  assert.deepEqual(removed.canvas.edges.map((edge: any) => edge.id), ['edge-extra']);
});

test('canvas realtime snapshot replaces nodes edges and viewport', () => {
  const result = applyCanvasRealtimeOp(baseCanvas(), normalizeCanvasRealtimeOp({
    opId: 'op-snapshot',
    canvasId: 'canvas-a',
    clientId: 'client-a',
    type: 'canvas:snapshot',
    payload: {
      nodes: [{ id: 'node-only', type: 'text', position: { x: 1, y: 2 }, data: {} }],
      edges: [],
      viewport: { x: 10, y: 20, zoom: 0.5 },
    },
  }));

  assert.equal(result.changed, true);
  assert.deepEqual(result.canvas.nodes.map((node: any) => node.id), ['node-only']);
  assert.deepEqual(result.canvas.edges, []);
  assert.deepEqual(result.canvas.viewport, { x: 10, y: 20, zoom: 0.5 });
});

test('canvas realtime normalization rejects invalid operations and stable client ids are prefixed', () => {
  assert.throws(() => normalizeCanvasRealtimeOp({ type: 'node:add', payload: {} }), /canvasId/);
  assert.throws(() => normalizeCanvasRealtimeOp({ canvasId: 'c', clientId: 'u', type: 'unknown', payload: {} }), /type/);

  const id = makeCanvasRealtimeClientId('canvas-a');
  assert.match(id, /^t8rt-canvas-a-/);
  assert.notEqual(id, makeCanvasRealtimeClientId('canvas-a'));
});
