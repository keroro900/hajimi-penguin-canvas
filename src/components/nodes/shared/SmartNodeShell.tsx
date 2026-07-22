import type { CSSProperties, HTMLAttributes, KeyboardEventHandler, ReactNode, RefObject } from 'react';

type SmartNodeRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'tabIndex'>
  & Partial<Record<`data-${string}`, string | number | boolean | undefined>>;

type SmartNodeShellProps = {
  rootRef: RefObject<HTMLDivElement | null>;
  className?: string;
  'data-canvas-node-root'?: boolean;
  style?: CSSProperties;
  rootProps?: SmartNodeRootProps;
  children: ReactNode;
  composer?: ReactNode;
  /** Extra data-* attributes merged onto the shell root. Boolean true renders
   * data-<key>="true"; false/undefined entries are skipped. */
  stateAttrs?: Record<string, string | boolean | undefined>;
  /** Convenience state hook rendered as data-smart-state (e.g. empty, result,
   * running, failed, selected, ready). */
  smartState?: string;
  /** Accessible node label: renders role="group" + aria-label on the shell
   * root. The shell is a labelled group, not a button, because it contains
   * nested media/action buttons. */
  accessibleLabel?: string;
  /** Keyboard activation (Space) that applies ONLY when the shell root
   * itself owns focus; nested controls keep their native behavior. Providing
   * this also makes the shell root focusable (tabIndex 0). */
  onKeyboardActivate?: () => void;
};

export default function SmartNodeShell({
  rootRef,
  className = '',
  'data-canvas-node-root': canvasNodeRoot,
  style,
  rootProps,
  children,
  composer,
  stateAttrs,
  smartState,
  accessibleLabel,
  onKeyboardActivate,
}: SmartNodeShellProps) {
  const dataAttrs: Record<string, string> = {};
  if (smartState) dataAttrs['data-smart-state'] = smartState;
  if (stateAttrs) {
    for (const [key, value] of Object.entries(stateAttrs)) {
      if (value === undefined || value === false) continue;
      dataAttrs[`data-${key}`] = value === true ? 'true' : value;
    }
  }

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> | undefined = onKeyboardActivate
    ? (event) => {
        // Only activate when the shell itself is focused; keyboard events
        // originating from nested controls keep their native behavior.
        if (event.target !== event.currentTarget) return;
        if (event.key !== ' ') return;
        event.preventDefault();
        onKeyboardActivate();
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={`t8-smart-node-shell relative overflow-visible ${className}`.trim()}
      data-canvas-node-root={canvasNodeRoot}
      style={style}
      role={accessibleLabel ? 'group' : undefined}
      aria-label={accessibleLabel}
      tabIndex={onKeyboardActivate ? 0 : undefined}
      onKeyDown={handleKeyDown}
      {...dataAttrs}
      {...rootProps}
    >
      {children}
      {composer}
    </div>
  );
}
