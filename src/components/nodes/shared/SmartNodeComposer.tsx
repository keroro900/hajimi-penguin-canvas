import { useEffect, useMemo, useState, type CSSProperties, type MouseEventHandler, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type SmartNodeComposerProps = {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  portal?: boolean;
  anchorRef?: RefObject<HTMLElement> | RefObject<HTMLElement | null>;
};

const computePortalPosition = (anchor: HTMLElement | null) => {
  if (typeof window === 'undefined' || !anchor) return null;
  const rect = anchor.getBoundingClientRect();
  return {
    top: Math.min(window.innerHeight - 12, Math.max(12, rect.bottom + 8)),
    left: Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2)),
  };
};

export default function SmartNodeComposer({
  className = '',
  style,
  children,
  onMouseDown,
  portal = false,
  anchorRef,
}: SmartNodeComposerProps) {
  const [position, setPosition] = useState(() => computePortalPosition(anchorRef?.current ?? null));
  const shouldPortal = portal && typeof document !== 'undefined';
  const mergedStyle = useMemo<CSSProperties>(() => {
    if (!shouldPortal) return style ?? {};
    return {
      ...style,
      '--t8-smart-composer-top': `${position?.top ?? 0}px`,
      '--t8-smart-composer-left': `${position?.left ?? 0}px`,
    } as CSSProperties;
  }, [position?.left, position?.top, shouldPortal, style]);

  useEffect(() => {
    if (!shouldPortal) return;
    const update = () => setPosition(computePortalPosition(anchorRef?.current ?? null));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, shouldPortal]);

  const node = (
    <div
      className={`nodrag nopan t8-panel t8-smart-node-composer ${shouldPortal ? 't8-smart-node-composer--portal' : ''} ${className}`.trim()}
      style={mergedStyle}
      onMouseDown={onMouseDown}
      data-canvas-floating-ui={shouldPortal ? 'smart-node-composer' : undefined}
    >
      {children}
    </div>
  );

  if (shouldPortal) {
    return createPortal(node, document.body);
  }

  return node;
}
