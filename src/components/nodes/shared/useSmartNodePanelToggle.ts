import { useCallback, useRef } from 'react';

type TogglePointer = { x: number; y: number; moved: boolean };

type UseSmartNodePanelToggleOptions = {
  open: boolean;
  dragging: boolean;
  onToggle: (nextOpen: boolean) => void;
  onDragChange?: (nextDragging: boolean) => void;
  onDragClose?: () => void;
  ignoreSelector?: string;
  threshold?: number;
  disabled?: boolean;
};

const DEFAULT_IGNORE_SELECTOR = '.nodrag, .react-flow__resize-control, input, textarea, select, button, [contenteditable="true"]';

export function useSmartNodePanelToggle({
  open,
  dragging,
  onToggle,
  onDragChange,
  onDragClose,
  ignoreSelector = DEFAULT_IGNORE_SELECTOR,
  threshold = 5,
  disabled = false,
}: UseSmartNodePanelToggleOptions) {
  const pointerRef = useRef<TogglePointer | null>(null);
  const suppressClickRef = useRef(false);
  const handledClickRef = useRef(false);

  const isIgnoredTarget = useCallback(
    (target: EventTarget | null) =>
      target instanceof HTMLElement && !!target.closest(ignoreSelector),
    [ignoreSelector],
  );

  const clearPointer = useCallback(() => {
    pointerRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || isIgnoredTarget(event.target)) return;
      pointerRef.current = { x: event.clientX, y: event.clientY, moved: false };
      suppressClickRef.current = false;
      onDragChange?.(false);
    },
    [disabled, isIgnoredTarget, onDragChange],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.moved || disabled) return;
      const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > threshold;
      if (!moved) return;

      pointerRef.current = { ...pointer, moved: true };
      suppressClickRef.current = true;
      onDragChange?.(true);
      if (open) onDragClose?.();
    },
    [disabled, onDragChange, onDragClose, open, threshold],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || disabled) return;

      const moved = pointer.moved || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > threshold;
      pointerRef.current = null;
      onDragChange?.(false);

      if (moved) {
        suppressClickRef.current = true;
        return;
      }

      if (dragging || isIgnoredTarget(event.target)) return;
      handledClickRef.current = true;
      suppressClickRef.current = false;
      onToggle(!open);
    },
    [disabled, dragging, isIgnoredTarget, onDragChange, onToggle, open, threshold],
  );

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;

      if (handledClickRef.current) {
        handledClickRef.current = false;
        return;
      }

      if (dragging || suppressClickRef.current || isIgnoredTarget(event.target)) {
        suppressClickRef.current = false;
        return;
      }

      onToggle(!open);
    },
    [disabled, dragging, isIgnoredTarget, onToggle, open],
  );

  const onPointerCancel = useCallback(() => {
    clearPointer();
    suppressClickRef.current = true;
    onDragChange?.(false);
  }, [clearPointer, onDragChange]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    clearPointer,
    suppressClickRef,
    handledClickRef,
    isIgnoredTarget,
  };
}
