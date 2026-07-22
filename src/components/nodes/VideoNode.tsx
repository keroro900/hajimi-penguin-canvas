import { memo, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { flushSync } from 'react-dom';
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { AlertCircle, Eye, Loader2, RefreshCcw, Video as VideoIcon, Sparkles, Square, X } from 'lucide-react';
import {
  VIDEO_MODELS,
  GROK_VIDEO_1_5_NEW_SIZES,
  apishuVeoOmniMode,
  grokVideo15NewSizeFromRatio,
  isFalVideoModel,
  isGrokVideo15NewModel,
  VIDEO_FAL_REGISTRY,
  VEO_FAL_RATIOS,
  VEO_FAL_DURATIONS,
  VEO_FAL_RESOLUTIONS,
  GROK_FAL_RATIOS,
  GROK_FAL_RESOLUTIONS,
  GROK_FAL_MODES,
  SORA2_FAL_MODES,
  SORA2_FAL_RATIOS,
  SORA2_FAL_DURATIONS,
  SORA2_FAL_RESOLUTIONS,
  parseModelList,
  resolvePersistedModelSelection,
  withUpstreamModelOption,
} from '../../providers/models';
import { modelSelectOptions, modelsForKind } from '../../providers/modelCatalog';
import {
  generateExternalVideo,
  submitVideo,
  queryVideo,
  submitVideoFal,
  queryVideoFal,
  type VideoSubmitRequest,
  type VideoFalSubmitRequest,
} from '../../services/generation';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useHasAutoOutput } from './useHasAutoOutput';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useRunBusStore } from '../../stores/runBus';
import { useOutsideClose } from './shared/useOutsideClose';
import { smartNodeComposerActions, useIsSmartNodeComposerOpen } from '../../stores/smartNodeComposer';
import { logBus } from '../../stores/logs';
import { useThemeStore } from '../../stores/theme';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import { useOrderedMaterials } from './useOrderedMaterials';
import MaterialPreviewSection from './MaterialPreviewSection';
import {
  pruneMaterialIdsForDisconnectedSource,
  pruneMaterialOrderForDisconnectedSource,
  useDisconnectUpstreamMaterial,
} from './shared/upstreamMaterialConnections';
import MentionPromptInput from './MentionPromptInput';
import LoopingVideo from '../LoopingVideo';
import SmartImage from '../SmartImage';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';
import { useDragMaterialStore, type MaterialPayload } from '../../stores/dragMaterial';
import { useMaterialDropTarget } from '../../hooks/useMaterialDropTarget';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useApiKeysStore } from '../../stores/apiKeys';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  countExcludedMaterials,
  filterExcludedMaterials,
  normalizeExcludedMaterialIds,
} from '../../utils/materialExclusion';
import { resolveSmartMediaCardSize } from '../../utils/smartNodeAspect';
import { LocalNodeAddonSlot } from 'virtual:t8-local-extensions';
import ResizableCorners from './ResizableCorners';
import SmartNodeComposer from './shared/SmartNodeComposer';
import SmartNodeShell from './shared/SmartNodeShell';
import { useNodeGeometrySync } from './shared/useNodeGeometrySync';
import { useSmartNodePanelToggle } from './shared/useSmartNodePanelToggle';
import { useThrottledNodeUpdate } from './shared/useThrottledNodeUpdate';
import SmartMediaPreviewModal from './shared/SmartMediaPreviewModal';
import { probeVideo } from '../../services/videoOps';
import { resolveVideoDisplaySize } from '../../utils/videoDisplayAspect';

/**
 * VideoNode - 异步视频生成(完全对齐 gpt-image-2-web)
 * 支持:
 *   - Veo      (kind=veo)       — 默认 veo-omni-10s / 旧 Veo 3.1 子模型 / images(≤3)
 *   - Grok Video(kind=grok)     — Zhenzhen Grok 1.5 New / Grok Video 1.5 FAL / 旧版 FAL / grok-video-3 / images
 *   - Sora2    (kind=sora)      — Zhenzhen API + FAL 双渠道 / Base64 参考图(≤1)
 *   - Seedance  (kind=seedance) — 零破坏兼容旧 veo 字段
 * 流程: submit → poll(5s 间隔) → 转存 → 展示
 */
const VIDEO_POLL_TIMEOUT_SECONDS = 3600;
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_MAX_POLL = Math.ceil((VIDEO_POLL_TIMEOUT_SECONDS * 1000) / VIDEO_POLL_INTERVAL_MS);
const VIDEO_FAL_POLL_INTERVAL_MS = 6000;
const VIDEO_FAL_MAX_POLL = Math.ceil((VIDEO_POLL_TIMEOUT_SECONDS * 1000) / VIDEO_FAL_POLL_INTERVAL_MS);
const JIMENG_SEEDANCE_LIMITS = { images: 9, videos: 3, audios: 3 };
type JimengSeedanceMode = 'omni' | 'first' | 'firstlast' | 'multiframe';
const JIMENG_SEEDANCE_MODE_OPTIONS: Array<{ value: JimengSeedanceMode; label: string }> = [
  { value: 'omni', label: '全能参考' },
  { value: 'first', label: '首帧图生视频' },
  { value: 'firstlast', label: '首尾帧生视频' },
  { value: 'multiframe', label: '智能多帧' },
];

const splitGrokFalRefUrls = (raw: string): string[] =>
  String(raw || '')
    .split(/[\n,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const normalizeJimengSeedanceMode = (value: unknown): JimengSeedanceMode => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'first') return 'first';
  if (text === 'firstlast' || text === 'first_last' || text === 'frames2video') return 'firstlast';
  if (text === 'multiframe' || text === 'smart' || text === 'smart-multiframe') return 'multiframe';
  return 'omni';
};

function formatVideoNodeText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || fallback;
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const code = formatVideoNodeText(source.code);
    const message = formatVideoNodeText(source.message || source.error || source.reason || source.failReason);
    if (code && message) return `${code}: ${message}`;
    if (message) return message;
    if (code) return code;
    try {
      return JSON.stringify(value);
    } catch {
      return fallback || String(value);
    }
  }
  return String(value);
}

const VideoNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const { scheduleProgressUpdate, flushProgressUpdate } = useThrottledNodeUpdate(update, 500);
  const hasAutoOutput = useHasAutoOutput(id);
  const updateNodeInternals = useUpdateNodeInternals();
  const { getEdges, getNodes } = useReactFlow();
  const [error, setError] = useState<string | null>(null);
  const smartComposerOpenLocal = useIsSmartNodeComposerOpen(id);
  const setSmartComposerOpenLocal = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) smartNodeComposerActions.open(id);
      else smartNodeComposerActions.close(id);
    },
    [id],
  );
  const [smartCardDragging, setSmartCardDragging] = useState(false);
  const [videoNaturalRatio, setVideoNaturalRatio] = useState('');
  const [videoProbedSize, setVideoProbedSize] = useState<{ width: number; height: number; ratio: string } | null>(null);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const videoRunSeqRef = useRef(0);
  const activePollRejectRef = useRef<((error: Error) => void) | null>(null);
  const runCancelSeq = useRunBusStore((s) => s.cancelSeq);
  const runCancelTargets = useRunBusStore((s) => s.cancelTargets);
  const smartNodeRef = useRef<HTMLDivElement | null>(null);
  const smartPromptRef = useRef<HTMLDivElement | null>(null);
  const src = `video:${id.slice(0, 6)}`;
  const throwIfVideoRunCancelled = (runSeq: number) => {
    if (videoRunSeqRef.current !== runSeq) throw new Error('已停止生成');
  };

  // 主题适配 (默认科技风深色, 传递给聚合预览区)
  const { theme, style: themeStyle } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = themeStyle === 'pixel';

  const d = data as any;
  const providerParams = (d?.providerParams && typeof d.providerParams === 'object') ? d.providerParams : {};
  const apiSettings = useApiKeysStore((s) => s.settings);
  const advancedProviders = apiSettings.advancedProviders;
  const videoAdvancedProviders = useMemo(
    () => advancedProvidersForNode(advancedProviders, 'video'),
    [advancedProviders],
  );
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'video', {
      providerSource: d?.providerSource,
      providerId: d?.providerId,
      providerModel: d?.providerModel,
    }),
    [advancedProviders, d?.providerSource, d?.providerId, d?.providerModel],
  );
  const isExternalSelected = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const savedExternalMissing = !!d?.providerSource && d.providerSource !== 'zhenzhen' && !providerSelection.available;
  const externalModelOptions = providerSelection.provider
    ? advancedProviderModelOptions(providerSelection.provider, 'video')
    : [];
  const externalProviderModel = providerSelection.providerModel || externalModelOptions[0] || '';
  const isAgnesExternalSelected = isExternalSelected && providerSelection.provider?.protocol === 'agnes';
  const isJimengCliSelected = isExternalSelected && providerSelection.provider?.protocol === 'jimeng-cli';
  const isJimengSeedanceSelected = isJimengCliSelected && /seedance|jimeng-video|video/i.test(externalProviderModel);
  const jimengSeedanceMode = normalizeJimengSeedanceMode(providerParams.frameMode ?? d?.jimengFrameMode);
  const agnesFrameRate = Number(providerParams.frameRate ?? providerParams.frame_rate ?? 24) || 24;
  const agnesNumFrames = providerParams.numFrames ?? providerParams.num_frames ?? '';
  const updateProviderParams = (patch: Record<string, any>) => update({ providerParams: { ...providerParams, ...patch } });
  const catalogVideoModels = useMemo(() => modelsForKind(apiSettings, 'video'), [apiSettings]);
  const rawModel = typeof d?.model === 'string' ? d.model : '';
  const isLegacySora2Model = /^sora-2(?:-\d{4}-\d{2}-\d{2})?$/.test(rawModel);
  const mainId = d?.mainId || (isLegacySora2Model ? 'sora-2' : (d?.model && VIDEO_MODELS.find((m) => (
    m.id === d.model || m.apiModelOptions.some((o) => o.value === d.model)
  ))?.id)) || VIDEO_MODELS[0].id;
  const modelDef = useMemo(() => VIDEO_MODELS.find((m) => m.id === mainId) || VIDEO_MODELS[0], [mainId]);
  const configuredApiModelOverride = String(apiSettings.zhenzhenVideoModelOverrides?.[modelDef.id] || '').trim();
  const configuredApiModels = parseModelList(configuredApiModelOverride);
  let apiModelOptions = withUpstreamModelOption(modelDef.apiModelOptions, configuredApiModelOverride);
  for (const option of modelSelectOptions(catalogVideoModels)) {
    if (!apiModelOptions.some((existing) => existing.value === option.value)) apiModelOptions.push(option);
  }
  const persistedModelSelection = resolvePersistedModelSelection(
    apiModelOptions,
    rawModel,
    configuredApiModels[0] || modelDef.apiModelOptions[0].value,
  );
  apiModelOptions = persistedModelSelection.options;
  const apiModel = persistedModelSelection.value;
  const effectiveApiModel = apiModel;
  const omniVideoMode = !isExternalSelected ? apishuVeoOmniMode(apiModel) : null;
  const isApishuVeoOmni = omniVideoMode !== null;
  const isApishuVeoOmniComponents = omniVideoMode === 'components';
  const isApishuVeoOmniEdit = omniVideoMode === 'edit';
  const protocolModel: string = String(d?.protocolModel || '').trim();
  const pollingApiModel = protocolModel || effectiveApiModel;
  const defaultProviderApiModel = effectiveApiModel;
  // 各参数(跳过着调用 update 默认值)
  const ratio: string = d?.ratio || modelDef.defaultRatio;
  const savedDuration = Number(d?.duration ?? modelDef.defaultDuration ?? (modelDef.durations?.[0] || 0));
  const duration: number = isApishuVeoOmni && ![4, 6, 8, 10].includes(savedDuration) ? 6 : savedDuration;
  const savedResolution = String(d?.resolution || (isJimengSeedanceSelected ? '720p' : modelDef.defaultResolution || ''));
  const resolution: string = isApishuVeoOmni
    ? (['720p', '1080p', '4k'].includes(savedResolution.toLowerCase()) ? savedResolution.toLowerCase() : '720p')
    : savedResolution;
  const seed: number = typeof d?.seed === 'number' ? d.seed : 0;
  const enhancePrompt: boolean = d?.enhancePrompt ?? false;
  const enableUpsample: boolean = d?.enableUpsample ?? false;

  // FAL 专属参数
  const isFal = isFalVideoModel(apiModel);
  const falReg = isFal ? VIDEO_FAL_REGISTRY[apiModel] : null;
  const isGrokFalV15 = apiModel === 'grok-imagine-video-1.5';
  const isGrok15New = !isExternalSelected && isGrokVideo15NewModel(apiModel);
  const grok15NewSize = d?.size === '1280x720' || d?.size === '720x1280'
    ? d.size
    : grokVideo15NewSizeFromRatio(ratio);
  const isSoraZhenzhen = !isExternalSelected && modelDef.kind === 'sora' && !isFal;
  const isVeoOmni = !isExternalSelected && apiModel === 'veo-omni-10s';
  const showBuiltinFalControls = !isExternalSelected && isFal && !!falReg;
  const showGenericVideoControls = isExternalSelected || !isFal;
  const ratioOptions = isApishuVeoOmni
    ? ['16:9', '9:16']
    : isJimengSeedanceSelected
    ? ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
    : isAgnesExternalSelected
    ? ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
    : isGrok15New
    ? ['16:9', '9:16']
    : modelDef.ratios;
  const durationOptions = isApishuVeoOmni
    ? [4, 6, 8, 10]
    : isJimengSeedanceSelected
    ? [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    : isAgnesExternalSelected
    ? [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18]
    : isGrok15New
    ? []
    : modelDef.durations || [];
  const resolutionOptions = isApishuVeoOmni
    ? ['720p', '1080p', '4k']
    : isJimengSeedanceSelected
    ? ['480p', '720p', '1080p']
    : isAgnesExternalSelected
    ? ['480p', '720p', '1080p']
    : isGrok15New
    ? []
    : modelDef.resolutions || [];
  // veo-fal 专属
  const vfRatio: string = d?.vfRatio || '16:9';
  const vfDuration: string = d?.vfDuration || '8s';
  const vfResolution: string = d?.vfResolution || '720p';
  const vfAudio: boolean = d?.vfAudio ?? false;
  const vfSafety: number = d?.vfSafety ?? 4;
  // grok-fal 专属
  const gkfMode: 'image_to_video' | 'reference_to_video' = isGrokFalV15
    ? 'image_to_video'
    : d?.gkfMode === 'image_to_video' ? 'image_to_video' : 'reference_to_video';
  const gkfRatio: string = d?.gkfRatio || '16:9';
  const gkfDuration: number = d?.gkfDuration ?? 6;
  const gkfResolution: string = d?.gkfResolution || '720p';
  const gkfReferenceUrls: string = d?.gkfReferenceUrls || '';
  // sora-fal 专属(图片传入默认 base64,与 gpt-image-2-web srf_imgway 默认一致)
  const soraMode: 'auto' | 'text_to_video' | 'image_to_video' = d?.soraMode || 'auto';
  const soraRatio: string = d?.soraRatio || '16:9';
  const soraDuration: number = d?.soraDuration ?? 4;
  const soraResolution: string = d?.soraResolution || '720p';
  const soraDeleteVideo: boolean = d?.soraDeleteVideo ?? true;
  const soraBlockIp: boolean = d?.soraBlockIp ?? false;
  const soraCharacterIds: string = d?.soraCharacterIds || '';
  const soraPrivate: boolean = d?.soraPrivate ?? true;

  const status: 'idle' | 'submitting' | 'polling' | 'success' | 'error' = d?.status || 'idle';
  const taskId: string | undefined = d?.taskId;
  const videoUrl: string | undefined = d?.videoUrl;
  const progress: string = formatVideoNodeText(d?.progress);
  const localPrompt: string = d?.prompt || '';
  const promptMentions: MediaMention[] = Array.isArray(d?.promptMentions) ? d.promptMentions : [];

  // === 上游素材聚合 (跨节点统一机制) ===
  const upstream = useUpstreamMaterials(id);
  const excludedMaterialIds = useMemo(
    () => normalizeExcludedMaterialIds(d?.excludedMaterialIds),
    [d?.excludedMaterialIds],
  );
  const visibleUpstreamTexts = useMemo(
    () => filterExcludedMaterials(upstream.texts, excludedMaterialIds),
    [upstream.texts, excludedMaterialIds],
  );
  const visibleUpstreamImages = useMemo(
    () => filterExcludedMaterials(upstream.images, excludedMaterialIds),
    [upstream.images, excludedMaterialIds],
  );
  const visibleUpstreamVideos = useMemo(
    () => filterExcludedMaterials(upstream.videos, excludedMaterialIds),
    [upstream.videos, excludedMaterialIds],
  );
  const visibleUpstreamAudios = useMemo(
    () => filterExcludedMaterials(upstream.audios, excludedMaterialIds),
    [upstream.audios, excludedMaterialIds],
  );
  const excludedUpstreamCount = useMemo(
    () => countExcludedMaterials(excludedMaterialIds, [...upstream.texts, ...upstream.images, ...upstream.videos, ...upstream.audios]),
    [excludedMaterialIds, upstream.texts, upstream.images, upstream.videos, upstream.audios],
  );
  const materialOrder: string[] = Array.isArray(d?.materialOrder) ? d.materialOrder : [];
  const orderedTexts = useOrderedMaterials(visibleUpstreamTexts, materialOrder);
  const orderedImages = useOrderedMaterials(visibleUpstreamImages, materialOrder);
  const orderedVideos = useOrderedMaterials(visibleUpstreamVideos, materialOrder);
  const orderedAudios = useOrderedMaterials(visibleUpstreamAudios, materialOrder);
  const setMaterialOrder = (newOrder: string[]) => update({ materialOrder: newOrder });
  const disconnectUpstreamMaterial = useDisconnectUpstreamMaterial(id);
  const handleExcludeUpstreamMaterial = (m: Material) => {
    if (m.origin !== 'upstream') return;
    disconnectUpstreamMaterial(m);
    update({
      excludedMaterialIds: pruneMaterialIdsForDisconnectedSource(excludedMaterialIds, m.sourceNodeId),
      materialOrder: pruneMaterialOrderForDisconnectedSource(materialOrder, m.sourceNodeId),
    });
  };
  const handleRestoreExcludedMaterials = () => update({ excludedMaterialIds: [] });

  // === 本地拖入参考素材 (跨节点 Ctrl 拖拽) ===
  const localRefImages: string[] = Array.isArray(d?.localRefImages) ? d.localRefImages : [];
  const localRefVideos: string[] = Array.isArray(d?.localRefVideos) ? d.localRefVideos : [];
  const localRefAudios: string[] = Array.isArray(d?.localRefAudios) ? d.localRefAudios : [];
  const localRefMaterials: Material[] = useMemo(
    () => [
      ...localRefImages.map((url, i) => ({
        id: `local::video-image:${url}`,
        kind: 'image' as const,
        url,
        sourceNodeId: id,
        origin: 'local' as const,
        label: `本地图片${i + 1}`,
      })),
      ...localRefVideos.map((url, i) => ({
        id: `local::video-video:${url}`,
        kind: 'video' as const,
        url,
        sourceNodeId: id,
        origin: 'local' as const,
        label: `本地视频${i + 1}`,
      })),
      ...localRefAudios.map((url, i) => ({
        id: `local::video-audio:${url}`,
        kind: 'audio' as const,
        url,
        sourceNodeId: id,
        origin: 'local' as const,
        label: `本地音频${i + 1}`,
      })),
    ],
    [localRefImages, localRefVideos, localRefAudios, id],
  );
  const orderedReferenceImages = useOrderedMaterials(
    [...visibleUpstreamImages, ...localRefMaterials.filter((m) => m.kind === 'image')],
    materialOrder,
  );
  const orderedReferenceVideos = useOrderedMaterials(
    [...visibleUpstreamVideos, ...localRefMaterials.filter((m) => m.kind === 'video')],
    materialOrder,
  );
  const orderedReferenceAudios = useOrderedMaterials(
    [...visibleUpstreamAudios, ...localRefMaterials.filter((m) => m.kind === 'audio')],
    materialOrder,
  );
  const handleRemoveLocalMaterial = (m: Material) => {
    if (m.origin !== 'local') return;
    const nextOrder = materialOrder.filter((itemId) => itemId !== m.id);
    if (m.kind === 'image') update({ localRefImages: localRefImages.filter((url) => url !== m.url), materialOrder: nextOrder });
    if (m.kind === 'video') update({ localRefVideos: localRefVideos.filter((url) => url !== m.url), materialOrder: nextOrder });
    if (m.kind === 'audio') update({ localRefAudios: localRefAudios.filter((url) => url !== m.url), materialOrder: nextOrder });
  };
  const maxApishuVeoOmniRefs = isApishuVeoOmniEdit ? 1 : isApishuVeoOmniComponents ? 9 : isApishuVeoOmni ? 1 : 0;
  const maxMentionRefs =
    isApishuVeoOmni
      ? maxApishuVeoOmniRefs
      : isVeoOmni
      ? 1
      : isGrok15New
      ? 1
      : isJimengSeedanceSelected
      ? JIMENG_SEEDANCE_LIMITS.images
      : isFal && falReg
      ? falReg.paramKind === 'grok-fal' && (isGrokFalV15 || gkfMode !== 'reference_to_video')
        ? 1
        : falReg.maxRefImages
      : modelDef.maxRefImages;
  const maxMentionVideos = isJimengSeedanceSelected ? JIMENG_SEEDANCE_LIMITS.videos : (isApishuVeoOmniEdit ? 1 : 0);
  const maxMentionAudios = isJimengSeedanceSelected ? JIMENG_SEEDANCE_LIMITS.audios : 0;
  const mentionMaterials = useMemo(
    () => [
      ...orderedReferenceImages.slice(0, maxMentionRefs),
      ...orderedReferenceVideos.slice(0, maxMentionVideos),
      ...orderedReferenceAudios.slice(0, maxMentionAudios),
    ],
    [orderedReferenceImages, orderedReferenceVideos, orderedReferenceAudios, maxMentionRefs, maxMentionVideos, maxMentionAudios],
  );
  const primarySmartReferenceVideo = orderedReferenceVideos[0]?.url || '';
  const primarySmartReferenceImage = orderedReferenceImages[0]?.url || '';

  const collectConnectedVideoNodeMaterials = (): { imageUrls: string[]; videoUrls: string[]; audioUrls: string[]; texts: string[] } => {
    const imageUrls: string[] = [];
    const videoUrls: string[] = [];
    const audioUrls: string[] = [];
    const texts: string[] = [];
    const nodesById = new Map(getNodes().map((node) => [node.id, node]));
    const addString = (list: string[], value: unknown) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (trimmed && !list.includes(trimmed)) list.push(trimmed);
    };
    const addArray = (list: string[], value: unknown) => {
      if (!Array.isArray(value)) return;
      value.forEach((item) => addString(list, item));
    };

    for (const edge of getEdges()) {
      if (edge.target !== id) continue;
      const source = nodesById.get(edge.source);
      const sourceData: any = source?.data || {};
      const portType = String((edge.data as any)?.portType || '').trim();
      const allowAll = !portType || portType === 'any';
      if (allowAll || portType === 'text') {
        addString(texts, sourceData.outputText);
        addString(texts, sourceData.reply);
        addString(texts, sourceData.promptResolved);
        addString(texts, sourceData.prompt);
        addString(texts, sourceData.text);
      }
      if (allowAll || portType === 'image') {
        addString(imageUrls, sourceData.imageUrl);
        addString(imageUrls, sourceData.directImageUrl);
        addString(imageUrls, sourceData.resultUrl);
        addString(imageUrls, sourceData.firstFrameUrl);
        addString(imageUrls, sourceData.lastFrameUrl);
        addArray(imageUrls, sourceData.imageUrls);
        addArray(imageUrls, sourceData.urls);
        addArray(imageUrls, sourceData.generatedImages);
        addArray(imageUrls, sourceData.directImageUrls);
        addArray(imageUrls, sourceData.resultUrls);
        addArray(imageUrls, sourceData.referenceImages);
        addArray(imageUrls, sourceData.localRefImages);
      }
      if (allowAll || portType === 'video') {
        addString(videoUrls, sourceData.videoUrl);
        addString(videoUrls, sourceData.directVideoUrl);
        addArray(videoUrls, sourceData.videoUrls);
        addArray(videoUrls, sourceData.directVideoUrls);
        addArray(videoUrls, sourceData.referenceVideos);
        addArray(videoUrls, sourceData.localRefVideos);
      }
      if (allowAll || portType === 'audio') {
        addString(audioUrls, sourceData.audioUrl);
        addString(audioUrls, sourceData.audioUrl_1);
        addString(audioUrls, sourceData.directAudioUrl);
        addString(audioUrls, sourceData.localRefAudio);
        addArray(audioUrls, sourceData.audioUrls);
        addArray(audioUrls, sourceData.directAudioUrls);
        addArray(audioUrls, sourceData.referenceAudios);
        addArray(audioUrls, sourceData.localRefAudios);
      }
    }
    return { imageUrls, videoUrls, audioUrls, texts };
  };

  // 分组动态跟随子模型: Seedance / 即梦 CLI 支持 image/video/audio, 其他 (grok/veo/sora) 仅 image
  const previewGroups = useMemo<ReadonlyArray<'text' | 'image' | 'video' | 'audio'>>(
    () => (isApishuVeoOmniEdit ? ['text', 'image', 'video'] : (modelDef.kind === 'seedance' || isJimengSeedanceSelected ? ['text', 'image', 'video', 'audio'] : ['text', 'image'])),
    [isApishuVeoOmniEdit, modelDef.kind, isJimengSeedanceSelected],
  );

  // 收集上游 prompt + 参考图/视频/音频 (按用户拖拽顺序), 合并本地拖入素材
  const collectUpstream = (): { prompt: string; imageUrls: string[]; videoUrls: string[]; audioUrls: string[] } => {
    const prompts = orderedTexts.map((t) => t.url).filter((s) => !!s);
    const imageUrls = orderedReferenceImages.map((m) => m.url).filter((s) => !!s);
    const videoUrls = orderedReferenceVideos.map((m) => m.url).filter((s) => !!s);
    const audioUrls = orderedReferenceAudios.map((m) => m.url).filter((s) => !!s);
    const {
      imageUrls: fallbackImageUrls,
      videoUrls: fallbackVideoUrls,
      audioUrls: fallbackAudioUrls,
      texts: fallbackTexts,
    } = collectConnectedVideoNodeMaterials();
    const dedupe = (items: string[]) => {
      const out: string[] = [];
      for (const item of items) if (item && !out.includes(item)) out.push(item);
      return out;
    };
    return {
      prompt: dedupe([...prompts, ...fallbackTexts]).join('\n').trim(),
      imageUrls: dedupe([...imageUrls, ...fallbackImageUrls]),
      videoUrls: dedupe([...videoUrls, ...fallbackVideoUrls]),
      audioUrls: dedupe([...audioUrls, ...fallbackAudioUrls]),
    };
  };

  // 本地 URL 转 base64(veo/seedance 路径使用;grok 可直接传 URL)
  const urlToBase64 = async (url: string): Promise<string> => {
    const r = await fetch(url);
    const blob = await r.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const stopPoll = (reason?: Error) => {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (reason && activePollRejectRef.current) {
      const reject = activePollRejectRef.current;
      activePollRejectRef.current = null;
      reject(reason);
    } else if (!reason) {
      activePollRejectRef.current = null;
    }
  };

  useEffect(() => () => stopPoll(), []);

  const switchMainModel = (nextModel: string) => update({ model: nextModel, mainId: '' });

  // v1.2.9.11: 返回 Promise，调用方 await 直到任务真正成功/失败/超时才 resolve/reject。
  //   原设计中 startPolling 启动 setInterval 后立即返回 → handleGenerate 提交成功后也立即返回 →
  //   useRunTrigger 认为 runFn 完成 markDone(true)。 但实际任务 videoUrl 还未赋值 → LoopNode awaitNode
  //   立即继续 → extractFromNode 读不到 videoUrl → result=null → failCount++。
  //   修复: 轮询完成才 resolve，handleGenerate await 它，markDone 时机=任务真正结束。
  const startPolling = (tid: string, runSeq = videoRunSeqRef.current): Promise<void> => {
    stopPoll();
    return new Promise<void>((resolve, reject) => {
      activePollRejectRef.current = reject;
      let elapsed = 0;
      const POLL_INT = VIDEO_POLL_INTERVAL_MS;
      const MAX = VIDEO_MAX_POLL; // 60 分钟
      let lastProgress = '';
      pollTimer.current = window.setInterval(async () => {
        elapsed += 1;
        if (elapsed > MAX) {
          stopPoll();
          flushProgressUpdate();
          update({ status: 'error', error: '轮询超时' });
          setError('轮询超时');
          logBus.error('轮询超时', src);
          reject(new Error('轮询超时'));
          return;
        }
        try {
          throwIfVideoRunCancelled(runSeq);
          const r = await queryVideo(tid, pollingApiModel);
          throwIfVideoRunCancelled(runSeq);
          const nextProgress = formatVideoNodeText(r.progress);
          if (nextProgress && nextProgress !== lastProgress) {
            lastProgress = nextProgress;
            logBus.debug(`[${elapsed}/${MAX}] status=${r.status} progress=${nextProgress}`, src);
          }
          const nextVideoUrls = Array.isArray(r.videoUrls) && r.videoUrls.length
            ? r.videoUrls
            : (r.videoUrl ? [r.videoUrl] : []);
          const nextVideoUrl = nextVideoUrls[0] || '';
          if (r.status === 'SUCCESS' && nextVideoUrl) {
            stopPoll();
            flushProgressUpdate();
            update({ status: 'success', videoUrl: nextVideoUrl, videoUrls: nextVideoUrls, progress: '100%' });
            logBus.success(`任务完成 → ${nextVideoUrl}${nextVideoUrls.length > 1 ? ` 等 ${nextVideoUrls.length} 个视频` : ''}`, src);
            taskCompletionSound.notifyComplete(id, 'video');
            resolve();
          } else if (r.status === 'FAILURE') {
            stopPoll();
            flushProgressUpdate();
            const msg = formatVideoNodeText(r.failReason, '生成失败');
            update({ status: 'error', error: msg });
            setError(msg);
            logBus.error(`生成失败: ${msg}`, src);
            reject(new Error(msg));
          } else {
            scheduleProgressUpdate({ status: 'polling', progress: nextProgress });
          }
        } catch (e: any) {
          // 偶尔失败不停止
          console.warn('轮询出错', formatVideoNodeText(e?.message || e));
        }
      }, POLL_INT);
    });
  };

  useEffect(() => {
    if (status !== 'polling' || !taskId || pollTimer.current) return;
    void startPolling(taskId).catch(() => undefined);
  }, [status, taskId, pollingApiModel]);

  // FAL 轮询
  const falPollRef = useRef<{ responseUrl?: string; endpoint?: string; requestId?: string } | null>(null);

  // v1.2.9.11: 同样改造为 Promise（理由同 startPolling）
  const startFalPolling = (runSeq = videoRunSeqRef.current): Promise<void> => {
    stopPoll();
    return new Promise<void>((resolve, reject) => {
      activePollRejectRef.current = reject;
      let elapsed = 0;
      const POLL_INT = VIDEO_FAL_POLL_INTERVAL_MS;
      const MAX = VIDEO_FAL_MAX_POLL; // 60分钟
      pollTimer.current = window.setInterval(async () => {
        elapsed += 1;
        if (elapsed > MAX) {
          stopPoll();
          flushProgressUpdate();
          update({ status: 'error', error: 'FAL 轮询超时' });
          setError('FAL 轮询超时');
          logBus.error('FAL 轮询超时', src);
          reject(new Error('FAL 轮询超时'));
          return;
        }
        try {
          throwIfVideoRunCancelled(runSeq);
          const r = await queryVideoFal(falPollRef.current!);
          throwIfVideoRunCancelled(runSeq);
          if (elapsed % 10 === 0) logBus.debug(`[FAL ${elapsed}/${MAX}] status=${r.status}`, src);
          if (r.status === 'completed' && r.videoUrl) {
            stopPoll();
            flushProgressUpdate();
            update({ status: 'success', videoUrl: r.videoUrl, progress: '100%' });
            logBus.success(`FAL 视频完成 → ${r.videoUrl}`, src);
            taskCompletionSound.notifyComplete(id, 'video');
            resolve();
          } else if (r.status === 'failed') {
            stopPoll();
            flushProgressUpdate();
            const msg = formatVideoNodeText(r.error, 'FAL 生成失败');
            update({ status: 'error', error: msg });
            setError(msg);
            logBus.error(`FAL 生成失败: ${msg}`, src);
            reject(new Error(msg));
          } else {
            scheduleProgressUpdate({ status: 'polling', progress: `${Math.min(95, Math.round(20 + elapsed / MAX * 75))}%` });
          }
        } catch (e: any) {
          console.warn('FAL 轮询出错', formatVideoNodeText(e?.message || e));
        }
      }, POLL_INT);
    });
  };

  const handleGenerate = async () => {
    const runSeq = ++videoRunSeqRef.current;
    setError(null);
    const { prompt: upstreamPrompt, imageUrls, videoUrls, audioUrls } = collectUpstream();
    const resolvedLocalPrompt = resolveMediaMentions(localPrompt, promptMentions, mentionMaterials);
    const finalPrompt = (upstreamPrompt || resolvedLocalPrompt || '').trim();
    if (!finalPrompt) {
      setError('未连接 text 节点也未填写 prompt');
      logBus.error('生成中止: 缺少 prompt', src);
      return;
    }
    if (isVeoOmni && imageUrls.length === 0) {
      setError('veo-omni-10s 需要 1 张参考图');
      logBus.error('生成中止: veo-omni-10s 缺少参考图', src);
      return;
    }
    if (isGrok15New && imageUrls.length === 0) {
      setError('Grok 1.5 New 需要 1 张参考图');
      logBus.error('生成中止: Grok 1.5 New 缺少参考图', src);
      return;
    }
    if (isApishuVeoOmniComponents && imageUrls.length === 0) {
      setError('omni-flash-components 至少需要 1 张参考图');
      logBus.error('生成中止: omni-flash-components 缺少参考图', src);
      return;
    }
    if (isApishuVeoOmniEdit && videoUrls.length === 0) {
      setError('veo-omni-flash-video-edit 需要 1 个源视频');
      logBus.error('生成中止: veo-omni-flash-video-edit 缺少源视频', src);
      return;
    }
    taskCompletionSound.primeAudio();
    update({ status: 'submitting', error: null, taskId: null });
    try {
      if (isExternalSelected && providerSelection.provider) {
        const providerModel = externalProviderModel;
        const refs = imageUrls.slice(0, Math.max(1, maxMentionRefs || modelDef.maxRefImages || 8));
        const videoRefs = videoUrls.slice(0, maxMentionVideos);
        const audioRefs = audioUrls.slice(0, maxMentionAudios);
        logBus.info(
          isJimengSeedanceSelected
            ? `扩展平台视频提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${providerModel} · 图${refs.length}/视${videoRefs.length}/音${audioRefs.length}`
            : `扩展平台视频提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${providerModel} · refs=${refs.length}`,
          src,
        );
        const r = await generateExternalVideo({
          providerId: providerSelection.provider.id,
          providerModel,
          model: providerModel,
          protocolModel: effectiveApiModel,
          providerKind: modelDef.kind,
          prompt: finalPrompt,
          aspect_ratio: ratio,
          ratio,
          duration,
          resolution,
          size: isGrokVideo15NewModel(providerModel) ? grok15NewSize : undefined,
          seed: seed > 0 ? seed : undefined,
          enhance_prompt: modelDef.kind === 'veo' ? enhancePrompt : undefined,
          enable_upsample: modelDef.kind === 'veo' && enableUpsample ? true : undefined,
          private: modelDef.kind === 'sora' ? soraPrivate : undefined,
          images: refs,
          videos: videoRefs,
          audios: audioRefs,
          providerParams: isJimengSeedanceSelected
            ? { ...providerParams, frameMode: jimengSeedanceMode }
            : providerParams,
        });
        throwIfVideoRunCancelled(runSeq);
        const nextVideoUrl = r.videoUrls[0];
        if (!nextVideoUrl) throw new Error('扩展平台没有返回视频。');
        update({
          status: 'success',
          videoUrl: nextVideoUrl,
          videoUrls: r.videoUrls,
          remoteVideoUrls: r.remoteVideoUrls,
          taskId: r.taskId || null,
          lastPrompt: finalPrompt,
          progress: '100%',
        });
        logBus.success(`扩展平台视频完成 → ${nextVideoUrl}`, src);
        taskCompletionSound.notifyComplete(id, 'video');
        return;
      }

      // === FAL 分支 ===
      if (isFal && falReg) {
        const falMaxRefs =
          falReg.paramKind === 'grok-fal' && (isGrokFalV15 || gkfMode !== 'reference_to_video')
            ? 1
            : falReg.maxRefImages;
        const refs = imageUrls.slice(0, falMaxRefs);
        let images: string[] | undefined;
        if (refs.length > 0) {
          // FAL 参考图直传 URL 或 base64，后端会处理上传
          images = refs;
        }

        const falReq: VideoFalSubmitRequest = { apiModel, prompt: finalPrompt, providerParams };
        if (images && images.length) falReq.images = images;

        if (falReg.paramKind === 'veo-fal') {
          falReq.aspect_ratio = vfRatio;
          falReq.duration = vfDuration;
          falReq.resolution = vfResolution;
          falReq.generate_audio = vfAudio;
          falReq.safety_tolerance = vfSafety;
        } else if (falReg.paramKind === 'grok-fal') {
          const effectiveGkfMode = isGrokFalV15 ? 'image_to_video' : gkfMode;
          const pastedReferenceUrls = isGrokFalV15
            ? []
            : splitGrokFalRefUrls(gkfReferenceUrls).slice(0, Math.max(0, 7 - (images?.length || 0)));
          if (isGrokFalV15 && (!images || images.length === 0)) {
            throw new Error('Grok Video 1.5 需要至少 1 张参考图');
          }
          if (!isGrokFalV15 && effectiveGkfMode === 'reference_to_video' && (!images || images.length === 0) && pastedReferenceUrls.length === 0) {
            throw new Error('Grok FAL 参考生视频需要至少 1 张参考图或 URL');
          }
          falReq.gkMode = effectiveGkfMode;
          if (!isGrokFalV15) {
            falReq.gkRatio = effectiveGkfMode === 'reference_to_video' && gkfRatio === 'auto' ? '16:9' : gkfRatio;
          }
          falReq.gkDuration = gkfDuration;
          falReq.resolution = gkfResolution;
          falReq.image_mode = falReg.defaultImageMode || 'base64';
          if (pastedReferenceUrls.length) falReq.gkReferenceUrls = pastedReferenceUrls;
        } else if (falReg.paramKind === 'sora-fal') {
          if (soraMode === 'image_to_video' && (!images || images.length === 0)) {
            throw new Error('Sora2 图生视频需要 1 张参考图');
          }
          falReq.soraMode = soraMode;
          falReq.soraRatio = soraRatio;
          falReq.soraDuration = soraDuration;
          falReq.soraResolution = soraResolution;
          falReq.soraDeleteVideo = soraDeleteVideo;
          falReq.soraBlockIp = soraBlockIp;
          falReq.soraCharacterIds = soraCharacterIds;
          falReq.image_mode = falReg.defaultImageMode || 'base64';
        }

        const falInfo =
          falReg.paramKind === 'veo-fal'
            ? `ratio=${vfRatio} dur=${vfDuration} res=${vfResolution} audio=${vfAudio}`
            : falReg.paramKind === 'grok-fal'
              ? isGrokFalV15
                ? `model=1.5 mode=image_to_video dur=${gkfDuration}s res=${gkfResolution} image=${falReg.defaultImageMode || 'base64'}`
                : `mode=${gkfMode} ratio=${gkfMode === 'reference_to_video' && gkfRatio === 'auto' ? '16:9' : gkfRatio} dur=${gkfDuration}s res=${gkfResolution} image=${falReg.defaultImageMode || 'base64'} urls=${splitGrokFalRefUrls(gkfReferenceUrls).length}`
              : `mode=${soraMode} ratio=${soraRatio} dur=${soraDuration}s res=${soraResolution} image=base64`;
        logBus.info(
          `提交 FAL 视频: ${apiModel} ${falInfo} refs=${images?.length || 0} prompt="${finalPrompt.slice(0, 30)}…"`,
          src,
        );

        const r = await submitVideoFal(falReq);
        throwIfVideoRunCancelled(runSeq);
        if (r.sync && r.videoUrl) {
          update({ status: 'success', videoUrl: r.videoUrl, lastPrompt: finalPrompt, progress: '100%' });
          logBus.success(`FAL 同步完成 → ${r.videoUrl}`, src);
          taskCompletionSound.notifyComplete(id, 'video');
        } else {
          falPollRef.current = { responseUrl: r.responseUrl, endpoint: r.endpoint, requestId: r.requestId };
          update({ status: 'polling', lastPrompt: finalPrompt, progress: '15%' });
          logBus.info(`FAL 异步任务 requestId=${r.requestId} 进入轮询…`, src);
          // v1.2.9.11: await 让 useRunTrigger 等到任务真正完成才 markDone
          await startFalPolling(runSeq);
        }
        return;
      }

      // === 默认视频接口分支 ===
      // 参考图预处理:
      //   - Grok: 直接传 URL (本地 /files/* 也可,后端会转上游 URL)
      //   - Veo / Sora2 / Seedance: 转 base64
      const refs = imageUrls.slice(0, isApishuVeoOmni ? maxApishuVeoOmniRefs : ((isVeoOmni || isGrok15New) ? 1 : modelDef.maxRefImages));
      let images: string[] | undefined;
      if (modelDef.supportImages && refs.length > 0) {
        if (modelDef.kind === 'grok') {
          images = refs;
        } else {
          const arr: string[] = [];
          for (const u of refs) {
            try { arr.push(await urlToBase64(u)); }
            catch (e) { console.warn('图像编码失败', e); }
          }
          if (arr.length) images = arr;
        }
      }

      // 按 kind 走不同字段(完全对齐 gpt-image-2-web payload)
      const payload: VideoSubmitRequest = {
        model: effectiveApiModel,
        protocolModel: apiModel,
        prompt: finalPrompt,
        providerParams,
        duration: Number(duration) || modelDef.defaultDuration || 5,
        resolution: resolution || modelDef.defaultResolution || '720p',
      };
      if (isGrok15New) {
        payload.size = grok15NewSize;
      } else if (modelDef.kind === 'grok') {
        payload.ratio = ratio;
        payload.duration = Number(duration) || modelDef.defaultDuration || 15;
        payload.resolution = resolution || modelDef.defaultResolution || '720P';
        if (seed > 0) payload.seed = seed;
      } else if (modelDef.kind === 'sora') {
        payload.aspect_ratio = ratio;
        payload.duration = Number(duration) || modelDef.defaultDuration || 15;
        payload.private = soraPrivate;
        if (seed > 0) payload.seed = seed;
      } else {
        // veo / seedance
        payload.aspect_ratio = ratio;
        if (isApishuVeoOmni) {
          if (isApishuVeoOmniEdit && videoUrls.length) {
            payload.video_url = videoUrls[0];
            payload.videos = videoUrls.slice(0, 1);
          }
        } else if (isVeoOmni) {
          payload.duration = 10;
        } else {
          payload.enhance_prompt = enhancePrompt;
          if (enableUpsample) payload.enable_upsample = true;
        }
        if (seed > 0) payload.seed = seed;
      }
      if (images && images.length) payload.images = images;

      logBus.info(
        `提交任务: kind=${modelDef.kind} model=${effectiveApiModel} ratio=${ratio}` +
        (isGrok15New
          ? ` size=${payload.size} v1-multipart`
          : modelDef.kind === 'grok'
          ? ` duration=${payload.duration}s resolution=${payload.resolution}`
          : modelDef.kind === 'sora'
            ? ` duration=${payload.duration}s private=${payload.private}`
            : isApishuVeoOmni
                ? ` seconds=${payload.duration}s endpoint=/v1/videos skylee-omni video=${isApishuVeoOmniEdit ? (videoUrls[0] ? 1 : 0) : 0}`
              : isVeoOmni
                ? ' duration=10s endpoint=/v1/videos'
              : ` enhance=${payload.enhance_prompt}`) +
        ` refs=${images?.length || 0} prompt="${finalPrompt.slice(0, 30)}…"`,
        src,
      );

      const r = await submitVideo(payload);
      throwIfVideoRunCancelled(runSeq);
      update({
        status: 'polling',
        taskId: r.taskId,
        protocolModel: r.effectiveModel || r.requestedModel || effectiveApiModel,
        videoProtocol: r.protocol || null,
        lastPrompt: finalPrompt,
        progress: '0%',
      });
      logBus.info(`异步任务已提交 taskId=${r.taskId} 进入轮询…`, src);
      // v1.2.9.11: await 让 useRunTrigger 等到任务真正完成才 markDone
      await startPolling(r.taskId, runSeq);
    } catch (e: any) {
      if (e?.message === '已停止生成') {
        logBus.warn('已停止生成', src);
        return;
      }
      const msg = formatVideoNodeText(e?.message || e, '提交失败');
      setError(msg);
      update({ status: 'error', error: msg });
      logBus.error(`提交失败: ${msg}`, src);
    }
  };

  const handleStop = () => {
    videoRunSeqRef.current += 1;
    flushProgressUpdate();
    stopPoll(new Error('已停止生成'));
    setError(null);
    update({ status: 'idle', progress: '', error: null });
    logBus.warn('用户主动停止', src);
  };

  useEffect(() => {
    if (runCancelSeq > 0 && runCancelTargets.includes(id) && (status === 'submitting' || status === 'polling')) {
      handleStop();
    }
  }, [runCancelSeq, runCancelTargets, id, status]);

  // 批量运行接入
  useRunTrigger(id, async () => {
    if (status === 'submitting' || status === 'polling') return;
    await handleGenerate();
  }, 'video');

  // === 跨节点拖拽: source (输出视频可拖出) ===
  const startDrag = useDragMaterialStore((s) => s.start);
  const beginMaterialDrag = (e: React.MouseEvent, payload: MaterialPayload) => {
    if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(payload, e.clientX, e.clientY);
  };

  // === 跨节点拖拽: target (接收 image/video/audio/text) ===
  const handleDrop = (payload: MaterialPayload) => {
    if (payload.kind === 'image' && payload.url) {
      const cur = Array.isArray(d?.localRefImages) ? d.localRefImages : [];
      if (cur.indexOf(payload.url) !== -1) return;
      const cap = isGrok15New ? 1 : isJimengSeedanceSelected ? JIMENG_SEEDANCE_LIMITS.images : (modelDef.maxRefImages || 7) + 4;
      if (cur.length >= cap) return;
      update({ localRefImages: [...cur, payload.url] });
    } else if (payload.kind === 'video' && payload.url && (isJimengSeedanceSelected || isApishuVeoOmniEdit)) {
      const cur = Array.isArray(d?.localRefVideos) ? d.localRefVideos : [];
      const cap = isApishuVeoOmniEdit ? 1 : JIMENG_SEEDANCE_LIMITS.videos;
      if (cur.indexOf(payload.url) !== -1 || cur.length >= cap) return;
      update({ localRefVideos: [...cur, payload.url] });
    } else if (payload.kind === 'audio' && payload.url && isJimengSeedanceSelected) {
      const cur = Array.isArray(d?.localRefAudios) ? d.localRefAudios : [];
      if (cur.indexOf(payload.url) !== -1 || cur.length >= JIMENG_SEEDANCE_LIMITS.audios) return;
      update({ localRefAudios: [...cur, payload.url] });
    } else if (payload.kind === 'text' && typeof payload.text === 'string') {
      update({ prompt: payload.text });
    }
  };
  const { dropProps, isAccepting } = useMaterialDropTarget({
    id,
    accepts: isApishuVeoOmniEdit ? ['image', 'video', 'text'] : (isJimengSeedanceSelected ? ['image', 'video', 'audio', 'text'] : ['image', 'text']),
    onDrop: handleDrop,
  });

  const isBusy = status === 'submitting' || status === 'polling';
  const safeError = formatVideoNodeText(error);
  const safeProgress = formatVideoNodeText(progress);
  const refsCount = orderedReferenceImages.length;
  const videoRefsCount = orderedReferenceVideos.length;
  const audioRefsCount = orderedReferenceAudios.length;
  const previewTitle = isJimengSeedanceSelected
    ? `上游素材 · 图${Math.min(refsCount, JIMENG_SEEDANCE_LIMITS.images)}/${JIMENG_SEEDANCE_LIMITS.images} 视${Math.min(videoRefsCount, JIMENG_SEEDANCE_LIMITS.videos)}/${JIMENG_SEEDANCE_LIMITS.videos} 音${Math.min(audioRefsCount, JIMENG_SEEDANCE_LIMITS.audios)}/${JIMENG_SEEDANCE_LIMITS.audios}`
    : `上游素材 · 参考图 ${Math.min(refsCount, maxMentionRefs)}/${maxMentionRefs}`;
  const videoNodeUiVariant: 'smart-card' | 'classic' = d?.uiVariant === 'classic' ? 'classic' : 'smart-card';
  const useSmartCardVideoNode = videoNodeUiVariant === 'smart-card';
  const hasManualSmartSize = d?.smartCardManualSize === true;
  const previewAspectRatio = videoProbedSize?.ratio || videoNaturalRatio || ratio;
  const smartAspectSize = resolveSmartMediaCardSize(previewAspectRatio, hasManualSmartSize ? d?.smartCardWidth : undefined);
  const smartCardWidth = smartAspectSize.width;
  const smartCardHeight = smartAspectSize.height;
  const smartComposerOpen = smartComposerOpenLocal && !smartCardDragging;
  const smartVideoCardState = isBusy ? 'running' : status === 'error' ? 'failed' : videoUrl ? 'result' : 'empty';
  const smartComposerWidth = Math.max(smartCardWidth, 620);
  const smartVideoAspect = previewAspectRatio && previewAspectRatio.includes(':') ? previewAspectRatio.replace(':', '/') : '16/9';
  const isSmartRegenerating = isBusy && Boolean(videoUrl);
  const smartStatusLabel =
    status === 'submitting'
      ? '提交中'
      : status === 'polling'
        ? `生成中 ${safeProgress || ''}`.trim()
        : status === 'success'
          ? '已生成'
          : status === 'error'
            ? '生成失败'
            : '待生成';
  const smartSourceLabel = isExternalSelected && providerSelection.provider
    ? `${providerSelection.provider.label || providerSelection.provider.id}${externalProviderModel ? ` · ${externalProviderModel}` : ''}`
    : `${modelDef.label}${effectiveApiModel ? ` · ${effectiveApiModel}` : ''}`;
  const syncVideoNodeGeometry = useNodeGeometrySync(id, updateNodeInternals);

  useEffect(() => {
    setVideoNaturalRatio('');
    setVideoProbedSize(null);
    if (!videoUrl) return;
    let active = true;
    void probeVideo(videoUrl)
      .then((probe) => {
        if (!active) return;
        setVideoProbedSize(resolveVideoDisplaySize(probe.width, probe.height, probe.rotation));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [videoUrl]);

  const handleVideoLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    const videoWidth = event.currentTarget.videoWidth;
    const videoHeight = event.currentTarget.videoHeight;
    if (videoWidth > 0 && videoHeight > 0) {
      setVideoNaturalRatio(`${videoWidth}:${videoHeight}`);
    }
    syncVideoNodeGeometry();
  };

  useEffect(() => {
    if (!useSmartCardVideoNode) return;
    const raf = window.requestAnimationFrame(syncVideoNodeGeometry);
    return () => window.cancelAnimationFrame(raf);
  }, [selected, smartCardWidth, smartCardHeight, smartComposerOpen, syncVideoNodeGeometry, useSmartCardVideoNode]);

  // Kept alongside the composer-owned dismissal: ignores prompt portals
  // and other floating editors that legitimately sit outside the anchor.
  useOutsideClose({
    enabled: useSmartCardVideoNode && smartComposerOpenLocal,
    refs: smartNodeRef,
    onOutside: () => setSmartComposerOpenLocal(false),
  });

  const smartPanelToggle = useSmartNodePanelToggle({
    open: smartComposerOpenLocal,
    dragging: false,
    onToggle: setSmartComposerOpenLocal,
    onDragChange: setSmartCardDragging,
    onDragClose: () => setSmartComposerOpenLocal(false),
    disabled: !useSmartCardVideoNode,
  });

  // Composer open state is session-only; release it when the node unmounts.
  useEffect(() => () => smartNodeComposerActions.close(id), [id]);

  const switchVideoNodeVariant = (variant: 'smart-card' | 'classic') => {
    setSmartComposerOpenLocal(false);
    smartPanelToggle.handledClickRef.current = false;
    smartPanelToggle.suppressClickRef.current = true;
    flushSync(() => {
      update({ uiVariant: variant });
    });
    syncVideoNodeGeometry();
  };

  if (useSmartCardVideoNode) {
    return (
      <SmartNodeShell
        rootRef={smartNodeRef}
      data-canvas-node-root={true}
      className={`t8-smart-video-node relative overflow-visible ${selected ? 'is-selected' : ''}`}
        style={{ width: smartCardWidth }}
        accessibleLabel="视频节点"
        smartState={smartVideoCardState}
        onKeyboardActivate={() => setSmartComposerOpenLocal(true)}
        rootProps={{
          ...dropProps,
          onPointerDown: smartPanelToggle.onPointerDown,
          onPointerMove: smartPanelToggle.onPointerMove,
          onPointerUp: smartPanelToggle.onPointerUp,
          onPointerCancel: smartPanelToggle.onPointerCancel,
          onClick: smartPanelToggle.onClick,
        }}
      >
        <div
          className={`t8-node t8-smart-node-card t8-smart-video-card transition-all ${selected ? 't8-smart-node-card--selected' : ''} ${
            isAccepting ? 't8-smart-node-card--accepting' : ''
          } ${isSmartRegenerating ? 't8-smart-node-card--regenerating' : ''}`}
          style={{ height: smartCardHeight }}
        >
          <Handle type="target" position={Position.Left} className="t8-smart-node-port !border-0" style={{ top: '50%' }} />
          <Handle type="source" position={Position.Right} className="t8-smart-node-port !border-0" style={{ top: '50%' }} />
          <div className="t8-smart-node-body">
            <div className="t8-smart-node-preview t8-smart-video-preview">
              {videoUrl ? (
                <LoopingVideo
                  src={videoUrl}
                  controls
                  className="h-full w-full object-contain"
                  style={{ aspectRatio: smartVideoAspect }}
                  data-drag-source
                  data-drag-kind="video"
                  data-drag-url={videoUrl}
                  data-drag-preview={videoUrl}
                  data-drag-node-id={id}
                  data-resource-title={videoUrl.split('/').pop() || '生成视频'}
                  data-prompt-template-kind="video"
                  data-prompt-template-category="video-image-to-video"
                  data-prompt-template-prompt={d?.lastPrompt || localPrompt}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setVideoPreviewOpen(true);
                  }}
                  onMouseDown={(e) => beginMaterialDrag(e, { kind: 'video', url: videoUrl, sourceNodeId: id, previewUrl: videoUrl })}
                  title="按住 Ctrl 拖拽到其他节点"
                />
              ) : (
                <div className="t8-smart-node-empty t8-smart-video-empty">
                  <VideoIcon size={28} />
                </div>
              )}
              {videoUrl && (
                <div className="nodrag nopan t8-smart-result-tools">
                  <button
                    type="button"
                    className="t8-smart-result-tool"
                    title="预览视频"
                    aria-label="预览视频"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setVideoPreviewOpen(true);
                    }}
                  >
                    <Eye size={14} />
                  </button>
                </div>
              )}
              <div className="t8-smart-video-badge">
                <VideoIcon size={12} />
                <span>视频</span>
              </div>
              {status !== 'idle' && (
                <div className={`t8-smart-video-status t8-smart-node-status--${status}`}>
                  {isBusy && <Loader2 size={11} className="animate-spin" />}
                  <span>{smartStatusLabel}</span>
                </div>
              )}
            </div>
            {safeError && (
              <div className="t8-smart-node-error">
                <AlertCircle size={12} />
                <span>{safeError}</span>
              </div>
            )}
          </div>
        </div>

        <ResizableCorners
          selected={selected}
          minWidth={300}
          minHeight={170}
          maxWidth={760}
          maxHeight={720}
          accent="var(--t8-accent)"
          keepAspectRatio
          onResize={(_e, p) => {
            const nextWidth = Math.round(p.width);
            const nextSize = resolveSmartMediaCardSize(ratio, nextWidth);
            update({
              smartCardWidth: nextSize.width,
              smartCardHeight: nextSize.height,
              smartCardManualSize: true,
            });
          }}
          onResizeEnd={(_e, p) => {
            const nextWidth = Math.round(p.width);
            const nextSize = resolveSmartMediaCardSize(ratio, nextWidth);
            update({
              smartCardWidth: nextSize.width,
              smartCardHeight: nextSize.height,
              smartCardManualSize: true,
            });
            syncVideoNodeGeometry();
          }}
        />

        {smartComposerOpen && (
          <SmartNodeComposer
            portal
            anchorRef={smartNodeRef}
            style={{ width: smartComposerWidth }}
            onMouseDown={(e) => e.stopPropagation()}
            onRequestClose={() => setSmartComposerOpenLocal(false)}
            ariaLabel="视频节点属性"
            initialFocusRef={smartPromptRef}
          >
            <MaterialPreviewSection
              texts={orderedTexts}
              images={orderedReferenceImages}
              videos={orderedReferenceVideos}
              audios={orderedReferenceAudios}
              order={materialOrder}
              onReorder={setMaterialOrder}
              onRemoveLocal={handleRemoveLocalMaterial}
              onExcludeUpstream={handleExcludeUpstreamMaterial}
              excludedCount={excludedUpstreamCount}
              onRestoreExcluded={handleRestoreExcludedMaterials}
              selected={!!selected}
              isDark={isDark}
              isPixel={isPixel}
              density="compact"
              groups={previewGroups}
              title={previewTitle}
            />
            <div className="t8-smart-ref-strip">
              <div className="t8-smart-node-meta t8-smart-node-meta--composer">
                <span>{smartSourceLabel}</span>
                <span>{smartStatusLabel}</span>
                <span>参考 {refsCount}</span>
              </div>
              <div className="t8-smart-ref-spacer" />
              <button
                type="button"
                className="nodrag nopan t8-btn t8-smart-classic-switch"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  switchVideoNodeVariant('classic');
                }}
                title="切换到经典版节点"
                aria-label="切换到经典版节点"
              >
                <RefreshCcw size={13} />
              </button>
            </div>

            <div className="t8-smart-composer-row">
              {videoAdvancedProviders.length > 0 && (
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>来源</span>
                  <select
                    value={isExternalSelected ? providerSelection.providerId : 'zhenzhen'}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (nextId === 'zhenzhen') {
                        update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
                        return;
                      }
                      const provider = videoAdvancedProviders.find((item) => item.id === nextId);
                      if (!provider) return;
                      const nextModels = advancedProviderModelOptions(provider, 'video');
                      update({
                        providerSource: provider.protocol,
                        providerId: provider.id,
                        providerModel: nextModels[0] || '',
                        ...(provider.protocol === 'agnes'
                          ? {
                            ratio: '16:9',
                            duration: 5,
                            resolution: '720p',
                            providerParams: { ...providerParams, frameRate: 24 },
                          }
                          : {}),
                      });
                    }}
                    className="t8-select t8-smart-select"
                  >
                    <option value="zhenzhen">默认</option>
                    {videoAdvancedProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label || provider.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {isExternalSelected && providerSelection.provider ? (
                <label className="t8-smart-field">
                  <span>具体模型</span>
                  <select
                    value={externalProviderModel}
                    onChange={(e) => update({ providerModel: e.target.value })}
                    className="t8-select t8-smart-select"
                  >
                    {externalModelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="t8-smart-field">
                  <span>模型</span>
                  <select
                    value={defaultProviderApiModel}
                    onChange={(e) => switchMainModel(e.target.value)}
                    className="t8-select t8-smart-select"
                  >
                    {apiModelOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="t8-smart-prompt-shell">
              <MentionPromptInput
                editorRef={smartPromptRef}
                title="视频 Prompt"
                value={localPrompt}
                mentions={promptMentions}
                materials={mentionMaterials}
                onChange={(value, mentions) => update({ prompt: value, promptMentions: mentions })}
                placeholder="描述要生成的视频..."
                isDark={isDark}
                isPixel={isPixel}
                promptTemplateKind="video"
                className="t8-textarea t8-smart-prompt-input"
              />
            </div>

            <div className="t8-smart-composer-row t8-smart-composer-row--params">
              {showGenericVideoControls && !isGrok15New && (
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>比例</span>
                  <select value={ratio} onChange={(e) => update({ ratio: e.target.value })} className="t8-select t8-smart-select">
                    {ratioOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              )}
              {showGenericVideoControls && !isGrok15New && durationOptions.length > 0 && (
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>时长</span>
                  <select value={String(duration)} onChange={(e) => update({ duration: Number(e.target.value) })} className="t8-select t8-smart-select">
                    {durationOptions.map((s) => <option key={s} value={s}>{s}s</option>)}
                  </select>
                </label>
              )}
              {showGenericVideoControls && resolutionOptions.length > 0 && (
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>分辨率</span>
                  <select value={resolution || resolutionOptions[0]} onChange={(e) => update({ resolution: e.target.value })} className="t8-select t8-smart-select">
                    {resolutionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              )}
              <div className="t8-smart-param-spacer" />
              {!isBusy ? (
                <button type="button" onClick={handleGenerate} className="t8-btn t8-btn-primary t8-smart-run-btn">
                  <Sparkles size={14} />
                  <span>生成</span>
                </button>
              ) : (
                <button type="button" onClick={handleStop} className="t8-btn t8-smart-run-btn">
                  <Square size={13} />
                  <span>停止</span>
                </button>
              )}
            </div>

            {isBusy && (
              <div className="t8-smart-inline-state">
                <Loader2 size={12} className="animate-spin" />
                <span>{status === 'submitting' ? '提交任务...' : `轮询中 ${safeProgress}`}</span>
                {taskId && <span>{taskId.slice(0, 10)}...</span>}
              </div>
            )}
          </SmartNodeComposer>
        )}
        <SmartMediaPreviewModal
          open={videoPreviewOpen}
          url={videoUrl}
          title="生成视频"
          kind="video"
          meta={videoProbedSize ? `${videoProbedSize.width}×${videoProbedSize.height}` : (videoNaturalRatio ? videoNaturalRatio.replace(':', '×') : undefined)}
          onClose={() => setVideoPreviewOpen(false)}
        />
      </SmartNodeShell>
    );
  }

  return (
    <div
      {...dropProps}
      className={`t8-node relative rounded-xl border-2 transition-all w-[300px] ${selected ? 'is-selected' : ''} ${
        isAccepting ? 'border-emerald-400' : ''
      }`}
      style={{
        background: 'rgba(20,20,22,.92)',
        backdropFilter: 'blur(8px)',
        boxShadow: isAccepting ? '0 0 0 2px rgba(52,211,153,.45), 0 12px 30px rgba(52,211,153,.18)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-rose-400 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-rose-400 !border-0" />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: 'rgba(244,63,94,.2)', color: '#fda4af', boxShadow: 'inset 0 0 0 1px rgba(244,63,94,.45)' }}
        >
          <VideoIcon size={13} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">视频</div>
          <div className="text-[10px] text-white/40">
            {isExternalSelected && providerSelection.provider
              ? `${providerSelection.provider.label || providerSelection.provider.id} · ${externalProviderModel || '未选模型'}`
              : `${modelDef.label} · ${effectiveApiModel}`}
          </div>
        </div>
        <button
          type="button"
          className="nodrag nopan t8-btn t8-smart-classic-switch"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            switchVideoNodeVariant('smart-card');
          }}
          title="切回卡片版节点"
          aria-label="切回卡片版节点"
        >
          <RefreshCcw size={13} />
        </button>
      </div>

      <div className="p-2.5 space-y-2" onMouseDown={(e) => e.stopPropagation()}>
        {videoAdvancedProviders.length > 0 && (
          <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-2">
            <label className="text-[10px] text-white/50 block mb-1">来源</label>
            <select
              value={isExternalSelected ? providerSelection.providerId : 'zhenzhen'}
              onChange={(e) => {
                const nextId = e.target.value;
                if (nextId === 'zhenzhen') {
                  update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
                  return;
                }
                const provider = videoAdvancedProviders.find((item) => item.id === nextId);
                if (!provider) return;
                const nextModels = advancedProviderModelOptions(provider, 'video');
                update({
                  providerSource: provider.protocol,
                  providerId: provider.id,
                  providerModel: nextModels[0] || '',
                  ...(provider.protocol === 'agnes'
                    ? {
                      ratio: '16:9',
                      duration: 5,
                      resolution: '720p',
                      providerParams: { ...providerParams, frameRate: 24 },
                    }
                    : {}),
                });
              }}
              style={{ background: '#18181b', color: '#ffffff' }}
              className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
            >
              <option value="zhenzhen" style={{ background: '#18181b', color: '#ffffff' }}>默认</option>
              {videoAdvancedProviders.map((provider) => (
                <option key={provider.id} value={provider.id} style={{ background: '#18181b', color: '#ffffff' }}>
                  {provider.label || provider.id}
                </option>
              ))}
            </select>
            {savedExternalMissing && (
              <div className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                当前画布记录的扩展平台未启用或不存在，已临时回到默认来源。
              </div>
            )}
          </div>
        )}

        {isExternalSelected && providerSelection.provider ? (
          <div>
            <label className="text-[10px] text-white/50 block mb-1">具体模型</label>
            <select
              value={externalProviderModel}
              onChange={(e) => update({ providerModel: e.target.value })}
              style={{ background: '#18181b', color: '#ffffff' }}
              className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
            >
              {externalModelOptions.map((m) => (
                <option key={m} value={m} style={{ background: '#18181b', color: '#ffffff' }}>{m}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-[10px] text-white/50 block mb-1">模型</label>
            <select
              value={defaultProviderApiModel}
              onChange={(e) => switchMainModel(e.target.value)}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {apiModelOptions.map((o) => (
                <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
              ))}
            </select>
          </div>
        )}

        <LocalNodeAddonSlot
          nodeId={id}
          nodeType="video"
          data={d}
          update={update}
          context={{
            providerSource: isExternalSelected ? providerSelection.providerSource : 'zhenzhen',
            providerId: providerSelection.providerId,
            providerModel: isExternalSelected ? externalProviderModel : effectiveApiModel,
            model: apiModel,
            apiModel: effectiveApiModel,
            mainId,
            providerKind: isFal ? 'fal' : modelDef.kind,
          }}
        />

        {/* === FAL 专属参数面板 === */}
        {showBuiltinFalControls && falReg?.paramKind === 'veo-fal' && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">比例 (FAL)</label>
                <select value={vfRatio} onChange={(e) => update({ vfRatio: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {VEO_FAL_RATIOS.map((r) => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">时长</label>
                <select value={vfDuration} onChange={(e) => update({ vfDuration: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {VEO_FAL_DURATIONS.map((d) => <option key={d} value={d} className="bg-zinc-900">{d}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">分辨率</label>
                <select value={vfResolution} onChange={(e) => update({ vfResolution: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {VEO_FAL_RESOLUTIONS.map((r) => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">安全等级</label>
                <select value={String(vfSafety)} onChange={(e) => update({ vfSafety: Number(e.target.value) })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {[1,2,3,4,5,6].map((s) => <option key={s} value={s} className="bg-zinc-900">{s}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer">
              <input type="checkbox" checked={vfAudio} onChange={(e) => update({ vfAudio: e.target.checked })} className="accent-rose-400" />
              生成音频
            </label>
          </>
        )}

        {showBuiltinFalControls && falReg?.paramKind === 'grok-fal' && (
          <>
            {isGrokFalV15 ? (
              <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] leading-relaxed text-white/60">
                Grok Video 1.5 仅支持图生视频，必须有 1 张参考图；图像传入模式默认 Base64，不发送比例参数。
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">模式 (FAL)</label>
                  <select
                    value={gkfMode}
                    onChange={(e) => {
                      const next = e.target.value as 'image_to_video' | 'reference_to_video';
                      update({
                        gkfMode: next,
                        ...(next === 'reference_to_video' && gkfRatio === 'auto' ? { gkfRatio: '16:9' } : {}),
                      });
                    }}
                    className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
                  >
                    {GROK_FAL_MODES.map((m) => <option key={m.value} value={m.value} className="bg-zinc-900">{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">比例 (FAL)</label>
                  <select value={gkfRatio} onChange={(e) => update({ gkfRatio: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                    {GROK_FAL_RATIOS.map((r) => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">时长(s)</label>
                <input type="number" value={gkfDuration} min={1} max={30} onChange={(e) => update({ gkfDuration: Number(e.target.value) || 6 })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30" />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">分辨率</label>
                <select value={gkfResolution} onChange={(e) => update({ gkfResolution: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {GROK_FAL_RESOLUTIONS.map((r) => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
                </select>
              </div>
            </div>
            {!isGrokFalV15 && gkfMode === 'reference_to_video' && (
              <div>
                <label className="text-[10px] text-white/50 block mb-1">公开参考 URL(可选)</label>
                <textarea
                  value={gkfReferenceUrls}
                  onChange={(e) => update({ gkfReferenceUrls: e.target.value })}
                  placeholder="每行或逗号分隔，最多补足到 7 张"
                  className="w-full h-12 resize-none rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
                />
              </div>
            )}
            <div className="text-[10px] text-white/45 leading-relaxed">
              {isGrokFalV15
                ? '只取第 1 张参考图，提交到 v1.5 image-to-video；Base64 为默认传入方式。'
                : gkfMode === 'reference_to_video'
                ? '参考生视频最多 7 张，优先使用上游/本地图，再补充 URL。'
                : '图生视频只取第 1 张参考图；无图时保留文生视频 fallback。'}
            </div>
          </>
        )}

        {showBuiltinFalControls && falReg?.paramKind === 'sora-fal' && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">FAL Mode</label>
                <select value={soraMode} onChange={(e) => update({ soraMode: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {SORA2_FAL_MODES.map((m) => <option key={m.value} value={m.value} className="bg-zinc-900">{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">比例</label>
                <select value={soraRatio} onChange={(e) => update({ soraRatio: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {SORA2_FAL_RATIOS.map((r) => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">时长</label>
                <select value={String(soraDuration)} onChange={(e) => update({ soraDuration: Number(e.target.value) || 4 })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {SORA2_FAL_DURATIONS.map((d) => <option key={d} value={d} className="bg-zinc-900">{d}s</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">分辨率</label>
                <select value={soraResolution} onChange={(e) => update({ soraResolution: e.target.value })} className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30">
                  {SORA2_FAL_RESOLUTIONS.map((r) => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">Character IDs</label>
              <input
                value={soraCharacterIds}
                onChange={(e) => update({ soraCharacterIds: e.target.value })}
                placeholder="id1, id2"
                className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30 placeholder:text-white/25"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer">
                <input type="checkbox" checked={soraDeleteVideo} onChange={(e) => update({ soraDeleteVideo: e.target.checked })} className="accent-rose-400" />
                Delete Video
              </label>
              <label className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer">
                <input type="checkbox" checked={soraBlockIp} onChange={(e) => update({ soraBlockIp: e.target.checked })} className="accent-rose-400" />
                Block IP
              </label>
            </div>
            <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] leading-relaxed text-white/45">
              默认用 Base64 传入第 1 张参考图；Auto 无图时走文生视频。
            </div>
          </>
        )}

        {isSoraZhenzhen && (
          <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-white/70">Sora2 Zhenzhen API</span>
              <span className="text-[9px] text-white/35">参考图 ≤ 1</span>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={soraPrivate}
                onChange={(e) => update({ soraPrivate: e.target.checked })}
                className="accent-rose-400"
              />
              Private
            </label>
            <div className="text-[10px] text-white/40 leading-relaxed">
              提交到 /v2/videos/generations，真实模型名为 sora-2；参考图会转为裸 Base64。
            </div>
          </div>
        )}

        {isVeoOmni && (
          <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] leading-relaxed text-white/45">
            Veo Omni 走 /v1/videos，固定调用 omni_flash-10s，需要 1 张参考图；16:9=1280x720，9:16=720x1280。
          </div>
        )}

        {isGrok15New && (
          <>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">尺寸</label>
              <select
                value={grok15NewSize}
                onChange={(e) => {
                  const nextSize = e.target.value;
                  update({
                    size: nextSize,
                    ratio: nextSize === '720x1280' ? '9:16' : '16:9',
                  });
                }}
                className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
              >
                {GROK_VIDEO_1_5_NEW_SIZES.map((item) => (
                  <option key={item.value} value={item.value} className="bg-zinc-900">{item.label}</option>
                ))}
              </select>
            </div>
            <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] leading-relaxed text-white/45">
              Grok 1.5 New 需要 1 张参考图；按 Comfly 原节点提交 model / prompt / size / input_reference，时长由具体模型 6s / 10s / 15s 决定。
            </div>
          </>
        )}

        {isJimengSeedanceSelected && (
          <div className="rounded border border-white/10 bg-white/5 p-1.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] text-white/50">即梦模式</label>
              <span className="text-[9px] text-white/35">图9 / 视3 / 音3</span>
            </div>
            <select
              value={jimengSeedanceMode}
              onChange={(e) => updateProviderParams({ frameMode: e.target.value })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {JIMENG_SEEDANCE_MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value} className="bg-zinc-900">{item.label}</option>
              ))}
            </select>
            <div className="text-[10px] text-white/40 leading-relaxed">
              {jimengSeedanceMode === 'omni'
                ? '全能参考支持图片、视频和音频混合输入；纯多图也会走全能参考。'
                : jimengSeedanceMode === 'first'
                  ? '只取第 1 张图作为首帧。'
                  : jimengSeedanceMode === 'firstlast'
                    ? '取第 1 张为首帧，第 2 张为尾帧。'
                    : '仅使用图片序列生成智能多帧。'}
            </div>
          </div>
        )}

        {/* 比例(非 FAL 时显示原始控件) */}
        {showGenericVideoControls && !isGrok15New && (
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[10px] text-white/50 block mb-1">比例</label>
            <select
              value={ratio}
              onChange={(e) => update({ ratio: e.target.value })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {ratioOptions.map((r) => (
                <option key={r} value={r} className="bg-zinc-900">{r}</option>
              ))}
            </select>
          </div>
          {/* 时长(grok / seedance) */}
          {durationOptions.length > 0 && (
            <div>
              <label className="text-[10px] text-white/50 block mb-1">时长(s)</label>
              <select
                value={String(duration)}
                onChange={(e) => update({ duration: Number(e.target.value) })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
                {durationOptions.map((s) => (
                  <option key={s} value={s} className="bg-zinc-900">{s}s</option>
                ))}
              </select>
            </div>
          )}
        </div>
        )}

        {/* 分辨率(仅 grok 非FAL) */}
        {showGenericVideoControls && resolutionOptions.length > 0 && (
          <div>
            <label className="text-[10px] text-white/50 block mb-1">分辨率</label>
            <select
              value={resolution || resolutionOptions[0]}
              onChange={(e) => update({ resolution: e.target.value })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {resolutionOptions.map((r) => (
                <option key={r} value={r} className="bg-zinc-900">{r}</option>
              ))}
            </select>
          </div>
        )}

        {isAgnesExternalSelected && (
          <div className="rounded border border-emerald-300/20 bg-emerald-400/[0.06] p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-white/75">Agnes 视频参数</span>
              <span className="text-[9px] text-emerald-100/60">/v1/videos</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">帧率</label>
                <select
                  value={String(agnesFrameRate)}
                  onChange={(e) => updateProviderParams({ frameRate: Number(e.target.value) || 24 })}
                  className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
                >
                  {[8, 12, 16, 24, 30].map((fps) => (
                    <option key={fps} value={fps} className="bg-zinc-900">{fps} fps</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">帧数覆盖</label>
                <input
                  type="number"
                  min={9}
                  max={441}
                  value={String(agnesNumFrames)}
                  onChange={(e) => updateProviderParams({
                    numFrames: e.target.value ? Math.max(9, Math.min(441, Number(e.target.value) || 9)) : '',
                  })}
                  placeholder="自动"
                  className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30 placeholder:text-white/25"
                />
              </div>
            </div>
            <div className="text-[10px] leading-relaxed text-white/45">
              默认由比例、分辨率和时长换算宽高与帧数；通常只需要调比例、时长和分辨率，特殊测试再覆盖帧数。
            </div>
          </div>
        )}

        {/* veo 专用选项(非FAL) */}
        {!isExternalSelected && !isFal && modelDef.kind === 'veo' && !isVeoOmni && (
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={enhancePrompt}
                onChange={(e) => update({ enhancePrompt: e.target.checked })}
                className="accent-rose-400"
              />
              Enhance Prompt
            </label>
            <label className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={enableUpsample}
                onChange={(e) => update({ enableUpsample: e.target.checked })}
                className="accent-rose-400"
              />
              Upsample
            </label>
          </div>
        )}

        {/* Seed(非FAL) */}
        {showGenericVideoControls && (
        <div>
          <label className="text-[10px] text-white/50 block mb-1">Seed (0=随机)</label>
          <input
            type="number"
            value={seed}
            min={0}
            max={2147483647}
            onChange={(e) => update({ seed: Number(e.target.value) || 0 })}
            className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
          />
        </div>
        )}

        {/* 上游素材聚合预览区 (代替原「参考图(上游)」计数提示) */}
        {modelDef.supportImages && (
          <MaterialPreviewSection
            texts={orderedTexts}
            images={orderedImages}
            videos={orderedVideos}
            audios={orderedAudios}
            order={materialOrder}
            onReorder={setMaterialOrder}
            onExcludeUpstream={handleExcludeUpstreamMaterial}
            excludedCount={excludedUpstreamCount}
            onRestoreExcluded={handleRestoreExcludedMaterials}
            selected={!!selected}
            isDark={isDark}
            isPixel={isPixel}
            groups={previewGroups}
            title={previewTitle}
          />
        )}

        {/* 本地拖入参考素材 (Ctrl+拖拽自其他节点) */}
        {modelDef.supportImages && (localRefImages.length + localRefVideos.length + localRefAudios.length) > 0 && (
          <div className="rounded border border-emerald-400/30 bg-emerald-500/5 p-1.5 space-y-1">
            <div className="text-[10px] text-emerald-200/80">
              本地拖入 · 图{localRefImages.length} 视{localRefVideos.length} 音{localRefAudios.length}
            </div>
            {localRefImages.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {localRefImages.map((u, i) => (
                  <div key={`img-${i}`} className="relative w-10 h-10">
                    <SmartImage
                      src={u}
                      alt=""
                      data-drag-source
                      data-drag-kind="image"
                      data-drag-url={u}
                      data-drag-preview={u}
                      data-drag-node-id={id}
                      onMouseDown={(e) => beginMaterialDrag(e, { kind: 'image', url: u, sourceNodeId: id, previewUrl: u })}
                      className="w-10 h-10 object-cover rounded border border-white/10 cursor-grab"
                      thumbSize={160}
                    />
                    <button
                      onClick={() => update({ localRefImages: localRefImages.filter((x) => x !== u) })}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center"
                    >
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {localRefVideos.length > 0 && (
              <div className="space-y-1">
                {localRefVideos.map((u, i) => (
                  <div key={`vid-${i}`} className="flex items-center gap-1">
                    <LoopingVideo
                      src={u}
                      data-drag-source
                      data-drag-kind="video"
                      data-drag-url={u}
                      data-drag-preview={u}
                      data-drag-node-id={id}
                      onMouseDown={(e) => beginMaterialDrag(e, { kind: 'video', url: u, sourceNodeId: id, previewUrl: u })}
                      className="w-12 h-8 object-cover rounded border border-white/10 cursor-grab"
                    />
                    <span className="flex-1 truncate text-[10px] text-white/50">{u.split('/').pop()}</span>
                    <button
                      onClick={() => update({ localRefVideos: localRefVideos.filter((x) => x !== u) })}
                      className="text-rose-300/60 hover:text-rose-200"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {localRefAudios.length > 0 && (
              <div className="space-y-1">
                {localRefAudios.map((u, i) => (
                  <div key={`aud-${i}`} className="flex items-center gap-1">
                    <span
                      data-drag-source
                      data-drag-kind="audio"
                      data-drag-url={u}
                      data-drag-node-id={id}
                      onMouseDown={(e) => beginMaterialDrag(e, { kind: 'audio', url: u, sourceNodeId: id, previewUrl: u })}
                      className="text-[14px] cursor-grab"
                      title="按住 Ctrl 拖拽"
                    >
                      ♪
                    </span>
                    <span className="flex-1 truncate text-[10px] text-white/50">{u.split('/').pop()}</span>
                    <button
                      onClick={() => update({ localRefAudios: localRefAudios.filter((x) => x !== u) })}
                      className="text-rose-300/60 hover:text-rose-200"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prompt */}
        <div>
          <label className="text-[10px] text-white/50 block mb-1">本地 Prompt(可选)</label>
          <MentionPromptInput
            title="视频 Prompt"
            value={localPrompt}
            mentions={promptMentions}
            materials={mentionMaterials}
            onChange={(value, mentions) => update({ prompt: value, promptMentions: mentions })}
            placeholder="备用:无上游连接时使用"
            isDark={isDark}
            isPixel={isPixel}
            promptTemplateKind="video"
            className="w-full h-12 resize-none rounded bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-white/30 placeholder:text-white/30"
          />
        </div>

        {!isBusy ? (
          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium transition-colors"
          >
            <Sparkles size={12} /> 生成视频
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-zinc-500/20 hover:bg-zinc-500/30 text-zinc-200 text-xs font-medium transition-colors"
          >
            <Square size={11} /> 停止({safeProgress || (status === 'submitting' ? '提交中' : '排队中')})
          </button>
        )}

        {isBusy && (
          <div className="flex items-center gap-1 text-[10px] text-rose-200/80">
            <Loader2 size={11} className="animate-spin" />
            {status === 'submitting' ? '提交任务...' : `轮询中 ${safeProgress}`}
            {taskId && <span className="ml-auto text-white/30">{taskId.slice(0, 10)}…</span>}
          </div>
        )}

        {safeError && (
          <div className="flex items-start gap-1 text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
            <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
            <span className="break-all">{safeError}</span>
          </div>
        )}
      </div>

      {videoUrl && !hasAutoOutput && (
        <div className="border-t border-white/10 p-2">
          <LoopingVideo
            src={videoUrl}
            controls
            className="w-full rounded object-contain"
            style={{ aspectRatio: smartVideoAspect }}
            onLoadedMetadata={handleVideoLoadedMetadata}
            data-drag-source
            data-drag-kind="video"
            data-drag-url={videoUrl}
            data-drag-preview={videoUrl}
            data-drag-node-id={id}
            data-resource-title={videoUrl.split('/').pop() || '生成视频'}
            data-prompt-template-kind="video"
            data-prompt-template-category="video-image-to-video"
            data-prompt-template-prompt={d?.lastPrompt || localPrompt}
            onMouseDown={(e) => beginMaterialDrag(e, { kind: 'video', url: videoUrl, sourceNodeId: id, previewUrl: videoUrl })}
            title="按住 Ctrl 拖拽到其他节点"
          />
        </div>
      )}
    </div>
  );
};

export default memo(VideoNode);
