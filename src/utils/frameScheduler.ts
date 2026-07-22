export type FrameScheduler = {
  schedule: () => void;
  dispose: () => void;
};

export function createFrameScheduler(
  requestFrame: (callback: () => void) => number,
  cancelFrame: (id: number) => void,
  callback: () => void,
): FrameScheduler {
  let pendingId: number | null = null;
  let disposed = false;

  const schedule = () => {
    if (disposed || pendingId !== null) return;
    pendingId = requestFrame(() => {
      pendingId = null;
      if (!disposed) callback();
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (pendingId !== null) {
      cancelFrame(pendingId);
      pendingId = null;
    }
  };

  return { schedule, dispose };
}
