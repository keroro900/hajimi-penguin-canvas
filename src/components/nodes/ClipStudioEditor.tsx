import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Link,
  Magnet,
  Maximize2,
  Music,
  Pause,
  Play,
  Plus,
  HelpCircle,
  RotateCw,
  Redo2,
  Scissors,
  SlidersHorizontal,
  TextCursorInput,
  Upload,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
  Undo2,
} from 'lucide-react';
import { fileNameFromUrl } from '../../utils/mediaCollection';
import { getLutPreset, LUT_PRESETS } from '../../utils/lutPresets';
import { useOutsideClose } from './shared/useOutsideClose';
import {
  clipGenerationModelGroupOptions,
  clipGenerationReferenceSupport,
  clipGenerationRefLimitForKind,
  defaultClipGenerationParams,
  normalizeClipGenerationParams,
  resolveClipGenerationChoice,
  visibleClipGenerationControls,
  type ClipGenerationChoice,
  type ClipGenerationReferenceSupport,
} from '../../utils/clipGenerationAdapters';
import { modelsForKind } from '../../providers/modelCatalog';
import {
  clampClipPlayheadTime,
  clipProjectDuration,
  CLIP_BLEND_MODE_IDS,
  CLIP_MAX_VISUAL_LANE,
  CLIP_RATIO_PRESETS,
  CLIP_RESOLUTION_PRESETS,
  QUICK_CLIP_TEMPLATES,
  computeClipFrameThumbnails,
  computeClipTimelineLayout,
  computeClipTimelineRulerTicks,
  deriveClipTimelineTracks,
  fitClipTimelineZoom,
  inspectClipProjectBeforeExport,
  interpolateClipVisualKeyframes,
  normalizeClipVisualTransform,
  previewClipTimelineDragTiming,
  resolveClipTimelinePlayback,
  sanitizeClipStudioLayout,
  stepClipPlayheadByFrames,
  type ClipProject,
  type ClipBlendMode,
  type ClipFilterPreset,
  type ClipFit,
  type ClipGenerationNodeType,
  type ClipGenerationState,
  type ClipTimelineInsertTiming,
  type ClipMaterial,
  type ClipSnapTarget,
  type ClipStudioLayout,
  type ClipTransitionPreset,
  type ClipTrackHeights,
  type ClipTimelineTrackId,
  type ClipTimelineVisualMaterial,
  type ClipVisualKeyframe,
  type SanitizedClipExportSettings,
  type QuickClipTemplateId,
} from '../../utils/clipProject';
import type { Material } from './useUpstreamMaterials';
import { useApiKeysStore } from '../../stores/apiKeys';
import MaterialPreviewSection from './MaterialPreviewSection';

type ClipStudioStatus = 'idle' | 'running' | 'success' | 'error';
type MediaTab = 'media' | 'sound' | 'text' | 'color' | 'motion' | 'settings';
type MediaFilter = 'all' | 'image' | 'video' | 'audio';
type MediaSource = 'import' | 'canvas' | 'history' | 'assets';
type SoundSource = 'canvas-audio' | 'upload';
type ClipPreviewFit = 'contain' | 'cover';
type ClipRatioMode = 'auto' | 'manual';
type ClipGenerationReferenceKind = 'image' | 'video' | 'audio';
type ClipGenerationRef = NonNullable<ClipGenerationState['refs']>[number];
type ClipMediaShelfItem = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  label?: string;
  url?: string;
  origin: MediaSource;
};
type ClipGenerationRefSuggestion = {
  key: string;
  label: string;
  material: ClipMediaShelfItem;
  role?: ClipGenerationRef['role'];
};
type ClipGenerationInsertDraft = Partial<ClipTimelineInsertTiming> & {
  prompt?: string;
  params?: Record<string, unknown>;
  refs?: ClipGenerationRef[];
};
type ClipVisualFilterPatch = Pick<ClipTimelineVisualMaterial, 'filter' | 'intensity' | 'hue' | 'saturation' | 'brightness' | 'contrast' | 'lutPresetId' | 'lutName' | 'lutText' | 'lutAmount' | 'speed' | 'fadeIn' | 'fadeOut' | 'transition' | 'transitionDuration' | 'fit' | 'blendMode'>;

const CLIP_FILTER_PRESETS: Array<{ id: ClipFilterPreset; label: string; group: '调色预设 · 常用场景' | '开源滤镜 · CSSgram' | '视频效果 · FFmpeg' }> = [
  { id: 'none', label: '无滤镜', group: '调色预设 · 常用场景' },
  { id: 'cinematic', label: '电影感', group: '调色预设 · 常用场景' },
  { id: 'warm', label: '暖色', group: '调色预设 · 常用场景' },
  { id: 'cool', label: '冷色', group: '调色预设 · 常用场景' },
  { id: 'bw', label: '黑白', group: '调色预设 · 常用场景' },
  { id: 'vivid', label: '鲜艳', group: '调色预设 · 常用场景' },
  { id: 'fade', label: '褪色', group: '调色预设 · 常用场景' },
  { id: 'color-teal-orange', label: '青橙电影', group: '调色预设 · 常用场景' },
  { id: 'color-japanese-clean', label: '日系清新', group: '调色预设 · 常用场景' },
  { id: 'color-food', label: '美食暖亮', group: '调色预设 · 常用场景' },
  { id: 'color-night', label: '夜景霓虹', group: '调色预设 · 常用场景' },
  { id: 'color-portrait-soft', label: '人像柔肤', group: '调色预设 · 常用场景' },
  { id: 'color-product-clean', label: '商品干净', group: '调色预设 · 常用场景' },
  { id: 'color-cyberpunk', label: '赛博蓝紫', group: '调色预设 · 常用场景' },
  { id: 'color-sunset', label: '日落暖橙', group: '调色预设 · 常用场景' },
  { id: 'color-documentary', label: '纪录片', group: '调色预设 · 常用场景' },
  { id: 'color-matte-film', label: '胶片哑光', group: '调色预设 · 常用场景' },
  { id: 'color-clean-bright', label: '清透明亮', group: '调色预设 · 常用场景' },
  { id: 'color-moody-fall', label: '秋日氛围', group: '调色预设 · 常用场景' },
  { id: 'color-korean-soft', label: '韩系柔光', group: '调色预设 · 常用场景' },
  { id: 'color-blue-hour', label: '蓝调时刻', group: '调色预设 · 常用场景' },
  { id: 'color-fashion-contrast', label: '时尚硬光', group: '调色预设 · 常用场景' },
  { id: 'color-vlog-natural', label: 'Vlog 自然', group: '调色预设 · 常用场景' },
  { id: 'color-anime-pop', label: '动漫高饱和', group: '调色预设 · 常用场景' },
  { id: 'cssgram-clarendon', label: 'Clarendon', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-moon', label: 'Moon', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-lofi', label: 'Lofi', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-aden', label: 'Aden', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-reyes', label: 'Reyes', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-gingham', label: 'Gingham', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-walden', label: 'Walden', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-hudson', label: 'Hudson', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-inkwell', label: 'Inkwell', group: '开源滤镜 · CSSgram' },
  { id: 'cssgram-nashville', label: 'Nashville', group: '开源滤镜 · CSSgram' },
  { id: 'ffmpeg-sharpen', label: '锐化', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-denoise', label: '降噪', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-vignette', label: '暗角', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-film-grain', label: '胶片颗粒', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-soft-glow', label: '柔焦光晕', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-retro', label: '复古视频', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-sketch', label: '素描', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-scanlines', label: '扫描线', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-high-contrast-bw', label: '高反差黑白', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-dream-blur', label: '梦幻柔焦', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-vhs', label: 'VHS 录像带', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-comic', label: '漫画描边', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-cctv', label: '监控画面', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-light-leak', label: '漏光暖闪', group: '视频效果 · FFmpeg' },
  { id: 'ffmpeg-neon-edge', label: '霓虹边缘', group: '视频效果 · FFmpeg' },
];

const CLIP_FILTER_GROUPS = ['调色预设 · 常用场景', '开源滤镜 · CSSgram', '视频效果 · FFmpeg'] as const;
const VISUAL_LANE_INSERT_ENTER_PX = 18;
const VISUAL_LANE_INSERT_EXIT_PX = 34;

const sanitizeSpeed = (value: unknown) => {
  const speed = Number(value ?? 1);
  return Math.max(0.25, Math.min(4, Number.isFinite(speed) ? speed : 1));
};

const previewVideoSourceTime = (visual: ClipTimelineVisualMaterial | undefined, localTimelineTime: number, mediaDuration?: number) => {
  const requestedTime = Number(visual?.trimStart || 0) + Math.max(0, localTimelineTime) * sanitizeSpeed(visual?.speed);
  const maximumTime = Number.isFinite(mediaDuration) ? Math.max(0, Number(mediaDuration) - 0.001) : requestedTime;
  return Math.max(0, Math.min(requestedTime, maximumTime));
};

const applyPreviewVideoSourceSeek = (video: HTMLVideoElement, visual: ClipTimelineVisualMaterial | undefined, localTimelineTime: number) => {
  const sourceTime = previewVideoSourceTime(visual, localTimelineTime, video.duration);
  video.currentTime = sourceTime;
};

const resizeClipStudioLayout = (
  startLayout: ClipStudioLayout,
  type: 'left' | 'right' | 'timeline',
  deltaX: number,
  deltaY: number,
) => {
  return sanitizeClipStudioLayout({
    leftWidth: type === 'left' ? startLayout.leftWidth + deltaX : startLayout.leftWidth,
    rightWidth: type === 'right' ? startLayout.rightWidth - deltaX : startLayout.rightWidth,
    topHeight: type === 'timeline' ? startLayout.topHeight + deltaY : startLayout.topHeight,
  });
};

const visualItemsOverlap = (
  first: { start: number; duration: number },
  second: { start: number; duration: number },
) => {
  const firstStart = Math.max(0, Number(first.start || 0));
  const secondStart = Math.max(0, Number(second.start || 0));
  const firstEnd = firstStart + Math.max(0, Number(first.duration || 0));
  const secondEnd = secondStart + Math.max(0, Number(second.duration || 0));
  return firstStart < secondEnd && secondStart < firstEnd;
};

const CLIP_TRANSITION_PRESETS: Array<{ id: ClipTransitionPreset; label: string }> = [
  { id: 'none', label: '无转场' },
  { id: 'fade', label: '叠化' },
  { id: 'wipeleft', label: '左擦除' },
  { id: 'wiperight', label: '右擦除' },
  { id: 'slideleft', label: '左滑' },
  { id: 'slideright', label: '右滑' },
];

const CLIP_PLATFORM_PRESETS = [
  { label: '抖音竖版', ratio: '9:16', resolution: '1080p', fps: 30 },
  { label: '小红书', ratio: '4:5', resolution: '1080p', fps: 30 },
  { label: '横版视频', ratio: '16:9', resolution: '1080p', fps: 30 },
  { label: '方图短片', ratio: '1:1', resolution: '1080p', fps: 30 },
  { label: '电影宽屏', ratio: '2.35:1', resolution: '1080p', fps: 24 },
] as const;

/* CSSgram is MIT licensed: https://github.com/una/CSSgram */
/* FFmpeg video effects are exported through libavfilter-compatible filter chains. */

interface ClipStudioEditorProps {
  open: boolean;
  status: ClipStudioStatus;
  outputUrl: string;
  error: string;
  exportSettings: SanitizedClipExportSettings;
  draft: ClipProject;
  timelineVisuals: ClipTimelineVisualMaterial[];
  audios: ClipMaterial[];
  texts: ClipMaterial[];
  canvasMaterials: Material[];
  resourceMaterials: Material[];
  resourceLoading: boolean;
  imageDuration: number;
  ratio: string;
  clipRatioMode: ClipRatioMode;
  resolution: string;
  fps: number;
  background: string;
  editorLayout: ClipStudioLayout;
  trackHeights: ClipTrackHeights;
  coverUrl: string;
  coverTime: number;
  visualTransforms: Record<string, ClipVisualTransform>;
  clipVisualKeyframes: Record<string, ClipVisualKeyframe[]>;
  canRender: boolean;
  canUndoEdit: boolean;
  canRedoEdit: boolean;
  onClose: () => void;
  onRender: () => void;
  onImportFiles: (files: File[]) => void;
  onImportCoverFile: (file: File) => Promise<void>;
  onImportMaterial: (material: Material, insertAt?: Partial<ClipTimelineInsertTiming>) => void;
  onRefreshResourceLibrary: () => void;
  onMoveVisual: (visualId: string, direction: -1 | 1) => void;
  onReorderVisual: (draggedId: string, targetId: string) => void;
  onReorderVisualByDropX: (draggedId: string, dropX: number, pixelsPerSecond: number) => void;
  onToggleVisual: (visualId: string) => void;
  onRemoveVisual: (visualId: string) => void;
  onSplitVisual: (visualId: string) => void;
  onSplitVisualAtTime: (visualId: string, time: number) => void;
  onSplitLinkedAtTime: (visualId: string, time: number) => void;
  onTrimVisualSide: (visualId: string, time: number, side: 'left' | 'right') => void;
  onDuplicateVisual: (visualId: string) => void;
  onDuplicateVisualToLane: (visualId: string, laneDelta: -1 | 1) => void;
  onDuplicateVisualByDrag: (visualId: string, start: number, lane: number) => void;
  onUpdateVisualDuration: (visualId: string, duration: number) => void;
  onUpdateVisualStart: (visualId: string, start: number, lane?: number) => void;
  onUpdateVisualTiming: (visualId: string, start: number, duration: number, trimStart?: number) => void;
  onSetVisualLaneVisibility: (lane: number, visible: boolean) => void;
  onCompactTimeline: () => void;
  onCleanupTimelineMedia: () => void;
  onApplyQuickTemplate: (templateId: QuickClipTemplateId) => void;
  onUpdateVisualTransform: (visualId: string, transform: ClipVisualTransform) => void;
  onUpdateVisualKeyframes: (visualId: string, keyframes: ClipVisualKeyframe[]) => void;
  onUpdateVisualFilter: (visualId: string, patch: ClipVisualFilterPatch) => void;
  onUndoEdit: () => void;
  onRedoEdit: () => void;
  onUpdateAudioTiming: (clipId: string, start: number, duration: number, trimStart?: number) => void;
  onUpdateAudioSettings: (clipId: string, patch: Partial<ClipMaterial>) => void;
  onRemoveAudio: (clipId: string) => void;
  onDuplicateAudio: (clipId: string) => void;
  onSplitAudioAtTime: (clipId: string, time: number) => void;
  onUpdateTextTiming: (clipId: string, start: number, duration: number) => void;
  onUpdateTextSettings: (clipId: string, patch: Partial<ClipMaterial>) => void;
  onRemoveText: (clipId: string) => void;
  onDuplicateText: (clipId: string) => void;
  onSplitTextAtTime: (clipId: string, time: number) => void;
  onCreateTextClip: (text?: string) => void;
  onCreateGenerationClip: (nodeType: ClipGenerationNodeType, insertAt?: ClipGenerationInsertDraft) => void;
  onUpdateGenerationClip: (visualId: string, patch: Partial<ClipGenerationState>) => void;
  onUploadGenerationRefs: (visualId: string, files: FileList | null, kind?: 'image' | 'video' | 'audio') => Promise<void>;
  onRunGenerationClip: (visualId: string) => Promise<void>;
  onPatchSettings: (payload: Record<string, unknown>) => void;
}

export interface ClipVisualTransform {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

function formatSeconds(value: number, frameRate = 30) {
  if (!Number.isFinite(value) || value <= 0) return '00:00:00:00';
  const safeFrameRate = Math.max(1, Math.round(frameRate || 30));
  const whole = Math.floor(value);
  const frames = Math.min(safeFrameRate - 1, Math.round((value - whole) * safeFrameRate));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function shortSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0s';
  return value < 60 ? `${Math.round(value * 10) / 10}s` : `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function sourceName(item: { label?: string; url?: string; text?: string }) {
  return item.label || (item.url ? fileNameFromUrl(item.url) : item.text || '素材');
}

function generationRefsToMaterials(refs: ClipGenerationRef[] = [], sourceNodeId = ''): Record<ClipGenerationReferenceKind, Material[]> {
  const toMaterial = (ref: ClipGenerationRef, index: number): Material => ({
    id: ref.id || `generation-ref-${index}`,
    kind: ref.kind === 'video' ? 'video' : ref.kind === 'audio' ? 'audio' : 'image',
    url: ref.url || '',
    sourceNodeId,
    origin: 'local',
    label: ref.label || ref.url,
  });
  return {
    image: refs.filter((ref) => ref.kind === 'image' && ref.url).map(toMaterial),
    video: refs.filter((ref) => ref.kind === 'video' && ref.url).map(toMaterial),
    audio: refs.filter((ref) => ref.kind === 'audio' && ref.url).map(toMaterial),
  };
}

function generationStatusLabel(status: ClipGenerationState['status']) {
  if (status === 'draft') return '未配置';
  if (status === 'queued') return '排队中';
  if (status === 'running') return '生成中';
  if (status === 'success') return '已生成';
  if (status === 'error') return '失败';
  return '已取消';
}

function clipPresetCssFilter(item?: Pick<ClipTimelineVisualMaterial, 'filter' | 'intensity'>) {
  const amount = Math.max(0, Math.min(100, Number(item?.intensity ?? 65))) / 100;
  if (item?.filter === 'cinematic') return `contrast(${1 + amount * 0.2}) brightness(${1 + amount * 0.05}) saturate(${1 + amount * 0.3})`;
  if (item?.filter === 'warm') return `contrast(${1 + amount * 0.08}) brightness(${1 + amount * 0.02}) saturate(${1 + amount * 0.22}) sepia(${amount * 0.22})`;
  if (item?.filter === 'cool') return `contrast(${1 + amount * 0.06}) saturate(${1 + amount * 0.12}) hue-rotate(${Math.round(amount * -8)}deg)`;
  if (item?.filter === 'bw') return `grayscale(1) contrast(${1 + amount * 0.16}) brightness(${1 + amount * 0.02})`;
  if (item?.filter === 'vivid') return `contrast(${1 + amount * 0.16}) brightness(${1 + amount * 0.02}) saturate(${1 + amount * 0.45})`;
  if (item?.filter === 'fade') return `contrast(${1 - amount * 0.18}) brightness(${1 + amount * 0.04}) saturate(${1 - amount * 0.35})`;
  if (item?.filter === 'color-teal-orange') return `contrast(${1 + amount * 0.16}) saturate(${1 + amount * 0.18}) hue-rotate(${Math.round(-6 * amount)}deg)`;
  if (item?.filter === 'color-japanese-clean') return `brightness(${1 + amount * 0.12}) contrast(${1 - amount * 0.08}) saturate(${1 - amount * 0.08}) sepia(${amount * 0.06})`;
  if (item?.filter === 'color-food') return `brightness(${1 + amount * 0.08}) contrast(${1 + amount * 0.08}) saturate(${1 + amount * 0.32}) sepia(${amount * 0.12})`;
  if (item?.filter === 'color-night') return `contrast(${1 + amount * 0.18}) brightness(${1 - amount * 0.06}) saturate(${1 + amount * 0.28}) hue-rotate(${Math.round(-12 * amount)}deg)`;
  if (item?.filter === 'color-portrait-soft') return `brightness(${1 + amount * 0.08}) contrast(${1 - amount * 0.08}) saturate(${1 + amount * 0.08}) sepia(${amount * 0.05})`;
  if (item?.filter === 'color-product-clean') return `brightness(${1 + amount * 0.06}) contrast(${1 + amount * 0.12}) saturate(${1 - amount * 0.04})`;
  if (item?.filter === 'color-cyberpunk') return `contrast(${1 + amount * 0.22}) saturate(${1 + amount * 0.42}) hue-rotate(${Math.round(18 * amount)}deg)`;
  if (item?.filter === 'color-sunset') return `brightness(${1 + amount * 0.06}) contrast(${1 + amount * 0.1}) saturate(${1 + amount * 0.24}) sepia(${amount * 0.22})`;
  if (item?.filter === 'color-documentary') return `contrast(${1 + amount * 0.14}) saturate(${1 - amount * 0.18}) brightness(${1 - amount * 0.02})`;
  if (item?.filter === 'color-matte-film') return `contrast(${1 - amount * 0.12}) brightness(${1 + amount * 0.06}) saturate(${1 - amount * 0.12}) sepia(${amount * 0.1})`;
  if (item?.filter === 'color-clean-bright') return `brightness(${1 + amount * 0.14}) contrast(${1 + amount * 0.06}) saturate(${1 + amount * 0.08})`;
  if (item?.filter === 'color-moody-fall') return `brightness(${1 - amount * 0.03}) contrast(${1 + amount * 0.12}) saturate(${1 - amount * 0.1}) sepia(${amount * 0.2})`;
  if (item?.filter === 'color-korean-soft') return `brightness(${1 + amount * 0.1}) contrast(${1 - amount * 0.1}) saturate(${1 + amount * 0.04}) sepia(${amount * 0.08})`;
  if (item?.filter === 'color-blue-hour') return `brightness(${1 - amount * 0.04}) contrast(${1 + amount * 0.12}) saturate(${1 + amount * 0.12}) hue-rotate(${Math.round(-18 * amount)}deg)`;
  if (item?.filter === 'color-fashion-contrast') return `contrast(${1 + amount * 0.28}) brightness(${1 - amount * 0.02}) saturate(${1 - amount * 0.06})`;
  if (item?.filter === 'color-vlog-natural') return `brightness(${1 + amount * 0.06}) contrast(${1 + amount * 0.05}) saturate(${1 + amount * 0.12})`;
  if (item?.filter === 'color-anime-pop') return `contrast(${1 + amount * 0.18}) brightness(${1 + amount * 0.04}) saturate(${1 + amount * 0.58})`;
  if (item?.filter === 'cssgram-clarendon') return `contrast(${1 + amount * 0.2}) saturate(${1 + amount * 0.35})`;
  if (item?.filter === 'cssgram-moon') return `grayscale(${amount}) contrast(${1 + amount * 0.1}) brightness(${1 + amount * 0.1})`;
  if (item?.filter === 'cssgram-lofi') return `saturate(${1 + amount * 0.1}) contrast(${1 + amount * 0.5})`;
  if (item?.filter === 'cssgram-aden') return `hue-rotate(${Math.round(-20 * amount)}deg) contrast(${1 - amount * 0.1}) saturate(${1 - amount * 0.15}) brightness(${1 + amount * 0.2})`;
  if (item?.filter === 'cssgram-reyes') return `sepia(${amount * 0.22}) brightness(${1 + amount * 0.1}) contrast(${1 - amount * 0.15}) saturate(${1 - amount * 0.25})`;
  if (item?.filter === 'cssgram-gingham') return `brightness(${1 + amount * 0.05}) hue-rotate(${Math.round(-10 * amount)}deg)`;
  if (item?.filter === 'cssgram-walden') return `brightness(${1 + amount * 0.1}) hue-rotate(${Math.round(-10 * amount)}deg) sepia(${amount * 0.3}) saturate(${1 + amount * 0.6})`;
  if (item?.filter === 'cssgram-hudson') return `brightness(${1 + amount * 0.2}) contrast(${1 - amount * 0.1}) saturate(${1 + amount * 0.1})`;
  if (item?.filter === 'cssgram-inkwell') return `sepia(${amount * 0.3}) contrast(${1 + amount * 0.1}) brightness(${1 + amount * 0.1}) grayscale(${amount})`;
  if (item?.filter === 'cssgram-nashville') return `sepia(${amount * 0.2}) contrast(${1 + amount * 0.2}) brightness(${1 + amount * 0.05}) saturate(${1 + amount * 0.2})`;
  if (item?.filter === 'ffmpeg-sharpen') return `contrast(${1 + amount * 0.12}) saturate(${1 + amount * 0.08})`;
  if (item?.filter === 'ffmpeg-denoise') return `contrast(${1 - amount * 0.04}) saturate(${1 - amount * 0.05})`;
  if (item?.filter === 'ffmpeg-vignette') return `brightness(${1 - amount * 0.08}) contrast(${1 + amount * 0.08})`;
  if (item?.filter === 'ffmpeg-film-grain') return `contrast(${1 + amount * 0.08}) saturate(${1 - amount * 0.08}) sepia(${amount * 0.08})`;
  if (item?.filter === 'ffmpeg-soft-glow') return `brightness(${1 + amount * 0.08}) contrast(${1 - amount * 0.1}) saturate(${1 + amount * 0.06})`;
  if (item?.filter === 'ffmpeg-retro') return `sepia(${amount * 0.28}) contrast(${1 + amount * 0.12}) saturate(${1 - amount * 0.16}) hue-rotate(${Math.round(-8 * amount)}deg)`;
  if (item?.filter === 'ffmpeg-sketch') return `grayscale(${amount}) contrast(${1 + amount * 0.55}) brightness(${1 + amount * 0.05})`;
  if (item?.filter === 'ffmpeg-scanlines') return `contrast(${1 + amount * 0.2}) brightness(${1 - amount * 0.04}) saturate(${1 - amount * 0.08})`;
  if (item?.filter === 'ffmpeg-high-contrast-bw') return `grayscale(1) contrast(${1 + amount * 0.6}) brightness(${1 - amount * 0.05})`;
  if (item?.filter === 'ffmpeg-dream-blur') return `brightness(${1 + amount * 0.12}) contrast(${1 - amount * 0.16}) saturate(${1 + amount * 0.12})`;
  if (item?.filter === 'ffmpeg-vhs') return `contrast(${1 + amount * 0.18}) saturate(${1 - amount * 0.18}) sepia(${amount * 0.12}) hue-rotate(${Math.round(-5 * amount)}deg)`;
  if (item?.filter === 'ffmpeg-comic') return `contrast(${1 + amount * 0.65}) saturate(${1 + amount * 0.18}) brightness(${1 + amount * 0.03})`;
  if (item?.filter === 'ffmpeg-cctv') return `grayscale(${amount * 0.65}) contrast(${1 + amount * 0.18}) brightness(${1 - amount * 0.08})`;
  if (item?.filter === 'ffmpeg-light-leak') return `brightness(${1 + amount * 0.18}) contrast(${1 - amount * 0.08}) saturate(${1 + amount * 0.16}) sepia(${amount * 0.18})`;
  if (item?.filter === 'ffmpeg-neon-edge') return `contrast(${1 + amount * 0.36}) saturate(${1 + amount * 0.44}) hue-rotate(${Math.round(16 * amount)}deg)`;
  return 'none';
}

function clipColorHue(item?: Pick<ClipTimelineVisualMaterial, 'hue'>) {
  const value = Number(item?.hue ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-180, Math.min(180, Math.round(value)));
}

function clipColorPercent(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(0, Math.min(200, Math.round(numberValue)));
}

function clipBasicCssFilter(item?: Pick<ClipTimelineVisualMaterial, 'hue' | 'saturation' | 'brightness' | 'contrast'>) {
  return [
    `hue-rotate(${clipColorHue(item)}deg)`,
    `saturate(${clipColorPercent(item?.saturation, 100) / 100})`,
    `brightness(${clipColorPercent(item?.brightness, 100) / 100})`,
    `contrast(${clipColorPercent(item?.contrast, 100) / 100})`,
  ].join(' ');
}

function clipCssFilter(item?: Pick<ClipTimelineVisualMaterial, 'filter' | 'intensity' | 'hue' | 'saturation' | 'brightness' | 'contrast'>) {
  const preset = clipPresetCssFilter(item);
  return [
    preset === 'none' ? '' : preset,
    clipBasicCssFilter(item),
  ].filter(Boolean).join(' ') || 'none';
}

function TimelineVideoFrame({ src, sourceTime }: { src: string; sourceTime: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const seek = () => {
      const safeDuration = Number.isFinite(video.duration) ? video.duration : sourceTime;
      const target = Math.max(0, Math.min(sourceTime, Math.max(0, safeDuration - 0.04)));
      if (Math.abs((video.currentTime || 0) - target) > 0.04) {
        try {
          video.currentTime = target;
        } catch {
          // Some remote videos reject programmatic seeks until metadata is ready.
        }
      }
    };
    seek();
    video.addEventListener('loadedmetadata', seek);
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [sourceTime, src]);

  return <video ref={videoRef} className="h-full w-full object-cover" src={src} muted preload="metadata" />;
}

const MemoTimelineVideoFrame = memo(TimelineVideoFrame);

const panelBg = 't8-clip-panel-surface bg-[#242424]';
const border = 't8-clip-border border-[#363636]';
const editorButton = 't8-clip-button nodrag inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50';
const iconButton = 't8-clip-icon-button nodrag inline-flex h-6 w-6 items-center justify-center rounded border border-[#3d3d3d] bg-[#202020] text-[11px] text-zinc-400 hover:bg-[#303030] hover:text-white disabled:cursor-not-allowed disabled:opacity-35';
const fieldClass = 't8-clip-field nodrag h-7 w-full rounded border border-[#454545] bg-[#191919] px-2 text-[11px] text-zinc-100 outline-none focus:border-emerald-400';
const paramPaneClass = 't8-clip-param-pane t8-clip-scroll-region space-y-3 overflow-auto p-4 text-xs';
const paramCardClass = 't8-clip-param-card rounded border p-3';
const paramLabelClass = 't8-clip-param-label text-zinc-500';
const paramRangeClass = 't8-clip-param-range nodrag h-1 w-full';
const paramActionClass = 't8-clip-param-action rounded border px-1.5 py-1 text-[10px] font-black transition active:scale-95';

export default function ClipStudioEditor({
  open,
  status,
  outputUrl,
  error,
  exportSettings,
  draft,
  timelineVisuals,
  audios,
  texts,
  canvasMaterials,
  resourceMaterials,
  resourceLoading,
  imageDuration,
  ratio,
  clipRatioMode,
  resolution,
  fps,
  background,
  editorLayout,
  trackHeights,
  coverUrl,
  coverTime,
  visualTransforms,
  clipVisualKeyframes,
  canRender,
  canUndoEdit,
  canRedoEdit,
  onClose,
  onRender,
  onImportFiles,
  onImportCoverFile,
  onImportMaterial,
  onRefreshResourceLibrary,
  onMoveVisual,
  onReorderVisual,
  onReorderVisualByDropX,
  onToggleVisual,
  onRemoveVisual,
  onSplitVisual,
  onSplitVisualAtTime,
  onSplitLinkedAtTime,
  onTrimVisualSide,
  onDuplicateVisual,
  onDuplicateVisualToLane,
  onDuplicateVisualByDrag,
  onUpdateVisualDuration,
  onUpdateVisualStart,
  onUpdateVisualTiming,
  onSetVisualLaneVisibility,
  onCompactTimeline,
  onCleanupTimelineMedia,
  onApplyQuickTemplate,
  onUpdateVisualTransform,
  onUpdateVisualKeyframes,
  onUpdateVisualFilter,
  onUndoEdit,
  onRedoEdit,
  onUpdateAudioTiming,
  onUpdateAudioSettings,
  onRemoveAudio,
  onDuplicateAudio,
  onSplitAudioAtTime,
  onUpdateTextTiming,
  onUpdateTextSettings,
  onRemoveText,
  onDuplicateText,
  onSplitTextAtTime,
  onCreateTextClip,
  onCreateGenerationClip,
  onUpdateGenerationClip,
  onUploadGenerationRefs,
  onRunGenerationClip,
  onPatchSettings,
}: ClipStudioEditorProps) {
  const [tab, setTab] = useState<MediaTab>('media');
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [mediaSource, setMediaSource] = useState<MediaSource>('import');
  const [soundSource, setSoundSource] = useState<SoundSource>('canvas-audio');
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(38);
  const [playing, setPlaying] = useState(false);
  const [linkMode, setLinkMode] = useState(true);
  const [snapMode, setSnapMode] = useState(true);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverTab, setCoverTab] = useState<'frame' | 'local'>('frame');
  const [coverDraftTime, setCoverDraftTime] = useState(coverTime || 0);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [previewFit, setPreviewFit] = useState<ClipPreviewFit>('contain');
  const [previewScale, setPreviewScale] = useState(100);
  const [commandFeedback, setCommandFeedback] = useState('');
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [generationPanelClipId, setGenerationPanelClipId] = useState('');
  const [generationPanelMeasuredHeight, setGenerationPanelMeasuredHeight] = useState(300);
  const [generationPanelBounds, setGenerationPanelBounds] = useState({ width: 0, height: 0 });
  const [generationPromptDraft, setGenerationPromptDraft] = useState('');
  const [generationPromptComposing, setGenerationPromptComposing] = useState(false);
  const [generationRefUploadKind, setGenerationRefUploadKind] = useState<'image' | 'video' | 'audio'>('image');
  const [generationStatusFilter, setGenerationStatusFilter] = useState<'all' | 'unfinished' | 'draft' | 'running' | 'error' | 'success'>('all');
  const [generationRefDropTargetId, setGenerationRefDropTargetId] = useState('');
  const [selectedVisualGenerationRefUploadKind, setSelectedVisualGenerationRefUploadKind] = useState<'image' | 'video' | 'audio'>('image');
  const [isDragOverImport, setIsDragOverImport] = useState(false);
  const [visualMaterialDragY, setVisualMaterialDragY] = useState<number | null>(null);
  const [visualLaneInsertIntent, setVisualLaneInsertIntent] = useState<'top' | 'bottom' | null>(null);
  const [timelineScrollVersion, setTimelineScrollVersion] = useState(0);
  const [trackVisibility, setTrackVisibility] = useState<Record<string, boolean>>({});
  const [trackLocks, setTrackLocks] = useState<Record<string, boolean>>({});
  const [trackSolo, setTrackSolo] = useState('');
  const [trackCollapsed, setTrackCollapsed] = useState<Record<string, boolean>>({});
  const [clipContextMenu, setClipContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
    kind: 'visual' | 'audio' | 'text';
  } | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    mode: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
    clipStart: number;
    clipDuration: number;
    trimStart: number;
    grabOffsetSeconds: number;
    copyMode: boolean;
    lane: number;
  } | null>(null);
  const [layoutState, setLayoutState] = useState<ClipStudioLayout>(() => sanitizeClipStudioLayout(editorLayout));
  const [resizeState, setResizeState] = useState<{
    type: 'left' | 'right' | 'timeline';
    startX: number;
    startY: number;
    startLayout: ClipStudioLayout;
  } | null>(null);
  const [trackResizeState, setTrackResizeState] = useState<{
    id: ClipTimelineTrackId;
    startY: number;
    startHeight: number;
  } | null>(null);
  const apiSettings = useApiKeysStore((state) => state.settings);
  const clipImageModels = useMemo(() => modelsForKind(apiSettings, 'image'), [apiSettings]);
  const clipVideoModels = useMemo(() => modelsForKind(apiSettings, 'video'), [apiSettings]);
  const [timelineScrubActive, setTimelineScrubActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const lutFileInputRef = useRef<HTMLInputElement>(null);
  const generationRefInputRef = useRef<HTMLInputElement>(null);
  const selectedVisualGenerationRefInputRef = useRef<HTMLInputElement>(null);
  const generationPanelRef = useRef<HTMLDivElement>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const editorMainRef = useRef<HTMLElement>(null);
  const topRowPanelRef = useRef<HTMLElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineTrackListRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<typeof dragState>(null);
  const resizeStateRef = useRef<typeof resizeState>(null);
  const trackResizeStateRef = useRef<typeof trackResizeState>(null);
  const timelineScrubActiveRef = useRef(timelineScrubActive);
  const timelineScrollFrameRef = useRef<number | null>(null);
  const dragMoveFrameRef = useRef<number | null>(null);
  const pendingDragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const visualLaneInsertIntentRef = useRef<'top' | 'bottom' | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const lastPlaybackTickRef = useRef<number | null>(null);
  const commandFeedbackTimerRef = useRef<number | null>(null);
  const playheadFollowRef = useRef<number | null>(null);
  const duration = clipProjectDuration(draft);
  const exportableTimelineVisuals = timelineVisuals.filter((item) => !item.sourceInvalid);
  const activeVisuals = timelineVisuals.filter((item) => !item.disabled && !item.sourceInvalid);
  const selectedTimelineVisual = timelineVisuals.find((item) => item.id === selectedId);
  const selectedVisual = selectedTimelineVisual;
  const previewFallbackVisual = activeVisuals[0];
  const selectedAudio = audios.find((item, index) => (item.id || item.url || `audio-${index}`) === selectedId);
  const selectedText = texts.find((item, index) => (item.id || item.text || `text-${index}`) === selectedId);
  const selectedKind = selectedAudio ? 'audio' : selectedText ? 'text' : selectedTimelineVisual ? 'visual' : 'none';
  const selectedClipIds = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedClipCount = selectedClipIds.size;
  const selectClip = (id: string, event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
    if (!id) return;
    const additive = Boolean(event && (event.shiftKey || event.metaKey || event.ctrlKey));
    if (!additive) {
      setSelectedId(id);
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      setSelectedId(next.includes(id) ? id : next[0] || '');
      return next;
    });
  };
  const selectedGenerationVisual = timelineVisuals.find((item) => item.id === generationPanelClipId && item.generation && item.generation.status !== 'success');
  const selectedGeneration = selectedGenerationVisual?.generation;
  const selectedGenerationChoice = selectedGeneration
    ? resolveClipGenerationChoice(selectedGeneration.nodeType, {
      model: selectedGeneration.model,
      mainId: selectedGeneration.mainId,
      apiModel: selectedGeneration.apiModel,
      params: selectedGeneration.params,
      catalogModels: selectedGeneration.nodeType === 'image' ? clipImageModels : clipVideoModels,
    })
    : undefined;
  const selectedGenerationParams = selectedGenerationChoice
    ? normalizeClipGenerationParams(selectedGenerationChoice, selectedGeneration?.params)
    : {};
  const selectedGenerationModelGroups = selectedGeneration
    ? clipGenerationModelGroupOptions(selectedGeneration.nodeType, selectedGeneration.nodeType === 'image' ? clipImageModels : clipVideoModels)
    : [];
  const selectedGenerationControls = selectedGenerationChoice
    ? visibleClipGenerationControls(selectedGenerationChoice.sidebarParameterGroups, selectedGenerationChoice.apiModel)
    : [];
  const generationReferenceSupportFor = (generation: ClipGenerationState | undefined): ClipGenerationReferenceSupport => {
    if (!generation) return { groups: [] as Array<'image' | 'video' | 'audio'>, maxImages: 0, maxVideos: 0, maxAudios: 0, accept: 'image/*' };
    const choice = resolveClipGenerationChoice(generation.nodeType, {
      model: generation.model,
      mainId: generation.mainId,
      apiModel: generation.apiModel,
      params: generation.params,
      catalogModels: generation.nodeType === 'image' ? clipImageModels : clipVideoModels,
    });
    return clipGenerationReferenceSupport(choice);
  };
  const selectedGenerationReferenceSupport = selectedGenerationChoice
    ? clipGenerationReferenceSupport(selectedGenerationChoice)
    : generationReferenceSupportFor(selectedGeneration);
  const selectedGenerationReferenceAccept = selectedGenerationReferenceSupport.accept || 'image/*';
  const selectedVisualGeneration = selectedVisual?.generation;
  const selectedVisualGenerationChoice = selectedVisualGeneration
    ? resolveClipGenerationChoice(selectedVisualGeneration.nodeType, {
      model: selectedVisualGeneration.model,
      mainId: selectedVisualGeneration.mainId,
      apiModel: selectedVisualGeneration.apiModel,
      params: selectedVisualGeneration.params,
      catalogModels: selectedVisualGeneration.nodeType === 'image' ? clipImageModels : clipVideoModels,
    })
    : undefined;
  const selectedVisualGenerationParams = selectedVisualGenerationChoice
    ? normalizeClipGenerationParams(selectedVisualGenerationChoice, selectedVisualGeneration?.params)
    : {};
  const selectedVisualGenerationModelGroups = selectedVisualGeneration
    ? clipGenerationModelGroupOptions(selectedVisualGeneration.nodeType, selectedVisualGeneration.nodeType === 'image' ? clipImageModels : clipVideoModels)
    : [];
  const selectedVisualGenerationControls = selectedVisualGenerationChoice
    ? visibleClipGenerationControls(selectedVisualGenerationChoice.sidebarParameterGroups, selectedVisualGenerationChoice.apiModel)
    : [];
  const selectedVisualGenerationReferenceSupport = selectedVisualGenerationChoice
    ? clipGenerationReferenceSupport(selectedVisualGenerationChoice)
    : generationReferenceSupportFor(selectedVisualGeneration);
  const selectedVisualGenerationReferenceAccept = selectedVisualGenerationReferenceSupport.accept || 'image/*';
  const generationRefMaterialsByKind = useMemo(() => {
    return generationRefsToMaterials(selectedGeneration?.refs || [], selectedGenerationVisual?.id || '');
  }, [selectedGeneration?.refs, selectedGenerationVisual?.id]);
  const selectedVisualGenerationRefMaterialsByKind = useMemo(() => {
    return generationRefsToMaterials(selectedVisualGeneration?.refs || [], selectedVisual?.id || '');
  }, [selectedVisual?.id, selectedVisualGeneration?.refs]);
  const updateGenerationRefsForVisual = (visualId: string, refs: NonNullable<ClipGenerationState['refs']>) => {
    if (!visualId) return;
    onUpdateGenerationClip(visualId, { refs });
  };
  const updateGenerationRefs = (refs: NonNullable<ClipGenerationState['refs']>) => {
    updateGenerationRefsForVisual(selectedGenerationVisual?.id || '', refs);
  };
  const updateSelectedVisualGenerationRefs = (refs: NonNullable<ClipGenerationState['refs']>) => {
    updateGenerationRefsForVisual(selectedVisual?.id || '', refs);
  };
  const addGenerationMaterialRefForVisual = (
    visualId: string,
    generation: ClipGenerationState | undefined,
    referenceSupport: ClipGenerationReferenceSupport,
    material: ClipMediaShelfItem,
    role: ClipGenerationRef['role'] = material.kind === 'audio' ? 'audio' : 'reference',
  ) => {
    if (!visualId || !generation || material.id === visualId || material.kind === 'audio' && !material.url) return false;
    if (material.kind !== 'image' && material.kind !== 'video' && material.kind !== 'audio') return false;
    const limit = clipGenerationRefLimitForKind(referenceSupport, material.kind);
    if (limit <= 0) return false;
    const refs = generation.refs || [];
    if (refs.some((ref) => ref.id === material.id || ref.url === material.url)) return false;
    if (refs.filter((ref) => ref.kind === material.kind).length >= limit) return false;
    updateGenerationRefsForVisual(visualId, [...refs, {
      id: material.id,
      kind: material.kind,
      url: material.url,
      label: material.label || sourceName(material),
      role,
      source: material.origin === 'canvas' ? 'canvas' : 'timeline',
      sourceClipId: material.origin === 'import' ? material.id : undefined,
      locked: true,
    }]);
    return true;
  };
  const addGenerationMaterialRef = (material: ClipMediaShelfItem) => {
    if (clipGenerationRefLimitForKind(selectedGenerationReferenceSupport, material.kind) <= 0) return;
    addGenerationMaterialRefForVisual(selectedGenerationVisual?.id || '', selectedGeneration, selectedGenerationReferenceSupport, material);
  };
  const addSelectedVisualGenerationMaterialRef = (material: ClipMediaShelfItem) => {
    addGenerationMaterialRefForVisual(selectedVisual?.id || '', selectedVisualGeneration, selectedVisualGenerationReferenceSupport, material);
  };
  const removeGenerationRef = (material: Material) => {
    if (!selectedGeneration) return;
    updateGenerationRefs((selectedGeneration.refs || []).filter((ref) => ref.id !== material.id && ref.url !== material.url));
  };
  const removeSelectedVisualGenerationRef = (material: Material) => {
    if (!selectedVisualGeneration) return;
    updateSelectedVisualGenerationRefs((selectedVisualGeneration.refs || []).filter((ref) => ref.id !== material.id && ref.url !== material.url));
  };
  const reorderGenerationRefs = (newOrder: string[]) => {
    if (!selectedGeneration) return;
    const refs = selectedGeneration.refs || [];
    const byId = new Map(refs.map((ref) => [ref.id, ref]));
    const ordered = newOrder.map((id) => byId.get(id)).filter((item): item is NonNullable<ClipGenerationState['refs']>[number] => Boolean(item));
    const rest = refs.filter((ref) => !newOrder.includes(ref.id));
    updateGenerationRefs([...ordered, ...rest]);
  };
  const reorderSelectedVisualGenerationRefs = (newOrder: string[]) => {
    if (!selectedVisualGeneration) return;
    const refs = selectedVisualGeneration.refs || [];
    const byId = new Map(refs.map((ref) => [ref.id, ref]));
    const ordered = newOrder.map((id) => byId.get(id)).filter((item): item is NonNullable<ClipGenerationState['refs']>[number] => Boolean(item));
    const rest = refs.filter((ref) => !newOrder.includes(ref.id));
    updateSelectedVisualGenerationRefs([...ordered, ...rest]);
  };
  const buildGenerationUploadActions = (
    generation: ClipGenerationState | undefined,
    referenceSupport: ClipGenerationReferenceSupport,
    setUploadKind: (kind: ClipGenerationReferenceKind) => void,
    inputRef: { current: HTMLInputElement | null },
  ) => {
    const labels = { image: '参考图', video: '参考视频', audio: '参考音频' };
    const actions: Partial<Record<ClipGenerationReferenceKind, { onClick: () => void; title: string; remaining: number }>> = {};
    referenceSupport.groups.forEach((kind) => {
      const limit = clipGenerationRefLimitForKind(referenceSupport, kind);
      const current = (generation?.refs || []).filter((ref) => ref.kind === kind).length;
      const remaining = Math.max(0, limit - current);
      if (remaining <= 0) return;
      actions[kind] = {
        title: `上传${labels[kind]}`,
        remaining,
        onClick: () => {
          setUploadKind(kind);
          inputRef.current?.click();
        },
      };
    });
    return actions;
  };
  const selectedGenerationUploadActions = useMemo(() => {
    return buildGenerationUploadActions(selectedGeneration, selectedGenerationReferenceSupport, setGenerationRefUploadKind, generationRefInputRef);
  }, [selectedGeneration?.refs, selectedGenerationReferenceSupport]);
  const selectedVisualGenerationUploadActions = useMemo(() => {
    return buildGenerationUploadActions(selectedVisualGeneration, selectedVisualGenerationReferenceSupport, setSelectedVisualGenerationRefUploadKind, selectedVisualGenerationRefInputRef);
  }, [selectedVisualGeneration?.refs, selectedVisualGenerationReferenceSupport]);
  useEffect(() => {
    if (generationPromptComposing) return;
    setGenerationPromptDraft(selectedGeneration?.prompt || '');
  }, [generationPanelClipId, selectedGeneration?.prompt, generationPromptComposing]);

  useOutsideClose({
    enabled: Boolean(open && generationPanelClipId),
    refs: generationPanelRef,
    onOutside: () => setGenerationPanelClipId(''),
    ignoreSelector: 'input, textarea, select, [contenteditable="true"], [data-clip-generation-inline-actions], [data-clip-generation-inline-settings]',
  });

  const commitGenerationPromptDraft = (nextPrompt: string) => {
    setGenerationPromptDraft(nextPrompt);
    if (!selectedGenerationVisual?.id) return;
    onUpdateGenerationClip(selectedGenerationVisual.id, { prompt: nextPrompt });
  };
  const applyGenerationModelGroup = (visualId: string, nodeType: ClipGenerationNodeType, mainId: string) => {
    if (!visualId) return;
    const nextChoice = resolveClipGenerationChoice(nodeType, {
      mainId,
      catalogModels: nodeType === 'image' ? clipImageModels : clipVideoModels,
    });
    onUpdateGenerationClip(visualId, {
      model: nextChoice.apiModel,
      mainId: nextChoice.mainId,
      apiModel: nextChoice.apiModel,
      params: defaultClipGenerationParams(nextChoice),
    });
  };
  const applyClipGenerationModelGroup = (mainId: string) => {
    if (!selectedGeneration?.nodeType || !selectedGenerationVisual?.id) return;
    applyGenerationModelGroup(selectedGenerationVisual.id, selectedGeneration.nodeType, mainId);
  };
  const applySelectedVisualGenerationModelGroup = (mainId: string) => {
    if (!selectedVisual?.id || !selectedVisual.generation?.nodeType) return;
    applyGenerationModelGroup(selectedVisual.id, selectedVisual.generation.nodeType, mainId);
  };
  const applyGenerationApiModel = (visualId: string, choice: ClipGenerationChoice, params: Record<string, unknown>, apiModel: string) => {
    if (!visualId) return;
    onUpdateGenerationClip(visualId, {
      model: apiModel,
      mainId: choice.mainId,
      apiModel,
      params: {
        ...params,
        apiModel,
        mainId: choice.mainId,
      },
    });
  };
  const applyClipGenerationApiModel = (apiModel: string) => {
    if (!selectedGenerationChoice || !selectedGenerationVisual?.id) return;
    applyGenerationApiModel(selectedGenerationVisual.id, selectedGenerationChoice, selectedGenerationParams, apiModel);
  };
  const applySelectedVisualGenerationApiModel = (apiModel: string) => {
    if (!selectedVisualGenerationChoice || !selectedVisual?.id) return;
    applyGenerationApiModel(selectedVisual.id, selectedVisualGenerationChoice, selectedVisualGenerationParams, apiModel);
  };
  const renderClipGenerationControl = (
    choice: ClipGenerationChoice,
    controls: ReturnType<typeof visibleClipGenerationControls>,
    params: Record<string, unknown>,
    visualId: string,
  ) => {
    if (!visualId) return null;
    return controls.map((control) => {
      const value = params[control.valueKey] ?? control.defaultValue ?? '';
    if (control.type === 'boolean') {
      return (
        <label
          key={control.id}
          data-clip-generation-control={control.id}
          data-clip-generation-node-type={choice.nodeType}
          data-show-when-api-model={control.showWhenApiModel?.join(',') || undefined}
          className="flex min-h-7 items-center gap-2 rounded border border-[#333] bg-black/20 px-2 py-1"
        >
          <input
            className="nodrag accent-emerald-400"
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(event) => onUpdateGenerationClip(visualId, { params: { [control.valueKey]: event.target.checked } })}
          />
          <span className="font-bold text-zinc-300">{control.label}</span>
        </label>
      );
    }
    if (control.type === 'select') {
      return (
        <label
          key={control.id}
          data-clip-generation-control={control.id}
          data-clip-generation-node-type={choice.nodeType}
          data-show-when-api-model={control.showWhenApiModel?.join(',') || undefined}
          className="block space-y-1"
        >
          <span className={paramLabelClass}>{control.label}</span>
          <select
            className={fieldClass}
            value={String(value)}
            onChange={(event) => onUpdateGenerationClip(visualId, { params: { [control.valueKey]: event.target.value } })}
          >
            {(control.options || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      );
    }
    return (
      <label
        key={control.id}
        data-clip-generation-control={control.id}
        data-clip-generation-node-type={choice.nodeType}
        data-show-when-api-model={control.showWhenApiModel?.join(',') || undefined}
        className="block space-y-1"
      >
        <span className={paramLabelClass}>{control.label}</span>
        <input
          className={fieldClass}
          type="number"
          min={control.min}
          max={control.max}
          step={control.step || 1}
          value={Number(value)}
          onChange={(event) => onUpdateGenerationClip(visualId, { params: { [control.valueKey]: Number(event.target.value) } })}
        />
      </label>
    );
    });
  };
  const mediaItems = useMemo<ClipMediaShelfItem[]>(() => {
    const timelineItems = [
      ...timelineVisuals.map((item) => ({ id: item.id || item.url || '', kind: item.kind, label: item.label, url: item.url, origin: 'import' as const })),
      ...audios.map((item, index) => ({ id: item.id || item.url || `audio-${index}`, kind: 'audio' as const, label: item.label, url: item.url, origin: 'import' as const })),
    ];
    const canvasItems = canvasMaterials.map((item) => ({ id: item.id, kind: item.kind, label: item.label, url: item.url, origin: 'canvas' as const }));
    const assetItems = resourceMaterials.map((item) => ({ id: item.id, kind: item.kind, label: item.label, url: item.url, origin: 'assets' as const }));
    const historyItems = [...timelineItems].reverse();
    const sourceItems = mediaSource === 'canvas' ? canvasItems : mediaSource === 'assets' ? assetItems : mediaSource === 'history' ? historyItems : timelineItems;
    return sourceItems
      .filter((item) => item.kind !== 'text' && (filter === 'all' || item.kind === filter))
      .map((item) => ({
        id: item.id,
        kind: item.kind as 'image' | 'video' | 'audio',
        label: item.label,
        url: item.url,
        origin: item.origin as MediaSource,
      }));
  }, [audios, canvasMaterials, filter, mediaSource, resourceMaterials, timelineVisuals]);
  const pixelsPerSecond = 16 + zoom * 0.9;
  const timelineLayout = useMemo(() => computeClipTimelineLayout(timelineVisuals, {
    fallbackDuration: imageDuration,
    pixelsPerSecond,
    gapPixels: 6,
    minClipWidth: 72,
  }), [imageDuration, pixelsPerSecond, timelineVisuals]);
  const resolveDragSourceTiming = (clipId: string, currentTrimStart: number) => {
    const visual = timelineLayout.items.find((item) => item.id === clipId);
    if (visual) {
      const timing = { speed: sanitizeSpeed(visual.speed) };
      return visual.kind === 'video' ? { ...timing, trimStart: currentTrimStart } : timing;
    }
    const audio = audios.find((item, index) => (item.id || item.url || `audio-${index}`) === clipId);
    if (audio) return { speed: sanitizeSpeed(audio.speed), trimStart: currentTrimStart };
    return { speed: 1 };
  };
  const generationTrackItems = useMemo(() => timelineLayout.items.filter((item) => item.generation), [timelineLayout.items]);
  const generationQueueSummary = useMemo(() => {
    const summary = {
      total: generationTrackItems.length,
      draft: 0,
      running: 0,
      error: 0,
      success: 0,
      unfinished: 0,
      missingPrompt: 0,
      runnable: 0,
    };
    generationTrackItems.forEach((item) => {
      const status = item.generation?.status || 'draft';
      if (status === 'running' || status === 'queued') summary.running += 1;
      else if (status === 'error') summary.error += 1;
      else if (status === 'success') summary.success += 1;
      else summary.draft += 1;
      if (status !== 'success') summary.unfinished += 1;
      if (status !== 'success' && status !== 'running' && status !== 'queued') {
        if (item.generation?.prompt?.trim()) summary.runnable += 1;
        else summary.missingPrompt += 1;
      }
    });
    return summary;
  }, [generationTrackItems]);
  const generationMatchesStatusFilter = (item: { generation?: ClipGenerationState }) => {
    const generation = item.generation;
    if (!generation || generationStatusFilter === 'all') return true;
    if (generationStatusFilter === 'unfinished') return generation.status !== 'success';
    if (generationStatusFilter === 'running') return generation.status === 'running' || generation.status === 'queued';
    return generation.status === generationStatusFilter;
  };
  const pendingGenerationVisuals = useMemo(() => timelineVisuals.filter((item) => {
    const status = item.generation?.status;
    return item.id && item.generation && status !== 'success' && status !== 'running' && status !== 'queued';
  }), [timelineVisuals]);
  const erroredGenerationVisuals = useMemo(() => timelineVisuals.filter((item) => item.id && item.generation?.status === 'error'), [timelineVisuals]);
  const firstBlockedGeneration = pendingGenerationVisuals.find((item) => !item.generation?.prompt?.trim());
  const runnablePendingGenerationVisuals = pendingGenerationVisuals.filter((item) => item.generation?.prompt?.trim());
  const timelineItemToShelfMaterial = (item: { id?: string; kind?: string; label?: string; url?: string }): ClipMediaShelfItem | null => {
    if (!item.id || !item.url || (item.kind !== 'image' && item.kind !== 'video')) return null;
    return {
      id: item.id,
      kind: item.kind,
      label: item.label || sourceName(item),
      url: item.url,
      origin: 'import',
    };
  };
  const buildGenerationRefSuggestions = (
    visualId: string,
    generation: ClipGenerationState | undefined,
  ): ClipGenerationRefSuggestion[] => {
    if (!visualId || !generation) return [];
    const target = timelineLayout.items.find((item) => item.id === visualId);
    if (!target) return [];
    const support = generationReferenceSupportFor(generation);
    const refs = generation.refs || [];
    const candidates = timelineLayout.items
      .filter((item) => item.id && item.id !== visualId && item.url)
      .filter((item) => item.kind === 'image' || item.kind === 'video')
      .filter((item) => clipGenerationRefLimitForKind(support, item.kind) > 0)
      .filter((item) => !refs.some((ref) => ref.id === item.id || ref.url === item.url));
    const targetStart = Math.max(0, Number(target.start || 0));
    const targetEnd = targetStart + Math.max(0, Number(target.duration || 0));
    const suggestions: ClipGenerationRefSuggestion[] = [];
    const seen = new Set<string>();
    const addSuggestion = (label: string, item: (typeof candidates)[number] | undefined, role?: ClipGenerationRef['role']) => {
      const material = item ? timelineItemToShelfMaterial(item) : null;
      if (!material || seen.has(material.id)) return;
      seen.add(material.id);
      const defaultRole = generation.nodeType === 'video' ? 'last_frame' : 'reference';
      suggestions.push({
        key: `${label}-${material.id}`,
        label,
        material,
        role: role || defaultRole,
      });
    };
    const sameLanePrevious = candidates
      .filter((item) => Math.round(Number(item.lane || 0)) === Math.round(Number(target.lane || 0)))
      .filter((item) => Math.max(0, Number(item.start || 0)) + Math.max(0, Number(item.duration || 0)) <= targetStart + 0.001)
      .sort((a, b) => (Number(b.start || 0) + Number(b.duration || 0)) - (Number(a.start || 0) + Number(a.duration || 0)))[0];
    if (generation.nodeType === 'video') {
      addSuggestion('引用同轨上一段', sameLanePrevious, 'last_frame');
    }
    addSuggestion(
      '引用上一段',
      candidates
        .filter((item) => Math.max(0, Number(item.start || 0)) + Math.max(0, Number(item.duration || 0)) <= targetStart + 0.001)
        .sort((a, b) => (Number(b.start || 0) + Number(b.duration || 0)) - (Number(a.start || 0) + Number(a.duration || 0)))[0],
      generation.nodeType === 'video' ? 'last_frame' : 'reference',
    );
    addSuggestion(
      '引用叠加层',
      candidates
        .filter((item) => visualItemsOverlap(
          { start: targetStart, duration: Math.max(0, Number(target.duration || 0)) },
          { start: Math.max(0, Number(item.start || 0)), duration: Math.max(0, Number(item.duration || 0)) },
        ))
        .sort((a, b) => Math.abs(Number(a.start || 0) - targetStart) - Math.abs(Number(b.start || 0) - targetStart))[0],
    );
    addSuggestion(
      '引用下一段',
      candidates
        .filter((item) => Math.max(0, Number(item.start || 0)) >= targetEnd - 0.001)
        .sort((a, b) => Number(a.start || 0) - Number(b.start || 0))[0],
    );
    return suggestions;
  };
  const selectedGenerationRefSuggestions = useMemo(() => (
    buildGenerationRefSuggestions(selectedGenerationVisual?.id || '', selectedGeneration)
  ), [selectedGeneration, selectedGenerationVisual?.id, timelineLayout.items]);
  const selectedVisualGenerationRefSuggestions = useMemo(() => (
    buildGenerationRefSuggestions(selectedVisual?.id || '', selectedVisualGeneration)
  ), [selectedVisual?.id, selectedVisualGeneration, timelineLayout.items]);
  const addGenerationRefSuggestion = (
    visualId: string,
    generation: ClipGenerationState | undefined,
    suggestion: ClipGenerationRefSuggestion,
  ) => {
    if (!visualId || !generation) return;
    const role = suggestion.role || (generation.nodeType === 'video' ? 'last_frame' : 'reference');
    const added = addGenerationMaterialRefForVisual(visualId, generation, generationReferenceSupportFor(generation), suggestion.material, role);
    showCommandFeedback(added ? `${suggestion.label}已加入参考` : '参考已存在或模型不支持');
  };
  const createVideoGenerationFromVisual = (visual: ClipTimelineVisualMaterial) => {
    if (!visual.url || visual.kind !== 'image') {
      showCommandFeedback('只有图片片段可以转视频');
      return;
    }
    const start = Math.max(0, Number(visual.start || 0) + Math.max(0.5, Number(visual.duration || imageDuration)));
    const lane = Math.max(0, Math.round(Number(visual.lane || 0)));
    const prompt = visual.generation?.prompt?.trim() || sourceName(visual);
    onCreateGenerationClip('video', {
      start,
      lane,
      prompt,
      refs: [{
        id: visual.id || `visual-ref-${Date.now()}`,
        kind: 'image',
        url: visual.url,
        label: sourceName(visual),
        role: 'first_frame',
        source: 'timeline',
        sourceClipId: visual.id,
        locked: true,
      }],
      params: {
        duration: 5,
        ratio,
      },
    });
    showCommandFeedback('已创建视频生成草稿');
  };
  const isMaterialDrag = (event: ReactDragEvent<HTMLElement>) => (
    Array.from(event.dataTransfer.types || []).includes('application/x-t8-clip-material')
  );
  const handleGenerationRefDragOver = (
    event: ReactDragEvent<HTMLElement>,
    visualId: string,
    generation: ClipGenerationState | undefined,
  ) => {
    if (!visualId || !generation || !isMaterialDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setGenerationRefDropTargetId(visualId);
  };
  const handleGenerationRefDragLeave = (event: ReactDragEvent<HTMLElement>, visualId: string) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setGenerationRefDropTargetId((current) => (current === visualId ? '' : current));
  };
  const handleGenerationRefDrop = (event: ReactDragEvent<HTMLElement>, visualId: string, generation: ClipGenerationState | undefined) => {
    const materialId = event.dataTransfer.getData('application/x-t8-clip-material');
    if (!visualId || !generation || !materialId) return;
    event.preventDefault();
    event.stopPropagation();
    setGenerationRefDropTargetId('');
    setVisualMaterialDragY(null);
    const material = mediaItems.find((item) => item.id === materialId);
    if (!material) {
      showCommandFeedback('找不到这个参考素材');
      return;
    }
    const added = addGenerationMaterialRefForVisual(visualId, generation, generationReferenceSupportFor(generation), material);
    showCommandFeedback(added ? '素材已作为生成参考' : '参考已存在或当前模型不支持');
    if (added) openGenerationPanelForClip(visualId);
  };
  const maxOccupiedVisualLane = useMemo(() => (
    Math.max(0, ...timelineLayout.items.map((item) => Math.max(0, Math.round(Number(item.lane || 0)))))
  ), [timelineLayout.items]);
  const visualLaneCount = useMemo(() => (
    Math.min(CLIP_MAX_VISUAL_LANE + 1, maxOccupiedVisualLane + 1)
  ), [maxOccupiedVisualLane]);
  const visualLaneHeight = trackHeights.visual || 88;
  const soloVisualLane = trackSolo.startsWith('visual-') ? Number(trackSolo.replace('visual-', '')) : null;
  const visibleVisualLanes = useMemo(() => {
    let visible = Array.from({ length: visualLaneCount }, (_, lane) => lane)
      .filter((lane) => trackVisibility[`visual-${lane}`] !== false);
    if (soloVisualLane != null && Number.isFinite(soloVisualLane)) {
      visible = visible.filter((lane) => lane === soloVisualLane);
    }
    return visible.length > 0 ? visible : [0];
  }, [soloVisualLane, trackVisibility, visualLaneCount]);
  const visualLaneBaseHeight = useMemo(() => (
    visibleVisualLanes.reduce((total, lane) => total + (trackCollapsed[`visual-${lane}`] ? 44 : visualLaneHeight), 0)
  ), [trackCollapsed, visibleVisualLanes, visualLaneHeight]);
  const visualDropClientY = dragState?.active && dragState.mode === 'move' ? dragState.currentY : visualMaterialDragY;
  const resolveVisualLaneInsertIntent = (
    clientY: number | null,
    options: { previous?: 'top' | 'bottom' | null } = {},
  ) => {
    if (clientY == null) return null;
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const previous = options.previous ?? null;
    const stableTrackBottom = rect.top + visualLaneBaseHeight;
    if (previous === 'top' && clientY <= rect.top + VISUAL_LANE_INSERT_EXIT_PX) return 'top' as const;
    if (previous === 'bottom' && clientY >= stableTrackBottom - VISUAL_LANE_INSERT_EXIT_PX) return 'bottom' as const;
    if (clientY <= rect.top + VISUAL_LANE_INSERT_ENTER_PX) return 'top' as const;
    if (clientY >= stableTrackBottom - VISUAL_LANE_INSERT_ENTER_PX) return 'bottom' as const;
    return null;
  };
  const visualLaneInsertion = resolveVisualLaneInsertIntent(visualDropClientY, { previous: visualLaneInsertIntent });
  const visualRenderLanes = useMemo(() => {
    const lanes = visibleVisualLanes.map((lane) => ({ lane, insert: false as const }));
    if (visualLaneInsertion === 'top') return [{ lane: -1, insert: true as const }, ...lanes];
    if (visualLaneInsertion === 'bottom') return [...lanes, { lane: Math.min(CLIP_MAX_VISUAL_LANE, maxOccupiedVisualLane + 1), insert: true as const }];
    return lanes;
  }, [maxOccupiedVisualLane, visibleVisualLanes, visualLaneInsertion]);
  const dropHintTextForVisualLane = (lane: number, insert: boolean) => {
    if (!visualDropClientY && !dragState?.active) return '';
    if (insert && visualLaneInsertion === 'top') return '释放到新顶层轨道';
    if (insert && visualLaneInsertion === 'bottom') return '释放到新底部轨道';
    return `释放到视频轨 ${lane + 1}`;
  };
  const visualLaneHeightFor = (lane: number, insert = false) => {
    if (insert) return Math.max(44, Math.round(visualLaneHeight * 0.66));
    return trackCollapsed[`visual-${lane}`] ? 44 : visualLaneHeight;
  };
  const visualLaneTopOffsetForIndex = (laneIndex: number) => (
    visibleVisualLanes
      .slice(0, Math.max(0, laneIndex))
      .reduce((total, lane) => total + visualLaneHeightFor(lane), 0)
  );
  const visualTrackTotalHeight = visualRenderLanes.reduce((total, item) => total + visualLaneHeightFor(item.lane, item.insert), 0);
  const rulerTicks = useMemo(() => computeClipTimelineRulerTicks({
    duration,
    fps,
    pixelsPerSecond,
  }), [duration, fps, pixelsPerSecond]);
  const playbackState = useMemo(() => resolveClipTimelinePlayback(activeVisuals, playheadTime, {
    fallbackDuration: imageDuration,
  }), [activeVisuals, imageDuration, playheadTime]);
  const selectedVisibleVisual = selectedVisual && !selectedVisual.disabled && !selectedVisual.sourceInvalid ? selectedVisual : undefined;
  const playbackVisibleState = playbackState?.item && !playbackState.item.disabled && !playbackState.item.sourceInvalid ? playbackState : undefined;
  const previewIdleVisual = selectedVisibleVisual || previewFallbackVisual;
  const previewVisual = playbackVisibleState?.item || (playing ? undefined : previewIdleVisual);
  const hasVisiblePreviewMedia = Boolean(previewVisual?.url);
  const selectedLayoutItem = timelineLayout.items.find((item) => item.id === selectedVisual?.id);
  const selectedInspectorStart = selectedKind === 'visual'
    ? Number(selectedLayoutItem?.start || selectedVisual?.start || 0)
    : selectedKind === 'audio'
      ? Number(selectedAudio?.start || 0)
      : selectedKind === 'text'
        ? Number(selectedText?.start || 0)
        : 0;
  const selectedInspectorDuration = selectedKind === 'visual'
    ? Number(selectedVisual?.duration || imageDuration)
    : selectedKind === 'audio'
      ? Number(selectedAudio?.duration || duration || imageDuration)
      : selectedKind === 'text'
        ? Number(selectedText?.duration || 3)
        : 0;
  const inspectorTitle = selectedKind === 'visual'
    ? selectedVisual?.generation
      ? selectedVisual.generation.nodeType === 'image' ? '图像生成参数' : '视频生成参数'
      : selectedVisual?.kind === 'image' ? '图片素材参数' : '视频素材参数'
    : selectedKind === 'audio'
      ? '音频素材参数'
      : selectedKind === 'text'
        ? '文本字幕参数'
        : '参数面板';
  const inspectorSubtitle = selectedKind === 'visual'
    ? `${sourceName(selectedVisual || {})} · V${Math.max(0, Math.round(Number(selectedVisual?.lane || 0))) + 1} · ${shortSeconds(selectedInspectorStart)} - ${shortSeconds(selectedInspectorStart + selectedInspectorDuration)}`
    : selectedKind === 'audio'
      ? `${selectedAudio?.label || fileNameFromUrl(selectedAudio?.url || '') || '音频素材'} · ${shortSeconds(selectedInspectorStart)} - ${shortSeconds(selectedInspectorStart + selectedInspectorDuration)}`
      : selectedKind === 'text'
        ? `${selectedText?.label || selectedText?.text || '文本片段'} · ${shortSeconds(selectedInspectorStart)} - ${shortSeconds(selectedInspectorStart + selectedInspectorDuration)}`
        : '选择时间线片段后，在这里编辑模型、调色、动画和转场';
  const audioTrackWidth = Math.max(120, duration * pixelsPerSecond);
  const timelineContentWidth = Math.max(900, timelineLayout.width, audioTrackWidth, duration * pixelsPerSecond);
  const focusGenerationQueueItem = (kind: 'missingPrompt' | 'runnable' | 'error' | 'unfinished') => {
    const target = generationTrackItems.find((item) => {
      const status = item.generation?.status || 'draft';
      const idle = status !== 'success' && status !== 'running' && status !== 'queued';
      if (!item.id || !item.generation) return false;
      if (kind === 'missingPrompt') return idle && !item.generation.prompt?.trim();
      if (kind === 'runnable') return idle && Boolean(item.generation.prompt?.trim());
      if (kind === 'error') return status === 'error';
      return status !== 'success';
    });
    if (!target?.id) {
      showCommandFeedback('没有匹配的生成片段');
      return;
    }
    if (target.generation?.status !== 'success') {
      openGenerationPanelForClip(target.id, Math.max(0, Number(target.start || 0)));
    } else {
      selectClip(target.id);
      seekPlayhead(Math.max(0, Number(target.start || 0)), { selectPlayback: false });
    }
    const lane = Math.max(0, Math.round(Number(target.lane || 0)));
    const laneIndex = visibleVisualLanes.indexOf(lane);
    const top = laneIndex >= 0 ? visualLaneTopOffsetForIndex(laneIndex) : 0;
    timelineScrollRef.current?.scrollTo({
      left: Math.max(0, Number(target.left || 0) - 120),
      top: Math.max(0, top - 18),
      behavior: 'smooth',
    });
    setGenerationStatusFilter(kind === 'error' ? 'error' : kind === 'unfinished' ? 'unfinished' : 'draft');
    showCommandFeedback(kind === 'missingPrompt' ? '已定位缺提示词片段' : kind === 'runnable' ? '已定位可生成片段' : kind === 'error' ? '已定位失败片段' : '已定位待处理片段');
  };
  const selectedGenerationTimelineItem = timelineLayout.items.find((item) => item.id === selectedGenerationVisual?.id);
  const timelineScrollLeft = useMemo(() => timelineScrollRef.current?.scrollLeft || 0, [timelineScrollVersion]);
  const timelineScrollTop = useMemo(() => timelineScrollRef.current?.scrollTop || 0, [timelineScrollVersion]);
  const generationPanelAnchorLane = Math.max(0, Math.round(Number(selectedGenerationTimelineItem?.lane || selectedGenerationVisual?.lane || 0)));
  const generationPanelAnchorLaneIndex = visibleVisualLanes.indexOf(generationPanelAnchorLane);
  const generationPanelWidth = Math.min(360, Math.max(280, Math.min(timelineContentWidth - 24, 360)));
  const generationPanelAnchorTop = visualLaneTopOffsetForIndex(generationPanelAnchorLaneIndex);
  const generationPanelAnchorHeight = visualLaneHeightFor(generationPanelAnchorLane);
  const generationPanelShellRect = editorShellRef.current?.getBoundingClientRect();
  const generationPanelMainRect = editorMainRef.current?.getBoundingClientRect();
  const generationPanelTrackRect = timelineTrackRef.current?.getBoundingClientRect();
  const generationPanelContentRect = timelineContentRef.current?.getBoundingClientRect();
  const generationPanelViewportWidth = generationPanelBounds.width || editorShellRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const generationPanelViewportHeight = generationPanelBounds.height || editorShellRef.current?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720);
  const generationPanelTrackTop = generationPanelShellRect && generationPanelTrackRect
    ? generationPanelTrackRect.top - generationPanelShellRect.top
    : 12 + layoutState.topHeight + 8 + 40 + 40 - timelineScrollTop;
  const generationPanelContentLeft = generationPanelShellRect && generationPanelContentRect
    ? generationPanelContentRect.left - generationPanelShellRect.left
    : 12 + 180 - timelineScrollLeft;
  const generationPanelAnchorY = generationPanelTrackTop + generationPanelAnchorTop;
  const generationPanelAnchorBottom = generationPanelAnchorY + generationPanelAnchorHeight;
  const generationPanelSafeTop = generationPanelShellRect && generationPanelMainRect
    ? generationPanelMainRect.top - generationPanelShellRect.top + 12
    : 60;
  const generationPanelSpaceBelow = generationPanelViewportHeight - generationPanelAnchorBottom - 12;
  const generationPanelSpaceAbove = generationPanelAnchorY - generationPanelSafeTop;
  const generationPanelShouldOpenUp = generationPanelSpaceBelow < generationPanelMeasuredHeight && generationPanelSpaceAbove > generationPanelSpaceBelow;
  const generationPanelDirection = generationPanelShouldOpenUp ? 'up' : 'down';
  const generationPanelGap = generationPanelDirection === 'up' ? -8 : 8;
  const generationPanelAvailableHeight = Math.min(
    360,
    Math.max(80, (generationPanelDirection === 'up' ? generationPanelSpaceAbove : generationPanelSpaceBelow) - 8),
  );
  const generationPanelRenderHeight = Math.min(generationPanelMeasuredHeight, generationPanelAvailableHeight);
  const generationPanelRawTop = generationPanelDirection === 'up'
    ? generationPanelAnchorY - generationPanelRenderHeight + generationPanelGap
    : generationPanelAnchorBottom + generationPanelGap;
  const generationPanelAnchorStyle: CSSProperties | undefined = selectedGenerationTimelineItem && generationPanelAnchorLaneIndex >= 0
    ? {
      left: Math.max(
        12,
        Math.min(
          Math.max(12, generationPanelViewportWidth - generationPanelWidth - 12),
          generationPanelContentLeft + selectedGenerationTimelineItem.left + (selectedGenerationTimelineItem.width / 2) - (generationPanelWidth / 2),
        ),
      ),
      top: Math.max(generationPanelSafeTop, Math.min(Math.max(generationPanelSafeTop, generationPanelViewportHeight - generationPanelRenderHeight - 12), generationPanelRawTop)),
      width: generationPanelWidth,
      maxHeight: generationPanelAvailableHeight,
    }
    : undefined;
  const timelineTracks = useMemo(() => deriveClipTimelineTracks({
    visuals: timelineVisuals,
    audioCount: audios.length,
    textCount: texts.length,
    coverUrl,
    trackHeights,
  }), [audios.length, coverUrl, texts.length, timelineVisuals, trackHeights]);
  const exportInspection = useMemo(() => inspectClipProjectBeforeExport({
    visuals: exportableTimelineVisuals,
    audios,
    texts,
    duration,
    coverUrl,
  }), [audios, coverUrl, duration, exportableTimelineVisuals, texts]);
  const selectedTransform = selectedVisual?.id ? visualTransforms[selectedVisual.id] : undefined;
  const activeTransform = normalizeClipVisualTransform(selectedTransform);
  const previewBaseTransform = normalizeClipVisualTransform(previewVisual?.id ? visualTransforms[previewVisual.id] : undefined);
  let previewLocalTime = 0;
  if (playbackVisibleState && playbackVisibleState.item.id === previewVisual?.id) {
    previewLocalTime = playbackVisibleState.localTime;
  } else if (selectedLayoutItem && selectedLayoutItem.id === previewVisual?.id) {
    previewLocalTime = Math.max(0, Math.min(selectedLayoutItem.duration, playheadTime - selectedLayoutItem.start));
  }
  const previewTransform = interpolateClipVisualKeyframes(
    previewVisual?.id ? clipVisualKeyframes[previewVisual.id] : undefined,
    previewLocalTime,
    previewBaseTransform,
  );
  const previewStageStyle = {
    aspectRatio: `${exportSettings.width}/${exportSettings.height}`,
    maxWidth: '100%',
    maxHeight: '100%',
    transform: `scale(${previewScale / 100})`,
    '--clip-aspect-ratio': `${exportSettings.width / Math.max(1, exportSettings.height)}`,
  } as CSSProperties;

  useEffect(() => {
    setPlayheadTime((value) => Math.min(value, duration));
  }, [duration]);

  useEffect(() => {
    if (!coverOpen) setCoverDraftTime(coverTime || playheadTime || 0);
  }, [coverOpen, coverTime, playheadTime]);

  useEffect(() => () => {
    if (timelineScrollFrameRef.current != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(timelineScrollFrameRef.current);
    }
    if (dragMoveFrameRef.current != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(dragMoveFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (!generationPanelClipId) return;
    const panelVisual = timelineVisuals.find((item) => item.id === generationPanelClipId);
    if (!panelVisual?.generation || panelVisual.generation.status === 'success') {
      setGenerationPanelClipId('');
    }
  }, [generationPanelClipId, timelineVisuals]);

  useLayoutEffect(() => {
    if (!open || !generationPanelClipId) return undefined;
    const measureGenerationPanel = () => {
      const panel = generationPanelRef.current;
      const shell = editorShellRef.current;
      if (panel) {
        const measuredHeight = Math.min(360, Math.max(180, Math.ceil(panel.scrollHeight || panel.getBoundingClientRect().height || 300)));
        setGenerationPanelMeasuredHeight((current) => current === measuredHeight ? current : measuredHeight);
      }
      if (shell) {
        const nextBounds = { width: shell.clientWidth, height: shell.clientHeight };
        setGenerationPanelBounds((current) => (
          current.width === nextBounds.width && current.height === nextBounds.height ? current : nextBounds
        ));
      }
    };
    measureGenerationPanel();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureGenerationPanel);
      return () => window.removeEventListener('resize', measureGenerationPanel);
    }
    const observer = new ResizeObserver(measureGenerationPanel);
    if (generationPanelRef.current) observer.observe(generationPanelRef.current);
    if (editorShellRef.current) observer.observe(editorShellRef.current);
    window.addEventListener('resize', measureGenerationPanel);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureGenerationPanel);
    };
  }, [generationPanelClipId, open]);

  useEffect(() => {
    if (open && mediaSource === 'assets') onRefreshResourceLibrary();
  }, [mediaSource, onRefreshResourceLibrary, open]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    resizeStateRef.current = resizeState;
  }, [resizeState]);

  useEffect(() => {
    trackResizeStateRef.current = trackResizeState;
  }, [trackResizeState]);

  useEffect(() => {
    timelineScrubActiveRef.current = timelineScrubActive;
  }, [timelineScrubActive]);

  useEffect(() => {
    if (!open || timelineScrubActive || dragState?.active) return undefined;
    if (playheadFollowRef.current) window.cancelAnimationFrame(playheadFollowRef.current);
    playheadFollowRef.current = window.requestAnimationFrame(() => {
      const el = timelineScrollRef.current;
      if (!el) return;
      const x = playheadTime * pixelsPerSecond;
      const leftGuard = el.scrollLeft + 96;
      const rightGuard = el.scrollLeft + el.clientWidth - 128;
      if (x < leftGuard || x > rightGuard) {
        el.scrollTo({
          left: Math.max(0, x - el.clientWidth * 0.38),
          behavior: playing || timelineScrubActiveRef.current ? 'auto' : 'smooth',
        });
      }
    });
    return () => {
      if (playheadFollowRef.current) window.cancelAnimationFrame(playheadFollowRef.current);
    };
  }, [dragState?.active, open, pixelsPerSecond, playheadTime, playing, timelineScrubActive]);

  useEffect(() => {
    if (!resizeState) setLayoutState(sanitizeClipStudioLayout(editorLayout));
  }, [editorLayout, resizeState]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;
    video.playbackRate = sanitizeSpeed(previewVisual?.speed);
  }, [open, previewVisual?.id, previewVisual?.speed, previewVisual?.url]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;
    const sync = () => {
      const start = playbackVisibleState?.start || 0;
      const speed = sanitizeSpeed(previewVisual?.speed);
      const trimStart = Math.max(0, Number(previewVisual?.trimStart || 0));
      const localTimelineTime = Math.max(0, ((video.currentTime || 0) - trimStart) / speed);
      setPlayheadTime(Math.min(start + localTimelineTime, duration || 0));
    };
    video.addEventListener('timeupdate', sync);
    return () => video.removeEventListener('timeupdate', sync);
  }, [duration, playbackVisibleState?.start, previewVisual?.id, previewVisual?.speed, previewVisual?.trimStart]);

  useEffect(() => {
    if (!playing) return undefined;
    lastPlaybackTickRef.current = null;

    const tick = (now: number) => {
      const previous = lastPlaybackTickRef.current ?? now;
      lastPlaybackTickRef.current = now;
      const delta = Math.max(0, (now - previous) / 1000);
      setPlayheadTime((current) => {
        const next = Math.min(duration || 0, current + delta);
        if (duration > 0 && next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      playbackFrameRef.current = window.requestAnimationFrame(tick);
    };

    playbackFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (playbackFrameRef.current != null) window.cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
      lastPlaybackTickRef.current = null;
    };
  }, [duration, playing]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || previewVisual?.kind !== 'video') return;
    const localTime = playbackVisibleState?.localTime || 0;
    applyPreviewVideoSourceSeek(video, previewVisual, localTime);
    if (playing && video.paused) {
      void video.play().catch(() => undefined);
    } else if (!playing && !video.paused) {
      video.pause();
    }
  }, [playbackVisibleState?.localTime, playing, previewVisual?.id, previewVisual?.kind, previewVisual?.speed, previewVisual?.trimStart]);

  useEffect(() => {
    if (!dragState) return undefined;
    const flushPendingDragPointer = () => {
      dragMoveFrameRef.current = null;
      const pointer = pendingDragPointerRef.current;
      pendingDragPointerRef.current = null;
      if (!pointer) return;
      setDragState((current) => {
        if (!current) return current;
        const active = current.active || Math.abs(pointer.clientX - current.startX) >= 4 || Math.abs(pointer.clientY - current.startY) >= 4;
        if (active && current.mode === 'move') {
          const nextIntent = resolveVisualLaneInsertIntent(pointer.clientY, { previous: visualLaneInsertIntentRef.current });
          visualLaneInsertIntentRef.current = nextIntent;
          setVisualLaneInsertIntent((previous) => previous === nextIntent ? previous : nextIntent);
        }
        const nextState = { ...current, currentX: pointer.clientX, currentY: pointer.clientY, active };
        dragStateRef.current = nextState;
        return nextState;
      });
    };
    const onMove = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      pendingDragPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (dragMoveFrameRef.current == null) {
        dragMoveFrameRef.current = window.requestAnimationFrame(flushPendingDragPointer);
      }
    };
    const onUp = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      if (dragMoveFrameRef.current != null) {
        window.cancelAnimationFrame(dragMoveFrameRef.current);
        dragMoveFrameRef.current = null;
      }
      pendingDragPointerRef.current = null;
      const latest = dragStateRef.current;
      const current = latest ? {
        ...latest,
        currentX: event.clientX,
        currentY: event.clientY,
        active: latest.active || Math.abs(event.clientX - latest.startX) >= 4 || Math.abs(event.clientY - latest.startY) >= 4,
      } : null;
      if (current?.mode === 'move') {
        visualLaneInsertIntentRef.current = resolveVisualLaneInsertIntent(event.clientY, { previous: visualLaneInsertIntentRef.current });
      }
      const rect = timelineTrackRef.current?.getBoundingClientRect();
      if (current?.active && rect) {
        const deltaSeconds = (event.clientX - current.startX) / pixelsPerSecond;
        const rawStart = Math.max(0, ((event.clientX - rect.left) / pixelsPerSecond) - current.grabOffsetSeconds);
        const next = previewClipTimelineDragTiming({
          mode: current.mode,
          clipStart: current.clipStart,
          clipDuration: current.clipDuration,
          deltaSeconds,
          rawStart,
          ...resolveDragSourceTiming(current.id, current.trimStart),
          snap: snapMode,
          snapTargets: buildClipSnapTargets(current.id),
          snapThresholdSeconds: Math.max(0.04, Math.min(0.18, 10 / pixelsPerSecond)),
        });
        const audioIds = new Set(audios.map((item, index) => item.id || item.url || `audio-${index}`));
        const textIds = new Set(texts.map((item, index) => item.id || item.text || `text-${index}`));
        const currentIsTimelineVisual = !audioIds.has(current.id) && !textIds.has(current.id);
        const targetLane = currentIsTimelineVisual && current.mode === 'move'
          ? resolveVisualLaneFromClientY(event.clientY, visualLaneInsertIntentRef.current)
          : current.lane;
        const targetVisualTrackLocked = currentIsTimelineVisual && current.mode === 'move' && targetLane >= 0 && Boolean(trackLocks[`visual-${targetLane}`]);
        if (targetVisualTrackLocked) {
          showCommandFeedback('轨道已锁定');
          setDragState(null);
          return;
        }
        const trimStart = Math.max(0, Math.round((current.trimStart + (next.trimStartDelta || 0)) * 1000) / 1000);
        const draggedVisual = timelineVisuals.find((item) => item.id === current.id);
        if (audioIds.has(current.id)) {
          onUpdateAudioTiming(current.id, next.start, next.duration, trimStart);
        } else if (textIds.has(current.id)) {
          onUpdateTextTiming(current.id, next.start, next.duration);
        } else if (current.mode === 'move' && current.copyMode) {
          onDuplicateVisualByDrag(current.id, next.start, targetLane);
          showCommandFeedback('拖动复制');
        } else if (current.mode === 'move') {
          onUpdateVisualStart(current.id, next.start, targetLane);
        } else {
          draggedVisual?.kind === 'video'
            ? onUpdateVisualTiming(current.id, next.start, next.duration, trimStart)
            : onUpdateVisualTiming(current.id, next.start, next.duration);
        }
      }
      visualLaneInsertIntentRef.current = null;
      setVisualLaneInsertIntent(null);
      setDragState(null);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      if (dragMoveFrameRef.current != null) {
        window.cancelAnimationFrame(dragMoveFrameRef.current);
        dragMoveFrameRef.current = null;
      }
      pendingDragPointerRef.current = null;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [Boolean(dragState), audios, maxOccupiedVisualLane, onDuplicateVisualByDrag, onUpdateAudioTiming, onUpdateTextTiming, onUpdateVisualStart, onUpdateVisualTiming, pixelsPerSecond, snapMode, texts, trackLocks, visibleVisualLanes, visualLaneHeight]);

  useEffect(() => {
    if (!resizeState) return undefined;
    const onMove = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      const current = resizeStateRef.current;
      if (!current) return;
      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;
      const next = resizeClipStudioLayout(current.startLayout, current.type, deltaX, deltaY);
      setLayoutState(next);
    };
    const onUp = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      const current = resizeStateRef.current;
      if (current) {
        const deltaX = event.clientX - current.startX;
        const deltaY = event.clientY - current.startY;
        const next = resizeClipStudioLayout(current.startLayout, current.type, deltaX, deltaY);
        setLayoutState(next);
        onPatchSettings({ clipEditorLayout: next });
      }
      setResizeState(null);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };
  }, [Boolean(resizeState), onPatchSettings]);

  useEffect(() => {
    if (!trackResizeState) return undefined;
    const onMove = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      const current = trackResizeStateRef.current;
      if (!current) return;
      const nextHeight = Math.round(Math.max(36, Math.min(180, current.startHeight + event.clientY - current.startY)));
      onPatchSettings({
        clipTrackHeights: {
          ...trackHeights,
          [current.id]: nextHeight,
        },
      });
    };
    const onUp = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      setTrackResizeState(null);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };
  }, [Boolean(trackResizeState), onPatchSettings, trackHeights]);

  useEffect(() => {
    if (!timelineScrubActive) return undefined;
    const onMove = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      seekFromClientX(event.clientX);
    };
    const onUp = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      seekFromClientX(event.clientX);
      setTimelineScrubActive(false);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [duration, imageDuration, pixelsPerSecond, timelineScrubActive, timelineVisuals]);

  const chooseFiles = () => fileInputRef.current?.click();
  const submitFiles = (files: FileList | File[]) => {
    const list = Array.from(files || []);
    if (list.length > 0) {
      onImportFiles(list);
      showCommandFeedback(`已加入 ${list.length} 个素材`);
    }
  };
  const togglePreviewPlayback = () => {
    if (!duration) return;
    if (!playing && playheadTime >= duration) setPlayheadTime(0);
    setPlaying((value) => !value);
  };
  const requestPreviewFullscreen = () => {
    const target = previewPanelRef.current;
    if (!target?.requestFullscreen) return;
    void target.requestFullscreen().catch(() => undefined);
  };

  const stepPlayheadByFrames = (frames: number) => {
    seekPlayhead(stepClipPlayheadByFrames(playheadTime, frames, fps, duration));
  };
  const showCommandFeedback = (message: string) => {
    setCommandFeedback(message);
    if (commandFeedbackTimerRef.current) window.clearTimeout(commandFeedbackTimerRef.current);
    commandFeedbackTimerRef.current = window.setTimeout(() => setCommandFeedback(''), 900);
  };
  const runPendingGenerationClips = async () => {
    if (firstBlockedGeneration) {
      openGenerationPanelForClip(firstBlockedGeneration.id || '', Math.max(0, Number(firstBlockedGeneration.start || 0)));
      showCommandFeedback('先补全生成提示词');
      return;
    }
    if (runnablePendingGenerationVisuals.length === 0) {
      showCommandFeedback('没有待生成片段');
      return;
    }
    await Promise.allSettled(runnablePendingGenerationVisuals.map((item) => onRunGenerationClip(item.id || '')));
    showCommandFeedback(`已提交 ${runnablePendingGenerationVisuals.length} 个生成片段`);
  };
  const retryErroredGenerationClips = async () => {
    const firstBlockedError = erroredGenerationVisuals.find((item) => !item.generation?.prompt?.trim());
    if (firstBlockedError) {
      openGenerationPanelForClip(firstBlockedError.id || '', Math.max(0, Number(firstBlockedError.start || 0)));
      showCommandFeedback('先补全失败片段提示词');
      return;
    }
    const retryTargets = erroredGenerationVisuals.filter((item) => item.generation?.prompt?.trim());
    if (retryTargets.length === 0) {
      showCommandFeedback('没有失败片段');
      return;
    }
    await Promise.allSettled(retryTargets.map((item) => onRunGenerationClip(item.id || '')));
    showCommandFeedback(`已重试 ${retryTargets.length} 个生成片段`);
  };
  const toggleTrackVisibility = (trackKey: string, visualLane?: number) => {
    const nextVisible = trackVisibility[trackKey] === false;
    setTrackVisibility((current) => ({
      ...current,
      [trackKey]: nextVisible,
    }));
    if (visualLane != null) {
      onSetVisualLaneVisibility(visualLane, nextVisible);
    }
    showCommandFeedback(nextVisible ? '显示轨道' : '隐藏轨道');
  };
  const toggleTrackLock = (trackKey: string) => {
    setTrackLocks((current) => {
      const nextLocked = !current[trackKey];
      showCommandFeedback(nextLocked ? '锁定轨道' : '解锁轨道');
      return { ...current, [trackKey]: nextLocked };
    });
  };
  const toggleTrackSolo = (trackKey: string) => {
    setTrackSolo((current) => {
      const nextSolo = current === trackKey ? '' : trackKey;
      showCommandFeedback(nextSolo ? '独显轨道' : '取消独显');
      return nextSolo;
    });
  };
  const toggleTrackCollapsed = (trackKey: string) => {
    setTrackCollapsed((current) => {
      const nextCollapsed = !current[trackKey];
      showCommandFeedback(nextCollapsed ? '折叠轨道' : '展开轨道');
      return { ...current, [trackKey]: nextCollapsed };
    });
  };
  const onTimelineScroll = () => {
    if (timelineTrackListRef.current && timelineScrollRef.current) {
      timelineTrackListRef.current.scrollTop = timelineScrollRef.current.scrollTop;
    }
    if (timelineScrollFrameRef.current != null) return;
    if (typeof window === 'undefined') {
      setTimelineScrollVersion((value) => value + 1);
      return;
    }
    timelineScrollFrameRef.current = window.requestAnimationFrame(() => {
      timelineScrollFrameRef.current = null;
      setTimelineScrollVersion((value) => value + 1);
    });
  };
  const handleVisualTrackDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setVisualMaterialDragY(null);
    setVisualLaneInsertIntent(null);
  };
  const openClipContextMenu = (event: ReactMouseEvent, item: { id?: string }, kind: 'visual' | 'audio' | 'text' = 'visual') => {
    if (!item.id) return;
    event.preventDefault();
    event.stopPropagation();
    selectClip(item.id);
    setClipContextMenu({ id: item.id, x: event.clientX, y: event.clientY, kind });
  };
  const runClipContextAction = (action: () => void, message: string) => {
    action();
    setClipContextMenu(null);
    showCommandFeedback(message);
  };
  const duplicateVisualToLane = (visualId: string, laneDelta: -1 | 1) => {
    onDuplicateVisualToLane(visualId, laneDelta);
    showCommandFeedback(laneDelta < 0 ? '复制到上方轨道' : '复制到下方轨道');
    setClipContextMenu(null);
  };
  const runClipContextPointerAction = (event: ReactPointerEvent<HTMLButtonElement>, action: () => void, message?: string) => {
    event.preventDefault();
    event.stopPropagation();
    action();
    if (message) showCommandFeedback(message);
  };

  useEffect(() => {
    if (!clipContextMenu) return undefined;
    const closeMenu = (event: globalThis.PointerEvent | globalThis.KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('[data-clip-context-menu]')) return;
      setClipContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenu, true);
    window.addEventListener('keydown', closeMenu, true);
    return () => {
      window.removeEventListener('pointerdown', closeMenu, true);
      window.removeEventListener('keydown', closeMenu, true);
    };
  }, [clipContextMenu]);

  useEffect(() => () => {
    if (commandFeedbackTimerRef.current) window.clearTimeout(commandFeedbackTimerRef.current);
  }, []);

  const selectedAudioId = selectedAudio ? selectedAudio.id || selectedAudio.url || '' : '';
  const selectedTextId = selectedText ? selectedText.id || selectedText.text || '' : '';
  const selectedVisualId = selectedKind === 'visual' ? selectedTimelineVisual?.id || '' : '';
  const selectedClipIdList = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
  const splitSelectedAtPlayhead = () => {
    if (selectedKind === 'audio' && selectedAudioId) {
      onSplitAudioAtTime(selectedAudioId, playheadTime);
    } else if (selectedKind === 'text' && selectedTextId) {
      onSplitTextAtTime(selectedTextId, playheadTime);
    } else if (selectedVisualId) {
      if (linkMode) {
        onSplitLinkedAtTime(selectedVisualId, playheadTime);
      } else {
        onSplitVisualAtTime(selectedVisualId, playheadTime);
      }
    }
  };
  const duplicateSelectedClips = () => {
    const ids = new Set(selectedClipIdList);
    if (!ids.size) return;
    timelineVisuals.forEach((item) => {
      const id = item.id || '';
      if (id && ids.has(id)) onDuplicateVisual(id);
    });
    audios.forEach((item, index) => {
      const id = item.id || item.url || `audio-${index}`;
      if (ids.has(id)) onDuplicateAudio(id);
    });
    texts.forEach((item, index) => {
      const id = item.id || item.text || `text-${index}`;
      if (ids.has(id)) onDuplicateText(id);
    });
  };
  const duplicateSelectedClip = () => {
    if (selectedClipCount > 1) {
      duplicateSelectedClips();
      return;
    }
    if (selectedKind === 'audio' && selectedAudioId) {
      onDuplicateAudio(selectedAudioId);
    } else if (selectedKind === 'text' && selectedTextId) {
      onDuplicateText(selectedTextId);
    } else if (selectedVisualId) {
      onDuplicateVisual(selectedVisualId);
    }
  };
  const removeSelectedClips = () => {
    const ids = new Set(selectedClipIdList);
    if (!ids.size) return;
    timelineVisuals.forEach((item) => {
      const id = item.id || '';
      if (id && ids.has(id)) onRemoveVisual(id);
    });
    audios.forEach((item, index) => {
      const id = item.id || item.url || `audio-${index}`;
      if (ids.has(id)) onRemoveAudio(id);
    });
    texts.forEach((item, index) => {
      const id = item.id || item.text || `text-${index}`;
      if (ids.has(id)) onRemoveText(id);
    });
    setSelectedId('');
    setSelectedIds([]);
  };
  const removeSelectedClip = () => {
    if (selectedClipCount > 1) {
      removeSelectedClips();
      return;
    }
    if (selectedKind === 'audio' && selectedAudioId) {
      onRemoveAudio(selectedAudioId);
    } else if (selectedKind === 'text' && selectedTextId) {
      onRemoveText(selectedTextId);
    } else if (selectedVisualId) {
      onRemoveVisual(selectedVisualId);
    } else {
      return;
    }
    setSelectedId('');
    setSelectedIds([]);
  };
  const runEditorShortcut = (event: ReactKeyboardEvent<HTMLDivElement> | KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const hasModifier = event.metaKey || event.ctrlKey;
    const isUndo = hasModifier && key === 'z' && !event.shiftKey;
    const isRedo = hasModifier && (key === 'y' || (key === 'z' && event.shiftKey));
    if (isUndo) {
      onUndoEdit();
      showCommandFeedback('撤销');
      return true;
    }
    if (isRedo) {
      onRedoEdit();
      showCommandFeedback('重做');
      return true;
    }
    if (hasModifier && (key === '=' || key === '+')) {
      setZoom((value) => Math.min(100, value + 8));
      showCommandFeedback('放大时间线');
      return true;
    }
    if (hasModifier && key === '-') {
      setZoom((value) => Math.max(10, value - 8));
      showCommandFeedback('缩小时间线');
      return true;
    }
    if (hasModifier) return false;
    if (event.key === 'Escape') {
      if (showShortcutHelp) {
        setShowShortcutHelp(false);
        showCommandFeedback('关闭快捷键帮助');
        return true;
      }
      if (coverOpen) {
        setCoverOpen(false);
        showCommandFeedback('关闭封面选择');
        return true;
      }
    }
    if (key === '?') {
      setShowShortcutHelp((value) => !value);
      showCommandFeedback('快捷键帮助');
      return true;
    }
    if (key === ' ') {
      togglePreviewPlayback();
      showCommandFeedback(playing ? '暂停' : '播放');
      return true;
    }
    if (key === 'arrowleft') {
      stepPlayheadByFrames(event.shiftKey ? -Math.max(1, fps) : -1);
      showCommandFeedback(event.shiftKey ? '后退 1 秒' : '后退 1 帧');
      return true;
    }
    if (key === 'arrowright') {
      stepPlayheadByFrames(event.shiftKey ? Math.max(1, fps) : 1);
      showCommandFeedback(event.shiftKey ? '前进 1 秒' : '前进 1 帧');
      return true;
    }
    if (key === 'b') {
      splitSelectedAtPlayhead();
      showCommandFeedback('分割片段');
      return true;
    }
    if (key === 'd') {
      duplicateSelectedClip();
      showCommandFeedback('复制片段');
      return true;
    }
    if (key === 'f') {
      fitTimeline();
      showCommandFeedback('适配时间线');
      return true;
    }
    return false;
  };
  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
    if (isEditing) return;
    if (runEditorShortcut(event)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelectedClip();
      showCommandFeedback('删除片段');
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    editorShellRef.current?.focus({ preventScroll: true });

    const handleNativeEditorKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (isEditing) return;
      if (runEditorShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        removeSelectedClip();
        showCommandFeedback('删除片段');
      }
    };

    document.addEventListener('keydown', handleNativeEditorKeyDown, true);
    return () => document.removeEventListener('keydown', handleNativeEditorKeyDown, true);
  }, [coverOpen, open, selectedKind, selectedAudioId, selectedTextId, selectedVisualId, showShortcutHelp]);

  const fitTimeline = () => {
    const viewportWidth = timelineScrollRef.current?.clientWidth || 720;
    setZoom(fitClipTimelineZoom({ duration: Math.max(duration, 0.1), viewportWidth: Math.max(240, viewportWidth - 24) }));
  };

  const seekPlayhead = (nextTime: number, options: { selectPlayback?: boolean } = {}) => {
    const safeTime = Math.max(0, Math.min(duration || 0, nextTime));
    setPlayheadTime(safeTime);
    const nextState = resolveClipTimelinePlayback(activeVisuals, safeTime, { fallbackDuration: imageDuration });
    if (options.selectPlayback !== false && nextState?.item.id) setSelectedId(nextState.item.id);
    if (options.selectPlayback !== false && nextState?.item.id) setSelectedIds([nextState.item.id]);
    const video = previewVideoRef.current;
    if (video) applyPreviewVideoSourceSeek(video, nextState?.item, nextState?.localTime || 0);
  };

  const handlePreviewVideoLoadedMetadata = () => {
    const video = previewVideoRef.current;
    if (!video || previewVisual?.kind !== 'video') return;
    video.playbackRate = sanitizeSpeed(previewVisual?.speed);
    applyPreviewVideoSourceSeek(video, previewVisual, previewLocalTime);
  };

  const handlePreviewVideoEnded = () => {
    const activeClipEnd = (playbackVisibleState?.start || 0) + (playbackVisibleState?.duration || 0);
    const nextTime = Math.min(duration || 0, Math.max(playheadTime, activeClipEnd));
    setPlayheadTime(nextTime);
  };

  const openGenerationPanelForClip = (visualId: string, start?: number) => {
    if (!visualId) return;
    selectClip(visualId);
    if (start != null) seekPlayhead(start, { selectPlayback: false });
    setGenerationPanelClipId(visualId);
  };

  const seekFromClientX = (clientX: number) => {
    const rect = timelineContentRef.current?.getBoundingClientRect() || timelineTrackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offset = clientX - rect.left;
    seekPlayhead(clampClipPlayheadTime(offset, pixelsPerSecond, duration));
  };
  const resolveVisualLaneFromClientY = (clientY: number, insertIntentOverride = visualLaneInsertIntentRef.current) => {
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const insertIntent = insertIntentOverride ?? resolveVisualLaneInsertIntent(clientY, { previous: visualLaneInsertIntentRef.current });
    if (insertIntent === 'top') return -1;
    if (insertIntent === 'bottom') return Math.min(CLIP_MAX_VISUAL_LANE, maxOccupiedVisualLane + 1);
    const offsetY = Math.max(0, clientY - rect.top);
    let cursorY = 0;
    for (const lane of visibleVisualLanes) {
      cursorY += visualLaneHeightFor(lane);
      if (offsetY <= cursorY) return Math.min(CLIP_MAX_VISUAL_LANE, lane);
    }
    return Math.min(CLIP_MAX_VISUAL_LANE, visibleVisualLanes[visibleVisualLanes.length - 1] ?? 0);
  };

  const buildClipSnapTargets = (dragId?: string): ClipSnapTarget[] => {
    const targets: ClipSnapTarget[] = [
      { time: 0, kind: 'zero', label: '时间线起点' },
      { time: playheadTime, kind: 'playhead', label: '播放头' },
    ];
    timelineLayout.items.forEach((item) => {
      if (!item.id || item.id === dragId || item.disabled) return;
      targets.push(
        { time: item.start, kind: 'clip-start', label: sourceName(item) },
        { time: item.start + item.duration, kind: 'clip-end', label: sourceName(item) },
      );
    });
    audios.forEach((item, index) => {
      const id = item.id || item.url || `audio-${index}`;
      if (id === dragId) return;
      const start = Math.max(0, Number(item.start || 0));
      const itemDuration = Math.max(0.25, Number(item.duration || duration || imageDuration));
      targets.push(
        { time: start, kind: 'audio-start', label: item.label || '音频' },
        { time: start + itemDuration, kind: 'audio-end', label: item.label || '音频' },
      );
    });
    texts.forEach((item, index) => {
      const id = item.id || item.text || `text-${index}`;
      if (id === dragId) return;
      const start = Math.max(0, Number(item.start || 0));
      const itemDuration = Math.max(0.25, Number(item.duration || 3));
      targets.push(
        { time: start, kind: 'text-start', label: item.label || item.text || '字幕' },
        { time: start + itemDuration, kind: 'text-end', label: item.label || item.text || '字幕' },
      );
    });
    return targets;
  };
  const clipSnapTargets = dragState?.active ? buildClipSnapTargets(dragState.id) : [];
  const dragDropLeft = (() => {
    if (!dragState?.active) return null;
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return Math.max(0, dragState.currentX - rect.left);
  })();
  const liveDragTiming = (() => {
    if (!dragState?.active) return null;
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    const deltaSeconds = (dragState.currentX - dragState.startX) / pixelsPerSecond;
    const rawStart = rect
      ? Math.max(0, ((dragState.currentX - rect.left) / pixelsPerSecond) - dragState.grabOffsetSeconds)
      : Math.max(0, dragState.clipStart + deltaSeconds);
    return {
      id: dragState.id,
      ...previewClipTimelineDragTiming({
        mode: dragState.mode,
        clipStart: dragState.clipStart,
        clipDuration: dragState.clipDuration,
        deltaSeconds,
        rawStart,
        ...resolveDragSourceTiming(dragState.id, dragState.trimStart),
        snap: snapMode,
        snapTargets: clipSnapTargets,
        snapThresholdSeconds: Math.max(0.04, Math.min(0.18, 10 / pixelsPerSecond)),
      }),
    };
  })();
  const dragTargetVisualLane = dragState?.active && dragState.mode === 'move'
    ? resolveVisualLaneFromClientY(dragState.currentY)
    : null;
  const targetVisualTrackLocked = dragTargetVisualLane != null && dragTargetVisualLane >= 0 && Boolean(trackLocks[`visual-${dragTargetVisualLane}`]);
  const dragConflictPreview = (() => {
    if (!dragState?.active || !liveDragTiming || dragState.mode !== 'move' || dragTargetVisualLane == null) return null;
    const targetLane = Math.max(0, dragTargetVisualLane);
    const overlaps = timelineLayout.items.filter((item) => {
      if (!item.id || item.id === dragState.id || item.disabled) return false;
      const lane = Math.max(0, Math.round(Number(item.lane || 0)));
      return lane === targetLane && visualItemsOverlap(
        { start: liveDragTiming.start, duration: liveDragTiming.duration },
        { start: item.start, duration: item.duration },
      );
    });
    const mode: 'locked' | 'overlap' | 'clear' = targetVisualTrackLocked ? 'locked' : overlaps.length > 0 ? 'overlap' : 'clear';
    return {
      mode,
      lane: targetLane,
      left: Math.max(0, liveDragTiming.start * pixelsPerSecond),
      width: Math.max(72, liveDragTiming.duration * pixelsPerSecond),
      label: mode === 'locked' ? '轨道已锁定' : mode === 'overlap' ? `与 ${overlaps.length} 个片段重叠` : '可放置',
    };
  })();
  const snapTargetLeft = liveDragTiming?.snapEdgeTime != null ? liveDragTiming.snapEdgeTime * pixelsPerSecond : dragDropLeft;
  const materialLayout = (items: ClipMaterial[], fallbackDuration = 3) => items.map((item, index) => {
    const start = Math.max(0, Number.isFinite(Number(item.start)) ? Number(item.start) : 0);
    const itemDuration = Math.max(0.25, Number.isFinite(Number(item.duration)) ? Number(item.duration) : fallbackDuration);
    const id = item.id || item.url || item.text || `clip-${index}`;
    const live = liveDragTiming?.id === id ? liveDragTiming : null;
    const liveStart = live ? live.start : start;
    const liveDuration = live ? live.duration : itemDuration;
    return {
      item,
      id,
      start: liveStart,
      duration: liveDuration,
      left: Math.max(0, liveStart * pixelsPerSecond),
      width: Math.max(86, liveDuration * pixelsPerSecond),
    };
  });
  const audioLayout = materialLayout(audios, Math.max(0.25, duration || imageDuration));
  const textLayout = materialLayout(texts, Math.max(0.25, texts.length ? (duration || imageDuration) / texts.length : 3));
  const activePreviewTextClips = texts.filter((item) => {
    const start = Math.max(0, Number.isFinite(Number(item.start)) ? Number(item.start) : 0);
    const itemDuration = Math.max(0.25, Number.isFinite(Number(item.duration)) ? Number(item.duration) : 3);
    return playheadTime >= start && playheadTime <= start + itemDuration;
  });
  const updateTransform = (patch: Partial<ClipVisualTransform>) => {
    if (!selectedVisual?.id) return;
    onUpdateVisualTransform(selectedVisual.id, { ...activeTransform, ...patch });
  };
  const selectedVisualKeyframes = selectedVisual?.id ? clipVisualKeyframes[selectedVisual.id] || [] : [];
  const selectedVisualLocalTime = selectedLayoutItem ? Math.max(0, Math.min(selectedLayoutItem.duration, playheadTime - selectedLayoutItem.start)) : 0;
  const addVisualKeyframeAtPlayhead = () => {
    if (!selectedVisual?.id || !selectedLayoutItem) return;
    const time = Math.round(selectedVisualLocalTime * 1000) / 1000;
    const next = [
      ...selectedVisualKeyframes.filter((item) => Math.abs(item.time - time) > 0.04),
      { time, ...activeTransform },
    ].sort((a, b) => a.time - b.time);
    onUpdateVisualKeyframes(selectedVisual.id, next);
    showCommandFeedback('添加关键帧');
  };
  const removeVisualKeyframe = (time: number) => {
    if (!selectedVisual?.id) return;
    onUpdateVisualKeyframes(selectedVisual.id, selectedVisualKeyframes.filter((item) => Math.abs(item.time - time) > 0.04));
    showCommandFeedback('删除关键帧');
  };
  const updateVisualFilter = (patch: ClipVisualFilterPatch) => {
    if (!selectedVisual?.id) return;
    onUpdateVisualFilter(selectedVisual.id, {
      filter: patch.filter ?? selectedVisual.filter ?? 'none',
      intensity: patch.intensity ?? selectedVisual.intensity ?? 65,
      hue: patch.hue ?? selectedVisual.hue ?? 0,
      saturation: patch.saturation ?? selectedVisual.saturation ?? 100,
      brightness: patch.brightness ?? selectedVisual.brightness ?? 100,
      contrast: patch.contrast ?? selectedVisual.contrast ?? 100,
      lutPresetId: patch.lutPresetId ?? selectedVisual.lutPresetId ?? '',
      lutName: patch.lutName ?? selectedVisual.lutName ?? '',
      lutText: patch.lutText ?? selectedVisual.lutText ?? '',
      lutAmount: patch.lutAmount ?? selectedVisual.lutAmount ?? 1,
      speed: patch.speed ?? selectedVisual.speed ?? 1,
      fadeIn: patch.fadeIn ?? selectedVisual.fadeIn ?? 0,
      fadeOut: patch.fadeOut ?? selectedVisual.fadeOut ?? 0,
      transition: patch.transition ?? selectedVisual.transition ?? 'none',
      transitionDuration: patch.transitionDuration ?? selectedVisual.transitionDuration ?? 0.5,
      fit: patch.fit ?? selectedVisual.fit ?? 'contain',
      blendMode: patch.blendMode ?? selectedVisual.blendMode ?? 'normal',
    });
  };
  const applyPresetLut = (presetId: string) => {
    if (!presetId) {
      updateVisualFilter({ lutPresetId: '', lutName: '', lutText: '', lutAmount: 1 });
      showCommandFeedback('清除 LUT');
      return;
    }
    const preset = getLutPreset(presetId);
    updateVisualFilter({
      lutPresetId: preset.id,
      lutName: preset.name,
      lutText: preset.cubeText,
      lutAmount: selectedVisual?.lutAmount ?? 1,
    });
    showCommandFeedback(`应用 LUT · ${preset.name}`);
  };
  const importLutFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      if (!/LUT_3D_SIZE/i.test(text)) {
        showCommandFeedback('不是 3D LUT');
        return;
      }
      updateVisualFilter({
        lutPresetId: 'custom-cube',
        lutName: file.name.replace(/\.cube$/i, ''),
        lutText: text,
        lutAmount: selectedVisual?.lutAmount ?? 1,
      });
      showCommandFeedback('已导入 LUT');
    } catch {
      showCommandFeedback('LUT 导入失败');
    } finally {
      if (lutFileInputRef.current) lutFileInputRef.current.value = '';
    }
  };
  const renderSelectionSummaryCard = () => {
    if (selectedKind === 'none') return null;
    const visualStart = Number(selectedLayoutItem?.start || selectedVisual?.start || 0);
    const audioStart = Number(selectedAudio?.start || 0);
    const textStart = Number(selectedText?.start || 0);
    const start = selectedKind === 'visual' ? visualStart : selectedKind === 'audio' ? audioStart : textStart;
    const clipDuration = selectedKind === 'visual'
      ? Number(selectedVisual?.duration || imageDuration)
      : selectedKind === 'audio'
        ? Number(selectedAudio?.duration || duration || imageDuration)
        : Number(selectedText?.duration || 3);
    const kindLabel = selectedKind === 'visual'
      ? selectedVisual?.generation
        ? selectedVisual.generation.nodeType === 'image' ? '图像生成' : '视频生成'
        : selectedVisual?.kind === 'image' ? '图片素材' : '视频素材'
      : selectedKind === 'audio'
        ? '音频素材'
        : '文本素材';
    const name = selectedKind === 'visual'
      ? sourceName(selectedVisual || {})
      : selectedKind === 'audio'
        ? selectedAudio?.label || fileNameFromUrl(selectedAudio?.url || '')
        : selectedText?.label || selectedText?.text || '文本片段';
    const statusLabel = selectedKind === 'visual'
      ? (selectedVisual?.disabled ? '隐藏' : '显示')
      : selectedKind === 'audio'
        ? '音频'
        : '字幕';
    return (
      <div data-clip-selection-summary className={`${paramCardClass} t8-clip-selection-summary space-y-2`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-black">
              <span data-clip-selection-summary-kind className="t8-clip-selection-pill">{kindLabel}</span>
              <span className="t8-clip-selection-pill">{statusLabel}</span>
              {selectedKind === 'visual' ? <span className="t8-clip-selection-pill">V{Math.max(0, Math.round(Number(selectedVisual?.lane || 0))) + 1}</span> : null}
            </div>
          </div>
          <span data-clip-selection-summary-time className="t8-clip-selection-time font-mono">
            {shortSeconds(start)} / {shortSeconds(clipDuration)}
          </span>
        </div>
        <div data-clip-selection-quick-actions className="t8-clip-selection-quick-actions grid grid-cols-4 gap-1">
          <button type="button" className={paramActionClass} onClick={() => seekPlayhead(start, { selectPlayback: false })}>
            定位播放头
          </button>
          <button type="button" className={paramActionClass} onClick={splitSelectedAtPlayhead}>
            分割片段
          </button>
          <button type="button" className={paramActionClass} onClick={duplicateSelectedClip}>
            复制片段
          </button>
          <button type="button" className={`${paramActionClass} t8-clip-selection-danger`} onClick={removeSelectedClip}>
            删除片段
          </button>
        </div>
      </div>
    );
  };
  const renderSelectedVisualColorPanel = (placement: 'left' | 'inspector' = 'inspector') => {
    if (!selectedVisual) return null;
    return (
      <div data-clip-param-section={placement === 'inspector' ? 'color' : undefined} data-clip-visual-color-panel className={`${paramCardClass} space-y-2`}>
        <div className="flex items-center justify-between text-xs font-black">
          <span>调色 / LUT</span>
          <span className="text-[10px] font-bold text-[var(--t8-text-muted)]">预览</span>
        </div>
        <div data-clip-color-preview className="t8-clip-param-preview h-20 overflow-hidden rounded border">
          {selectedVisual.kind === 'video' && selectedVisual.url ? (
            <video
              className="h-full w-full object-cover"
              src={selectedVisual.url}
              muted
              preload="metadata"
              style={{ filter: clipCssFilter(selectedVisual) }}
            />
          ) : selectedVisual.url ? (
            <img
              className="h-full w-full object-cover"
              src={selectedVisual.url}
              alt=""
              draggable={false}
              loading="lazy"
              style={{ filter: clipCssFilter(selectedVisual) }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--t8-clip-dim)]">暂无预览</div>
          )}
        </div>
        <div data-clip-color-basic-controls className="t8-clip-color-basic-controls space-y-2 rounded border border-[var(--t8-border)] bg-[var(--t8-bg-soft)] p-2">
          <div className="flex items-center justify-between gap-2 text-xs font-black">
            <span>基础调色</span>
            <button
              type="button"
              className="t8-clip-param-link rounded px-1.5 py-0.5 text-[10px] font-bold transition"
              onClick={() => updateVisualFilter({ hue: 0, saturation: 100, brightness: 100, contrast: 100 })}
            >
              重置色彩
            </button>
          </div>
          <label className="block space-y-1">
            <span className={`flex items-center justify-between ${paramLabelClass}`}>
              <span>色相</span>
              <span className="font-mono">{clipColorHue(selectedVisual)}°</span>
            </span>
            <input
              className={paramRangeClass}
              type="range"
              min={-180}
              max={180}
              step={1}
              value={clipColorHue(selectedVisual)}
              onChange={(event) => updateVisualFilter({ hue: Number(event.target.value) })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className={`flex items-center justify-between ${paramLabelClass}`}>
                <span>饱和度</span>
                <span className="font-mono">{clipColorPercent(selectedVisual.saturation, 100)}%</span>
              </span>
              <input
                className={paramRangeClass}
                type="range"
                min={0}
                max={200}
                step={1}
                value={clipColorPercent(selectedVisual.saturation, 100)}
                onChange={(event) => updateVisualFilter({ saturation: Number(event.target.value) })}
              />
            </label>
            <label className="block space-y-1">
              <span className={`flex items-center justify-between ${paramLabelClass}`}>
                <span>明度</span>
                <span className="font-mono">{clipColorPercent(selectedVisual.brightness, 100)}%</span>
              </span>
              <input
                className={paramRangeClass}
                type="range"
                min={0}
                max={200}
                step={1}
                value={clipColorPercent(selectedVisual.brightness, 100)}
                onChange={(event) => updateVisualFilter({ brightness: Number(event.target.value) })}
              />
            </label>
            <label className="block space-y-1">
              <span className={`flex items-center justify-between ${paramLabelClass}`}>
                <span>对比度</span>
                <span className="font-mono">{clipColorPercent(selectedVisual.contrast, 100)}%</span>
              </span>
              <input
                className={paramRangeClass}
                type="range"
                min={0}
                max={200}
                step={1}
                value={clipColorPercent(selectedVisual.contrast, 100)}
                onChange={(event) => updateVisualFilter({ contrast: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
        <label className="block space-y-1">
          <span className={paramLabelClass}>视觉滤镜</span>
          <select
            className={fieldClass}
            value={selectedVisual.filter || 'none'}
            onChange={(event) => updateVisualFilter({ filter: event.target.value as ClipFilterPreset, intensity: Number(selectedVisual.intensity ?? 65) })}
          >
            {CLIP_FILTER_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {CLIP_FILTER_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={`flex items-center justify-between ${paramLabelClass}`}>
            <span>强度</span>
            <button
              type="button"
              className="t8-clip-param-link rounded px-1.5 py-0.5 text-[10px] font-bold transition"
              onClick={() => updateVisualFilter({ filter: 'none', intensity: 65 })}
            >
              重置滤镜
            </button>
          </span>
          <input
            className={paramRangeClass}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Number(selectedVisual.intensity ?? 65)}
            onChange={(event) => updateVisualFilter({ filter: selectedVisual.filter || 'none', intensity: Number(event.target.value) })}
          />
        </label>
        <div data-clip-color-lut-controls className="space-y-2 rounded border border-[var(--t8-border)] bg-[var(--t8-bg-soft)] p-2">
          <div className="flex items-center justify-between gap-2 text-xs font-black">
            <span>视频 LUT</span>
            <span className="t8-clip-param-value max-w-[9rem] truncate text-[10px] font-mono">
              {selectedVisual.lutName || (selectedVisual.lutText ? '自定义 LUT' : '未启用')}
            </span>
          </div>
          <label className="block space-y-1">
            <span className={paramLabelClass}>LUT 预设</span>
            <select
              className={fieldClass}
              value={selectedVisual.lutPresetId || ''}
              onChange={(event) => applyPresetLut(event.target.value)}
            >
              <option value="">不使用 LUT</option>
              {LUT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={`flex items-center justify-between ${paramLabelClass}`}>
              <span>LUT 强度</span>
              <span className="font-mono">{Math.round(Number(selectedVisual.lutAmount ?? 1) * 100)}%</span>
            </span>
            <input
              className={paramRangeClass}
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(Number(selectedVisual.lutAmount ?? 1) * 100)}
              onChange={(event) => updateVisualFilter({ lutAmount: Number(event.target.value) / 100 })}
            />
          </label>
          <input
            ref={lutFileInputRef}
            className="hidden"
            type="file"
            accept=".cube"
            onChange={(event) => void importLutFile(event.target.files?.[0])}
          />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={paramActionClass} onClick={() => lutFileInputRef.current?.click()}>
              <Upload size={12} />
              导入 .cube
            </button>
            <button type="button" className={paramActionClass} onClick={() => applyPresetLut('')}>
              清除 LUT
            </button>
          </div>
          <div className="text-[10px] leading-relaxed text-[var(--t8-text-muted)]">
            导出时会用 FFmpeg lut3d 真实套入视频和图片片段。
          </div>
        </div>
      </div>
    );
  };
  const renderSelectedVisualMotionPanel = (placement: 'left' | 'inspector' = 'inspector') => {
    if (!selectedVisual) return null;
    return (
      <div data-clip-param-section={placement === 'inspector' ? 'motion' : undefined} data-clip-visual-motion-panel className="space-y-2">
        {selectedVisual.kind === 'video' ? (
          <div className={`${paramCardClass} space-y-2`}>
            <div className="flex items-center justify-between text-xs font-black">
              <span>变速</span>
              <span className="t8-clip-param-value font-mono">{Number(selectedVisual.speed || 1).toFixed(2)}x</span>
            </div>
            <input
              className={paramRangeClass}
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={Number(selectedVisual.speed || 1)}
              onChange={(event) => updateVisualFilter({ speed: Number(event.target.value) })}
            />
            <div className="grid grid-cols-5 gap-1">
              {[0.5, 1, 1.5, 2, 4].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={`${paramActionClass} ${
                    Math.abs(Number(selectedVisual.speed || 1) - speed) < 0.001
                      ? 'is-active'
                      : ''
                  }`}
                  onClick={() => updateVisualFilter({ speed })}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className={`${paramCardClass} space-y-2`}>
          <div className="text-xs font-black">动效 / 变换</div>
          <label className="block space-y-1">
            <span className={paramLabelClass}>缩放</span>
            <input className={fieldClass} type="number" min={10} max={400} value={activeTransform.scale} onChange={(event) => updateTransform({ scale: Number(event.target.value) })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className={paramLabelClass}>X</span>
              <input className={fieldClass} type="number" value={activeTransform.x} onChange={(event) => updateTransform({ x: Number(event.target.value) })} />
            </label>
            <label className="block space-y-1">
              <span className={paramLabelClass}>Y</span>
              <input className={fieldClass} type="number" value={activeTransform.y} onChange={(event) => updateTransform({ y: Number(event.target.value) })} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={paramLabelClass}>旋转</span>
            <input className={fieldClass} type="number" min={-360} max={360} value={activeTransform.rotation} onChange={(event) => updateTransform({ rotation: Number(event.target.value) })} />
          </label>
        </div>
        <div data-clip-param-subsection="keyframes" className={`${paramCardClass} space-y-2`}>
          <div className="flex items-center justify-between gap-2 text-xs font-black">
            <span>关键帧动画</span>
            <button type="button" className={paramActionClass} onClick={addVisualKeyframeAtPlayhead}>
              添加关键帧
            </button>
          </div>
          <div className="text-[10px] text-[var(--t8-text-muted)]">当前片段 {shortSeconds(selectedVisualLocalTime)} · {selectedVisualKeyframes.length} 个关键帧</div>
          {selectedVisualKeyframes.length === 0 ? (
            <div className="t8-clip-param-empty rounded border border-dashed px-3 py-2 text-center text-[11px]">在播放头位置记录缩放、位置、旋转和透明度</div>
          ) : (
            <div className="space-y-1">
              {selectedVisualKeyframes.map((keyframe) => (
                <div key={`param-keyframe-${keyframe.time}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded border border-[var(--t8-border)] px-2 py-1 text-[10px]">
                  <button type="button" className="min-w-0 truncate text-left font-mono text-amber-200" onClick={() => seekPlayhead((selectedLayoutItem?.start || 0) + keyframe.time)}>
                    ◆ {formatSeconds(keyframe.time, fps)}
                  </button>
                  <span className="text-[var(--t8-text-muted)]">{Math.round(Number(keyframe.scale || 100))}%</span>
                  <button type="button" className={paramActionClass} onClick={() => removeVisualKeyframe(keyframe.time)}>删除</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={`${paramCardClass} space-y-2`}>
          <div className="text-xs font-black">混合</div>
          <label className="block space-y-1">
            <span className={paramLabelClass}>透明度</span>
            <input className={fieldClass} type="number" min={0} max={100} value={activeTransform.opacity} onChange={(event) => updateTransform({ opacity: Number(event.target.value) })} />
          </label>
          <label className="block space-y-1">
            <span className={paramLabelClass}>混合模式</span>
            <select
              className={fieldClass}
              value={selectedVisual.blendMode || 'normal'}
              onChange={(event) => updateVisualFilter({ blendMode: event.target.value as ClipBlendMode })}
            >
              {CLIP_BLEND_MODE_IDS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'normal' ? '正常' : mode === 'multiply' ? '正片叠底' : mode === 'screen' ? '滤色' : mode === 'overlay' ? '叠加' : mode === 'darken' ? '变暗' : '变亮'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  };
  const frameCoverPreviewUrl = selectedVisual?.kind === 'video' ? selectedVisual.url : selectedVisual?.kind === 'image' ? selectedVisual.url : '';
  const frameCoverSaveUrl = selectedVisual?.kind === 'image' ? selectedVisual.url : '';
  const currentCoverPreview = coverTab === 'local' && coverUrl ? coverUrl : frameCoverPreviewUrl || outputUrl || coverUrl;
  const confirmCover = () => {
    onPatchSettings({
      clipCoverUrl: coverTab === 'local' ? currentCoverPreview : frameCoverSaveUrl,
      clipCoverTime: coverDraftTime,
      clipCoverSource: coverTab,
    });
    setCoverOpen(false);
  };
  const clipContextMenuItem = clipContextMenu
    ? [...timelineVisuals, ...audios.map((item, index) => ({ ...item, id: item.id || item.url || `audio-${index}`, kind: 'audio' as const })), ...texts.map((item, index) => ({ ...item, id: item.id || item.text || `text-${index}`, kind: 'text' as const }))].find((item) => item.id === clipContextMenu.id)
    : null;
  const clipContextMenuVisual: ClipTimelineVisualMaterial | undefined = clipContextMenu?.kind === 'visual'
    ? timelineVisuals.find((item) => item.id === clipContextMenu.id)
    : undefined;
  const startResize = (
    type: 'left' | 'right' | 'timeline',
    event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const renderedTopHeight = topRowPanelRef.current?.getBoundingClientRect().height;
    setResizeState({
      type,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: type === 'timeline'
        ? { ...layoutState, topHeight: renderedTopHeight || layoutState.topHeight }
        : layoutState,
    });
  };
  const startTimelineHeaderResize = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button,input,select,textarea,a,[role="button"],[data-no-layout-resize]')) return;
    startResize('timeline', event);
  };
  const startTrackResize = (
    id: ClipTimelineTrackId,
    height: number,
    event: { clientY: number; preventDefault: () => void; stopPropagation: () => void },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setTrackResizeState({ id, startY: event.clientY, startHeight: height });
  };
  const startTimelineScrub = (
    event: { clientX: number; preventDefault: () => void; stopPropagation: () => void },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setTimelineScrubActive(true);
    seekFromClientX(event.clientX);
  };

  if (!open) return null;

  const ui = (
    <div
      ref={editorShellRef}
      data-clip-studio-editor-shell
      tabIndex={-1}
      className="t8-app-shell t8-clip-studio-editor t8-clip-motion-pop fixed inset-0 z-[10120] flex flex-col nodrag nowheel"
      style={{
        background: 'var(--t8-bg-app, #161616)',
        color: 'var(--t8-text-main, #f4f4f5)',
        fontFamily: 'var(--t8-font-family, inherit)',
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={handleEditorKeyDown}
    >
      {commandFeedback ? (
        <div
          data-clip-command-feedback
          className="t8-clip-command-feedback pointer-events-none fixed right-4 top-4 z-50 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[10px] font-black text-white shadow-xl"
        >
          {commandFeedback}
        </div>
      ) : null}
      {showShortcutHelp ? (
        <div
          data-clip-shortcut-help
          className="t8-clip-shortcut-help fixed right-4 top-16 z-50 w-[310px] rounded-lg border border-white/10 bg-[#101010]/95 p-3 text-xs text-zinc-300 shadow-2xl backdrop-blur"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="font-black text-white">快捷键帮助</div>
            <button type="button" className={iconButton} title="关闭快捷键帮助" onClick={() => setShowShortcutHelp(false)}>
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5">
            <span className="font-mono text-emerald-300">Space</span><span>播放 / 暂停</span>
            <span className="font-mono text-emerald-300">← / →</span><span>逐帧移动播放头</span>
            <span className="font-mono text-emerald-300">Shift + ←/→</span><span>前后移动 1 秒</span>
            <span className="font-mono text-emerald-300">B</span><span>在播放头分割片段</span>
            <span className="font-mono text-emerald-300">D</span><span>复制所选片段</span>
            <span className="font-mono text-emerald-300">F</span><span>适配完整时间线</span>
            <span className="font-mono text-emerald-300">Delete</span><span>删除所选片段</span>
            <span className="font-mono text-emerald-300">Ctrl/Cmd + Z</span><span>撤销</span>
            <span className="font-mono text-emerald-300">Ctrl/Cmd + Y</span><span>重做</span>
            <span className="font-mono text-emerald-300">Ctrl/Cmd +/-</span><span>缩放时间线</span>
          </div>
        </div>
      ) : null}
      <header className="t8-clip-header flex h-12 shrink-0 items-center justify-between border-b border-[#2f2f2f] bg-[#171717] px-3">
        <div className="flex items-center gap-3">
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded hover:bg-white/10" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 text-sm font-black">
            <Scissors size={16} />
            <span>剪辑编辑器</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={iconButton}
            title="快捷键帮助"
            aria-label="快捷键帮助"
            aria-pressed={showShortcutHelp}
            onClick={() => setShowShortcutHelp((value) => !value)}
          >
            <HelpCircle size={15} />
          </button>
          <button
            type="button"
            className={`${editorButton} t8-clip-primary-button bg-[#89f7a2] text-black hover:bg-[#9dffb2]`}
            onClick={onRender}
            disabled={status === 'running' || !canRender}
            title={!canRender ? '请先添加可导出的素材' : exportInspection.status === 'warning' ? '导出检查有需要注意的项目' : '导出'}
          >
            <Download size={15} />
            {status === 'running' ? '导出中' : '导出'}
          </button>
        </div>
      </header>
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        onChange={(event) => {
          submitFiles(event.target.files || []);
          event.currentTarget.value = '';
        }}
      />

      <main
        ref={editorMainRef}
        className="grid min-h-0 flex-1 p-3"
        style={{
          gridTemplateColumns: `minmax(260px,min(${layoutState.leftWidth}px,30vw)) 8px minmax(300px,1fr) 8px minmax(260px,min(${layoutState.rightWidth}px,30vw))`,
          gridTemplateRows: `minmax(144px, min(${layoutState.topHeight}px, calc(100dvh - 288px))) 8px minmax(208px,1fr)`,
        }}
      >
        <section className={`t8-clip-panel min-h-0 overflow-hidden rounded-md border ${border} ${panelBg}`} style={{ gridColumn: 1, gridRow: 1 }}>
          <div className="grid h-full grid-cols-[80px_1fr]">
            <nav className="t8-clip-rail border-r border-[#303030] bg-[#1f1f1f] p-1">
              {[
                ['media', FolderOpen, '媒体'],
                ['sound', Music, '音效'],
                ['text', TextCursorInput, '文本'],
                ['color', SlidersHorizontal, '调色'],
                ['motion', Film, '动效'],
                ['settings', SlidersHorizontal, '设置'],
              ].map(([id, Icon, label]) => (
                <button
                  key={String(id)}
                  type="button"
                  className={`t8-clip-tab mb-1 flex h-9 w-full items-center justify-center gap-1.5 rounded text-[11px] font-bold ${tab === id ? 'is-active bg-black text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
                  onClick={() => setTab(id as MediaTab)}
                >
                  <Icon size={13} />
                  {String(label)}
                </button>
              ))}
            </nav>
            <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              <div className="t8-clip-panel-header flex h-8 shrink-0 items-center justify-between border-b border-[#303030] px-2.5">
                <div className="text-sm font-black">{tab === 'media' ? '素材' : tab === 'sound' ? '音频' : tab === 'text' ? '文本' : tab === 'color' ? '调色' : tab === 'motion' ? '动效' : '工程设置'}</div>
                {tab === 'media' ? (
                  <button type="button" className={`${editorButton} t8-clip-dark-button bg-black text-white hover:bg-[#303030]`} onClick={chooseFiles}>
                    <Upload size={14} />
                    导入
                  </button>
                ) : null}
              </div>

              {tab === 'media' ? (
                <div data-clip-media-pane className="flex min-h-0 flex-1 flex-col overflow-hidden gap-2 p-2">
                  <div
                    data-clip-import-dropzone
                    className={`t8-clip-dropzone rounded-md border border-dashed px-3 py-5 text-center text-[11px] leading-tight text-zinc-500 ${isDragOverImport ? 'is-dragover border-emerald-300 bg-emerald-400/10 text-emerald-100' : 'border-[#3d3d3d] bg-[#2b2b2b]'}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsDragOverImport(true);
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsDragOverImport(true);
                    }}
                    onDragLeave={() => setIsDragOverImport(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsDragOverImport(false);
                      submitFiles(event.dataTransfer.files || []);
                    }}
                  >
                    <Upload className="mx-auto mb-2 text-zinc-300" size={24} />
                    拖放视频、图片和音频文件到这里
                  </div>
                  <div className="t8-clip-source-tabs grid grid-cols-2 gap-1.5 text-[11px] lg:grid-cols-3">
                    {([
                      ['import', '导入'],
                      ['canvas', '画布素材'],
                      ['history', '历史记录'],
                      ['assets', resourceLoading ? '我的资产...' : '我的资产'],
                    ] as Array<[MediaSource, string]>).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`t8-clip-compact-chip rounded px-2 py-1 font-bold ${mediaSource === id ? 'is-active' : ''}`}
                        onClick={() => setMediaSource(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="t8-clip-media-filter-grid flex items-center gap-1.5 text-[11px]">
                    {(['all', 'image', 'video', 'audio'] as MediaFilter[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`t8-clip-compact-chip rounded px-2.5 py-1 font-bold ${filter === item ? 'is-active' : ''}`}
                        onClick={() => setFilter(item)}
                      >
                        {item === 'all' ? '全部' : item === 'image' ? '图片' : item === 'video' ? '视频' : '音频'}
                      </button>
                    ))}
                  </div>
                  {mediaSource === 'history' ? (
                    <div className="t8-clip-media-chip rounded px-3 py-1.5 text-[11px] font-bold">今天</div>
                  ) : null}
                  {mediaSource === 'assets' ? (
                    <button type="button" className={`${editorButton} t8-clip-media-chip justify-start`} onClick={onRefreshResourceLibrary}>
                      刷新我的资产
                    </button>
                  ) : null}
                  <div data-clip-media-library-scroll className="t8-clip-media-library-scroll t8-clip-scroll-region min-h-0 max-h-full flex-1 overflow-y-auto overflow-x-hidden pr-1">
                    <div data-clip-media-grid className="grid auto-rows-[96px] grid-cols-2 gap-1.5">
                      {mediaItems.length === 0 ? (
                        <div className="t8-clip-media-empty col-span-2 rounded border p-4 text-center text-xs">连接上游素材后会出现在这里</div>
                      ) : mediaItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        draggable={Boolean(item.url)}
                        className={`t8-clip-media-card group relative overflow-hidden rounded border text-left ${selectedVisual?.id === item.id ? 'is-selected' : ''}`}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('application/x-t8-clip-material', item.id);
                          event.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => {
                          if (item.origin === 'import') {
                            if (item.kind !== 'audio') selectClip(item.id);
                            return;
                          }
                          if (item.kind === 'image' || item.kind === 'video' || item.kind === 'audio') {
                            setSelectedIds([]);
                            onImportMaterial({
                              id: item.id,
                              kind: item.kind,
                              url: item.url || '',
                            sourceNodeId: item.origin,
                            origin: 'local',
                            label: item.label,
                          });
                          }
                        }}
                      >
                        {item.kind === 'image' && item.url ? (
                          <img className="h-[78px] w-full object-cover" src={item.url} alt="" draggable={false} />
                        ) : item.kind === 'video' && item.url ? (
                          <video className="h-[78px] w-full object-cover" src={item.url} muted preload="metadata" />
                        ) : item.kind === 'audio' ? (
                          <span className="flex h-[78px] w-full items-center justify-center text-sky-300"><Music size={22} /></span>
                        ) : (
                          <span data-clip-media-draft-placeholder className="flex h-[78px] w-full items-center justify-center text-fuchsia-200">
                            {item.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />}
                          </span>
                        )}
                        <span className="flex h-7 items-center justify-between gap-2 px-2 text-[10px] text-zinc-500">
                          <span className="min-w-0 truncate">{sourceName(item)}</span>
                          <span>{item.kind === 'image' ? '图片' : item.kind === 'video' ? '视频' : '音频'}</span>
                        </span>
                        {selectedVisual?.id === item.id ? (
                          <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-black">
                            <Check size={13} />
                          </span>
                        ) : null}
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded opacity-0 transition group-hover:opacity-100">
                          <Plus size={14} />
                        </span>
                        {item.origin !== 'import' ? (
                          <span className="absolute bottom-9 right-2 rounded px-1.5 py-0.5 text-[10px] font-black opacity-0 transition group-hover:opacity-100">
                            加入
                          </span>
                        ) : null}
                      </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : tab === 'sound' ? (
                <div className="t8-clip-scroll-region min-h-0 flex-1 space-y-2 overflow-auto p-2">
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {([
                      ['canvas-audio', '画布音频'],
                      ['upload', '上传音效'],
                    ] as Array<[SoundSource, string]>).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`t8-clip-compact-chip rounded px-2 py-1.5 font-bold ${soundSource === id ? 'is-active' : ''}`}
                        onClick={() => {
                          setSoundSource(id);
                          if (id === 'upload') chooseFiles();
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {audios.length === 0 ? <div className="text-xs text-zinc-500">暂无音频素材</div> : audios.map((item, index) => {
                    const itemId = item.id || item.url || `audio-${index}`;
                    return (
                      <button key={itemId} type="button" className={`t8-clip-media-card w-full rounded border p-1.5 text-left text-xs transition ${selectedId === itemId ? 'is-selected' : ''}`} onClick={() => selectClip(itemId)}>
                        <div className="truncate font-bold">{item.label || fileNameFromUrl(item.url || '')}</div>
                        <div className="truncate text-zinc-500">{item.url}</div>
                      </button>
                    );
                  })}
                </div>
              ) : tab === 'text' ? (
                <div className="t8-clip-scroll-region min-h-0 flex-1 space-y-2 overflow-auto p-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" className={`${editorButton} t8-clip-compact-chip`} onClick={() => onCreateTextClip('默认文本')}>
                      默认文本
                    </button>
                    <button type="button" className={`${editorButton} t8-clip-compact-chip is-active`} onClick={() => onCreateTextClip('新建文本')}>
                      新建文本
                    </button>
                  </div>
                  {texts.length === 0 ? <div className="text-xs text-zinc-500">暂无文本素材</div> : texts.map((item, index) => {
                    const itemId = item.id || item.text || `text-${index}`;
                    return (
                      <button key={itemId} type="button" className={`t8-clip-media-card w-full rounded border p-1.5 text-left text-xs leading-relaxed transition ${selectedId === itemId ? 'is-selected' : ''}`} onClick={() => selectClip(itemId)}>
                        {item.text || item.url}
                      </button>
                    );
                  })}
                </div>
              ) : tab === 'color' ? (
                <div data-clip-left-color-editor className="t8-clip-left-editor t8-clip-scroll-region min-h-0 flex-1 overflow-auto p-2 text-xs">
                  {selectedVisual ? renderSelectedVisualColorPanel('left') : (
                    <div className="t8-clip-param-empty rounded border border-dashed p-4 text-center">选择图片或视频片段后编辑调色和 LUT</div>
                  )}
                </div>
              ) : tab === 'motion' ? (
                <div data-clip-left-motion-editor className="t8-clip-left-editor t8-clip-scroll-region min-h-0 flex-1 overflow-auto p-2 text-xs">
                  {selectedVisual ? renderSelectedVisualMotionPanel('left') : (
                    <div className="t8-clip-param-empty rounded border border-dashed p-4 text-center">选择图片或视频片段后编辑变换、变速和关键帧</div>
                  )}
                </div>
              ) : (
                <div className="t8-clip-settings-pane t8-clip-scroll-region space-y-2 overflow-auto min-h-0 flex-1 p-2 text-xs">
                  <div className="t8-clip-settings-card space-y-2 rounded border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-black">快速成片模板</div>
                      <span className="text-[10px] text-zinc-500">一键套画幅/滤镜/转场/字幕</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_CLIP_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className="t8-clip-preset-button rounded border px-2 py-1.5 text-[11px] font-black transition active:scale-95"
                          onClick={() => onApplyQuickTemplate(template.id)}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="t8-clip-settings-card space-y-2 rounded border p-2">
                    <div className="text-xs font-black">平台预设</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CLIP_PLATFORM_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="t8-clip-preset-button rounded border px-2 py-1.5 text-[11px] font-black transition active:scale-95"
                          onClick={() => onPatchSettings({
                            clipRatio: preset.ratio,
                            clipRatioMode: 'manual',
                            clipResolution: preset.resolution,
                            clipFps: preset.fps,
                          })}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block space-y-1">
                    <span className="flex items-center justify-between gap-2 text-zinc-500">
                      <span>画幅</span>
                      <button type="button" className="t8-clip-param-action" onClick={() => onPatchSettings({ clipRatioMode: 'auto' })}>
                        自动
                      </button>
                    </span>
                    <select className={fieldClass} value={ratio} onChange={(event) => onPatchSettings({ clipRatio: event.target.value, clipRatioMode: 'manual' })}>
                      {CLIP_RATIO_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                    <span className="block text-[10px] text-zinc-500">{clipRatioMode === 'manual' ? '手动锁定比例' : '自动跟随当前素材比例'}</span>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-zinc-500">清晰度</span>
                    <select className={fieldClass} value={resolution} onChange={(event) => onPatchSettings({ clipResolution: event.target.value })}>
                      {CLIP_RESOLUTION_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>{preset}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-zinc-500">帧率</span>
                    <select className={fieldClass} value={String(fps)} onChange={(event) => onPatchSettings({ clipFps: Number(event.target.value) })}>
                      <option value="24">24 fps</option>
                      <option value="30">30 fps</option>
                      <option value="60">60 fps</option>
                    </select>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <input
                        data-clip-fps-slider
                        className={paramRangeClass}
                        type="range"
                        min={12}
                        max={60}
                        step={1}
                        value={fps}
                        onChange={(event) => onPatchSettings({ clipFps: Number(event.target.value) })}
                      />
                      <span className="t8-clip-param-value font-mono text-[10px]">{fps}fps</span>
                    </div>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-zinc-500">背景色</span>
                    <input className="t8-clip-color-field h-7 w-full rounded border p-1" type="color" value={background} onChange={(event) => onPatchSettings({ clipBackground: event.target.value })} />
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>

        <div
          data-clip-layout-resize="left"
          className="t8-clip-resize-grip mx-1 cursor-col-resize rounded bg-transparent transition hover:bg-emerald-300/35"
          style={{ gridColumn: 2, gridRow: 1 }}
          onPointerDown={(event) => startResize('left', event)}
          onMouseDown={(event) => startResize('left', event)}
          title="拖动调整素材区宽度"
        />

        <section ref={topRowPanelRef} className={`t8-clip-panel min-h-0 overflow-hidden rounded-md border ${border} ${panelBg}`} style={{ gridColumn: 3, gridRow: 1 }}>
          <div className="flex h-full flex-col">
            <div className="t8-clip-player-header t8-clip-panel-header flex h-8 shrink-0 items-center justify-between gap-1.5 overflow-hidden border-b border-[#303030] px-2.5 text-[11px] font-bold">
              <span className="truncate">播放器-主场景</span>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-black ${
                    exportInspection.status === 'warning'
                      ? 'border-amber-300/40 bg-amber-400/10 text-amber-200'
                      : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                  }`}
                  title={exportInspection.items.map((item) => item.message).join('\n') || '导出检查通过'}
                >
                  {exportInspection.status === 'warning' ? `检查 ${exportInspection.items.length}` : '检查通过'}
                </span>
                <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500">{exportSettings.width}x{exportSettings.height}</span>
                <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">{clipRatioMode === 'manual' ? '手动' : '自动'}</span>
              </div>
            </div>
            <div ref={previewPanelRef} className="t8-clip-preview-panel flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
              <div
                className="t8-clip-preview-stage relative flex items-center justify-center overflow-hidden bg-black shadow-[0_18px_50px_rgba(0,0,0,.38)]"
                data-clip-preview-fit={previewFit}
                style={previewStageStyle}
              >
                <div
                  className={`relative h-full w-full ${hasVisiblePreviewMedia ? 'outline outline-1 outline-dashed outline-white/80' : ''}`}
                  style={{
                    opacity: previewTransform.opacity / 100,
                    filter: clipCssFilter(previewVisual),
                    transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) rotate(${previewTransform.rotation}deg) scale(${previewTransform.scale / 100})`,
                  }}
                >
                  {previewVisual?.url && previewVisual.kind === 'image' ? (
                    <img className={`h-full w-full ${previewFit === 'cover' ? 'object-cover' : 'object-contain'}`} src={previewVisual.url} alt="" />
                  ) : previewVisual?.url && previewVisual.kind === 'video' ? (
                    <video
                      ref={previewVideoRef}
                      className={`h-full w-full ${previewFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                      src={previewVisual.url}
                      playsInline
                      onClick={togglePreviewPlayback}
                      onLoadedMetadata={handlePreviewVideoLoadedMetadata}
                      onEnded={handlePreviewVideoEnded}
                    />
                  ) : null}
                  {previewVisual ? (
                    <>
                      {['left-0 top-0', 'right-0 top-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos) => (
                        <span key={pos} className={`absolute h-2.5 w-2.5 rounded-full bg-white shadow ${pos}`} />
                      ))}
                      <span className="absolute left-1/2 top-[-14px] flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-white text-black shadow">
                        <RotateCw size={12} />
                      </span>
                    </>
                  ) : null}
                </div>
                {activePreviewTextClips.length > 0 ? (
                  <div className="t8-clip-preview-text-overlay pointer-events-none absolute inset-0 z-20">
                    {activePreviewTextClips.map((item, index) => (
                      <div
                        key={item.id || item.text || index}
                        className="absolute max-w-[86%] rounded bg-black/55 px-3 py-1 text-center font-black leading-tight text-white shadow-[0_2px_12px_rgba(0,0,0,.45)]"
                        style={{
                          left: `${Number(item.x ?? 50)}%`,
                          top: `${Number(item.y ?? 88)}%`,
                          color: item.color || '#ffffff',
                          fontSize: Math.max(12, Math.min(42, Number(item.fontSize || 42) * 0.55)),
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        {item.text}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="t8-clip-player-controls flex min-h-[56px] shrink-0 flex-col justify-center gap-2 px-4 py-2 text-xs">
              <input
                className="nodrag h-1 w-full cursor-pointer accent-emerald-400"
                title="拖动播放器进度"
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={1 / Math.max(1, fps)}
                value={Math.min(playheadTime, duration || 0)}
                onChange={(event) => seekPlayhead(Number(event.target.value))}
              />
              <div className="grid grid-cols-[minmax(120px,1fr)_auto_minmax(180px,1fr)] items-center gap-2">
                <div className="min-w-0 truncate"><span className="font-mono text-emerald-400">{formatSeconds(playheadTime, fps)}</span><span className="mx-1.5 text-zinc-600">/</span><span className="font-mono text-zinc-500">{formatSeconds(duration, fps)}</span></div>
                <div className="flex items-center gap-1">
                  <button type="button" className={iconButton} title="后退 1 帧" onClick={() => stepPlayheadByFrames(-1)} disabled={!duration}>
                    <ChevronLeft size={14} />
                  </button>
                  <button type="button" className="t8-clip-play-button flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10" title="播放预览" onClick={togglePreviewPlayback}>
                    {playing || status === 'running' ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button type="button" className={iconButton} title="前进 1 帧" onClick={() => stepPlayheadByFrames(1)} disabled={!duration}>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="t8-clip-preview-controls flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                  <label className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500">画幅</span>
                    <select className={`${fieldClass} h-7 w-24`} value={ratio} onChange={(event) => onPatchSettings({ clipRatio: event.target.value, clipRatioMode: 'manual' })}>
                      {CLIP_RATIO_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className={`${iconButton} ${clipRatioMode === 'auto' ? 'text-emerald-300' : ''}`} title="自动跟随素材比例" onClick={() => onPatchSettings({ clipRatioMode: 'auto' })}>
                    A
                  </button>
                  <label className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500">尺寸</span>
                    <select className={`${fieldClass} h-7 w-20`} value={resolution} onChange={(event) => onPatchSettings({ clipResolution: event.target.value })}>
                      {CLIP_RESOLUTION_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>{preset}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className={`${iconButton} ${previewFit === 'contain' ? 'text-emerald-300' : ''}`} title="适配播放器" onClick={() => setPreviewFit('contain')}>
                    <Check size={13} />
                  </button>
                  <button type="button" className={`${iconButton} ${previewFit === 'cover' ? 'text-emerald-300' : ''}`} title="铺满播放器" onClick={() => setPreviewFit('cover')}>
                    <Maximize2 size={13} />
                  </button>
                  <label className="hidden items-center gap-1 lg:flex">
                    <span className="text-[10px] text-zinc-500">预览大小</span>
                    <input
                      className="nodrag h-1 w-20 accent-emerald-400"
                      type="range"
                      min={60}
                      max={140}
                      step={5}
                      value={previewScale}
                      onChange={(event) => setPreviewScale(Number(event.target.value))}
                    />
                  </label>
                  <button type="button" className={iconButton} title="全屏播放" onClick={requestPreviewFullscreen}>
                    <Maximize2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div
          data-clip-layout-resize="right"
          className="t8-clip-resize-grip mx-1 cursor-col-resize rounded bg-transparent transition hover:bg-emerald-300/35"
          style={{ gridColumn: 4, gridRow: 1 }}
          onPointerDown={(event) => startResize('right', event)}
          onMouseDown={(event) => startResize('right', event)}
          title="拖动调整参数区宽度"
        />

        <aside className={`t8-clip-panel min-h-0 overflow-hidden rounded-md border ${border} ${panelBg}`} style={{ gridColumn: 5, gridRow: 1 }}>
          <div className="t8-clip-panel-header t8-clip-inspector-header flex h-12 min-w-0 flex-col justify-center border-b border-[#303030] px-4 text-xs font-bold">
            <div data-clip-inspector-title className="truncate">{inspectorTitle}</div>
            <div data-clip-inspector-subtitle className="mt-0.5 truncate text-[10px] font-medium text-[var(--t8-text-muted)]">{inspectorSubtitle}</div>
          </div>
          <div className="flex h-[calc(100%-48px)] flex-col">
            {selectedKind === 'visual' && selectedVisual?.generation ? (
              <div data-clip-generation-draft-panel className={paramPaneClass}>
                {renderSelectionSummaryCard()}
                <div data-clip-param-section="generation" className={`${paramCardClass} space-y-3`}>
                  <div className="flex items-center justify-between gap-2 text-xs font-black">
                    <span>生成</span>
                    <span className="t8-clip-param-value">{selectedVisual.generation.nodeType === 'image' ? '图片模型' : '视频模型'}</span>
                  </div>
                  {selectedVisualGenerationChoice ? (
                    <div data-clip-generation-section="model" className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className={paramLabelClass}>模型</span>
                        <select
                          className={fieldClass}
                          value={selectedVisualGenerationChoice.mainId}
                          onChange={(event) => applySelectedVisualGenerationModelGroup(event.target.value)}
                        >
                          {selectedVisualGenerationModelGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className={paramLabelClass}>具体模型</span>
                        <select
                          className={fieldClass}
                          value={selectedVisualGenerationChoice.apiModel}
                          onChange={(event) => applySelectedVisualGenerationApiModel(event.target.value)}
                        >
                          {(selectedVisualGenerationChoice.apiModelOptions.length ? selectedVisualGenerationChoice.apiModelOptions : [{ value: selectedVisualGenerationChoice.apiModel, label: selectedVisualGenerationChoice.apiModel }]).map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                  <div data-clip-generation-draft-refs data-clip-generation-section="refs" className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-black">
                      <span>引用素材</span>
                      <button
                        type="button"
                        className={paramActionClass}
                        onClick={() => {
                          const material = mediaItems.find((item) => item.url && item.id !== selectedVisual.id && clipGenerationRefLimitForKind(selectedVisualGenerationReferenceSupport, item.kind) > 0);
                          if (material) {
                            addSelectedVisualGenerationMaterialRef(material);
                            showCommandFeedback('引用素材已添加');
                          } else {
                            showCommandFeedback('没有可引用素材');
                          }
                        }}
                      >
                        <Plus size={12} />
                        添加引用
                      </button>
                    </div>
                    {selectedVisualGenerationRefSuggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedVisualGenerationRefSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.key}
                            type="button"
                            data-clip-generation-smart-ref={suggestion.label}
                            className="t8-clip-generation-smart-ref"
                            title={`${suggestion.label}：${sourceName(suggestion.material)}`}
                            onClick={() => addGenerationRefSuggestion(selectedVisual.id || '', selectedVisual.generation, suggestion)}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <MaterialPreviewSection
                      dataRole="clip-generation-draft-refs"
                      title="参考素材"
                      images={selectedVisualGenerationRefMaterialsByKind.image}
                      videos={selectedVisualGenerationRefMaterialsByKind.video}
                      audios={selectedVisualGenerationRefMaterialsByKind.audio}
                      order={(selectedVisual.generation.refs || []).map((ref) => ref.id)}
                      onReorder={reorderSelectedVisualGenerationRefs}
                      onRemoveLocal={removeSelectedVisualGenerationRef}
                      isDark
                      isPixel={false}
                      groups={selectedVisualGenerationReferenceSupport.groups}
                      uploadActions={selectedVisualGenerationUploadActions}
                    />
                    <input
                      ref={selectedVisualGenerationRefInputRef}
                      data-clip-generation-draft-ref-input
                      type="file"
                      className="hidden"
                      accept={selectedVisualGenerationReferenceAccept}
                      multiple
                      onChange={(event) => {
                        void onUploadGenerationRefs(selectedVisual.id || '', event.currentTarget.files, selectedVisualGenerationRefUploadKind);
                        event.currentTarget.value = '';
                      }}
                    />
                    {(selectedVisual.generation.refs || []).length === 0 && selectedVisualGenerationReferenceSupport.groups.length === 0 ? (
                      <div className="rounded border border-dashed border-[#333] px-2 py-2 text-[10px] text-[var(--t8-text-muted)]">当前模型不支持参考素材</div>
                    ) : (selectedVisual.generation.refs || []).length === 0 ? (
                      <div className="rounded border border-dashed border-[#333] px-2 py-2 text-[10px] text-[var(--t8-text-muted)]">上传参考图、视频或音频，也可以从素材库加入</div>
                    ) : null}
                  </div>
                  {selectedVisualGenerationChoice ? (
                    <div data-clip-generation-section="params" className="space-y-2">
                      <div className="text-xs font-black">参数</div>
                      <div className="grid grid-cols-2 gap-2">
                        {renderClipGenerationControl(selectedVisualGenerationChoice, selectedVisualGenerationControls, selectedVisualGenerationParams, selectedVisual.id || '')}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`${editorButton} t8-clip-primary-button justify-center`}
                    onClick={() => selectedVisual.id && void onRunGenerationClip(selectedVisual.id)}
                    disabled={selectedVisual.generation.status === 'running' || selectedVisual.generation.status === 'queued'}
                  >
                    {selectedVisual.generation.status === 'running' || selectedVisual.generation.status === 'queued' ? <Pause size={14} /> : <Play size={14} />}
                    运行
                  </button>
                </div>
                <div data-clip-param-section="base" className={paramCardClass}>
                  <div className="mb-1 text-sm font-black">{selectedVisual.generation.nodeType === 'image' ? '图像生成' : '视频生成'} · {sourceName(selectedVisual)}</div>
                  <div className={paramLabelClass}>状态：{selectedVisual.generation.status === 'draft' ? '未配置' : selectedVisual.generation.status === 'running' || selectedVisual.generation.status === 'queued' ? '运行中' : selectedVisual.generation.status === 'success' ? '已生成' : selectedVisual.generation.status === 'error' ? '失败' : '已取消'}</div>
                  {selectedVisual.generation.error ? <div className="mt-2 rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">{selectedVisual.generation.error}</div> : null}
                </div>
                <div className={`${paramCardClass} space-y-2`}>
                  <div className="text-xs font-black">素材后期</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" data-clip-open-color-page className={paramActionClass} onClick={() => setTab('color')}>调色 / LUT</button>
                    <button type="button" data-clip-open-motion-page className={paramActionClass} onClick={() => setTab('motion')}>动效 / 关键帧</button>
                  </div>
                </div>
              </div>
            ) : selectedKind === 'visual' && selectedVisual ? (
              <div className={paramPaneClass}>
                {renderSelectionSummaryCard()}
                <div data-clip-param-section="base" className={paramCardClass}>
                  <div className="mb-1 text-sm font-black">{sourceName(selectedVisual)}</div>
                  <div className={paramLabelClass}>{selectedVisual.url}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>开始时间（秒）</span>
                    <input
                      className={fieldClass}
                      type="number"
                      min={0}
                      step={0.1}
                      value={Number(selectedLayoutItem?.start || 0)}
                      onChange={(event) => onUpdateVisualStart(selectedVisual.id || '', Number(event.target.value))}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>片段时长</span>
                    <input className={fieldClass} value={shortSeconds(Number(selectedVisual.duration || imageDuration))} readOnly />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className={paramLabelClass}>类型</span>
                  <input className={fieldClass} value={selectedVisual.kind === 'image' ? '图片' : '视频'} readOnly />
                </label>
                <label className="block space-y-1">
                  <span className={paramLabelClass}>画面适配</span>
                  <select
                    className={fieldClass}
                    value={selectedVisual.fit || 'contain'}
                    onChange={(event) => updateVisualFilter({ fit: event.target.value as ClipFit })}
                  >
                    <option value="contain">适应画布</option>
                    <option value="cover">填充裁剪</option>
                    <option value="fill">拉伸填满</option>
                  </select>
                </label>
                <div className={`${paramCardClass} space-y-2`}>
                  <div className="text-xs font-black">调色和动效</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" data-clip-open-color-page className={paramActionClass} onClick={() => setTab('color')}>打开调色</button>
                    <button type="button" data-clip-open-motion-page className={paramActionClass} onClick={() => setTab('motion')}>打开动效</button>
                  </div>
                </div>
                <div data-clip-param-section="transition" className={`${paramCardClass} space-y-2`}>
                  <div className="flex items-center justify-between text-xs font-black">
                    <span>转场</span>
                    <span className="t8-clip-param-value font-mono">淡入淡出</span>
                  </div>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>到下一片段</span>
                    <select
                      className={fieldClass}
                      value={selectedVisual.transition || 'none'}
                      onChange={(event) => updateVisualFilter({ transition: event.target.value as ClipTransitionPreset })}
                    >
                      {CLIP_TRANSITION_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className={`flex items-center justify-between ${paramLabelClass}`}>
                      <span>转场时长</span>
                      <span className="font-mono">{Number(selectedVisual.transitionDuration || 0.5).toFixed(1)}s</span>
                    </span>
                    <input
                      className={paramRangeClass}
                      type="range"
                      min={0.1}
                      max={2}
                      step={0.1}
                      value={Number(selectedVisual.transitionDuration || 0.5)}
                      onChange={(event) => updateVisualFilter({ transitionDuration: Number(event.target.value) })}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className={paramLabelClass}>淡入（秒）</span>
                      <input
                        className={fieldClass}
                        type="number"
                        min={0}
                        max={Math.max(0, Number(selectedVisual.duration || imageDuration) / 2)}
                        step={0.1}
                        value={Number(selectedVisual.fadeIn || 0)}
                        onChange={(event) => updateVisualFilter({ fadeIn: Number(event.target.value) })}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className={paramLabelClass}>淡出（秒）</span>
                      <input
                        className={fieldClass}
                        type="number"
                        min={0}
                        max={Math.max(0, Number(selectedVisual.duration || imageDuration) / 2)}
                        step={0.1}
                        value={Number(selectedVisual.fadeOut || 0)}
                        onChange={(event) => updateVisualFilter({ fadeOut: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: '无', fadeIn: 0, fadeOut: 0 },
                      { label: '柔和', fadeIn: 0.35, fadeOut: 0.35 },
                      { label: '电影', fadeIn: 0.8, fadeOut: 0.8 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className={paramActionClass}
                        onClick={() => updateVisualFilter({ fadeIn: preset.fadeIn, fadeOut: preset.fadeOut })}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedVisual.kind === 'image' ? (
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>持续时间（秒）</span>
                    <input
                      className={fieldClass}
                      type="number"
                      min={0.25}
                      max={60}
                      step={0.25}
                      value={Number(selectedVisual.duration || imageDuration)}
                      onChange={(event) => onUpdateVisualDuration(selectedVisual.id || '', Number(event.target.value))}
                    />
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={editorButton} onClick={() => onToggleVisual(selectedVisual.id || '')}>
                    {selectedVisual.disabled ? <EyeOff size={14} /> : <Eye size={14} />}
                    {selectedVisual.disabled ? '已隐藏' : '显示中'}
                  </button>
                  {selectedVisual.kind === 'image' && selectedVisual.url ? (
                    <button
                      type="button"
                      data-clip-generation-to-video
                      className={editorButton}
                      onClick={() => createVideoGenerationFromVisual(selectedVisual)}
                    >
                      <Film size={14} />
                      转视频
                    </button>
                  ) : null}
                  <button type="button" className={editorButton} onClick={() => setCoverOpen(true)}>
                    封面选择
                  </button>
                </div>
              </div>
            ) : selectedKind === 'audio' && selectedAudio ? (
              <div className={paramPaneClass}>
                {renderSelectionSummaryCard()}
                <div className={paramCardClass}>
                  <div className="mb-1 text-sm font-black">{selectedAudio.label || fileNameFromUrl(selectedAudio.url || '')}</div>
                  <div className={paramLabelClass}>{selectedAudio.url}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>开始时间（秒）</span>
                    <input className={fieldClass} type="number" min={0} step={0.1} value={Number(selectedAudio.start || 0)} onChange={(event) => onUpdateAudioTiming(selectedAudio.id || selectedAudio.url || '', Number(event.target.value), Number(selectedAudio.duration || duration || imageDuration))} />
                  </label>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>片段时长</span>
                    <input className={fieldClass} type="number" min={0.25} step={0.25} value={Number(selectedAudio.duration || duration || imageDuration)} onChange={(event) => onUpdateAudioTiming(selectedAudio.id || selectedAudio.url || '', Number(selectedAudio.start || 0), Number(event.target.value))} />
                  </label>
                </div>
                <div className={`${paramCardClass} space-y-2`}>
                  <div className="text-xs font-black">音频</div>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>音量</span>
                    <input className={fieldClass} type="number" min={0} max={4} step={0.05} value={Number(selectedAudio.volume ?? 1)} onChange={(event) => onUpdateAudioSettings(selectedAudio.id || selectedAudio.url || '', { volume: Number(event.target.value) })} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className={paramLabelClass}>淡入</span>
                      <input className={fieldClass} type="number" min={0} max={60} step={0.1} value={Number(selectedAudio.fadeIn || 0)} onChange={(event) => onUpdateAudioSettings(selectedAudio.id || selectedAudio.url || '', { fadeIn: Number(event.target.value) })} />
                    </label>
                    <label className="block space-y-1">
                      <span className={paramLabelClass}>淡出</span>
                      <input className={fieldClass} type="number" min={0} max={60} step={0.1} value={Number(selectedAudio.fadeOut || 0)} onChange={(event) => onUpdateAudioSettings(selectedAudio.id || selectedAudio.url || '', { fadeOut: Number(event.target.value) })} />
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" className={editorButton} onClick={() => selectedAudioId && onSplitAudioAtTime(selectedAudioId, playheadTime)}>
                    <Scissors size={14} />
                    分割
                  </button>
                  <button type="button" className={editorButton} onClick={() => selectedAudioId && onDuplicateAudio(selectedAudioId)}>
                    <Copy size={14} />
                    复制
                  </button>
                  <button type="button" className={editorButton} onClick={() => {
                    if (!selectedAudioId) return;
                    onRemoveAudio(selectedAudioId);
                    setSelectedId('');
                    setSelectedIds([]);
                  }}>
                    <X size={14} />
                    删除
                  </button>
                </div>
              </div>
            ) : selectedKind === 'text' && selectedText ? (
              <div className={paramPaneClass}>
                {renderSelectionSummaryCard()}
                <div className={paramCardClass}>
                  <div className="mb-1 text-sm font-black">文本片段</div>
                  <textarea className={`${fieldClass} h-20 resize-none py-2`} value={selectedText.text || ''} onChange={(event) => onUpdateTextSettings(selectedText.id || selectedText.text || '', { text: event.target.value, label: event.target.value.slice(0, 18) })} />
                </div>
                <div className={`${paramCardClass} space-y-2`}>
                  <div className="text-xs font-black">字幕样式</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '标题', fontSize: 72, color: '#ffffff', x: 50, y: 16 },
                      { label: '字幕', fontSize: 42, color: '#ffffff', x: 50, y: 88 },
                      { label: '角标', fontSize: 28, color: '#6ee7b7', x: 10, y: 10 },
                      { label: '片尾', fontSize: 56, color: '#f8fafc', x: 50, y: 50 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className={`${paramActionClass} px-2 py-2 text-xs`}
                        onClick={() => onUpdateTextSettings(selectedTextId, {
                          fontSize: preset.fontSize,
                          color: preset.color,
                          x: preset.x,
                          y: preset.y,
                        })}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>开始时间（秒）</span>
                    <input className={fieldClass} type="number" min={0} step={0.1} value={Number(selectedText.start || 0)} onChange={(event) => onUpdateTextTiming(selectedText.id || selectedText.text || '', Number(event.target.value), Number(selectedText.duration || 3))} />
                  </label>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>片段时长</span>
                    <input className={fieldClass} type="number" min={0.25} step={0.25} value={Number(selectedText.duration || 3)} onChange={(event) => onUpdateTextTiming(selectedText.id || selectedText.text || '', Number(selectedText.start || 0), Number(event.target.value))} />
                  </label>
                </div>
                <div className={`${paramCardClass} space-y-2`}>
                  <div className="text-xs font-black">文本样式</div>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>字号</span>
                    <input className={fieldClass} type="number" min={8} max={240} value={Number(selectedText.fontSize || 42)} onChange={(event) => onUpdateTextSettings(selectedText.id || selectedText.text || '', { fontSize: Number(event.target.value) })} />
                  </label>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>文字颜色</span>
                    <input className="t8-clip-color-field h-9 w-full rounded border bg-transparent p-1" type="color" value={selectedText.color || '#ffffff'} onChange={(event) => onUpdateTextSettings(selectedText.id || selectedText.text || '', { color: event.target.value })} />
                  </label>
                </div>
                <div className={`${paramCardClass} space-y-2`}>
                  <div className="text-xs font-black">文本位置</div>
                  <label className="block space-y-1">
                    <span className={`flex items-center justify-between ${paramLabelClass}`}>
                      <span>横向</span>
                      <span className="font-mono">{Math.round(Number(selectedText.x ?? 50))}%</span>
                    </span>
                    <input
                      className={paramRangeClass}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Number(selectedText.x ?? 50)}
                      onChange={(event) => onUpdateTextSettings(selectedTextId, { x: Number(event.target.value) })}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={`flex items-center justify-between ${paramLabelClass}`}>
                      <span>纵向</span>
                      <span className="font-mono">{Math.round(Number(selectedText.y ?? 88))}%</span>
                    </span>
                    <input
                      className={paramRangeClass}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Number(selectedText.y ?? 88)}
                      onChange={(event) => onUpdateTextSettings(selectedTextId, { y: Number(event.target.value) })}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" className={editorButton} onClick={() => selectedTextId && onSplitTextAtTime(selectedTextId, playheadTime)}>
                    <Scissors size={14} />
                    分割
                  </button>
                  <button type="button" className={editorButton} onClick={() => selectedTextId && onDuplicateText(selectedTextId)}>
                    <Copy size={14} />
                    复制
                  </button>
                  <button type="button" className={editorButton} onClick={() => {
                    if (!selectedTextId) return;
                    onRemoveText(selectedTextId);
                    setSelectedId('');
                    setSelectedIds([]);
                  }}>
                    <X size={14} />
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="t8-clip-param-empty flex flex-1 items-center justify-center text-center text-xs">
                <div>
                  <SlidersHorizontal className="mx-auto mb-3 text-zinc-600" size={34} />
                  <div className="text-base font-black text-zinc-100">这里是空的</div>
                  <div className="mt-2">点击时间轴上的元素来编辑其属性</div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {selectedGenerationVisual?.id && selectedGeneration && generationPanelAnchorStyle ? (
          <div
            ref={generationPanelRef}
            data-clip-generation-panel
            data-clip-generation-panel-anchor="track"
            data-clip-generation-panel-direction={generationPanelDirection}
            data-clip-generation-panel-mode="quick"
            className="t8-clip-modal t8-clip-generation-popover t8-clip-scroll-region absolute z-50 rounded-md border p-2 shadow-2xl"
            style={generationPanelAnchorStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <textarea
              data-clip-generation-prompt
              className={`${fieldClass} min-h-14 resize-y px-2 py-1.5 text-xs leading-relaxed`}
              value={generationPromptDraft}
              onChange={(event) => {
                setGenerationPromptDraft(event.target.value);
                if (!generationPromptComposing) commitGenerationPromptDraft(event.target.value);
              }}
              onCompositionStart={() => setGenerationPromptComposing(true)}
              onCompositionEnd={(event) => {
                setGenerationPromptComposing(false);
                commitGenerationPromptDraft(event.currentTarget.value);
              }}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="描述生成内容，可输入 @ 引用素材..."
            />
            <div className="mt-1.5 rounded border border-[#333] bg-black/20 p-1.5">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-black text-zinc-400">
                <span>引用素材</span>
                <button
                  type="button"
                  className={iconButton}
                  title="添加素材引用"
                  onClick={() => {
                    const material = mediaItems.find((item) => item.url && item.id !== selectedGenerationVisual.id && clipGenerationRefLimitForKind(selectedGenerationReferenceSupport, item.kind) > 0);
                    if (material) addGenerationMaterialRef(material);
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
              {selectedGenerationRefSuggestions.length > 0 ? (
                <div className="mb-1 flex flex-wrap gap-1">
                  {selectedGenerationRefSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.key}
                      type="button"
                      data-clip-generation-smart-ref={suggestion.label}
                      className="t8-clip-generation-smart-ref"
                      title={`${suggestion.label}：${sourceName(suggestion.material)}`}
                      onClick={() => addGenerationRefSuggestion(selectedGenerationVisual.id || '', selectedGeneration, suggestion)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div data-clip-generation-refs className="max-h-12 min-h-7 overflow-auto">
                <MaterialPreviewSection
                  dataRole="clip-generation-refs"
                  title="参考素材"
                  images={generationRefMaterialsByKind.image}
                  videos={generationRefMaterialsByKind.video}
                  audios={generationRefMaterialsByKind.audio}
                  order={(selectedGeneration.refs || []).map((ref) => ref.id)}
                  onReorder={reorderGenerationRefs}
                  onRemoveLocal={removeGenerationRef}
                  isDark
                  isPixel={false}
                  groups={selectedGenerationReferenceSupport.groups}
                  uploadActions={selectedGenerationUploadActions}
                />
                {(selectedGeneration.refs || []).length === 0 && selectedGenerationReferenceSupport.groups.length === 0 ? (
                  <div className="flex h-7 items-center text-[10px] text-zinc-500">当前模型不支持参考素材</div>
                ) : (selectedGeneration.refs || []).length === 0 ? (
                  <div className="flex h-7 items-center text-[10px] text-zinc-500">上传或从素材库加入参考</div>
                ) : null}
              </div>
            </div>
            <input
              ref={generationRefInputRef}
              data-clip-generation-ref-input
              type="file"
              className="hidden"
              accept={selectedGenerationReferenceAccept}
              multiple
              onChange={(event) => {
                void onUploadGenerationRefs(selectedGenerationVisual.id || '', event.currentTarget.files, generationRefUploadKind);
                event.currentTarget.value = '';
              }}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="t8-clip-compact-chip rounded px-2 py-1 font-black">{selectedGeneration.nodeType === 'image' ? '图像生成' : '视频生成'}</span>
              <span className="t8-clip-compact-chip rounded px-2 py-1 font-black">
                {selectedGeneration.status === 'draft' ? '未配置' : selectedGeneration.status === 'running' || selectedGeneration.status === 'queued' ? '运行中' : selectedGeneration.status === 'success' ? '已生成' : selectedGeneration.status === 'error' ? '失败' : '已取消'}
              </span>
              <button
                type="button"
                className={`${editorButton} t8-clip-primary-button ml-auto`}
                onClick={() => void onRunGenerationClip(selectedGenerationVisual.id || '')}
                disabled={selectedGeneration.status === 'running' || selectedGeneration.status === 'queued'}
              >
                <Play size={14} />
                运行
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px] lg:grid-cols-3">
              {selectedGenerationChoice ? (
                <>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>模型</span>
                    <select
                      className={fieldClass}
                      value={selectedGenerationChoice.mainId}
                      onChange={(event) => applyClipGenerationModelGroup(event.target.value)}
                    >
                      {selectedGenerationModelGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className={paramLabelClass}>具体模型</span>
                    <select
                      className={fieldClass}
                      value={selectedGenerationChoice.apiModel}
                      onChange={(event) => applyClipGenerationApiModel(event.target.value)}
                    >
                      {(selectedGenerationChoice.apiModelOptions.length ? selectedGenerationChoice.apiModelOptions : [{ value: selectedGenerationChoice.apiModel, label: selectedGenerationChoice.apiModel }]).map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  {selectedGenerationControls.map((control) => renderClipGenerationControl(selectedGenerationChoice, [control], selectedGenerationParams, selectedGenerationVisual.id || ''))}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          data-clip-layout-resize="timeline-divider"
          className="t8-clip-resize-grip my-1 cursor-row-resize rounded bg-transparent transition hover:bg-emerald-300/35"
          style={{ gridColumn: '1 / -1', gridRow: 2 }}
          onPointerDown={(event) => startResize('timeline', event)}
          onMouseDown={(event) => startResize('timeline', event)}
          title="拖动调整时间线高度"
        />

        <section className={`t8-clip-panel t8-clip-timeline-panel min-h-0 overflow-hidden rounded-md border ${border} bg-[#222]`} style={{ gridColumn: '1 / -1', gridRow: 3 }}>
          <div className="flex h-full flex-col">
            <div
              data-clip-layout-resize="timeline-header"
              className="t8-clip-panel-header t8-clip-timeline-header-resize flex h-10 shrink-0 items-center justify-between border-b border-[#303030] px-3"
              onPointerDown={startTimelineHeaderResize}
              onMouseDown={startTimelineHeaderResize}
              title="拖动这里也可以调整轨道区高度"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={iconButton}
                  title="撤销"
                  onClick={onUndoEdit}
                  disabled={!canUndoEdit}
                >
                  <Undo2 size={14} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title="重做"
                  onClick={onRedoEdit}
                  disabled={!canRedoEdit}
                >
                  <Redo2 size={14} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title="保留左侧"
                  onClick={() => selectedVisualId && onTrimVisualSide(selectedVisualId, playheadTime, 'left')}
                  disabled={!selectedVisualId}
                >
                  <Scissors size={14} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title="保留右侧"
                  onClick={() => selectedVisualId && onTrimVisualSide(selectedVisualId, playheadTime, 'right')}
                  disabled={!selectedVisualId}
                >
                  <Scissors className="-scale-x-100" size={14} />
                </button>
                <button type="button" className={iconButton} title="剪切" onClick={() => selectedVisualId && onSplitVisual(selectedVisualId)} disabled={!selectedVisualId}>
                  <Scissors size={14} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title={selectedKind === 'audio' ? '按播放头分割音频' : selectedKind === 'text' ? '按播放头分割文本' : '按播放头分割'}
                  onClick={splitSelectedAtPlayhead}
                  disabled={selectedKind === 'none' || (selectedKind === 'visual' && !selectedVisualId)}
                >
                  <Scissors size={14} />
                </button>
                <button type="button" className={iconButton} title="复制所选片段" onClick={duplicateSelectedClip} disabled={selectedKind === 'none' || (selectedKind === 'visual' && !selectedVisualId)}>
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className={`${iconButton} ${snapMode ? 'border-emerald-500/60 text-emerald-300' : ''}`}
                  title={snapMode ? '吸附已开启' : '吸附已关闭'}
                  aria-pressed={snapMode}
                  onClick={() => setSnapMode((value) => !value)}
                >
                  <Magnet size={14} />
                </button>
                <button
                  type="button"
                  className={`${iconButton} ${linkMode ? 'border-emerald-500/60 text-emerald-300' : ''}`}
                  title={linkMode ? '轨道链接已开启' : '轨道链接已关闭'}
                  aria-pressed={linkMode}
                  onClick={() => setLinkMode((value) => !value)}
                >
                  {linkMode ? <Link size={14} /> : <Unlink size={14} />}
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title="一键整理时间线"
                  onClick={onCompactTimeline}
                  disabled={timelineVisuals.length <= 1}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title="一键整理音频和字幕"
                  onClick={onCleanupTimelineMedia}
                  disabled={audios.length === 0 && texts.length === 0}
                >
                  <SlidersHorizontal size={14} />
                </button>
                <span className="mx-1 h-5 w-px bg-[#3a3a3a]" />
                <span className="text-[10px] font-black text-zinc-500">生成</span>
                <button
                  type="button"
                  className={iconButton}
                  title="新建图像生成段"
                  onClick={() => onCreateGenerationClip('image', { start: playheadTime, lane: selectedTimelineVisual ? Math.max(0, Math.round(Number(selectedTimelineVisual.lane || 0))) : 0 })}
                >
                  <ImageIcon size={14} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title="新建视频生成段"
                  onClick={() => onCreateGenerationClip('video', { start: playheadTime, lane: selectedTimelineVisual ? Math.max(0, Math.round(Number(selectedTimelineVisual.lane || 0))) : 0 })}
                >
                  <Film size={14} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  title="删除所选片段"
                  onClick={removeSelectedClip}
                  disabled={selectedKind === 'none' || (selectedKind === 'visual' && !selectedVisualId)}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="t8-clip-timeline-status flex items-center gap-2 text-zinc-500">
                <span
                  data-clip-playhead-time-badge
                  className="t8-clip-playhead-time-badge rounded border px-2 py-1 font-mono text-[10px] font-black"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--t8-accent, #6ee7b7) 42%, transparent)',
                    background: 'color-mix(in srgb, var(--t8-bg-panel-elevated, #202020) 88%, transparent)',
                    color: 'var(--t8-accent, #6ee7b7)',
                  }}
                  title="当前播放头时间"
                >
                  {formatSeconds(playheadTime, fps)}
                </span>
                <span className="t8-clip-export-summary inline-flex rounded-full px-2 py-1 text-[10px] font-black">
                  {activeVisuals.length} 个画面 · {shortSeconds(duration)} · {exportSettings.width}x{exportSettings.height} · {fps}fps
                </span>
                {exportInspection.items.length > 0 ? (
                  <span className="hidden max-w-[360px] truncate rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-100 xl:inline">
                    导出检查：{exportInspection.items.slice(0, 2).map((item) => item.message).join(' · ')}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={iconButton}
                  title="适配完整时间线"
                  onClick={fitTimeline}
                  disabled={!duration}
                >
                  <Maximize2 size={14} />
                </button>
                <ZoomOut size={14} />
                <input className="nodrag h-1 w-28 accent-emerald-400" type="range" min={10} max={100} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                <ZoomIn size={14} />
              </div>
            </div>
            {selectedClipCount > 1 ? (
              <div data-clip-bulk-selection-bar className="t8-clip-bulk-selection-bar flex shrink-0 items-center justify-between gap-2 border-b border-[#303030] px-3 py-1.5 text-[10px]">
                <span className="min-w-0 truncate font-black">已选择 {selectedClipCount} 个片段</span>
                <div className="flex items-center gap-1">
                  <button type="button" className={iconButton} title="复制已选片段" onClick={duplicateSelectedClips}>
                    <Copy size={13} />
                  </button>
                  <button type="button" className={iconButton} title="删除已选片段" onClick={removeSelectedClips}>
                    <X size={13} />
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    title="清空选择"
                    onClick={() => {
                      setSelectedIds([]);
                      setSelectedId('');
                    }}
                  >
                    <Check size={13} />
                  </button>
                </div>
              </div>
            ) : null}
            {generationTrackItems.length > 0 ? (
              <div data-clip-generation-queue-bar className="t8-clip-generation-queue-bar flex shrink-0 items-center justify-between gap-2 border-b border-[#303030] px-3 py-1.5 text-[10px]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="t8-clip-generation-queue-title shrink-0 font-black">AI 生成轨</span>
                  <span className="t8-clip-generation-queue-chip">全部 {generationQueueSummary.total}</span>
                  <button type="button" data-clip-generation-queue-jump="unfinished" className="t8-clip-generation-queue-chip" onClick={() => focusGenerationQueueItem('unfinished')}>待处理 {generationQueueSummary.unfinished}</button>
                  <button type="button" data-clip-generation-queue-jump="missingPrompt" className="t8-clip-generation-queue-chip is-warning" onClick={() => focusGenerationQueueItem('missingPrompt')}>缺提示词 {generationQueueSummary.missingPrompt}</button>
                  <button type="button" data-clip-generation-queue-jump="runnable" className="t8-clip-generation-queue-chip is-ready" onClick={() => focusGenerationQueueItem('runnable')}>可生成 {generationQueueSummary.runnable}</button>
                  <span className="t8-clip-generation-queue-chip">运行 {generationQueueSummary.running}</span>
                  <button type="button" data-clip-generation-queue-jump="error" className="t8-clip-generation-queue-chip is-error" onClick={() => focusGenerationQueueItem('error')}>失败 {generationQueueSummary.error}</button>
                  <span className="t8-clip-generation-queue-chip">完成 {generationQueueSummary.success}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-clip-generation-batch-run
                    className={iconButton}
                    title="运行全部待生成片段"
                    disabled={pendingGenerationVisuals.length === 0}
                    onClick={() => void runPendingGenerationClips()}
                  >
                    <Play size={13} />
                  </button>
                  <button
                    type="button"
                    data-clip-generation-batch-retry
                    className={iconButton}
                    title="重试失败片段"
                    disabled={generationQueueSummary.error === 0}
                    onClick={() => void retryErroredGenerationClips()}
                  >
                    <RotateCw size={13} />
                  </button>
                  {([
                    { id: 'all', label: '全部' },
                    { id: 'unfinished', label: '未完成' },
                    { id: 'draft', label: '草稿' },
                    { id: 'running', label: '运行中' },
                    { id: 'error', label: '失败' },
                    { id: 'success', label: '完成' },
                  ] as Array<{ id: typeof generationStatusFilter; label: string }>).map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      data-clip-generation-filter={filter.id}
                      className={`t8-clip-generation-filter rounded border px-2 py-1 font-black ${generationStatusFilter === filter.id ? 'is-active' : ''}`}
                      onClick={() => setGenerationStatusFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr] overflow-hidden">
              <div
                ref={timelineTrackListRef}
                className="t8-clip-track-list min-h-0 overflow-hidden border-r border-[#303030] bg-[#202020] text-xs text-zinc-500"
                onWheel={(event) => {
                  const timeline = timelineScrollRef.current;
                  if (!timeline || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
                  event.preventDefault();
                  timeline.scrollTop += event.deltaY;
                }}
              >
                <div className="t8-clip-track-list-header flex h-10 items-end border-b border-[#303030] px-4 pb-2 text-[10px] uppercase tracking-wide text-zinc-600">轨道</div>
                {timelineTracks.length === 0 ? (
                  <div className="flex h-[88px] items-center px-4 text-zinc-600">暂无素材轨道</div>
                ) : timelineTracks.flatMap((track) => {
                  if (track.id === 'visual') {
                    return visualRenderLanes.map(({ lane, insert }) => {
                      const trackKey = `visual-${lane}`;
                      const visible = !insert && trackVisibility[trackKey] !== false;
                      const locked = !insert && Boolean(trackLocks[trackKey]);
                      const solo = !insert && trackSolo === trackKey;
                      const collapsed = !insert && Boolean(trackCollapsed[trackKey]);
                      const rowHeight = visualLaneHeightFor(lane, insert);
                      return (
                        <div
                          key={insert ? `insert-${visualLaneInsertion}` : trackKey}
                          data-clip-visual-insert-lane={insert ? visualLaneInsertion || 'edge' : undefined}
                          className={`t8-clip-track-label-row relative flex items-center gap-1.5 border-b px-3 ${insert ? 'border-emerald-300/25 bg-emerald-300/5 text-emerald-200' : 'border-[#2d2d2d]'} ${locked ? 'is-locked' : ''} ${solo ? 'is-solo' : ''} ${collapsed ? 'is-collapsed' : ''}`}
                          style={{ height: rowHeight }}
                        >
                          <Film size={14} />
                          {insert ? (
                            <span className="h-6 w-6 rounded border border-dashed border-emerald-300/45" />
                          ) : (
                            <button
                              type="button"
                              data-clip-track-visibility={trackKey}
                              className={`t8-clip-track-label-button ${visible ? 'is-active' : ''}`}
                              title={visible ? '隐藏轨道' : '显示轨道'}
                              onClick={() => toggleTrackVisibility(`visual-${lane}`, lane)}
                            >
                              {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                          )}
                          {!insert ? (
                            <>
                              <button
                                type="button"
                                data-clip-track-lock={trackKey}
                                className={`t8-clip-track-label-button ${locked ? 'is-active' : ''}`}
                                title={locked ? '解锁轨道' : '锁定轨道'}
                                onClick={() => toggleTrackLock(trackKey)}
                              >
                                {locked ? '锁' : '解'}
                              </button>
                              <button
                                type="button"
                                data-clip-track-solo={trackKey}
                                className={`t8-clip-track-label-button ${solo ? 'is-active' : ''}`}
                                title={solo ? '取消独显' : '独显轨道'}
                                onClick={() => toggleTrackSolo(trackKey)}
                              >
                                S
                              </button>
                              <button
                                type="button"
                                data-clip-track-collapse={trackKey}
                                className={`t8-clip-track-label-button ${collapsed ? 'is-active' : ''}`}
                                title={collapsed ? '展开轨道' : '折叠轨道'}
                                onClick={() => toggleTrackCollapsed(trackKey)}
                              >
                                {collapsed ? <ChevronRight size={13} /> : <ArrowDown size={13} />}
                              </button>
                            </>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">{insert ? '释放新建视频轨' : `视频轨 ${lane + 1}`}</span>
                          <span className="rounded border border-[#3a3a3a] px-1.5 py-0.5 text-[10px] font-black">{insert ? 'NEW' : `V${lane + 1}`}</span>
                          {!insert ? (
                            <span
                              className="absolute bottom-[-3px] left-0 right-0 z-20 h-1.5 cursor-row-resize hover:bg-emerald-300/40"
                              onPointerDown={(event) => startTrackResize(track.id, rowHeight, event)}
                              onMouseDown={(event) => startTrackResize(track.id, rowHeight, event)}
                              title="拖动调整轨道高度"
                            />
                          ) : null}
                        </div>
                      );
                    });
                  }
                  const trackKey = track.id;
                  const visible = trackVisibility[trackKey] !== false;
                  return [(
                    <div key={track.id} className="t8-clip-track-label-row relative flex items-center gap-2 border-b border-[#2d2d2d] px-3" style={{ height: track.height }}>
                      {track.id === 'cover' ? <ImageIcon size={14} /> : track.id === 'audio' ? <Music size={14} /> : <TextCursorInput size={14} />}
                      <button
                        type="button"
                        data-clip-track-visibility={trackKey}
                        className={`t8-clip-track-label-button ${visible ? 'is-active' : ''}`}
                        title={visible ? '隐藏轨道' : '显示轨道'}
                        onClick={() => toggleTrackVisibility(trackKey)}
                      >
                        {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <span className="min-w-0 flex-1 truncate">{track.label}</span>
                      <span
                        className="absolute bottom-[-3px] left-0 right-0 z-20 h-1.5 cursor-row-resize hover:bg-emerald-300/40"
                        onPointerDown={(event) => startTrackResize(track.id, track.height, event)}
                        onMouseDown={(event) => startTrackResize(track.id, track.height, event)}
                        title="拖动调整轨道高度"
                      />
                    </div>
                  )];
                })}
              </div>
              <div
                ref={timelineScrollRef}
                className="t8-clip-timeline-scroll t8-clip-scroll-region min-h-0 min-w-0 overflow-auto scroll-smooth"
                onWheel={(event) => {
                  if (!event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) return;
                  const el = timelineScrollRef.current;
                  if (!el) return;
                  event.preventDefault();
                  el.scrollLeft += event.deltaX || event.deltaY;
                }}
                onScroll={onTimelineScroll}
              >
                <div ref={timelineContentRef} className="relative h-full" style={{ minWidth: timelineContentWidth }}>
                  <div
                    className="t8-clip-ruler sticky top-0 z-20 h-10 cursor-crosshair bg-[#222] text-[10px] text-zinc-500"
                    onPointerDown={startTimelineScrub}
                    onMouseDown={startTimelineScrub}
                    title="点击或拖动时间尺定位播放头"
                  >
                    {rulerTicks.map((tick) => (
                      <div
                        key={`${tick.kind}-${tick.time}`}
                        data-clip-ruler-tick
                        className={`t8-clip-ruler-tick absolute bottom-0 border-l ${tick.kind === 'major' ? 'is-major h-10 border-emerald-300/70 text-emerald-100' : 'h-4 border-zinc-500/45 text-zinc-600'}`}
                        style={{ left: tick.left }}
                        title={`${tick.label} · ${shortSeconds(tick.time)}`}
                      >
                        {tick.kind === 'major' ? (
                          <span className="absolute bottom-1 left-1 whitespace-nowrap font-mono text-[10px]">{tick.label}</span>
                        ) : (
                          <span className="absolute bottom-4 left-1 hidden whitespace-nowrap font-mono text-[9px] xl:block">{tick.label}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div
                    className="t8-clip-playhead pointer-events-none absolute top-10 z-40 h-[calc(100%-40px)] -translate-x-1/2"
                    style={{ left: Math.max(0, Math.min(playheadTime * pixelsPerSecond, timelineContentWidth)) }}
                  >
                    <button
                      type="button"
                      data-clip-playhead-handle
                      className={`nodrag pointer-events-auto absolute -top-7 left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-ew-resize select-none items-center justify-center rounded-full border shadow-lg transition ${
                        timelineScrubActive
                          ? 'border-emerald-200 bg-emerald-300 text-black shadow-[0_0_16px_rgba(110,231,183,.65)]'
                          : 'border-emerald-300/70 bg-[#101010] text-emerald-200 hover:bg-emerald-300 hover:text-black'
                      }`}
                      onPointerDown={startTimelineScrub}
                      onMouseDown={startTimelineScrub}
                      title="拖动时间线播放头"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-current" />
                    </button>
                    <div className="t8-clip-playhead-line mx-auto h-full w-[2px] rounded bg-emerald-300/90 shadow-[0_0_0_1px_rgba(16,185,129,.5),0_0_12px_rgba(110,231,183,.8)]" />
                    <div className="t8-clip-playhead-caret absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-emerald-300" />
                  </div>
                  {timelineTracks.length === 0 ? (
                    <div className="flex h-[120px] items-center justify-center text-xs text-zinc-600">导入图片、视频、音频或文本后会生成对应轨道</div>
                  ) : timelineTracks.map((track) => {
                    if (track.id === 'visual') {
                      return (
                        <div
                          key={track.id}
                          ref={timelineTrackRef}
                          className="relative"
                          style={{ height: visualTrackTotalHeight }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setVisualMaterialDragY(event.clientY);
                            const nextIntent = resolveVisualLaneInsertIntent(event.clientY, { previous: visualLaneInsertIntent });
                            setVisualLaneInsertIntent(nextIntent);
                          }}
                          onDragLeave={handleVisualTrackDragLeave}
                          onDrop={(event) => {
                            event.preventDefault();
                            setVisualMaterialDragY(null);
                            setVisualLaneInsertIntent(null);
                            const materialId = event.dataTransfer.getData('application/x-t8-clip-material');
                            const material = mediaItems.find((item) => item.id === materialId);
                            if (!material) return;
                            const rect = timelineTrackRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const dropStart = Math.max(0, (event.clientX - rect.left) / pixelsPerSecond);
                            const dropLane = resolveVisualLaneFromClientY(event.clientY);
                            const targetVisualTrackLocked = dropLane >= 0 && Boolean(trackLocks[`visual-${dropLane}`]);
                            if (targetVisualTrackLocked) {
                              showCommandFeedback('轨道已锁定');
                              return;
                            }
                            onImportMaterial({
                              id: material.id,
                              kind: material.kind,
                              url: material.url || '',
                              sourceNodeId: material.origin,
                              origin: 'local',
                              label: material.label,
                            }, { start: dropStart, lane: dropLane });
                            showCommandFeedback('素材已加入时间线');
                          }}
                        >
                          {snapMode && snapTargetLeft != null ? (
                            <div data-clip-track-align-line className="t8-clip-track-align-line" style={{ left: snapTargetLeft }} />
                          ) : null}
                          {visualRenderLanes.map(({ lane, insert }, laneIndex) => {
                            const trackKey = `visual-${lane}`;
                            const locked = !insert && Boolean(trackLocks[trackKey]);
                            const collapsed = !insert && Boolean(trackCollapsed[trackKey]);
                            const rowHeight = visualLaneHeightFor(lane, insert);
                            return (
                            <div
                              key={insert ? `visual-lane-insert-${visualLaneInsertion}` : `visual-lane-${lane}`}
                              data-clip-visual-lane={insert ? undefined : lane}
                              data-clip-visual-insert-lane={insert ? visualLaneInsertion || 'edge' : undefined}
                              className={`t8-clip-track-row is-hoverable relative border-b border-dashed ${insert ? 'border-emerald-300/45 bg-emerald-300/5' : 'border-[#303030]'} ${collapsed ? 'is-collapsed' : ''} ${locked ? 'is-locked' : ''}`}
                              style={{ height: rowHeight }}
                              onMouseDown={(event) => {
                                if (insert) return;
                                if ((event.target as HTMLElement | null)?.closest('[data-clip-visual-id]')) return;
                                event.preventDefault();
                                seekFromClientX(event.clientX);
                              }}
                            >
                              {snapTargetLeft != null && laneIndex === 0 ? (
                                <>
                                  <div data-clip-snap-ghost className="pointer-events-none absolute bottom-1 top-1 z-30 w-0.5 bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.9)]" style={{ left: snapTargetLeft }} />
                                  {liveDragTiming ? (
                                    <div
                                      data-clip-drag-time-label
                                      className="pointer-events-none absolute top-2 z-40 rounded-full border border-emerald-200/45 bg-black/75 px-2 py-1 font-mono text-[10px] font-black text-emerald-100 shadow-xl"
                                      style={{ left: Math.max(8, snapTargetLeft + 8) }}
                                    >
                                      {dragState?.copyMode ? '拖动复制 · ' : ''}{formatSeconds(liveDragTiming.start, fps)}{liveDragTiming.snapTarget ? ` · ${liveDragTiming.snapTarget.label || '已吸附'}` : ''}
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                              {dropHintTextForVisualLane(lane, insert) ? (
                                <span data-clip-lane-drop-hint className="t8-clip-lane-drop-hint pointer-events-none absolute left-3 top-2 z-20 rounded-full border px-2 py-1 text-[10px] font-black">
                                  {dropHintTextForVisualLane(lane, insert)}
                                </span>
                              ) : null}
                              {dragConflictPreview && !insert && dragConflictPreview.lane === lane ? (
                                <div
                                  data-clip-drag-conflict-preview
                                  data-clip-drop-preview-mode={dragConflictPreview.mode}
                                  className="t8-clip-drag-conflict-preview pointer-events-none absolute top-2 z-20 overflow-hidden rounded border px-2 py-1 text-[10px] font-black"
                                  style={{ left: dragConflictPreview.left, width: dragConflictPreview.width, maxWidth: Math.max(84, rowHeight * 3) }}
                                >
                                  {dragConflictPreview.mode === 'locked' ? '锁定轨道 · 不会移动' : dragConflictPreview.label}
                                </div>
                              ) : null}
                              {!insert ? (
                                <span
                                  className="absolute bottom-[-3px] left-0 right-0 z-20 h-1.5 cursor-row-resize hover:bg-emerald-300/25"
                                  onPointerDown={(event) => startTrackResize(track.id, rowHeight, event)}
                                  onMouseDown={(event) => startTrackResize(track.id, rowHeight, event)}
                                  title="拖动调整轨道高度"
                                />
                              ) : null}
                              {timelineLayout.items
                                .filter((item) => {
                                  const live = liveDragTiming?.id === item.id ? liveDragTiming : null;
                                  const itemLane = live && dragState ? resolveVisualLaneFromClientY(dragState.currentY) : Math.max(0, Math.round(Number(item.lane || 0)));
                                  return itemLane === lane;
                                })
                                .map((item, index) => {
                                  const live = liveDragTiming?.id === item.id ? liveDragTiming : null;
                                  const liveLeft = live ? Math.max(0, live.start * pixelsPerSecond) : item.left;
                                  const liveWidth = live ? Math.max(72, live.duration * pixelsPerSecond) : item.width;
                                  const clipHeight = Math.max(collapsed ? 26 : 38, rowHeight - 16);
                                  const frameWidth = item.kind === 'video' ? 54 : 42;
                                  const frameLimit = item.kind === 'video' ? 48 : 120;
                                  const generationFilteredOut = Boolean(item.generation && !generationMatchesStatusFilter(item));
                                  const generationBusy = item.generation?.status === 'running' || item.generation?.status === 'queued';
                                  const generationComplete = item.generation?.status === 'success' && Boolean(item.url);
                                  const generationInlineDisabled = generationBusy || generationComplete;
                                  return (
                                  <button
                                    key={item.id || `${lane}-${index}`}
                                    type="button"
                                    data-clip-visual-id={item.id || ''}
                                    data-clip-copy-ghost={live && dragState?.copyMode ? 'true' : undefined}
                                    data-clip-generation-status={item.generation?.status}
                                    data-clip-generation-ref-drop-target={generationRefDropTargetId === item.id ? 'true' : undefined}
                                    title={item.sourceInvalid ? '媒体边界错误：裁剪起点超出视频时长' : (item.label || fileNameFromUrl(item.url || ''))}
                                    className={`group t8-clip-visual t8-clip-material-chip absolute top-2 overflow-hidden rounded border text-left text-xs transition-[box-shadow,border-color] ${item.generation ? 'is-generation' : ''} ${generationFilteredOut ? 'is-generation-filtered-out' : ''} ${generationRefDropTargetId === item.id ? 'is-generation-ref-drop-target' : ''} ${selectedClipIds.has(item.id || '') || selectedTimelineVisual?.id === item.id ? 'is-selected border-emerald-400 bg-emerald-400/15' : 'border-[#4a4a4a] bg-[#313131]'} ${item.disabled ? 'opacity-45' : ''} ${live ? 'is-dragging z-30 shadow-[0_0_0_1px_rgba(110,231,183,.55),0_12px_28px_rgba(0,0,0,.28)]' : ''} ${live && dragState?.copyMode ? 'is-copying' : ''}`}
                                    style={{ left: liveLeft, width: liveWidth, height: clipHeight }}
                                    onDragOver={(event) => handleGenerationRefDragOver(event, item.id || '', item.generation)}
                                    onDragLeave={(event) => handleGenerationRefDragLeave(event, item.id || '')}
                                    onDrop={(event) => handleGenerationRefDrop(event, item.id || '', item.generation)}
                                    onContextMenu={(event) => openClipContextMenu(event, item)}
                                    onPointerDown={(event) => {
                                      if (!item.id) return;
                                      event.stopPropagation();
                                      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
                                      selectClip(item.id);
                                      if (locked) {
                                        showCommandFeedback('轨道已锁定');
                                        return;
                                      }
                                      const rect = timelineTrackRef.current?.getBoundingClientRect();
                                      const grabOffsetSeconds = rect ? Math.max(0, ((event.clientX - rect.left) - item.left) / pixelsPerSecond) : 0;
                                      setDragState({
                                        id: item.id,
                                        mode: 'move',
                                        startX: event.clientX,
                                        startY: event.clientY,
                                        currentX: event.clientX,
                                        currentY: event.clientY,
                                        active: false,
                                        clipStart: item.start,
                                        clipDuration: item.duration,
                                        trimStart: Number(item.trimStart || 0),
                                        grabOffsetSeconds,
                                        copyMode: event.altKey,
                                        lane,
                                      });
                                    }}
                                    onClick={(event) => {
                                      if (dragState?.active) return;
                                      seekPlayhead(item.start, { selectPlayback: false });
                                      setSelectedId(item.id || '');
                                      selectClip(item.id || '', event);
                                      if (item.generation && item.generation.status !== 'success') {
                                        openGenerationPanelForClip(item.id || '', item.start);
                                      }
                                    }}
                                  >
                                    {(clipVisualKeyframes[item.id || ''] || []).map((keyframe) => (
                                      <span
                                        key={`${item.id}-keyframe-${keyframe.time}`}
                                        data-clip-keyframe-marker
                                        className="pointer-events-none absolute top-1 z-20 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border border-amber-100 bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,.8)]"
                                        style={{ left: `${Math.max(0, Math.min(100, (keyframe.time / Math.max(0.1, item.duration)) * 100))}%` }}
                                      />
                                    ))}
                                    <span data-clip-visual-status-badges className="t8-clip-visual-status-badges pointer-events-none absolute left-1 top-1 z-30 flex max-w-[calc(100%-2rem)] flex-wrap gap-1">
                                      {item.disabled ? (
                                        <span data-clip-visual-badge="hidden" className="t8-clip-visual-badge">隐藏</span>
                                      ) : null}
                                      {item.sourceInvalid ? (
                                        <span data-clip-visual-badge="source-invalid" className="t8-clip-visual-badge">媒体边界错误</span>
                                      ) : null}
                                      {Math.abs(Number(item.speed || 1) - 1) > 0.01 ? (
                                        <span data-clip-visual-badge="speed" className="t8-clip-visual-badge">{Number(item.speed || 1).toFixed(2)}x</span>
                                      ) : null}
                                      {item.lutPresetId || item.lutText ? (
                                        <span data-clip-visual-badge="lut" className="t8-clip-visual-badge">LUT</span>
                                      ) : null}
                                      {item.transition && item.transition !== 'none' ? (
                                        <span data-clip-visual-badge="transition" className="t8-clip-visual-badge">转场</span>
                                      ) : null}
                                      {(clipVisualKeyframes[item.id || ''] || []).length > 0 ? (
                                        <span data-clip-visual-badge="keyframes" className="t8-clip-visual-badge">关键帧</span>
                                      ) : null}
                                    </span>
                                    <span
                                      role="button"
                                      tabIndex={-1}
                                      data-clip-visual-visibility-toggle
                                      className="absolute right-1 top-1 z-30 flex h-5 w-5 items-center justify-center rounded border border-white/15 bg-black/65 text-white/80 opacity-0 transition group-hover:opacity-100 hover:border-emerald-300 hover:text-emerald-200"
                                      title={item.disabled ? '显示素材' : '隐藏素材'}
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                      }}
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                      }}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onToggleVisual(item.id || '');
                                      }}
                                    >
                                      {item.disabled ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </span>
                                    {item.generation ? (
                                      <span
                                        data-clip-generation-inline-actions
                                        className="t8-clip-generation-inline-actions absolute right-7 top-1 z-30 flex items-center gap-1 opacity-0 transition group-hover:opacity-100"
                                        onPointerDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                      >
                                        <span
                                          role="button"
                                          tabIndex={-1}
                                          data-clip-generation-inline-run
                                          aria-disabled={generationInlineDisabled}
                                          className={`t8-clip-generation-inline-button ${generationInlineDisabled ? 'is-disabled' : ''}`}
                                          title={item.generation.status === 'error' ? '重试生成' : generationBusy ? '生成中' : generationComplete ? '已完成' : '运行生成'}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            if (generationInlineDisabled) return;
                                            void onRunGenerationClip(item.id || '');
                                          }}
                                        >
                                          {item.generation.status === 'error' ? <RotateCw size={11} /> : generationBusy ? <Pause size={11} /> : <Play size={11} />}
                                        </span>
                                        <span
                                          role="button"
                                          tabIndex={-1}
                                          data-clip-generation-inline-settings
                                          className="t8-clip-generation-inline-button"
                                          title="打开生成参数"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            openGenerationPanelForClip(item.id || '', item.start);
                                          }}
                                        >
                                          <SlidersHorizontal size={11} />
                                        </span>
                                      </span>
                                    ) : null}
                                    {!item.generation && item.kind === 'image' && item.url ? (
                                      <span
                                        role="button"
                                        tabIndex={-1}
                                        data-clip-generation-to-video
                                        className="t8-clip-generation-inline-actions absolute right-7 top-1 z-30 flex items-center gap-1 opacity-0 transition group-hover:opacity-100"
                                        title="用这张图创建视频生成草稿"
                                        onPointerDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          createVideoGenerationFromVisual(item);
                                        }}
                                      >
                                        <span className="t8-clip-generation-inline-button">
                                          <Film size={11} />
                                        </span>
                                      </span>
                                    ) : null}
                                    {item.generation && generationRefDropTargetId === item.id ? (
                                      <span data-clip-generation-ref-drop-hint className="t8-clip-generation-ref-drop-hint pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded border text-[10px] font-black">
                                        松手作为参考
                                      </span>
                                    ) : null}
                                    {item.generation && !item.url ? (
                                      <span className="flex h-full items-center gap-2 bg-fuchsia-500/15 px-3 text-fuchsia-100">
                                        {item.generation.nodeType === 'image' ? <ImageIcon size={18} /> : <Film size={18} />}
                                        <span className="min-w-0">
                                          <span className="block truncate font-black">{sourceName(item)}</span>
                                          <span className="block truncate text-[10px] opacity-70">{generationStatusLabel(item.generation.status)}</span>
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="flex h-full">
                                        {computeClipFrameThumbnails({
                                          ...item,
                                          start: live?.start ?? item.start,
                                          duration: live?.duration ?? item.duration,
                                          width: liveWidth,
                                        }, { frameWidth, maxFrames: frameLimit }).map((frame) => (
                                          <span
                                            key={frame.index}
                                            className="relative h-full shrink-0 overflow-hidden border-r border-black/35 bg-black"
                                            style={{ width: frame.width }}
                                            title={`${sourceName(item)} · ${shortSeconds(frame.time)}`}
                                          >
                                            {frame.kind === 'image' ? (
                                              <img className="h-full w-full object-cover" src={frame.sourceUrl} alt="" draggable={false} loading="lazy" style={{ filter: clipCssFilter(item) }} />
                                            ) : (
                                              <span className="block h-full w-full" style={{ filter: clipCssFilter(item) }}>
                                                <MemoTimelineVideoFrame src={frame.sourceUrl} sourceTime={previewVideoSourceTime(item, Math.max(0, frame.time - (live?.start ?? item.start)))} />
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                      </span>
                                    )}
                                    <span className="pointer-events-none absolute bottom-0 left-0 right-0 flex h-5 items-center gap-1 bg-black/55 px-1.5 text-[10px] text-white">
                                      {item.kind === 'image' ? <ImageIcon size={11} /> : <Film size={11} />}
                                      <span className="min-w-0 flex-1 truncate">{sourceName(item)}</span>
                                      {item.generation ? (
                                        <span className="rounded bg-fuchsia-400/20 px-1 font-black text-fuchsia-100">
                                          {generationStatusLabel(item.generation.status)}
                                        </span>
                                      ) : null}
                                      <span>{shortSeconds(item.duration)}</span>
                                    </span>
                                    <span
                                      data-clip-trim-handle="left"
                                      className="t8-clip-trim-handle absolute bottom-0 left-0 top-0 z-20 w-3 cursor-ew-resize"
                                      onPointerDown={(event) => {
                                        if (!item.id) return;
                                        event.stopPropagation();
                                        setDragState({
                                          id: item.id,
                                          mode: 'trim-left',
                                          startX: event.clientX,
                                          startY: event.clientY,
                                          currentX: event.clientX,
                                          currentY: event.clientY,
                                          active: true,
                                          clipStart: item.start,
                                          clipDuration: item.duration,
                                          trimStart: Number(item.trimStart || 0),
                                          grabOffsetSeconds: 0,
                                          copyMode: false,
                                          lane,
                                        });
                                      }}
                                      title="拖动调整片段长度"
                                    />
                                    <span
                                      data-clip-trim-handle="right"
                                      className="t8-clip-trim-handle absolute bottom-0 right-0 top-0 z-20 w-3 cursor-ew-resize"
                                      onPointerDown={(event) => {
                                        if (!item.id) return;
                                        event.stopPropagation();
                                        setDragState({
                                          id: item.id,
                                          mode: 'trim-right',
                                          startX: event.clientX,
                                          startY: event.clientY,
                                          currentX: event.clientX,
                                          currentY: event.clientY,
                                          active: true,
                                          clipStart: item.start,
                                          clipDuration: item.duration,
                                          trimStart: Number(item.trimStart || 0),
                                          grabOffsetSeconds: 0,
                                          copyMode: false,
                                          lane,
                                        });
                                      }}
                                      title="拖动调整片段长度"
                                    />
                                  </button>
                                  );
                                })}
                            </div>
                            );
                          })}
                        </div>
                      );
                    }
                    if (track.id === 'cover') {
                      return (
                        <div key={track.id} className="t8-clip-track-row relative border-b border-dashed border-[#303030]" style={{ height: track.height }}>
                          <span
                            className="absolute bottom-[-3px] left-0 right-0 z-20 h-1.5 cursor-row-resize hover:bg-emerald-300/25"
                            onPointerDown={(event) => startTrackResize(track.id, track.height, event)}
                            onMouseDown={(event) => startTrackResize(track.id, track.height, event)}
                            title="拖动调整轨道高度"
                          />
                          <button
                            type="button"
                            className="absolute left-3 top-2 flex h-7 items-center gap-2 rounded border border-dashed border-emerald-400/50 bg-emerald-400/10 px-2 text-[10px] text-emerald-100 hover:bg-emerald-400/15"
                            onClick={() => setCoverOpen(true)}
                            title="选择单帧图/封面"
                          >
                            {coverUrl ? (
                              <img className="h-5 w-7 rounded object-cover" src={coverUrl} alt="" />
                            ) : selectedVisual?.kind === 'image' && selectedVisual.url ? (
                              <img className="h-5 w-7 rounded object-cover" src={selectedVisual.url} alt="" />
                            ) : selectedVisual?.kind === 'video' && selectedVisual.url ? (
                              <span data-clip-frame-cover-pending className="relative h-5 w-7 overflow-hidden rounded bg-black">
                                <MemoTimelineVideoFrame src={selectedVisual.url} sourceTime={previewVideoSourceTime(selectedVisual, Math.max(0, coverTime - (selectedLayoutItem?.start || 0)))} />
                              </span>
                            ) : (
                              <ImageIcon size={12} />
                            )}
                            <span>封面</span>
                          </button>
                        </div>
                      );
                    }
                    if (track.id === 'audio') {
                      return (
                        <div key={track.id} className="t8-clip-track-row relative border-b border-dashed border-[#303030]" style={{ height: track.height }}>
                          <span
                            className="absolute bottom-[-3px] left-0 right-0 z-20 h-1.5 cursor-row-resize hover:bg-emerald-300/25"
                            onPointerDown={(event) => startTrackResize(track.id, track.height, event)}
                            onMouseDown={(event) => startTrackResize(track.id, track.height, event)}
                            title="拖动调整轨道高度"
                          />
                          {audioLayout.map(({ item, id: itemId, start, duration: clipDurationValue, left, width }, index) => (
                          <div
                            key={itemId}
                            className={`t8-clip-audio absolute top-2 flex h-8 items-center gap-2 overflow-hidden rounded border px-2 text-[10px] text-sky-100 ${selectedClipIds.has(itemId) || selectedId === itemId ? 'is-selected border-sky-300 bg-sky-500/25' : 'border-sky-500/40 bg-sky-500/15'}`}
                            style={{ left, width, transform: `translateY(${index % 2 === 0 ? 0 : 2}px)` }}
                              title={item.label || fileNameFromUrl(item.url || '')}
                              onClick={(event) => selectClip(itemId, event)}
                              onContextMenu={(event) => openClipContextMenu(event, { id: itemId }, 'audio')}
                              onPointerDown={(event) => {
                                if ((event.target as HTMLElement).dataset.resizeHandle) return;
                                if (event.shiftKey || event.metaKey || event.ctrlKey) return;
                                const rect = timelineTrackRef.current?.getBoundingClientRect();
                                selectClip(itemId);
                                setDragState({
                                  id: itemId,
                                  mode: 'move',
                                  startX: event.clientX,
                                  startY: event.clientY,
                                  currentX: event.clientX,
                                  currentY: event.clientY,
                                  active: false,
                                  clipStart: start,
                                  clipDuration: clipDurationValue,
                                  trimStart: Number(item.trimStart || 0),
                                  grabOffsetSeconds: rect ? Math.max(0, (event.clientX - rect.left) / pixelsPerSecond - start) : 0,
                                  copyMode: false,
                                  lane: 0,
                                });
                              }}
                            >
                              <Music size={12} />
                              <span className="min-w-0 flex-1 truncate">{item.label || fileNameFromUrl(item.url || '')}</span>
                              <span data-clip-audio-status-badges className="t8-clip-audio-status-badges pointer-events-none">
                                <span>{shortSeconds(clipDurationValue)}</span>
                                {Math.abs(Number(item.volume ?? 1) - 1) > 0.01 ? <span>{Math.round(Number(item.volume ?? 1) * 100)}%</span> : null}
                                {Number(item.fadeIn || 0) > 0 || Number(item.fadeOut || 0) > 0 ? <span>淡入淡出</span> : null}
                              </span>
                              <span data-resize-handle="left" data-clip-trim-handle="left" className="t8-clip-trim-handle absolute bottom-0 left-0 top-0 z-20 w-2 cursor-ew-resize" title="拖动调整片段长度" onPointerDown={(event) => {
                                event.stopPropagation();
                                setDragState({ id: itemId, mode: 'trim-left', startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, active: false, clipStart: start, clipDuration: clipDurationValue, trimStart: Number(item.trimStart || 0), grabOffsetSeconds: 0, copyMode: false, lane: 0 });
                              }} />
                              <span data-resize-handle="right" data-clip-trim-handle="right" className="t8-clip-trim-handle absolute bottom-0 right-0 top-0 z-20 w-2 cursor-ew-resize" title="拖动调整片段长度" onPointerDown={(event) => {
                                event.stopPropagation();
                                setDragState({ id: itemId, mode: 'trim-right', startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, active: false, clipStart: start, clipDuration: clipDurationValue, trimStart: Number(item.trimStart || 0), grabOffsetSeconds: 0, copyMode: false, lane: 0 });
                              }} />
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <div key={track.id} className="t8-clip-track-row relative border-b border-dashed border-[#303030]" style={{ height: track.height }}>
                        <span
                          className="absolute bottom-[-3px] left-0 right-0 z-20 h-1.5 cursor-row-resize hover:bg-emerald-300/25"
                          onPointerDown={(event) => startTrackResize(track.id, track.height, event)}
                          onMouseDown={(event) => startTrackResize(track.id, track.height, event)}
                          title="拖动调整轨道高度"
                        />
                        {textLayout.map(({ item, id: itemId, start, duration: clipDurationValue, left, width }) => (
                          <div
                            key={itemId}
                            className={`t8-clip-text absolute top-2 flex h-8 items-center gap-2 overflow-hidden rounded border px-2 text-[10px] text-violet-100 ${selectedClipIds.has(itemId) || selectedId === itemId ? 'is-selected border-violet-300 bg-violet-500/25' : 'border-violet-500/40 bg-violet-500/15'}`}
                            style={{ left, width }}
                            title={item.text}
                            onClick={(event) => selectClip(itemId, event)}
                            onContextMenu={(event) => openClipContextMenu(event, { id: itemId }, 'text')}
                            onPointerDown={(event) => {
                              if ((event.target as HTMLElement).dataset.resizeHandle) return;
                              if (event.shiftKey || event.metaKey || event.ctrlKey) return;
                              const rect = timelineTrackRef.current?.getBoundingClientRect();
                              selectClip(itemId);
                              setDragState({
                                id: itemId,
                                mode: 'move',
                                startX: event.clientX,
                                startY: event.clientY,
                                currentX: event.clientX,
                                currentY: event.clientY,
                                active: false,
                                clipStart: start,
                                clipDuration: clipDurationValue,
                                trimStart: Number(item.trimStart || 0),
                                grabOffsetSeconds: rect ? Math.max(0, (event.clientX - rect.left) / pixelsPerSecond - start) : 0,
                                copyMode: false,
                                lane: 0,
                              });
                            }}
                          >
                            <TextCursorInput size={12} />
                            <span className="min-w-0 flex-1 truncate">{item.label || item.text}</span>
                            <span data-clip-text-status-badges className="t8-clip-text-status-badges pointer-events-none">
                              <span>{shortSeconds(clipDurationValue)}</span>
                              <span>{Math.round(Number(item.fontSize || 42))}px</span>
                            </span>
                            <span data-resize-handle="left" data-clip-trim-handle="left" className="t8-clip-trim-handle absolute bottom-0 left-0 top-0 z-20 w-2 cursor-ew-resize" title="拖动调整片段长度" onPointerDown={(event) => {
                              event.stopPropagation();
                              setDragState({ id: itemId, mode: 'trim-left', startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, active: false, clipStart: start, clipDuration: clipDurationValue, trimStart: Number(item.trimStart || 0), grabOffsetSeconds: 0, copyMode: false, lane: 0 });
                            }} />
                            <span data-resize-handle="right" data-clip-trim-handle="right" className="t8-clip-trim-handle absolute bottom-0 right-0 top-0 z-20 w-2 cursor-ew-resize" title="拖动调整片段长度" onPointerDown={(event) => {
                              event.stopPropagation();
                              setDragState({ id: itemId, mode: 'trim-right', startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, active: false, clipStart: start, clipDuration: clipDurationValue, trimStart: Number(item.trimStart || 0), grabOffsetSeconds: 0, copyMode: false, lane: 0 });
                            }} />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {error ? <div className="border-t border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}
          </div>
        </section>
      </main>

      {clipContextMenu && clipContextMenuItem ? (
        <div
          data-clip-context-menu
          className="t8-clip-context-menu fixed z-50 min-w-[200px] rounded border p-1.5 text-[11px] shadow-2xl"
          style={{ left: clipContextMenu.x, top: clipContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" data-clip-context-menu-action className="t8-clip-context-menu-item" onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (clipContextMenu.kind === 'visual') {
              onSplitVisual(clipContextMenu.id);
            } else if (clipContextMenu.kind === 'audio') {
              onSplitAudioAtTime(clipContextMenu.id, playheadTime);
            } else {
              onSplitTextAtTime(clipContextMenu.id, playheadTime);
            }
            setClipContextMenu(null);
            showCommandFeedback('分割片段');
          }}>
            <Scissors size={12} /> 分割
          </button>
          <button type="button" data-clip-context-menu-action className="t8-clip-context-menu-item" onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (clipContextMenu.kind === 'visual') {
              onDuplicateVisual(clipContextMenu.id);
            } else if (clipContextMenu.kind === 'audio') {
              onDuplicateAudio(clipContextMenu.id);
            } else {
              onDuplicateText(clipContextMenu.id);
            }
            setClipContextMenu(null);
            showCommandFeedback('复制片段');
          }}>
            <Copy size={12} /> 复制
          </button>
          {clipContextMenu.kind === 'visual' ? (
            <>
              <button type="button" data-clip-context-menu-action className="t8-clip-context-menu-item" onPointerDown={(event) => runClipContextPointerAction(event, () => duplicateVisualToLane(clipContextMenu.id, -1))}>
                <ArrowUp size={12} /> 复制到上方轨道
              </button>
              <button type="button" data-clip-context-menu-action className="t8-clip-context-menu-item" onPointerDown={(event) => runClipContextPointerAction(event, () => duplicateVisualToLane(clipContextMenu.id, 1))}>
                <ArrowDown size={12} /> 复制到下方轨道
              </button>
              <button type="button" data-clip-context-menu-action className="t8-clip-context-menu-item" onPointerDown={(event) => runClipContextPointerAction(event, () => runClipContextAction(() => onToggleVisual(clipContextMenu.id), '切换可见性'))}>
                {Boolean(clipContextMenuVisual?.disabled) ? <EyeOff size={12} /> : <Eye size={12} />} 隐藏/显示
              </button>
            </>
          ) : null}
          <button type="button" data-clip-context-menu-action className="t8-clip-context-menu-item is-danger" onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (clipContextMenu.kind === 'visual') onRemoveVisual(clipContextMenu.id);
            else if (clipContextMenu.kind === 'audio') onRemoveAudio(clipContextMenu.id);
            else onRemoveText(clipContextMenu.id);
            setClipContextMenu(null);
            showCommandFeedback('删除片段');
          }}>
            <X size={12} /> 删除
          </button>
        </div>
      ) : null}

      {coverOpen ? (
        <div
          data-clip-cover-modal-backdrop
          className="t8-clip-modal-backdrop absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm"
          onMouseDown={() => setCoverOpen(false)}
        >
          <div
            className="t8-clip-modal w-[920px] overflow-hidden rounded border border-[#2f2f2f] bg-[#101010] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="封面选择"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="t8-clip-panel-header flex h-14 items-center justify-between border-b border-[#262626] px-5">
              <div className="text-lg font-black">封面选择</div>
              <button type="button" className={iconButton} onClick={() => setCoverOpen(false)} title="关闭">
                <X size={14} />
              </button>
            </div>
            <div className="px-10 py-8">
              <div className="mx-auto flex h-[520px] max-w-[720px] items-center justify-center bg-black">
                {currentCoverPreview ? (
                  coverTab === 'frame' && selectedVisual?.kind === 'video' ? (
                    <span data-clip-frame-cover-pending className="flex h-full w-full items-center justify-center bg-black">
                      <MemoTimelineVideoFrame src={currentCoverPreview} sourceTime={previewVideoSourceTime(selectedVisual, Math.max(0, coverDraftTime - (selectedLayoutItem?.start || 0)))} />
                    </span>
                  ) : (
                    <img className="max-h-full max-w-full object-contain" src={currentCoverPreview} alt="" />
                  )
                ) : (
                  <div className="text-sm text-zinc-500">暂无可用画面</div>
                )}
              </div>
              <div className="mx-auto mt-4 grid max-w-[720px] grid-cols-[84px_1fr_84px] items-center gap-3 text-xs text-zinc-500">
                <span className="font-mono">{formatSeconds(coverDraftTime, fps)}</span>
                <input
                  className="nodrag h-1 accent-emerald-400"
                  type="range"
                  min={0}
                  max={Math.max(duration, 0.1)}
                  step={0.04}
                  value={Math.min(coverDraftTime, duration || 0)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setCoverDraftTime(next);
                    seekPlayhead(next);
                  }}
                />
                <span className="text-right font-mono">{formatSeconds(duration, fps)}</span>
              </div>
              <div className="mt-5 flex items-center justify-center gap-2">
                <button type="button" className={`${editorButton} ${coverTab === 'frame' ? 'bg-zinc-200 text-black' : 'bg-[#252525] text-zinc-300'}`} onClick={() => setCoverTab('frame')}>
                  视频帧
                </button>
                <button type="button" className={`${editorButton} ${coverTab === 'local' ? 'bg-zinc-200 text-black' : 'bg-[#252525] text-zinc-300'}`} onClick={() => setCoverTab('local')}>
                  本地
                </button>
                <input
                  ref={coverInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onImportCoverFile(file);
                    event.currentTarget.value = '';
                  }}
                />
                {coverTab === 'local' ? (
                  <button type="button" className={`${editorButton} bg-[#252525] text-zinc-300 hover:bg-[#303030]`} onClick={() => coverInputRef.current?.click()}>
                    <Upload size={14} />
                    上传封面
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex h-16 items-center justify-end gap-3 border-t border-[#262626] px-5">
              <button type="button" className={`${editorButton} border border-[#333] bg-transparent text-zinc-300 hover:bg-white/5`} onClick={() => setCoverOpen(false)}>取消</button>
              <button type="button" className={`${editorButton} bg-zinc-100 text-black hover:bg-white`} onClick={confirmCover}>确定</button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );

  return typeof document !== 'undefined' ? createPortal(ui, document.body) : ui;
}
