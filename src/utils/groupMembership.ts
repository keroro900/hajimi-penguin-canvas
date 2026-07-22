import type { Node } from '@xyflow/react';

export interface GroupMembershipNode {
  id: string;
  type?: string;
  position?: { x?: number; y?: number } | null;
  width?: number | null;
  height?: number | null;
  measured?: { width?: number | null; height?: number | null } | null;
  data?: Record<string, unknown> | null;
}

export interface NodeSize {
  width: number;
  height: number;
}

const DEFAULT_NODE_SIZE: NodeSize = { width: 200, height: 100 };
const DEFAULT_GROUP_SIZE: NodeSize = { width: 480, height: 320 };
const EXCLUDED_MEMBER_IDS = new Set(['bulk-phantom', 'bulkPhantom']);

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function finiteCoordinate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function resolveNodeSize(
  node: GroupMembershipNode | Node,
  fallback?: NodeSize,
): NodeSize {
  const defaultSize = fallback || (node.type === 'groupBox' ? DEFAULT_GROUP_SIZE : DEFAULT_NODE_SIZE);
  const data = (node.data || {}) as Record<string, unknown>;
  return {
    width:
      finitePositive(node.measured?.width) ??
      finitePositive(node.width) ??
      finitePositive(data.width) ??
      defaultSize.width,
    height:
      finitePositive(node.measured?.height) ??
      finitePositive(node.height) ??
      finitePositive(data.height) ??
      defaultSize.height,
  };
}

export function isNodeCenterInsideGroup(
  group: GroupMembershipNode | Node,
  candidate: GroupMembershipNode | Node,
): boolean {
  if (group.type !== 'groupBox' || candidate.id === group.id || candidate.type === 'groupBox') return false;
  if (EXCLUDED_MEMBER_IDS.has(candidate.id)) return false;

  const groupSize = resolveNodeSize(group);
  const candidateSize = resolveNodeSize(candidate);
  const groupX = finiteCoordinate(group.position?.x);
  const groupY = finiteCoordinate(group.position?.y);
  const centerX = finiteCoordinate(candidate.position?.x) + candidateSize.width / 2;
  const centerY = finiteCoordinate(candidate.position?.y) + candidateSize.height / 2;

  return (
    centerX >= groupX &&
    centerX <= groupX + groupSize.width &&
    centerY >= groupY &&
    centerY <= groupY + groupSize.height
  );
}

export function getGroupMemberIds<T extends GroupMembershipNode | Node>(group: T, nodes: T[]): string[] {
  if (group.type !== 'groupBox') return [];
  return nodes.filter((node) => isNodeCenterInsideGroup(group, node)).map((node) => node.id);
}

export function getContainingGroupIds<T extends GroupMembershipNode | Node>(node: T, nodes: T[]): string[] {
  if (node.type === 'groupBox') return [];
  return nodes
    .filter((candidate) => candidate.type === 'groupBox' && isNodeCenterInsideGroup(candidate, node))
    .map((group) => group.id);
}
