import type { Edge, Node } from '@xyflow/react';

import { getNodeInputs, NODE_PORTS } from '../config/portTypes.ts';
import type { AdvancedProviderConfig } from '../types/canvas.ts';

export type RunPreflightSeverity = 'error' | 'warning';

export type RunPreflightIssueCode =
  | 'EMPTY_CANVAS'
  | 'UNKNOWN_NODE_TYPE'
  | 'CYCLE_DEPENDENCY'
  | 'MISSING_REQUIRED_INPUT'
  | 'PROVIDER_NOT_READY';

export interface RunPreflightIssue {
  severity: RunPreflightSeverity;
  code: RunPreflightIssueCode;
  message: string;
  nodeId?: string;
  hint?: string;
}

export interface RunPreflightOptions {
  providers?: AdvancedProviderConfig[];
}

const UPSTREAM_REQUIRED_NODE_TYPES = new Set([
  'upscale',
  'resize',
  'combine',
  'remove-bg',
  'grid-crop',
  'grid-editor',
  'image-compare',
  'frame-extractor',
  'frame-pair',
  'drawing-board',
  'portrait-metadata',
  'storyboard-grid',
  'multi-angle-visual',
  'topaz-image-upscale',
  'topaz-video-upscale',
  'panorama-3d',
  'model-3d-preview',
  'video-output',
  'output',
]);

export function runPreflight(
  nodes: Node[],
  edges: Edge[],
  options: RunPreflightOptions = {},
): RunPreflightIssue[] {
  const issues: RunPreflightIssue[] = [];

  if (nodes.length === 0) {
    issues.push({
      severity: 'error',
      code: 'EMPTY_CANVAS',
      message: '画布为空，无法运行。',
      hint: '先添加至少一个可运行节点。',
    });
    return issues;
  }

  const knownNodes = nodes.filter((node) => isKnownNodeType(node.type));
  const knownNodeIds = new Set(knownNodes.map((node) => node.id));

  for (const node of nodes) {
    if (!isKnownNodeType(node.type)) {
      issues.push({
        severity: 'error',
        code: 'UNKNOWN_NODE_TYPE',
        nodeId: node.id,
        message: `节点类型 ${node.type || 'unknown'} 未注册，运行前无法识别。`,
        hint: '确认画布数据来自当前版本，或删除/替换该节点。',
      });
    }
  }

  for (const nodeId of findCycleNodeIds(knownNodes, edges, knownNodeIds)) {
    issues.push({
      severity: 'error',
      code: 'CYCLE_DEPENDENCY',
      nodeId,
      message: '检测到循环依赖，批量运行无法确定执行顺序。',
      hint: '移除形成回路的连线后再运行。',
    });
  }

  const incomingByTarget = groupIncomingEdges(edges, knownNodeIds);
  for (const node of knownNodes) {
    if (requiresUpstreamInput(node) && (incomingByTarget.get(node.id)?.length ?? 0) === 0) {
      const inputLabels = getNodeInputs(node).join('/');
      issues.push({
        severity: 'error',
        code: 'MISSING_REQUIRED_INPUT',
        nodeId: node.id,
        message: '节点缺少必需的上游输入。',
        hint: inputLabels ? `连接一个可输出 ${inputLabels} 的上游节点。` : '连接一个上游节点。',
      });
    }
  }

  for (const node of knownNodes) {
    const providerIssue = preflightProvider(node, options.providers ?? []);
    if (providerIssue) issues.push(providerIssue);
  }

  return issues;
}

function isKnownNodeType(type: string | undefined): type is keyof typeof NODE_PORTS {
  return !!type && Object.prototype.hasOwnProperty.call(NODE_PORTS, type);
}

function groupIncomingEdges(edges: Edge[], knownNodeIds: Set<string>): Map<string, Edge[]> {
  const incoming = new Map<string, Edge[]>();
  for (const edge of edges) {
    if (!knownNodeIds.has(edge.source) || !knownNodeIds.has(edge.target)) continue;
    const current = incoming.get(edge.target) ?? [];
    current.push(edge);
    incoming.set(edge.target, current);
  }
  return incoming;
}

function findCycleNodeIds(nodes: Node[], edges: Edge[], nodeIds: Set<string>): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) queue.push(node.id);
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited.add(id);
    for (const next of adj.get(id) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  return nodes.filter((node) => !visited.has(node.id)).map((node) => node.id);
}

function requiresUpstreamInput(node: Node): boolean {
  if (!node.type || !UPSTREAM_REQUIRED_NODE_TYPES.has(node.type)) return false;
  return getNodeInputs(node).length > 0;
}

function preflightProvider(
  node: Node,
  providers: AdvancedProviderConfig[],
): RunPreflightIssue | null {
  const data = (node.data ?? {}) as Record<string, any>;
  const providerSource = String(data.providerSource ?? '');
  if (!providerSource || providerSource === 'zhenzhen') return null;

  const providerId = String(data.providerId ?? '').trim();
  const provider = providers.find((item) => item.id === providerId);

  if (!provider) {
    return {
      severity: 'error',
      code: 'PROVIDER_NOT_READY',
      nodeId: node.id,
      message: '节点选择的外部 provider 不存在或未加载。',
      hint: '重新选择可用 provider，或检查运行前传入的 provider 状态。',
    };
  }

  if (!provider.enabled || !isProviderConfigured(provider)) {
    return {
      severity: 'error',
      code: 'PROVIDER_NOT_READY',
      nodeId: node.id,
      message: `${provider.label || provider.id} 尚未启用或缺少必要凭据。`,
      hint: '启用该 provider，并补齐 API Key、本地地址或 CLI 路径。',
    };
  }

  return null;
}

function isProviderConfigured(provider: AdvancedProviderConfig): boolean {
  if (provider.hasApiKey || hasSecret(provider.apiKey)) return true;
  if (provider.protocol === 'comfyui') {
    return hasSecret(provider.baseUrl) || (provider.comfyuiConfig?.instances?.length ?? 0) > 0;
  }
  if (provider.protocol === 'jimeng-cli') {
    return hasSecret(provider.jimengConfig?.executablePath);
  }
  if (provider.protocol === 'volcengine') {
    return Boolean(
      provider.volcengineConfig?.hasAccessKeyId
      || provider.volcengineConfig?.hasSecretAccessKey
      || hasSecret(provider.volcengineConfig?.accessKeyId)
      || hasSecret(provider.volcengineConfig?.secretAccessKey),
    );
  }
  return false;
}

function hasSecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
