import { applyThemeTemplate } from '../theme/applyTheme';
import { BUILT_IN_THEME_TEMPLATES } from '../theme/defaultTemplates';
import type { ThemeMode } from '../theme/types';

export type AuditPoint = { x: number; y: number };
export type AuditRect = { x: number; y: number; width: number; height: number };
export type BoundaryHit = { point: AuditPoint; owner: string | null };

export type HandleGeometryAuditRow = {
  templateId: string;
  mode: ThemeMode;
  nodeId: string;
  edgeId: string;
  handleId: string;
  variant: string;
  state: string;
  hoverObserved: boolean;
  expectedCenter: AuditPoint;
  actualCenter: AuditPoint;
  restCenter: AuditPoint;
  stateCenterDelta: number;
  stateLayoutDelta: number;
  innerEdgeError: number;
  hitTargetRect: AuditRect;
  boundaryHits: BoundaryHit[];
  svgOuterEdge: AuditPoint | null;
  svgEndpoint: AuditPoint | null;
  svgOuterEdgeDelta: number | null;
  svgCenterDistance: number | null;
  clipping: string[];
  hitStackOwner: string | null;
  ownerOverflow: string;
  innerClipOverflow: string | null;
  regeneratingDecorationBounded: boolean | null;
  ownerTopLeftRadius: string | null;
  ownerTopRightRadius: string | null;
  headerTopLeftRadius: string | null;
  headerTopRightRadius: string | null;
  headerCornersMatch: boolean | null;
};

export type HandleGeometryAuditOptions = { failAfterRows?: number };

type AuditBaseline = {
  handleRect: AuditBox;
  ownerRect: AuditBox;
  restCenter: AuditPoint;
};

type AuditBox = { left: number; top: number; right: number; bottom: number; width: number; height: number };

type AuditDomSnapshot = {
  rootAttributes: Map<string, string>;
  handleClasses: Array<{ element: HTMLElement; className: string }>;
};

const point = (x: number, y: number): AuditPoint => ({ x, y });
const distance = (a: AuditPoint, b: AuditPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const rect = (value: DOMRect): AuditRect => ({ x: value.x, y: value.y, width: value.width, height: value.height });
const box = (value: DOMRect): AuditBox => ({ left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height });
const centerOf = (value: DOMRect): AuditPoint => point(value.left + value.width / 2, value.top + value.height / 2);

const AUDIT_STATE_CLASSES = [
  'valid', 'react-flow__handle-valid',
  'connecting', 'react-flow__handle-connecting',
  'connectingto', 'connectingfrom',
];

const STATES: Array<{ state: string; classes: string[] }> = [
  { state: 'rest', classes: [] },
  { state: 'valid', classes: ['valid', 'react-flow__handle-valid'] },
  { state: 'connecting', classes: ['connecting', 'react-flow__handle-connecting'] },
  { state: 'connectingto', classes: ['connectingto'] },
  { state: 'connectingfrom', classes: ['connectingfrom'] },
];

const restBaselines = new Map<string, AuditBaseline>();

function independentPathEndpoints(path: SVGPathElement): { first: AuditPoint; final: AuditPoint } | null {
  const numbers = (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 4) return null;
  const matrix = path.getScreenCTM();
  const toScreen = (x: number, y: number): AuditPoint => {
    if (!matrix) return point(x, y);
    const transformed = new DOMPoint(x, y).matrixTransform(matrix);
    return point(transformed.x, transformed.y);
  };
  return { first: toScreen(numbers[0], numbers[1]), final: toScreen(numbers.at(-2)!, numbers.at(-1)!) };
}

function clippingAncestors(handle: HTMLElement): string[] {
  const handleRect = handle.getBoundingClientRect();
  const result: string[] = [];
  for (let element = handle.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (!/(hidden|clip|auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
    const owner = element.getBoundingClientRect();
    if (handleRect.left < owner.left || handleRect.right > owner.right || handleRect.top < owner.top || handleRect.bottom > owner.bottom) {
      result.push(element.getAttribute('data-audit-handle-owner') || element.getAttribute('data-id') || element.className || element.tagName);
    }
  }
  return result;
}

function stackOwnerAt(target: HTMLElement, sample: AuditPoint): string | null {
  const hit = document.elementsFromPoint(sample.x, sample.y)[0] as HTMLElement | undefined;
  const owner = hit === target ? target : hit?.closest<HTMLElement>('[data-handle-audit="true"]');
  return owner?.dataset.handleId ?? null;
}

function computedHitTarget(handle: HTMLElement, actualCenter: AuditPoint): { hitTargetRect: AuditRect; boundaryHits: BoundaryHit[] } {
  const pseudo = getComputedStyle(handle, '::before');
  const width = Number.parseFloat(pseudo.width);
  const height = Number.parseFloat(pseudo.height);
  const hitTargetRect = { x: actualCenter.x - width / 2, y: actualCenter.y - height / 2, width, height };
  const inset = 0.5;
  const samples = [
    actualCenter,
    point(actualCenter.x - width / 2 + inset, actualCenter.y),
    point(actualCenter.x + width / 2 - inset, actualCenter.y),
    point(actualCenter.x, actualCenter.y - height / 2 + inset),
    point(actualCenter.x, actualCenter.y + height / 2 - inset),
  ];
  return { hitTargetRect, boundaryHits: samples.map((sample) => ({ point: sample, owner: stackOwnerAt(handle, sample) })) };
}

function maxRectDelta(a: AuditBox, b: AuditBox): number {
  return Math.max(
    Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom),
    Math.abs(a.width - b.width), Math.abs(a.height - b.height),
  );
}

function getAuditHandles(): HTMLElement[] {
  const handles = [...document.querySelectorAll<HTMLElement>('[data-handle-audit="true"]')];
  if (handles.length !== 5) throw new Error(`Handle audit fixture expected 5 ReactFlow handles, found ${handles.length}`);
  if (document.querySelectorAll('.react-flow__edge-path').length !== 3) throw new Error('Handle audit fixture expected 3 connected ReactFlow edge paths');
  return handles;
}

function snapshotAuditDom(handles: HTMLElement[]): AuditDomSnapshot {
  const root = document.documentElement;
  return {
    rootAttributes: new Map(root.getAttributeNames().map((name) => [name, root.getAttribute(name) ?? ''])),
    handleClasses: handles.map((element) => ({ element, className: element.getAttribute('class') ?? '' })),
  };
}

function restoreAuditDom(snapshot: AuditDomSnapshot): void {
  const root = document.documentElement;
  for (const name of root.getAttributeNames()) root.removeAttribute(name);
  for (const [name, value] of snapshot.rootAttributes) root.setAttribute(name, value);
  for (const { element, className } of snapshot.handleClasses) element.setAttribute('class', className);
}

function decorationIsBounded(owner: HTMLElement): boolean | null {
  if (!owner.classList.contains('t8-smart-node-card--regenerating')) return null;
  const ownerRadius = getComputedStyle(owner).borderTopLeftRadius;
  const pseudoIsBounded = (pseudo: '::before' | '::after') => {
    const style = getComputedStyle(owner, pseudo);
    const insetIsZero = [style.top, style.right, style.bottom, style.left]
      .every((value) => Math.abs(Number.parseFloat(value)) <= 0.01);
    return style.position === 'absolute'
      && insetIsZero
      && style.transform === 'none'
      && style.boxShadow === 'none'
      && style.borderTopLeftRadius === ownerRadius;
  };
  return pseudoIsBounded('::before') && pseudoIsBounded('::after');
}

const baselineKey = (templateId: string, mode: ThemeMode, handleId: string) => `${templateId}|${mode}|${handleId}`;

function measureRow(
  handle: HTMLElement,
  templateId: string,
  mode: ThemeMode,
  state: string,
  baseline: AuditBaseline,
): HandleGeometryAuditRow {
  const owner = handle.parentElement!;
  const node = handle.closest<HTMLElement>('.react-flow__node')!;
  const handleRect = handle.getBoundingClientRect();
  const ownerRect = owner.getBoundingClientRect();
  const ownerStyle = getComputedStyle(owner);
  const leftContact = ownerRect.left + Number.parseFloat(ownerStyle.borderLeftWidth || '0');
  const rightContact = ownerRect.right - Number.parseFloat(ownerStyle.borderRightWidth || '0');
  const actualCenter = centerOf(handleRect);
  const side = handle.dataset.side === 'left' ? 'left' : 'right';
  const expectedCenter = point(
    side === 'left' ? leftContact - handleRect.width / 2 : rightContact + handleRect.width / 2,
    actualCenter.y,
  );
  const innerEdgeError = side === 'left'
    ? Math.abs(handleRect.right - leftContact)
    : Math.abs(handleRect.left - rightContact);
  const edgeId = handle.dataset.edgeId ?? '';
  const edgePath = document.querySelector<SVGPathElement>(`.react-flow__edge[data-id="${CSS.escape(edgeId)}"] .react-flow__edge-path`);
  const endpoints = edgePath ? independentPathEndpoints(edgePath) : null;
  const svgEndpoint = endpoints ? (handle.dataset.edgeEnd === 'source' ? endpoints.first : endpoints.final) : null;
  const svgOuterEdge = svgEndpoint
    ? point(side === 'left' ? handleRect.left : handleRect.right, actualCenter.y)
    : null;
  const target = computedHitTarget(handle, actualCenter);
  const innerClip = owner.querySelector<HTMLElement>('.t8-smart-node-preview, [data-audit-inner-clip]');
  const header = owner.querySelector<HTMLElement>(':scope > .t8-smart-node-card__header');
  const headerStyle = header ? getComputedStyle(header) : null;
  return {
    templateId,
    mode,
    nodeId: node.dataset.id ?? '',
    edgeId,
    handleId: handle.dataset.handleId ?? '',
    variant: handle.dataset.variant ?? 'regular',
    state,
    hoverObserved: state === 'hover' && handle.matches(':hover'),
    expectedCenter,
    actualCenter,
    restCenter: baseline.restCenter,
    stateCenterDelta: distance(baseline.restCenter, actualCenter),
    stateLayoutDelta: Math.max(maxRectDelta(baseline.handleRect, box(handleRect)), maxRectDelta(baseline.ownerRect, box(ownerRect))),
    innerEdgeError,
    ...target,
    svgOuterEdge,
    svgEndpoint,
    svgOuterEdgeDelta: svgEndpoint && svgOuterEdge ? distance(svgEndpoint, svgOuterEdge) : null,
    svgCenterDistance: svgEndpoint ? distance(svgEndpoint, actualCenter) : null,
    clipping: clippingAncestors(handle),
    hitStackOwner: stackOwnerAt(handle, actualCenter),
    ownerOverflow: ownerStyle.overflow,
    innerClipOverflow: innerClip ? getComputedStyle(innerClip).overflow : null,
    regeneratingDecorationBounded: decorationIsBounded(owner),
    ownerTopLeftRadius: header ? ownerStyle.borderTopLeftRadius : null,
    ownerTopRightRadius: header ? ownerStyle.borderTopRightRadius : null,
    headerTopLeftRadius: headerStyle?.borderTopLeftRadius ?? null,
    headerTopRightRadius: headerStyle?.borderTopRightRadius ?? null,
    headerCornersMatch: headerStyle
      ? headerStyle.borderTopLeftRadius === ownerStyle.borderTopLeftRadius
        && headerStyle.borderTopRightRadius === ownerStyle.borderTopRightRadius
      : null,
  };
}

function pushAuditRow(rows: HandleGeometryAuditRow[], row: HandleGeometryAuditRow, options: HandleGeometryAuditOptions): void {
  rows.push(row);
  if (options.failAfterRows && rows.length >= options.failAfterRows) throw new Error('Injected handle geometry audit failure');
}

async function restoreAfterAudit(snapshot: AuditDomSnapshot): Promise<void> {
  restoreAuditDom(snapshot);
  await window.__t8RefreshHandleGeometry?.();
}

export async function runHandleGeometryAudit(options: HandleGeometryAuditOptions = {}): Promise<HandleGeometryAuditRow[]> {
  const rows: HandleGeometryAuditRow[] = [];
  const handles = getAuditHandles();
  const snapshot = snapshotAuditDom(handles);
  restBaselines.clear();

  try {
    for (const template of BUILT_IN_THEME_TEMPLATES) {
      for (const mode of ['light', 'dark'] as ThemeMode[]) {
        applyThemeTemplate(template, mode);
        document.documentElement.getBoundingClientRect();
        await window.__t8RefreshHandleGeometry?.();
        for (const handle of handles) {
          handle.classList.remove(...AUDIT_STATE_CLASSES);
          const handleRect = handle.getBoundingClientRect();
          const ownerRect = handle.parentElement!.getBoundingClientRect();
          const baseline = { handleRect: box(handleRect), ownerRect: box(ownerRect), restCenter: centerOf(handleRect) };
          restBaselines.set(baselineKey(template.id, mode, handle.dataset.handleId ?? ''), baseline);
          for (const { state, classes } of STATES) {
            handle.classList.remove(...AUDIT_STATE_CLASSES);
            handle.classList.add(...classes);
            pushAuditRow(rows, measureRow(handle, template.id, mode, state, baseline), options);
          }
          handle.classList.remove(...AUDIT_STATE_CLASSES);
        }
      }
    }
    return rows;
  } finally {
    await restoreAfterAudit(snapshot);
  }
}

export async function runHandleGeometryHoverAudit(
  handleId: string,
  options: HandleGeometryAuditOptions = {},
): Promise<HandleGeometryAuditRow[]> {
  const rows: HandleGeometryAuditRow[] = [];
  const handles = getAuditHandles();
  const handle = handles.find((candidate) => candidate.dataset.handleId === handleId);
  if (!handle || handle.dataset.variant === 'phantom') throw new Error(`Unknown interactive audit handle: ${handleId}`);
  const snapshot = snapshotAuditDom(handles);

  try {
    for (const template of BUILT_IN_THEME_TEMPLATES) {
      for (const mode of ['light', 'dark'] as ThemeMode[]) {
        applyThemeTemplate(template, mode);
        document.documentElement.getBoundingClientRect();
        await window.__t8RefreshHandleGeometry?.();
        handle.classList.remove(...AUDIT_STATE_CLASSES);
        if (!handle.matches(':hover')) throw new Error(`Real :hover is not forced for ${handleId}`);
        const baseline = restBaselines.get(baselineKey(template.id, mode, handleId));
        if (!baseline) throw new Error(`Missing rest baseline for ${template.id}/${mode}/${handleId}`);
        pushAuditRow(rows, measureRow(handle, template.id, mode, 'hover', baseline), options);
      }
    }
    return rows;
  } finally {
    await restoreAfterAudit(snapshot);
  }
}

declare global {
  interface Window {
    __t8RunHandleGeometryAudit?: (options?: HandleGeometryAuditOptions) => Promise<HandleGeometryAuditRow[]>;
    __t8RunHandleGeometryHoverAudit?: (handleId: string, options?: HandleGeometryAuditOptions) => Promise<HandleGeometryAuditRow[]>;
    __t8RefreshHandleGeometry?: () => Promise<void>;
  }
}

export function installHandleGeometryAudit(): () => void {
  window.__t8RunHandleGeometryAudit = runHandleGeometryAudit;
  window.__t8RunHandleGeometryHoverAudit = runHandleGeometryHoverAudit;
  return () => {
    delete window.__t8RunHandleGeometryAudit;
    delete window.__t8RunHandleGeometryHoverAudit;
  };
}
