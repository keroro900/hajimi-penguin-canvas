#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:18766';

export function helpText() {
  return [
    'Hakimi Canvas CLI',
    '',
    'Usage:',
    '  hakimi-canvas status [--base-url <url>]',
    '  hakimi-canvas list [--base-url <url>]',
    '  hakimi-canvas snapshot <canvasId> [--base-url <url>]',
    '  hakimi-canvas diff <canvasId> <plan.json> [--base-url <url>]',
    '  hakimi-canvas apply <canvasId> <plan.json> [--preview] [--agent <id>] [--autopilot] [--approval-policy <never|ask_destructive|ask_everything>] [--watch] [--base-url <url>]',
    '  hakimi-canvas actions <canvasId> <actions.json> [--preview] [--agent <id>] [--autopilot] [--approval-policy <never|ask_destructive|ask_everything>] [--watch] [--base-url <url>]',
    '  hakimi-canvas run-node <canvasId> <nodeId> [--agent <id>] [--watch] [--base-url <url>]',
    '  hakimi-canvas run-group <canvasId> <nodeId...> [--agent <id>] [--watch] [--base-url <url>]',
    '  hakimi-canvas continue-downstream <canvasId> <nodeId...> [--agent <id>] [--watch] [--base-url <url>]',
    '  hakimi-canvas export-run <runId> [--base-url <url>]',
    '  hakimi-canvas watch <runId> [--base-url <url>]',
  ].join('\n');
}

function takeOption(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCliArgs(argv = []) {
  const args = [...argv];
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { command: 'help', baseUrl: DEFAULT_BASE_URL };
  }
  const command = args.shift();
  const positional = [];
  const parsed = {
    command,
    baseUrl: process.env.HAKIMI_CANVAS_API || DEFAULT_BASE_URL,
    agentId: 'hakimi-cli',
    watch: false,
    preview: false,
    drivingMode: 'copilot',
    approvalPolicy: 'never',
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--base-url') {
      parsed.baseUrl = takeOption(args, i, '--base-url');
      i += 1;
    } else if (arg === '--agent') {
      parsed.agentId = takeOption(args, i, '--agent');
      i += 1;
    } else if (arg === '--watch') {
      parsed.watch = true;
    } else if (arg === '--preview') {
      parsed.preview = true;
    } else if (arg === '--autopilot') {
      parsed.drivingMode = 'autopilot';
    } else if (arg === '--approval-policy') {
      const value = takeOption(args, i, '--approval-policy');
      if (!['never', 'ask_destructive', 'ask_everything'].includes(value)) {
        throw new Error('--approval-policy must be one of never, ask_destructive, ask_everything');
      }
      parsed.approvalPolicy = value;
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (command === 'snapshot') {
    if (positional.length < 1) throw new Error('snapshot requires <canvasId>');
    parsed.canvasId = positional[0];
  } else if (command === 'diff' || command === 'apply') {
    if (positional.length < 2) throw new Error(`${command} requires <canvasId> <plan.json>`);
    parsed.canvasId = positional[0];
    parsed.file = positional[1];
  } else if (command === 'actions') {
    if (positional.length < 2) throw new Error('actions requires <canvasId> <actions.json>');
    parsed.canvasId = positional[0];
    parsed.file = positional[1];
  } else if (command === 'run-node') {
    if (positional.length < 2) throw new Error('run-node requires <canvasId> <nodeId>');
    parsed.canvasId = positional[0];
    parsed.nodeId = positional[1];
  } else if (command === 'run-group' || command === 'continue-downstream') {
    if (positional.length < 2) throw new Error(`${command} requires <canvasId> <nodeId...>`);
    parsed.canvasId = positional[0];
    parsed.nodeIds = positional.slice(1);
    parsed.nodeId = parsed.nodeIds[0];
  } else if (command === 'watch' || command === 'export-run') {
    if (positional.length < 1) throw new Error(`${command} requires <runId>`);
    parsed.runId = positional[0];
  } else if (command !== 'status' && command !== 'list') {
    throw new Error(`Unknown command: ${command}`);
  }

  return parsed;
}

export function loadJsonFile(filePath) {
  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function makeRunId(prefix = 'hakimi-cli') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildRunActions(nodeIds) {
  return [...new Set((Array.isArray(nodeIds) ? nodeIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))]
    .map((nodeId) => ({ type: 'run_node', payload: { nodeId } }));
}

function buildActionsRequest(parsed, actions) {
  return {
    method: 'POST',
    path: '/api/agent/canvas/actions',
    body: {
      canvasId: parsed.canvasId,
      agentId: parsed.agentId,
      runId: parsed.runId || makeRunId(),
      mode: parsed.preview ? 'preview' : 'commit',
      drivingMode: parsed.drivingMode,
      approvalPolicy: parsed.approvalPolicy || 'never',
      actions,
    },
  };
}

export function planDownstreamRunActions(snapshot, startNodeIds) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];
  const nodeOrder = nodes.map((node) => String(node?.id || '').trim()).filter(Boolean);
  const nodeSet = new Set(nodeOrder);
  const startSet = new Set((Array.isArray(startNodeIds) ? startNodeIds : [startNodeIds])
    .map((id) => String(id || '').trim())
    .filter((id) => nodeSet.has(id)));
  const adj = new Map(nodeOrder.map((id) => [id, []]));
  for (const edge of edges) {
    const source = String(edge?.source || '').trim();
    const target = String(edge?.target || '').trim();
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue;
    adj.get(source)?.push(target);
  }

  const reachable = new Set();
  const queue = [...startSet];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adj.get(current) || []) {
      if (startSet.has(next) || reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  const inDegree = new Map([...reachable].map((id) => [id, 0]));
  const downstreamAdj = new Map([...reachable].map((id) => [id, []]));
  for (const edge of edges) {
    const source = String(edge?.source || '').trim();
    const target = String(edge?.target || '').trim();
    if (!reachable.has(source) || !reachable.has(target)) continue;
    downstreamAdj.get(source)?.push(target);
    inDegree.set(target, (inDegree.get(target) || 0) + 1);
  }

  const sorted = [];
  const pending = nodeOrder.filter((id) => reachable.has(id) && (inDegree.get(id) || 0) === 0);
  while (pending.length > 0) {
    const id = pending.shift();
    sorted.push(id);
    for (const next of downstreamAdj.get(id) || []) {
      const degree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) pending.push(next);
    }
  }
  for (const id of nodeOrder) {
    if (reachable.has(id) && !sorted.includes(id)) sorted.push(id);
  }
  return buildRunActions(sorted);
}

export function buildContinueDownstreamRequest(parsed, snapshot) {
  return buildActionsRequest(parsed, planDownstreamRunActions(snapshot, parsed.nodeIds || [parsed.nodeId]));
}

export function buildRequest(parsed, jsonPayload) {
  if (parsed.command === 'status') return { method: 'GET', path: '/api/status' };
  if (parsed.command === 'list') return { method: 'GET', path: '/api/canvas' };
  if (parsed.command === 'snapshot') {
    return { method: 'GET', path: `/api/agent/canvas/snapshot/${encodeURIComponent(parsed.canvasId)}` };
  }
  if (parsed.command === 'diff') {
    return {
      method: 'POST',
      path: '/api/agent/canvas/plans/diff',
      body: { canvasId: parsed.canvasId, plan: jsonPayload },
    };
  }
  if (parsed.command === 'apply') {
    return {
      method: 'POST',
      path: '/api/agent/canvas/plans/apply',
      body: {
        canvasId: parsed.canvasId,
        agentId: parsed.agentId,
        runId: parsed.runId || makeRunId(),
        mode: parsed.preview ? 'preview' : 'commit',
        drivingMode: parsed.drivingMode,
        approvalPolicy: parsed.approvalPolicy || 'never',
        plan: jsonPayload,
      },
    };
  }
  if (parsed.command === 'actions') {
    return buildActionsRequest(parsed, Array.isArray(jsonPayload) ? jsonPayload : jsonPayload?.actions || []);
  }
  if (parsed.command === 'run-node') {
    return buildActionsRequest({ ...parsed, preview: false, approvalPolicy: 'never' }, buildRunActions([parsed.nodeId]));
  }
  if (parsed.command === 'run-group') {
    return buildActionsRequest(parsed, buildRunActions(parsed.nodeIds));
  }
  if (parsed.command === 'export-run') {
    return {
      method: 'GET',
      path: `/api/agent/canvas/runs/${encodeURIComponent(parsed.runId)}/log`,
    };
  }
  throw new Error(`Cannot build request for ${parsed.command}`);
}

function apiUrl(baseUrl, path) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return `${base}${path}`;
}

function isConnectionFailure(error) {
  const code = error?.cause?.code || error?.code || error?.cause?.errno;
  const message = String(error?.message || error || '');
  return ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'].includes(code)
    || /fetch failed|failed to fetch|connect econnrefused|networkerror/i.test(message);
}

export function formatCliError(error, baseUrl = DEFAULT_BASE_URL) {
  const message = error?.message || String(error || 'Unknown error');
  if (!isConnectionFailure(error)) return message;
  const url = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return [
    `无法连接哈基米画布桌面端后端: ${url}`,
    '请确认哈基米画布桌面端已打开，并且画布后端已经启动。',
    '如果桌面端使用了其他端口，请加 --base-url <url>，或设置 HAKIMI_CANVAS_API。',
  ].join('\n');
}

export async function sendRequest(baseUrl, request, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(apiUrl(baseUrl, request.path), {
      method: request.method,
      headers: request.body ? { 'Content-Type': 'application/json' } : undefined,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
  } catch (error) {
    throw new Error(formatCliError(error, baseUrl), { cause: error });
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  }
  return data;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function watchRun(baseUrl, runId, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetchImpl(apiUrl(baseUrl, `/api/agent/canvas/runs/${encodeURIComponent(runId)}/events`));
  } catch (error) {
    throw new Error(formatCliError(error, baseUrl), { cause: error });
  }
  if (!response.ok || !response.body) throw new Error(`watch failed: HTTP ${response.status}`);
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let currentEvent = 'message';
  const terminalEvents = new Set(['agent:run_done', 'agent:run_error']);
  const terminalNodeStatuses = new Set(['success', 'error']);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const lines = chunk.split(/\r?\n/);
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      process.stdout.write(`[${currentEvent}] ${payload.message || payload.status || payload.type || payload.nodeId || ''}\n`);
      if (terminalEvents.has(currentEvent)) return payload;
      if (currentEvent === 'agent:run_node_status' && terminalNodeStatuses.has(String(payload.status || '').toLowerCase())) {
        return payload;
      }
    }
  }
  return null;
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCliArgs(argv);
  if (parsed.command === 'help') {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }
  if (parsed.command === 'watch') {
    await watchRun(parsed.baseUrl, parsed.runId);
    return 0;
  }
  const jsonPayload = parsed.file ? loadJsonFile(parsed.file) : undefined;
  let request;
  if (parsed.command === 'continue-downstream') {
    const snapshotRequest = buildRequest({ command: 'snapshot', canvasId: parsed.canvasId });
    const snapshotResult = await sendRequest(parsed.baseUrl, snapshotRequest);
    request = buildContinueDownstreamRequest(parsed, snapshotResult.data);
  } else {
    request = buildRequest(parsed, jsonPayload);
  }
  const result = await sendRequest(parsed.baseUrl, request);
  printJson(result);
  const runId = result?.data?.runId || request.body?.runId;
  if (parsed.watch && runId) await watchRun(parsed.baseUrl, runId);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.stderr.write(`${helpText()}\n`);
    process.exitCode = 1;
  });
}
