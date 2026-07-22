import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

test('NodeActionBar uses store selectors instead of subscribing to all nodes', () => {
  const source = readProjectFile('src/components/NodeActionBar.tsx');

  assert.match(source, /useStore/);
  assert.doesNotMatch(source, /\buseNodes\b/);
  assert.match(source, /selectedExecutableNode|selectedExeSummary|selectedNodeSummary/);
});

test('GroupBoxNode derives live membership from store selectors instead of useNodes', () => {
  const source = readProjectFile('src/components/nodes/GroupBoxNode.tsx');

  assert.match(source, /useStore/);
  assert.doesNotMatch(source, /\buseNodes\b/);
  assert.match(source, /groupLiveState|liveMemberIds/);
});
