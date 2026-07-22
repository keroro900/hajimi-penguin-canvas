import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');

test('Canvas uses the material validator for connect, preview, and reconnect', () => {
  assert.match(source, /validateMaterialConnection/);
  assert.match(source, /validateMaterialConnection\(validationNodes,\s*curEdges,\s*candidate/);
  assert.match(source, /validateMaterialConnection\(curNodes,\s*edgesRef\.current,[\s\S]*edge\.id/);
  assert.match(source, /onIsValidConnection[\s\S]*validateMaterialConnection/);
});

test('Canvas validates bulk reconnect and pasted edge batches sequentially', () => {
  const calls = source.match(/validateMaterialConnections\(/g) || [];
  assert.ok(calls.length >= 3, `expected at least 3 batch validation call sites, got ${calls.length}`);
  assert.match(source, /newInternalEdges,\s*\.\.\.extraEdges/);
  assert.match(source, /rejected/);
});

test('dropping a source connection on a group body targets group-in', () => {
  assert.match(source, /hitNode\?\.type === 'groupBox'/);
  assert.match(source, /targetHandle:\s*'group-in'/);
  assert.match(source, /onConnect\(\{[\s\S]*target:\s*hitNode\.id/);
});

test('Canvas group membership delegates to geometry-only shared helper', () => {
  assert.match(source, /getGroupMemberIds/);
  assert.match(source, /const groupMemberIdsFromNodes[\s\S]{0,400}return getGroupMemberIds\(groupNode, sourceNodes\)/);
  assert.doesNotMatch(source, /const memberIds = new Set<string>\([\s\S]{0,300}\?\.memberIds/);
});
