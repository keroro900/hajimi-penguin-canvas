import { useCallback } from 'react';
import { useReactFlow, type Edge } from '@xyflow/react';
import type { Material } from '../useUpstreamMaterials';

export function isUpstreamMaterialEdge(edge: Pick<Edge, 'source' | 'target'>, sourceNodeId: string, targetNodeId: string) {
  return edge.source === sourceNodeId && edge.target === targetNodeId;
}

export function pruneMaterialIdsForDisconnectedSource(ids: readonly string[] | undefined, sourceNodeId: string): string[] {
  if (!Array.isArray(ids) || !sourceNodeId) return [];
  const prefix = `${sourceNodeId}::`;
  return ids.filter((itemId) => typeof itemId === 'string' && !itemId.startsWith(prefix));
}

export function pruneMaterialOrderForDisconnectedSource(order: readonly string[] | undefined, sourceNodeId: string): string[] {
  return pruneMaterialIdsForDisconnectedSource(order, sourceNodeId);
}

export function useDisconnectUpstreamMaterial(targetNodeId: string) {
  const { setEdges } = useReactFlow();

  return useCallback((material: Material) => {
    const sourceNodeId = material.origin === 'upstream' ? material.sourceNodeId : '';
    if (!sourceNodeId || !targetNodeId) return;
    setEdges((edges) =>
      edges.filter((edge) => !isUpstreamMaterialEdge(edge, sourceNodeId, targetNodeId)),
    );
  }, [setEdges, targetNodeId]);
}
