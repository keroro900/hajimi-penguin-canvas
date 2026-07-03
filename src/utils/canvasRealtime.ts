export type CanvasRealtimeOpType =
  | 'node:add'
  | 'node:update'
  | 'node:remove'
  | 'nodes:replace'
  | 'edge:add'
  | 'edge:remove'
  | 'edges:replace'
  | 'viewport:update'
  | 'canvas:snapshot';

export interface CanvasRealtimeOp {
  opId: string;
  canvasId: string;
  clientId: string;
  type: CanvasRealtimeOpType;
  payload: Record<string, any>;
  createdAt: number;
}

export interface CanvasRealtimeState {
  nodes: any[];
  edges: any[];
  viewport?: any;
  [key: string]: any;
}

const VALID_TYPES = new Set<CanvasRealtimeOpType>([
  'node:add',
  'node:update',
  'node:remove',
  'nodes:replace',
  'edge:add',
  'edge:remove',
  'edges:replace',
  'viewport:update',
  'canvas:snapshot',
]);

function requiredText(value: unknown, label: string) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`canvas realtime op requires ${label}`);
  return text.slice(0, 240);
}

function randomToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) : [];
}

function mergeNode(node: any, patch: any) {
  const next = { ...node, ...patch };
  if (patch?.position && typeof patch.position === 'object') {
    next.position = { ...(node.position || {}), ...patch.position };
  }
  if (patch?.data && typeof patch.data === 'object') {
    next.data = { ...(node.data || {}), ...patch.data };
  }
  return next;
}

function idsFromPayload(payload: Record<string, any>) {
  if (Array.isArray(payload.ids)) return new Set(payload.ids.map((id) => String(id)));
  if (payload.id != null) return new Set([String(payload.id)]);
  return new Set<string>();
}

export function makeCanvasRealtimeClientId(scope = 'client') {
  const safeScope = String(scope || 'client').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'client';
  return `t8rt-${safeScope}-${randomToken()}`;
}

export function normalizeCanvasRealtimeOp(input: any): CanvasRealtimeOp {
  const canvasId = requiredText(input?.canvasId, 'canvasId');
  const clientId = requiredText(input?.clientId, 'clientId');
  const opId = requiredText(input?.opId || randomToken(), 'opId');
  const type = String(input?.type || '') as CanvasRealtimeOpType;
  if (!VALID_TYPES.has(type)) throw new Error(`unsupported canvas realtime op type: ${type || 'empty'}`);
  const payload = input?.payload && typeof input.payload === 'object' ? input.payload : {};
  const createdAt = Number.isFinite(Number(input?.createdAt)) ? Number(input.createdAt) : Date.now();
  return { opId, canvasId, clientId, type, payload, createdAt };
}

export function applyCanvasRealtimeOp(state: CanvasRealtimeState, op: CanvasRealtimeOp) {
  const current: CanvasRealtimeState = {
    ...state,
    nodes: Array.isArray(state?.nodes) ? state.nodes : [],
    edges: Array.isArray(state?.edges) ? state.edges : [],
  };
  const payload = op.payload || {};

  if (op.type === 'canvas:snapshot') {
    return {
      changed: true,
      canvas: {
        ...current,
        ...payload,
        nodes: cloneArray(payload.nodes),
        edges: cloneArray(payload.edges),
        viewport: payload.viewport || current.viewport,
      },
    };
  }

  if (op.type === 'node:add') {
    const node = payload.node;
    if (!node?.id) return { changed: false, canvas: current };
    const id = String(node.id);
    const nodes = current.nodes.some((item) => item?.id === id)
      ? current.nodes.map((item) => (item?.id === id ? mergeNode(item, node) : item))
      : [...current.nodes, node];
    return { changed: true, canvas: { ...current, nodes } };
  }

  if (op.type === 'node:update') {
    const id = String(payload.id || payload.node?.id || '');
    if (!id) return { changed: false, canvas: current };
    let changed = false;
    const patch = payload.patch || payload.node || {};
    const nodes = current.nodes.map((node) => {
      if (node?.id !== id) return node;
      changed = true;
      return mergeNode(node, patch);
    });
    return { changed, canvas: changed ? { ...current, nodes } : current };
  }

  if (op.type === 'node:remove') {
    const ids = idsFromPayload(payload);
    if (ids.size === 0) return { changed: false, canvas: current };
    const nodes = current.nodes.filter((node) => !ids.has(String(node?.id)));
    const edges = current.edges.filter((edge) => !ids.has(String(edge?.source)) && !ids.has(String(edge?.target)));
    return { changed: nodes.length !== current.nodes.length || edges.length !== current.edges.length, canvas: { ...current, nodes, edges } };
  }

  if (op.type === 'nodes:replace') {
    return { changed: true, canvas: { ...current, nodes: cloneArray(payload.nodes) } };
  }

  if (op.type === 'edge:add') {
    const edge = payload.edge;
    if (!edge?.id) return { changed: false, canvas: current };
    const id = String(edge.id);
    const edges = current.edges.some((item) => item?.id === id)
      ? current.edges.map((item) => (item?.id === id ? { ...item, ...edge } : item))
      : [...current.edges, edge];
    return { changed: true, canvas: { ...current, edges } };
  }

  if (op.type === 'edge:remove') {
    const ids = idsFromPayload(payload);
    if (ids.size === 0) return { changed: false, canvas: current };
    const edges = current.edges.filter((edge) => !ids.has(String(edge?.id)));
    return { changed: edges.length !== current.edges.length, canvas: { ...current, edges } };
  }

  if (op.type === 'edges:replace') {
    return { changed: true, canvas: { ...current, edges: cloneArray(payload.edges) } };
  }

  if (op.type === 'viewport:update') {
    return { changed: true, canvas: { ...current, viewport: payload.viewport || current.viewport } };
  }

  return { changed: false, canvas: current };
}
