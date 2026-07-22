import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type SmartNodeModalPageProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  size?: 'default' | 'workbench';
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

type SmartNodeFloatingPanelProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  width?: number;
  nested?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

function portal(node: ReactNode) {
  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}

export function SmartNodeModalPage({
  open,
  title,
  subtitle,
  icon,
  size = 'default',
  actions,
  children,
  onClose,
}: SmartNodeModalPageProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  const width = size === 'workbench' ? 'min(1480px, calc(100vw - 32px))' : 'min(960px, calc(100vw - 32px))';
  const height = size === 'workbench' ? 'min(920px, calc(100vh - 32px))' : 'auto';

  return portal(
    <div className="nodrag nopan fixed inset-0 z-[10020] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" data-canvas-floating-ui="smart-node-modal">
      <section
        role="dialog"
        aria-modal="true"
        className="t8-panel flex min-h-0 flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ width, height, maxHeight: 'calc(100vh - 32px)', borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2" style={{ borderColor: 'var(--t8-border)' }}>
          <div className="flex min-w-0 items-center gap-2">
            {icon ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-accent)' }}>{icon}</span> : null}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold" style={{ color: 'var(--t8-text-main)' }}>{title}</div>
              {subtitle ? <div className="truncate text-[11px]" style={{ color: 'var(--t8-text-dim)' }}>{subtitle}</div> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button type="button" className="t8-btn h-8 w-8 justify-center px-0" onClick={onClose} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </div>,
  );
}

export function SmartNodeFloatingPanel({
  open,
  title,
  subtitle,
  width = 420,
  nested = false,
  actions,
  children,
  onClose,
}: SmartNodeFloatingPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return portal(
    <div
      className={`nodrag nopan fixed inset-0 flex items-center justify-center p-4 ${nested ? 'bg-black/25' : 'bg-black/40 backdrop-blur-sm'}`}
      style={{ zIndex: nested ? 10030 : 10020 }}
      data-canvas-floating-ui="smart-node-floating-panel"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="t8-panel flex max-h-[calc(100vh-32px)] min-h-0 flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ width: `min(${width}px, calc(100vw - 32px))`, borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2" style={{ borderColor: 'var(--t8-border)' }}>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold" style={{ color: 'var(--t8-text-main)' }}>{title}</div>
            {subtitle ? <div className="truncate text-[11px]" style={{ color: 'var(--t8-text-dim)' }}>{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button type="button" className="t8-btn h-8 w-8 justify-center px-0" onClick={onClose} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        </header>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </section>
    </div>,
  );
}
