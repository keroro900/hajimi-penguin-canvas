import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isLikelyPanoramaImage,
  panoramaRenderSize,
  resolvePanoramaRatio,
} from '../src/utils/panorama3d.ts';

test('panorama 3d node is registered under the 3D category', () => {
  const registry = readFileSync(new URL('../src/config/nodeRegistry.ts', import.meta.url), 'utf8');
  const ports = readFileSync(new URL('../src/config/portTypes.ts', import.meta.url), 'utf8');
  const types = readFileSync(new URL('../src/types/canvas.ts', import.meta.url), 'utf8');
  const placement = readFileSync(new URL('../src/utils/nodePlacement.ts', import.meta.url), 'utf8');

  assert.match(registry, /type:\s*'panorama-3d'[\s\S]*label:\s*'3D全景'[\s\S]*category:\s*'3d'/);
  assert.match(registry, /'3d':\s*\{\s*label:\s*'3D'/);
  assert.match(ports, /'panorama-3d':\s*\{\s*inputs:\s*\['image'\],\s*outputs:\s*\['image'\]\s*\}/);
  assert.match(types, /\|\s*'panorama-3d'/);
  assert.match(types, /\|\s*'3d'/);
  assert.match(placement, /'panorama-3d':\s*\{\s*w:\s*760,\s*h:\s*620\s*\}/);
});

test('panorama 3d node uses bundled three dependency instead of importing public assets', () => {
  const source = readFileSync(new URL('../src/components/nodes/Panorama3DNode.tsx', import.meta.url), 'utf8');

  assert.match(source, /import\('three'\)/);
  assert.doesNotMatch(source, /\/vendor\/js\/three/);
  assert.doesNotMatch(source, /@vite-ignore/);
  assert.match(source, /if \(!autoRotate \|\| status !== 'ready'\)/);
});

test('resolvePanoramaRatio returns presets and sanitized custom ratios', () => {
  assert.deepEqual(resolvePanoramaRatio('wide', 1, 1), { w: 16, h: 9 });
  assert.deepEqual(resolvePanoramaRatio('custom', 21, 9), { w: 21, h: 9 });
  assert.deepEqual(resolvePanoramaRatio('custom', -10, 'bad'), { w: 1, h: 9 });
});

test('panoramaRenderSize keeps the selected viewport aspect', () => {
  assert.deepEqual(panoramaRenderSize({ w: 16, h: 9 }), { width: 1536, height: 864 });
  assert.deepEqual(panoramaRenderSize({ w: 9, h: 16 }), { width: 864, height: 1536 });
  assert.deepEqual(panoramaRenderSize({ w: 1, h: 1 }, 1024), { width: 1024, height: 1024 });
});

test('isLikelyPanoramaImage detects names and 2:1 dimensions', () => {
  assert.equal(isLikelyPanoramaImage({ label: '展厅 360 全景图.png' }), true);
  assert.equal(isLikelyPanoramaImage({ url: '/output/panorama-room.png' }), true);
  assert.equal(isLikelyPanoramaImage({ width: 4096, height: 2048 }), true);
  assert.equal(isLikelyPanoramaImage({ width: 1024, height: 1024 }), false);
});
