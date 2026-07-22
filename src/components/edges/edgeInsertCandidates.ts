/**
 * Pure planning helpers for the edge-hover「插入节点」flow.
 *
 * DOM-free and framework-free so the compatibility filter and the splice plan
 * can be unit-tested in plain Node. Compatibility mirrors the onConnect /
 * arePortsCompatible conventions (any 透传 + 交集判定) used by the canvas.
 */
import { NODE_PORTS, arePortsCompatible, type PortType } from '../../config/portTypes.ts';

export interface EdgeInsertCandidate {
  /** Node type (NODE_PORTS / NODE_REGISTRY key) that can be spliced in. */
  type: string;
  /** Port type the new node consumes on the upstream edge. */
  matchedInput: PortType;
  /** Port type the new node feeds back on the downstream edge. */
  matchedOutput: PortType;
}

/**
 * List node types that can be spliced into an edge carrying `portType`.
 * A node qualifies when it has at least one input handle compatible with the
 * edge's port type AND at least one output handle compatible with it, so the
 * original edge can be replaced by source → newNode → target without
 * changing the carried port type.
 */
export function listEdgeInsertCandidates(portType: PortType): EdgeInsertCandidate[] {
  const candidates: EdgeInsertCandidate[] = [];
  for (const [type, ports] of Object.entries(NODE_PORTS)) {
    const inputs = ports?.inputs ?? [];
    const outputs = ports?.outputs ?? [];
    // 需要能吃下这条连线 (上游输出 portType → 本节点输入)
    if (!arePortsCompatible([portType], inputs)) continue;
    // 需要能续上这条连线 (本节点输出 → 下游输入 portType)
    if (!arePortsCompatible(outputs, [portType])) continue;
    const matchedInput =
      ([portType] as PortType[]).find((o) => inputs.includes(o) || o === 'any' || inputs.includes('any')) ?? 'any';
    const matchedOutput =
      outputs.find((o) => o === portType || o === 'any' || portType === 'any') ?? 'any';
    candidates.push({ type, matchedInput, matchedOutput });
  }
  return candidates;
}

/** Minimal shape of the original edge needed to plan a splice. */
export interface EdgeSpliceSource {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}

export interface EdgeSplicePlanEdge {
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  data: Record<string, unknown>;
}

export interface EdgeSplicePlan {
  /** source → newNode */
  upstream: EdgeSplicePlanEdge;
  /** newNode → target */
  downstream: EdgeSplicePlanEdge;
}

/**
 * Plan the two replacement edges for splicing `newNodeId` into `edge`.
 * The original source handle stays on the upstream edge and the original
 * target handle stays on the downstream edge; the new node side uses the
 * default (null) handles, matching the connection-picker conventions.
 * Both edges preserve the original edge data and carry the resolved portType,
 * exactly like onReconnect does.
 */
export function planEdgeSplice(
  edge: EdgeSpliceSource,
  newNodeId: string,
  portType: PortType,
): EdgeSplicePlan {
  const baseData = { ...((edge.data as Record<string, unknown> | undefined) || {}), portType };
  return {
    upstream: {
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      target: newNodeId,
      targetHandle: null,
      data: { ...baseData },
    },
    downstream: {
      source: newNodeId,
      sourceHandle: null,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
      data: { ...baseData },
    },
  };
}
