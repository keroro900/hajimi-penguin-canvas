export interface ModalIsolationElement {
  inert?: boolean;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface BodySiblingSnapshot<T extends ModalIsolationElement = ModalIsolationElement> {
  element: T;
  hadInertProperty: boolean;
  hadInertAttribute: boolean;
  inertAttribute: string | null;
  inert: boolean | undefined;
  hadAriaHidden: boolean;
  ariaHidden: string | null;
  restored: boolean;
}

function snapshotBodyElement<T extends ModalIsolationElement>(
  element: T,
): BodySiblingSnapshot<T> {
  return {
    element,
    hadInertProperty: 'inert' in element,
    hadInertAttribute: element.hasAttribute('inert'),
    inertAttribute: element.getAttribute('inert'),
    inert: element.inert,
    hadAriaHidden: element.hasAttribute('aria-hidden'),
    ariaHidden: element.getAttribute('aria-hidden'),
    restored: false,
  };
}

export function snapshotBodySiblings<T extends ModalIsolationElement>(
  bodyChildren: readonly T[],
  portalRoot: T,
): Array<BodySiblingSnapshot<T>> {
  return bodyChildren
    .filter((element) => element !== portalRoot)
    .map(snapshotBodyElement);
}

export function isolateBodySiblings<T extends ModalIsolationElement>(
  snapshots: readonly BodySiblingSnapshot<T>[],
): void {
  for (const snapshot of snapshots) {
    snapshot.element.inert = true;
    snapshot.element.setAttribute('inert', '');
    snapshot.element.setAttribute('aria-hidden', 'true');
  }
}

export function restoreBodySiblings<T extends ModalIsolationElement>(
  snapshots: readonly BodySiblingSnapshot<T>[],
): void {
  for (const snapshot of snapshots) {
    if (snapshot.restored) continue;
    snapshot.restored = true;
    restoreBodySnapshot(snapshot);
  }
}

function restoreBodySnapshot(snapshot: BodySiblingSnapshot): void {
  if (snapshot.hadInertProperty) {
    snapshot.element.inert = snapshot.inert;
  } else {
    delete snapshot.element.inert;
  }
  if (snapshot.hadInertAttribute) {
    snapshot.element.setAttribute('inert', snapshot.inertAttribute ?? '');
  } else {
    snapshot.element.removeAttribute('inert');
  }
  if (snapshot.hadAriaHidden) {
    snapshot.element.setAttribute('aria-hidden', snapshot.ariaHidden ?? '');
  } else {
    snapshot.element.removeAttribute('aria-hidden');
  }
}

export function calculateNextFocusIndex(
  focusableCount: number,
  activeIndex: number,
  reverse: boolean,
): number {
  if (focusableCount <= 0) return -1;
  if (activeIndex < 0 || activeIndex >= focusableCount) {
    return reverse ? focusableCount - 1 : 0;
  }
  return (activeIndex + (reverse ? -1 : 1) + focusableCount) % focusableCount;
}

let legacyCanvasModalActive = false;
const activeModalOwners: Array<{ token: symbol; portalRoot: ModalIsolationElement }> = [];
const modalBaselineSnapshots = new Map<ModalIsolationElement, BodySiblingSnapshot>();

export function setCanvasModalActive(active: boolean): void {
  legacyCanvasModalActive = active;
}

export function isCanvasModalActive(): boolean {
  return legacyCanvasModalActive || activeModalOwners.length > 0;
}

export function isTopCanvasModalIsolation(portalRoot: ModalIsolationElement): boolean {
  return activeModalOwners.at(-1)?.portalRoot === portalRoot;
}

function applyOwnedModalIsolation(): void {
  const topPortal = activeModalOwners.at(-1)?.portalRoot ?? null;
  for (const snapshot of modalBaselineSnapshots.values()) {
    if (snapshot.element === topPortal) {
      restoreBodySnapshot(snapshot);
    } else {
      isolateBodySiblings([snapshot]);
    }
  }
}

export function acquireCanvasModalIsolation<T extends ModalIsolationElement>(
  bodyChildren: readonly T[],
  portalRoot: T,
): () => void {
  for (const element of bodyChildren) {
    if (!modalBaselineSnapshots.has(element)) {
      modalBaselineSnapshots.set(element, snapshotBodyElement(element));
    }
  }
  if (!modalBaselineSnapshots.has(portalRoot)) {
    modalBaselineSnapshots.set(portalRoot, snapshotBodyElement(portalRoot));
  }
  const owner = { token: Symbol('canvas-modal'), portalRoot };
  activeModalOwners.push(owner);
  applyOwnedModalIsolation();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const ownerIndex = activeModalOwners.findIndex(({ token }) => token === owner.token);
    if (ownerIndex >= 0) activeModalOwners.splice(ownerIndex, 1);
    if (activeModalOwners.length > 0) {
      applyOwnedModalIsolation();
      return;
    }
    for (const snapshot of modalBaselineSnapshots.values()) restoreBodySnapshot(snapshot);
    modalBaselineSnapshots.clear();
  };
}

export interface ModalFocusTarget {
  focus(): void;
}

export interface ModalKeyEvent {
  key: string;
  shiftKey?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface ModalBackdropEvent {
  target: unknown;
  currentTarget: unknown;
}

export interface ModalControllerDependencies<T extends ModalFocusTarget = ModalFocusTarget> {
  getFocusableElements(): T[];
  getActiveElement(): T | null;
  initialFocus: ModalFocusTarget | null;
  opener: ModalFocusTarget | null;
  isolate(): () => void;
  onClose(): void;
  onEscapeBeforeClose?(): boolean;
}

export interface ModalController {
  activate(): void;
  handleKey(event: ModalKeyEvent): void;
  handleBackdrop(event: ModalBackdropEvent): void;
  requestClose(): void;
  destroy(): void;
}

export function createModalController<T extends ModalFocusTarget>(
  dependencies: ModalControllerDependencies<T>,
): ModalController {
  let restoreIsolation: (() => void) | null = null;

  const restore = () => {
    if (!restoreIsolation) return;
    const restoreCurrentIsolation = restoreIsolation;
    restoreIsolation = null;
    restoreCurrentIsolation();
    dependencies.opener?.focus();
  };

  const requestClose = () => {
    if (!restoreIsolation) return;
    restore();
    dependencies.onClose();
  };

  return {
    activate() {
      if (restoreIsolation) return;
      restoreIsolation = dependencies.isolate();
      dependencies.initialFocus?.focus();
    },
    handleKey(event) {
      if (event.key === 'Tab') {
        event.stopPropagation();
        event.preventDefault();
        const focusableElements = dependencies.getFocusableElements();
        const activeIndex = focusableElements.indexOf(dependencies.getActiveElement() as T);
        const nextIndex = calculateNextFocusIndex(
          focusableElements.length,
          activeIndex,
          Boolean(event.shiftKey),
        );
        if (nextIndex >= 0) focusableElements[nextIndex].focus();
        return;
      }
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      if (dependencies.onEscapeBeforeClose?.()) return;
      requestClose();
    },
    handleBackdrop(event) {
      if (event.target === event.currentTarget) requestClose();
    },
    requestClose,
    destroy: restore,
  };
}
