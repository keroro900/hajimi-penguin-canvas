import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

test('Topaz image and video nodes no longer subscribe to all nodes', () => {
  const imageSource = readProjectFile('src/components/nodes/TopazImageUpscaleNode.tsx');
  const videoSource = readProjectFile('src/components/nodes/TopazVideoUpscaleNode.tsx');

  assert.match(imageSource, /useUpstreamNodeData|useStore/);
  assert.doesNotMatch(imageSource, /\buseNodes\b/);
  assert.match(videoSource, /useUpstreamNodeData|useStore/);
  assert.doesNotMatch(videoSource, /\buseNodes\b/);
});

test('BatchProcessor node drops useNodes full subscription on upstream material collection', () => {
  const source = readProjectFile('src/components/nodes/BatchProcessorNode.tsx');

  assert.match(source, /useUpstreamNodeData|useStore/);
  assert.doesNotMatch(source, /\buseNodes\b/);
});
