import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runBusSource = fs.readFileSync(new URL('../src/stores/runBus.ts', import.meta.url), 'utf8');

test('run bus exposes node-scoped cancellation without clearing unrelated runs', () => {
  assert.match(runBusSource, /cancelNode:\s*\(id:\s*string\)\s*=>\s*void/);
  assert.match(runBusSource, /cancelNode:\s*\(id\)\s*=>[\s\S]*runningIds\.filter\(\(runningId\)\s*=>\s*runningId\s*!==\s*id\)/);
  assert.match(runBusSource, /cancelTargets:\s*\[id\]/);

  const cancelNodeStart = runBusSource.indexOf('cancelNode: (id) =>');
  const cancelAllStart = runBusSource.indexOf('cancelAll:', cancelNodeStart);
  assert.ok(cancelNodeStart >= 0 && cancelAllStart > cancelNodeStart);
  const cancelNodeSource = runBusSource.slice(cancelNodeStart, cancelAllStart);
  assert.doesNotMatch(cancelNodeSource, /runningIds:\s*\[\]/);
  assert.doesNotMatch(cancelNodeSource, /batchTotal:\s*0|batchDoneCount:\s*0/);
});

test('run bus cancels multiple selected nodes in one atomic update', () => {
  assert.match(runBusSource, /cancelNodes:\s*\(ids:\s*string\[\]\)\s*=>\s*void/);
  assert.match(runBusSource, /cancelNodes:\s*\(ids\)\s*=>[\s\S]*new Set\(ids\.filter\(Boolean\)\)/);
  assert.match(runBusSource, /cancelTargets:\s*targets/);
  assert.match(runBusSource, /const runningIds\s*=\s*s\.runningIds\.filter\(\(runningId\)\s*=>\s*!targets\.includes\(runningId\)\)/);
  assert.match(runBusSource, /cancelNodes:[\s\S]*return \{[\s\S]*runningIds,[\s\S]*cancelTargets:\s*targets/);
});
