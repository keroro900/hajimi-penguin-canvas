import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEdges, useNodes, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import {
  Brush,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MonitorPlay,
  Palette,
  RefreshCw,
  Save,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { ImageOpFrame } from './ImageOpFrame';
import { useUpdateNodeData } from './useUpdateNodeData';
import { getLutLibrary, loadLutTemplate, opLut, type LutLibraryItem } from '../../services/imageOps';
import type { LutCurveMap, LutCurvePoint } from '../../services/imageOps';
import { saveAssetToDisk as saveFileToDisk } from '../../services/api';
import { getLutPreset, LUT_PRESETS } from '../../utils/lutPresets';
import {
  createOutputDataFromItems,
  createUploadDataFromItems,
  fileNameFromUrl,
  type MediaItem,
} from '../../utils/mediaCollection';
import { defaultSizeOf, placeBatchNodes, type Rect as PlacementRect } from '../../utils/nodePlacement';
import { logBus } from '../../stores/logs';
import SmartImage from '../SmartImage';
import SmartMediaPreviewModal from './shared/SmartMediaPreviewModal';
import LutGpuPreview from './LutGpuPreview';

type LutLibraryTab = 'builtin' | 'open-source' | 'user';
type LutHslRange = 'master' | 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta';
type LutCurve = 'linear' | 'soft-contrast' | 'matte' | 'film-fade' | 'deep-shadow';

const HSL_RANGES: Array<{ id: LutHslRange; label: string; color: string }> = [
  { id: 'master', label: '全色', color: 'linear-gradient(90deg,#ef4444,#eab308,#22c55e,#06b6d4,#3b82f6,#d946ef)' },
  { id: 'red', label: '红', color: '#ef4444' },
  { id: 'yellow', label: '黄', color: '#eab308' },
  { id: 'green', label: '绿', color: '#22c55e' },
  { id: 'cyan', label: '青', color: '#06b6d4' },
  { id: 'blue', label: '蓝', color: '#3b82f6' },
  { id: 'magenta', label: '品', color: '#d946ef' },
];

const TONE_CURVES: Array<{ id: LutCurve; label: string }> = [
  { id: 'linear', label: '线性' },
  { id: 'soft-contrast', label: '柔和 S' },
  { id: 'matte', label: '哑光' },
  { id: 'film-fade', label: '胶片淡化' },
  { id: 'deep-shadow', label: '暗部加深' },
];

const DEFAULT_CURVE: LutCurvePoint[] = [[0, 0], [255, 255]];
const CURVE_CHANNELS: Array<{ id: keyof Required<LutCurveMap>; label: string; color: string }> = [
  { id: 'rgb', label: 'RGB', color: '#f8fafc' },
  { id: 'r', label: '红', color: '#ef4444' },
  { id: 'g', label: '绿', color: '#22c55e' },
  { id: 'b', label: '蓝', color: '#3b82f6' },
];

function clampSlider(value: any, min: number, max: number, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeRange(value: any): LutHslRange {
  return HSL_RANGES.some((range) => range.id === value) ? value : 'master';
}

function normalizeCurve(value: any): LutCurve {
  return TONE_CURVES.some((curve) => curve.id === value) ? value : 'linear';
}

function normalizeCurvePoints(value: any): LutCurvePoint[] {
  if (!Array.isArray(value)) return DEFAULT_CURVE;
  const points = value
    .map((point): LutCurvePoint | null => {
      const x = Array.isArray(point) ? point[0] : point?.x;
      const y = Array.isArray(point) ? point[1] : point?.y;
      const px = clampSlider(x, 0, 255, 0);
      const py = clampSlider(y, 0, 255, 0);
      return [px, py];
    })
    .filter(Boolean) as LutCurvePoint[];
  points.push([0, 0], [255, 255]);
  const byX = new Map<number, number>();
  points.forEach(([x, y]) => byX.set(x, y));
  return [...byX.entries()].sort((a, b) => a[0] - b[0]) as LutCurvePoint[];
}

function normalizeCurveMap(value: any): Required<LutCurveMap> {
  const source = value && typeof value === 'object' ? value : {};
  return {
    rgb: normalizeCurvePoints(source.rgb),
    r: normalizeCurvePoints(source.r),
    g: normalizeCurvePoints(source.g),
    b: normalizeCurvePoints(source.b),
  };
}

function clampAmount(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function collectNodeImages(nodes: any[], edges: any[], id: string): string[] {
  const upstreamIds = edges.filter((edge) => edge.target === id).map((edge) => edge.source);
  const urls: string[] = [];
  const push = (value: any) => {
    if (typeof value !== 'string' || !value) return;
    if (/\.(mp4|webm|mov|m4v|mkv|mp3|wav|ogg|m4a|flac|aac)(\?.*)?$/i.test(value)) return;
    if (!urls.includes(value)) urls.push(value);
  };
  upstreamIds.forEach((uid) => {
    const node = nodes.find((item) => item.id === uid);
    const data: any = node?.data || {};
    push(data.imageUrl);
    if (Array.isArray(data.imageUrls)) data.imageUrls.forEach(push);
    if (Array.isArray(data.urls)) data.urls.forEach(push);
    if (Array.isArray(data.generatedImages)) data.generatedImages.forEach(push);
  });
  return urls;
}

function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 96) || 'lut-color';
}

function librarySourceLabel(item: LutLibraryItem) {
  const category = item.categoryLabel || item.category;
  if (item.source === 'user') return category && category !== '未分类' ? `用户 LUT · ${category}` : '用户 LUT';
  return `${item.sourceName || '开源 LUT'}${item.license ? ` · ${item.license}` : ''}`;
}

function rgbToHue(r8: number, g8: number, b8: number) {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / delta + 2) * 60;
  else hue = ((r - g) / delta + 4) * 60;
  return ((hue % 360) + 360) % 360;
}

function rangeFromHue(hue: number): LutHslRange {
  const h = ((hue % 360) + 360) % 360;
  if (h < 30 || h >= 330) return 'red';
  if (h < 90) return 'yellow';
  if (h < 150) return 'green';
  if (h < 210) return 'cyan';
  if (h < 270) return 'blue';
  return 'magenta';
}

function sampleColorRangeFromImage(img: HTMLImageElement, clientX: number, clientY: number): LutHslRange | null {
  const rect = img.getBoundingClientRect();
  const naturalWidth = img.naturalWidth || 0;
  const naturalHeight = img.naturalHeight || 0;
  if (!naturalWidth || !naturalHeight || rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.max(0, Math.min(naturalWidth - 1, Math.round(((clientX - rect.left) / rect.width) * naturalWidth)));
  const y = Math.max(0, Math.min(naturalHeight - 1, Math.round(((clientY - rect.top) / rect.height) * naturalHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return rangeFromHue(rgbToHue(r, g, b));
}

function CurveEditor({
  curves,
  channel,
  onChannelChange,
  onCurvesChange,
}: {
  curves: Required<LutCurveMap>;
  channel: keyof Required<LutCurveMap>;
  onChannelChange: (channel: keyof Required<LutCurveMap>) => void;
  onCurvesChange: (curves: Required<LutCurveMap>) => void;
}) {
  const activePoints = normalizeCurvePoints(curves[channel]);
  const curveDragRef = useRef<{ index: number; pointerId: number } | null>(null);
  const curveSvgRef = useRef<SVGSVGElement | null>(null);
  const commitPoints = (points: LutCurvePoint[]) => {
    onCurvesChange({ ...curves, [channel]: normalizeCurvePoints(points) });
  };
  const eventToCurvePoint = (event: ReactPointerEvent<SVGSVGElement>): LutCurvePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const py = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    return [clampSlider(px * 255, 0, 255, 0), clampSlider((1 - py) * 255, 0, 255, 255)];
  };
  const setPointAtIndex = (index: number, point: LutCurvePoint) => {
    const current = activePoints[index];
    if (!current) return;
    const next = activePoints.map((item) => [...item] as LutCurvePoint);
    const lockedEndpoint = current[0] === 0 || current[0] === 255;
    next[index] = [lockedEndpoint ? current[0] : point[0], point[1]];
    commitPoints(next);
  };
  const updatePoint = (index: number, axis: 0 | 1, value: number) => {
    const next = activePoints.map((point) => [...point] as LutCurvePoint);
    next[index][axis] = clampSlider(value, 0, 255, axis === 0 ? next[index][0] : next[index][1]);
    commitPoints(next);
  };
  const addPoint = () => {
    const middle = activePoints[Math.floor(activePoints.length / 2)] || [128, 128];
    commitPoints([...activePoints, [128, middle[1]]]);
  };
  const removePoint = (index: number) => {
    const point = activePoints[index];
    if (!point || point[0] === 0 || point[0] === 255) return;
    commitPoints(activePoints.filter((_, i) => i !== index));
  };
  const findNearestPoint = ([x, y]: LutCurvePoint) => {
    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    activePoints.forEach((point, index) => {
      const distance = Math.hypot(point[0] - x, point[1] - y);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    return nearestDistance <= 18 ? nearest : -1;
  };
  const handleCurvePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const point = eventToCurvePoint(event);
    let index = findNearestPoint(point);
    let points = activePoints;
    if (index < 0) {
      points = normalizeCurvePoints([...activePoints, point]);
      index = points.findIndex(([x, y]) => x === point[0] && y === point[1]);
      if (index < 0) index = Math.max(0, points.findIndex(([x]) => x >= point[0]));
      commitPoints(points);
    }
    curveDragRef.current = { index, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handleCurvePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = curveDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPointAtIndex(drag.index, eventToCurvePoint(event));
  };
  const handleCurvePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (curveDragRef.current?.pointerId === event.pointerId) {
      curveDragRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const pathPoints = activePoints.map(([x, y]) => `${(x / 255) * 100},${100 - (y / 255) * 100}`).join(' ');
  const activeColor = CURVE_CHANNELS.find((item) => item.id === channel)?.color || '#f97316';

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-1">
        {CURVE_CHANNELS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-curve-channel={item.id}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
              channel === item.id ? 'border-orange-300 bg-orange-400/15 text-orange-50' : 'border-white/10 bg-white/[0.035] text-white/60 hover:bg-white/[0.07]'
            }`}
            onClick={() => onChannelChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-white/10 bg-black/25">
        <svg
          ref={curveSvgRef}
          viewBox="0 0 100 100"
          className="h-full w-full cursor-crosshair touch-none"
          onPointerDown={handleCurvePointerDown}
          onPointerMove={handleCurvePointerMove}
          onPointerUp={handleCurvePointerUp}
          onPointerCancel={handleCurvePointerUp}
        >
          <defs>
            <pattern id={`lut-curve-grid-${channel}`} width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill={`url(#lut-curve-grid-${channel})`} />
          <polyline points="0,100 100,0" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
          <polyline points={pathPoints} fill="none" stroke={activeColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {activePoints.map(([x, y], index) => (
            <circle
              key={`${index}-${x}-${y}`}
              data-curve-point-index={index}
              cx={(x / 255) * 100}
              cy={100 - (y / 255) * 100}
              r={2.8}
              fill={activeColor}
              stroke="#0a0a0a"
              strokeWidth="1.2"
            />
          ))}
        </svg>
      </div>
      <div className="text-[10px] text-white/40">点击或拖动曲线点，端点锁定输入值</div>
      <div className="grid max-h-36 gap-1 overflow-y-auto pr-1">
        {activePoints.map(([x, y], index) => (
          <div key={`${index}-${x}`} className="grid grid-cols-[1fr_1fr_auto] gap-1">
            <input
              type="number"
              min={0}
              max={255}
              value={x}
              disabled={x === 0 || x === 255}
              onChange={(event) => updatePoint(index, 0, Number(event.target.value))}
              className="min-w-0 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white/70 outline-none disabled:opacity-45"
              aria-label="曲线输入"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={y}
              onChange={(event) => updatePoint(index, 1, Number(event.target.value))}
              className="min-w-0 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white/70 outline-none"
              aria-label="曲线输出"
            />
            <button
              type="button"
              disabled={x === 0 || x === 255}
              className="grid h-7 w-7 place-items-center rounded bg-white/5 text-white/45 hover:bg-white/10 disabled:opacity-25"
              onClick={() => removePoint(index)}
              title="删除曲线点"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button type="button" className="rounded bg-white/5 px-2 py-1.5 text-[10px] text-white/65 hover:bg-white/10" onClick={addPoint}>
          添加点
        </button>
        <button
          type="button"
          className="rounded bg-white/5 px-2 py-1.5 text-[10px] text-white/65 hover:bg-white/10"
          onClick={() => onCurvesChange({ ...curves, [channel]: DEFAULT_CURVE })}
        >
          重置通道
        </button>
      </div>
    </div>
  );
}

function LutColorStudioModal({
  open,
  activeLabel,
  activeText,
  amount,
  previewUrl,
  previewSource,
  previewBusy,
  previewError,
  values,
  update,
  onClose,
  onSave,
  onGpuPreviewError,
}: {
  open: boolean;
  activeLabel: string;
  activeText: string;
  amount: number;
  previewUrl: string;
  previewSource: string;
  previewBusy: boolean;
  previewError: string | null;
  values: {
    lutEnabled: boolean;
    lutAdjustEnabled: boolean;
    lutHue: number;
    lutSaturation: number;
    lutLightness: number;
    lutColorize: boolean;
    lutRange: LutHslRange;
    lutBrightness: number;
    lutContrast: number;
    lutCurve: LutCurve;
    lutCurveAmount: number;
    lutCurves: Required<LutCurveMap>;
  };
  update: (patch: Record<string, any>) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onGpuPreviewError: (message: string) => void;
}) {
  const [curveChannel, setCurveChannel] = useState<keyof Required<LutCurveMap>>('rgb');
  const [targetAdjustActive, setTargetAdjustActive] = useState(false);
  const [targetAdjustMessage, setTargetAdjustMessage] = useState('');
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const displayUrl = previewUrl || previewSource;
  const canUseGpuPreview = Boolean(previewSource);
  const applyStudioPreset = (preset: string) => {
    if (preset !== 'default') return;
    update({
      lutAdjustEnabled: true,
      lutHue: 0,
      lutSaturation: 0,
      lutLightness: 0,
      lutColorize: false,
      lutRange: 'master',
      lutBrightness: 0,
      lutContrast: 0,
      lutCurve: 'linear',
      lutCurveAmount: 100,
      lutCurves: { rgb: DEFAULT_CURVE, r: DEFAULT_CURVE, g: DEFAULT_CURVE, b: DEFAULT_CURVE },
    });
  };
  const handleTargetPreviewClick = (event: MouseEvent<HTMLImageElement>) => {
    if (!targetAdjustActive) return;
    event.preventDefault();
    event.stopPropagation();
    const img = event.currentTarget;
    try {
      const range = sampleColorRangeFromImage(img, event.clientX, event.clientY);
      if (!range) throw new Error('empty sample');
      update({ lutAdjustEnabled: true, lutRange: range });
      setTargetAdjustMessage(`已选择：${HSL_RANGES.find((item) => item.id === range)?.label || range}`);
    } catch {
      setTargetAdjustMessage('当前预览无法取色，请使用颜色范围按钮');
    }
  };
  const renderStudioSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    keyName: string,
    track: string,
  ) => (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span>{label}</span>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          aria-label={`${label}数值`}
          onChange={(event) => update({ [keyName]: clampSlider(event.target.value, min, max, value) })}
          onBlur={() => update({ [keyName]: clampSlider(value, min, max, 0) })}
          className="h-6 w-14 rounded border border-white/10 bg-black/35 px-1.5 text-right text-[11px] tabular-nums text-white/80 outline-none focus:border-orange-300/70 focus:bg-black/55"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => update({ [keyName]: Number(event.target.value) })}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-300"
        style={{ background: track }}
        title={label}
      />
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10090] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm nodrag nopan nowheel"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="lut-color-studio-modal grid h-[min(88vh,900px)] w-[min(1180px,calc(100vw-24px))] grid-cols-[340px_minmax(0,1fr)] overflow-hidden rounded-lg border border-white/10 bg-zinc-950 text-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="高级调色台"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="min-h-0 overflow-y-auto border-r border-white/10 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-orange-100">高级调色台</div>
              <div className="truncate text-[11px] text-white/40">{activeLabel}</div>
            </div>
            <button type="button" className="grid h-8 w-8 place-items-center rounded bg-white/5 text-white/60 hover:bg-white/10" onClick={onClose} title="关闭">
              <X size={14} />
            </button>
          </div>

          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_34px] gap-1.5">
              <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] text-white/60">
                <span>预设：</span>
                <select
                  value="default"
                  onChange={(event) => applyStudioPreset(event.target.value)}
                  className="min-w-0 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white/70 outline-none"
                >
                  <option value="default">默认值</option>
                </select>
              </label>
              <button
                type="button"
                data-lut-target-adjust={targetAdjustActive ? 'active' : 'idle'}
                className={`grid h-8 w-8 place-items-center rounded-md border ${
                  targetAdjustActive ? 'border-orange-300 bg-orange-400/20 text-orange-100' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                }`}
                onClick={() => {
                  setTargetAdjustActive((value) => !value);
                  setTargetAdjustMessage('');
                }}
                title="目标调整"
              >
                <Brush size={14} />
              </button>
            </div>
            <label className="flex cursor-pointer items-center justify-between rounded-md border border-white/10 bg-white/[0.035] px-2 py-2 text-[11px] text-white/70">
              <span>启用调色台</span>
              <input
                type="checkbox"
                checked={values.lutAdjustEnabled}
                onChange={(event) => update({ lutAdjustEnabled: event.target.checked })}
                className="accent-orange-300"
              />
            </label>

            <div className={values.lutAdjustEnabled ? 'grid gap-3' : 'pointer-events-none grid gap-3 opacity-45'}>
              <div className="grid gap-1">
                <div className="text-[11px] text-white/50">选择颜色范围</div>
                <div className="grid grid-cols-7 gap-1">
                  {HSL_RANGES.map((range) => (
                    <button
                      key={range.id}
                      type="button"
                      data-lut-range={range.id}
                      className={`grid h-9 place-items-center rounded-md border text-[9px] font-semibold ${
                        values.lutRange === range.id ? 'border-orange-300 bg-orange-400/15 text-orange-50' : 'border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/[0.07]'
                      }`}
                      onClick={() => update({ lutRange: range.id })}
                      title={range.label}
                    >
                      <span className="h-2.5 w-5 rounded-full border border-white/20" style={{ background: range.color }} />
                      <span>{range.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {renderStudioSlider('色相', values.lutHue, -180, 180, 'lutHue', 'linear-gradient(90deg,#ef4444,#eab308,#22c55e,#06b6d4,#3b82f6,#d946ef,#ef4444)')}
              {renderStudioSlider('饱和度', values.lutSaturation, -100, 100, 'lutSaturation', 'linear-gradient(90deg,#52525b,#f97316)')}
              {renderStudioSlider('明度', values.lutLightness, -100, 100, 'lutLightness', 'linear-gradient(90deg,#050505,#71717a,#f8fafc)')}
              <label className="flex cursor-pointer items-center justify-between rounded-md bg-white/[0.035] px-2 py-2 text-[11px] text-white/65">
                <span>着色</span>
                <input
                  type="checkbox"
                  checked={values.lutColorize}
                  onChange={(event) => update({ lutColorize: event.target.checked })}
                  className="accent-orange-300"
                />
              </label>

              {renderStudioSlider('亮度', values.lutBrightness, -100, 100, 'lutBrightness', 'linear-gradient(90deg,#111827,#f8fafc)')}
              {renderStudioSlider('对比度', values.lutContrast, -100, 100, 'lutContrast', 'linear-gradient(90deg,#71717a,#111827,#f8fafc)')}

              <div className="grid gap-1.5 rounded-md border border-white/10 bg-white/[0.025] p-2">
                <div className="flex items-center justify-between text-[11px] text-white/55">
                  <span>曲线预设</span>
                  <span>{values.lutCurveAmount}%</span>
                </div>
                <div className="grid grid-cols-[1fr_96px] gap-2">
                  <select
                    value={values.lutCurve}
                    onChange={(event) => update({ lutCurve: event.target.value })}
                    className="min-w-0 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white/70 outline-none"
                  >
                    {TONE_CURVES.map((curve) => (
                      <option key={curve.id} value={curve.id}>{curve.label}</option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={values.lutCurveAmount}
                    onChange={(event) => update({ lutCurveAmount: Number(event.target.value) })}
                    className="w-full accent-orange-300"
                    title="曲线预设强度"
                  />
                </div>
                <div className="flex justify-end">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={values.lutCurveAmount}
                    aria-label="曲线预设强度数值"
                    onChange={(event) => update({ lutCurveAmount: clampSlider(event.target.value, 0, 100, values.lutCurveAmount) })}
                    onBlur={() => update({ lutCurveAmount: clampSlider(values.lutCurveAmount, 0, 100, 100) })}
                    className="h-6 w-16 rounded border border-white/10 bg-black/35 px-1.5 text-right text-[11px] tabular-nums text-white/80 outline-none focus:border-orange-300/70 focus:bg-black/55"
                  />
                </div>
              </div>

              <div className="grid gap-2 rounded-md border border-white/10 bg-white/[0.025] p-2">
                <div className="flex items-center justify-between text-[11px] text-white/55">
                  <span>曲线</span>
                  <button
                    type="button"
                    className="rounded bg-white/5 px-2 py-1 text-[10px] text-white/55 hover:bg-white/10"
                    onClick={() => update({ lutCurves: { rgb: DEFAULT_CURVE, r: DEFAULT_CURVE, g: DEFAULT_CURVE, b: DEFAULT_CURVE } })}
                  >
                    全部重置
                  </button>
                </div>
                <CurveEditor
                  curves={values.lutCurves}
                  channel={curveChannel}
                  onChannelChange={setCurveChannel}
                  onCurvesChange={(curves) => update({ lutCurves: curves })}
                />
              </div>
            </div>
          </div>
        </aside>

        <main className="lut-color-studio-preview grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-black/30">
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">实时预览</div>
              <div className="truncate text-[11px] text-white/40">{displayUrl || '连接上游图片后预览'}</div>
            </div>
            <button type="button" className="rounded bg-orange-400/15 px-3 py-1.5 text-[11px] font-semibold text-orange-100 hover:bg-orange-400/20" onClick={() => void onSave()}>
              保存本地
            </button>
          </header>
          <div className="relative min-h-0 p-3">
            <div className="grid h-full place-items-center overflow-hidden rounded-md border border-white/10 bg-black">
              {canUseGpuPreview ? (
                <LutGpuPreview
                  imageUrl={previewSource}
                  lutText={activeText}
                  lutEnabled={values.lutEnabled}
                  amount={amount}
                  adjustEnabled={values.lutAdjustEnabled}
                  hslHue={values.lutHue}
                  hslSaturation={values.lutSaturation}
                  hslLightness={values.lutLightness}
                  hslRange={values.lutRange}
                  hslColorize={values.lutColorize}
                  brightness={values.lutBrightness}
                  contrast={values.lutContrast}
                  curve={values.lutCurve}
                  curveAmount={values.lutCurveAmount}
                  curves={values.lutCurves}
                  className={`h-full w-full object-contain ${targetAdjustActive ? 'cursor-crosshair' : ''}`}
                  onFallback={onGpuPreviewError}
                />
              ) : displayUrl ? (
                <img
                  src={displayUrl}
                  alt="高级调色台实时预览"
                  className={`h-full w-full object-contain ${targetAdjustActive ? 'cursor-crosshair' : ''}`}
                  loading="eager"
                  decoding="async"
                  crossOrigin="anonymous"
                  onClick={handleTargetPreviewClick}
                />
              ) : (
                <div className="grid place-items-center gap-2 text-[12px] text-white/35">
                  <ImageIcon size={24} />
                  <span>连接上游图片后实时预览</span>
                </div>
              )}
              {previewBusy && (
                <div className="lut-preview-status absolute right-3 top-3 inline-flex items-center gap-1.5 rounded bg-black/55 px-2 py-1 text-[11px] text-white/80">
                  <Loader2 size={12} className="animate-spin" /> 更新中
                </div>
              )}
            </div>
          </div>
          <footer className="border-t border-white/10 px-3 py-2 text-[11px] text-white/45">
            {previewError || targetAdjustMessage || `H ${values.lutHue} / S ${values.lutSaturation} / L ${values.lutLightness} · 亮度 ${values.lutBrightness} · 对比度 ${values.lutContrast}`}
          </footer>
        </main>
      </section>
    </div>,
    document.body,
  );
}

const LutColorNode = (p: NodeProps) => {
  const update = useUpdateNodeData(p.id);
  const nodes = useNodes();
  const edges = useEdges();
  const rf = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewSeqRef = useRef(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [gpuPreviewError, setGpuPreviewError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [openColorStudio, setOpenColorStudio] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<LutLibraryTab>('builtin');
  const [libraryItems, setLibraryItems] = useState<LutLibraryItem[]>([]);
  const [libraryUserDir, setLibraryUserDir] = useState('');
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const d = p.data as any;
  const presetId = typeof d?.lutPresetId === 'string' ? d.lutPresetId : 'cinematic-teal-orange';
  const templateId = typeof d?.lutTemplateId === 'string' ? d.lutTemplateId : '';
  const customName = typeof d?.lutCustomName === 'string' ? d.lutCustomName : '';
  const customText = typeof d?.lutText === 'string' ? d.lutText : '';
  const amount = clampAmount(d?.lutAmount);
  const lutEnabled = d?.lutEnabled !== false;
  const lutAdjustEnabled = d?.lutAdjustEnabled !== false;
  const lutHue = clampSlider(d?.lutHue, -180, 180, 0);
  const lutSaturation = clampSlider(d?.lutSaturation, -100, 100, 0);
  const lutLightness = clampSlider(d?.lutLightness, -100, 100, 0);
  const lutColorize = Boolean(d?.lutColorize);
  const lutRange = normalizeRange(d?.lutRange);
  const lutBrightness = clampSlider(d?.lutBrightness, -100, 100, 0);
  const lutContrast = clampSlider(d?.lutContrast, -100, 100, 0);
  const lutCurve = normalizeCurve(d?.lutCurve);
  const lutCurveAmount = clampSlider(d?.lutCurveAmount, 0, 100, 100);
  const lutCurves = useMemo(() => normalizeCurveMap(d?.lutCurves), [d?.lutCurves]);
  const hslOptions = useMemo(() => ({
    lutEnabled,
    adjustEnabled: lutAdjustEnabled,
    hslHue: lutHue,
    hslSaturation: lutSaturation,
    hslLightness: lutLightness,
    hslRange: lutRange,
    hslColorize: lutColorize,
    brightness: lutBrightness,
    contrast: lutContrast,
    curve: lutCurve,
    curveAmount: lutCurveAmount,
    curves: lutCurves,
  }), [lutEnabled, lutAdjustEnabled, lutHue, lutSaturation, lutLightness, lutRange, lutColorize, lutBrightness, lutContrast, lutCurve, lutCurveAmount, lutCurves]);
  const preset = useMemo(() => getLutPreset(presetId), [presetId]);
  const activeLabel = customText ? customName || '导入 LUT' : preset.name;
  const activeText = customText || preset.cubeText;
  const previewSource = useMemo(
    () => collectNodeImages(nodes, edges, p.id)[0] || '',
    [nodes, edges, p.id],
  );
  const effectivePreviewUrl = previewUrl || previewSource;
  const previewFileName = `${safeFilename(activeLabel)}-${Date.now()}.png`;
  const resultItem: MediaItem | null = previewUrl ? {
    kind: 'image',
    url: previewUrl,
    name: fileNameFromUrl(previewUrl) || previewFileName,
  } : null;
  const openSourceLuts = useMemo(() => libraryItems.filter((item) => item.source === 'open-source'), [libraryItems]);
  const userLuts = useMemo(() => libraryItems.filter((item) => item.source === 'user'), [libraryItems]);
  const visibleLibraryItems = libraryTab === 'open-source' ? openSourceLuts : userLuts;

  const refreshLutLibrary = async () => {
    setLibraryBusy(true);
    setLibraryError(null);
    try {
      const data = await getLutLibrary();
      setLibraryItems(data.items || []);
      setLibraryUserDir(data.userDir || '');
    } catch (error: any) {
      setLibraryError(error?.message || '读取 LUT 模板库失败');
    } finally {
      setLibraryBusy(false);
    }
  };

  useEffect(() => {
    void refreshLutLibrary();
  }, []);

  async function generatePreviewNow() {
    if (!previewSource || !activeText) throw new Error('请先连接上游图片');
    const seq = ++previewSeqRef.current;
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const result = await opLut(previewSource, { lutText: activeText, amount, ...hslOptions });
      if (previewSeqRef.current === seq) {
        setPreviewUrl(result.imageUrl);
        setPreviewError(null);
      }
      return result.imageUrl;
    } catch (error: any) {
      if (previewSeqRef.current === seq) setPreviewError(error?.message || '预览生成失败');
      throw error;
    } finally {
      if (previewSeqRef.current === seq) setPreviewBusy(false);
    }
  }

  useEffect(() => {
    if (!previewSource || !activeText) {
      setPreviewUrl('');
      setPreviewBusy(false);
      setPreviewError(null);
      return;
    }
    if (openColorStudio) {
      previewSeqRef.current += 1;
      setPreviewBusy(false);
      setPreviewError(null);
      return;
    }
    setPreviewError(null);
    const timer = window.setTimeout(() => {
      void generatePreviewNow().catch(() => {});
    }, 90);
    return () => {
      window.clearTimeout(timer);
    };
  }, [previewSource, activeText, amount, hslOptions, openColorStudio]);

  const handleFile = async (file?: File | null) => {
    setFileError(null);
    if (!file) return;
    if (!/\.cube$/i.test(file.name)) {
      setFileError('请选择 .cube LUT 文件');
      return;
    }
    const text = await file.text();
    if (!/LUT_3D_SIZE/i.test(text)) {
      setFileError('未找到 LUT_3D_SIZE，仅支持 3D .cube LUT');
      return;
    }
    update({ lutText: text, lutCustomName: file.name, lutTemplateId: '' });
  };

  const applyLibraryTemplate = async (item: LutLibraryItem) => {
    setLibraryBusy(true);
    setLibraryError(null);
    try {
      const loaded = await loadLutTemplate(item.id);
      update({
        lutText: loaded.lutText,
        lutCustomName: loaded.displayName || loaded.name,
        lutTemplateId: loaded.id,
      });
      logBus.success(`已导入 LUT 模板：${loaded.displayName || loaded.name}`, 'LUT调色');
    } catch (error: any) {
      const message = error?.message || '读取 LUT 模板失败';
      setLibraryError(message);
      logBus.warn(message, 'LUT调色');
    } finally {
      setLibraryBusy(false);
    }
  };

  const ensureResultItem = async (): Promise<MediaItem | null> => {
    const freshUrl = await generatePreviewNow();
    return {
      kind: 'image',
      url: freshUrl,
      name: fileNameFromUrl(freshUrl) || previewFileName,
    };
  };

  const placeResultNode = async (type: 'output' | 'upload') => {
    let item = resultItem;
    try {
      if (!item) {
        item = await ensureResultItem();
      } else if (openColorStudio) {
        item = await ensureResultItem();
      }
    } catch (error: any) {
      logBus.warn(error?.message || '生成调色结果失败', 'LUT调色');
      return;
    }
    if (!item) {
      logBus.warn('请先生成 LUT 预览后再传出', 'LUT调色');
      return;
    }
    const me = rf.getNode(p.id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 640;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 360;
    const targetSize = defaultSizeOf(type);
    const desired: PlacementRect[] = [{
      x: (me?.position?.x ?? 0) + myW + 80,
      y: (me?.position?.y ?? 0) + Math.max(0, Math.min(220, myH - targetSize.h)),
      w: targetSize.w,
      h: targetSize.h,
    }];
    const off = placeBatchNodes(desired, rf.getNodes(), { source: `placement:lut-color:${p.id}:${type}` });
    const baseNode = {
      id: `${type}-lut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      position: { x: desired[0].x + off.dx, y: desired[0].y + off.dy },
      selected: true,
    };
    const newNode: Node = type === 'output'
      ? {
          ...baseNode,
          type: 'output',
          data: {
            ...createOutputDataFromItems('image', [item]),
            directImageUrl: item.url,
            imageUrl: item.url,
          },
        } as Node
      : {
          ...baseNode,
          type: 'upload',
          data: createUploadDataFromItems('image', [item]),
        } as Node;
    rf.addNodes(newNode);
    logBus.success(type === 'output' ? '已创建输出素材节点' : '已创建上传素材节点', 'LUT调色');
  };

  const handleSaveLocal = async () => {
    if (!previewUrl && !previewSource) {
      logBus.warn('请先生成 LUT 预览后再保存', 'LUT调色');
      return;
    }
    setActionBusy('save');
    try {
      const freshUrl = openColorStudio || !previewUrl ? await generatePreviewNow() : previewUrl;
      const result = await saveFileToDisk(freshUrl, previewFileName);
      if (result.ok) logBus.success(result.path ? `已保存到本地：${result.path}` : '已保存到本地', 'LUT调色');
      else logBus.warn(result.error || '保存到本地失败', 'LUT调色');
    } catch (error: any) {
      logBus.warn(error?.message || '生成调色结果失败', 'LUT调色');
    } finally {
      setActionBusy(null);
    }
  };

  const renderBuiltinLibrary = () => (
    <div className="grid grid-cols-2 gap-1.5">
      {LUT_PRESETS.map((item) => {
        const active = !customText && item.id === presetId;
        const sourceLabel = item.sourceName || '内置生成 LUT';
        const licenseLabel = item.license ? ` · ${item.license}` : '';
        return (
          <button
            key={item.id}
            type="button"
            data-lut-preset-card={item.id}
            className={`min-w-0 rounded-md border p-1.5 text-left transition ${
              active ? 'border-orange-300 bg-orange-400/15 text-orange-50' : 'border-white/10 bg-white/[0.035] text-white/70 hover:bg-white/[0.07]'
            }`}
            onClick={() => update({ lutPresetId: item.id, lutText: '', lutCustomName: '', lutTemplateId: '' })}
            title={item.sourceUrl ? `${sourceLabel}${licenseLabel} · ${item.sourceUrl}` : item.description}
          >
            <div className="mb-1 flex h-5 overflow-hidden rounded">
              {item.swatch.map((color) => <span key={color} className="flex-1" style={{ background: color }} />)}
            </div>
            <div className="truncate text-[10px] font-bold">{item.name}</div>
            <div className="truncate text-[9px] text-white/35">{sourceLabel}{licenseLabel}</div>
          </button>
        );
      })}
    </div>
  );

  const renderFileLibrary = () => (
    <div className="grid gap-1.5">
      {visibleLibraryItems.slice(0, 80).map((item) => {
        const active = customText && templateId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-lut-template-card={item.id}
            className={`min-w-0 rounded-md border px-2 py-1.5 text-left transition ${
              active ? 'border-orange-300 bg-orange-400/15 text-orange-50' : 'border-white/10 bg-white/[0.035] text-white/70 hover:bg-white/[0.07]'
            }`}
            onClick={() => void applyLibraryTemplate(item)}
            title={`${item.fileName || item.name} · ${item.relPath}${item.sourceUrl ? ` · ${item.sourceUrl}` : ''}`}
          >
            <div className="truncate text-[10px] font-bold">{item.displayName || item.name}</div>
            <div className="truncate text-[9px] text-white/35">{item.source === 'user' ? (item.fileName || item.name) : (item.englishName || item.fileName || item.name)}</div>
            <div className="truncate text-[9px] text-white/30">{librarySourceLabel(item)}</div>
          </button>
        );
      })}
      {!libraryBusy && visibleLibraryItems.length === 0 && (
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px] leading-relaxed text-white/45">
          {libraryTab === 'user' ? `把 .cube 放到 ${libraryUserDir || 'data/user-luts'} 后点刷新` : 'resources/luts/open-source 下暂无 .cube'}
        </div>
      )}
    </div>
  );

  const renderHslSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    keyName: 'lutHue' | 'lutSaturation' | 'lutLightness' | 'lutBrightness' | 'lutContrast' | 'lutCurveAmount',
    track: string,
  ) => (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-[10px] text-white/55">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">{value > 0 ? `+${value}` : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => update({ [keyName]: Number(event.target.value) })}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-300"
        style={{ background: track }}
        title={label}
      />
    </div>
  );

  return (
    <div className="contents" data-canvas-node-root={true}>
      <ImageOpFrame
        id={p.id}
        data={p.data}
        selected={p.selected}
        dragging={p.dragging}
        title="LUT调色"
        accessibleLabel="LUT 调色节点"
        composerAriaLabel="LUT 调色节点属性"
        emptyHint="连接上游图像后点击卡片"
        subtitle={`${activeLabel} · ${Math.round(amount * 100)}%`}
        icon={<Palette size={13} />}
        colorHex="#f97316"
        bgRgba="rgba(249,115,22,.18)"
        shadowRgba="rgba(249,115,22,.2)"
        textHex="#fed7aa"
        buttonClasses="bg-orange-500/20 hover:bg-orange-500/30 text-orange-100"
        processAllInputs
        width={720}
        inputImages={previewSource ? [previewSource] : undefined}
        renderSettings={() => (
          <div className="lut-node-workspace grid grid-cols-[260px_minmax(0,1fr)] gap-3">
            <div className="lut-preset-library grid content-start gap-2">
              <div className="lut-template-library grid gap-1.5">
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[10px] text-white/70">
                  <span>LUT 预设</span>
                  <input
                    type="checkbox"
                    checked={lutEnabled}
                    onChange={(event) => update({ lutEnabled: event.target.checked })}
                    className="accent-orange-300"
                  />
                </label>
                <div className="grid grid-cols-[1fr_auto_auto] gap-1">
                  <div className="grid grid-cols-3 rounded-md bg-white/[0.04] p-0.5 text-[10px]">
                    {[
                      ['builtin', '内置'],
                      ['open-source', `开源 ${openSourceLuts.length || ''}`],
                      ['user', `用户 LUT ${userLuts.length || ''}`],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`rounded px-1.5 py-1 ${libraryTab === id ? 'bg-orange-400/20 text-orange-100' : 'text-white/50 hover:text-white/80'}`}
                        onClick={() => setLibraryTab(id as LutLibraryTab)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded bg-white/5 text-white/60 hover:bg-white/10"
                    onClick={() => void refreshLutLibrary()}
                    title="刷新 LUT 模板库"
                  >
                    {libraryBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  </button>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded bg-white/5 text-white/60 hover:bg-white/10"
                    onClick={() => {
                      if (libraryUserDir) navigator.clipboard?.writeText(libraryUserDir).catch(() => {});
                      logBus.info(libraryUserDir ? `用户 LUT 文件夹：${libraryUserDir}` : '用户 LUT 文件夹未就绪', 'LUT调色');
                    }}
                    title={libraryUserDir || '用户 LUT 文件夹'}
                  >
                    <FolderOpen size={12} />
                  </button>
                </div>
                <div className="max-h-[230px] overflow-y-auto pr-1">
                  {libraryTab === 'builtin' ? renderBuiltinLibrary() : renderFileLibrary()}
                </div>
                {libraryError && <div className="rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">{libraryError}</div>}
              </div>

              <div className={lutEnabled ? '' : 'opacity-45'}>
                <div className="mb-1 flex items-center justify-between text-[10px] text-white/50">
                  <span>强度</span>
                  <span>{Math.round(amount * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(amount * 100)}
                  onChange={(event) => update({ lutAmount: Number(event.target.value) / 100 })}
                  disabled={!lutEnabled}
                  className="w-full accent-orange-300"
                />
              </div>

              <button
                type="button"
                className="flex items-center justify-between rounded-md border border-orange-300/20 bg-orange-400/10 px-2 py-2 text-left text-orange-100 hover:bg-orange-400/15"
                onClick={() => setOpenColorStudio(true)}
                title="打开高级调色台"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                  <Brush size={12} />
                  <span>高级调色台</span>
                </span>
                <span className="text-[10px] text-orange-100/60">
                  {lutAdjustEnabled ? `H ${lutHue} / S ${lutSaturation} / L ${lutLightness}` : '已关闭'}
                </span>
              </button>

              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 rounded bg-white/5 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"
                  onClick={() => fileInputRef.current?.click()}
                  title="导入 .cube LUT"
                >
                  <Upload size={12} />
                  <span className="truncate">{customText ? customName || '已导入 LUT' : '导入 .cube'}</span>
                </button>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded bg-white/5 text-white/60 hover:bg-white/10"
                  onClick={() => update({ lutText: '', lutCustomName: '', lutTemplateId: '' })}
                  title="清除导入 LUT"
                >
                  <X size={12} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".cube,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    void handleFile(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
              {fileError && <div className="rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">{fileError}</div>}
            </div>

            <div className="lut-preview-panel grid content-start gap-2">
              <div className="lut-preview-card overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
                <div className="relative aspect-[16/10] bg-black/30">
                  {effectivePreviewUrl ? (
                    <SmartImage src={effectivePreviewUrl} alt="LUT 实时预览" className="h-full w-full object-cover" thumbSize={720} />
                  ) : previewSource ? (
                    <SmartImage src={previewSource} alt="原图预览" className="h-full w-full object-cover opacity-70" thumbSize={720} />
                  ) : (
                    <div className="grid h-full place-items-center text-[11px] text-white/35">
                      <div className="grid place-items-center gap-1">
                        <ImageIcon size={18} />
                        <span>连接上游图片后实时预览</span>
                      </div>
                    </div>
                  )}
                  {previewBusy && (
                    <div className="lut-preview-status absolute right-2 top-2 inline-flex items-center gap-1.5 rounded bg-black/55 px-2 py-1 text-[10px] text-white/80">
                      <Loader2 size={11} className="animate-spin" /> 更新中
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white/85">
                    {activeLabel} · {Math.round(amount * 100)}%
                  </div>
                </div>
                {previewError && <div className="border-t border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">{previewError}</div>}
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  disabled={!effectivePreviewUrl}
                  className="flex items-center justify-center gap-1 rounded bg-white/5 px-2 py-1.5 text-[10px] text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => setPreviewOpen(true)}
                  title="预览"
                >
                  <Eye size={12} />
                  <span>预览</span>
                </button>
                <button
                  type="button"
                  disabled={!previewUrl || actionBusy === 'save'}
                  className="flex items-center justify-center gap-1 rounded bg-white/5 px-2 py-1.5 text-[10px] text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => void handleSaveLocal()}
                  title="保存本地"
                >
                  {actionBusy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  <span>保存本地</span>
                </button>
                <button
                  type="button"
                  disabled={!previewUrl}
                  className="flex items-center justify-center gap-1 rounded bg-white/5 px-2 py-1.5 text-[10px] text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => void placeResultNode('output')}
                  title="输出节点"
                >
                  <MonitorPlay size={12} />
                  <span>输出节点</span>
                </button>
                <button
                  type="button"
                  disabled={!previewUrl}
                  className="flex items-center justify-center gap-1 rounded bg-white/5 px-2 py-1.5 text-[10px] text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => void placeResultNode('upload')}
                  title="上传节点"
                >
                  <UploadCloud size={12} />
                  <span>上传节点</span>
                </button>
              </div>
            </div>
          </div>
        )}
        runOp={async (img) => opLut(img as string, { lutText: activeText, amount, ...hslOptions })}
      />
      <LutColorStudioModal
        open={openColorStudio}
        activeLabel={activeLabel}
        activeText={activeText}
        amount={amount}
        previewUrl={previewUrl}
        previewSource={previewSource}
        previewBusy={previewBusy}
        previewError={previewError || gpuPreviewError}
        values={{
          lutAdjustEnabled,
          lutEnabled,
          lutHue,
          lutSaturation,
          lutLightness,
          lutColorize,
          lutRange,
          lutBrightness,
          lutContrast,
          lutCurve,
          lutCurveAmount,
          lutCurves,
        }}
        update={update}
        onClose={() => setOpenColorStudio(false)}
        onSave={handleSaveLocal}
        onGpuPreviewError={setGpuPreviewError}
      />
      <SmartMediaPreviewModal
        open={previewOpen}
        url={effectivePreviewUrl}
        title={`LUT调色 · ${activeLabel}`}
        kind="image"
        meta={previewUrl ? '调色结果预览' : '原图预览'}
        infoRows={[
          { label: '预设', value: activeLabel },
          { label: '强度', value: `${Math.round(amount * 100)}%` },
          { label: '调色', value: `色相 ${lutHue} / 饱和度 ${lutSaturation} / 明度 ${lutLightness}` },
        ]}
        onClose={() => setPreviewOpen(false)}
        onSaveResource={previewUrl ? handleSaveLocal : undefined}
      />
    </div>
  );
};

export default memo(LutColorNode);
