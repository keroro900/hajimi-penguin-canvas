import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/nodes/GroupBoxNode.tsx', import.meta.url), 'utf8');

test('GroupBox renders stable bidirectional material handles', () => {
  assert.match(source, /type="target"[\s\S]*id="group-in"/);
  assert.match(source, /position=\{Position\.Left\}/);
  assert.match(source, /type="source"[\s\S]*id="group-out"/);
  assert.match(source, /isConnectableEnd=\{true\}/);
});

test('GroupBox uses canonical input and output bundles with plural compatibility fields', () => {
  assert.match(source, /resolveGroupInputBundle/);
  assert.match(source, /resolveGroupOutputBundle/);
  assert.match(source, /materialBundleToCompatibilityData/);
  assert.match(source, /videoUrls/);
  assert.match(source, /audioUrls/);
  assert.match(source, /materialBundleSignature/);
});

test('GroupBox shows compact live input and output counts', () => {
  assert.match(source, /IN/);
  assert.match(source, /OUT/);
  assert.match(source, /incomingBundle/);
  assert.match(source, /outgoingBundle/);
});
