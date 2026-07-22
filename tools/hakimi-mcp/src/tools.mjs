import * as z from 'zod/v4';
import { buildHakimiCanvasCatalog } from './canvasCatalog.mjs';
import { callHakimiBackend, jsonToolResult } from './backendClient.mjs';

const JsonValue = z.any();
const CanvasId = z.string().min(1).describe('Hakimi canvas id, for example canvas-123-abc.');
const NodeId = z.string().min(1).describe('Canvas node id.');
const Position = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

function ok(data) {
  return jsonToolResult(data);
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
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeCanvasNodeData(nodeType, data) {
  const next = data && typeof data === 'object' ? { ...data } : {};
  if (nodeType === 'text') {
    if (typeof next.prompt !== 'string' && typeof next.text === 'string') next.prompt = next.text;
    if (typeof next.text !== 'string' && typeof next.prompt === 'string') next.text = next.prompt;
  }
  if (nodeType === 'image') {
    if (typeof next.imageUrl === 'string' && next.imageUrl.trim()) {
      const urls = Array.isArray(next.imageUrls) ? next.imageUrls : [];
      next.imageUrls = [next.imageUrl, ...urls.filter((url) => url !== next.imageUrl)];
    } else if (Array.isArray(next.imageUrls) && typeof next.imageUrls[0] === 'string') {
      next.imageUrl = next.imageUrls[0];
    }
  }
  return next;
}

function withUpdatedNode(canvas, nodeId, patch) {
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
  let found = false;
  const nextNodes = nodes.map((node) => {
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
  return { ...canvas, nodes: nextNodes };
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
  return {
    nodeId,
    type: node.type,
    status: data.status || data.runStatus || 'idle',
    error: data.error || '',
    resultUrls: [...new Set(urls)],
    node,
  };
}

export const HAKIMI_MCP_TOOLS = [
  {
    name: 'hakimi_get_capabilities',
    title: 'Hakimi Get Capabilities',
    description: 'Return every Hakimi canvas node type, port schema, and exposed backend API route group.',
    inputSchema: z.object({}),
    handler: async () => ok(buildHakimiCanvasCatalog()),
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
      const nextCanvas = withUpdatedNode(canvas, nodeId, { data, position });
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
    handler: async ({ nodeType }) => {
      const catalog = buildHakimiCanvasCatalog();
      const node = catalog.nodes.find((item) => item.type === nodeType);
      if (!node) throw new Error(`Unknown Hakimi node type: ${nodeType}`);
      return ok(node);
    },
  },
  {
    name: 'hakimi_canvas_configure_generation',
    title: 'Hakimi Canvas Configure Generation',
    description: 'Configure an existing image/video generation node through CanvasPlan normalization so model-specific parameters stay valid.',
    inputSchema: z.object({
      canvasId: CanvasId,
      nodeId: NodeId,
      data: JsonValue,
      run: z.boolean().default(false),
      agentId: z.string().default('codex'),
    }),
    handler: async ({ canvasId, nodeId, data, run, agentId }) => ok(await api('/api/agent/canvas/plans/apply', 'POST', {
      canvasId,
      agentId,
      drivingMode: 'autopilot',
      approvalPolicy: 'never',
      plan: {
        title: '配置生成节点',
        updates: [{ nodeId, data }],
        runNodeIds: run ? [nodeId] : [],
      },
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
    description: 'Undo one CanvasPlan/action operation batch. Refuses when later canvas edits would be overwritten unless force is explicitly confirmed.',
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
  {
    name: 'hakimi_canvas_run_codex_agent',
    title: 'Hakimi Canvas Run Codex Agent',
    description: 'Run the existing Hakimi Codex CLI creator agent stream route in non-streaming bridge mode.',
    inputSchema: z.object({
      body: JsonValue.describe('Request body for POST /api/codex-cli/agent/stream.'),
    }),
    handler: async ({ body }) => ok(await api('/api/codex-cli/agent/stream', 'POST', body)),
  },
];

export function registerHakimiTools(server) {
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
