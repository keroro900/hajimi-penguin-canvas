import { useEffect } from 'react';

type MaybeRef = { current: HTMLElement | null } | null | undefined;

type UseOutsideCloseOptions = {
  enabled: boolean;
  refs: MaybeRef | MaybeRef[];
  onOutside: () => void;
  ignoreSelector?: string;
};

const DEFAULT_IGNORE_SELECTOR = '[data-canvas-floating-ui], .nodrag, input, textarea, select, button, [contenteditable="true"]';

export function useOutsideClose({
  enabled,
  refs,
  onOutside,
  ignoreSelector = DEFAULT_IGNORE_SELECTOR,
}: UseOutsideCloseOptions) {
  useEffect(() => {
    if (!enabled) return;

    const refList = Array.isArray(refs) ? refs : [refs];
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof HTMLElement && target.closest(ignoreSelector)) return;

      for (const ref of refList) {
        const el = ref?.current;
        if (el && el.contains(target)) return;
      }

      onOutside();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [enabled, ignoreSelector, onOutside, refs]);
}
