export type HandleSide = 'left' | 'right' | 'both';
export type HandleMode = 'proximity' | 'touch-transient' | 'touch-selected';

type PointerLikeEvent = Pick<PointerEvent, 'clientX' | 'pointerId' | 'pointerType' | 'composedPath'>;
type ScheduledTask = unknown;

export interface ProximityHandleControllerOptions {
  resolveNode?: (event: PointerLikeEvent, root: HTMLElement) => HTMLElement | null;
  getNodeId?: (node: HTMLElement) => string | null | undefined;
  schedule?: (callback: () => void) => ScheduledTask;
  cancel?: (task: ScheduledTask) => void;
}

export interface ProximityHandleController {
  pointerMove(event: PointerLikeEvent): void;
  pointerDown(event: PointerLikeEvent): void;
  pointerUp(event: PointerLikeEvent): void;
  pointerCancel(): void;
  selectionChange(selectedIds: ReadonlySet<string>): void;
  connectionStart(): void;
  connectionEnd(): void;
  blur(): void;
  dispose(): void;
}

const SIDE_ATTRIBUTE = 'data-t8-handle-side';
const MODE_ATTRIBUTE = 'data-t8-handle-mode';

type MatchablePathItem = EventTarget & { matches(selector: string): boolean };

function isMatchable(value: EventTarget): value is MatchablePathItem {
  return typeof (value as MatchablePathItem | null)?.matches === 'function';
}

function isInsideRoot(root: HTMLElement, item: MatchablePathItem): boolean {
  const contains = root.contains as unknown as (candidate: MatchablePathItem) => boolean;
  return contains.call(root, item);
}

function defaultResolveNode(event: PointerLikeEvent, root: HTMLElement): HTMLElement | null {
  const path = event.composedPath();
  if (path.some((item) => isMatchable(item) && item.matches('.t8-bulk-phantom-handle'))) {
    return null;
  }

  for (const item of path) {
    if (isMatchable(item) && item.matches('.react-flow__node') && isInsideRoot(root, item)) {
      return item as unknown as HTMLElement;
    }
  }
  return null;
}

function setOwnership(node: HTMLElement, side: HandleSide, mode: HandleMode): void {
  if (node.getAttribute(SIDE_ATTRIBUTE) !== side) node.setAttribute(SIDE_ATTRIBUTE, side);
  if (node.getAttribute(MODE_ATTRIBUTE) !== mode) node.setAttribute(MODE_ATTRIBUTE, mode);
}

function clearOwnership(node: HTMLElement, expectedMode?: HandleMode): void {
  if (expectedMode && node.getAttribute(MODE_ATTRIBUTE) !== expectedMode) return;
  if (node.hasAttribute(SIDE_ATTRIBUTE)) node.removeAttribute(SIDE_ATTRIBUTE);
  if (node.hasAttribute(MODE_ATTRIBUTE)) node.removeAttribute(MODE_ATTRIBUTE);
}

export function createProximityHandleController(
  root: HTMLElement,
  options: ProximityHandleControllerOptions = {},
): ProximityHandleController {
  const resolveNode = options.resolveNode ?? defaultResolveNode;
  const getNodeId = options.getNodeId ?? ((node: HTMLElement) => node.getAttribute('data-id'));
  const schedule = options.schedule ?? ((callback: () => void) => setTimeout(callback, 0));
  const cancel = options.cancel ?? ((task: ScheduledTask) => clearTimeout(task as ReturnType<typeof setTimeout>));

  let proximityNode: HTMLElement | null = null;
  let proximitySide: Exclude<HandleSide, 'both'> | null = null;
  let transientNode: HTMLElement | null = null;
  let activePointerId: number | null = null;
  const selectedFallbackNodes = new Map<string, HTMLElement>();
  let selectedIds: ReadonlySet<string> = new Set();
  let connectionActive = false;
  type FinalizeRecord = {
    generation: number;
    token: ScheduledTask;
    tokenAssigned: boolean;
    cancelled: boolean;
    completed: boolean;
  };
  let finalizeGeneration = 0;
  let pendingFinalize: FinalizeRecord | null = null;
  let disposed = false;

  const cancelFinalize = () => {
    const record = pendingFinalize;
    if (!record) return;
    pendingFinalize = null;
    record.cancelled = true;
    finalizeGeneration += 1;
    if (record.tokenAssigned && !record.completed) cancel(record.token);
  };

  const clearProximity = () => {
    if (proximityNode) clearOwnership(proximityNode, 'proximity');
    proximityNode = null;
    proximitySide = null;
  };

  const transientIsSelectedFallback = () => {
    if (!transientNode) return false;
    const id = getNodeId(transientNode);
    return Boolean(id && selectedFallbackNodes.get(id) === transientNode);
  };

  const clearTransient = () => {
    if (transientNode && !transientIsSelectedFallback()) {
      clearOwnership(transientNode, 'touch-transient');
    }
    transientNode = null;
    activePointerId = null;
  };

  const promoteCandidate = () => {
    if (!transientNode) return;
    const id = getNodeId(transientNode);
    if (!id || !selectedIds.has(id)) return;
    selectedFallbackNodes.set(id, transientNode);
    setOwnership(transientNode, 'both', 'touch-selected');
  };

  const scheduleFinalize = () => {
    cancelFinalize();
    const record: FinalizeRecord = {
      generation: ++finalizeGeneration,
      token: undefined,
      tokenAssigned: false,
      cancelled: false,
      completed: false,
    };
    pendingFinalize = record;
    const callback = () => {
      if (
        record.cancelled
        || pendingFinalize !== record
        || record.generation !== finalizeGeneration
      ) return;
      record.completed = true;
      pendingFinalize = null;
      promoteCandidate();
      clearTransient();
    };
    try {
      record.token = schedule(callback);
      record.tokenAssigned = true;
      if (record.cancelled && !record.completed) cancel(record.token);
    } catch (error) {
      record.cancelled = true;
      if (pendingFinalize === record) pendingFinalize = null;
      throw error;
    }
  };

  const clearTransientActivity = () => {
    cancelFinalize();
    clearTransient();
  };

  return {
    pointerMove(event) {
      if (disposed || connectionActive || event.pointerType !== 'mouse') return;
      const node = resolveNode(event, root);
      if (!node) {
        clearProximity();
        return;
      }

      const id = getNodeId(node);
      if (id && selectedFallbackNodes.get(id) === node) {
        clearProximity();
        return;
      }

      const rect = node.getBoundingClientRect();
      const nextSide = event.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
      if (node === proximityNode && nextSide === proximitySide) return;
      if (node !== proximityNode) clearProximity();
      setOwnership(node, nextSide, 'proximity');
      proximityNode = node;
      proximitySide = nextSide;
    },

    pointerDown(event) {
      if (
        disposed
        || connectionActive
        || (event.pointerType !== 'touch' && event.pointerType !== 'pen')
      ) return;
      cancelFinalize();
      clearTransient();
      const node = resolveNode(event, root);
      if (!node) return;

      if (node === proximityNode) clearProximity();
      transientNode = node;
      activePointerId = event.pointerId;
      const id = getNodeId(node);
      if (id && selectedIds.has(id)) {
        selectedFallbackNodes.set(id, node);
        setOwnership(node, 'both', 'touch-selected');
      } else {
        setOwnership(node, 'both', 'touch-transient');
      }
    },

    pointerUp(event) {
      if (disposed || activePointerId === null || event.pointerId !== activePointerId) return;
      scheduleFinalize();
    },

    pointerCancel() {
      if (disposed) return;
      if (activePointerId !== null) scheduleFinalize();
      clearProximity();
    },

    selectionChange(nextSelectedIds) {
      if (disposed) return;
      selectedIds = new Set(nextSelectedIds);

      for (const [id, node] of selectedFallbackNodes) {
        if (selectedIds.has(id)) continue;
        selectedFallbackNodes.delete(id);
        if (node === transientNode && activePointerId !== null) {
          setOwnership(node, 'both', 'touch-transient');
        } else {
          clearOwnership(node, 'touch-selected');
        }
      }
      promoteCandidate();
    },

    connectionStart() {
      if (disposed) return;
      connectionActive = true;
      clearProximity();
      clearTransientActivity();
    },

    connectionEnd() {
      if (disposed) return;
      connectionActive = false;
      clearProximity();
      clearTransientActivity();
    },

    blur() {
      if (disposed) return;
      clearProximity();
      clearTransientActivity();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelFinalize();
      clearProximity();
      clearTransient();
      for (const node of selectedFallbackNodes.values()) clearOwnership(node, 'touch-selected');
      selectedFallbackNodes.clear();
    },
  };
}
