import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import {
  acquireCanvasModalIsolation,
  createModalController,
  isTopCanvasModalIsolation,
} from '../utils/modalIsolation';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface CanvasModalPortalProps {
  label: string;
  onClose: () => void;
  onEscapeBeforeClose?: () => boolean;
  initialFocusRef: RefObject<HTMLElement | null>;
  backdropClassName?: string;
  dialogClassName?: string;
  children: ReactNode;
}

export default function CanvasModalPortal({
  label,
  onClose,
  onEscapeBeforeClose,
  initialFocusRef,
  backdropClassName = '',
  dialogClassName = '',
  children,
}: CanvasModalPortalProps) {
  const portalRootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null,
  );
  const onCloseRef = useRef(onClose);
  const onEscapeBeforeCloseRef = useRef(onEscapeBeforeClose);
  onCloseRef.current = onClose;
  onEscapeBeforeCloseRef.current = onEscapeBeforeClose;
  const removeKeyListenerRef = useRef<() => void>(() => {});

  const controller = useMemo(() => createModalController<HTMLElement>({
    getFocusableElements: () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true'),
    getActiveElement: () => document.activeElement as HTMLElement | null,
    initialFocus: {
      focus: () => initialFocusRef.current?.focus(),
    },
    opener: openerRef.current,
    isolate: () => {
      const portalRoot = portalRootRef.current;
      if (!portalRoot) return () => {};
      return acquireCanvasModalIsolation(Array.from(document.body.children), portalRoot);
    },
    onEscapeBeforeClose: () => onEscapeBeforeCloseRef.current?.() ?? false,
    onClose: () => {
      removeKeyListenerRef.current();
      onCloseRef.current();
    },
  }), [initialFocusRef]);

  useLayoutEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const portalRoot = portalRootRef.current;
      if (!portalRoot || !isTopCanvasModalIsolation(portalRoot)) return;
      controller.handleKey(event);
    };
    let listening = true;
    const removeKeyListener = () => {
      if (!listening) return;
      listening = false;
      document.removeEventListener('keydown', handleKey, true);
    };
    removeKeyListenerRef.current = removeKeyListener;
    document.addEventListener('keydown', handleKey, true);
    controller.activate();
    return () => {
      removeKeyListener();
      controller.destroy();
    };
  }, [controller]);

  return createPortal(
    <div
      ref={portalRootRef}
      className={`t8-canvas-modal-backdrop ${backdropClassName}`.trim()}
      onClick={controller.handleBackdrop}
    >
      <div
        ref={dialogRef}
        className={`t8-canvas-modal-dialog ${dialogClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
