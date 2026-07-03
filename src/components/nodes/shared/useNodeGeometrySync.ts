import { useCallback, useEffect, useRef } from 'react';

type UpdateNodeInternals = (id: string) => void;

export function useNodeGeometrySync(id: string, updateNodeInternals: UpdateNodeInternals, tailDelayMs = 120) {
  const frameRef = useRef<{ first?: number; second?: number; third?: number; tail?: number }>({});

  const cancelPending = useCallback(() => {
    const { first, second, third, tail } = frameRef.current;
    if (first) window.cancelAnimationFrame(first);
    if (second) window.cancelAnimationFrame(second);
    if (third) window.cancelAnimationFrame(third);
    if (tail) window.clearTimeout(tail);
    frameRef.current = {};
  }, []);

  const syncGeometry = useCallback(() => {
    cancelPending();

    updateNodeInternals(id);
    frameRef.current.first = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
      frameRef.current.second = window.requestAnimationFrame(() => {
        updateNodeInternals(id);
        frameRef.current.third = window.requestAnimationFrame(() => updateNodeInternals(id));
      });
    });
    frameRef.current.tail = window.setTimeout(() => updateNodeInternals(id), tailDelayMs);
  }, [cancelPending, id, tailDelayMs, updateNodeInternals]);

  useEffect(() => cancelPending, [cancelPending]);

  return syncGeometry;
}
