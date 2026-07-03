import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/components/NodeActionBar.tsx'), 'utf8');

test('NodeActionBar treats image generating status as running', () => {
  assert.match(source, /selectedStatus\s*===\s*'generating'/);
});

test('NodeActionBar exposes selected node progress while running', () => {
  assert.match(source, /selectedProgressLabel/);
  assert.match(source, /STOP\s*\{/);
});
