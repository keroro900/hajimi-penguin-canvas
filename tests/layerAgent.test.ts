import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const express = require('express');
const layerAgentRouter = require('../backend/src/routes/layerAgent.js');

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/layer-agent', layerAgentRouter);
  const server = await new Promise<any>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

test('layer agent route returns a LayerStack protocol preview', async () => {
  const { server, base } = await createApp();
  try {
    const response = await fetch(`${base}/api/layer-agent/decompose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceImageUrl: '/files/output/demo.png',
        mode: 'pro',
        requestedLayers: ['background', 'product', 'text', 'logo', 'effect', 'product'],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.stack.sourceImageUrl, '/files/output/demo.png');
    assert.equal(body.data.stack.meta.mode, 'pro');
    assert.equal(body.data.stack.meta.pendingProvider, true);
    assert.deepEqual(
      body.data.stack.layers.map((layer: any) => layer.type),
      ['background', 'product', 'text', 'logo', 'effect'],
    );
    assert.equal(
      body.data.stack.layers
        .filter((layer: any) => layer.type !== 'background')
        .some((layer: any) => layer.imageUrl === '/files/output/demo.png'),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('layer agent route validates missing source image', async () => {
  const { server, base } = await createApp();
  try {
    const response = await fetch(`${base}/api/layer-agent/decompose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'lite' }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.error, /sourceImageUrl/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('layer agent node is registered, executable, routed and package-checked', () => {
  const registry = read('src/config/nodeRegistry.ts');
  const ports = read('src/config/portTypes.ts');
  const types = read('src/types/canvas.ts');
  const canvas = read('src/components/Canvas.tsx');
  const actionBar = read('src/components/NodeActionBar.tsx');
  const service = read('src/services/layerAgent.ts');
  const node = read('src/components/nodes/LayerAgentNode.tsx');
  const server = read('backend/src/server.js');
  const postBuild = read('electron/_post_build.cjs');

  assert.match(registry, /type:\s*'layer-agent'[\s\S]*label:\s*'AI图片分层'/);
  assert.match(ports, /'layer-agent':\s*\{\s*inputs:\s*\['image'\],\s*outputs:\s*\['image', 'metadata'\]/);
  assert.match(types, /\|\s*'layer-agent'/);
  assert.match(canvas, /LayerAgentNode/);
  assert.match(canvas, /'layer-agent':\s*LayerAgentNode/);
  assert.match(actionBar, /'layer-agent'/);
  assert.match(service, /\/api\/layer-agent\/decompose/);
  assert.match(node, /visibleLayerImageUrl/);
  assert.match(node, /layer\.imageUrl === panelSource/);
  assert.match(server, /const layerAgentRouter = require\('\.\/routes\/layerAgent'\)/);
  assert.match(server, /app\.use\('\/api\/layer-agent', layerAgentRouter\)/);
  assert.match(postBuild, /routes', 'layerAgent\.t8c'/);
});
