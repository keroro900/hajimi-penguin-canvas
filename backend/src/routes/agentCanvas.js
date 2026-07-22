const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { broadcastCanvasEvent, writeSse } = require('../utils/canvasEvents');
const {
  createCanvasSnapshot,
  normalizePlanId,
  normalizeCanvasPlan,
  createPlanDiff,
  canvasPlanToActions,
  verifyCanvasPlan,
  shouldAutoRepairNodeResult,
} = require('../utils/canvasPlan');

const router = express.Router();
const runEventClients = new Map();
const runAnswers = new Map();
const runNodeResults = new Map();
const runOperationBatchIds = new Map();
const runLogEventLimit = 1000;
const AGENT_CANVAS_EVENTS = [
  'canvas:preview_node',
  'canvas:add_node',
  'canvas:update_node',
  'canvas:connect_edge',
  'canvas:focus_viewport',
  'canvas:run_node',
];
const AGENT_DRIVING_MODES = new Set(['copilot', 'autopilot']);
const AGENT_APPROVAL_POLICIES = new Set(['ask_destructive', 'ask_everything', 'never']);

function getCanvasFile(id) {
  return path.join(config.DATA_DIR, `canvas_${id}.json`);
}

function safeRunLogId(value) {
  return makeRunId(value);
}

function getRunLogFile(runId) {
  return path.join(config.DATA_DIR, 'agent_canvas_runs', `${safeRunLogId(runId)}.json`);
}

function safeOperationBatchId(value) {
  const raw = String(value || '').trim();
  if (/^[a-zA-Z0-9_-]{3,120}$/.test(raw)) return raw;
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getOperationBatchFile(operationBatchId) {
  return path.join(config.DATA_DIR, 'agent_canvas_batches', `${safeOperationBatchId(operationBatchId)}.json`);
}

function readJsonFile(file) {
  const raw = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '').replace(/\0/g, '');
  return JSON.parse(raw);
}

function replaceFileWithRetry(tmp, file) {
  try {
    fs.renameSync(tmp, file);
  } catch (error) {
    if (!['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) throw error;
    fs.copyFileSync(tmp, file);
    fs.unlinkSync(tmp);
  }
}

function atomicWriteJson(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  replaceFileWithRetry(tmp, file);
}

function persistOperationBatch(payload) {
  const operationBatchId = safeOperationBatchId(payload?.operationBatchId);
  const batch = {
    schema: 'hakimi-canvas-operation-batch',
    version: 1,
    operationBatchId,
    canvasId: String(payload?.canvasId || '').trim(),
    agentId: String(payload?.agentId || 'agent').trim(),
    runId: String(payload?.runId || '').trim(),
    planId: String(payload?.planId || '').trim(),
    createdAt: Date.now(),
    beforeCanvas: payload?.beforeCanvas,
    afterCanvas: payload?.afterCanvas,
    beforeSnapshot: payload?.beforeSnapshot,
    afterSnapshot: payload?.afterSnapshot,
    plan: payload?.plan && typeof payload.plan === 'object' ? payload.plan : null,
    retryNodeIds: Array.isArray(payload?.retryNodeIds) ? payload.retryNodeIds : [],
    finalVerification: payload?.finalVerification || null,
    undoneAt: null,
  };
  atomicWriteJson(getOperationBatchFile(operationBatchId), batch);
  if (batch.runId) runOperationBatchIds.set(batch.runId, operationBatchId);
  return batch;
}

function readOperationBatch(operationBatchId) {
  const file = getOperationBatchFile(operationBatchId);
  if (!fs.existsSync(file)) {
    const error = new Error(`Operation batch not found: ${operationBatchId}`);
    error.statusCode = 404;
    throw error;
  }
  return readJsonFile(file);
}

function findOperationBatchByRunId(runId) {
  const operationBatchId = runOperationBatchIds.get(String(runId || '').trim());
  if (!operationBatchId) return null;
  try {
    return readOperationBatch(operationBatchId);
  } catch {
    runOperationBatchIds.delete(String(runId || '').trim());
    return null;
  }
}

function saveOperationBatch(batch) {
  atomicWriteJson(getOperationBatchFile(batch.operationBatchId), batch);
  if (batch.runId) runOperationBatchIds.set(batch.runId, batch.operationBatchId);
  return batch;
}

function loadCanvas(canvasId) {
  const file = getCanvasFile(canvasId);
  if (!fs.existsSync(file)) {
    const error = new Error(`Canvas not found: ${canvasId}`);
    error.statusCode = 404;
    throw error;
  }
  return readJsonFile(file);
}

function readRunLog(runId) {
  const file = getRunLogFile(runId);
  if (!fs.existsSync(file)) {
    return {
      schema: 'hakimi-agent-run-log',
      version: 1,
      runId: safeRunLogId(runId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events: [],
    };
  }
  try {
    const log = readJsonFile(file);
    return {
      schema: 'hakimi-agent-run-log',
      version: 1,
      runId: safeRunLogId(runId),
      createdAt: Number(log?.createdAt || Date.now()),
      updatedAt: Number(log?.updatedAt || Date.now()),
      events: Array.isArray(log?.events) ? log.events : [],
    };
  } catch {
    return {
      schema: 'hakimi-agent-run-log',
      version: 1,
      runId: safeRunLogId(runId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events: [],
    };
  }
}

function appendRunLogEvent(runId, event, payload) {
  try {
    const log = readRunLog(runId);
    const now = Date.now();
    log.updatedAt = now;
    log.events = [
      ...log.events,
      {
        event,
        payload,
        createdAt: now,
      },
    ].slice(-runLogEventLimit);
    atomicWriteJson(getRunLogFile(runId), log);
  } catch (error) {
    console.warn(`Agent run log append failed: ${error?.message || error}`);
  }
}

function backupCanvasFile(canvasId, runId) {
  const source = getCanvasFile(canvasId);
  if (!fs.existsSync(source)) return null;
  const backupDir = path.join(config.DATA_DIR, 'agent_canvas_backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${canvasId}_${runId}_${Date.now()}.json`);
  fs.copyFileSync(source, backupFile);
  return backupFile;
}

function updateCanvasListMetadata(canvasId, nodeCount) {
  if (!fs.existsSync(config.CANVAS_FILE)) return;
  try {
    const list = readJsonFile(config.CANVAS_FILE);
    if (!Array.isArray(list)) return;
    const item = list.find((entry) => entry.id === canvasId);
    if (!item) return;
    item.nodeCount = nodeCount;
    item.updatedAt = Date.now();
    atomicWriteJson(config.CANVAS_FILE, list);
  } catch (error) {
    console.warn(`Agent canvas metadata update failed: ${error?.message || error}`);
  }
}

function saveCanvasDirect(canvasId, canvas, action) {
  const file = getCanvasFile(canvasId);
  atomicWriteJson(file, canvas);
  const nodeCount = Array.isArray(canvas.nodes) ? canvas.nodes.length : 0;
  updateCanvasListMetadata(canvasId, nodeCount);
  broadcastCanvasEvent('canvas:updated', {
    canvasId,
    action: action || 'agent-saved',
    updatedAt: Date.now(),
    nodeCount,
  });
}

function makeRunId(value) {
  const raw = String(value || '').trim();
  if (/^[a-zA-Z0-9_-]{3,80}$/.test(raw)) return raw;
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeNodeId(type) {
  return `${type || 'node'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeDrivingMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  return AGENT_DRIVING_MODES.has(raw) ? raw : 'copilot';
}

function normalizeApprovalPolicy(value, drivingMode) {
  const raw = String(value || '').trim().toLowerCase();
  if (AGENT_APPROVAL_POLICIES.has(raw)) return raw;
  return 'never';
}

function normalizeAnswerPayload(body) {
  const payload = body && typeof body === 'object' ? body : {};
  return {
    canvasId: String(payload.canvasId || '').trim(),
    questionId: String(payload.questionId || payload.id || '').trim(),
    value: payload.value,
    label: String(payload.label || payload.value || '').trim(),
    createdAt: Date.now(),
  };
}

function normalizeNodeResultPayload(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const node = payload.node && typeof payload.node === 'object' ? payload.node : null;
  const nodeId = String(payload.nodeId || node?.id || '').trim();
  return {
    canvasId: String(payload.canvasId || '').trim(),
    nodeId,
    ok: payload.ok === true,
    error: String(payload.error || '').trim(),
    node,
    completedAt: Number.isFinite(Number(payload.completedAt)) ? Number(payload.completedAt) : Date.now(),
  };
}

function compactAgentNodeResult(result) {
  const node = result?.node && typeof result.node === 'object' ? result.node : {};
  const data = node.data && typeof node.data === 'object' ? node.data : {};
  const urls = [];
  for (const key of ['imageUrl', 'videoUrl', 'audioUrl', 'modelUrl', 'url', 'outputUrl']) {
    if (typeof data[key] === 'string' && data[key].trim()) urls.push(data[key]);
  }
  for (const key of ['imageUrls', 'videoUrls', 'audioUrls', 'modelUrls', 'urls', 'images', 'videos']) {
    if (Array.isArray(data[key])) {
      data[key].forEach((url) => {
        if (typeof url === 'string' && url.trim()) urls.push(url);
      });
    }
  }
  return {
    canvasId: result.canvasId,
    nodeId: result.nodeId,
    ok: result.ok,
    status: result.ok ? 'success' : 'error',
    error: result.error,
    completedAt: result.completedAt,
    node: {
      id: node.id || result.nodeId,
      type: node.type || '',
      label: String(data.label || data.title || data.name || data.prompt || data.text || result.nodeId || '').slice(0, 120),
      resultUrls: [...new Set(urls)].slice(0, 12),
    },
  };
}

function nextSerial(canvas) {
  const current = Number(canvas?.nextNodeSerialId || 1);
  return Number.isFinite(current) && current > 0 ? current : 1;
}

function normalizeAgentNodeData(nodeType, data) {
  const next = data && typeof data === 'object' ? { ...data } : {};
  if (nodeType === 'text') {
    if (typeof next.prompt !== 'string' && typeof next.text === 'string') {
      next.prompt = next.text;
    }
    if (typeof next.text !== 'string' && typeof next.prompt === 'string') {
      next.text = next.prompt;
    }
  }
  if (nodeType === 'image') {
    ensureContentfulImageNodeData(next);
    if (typeof next.imageUrl === 'string' && next.imageUrl.trim()) {
      const existing = Array.isArray(next.imageUrls) ? next.imageUrls : [];
      next.imageUrls = [next.imageUrl, ...existing.filter((url) => url !== next.imageUrl)];
    } else if (Array.isArray(next.imageUrls) && typeof next.imageUrls[0] === 'string') {
      next.imageUrl = next.imageUrls[0];
    }
  }
  return next;
}

function ensureContentfulImageNodeData(next) {
  const prompt = String(next.prompt || next.text || next.label || '').trim();
  next.prompt = prompt;
  if (typeof next.label !== 'string' || !next.label.trim()) {
    next.label = prompt ? prompt.slice(0, 28) : '画布生图节点';
  }
  const exactModel = String(next.apiModel || next.model || '').trim();
  next.model = exactModel;
  next.apiModel = exactModel;
  if (typeof next.aspectRatio !== 'string' || !next.aspectRatio.trim()) next.aspectRatio = next.aspect_ratio || '1:1';
  if (typeof next.sizeLevel !== 'string' || !next.sizeLevel.trim()) next.sizeLevel = next.image_size || '1K';
  if (!Array.isArray(next.referenceImages)) {
    const refs = Array.isArray(next.images)
      ? next.images
      : Array.isArray(next.imageRefs)
        ? next.imageRefs
        : [];
    next.referenceImages = refs.filter((item) => typeof item === 'string' && item.trim());
  }
  if (typeof next.status !== 'string' || !next.status.trim()) next.status = 'idle';
}

function emitRun(runId, event, payload) {
  const fullPayload = { runId, ...(payload || {}) };
  appendRunLogEvent(runId, event, fullPayload);
  broadcastCanvasEvent(event, fullPayload);
  const clients = runEventClients.get(runId);
  if (!clients) return;
  for (const client of clients) {
    try {
      writeSse(client, event, fullPayload);
    } catch {
      clients.delete(client);
    }
  }
}

function patchNode(canvas, nodeId, patch) {
  let found = false;
  const nodes = (Array.isArray(canvas.nodes) ? canvas.nodes : []).map((node) => {
    if (node.id !== nodeId) return node;
    found = true;
    return {
      ...node,
      ...(patch.position ? { position: patch.position } : {}),
      data: {
        ...(node.data || {}),
        ...(patch.data && typeof patch.data === 'object' ? patch.data : {}),
      },
    };
  });
  if (!found) {
    const error = new Error(`Node not found: ${nodeId}`);
    error.statusCode = 404;
    throw error;
  }
  return { ...canvas, nodes };
}

function applyAction(canvas, action) {
  const type = String(action?.type || '');
  const payload = action?.payload && typeof action.payload === 'object' ? action.payload : {};
  if (type === 'add_node') {
    const serial = nextSerial(canvas);
    const nodeType = String(payload.type || 'text');
    const node = {
      id: payload.id || makeNodeId(nodeType),
      type: nodeType,
      position: payload.position || { x: 0, y: 0 },
      data: {
        ...normalizeAgentNodeData(nodeType, payload.data),
        nodeSerialId: String(serial),
      },
    };
    return {
      canvas: {
        ...canvas,
        nodes: [...(Array.isArray(canvas.nodes) ? canvas.nodes : []), node],
        edges: Array.isArray(canvas.edges) ? canvas.edges : [],
        viewport: canvas.viewport || { x: 0, y: 0, zoom: 1 },
        nextNodeSerialId: serial + 1,
      },
      result: { node },
    };
  }
  if (type === 'update_node') {
    return {
      canvas: patchNode(canvas, payload.nodeId, { data: payload.data, position: payload.position }),
      result: { nodeId: payload.nodeId },
    };
  }
  if (type === 'connect_edge') {
    const edge = {
      id: payload.id || `edge-${payload.source}-${payload.target}-${Date.now()}`,
      source: payload.source,
      target: payload.target,
      ...(payload.sourceHandle ? { sourceHandle: payload.sourceHandle } : {}),
      ...(payload.targetHandle ? { targetHandle: payload.targetHandle } : {}),
    };
    return {
      canvas: {
        ...canvas,
        nodes: Array.isArray(canvas.nodes) ? canvas.nodes : [],
        edges: [...(Array.isArray(canvas.edges) ? canvas.edges : []), edge],
      },
      result: { edge },
    };
  }
  return { canvas, result: payload };
}

function loadAndApplyAction(canvasId, action, runId) {
  const canvas = loadCanvas(canvasId);
  backupCanvasFile(canvasId, runId);
  const applied = applyAction(canvas, action);
  saveCanvasDirect(canvasId, applied.canvas, `agent-${action.type || 'action'}`);
  return applied;
}

function writeRunNodeStatus(canvasId, nodeId, status, runId, extra = {}) {
  const canvas = loadCanvas(canvasId);
  const node = (Array.isArray(canvas.nodes) ? canvas.nodes : []).find((item) => item.id === nodeId);
  if (!node) {
    const error = new Error(`Node not found: ${nodeId}`);
    error.statusCode = 404;
    throw error;
  }
  const patch = {
    status,
    runStatus: status,
    lastAgentRunId: runId,
    lastAgentRunStatusAt: Date.now(),
    ...(status === 'queued' ? { progress: '排队中', error: '' } : {}),
    ...(status === 'running' ? { progress: '0%', error: '' } : {}),
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
  const nextCanvas = patchNode(canvas, nodeId, { data: patch });
  saveCanvasDirect(canvasId, nextCanvas, `agent-run-node-${status}`);
  return (Array.isArray(nextCanvas.nodes) ? nextCanvas.nodes : []).find((item) => item.id === nodeId);
}

async function executeAgentActions({
  canvasId,
  agentId,
  runId,
  actions,
  mode,
  drivingMode,
  approvalPolicy,
  planId,
  beforeSnapshot,
}) {
  const startedAt = Date.now();
  const results = [];
  let canvas = loadCanvas(canvasId);
  emitRun(runId, 'agent:run_started', {
    canvasId,
    agentId,
    mode,
    drivingMode,
    approvalPolicy,
    planId,
    actionCount: actions.length,
    beforeSnapshot,
    createdAt: startedAt,
  });

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] || {};
    const type = String(action.type || 'note');
    const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
    const eventPayload = { canvasId, agentId, mode, drivingMode, approvalPolicy, planId, index, type, payload, createdAt: Date.now() };
    emitRun(runId, 'agent:tool_call_start', eventPayload);

    if (type === 'preview_node' || type === 'focus_viewport' || type === 'run_node' || type === 'note' || type === 'phase' || type === 'ask_user') {
      const eventName = type === 'note'
        ? 'agent:note'
        : type === 'phase'
          ? 'agent:phase'
          : type === 'ask_user'
            ? 'agent:ask_user'
            : `canvas:${type}`;
      if (type === 'run_node') {
        const nodeId = String(payload.nodeId || payload.id || '').trim();
        if (!nodeId) throw new Error('run_node requires payload.nodeId');
        if (mode === 'preview') {
          emitRun(runId, 'agent:run_node_status', { ...eventPayload, nodeId, status: 'preview' });
          results.push({ index, type, preview: true, payload: { ...payload, nodeId } });
          emitRun(runId, 'agent:tool_call_end', { canvasId, agentId, mode, drivingMode, approvalPolicy, planId, index, type, createdAt: Date.now() });
          continue;
        }
        const queuedNode = writeRunNodeStatus(canvasId, nodeId, 'queued', runId);
        emitRun(runId, 'agent:run_node_status', { ...eventPayload, nodeId, status: 'queued', node: queuedNode });
        const runningNode = writeRunNodeStatus(canvasId, nodeId, 'running', runId);
        emitRun(runId, 'agent:run_node_status', { ...eventPayload, nodeId, status: 'running', node: runningNode });
        emitRun(runId, eventName, { ...eventPayload, payload: { ...payload, nodeId }, runStatus: 'running', node: runningNode });
        results.push({ index, type, preview: true, payload: { ...payload, nodeId }, runStatus: 'running' });
      } else {
        emitRun(runId, eventName, eventPayload);
        results.push({ index, type, preview: true, payload });
      }
    } else if (['add_node', 'update_node', 'connect_edge'].includes(type)) {
      if (mode === 'preview') {
        emitRun(runId, `canvas:${type}`, { ...eventPayload, preview: true });
        results.push({ index, type, preview: true, payload });
      } else {
        const applied = loadAndApplyAction(canvasId, action, runId);
        canvas = applied.canvas;
        emitRun(runId, `canvas:${type}`, { ...eventPayload, result: applied.result });
        results.push({ index, type, ...applied.result });
      }
    } else {
      throw new Error(`Unsupported agent canvas action: ${type}`);
    }

    emitRun(runId, 'agent:tool_call_end', { canvasId, agentId, mode, drivingMode, approvalPolicy, planId, index, type, createdAt: Date.now() });
  }

  const afterCanvas = loadCanvas(canvasId);
  const afterSnapshot = createCanvasSnapshot(canvasId, afterCanvas);
  emitRun(runId, 'agent:run_done', {
    canvasId,
    agentId,
    mode,
    drivingMode,
    approvalPolicy,
    planId,
    resultCount: results.length,
    afterSnapshot,
    createdAt: Date.now(),
  });
  return { canvasId, agentId, runId, mode, drivingMode, approvalPolicy, planId, results, beforeSnapshot, afterSnapshot };
}

// GET /api/agent/canvas/runs/:runId/events — per-run stream for Codex, Claude, LangGraph, and other agents.
router.get('/runs/:runId/events', (req, res) => {
  const runId = makeRunId(req.params.runId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(': hakimi agent canvas events connected\n\n');
  const clients = runEventClients.get(runId) || new Set();
  clients.add(res);
  runEventClients.set(runId, clients);
  req.on('close', () => {
    clients.delete(res);
    if (clients.size === 0) runEventClients.delete(runId);
  });
});

router.get('/runs/:runId/answers', (req, res) => {
  const runId = makeRunId(req.params.runId);
  return res.json({ success: true, data: { runId, answers: runAnswers.get(runId) || [] } });
});

router.get('/runs/:runId/log', (req, res) => {
  const runId = makeRunId(req.params.runId);
  return res.json({ success: true, data: readRunLog(runId) });
});

router.post('/runs/:runId/answers', (req, res) => {
  const runId = makeRunId(req.params.runId);
  const answer = normalizeAnswerPayload(req.body);
  if (!answer.questionId) return res.status(400).json({ success: false, error: 'questionId is required' });
  const answers = runAnswers.get(runId) || [];
  answers.push(answer);
  runAnswers.set(runId, answers.slice(-50));
  emitRun(runId, 'agent:user_answer', { runId, ...answer });
  return res.json({ success: true, data: { runId, answer } });
});

router.get('/runs/:runId/node-results', (req, res) => {
  const runId = makeRunId(req.params.runId);
  return res.json({ success: true, data: { runId, results: runNodeResults.get(runId) || [] } });
});

router.post('/runs/:runId/node-result', (req, res) => {
  const runId = makeRunId(req.params.runId);
  const result = normalizeNodeResultPayload(req.body);
  if (!result.nodeId) return res.status(400).json({ success: false, error: 'nodeId is required' });
  const results = runNodeResults.get(runId) || [];
  results.push(result);
  runNodeResults.set(runId, results.slice(-100));
  const compact = compactAgentNodeResult(result);
  emitRun(runId, 'agent:run_node_status', {
    runId,
    canvasId: result.canvasId,
    nodeId: result.nodeId,
    status: result.ok ? 'success' : 'error',
    error: result.error,
    node: result.node,
    payload: {
      nodeId: result.nodeId,
      detail: result.ok ? '节点运行完成' : (result.error || '节点运行失败'),
    },
    createdAt: result.completedAt,
  });
  emitRun(runId, 'agent:node_result', {
    runId,
    ...compact,
    createdAt: result.completedAt,
  });
  const batch = findOperationBatchByRunId(runId);
  let verification = null;
  let repair = { repair: false, reason: 'no-operation-batch' };
  if (batch?.canvasId) {
    try {
      let currentCanvas = loadCanvas(batch.canvasId);
      if (result.node) {
        currentCanvas = patchNode(currentCanvas, result.nodeId, {
          data: result.node.data,
          position: result.node.position,
        });
        saveCanvasDirect(batch.canvasId, currentCanvas, 'agent-node-result-sync');
      }
      const verificationCanvas = currentCanvas;
      verification = batch.plan
        ? verifyCanvasPlan(verificationCanvas, batch.plan, batch.beforeSnapshot)
        : null;
      const retryNodeIds = Array.isArray(batch.retryNodeIds) ? batch.retryNodeIds : [];
      repair = shouldAutoRepairNodeResult(result, {
        alreadyRetried: retryNodeIds.includes(result.nodeId),
        nodeType: result.node?.type,
      });
      if (repair.repair) {
        const sourceNode = result.node || (Array.isArray(currentCanvas.nodes) ? currentCanvas.nodes : []).find((node) => node.id === result.nodeId);
        const normalized = normalizeCanvasPlan({
          updates: [{ nodeId: result.nodeId, data: sourceNode?.data || {} }],
        }, {
          beforeSnapshot: createCanvasSnapshot(batch.canvasId, currentCanvas),
        });
        const repairedCanvas = patchNode(currentCanvas, result.nodeId, {
          data: {
            ...(normalized.plan.updates[0]?.data || sourceNode?.data || {}),
            status: 'idle',
            runStatus: 'idle',
            error: '',
            progress: '自动修正后重试',
            agentRetryCount: 1,
            lastAgentRepairReason: repair.reason,
          },
        });
        saveCanvasDirect(batch.canvasId, repairedCanvas, 'agent-targeted-repair');
        batch.retryNodeIds = [...new Set([...retryNodeIds, result.nodeId])];
        batch.afterCanvas = repairedCanvas;
        batch.afterSnapshot = createCanvasSnapshot(batch.canvasId, repairedCanvas);
        batch.finalVerification = verification;
        saveOperationBatch(batch);
        emitRun(runId, 'agent:repair_started', {
          canvasId: batch.canvasId,
          agentId: batch.agentId,
          planId: batch.planId,
          operationBatchId: batch.operationBatchId,
          nodeId: result.nodeId,
          reason: repair.reason,
          retryCount: 1,
          createdAt: Date.now(),
        });
        emitRun(runId, 'canvas:run_node', {
          canvasId: batch.canvasId,
          agentId: batch.agentId,
          planId: batch.planId,
          operationBatchId: batch.operationBatchId,
          payload: { nodeId: result.nodeId, retry: true, retryCount: 1, reason: repair.reason },
          createdAt: Date.now(),
        });
      } else {
        batch.afterCanvas = currentCanvas;
        batch.afterSnapshot = createCanvasSnapshot(batch.canvasId, currentCanvas);
        batch.finalVerification = verification;
        saveOperationBatch(batch);
      }
      if (verification) {
        emitRun(runId, 'agent:verification', {
          canvasId: batch.canvasId,
          agentId: batch.agentId,
          planId: batch.planId,
          operationBatchId: batch.operationBatchId,
          verification,
          final: !repair.repair,
          createdAt: Date.now(),
        });
      }
    } catch (error) {
      emitRun(runId, 'agent:verification_error', {
        canvasId: batch.canvasId,
        operationBatchId: batch.operationBatchId,
        error: error?.message || String(error),
        createdAt: Date.now(),
      });
    }
  }
  return res.json({ success: true, data: { runId, result: compact, operationBatchId: batch?.operationBatchId || '', verification, repair } });
});

router.get('/snapshot/:canvasId', (req, res) => {
  const canvasId = String(req.params.canvasId || '').trim();
  if (!canvasId) return res.status(400).json({ success: false, error: 'canvasId is required' });
  try {
    const canvas = loadCanvas(canvasId);
    return res.json({ success: true, data: createCanvasSnapshot(canvasId, canvas) });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || String(error) });
  }
});

router.post('/plans/verify', (req, res) => {
  const canvasId = String(req.body?.canvasId || '').trim();
  if (!canvasId) return res.status(400).json({ success: false, error: 'canvasId is required' });
  try {
    const canvas = loadCanvas(canvasId);
    const beforeSnapshot = req.body?.beforeSnapshot && typeof req.body.beforeSnapshot === 'object'
      ? req.body.beforeSnapshot
      : null;
    const normalized = normalizeCanvasPlan(req.body?.plan || req.body, { beforeSnapshot, autoLayout: req.body?.autoLayout === true });
    const verification = verifyCanvasPlan(canvas, normalized.plan, beforeSnapshot);
    const diff = createPlanDiff(canvas, normalized.plan);
    return res.json({ success: true, data: { canvasId, validation: normalized, diff, verification, snapshot: createCanvasSnapshot(canvasId, canvas) } });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || String(error) });
  }
});

router.post('/plans/diff', (req, res) => {
  const canvasId = String(req.body?.canvasId || req.body?.plan?.canvasId || '').trim();
  if (!canvasId) return res.status(400).json({ success: false, error: 'canvasId is required' });
  try {
    const canvas = loadCanvas(canvasId);
    const beforeSnapshot = createCanvasSnapshot(canvasId, canvas);
    const normalized = normalizeCanvasPlan(req.body?.plan || req.body, {
      beforeSnapshot,
      autoLayout: req.body?.autoLayout !== false,
    });
    const diff = createPlanDiff(canvas, normalized.plan);
    return res.json({ success: true, data: { canvasId, validation: normalized, diff, snapshot: beforeSnapshot } });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || String(error) });
  }
});

router.post('/plans/apply', async (req, res) => {
  const canvasId = String(req.body?.canvasId || req.body?.plan?.canvasId || '').trim();
  if (!canvasId) return res.status(400).json({ success: false, error: 'canvasId is required' });
  const agentId = String(req.body?.agentId || 'codex').trim() || 'codex';
  const runId = makeRunId(req.body?.runId);
  const plan = req.body?.plan && typeof req.body.plan === 'object' ? req.body.plan : req.body;
  const planId = normalizePlanId(req.body?.planId || plan?.planId || plan?.id);
  const mode = req.body?.mode === 'preview' || plan?.mode === 'preview' ? 'preview' : 'commit';
  const drivingMode = normalizeDrivingMode(req.body?.drivingMode || plan?.drivingMode);
  const approvalPolicy = normalizeApprovalPolicy(req.body?.approvalPolicy || plan?.approvalPolicy, drivingMode);

  try {
    const canvas = loadCanvas(canvasId);
    const beforeSnapshot = createCanvasSnapshot(canvasId, canvas);
    const normalized = normalizeCanvasPlan(plan, {
      beforeSnapshot,
      autoLayout: req.body?.autoLayout !== false,
    });
    const diff = createPlanDiff(canvas, normalized.plan);
    if (!normalized.ok) {
      return res.status(400).json({
        success: false,
        error: `CanvasPlan validation failed: ${normalized.errors.join('; ')}`,
        data: { runId, planId, validation: normalized, diff, beforeSnapshot },
      });
    }
    emitRun(runId, 'agent:plan_diff', { canvasId, agentId, planId, diff, validation: normalized, createdAt: Date.now() });
    const actions = canvasPlanToActions(normalized.plan, { mode });
    const execution = await executeAgentActions({
      canvasId,
      agentId,
      runId,
      actions,
      mode,
      drivingMode,
      approvalPolicy,
      planId,
      beforeSnapshot,
    });
    const afterCanvas = loadCanvas(canvasId);
    const verification = verifyCanvasPlan(afterCanvas, normalized.plan, beforeSnapshot);
    const operationBatch = mode === 'commit'
      ? persistOperationBatch({
        operationBatchId: req.body?.operationBatchId || `batch-${planId}-${Date.now()}`,
        canvasId,
        agentId,
        runId,
        planId,
        beforeCanvas: canvas,
        afterCanvas,
        beforeSnapshot,
        afterSnapshot: execution.afterSnapshot,
        plan: normalized.plan,
      })
      : null;
    emitRun(runId, 'agent:verification', { canvasId, agentId, planId, verification, createdAt: Date.now() });
    return res.json({ success: true, data: { ...execution, actions, validation: normalized, diff, verification, operationBatchId: operationBatch?.operationBatchId || '' } });
  } catch (error) {
    emitRun(runId, 'agent:run_error', { canvasId, agentId, drivingMode, approvalPolicy, planId, error: error?.message || String(error), createdAt: Date.now() });
    return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || String(error), data: { runId, planId } });
  }
});

router.post('/actions', async (req, res) => {
  const canvasId = String(req.body?.canvasId || '').trim();
  if (!canvasId) return res.status(400).json({ success: false, error: 'canvasId is required' });
  const agentId = String(req.body?.agentId || 'agent').trim() || 'agent';
  const runId = makeRunId(req.body?.runId);
  const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
  const mode = req.body?.mode === 'preview' ? 'preview' : 'commit';
  const drivingMode = normalizeDrivingMode(req.body?.drivingMode);
  const approvalPolicy = normalizeApprovalPolicy(req.body?.approvalPolicy, drivingMode);

  try {
    const beforeCanvas = loadCanvas(canvasId);
    const beforeSnapshot = createCanvasSnapshot(canvasId, beforeCanvas);
    const execution = await executeAgentActions({
      canvasId,
      agentId,
      runId,
      actions,
      mode,
      drivingMode,
      approvalPolicy,
      beforeSnapshot,
    });
    const afterCanvas = loadCanvas(canvasId);
    const operationBatch = mode === 'commit'
      ? persistOperationBatch({
        operationBatchId: req.body?.operationBatchId || `batch-${runId}-${Date.now()}`,
        canvasId,
        agentId,
        runId,
        beforeCanvas,
        afterCanvas,
        beforeSnapshot,
        afterSnapshot: execution.afterSnapshot,
      })
      : null;
    return res.json({ success: true, data: { ...execution, operationBatchId: operationBatch?.operationBatchId || '' } });
  } catch (error) {
    emitRun(runId, 'agent:run_error', { canvasId, agentId, drivingMode, approvalPolicy, error: error?.message || String(error), createdAt: Date.now() });
    return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || String(error), data: { runId } });
  }
});

router.post('/operations/:operationBatchId/undo', (req, res) => {
  const operationBatchId = safeOperationBatchId(req.params.operationBatchId);
  try {
    const batch = readOperationBatch(operationBatchId);
    if (batch.undoneAt) return res.status(409).json({ success: false, error: 'Operation batch has already been undone', data: { operationBatchId } });
    const requestedCanvasId = String(req.body?.canvasId || '').trim();
    if (requestedCanvasId && requestedCanvasId !== batch.canvasId) {
      return res.status(400).json({ success: false, error: 'canvasId does not match operation batch' });
    }
    const currentCanvas = loadCanvas(batch.canvasId);
    if (req.body?.force !== true && JSON.stringify(currentCanvas) !== JSON.stringify(batch.afterCanvas)) {
      return res.status(409).json({
        success: false,
        error: 'Canvas changed after this operation batch; pass force=true only after explicit user confirmation',
        data: { operationBatchId, canvasId: batch.canvasId },
      });
    }
    saveCanvasDirect(batch.canvasId, batch.beforeCanvas, 'agent-operation-undo');
    batch.undoneAt = Date.now();
    atomicWriteJson(getOperationBatchFile(operationBatchId), batch);
    emitRun(batch.runId || operationBatchId, 'agent:operation_undone', {
      operationBatchId,
      canvasId: batch.canvasId,
      agentId: batch.agentId,
      planId: batch.planId,
      createdAt: batch.undoneAt,
    });
    return res.json({
      success: true,
      data: {
        operationBatchId,
        canvasId: batch.canvasId,
        undoneAt: batch.undoneAt,
        snapshot: createCanvasSnapshot(batch.canvasId, batch.beforeCanvas),
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || String(error), data: { operationBatchId } });
  }
});

module.exports = router;
