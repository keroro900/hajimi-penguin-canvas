import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { createFrameScheduler } from '../../../utils/frameScheduler';
import { resolveComposerPlacement, type ComposerAnchorRect, type ComposerPlacement } from './composerPlacement';

type SmartNodeComposerProps = {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  portal?: boolean;
  anchorRef?: RefObject<HTMLElement> | RefObject<HTMLElement | null>;
  /** When provided the composer acts as a non-modal dialog: it gains
   * role="dialog", a close control, Escape/outside dismissal, and focus
   * management. When omitted the composer keeps its legacy passive behavior. */
  onRequestClose?: () => void;
  ariaLabel?: string;
  closeLabel?: string;
  /** Control that receives initial focus when the dialog opens. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Focus target used when the anchor no longer exists. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  hideCloseControl?: boolean;
};

type MeasuredPlacement = {
  top: number;
  left: number;
  maxHeight: number;
  pointerLeft: number;
  placement: ComposerPlacement;
  /** Vertical position of the pointer caret (fixed-positioned pseudo-element). */
  caretTop: number;
};

const INITIAL_PLACEMENT_SETTLE_FRAMES = 3;

const placementsEqual = (a: MeasuredPlacement | null, b: MeasuredPlacement | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.maxHeight === b.maxHeight &&
    a.pointerLeft === b.pointerLeft &&
    a.placement === b.placement &&
    a.caretTop === b.caretTop
  );
};

export default function SmartNodeComposer({
  className = '',
  style,
  children,
  onPointerDown,
  onPointerUp,
  onMouseDown,
  onClick,
  portal = false,
  anchorRef,
  onRequestClose,
  ariaLabel,
  closeLabel = '关闭',
  initialFocusRef,
  fallbackFocusRef,
  hideCloseControl = false,
}: SmartNodeComposerProps) {
  const shouldPortal = portal && typeof document !== 'undefined';
  // Dialog semantics only activate when the consumer asks for them; legacy
  // consumers (no onRequestClose) keep their exact previous behavior.
  const dialogMode = Boolean(onRequestClose);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<MeasuredPlacement | null>(null);
  const [placementReady, setPlacementReady] = useState(false);
  const [anchorMissing, setAnchorMissing] = useState(false);
  const anchorMissingRef = useRef(false);
  const pointerInteractionRef = useRef(false);

  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  const fallbackFocusRefRef = useRef(fallbackFocusRef);
  fallbackFocusRefRef.current = fallbackFocusRef;
  const initialFocusRefRef = useRef(initialFocusRef);
  initialFocusRefRef.current = initialFocusRef;
  const anchorRefRef = useRef(anchorRef);
  anchorRefRef.current = anchorRef;

  const restoreFocusAfterClose = useCallback(() => {
    const anchor = anchorRefRef.current?.current ?? null;
    if (anchor?.isConnected && typeof anchor.focus === 'function') {
      anchor.focus({ preventScroll: true });
      return;
    }
    const fallback = fallbackFocusRefRef.current?.current ?? null;
    const focusRoot = document.querySelector<HTMLElement>('[data-canvas-focus-root]');
    const target = fallback?.isConnected ? fallback : focusRoot;
    target?.focus?.({ preventScroll: true });
  }, []);

  /** Measure anchor + popover and resolve the anchored placement. */
  const measure = useCallback(() => {
    if (typeof window === 'undefined') return;
    const anchor = anchorRefRef.current?.current ?? null;
    const popover = popoverRef.current;
    const anchorRect = anchor?.getBoundingClientRect();
    const anchorGone = !anchor || !anchorRect || (anchorRect.width === 0 && anchorRect.height === 0);
    if (anchorGone) {
      if (!anchorMissingRef.current) {
        anchorMissingRef.current = true;
        setAnchorMissing(true);
        if (dialogMode) {
          // Node was deleted while open: close cleanly and return focus to
          // the canvas shell instead of leaving an off-screen composer.
          onRequestCloseRef.current?.();
          restoreFocusAfterClose();
        }
      }
      return;
    }
    anchorMissingRef.current = false;
    setAnchorMissing(false);
    if (!popover) return;
    const popoverRect = popover.getBoundingClientRect();
    const naturalHeight = Math.max(popoverRect.height, popover.scrollHeight);
    // Floating canvas chrome (toolbar / control rail / history panel) is
    // treated as an obstacle so the composer never opens underneath it.
    const avoid: ComposerAnchorRect[] = [];
    document
      .querySelectorAll('.t8-canvas-toolbar, .t8-control-rail, .t8-generation-history-panel')
      .forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          avoid.push({
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          });
        }
      });
    const next = resolveComposerPlacement({
      anchorRect: {
        top: anchorRect.top,
        left: anchorRect.left,
        right: anchorRect.right,
        bottom: anchorRect.bottom,
        width: anchorRect.width,
        height: anchorRect.height,
      },
      popoverSize: { width: popoverRect.width, height: naturalHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      avoid,
    });
    setMeasured((prev) => {
      const caretTop = next.top - 5;
      const withCaret: MeasuredPlacement = { ...next, caretTop };
      return placementsEqual(prev, withCaret) ? prev : withCaret;
    });
  }, [dialogMode, restoreFocusAfterClose]);

  // Keep the first few layout passes hidden. Complex property forms populate
  // over several renders; presenting every intermediate measurement makes the
  // panel visibly jump between placements before it settles.
  useLayoutEffect(() => {
    if (!shouldPortal) return;
    setPlacementReady(false);
    let startupFrame = 0;
    let frame = 0;
    const settle = () => {
      measure();
      frame += 1;
      if (frame >= INITIAL_PLACEMENT_SETTLE_FRAMES) {
        setPlacementReady(true);
        return;
      }
      startupFrame = window.requestAnimationFrame(settle);
    };
    startupFrame = window.requestAnimationFrame(settle);
    return () => window.cancelAnimationFrame(startupFrame);
  }, [shouldPortal, measure]);

  useEffect(() => {
    if (!shouldPortal) return;
    pointerInteractionRef.current = false;
    const scheduler = createFrameScheduler(
      window.requestAnimationFrame.bind(window),
      window.cancelAnimationFrame.bind(window),
      measure,
    );
    const schedulePlacement = () => scheduler.schedule();
    const popover = popoverRef.current;
    const initialAnchor = anchorRefRef.current?.current ?? null;
    const reactFlowRoot = initialAnchor ? initialAnchor.closest('.react-flow') : null;
    let owningFlow: Element | null = reactFlowRoot;
    let owningNode: Element | null = null;
    const isOwnedPointerTarget = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return Boolean(
        (owningFlow && owningFlow.contains(target)) ||
        (owningNode && owningNode.contains(target)),
      );
    };
    const handlePlacementPointerDown = (event: PointerEvent) => {
      pointerInteractionRef.current = isOwnedPointerTarget(event.target);
      if (pointerInteractionRef.current) schedulePlacement();
    };
    const handlePointerMove = () => {
      if (pointerInteractionRef.current) schedulePlacement();
    };
    const handlePointerEnd = () => {
      if (pointerInteractionRef.current) schedulePlacement();
      pointerInteractionRef.current = false;
    };

    window.addEventListener('resize', schedulePlacement);
    window.addEventListener('scroll', schedulePlacement, { capture: true, passive: true });
    window.addEventListener('wheel', schedulePlacement, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePlacementPointerDown, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);

    const resizeObserver = new ResizeObserver(schedulePlacement);
    if (popover) resizeObserver.observe(popover);

    const mutationObserver = new MutationObserver(schedulePlacement);
    const mutationOptions: MutationObserverInit = {
      attributes: true,
      attributeFilter: ['style', 'class'],
    };
    const readPlacementTargets = () => {
      const latestAnchor = anchorRefRef.current?.current ?? null;
      const latestFlow = latestAnchor ? latestAnchor.closest('.react-flow') : reactFlowRoot;
      const latestNode = latestAnchor ? latestAnchor.closest('.react-flow__node') : null;
      const viewport = latestAnchor
        ? latestAnchor.closest('.react-flow')?.querySelector('.react-flow__viewport') ?? null
        : reactFlowRoot?.querySelector('.react-flow__viewport') ?? null;
      return {
        anchor: latestAnchor,
        flow: latestFlow,
        node: latestNode,
        viewport,
        anchorConnected: Boolean(latestAnchor?.isConnected),
      };
    };

    let observedAnchor: HTMLElement | null = null;
    let observedNode: Element | null = null;
    let observedViewport: Element | null = null;
    let observedAnchorConnected = false;
    const rebindPlacementTargets = (targets: ReturnType<typeof readPlacementTargets>) => {
      const { anchor: latestAnchor, flow: latestFlow, node: latestNode, viewport } = targets;
      owningFlow = latestFlow;
      owningNode = latestNode;

      if (observedAnchor && observedAnchor !== latestAnchor) {
        resizeObserver.unobserve(observedAnchor);
      }
      if (latestAnchor && observedAnchor !== latestAnchor) {
        resizeObserver.observe(latestAnchor);
      }
      observedAnchor = latestAnchor;

      mutationObserver.disconnect();
      if (viewport) mutationObserver.observe(viewport, mutationOptions);
      if (owningNode) mutationObserver.observe(owningNode, mutationOptions);
      observedNode = latestNode;
      observedViewport = viewport;
      observedAnchorConnected = targets.anchorConnected;
    };
    rebindPlacementTargets(readPlacementTargets());

    const rootObserver = new MutationObserver(() => {
      const latestTargets = readPlacementTargets();
      const identitiesUnchanged =
        latestTargets.anchor === observedAnchor &&
        latestTargets.node === observedNode &&
        latestTargets.viewport === observedViewport;
      const connectivityChanged = latestTargets.anchorConnected !== observedAnchorConnected;
      if (identitiesUnchanged && !connectivityChanged) return;
      rebindPlacementTargets(latestTargets);
      schedulePlacement();
    });
    if (reactFlowRoot) {
      rootObserver.observe(reactFlowRoot, { childList: true, subtree: true });
    }

    return () => {
      pointerInteractionRef.current = false;
      scheduler.dispose();
      window.removeEventListener('resize', schedulePlacement);
      window.removeEventListener('scroll', schedulePlacement, true);
      window.removeEventListener('wheel', schedulePlacement);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePlacementPointerDown, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      rootObserver.disconnect();
    };
  }, [shouldPortal, measure]);

  // Outside dismissal (dialog mode only): a capture-phase listener closes the
  // composer when the pointer lands outside BOTH the composer and its anchor.
  // Handles and media tools inside the same anchor therefore never close it.
  useEffect(() => {
    if (!dialogMode) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // Editors render mention menus and other interactive children through
      // document.body portals. Treat those canvas-owned layers as part of the
      // composer so their click can finish before any outside dismissal.
      if (target instanceof Element && target.closest('[data-canvas-floating-ui]')) return;
      const popover = popoverRef.current;
      if (popover && popover.contains(target)) return;
      const anchor = anchorRefRef.current?.current ?? null;
      if (anchor && anchor.contains(target)) return;
      onRequestCloseRef.current?.();
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [dialogMode]);

  // Escape closes only this composer and returns focus to its anchor, the
  // explicit fallback, or the canvas focus root as a last resort.
  useEffect(() => {
    if (!dialogMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const popover = popoverRef.current;
      if (!popover) return;
      const targetInside = event.target instanceof Node && popover.contains(event.target);
      const activeElement = document.activeElement;
      const activeInside = activeElement instanceof Node && popover.contains(activeElement);
      if (!targetInside && !activeInside) return;
      const higherModal = Array.from(
        document.querySelectorAll<HTMLElement>('[aria-modal="true"]'),
      ).find((modal) => !popover.contains(modal));
      if (higherModal) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      onRequestCloseRef.current?.();
      restoreFocusAfterClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [dialogMode, restoreFocusAfterClose]);

  // Initial focus: the prompt control when provided, otherwise the first
  // interactive control inside the popover.
  const focusReady = !shouldPortal || placementReady;
  useEffect(() => {
    if (!dialogMode || !focusReady) return;
    const popover = popoverRef.current;
    if (!popover) return;
    let target = initialFocusRefRef.current?.current ?? null;
    if (!target && initialFocusRefRef.current) {
      target = popover.querySelector<HTMLElement>('textarea, input');
    }
    if (!target) {
      target = popover.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      );
    }
    target?.focus({ preventScroll: true });
  }, [dialogMode, focusReady]);

  const mergedStyle = useMemo<CSSProperties>(() => {
    if (!shouldPortal) return style ?? {};
    const hasUsablePlacement = Boolean(measured && placementReady && measured.maxHeight >= 48);
    return {
      ...style,
      top: measured ? `${measured.top}px` : undefined,
      left: measured ? `${measured.left}px` : undefined,
      maxHeight: measured ? `${measured.maxHeight}px` : undefined,
      visibility: hasUsablePlacement ? undefined : 'hidden',
      pointerEvents: measured && measured.maxHeight < 48 ? 'none' : undefined,
      '--t8-smart-composer-top': `${measured?.top ?? 0}px`,
      '--t8-smart-composer-left': `${measured?.left ?? 0}px`,
      '--t8-smart-composer-pointer-left': `${measured?.pointerLeft ?? 24}px`,
      '--t8-smart-composer-caret-top': `${measured?.caretTop ?? -100}px`,
    } as CSSProperties;
  }, [measured, placementReady, shouldPortal, style]);

  if (shouldPortal && anchorMissing) {
    // Missing anchor: never render a visible off-screen composer.
    return null;
  }

  const dialogProps = dialogMode
    ? { role: 'dialog' as const, 'aria-modal': 'false' as const, 'aria-label': ariaLabel }
    : {};

  const node = (
    <div
      ref={popoverRef}
      className={`nodrag nopan t8-panel t8-smart-node-composer ${shouldPortal ? 't8-smart-node-composer--portal' : ''} ${className}`.trim()}
      style={mergedStyle}
      data-placement={shouldPortal ? measured?.placement ?? 'bottom' : undefined}
      {...dialogProps}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        onPointerUp?.(event);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      data-canvas-floating-ui={shouldPortal ? 'smart-node-composer' : undefined}
    >
      {dialogMode && !hideCloseControl ? (
        <button
          type="button"
          className="t8-smart-node-composer__close"
          aria-label={closeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onRequestCloseRef.current?.();
            restoreFocusAfterClose();
          }}
        >
          ×
        </button>
      ) : null}
      {children}
    </div>
  );

  if (shouldPortal) {
    return createPortal(node, document.body);
  }

  return node;
}
