'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const z = require('zod/v4');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const config = require('../config');
const {
  IMAGE_MODEL_REGISTRY,
  VIDEO_MODEL_REGISTRY,
} = require('../utils/canvasPlan');

const router = express.Router();
const transports = new Map();
const SAFE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const JsonValue = z.any();
const CanvasId = z.string().min(1).describe('Hakimi canvas id, for example canvas-123-abc.');
const NodeId = z.string().min(1).describe('Canvas node id.');
const Position = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

function backendBaseUrl() {
  return String(process.env.HAKIMI_BACKEND_URL || process.env.T8_BACKEND_URL || `http://127.0.0.1:${config.PORT}`).replace(/\/+$/, '');
}

function normalizeBackendRequest(input = {}) {
  const method = String(input.method || 'GET').trim().toUpperCase();
  if (!SAFE_METHODS.has(method)) throw new Error(`Unsupported method: ${method}`);

  const rawPath = String(input.path || '').trim();
  if (!rawPath) throw new Error('Missing backend API path');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawPath) || rawPath.startsWith('//')) {
    throw new Error('Only relative paths are allowed');
  }

  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (!path.startsWith('/api/')) throw new Error('Only /api paths may be called through Hakimi MCP');

  return { method, path, body: input.body };
}

async function callHakimiBackend(input = {}) {
  const request = normalizeBackendRequest(input);
  const headers = { Accept: 'application/json' };
  const options = { method: request.method, headers };
  if (request.body !== undefined && request.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(request.body);
  }

  const response = await fetch(`${backendBaseUrl()}${request.path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && payload.error
      ? payload.error
      : `Hakimi backend request failed: HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return { ok: true, status: response.status, data: payload };
}

function jsonToolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function ok(value) {
  return jsonToolResult(value);
}

function api(path, method = 'GET', body) {
  return callHakimiBackend({ method, path, body });
}

async function loadCanvas(canvasId) {
  const result = await api(`/api/canvas/${encodeURIComponent(canvasId)}`);
  return result.data?.data || result.data;
}

async function saveCanvas(canvasId, data) {
  return api(`/api/canvas/${encodeURIComponent(canvasId)}`, 'PUT', data);
}

function nextSerial(canvas) {
  const current = Number(canvas?.nextNodeSerialId || 1);
  return Number.isFinite(current) && current > 0 ? current : 1;
}

function makeNodeId(type) {
  return `${type || 'node'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeCanvasNodeData(nodeType, data) {
  const next = data && typeof data === 'object' ? { ...data } : {};
  if (nodeType === 'text') {
    if (typeof next.prompt !== 'string' && typeof next.text === 'string') next.prompt = next.text;
    if (typeof next.text !== 'string' && typeof next.prompt === 'string') next.text = next.prompt;
  }
  if (nodeType === 'image') {
    if (typeof next.prompt !== 'string' && typeof next.text === 'string') next.prompt = next.text;
    if (typeof next.label !== 'string' || !next.label.trim()) {
      next.label = String(next.prompt || next.text || '画布生图节点').slice(0, 28);
    }
    const exactModel = String(next.apiModel || next.model || '').trim();
    next.model = exactModel;
    next.apiModel = exactModel;
    if (typeof next.aspectRatio !== 'string' || !next.aspectRatio.trim()) next.aspectRatio = next.aspect_ratio || '1:1';
    if (typeof next.sizeLevel !== 'string' || !next.sizeLevel.trim()) next.sizeLevel = next.image_size || next.size || '1K';
    if (!Array.isArray(next.referenceImages)) {
      const refs = Array.isArray(next.images) ? next.images : Array.isArray(next.imageRefs) ? next.imageRefs : [];
      next.referenceImages = refs.filter((item) => typeof item === 'string' && item.trim());
    }
    if (typeof next.imageUrl === 'string' && next.imageUrl.trim()) {
      const urls = Array.isArray(next.imageUrls) ? next.imageUrls : [];
      next.imageUrls = [next.imageUrl, ...urls.filter((url) => url !== next.imageUrl)];
    } else if (Array.isArray(next.imageUrls) && typeof next.imageUrls[0] === 'string') {
      next.imageUrl = next.imageUrls[0];
    }
    if (typeof next.status !== 'string' || !next.status.trim()) next.status = 'idle';
  }
  if (nodeType === 'video' || nodeType === 'seedance') {
    if (typeof next.prompt !== 'string' && typeof next.text === 'string') next.prompt = next.text;
    const exactModel = String(next.apiModel || next.model || '').trim();
    next.mainId = '';
    next.apiModel = exactModel;
    next.model = exactModel;
    if (typeof next.aspectRatio !== 'string' || !next.aspectRatio.trim()) next.aspectRatio = next.ratio || '16:9';
    next.ratio = next.aspectRatio;
    if (typeof next.status !== 'string' || !next.status.trim()) next.status = 'idle';
  }
  return next;
}

function withUpdatedNode(canvas, nodeId, patch) {
  let found = false;
  const nodes = (Array.isArray(canvas.nodes) ? canvas.nodes : []).map((node) => {
    if (node.id !== nodeId) return node;
    found = true;
    return {
      ...node,
      ...(patch.position ? { position: patch.position } : {}),
      data: {
        ...(node.data || {}),
        ...(patch.data || {}),
      },
    };
  });
  if (!found) throw new Error(`Node not found: ${nodeId}`);
  return { ...canvas, nodes };
}

function nodeCapabilityDefinition(nodeType) {
  const ports = {
    image: { inputs: ['text', 'image'], outputs: ['image'] },
    video: { inputs: ['text', 'image', 'video'], outputs: ['video'] },
    seedance: { inputs: ['text', 'image'], outputs: ['video'] },
    text: { inputs: [], outputs: ['text'] },
    upload: { inputs: [], outputs: ['image', 'video', 'audio'] },
  }[nodeType] || { inputs: [], outputs: [] };
  const editableFields = {
    text: ['prompt', 'text', 'label'],
    image: ['prompt', 'model', 'apiModel', 'aspectRatio', 'size', 'sizeLevel', 'quality', 'referenceImages'],
    video: ['prompt', 'mainId', 'model', 'apiModel', 'ratio', 'aspectRatio', 'duration', 'resolution', 'referenceImages', 'referenceVideos'],
    seedance: ['prompt', 'mainId', 'model', 'apiModel', 'ratio', 'aspectRatio', 'duration', 'resolution', 'referenceImages', 'referenceVideos'],
    upload: ['label', 'uploadType', 'imageUrl', 'videoUrl', 'filename'],
    'clip-studio': ['project', 'timeline', 'tracks', 'clips', 'captions', 'audio', 'exportSettings'],
  }[nodeType] || ['label'];
  const capabilities = ['node.read', 'node.update', 'node.move'];
  if (ports.inputs.length || ports.outputs.length) capabilities.push('node.connect');
  if (['image', 'video', 'seedance', 'audio', 'llm'].includes(nodeType) || ports.outputs.some((item) => ['image', 'video', 'audio'].includes(item))) {
    capabilities.push('node.run', 'node.result.read');
  }
  if (nodeType === 'image') capabilities.push('generation.image.configure');
  if (nodeType === 'video' || nodeType === 'seedance') capabilities.push('generation.video.configure');
  if (nodeType === 'clip-studio') capabilities.push('timeline.read', 'timeline.patch', 'preview.render', 'export.video');
  return { type: nodeType, capabilities, editableFields, ports, requiredInputs: ports.inputs, resultOutputs: ports.outputs };
}

function readNodeResult(canvas, nodeId) {
  const node = (Array.isArray(canvas?.nodes) ? canvas.nodes : []).find((item) => item.id === nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const data = node.data && typeof node.data === 'object' ? node.data : {};
  const urls = [];
  for (const key of ['imageUrl', 'videoUrl', 'audioUrl', 'modelUrl', 'url', 'outputUrl']) {
    if (typeof data[key] === 'string' && data[key].trim()) urls.push(data[key]);
  }
  for (const key of ['imageUrls', 'videoUrls', 'audioUrls', 'modelUrls', 'urls', 'images', 'videos']) {
    if (Array.isArray(data[key])) data[key].forEach((url) => typeof url === 'string' && url.trim() && urls.push(url));
  }
  return { nodeId, type: node.type, status: data.status || data.runStatus || 'idle', error: data.error || '', resultUrls: [...new Set(urls)], node };
}

function buildCapabilities() {
  const generationTypes = ['image', 'video', 'seedance'];
  const controlTypes = [
    'upload',
    'text',
    'image',
    'video',
    'seedance',
    'audio',
    'crop',
    'mask',
    'remix',
  ];
  return {
    name: '哈基米画布',
    transport: 'streamable-http',
    backendUrl: backendBaseUrl(),
    tools: HAKIMI_MCP_TOOLS.map((tool) => tool.name),
    nodes: controlTypes.map((type) => ({
      ...nodeCapabilityDefinition(type),
      category: generationTypes.includes(type) ? 'generation' : 'canvas',
    })),
    ports: {
      image: { inputs: ['text', 'image'], outputs: ['image'] },
      video: { inputs: ['text', 'image', 'video'], outputs: ['video'] },
      seedance: { inputs: ['text', 'image'], outputs: ['video'] },
      text: { inputs: [], outputs: ['text'] },
      upload: { inputs: [], outputs: ['image', 'video', 'audio'] },
    },
    modelRegistry: {
      image: IMAGE_MODEL_REGISTRY,
      video: VIDEO_MODEL_REGISTRY,
    },
    canvasPlan: {
      requiredFlow: 'snapshot -> diff_plan -> apply_plan -> verify_plan',
      imageRule: 'Create/update type:"image" node with data.prompt/data.model/data.apiModel and run_node.',
      videoRule: 'Create/update type:"video" or type:"seedance" node with data.prompt/data.mainId/data.model/data.apiModel/data.ratio and run_node.',
    },
  };
}

const HAKIMI_MCP_TOOLS = [
  {
    name: 'hakimi_get_capabilities',
    title: 'Hakimi Get Capabilities',
    description: 'Return every Hakimi canvas node type, port schema, and exposed backend API route group.',
    inputSchema: z.object({}),
    handler: async () => ok(buildCapabilities()),
  },
  {
    name: 'hakimi_backend_request',
    title: 'Hakimi Backend Request',
    description: 'Call any existing Hakimi backend API under /api/* with a safe local HTTP request.',
    inputSchema: z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
      path: z.string().min(1).describe('Relative backend path beginning with /api/.'),
      body: JsonValue.optional(),
    }),
    handler: async (args) => ok(await callHakimiBackend(args)),
  },
  {
    name: 'hakimi_canvas_list',
    title: 'Hakimi Canvas List',
    description: 'List saved Hakimi canvases.',
    inputSchema: z.object({}),
    handler: async () => ok(await api('/api/canvas')),
  },
  {
    name: 'hakimi_canvas_get',
    title: 'Hakimi Canvas Get',
    description: 'Read one Hakimi canvas including nodes, edges, viewport, and custom canvas state.',
    inputSchema: z.object({ canvasId: CanvasId }),
    handler: async ({ canvasId }) => ok(await loadCanvas(canvasId)),
  },
  {
    name: 'hakimi_canvas_save',
    title: 'Hakimi Canvas Save',
    description: 'Replace one Hakimi canvas with explicit nodes, edges, viewport, and optional extra state.',
    inputSchema: z.object({
      canvasId: CanvasId,
      nodes: z.array(JsonValue).default([]),
      edges: z.array(JsonValue).default([]),
      viewport: JsonValue.optional(),
      extra: JsonValue.optional(),
    }),
    handler: async ({ canvasId, nodes, edges, viewport, extra }) => {
      const body = {
        ...(extra && typeof extra === 'object' ? extra : {}),
        nodes,
        edges,
        viewport: viewport || { x: 0, y: 0, zoom: 1 },
      };
      return ok(await saveCanvas(canvasId, body));
    },
  },
  {
    name: 'hakimi_canvas_add_node',
    title: 'Hakimi Canvas Add Node',
    description: 'Add a semantic Hakimi canvas node of any registered type and persist the canvas.',
    inputSchema: z.object({
      canvasId: CanvasId,
      type: z.string().min(1),
      data: JsonValue.optional(),
      position: Position.default({ x: 0, y: 0 }),
      id: z.string().optional(),
    }),
    handler: async ({ canvasId, type, data, position, id }) => {
      const canvas = await loadCanvas(canvasId);
      const serial = nextSerial(canvas);
      const node = {
        id: id || makeNodeId(type),
        type,
        position,
        data: {
          ...normalizeCanvasNodeData(type, data),
          nodeSerialId: String(serial),
        },
      };
      const nextCanvas = {
        ...canvas,
        nodes: [...(Array.isArray(canvas.nodes) ? canvas.nodes : []), node],
        edges: Array.isArray(canvas.edges) ? canvas.edges : [],
        viewport: canvas.viewport || { x: 0, y: 0, zoom: 1 },
        nextNodeSerialId: serial + 1,
      };
      await saveCanvas(canvasId, nextCanvas);
      return ok({ success: true, node, canvas: nextCanvas });
    },
  },
  {
    name: 'hakimi_canvas_update_node',
    title: 'Hakimi Canvas Update Node',
    description: 'Patch a Hakimi canvas node data object and optionally reposition it.',
    inputSchema: z.object({
      canvasId: CanvasId,
      nodeId: NodeId,
      data: JsonValue.optional(),
      position: Position.optional(),
    }),
    handler: async ({ canvasId, nodeId, data, position }) => {
      const canvas = await loadCanvas(canvasId);
      const node = (Array.isArray(canvas.nodes) ? canvas.nodes : []).find((item) => item.id === nodeId);
      const nextCanvas = withUpdatedNode(canvas, nodeId, {
        data: normalizeCanvasNodeData(node?.type || 'text', data),
        position,
      });
      await saveCanvas(canvasId, nextCanvas);
      return ok({ success: true, canvas: nextCanvas });
    },
  },
  {
    name: 'hakimi_canvas_connect',
    title: 'Hakimi Canvas Connect',
    description: 'Create an edge between two Hakimi canvas nodes.',
    inputSchema: z.object({
      canvasId: CanvasId,
      source: NodeId,
      target: NodeId,
      sourceHandle: z.string().optional(),
      targetHandle: z.string().optional(),
      id: z.string().optional(),
    }),
    handler: async ({ canvasId, source, target, sourceHandle, targetHandle, id }) => {
      const canvas = await loadCanvas(canvasId);
      const edge = {
        id: id || `edge-${source}-${target}-${Date.now()}`,
        source,
        target,
        ...(sourceHandle ? { sourceHandle } : {}),
        ...(targetHandle ? { targetHandle } : {}),
      };
      const nextCanvas = {
        ...canvas,
        nodes: Array.isArray(canvas.nodes) ? canvas.nodes : [],
        edges: [...(Array.isArray(canvas.edges) ? canvas.edges : []), edge],
      };
      await saveCanvas(canvasId, nextCanvas);
      return ok({ success: true, edge, canvas: nextCanvas });
    },
  },
  {
    name: 'hakimi_canvas_import_asset',
    title: 'Hakimi Canvas Import Asset',
    description: 'Import a base64 image into Hakimi output files and optionally place it as an upload node.',
    inputSchema: z.object({
      dataUrl: z.string().min(1),
      prefix: z.string().default('mcp'),
      canvasId: CanvasId.optional(),
      position: Position.optional(),
    }),
    handler: async ({ dataUrl, prefix, canvasId, position }) => {
      const uploaded = await api('/api/files/upload-base64', 'POST', { dataUrl, prefix });
      if (!canvasId) return ok(uploaded);
      const asset = uploaded.data?.data;
      const addTool = HAKIMI_MCP_TOOLS.find((tool) => tool.name === 'hakimi_canvas_add_node');
      return addTool.handler({
        canvasId,
        type: 'upload',
        position: position || { x: 0, y: 0 },
        data: { uploadType: 'image', imageUrl: asset?.url, filename: asset?.filename },
      });
    },
  },
  {
    name: 'hakimi_agent_run_actions',
    title: 'Hakimi Agent Run Actions',
    description: 'Run a visible, evented Hakimi canvas action sequence for Codex, Claude, LangGraph, or other agents.',
    inputSchema: z.object({
      canvasId: CanvasId,
      agentId: z.string().default('codex'),
      runId: z.string().optional(),
      mode: z.enum(['preview', 'commit']).default('commit'),
      drivingMode: z.enum(['copilot', 'autopilot']).default('copilot').describe('copilot asks or previews when intent/risk is unclear; autopilot executes when the user explicitly allows no-answer control.'),
      approvalPolicy: z.enum(['ask_destructive', 'ask_everything', 'never']).default('never').describe('When the agent should ask the user before continuing.'),
      actions: z.array(z.object({
        type: z.enum(['preview_node', 'add_node', 'update_node', 'connect_edge', 'focus_viewport', 'run_node', 'note', 'phase', 'ask_user']),
        payload: JsonValue.optional(),
      })).default([]).describe('Agent actions such as phase, ask_user, preview_node, add_node, update_node, connect_edge, focus_viewport, and run_node.'),
    }),
    handler: async (args) => ok(await api('/api/agent/canvas/actions', 'POST', args)),
  },
  {
    name: 'hakimi_canvas_snapshot',
    title: 'Hakimi Canvas Snapshot',
    description: 'Read a compact canvas snapshot for planning: node counts, edge counts, viewport, node summaries, result URLs, and lineage hints.',
    inputSchema: z.object({ canvasId: CanvasId }),
    handler: async ({ canvasId }) => ok(await api(`/api/agent/canvas/snapshot/${encodeURIComponent(canvasId)}`)),
  },
  {
    name: 'hakimi_canvas_apply_plan',
    title: 'Hakimi Canvas Apply Plan',
    description: 'Apply a structured CanvasPlan as one visible batch. Supports nodes, updates, edges, runNodeIds, focusViewport, preview/commit modes, and returns verification.',
    inputSchema: z.object({
      canvasId: CanvasId,
      agentId: z.string().default('codex'),
      runId: z.string().optional(),
      planId: z.string().optional(),
      mode: z.enum(['preview', 'commit']).default('commit'),
      drivingMode: z.enum(['copilot', 'autopilot']).default('copilot'),
      approvalPolicy: z.enum(['ask_destructive', 'ask_everything', 'never']).default('never'),
      plan: JsonValue.describe('CanvasPlan with optional actions, nodes, updates, edges, runNodeIds, generationCalls, focusViewport, title, summary, and goal.'),
    }),
    handler: async (args) => ok(await api('/api/agent/canvas/plans/apply', 'POST', args)),
  },
  {
    name: 'hakimi_canvas_diff_plan',
    title: 'Hakimi Canvas Diff Plan',
    description: 'Preview a CanvasPlan against the current canvas without changing it. Returns normalized plan validation, auto layout positions, and planned node/edge/run summary.',
    inputSchema: z.object({
      canvasId: CanvasId,
      plan: JsonValue.describe('CanvasPlan to preview before apply.'),
      autoLayout: z.boolean().default(true),
    }),
    handler: async (args) => ok(await api('/api/agent/canvas/plans/diff', 'POST', args)),
  },
  {
    name: 'hakimi_canvas_verify_plan',
    title: 'Hakimi Canvas Verify Plan',
    description: 'Verify a CanvasPlan against the current canvas, checking planned nodes, edges, runnable generation nodes, and node count changes.',
    inputSchema: z.object({
      canvasId: CanvasId,
      plan: JsonValue.describe('CanvasPlan to verify.'),
      beforeSnapshot: JsonValue.optional(),
    }),
    handler: async (args) => ok(await api('/api/agent/canvas/plans/verify', 'POST', args)),
  },
  {
    name: 'hakimi_canvas_node_capabilities',
    title: 'Hakimi Canvas Node Capabilities',
    description: 'Read the exact capabilities, editable fields, ports, and result outputs for one canvas node type.',
    inputSchema: z.object({ nodeType: z.string().min(1) }),
    handler: async ({ nodeType }) => ok(nodeCapabilityDefinition(nodeType)),
  },
  {
    name: 'hakimi_canvas_configure_generation',
    title: 'Hakimi Canvas Configure Generation',
    description: 'Configure an existing image/video generation node through CanvasPlan normalization so model-specific parameters stay valid.',
    inputSchema: z.object({ canvasId: CanvasId, nodeId: NodeId, data: JsonValue, run: z.boolean().default(false), agentId: z.string().default('codex') }),
    handler: async ({ canvasId, nodeId, data, run, agentId }) => ok(await api('/api/agent/canvas/plans/apply', 'POST', {
      canvasId,
      agentId,
      drivingMode: 'autopilot',
      approvalPolicy: 'never',
      plan: { title: '配置生成节点', updates: [{ nodeId, data }], runNodeIds: run ? [nodeId] : [] },
    })),
  },
  {
    name: 'hakimi_canvas_run_node',
    title: 'Hakimi Canvas Run Node',
    description: 'Trigger one existing canvas node through the visible agent action/event pipeline.',
    inputSchema: z.object({ canvasId: CanvasId, nodeId: NodeId, agentId: z.string().default('codex'), runId: z.string().optional() }),
    handler: async ({ canvasId, nodeId, agentId, runId }) => ok(await api('/api/agent/canvas/actions', 'POST', {
      canvasId,
      agentId,
      runId,
      mode: 'commit',
      drivingMode: 'autopilot',
      approvalPolicy: 'never',
      actions: [{ type: 'run_node', payload: { nodeId } }],
    })),
  },
  {
    name: 'hakimi_canvas_read_node_result',
    title: 'Hakimi Canvas Read Node Result',
    description: 'Read one node status, error, full node data, and real result URLs after execution.',
    inputSchema: z.object({ canvasId: CanvasId, nodeId: NodeId }),
    handler: async ({ canvasId, nodeId }) => ok(readNodeResult(await loadCanvas(canvasId), nodeId)),
  },
  {
    name: 'hakimi_canvas_undo_batch',
    title: 'Hakimi Canvas Undo Batch',
    description: 'Undo one CanvasPlan/action operation batch and refuse unsafe overwrite unless force is explicitly confirmed.',
    inputSchema: z.object({ operationBatchId: z.string().min(1), canvasId: CanvasId.optional(), force: z.boolean().default(false) }),
    handler: async ({ operationBatchId, canvasId, force }) => ok(await api(`/api/agent/canvas/operations/${encodeURIComponent(operationBatchId)}/undo`, 'POST', { canvasId, force })),
  },
  {
    name: 'hakimi_canvas_generate_image',
    title: 'Hakimi Canvas Generate Image',
    description: 'Call the Hakimi image generation proxy. Use hakimi_canvas_add_node/place tools to persist results on canvas.',
    inputSchema: z.object({
      body: JsonValue.describe('Request body for POST /api/proxy/image.'),
    }),
    handler: async ({ body }) => ok(await api('/api/proxy/image', 'POST', body)),
  },
  {
    name: 'hakimi_canvas_generate_video',
    title: 'Hakimi Canvas Generate Video',
    description: 'Submit a Hakimi video generation task through /api/proxy/video/submit.',
    inputSchema: z.object({
      body: JsonValue.describe('Request body for POST /api/proxy/video/submit.'),
    }),
    handler: async ({ body }) => ok(await api('/api/proxy/video/submit', 'POST', body)),
  },
];

function registerHakimiTools(server) {
  for (const tool of HAKIMI_MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler,
    );
  }
}

function createHakimiMcpServer() {
  const server = new McpServer({
    name: 'hakimi-mcp',
    version: '0.1.0',
  });
  registerHakimiTools(server);
  return server;
}

function isInitializeRequest(body) {
  return body && typeof body === 'object' && body.method === 'initialize';
}

function getSessionId(req) {
  const header = req.headers['mcp-session-id'];
  return Array.isArray(header) ? header[0] : String(header || '').trim();
}

async function mcpPostHandler(req, res) {
  const sessionId = getSessionId(req);
  try {
    let transport = sessionId ? transports.get(sessionId) : null;
    if (!transport && !sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      const server = createHakimiMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!transport) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid MCP session ID provided' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Hakimi HTTP MCP request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: error?.message || 'Internal server error' },
        id: null,
      });
    }
  }
}

async function mcpSessionHandler(req, res) {
  const sessionId = getSessionId(req);
  const transport = sessionId ? transports.get(sessionId) : null;
  if (!transport) {
    res.status(400).send('Invalid or missing MCP session ID');
    return;
  }
  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Hakimi HTTP MCP session request failed:', error);
    if (!res.headersSent) res.status(500).send(error?.message || 'Error processing MCP session request');
  }
}

router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    service: 'hakimi-mcp-http',
    transport: 'streamable-http',
    toolCount: HAKIMI_MCP_TOOLS.length,
    tools: HAKIMI_MCP_TOOLS.map((tool) => tool.name),
    backendUrl: backendBaseUrl(),
    sessions: transports.size,
    time: new Date().toISOString(),
  });
});

router.post('/', mcpPostHandler);
router.get('/', mcpSessionHandler);
router.delete('/', mcpSessionHandler);

module.exports = router;
module.exports.createHakimiMcpServer = createHakimiMcpServer;
module.exports.HAKIMI_MCP_TOOLS = HAKIMI_MCP_TOOLS;
