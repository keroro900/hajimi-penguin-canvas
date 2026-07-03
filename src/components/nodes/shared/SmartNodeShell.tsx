import type { CSSProperties, HTMLAttributes, ReactNode, RefObject } from 'react';

type SmartNodeShellProps = {
  rootRef: RefObject<HTMLDivElement | null>;
  className?: string;
  style?: CSSProperties;
  rootProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
  composer?: ReactNode;
};

export default function SmartNodeShell({
  rootRef,
  className = '',
  style,
  rootProps,
  children,
  composer,
}: SmartNodeShellProps) {
  return (
    <div
      ref={rootRef}
      className={`t8-smart-node-shell relative overflow-visible ${className}`.trim()}
      style={style}
      {...rootProps}
    >
      {children}
      {composer}
    </div>
  );
}
