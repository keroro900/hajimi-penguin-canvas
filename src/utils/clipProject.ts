export type ClipTrackKind = 'visual' | 'audio' | 'text';
export type ClipItemKind = 'image' | 'video' | 'audio' | 'text';
export type ClipFit = 'contain' | 'cover' | 'fill';
export const CLIP_BLEND_MODE_IDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as const;
export type ClipBlendMode = typeof CLIP_BLEND_MODE_IDS[number];
export const CLIP_TRANSITION_IDS = ['none', 'fade', 'wipeleft', 'wiperight', 'slideleft', 'slideright'] as const;
export type ClipTransitionPreset = typeof CLIP_TRANSITION_IDS[number];
export const CLIP_FILTER_PRESET_IDS = [
  'none',
  'cinematic',
  'warm',
  'cool',
  'bw',
  'vivid',
  'fade',
  'color-teal-orange',
  'color-japanese-clean',
  'color-food',
  'color-night',
  'color-portrait-soft',
  'color-product-clean',
  'color-cyberpunk',
  'color-sunset',
  'color-documentary',
  'color-matte-film',
  'color-clean-bright',
  'color-moody-fall',
  'color-korean-soft',
  'color-blue-hour',
  'color-fashion-contrast',
  'color-vlog-natural',
  'color-anime-pop',
  'cssgram-clarendon',
  'cssgram-moon',
  'cssgram-lofi',
  'cssgram-aden',
  'cssgram-reyes',
  'cssgram-gingham',
  'cssgram-walden',
  'cssgram-hudson',
  'cssgram-inkwell',
  'cssgram-nashville',
  'ffmpeg-sharpen',
  'ffmpeg-denoise',
  'ffmpeg-vignette',
  'ffmpeg-film-grain',
  'ffmpeg-soft-glow',
  'ffmpeg-retro',
  'ffmpeg-sketch',
  'ffmpeg-scanlines',
  'ffmpeg-high-contrast-bw',
  'ffmpeg-dream-blur',
  'ffmpeg-vhs',
  'ffmpeg-comic',
  'ffmpeg-cctv',
  'ffmpeg-light-leak',
  'ffmpeg-neon-edge',
] as const;
export type ClipFilterPreset = typeof CLIP_FILTER_PRESET_IDS[number];
export const CLIP_RESOLUTION_PRESETS = ['480p', '720p', '1080p', '1440p', '2160p'] as const;
export const CLIP_MAX_VISUAL_LANE = 24;

export interface ClipVisualTransform {
  scale?: number;
  x?: number;
  y?: number;
  rotation?: number;
  opacity?: number;
}

export interface ClipVisualKeyframe extends ClipVisualTransform {
  time: number;
}

export type ClipGenerationNodeType = 'video' | 'image';
export type ClipGenerationStatus = 'draft' | 'queued' | 'running' | 'success' | 'error' | 'cancelled';

export interface ClipGenerationRef {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'clip';
  url?: string;
  label?: string;
  role?: 'auto' | 'first_frame' | 'last_frame' | 'reference' | 'style' | 'character' | 'audio';
  source?: 'upload' | 'timeline' | 'canvas' | 'auto';
  sourceClipId?: string;
  locked?: boolean;
}

export interface ClipGenerationState {
  nodeType: ClipGenerationNodeType;
  status: ClipGenerationStatus;
  model: string;
  mainId?: string;
  apiModel?: string;
  prompt: string;
  params: Record<string, unknown>;
  refs?: ClipGenerationRef[];
  taskId?: string;
  outputUrl?: string;
  error?: string;
}

export interface ClipMaterial {
  id?: string;
  url?: string;
  text?: string;
  label?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  lane?: number;
  duration?: number;
  start?: number;
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  fontSize?: number;
  color?: string;
  x?: number;
  y?: number;
  filter?: ClipFilterPreset;
  intensity?: number;
  lutPresetId?: string;
  lutName?: string;
  lutText?: string;
  lutAmount?: number;
  speed?: number;
  transition?: ClipTransitionPreset;
  transitionDuration?: number;
  blendMode?: ClipBlendMode;
  transform?: ClipVisualTransform;
  keyframes?: ClipVisualKeyframe[];
  generation?: ClipGenerationState;
}

export interface ClipDraftMaterials {
  images?: ClipMaterial[];
  videos?: ClipMaterial[];
  audios?: ClipMaterial[];
  texts?: ClipMaterial[];
}

export interface ClipTimelineVisualMaterial extends ClipMaterial {
  id?: string;
  kind: 'image' | 'video';
  disabled?: boolean;
  fit?: ClipFit;
}

export interface ClipDraftTimeline {
  visuals?: ClipTimelineVisualMaterial[];
  audios?: ClipMaterial[];
  texts?: ClipMaterial[];
}

export interface ClipDraftTimelineOptions {
  visualTransforms?: Record<string, ClipVisualTransform | undefined>;
  visualKeyframes?: Record<string, ClipVisualKeyframe[] | undefined>;
}

export interface ClipTimelineEditState {
  order?: string[];
  disabledIds?: string[];
  removedIds?: string[];
  durations?: Record<string, unknown>;
  starts?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  keyframes?: Record<string, unknown>;
}

export interface ClipTimelineLayoutOptions {
  fallbackDuration?: number;
  pixelsPerSecond?: number;
  gapPixels?: number;
  minClipWidth?: number;
}

export interface ClipTimelineLayoutItem extends ClipTimelineVisualMaterial {
  start: number;
  duration: number;
  left: number;
  width: number;
}

export interface ClipTimelineLayout {
  items: ClipTimelineLayoutItem[];
  duration: number;
  width: number;
}

export interface ClipTimelinePlaybackState {
  item: ClipTimelineLayoutItem;
  start: number;
  duration: number;
  localTime: number;
}

export interface ClipTimelineTrackRow {
  id: 'visual' | 'cover' | 'audio' | 'text';
  label: string;
  height: number;
}

export type ClipTimelineTrackId = ClipTimelineTrackRow['id'];

export interface ClipStudioLayout {
  leftWidth: number;
  rightWidth: number;
  topHeight: number;
}

export type ClipTrackHeights = Partial<Record<ClipTimelineTrackId, number>>;

export interface ClipProbeDuration {
  url: string;
  duration?: number;
}

export interface ClipRatioPreset {
  id: string;
  label: string;
  widthRatio: number;
  heightRatio: number;
}

export interface ClipFrameThumbnail {
  index: number;
  left: number;
  width: number;
  time: number;
  sourceUrl: string;
  kind: 'image' | 'video';
}

export interface ClipFrameThumbnailOptions {
  frameWidth?: number;
  maxFrames?: number;
}

export interface ClipTimelineRulerTick {
  kind: 'major' | 'frame';
  time: number;
  left: number;
  label: string;
}

export type ClipSnapTargetKind = 'zero' | 'playhead' | 'clip-start' | 'clip-end' | 'audio-start' | 'audio-end' | 'text-start' | 'text-end';

export interface ClipSnapTarget {
  time: number;
  kind: ClipSnapTargetKind;
  label?: string;
}

export interface ClipTimelineDragTimingPreview {
  start: number;
  duration: number;
  trimStartDelta?: number;
  snapTarget?: ClipSnapTarget;
  snapEdgeTime?: number;
}

export interface ClipTimelineInsertTimingOptions {
  requestedStart?: number;
  fallbackStart?: number;
  duration?: number;
  lane?: number;
  avoidOverlap?: boolean;
}

export interface ClipTimelineInsertTiming {
  start: number;
  lane: number;
}

export interface ClipExportSettings {
  width?: number;
  height?: number;
  fps?: number;
  imageDuration?: number;
  background?: string;
}

export interface SanitizedClipExportSettings {
  width: number;
  height: number;
  fps: number;
  imageDuration: number;
  background: string;
}

export interface ClipItem {
  id: string;
  kind: ClipItemKind;
  sourceUrl?: string;
  text?: string;
  label?: string;
  start: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  fit?: ClipFit;
  filter?: ClipFilterPreset;
  intensity?: number;
  lutPresetId?: string;
  lutName?: string;
  lutText?: string;
  lutAmount?: number;
  speed?: number;
  transition?: ClipTransitionPreset;
  transitionDuration?: number;
  blendMode?: ClipBlendMode;
  fontSize?: number;
  color?: string;
  x?: number;
  y?: number;
  transform?: ClipVisualTransform;
  keyframes?: ClipVisualKeyframe[];
}

export interface ClipTrack {
  id: string;
  kind: ClipTrackKind;
  clips: ClipItem[];
}

export interface ClipProject {
  version: 1;
  title?: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  tracks: ClipTrack[];
}

export type QuickClipTemplateId = 'social-clean' | 'product-pop' | 'film-story' | 'vlog-warm';

export interface QuickClipTemplate {
  id: QuickClipTemplateId;
  label: string;
  ratio: string;
  resolution: string;
  fps: number;
  filter: ClipFilterPreset;
  intensity: number;
  transition: ClipTransitionPreset;
  transitionDuration: number;
  fadeIn: number;
  fadeOut: number;
  fit: ClipFit;
  textStyle: Pick<ClipMaterial, 'fontSize' | 'color' | 'x' | 'y'>;
}

export interface QuickClipTemplatePatch {
  clipRatio: string;
  clipResolution: string;
  clipFps: number;
  clipVisualFilters: Record<string, {
    filter: ClipFilterPreset;
    intensity: number;
    speed: number;
    fadeIn: number;
    fadeOut: number;
    transition: ClipTransitionPreset;
    transitionDuration: number;
    fit: ClipFit;
  }>;
  clipTextEdits?: ClipMaterial[];
}

export interface QuickClipCleanupPatch {
  clipAudioEdits?: ClipMaterial[];
  clipTextEdits?: ClipMaterial[];
}

export type ClipExportInspectionCode =
  | 'timeline-gap'
  | 'pending-generation'
  | 'missing-cover'
  | 'audio-overflow'
  | 'text-overflow'
  | 'text-position'
  | 'contain-fit';

export interface ClipExportInspectionItem {
  code: ClipExportInspectionCode;
  severity: 'info' | 'warning';
  message: string;
}

export interface ClipExportInspectionReport {
  status: 'ok' | 'warning';
  items: ClipExportInspectionItem[];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function positiveNumberOr(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, n));
}

function roundSeconds(value: number) {
  return Math.round(value * 1000) / 1000;
}

function cleanHexColor(value: unknown, fallback = '#000000') {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function mediaUrl(item: ClipMaterial) {
  return String(item?.url || item?.generation?.outputUrl || '').trim();
}

function textValue(item: ClipMaterial) {
  return String(item?.text || item?.url || '').trim();
}

function clipDuration(item: ClipMaterial, fallback: number) {
  return roundSeconds(clampNumber(item?.duration, 0.1, 24 * 60 * 60, fallback));
}

function cleanClipFit(value: unknown): ClipFit {
  return value === 'cover' || value === 'fill' ? value : 'contain';
}

function cleanClipFilter(value: unknown): ClipFilterPreset {
  return CLIP_FILTER_PRESET_IDS.includes(value as ClipFilterPreset) ? value as ClipFilterPreset : 'none';
}

function cleanClipLutId(value: unknown): string | undefined {
  const text = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._-]{0,96}$/i.test(text) ? text : undefined;
}

function cleanClipLutName(value: unknown): string | undefined {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 120) : undefined;
}

function cleanClipLutText(value: unknown): string | undefined {
  const text = String(value || '').trim();
  if (!text || !/LUT_3D_SIZE/i.test(text)) return undefined;
  return text.slice(0, 3_000_000);
}

function cleanClipLutAmount(value: unknown): number | undefined {
  if (value == null) return undefined;
  return roundSeconds(clampNumber(value, 0, 1, 1));
}

function cleanClipTransition(value: unknown): ClipTransitionPreset {
  return CLIP_TRANSITION_IDS.includes(value as ClipTransitionPreset) ? value as ClipTransitionPreset : 'none';
}

function cleanClipBlendMode(value: unknown): ClipBlendMode {
  return CLIP_BLEND_MODE_IDS.includes(value as ClipBlendMode) ? value as ClipBlendMode : 'normal';
}

function clipFilterIntensity(value: unknown, fallback = 65) {
  return Math.round(clampNumber(value, 0, 100, fallback));
}

function cleanClipSpeed(value: unknown) {
  return roundSeconds(clampNumber(value, 0.25, 4, 1));
}

function clipTrimStart(item: ClipMaterial) {
  return roundSeconds(clampNumber(item?.trimStart, 0, 24 * 60 * 60, 0));
}

function cleanGenerationStatus(value: unknown): ClipGenerationStatus {
  return value === 'queued'
    || value === 'running'
    || value === 'success'
    || value === 'error'
    || value === 'cancelled'
    ? value
    : 'draft';
}

function cleanGenerationNodeType(value: unknown): ClipGenerationNodeType {
  return value === 'image' ? 'image' : 'video';
}

function cleanGenerationRefs(value: unknown): ClipGenerationRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const kind: ClipGenerationRef['kind'] = item.kind === 'video' || item.kind === 'audio' || item.kind === 'clip' ? item.kind : 'image';
      return {
        id: String(item.id || item.url || item.label || `ref-${index}`).slice(0, 160),
        kind,
        url: typeof item.url === 'string' ? item.url : undefined,
        label: typeof item.label === 'string' ? item.label.slice(0, 160) : undefined,
      };
    })
    .filter((item) => item.id);
}

function cleanGenerationParams(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

export function sanitizeClipGenerationState(value: unknown): ClipGenerationState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const nodeType = cleanGenerationNodeType(raw.nodeType);
  const model = String(raw.model || nodeType).trim();
  return {
    nodeType,
    status: cleanGenerationStatus(raw.status),
    model,
    mainId: typeof raw.mainId === 'string' ? raw.mainId : undefined,
    apiModel: typeof raw.apiModel === 'string' ? raw.apiModel : undefined,
    prompt: String(raw.prompt || '').slice(0, 8000),
    params: cleanGenerationParams(raw.params),
    refs: cleanGenerationRefs(raw.refs),
    taskId: typeof raw.taskId === 'string' ? raw.taskId : undefined,
    outputUrl: typeof raw.outputUrl === 'string' ? raw.outputUrl : undefined,
    error: typeof raw.error === 'string' ? raw.error.slice(0, 1200) : undefined,
  };
}

export function isClipGenerationVisual(value: unknown): value is ClipTimelineVisualMaterial & { generation: ClipGenerationState } {
  return Boolean(value && typeof value === 'object' && sanitizeClipGenerationState((value as ClipTimelineVisualMaterial).generation));
}

export function createClipGenerationVisual({
  nodeType,
  label,
  start,
  duration,
  model,
  mainId,
  apiModel,
  prompt = '',
  params = {},
  refs = [],
}: {
  nodeType: ClipGenerationNodeType;
  label?: string;
  start?: number;
  duration?: number;
  model?: string;
  mainId?: string;
  apiModel?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  refs?: ClipGenerationRef[];
}): ClipTimelineVisualMaterial {
  const safeNodeType = cleanGenerationNodeType(nodeType);
  const safeDuration = roundSeconds(clampNumber(duration, 0.5, 60 * 60, safeNodeType === 'image' ? 3 : 5));
  const idPrefix = safeNodeType === 'image' ? 'clip-gen-image' : 'clip-gen-video';
  return {
    id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: safeNodeType === 'image' ? 'image' : 'video',
    label: label || (safeNodeType === 'image' ? '图像生成 - 待配置' : '视频生成 - 待配置'),
    start: roundSeconds(clampNumber(start, 0, 24 * 60 * 60, 0)),
    duration: safeDuration,
    generation: {
      nodeType: safeNodeType,
      status: 'draft',
      model: model || safeNodeType,
      mainId,
      apiModel,
      prompt,
      params: {
        ...(safeNodeType === 'image'
          ? { aspect_ratio: '1:1', image_size: '2K' }
          : { duration: safeDuration, generate_audio: true, ratio: '16:9', resolution: '720p', seed: -1 }),
        ...params,
      },
      refs: cleanGenerationRefs(refs),
    },
  };
}

function clipPercent(value: unknown, fallback: number) {
  return roundSeconds(clampNumber(value, 0, 100, fallback));
}

function roundHundredths(value: number) {
  return Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
}

function cleanClipTransform(value: unknown): ClipVisualTransform | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as ClipVisualTransform;
  const hasTransform = raw.scale != null
    || raw.x != null
    || raw.y != null
    || raw.rotation != null
    || raw.opacity != null;
  if (!hasTransform) return undefined;
  return {
    scale: roundSeconds(clampNumber(raw.scale, 0.1, 3, 1)),
    x: clipPercent(raw.x, 50),
    y: clipPercent(raw.y, 50),
    rotation: roundSeconds(clampNumber(raw.rotation, -180, 180, 0)),
    opacity: roundSeconds(clampNumber(raw.opacity, 0, 1, 1)),
  };
}

export function resolveClipVisualKeyframes(value: unknown, duration = 3): ClipVisualKeyframe[] {
  if (!Array.isArray(value)) return [];
  const safeDuration = roundSeconds(clampNumber(duration, 0.1, 24 * 60 * 60, 3));
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      time: roundSeconds(clampNumber(item.time, 0, safeDuration, 0)),
      scale: roundSeconds(clampNumber(item.scale, 10, 400, 100)),
      x: roundHundredths(clampNumber(item.x, -2000, 2000, 0)),
      y: roundHundredths(clampNumber(item.y, -2000, 2000, 0)),
      rotation: roundSeconds(clampNumber(item.rotation, -360, 360, 0)),
      opacity: roundSeconds(clampNumber(item.opacity, 0, 100, 100)),
    }))
    .sort((a, b) => a.time - b.time);
}

export function normalizeClipVisualTransform(value?: Partial<ClipVisualTransform>): Required<ClipVisualTransform> {
  return {
    scale: clampNumber(value?.scale, 10, 400, 100),
    x: clampNumber(value?.x, -2000, 2000, 0),
    y: clampNumber(value?.y, -2000, 2000, 0),
    rotation: clampNumber(value?.rotation, -360, 360, 0),
    opacity: clampNumber(value?.opacity, 0, 100, 100),
  };
}

export function interpolateClipVisualKeyframes(
  keyframes: ClipVisualKeyframe[] | undefined,
  localTime: number,
  fallback: Partial<ClipVisualTransform> = {},
): Required<ClipVisualTransform> {
  const safeFallback = normalizeClipVisualTransform(fallback);
  const sorted = (keyframes || [])
    .filter((item) => Number.isFinite(Number(item.time)))
    .map((item) => ({
      time: Math.max(0, Number(item.time)),
      transform: normalizeClipVisualTransform(item),
    }))
    .sort((a, b) => a.time - b.time);
  if (sorted.length === 0) return safeFallback;
  const time = Math.max(0, Number.isFinite(localTime) ? localTime : 0);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (time <= first.time) return first.transform;
  if (time >= last.time) return last.transform;
  const nextIndex = sorted.findIndex((item) => item.time >= time);
  const before = sorted[Math.max(0, nextIndex - 1)] || first;
  const after = sorted[nextIndex] || last;
  const span = Math.max(0.001, after.time - before.time);
  const t = Math.max(0, Math.min(1, (time - before.time) / span));
  return {
    scale: before.transform.scale + (after.transform.scale - before.transform.scale) * t,
    x: before.transform.x + (after.transform.x - before.transform.x) * t,
    y: before.transform.y + (after.transform.y - before.transform.y) * t,
    rotation: before.transform.rotation + (after.transform.rotation - before.transform.rotation) * t,
    opacity: before.transform.opacity + (after.transform.opacity - before.transform.opacity) * t,
  };
}

export const CLIP_RATIO_PRESETS: ClipRatioPreset[] = [
  { id: 'adapt', label: '适应（原始）', widthRatio: 16, heightRatio: 9 },
  { id: '16:9', label: '16:9', widthRatio: 16, heightRatio: 9 },
  { id: '21:9', label: '21:9', widthRatio: 21, heightRatio: 9 },
  { id: '4:3', label: '4:3', widthRatio: 4, heightRatio: 3 },
  { id: '2.35:1', label: '2.35:1', widthRatio: 2.35, heightRatio: 1 },
  { id: '2:1', label: '2:1', widthRatio: 2, heightRatio: 1 },
  { id: '1.91:1', label: '1.91:1', widthRatio: 1.91, heightRatio: 1 },
  { id: '1.85:1', label: '1.85:1', widthRatio: 1.85, heightRatio: 1 },
  { id: '3:2', label: '3:2', widthRatio: 3, heightRatio: 2 },
  { id: '5:4', label: '5:4', widthRatio: 5, heightRatio: 4 },
  { id: '4:5', label: '4:5', widthRatio: 4, heightRatio: 5 },
  { id: '2:3', label: '2:3', widthRatio: 2, heightRatio: 3 },
  { id: '9:16', label: '9:16', widthRatio: 9, heightRatio: 16 },
  { id: '9:21', label: '9:21', widthRatio: 9, heightRatio: 21 },
  { id: '3:4', label: '3:4', widthRatio: 3, heightRatio: 4 },
  { id: '5.8寸', label: '5.8寸', widthRatio: 9, heightRatio: 19.5 },
  { id: '1:1', label: '1:1', widthRatio: 1, heightRatio: 1 },
];

export const QUICK_CLIP_TEMPLATES: QuickClipTemplate[] = [
  {
    id: 'social-clean',
    label: '短视频清爽',
    ratio: '9:16',
    resolution: '1080p',
    fps: 30,
    filter: 'color-clean-bright',
    intensity: 68,
    transition: 'fade',
    transitionDuration: 0.35,
    fadeIn: 0.18,
    fadeOut: 0.18,
    fit: 'cover',
    textStyle: { fontSize: 44, color: '#ffffff', x: 50, y: 86 },
  },
  {
    id: 'product-pop',
    label: '商品高亮',
    ratio: '4:5',
    resolution: '1080p',
    fps: 30,
    filter: 'color-product-clean',
    intensity: 78,
    transition: 'slideleft',
    transitionDuration: 0.4,
    fadeIn: 0,
    fadeOut: 0.12,
    fit: 'cover',
    textStyle: { fontSize: 40, color: '#6ee7b7', x: 50, y: 82 },
  },
  {
    id: 'film-story',
    label: '电影叙事',
    ratio: '2.35:1',
    resolution: '1080p',
    fps: 24,
    filter: 'color-matte-film',
    intensity: 64,
    transition: 'fade',
    transitionDuration: 0.75,
    fadeIn: 0.45,
    fadeOut: 0.45,
    fit: 'contain',
    textStyle: { fontSize: 36, color: '#f8fafc', x: 50, y: 88 },
  },
  {
    id: 'vlog-warm',
    label: 'Vlog 暖调',
    ratio: '16:9',
    resolution: '1080p',
    fps: 30,
    filter: 'color-vlog-natural',
    intensity: 62,
    transition: 'wipeleft',
    transitionDuration: 0.35,
    fadeIn: 0.15,
    fadeOut: 0.15,
    fit: 'cover',
    textStyle: { fontSize: 42, color: '#ffffff', x: 50, y: 88 },
  },
];

export function resolveClipRatioPreset(
  presetId: string,
  resolution: string = '720p',
  sourceSize?: { width?: unknown; height?: unknown },
): { width: number; height: number } {
  if (presetId === 'adapt') {
    const width = Math.round(clampNumber(sourceSize?.width, 240, 3840, 1280));
    const height = Math.round(clampNumber(sourceSize?.height, 240, 3840, 720));
    return { width, height };
  }

  const preset = CLIP_RATIO_PRESETS.find((item) => item.id === presetId) || CLIP_RATIO_PRESETS[1];
  const resolutionLongSide: Record<string, number> = {
    '480p': 480,
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '2160p': 2160,
  };
  const longSide = resolutionLongSide[resolution] || 720;
  const wide = preset.widthRatio >= preset.heightRatio;
  const width = wide ? Math.round(longSide * (preset.widthRatio / preset.heightRatio)) : longSide;
  const height = wide ? longSide : Math.round(longSide * (preset.heightRatio / preset.widthRatio));
  return {
    width: Math.round(clampNumber(width, 240, 3840, 1280)),
    height: Math.round(clampNumber(height, 240, 3840, 720)),
  };
}

export function sanitizeClipExportSettings(settings: ClipExportSettings = {}): SanitizedClipExportSettings {
  return {
    width: Math.round(clampNumber(settings.width, 240, 3840, 1280)),
    height: Math.round(clampNumber(settings.height, 240, 3840, 720)),
    fps: Math.round(clampNumber(settings.fps, 12, 60, 30)),
    imageDuration: roundSeconds(positiveNumberOr(settings.imageDuration, 0.25, 60, 3)),
    background: cleanHexColor(settings.background),
  };
}

export function applyClipTimelineEdits(
  visuals: ClipTimelineVisualMaterial[],
  edits: ClipTimelineEditState = {},
): ClipTimelineVisualMaterial[] {
  const removed = new Set(edits.removedIds || []);
  const byId = new Map<string, ClipTimelineVisualMaterial>();
  visuals.forEach((item, index) => {
    const id = item.id || `${item.kind}-${index}`;
    if (removed.has(id)) return;
    if (!byId.has(id)) {
      byId.set(id, { ...item, id });
    }
  });

  const ordered: ClipTimelineVisualMaterial[] = [];
  const seen = new Set<string>();
  for (const id of edits.order || []) {
    if (seen.has(id)) continue;
    const item = byId.get(id);
    if (!item) continue;
    ordered.push(item);
    seen.add(id);
  }
  for (const [id, item] of byId) {
    if (seen.has(id)) continue;
    ordered.push(item);
    seen.add(id);
  }

  const disabled = new Set(edits.disabledIds || []);
  return ordered.map((item) => {
    const id = item.id || '';
    const duration = edits.durations && id ? edits.durations[id] : undefined;
    const next: ClipTimelineVisualMaterial = {
      ...item,
      disabled: disabled.has(id),
    };
    if (duration !== undefined) {
      next.duration = Number(duration);
    }
    const start = edits.starts && id ? edits.starts[id] : undefined;
    if (start !== undefined) {
      const n = Number(start);
      if (Number.isFinite(n) && n >= 0) next.start = roundSeconds(n);
    }
    const filter = edits.filters && id ? edits.filters[id] : undefined;
    if (filter && typeof filter === 'object') {
      const value = filter as {
        filter?: unknown;
        intensity?: unknown;
        lutPresetId?: unknown;
        lutName?: unknown;
        lutText?: unknown;
        lutAmount?: unknown;
        speed?: unknown;
        fadeIn?: unknown;
        fadeOut?: unknown;
        transition?: unknown;
        transitionDuration?: unknown;
        fit?: unknown;
        blendMode?: unknown;
      };
      next.filter = cleanClipFilter(value.filter);
      next.intensity = clipFilterIntensity(value.intensity, 65);
      next.lutPresetId = cleanClipLutId(value.lutPresetId);
      next.lutName = cleanClipLutName(value.lutName);
      next.lutText = cleanClipLutText(value.lutText);
      next.lutAmount = cleanClipLutAmount(value.lutAmount);
      if (value.speed != null) next.speed = cleanClipSpeed(value.speed);
      if (value.fadeIn != null) next.fadeIn = roundSeconds(clampNumber(value.fadeIn, 0, 60, 0));
      if (value.fadeOut != null) next.fadeOut = roundSeconds(clampNumber(value.fadeOut, 0, 60, 0));
      if (value.transition != null) next.transition = cleanClipTransition(value.transition);
      if (value.transitionDuration != null) next.transitionDuration = roundSeconds(clampNumber(value.transitionDuration, 0.1, 5, 0.5));
      if (value.fit != null) next.fit = cleanClipFit(value.fit);
      if (value.blendMode != null) next.blendMode = cleanClipBlendMode(value.blendMode);
    }
    return next;
  });
}

export function mergeProbedClipVisualDurations({
  visuals,
  currentDurations = {},
  probes = [],
}: {
  visuals: ClipTimelineVisualMaterial[];
  currentDurations?: Record<string, unknown>;
  probes?: ClipProbeDuration[];
}): { durations: Record<string, unknown>; changed: boolean } {
  const durationByUrl = new Map<string, number>();
  probes.forEach((item) => {
    const url = String(item?.url || '').trim();
    const duration = roundSeconds(clampNumber(item?.duration, 0.1, 24 * 60 * 60, 0));
    if (url && duration > 0) durationByUrl.set(url, duration);
  });

  const durations: Record<string, unknown> = { ...currentDurations };
  let changed = false;
  visuals.forEach((item) => {
    if (item.kind !== 'video' || !item.id || !item.url) return;
    const probedDuration = durationByUrl.get(item.url);
    if (!probedDuration) return;
    const existing = Number(durations[item.id]);
    if (Number.isFinite(existing) && existing > 0) return;
    durations[item.id] = probedDuration;
    changed = true;
  });

  return { durations, changed };
}

export function deriveClipTimelineTracks({
  visuals = [],
  audioCount = 0,
  textCount = 0,
  coverUrl = '',
  trackHeights = {},
}: {
  visuals?: ClipTimelineVisualMaterial[];
  audioCount?: number;
  textCount?: number;
  coverUrl?: string;
  trackHeights?: ClipTrackHeights;
}): ClipTimelineTrackRow[] {
  const hasImage = visuals.some((item) => item.kind === 'image');
  const hasVideo = visuals.some((item) => item.kind === 'video');
  const tracks: ClipTimelineTrackRow[] = [];

  if (hasImage || hasVideo) {
    tracks.push({
      id: 'visual',
      label: hasImage && hasVideo ? '画面轨' : hasVideo ? '视频轨' : '图片轨',
      height: Math.round(clampNumber(trackHeights.visual, 56, 180, 72)),
    });
  }
  if (coverUrl || hasImage || hasVideo) tracks.push({ id: 'cover', label: '封面', height: Math.round(clampNumber(trackHeights.cover, 36, 120, 44)) });
  if (audioCount > 0) tracks.push({ id: 'audio', label: '音频轨', height: Math.round(clampNumber(trackHeights.audio, 36, 140, 44)) });
  if (textCount > 0) tracks.push({ id: 'text', label: '文本轨', height: Math.round(clampNumber(trackHeights.text, 36, 140, 44)) });

  return tracks;
}

export function sanitizeClipStudioLayout(value: Partial<ClipStudioLayout> = {}): ClipStudioLayout {
  return {
    leftWidth: Math.round(clampNumber(value.leftWidth, 300, 620, 470)),
    rightWidth: Math.round(clampNumber(value.rightWidth, 300, 620, 470)),
    topHeight: Math.round(clampNumber(value.topHeight, 320, 720, 440)),
  };
}

export function removeClipTimelineVisual(
  visuals: ClipTimelineVisualMaterial[],
  visualId: string,
): ClipTimelineVisualMaterial[] {
  return visuals.filter((item) => item.id !== visualId);
}

export function reorderClipTimelineVisual(
  visuals: ClipTimelineVisualMaterial[],
  draggedId: string,
  targetId: string,
): ClipTimelineVisualMaterial[] {
  if (!draggedId || !targetId || draggedId === targetId) return visuals;
  const draggedIndex = visuals.findIndex((item) => item.id === draggedId);
  const targetIndex = visuals.findIndex((item) => item.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return visuals;
  const next = visuals.slice();
  const [dragged] = next.splice(draggedIndex, 1);
  const insertIndex = next.findIndex((item) => item.id === targetId);
  next.splice(insertIndex < 0 ? next.length : insertIndex, 0, dragged);
  return next;
}

export function reorderClipTimelineVisualByDropX(
  visuals: ClipTimelineVisualMaterial[],
  draggedId: string,
  dropX: number,
  options: ClipTimelineLayoutOptions = {},
): ClipTimelineVisualMaterial[] {
  if (!draggedId || visuals.length <= 1) return visuals;
  const draggedIndex = visuals.findIndex((item) => item.id === draggedId);
  if (draggedIndex < 0) return visuals;
  const layout = computeClipTimelineLayout(visuals, options);
  const targetIndex = layout.items.findIndex((item) => dropX < item.left + item.width / 2);
  const withoutDragged = visuals.slice();
  const [dragged] = withoutDragged.splice(draggedIndex, 1);
  const rawInsertIndex = targetIndex < 0 ? visuals.length : targetIndex;
  const insertIndex = Math.max(0, Math.min(withoutDragged.length, rawInsertIndex > draggedIndex ? rawInsertIndex - 1 : rawInsertIndex));
  withoutDragged.splice(insertIndex, 0, dragged);
  return withoutDragged;
}

export function compactClipTimelineVisuals(
  visuals: ClipTimelineVisualMaterial[],
): ClipTimelineVisualMaterial[] {
  return visuals.map((item) => {
    if (item.start == null) return item;
    const next = { ...item };
    delete next.start;
    return next;
  });
}

export function createQuickClipTemplatePatch({
  templateId,
  visuals = [],
  texts = [],
  existingFilters = {},
  existingTextEdits = [],
}: {
  templateId: QuickClipTemplateId | string;
  visuals?: ClipTimelineVisualMaterial[];
  texts?: ClipMaterial[];
  existingFilters?: Record<string, any>;
  existingTextEdits?: ClipMaterial[];
}): QuickClipTemplatePatch {
  const template = QUICK_CLIP_TEMPLATES.find((item) => item.id === templateId) || QUICK_CLIP_TEMPLATES[0];
  const clipVisualFilters: QuickClipTemplatePatch['clipVisualFilters'] = { ...existingFilters };
  visuals.forEach((item, index) => {
    const id = item.id || `${item.kind}-${index}`;
    if (!id) return;
    const current = existingFilters[id] && typeof existingFilters[id] === 'object' ? existingFilters[id] : {};
    clipVisualFilters[id] = {
      filter: template.filter,
      intensity: template.intensity,
      speed: cleanClipSpeed(current.speed ?? item.speed ?? 1),
      fadeIn: template.fadeIn,
      fadeOut: template.fadeOut,
      transition: index < visuals.length - 1 ? template.transition : 'none',
      transitionDuration: template.transitionDuration,
      fit: template.fit,
    };
  });

  const patch: QuickClipTemplatePatch = {
    clipRatio: template.ratio,
    clipResolution: template.resolution,
    clipFps: template.fps,
    clipVisualFilters,
  };

  if (texts.length > 0) {
    const editById = new Map(existingTextEdits.map((item) => [item.id || item.text || '', item]));
    patch.clipTextEdits = texts.map((item, index) => {
      const id = item.id || item.text || `text-${index}`;
      return {
        ...item,
        ...editById.get(id),
        id,
        fontSize: template.textStyle.fontSize,
        color: template.textStyle.color,
        x: template.textStyle.x,
        y: template.textStyle.y,
      };
    });
  }

  return patch;
}

export function createQuickClipCleanupPatch({
  duration,
  audios = [],
  texts = [],
}: {
  duration: number;
  audios?: ClipMaterial[];
  texts?: ClipMaterial[];
}): QuickClipCleanupPatch {
  const total = roundSeconds(clampNumber(duration, 0.25, 24 * 60 * 60, 3));
  const patch: QuickClipCleanupPatch = {};

  if (audios.length > 0) {
    patch.clipAudioEdits = audios.map((item, index) => {
      const id = item.id || item.url || `audio-${index}`;
      const rawDuration = clipDuration(item, total);
      const nextDuration = roundSeconds(Math.min(rawDuration, total));
      const fadeLimit = Math.max(0, nextDuration / 2);
      const defaultFadeIn = Math.min(0.4, nextDuration * 0.2, fadeLimit);
      const defaultFadeOut = Math.min(0.6, nextDuration * 0.2, fadeLimit);
      return {
        ...item,
        id,
        start: 0,
        duration: nextDuration,
        volume: clampNumber(item.volume, 0, 4, 1),
        fadeIn: roundSeconds(clampNumber(item.fadeIn, 0, fadeLimit, defaultFadeIn)),
        fadeOut: roundSeconds(clampNumber(item.fadeOut, 0, fadeLimit, defaultFadeOut)),
      };
    });
  }

  if (texts.length > 0) {
    const slice = roundSeconds(total / texts.length);
    patch.clipTextEdits = texts.map((item, index) => {
      const id = item.id || item.text || `text-${index}`;
      const start = roundSeconds(index * slice);
      const isLast = index === texts.length - 1;
      const itemDuration = isLast ? roundSeconds(total - start) : slice;
      return {
        ...item,
        id,
        start,
        duration: Math.max(0.25, itemDuration),
        x: clipPercent(item.x, 50),
        y: clipPercent(item.y, 88),
        color: cleanHexColor(item.color, '#ffffff'),
        fontSize: Math.round(clampNumber(item.fontSize, 8, 240, 42)),
      };
    });
  }

  return patch;
}

export function inspectClipProjectBeforeExport({
  visuals = [],
  audios = [],
  texts = [],
  duration,
  coverUrl = '',
}: {
  visuals?: ClipTimelineVisualMaterial[];
  audios?: ClipMaterial[];
  texts?: ClipMaterial[];
  duration?: number;
  coverUrl?: string;
}): ClipExportInspectionReport {
  const total = roundSeconds(clampNumber(duration, 0, 24 * 60 * 60, 0));
  const items: ClipExportInspectionItem[] = [];
  const activeVisuals = visuals.filter((item) => !item.disabled);
  const layout = computeClipTimelineLayout(activeVisuals, { fallbackDuration: 3, gapPixels: 0, minClipWidth: 1, pixelsPerSecond: 100 });

  for (let index = 1; index < layout.items.length; index += 1) {
    const previous = layout.items[index - 1];
    const current = layout.items[index];
    const gap = roundSeconds(current.start - (previous.start + previous.duration));
    if (gap > 0.04) {
      items.push({
        code: 'timeline-gap',
        severity: 'warning',
        message: `画面时间线有 ${gap}s 空白段`,
      });
      break;
    }
  }

  const unfinishedGeneration = activeVisuals.find((item) => {
    const generation = sanitizeClipGenerationState(item.generation);
    return generation && (generation.status !== 'success' || !mediaUrl(item));
  });
  if (unfinishedGeneration?.generation) {
    items.push({
      code: 'pending-generation',
      severity: 'warning',
      message: `${unfinishedGeneration.generation.nodeType === 'image' ? '图像生成' : '视频生成'}片段尚未完成，完成后才能导出`,
    });
  }

  if (!String(coverUrl || '').trim()) {
    items.push({
      code: 'missing-cover',
      severity: 'info',
      message: '尚未选择封面，导出时会自动抽当前帧',
    });
  }

  if (total > 0 && audios.some((item) => roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0) + clipDuration(item, total)) > total + 0.04)) {
    items.push({
      code: 'audio-overflow',
      severity: 'warning',
      message: '有音频超出视频时长',
    });
  }

  if (total > 0 && texts.some((item) => roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0) + clipDuration(item, 3)) > total + 0.04)) {
    items.push({
      code: 'text-overflow',
      severity: 'warning',
      message: '有字幕超出视频时长',
    });
  }

  if (texts.some((item) => clipPercent(item.x, 50) < 5 || clipPercent(item.x, 50) > 95 || clipPercent(item.y, 88) < 5 || clipPercent(item.y, 88) > 95)) {
    items.push({
      code: 'text-position',
      severity: 'warning',
      message: '有字幕靠近或超出安全区域',
    });
  }

  if (activeVisuals.some((item) => cleanClipFit(item.fit) === 'contain')) {
    items.push({
      code: 'contain-fit',
      severity: 'info',
      message: '有画面使用适应画布，可能出现黑边',
    });
  }

  return {
    status: items.some((item) => item.severity === 'warning') ? 'warning' : 'ok',
    items,
  };
}

export function splitClipTimelineVisual(
  visuals: ClipTimelineVisualMaterial[],
  visualId: string,
): ClipTimelineVisualMaterial[] {
  const out: ClipTimelineVisualMaterial[] = [];
  for (const item of visuals) {
    if (item.id !== visualId) {
      out.push(item);
      continue;
    }
    const duration = clipDuration(item, 3);
    const firstDuration = roundSeconds(duration / 2);
    const secondDuration = roundSeconds(duration - firstDuration);
    const baseId = item.id || `${item.kind}-${out.length}`;
    out.push(
      { ...item, id: `${baseId}-a`, duration: firstDuration },
      { ...item, id: `${baseId}-b`, duration: secondDuration },
    );
  }
  return out;
}

function visualStartTimes(visuals: ClipTimelineVisualMaterial[]) {
  const starts = new Map<string, number>();
  let cursor = 0;
  visuals.forEach((item, index) => {
    const id = item.id || `${item.kind}-${index}`;
    starts.set(id, roundSeconds(cursor));
    cursor = roundSeconds(cursor + clipDuration(item, 3));
  });
  return starts;
}

export function splitClipTimelineVisualAtTime(
  visuals: ClipTimelineVisualMaterial[],
  visualId: string,
  playheadTime: number,
): ClipTimelineVisualMaterial[] {
  const starts = visualStartTimes(visuals);
  const out: ClipTimelineVisualMaterial[] = [];
  for (const item of visuals) {
    if (item.id !== visualId) {
      out.push(item);
      continue;
    }
    const start = starts.get(item.id || '') || 0;
    const duration = clipDuration(item, 3);
    const splitAt = roundSeconds(clampNumber(playheadTime - start, 0, duration, duration / 2));
    if (splitAt <= 0 || splitAt >= duration) {
      out.push(item);
      continue;
    }
    const baseId = item.id || `${item.kind}-${out.length}`;
    const trimStart = clipTrimStart(item);
    out.push(
      { ...item, id: `${baseId}-left`, duration: splitAt },
      {
        ...item,
        id: `${baseId}-right`,
        duration: roundSeconds(duration - splitAt),
        trimStart: item.kind === 'video' ? roundSeconds(trimStart + splitAt) : item.trimStart,
      },
    );
  }
  return out;
}

export function trimClipTimelineVisualSide(
  visuals: ClipTimelineVisualMaterial[],
  visualId: string,
  playheadTime: number,
  side: 'left' | 'right',
): ClipTimelineVisualMaterial[] {
  const starts = visualStartTimes(visuals);
  return visuals.map((item) => {
    if (item.id !== visualId) return item;
    const start = starts.get(item.id || '') || 0;
    const duration = clipDuration(item, 3);
    const splitAt = roundSeconds(clampNumber(playheadTime - start, 0, duration, duration / 2));
    if (splitAt <= 0 || splitAt >= duration) return item;
    const baseId = item.id || item.kind;
    const nextDuration = side === 'left' ? splitAt : roundSeconds(duration - splitAt);
    const nextTrimStart = side === 'right' && item.kind === 'video'
      ? roundSeconds(clipTrimStart(item) + splitAt)
      : item.trimStart;
    return {
      ...item,
      id: side === 'left' ? `${baseId}-left` : `${baseId}-right`,
      duration: nextDuration,
      trimStart: nextTrimStart,
    };
  });
}

export function resizeClipTimelineVisualTiming({
  start,
  duration,
  deltaSeconds,
  edge,
  minDuration = 0.25,
}: {
  start: number;
  duration: number;
  deltaSeconds: number;
  edge: 'left' | 'right';
  minDuration?: number;
}): { start: number; duration: number } {
  const safeMin = roundSeconds(clampNumber(minDuration, 0.05, 60, 0.25));
  const safeStart = roundSeconds(clampNumber(start, 0, 24 * 60 * 60, 0));
  const safeDuration = roundSeconds(clampNumber(duration, safeMin, 24 * 60 * 60, 3));
  const delta = roundSeconds(clampNumber(deltaSeconds, -24 * 60 * 60, 24 * 60 * 60, 0));
  if (edge === 'right') {
    return {
      start: safeStart,
      duration: roundSeconds(Math.max(safeMin, safeDuration + delta)),
    };
  }
  const clampedDelta = clampNumber(delta, -safeStart, safeDuration - safeMin, 0);
  return {
    start: roundSeconds(safeStart + clampedDelta),
    duration: roundSeconds(safeDuration - clampedDelta),
  };
}

export function resolveClipTimelineInsertTiming(
  visuals: ClipTimelineVisualMaterial[],
  options: ClipTimelineInsertTimingOptions = {},
): ClipTimelineInsertTiming {
  const duration = roundSeconds(clampNumber(options.duration, 0.1, 24 * 60 * 60, 3));
  const start = roundSeconds(clampNumber(
    options.requestedStart,
    0,
    24 * 60 * 60,
    clampNumber(options.fallbackStart, 0, 24 * 60 * 60, 0),
  ));
  const requestedLane = Math.max(0, Math.round(clampNumber(options.lane, 0, 99, 0)));
  if (!options.avoidOverlap) return { start, lane: requestedLane };

  const overlapsLane = (lane: number) => visuals.some((item) => {
    if (item.disabled) return false;
    const itemLane = Math.max(0, Math.round(Number(item.lane || 0)));
    if (itemLane !== lane) return false;
    const itemStart = roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0));
    const itemDuration = roundSeconds(clampNumber(item.duration, 0.1, 24 * 60 * 60, 3));
    const itemEnd = itemStart + itemDuration;
    const nextEnd = start + duration;
    return start < itemEnd && nextEnd > itemStart;
  });

  for (let lane = requestedLane; lane < requestedLane + 24; lane += 1) {
    if (!overlapsLane(lane)) return { start, lane };
  }
  return { start, lane: requestedLane };
}

export function updateClipTimelineMaterialTiming(
  items: ClipMaterial[],
  clipId: string,
  patch: { start?: number; duration?: number },
): ClipMaterial[] {
  if (!clipId) return items;
  return items.map((item, index) => {
    const id = item.id || item.url || item.text || `clip-${index}`;
    if (id !== clipId) return item;
    const next: ClipMaterial = { ...item };
    if (patch.start != null) {
      next.start = roundSeconds(clampNumber(patch.start, 0, 24 * 60 * 60, item.start || 0));
    }
    if (patch.duration != null) {
      next.duration = roundSeconds(clampNumber(patch.duration, 0.25, 24 * 60 * 60, item.duration || 3));
    }
    return next;
  });
}

export function removeClipTimelineMaterial(
  items: ClipMaterial[],
  clipId: string,
): ClipMaterial[] {
  if (!clipId) return items;
  return items.filter((item, index) => (item.id || item.url || item.text || `clip-${index}`) !== clipId);
}

export function duplicateClipTimelineMaterial(
  items: ClipMaterial[],
  clipId: string,
): ClipMaterial[] {
  if (!clipId) return items;
  const existing = new Set(items.map((item, index) => item.id || item.url || item.text || `clip-${index}`));
  const out: ClipMaterial[] = [];
  items.forEach((item, index) => {
    const id = item.id || item.url || item.text || `clip-${index}`;
    out.push(item);
    if (id !== clipId) return;
    let suffix = 1;
    let nextId = `${id}-copy-${suffix}`;
    while (existing.has(nextId)) {
      suffix += 1;
      nextId = `${id}-copy-${suffix}`;
    }
    existing.add(nextId);
    const duration = clipDuration(item, 3);
    const start = roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0) + duration);
    out.push({ ...item, id: nextId, start, duration });
  });
  return out;
}

export function splitClipTimelineMaterialAtTime(
  items: ClipMaterial[],
  clipId: string,
  playheadTime: number,
): ClipMaterial[] {
  if (!clipId) return items;
  const safeTime = roundSeconds(clampNumber(playheadTime, 0, 24 * 60 * 60, 0));
  const out: ClipMaterial[] = [];
  items.forEach((item, index) => {
    const id = item.id || item.url || item.text || `clip-${index}`;
    const start = roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0));
    const duration = clipDuration(item, 3);
    const end = roundSeconds(start + duration);
    if (id !== clipId || safeTime <= start + 0.25 || safeTime >= end - 0.25) {
      out.push(item);
      return;
    }
    const leftDuration = roundSeconds(safeTime - start);
    const rightDuration = roundSeconds(end - safeTime);
    out.push(
      { ...item, id: `${id}-left`, start, duration: leftDuration },
      { ...item, id: `${id}-right`, start: safeTime, duration: rightDuration },
    );
  });
  return out;
}

function splitClipTimelineMaterialsCrossingTime(
  items: ClipMaterial[],
  playheadTime: number,
): ClipMaterial[] {
  const safeTime = roundSeconds(clampNumber(playheadTime, 0, 24 * 60 * 60, 0));
  const out: ClipMaterial[] = [];
  items.forEach((item, index) => {
    const id = item.id || item.url || item.text || `clip-${index}`;
    const start = roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0));
    const duration = clipDuration(item, 3);
    const end = roundSeconds(start + duration);
    if (safeTime <= start + 0.25 || safeTime >= end - 0.25) {
      out.push(item);
      return;
    }
    const leftDuration = roundSeconds(safeTime - start);
    const rightDuration = roundSeconds(end - safeTime);
    const trimStart = clipTrimStart(item);
    out.push(
      { ...item, id: `${id}-left`, start, duration: leftDuration },
      {
        ...item,
        id: `${id}-right`,
        start: safeTime,
        duration: rightDuration,
        trimStart: item.url ? roundSeconds(trimStart + leftDuration) : item.trimStart,
      },
    );
  });
  return out;
}

export function splitLinkedClipTimelineAtTime({
  visuals,
  audios = [],
  texts = [],
  visualId,
  playheadTime,
}: {
  visuals: ClipTimelineVisualMaterial[];
  audios?: ClipMaterial[];
  texts?: ClipMaterial[];
  visualId: string;
  playheadTime: number;
}): ClipDraftTimeline {
  return {
    visuals: splitClipTimelineVisualAtTime(visuals, visualId, playheadTime),
    audios: splitClipTimelineMaterialsCrossingTime(audios, playheadTime),
    texts: splitClipTimelineMaterialsCrossingTime(texts, playheadTime),
  };
}

export function stepClipPlayheadByFrames(
  currentTime: number,
  frameDelta: number,
  fps: number,
  duration: number,
): number {
  const safeFps = Math.round(clampNumber(fps, 1, 120, 30));
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const next = Number(currentTime || 0) + Number(frameDelta || 0) / safeFps;
  return roundSeconds(clampNumber(next, 0, safeDuration, 0));
}

export function fitClipTimelineZoom({
  duration,
  viewportWidth,
}: {
  duration: number;
  viewportWidth: number;
}): number {
  const safeDuration = positiveNumberOr(duration, 0.1, 24 * 60 * 60, 1);
  const safeWidth = positiveNumberOr(viewportWidth, 120, 100000, 720);
  const targetPixelsPerSecond = safeWidth / safeDuration;
  return Math.round(clampNumber((targetPixelsPerSecond - 16) / 0.9, 10, 100, 38));
}

export function previewClipTimelineDragTiming({
  mode,
  clipStart,
  clipDuration,
  deltaSeconds,
  rawStart,
  snap = false,
  snapTargets = [],
  snapThresholdSeconds = 0.12,
}: {
  mode: 'move' | 'trim-left' | 'trim-right';
  clipStart: number;
  clipDuration: number;
  deltaSeconds: number;
  rawStart: number;
  snap?: boolean;
  snapTargets?: ClipSnapTarget[];
  snapThresholdSeconds?: number;
}): ClipTimelineDragTimingPreview {
  const roundDrag = (value: number) => snap ? Math.round(value * 10) / 10 : roundSeconds(value);
  const duration = roundSeconds(clipDuration);
  const threshold = Math.max(0, Number(snapThresholdSeconds || 0));
  const findSnap = (edges: Array<{ time: number; offset: number }>) => {
    if (!snap || snapTargets.length === 0 || threshold <= 0) return undefined;
    let best: { target: ClipSnapTarget; offset: number; distance: number } | undefined;
    for (const edge of edges) {
      for (const target of snapTargets) {
        const targetTime = roundSeconds(clampNumber(target.time, 0, 24 * 60 * 60, 0));
        const distance = Math.abs(edge.time - targetTime);
        if (distance > threshold) continue;
        if (!best || distance < best.distance) {
          best = {
            target: { ...target, time: targetTime },
            offset: edge.offset,
            distance,
          };
        }
      }
    }
    return best;
  };
  if (mode === 'move') {
    const baseStart = roundSeconds(Math.max(0, roundDrag(rawStart)));
    const snapResult = findSnap([
      { time: baseStart, offset: 0 },
      { time: roundSeconds(baseStart + duration), offset: duration },
    ]);
    const start = snapResult
      ? roundSeconds(Math.max(0, snapResult.target.time - snapResult.offset))
      : baseStart;
    return {
      start,
      duration,
      trimStartDelta: 0,
      ...(snapResult ? { snapTarget: snapResult.target } : {}),
      ...(snapResult ? { snapEdgeTime: snapResult.target.time } : {}),
    };
  }
  const next = resizeClipTimelineVisualTiming({
    start: clipStart,
    duration,
    deltaSeconds: roundDrag(deltaSeconds),
    edge: mode === 'trim-left' ? 'left' : 'right',
  });
  const edgeTime = mode === 'trim-left' ? next.start : roundSeconds(next.start + next.duration);
  const snapResult = findSnap([{ time: edgeTime, offset: mode === 'trim-left' ? 0 : duration }]);
  const snapped = snapResult
    ? resizeClipTimelineVisualTiming({
      start: clipStart,
      duration,
      deltaSeconds: mode === 'trim-left'
        ? roundSeconds(snapResult.target.time - clipStart)
        : roundSeconds(snapResult.target.time - (clipStart + duration)),
      edge: mode === 'trim-left' ? 'left' : 'right',
    })
    : next;
  return {
    ...snapped,
    trimStartDelta: mode === 'trim-left' ? roundSeconds(Math.max(0, snapped.start - clipStart)) : 0,
    ...(snapResult ? { snapTarget: snapResult.target } : {}),
    ...(snapResult ? { snapEdgeTime: snapResult.target.time } : {}),
  };
}

export function duplicateClipTimelineVisual(
  visuals: ClipTimelineVisualMaterial[],
  visualId: string,
  patch: Partial<ClipTimelineVisualMaterial> = {},
): ClipTimelineVisualMaterial[] {
  const out: ClipTimelineVisualMaterial[] = [];
  const existing = new Set(visuals.map((item) => item.id).filter(Boolean));
  for (const item of visuals) {
    out.push(item);
    if (item.id !== visualId) continue;
    let suffix = 1;
    let id = `${visualId}-copy-${suffix}`;
    while (existing.has(id)) {
      suffix += 1;
      id = `${visualId}-copy-${suffix}`;
    }
    existing.add(id);
    const duration = clipDuration(item, 3);
    out.push({ ...item, id, start: roundSeconds(Number(item.start || 0) + duration), ...patch });
  }
  return out;
}

export function computeClipTimelineLayout(
  visuals: ClipTimelineVisualMaterial[],
  options: ClipTimelineLayoutOptions = {},
): ClipTimelineLayout {
  const fallbackDuration = positiveNumberOr(options.fallbackDuration, 0.1, 60, 3);
  const pixelsPerSecond = positiveNumberOr(options.pixelsPerSecond, 1, 1000, 40);
  const gapPixels = clampNumber(options.gapPixels, 0, 200, 0);
  const minClipWidth = clampNumber(options.minClipWidth, 0, 1000, 0);
  const items: ClipTimelineLayoutItem[] = [];
  let cursor = 0;
  let left = 0;
  let maxRight = 0;

  visuals.forEach((item) => {
    const duration = clipDuration(item, fallbackDuration);
    const explicitStart = Number(item.start);
    const hasExplicitStart = Number.isFinite(explicitStart) && explicitStart >= 0;
    const start = hasExplicitStart ? roundSeconds(explicitStart) : roundSeconds(cursor);
    const width = Math.max(minClipWidth, roundSeconds(duration * pixelsPerSecond));
    const itemLeft = hasExplicitStart ? roundSeconds(start * pixelsPerSecond) : roundSeconds(left);
    items.push({
      ...item,
      start,
      duration,
      left: itemLeft,
      width,
    });
    cursor = roundSeconds(start + duration);
    left = roundSeconds(itemLeft + width + gapPixels);
    maxRight = Math.max(maxRight, roundSeconds(itemLeft + width));
  });

  return {
    items,
    duration: roundSeconds(items.reduce((max, item) => Math.max(max, item.start + item.duration), 0)),
    width: items.length > 0 ? roundSeconds(maxRight) : 0,
  };
}

export function resolveClipTimelinePlayback(
  visuals: ClipTimelineVisualMaterial[],
  playheadTime: number,
  options: ClipTimelineLayoutOptions = {},
): ClipTimelinePlaybackState | null {
  const layout = computeClipTimelineLayout(visuals.filter((item) => !item.disabled), options);
  if (layout.items.length === 0) return null;
  const safeTime = roundSeconds(clampNumber(playheadTime, 0, layout.duration, 0));
  const ordered = layout.items.slice().sort((a, b) => a.start - b.start);
  const item = ordered.find((clip) => safeTime >= clip.start && safeTime <= roundSeconds(clip.start + clip.duration));
  if (!item) return null;
  return {
    item,
    start: item.start,
    duration: item.duration,
    localTime: roundSeconds(clampNumber(safeTime - item.start, 0, item.duration, 0)),
  };
}

export function computeClipFrameThumbnails(
  item: Pick<ClipTimelineLayoutItem, 'kind' | 'url' | 'start' | 'duration' | 'width'>,
  options: ClipFrameThumbnailOptions = {},
): ClipFrameThumbnail[] {
  const frameWidth = positiveNumberOr(options.frameWidth, 16, 240, 42);
  const maxFrames = Math.round(positiveNumberOr(options.maxFrames, 1, 500, 160));
  const duration = positiveNumberOr(item.duration, 0.1, 24 * 60 * 60, 3);
  const width = positiveNumberOr(item.width, frameWidth, 100000, frameWidth);
  const count = Math.max(1, Math.min(maxFrames, Math.ceil(width / frameWidth)));
  const slotWidth = roundSeconds(width / count);
  return Array.from({ length: count }, (_, index) => {
    const progress = index / count;
    return {
      index,
      left: roundSeconds(index * slotWidth),
      width: index === count - 1 ? roundSeconds(width - slotWidth * index) : slotWidth,
      time: roundSeconds(Number(item.start || 0) + duration * progress),
      sourceUrl: String(item.url || ''),
      kind: item.kind,
    };
  });
}

export function computeClipTimelineRulerTicks({
  duration,
  fps,
  pixelsPerSecond,
}: {
  duration: number;
  fps: number;
  pixelsPerSecond: number;
}): ClipTimelineRulerTick[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeFps = Math.round(clampNumber(fps, 1, 120, 30));
  const safePps = positiveNumberOr(pixelsPerSecond, 1, 1000, 40);
  const framePixelWidth = safePps / safeFps;
  const framesPerTick = Math.max(1, Math.round(safeFps / 4), Math.ceil(14 / framePixelWidth));
  const ticks: ClipTimelineRulerTick[] = [];
  const maxSecond = Math.ceil(safeDuration);

  for (let second = 0; second <= maxSecond; second += 1) {
    const minutes = Math.floor(second / 60);
    const seconds = second % 60;
    ticks.push({
      kind: 'major',
      time: second,
      left: roundSeconds(second * safePps),
      label: `${minutes}:${String(seconds).padStart(2, '0')}`,
    });
  }

  const totalFrames = Math.floor(safeDuration * safeFps);
  for (let frame = framesPerTick; frame <= totalFrames; frame += framesPerTick) {
    if (frame % safeFps === 0) continue;
    const time = roundSeconds(frame / safeFps);
    ticks.push({
      kind: 'frame',
      time,
      left: roundSeconds(time * safePps),
      label: `${String(frame % safeFps).padStart(2, '0')}f`,
    });
  }

  return ticks.sort((a, b) => a.left - b.left || (a.kind === 'major' ? -1 : 1));
}

export function clampClipPlayheadTime(
  pixelX: number,
  pixelsPerSecond: number,
  duration: number,
): number {
  const pps = positiveNumberOr(pixelsPerSecond, 1, 1000, 40);
  const total = Math.max(0, Number.isFinite(duration) ? Number(duration) : 0);
  return roundSeconds(clampNumber(Number(pixelX) / pps, 0, total, 0));
}

export function clipProjectDuration(project: Pick<ClipProject, 'tracks'>): number {
  let max = 0;
  for (const track of project.tracks || []) {
    for (const clip of track.clips || []) {
      max = Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0));
    }
  }
  return roundSeconds(max);
}

export function buildClipDraftFromMaterials(
  materials: ClipDraftMaterials,
  settings: ClipExportSettings = {},
): ClipProject {
  const safe = sanitizeClipExportSettings(settings);
  const visualClips: ClipItem[] = [];
  let cursor = 0;

  const addVisual = (kind: 'image' | 'video', item: ClipMaterial, index: number) => {
    const sourceUrl = mediaUrl(item);
    if (!sourceUrl) return;
    const duration = kind === 'image'
      ? safe.imageDuration
      : clipDuration(item, safe.imageDuration);
    visualClips.push({
      id: `${kind}-${index}-${visualClips.length}`,
      kind,
      sourceUrl,
      label: item.label,
      start: roundSeconds(cursor),
      duration,
      fit: 'contain',
    });
    cursor = roundSeconds(cursor + duration);
  };

  (materials.images || []).forEach((item, index) => addVisual('image', item, index));
  (materials.videos || []).forEach((item, index) => addVisual('video', item, index));

  const totalDuration = Math.max(clipProjectDuration({ tracks: [{ id: 'visual', kind: 'visual', clips: visualClips }] }), safe.imageDuration);
  const tracks: ClipTrack[] = [
    { id: 'visual', kind: 'visual', clips: visualClips },
  ];

  const audioItems = (materials.audios || []).filter((item) => mediaUrl(item));
  if (audioItems.length > 0) {
    tracks.push({
      id: 'audio',
      kind: 'audio',
      clips: audioItems.map((item, index) => ({
        id: item.id || `audio-${index}`,
        kind: 'audio',
        sourceUrl: mediaUrl(item),
        label: item.label,
        start: roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0)),
        duration: clipDuration(item, totalDuration),
        trimStart: clipTrimStart(item) || undefined,
        volume: clampNumber(item.volume, 0, 4, 1),
        fadeIn: clampNumber(item.fadeIn, 0, 60, 0),
        fadeOut: clampNumber(item.fadeOut, 0, 60, 0),
      })),
    });
  }

  const textItems = (materials.texts || []).filter((item) => textValue(item));
  if (textItems.length > 0) {
    const slice = roundSeconds(totalDuration / textItems.length);
    tracks.push({
      id: 'text',
      kind: 'text',
      clips: textItems.map((item, index) => ({
        id: item.id || `text-${index}`,
        kind: 'text',
        text: textValue(item),
        label: item.label,
        start: roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, index * slice)),
        duration: item.duration != null
          ? clipDuration(item, slice)
          : index === textItems.length - 1
          ? roundSeconds(totalDuration - index * slice)
          : slice,
        fontSize: clampNumber(item.fontSize, 8, 240, 42),
        color: cleanHexColor(item.color, '#ffffff'),
        x: clipPercent(item.x, 50),
        y: clipPercent(item.y, 88),
      })),
    });
  }

  return {
    version: 1,
    width: safe.width,
    height: safe.height,
    fps: safe.fps,
    background: safe.background,
    tracks,
  };
}

export function buildClipDraftFromTimeline(
  materials: ClipDraftTimeline,
  settings: ClipExportSettings = {},
  options: ClipDraftTimelineOptions = {},
): ClipProject {
  const safe = sanitizeClipExportSettings(settings);
  const visualClips: ClipItem[] = [];
  let cursor = 0;

  (materials.visuals || []).forEach((item, index) => {
    if (item.disabled) return;
    const sourceUrl = mediaUrl(item);
    if (!sourceUrl) return;
    const duration = clipDuration(item, safe.imageDuration);
    const explicitStart = Number(item.start);
    const start = Number.isFinite(explicitStart) && explicitStart >= 0 ? roundSeconds(explicitStart) : roundSeconds(cursor);
    const transform = cleanClipTransform(
      (item.id && options.visualTransforms?.[item.id]) || item.transform,
    );
    const keyframes = resolveClipVisualKeyframes(
      (item.id && options.visualKeyframes?.[item.id]) || item.keyframes,
      duration,
    );
    visualClips.push({
      id: item.id || `${item.kind}-${index}-${visualClips.length}`,
      kind: item.kind,
      sourceUrl,
      label: item.label,
      start,
      duration,
      trimStart: item.kind === 'video' ? clipTrimStart(item) : undefined,
      fit: cleanClipFit(item.fit),
      filter: cleanClipFilter(item.filter),
      intensity: clipFilterIntensity(item.intensity, 65),
      lutPresetId: cleanClipLutId(item.lutPresetId),
      lutName: cleanClipLutName(item.lutName),
      lutText: cleanClipLutText(item.lutText),
      lutAmount: cleanClipLutAmount(item.lutAmount),
      speed: cleanClipSpeed(item.speed),
      fadeIn: clampNumber(item.fadeIn, 0, duration / 2, 0),
      fadeOut: clampNumber(item.fadeOut, 0, duration / 2, 0),
      transition: cleanClipTransition(item.transition),
      transitionDuration: roundSeconds(clampNumber(item.transitionDuration, 0.1, Math.min(5, duration / 2), 0.5)),
      blendMode: cleanClipBlendMode(item.blendMode),
      transform,
      keyframes: keyframes.length > 0 ? keyframes : undefined,
    });
    cursor = roundSeconds(start + duration);
  });

  const totalDuration = Math.max(clipProjectDuration({ tracks: [{ id: 'visual', kind: 'visual', clips: visualClips }] }), safe.imageDuration);
  const tracks: ClipTrack[] = [
    { id: 'visual', kind: 'visual', clips: visualClips },
  ];

  const audioItems = (materials.audios || []).filter((item) => mediaUrl(item));
  if (audioItems.length > 0) {
    tracks.push({
      id: 'audio',
      kind: 'audio',
      clips: audioItems.map((item, index) => ({
        id: item.id || `audio-${index}`,
        kind: 'audio',
        sourceUrl: mediaUrl(item),
        label: item.label,
        start: roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, 0)),
        duration: clipDuration(item, totalDuration),
        trimStart: clipTrimStart(item) || undefined,
        volume: clampNumber(item.volume, 0, 4, 1),
        fadeIn: clampNumber(item.fadeIn, 0, 60, 0),
        fadeOut: clampNumber(item.fadeOut, 0, 60, 0),
      })),
    });
  }

  const textItems = (materials.texts || []).filter((item) => textValue(item));
  if (textItems.length > 0) {
    const slice = roundSeconds(totalDuration / textItems.length);
    tracks.push({
      id: 'text',
      kind: 'text',
      clips: textItems.map((item, index) => ({
        id: item.id || `text-${index}`,
        kind: 'text',
        text: textValue(item),
        label: item.label,
        start: roundSeconds(clampNumber(item.start, 0, 24 * 60 * 60, index * slice)),
        duration: item.duration != null
          ? clipDuration(item, slice)
          : index === textItems.length - 1
          ? roundSeconds(totalDuration - index * slice)
          : slice,
        fontSize: clampNumber(item.fontSize, 8, 240, 42),
        color: cleanHexColor(item.color, '#ffffff'),
        x: clipPercent(item.x, 50),
        y: clipPercent(item.y, 88),
      })),
    });
  }

  return {
    version: 1,
    width: safe.width,
    height: safe.height,
    fps: safe.fps,
    background: safe.background,
    tracks,
  };
}
