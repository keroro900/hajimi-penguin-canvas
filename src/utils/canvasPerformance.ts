export type CanvasLodLevel = 'full' | 'compact' | 'outline';

export interface CanvasPerformanceProfile {
  lodLevel: CanvasLodLevel;
  renderVisibleElementsOnly: boolean;
  hideHeavyNodeContent: boolean;
  hideHeavyOverlays: boolean;
}

export interface CanvasPerformanceProfileInput {
  zoom: number;
  nodeCount: number;
  edgeCount: number;
  viewportMoving: boolean;
  nodeDragging: boolean;
}

export function getCanvasLodLevel(zoom: number): CanvasLodLevel {
  const normalizedZoom = Number.isFinite(zoom) ? zoom : 1;
  return normalizedZoom < 0.45 ? 'outline' : normalizedZoom < 0.72 ? 'compact' : 'full';
}

export interface CanvasZoomTrackingState {
  liveZoom: number;
  renderedZoom: number;
}

export type CanvasZoomTrackingEvent = {
  type: 'move' | 'end' | 'locked';
  zoom: number;
};

export interface CanvasZoomTrackingResult {
  state: CanvasZoomTrackingState;
  renderZoom: number | null;
}

function normalizeCanvasZoom(zoom: number): number {
  return Number.isFinite(zoom) ? zoom : 1;
}

export function createCanvasZoomTrackingState(zoom: number): CanvasZoomTrackingState {
  const normalizedZoom = normalizeCanvasZoom(zoom);
  return { liveZoom: normalizedZoom, renderedZoom: normalizedZoom };
}

export function reduceCanvasZoomTracking(
  state: CanvasZoomTrackingState,
  event: CanvasZoomTrackingEvent,
): CanvasZoomTrackingResult {
  const nextZoom = normalizeCanvasZoom(event.zoom);
  if (event.type === 'move') {
    if (getCanvasLodLevel(nextZoom) === getCanvasLodLevel(state.renderedZoom)) {
      return {
        state: { liveZoom: nextZoom, renderedZoom: state.renderedZoom },
        renderZoom: null,
      };
    }
    return {
      state: { liveZoom: nextZoom, renderedZoom: nextZoom },
      renderZoom: nextZoom,
    };
  }

  const renderZoom = nextZoom !== state.renderedZoom ? nextZoom : null;
  return {
    state: { liveZoom: nextZoom, renderedZoom: nextZoom },
    renderZoom,
  };
}

export function getCanvasPerformanceProfile(
  input: CanvasPerformanceProfileInput,
): CanvasPerformanceProfile {
  const interactionBusy = Boolean(input.viewportMoving || input.nodeDragging);
  const heavySurface = input.nodeCount >= 96 || input.edgeCount >= 160;
  const lodLevel = getCanvasLodLevel(input.zoom);
  const hideHeavyNodeContent = lodLevel === 'outline';
  const hideHeavyOverlays = interactionBusy || lodLevel !== 'full' || heavySurface;

  return {
    lodLevel,
    renderVisibleElementsOnly: true,
    hideHeavyNodeContent,
    hideHeavyOverlays,
  };
}

type SimpleNodeLike = {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
};

export interface SnapGuideResult {
  vertical: number[];
  horizontal: number[];
  snapPosition?: { x: number; y: number };
}

export function calculateNodeSnapGuides(input: {
  draggedNode: SimpleNodeLike;
  nodes: SimpleNodeLike[];
  threshold: number;
}): SnapGuideResult {
  const { draggedNode, nodes, threshold } = input;
  const w = draggedNode.width || draggedNode.measured?.width || 200;
  const h = draggedNode.height || draggedNode.measured?.height || 100;
  const tx = draggedNode.position.x;
  const ty = draggedNode.position.y;
  const targets = { L: tx, C: tx + w / 2, R: tx + w, T: ty, M: ty + h / 2, B: ty + h };
  const vGuides = new Set<number>();
  const hGuides = new Set<number>();
  let snapDX: number | null = null;
  let snapDY: number | null = null;
  let bestVDiff = threshold;
  let bestHDiff = threshold;

  for (const other of nodes) {
    if (!other || other.id === draggedNode.id) continue;
    const ow = other.width || other.measured?.width || 200;
    const oh = other.height || other.measured?.height || 100;
    const ox = other.position.x;
    const oy = other.position.y;
    const values = { L: ox, C: ox + ow / 2, R: ox + ow, T: oy, M: oy + oh / 2, B: oy + oh };

    for (const tk of ['L', 'C', 'R'] as const) {
      for (const ok of ['L', 'C', 'R'] as const) {
        const diff = Math.abs(targets[tk] - values[ok]);
        if (diff < threshold) {
          vGuides.add(values[ok]);
          if (diff < bestVDiff) {
            bestVDiff = diff;
            snapDX = values[ok] - targets[tk];
          }
        }
      }
    }

    for (const tk of ['T', 'M', 'B'] as const) {
      for (const ok of ['T', 'M', 'B'] as const) {
        const diff = Math.abs(targets[tk] - values[ok]);
        if (diff < threshold) {
          hGuides.add(values[ok]);
          if (diff < bestHDiff) {
            bestHDiff = diff;
            snapDY = values[ok] - targets[tk];
          }
        }
      }
    }
  }

  return {
    vertical: Array.from(vGuides),
    horizontal: Array.from(hGuides),
    snapPosition:
      snapDX !== null || snapDY !== null
        ? {
            x: tx + (snapDX ?? 0),
            y: ty + (snapDY ?? 0),
          }
        : undefined,
  };
}

export interface RafThrottle<T> {
  cancel: () => void;
  pending: () => boolean;
  schedule: (payload: T) => void;
}

export function createRafThrottle<T>(
  callback: (payload: T) => void,
  requestFrame: (cb: FrameRequestCallback) => number = (cb) => window.requestAnimationFrame(cb),
  cancelFrame: (id: number) => void = (id) => window.cancelAnimationFrame(id),
): RafThrottle<T> {
  let frameId = 0;
  let queued = false;
  let latestPayload: T | undefined;

  const run = () => {
    frameId = 0;
    if (!queued) return;
    queued = false;
    callback(latestPayload as T);
  };

  return {
    schedule(payload: T) {
      latestPayload = payload;
      if (frameId) {
        queued = true;
        return;
      }
      queued = true;
      frameId = requestFrame(() => run());
    },
    cancel() {
      if (frameId) {
        cancelFrame(frameId);
        frameId = 0;
      }
      queued = false;
    },
    pending() {
      return frameId !== 0;
    },
  };
}
