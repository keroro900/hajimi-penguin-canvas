import { useCallback, useEffect, useRef } from 'react';

type UpdateNodeData = (patch: Record<string, any>) => void;

export function useThrottledNodeUpdate(update: UpdateNodeData, delayMs = 500) {
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<Record<string, any> | null>(null);
  const lastProgressRef = useRef('');

  const flushProgressUpdate = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) update(pending);
  }, [update]);

  const scheduleProgressUpdate = useCallback((patch: Record<string, any>) => {
    const progress = String(patch.progress ?? '');
    if (progress && progress === lastProgressRef.current && Object.keys(patch).length === 1) return;
    if (progress) lastProgressRef.current = progress;
    pendingRef.current = { ...(pendingRef.current || {}), ...patch };
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(flushProgressUpdate, delayMs);
  }, [delayMs, flushProgressUpdate]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return { scheduleProgressUpdate, flushProgressUpdate };
}
