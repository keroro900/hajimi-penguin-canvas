import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodes, type NodeProps } from '@xyflow/react';
import { AlertCircle, Download, Film, Loader2, Maximize2, Play, Scissors, Settings2, Save } from 'lucide-react';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { probeClipMedia, renderClipProject, uploadClipAsset } from '../../services/clip';
import {
  applyClipTimelineEdits,
  buildClipDraftFromTimeline,
  compactClipTimelineVisuals,
  createClipGenerationVisual,
  createQuickClipCleanupPatch,
  createQuickClipTemplatePatch,
  CLIP_FILTER_PRESET_IDS,
  CLIP_MAX_VISUAL_LANE,
  CLIP_TRANSITION_IDS,
  CLIP_RATIO_PRESETS,
  CLIP_RESOLUTION_PRESETS,
  type ClipFilterPreset,
  type ClipFit,
  type ClipTransitionPreset,
  clipProjectDuration,
  duplicateClipTimelineMaterial,
  duplicateClipTimelineVisual,
  reconcileProbedClipAudioDurations,
  reconcileClipVisualSourceDurations,
  reorderClipTimelineVisual,
  removeClipTimelineMaterial,
  removeClipTimelineVisual,
  reorderClipTimelineVisualByDropX,
  resolveClipSpeedDuration,
  resolveClipTimelineInsertTiming,
  resolveClipRatioPreset,
  sanitizeClipGenerationState,
  sanitizeClipStudioLayout,
  sanitizeClipExportSettings,
  splitClipTimelineMaterialAtTime,
  splitLinkedClipTimelineAtTime,
  splitClipTimelineVisualAtTime,
  splitClipTimelineVisual,
  trimClipTimelineVisualSide,
  updateClipTimelineMaterialTiming,
  type ClipMaterial,
  type ClipGenerationNodeType,
  type ClipGenerationRef,
  type ClipGenerationState,
  type ClipTimelineInsertTiming,
  type ClipTimelineVisualMaterial,
  type ClipProbeDuration,
  type ClipVisualSourceMetadata,
  type ClipVisualKeyframe,
  type QuickClipTemplateId,
} from '../../utils/clipProject';
import { fileNameFromUrl } from '../../utils/mediaCollection';
import {
  generateImage,
  queryImageFal,
  querySeedance,
  queryVideo,
  queryVideoFal,
  submitImageFal,
  submitSeedance,
  submitVideo,
  submitVideoFal,
} from '../../services/generation';
import {
  buildClipImageGenerationRequest,
  buildClipVideoGenerationRequest,
  clipGenerationReferenceSupport,
  clipGenerationRefLimitForKind,
  clipGenerationRefsForRequest,
  defaultClipGenerationParams,
  resolveClipGenerationChoice,
  resolveClipImageGenerationChoice,
  resolveClipVideoGenerationChoice,
} from '../../utils/clipGenerationAdapters';
import { useHasAutoOutput } from './useHasAutoOutput';
import { useUpdateNodeData } from './useUpdateNodeData';
import { collectMentionableMediaFromNodeData, useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import ClipStudioEditor, { type ClipVisualTransform } from './ClipStudioEditor';
import { addResourceItem, getResourceItems, type ResourceItem } from '../../services/api';
import { useMaterialDropTarget } from '../../hooks/useMaterialDropTarget';
import type { MaterialPayload } from '../../stores/dragMaterial';
import { useApiKeysStore } from '../../stores/apiKeys';
import { modelsForKind } from '../../providers/modelCatalog';

const COLOR = '#fb923c';
type ClipRatioMode = 'auto' | 'manual';
type ClipGenerationInsertDraft = Partial<ClipTimelineInsertTiming> & {
  prompt?: string;
  params?: Record<string, unknown>;
  refs?: ClipGenerationRef[];
};

function toNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeClipSpeed(value: unknown) {
  const speed = Number(value ?? 1);
  return Number.isFinite(speed) ? Math.max(0.25, Math.min(4, Math.round(speed * 100) / 100)) : 1;
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.round(value * 10) / 10}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeVisualSourceUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function visualSourceSignature(url: string, duration: number) {
  return `${normalizeVisualSourceUrl(url)}\u0000${Math.round(duration * 1000)}`;
}

function serializeClipLocalVisuals(visuals: ClipTimelineVisualMaterial[]) {
  return visuals.map((visual) => {
    const { sourceInvalid: _sourceInvalid, ...persisted } = visual;
    return persisted;
  });
}

function clipUpstreamMaterialFingerprint(upstream: {
  images: unknown[];
  videos: unknown[];
  audios: unknown[];
  texts: unknown[];
}) {
  const fields = ['id', 'url', 'text', 'duration', 'sourceNodeId', 'width', 'height', 'aspectRatio', 'start', 'trimStart', 'trimEnd', 'speed', 'volume', 'fadeIn', 'fadeOut'] as const;
  const materialFingerprint = (item: unknown) => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return fields.map((field) => source[field] ?? null);
  };
  return JSON.stringify([
    upstream.images.map(materialFingerprint),
    upstream.videos.map(materialFingerprint),
    upstream.audios.map(materialFingerprint),
    upstream.texts.map(materialFingerprint),
  ]);
}

function objectList(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function clipMaterialList(value: unknown): ClipMaterial[] {
  return objectList(value).map((item, index) => ({
    id: typeof item.id === 'string' ? item.id : `clip-material-${index}`,
    url: typeof item.url === 'string' ? item.url : undefined,
    text: typeof item.text === 'string' ? item.text : undefined,
    label: typeof item.label === 'string' ? item.label : undefined,
    start: typeof item.start === 'number' ? item.start : undefined,
    duration: typeof item.duration === 'number' ? item.duration : undefined,
    trimStart: typeof item.trimStart === 'number' ? item.trimStart : undefined,
    volume: typeof item.volume === 'number' ? item.volume : undefined,
    fadeIn: typeof item.fadeIn === 'number' ? item.fadeIn : undefined,
    fadeOut: typeof item.fadeOut === 'number' ? item.fadeOut : undefined,
    fontSize: typeof item.fontSize === 'number' ? item.fontSize : undefined,
    color: typeof item.color === 'string' ? item.color : undefined,
    x: typeof item.x === 'number' ? item.x : undefined,
    y: typeof item.y === 'number' ? item.y : undefined,
    filter: typeof item.filter === 'string' ? item.filter as ClipFilterPreset : undefined,
    intensity: typeof item.intensity === 'number' ? item.intensity : undefined,
    speed: typeof item.speed === 'number' ? item.speed : undefined,
  })).filter((item) => item.url || item.text);
}

function inferClipFileKind(file: File): 'image' | 'video' | 'audio' | null {
  const type = file.type || '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) return 'image';
  if (ext && ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext)) return 'video';
  if (ext && ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
  return null;
}

function isLikelyImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|avif)(\?|#|$)/i.test(url) || /\/thumbnail(\?|$)/i.test(url);
}

function clipVisualKeyframeList(value: unknown): ClipVisualKeyframe[] {
  if (!Array.isArray(value)) return [];
  const clamp = (raw: unknown, min: number, max: number, fallback: number) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      time: Math.max(0, Math.round(Number(item.time || 0) * 1000) / 1000),
      scale: Math.round(clamp(item.scale, 10, 400, 100) * 100) / 100,
      x: Math.round(clamp(item.x, -2000, 2000, 0) * 100) / 100,
      y: Math.round(clamp(item.y, -2000, 2000, 0) * 100) / 100,
      rotation: Math.round(clamp(item.rotation, -360, 360, 0) * 100) / 100,
      opacity: Math.round(clamp(item.opacity, 0, 100, 100) * 100) / 100,
    }))
    .sort((a, b) => a.time - b.time);
}

function ratioFromMediaSize(width?: unknown, height?: unknown) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '';
  const aspect = w / h;
  const candidates = CLIP_RATIO_PRESETS
    .filter((item) => item.id !== 'adapt')
    .map((item) => ({
      id: item.id,
      distance: Math.abs((item.widthRatio / item.heightRatio) - aspect),
    }))
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.id || '16:9';
}

function materialWithSize(item: unknown) {
  const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const width = Number(source.width);
  const height = Number(source.height);
  const aspectRatio = Number(source.aspectRatio);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return { width, height };
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) return { width: aspectRatio * 1000, height: 1000 };
  return undefined;
}

function clampVisualLane(value: unknown) {
  return Math.max(0, Math.min(CLIP_MAX_VISUAL_LANE, Math.round(Number(value || 0))));
}

function visualLaneForItem(item: ClipTimelineVisualMaterial, visualLanes: Record<string, unknown>) {
  const laneValue = item.id && visualLanes[item.id] != null ? visualLanes[item.id] : item.lane;
  return clampVisualLane(laneValue);
}

function resolveVisualLanePatchForDrop(
  visuals: ClipTimelineVisualMaterial[],
  visualLanes: Record<string, unknown>,
  visualId: string,
  lane: number,
) {
  const nextVisualLanes = { ...visualLanes };
  if (lane < 0) {
    visuals.forEach((item) => {
      if (!item.id || item.id === visualId) return;
      nextVisualLanes[item.id] = clampVisualLane(visualLaneForItem(item, visualLanes) + 1);
    });
    nextVisualLanes[visualId] = 0;
    return nextVisualLanes;
  }
  nextVisualLanes[visualId] = clampVisualLane(lane);
  return nextVisualLanes;
}

function shiftVisualLanesForTopInsert(
  visuals: ClipTimelineVisualMaterial[],
  visualLanes: Record<string, unknown>,
) {
  const nextVisualLanes = { ...visualLanes };
  visuals.forEach((item) => {
    if (!item.id) return;
    nextVisualLanes[item.id] = clampVisualLane(visualLaneForItem(item, visualLanes) + 1);
  });
  return nextVisualLanes;
}

function probeLocalClipAspect(file: File, kind: 'image' | 'video' | 'audio'): Promise<{ width?: number; height?: number }> {
  if (kind === 'audio' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve({});
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    if (kind === 'image') {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        cleanup();
        resolve(width > 0 && height > 0 ? { width, height } : {});
      };
      image.onerror = () => {
        cleanup();
        resolve({});
      };
      image.src = objectUrl;
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();
      resolve(width > 0 && height > 0 ? { width, height } : {});
    };
    video.onerror = () => {
      cleanup();
      resolve({});
    };
    video.src = objectUrl;
  });
}

function cloneClipNodeSnapshot(value: Record<string, unknown>) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const CLIP_HISTORY_KEYS = [
  'clipRatio',
  'clipRatioMode',
  'clipResolution',
  'clipFps',
  'clipImageDuration',
  'clipBackground',
  'clipVisualOrder',
  'clipDisabledVisualIds',
  'clipRemovedVisualIds',
  'clipRemovedAudioIds',
  'clipRemovedTextIds',
  'clipVisualDurations',
  'clipVisualStarts',
  'clipVisualFilters',
  'clipVisualTransforms',
  'clipVisualKeyframes',
  'clipVisualLanes',
  'clipLocalVisuals',
  'clipLocalAudios',
  'clipLocalTexts',
  'clipAudioEdits',
  'clipTextEdits',
  'clipCoverUrl',
  'clipCoverTime',
  'clipCoverSource',
] as const;

function pickClipNodeHistorySnapshot(data: Record<string, unknown>) {
  return CLIP_HISTORY_KEYS.reduce<Record<string, unknown>>((snapshot, key) => {
    snapshot[key] = data[key];
    return snapshot;
  }, {});
}

function hasClipHistoryPatch(payload: Record<string, unknown>) {
  return CLIP_HISTORY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

function resourceItemToClipMaterials(item: ResourceItem): Material[] {
  if (item.kind === 'image' || item.kind === 'video' || item.kind === 'audio') {
    return [{
      id: `resource-${item.id}`,
      kind: item.kind,
      url: item.fileUrl,
      sourceNodeId: 'resource-library',
      origin: 'local',
      label: item.title || item.originalName,
    }];
  }
  if (item.kind !== 'set' || !Array.isArray(item.materialSetItems)) return [];
  return item.materialSetItems
    .filter((child) => child.kind === 'image' || child.kind === 'video' || child.kind === 'audio')
    .map((child, index) => ({
      id: `resource-${item.id}-${child.id || index}`,
      kind: child.kind as 'image' | 'video' | 'audio',
      url: child.url || '',
      sourceNodeId: 'resource-library',
      origin: 'local' as const,
      label: child.name || item.title,
    }))
    .filter((child) => child.url);
}

const selectClass = 'nodrag w-full rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-elevated)] px-2 py-1 text-[11px] text-[var(--t8-text-main)] outline-none';
const inputClass = 'nodrag w-full rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-elevated)] px-2 py-1 text-[11px] text-[var(--t8-text-main)] outline-none';

const ClipStudioNode = ({ id, data, selected }: NodeProps) => {
  const d = (data as any) || {};
  const update = useUpdateNodeData(id);
  const upstream = useUpstreamMaterials(id);
  const nodes = useNodes();
  const hasAutoOutput = useHasAutoOutput(id);
  const apiSettings = useApiKeysStore((state) => state.settings);
  const clipImageModels = useMemo(() => modelsForKind(apiSettings, 'image'), [apiSettings]);
  const clipVideoModels = useMemo(() => modelsForKind(apiSettings, 'video'), [apiSettings]);
  const clipHistoryPastRef = useRef<Record<string, unknown>[]>([]);
  const clipHistoryFutureRef = useRef<Record<string, unknown>[]>([]);
  const clipRenderInvocationRef = useRef(0);
  const clipEditRevisionRef = useRef(0);
  const upstreamMaterialFingerprint = clipUpstreamMaterialFingerprint(upstream);
  const latestUpstreamMaterialFingerprintRef = useRef(upstreamMaterialFingerprint);
  latestUpstreamMaterialFingerprintRef.current = upstreamMaterialFingerprint;
  const visualProbePromisesByUrlRef = useRef(new Map<string, Promise<ClipProbeDuration[]>>());
  const validatedVisualSourceSignaturesRef = useRef(new Set<string>());
  const successfulVisualProbeDurationsByUrlRef = useRef(new Map<string, number>());
  const activeVisualSourceUrlsRef = useRef(new Set<string>());
  const [localError, setLocalError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [resourceMaterials, setResourceMaterials] = useState<Material[]>([]);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [clipHistoryVersion, setClipHistoryVersion] = useState(0);

  const status: 'idle' | 'running' | 'success' | 'error' = d.status || 'idle';
  const outputUrl = typeof d.videoUrl === 'string' ? d.videoUrl : '';
  const ratio = typeof d.clipRatio === 'string' ? d.clipRatio : '16:9';
  const previewRatioMode = typeof d.clipRatioMode === 'string' ? d.clipRatioMode : 'auto';
  const resolution = typeof d.clipResolution === 'string' ? d.clipResolution : '720p';
  const fps = toNumber(d.clipFps, 30);
  const imageDuration = toNumber(d.clipImageDuration, 3);
  const background = typeof d.clipBackground === 'string' ? d.clipBackground : '#000000';
  const visualOrder = useMemo(() => stringList(d.clipVisualOrder), [d.clipVisualOrder]);
  const disabledVisualIds = useMemo(() => stringList(d.clipDisabledVisualIds), [d.clipDisabledVisualIds]);
  const removedVisualIds = useMemo(() => stringList(d.clipRemovedVisualIds), [d.clipRemovedVisualIds]);
  const removedAudioIds = useMemo(() => stringList(d.clipRemovedAudioIds), [d.clipRemovedAudioIds]);
  const removedTextIds = useMemo(() => stringList(d.clipRemovedTextIds), [d.clipRemovedTextIds]);
  const visualDurations = useMemo(() => recordValue(d.clipVisualDurations), [d.clipVisualDurations]);
  const clipVisualSourceMetadata = useMemo<Record<string, ClipVisualSourceMetadata>>(() => {
    const parsed: Record<string, ClipVisualSourceMetadata> = {};
    Object.entries(recordValue(d.clipVisualSourceMetadata)).forEach(([visualId, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const item = value as Record<string, unknown>;
      const duration = Number(item.duration);
      if (typeof item.url === 'string' && Number.isFinite(duration) && duration > 0) {
        parsed[visualId] = { url: item.url, duration };
      }
    });
    return parsed;
  }, [d.clipVisualSourceMetadata]);
  const visualStarts = useMemo(() => recordValue(d.clipVisualStarts), [d.clipVisualStarts]);
  const visualFilters = useMemo(() => recordValue(d.clipVisualFilters), [d.clipVisualFilters]);
  const visualTransforms = useMemo(() => recordValue(d.clipVisualTransforms) as Record<string, ClipVisualTransform>, [d.clipVisualTransforms]);
  const clipVisualKeyframes = useMemo(() => {
    const raw = recordValue(d.clipVisualKeyframes);
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, clipVisualKeyframeList(value)])) as Record<string, ClipVisualKeyframe[]>;
  }, [d.clipVisualKeyframes]);
  const visualLanes = useMemo(() => recordValue(d.clipVisualLanes), [d.clipVisualLanes]);
  const editorLayout = useMemo(() => sanitizeClipStudioLayout(recordValue(d.clipEditorLayout)), [d.clipEditorLayout]);
  const trackHeights = useMemo(() => recordValue(d.clipTrackHeights) as Record<string, number>, [d.clipTrackHeights]);
  const coverUrl = typeof d.clipCoverUrl === 'string' ? d.clipCoverUrl : '';
  const coverTime = toNumber(d.clipCoverTime, 0);
  const coverSource = typeof d.clipCoverSource === 'string' ? d.clipCoverSource : 'frame';
  const displayCoverUrl = coverSource === 'frame' && !isLikelyImageUrl(coverUrl) ? '' : coverUrl;
  const localVisuals = useMemo<ClipTimelineVisualMaterial[]>(() => objectList(d.clipLocalVisuals).map((item, index) => ({
    id: typeof item.id === 'string' ? item.id : `local-visual-${index}`,
    kind: (item.kind === 'video' ? 'video' : 'image') as 'image' | 'video',
    url: typeof item.url === 'string' ? item.url : '',
    label: typeof item.label === 'string' ? item.label : undefined,
    width: typeof item.width === 'number' ? item.width : undefined,
    height: typeof item.height === 'number' ? item.height : undefined,
    aspectRatio: typeof item.aspectRatio === 'number' ? item.aspectRatio : undefined,
    lane: typeof item.lane === 'number' ? item.lane : undefined,
    duration: typeof item.duration === 'number' ? item.duration : undefined,
    generation: sanitizeClipGenerationState(item.generation),
  })).filter((item) => item.url || item.generation), [d.clipLocalVisuals]);
  const localAudios = useMemo(() => objectList(d.clipLocalAudios).map((item, index) => ({
    id: typeof item.id === 'string' ? item.id : `local-audio-${index}`,
    kind: 'audio' as const,
    url: typeof item.url === 'string' ? item.url : '',
    sourceNodeId: id,
    origin: 'local' as const,
    label: typeof item.label === 'string' ? item.label : undefined,
    start: typeof item.start === 'number' ? item.start : undefined,
    duration: typeof item.duration === 'number' ? item.duration : undefined,
    trimStart: typeof item.trimStart === 'number' ? item.trimStart : undefined,
    volume: typeof item.volume === 'number' ? item.volume : undefined,
    fadeIn: typeof item.fadeIn === 'number' ? item.fadeIn : undefined,
    fadeOut: typeof item.fadeOut === 'number' ? item.fadeOut : undefined,
    speed: typeof item.speed === 'number' ? item.speed : undefined,
  })).filter((item) => item.url), [d.clipLocalAudios, id]);
  const localTexts = useMemo(() => clipMaterialList(d.clipLocalTexts), [d.clipLocalTexts]);
  const audioEdits = useMemo(() => clipMaterialList(d.clipAudioEdits), [d.clipAudioEdits]);
  const textEdits = useMemo(() => clipMaterialList(d.clipTextEdits), [d.clipTextEdits]);

  const rawVisuals = useMemo<ClipTimelineVisualMaterial[]>(() => [
    ...upstream.images.map((item) => ({
      id: item.id,
      kind: 'image' as const,
      url: item.url,
      label: item.label,
      ...materialWithSize(item),
    })),
    ...upstream.videos.map((item) => ({
      id: item.id,
      kind: 'video' as const,
      url: item.url,
      label: item.label,
      ...materialWithSize(item),
    })),
    ...localVisuals,
  ], [localVisuals, upstream.images, upstream.videos]);

  const editedTimelineVisuals = useMemo(() => applyClipTimelineEdits(rawVisuals, {
    order: visualOrder,
    disabledIds: disabledVisualIds,
    removedIds: removedVisualIds,
    durations: visualDurations,
    starts: visualStarts,
    filters: visualFilters,
  }).map((item) => ({
    ...item,
    lane: visualLaneForItem(item, visualLanes),
  })), [disabledVisualIds, rawVisuals, removedVisualIds, visualDurations, visualFilters, visualLanes, visualOrder, visualStarts]);
  const visualSourceReconciliation = useMemo(() => reconcileClipVisualSourceDurations({
    visuals: editedTimelineVisuals,
    currentDurations: visualDurations,
    currentSourceMetadata: clipVisualSourceMetadata,
    probes: [],
  }), [clipVisualSourceMetadata, editedTimelineVisuals, visualDurations]);
  const timelineVisuals = useMemo(() => {
    const invalidVisualIds = new Set(visualSourceReconciliation.invalidIds);
    return editedTimelineVisuals.map((item) => ({
      ...item,
      duration: Number(visualSourceReconciliation.durations[item.id || ''] ?? item.duration),
      sourceInvalid: invalidVisualIds.has(item.id || ''),
    }));
  }, [editedTimelineVisuals, visualSourceReconciliation]);
  const renderableTimelineVisuals = timelineVisuals.filter((item) => !item.sourceInvalid);
  const autoClipRatio = ratioFromMediaSize(timelineVisuals.find((item) => !item.disabled)?.width, timelineVisuals.find((item) => !item.disabled)?.height) || ratio;
  const activeClipRatio = previewRatioMode === 'manual' ? ratio : autoClipRatio;
  const exportSettings = useMemo(() => {
    const sourceVisual = timelineVisuals.find((item) => !item.disabled);
    const ratioSize = resolveClipRatioPreset(activeClipRatio, resolution, sourceVisual);
    return sanitizeClipExportSettings({
      ...ratioSize,
      fps,
      imageDuration,
      background,
    });
  }, [activeClipRatio, background, fps, imageDuration, resolution, timelineVisuals]);
  const baseAudioMaterials = useMemo<ClipMaterial[]>(() => [...upstream.audios, ...localAudios].map((item, index) => {
    const clip = item as ClipMaterial;
    return {
      id: item.id || `audio-${index}`,
      url: item.url,
      label: item.label,
      start: typeof clip.start === 'number' ? clip.start : 0,
      duration: typeof clip.duration === 'number' ? clip.duration : undefined,
      trimStart: typeof clip.trimStart === 'number' ? clip.trimStart : undefined,
      volume: typeof clip.volume === 'number' ? clip.volume : 1,
      fadeIn: typeof clip.fadeIn === 'number' ? clip.fadeIn : undefined,
      fadeOut: typeof clip.fadeOut === 'number' ? clip.fadeOut : undefined,
      speed: typeof clip.speed === 'number' ? clip.speed : undefined,
    };
  }), [localAudios, upstream.audios]);
  const timelineAudios = useMemo<ClipMaterial[]>(() => {
    const editById = new Map(audioEdits.map((item) => [item.id || item.url || '', item]));
    const removed = new Set(removedAudioIds);
    return baseAudioMaterials
      .filter((item, index) => !removed.has(item.id || item.url || `audio-${index}`))
      .map((item, index) => ({
        ...item,
        ...editById.get(item.id || item.url || `audio-${index}`),
      }));
  }, [audioEdits, baseAudioMaterials, removedAudioIds]);
  const timelineTexts = useMemo<ClipMaterial[]>(() => {
    const base = [
      ...upstream.texts.map((item, index) => ({
        id: item.id || `text-${index}`,
        text: item.url,
        label: item.label,
        start: undefined,
        duration: undefined,
      })),
      ...localTexts,
    ];
    const editById = new Map(textEdits.map((item) => [item.id || item.text || '', item]));
    const removed = new Set(removedTextIds);
    return base
      .filter((item, index) => !removed.has(item.id || item.text || `text-${index}`))
      .map((item, index) => ({
        ...item,
        ...editById.get(item.id || item.text || `text-${index}`),
      }));
  }, [localTexts, removedTextIds, textEdits, upstream.texts]);
  const canvasMaterials = useMemo<Material[]>(() => {
    const seen = new Set<string>();
    const out: Material[] = [];
    nodes.forEach((node) => {
      if (!node || node.id === id) return;
      collectMentionableMediaFromNodeData(node.id, node.data || {}, node.type).forEach((material) => {
        const key = `${material.kind}:${material.url}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ ...material, origin: 'local', sourceNodeId: material.sourceNodeId || node.id });
      });
    });
    return out;
  }, [id, nodes]);

  const draft = useMemo(() => buildClipDraftFromTimeline({
    visuals: renderableTimelineVisuals,
    audios: timelineAudios,
    texts: timelineTexts,
  }, exportSettings, {
    visualTransforms,
    visualKeyframes: clipVisualKeyframes,
  }), [clipVisualKeyframes, exportSettings, renderableTimelineVisuals, timelineAudios, timelineTexts, visualTransforms]);

  const estimatedDuration = clipProjectDuration(draft);
  const totalMaterials = upstream.images.length + upstream.videos.length + upstream.audios.length + upstream.texts.length;
  const activeVisualCount = renderableTimelineVisuals.filter((item) => !item.disabled).length;
  const canRender = timelineVisuals.some((item) => !item.disabled);

  const commitClipPatch = useCallback((payload: object) => {
    clipEditRevisionRef.current += 1;
    const patchPayload = payload as Record<string, unknown>;
    if (!hasClipHistoryPatch(patchPayload)) {
      update(patchPayload);
      return;
    }
    const currentData = (nodes.find((node) => node.id === id)?.data || {}) as Record<string, unknown>;
    clipHistoryPastRef.current.push(cloneClipNodeSnapshot(pickClipNodeHistorySnapshot(currentData)));
    if (clipHistoryPastRef.current.length > 80) clipHistoryPastRef.current.shift();
    clipHistoryFutureRef.current = [];
    setClipHistoryVersion((value) => value + 1);
    update(patchPayload);
  }, [id, nodes, update]);

  const patch = useCallback((payload: object) => {
    commitClipPatch(payload);
  }, [commitClipPatch]);

  const probeVisualSourceUrls = useCallback(async (urls: string[]) => {
    const requestedUrls = Array.from(new Set(urls.map(normalizeVisualSourceUrl).filter(Boolean)));
    const hasValidatedCachedDuration = (url: string) => {
      const cachedDuration = successfulVisualProbeDurationsByUrlRef.current.get(url);
      return cachedDuration != null
        && validatedVisualSourceSignaturesRef.current.has(visualSourceSignature(url, cachedDuration));
    };
    const freshUrls = requestedUrls.filter((url) => (
      !visualProbePromisesByUrlRef.current.has(url)
      && !hasValidatedCachedDuration(url)
    ));
    if (freshUrls.length > 0) {
      const batchPromise = probeClipMedia(freshUrls);
      freshUrls.forEach((url) => {
        let promise: Promise<ClipProbeDuration[]>;
        promise = batchPromise.then((probeItems) => {
          if (!probeItems.some((probe) => normalizeVisualSourceUrl(probe.url) === url && Number.isFinite(Number(probe.duration)) && Number(probe.duration) > 0)) return [];
          const matching = probeItems.filter((probe) => normalizeVisualSourceUrl(probe.url) === url && Number.isFinite(Number(probe.duration)) && Number(probe.duration) > 0);
          matching.forEach((item) => {
            const duration = Number(item.duration);
            const normalizedUrl = normalizeVisualSourceUrl(item.url);
            if (!activeVisualSourceUrlsRef.current.has(normalizedUrl)) return;
            successfulVisualProbeDurationsByUrlRef.current.set(normalizedUrl, duration);
            validatedVisualSourceSignaturesRef.current.add(visualSourceSignature(normalizedUrl, duration));
          });
          return matching;
        }).finally(() => {
          if (visualProbePromisesByUrlRef.current.get(url) === promise) {
            visualProbePromisesByUrlRef.current.delete(url);
          }
        });
        visualProbePromisesByUrlRef.current.set(url, promise);
      });
    }
    const results = await Promise.all(requestedUrls.map((url) => {
      const pending = visualProbePromisesByUrlRef.current.get(url);
      if (pending) return pending;
      const cachedDuration = successfulVisualProbeDurationsByUrlRef.current.get(url);
      return cachedDuration != null && validatedVisualSourceSignaturesRef.current.has(visualSourceSignature(url, cachedDuration))
        ? Promise.resolve([{ url, duration: cachedDuration }])
        : Promise.resolve([]);
    }));
    return results.flat();
  }, []);

  const undoClipEdit = useCallback(() => {
    const previous = clipHistoryPastRef.current.pop();
    if (!previous) return;
    const currentData = (nodes.find((node) => node.id === id)?.data || {}) as Record<string, unknown>;
    clipHistoryFutureRef.current.push(cloneClipNodeSnapshot(pickClipNodeHistorySnapshot(currentData)));
    setClipHistoryVersion((value) => value + 1);
    clipEditRevisionRef.current += 1;
    update(previous);
  }, [id, nodes, update]);

  const redoClipEdit = useCallback(() => {
    const next = clipHistoryFutureRef.current.pop();
    if (!next) return;
    const currentData = (nodes.find((node) => node.id === id)?.data || {}) as Record<string, unknown>;
    clipHistoryPastRef.current.push(cloneClipNodeSnapshot(pickClipNodeHistorySnapshot(currentData)));
    setClipHistoryVersion((value) => value + 1);
    clipEditRevisionRef.current += 1;
    update(next);
  }, [id, nodes, update]);

  const patchVisualOrder = useCallback((items: ClipTimelineVisualMaterial[]) => {
    commitClipPatch({ clipVisualOrder: items.map((item) => item.id).filter(Boolean) });
  }, [commitClipPatch]);

  const importMaterialToTimeline = useCallback((material: Material | MaterialPayload, insertAt?: Partial<ClipTimelineInsertTiming>) => {
    const kind = material.kind;
    const url = kind === 'text' ? (material as MaterialPayload).text : material.url;
    if (!url || (kind !== 'image' && kind !== 'video' && kind !== 'audio')) return;
    const materialDuration = toNumber(recordValue(material).duration, imageDuration);
    const visualDuration = kind === 'video'
      ? Math.max(0.25, materialDuration)
      : imageDuration;
    const insertAsTopVisualLane = kind !== 'audio' && Number(insertAt?.lane) < 0;
    const insertTiming = kind === 'audio'
      ? { start: Math.max(0, Math.round(Number(insertAt?.start ?? estimatedDuration) * 1000) / 1000), lane: 0 }
      : resolveClipTimelineInsertTiming(timelineVisuals, {
        requestedStart: insertAt?.start,
        fallbackStart: estimatedDuration,
        duration: visualDuration,
        lane: insertAsTopVisualLane ? 0 : insertAt?.lane,
        avoidOverlap: true,
      });
    const imported = {
      id: `clip-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      url,
      label: 'label' in material ? material.label : fileNameFromUrl(url),
      ...materialWithSize(material),
      ...(kind === 'audio' ? { start: insertTiming.start } : { start: insertTiming.start, lane: insertAsTopVisualLane ? 0 : insertTiming.lane, duration: visualDuration }),
    };
    if (kind === 'audio') {
      commitClipPatch({ clipLocalAudios: [...objectList(d.clipLocalAudios), imported] });
    } else {
      const nextVisualLanes = insertAsTopVisualLane ? shiftVisualLanesForTopInsert(timelineVisuals, visualLanes) : visualLanes;
      commitClipPatch({
        clipLocalVisuals: serializeClipLocalVisuals([...localVisuals, imported as ClipTimelineVisualMaterial]),
        clipVisualLanes: {
          ...nextVisualLanes,
          [imported.id]: insertAsTopVisualLane ? 0 : clampVisualLane(insertTiming.lane),
        },
      });
    }
  }, [commitClipPatch, d.clipLocalAudios, estimatedDuration, imageDuration, localVisuals, timelineVisuals, visualLanes]);

  const refreshResourceLibrary = useCallback(async () => {
    setResourceLoading(true);
    try {
      const [images, videos, audios, sets] = await Promise.all([
        getResourceItems({ kind: 'image' }),
        getResourceItems({ kind: 'video' }),
        getResourceItems({ kind: 'audio' }),
        getResourceItems({ kind: 'set' }),
      ]);
      const next = [images, videos, audios, sets]
        .flatMap((result) => (result.success ? result.data : []))
        .flatMap(resourceItemToClipMaterials);
      const seen = new Set<string>();
      setResourceMaterials(next.filter((material) => {
        const key = `${material.kind}:${material.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    } catch (error: any) {
      setLocalError(error?.message || '资源库素材加载失败');
    } finally {
      setResourceLoading(false);
    }
  }, []);

  const saveRenderToResourceLibrary = useCallback(async () => {
    const videoUrl = typeof d.videoUrl === 'string' ? d.videoUrl : outputUrl;
    if (!videoUrl) return;
    setLocalError('');
    try {
      const result = await addResourceItem({
        kind: 'video',
        url: videoUrl,
        title: `剪辑成片 ${new Date().toLocaleString()}`,
        tags: ['剪辑台', ratio, resolution],
        sourceNodeId: id,
      });
      if (!result.success) {
        setLocalError(result.error || '保存成片到资源库失败');
        return;
      }
      const coverForLibrary = typeof d.imageUrl === 'string' ? d.imageUrl : displayCoverUrl;
      if (coverForLibrary && isLikelyImageUrl(coverForLibrary)) {
        await addResourceItem({
          kind: 'image',
          url: coverForLibrary,
          title: '剪辑封面',
          tags: ['剪辑台', '封面'],
          sourceNodeId: id,
        });
      }
      window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
      void refreshResourceLibrary();
    } catch (error: any) {
      setLocalError(error?.message || '保存成片到资源库失败');
    }
  }, [d.imageUrl, d.videoUrl, displayCoverUrl, id, outputUrl, ratio, refreshResourceLibrary, resolution]);

  const downloadRenderToFile = useCallback(async () => {
    const videoUrl = typeof d.videoUrl === 'string' ? d.videoUrl : outputUrl;
    if (!videoUrl) return;
    setLocalError('');
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`导出文件下载失败 (${response.status})`);
      const blob = await response.blob();
      const defaultName = `t8-clip-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.mp4`;
      const suggestedName = (() => {
        const name = fileNameFromUrl(videoUrl).replace(/[?#].*$/, '');
        return name && /\.[a-z0-9]+$/i.test(name) ? name : defaultName;
      })();
      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        const handle = await (window as Window & typeof globalThis & {
          showSaveFilePicker?: (options: { suggestedName?: string; startIn?: string; types?: Array<{ description?: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker?.({
          suggestedName,
          startIn: 'downloads',
          types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
        });
        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        }
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = suggestedName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    } catch (error: any) {
      setLocalError(error?.message || '导出文件保存失败');
    }
  }, [d.videoUrl, outputUrl]);

  useEffect(() => {
    if (editorOpen) void refreshResourceLibrary();
  }, [editorOpen, refreshResourceLibrary]);

  useEffect(() => {
    const activeUrls = new Set(editedTimelineVisuals
      .filter((item) => item.kind === 'video')
      .map((item) => normalizeVisualSourceUrl(item.url))
      .filter(Boolean));
    activeVisualSourceUrlsRef.current = activeUrls;
    successfulVisualProbeDurationsByUrlRef.current.forEach((_duration, url) => {
      if (!activeUrls.has(url)) successfulVisualProbeDurationsByUrlRef.current.delete(url);
    });
    validatedVisualSourceSignaturesRef.current.forEach((signature) => {
      const signatureUrl = signature.split('\u0000', 1)[0];
      if (!activeUrls.has(signatureUrl)) validatedVisualSourceSignaturesRef.current.delete(signature);
    });
  }, [editedTimelineVisuals]);

  useEffect(() => {
    if (!editorOpen) return undefined;
    const videosToProbe = editedTimelineVisuals.filter((item) => {
      if (item.generation && item.generation.status !== 'success' && !item.url) return false;
      if (item.kind !== 'video' || !item.id || !item.url) return false;
      const persisted = clipVisualSourceMetadata[item.id];
      if (normalizeVisualSourceUrl(persisted?.url) === normalizeVisualSourceUrl(item.url) && Number.isFinite(persisted?.duration) && Number(persisted?.duration) > 0) return false;
      return true;
    });
    if (videosToProbe.length === 0) return undefined;

    let cancelled = false;
    void probeVisualSourceUrls(videosToProbe.map((item) => item.url || ''))
      .then((probeItems) => {
        const freshReconciliation = reconcileClipVisualSourceDurations({
          visuals: editedTimelineVisuals,
          currentDurations: visualDurations,
          currentSourceMetadata: clipVisualSourceMetadata,
          probes: probeItems,
        });
        if (cancelled) return;
        const patchValue: Record<string, unknown> = {};
        if (freshReconciliation.durationsChanged) patchValue.clipVisualDurations = freshReconciliation.durations;
        if (freshReconciliation.sourceMetadataChanged) patchValue.clipVisualSourceMetadata = freshReconciliation.sourceMetadata;
        if (Object.keys(patchValue).length > 0) update(patchValue);
      })
      .catch(() => {
        if (!cancelled) setLocalError('视频时长读取失败');
      });

    return () => {
      cancelled = true;
    };
  }, [clipVisualSourceMetadata, editedTimelineVisuals, editorOpen, probeVisualSourceUrls, update, visualDurations]);

  useEffect(() => {
    if (!editorOpen) return undefined;
    const audiosToProbe = timelineAudios.filter((item) => Boolean(item.url));
    if (audiosToProbe.length === 0) return undefined;

    let cancelled = false;
    void probeClipMedia(Array.from(new Set(audiosToProbe.map((item) => item.url || '').filter(Boolean))))
      .then((probeItems) => {
        if (cancelled) return;
        const audioReconciliation = reconcileProbedClipAudioDurations({
          audios: timelineAudios,
          probes: probeItems,
        });
        if (audioReconciliation.changed) update({ clipAudioEdits: audioReconciliation.items });
      })
      .catch((error: any) => {
        if (!cancelled) setLocalError(error?.message || '音频时长读取失败');
      });

    return () => {
      cancelled = true;
    };
  }, [editorOpen, timelineAudios, update]);

  const { dropProps, isAccepting } = useMaterialDropTarget({
    id,
    accepts: ['image', 'video', 'audio'],
    onDrop: importMaterialToTimeline,
    allowSelf: false,
  });

  const moveVisual = useCallback((visualId: string, direction: -1 | 1) => {
    const index = timelineVisuals.findIndex((item) => item.id === visualId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= timelineVisuals.length) return;
    const next = [...timelineVisuals];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    patchVisualOrder(next);
  }, [patchVisualOrder, timelineVisuals]);

  const reorderVisual = useCallback((draggedId: string, targetId: string) => {
    const next = reorderClipTimelineVisual(timelineVisuals, draggedId, targetId);
    patchVisualOrder(next);
  }, [patchVisualOrder, timelineVisuals]);

  const reorderVisualByDropX = useCallback((draggedId: string, dropX: number, pixelsPerSecond: number) => {
    const next = reorderClipTimelineVisualByDropX(timelineVisuals, draggedId, dropX, {
      fallbackDuration: imageDuration,
      pixelsPerSecond,
      gapPixels: 6,
      minClipWidth: 72,
    });
    patchVisualOrder(next);
  }, [imageDuration, patchVisualOrder, timelineVisuals]);

  const toggleVisual = useCallback((visualId: string) => {
    const ids = new Set(disabledVisualIds);
    if (ids.has(visualId)) ids.delete(visualId);
    else ids.add(visualId);
    commitClipPatch({ clipDisabledVisualIds: Array.from(ids) });
  }, [commitClipPatch, disabledVisualIds]);

  const setVisualLaneVisibility = useCallback((lane: number, visible: boolean) => {
    const laneVisualIds = timelineVisuals
      .filter((item) => item.id && visualLaneForItem(item, visualLanes) === lane)
      .map((item) => item.id as string);
    if (laneVisualIds.length === 0) return;
    const nextIds = new Set(disabledVisualIds);
    laneVisualIds.forEach((visualId) => {
      if (visible) nextIds.delete(visualId);
      else nextIds.add(visualId);
    });
    commitClipPatch({ clipDisabledVisualIds: Array.from(nextIds) });
  }, [commitClipPatch, disabledVisualIds, timelineVisuals, visualLanes]);

  const updateVisualDuration = useCallback((visualId: string, value: number) => {
    commitClipPatch({
      clipVisualDurations: {
        ...visualDurations,
        [visualId]: value,
      },
    });
  }, [commitClipPatch, visualDurations]);

  const updateVisualStart = useCallback((visualId: string, value: number, lane?: number) => {
    const nextVisualLanes = lane == null ? visualLanes : resolveVisualLanePatchForDrop(timelineVisuals, visualLanes, visualId, lane);
    commitClipPatch({
      clipVisualStarts: {
        ...visualStarts,
        [visualId]: Math.max(0, Math.round(Number(value || 0) * 1000) / 1000),
      },
      clipVisualLanes: nextVisualLanes,
    });
  }, [commitClipPatch, timelineVisuals, visualLanes, visualStarts]);

  const updateVisualTiming = useCallback((visualId: string, start: number, duration: number, trimStart?: number) => {
    const hasLocalVisual = localVisuals.some((item) => item.id === visualId);
    const nextLocalVisuals = localVisuals.map((item) => (
      item.id === visualId && trimStart != null
        ? { ...item, trimStart: Math.max(0, Math.round(Number(trimStart || 0) * 1000) / 1000) }
        : item
    ));
    commitClipPatch({
      ...(hasLocalVisual ? { clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals) } : {}),
      clipVisualStarts: {
        ...visualStarts,
        [visualId]: Math.max(0, Math.round(Number(start || 0) * 1000) / 1000),
      },
      clipVisualDurations: {
        ...visualDurations,
        [visualId]: Math.max(0.25, Math.round(Number(duration || imageDuration) * 1000) / 1000),
      },
    });
  }, [commitClipPatch, imageDuration, localVisuals, visualDurations, visualStarts]);

  const compactVisualTimeline = useCallback(() => {
    const nextVisuals = compactClipTimelineVisuals(timelineVisuals);
    const localIds = new Set(localVisuals.map((item) => item.id));
    const nextLocalVisuals = nextVisuals.filter((item) => {
      const itemId = item.id || '';
      return localIds.has(itemId);
    });
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals),
      clipVisualStarts: {},
      clipVisualOrder: nextVisuals.map((item) => item.id).filter(Boolean),
    });
  }, [commitClipPatch, localVisuals, timelineVisuals]);

  const cleanupTimelineMedia = useCallback(() => {
    const patchValue = createQuickClipCleanupPatch({
      duration: Math.max(estimatedDuration, imageDuration, 0.25),
      audios: timelineAudios,
      texts: timelineTexts,
    });
    commitClipPatch(patchValue);
  }, [commitClipPatch, estimatedDuration, imageDuration, timelineAudios, timelineTexts]);

  const applyQuickTemplate = useCallback((templateId: QuickClipTemplateId) => {
    const patchValue = createQuickClipTemplatePatch({
      templateId,
      visuals: timelineVisuals,
      texts: timelineTexts,
      existingFilters: visualFilters,
      existingTextEdits: textEdits,
    });
    commitClipPatch(patchValue);
  }, [commitClipPatch, textEdits, timelineTexts, timelineVisuals, visualFilters]);

  const updateAudioTiming = useCallback((clipId: string, start: number, duration: number, trimStart?: number) => {
    const next = updateClipTimelineMaterialTiming(timelineAudios, clipId, { start, duration }).map((item, index) => {
      const itemId = item.id || item.url || `audio-${index}`;
      if (itemId !== clipId || trimStart == null) return item;
      return { ...item, trimStart: Math.max(0, Math.round(Number(trimStart || 0) * 1000) / 1000) };
    });
    commitClipPatch({ clipAudioEdits: next });
  }, [commitClipPatch, timelineAudios]);

  const updateAudioSettings = useCallback((clipId: string, patchValue: Partial<ClipMaterial>) => {
    const next = timelineAudios.map((item, index) => {
      const itemId = item.id || item.url || `audio-${index}`;
      if (itemId !== clipId) return item;
      return { ...item, ...patchValue };
    });
    commitClipPatch({ clipAudioEdits: next });
  }, [commitClipPatch, timelineAudios]);

  const updateTextTiming = useCallback((clipId: string, start: number, duration: number) => {
    const next = updateClipTimelineMaterialTiming(timelineTexts, clipId, { start, duration });
    commitClipPatch({ clipTextEdits: next });
  }, [commitClipPatch, timelineTexts]);

  const updateTextSettings = useCallback((clipId: string, patchValue: Partial<ClipMaterial>) => {
    const next = timelineTexts.map((item, index) => {
      const itemId = item.id || item.text || `text-${index}`;
      if (itemId !== clipId) return item;
      return { ...item, ...patchValue };
    });
    commitClipPatch({ clipTextEdits: next });
  }, [commitClipPatch, timelineTexts]);

  const removeAudio = useCallback((clipId: string) => {
    commitClipPatch({
      clipRemovedAudioIds: Array.from(new Set([...removedAudioIds, clipId])).filter(Boolean),
      clipAudioEdits: removeClipTimelineMaterial(timelineAudios, clipId),
    });
  }, [commitClipPatch, removedAudioIds, timelineAudios]);

  const removeText = useCallback((clipId: string) => {
    commitClipPatch({
      clipRemovedTextIds: Array.from(new Set([...removedTextIds, clipId])).filter(Boolean),
      clipTextEdits: removeClipTimelineMaterial(timelineTexts, clipId),
    });
  }, [commitClipPatch, removedTextIds, timelineTexts]);

  const duplicateAudio = useCallback((clipId: string) => {
    const next = duplicateClipTimelineMaterial(timelineAudios, clipId);
    const originalIds = new Set(timelineAudios.map((item, index) => item.id || item.url || `audio-${index}`));
    const copies = next.filter((item, index) => !originalIds.has(item.id || item.url || `audio-${index}`));
    if (copies.length === 0) return;
    commitClipPatch({ clipLocalAudios: [...objectList(d.clipLocalAudios), ...copies.map((item) => ({ ...item, kind: 'audio' }))] });
  }, [commitClipPatch, d.clipLocalAudios, timelineAudios]);

  const duplicateText = useCallback((clipId: string) => {
    const next = duplicateClipTimelineMaterial(timelineTexts, clipId);
    const originalIds = new Set(timelineTexts.map((item, index) => item.id || item.text || `text-${index}`));
    const copies = next.filter((item, index) => !originalIds.has(item.id || item.text || `text-${index}`));
    if (copies.length === 0) return;
    commitClipPatch({ clipLocalTexts: [...localTexts, ...copies] });
  }, [commitClipPatch, localTexts, timelineTexts]);

  const splitAudioAtTime = useCallback((clipId: string, time: number) => {
    const next = splitClipTimelineMaterialAtTime(timelineAudios, clipId, time);
    const splitParts = next.filter((item) => item.id === `${clipId}-left` || item.id === `${clipId}-right`);
    if (splitParts.length < 2) return;
    commitClipPatch({
      clipRemovedAudioIds: Array.from(new Set([...removedAudioIds, clipId])).filter(Boolean),
      clipLocalAudios: [...objectList(d.clipLocalAudios), ...splitParts.map((item) => ({ ...item, kind: 'audio' }))],
    });
  }, [commitClipPatch, d.clipLocalAudios, removedAudioIds, timelineAudios]);

  const splitTextAtTime = useCallback((clipId: string, time: number) => {
    const next = splitClipTimelineMaterialAtTime(timelineTexts, clipId, time);
    const splitParts = next.filter((item) => item.id === `${clipId}-left` || item.id === `${clipId}-right`);
    if (splitParts.length < 2) return;
    commitClipPatch({
      clipRemovedTextIds: Array.from(new Set([...removedTextIds, clipId])).filter(Boolean),
      clipLocalTexts: [...localTexts, ...splitParts],
    });
  }, [commitClipPatch, localTexts, removedTextIds, timelineTexts]);

  const createTextClip = useCallback((text = '默认文本') => {
    const idValue = `local-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    commitClipPatch({
      clipLocalTexts: [
        ...localTexts,
        {
          id: idValue,
          text,
          label: text,
          start: Math.max(0, Math.round(estimatedDuration * 1000) / 1000),
          duration: 3,
          x: 50,
          y: 88,
        },
      ],
    });
  }, [commitClipPatch, estimatedDuration, localTexts]);

  const updateGenerationClip = useCallback((visualId: string, patchValue: Partial<ClipGenerationState>, visualPatch: Partial<ClipTimelineVisualMaterial> = {}) => {
    const nextLocalVisuals = localVisuals.map((item) => {
      if (item.id !== visualId || !item.generation) return item;
      const shouldFinalize = patchValue.status === 'success' && typeof patchValue.outputUrl === 'string' && patchValue.outputUrl;
      return {
        ...item,
        ...visualPatch,
        label: shouldFinalize ? fileNameFromUrl(patchValue.outputUrl || item.label || '') : visualPatch.label || item.label,
        generation: shouldFinalize ? undefined : {
          ...item.generation,
          ...patchValue,
          params: patchValue.params ? { ...item.generation.params, ...patchValue.params } : item.generation.params,
          refs: patchValue.refs || item.generation.refs,
        },
      };
    });
    commitClipPatch({ clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals) });
  }, [commitClipPatch, localVisuals]);

  const uploadGenerationRefs = useCallback(async (
    visualId: string,
    files: FileList | null,
    forcedKind?: 'image' | 'video' | 'audio',
  ) => {
    const visual = timelineVisuals.find((item) => item.id === visualId);
    const generation = sanitizeClipGenerationState(visual?.generation);
    const selectedFiles = Array.from(files || []);
    if (!visual || !generation || selectedFiles.length === 0) return;
    const choice = resolveClipGenerationChoice(generation.nodeType, {
      model: generation.model,
      mainId: generation.mainId,
      apiModel: generation.apiModel,
      params: generation.params,
      catalogModels: generation.nodeType === 'image' ? clipImageModels : clipVideoModels,
    });
    const support = clipGenerationReferenceSupport(choice);
    const refs = [...(generation.refs || [])];
    for (const file of selectedFiles) {
      const inferred = forcedKind || inferClipFileKind(file);
      if (inferred !== 'image' && inferred !== 'video' && inferred !== 'audio') continue;
      const limit = clipGenerationRefLimitForKind(support, inferred);
      if (limit <= 0 || refs.filter((ref) => ref.kind === inferred).length >= limit) continue;
      const uploaded = await uploadClipAsset(file);
      const url = uploaded.url || '';
      if (!url || refs.some((ref) => ref.url === url)) continue;
      refs.push({
        id: `clip-ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: inferred,
        url,
        label: uploaded.filename || file.name || `${inferred} reference`,
        role: inferred === 'audio' ? 'audio' : 'reference',
        source: 'upload',
        locked: true,
      });
    }
    updateGenerationClip(visualId, { refs });
  }, [clipImageModels, clipVideoModels, timelineVisuals, updateGenerationClip]);

  const createGenerationClip = useCallback((nodeType: ClipGenerationNodeType, insertAt?: ClipGenerationInsertDraft) => {
    const choice = nodeType === 'image'
      ? resolveClipImageGenerationChoice({ catalogModels: clipImageModels })
      : resolveClipVideoGenerationChoice({ catalogModels: clipVideoModels });
    const clipDuration = nodeType === 'image' ? imageDuration : 5;
    const insertAsTopVisualLane = Number(insertAt?.lane) < 0;
    const insertTiming = resolveClipTimelineInsertTiming(timelineVisuals, {
      requestedStart: insertAt?.start,
      fallbackStart: estimatedDuration,
      duration: clipDuration,
      lane: insertAsTopVisualLane ? 0 : insertAt?.lane,
      avoidOverlap: false,
    });
    const generationLabel = choice.nodeType === 'image'
      ? `图像生成 - ${choice.modelDef.tabLabel || choice.modelDef.label}`
      : `视频生成 - ${choice.modelDef.label}`;
    const clip = createClipGenerationVisual({
      nodeType,
      label: generationLabel,
      start: insertTiming.start,
      duration: clipDuration,
      model: choice.apiModel,
      mainId: choice.mainId,
      apiModel: choice.apiModel,
      prompt: insertAt?.prompt,
      refs: insertAt?.refs,
      params: {
        ...defaultClipGenerationParams(choice),
        ...(insertAt?.params || {}),
      },
    });
    const clipId = clip.id || `clip-generation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    clip.id = clipId;
    clip.lane = insertAsTopVisualLane ? 0 : insertTiming.lane;
    const nextVisualLanes = insertAsTopVisualLane ? shiftVisualLanesForTopInsert(timelineVisuals, visualLanes) : visualLanes;
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals([...localVisuals, clip]),
      clipVisualOrder: [...timelineVisuals.map((item) => item.id).filter(Boolean), clipId].filter(Boolean),
      clipVisualLanes: {
        ...nextVisualLanes,
        [clipId]: insertAsTopVisualLane ? 0 : clampVisualLane(insertTiming.lane),
      },
    });
  }, [clipImageModels, clipVideoModels, commitClipPatch, estimatedDuration, imageDuration, localVisuals, timelineVisuals, visualLanes]);

  const runGenerationClip = useCallback(async (visualId: string) => {
    const visual = timelineVisuals.find((item) => item.id === visualId);
    const generation = sanitizeClipGenerationState(visual?.generation);
    if (!visual || !generation) return;
    const promptText = generation.prompt.trim();
    if (!promptText) {
      updateGenerationClip(visualId, { status: 'error', error: '请先填写生成提示词' });
      return;
    }
    updateGenerationClip(visualId, { status: 'running', error: '' });
    try {
      if (generation.nodeType === 'image') {
        const choice = resolveClipImageGenerationChoice({
          model: generation.model,
          mainId: generation.mainId,
          apiModel: generation.apiModel,
          params: generation.params,
          catalogModels: clipImageModels,
        });
        const { imageRefs } = clipGenerationRefsForRequest(generation.refs || [], choice);
        const imageRequest = buildClipImageGenerationRequest(choice, promptText, generation.params, { imageRefs });
        let outputUrl = '';
        if (imageRequest.route === 'fal') {
          const submitted = await submitImageFal(imageRequest.request);
          if (submitted.sync && submitted.urls?.length) {
            outputUrl = submitted.urls[0];
          } else {
            updateGenerationClip(visualId, { status: 'queued', taskId: submitted.requestId, error: '' });
            for (let attempt = 0; attempt < 1200; attempt += 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 3000));
              const statusResult = await queryImageFal({
                responseUrl: submitted.responseUrl,
                endpoint: submitted.endpoint,
                requestId: submitted.requestId,
              });
              const normalized = String(statusResult.status || '').toLowerCase();
              if (normalized === 'completed') {
                outputUrl = statusResult.urls?.[0] || '';
                break;
              }
              if (normalized === 'failed') throw new Error(statusResult.error || 'FAL 图像生成失败');
              if (attempt % 5 === 4) updateGenerationClip(visualId, { status: 'running', taskId: submitted.requestId });
            }
          }
        } else {
          const result = await generateImage(imageRequest.request);
          outputUrl = result.urls[0] || '';
        }
        if (!outputUrl) throw new Error('图像生成没有返回图片');
        updateGenerationClip(visualId, { status: 'success', outputUrl, error: '' }, { url: outputUrl, kind: 'image' });
        return;
      }

      const choice = resolveClipVideoGenerationChoice({
        model: generation.model,
        mainId: generation.mainId,
        apiModel: generation.apiModel,
        params: generation.params,
        catalogModels: clipVideoModels,
      });
      const { imageRefs, videoRefs, audioRefs } = clipGenerationRefsForRequest(generation.refs || [], choice);
      const videoRequest = buildClipVideoGenerationRequest(choice, promptText, {
        ...generation.params,
        duration: generation.params.duration || visual.duration || 5,
        aspectRatio: generation.params.aspectRatio || generation.params.ratio || ratio || choice.modelDef.defaultRatio,
      }, { imageRefs, videoRefs, audioRefs });

      if (videoRequest.route === 'fal') {
        const submitted = await submitVideoFal(videoRequest.request);
        if (submitted.sync && submitted.videoUrl) {
          updateGenerationClip(visualId, { status: 'success', outputUrl: submitted.videoUrl, error: '' }, { url: submitted.videoUrl, kind: 'video' });
          return;
        }
        updateGenerationClip(visualId, { status: 'queued', taskId: submitted.requestId, error: '' });
        for (let attempt = 0; attempt < 1200; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const statusResult = await queryVideoFal({
            responseUrl: submitted.responseUrl,
            endpoint: submitted.endpoint,
            requestId: submitted.requestId,
          });
          const normalized = String(statusResult.status || '').toLowerCase();
          if (normalized === 'completed' || statusResult.videoUrl) {
            const outputUrl = statusResult.videoUrl || '';
            if (!outputUrl) throw new Error('FAL 视频生成成功但没有返回视频地址');
            updateGenerationClip(visualId, { status: 'success', outputUrl, error: '' }, { url: outputUrl, kind: 'video' });
            return;
          }
          if (normalized === 'failed') throw new Error(statusResult.error || 'FAL 视频生成失败');
          if (attempt % 5 === 4) updateGenerationClip(visualId, { status: 'running', taskId: submitted.requestId });
        }
        throw new Error('FAL 视频生成超时，请稍后重试');
      }

      const submitted = videoRequest.route === 'seedance'
        ? await submitSeedance(videoRequest.request)
        : await submitVideo(videoRequest.request);
      updateGenerationClip(visualId, { status: 'queued', taskId: submitted.taskId, error: '' });

      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt < 5 ? 1600 : 3000));
        const statusResult = videoRequest.route === 'seedance'
          ? await querySeedance(submitted.taskId, choice.apiModel)
          : await queryVideo(submitted.taskId, videoRequest.pollingModel);
        const normalized = String(statusResult.status || '').toLowerCase();
        if (normalized === 'succeeded' || normalized === 'success' || statusResult.videoUrl) {
          const outputUrl = statusResult.videoUrl || '';
          if (!outputUrl) throw new Error('视频生成成功但没有返回视频地址');
          updateGenerationClip(visualId, { status: 'success', outputUrl, error: '' }, { url: outputUrl, kind: 'video' });
          return;
        }
        if (normalized === 'failed' || normalized === 'failure') {
          throw new Error(statusResult.failReason || '视频生成失败');
        }
        updateGenerationClip(visualId, { status: 'running', taskId: submitted.taskId });
      }
      throw new Error('视频生成超时，请稍后在生成历史中重试');
    } catch (error: any) {
      updateGenerationClip(visualId, { status: 'error', error: error?.message || '生成失败' });
    }
  }, [clipImageModels, clipVideoModels, ratio, timelineVisuals, updateGenerationClip]);

  const removeVisual = useCallback((visualId: string) => {
    const removed = new Set(removedVisualIds);
    removed.add(visualId);
    const nextVisuals = removeClipTimelineVisual(timelineVisuals, visualId);
    commitClipPatch({
      clipRemovedVisualIds: Array.from(removed),
      clipVisualOrder: nextVisuals.map((item) => item.id).filter(Boolean),
    });
  }, [commitClipPatch, removedVisualIds, timelineVisuals]);

  const splitVisual = useCallback((visualId: string) => {
    const nextVisuals = splitClipTimelineVisual(timelineVisuals, visualId);
    const localIds = new Set(localVisuals.map((item) => item.id));
    const nextLocalVisuals = nextVisuals.filter((item) => localIds.has(item.id || '') || item.id?.startsWith(`${visualId}-`));
    const nextDurations: Record<string, unknown> = { ...visualDurations };
    nextVisuals.forEach((item) => {
      if (item.id && item.kind === 'image' && item.duration) nextDurations[item.id] = item.duration;
    });
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals),
      clipVisualOrder: nextVisuals.map((item) => item.id).filter(Boolean),
      clipVisualDurations: nextDurations,
      clipRemovedVisualIds: Array.from(new Set([...removedVisualIds, visualId])),
    });
  }, [commitClipPatch, localVisuals, removedVisualIds, timelineVisuals, visualDurations]);

  const persistDerivedVisuals = useCallback((visualId: string, nextVisuals: ClipTimelineVisualMaterial[]) => {
    const localIds = new Set(localVisuals.map((item) => item.id));
    const nextLocalVisuals = nextVisuals.filter((item) => {
      const itemId = item.id || '';
      return localIds.has(itemId) || itemId.startsWith(`${visualId}-`);
    });
    const nextDurations: Record<string, unknown> = { ...visualDurations };
    nextVisuals.forEach((item) => {
      if (item.id && item.duration) nextDurations[item.id] = item.duration;
    });
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals),
      clipVisualOrder: nextVisuals.map((item) => item.id).filter(Boolean),
      clipVisualDurations: nextDurations,
      clipRemovedVisualIds: Array.from(new Set([...removedVisualIds, visualId])),
    });
  }, [commitClipPatch, localVisuals, removedVisualIds, visualDurations]);

  const splitVisualAtTime = useCallback((visualId: string, time: number) => {
    persistDerivedVisuals(visualId, splitClipTimelineVisualAtTime(timelineVisuals, visualId, time));
  }, [persistDerivedVisuals, timelineVisuals]);

  const splitLinkedAtTime = useCallback((visualId: string, time: number) => {
    const next = splitLinkedClipTimelineAtTime({
      visuals: timelineVisuals,
      audios: timelineAudios,
      texts: timelineTexts,
      visualId,
      playheadTime: time,
    });
    const localVisualIds = new Set(localVisuals.map((item) => item.id));
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals(next.visuals?.filter((item) => localVisualIds.has(item.id || '') || item.id?.startsWith(`${visualId}-`)) || []),
      clipVisualOrder: next.visuals?.map((item) => item.id).filter(Boolean),
      clipVisualDurations: {
        ...visualDurations,
        ...(next.visuals || []).reduce<Record<string, unknown>>((acc, item) => {
          if (item.id && item.duration) acc[item.id] = item.duration;
          return acc;
        }, {}),
      },
      clipRemovedVisualIds: Array.from(new Set([...removedVisualIds, visualId])),
      clipAudioEdits: next.audios || [],
      clipTextEdits: next.texts || [],
    });
  }, [commitClipPatch, localVisuals, removedVisualIds, timelineAudios, timelineTexts, timelineVisuals, visualDurations]);

  const trimVisualSide = useCallback((visualId: string, time: number, side: 'left' | 'right') => {
    persistDerivedVisuals(visualId, trimClipTimelineVisualSide(timelineVisuals, visualId, time, side));
  }, [persistDerivedVisuals, timelineVisuals]);

  const duplicateVisual = useCallback((visualId: string) => {
    const nextVisuals = duplicateClipTimelineVisual(timelineVisuals, visualId);
    const localIds = new Set(localVisuals.map((item) => item.id));
    const nextLocalVisuals = nextVisuals.filter((item) => {
      const itemId = item.id || '';
      return localIds.has(itemId) || itemId.startsWith(`${visualId}-copy-`);
    });
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals),
      clipVisualOrder: nextVisuals.map((item) => item.id).filter(Boolean),
    });
  }, [commitClipPatch, localVisuals, timelineVisuals]);

  const duplicateVisualToLane = useCallback((visualId: string, laneDelta: -1 | 1) => {
    const source = timelineVisuals.find((item) => item.id === visualId);
    if (!source) return;
    const currentLane = visualLaneForItem(source, visualLanes);
    const laneOffset = laneDelta < 0 && currentLane <= 0 ? 1 : 0;
    const targetLane = laneOffset ? 0 : Math.max(0, Math.min(CLIP_MAX_VISUAL_LANE, currentLane + laneDelta));
    const shiftedVisuals = laneOffset
      ? timelineVisuals.map((item) => ({
        ...item,
        lane: clampVisualLane(visualLaneForItem(item, visualLanes) + laneOffset),
      }))
      : timelineVisuals;
    const nextVisuals = duplicateClipTimelineVisual(shiftedVisuals, visualId, { lane: targetLane });
    const localIds = new Set(localVisuals.map((item) => item.id));
    const nextLocalVisuals = nextVisuals.filter((item) => {
      const itemId = item.id || '';
      return localIds.has(itemId) || itemId.startsWith(`${visualId}-copy-`);
    });
    const nextLanes = { ...visualLanes };
    nextVisuals.forEach((item) => {
      if (item.id && item.lane != null) nextLanes[item.id] = item.lane;
    });
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals),
      clipVisualOrder: nextVisuals.map((item) => item.id).filter(Boolean),
      clipVisualLanes: nextLanes,
    });
  }, [commitClipPatch, localVisuals, timelineVisuals, visualLanes]);

  const duplicateVisualByDrag = useCallback((visualId: string, start: number, lane: number) => {
    const insertAsTopVisualLane = lane < 0;
    const targetLane = insertAsTopVisualLane ? 0 : clampVisualLane(lane);
    const sourceVisuals = insertAsTopVisualLane
      ? timelineVisuals.map((item) => ({ ...item, lane: clampVisualLane(visualLaneForItem(item, visualLanes) + 1) }))
      : timelineVisuals;
    const nextVisuals = duplicateClipTimelineVisual(sourceVisuals, visualId, { lane: targetLane });
    const source = sourceVisuals.find((item) => item.id === visualId);
    const copy = nextVisuals.find((item) => item.id?.startsWith(`${visualId}-copy-`) && !sourceVisuals.some((current) => current.id === item.id));
    const copyId = copy?.id || '';
    if (!copyId || !source) return;
    const localIds = new Set(localVisuals.map((item) => item.id));
    const nextLocalVisuals = nextVisuals.filter((item) => {
      const itemId = item.id || '';
      return localIds.has(itemId) || itemId === copyId;
    });
    const nextLanes = insertAsTopVisualLane ? shiftVisualLanesForTopInsert(timelineVisuals, visualLanes) : { ...visualLanes };
    nextVisuals.forEach((item) => {
      if (item.id && item.lane != null) nextLanes[item.id] = item.lane;
    });
    commitClipPatch({
      clipLocalVisuals: serializeClipLocalVisuals(nextLocalVisuals),
      clipVisualOrder: nextVisuals.map((item) => item.id).filter(Boolean),
      clipVisualStarts: {
        ...visualStarts,
        [copyId]: Math.max(0, Math.round(Number(start || 0) * 1000) / 1000),
      },
      clipVisualLanes: {
        ...nextLanes,
        [copyId]: targetLane,
      },
    });
  }, [commitClipPatch, localVisuals, timelineVisuals, visualLanes, visualStarts]);

  const updateVisualTransform = useCallback((visualId: string, transform: ClipVisualTransform) => {
    const clamp = (value: number, min: number, max: number, fallback: number) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, n));
    };
    commitClipPatch({
      clipVisualTransforms: {
        ...visualTransforms,
        [visualId]: {
          scale: clamp(transform.scale, 10, 400, 100),
          x: clamp(transform.x, -2000, 2000, 0),
          y: clamp(transform.y, -2000, 2000, 0),
          rotation: clamp(transform.rotation, -360, 360, 0),
          opacity: clamp(transform.opacity, 0, 100, 100),
        },
      },
    });
  }, [commitClipPatch, visualTransforms]);

  const updateVisualKeyframes = useCallback((visualId: string, keyframes: ClipVisualKeyframe[]) => {
    commitClipPatch({
      clipVisualKeyframes: {
        ...clipVisualKeyframes,
        [visualId]: clipVisualKeyframeList(keyframes),
      },
    });
  }, [clipVisualKeyframes, commitClipPatch]);

  const updateVisualFilter = useCallback((visualId: string, patchValue: Pick<ClipTimelineVisualMaterial, 'filter' | 'intensity' | 'hue' | 'saturation' | 'brightness' | 'contrast' | 'lutPresetId' | 'lutName' | 'lutText' | 'lutAmount' | 'speed' | 'fadeIn' | 'fadeOut' | 'transition' | 'transitionDuration' | 'fit' | 'blendMode'>) => {
    const cleanFilter = (value: unknown): ClipFilterPreset => (
      CLIP_FILTER_PRESET_IDS.includes(value as ClipFilterPreset) ? value as ClipFilterPreset : 'none'
    );
    const cleanFit = (value: unknown): ClipFit => (
      value === 'cover' || value === 'fill' ? value : 'contain'
    );
    const cleanTransition = (value: unknown): ClipTransitionPreset => (
      CLIP_TRANSITION_IDS.includes(value as ClipTransitionPreset) ? value as ClipTransitionPreset : 'none'
    );
    const n = Number(patchValue.intensity);
    const hue = Number(patchValue.hue);
    const saturation = Number(patchValue.saturation);
    const brightness = Number(patchValue.brightness);
    const contrast = Number(patchValue.contrast);
    const lutAmount = Number(patchValue.lutAmount);
    const fadeIn = Number(patchValue.fadeIn);
    const fadeOut = Number(patchValue.fadeOut);
    const transitionDuration = Number(patchValue.transitionDuration);
    const currentVisual = timelineVisuals.find((item) => item.id === visualId);
    const currentSpeed = sanitizeClipSpeed(currentVisual?.speed);
    const nextSpeed = sanitizeClipSpeed(patchValue.speed);
    const speedChanged = nextSpeed !== currentSpeed;
    const matchingSourceMetadata = clipVisualSourceMetadata[visualId]?.url === currentVisual?.url
      ? clipVisualSourceMetadata[visualId]
      : undefined;
    const nextDuration = speedChanged
      ? resolveClipSpeedDuration({
        timelineDuration: Number(currentVisual?.duration || imageDuration),
        oldSpeed: currentSpeed,
        newSpeed: nextSpeed,
        trimStart: Number(currentVisual?.trimStart || 0),
        sourceDuration: matchingSourceMetadata?.duration,
      })
      : undefined;
    if (speedChanged && nextDuration != null && nextDuration < 0.1) {
      setLocalError('片段过短，无法应用该倍速（最短 0.1 秒）');
      return;
    }
    commitClipPatch({
      clipVisualFilters: {
        ...visualFilters,
        [visualId]: {
          filter: cleanFilter(patchValue.filter),
          intensity: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 65,
          hue: Number.isFinite(hue) ? Math.max(-180, Math.min(180, Math.round(hue))) : 0,
          saturation: Number.isFinite(saturation) ? Math.max(0, Math.min(200, Math.round(saturation))) : 100,
          brightness: Number.isFinite(brightness) ? Math.max(0, Math.min(200, Math.round(brightness))) : 100,
          contrast: Number.isFinite(contrast) ? Math.max(0, Math.min(200, Math.round(contrast))) : 100,
          lutPresetId: typeof patchValue.lutPresetId === 'string' && /^[a-z0-9][a-z0-9._-]{0,96}$/i.test(patchValue.lutPresetId) ? patchValue.lutPresetId : '',
          lutName: typeof patchValue.lutName === 'string' ? patchValue.lutName.trim().slice(0, 120) : '',
          lutText: typeof patchValue.lutText === 'string' && /LUT_3D_SIZE/i.test(patchValue.lutText) ? patchValue.lutText.slice(0, 3_000_000) : '',
          lutAmount: Number.isFinite(lutAmount) ? Math.max(0, Math.min(1, Math.round(lutAmount * 1000) / 1000)) : 1,
          speed: nextSpeed,
          fadeIn: Number.isFinite(fadeIn) ? Math.max(0, Math.min(60, Math.round(fadeIn * 1000) / 1000)) : 0,
          fadeOut: Number.isFinite(fadeOut) ? Math.max(0, Math.min(60, Math.round(fadeOut * 1000) / 1000)) : 0,
          transition: cleanTransition(patchValue.transition),
          transitionDuration: Number.isFinite(transitionDuration) ? Math.max(0.1, Math.min(5, Math.round(transitionDuration * 1000) / 1000)) : 0.5,
          fit: cleanFit(patchValue.fit),
          blendMode: patchValue.blendMode || 'normal',
        },
      },
      ...(speedChanged ? {
        clipVisualDurations: {
          ...visualDurations,
          [visualId]: nextDuration,
        },
      } : {}),
    });
  }, [clipVisualSourceMetadata, commitClipPatch, imageDuration, timelineVisuals, visualDurations, visualFilters]);

  const importFiles = useCallback(async (files: File[]) => {
    const accepted = files.map((file) => ({ file, kind: inferClipFileKind(file) })).filter((item): item is { file: File; kind: 'image' | 'video' | 'audio' } => !!item.kind);
    if (accepted.length === 0) {
      setLocalError('没有可导入的图片、视频或音频文件');
      return;
    }
    setLocalError('');
    try {
      const nextVisuals = [...localVisuals];
      const nextAudios = objectList(d.clipLocalAudios);
      for (const item of accepted) {
        const size = await probeLocalClipAspect(item.file, item.kind);
        const uploaded = await uploadClipAsset(item.file);
        const imported = {
          id: `clip-local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: item.kind,
          url: uploaded.url,
          label: item.file.name || uploaded.filename,
          ...size,
          ...(size.width && size.height ? { aspectRatio: size.width / size.height } : {}),
        };
        if (item.kind === 'audio') nextAudios.push(imported);
        else nextVisuals.push({ ...imported, kind: item.kind });
      }
      commitClipPatch({
        clipLocalVisuals: serializeClipLocalVisuals(nextVisuals),
        clipLocalAudios: nextAudios,
        ...(previewRatioMode === 'manual' ? {} : { clipRatioMode: 'auto' }),
      });
    } catch (error: any) {
      setLocalError(error?.message || '素材导入失败');
    }
  }, [commitClipPatch, d.clipLocalAudios, localVisuals, previewRatioMode]);

  const importCoverFile = useCallback(async (file: File) => {
    const kind = inferClipFileKind(file);
    if (kind !== 'image') {
      setLocalError('封面只能上传图片');
      return;
    }
    setLocalError('');
    try {
      const uploaded = await uploadClipAsset(file);
      clipEditRevisionRef.current += 1;
      update({
        clipCoverUrl: uploaded.url,
        clipCoverSource: 'local',
      });
    } catch (error: any) {
      setLocalError(error?.message || '封面上传失败');
    }
  }, [update]);

  const handleRender = useCallback(async () => {
    const renderInvocation = ++clipRenderInvocationRef.current;
    const editRevision = clipEditRevisionRef.current;
    const renderUpstreamMaterialFingerprint = latestUpstreamMaterialFingerprintRef.current;
    const isRenderRequestCurrent = () => (
      clipRenderInvocationRef.current === renderInvocation
      && clipEditRevisionRef.current === editRevision
      && latestUpstreamMaterialFingerprintRef.current === renderUpstreamMaterialFingerprint
    );
    const discardStaleRender = () => {
      if (isRenderRequestCurrent()) return false;
      if (clipRenderInvocationRef.current !== renderInvocation) return true;
      const message = '剪辑内容已更新，请重新导出';
      setLocalError(message);
      update({ status: 'error', error: message });
      return true;
    };
    setLocalError('');
    if (!canRender) {
      const message = '请至少连接 1 个图片或视频素材';
      setLocalError(message);
      update({ status: 'error', error: message });
      return;
    }
    const pendingGeneration = timelineVisuals.find((item) => {
      const generation = sanitizeClipGenerationState(item.generation);
      return !item.disabled && generation && (generation.status !== 'success' || !(item.url || generation.outputUrl));
    });
    if (pendingGeneration?.generation) {
      const message = `${pendingGeneration.generation.nodeType === 'image' ? '图像生成' : '视频生成'}片段尚未完成，完成后才能导出`;
      setLocalError(message);
      update({ status: 'error', error: message });
      return;
    }

    update({ status: 'running', error: '', videoUrl: '' });
    try {
      const activeVideoVisuals = timelineVisuals.filter((item) => !item.disabled && item.kind === 'video');
      const activeVideoUrls = Array.from(new Set(activeVideoVisuals.map((item) => item.url || '').filter(Boolean)));
      const audioUrls = Array.from(new Set(timelineAudios.map((item) => item.url || '').filter(Boolean)));
      const videoProbeItems = activeVideoUrls.length ? await probeVisualSourceUrls(activeVideoUrls) : [];
      if (discardStaleRender()) return;
      const audioProbeItems = audioUrls.length ? await probeClipMedia(audioUrls) : [];
      if (discardStaleRender()) return;
      const exportReconciliation = reconcileClipVisualSourceDurations({
        visuals: timelineVisuals,
        currentDurations: visualDurations,
        currentSourceMetadata: clipVisualSourceMetadata,
        probes: videoProbeItems,
      });
      const missingSourceMetadataVisual = activeVideoVisuals.find((item) => {
        const metadata = exportReconciliation.sourceMetadata[item.id || ''];
        return normalizeVisualSourceUrl(metadata?.url) !== normalizeVisualSourceUrl(item.url)
          || !Number.isFinite(Number(metadata?.duration))
          || Number(metadata?.duration) <= 0;
      });
      if (missingSourceMetadataVisual) {
        const message = '媒体时长预检失败：无法读取视频源时长';
        setLocalError(message);
        update({ status: 'error', error: message });
        return;
      }
      const activeInvalidVisualId = exportReconciliation.invalidIds.find((visualId) => (
        activeVideoVisuals.some((item) => item.id === visualId)
      ));
      if (activeInvalidVisualId) {
        const message = '媒体边界错误：裁剪起点超出视频时长';
        setLocalError(message);
        update({ status: 'error', error: message });
        return;
      }
      const exportInvalidVisualIds = new Set(exportReconciliation.invalidIds);
      const reconciledVisuals = timelineVisuals
        .map((item) => ({
          ...item,
          duration: Number(exportReconciliation.durations[item.id || ''] ?? item.duration),
          sourceInvalid: exportInvalidVisualIds.has(item.id || ''),
        }))
        .filter((item) => !exportInvalidVisualIds.has(item.id || ''));
      const tooShortVisual = reconciledVisuals.find((item) => (
        !item.disabled
        && Number.isFinite(Number(item.duration))
        && Number(item.duration) < 0.1
      ));
      if (tooShortVisual) {
        const message = '媒体时长预检失败：存在短于 0.1 秒的片段';
        setLocalError(message);
        update({ status: 'error', error: message });
        return;
      }
      const reconciledAudios = reconcileProbedClipAudioDurations({
        audios: timelineAudios,
        probes: audioProbeItems,
      });
      const tooShortAudio = reconciledAudios.items.find((item) => (
        Number(item.duration) > 0
        && Number(item.duration) < 0.1
      ));
      if (tooShortAudio) {
        const message = '音频片段过短，无法导出（最短 0.1 秒）';
        setLocalError(message);
        update({ status: 'error', error: message });
        return;
      }
      const project = buildClipDraftFromTimeline({
        visuals: reconciledVisuals,
        audios: reconciledAudios.items,
        texts: timelineTexts,
      }, exportSettings, {
        visualTransforms,
        visualKeyframes: clipVisualKeyframes,
      });
      const result = await renderClipProject(project, {
        cover: {
          mode: coverSource === 'local' && coverUrl ? 'local' : 'frame',
          time: coverTime,
          url: coverSource === 'local' ? coverUrl : '',
        },
      });
      if (discardStaleRender()) return;
      const nextCoverUrl = result.coverUrl || (coverSource === 'local' ? coverUrl : '') || '';
      update({
        status: 'success',
        error: '',
        videoUrl: result.url,
        videoUrls: [result.url],
        coverUrl: nextCoverUrl,
        imageUrl: nextCoverUrl,
        imageUrls: nextCoverUrl ? [nextCoverUrl] : [],
        clipCoverUrl: nextCoverUrl,
        clipLastProject: project,
        clipLastRender: {
          ...result,
          coverUrl: nextCoverUrl,
          coverTime: result.coverTime ?? coverTime,
        },
        ...(exportReconciliation.durationsChanged ? { clipVisualDurations: exportReconciliation.durations } : {}),
        ...(exportReconciliation.sourceMetadataChanged ? { clipVisualSourceMetadata: exportReconciliation.sourceMetadata } : {}),
        ...(reconciledAudios.changed ? { clipAudioEdits: reconciledAudios.items } : {}),
      });
    } catch (error: any) {
      if (discardStaleRender()) return;
      const message = error?.message || '剪辑导出失败';
      setLocalError(message);
      update({ status: 'error', error: message });
    }
  }, [canRender, clipVisualKeyframes, clipVisualSourceMetadata, coverSource, coverTime, coverUrl, exportSettings, probeVisualSourceUrls, timelineAudios, timelineTexts, timelineVisuals, update, visualDurations, visualTransforms]);

  useRunTrigger(id, async () => {
    if (status === 'running') return;
    await handleRender();
  }, 'video');

  const error = localError || d.error || '';
  const canUndoEdit = clipHistoryVersion >= 0 && clipHistoryPastRef.current.length > 0;
  const canRedoEdit = clipHistoryVersion >= 0 && clipHistoryFutureRef.current.length > 0;

  return (
    <div className="contents" data-canvas-node-root={true}>
    <div
      {...dropProps}
      className={`t8-node w-[360px] overflow-hidden rounded-lg bg-[var(--t8-bg-node)] text-[var(--t8-text-main)] ${selected ? 'is-selected' : ''} ${isAccepting ? 'border-emerald-300 ring-2 ring-emerald-300/45' : ''}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: COLOR }} />
      <Handle type="source" position={Position.Right} style={{ background: COLOR }} />

      <div className="flex items-center gap-2 border-b border-[var(--t8-border)] bg-orange-500/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500 text-white">
          <Scissors size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">剪辑台</div>
          <div className="truncate text-[10px] text-[var(--t8-text-muted)]">
            图{upstream.images.length} · 视{upstream.videos.length} · 音{upstream.audios.length} · 文{upstream.texts.length}
          </div>
        </div>
        {status === 'running' ? <Loader2 className="animate-spin text-orange-300" size={16} /> : <Film size={16} className="text-orange-300" />}
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1">
            <span className="block text-[10px] font-bold text-[var(--t8-text-muted)]">画幅</span>
            <select className={selectClass} value={activeClipRatio} onChange={(event) => patch({ clipRatio: event.target.value, clipRatioMode: 'manual' })}>
              {CLIP_RATIO_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold text-[var(--t8-text-muted)]">清晰度</span>
            <select className={selectClass} value={resolution} onChange={(event) => patch({ clipResolution: event.target.value })}>
              {CLIP_RESOLUTION_PRESETS.map((preset) => (
                <option key={preset} value={preset}>{preset}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold text-[var(--t8-text-muted)]">FPS</span>
            <select className={selectClass} value={String(fps)} onChange={(event) => patch({ clipFps: Number(event.target.value) })}>
              <option value="24">24</option>
              <option value="30">30</option>
              <option value="60">60</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-[1fr_84px] gap-2">
          <label className="space-y-1">
            <span className="block text-[10px] font-bold text-[var(--t8-text-muted)]">图片时长</span>
            <input
              className={inputClass}
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              value={imageDuration}
              onChange={(event) => patch({ clipImageDuration: Number(event.target.value) })}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold text-[var(--t8-text-muted)]">背景</span>
            <input
              className="nodrag h-[30px] w-full cursor-pointer rounded-md border border-[var(--t8-border)] bg-transparent p-1"
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(background) ? background : '#000000'}
              onChange={(event) => patch({ clipBackground: event.target.value })}
            />
          </label>
        </div>

        <div className="rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-elevated)] p-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold">剪辑草稿</span>
            <span className="text-[var(--t8-text-muted)]">{activeVisualCount}/{timelineVisuals.length} · {formatSeconds(estimatedDuration)}</span>
          </div>
          <div className="max-h-20 space-y-1 overflow-auto text-[10px] text-[var(--t8-text-muted)]">
            {timelineVisuals.length === 0 ? (
              <div>连接图片或视频后打开剪辑编辑器</div>
            ) : (
              timelineVisuals.slice(0, 4).map((item) => (
                <div key={item.id} className={`truncate ${item.disabled ? 'opacity-45' : ''}`}>
                  {item.kind === 'image' ? '图片' : '视频'} · {item.label || fileNameFromUrl(item.url || '')}
                </div>
              ))
            )}
          </div>
          {upstream.audios.length > 0 || upstream.texts.length > 0 ? (
            <div className="mt-1 truncate text-[10px] text-[var(--t8-text-muted)]">
              音频 {upstream.audios.length} · 文本 {upstream.texts.length}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="nodrag flex h-9 w-full items-center justify-center gap-2 rounded-md border border-orange-300/50 bg-orange-500/10 px-3 text-xs font-black text-orange-100 hover:bg-orange-500/20"
          onClick={() => setEditorOpen(true)}
          title="打开剪辑编辑器"
        >
          <Maximize2 size={15} />
          打开剪辑编辑器
        </button>

        <button
          type="button"
          className="nodrag flex h-9 w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-55"
          onClick={handleRender}
          disabled={status === 'running' || !canRender}
          title="导出剪辑视频"
        >
          {status === 'running' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {status === 'running' ? '导出中' : '导出 MP4'}
        </button>

        {error ? (
          <div className="flex items-start gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-300">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        ) : null}

        {outputUrl && !hasAutoOutput ? (
          <div className="rounded-md border border-[var(--t8-border)] bg-black/35 p-2">
            {displayCoverUrl ? (
              <div className="mb-2 flex items-center gap-2 rounded border border-[var(--t8-border)] bg-[var(--t8-bg-panel-elevated)] p-1.5 text-[10px] text-[var(--t8-text-muted)]">
                <img className="h-10 w-16 rounded object-cover" src={displayCoverUrl} alt="" />
                <span className="min-w-0 flex-1 truncate">封面已随本次导出保存</span>
              </div>
            ) : null}
            <video className="nodrag max-h-48 w-full rounded bg-black" src={outputUrl} controls playsInline />
            <div className="mt-2 space-y-1.5 text-[10px] text-[var(--t8-text-muted)]">
              <div className="min-w-0 truncate">服务器临时输出链接：{outputUrl}</div>
              <div>默认会进入浏览器下载目录，或用“另存为”指定位置。</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="nodrag inline-flex h-7 shrink-0 items-center gap-1 rounded border border-emerald-300/40 bg-emerald-400/10 px-2 text-[10px] font-black text-emerald-100 hover:bg-emerald-400/20"
                onClick={saveRenderToResourceLibrary}
                title="保存成片到资源库"
              >
                <Save size={12} />
                保存成片到资源库
              </button>
              <button
                type="button"
                className="nodrag inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[var(--t8-border)] bg-[var(--t8-bg-panel-elevated)] px-2 text-[10px] font-black text-[var(--t8-text-main)] hover:bg-[var(--t8-bg-panel-muted)]"
                onClick={downloadRenderToFile}
                title="另存为到浏览器下载目录"
              >
                <Download size={12} />
                另存为
              </button>
              <a
                className="nodrag inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[var(--t8-border)] bg-transparent px-2 text-[10px] font-black text-[var(--t8-text-muted)] hover:bg-white/5"
                href={outputUrl}
                target="_blank"
                rel="noreferrer"
                download={`t8-clip-${Date.now()}.mp4`}
              >
                打开链接
              </a>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-1 text-[10px] text-[var(--t8-text-muted)]">
          <Settings2 size={12} />
          <span>导出会按当前时间线顺序、隐藏状态和图片秒数生成。</span>
        </div>
      </div>
    </div>
    <ClipStudioEditor
      open={editorOpen}
      status={status}
      outputUrl={outputUrl}
      error={error}
      exportSettings={exportSettings}
      draft={draft}
      timelineVisuals={timelineVisuals}
      audios={timelineAudios}
      texts={timelineTexts}
      canvasMaterials={canvasMaterials}
      resourceMaterials={resourceMaterials}
      resourceLoading={resourceLoading}
      imageDuration={imageDuration}
      ratio={activeClipRatio}
      clipRatioMode={previewRatioMode as ClipRatioMode}
      resolution={resolution}
      fps={fps}
      background={/^#[0-9a-f]{6}$/i.test(background) ? background : '#000000'}
      editorLayout={editorLayout}
      trackHeights={trackHeights}
      coverUrl={displayCoverUrl}
      coverTime={coverTime}
      visualTransforms={visualTransforms}
      clipVisualKeyframes={clipVisualKeyframes}
      canRender={canRender}
      canUndoEdit={canUndoEdit}
      canRedoEdit={canRedoEdit}
      onClose={() => setEditorOpen(false)}
      onRender={handleRender}
      onUndoEdit={undoClipEdit}
      onRedoEdit={redoClipEdit}
      onImportFiles={importFiles}
      onImportCoverFile={importCoverFile}
      onImportMaterial={importMaterialToTimeline}
      onRefreshResourceLibrary={refreshResourceLibrary}
      onMoveVisual={moveVisual}
      onReorderVisual={reorderVisual}
      onReorderVisualByDropX={reorderVisualByDropX}
      onToggleVisual={toggleVisual}
      onSetVisualLaneVisibility={setVisualLaneVisibility}
      onRemoveVisual={removeVisual}
      onSplitVisual={splitVisual}
      onSplitVisualAtTime={splitVisualAtTime}
      onSplitLinkedAtTime={splitLinkedAtTime}
      onTrimVisualSide={trimVisualSide}
      onDuplicateVisual={duplicateVisual}
      onDuplicateVisualToLane={duplicateVisualToLane}
      onDuplicateVisualByDrag={duplicateVisualByDrag}
      onUpdateVisualDuration={updateVisualDuration}
      onUpdateVisualStart={updateVisualStart}
      onUpdateVisualTiming={updateVisualTiming}
      onCompactTimeline={compactVisualTimeline}
      onCleanupTimelineMedia={cleanupTimelineMedia}
      onApplyQuickTemplate={applyQuickTemplate}
      onUpdateVisualTransform={updateVisualTransform}
      onUpdateVisualKeyframes={updateVisualKeyframes}
      onUpdateVisualFilter={updateVisualFilter}
      onUpdateAudioTiming={updateAudioTiming}
      onUpdateAudioSettings={updateAudioSettings}
      onRemoveAudio={removeAudio}
      onDuplicateAudio={duplicateAudio}
      onSplitAudioAtTime={splitAudioAtTime}
      onUpdateTextTiming={updateTextTiming}
      onUpdateTextSettings={updateTextSettings}
      onRemoveText={removeText}
      onDuplicateText={duplicateText}
      onSplitTextAtTime={splitTextAtTime}
      onCreateTextClip={createTextClip}
      onCreateGenerationClip={createGenerationClip}
      onUpdateGenerationClip={updateGenerationClip}
      onUploadGenerationRefs={uploadGenerationRefs}
      onRunGenerationClip={runGenerationClip}
      onPatchSettings={patch}
    />
    </div>
  );
};

export default memo(ClipStudioNode);

