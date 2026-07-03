import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const require = createRequire(import.meta.url);

test('agent canvas backend accepts frontend node result callbacks', () => {
  const route = read('../backend/src/routes/agentCanvas.js');

  assert.match(route, /const runLogEventLimit = 1000/);
  assert.match(route, /function appendRunLogEvent/);
  assert.match(route, /function readRunLog/);
  assert.match(route, /router\.get\('\/runs\/:runId\/log'/);
  assert.match(route, /const runNodeResults = new Map\(\)/);
  assert.match(route, /function normalizeNodeResultPayload/);
  assert.match(route, /function compactAgentNodeResult/);
  assert.match(route, /router\.get\('\/runs\/:runId\/node-results'/);
  assert.match(route, /router\.post\('\/runs\/:runId\/node-result'/);
  assert.match(route, /agent:node_result/);
  assert.match(route, /agent:run_node_status/);
  assert.match(route, /success/);
  assert.match(route, /error/);
});

test('frontend reports agent-triggered node completion to backend', () => {
  const api = read('../src/services/api.ts');
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(api, /submitAgentCanvasNodeResult/);
  assert.match(api, /\/agent\/canvas\/runs\/\$\{encodeURIComponent\(runId\)\}\/node-result/);
  assert.match(api, /nodeId: string/);
  assert.match(api, /ok: boolean/);

  assert.match(canvas, /agentRunNodeMetaRef/);
  assert.match(canvas, /Map<string,\s*\{\s*runId:/);
  assert.match(canvas, /agentRunNodeMetaRef\.current\.set\(nodeId/);
  assert.match(canvas, /api\.submitAgentCanvasNodeResult/);
  assert.match(canvas, /agentRunNodeMetaRef\.current\.delete\(lastDone\.id\)/);
});

test('agent run-node control is not restricted to generation nodes', () => {
  const route = read('../backend/src/routes/agentCanvas.js');
  const { normalizeCanvasPlan, verifyCanvasPlan } = require('../backend/src/utils/canvasPlan.js');

  assert.doesNotMatch(route, /Node is not runnable generation node/);

  const normalized = normalizeCanvasPlan({
    nodes: [{ id: 'llm-1', type: 'llm', position: { x: 0, y: 0 }, data: { label: 'LLM step' } }],
    runNodeIds: ['llm-1'],
  });
  assert.equal(normalized.ok, true);

  const verification = verifyCanvasPlan({
    nodes: normalized.plan.nodes,
    edges: [],
  }, normalized.plan);
  assert.equal(verification.ok, true);
  assert.equal(verification.checks.find((item: any) => item.id === 'run:llm-1')?.ok, true);
});
