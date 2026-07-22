import { useCallback, useMemo } from 'react';
import { useEdges, useStore } from '@xyflow/react';

type UpstreamNodeData = {
  id: string;
  data: any;
};

function areUpstreamNodeDataEqual(a: UpstreamNodeData[], b: UpstreamNodeData[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id || a[i]?.data !== b[i]?.data) return false;
  }

  return true;
}

export function useUpstreamNodeData(nodeId: string): UpstreamNodeData[] {
  const edges = useEdges();

  const upstreamIds = useMemo(() => {
    const ids: string[] = [];
    for (const edge of edges) {
      if (edge?.target === nodeId && typeof edge.source === 'string') ids.push(edge.source);
    }
    return ids;
  }, [edges, nodeId]);

  return useStore(
    useCallback(
      (state: any) =>
        upstreamIds.map((id) => ({
          id,
          data:
            state?.nodeLookup?.get?.(id)?.data ??
            (Array.isArray(state?.nodes) ? state.nodes.find((node: any) => node?.id === id)?.data : undefined),
        })),
      [upstreamIds],
    ),
    areUpstreamNodeDataEqual,
  );
}
