import type { Edge, Node } from '@xyflow/react';

export type GroupExecutionSkipReason = 'not-member' | 'not-executable' | 'cycle';

export interface GroupExecutionPlanItem {
  id: string;
  type: string;
}

export interface GroupExecutionSkippedItem extends GroupExecutionPlanItem {
  reason: GroupExecutionSkipReason;
}

export interface GroupExecutionPlan {
  stages: GroupExecutionPlanItem[][];
  skipped: GroupExecutionSkippedItem[];
  cycleNodeIds: string[];
}

export interface GroupExecutionPlanInput {
  nodes: Node[];
  edges: Edge[];
  memberIds: string[];
  executableTypes?: ReadonlySet<string>;
}

export const DEFAULT_GROUP_EXECUTABLE_NODE_TYPES = new Set([
  'llm',
  'image',
  'video',
  'seedance',
  'audio',
]);

export function createGroupExecutionPlan(input: GroupExecutionPlanInput): GroupExecutionPlan {
  const memberSet = new Set(input.memberIds.filter(Boolean));
  const executableTypes = input.executableTypes || DEFAULT_GROUP_EXECUTABLE_NODE_TYPES;
  const memberNodes = input.nodes.filter((node) => memberSet.has(node.id));
  const executableNodes = memberNodes.filter((node) => !!node.type && executableTypes.has(node.type));
  const executableIds = new Set(executableNodes.map((node) => node.id));
  const skipped: GroupExecutionSkippedItem[] = memberNodes
    .filter((node) => !executableIds.has(node.id))
    .map((node) => ({ id: node.id, type: node.type || 'unknown', reason: 'not-executable' as const }));

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const nodeById = new Map(executableNodes.map((node) => [node.id, node]));

  for (const node of executableNodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of input.edges) {
    if (!executableIds.has(edge.source) || !executableIds.has(edge.target)) continue;
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const stages: GroupExecutionPlanItem[][] = [];
  let current = executableNodes
    .filter((node) => (inDegree.get(node.id) || 0) === 0)
    .map((node) => node.id);
  const visited = new Set<string>();

  while (current.length > 0) {
    const stageIds = current.filter((id) => !visited.has(id));
    if (stageIds.length === 0) break;
    stages.push(stageIds.map((id) => ({ id, type: nodeById.get(id)?.type || 'unknown' })));
    const next: string[] = [];
    for (const id of stageIds) {
      visited.add(id);
      for (const target of adj.get(id) || []) {
        const degree = (inDegree.get(target) || 0) - 1;
        inDegree.set(target, degree);
        if (degree === 0) next.push(target);
      }
    }
    current = next;
  }

  const cycleNodeIds = executableNodes.filter((node) => !visited.has(node.id)).map((node) => node.id);
  skipped.push(...cycleNodeIds.map((id) => ({
    id,
    type: nodeById.get(id)?.type || 'unknown',
    reason: 'cycle' as const,
  })));

  return { stages, skipped, cycleNodeIds };
}
