import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const cliUrl = new URL('../tools/hakimi-canvas-cli/hakimi-canvas.mjs', import.meta.url);
const require = createRequire(import.meta.url);

test('hakimi canvas cli parses run-node with watch and agent options', async () => {
  const { parseCliArgs } = await import(cliUrl.href);

  const parsed = parseCliArgs(['run-node', 'canvas-1', 'image-1', '--agent', 'studio-agent', '--watch']);

  assert.equal(parsed.command, 'run-node');
  assert.equal(parsed.canvasId, 'canvas-1');
  assert.equal(parsed.nodeId, 'image-1');
  assert.equal(parsed.agentId, 'studio-agent');
  assert.equal(parsed.watch, true);
});

test('hakimi canvas cli loads a plan and builds apply request payload', async () => {
  const { parseCliArgs, loadJsonFile, buildRequest } = await import(cliUrl.href);
  const dir = mkdtempSync(join(tmpdir(), 'hakimi-cli-'));
  const planPath = join(dir, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ title: 'Demo', nodes: [] }), 'utf8');

  const parsed = parseCliArgs(['apply', 'canvas-1', planPath, '--preview', '--autopilot', '--agent', 'cli-agent']);
  const plan = loadJsonFile(planPath);
  const request = buildRequest(parsed, plan);

  assert.equal(request.path, '/api/agent/canvas/plans/apply');
  assert.equal(request.method, 'POST');
  assert.equal(request.body.canvasId, 'canvas-1');
  assert.equal(request.body.agentId, 'cli-agent');
  assert.equal(request.body.mode, 'preview');
  assert.equal(request.body.drivingMode, 'autopilot');
  assert.equal(request.body.approvalPolicy, 'never');
  assert.deepEqual(request.body.plan, { title: 'Demo', nodes: [] });
});

test('hakimi canvas cli supports explicit approval policy for guarded agents', async () => {
  const { parseCliArgs, buildRequest } = await import(cliUrl.href);
  const dir = mkdtempSync(join(tmpdir(), 'hakimi-cli-'));
  const planPath = join(dir, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ title: 'Guarded', nodes: [] }), 'utf8');

  const parsed = parseCliArgs(['apply', 'canvas-1', planPath, '--approval-policy', 'ask_destructive']);
  const request = buildRequest(parsed, { title: 'Guarded', nodes: [] });

  assert.equal(parsed.approvalPolicy, 'ask_destructive');
  assert.equal(request.body.approvalPolicy, 'ask_destructive');
});

test('hakimi canvas cli builds visible run-node action request', async () => {
  const { parseCliArgs, buildRequest } = await import(cliUrl.href);

  const parsed = parseCliArgs(['run-node', 'canvas-1', 'node-7', '--agent', 'cli-agent']);
  const request = buildRequest(parsed);

  assert.equal(request.path, '/api/agent/canvas/actions');
  assert.equal(request.method, 'POST');
  assert.equal(request.body.canvasId, 'canvas-1');
  assert.equal(request.body.agentId, 'cli-agent');
  assert.equal(request.body.actions[0].type, 'run_node');
  assert.equal(request.body.actions[0].payload.nodeId, 'node-7');
  assert.match(request.body.runId, /^hakimi-cli-/);
});

test('hakimi canvas cli builds export-run request', async () => {
  const { parseCliArgs, buildRequest } = await import(cliUrl.href);

  const parsed = parseCliArgs(['export-run', 'run-abc']);
  const request = buildRequest(parsed);

  assert.equal(parsed.command, 'export-run');
  assert.equal(parsed.runId, 'run-abc');
  assert.equal(request.method, 'GET');
  assert.equal(request.path, '/api/agent/canvas/runs/run-abc/log');
});

test('hakimi canvas cli builds visible run-group request', async () => {
  const { parseCliArgs, buildRequest } = await import(cliUrl.href);

  const parsed = parseCliArgs(['run-group', 'canvas-1', 'node-a', 'node-b', '--agent', 'group-agent', '--watch']);
  const request = buildRequest(parsed);

  assert.equal(parsed.command, 'run-group');
  assert.equal(parsed.canvasId, 'canvas-1');
  assert.deepEqual(parsed.nodeIds, ['node-a', 'node-b']);
  assert.equal(parsed.watch, true);
  assert.equal(request.path, '/api/agent/canvas/actions');
  assert.equal(request.body.agentId, 'group-agent');
  assert.deepEqual(request.body.actions, [
    { type: 'run_node', payload: { nodeId: 'node-a' } },
    { type: 'run_node', payload: { nodeId: 'node-b' } },
  ]);
});

test('hakimi canvas cli plans downstream nodes in topological order', async () => {
  const { parseCliArgs, planDownstreamRunActions, buildContinueDownstreamRequest } = await import(cliUrl.href);
  const snapshot = {
    nodes: [
      { id: 'source', type: 'text' },
      { id: 'image-a', type: 'image' },
      { id: 'llm-review', type: 'llm' },
      { id: 'output-a', type: 'output' },
      { id: 'unrelated', type: 'image' },
    ],
    edges: [
      { source: 'source', target: 'image-a' },
      { source: 'source', target: 'llm-review' },
      { source: 'image-a', target: 'output-a' },
      { source: 'unrelated', target: 'output-a' },
    ],
  };

  const actions = planDownstreamRunActions(snapshot, ['source']);
  assert.deepEqual(actions, [
    { type: 'run_node', payload: { nodeId: 'image-a' } },
    { type: 'run_node', payload: { nodeId: 'llm-review' } },
    { type: 'run_node', payload: { nodeId: 'output-a' } },
  ]);

  const parsed = parseCliArgs(['continue-downstream', 'canvas-1', 'source', '--agent', 'flow-agent']);
  const request = buildContinueDownstreamRequest(parsed, snapshot);
  assert.equal(request.path, '/api/agent/canvas/actions');
  assert.equal(request.body.agentId, 'flow-agent');
  assert.deepEqual(request.body.actions, actions);
});

test('hakimi canvas cli formats desktop backend connection errors with recovery hint', async () => {
  const { formatCliError } = await import(cliUrl.href);

  const message = formatCliError(
    Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    'http://127.0.0.1:18766',
  );

  assert.match(message, /无法连接哈基米画布桌面端后端/);
  assert.match(message, /http:\/\/127\.0\.0\.1:18766/);
  assert.match(message, /--base-url/);
});

test('backend startup provisions Hakimi Canvas CLI launchers with the active backend URL', () => {
  const { ensureHakimiCanvasCliLaunchers } = require('../backend/src/utils/hakimiCanvasCli.js');
  const dir = mkdtempSync(join(tmpdir(), 'hakimi-cli-launchers-'));
  const cliPath = join(dir, 'hakimi-canvas.mjs');
  writeFileSync(cliPath, '#!/usr/bin/env node\n', 'utf8');

  const result = ensureHakimiCanvasCliLaunchers({
    cliPath,
    baseUrl: 'http://127.0.0.1:18777',
    outputDir: dir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.baseUrl, 'http://127.0.0.1:18777');
  assert.ok(existsSync(result.cmdPath));
  assert.ok(existsSync(result.ps1Path));
  assert.match(readFileSync(result.cmdPath, 'utf8'), /--base-url "http:\/\/127\.0\.0\.1:18777"/);
  assert.match(readFileSync(result.ps1Path, 'utf8'), /\$BaseUrl = 'http:\/\/127\.0\.0\.1:18777'/);
});

test('backend server starts Hakimi Canvas CLI alongside the active backend port', () => {
  const server = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');

  assert.match(server, /startHakimiCanvasCliOnAppStart/);
  assert.match(server, /baseUrl:\s*`http:\/\/\$\{HOST\}:\$\{PORT\}`/);
});
