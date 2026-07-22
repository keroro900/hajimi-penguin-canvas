import { applyThemeTemplate } from '../theme/applyTheme';
import { BUILT_IN_THEME_TEMPLATES } from '../theme/defaultTemplates';
import type { ThemeMode } from '../theme/types';

export type FocusAuditControlId = 'canvas-action' | 'composer-action';

export type FocusVisibleAuditRow = {
  templateId: string;
  mode: ThemeMode;
  controlId: FocusAuditControlId;
  focusObserved: boolean;
  focusVisibleObserved: boolean;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  boxShadow: string;
  indicatorVisible: boolean;
  clippingAncestors: string[];
  indicatorClipped: boolean;
};

export type FocusVisibleAuditOptions = { failAfterRows?: number };

type FocusDomSnapshot = {
  rootAttributes: Map<string, string>;
  activeElement: HTMLElement | null;
};

function snapshotFocusDom(): FocusDomSnapshot {
  const root = document.documentElement;
  return {
    rootAttributes: new Map(root.getAttributeNames().map((name) => [name, root.getAttribute(name) ?? ''])),
    activeElement: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  };
}

function restoreFocusDom(snapshot: FocusDomSnapshot, control: HTMLElement): void {
  const root = document.documentElement;
  for (const name of root.getAttributeNames()) root.removeAttribute(name);
  for (const [name, value] of snapshot.rootAttributes) root.setAttribute(name, value);
  if (snapshot.activeElement === document.body || !snapshot.activeElement?.isConnected) {
    control.blur();
  } else {
    snapshot.activeElement.focus({ preventScroll: true });
  }
}

function colorIsVisible(color: string): boolean {
  const normalized = color.replace(/\s+/g, '').toLowerCase();
  return normalized !== 'transparent'
    && normalized !== 'rgba(0,0,0,0)'
    && !/rgba\([^)]*,0(?:\.0+)?\)$/.test(normalized);
}

function boxShadowIsVisible(boxShadow: string): boolean {
  return boxShadow !== 'none' && colorIsVisible(boxShadow);
}

function elementLabel(element: HTMLElement): string {
  return element.getAttribute('data-focus-audit')
    ?? element.getAttribute('aria-label')
    ?? element.className
    ?? element.tagName;
}

function indicatorClipping(control: HTMLElement, outwardExtent: number): string[] {
  const rect = control.getBoundingClientRect();
  const indicator = {
    left: rect.left - outwardExtent,
    right: rect.right + outwardExtent,
    top: rect.top - outwardExtent,
    bottom: rect.bottom + outwardExtent,
  };
  const clippingAncestors: string[] = [];
  for (let ancestor = control.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (!/(hidden|clip|auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
    const bounds = ancestor.getBoundingClientRect();
    if (indicator.left < bounds.left || indicator.right > bounds.right || indicator.top < bounds.top || indicator.bottom > bounds.bottom) {
      clippingAncestors.push(elementLabel(ancestor));
    }
  }
  return clippingAncestors;
}

function measureFocus(control: HTMLElement, templateId: string, mode: ThemeMode, controlId: FocusAuditControlId): FocusVisibleAuditRow {
  const style = getComputedStyle(control);
  const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
  const outlineOffset = Number.parseFloat(style.outlineOffset) || 0;
  const outlineVisible = style.outlineStyle !== 'none' && outlineWidth > 0 && colorIsVisible(style.outlineColor);
  const shadowVisible = boxShadowIsVisible(style.boxShadow);
  const outwardExtent = outlineVisible ? Math.max(0, outlineWidth + outlineOffset) : 0;
  const clippingAncestors = indicatorClipping(control, outwardExtent);
  return {
    templateId,
    mode,
    controlId,
    focusObserved: control.matches(':focus'),
    focusVisibleObserved: control.matches(':focus-visible'),
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineColor: style.outlineColor,
    outlineOffset: style.outlineOffset,
    boxShadow: style.boxShadow,
    indicatorVisible: outlineVisible || shadowVisible,
    clippingAncestors,
    indicatorClipped: clippingAncestors.length > 0,
  };
}

export async function runFocusVisibleAudit(
  controlId: FocusAuditControlId,
  options: FocusVisibleAuditOptions = {},
): Promise<FocusVisibleAuditRow[]> {
  const control = document.querySelector<HTMLElement>(`[data-focus-audit="${controlId}"]`);
  if (!control) throw new Error(`Unknown focus audit control: ${controlId}`);
  const snapshot = snapshotFocusDom();
  const rows: FocusVisibleAuditRow[] = [];

  try {
    control.focus({ preventScroll: true });
    for (const template of BUILT_IN_THEME_TEMPLATES) {
      for (const mode of ['light', 'dark'] as ThemeMode[]) {
        applyThemeTemplate(template, mode);
        document.documentElement.getBoundingClientRect();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        rows.push(measureFocus(control, template.id, mode, controlId));
        if (options.failAfterRows && rows.length >= options.failAfterRows) {
          throw new Error('Injected focus-visible audit failure');
        }
      }
    }
    return rows;
  } finally {
    restoreFocusDom(snapshot, control);
  }
}

declare global {
  interface Window {
    __t8RunFocusVisibleAudit?: (
      controlId: FocusAuditControlId,
      options?: FocusVisibleAuditOptions,
    ) => Promise<FocusVisibleAuditRow[]>;
  }
}

export function installFocusVisibleAudit(): () => void {
  window.__t8RunFocusVisibleAudit = runFocusVisibleAudit;
  return () => {
    delete window.__t8RunFocusVisibleAudit;
  };
}
