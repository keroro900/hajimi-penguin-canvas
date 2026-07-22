/**
 * Pure placement solver for the smart node composer popover.
 *
 * DOM-free and framework-free so it can be unit-tested in plain Node.
 * The composer always opens below its anchor and may move horizontally to
 * preserve the greatest useful vertical span around viewport obstacles.
 */

export type ComposerPlacement = 'bottom';

export type ComposerAnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ComposerPopoverSize = {
  width: number;
  height: number;
};

export type ComposerViewport = {
  width: number;
  height: number;
};

export type ResolveComposerPlacementArgs = {
  anchorRect: ComposerAnchorRect;
  popoverSize: ComposerPopoverSize;
  viewport: ComposerViewport;
  /** Gap between anchor and popover. Default 8. */
  gap?: number;
  /** Minimum distance to any viewport edge. Default 12. */
  margin?: number;
  /** Viewport-space obstacle rects the popover should avoid below its anchor. */
  avoid?: ComposerAnchorRect[];
};

export type ComposerPlacementResult = {
  top: number;
  left: number;
  placement: ComposerPlacement;
  maxHeight: number;
  /** Horizontal offset of the anchor pointer inside the popover box. */
  pointerLeft: number;
};

const DEFAULT_GAP = 8;
const DEFAULT_MARGIN = 12;
const COMFORTABLE_MAX_HEIGHT = 760;
const CARET_INSET = 14;

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
};

const finiteNonnegative = (value: number, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, value) : fallback;

const finiteNumber = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const saturatingAdd = (left: number, right: number) => {
  const sum = left + right;
  if (Number.isFinite(sum)) return sum;
  return sum === Number.NEGATIVE_INFINITY ? -Number.MAX_VALUE : Number.MAX_VALUE;
};

const hasFinitePositiveGeometry = (rect: ComposerAnchorRect) =>
  rect != null &&
  Number.isFinite(rect.top) &&
  Number.isFinite(rect.left) &&
  Number.isFinite(rect.right) &&
  Number.isFinite(rect.bottom) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height) &&
  rect.width > 0 &&
  rect.height > 0 &&
  rect.right > rect.left &&
  rect.bottom > rect.top;

export function resolveComposerPlacement({
  anchorRect,
  popoverSize,
  viewport,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  avoid,
}: ResolveComposerPlacementArgs): ComposerPlacementResult {
  const viewportWidth = finiteNonnegative(viewport.width);
  const viewportHeight = finiteNonnegative(viewport.height);
  const safeGap = finiteNumber(gap, DEFAULT_GAP);
  const safeMargin = finiteNonnegative(margin, DEFAULT_MARGIN);
  const horizontalMargin = Math.min(safeMargin, viewportWidth / 2);
  const anchorLeft = finiteNumber(anchorRect.left);
  const anchorWidth = finiteNonnegative(anchorRect.width);
  const anchorBottom = finiteNumber(anchorRect.bottom);
  const anchorCenterX = saturatingAdd(anchorLeft, anchorWidth / 2);
  const top = saturatingAdd(anchorBottom, safeGap);
  const bottomLimit = Math.max(0, viewportHeight - safeMargin);
  const effectiveWidth = clamp(
    finiteNonnegative(popoverSize.width),
    0,
    viewportWidth - horizontalMargin * 2,
  );
  const minLeft = horizontalMargin;
  const maxLeft = viewportWidth - horizontalMargin - effectiveWidth;
  const clampLeft = (candidate: number) => clamp(candidate, minLeft, maxLeft);
  const centeredLeft = clampLeft(anchorCenterX - effectiveWidth / 2);
  const viewportAvailable = clamp(
    bottomLimit - top,
    0,
    COMFORTABLE_MAX_HEIGHT,
  );

  const avoidRects = (avoid ?? []).filter(hasFinitePositiveGeometry);
  const relevantBlockers = avoidRects
    .filter((rect) => rect.bottom > top && rect.top < bottomLimit);

  const candidates = [centeredLeft];
  if (relevantBlockers.length > 0) {
    candidates.push(
      clampLeft(Math.min(...relevantBlockers.map((rect) => rect.left)) - effectiveWidth),
      clampLeft(Math.max(...relevantBlockers.map((rect) => rect.right))),
    );
  }
  const uniqueCandidates = candidates.filter(
    (candidate, index) => candidates.indexOf(candidate) === index,
  );

  let bestLeft = centeredLeft;
  let bestHeight = -1;
  for (const candidateLeft of uniqueCandidates) {
    const blockers = relevantBlockers.filter(
      (rect) => rect.right > candidateLeft && rect.left < candidateLeft + effectiveWidth,
    );
    if (blockers.length === 0) {
      bestLeft = candidateLeft;
      bestHeight = viewportAvailable;
      break;
    }

    const nearestBlockerTop = Math.min(...blockers.map((rect) => rect.top));
    const usableHeight = clamp(
      Math.min(bottomLimit, nearestBlockerTop) - top,
      0,
      COMFORTABLE_MAX_HEIGHT,
    );
    if (usableHeight > bestHeight) {
      bestLeft = candidateLeft;
      bestHeight = usableHeight;
    }
  }

  const caretInset = Math.min(CARET_INSET, effectiveWidth / 2);
  const pointerLeft = clamp(
    anchorCenterX - bestLeft,
    caretInset,
    effectiveWidth - caretInset,
  );

  return {
    top,
    left: bestLeft,
    placement: 'bottom',
    maxHeight: Math.max(0, bestHeight),
    pointerLeft,
  };
}
