import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Download,
  Edit3,
  Eye,
  Image as ImageIcon,
  Info,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import { useOrderedMaterials } from './useOrderedMaterials';
import MaterialPreviewSection from './MaterialPreviewSection';
import {
  pruneMaterialIdsForDisconnectedSource,
  pruneMaterialOrderForDisconnectedSource,
  useDisconnectUpstreamMaterial,
} from './shared/upstreamMaterialConnections';
import MentionPromptInput from './MentionPromptInput';
import SmartImage from '../SmartImage';
import PromptTextarea from '../PromptTextarea';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';
import {
  IMAGE_MODELS,
  FAL_REGISTRY,
  GPT_FAL_SIZES,
  NBPRO_FAL_RATIOS,
  NBPRO_FAL_RESOLUTIONS,
  isFalModel,
  MJ_VERSIONS,
  MJ_RATIOS,
  MJ_SPEEDS,
  MJ_SVS,
  DEFAULT_MJ_VERSION,
  DEFAULT_MJ_RATIO,
  DEFAULT_MJ_SPEED,
  gptImage2ZhenzhenVariantSize,
  parseModelList,
  withUpstreamModelOption,
} from '../../providers/models';
import {
  generateImage,
  submitImageAsync,
  queryImageStatus,
  submitImageFal,
  queryImageFal,
  uploadFile,
  submitMjImagine,
  queryMjTask,
  uploadMjImage,
  buildMjPrompt,
  generateExternalImage,
  type MjSpeed,
} from '../../services/generation';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useHasAutoOutput } from './useHasAutoOutput';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useRunBusStore } from '../../stores/runBus';
import { useThemeStore } from '../../stores/theme';
import { logBus } from '../../stores/logs';
import { useDragMaterialStore, type MaterialPayload } from '../../stores/dragMaterial';
import { useMaterialDropTarget } from '../../hooks/useMaterialDropTarget';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useApiKeysStore } from '../../stores/apiKeys';
import { addResourceItem } from '../../services/api';
import { fileNameFromUrl, mediaDownloadFileName } from '../../utils/mediaCollection';
import { downloadMediaUrl } from '../../utils/downloadMedia';
import { placeBatchNodes, defaultSizeOf, type Rect as PlacementRect } from '../../utils/nodePlacement';
import { buildOutputQuickActions, type OutputQuickActionId } from '../../utils/outputQuickActions';
import { readImageNaturalSize } from '../../utils/imageNaturalSize';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  distributeModelscopeLoraWeights,
  externalImageSizeFor,
  MAX_MODELSCOPE_NODE_LORAS,
  MODELSCOPE_LORA_TOTAL_WEIGHT,
  modelscopeLoraWeightTotal,
  modelscopeLorasForModel,
  normalizeModelscopeLoraStrength,
  normalizeModelscopeLoraWeightsTotal,
  normalizeModelscopeSelectedLoras,
  resolveAdvancedProviderSelection,
  type ModelscopeSelectedLora,
} from '../../utils/advancedProviders';
import {
  countExcludedMaterials,
  filterExcludedMaterials,
  normalizeExcludedMaterialIds,
} from '../../utils/materialExclusion';
import { COMFY_APP_SOURCE_LABELS } from '../../utils/comfyuiApps';
import { canonicalizeComfyFieldsByWorkflow, comfyFieldInputValue } from '../../utils/comfyuiWorkflow';
import { LocalNodeAddonSlot } from 'virtual:t8-local-extensions';
import ResizableCorners from './ResizableCorners';
import SmartNodeComposer from './shared/SmartNodeComposer';
import SmartNodeShell from './shared/SmartNodeShell';
import { useNodeGeometrySync } from './shared/useNodeGeometrySync';
import { useOutsideClose } from './shared/useOutsideClose';
import { useSmartNodePanelToggle } from './shared/useSmartNodePanelToggle';
import { useThrottledNodeUpdate } from './shared/useThrottledNodeUpdate';
import SmartMediaPreviewModal from './shared/SmartMediaPreviewModal';
import ImageEditModal, { type ImageEditProduceMeta } from './ImageEditModal';
import { buildSmartImageResultInfo } from '../../utils/smartImageResult';
import { resolveImageNodeFinalPrompt } from '../../utils/imageNodePromptPriority';
import {
  createPendingMediaSlots,
  markMediaSlotCancelled,
  markMediaSlotFailed,
  markMediaSlotRunning,
  markMediaSlotSuccess,
  type MediaTaskSlot,
  type MediaTaskSlotStatus,
} from '../../utils/mediaTaskSlots';

/**
 * ImageNode - 图像生成(ZhenzhenMagic)
 * 多 TAB 切换:GPT2 / 香蕉2 / 香蕉Pro / Grok / MJ,参数与主项目 gpt-image-2-web 对齐
 * 参数:模型 TAB / 比例 / 尺寸 / 多张参考图 / 本地 prompt
 * 本地 prompt 优先;为空时继承上游 text;上游 image 节点 → 参考图(并入 references)
 */
const IMAGE_POLL_TIMEOUT_SECONDS = 3600;
const MAX_IMAGE_OUTPUT_COUNT = 10;
const clampImageOutputCount = (value: unknown, fallback = 1) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(MAX_IMAGE_OUTPUT_COUNT, n));
};
const minPollCountForTimeout = (intervalMs: number) =>
  Math.ceil((IMAGE_POLL_TIMEOUT_SECONDS * 1000) / Math.max(1, intervalMs));
const IMAGE_RESULT_SLOT_STATUSES = new Set<MediaTaskSlotStatus>(['pending', 'running', 'success', 'failed', 'cancelled']);
const normalizeImageResultSlot = (slot: any, index: number): MediaTaskSlot => {
  const url = String(slot?.url || '').trim();
  const rawStatus = String(slot?.status || '').trim() as MediaTaskSlotStatus;
  const status = IMAGE_RESULT_SLOT_STATUSES.has(rawStatus)
    ? rawStatus
    : (url ? 'success' : 'pending');
  return {
    status,
    url: status === 'success' ? url : undefined,
    urls: Array.isArray(slot?.urls) ? slot.urls.map((item: unknown) => String(item || '').trim()).filter(Boolean) : undefined,
    taskId: String(slot?.taskId || '').trim() || undefined,
    error: status === 'failed' || status === 'cancelled' ? String(slot?.error || (status === 'cancelled' ? '已停止' : '生成失败')) : undefined,
    index: Number.isFinite(Number(slot?.index)) ? Number(slot.index) : index,
  };
};
const COMFY_NUMERIC_FIELD_SOURCES = new Set([
  'width',
  'height',
  'batch_size',
  'seed',
  'steps',
  'cfg',
  'denoise',
  'start_at_step',
  'end_at_step',
  'guidance',
  'shift',
  'fps',
  'frame_rate',
  'num_frames',
  'duration',
  'strength',
  'weight',
  'strength_model',
  'strength_clip',
]);
const COMFY_NODE_FIELD_SOURCES = new Set([
  'prompt',
  'positive',
  'negative',
  'width',
  'height',
  'batch_size',
  'seed',
  'steps',
  'cfg',
  'sampler_name',
  'scheduler',
  'denoise',
  'model_name',
  'ckpt_name',
  'clip_name',
  'vae_name',
  'lora_name',
  'unet_name',
  'control_net_name',
  'clip_vision_name',
  'style_model_name',
  'upscale_model',
  'strength_model',
  'strength_clip',
  'start_at_step',
  'end_at_step',
  'guidance',
  'shift',
  'fps',
  'frame_rate',
  'num_frames',
  'duration',
  'strength',
  'weight',
  'control_after_generate',
  'add_noise',
]);
const COMFY_IMAGE_SOURCE_RE = /^image(?:_|-)?(\d+)$/i;
const COMFY_MEDIA_SOURCE_RE = /^(image|video|audio)(?:_|-)?\d+$/i;
const COMFY_SAFE_CUSTOM_SOURCE_RE = /^[a-z][a-z0-9_:. -]{0,79}$/i;
const comfyFieldSource = (field: any) => String(field?.source || field?.fieldName || '').trim();
const isComfyNodeFieldSource = (source: string) => {
  if (!source || source === 'fixed') return false;
  if (COMFY_NODE_FIELD_SOURCES.has(source) || COMFY_MEDIA_SOURCE_RE.test(source)) return true;
  return COMFY_SAFE_CUSTOM_SOURCE_RE.test(source);
};
const comfyImageSourceIndex = (source: string) => {
  const match = source.match(COMFY_IMAGE_SOURCE_RE);
  return match ? Math.max(1, Number(match[1]) || 1) : 0;
};

const ImageNode = ({ id, data, selected, dragging }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const { scheduleProgressUpdate, flushProgressUpdate } = useThrottledNodeUpdate(update, 500);
  const hasAutoOutput = useHasAutoOutput(id);
  const updateNodeInternals = useUpdateNodeInternals();
  const { getEdges, getNodes, addNodes } = useReactFlow();
  const { style, theme } = useThemeStore();
  const isPixel = style === 'pixel';
  const isDark = theme === 'dark';
  // 主参考图(referenceImages)上传入口 - 与下面 MJ sref/oref 上传隔离
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // MJ 上传时区分 sref 还是 oref(共用 fileInputRef)
  const mjUploadKindRef = useRef<'sref' | 'oref'>('sref');

  const [error, setError] = useState<string | null>(null);
  const [smartComposerOpenLocal, setSmartComposerOpenLocal] = useState(false);
  const [smartCardDragging, setSmartCardDragging] = useState(false);
  const [smartPreviewOpen, setSmartPreviewOpen] = useState(false);
  const [smartPreviewUrl, setSmartPreviewUrl] = useState('');
  const [smartInfoOpen, setSmartInfoOpen] = useState(false);
  const [smartActionsOpen, setSmartActionsOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [smartResultSize, setSmartResultSize] = useState<{ width: number; height: number } | null>(null);
  const smartNodeRef = useRef<HTMLDivElement>(null);
  const smartImagePointerRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const imageRunSeqRef = useRef(0);
  const resumeImageTaskKeyRef = useRef('');
  const runCancelSeq = useRunBusStore((s) => s.cancelSeq);
  const runCancelTargets = useRunBusStore((s) => s.cancelTargets);
  const throwIfImageRunCancelled = (runSeq: number) => {
    if (imageRunSeqRef.current !== runSeq) {
      throw new DOMException('已停止生成', 'AbortError');
    }
  };
  const waitImagePoll = async (ms: number, runSeq: number) => {
    await new Promise((r) => setTimeout(r, ms));
    throwIfImageRunCancelled(runSeq);
  };
  const d = data as any;
  const model = d?.model || IMAGE_MODELS[0].id;
  const modelDef = useMemo(() => IMAGE_MODELS.find((m) => m.id === model) || IMAGE_MODELS[0], [model]);
  const apiSettings = useApiKeysStore((s) => s.settings);
  const advancedProviders = apiSettings.advancedProviders || [];
  const imageAdvancedProviders = useMemo(
    () => advancedProvidersForNode(advancedProviders, 'image'),
    [advancedProviders],
  );
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'image', {
      providerSource: d?.providerSource,
      providerId: d?.providerId,
      providerModel: d?.providerModel,
    }),
    [advancedProviders, d?.providerSource, d?.providerId, d?.providerModel],
  );
  const isExternalSelected = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const savedExternalMissing = !!d?.providerSource && d.providerSource !== 'zhenzhen' && !providerSelection.available;
  const externalModelOptions = providerSelection.provider
    ? advancedProviderModelOptions(providerSelection.provider, 'image')
    : [];
  const externalProviderModel = providerSelection.providerModel || externalModelOptions[0] || '';
  const providerParams = (d?.providerParams && typeof d.providerParams === 'object') ? d.providerParams : {};
  const externalImageCount = clampImageOutputCount(providerParams.n, 1);
  const externalImageQuality = String(providerParams.quality || 'auto');
  const isModelScopeExternal = isExternalSelected && providerSelection.provider?.protocol === 'modelscope';
  const isComfyExternal = isExternalSelected && providerSelection.provider?.protocol === 'comfyui';
  const comfyWorkflow = isComfyExternal
    ? providerSelection.provider?.comfyuiConfig?.workflows?.find((workflow) => workflow.id === externalProviderModel || workflow.name === externalProviderModel)
    : undefined;
  const comfyWorkflowFields = useMemo(() => {
    if (!isComfyExternal || !comfyWorkflow) return [];
    return canonicalizeComfyFieldsByWorkflow(comfyWorkflow.workflowJson, comfyWorkflow.fields || []);
  }, [isComfyExternal, comfyWorkflow]);
  const comfyRequiredImageCount = isComfyExternal
    ? comfyWorkflowFields.filter((field: any) => COMFY_IMAGE_SOURCE_RE.test(String(field?.source || ''))).length
    : 0;
  const comfyParamFields = useMemo(() => {
    if (!isComfyExternal || !comfyWorkflow) return [];
    const seen = new Set<string>();
    return comfyWorkflowFields.filter((field: any) => {
      const source = comfyFieldSource(field);
      const key = `${field?.nodeId || ''}:${field?.fieldName || ''}:${source}`;
      if (!isComfyNodeFieldSource(source) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [isComfyExternal, comfyWorkflow, comfyWorkflowFields]);
  const comfyHasPromptField = useMemo(
    () => comfyParamFields.some((field: any) => ['prompt', 'positive'].includes(comfyFieldSource(field))),
    [comfyParamFields],
  );
  const comfyImageInputFields = useMemo(
    () => comfyParamFields.filter((field: any) => COMFY_IMAGE_SOURCE_RE.test(comfyFieldSource(field))),
    [comfyParamFields],
  );
  const modelscopeLoras = useMemo(
    () => modelscopeLorasForModel(providerSelection.provider, externalProviderModel),
    [providerSelection.provider, externalProviderModel],
  );
  const modelscopeLoraEnabled = providerParams?.modelscopeLoraEnabled === true;
  const selectedModelscopeLoras = useMemo(() => {
    if (!modelscopeLoraEnabled) return [];
    const normalized = normalizeModelscopeSelectedLoras(
      providerParams?.modelscopeLoras ?? providerParams?.loras,
      modelscopeLoras,
      {
        enabled: providerParams?.modelscopeLoraEnabled,
        id: providerParams?.modelscopeLoraId,
        strength: providerParams?.modelscopeLoraStrength,
      },
    );
    if (normalized.length) return normalized;
    const first = modelscopeLoras[0];
    return first
      ? [{ id: first.id, strength: normalizeModelscopeLoraStrength(first.strength, 0.8) }]
      : [];
  }, [
    modelscopeLoraEnabled,
    modelscopeLoras,
    providerParams?.loras,
    providerParams?.modelscopeLoraId,
    providerParams?.modelscopeLoraStrength,
    providerParams?.modelscopeLoras,
  ]);
  const selectedModelscopeLoraIds = useMemo(
    () => new Set(selectedModelscopeLoras.map((lora) => lora.id)),
    [selectedModelscopeLoras],
  );
  const unselectedModelscopeLoras = useMemo(
    () => modelscopeLoras.filter((lora) => !selectedModelscopeLoraIds.has(lora.id)),
    [modelscopeLoras, selectedModelscopeLoraIds],
  );
  const selectedModelscopeLoraTotal = useMemo(
    () => modelscopeLoraWeightTotal(selectedModelscopeLoras),
    [selectedModelscopeLoras],
  );
  const selectedModelscopeLoraRemaining = Math.max(
    0,
    Number((MODELSCOPE_LORA_TOTAL_WEIGHT - selectedModelscopeLoraTotal).toFixed(4)),
  );
  const patchProviderParams = (patch: Record<string, any>) => {
    update({ providerParams: { ...providerParams, ...patch } });
  };
  const applyModelscopeLoraSelection = (nextSelection: ModelscopeSelectedLora[], enabled = true) => {
    const normalized = normalizeModelscopeLoraWeightsTotal(
      normalizeModelscopeSelectedLoras(nextSelection, modelscopeLoras),
    );
    const first = normalized[0];
    update({
      providerParams: {
        ...providerParams,
        modelscopeLoraEnabled: enabled && normalized.length > 0,
        modelscopeLoras: normalized,
        loras: undefined,
        modelscopeLoraId: first?.id || '',
        modelscopeLoraStrength: first?.strength,
      },
    });
  };
  const addModelscopeLoraSelection = () => {
    if (selectedModelscopeLoras.length >= MAX_MODELSCOPE_NODE_LORAS) return;
    if (selectedModelscopeLoras.length > 0 && selectedModelscopeLoraRemaining <= 0.0001) return;
    const next = unselectedModelscopeLoras[0];
    if (!next) return;
    const defaultWeight = normalizeModelscopeLoraStrength(next.strength, 0.8);
    const nextWeight = selectedModelscopeLoras.length > 0
      ? Math.min(defaultWeight, selectedModelscopeLoraRemaining)
      : defaultWeight;
    applyModelscopeLoraSelection([
      ...selectedModelscopeLoras,
      { id: next.id, strength: nextWeight },
    ]);
  };
  const updateModelscopeLoraSelection = (index: number, patch: Partial<ModelscopeSelectedLora>) => {
    const otherTotal = modelscopeLoraWeightTotal(selectedModelscopeLoras.filter((_, i) => i !== index));
    const maxForRow = Math.max(0, Number((MODELSCOPE_LORA_TOTAL_WEIGHT - otherTotal).toFixed(4)));
    const nextSelection = selectedModelscopeLoras.map((item, i) => {
      if (i !== index) return item;
      const nextId = String(patch.id ?? item.id).trim();
      const nextOption = modelscopeLoras.find((lora) => lora.id === nextId);
      const hasStrengthPatch = Object.prototype.hasOwnProperty.call(patch, 'strength');
      return {
        id: nextId,
        strength: Math.min(
          normalizeModelscopeLoraStrength(
            hasStrengthPatch ? patch.strength : item.strength,
            nextOption?.strength ?? 0.8,
          ),
          maxForRow,
        ),
      };
    });
    applyModelscopeLoraSelection(nextSelection);
  };
  const removeModelscopeLoraSelection = (index: number) => {
    applyModelscopeLoraSelection(selectedModelscopeLoras.filter((_, i) => i !== index));
  };
  const distributeSelectedModelscopeLoraWeights = () => {
    applyModelscopeLoraSelection(distributeModelscopeLoraWeights(selectedModelscopeLoras));
  };
  const comfyFieldDefault = (field: any) => {
    if (!comfyWorkflow?.workflowJson || !field?.nodeId || !field?.fieldName) return '';
    const value = comfyFieldInputValue(comfyWorkflow.workflowJson, field);
    if (Array.isArray(value) || (value && typeof value === 'object')) return '';
    return value ?? '';
  };
  const comfyValueForSource = (source: string) => {
    const field = comfyParamFields.find((item: any) => comfyFieldSource(item) === source);
    return providerParams[source] ?? (field ? comfyFieldDefault(field) : '');
  };
  const comfyNumberForSource = (source: string, fallback = 0) => {
    const n = Number(comfyValueForSource(source));
    return Number.isFinite(n) ? n : fallback;
  };
  const clearModelscopeLoraParams = () => ({
    providerParams: {
      ...providerParams,
      modelscopeLoraEnabled: false,
      modelscopeLoraId: '',
      modelscopeLoraStrength: undefined,
      modelscopeLoras: [],
      loras: undefined,
    },
  });

  const aspectRatio = d?.aspectRatio || modelDef.defaultAspectRatio;
  const sizeLevel = d?.sizeLevel || modelDef.defaultSize;
  // 子模型变体(对齐 gpt-image-2-web 的 g_model/n_model)
  const savedApiModel = typeof d?.apiModel === 'string' ? d.apiModel : '';
  const configuredApiModelOverride = String(apiSettings.zhenzhenImageModelOverrides?.[modelDef.id] || '').trim();
  const configuredApiModelOptions = withUpstreamModelOption(modelDef.apiModelOptions, configuredApiModelOverride);
  const configuredApiModels = parseModelList(configuredApiModelOverride);
  const apiModel = savedApiModel && configuredApiModelOptions.some((opt) => opt.value === savedApiModel) && (!configuredApiModels.length || configuredApiModels.includes(savedApiModel))
    ? savedApiModel
    : (configuredApiModels[0] || modelDef.apiModel);
  const effectiveApiModel = apiModel;
  const apiModelOptions = configuredApiModelOptions;
  const defaultProviderApiModel = effectiveApiModel;

  // ========== FAL 渠道识别及参数(不影响其他模型) ==========
  const isFal = isFalModel(effectiveApiModel);
  const falDef = isFal ? FAL_REGISTRY[effectiveApiModel] : undefined;
  const falKind = falDef?.paramKind; // 'gpt-fal' | 'nbpro-fal'
  // FAL 参数(默认对齐主项目初始值)
  // gpt-fal: mode/size/quality/n/format/sync/customW/customH
  const falMode: 'edit' | 'gen' = d?.falMode || 'edit';
  const falSize: string = d?.falSize || 'auto';
  const falCustomW: number = d?.falCustomW ?? 1280;
  const falCustomH: number = d?.falCustomH ?? 1280;
  const falQuality: 'low' | 'medium' | 'high' | 'auto' = d?.falQuality || 'medium';
  const falN: number = clampImageOutputCount(d?.falN, 1);
  const coreImageCount: number = clampImageOutputCount(d?.imageCount, 1);
  const coreImageQuality: 'auto' | 'low' | 'medium' | 'high' = d?.imageQuality || 'auto';
  const coreSubmitMode: 'async' | 'sync' = d?.imageSubmitMode === 'sync' ? 'sync' : 'async';
  const falFormat: 'png' | 'jpeg' | 'webp' = d?.falFormat || 'png';
  const falSync: boolean = d?.falSync === true;
  // nbpro-fal: aspect_ratio/resolution/safety/imgMode/webSearch/sysPrompt/seed
  const nbAspect: string = d?.nbAspect || 'auto';
  const nbResolution: string = d?.nbResolution || '2K';
  const nbSafety: string = d?.nbSafety || '4';
  const nbImgMode: 'image_url' | 'base64' = d?.nbImgMode || 'image_url';
  const nbWebSearch: boolean = d?.nbWebSearch === true;
  const nbSysPrompt: string = d?.nbSysPrompt || '';
  const nbSeed: number = d?.nbSeed ?? 0;

  // ========== MJ 渠道识别及参数(完全对齐 gpt-image-2-web mj_* 控件 L1552~L1580) ==========
  const isMj = modelDef.paramKind === 'mj';
  const isGrokImage = modelDef.paramKind === 'grok-image';
  const expectedImageOutputCount = isExternalSelected
    ? externalImageCount
    : (isFal ? falN : (isMj ? 1 : coreImageCount));
  const mjVersion: string = d?.mjVersion || DEFAULT_MJ_VERSION;
  const mjAr: string = d?.mjAr || DEFAULT_MJ_RATIO;
  const mjSpeed: MjSpeed = (d?.mjSpeed as MjSpeed) || DEFAULT_MJ_SPEED;
  const mjC: number = d?.mjC ?? 0;
  const mjS: number = d?.mjS ?? 0;
  const mjIw: number = d?.mjIw ?? 0;
  const mjSw: number = d?.mjSw ?? 0;
  const mjSv: string = d?.mjSv || '1';
  const mjNo: string = d?.mjNo || '';
  const mjSeed: number = d?.mjSeed ?? 0;
  const mjMaxPoll: number = d?.mjMaxPoll ?? 1200;
  const mjPollInt: number = d?.mjPollInt ?? 3;
  const mjSrefImages: string[] = Array.isArray(d?.mjSrefImages) ? d.mjSrefImages : [];
  const mjOrefImages: string[] = Array.isArray(d?.mjOrefImages) ? d.mjOrefImages : [];
  const MJ_REF_MAX = 2; // sref 与 oref 各最多 2 张

  // 参考图上限(FAL 使用 FAL_REGISTRY.maxRefs,其他走原设计)
  const maxRefs = isExternalSelected ? Math.max(8, modelDef.maxReferenceImages || 0) : (falDef?.maxRefs ?? modelDef.maxReferenceImages);
  const status: 'idle' | 'generating' | 'success' | 'error' = d?.status || 'idle';
  const taskId = String(d?.taskId || '').trim();
  const imageUrl = d?.imageUrl as string | undefined;
  const smartImageUrls = useMemo(() => {
    const urls = Array.isArray(d?.imageUrls) ? d.imageUrls : [];
    return Array.from(new Set([
      ...urls.map((url: unknown) => String(url || '').trim()).filter(Boolean),
      String(imageUrl || '').trim(),
    ].filter(Boolean))).slice(0, MAX_IMAGE_OUTPUT_COUNT);
  }, [d?.imageUrls, imageUrl]);
  const imageResultSlots = useMemo<MediaTaskSlot[]>(() => {
    const rawSlots = Array.isArray(d?.imageResultSlots) ? d.imageResultSlots : [];
    if (rawSlots.length) {
      return rawSlots.slice(0, MAX_IMAGE_OUTPUT_COUNT).map(normalizeImageResultSlot);
    }
    return smartImageUrls.map((url, index) => ({ status: 'success', url, index }));
  }, [d?.imageResultSlots, smartImageUrls]);
  const smartImageSuccessUrls = useMemo(
    () => imageResultSlots
      .filter((slot) => slot.status === 'success' && slot.url)
      .map((slot) => String(slot.url)),
    [imageResultSlots],
  );
  const primarySmartImageUrl = smartImageSuccessUrls[0] || '';
  const reconcilePersistedImageUrls = () => {
    if (!smartImageUrls.length) return;
    update({
      status: 'success',
      progress: '100%',
      imageUrl: smartImageUrls[0],
      imageUrls: smartImageUrls,
      imageResultSlots: smartImageUrls.map((url, index) => ({ status: 'success', url, index })),
      error: null,
    });
  };
  const resumePersistedImageTasks = async () => {
    const taskIds = String(d?.taskId || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!taskIds.length) return;
    const resumeKey = `${id}:${taskIds.join(',')}:${effectiveApiModel}`;
    if (resumeImageTaskKeyRef.current === resumeKey) return;
    resumeImageTaskKeyRef.current = resumeKey;
    const runSeq = ++imageRunSeqRef.current;

    const baseUrls = [...smartImageUrls];
    let slots: MediaTaskSlot[] = createPendingMediaSlots(Math.max(expectedImageOutputCount, taskIds.length, baseUrls.length));
    baseUrls.forEach((url, index) => {
      slots = markMediaSlotSuccess(slots, index, [url]);
    });
    update({
      status: 'generating',
      progress: baseUrls.length ? `${Math.min(99, Math.max(1, Math.floor((baseUrls.length / Math.max(1, slots.length)) * 100)))}%` : (d?.progress || '5%'),
      imageResultSlots: slots.map((slot) => ({ ...slot })),
      error: null,
    });

    const mergedUrls = [...baseUrls];
    const pendingTaskIndexes = new Set(taskIds.map((_, index) => index));
    const maxPoll = 1800;
    const interval = 2000;

    for (let pollIndex = 0; pollIndex < maxPoll && pendingTaskIndexes.size > 0; pollIndex += 1) {
      throwIfImageRunCancelled(runSeq);
      const activeTaskIndexes = Array.from(pendingTaskIndexes);
      const settled = await Promise.allSettled(activeTaskIndexes.map(async (taskIndex) => {
        const taskId = taskIds[taskIndex];
        const q = await queryImageStatus(taskId, effectiveApiModel);
        const st = String(q.status || '').toLowerCase();
        if (st === 'completed' || st === 'success' || st === 'done') {
          const url = q.urls?.find(Boolean);
          if (!url) throw new Error(`任务完成但未返回图片: ${taskId}`);
          return { taskIndex, urls: q.urls || [] };
        }
        if (st === 'failed' || st === 'failure' || st === 'error') {
          throw new Error(q.error || `任务失败: ${taskId}`);
        }
        return { taskIndex, pending: true };
      }));

      settled.forEach((result, resultIndex) => {
        const slotIndex = activeTaskIndexes[resultIndex];
        if (result.status === 'fulfilled' && 'urls' in result.value) {
          if (slots[slotIndex]?.status === 'success' && slots[slotIndex]?.url) {
            pendingTaskIndexes.delete(slotIndex);
            return;
          }
          const urls = result.value.urls || [];
          const url = urls.find(Boolean);
          if (url) {
            if (!mergedUrls.includes(url)) mergedUrls.push(url);
            slots = markMediaSlotSuccess(slots, slotIndex, urls);
          }
          pendingTaskIndexes.delete(slotIndex);
          return;
        }
        if (result.status === 'fulfilled' && result.value.pending) {
          return;
        }
        slots = markMediaSlotFailed(
          slots,
          slotIndex,
          result.status === 'rejected' ? result.reason : '任务失败',
        );
        pendingTaskIndexes.delete(slotIndex);
      });

      if (pendingTaskIndexes.size > 0) {
        const completedCount = slots.filter((slot) => slot.status === 'success' || slot.status === 'failed').length;
        scheduleProgressUpdate({
          progress: `${Math.min(99, Math.max(1, Math.floor((completedCount / Math.max(1, slots.length)) * 100)))}%`,
          imageUrl: mergedUrls[0],
          imageUrls: mergedUrls,
          imageResultSlots: slots.map((slot) => ({ ...slot })),
        });
        await waitImagePoll(interval, runSeq);
      }
    }

    slots.forEach((slot, index) => {
      if (slot.status !== 'pending') return;
      slots = markMediaSlotFailed(slots, index, pendingTaskIndexes.has(index) ? '恢复轮询超时' : '未获取到任务结果');
    });

    if (mergedUrls.length) {
      update({
        status: 'success',
        progress: '100%',
        imageUrl: mergedUrls[0],
        imageUrls: mergedUrls,
        imageResultSlots: slots.map((slot) => ({ ...slot })),
        error: null,
      });
      taskCompletionSound.notifyComplete(id, 'image');
      return;
    }

    update({
      status: 'error',
      progress: '',
      imageResultSlots: slots.map((slot) => ({ ...slot })),
      error: '任务完成但未返回图片',
    });
  };
  const localPrompt = d?.prompt || '';
  const promptMentions: MediaMention[] = Array.isArray(d?.promptMentions) ? d.promptMentions : [];
  // 节点内本地上传的参考图(除了上游接入的,这里是手动上传)
  const refImages: string[] = Array.isArray(d?.referenceImages) ? d.referenceImages : [];

  // ============ 上游素材聚合 (新机制) ============
  const upstream = useUpstreamMaterials(id);
  const excludedMaterialIds = useMemo(
    () => normalizeExcludedMaterialIds(d?.excludedMaterialIds),
    [d?.excludedMaterialIds],
  );
  const visibleUpstreamImages = useMemo(
    () => filterExcludedMaterials(upstream.images, excludedMaterialIds),
    [upstream.images, excludedMaterialIds],
  );
  const visibleUpstreamTexts = useMemo(
    () => filterExcludedMaterials(upstream.texts, excludedMaterialIds),
    [upstream.texts, excludedMaterialIds],
  );
  const excludedUpstreamCount = useMemo(
    () => countExcludedMaterials(excludedMaterialIds, [...upstream.images, ...upstream.texts]),
    [excludedMaterialIds, upstream.images, upstream.texts],
  );
  const localImageMaterials: Material[] = useMemo(
    () =>
      refImages.map((url, i) => ({
        id: `local::image:${url}`,
        kind: 'image' as const,
        url,
        sourceNodeId: id,
        origin: 'local' as const,
        label: `本地${i + 1}`,
      })),
    [refImages, id],
  );
  const allImagesUnordered = useMemo(
    () => [...localImageMaterials, ...visibleUpstreamImages],
    [localImageMaterials, visibleUpstreamImages],
  );
  const materialOrder: string[] = Array.isArray(d?.materialOrder) ? d.materialOrder : [];
  const orderedImages = useOrderedMaterials(allImagesUnordered, materialOrder);
  const orderedTexts = useOrderedMaterials(visibleUpstreamTexts, materialOrder);
  const mentionMaterials = useMemo(
    () => orderedImages.slice(0, maxRefs),
    [orderedImages, maxRefs],
  );
  const setMaterialOrder = (newOrder: string[]) => update({ materialOrder: newOrder });
  const disconnectUpstreamMaterial = useDisconnectUpstreamMaterial(id);
  const handleRemoveLocalMaterial = (m: Material) => {
    if (m.origin !== 'local') return;
    update({ referenceImages: refImages.filter((u) => u !== m.url) });
  };
  const handleExcludeUpstreamMaterial = (m: Material) => {
    if (m.origin !== 'upstream') return;
    disconnectUpstreamMaterial(m);
    update({
      excludedMaterialIds: pruneMaterialIdsForDisconnectedSource(excludedMaterialIds, m.sourceNodeId),
      materialOrder: pruneMaterialOrderForDisconnectedSource(materialOrder, m.sourceNodeId),
    });
  };
  const handleRestoreExcludedMaterials = () => update({ excludedMaterialIds: [] });

  const placeQuickActionNode = (type: string, url: string, dataPatch: Record<string, any>) => {
    const me = getNodes().find((node) => node.id === id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 340;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 420;
    const targetSize = defaultSizeOf(type);
    const desired: PlacementRect[] = [{
      x: (me?.position?.x ?? 0) + myW + 80,
      y: (me?.position?.y ?? 0) + Math.min(220, Math.max(0, myH - targetSize.h)),
      w: targetSize.w,
      h: targetSize.h,
    }];
    const off = placeBatchNodes(desired, getNodes(), { source: `placement:image-result-quick:${id}:${type}` });
    addNodes({
      id: `${type}-quick-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      position: { x: desired[0].x + off.dx, y: desired[0].y + off.dy },
      data: dataPatch,
      selected: false,
    } as Node);
  };

  const handleResultQuickAction = async (actionId: OutputQuickActionId, url: string) => {
    if (!url) return;
    if (actionId === 'image-edit') {
      setEditingUrl(url);
      return;
    }
    if (actionId === 'save-resource') {
      const result = await addResourceItem({
        kind: 'image',
        url,
        title: fileNameFromUrl(url) || '生成图像',
        sourceNodeId: id,
      });
      if (result.success) {
        window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
        logBus.success((result as any).duplicate ? '资源库已有该素材' : '已保存到资源库', '图像快捷动作');
      } else {
        logBus.warn(result.error || '保存到资源库失败', '图像快捷动作');
      }
      return;
    }
    if (actionId === 'grid-edit') {
      placeQuickActionNode('grid-editor', url, {
        gridEditorLocalItems: [{
          id: `quick-image-${Date.now()}`,
          url,
          title: fileNameFromUrl(url),
          origin: 'local',
        }],
      });
      return;
    }
    if (actionId === 'image-to-video') {
      placeQuickActionNode('video', url, {
        localRefImages: [url],
        prompt: d?.lastPrompt || localPrompt || '',
        soraMode: 'image_to_video',
        gkfMode: 'image_to_video',
      });
      return;
    }
    if (actionId === 'clip-studio') {
      placeQuickActionNode('clip-studio', url, {
        clipLocalVisuals: [{
          id: `quick-visual-${Date.now()}`,
          kind: 'image',
          url,
          label: fileNameFromUrl(url),
        }],
      });
    }
  };

  const renderResultQuickActions = (url: string) => {
    const actions = buildOutputQuickActions({
      surface: 'image',
      url,
      hasImageEditor: true,
      hasGridEditor: true,
      hasImageToVideo: true,
      hasClipStudio: true,
      hasDirector: false,
    });
    return (
      <div className="nodrag nopan t8-smart-result-action-list">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!action.enabled}
            className="t8-smart-result-action"
            data-disabled={action.enabled ? 'false' : 'true'}
            title={action.disabledReason || action.label}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!action.enabled) return;
              void handleResultQuickAction(action.id, url);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  };

  const handleProduce = (urls: string[], _meta?: ImageEditProduceMeta) => {
    const cleanUrls = (Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean);
    if (cleanUrls.length === 0) return;
    const me = getNodes().find((node) => node.id === id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || smartCardWidth || 340;
    const myH = (me as any)?.measured?.height || (me as any)?.height || smartCardHeight || 360;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const targetSize = defaultSizeOf('output');
    const colW = 350;
    const rowH = Math.max(360, myH);
    const desired: PlacementRect[] = cleanUrls.map((_, index) => ({
      x: baseX + (index % 3) * colW,
      y: baseY + Math.floor(index / 3) * rowH,
      w: targetSize.w,
      h: targetSize.h,
    }));
    const off = placeBatchNodes(desired, getNodes(), { source: `placement:image-result-edit:${id}` });
    const ts = Date.now();
    addNodes(cleanUrls.map((url, index) => ({
      id: `output-auto-edit-${id}-${ts}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'output',
      position: {
        x: desired[index].x + off.dx,
        y: desired[index].y + off.dy,
      },
      data: {
        directImageUrl: url,
        imageUrl: url,
      },
      selected: index === 0,
    } as Node)));
    logBus.success(`图像编辑完成，已创建 ${cleanUrls.length} 个输出素材节点`, '图像结果编辑');
  };

  // 切换模型时,如果当前比例/尺寸不在新模型选项里则重置
  const switchModel = (mId: string) => {
    const newDef = IMAGE_MODELS.find((m) => m.id === mId) || IMAGE_MODELS[0];
    const configuredModels = parseModelList(apiSettings.zhenzhenImageModelOverrides?.[newDef.id]);
    const patch: any = { model: mId, apiModel: configuredModels[0] || newDef.apiModel };
    if (newDef.paramKind === 'mj') {
      if (!d?.mjVersion) patch.mjVersion = DEFAULT_MJ_VERSION;
      if (!d?.mjAr) patch.mjAr = DEFAULT_MJ_RATIO;
      if (!d?.mjSpeed) patch.mjSpeed = DEFAULT_MJ_SPEED;
      if (d?.mjSv === undefined) patch.mjSv = '1';
    } else {
      if (!newDef.aspectRatios.includes(aspectRatio)) patch.aspectRatio = newDef.defaultAspectRatio;
      if (!newDef.sizes.includes(sizeLevel)) patch.sizeLevel = newDef.defaultSize;
    }
    update(patch);
  };

  const switchApiModel = (nextApiModel: string) => {
    const nextSize = gptImage2ZhenzhenVariantSize(nextApiModel);
    update(nextSize ? { apiModel: nextApiModel, sizeLevel: nextSize } : { apiModel: nextApiModel });
  };

  // 从上游节点 + 本地上传按用户排序后的顺序聚合 prompt + 参考图
  // 注意: 此处只输出已合并、已排序的列表, 不再原地从 edges/nodes 二次收集
  const collectUpstream = (): { prompt: string; images: string[] } => {
    const prompts = orderedTexts.map((t) => t.url).filter((s) => !!s);
    const images: string[] = [];
    for (const m of orderedImages) {
      if (typeof m.url === 'string' && m.url) images.push(m.url);
    }
    void getEdges;
    void getNodes;
    return {
      prompt: prompts.join('\n').trim(),
      images: images.slice(0, maxRefs),
    };
  };

  // 手动上传主参考图 (走 mainFileInputRef, 与 MJ sref/oref 隔离)
  const handlePickFile = () => mainFileInputRef.current?.click();
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError(null);
    try {
      const remain = maxRefs - refImages.length;
      const accepted = files.slice(0, Math.max(0, remain));
      const uploaded: string[] = [];
      for (const f of accepted) {
        const r = await uploadFile(f);
        uploaded.push(r.url);
      }
      update({ referenceImages: [...refImages, ...uploaded] });
    } catch (err: any) {
      setError(err?.message || '上传失败');
    } finally {
      if (mainFileInputRef.current) mainFileInputRef.current.value = '';
    }
  };

  // ========== MJ 参考图上传(sref/oref)与移除 ==========
  const handleMjPick = (kind: 'sref' | 'oref') => {
    mjUploadKindRef.current = kind;
    fileInputRef.current?.click();
  };
  const handleMjFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError(null);
    try {
      const kind = mjUploadKindRef.current;
      const cur = kind === 'sref' ? mjSrefImages : mjOrefImages;
      const remain = MJ_REF_MAX - cur.length;
      const accepted = files.slice(0, Math.max(0, remain));
      const uploaded: string[] = [];
      for (const f of accepted) {
        const url = await uploadMjImage(f, mjSpeed);
        if (url) uploaded.push(url);
      }
      if (kind === 'sref') update({ mjSrefImages: [...cur, ...uploaded] });
      else update({ mjOrefImages: [...cur, ...uploaded] });
    } catch (err: any) {
      setError(err?.message || 'MJ 参考图上传失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const removeMjRef = (kind: 'sref' | 'oref', idx: number) => {
    if (kind === 'sref') update({ mjSrefImages: mjSrefImages.filter((_, i) => i !== idx) });
    else update({ mjOrefImages: mjOrefImages.filter((_, i) => i !== idx) });
  };

  const handleGenerate = async () => {
    const runSeq = ++imageRunSeqRef.current;
    setError(null);
    const { prompt: upstreamPrompt, images: upstreamImages } = collectUpstream();
    const resolvedLocalPrompt = resolveMediaMentions(localPrompt, promptMentions, mentionMaterials);
    const comfyProviderPrompt = isComfyExternal
      ? String(providerParams.prompt ?? providerParams.positive ?? '').trim()
      : '';
    const resolvedComfyPrompt = isComfyExternal
      ? resolveMediaMentions(comfyProviderPrompt || localPrompt, promptMentions, mentionMaterials)
      : '';
    const finalPrompt = resolveImageNodeFinalPrompt({
      upstreamPrompt,
      localPrompt: resolvedLocalPrompt,
      comfyPrompt: resolvedComfyPrompt,
      isComfyExternal,
    });
    const src = `image:${id.slice(0, 6)}`;
    if (!finalPrompt && (!isComfyExternal || comfyHasPromptField)) {
      setError('未连接 text 节点也未填写 prompt');
      logBus.error('生成中止: 缺少 prompt', src);
      return;
    }
    taskCompletionSound.primeAudio();
    update({
      status: 'generating',
      progress: '0%',
      error: null,
      imageResultSlots: createPendingMediaSlots(expectedImageOutputCount),
    });
    try {
      // collectUpstream 已返回「本地上传 + 上游接入」按用户拖拽顺序合并后的列表,
      // 这里不再二次叠加 refImages, 避免本地参考图重复传递。
      const allRefs = upstreamImages.slice(0, maxRefs);

      if (isExternalSelected && providerSelection.provider) {
        const providerModel = externalProviderModel;
        if (!providerModel) throw new Error('扩展平台未配置可用图像模型');
        let size = externalImageSizeFor(aspectRatio, sizeLevel);
        if (isComfyExternal && comfyWorkflow) {
          const width = comfyNumberForSource('width', 1024);
          const height = comfyNumberForSource('height', 1024);
          if (width > 0 && height > 0) size = `${Math.round(width)}x${Math.round(height)}`;
        }
        const externalProviderParams = { ...(d?.providerParams || {}) };
        let loraLog = '';
        if (isModelScopeExternal && modelscopeLoraEnabled) {
          if (!selectedModelscopeLoras.length) throw new Error('当前 ModelScope 模型没有可用 LoRA，请先在 API 设置中绑定。');
          const loraPayload: Record<string, number> = {};
          selectedModelscopeLoras.forEach((item) => {
            loraPayload[item.id] = item.strength;
          });
          externalProviderParams.loras = loraPayload;
          externalProviderParams.modelscopeLoras = selectedModelscopeLoras;
          externalProviderParams.modelscopeLoraId = selectedModelscopeLoras[0]?.id || '';
          externalProviderParams.modelscopeLoraStrength = selectedModelscopeLoras[0]?.strength;
          loraLog = ` · LoRA=${selectedModelscopeLoras.map((item) => {
            const option = modelscopeLoras.find((lora) => lora.id === item.id);
            return `${option?.name || item.id}@${item.strength.toFixed(2)}`;
          }).join('+')}`;
        } else {
          delete externalProviderParams.loras;
          delete externalProviderParams.modelscopeLoras;
        }
        const externalNegativePrompt = isComfyExternal
          ? String(
              externalProviderParams.negativePrompt
              ?? externalProviderParams.negative
              ?? '',
            ).trim()
          : '';
        logBus.info(
          `扩展平台提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${providerModel}${loraLog} · size=${size} · 参考图=${allRefs.length}`,
          src,
        );
        const res = await generateExternalImage({
          providerId: providerSelection.provider.id,
          providerModel,
          model: providerModel,
          prompt: finalPrompt,
          size,
          // 比例 / 清晰度等级原样带给扩展平台（New API / apishu 等按 aspect_ratio + image_size 识别）。
          // comfy 工作流尺寸由 width/height 决定，不下发等级；Auto 不下发，交给上游默认。
          aspect_ratio: !isComfyExternal && aspectRatio && aspectRatio !== 'Auto' ? aspectRatio : undefined,
          image_size: !isComfyExternal && sizeLevel ? sizeLevel : undefined,
          images: allRefs,
          negativePrompt: externalNegativePrompt || undefined,
          negative: externalNegativePrompt || undefined,
          n: externalImageCount,
          quality: externalImageQuality && externalImageQuality !== 'auto' ? externalImageQuality : undefined,
          providerParams: externalProviderParams,
        });
        throwIfImageRunCancelled(runSeq);
        const urls = res.imageUrls || [];
        if (!urls.length) throw new Error('扩展平台完成但未返回图片');
        update({
          status: 'success',
          progress: '100%',
          imageUrl: urls[0],
          imageUrls: urls,
          imageResultSlots: urls.map((url, index) => ({ status: 'success', url, index })),
          remoteImageUrls: res.remoteImageUrls,
          lastPrompt: finalPrompt,
          usedI2I: allRefs.length > 0,
          taskId: res.taskId || d?.taskId,
        });
        logBus.success(`扩展平台完成 → ${urls[0]}`, src);
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }

      // ============ MJ 路径(对齐 gpt-image-2-web runMJ L4437~L4716) ============
      if (isMj) {
        logBus.info(
          `MJ提交: version=${mjVersion} ar=${mjAr} speed=${mjSpeed} ref=${allRefs.length} sref=${mjSrefImages.length} oref=${mjOrefImages.length} prompt="${finalPrompt.slice(0, 60)}${finalPrompt.length > 60 ? '…' : ''}"`,
          src,
        );
        // 主参考图(垫图): 将 URL 转 base64(主项目只接受 base64Array,上游节点输出的 imageUrl 需下载转换)
        const base64Array: string[] = [];
        for (const u of allRefs) {
          try {
            const resp = await fetch(u);
            const blob = await resp.blob();
            const dataUrl: string = await new Promise((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result || ''));
              fr.onerror = () => reject(new Error('读取失败'));
              fr.readAsDataURL(blob);
            });
            base64Array.push(dataUrl);
          } catch (err: any) {
            logBus.warn(`MJ 主参考图转 base64 失败,跳过: ${u}`, src);
          }
        }
        // sref/oref 允许多张(buildMjPrompt 会为每个 URL 各追加一个 flag)
        const fullPrompt = buildMjPrompt({
          prompt: finalPrompt,
          model: mjVersion,
          ar: mjAr,
          c: mjC || undefined,
          s: mjS || undefined,
          iw: mjIw || undefined,
          sw: mjSw || undefined,
          sv: mjSv || undefined,
          no: mjNo || undefined,
          srefUrls: mjSrefImages,
          orefUrls: mjOrefImages,
        });
        const submit = await submitMjImagine({
          prompt: fullPrompt,
          ar: mjAr,
          c: mjC || undefined,
          s: mjS || undefined,
          iw: mjIw || undefined,
          sw: mjSw || undefined,
          sv: mjSv || undefined,
          no: mjNo || undefined,
          seed: mjSeed || undefined,
          speed: mjSpeed,
          base64Array,
          remix: true,
        });
        throwIfImageRunCancelled(runSeq);
        const taskId = submit.taskId;
        logBus.info(`MJ 任务已提交 taskId=${taskId} fullPrompt="${fullPrompt.slice(0, 120)}${fullPrompt.length > 120 ? '…' : ''}"`, src);
        update({ progress: '15%', taskId });
        const interval = Math.max(1, Math.min(30, mjPollInt || 3)) * 1000;
        const maxPoll = Math.max(
          10,
          minPollCountForTimeout(interval),
          Math.min(3600, mjMaxPoll || 1200),
        );
        for (let i = 0; i < maxPoll; i++) {
          await waitImagePoll(interval, runSeq);
          const q = await queryMjTask(taskId, mjSpeed);
          throwIfImageRunCancelled(runSeq);
          if (q.status === 'FAILURE') {
            throw new Error(`MJ 失败: ${q.failReason || '未知错误'}`);
          }
          if (q.progress) {
            const pct = parseInt(String(q.progress)) || 0;
            const out = `${Math.min(99, 15 + Math.floor(pct * 0.85))}%`;
            update({ progress: out });
            if (i % 3 === 2) logBus.debug(`[${i + 1}/${maxPoll}] MJ progress=${q.progress} status=${q.status}`, src);
          }
          if (q.status === 'SUCCESS') {
            const main = q.imageUrl || '';
            const grid = q.imageUrls || [];
            const all = grid.length ? grid : (main ? [main] : []);
            if (!all.length) {
              // 调试：上游字段名可能变化，把原始报文打到日志便于定位
              try {
                const dump = JSON.stringify(q.raw)?.slice(0, 800) || String(q.raw);
                logBus.warn(`MJ 任务完成但未拿到 imageUrl/imageUrls，raw=${dump}`, src);
              } catch {}
              throw new Error('MJ 任务完成但未返回图片');
            }
            const final = main || all[0];
            logBus.success(`MJ 任务完成 → ${final}` + (grid.length ? ` (含 ${grid.length} 张子图)` : ''), src);
            update({
              status: 'success',
              progress: '100%',
              imageUrl: final,
              imageUrls: all,
              imageResultSlots: all.map((url, index) => ({ status: 'success', url, index })),
              lastPrompt: finalPrompt,
              usedI2I: allRefs.length > 0 || mjSrefImages.length > 0 || mjOrefImages.length > 0,
            });
            taskCompletionSound.notifyComplete(id, 'image');
            return;
          }
        }
        throw new Error(`MJ 轮询超时: ${maxPoll} 次 × ${interval / 1000}s`);
      }

      // ============ FAL 路径(对齐 gpt-image-2-web runGPTFal / runNanoFal) ============
      if (isFal && falDef) {
        const sizeDesc = falKind === 'gpt-fal'
          ? (falSize === 'custom' ? `${falCustomW}×${falCustomH}` : falSize)
          : `${nbAspect}/${nbResolution}`;
        logBus.info(
          `FAL提交: model=${effectiveApiModel} kind=${falKind} size=${sizeDesc} 参考图=${allRefs.length} prompt="${finalPrompt.slice(0, 60)}${finalPrompt.length > 60 ? '…' : ''}"`,
          src,
        );
        const submit = await submitImageFal({
          apiModel: effectiveApiModel,
          prompt: finalPrompt,
          images: allRefs,
          n: falKind === 'gpt-fal' ? falN : (d?.falN ?? 1),
          format: falFormat,
          sync: falSync,
          // gpt-fal
          mode: falKind === 'gpt-fal' ? falMode : undefined,
          size: falKind === 'gpt-fal' ? falSize : undefined,
          customW: falKind === 'gpt-fal' && falSize === 'custom' ? falCustomW : undefined,
          customH: falKind === 'gpt-fal' && falSize === 'custom' ? falCustomH : undefined,
          quality: falKind === 'gpt-fal' ? falQuality : undefined,
          // nbpro-fal
          aspect_ratio: falKind === 'nbpro-fal' ? nbAspect : undefined,
          resolution: falKind === 'nbpro-fal' ? nbResolution : undefined,
          safety_tolerance: falKind === 'nbpro-fal' ? nbSafety : undefined,
          seed: falKind === 'nbpro-fal' && nbSeed > 0 ? nbSeed : undefined,
          system_prompt: falKind === 'nbpro-fal' ? nbSysPrompt : undefined,
          enable_web_search: falKind === 'nbpro-fal' ? nbWebSearch : undefined,
          image_mode: falKind === 'nbpro-fal' ? nbImgMode : undefined,
          providerParams,
        });
        throwIfImageRunCancelled(runSeq);

        // 同步完成
        if (submit.sync && submit.urls && submit.urls.length) {
          logBus.success(`FAL同步返回 → ${submit.urls[0]}`, src);
          update({
            status: 'success',
            progress: '100%',
            imageUrl: submit.urls[0],
            imageUrls: submit.urls,
            imageResultSlots: submit.urls.map((url, index) => ({ status: 'success', url, index })),
            lastPrompt: finalPrompt,
            usedI2I: allRefs.length > 0,
          });
          taskCompletionSound.notifyComplete(id, 'image');
          return;
        }

        // 异步轮询: 1200×3s = 3600s，避免 FAL 图像长队列 30min 提前超时。
        const { requestId, responseUrl, endpoint } = submit;
        if (!requestId || !responseUrl) throw new Error('FAL 提交后未获得 request_id/response_url');
        logBus.info(`FAL异步任务已提交 requestId=${requestId}`, src);
        update({
          progress: '5%',
          taskId: requestId,
          falResponseUrl: responseUrl,
          falEndpoint: endpoint,
        });
        const interval = 3000;
        const maxPoll = minPollCountForTimeout(interval);
        for (let i = 0; i < maxPoll; i++) {
          await waitImagePoll(interval, runSeq);
          const q = await queryImageFal({ responseUrl, endpoint, requestId });
          throwIfImageRunCancelled(runSeq);
          const st = String(q.status || '').toLowerCase();
          if (st === 'completed') {
            const url = q.urls?.[0];
            if (!url) throw new Error('FAL 任务完成但未返回图片');
            logBus.success(`FAL 任务完成 → ${url}`, src);
            update({
              status: 'success',
              progress: '100%',
              imageUrl: url,
              imageUrls: q.urls,
              imageResultSlots: (q.urls || []).map((itemUrl, index) => ({ status: 'success', url: itemUrl, index })),
              lastPrompt: finalPrompt,
              usedI2I: allRefs.length > 0,
            });
            taskCompletionSound.notifyComplete(id, 'image');
            return;
          }
          if (st === 'failed') {
            throw new Error(q.error || 'FAL 任务失败');
          }
          // 进度估算(15% 起步,到 95% 上限)
          const pct = Math.min(95, 15 + Math.floor((i / maxPoll) * 80));
          if (i % 5 === 4) {
            update({ progress: `${pct}%` });
            logBus.debug(`[${i + 1}/${maxPoll}] FAL 轮询 status=${q.falStatus || 'IN_QUEUE'}`, src);
          }
        }
        throw new Error(`FAL 超时: ${(maxPoll * interval) / 1000}s 未完成`);
      }

      // ============ 原有标准路径(GPT2 standard / nano-banana / nano-banana-pro 未动) ============
      logBus.info(
        `提交任务: model=${effectiveApiModel} 比例=${aspectRatio} 尺寸=${sizeLevel} 数量=${coreImageCount} 参考图=${allRefs.length} prompt="${finalPrompt.slice(0, 60)}${finalPrompt.length > 60 ? '…' : ''}"`,
        src,
      );
      const allCoreImageUrls: string[] = [];
      const allCoreFailures: string[] = [];
      let coreSlots: MediaTaskSlot[] = createPendingMediaSlots(coreImageCount);
      const coreErrorMessage = (reason: unknown) => reason instanceof Error
        ? reason.message
        : String(reason || '未知错误');
      const publishCoreImageSlots = () => {
        update({ imageResultSlots: coreSlots.map((slot) => ({ ...slot })) });
      };
      const setCoreImageSlotSuccess = (requestIndex: number, urls: string[]) => {
        const url = urls.find(Boolean);
        if (!url) return;
        coreSlots = markMediaSlotSuccess(coreSlots, requestIndex, urls);
        publishCoreImageSlots();
      };
      const setImageSlotFailed = (requestIndex: number, error: unknown) => {
        coreSlots = markMediaSlotFailed(coreSlots, requestIndex, error);
        publishCoreImageSlots();
      };
      const appendCoreImageUrls = (urls: string[]) => {
        const nextUrls = urls.filter(Boolean);
        if (!nextUrls.length) return;
        allCoreImageUrls.push(...nextUrls);
        update({
          imageUrl: allCoreImageUrls[0],
          imageUrls: [...allCoreImageUrls],
          error: null,
        });
      };
      const progressForRequest = (requestIndex: number, taskProgress = 0) => {
        const completed = requestIndex / Math.max(1, coreImageCount);
        const current = Math.max(0, Math.min(100, taskProgress)) / 100 / Math.max(1, coreImageCount);
        return `${Math.min(99, Math.max(1, Math.floor((completed + current) * 100)))}%`;
      };
      const coreProgress = Array.from({ length: coreImageCount }, () => 0);
      const updateCoreAggregateProgress = (requestIndex: number, taskProgress: number) => {
        coreProgress[requestIndex] = Math.max(0, Math.min(100, taskProgress));
        const avg = coreProgress.reduce((sum, value) => sum + value, 0) / Math.max(1, coreProgress.length);
        scheduleProgressUpdate({ progress: `${Math.min(99, Math.max(1, Math.floor(avg)))}%` });
      };
      const buildCoreImageRequest = () => ({
        model: modelDef.id,
        apiModel: effectiveApiModel,
        paramKind: modelDef.paramKind,
        prompt: finalPrompt,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: allRefs,
        n: 1,
        quality: coreImageQuality,
        providerParams,
      });

      if (coreSubmitMode === 'sync') {
        const coreSyncResults = await Promise.allSettled(Array.from({ length: coreImageCount }, async (_, requestIndex) => {
          const requestLabel = coreImageCount > 1 ? `(${requestIndex + 1}/${coreImageCount}) ` : '';
          const coreImageRequest = buildCoreImageRequest();
          updateCoreAggregateProgress(requestIndex, 5);
          coreSlots = markMediaSlotRunning(coreSlots, requestIndex);
          publishCoreImageSlots();
          const syncResult = await generateImage(coreImageRequest);
          throwIfImageRunCancelled(runSeq);
          const url = syncResult.urls?.[0];
          if (!url) throw new Error(`${requestLabel}同步生成完成但未返回图片`);
          updateCoreAggregateProgress(requestIndex, 100);
          setCoreImageSlotSuccess(requestIndex, syncResult.urls);
          appendCoreImageUrls(syncResult.urls);
          logBus.success(`${requestLabel}同步生成完成 → ${url}`, src);
          return { requestIndex, urls: syncResult.urls };
        }));
        throwIfImageRunCancelled(runSeq);
        coreSyncResults.forEach((result, requestIndex) => {
          if (result.status === 'rejected') {
            const requestLabel = coreImageCount > 1 ? `(${requestIndex + 1}/${coreImageCount}) ` : '';
            setImageSlotFailed(requestIndex, result.reason);
            allCoreFailures.push(`${requestLabel}${coreErrorMessage(result.reason)}`);
          }
        });
      } else {
        type CoreAsyncTask = { requestIndex: number; taskId: string };
        type CoreAsyncCompleted = { requestIndex: number; urls: string[] };
        const coreAsyncSubmissions = await Promise.allSettled(Array.from({ length: coreImageCount }, async (_, requestIndex) => {
          const requestLabel = coreImageCount > 1 ? `(${requestIndex + 1}/${coreImageCount}) ` : '';
          const coreImageRequest = buildCoreImageRequest();
          updateCoreAggregateProgress(requestIndex, 5);
          coreSlots = markMediaSlotRunning(coreSlots, requestIndex);
          publishCoreImageSlots();
          const submit = await submitImageAsync(coreImageRequest);
          throwIfImageRunCancelled(runSeq);
          if (submit.sync && submit.urls && submit.urls.length) {
            logBus.success(`${requestLabel}同步返回 → ${submit.urls[0]}`, src);
            updateCoreAggregateProgress(requestIndex, 100);
            setCoreImageSlotSuccess(requestIndex, submit.urls);
            appendCoreImageUrls(submit.urls);
            return { requestIndex, urls: submit.urls } as CoreAsyncCompleted;
          }
          if (!submit.taskId) throw new Error(`${requestLabel}未获取到 taskId 且无同步结果`);
          logBus.info(`${requestLabel}异步任务已提交 taskId=${submit.taskId} 进入轮询…`, src);
          coreSlots = markMediaSlotRunning(coreSlots, requestIndex, submit.taskId);
          publishCoreImageSlots();
          updateCoreAggregateProgress(requestIndex, parseInt(submit.progress || '10', 10) || 10);
          return { requestIndex, taskId: submit.taskId } as CoreAsyncTask;
        }));
        throwIfImageRunCancelled(runSeq);

        const coreAsyncTasks: CoreAsyncTask[] = [];
        coreAsyncSubmissions.forEach((result, requestIndex) => {
          if (result.status === 'fulfilled') {
            if (!('urls' in result.value)) coreAsyncTasks.push(result.value);
          } else {
            const requestLabel = coreImageCount > 1 ? `(${requestIndex + 1}/${coreImageCount}) ` : '';
            setImageSlotFailed(requestIndex, result.reason);
            allCoreFailures.push(`${requestLabel}${coreErrorMessage(result.reason)}`);
          }
        });
        if (coreAsyncTasks.length) {
          update({ taskId: coreAsyncTasks.map((task) => task.taskId).join(',') });
        }
        // GPT2 / nano-banana / nano-banana-pro 标准路径轮询上限:
        //   maxPoll × interval = 1800 × 2s = 3600s = 60 分钟(避免复杂 prompt / 多参考图任务被 120s 提前中断)
        const maxPoll = 1800;     // 最多 1800 次
        const interval = 2000;    // 每 2 秒一次
        const pollCoreTask = async (task: CoreAsyncTask): Promise<CoreAsyncCompleted> => {
          const requestLabel = coreImageCount > 1 ? `(${task.requestIndex + 1}/${coreImageCount}) ` : '';
          let lastProg = '5%';
          for (let i = 0; i < maxPoll; i++) {
            await waitImagePoll(interval, runSeq);
            const q = await queryImageStatus(task.taskId, effectiveApiModel);
            throwIfImageRunCancelled(runSeq);
            if (q.progress && q.progress !== lastProg) {
              lastProg = q.progress;
              const pct = parseInt(String(q.progress), 10) || 0;
              updateCoreAggregateProgress(task.requestIndex, pct);
              logBus.debug(`${requestLabel}[${i + 1}/${maxPoll}] status=${q.status} progress=${q.progress}`, src);
            }
            const st = String(q.status || '').toLowerCase();
            if (st === 'completed' || st === 'success' || st === 'done') {
              const url = q.urls?.[0];
              if (!url) throw new Error(`${requestLabel}任务完成但未返回图片`);
              logBus.success(`${requestLabel}任务完成 → ${url}`, src);
              updateCoreAggregateProgress(task.requestIndex, 100);
              setCoreImageSlotSuccess(task.requestIndex, q.urls || []);
              appendCoreImageUrls(q.urls || []);
              return { requestIndex: task.requestIndex, urls: q.urls || [] };
            }
            if (st === 'failed' || st === 'failure' || st === 'error') {
              throw new Error(q.error || `${requestLabel}任务失败`);
            }
          }
          throw new Error(`${requestLabel}超时:${maxPoll * interval / 1000}s 未完成`);
        };
        const polledCoreSettled = await Promise.allSettled(coreAsyncTasks.map(pollCoreTask));
        throwIfImageRunCancelled(runSeq);
        polledCoreSettled.forEach((result, index) => {
          if (result.status === 'rejected') {
            const task = coreAsyncTasks[index];
            const requestLabel = task && coreImageCount > 1 ? `(${task.requestIndex + 1}/${coreImageCount}) ` : '';
            if (task) setImageSlotFailed(task.requestIndex, result.reason);
            allCoreFailures.push(`${requestLabel}${coreErrorMessage(result.reason)}`);
          }
        });
      }

      if (allCoreFailures.length) {
        logBus.warn(`部分生成失败: ${allCoreFailures.join('; ')}`, src);
      }
      if (!allCoreImageUrls.length) throw new Error(allCoreFailures.join('; ') || '生成完成但未返回图片');
      flushProgressUpdate();
      update({
        status: 'success',
        progress: '100%',
        imageUrl: allCoreImageUrls[0],
        imageUrls: allCoreImageUrls,
        imageResultSlots: coreSlots.map((slot) => ({ ...slot })),
        lastPrompt: finalPrompt,
        usedI2I: allRefs.length > 0,
        error: null,
      });
      taskCompletionSound.notifyComplete(id, 'image');
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.message === '已停止生成') {
        logBus.warn('已停止生成', src);
        return;
      }
      const msg = e?.message || '生成失败';
      setError(msg);
      logBus.error(`生成失败: ${msg}`, src);
      update({ status: 'error', error: msg });
    }
  };

  const handleStop = () => {
    imageRunSeqRef.current += 1;
    flushProgressUpdate();
    setError(null);
    const cancelledSlots = imageResultSlots.length
      ? imageResultSlots.map((slot, index) => (
          slot.status === 'success' || slot.status === 'failed' || slot.status === 'cancelled'
            ? slot
            : markMediaSlotCancelled(imageResultSlots, index, '已停止生成')[index]
        ))
      : [];
    update({ status: 'idle', progress: '', error: null, imageResultSlots: cancelledSlots });
    logBus.warn('用户主动停止', `image:${id.slice(0, 6)}`);
  };

  useEffect(() => {
    if (runCancelSeq > 0 && runCancelTargets.includes(id) && status === 'generating') {
      handleStop();
    }
  }, [runCancelSeq, runCancelTargets, id, status]);

  useEffect(() => {
    if (imageRunSeqRef.current === 0 && status === 'generating' && smartImageUrls.length > 0 && !taskId) {
      reconcilePersistedImageUrls();
    }
  }, [status, smartImageUrls, taskId]);

  useEffect(() => {
    if (imageRunSeqRef.current === 0 && status === 'generating' && taskId) {
      void resumePersistedImageTasks().catch((err) => {
        logBus.warn(`恢复图片任务轮询失败: ${err?.message || err}`, `image:${id.slice(0, 6)}`);
      });
    }
  }, [status, taskId, effectiveApiModel]);

  // 接入运行总线,供批量运行调起
  useRunTrigger(id, handleGenerate, 'image');

  // === 跨节点拖拽: source (从输出图 Ctrl+拖出) ===
  const startDrag = useDragMaterialStore((s) => s.start);
  const beginMaterialDrag = (e: React.MouseEvent, payload: MaterialPayload) => {
    if (e.button !== 0) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(payload, e.clientX, e.clientY);
  };

  const handleSmartImageMouseDown = (e: React.MouseEvent, url: string) => {
    smartImagePointerRef.current = { x: e.clientX, y: e.clientY, moved: false };
    beginMaterialDrag(e, { kind: 'image', url, sourceNodeId: id, previewUrl: url });
  };

  const handleSmartImageMouseMove = (e: React.MouseEvent) => {
    const pointer = smartImagePointerRef.current;
    if (!pointer || pointer.moved) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 6) {
      pointer.moved = true;
    }
  };

  const handleSmartImageDoubleClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingUrl(url);
    setSmartInfoOpen(false);
    setSmartActionsOpen(false);
  };

  // === 跨节点拖拽: target (接收图像 → 追加到 referenceImages; 接收文本 → 替换 prompt) ===
  const handleDrop = (payload: MaterialPayload) => {
    if (payload.kind === 'image' && payload.url) {
      const cur = Array.isArray(d?.referenceImages) ? d.referenceImages : [];
      if (cur.indexOf(payload.url) !== -1) return;
      if (cur.length >= maxRefs) return;
      update({ referenceImages: [...cur, payload.url] });
    } else if (payload.kind === 'text' && typeof payload.text === 'string') {
      update({ prompt: payload.text });
    }
  };
  const { dropProps, isAccepting } = useMaterialDropTarget({
    id,
    accepts: ['image', 'text'],
    onDrop: handleDrop,
  });

  const sourceLabel = isExternalSelected && providerSelection.provider
    ? `${providerSelection.provider.label || providerSelection.provider.id}${externalProviderModel ? ` · ${externalProviderModel}` : ''}`
    : `${modelDef.label}${effectiveApiModel ? ` · ${effectiveApiModel}` : ''}`;
  const statusLabel =
    status === 'generating'
      ? `生成中 ${d?.progress || ''}`.trim()
      : status === 'success'
        ? '已生成'
        : status === 'error'
          ? '生成失败'
          : '待生成';
  const totalInputCount = orderedImages.length + orderedTexts.length;
  const imageNodeUiVariant: 'smart-card' | 'classic' = d?.uiVariant === 'classic' ? 'classic' : 'smart-card';
  const useSmartCardImageNode = imageNodeUiVariant === 'smart-card';
  const smartCardWidth = Math.max(300, Number(d?.smartCardWidth) || 380);
  const smartCardHeight = Math.max(160, Number(d?.smartCardHeight) || 220);
  const smartImageAspectRatio = Math.max(0.25, Math.min(4, Number(d?.smartImageAspectRatio) || 0));
  const isSmartRegenerating = status === 'generating' && Boolean(imageUrl);
  const smartComposerOpen = smartComposerOpenLocal && !smartCardDragging && !dragging;
  const smartComposerWidth = Math.max(smartCardWidth, 620);
  const smartResultInfoRows = useMemo(() => buildSmartImageResultInfo({
    url: smartPreviewUrl || primarySmartImageUrl,
    width: smartResultSize?.width,
    height: smartResultSize?.height,
    sourceLabel,
    statusLabel,
    prompt: d?.lastPrompt || localPrompt || String(providerParams.prompt ?? providerParams.positive ?? ''),
  }), [
    d?.lastPrompt,
    localPrompt,
    primarySmartImageUrl,
    providerParams.positive,
    providerParams.prompt,
    smartPreviewUrl,
    smartResultSize?.height,
    smartResultSize?.width,
    sourceLabel,
    statusLabel,
  ]);
  const syncImageNodeGeometry = useNodeGeometrySync(id, updateNodeInternals);

  useEffect(() => {
    if (!useSmartCardImageNode) return;
    const raf = window.requestAnimationFrame(syncImageNodeGeometry);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [id, smartCardHeight, smartCardWidth, smartComposerOpen, updateNodeInternals, useSmartCardImageNode]);

  useEffect(() => {
    setSmartResultSize(null);
    setSmartPreviewOpen(false);
    setSmartPreviewUrl('');
    setSmartInfoOpen(false);
    setSmartActionsOpen(false);
  }, [primarySmartImageUrl]);

  useEffect(() => {
    const targetUrl = smartPreviewUrl || primarySmartImageUrl;
    if (!targetUrl) return;
    let cancelled = false;
    readImageNaturalSize(targetUrl, 8000).then((size) => {
      if (cancelled || !size) return;
      setSmartResultSize(size);
    });
    return () => {
      cancelled = true;
    };
  }, [primarySmartImageUrl, smartPreviewUrl]);

  useOutsideClose({
    enabled: useSmartCardImageNode && smartComposerOpenLocal,
    refs: smartNodeRef,
    onOutside: () => setSmartComposerOpenLocal(false),
  });

  const smartPanelToggle = useSmartNodePanelToggle({
    open: smartComposerOpenLocal,
    dragging,
    onToggle: setSmartComposerOpenLocal,
    onDragChange: setSmartCardDragging,
    onDragClose: () => setSmartComposerOpenLocal(false),
    disabled: !useSmartCardImageNode,
  });

  const switchImageNodeVariant = (variant: 'smart-card' | 'classic') => {
    setSmartComposerOpenLocal(false);
    smartPanelToggle.handledClickRef.current = false;
    smartPanelToggle.suppressClickRef.current = true;
    flushSync(() => {
      update({ uiVariant: variant });
    });
    syncImageNodeGeometry();
  };

  if (useSmartCardImageNode) {
    return (
      <SmartNodeShell
        rootRef={smartNodeRef}
        className="t8-smart-image-node relative overflow-visible"
        style={{ width: smartCardWidth }}
        rootProps={{
          ...dropProps,
          onPointerDown: smartPanelToggle.onPointerDown,
          onPointerMove: smartPanelToggle.onPointerMove,
          onPointerUp: smartPanelToggle.onPointerUp,
          onClick: smartPanelToggle.onClick,
          onPointerCancel: smartPanelToggle.onPointerCancel,
        }}
      >
        <div
          className={`t8-node t8-smart-node-card transition-all ${selected ? 't8-smart-node-card--selected' : ''} ${
            isAccepting ? 't8-smart-node-card--accepting' : ''
          } ${isSmartRegenerating ? 't8-smart-node-card--regenerating' : ''}`}
          style={{ height: smartCardHeight }}
        >
          <Handle
            type="target"
            position={Position.Left}
            className="t8-smart-node-port !border-0"
            style={{ top: '50%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            className="t8-smart-node-port !border-0"
            style={{ top: '50%' }}
          />
          <ResizableCorners
            selected={selected}
            minWidth={300}
            minHeight={160}
            maxWidth={760}
            maxHeight={720}
            accent="var(--t8-accent)"
            keepAspectRatio={false}
            onResize={(_e, p) => update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) })}
            onResizeEnd={(_e, p) => {
              update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
              syncImageNodeGeometry();
            }}
          />

          <div className="t8-smart-node-body">
            <div className="t8-smart-node-preview">
              {imageResultSlots.length > 0 ? (
                <div className={`t8-smart-result-surface ${imageResultSlots.length > 1 ? 't8-smart-result-surface--grid' : ''}`}>
                  {imageResultSlots.map((slot, index) => {
                    const url = String(slot.url || '').trim();
                    if (slot.status !== 'success' || !url) {
                      const isFailed = slot.status === 'failed';
                      const isCancelled = slot.status === 'cancelled';
                      const placeholderText = isFailed ? '失败' : (isCancelled ? '已停止' : (slot.status === 'running' ? '生成中' : '等待中'));
                      return (
                        <div
                          key={`slot-${index}-${slot.status}`}
                          className={`t8-smart-result-item t8-smart-result-placeholder t8-smart-result-placeholder--${slot.status}`}
                          title={isFailed || isCancelled ? slot.error || placeholderText : '等待生成结果'}
                        >
                          {isFailed || isCancelled ? <AlertCircle size={18} /> : <Loader2 size={18} className="animate-spin" />}
                          <span>{placeholderText}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={`${url}-${index}`} className="t8-smart-result-item">
                      <SmartImage
                        src={url}
                        alt={`生成结果 ${index + 1}`}
                        className="h-full w-full object-cover"
                        thumbSize={720}
                        data-drag-source
                        data-drag-kind="image"
                        data-drag-url={url}
                        data-drag-preview={url}
                        data-drag-node-id={id}
                        draggable={false}
                        data-resource-title={url.split('/').pop() || `生成图像 ${index + 1}`}
                        data-prompt-template-kind="image"
                        data-prompt-template-category="image-reference-edit"
                        data-prompt-template-prompt={d?.lastPrompt || localPrompt || String(providerParams.prompt ?? providerParams.positive ?? '')}
                        data-prompt-template-negative={String(providerParams.negative ?? providerParams.negativePrompt ?? '')}
                        onDragStart={(e) => e.preventDefault()}
                        onLoad={(event) => {
                          if (index !== 0 || imageResultSlots.length > 1) return;
                          const img = event.currentTarget;
                          if (!img.naturalWidth || !img.naturalHeight) return;
                          const nextRatio = img.naturalWidth / img.naturalHeight;
                          if (!Number.isFinite(nextRatio) || nextRatio <= 0) return;
                          const nextHeight = Math.max(160, Math.min(720, Math.round(smartCardWidth / nextRatio)));
                          if (
                            Math.abs(nextRatio - smartImageAspectRatio) > 0.01 ||
                            Math.abs(nextHeight - smartCardHeight) > 2
                          ) {
                            update({
                              smartImageAspectRatio: Number(nextRatio.toFixed(4)),
                              smartCardHeight: nextHeight,
                            });
                          }
                        }}
                        onMouseDown={(e) => handleSmartImageMouseDown(e, url)}
                        onMouseMove={handleSmartImageMouseMove}
                        onDoubleClick={(e) => handleSmartImageDoubleClick(e, url)}
                        title="双击编辑。Ctrl+拖拽可送到其他节点，右上角按钮预览大图"
                      />
                      <div
                        className="nodrag nopan t8-smart-result-tools"
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="t8-smart-result-tool"
                          title="预览大图"
                          aria-label="预览大图"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSmartPreviewUrl(url);
                            setSmartPreviewOpen(true);
                            setSmartInfoOpen(false);
                            setSmartActionsOpen(false);
                          }}
                        >
                          <Eye size={14} />
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={mediaDownloadFileName('image', url, index)}
                          className="t8-smart-result-tool"
                          title="下载生成图像"
                          aria-label="下载生成图像"
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void downloadMediaUrl('image', url, index);
                          }}
                        >
                          <Download size={14} />
                        </a>
                        <button
                          type="button"
                          className="t8-smart-result-tool"
                          title="保存到素材库"
                          aria-label="保存到素材库"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleResultQuickAction('save-resource', url);
                            setSmartInfoOpen(false);
                            setSmartActionsOpen(false);
                          }}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          className="t8-smart-result-tool"
                          data-active={smartInfoOpen && (smartPreviewUrl || primarySmartImageUrl) === url ? 'true' : 'false'}
                          title="图片信息"
                          aria-label="图片信息"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSmartPreviewUrl(url);
                            setSmartInfoOpen((open) => !open);
                            setSmartActionsOpen(false);
                          }}
                        >
                          <Info size={14} />
                        </button>
                        <button
                          type="button"
                          className="t8-smart-result-tool"
                          title="编辑图片"
                          aria-label="编辑图片"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingUrl(url);
                            setSmartInfoOpen(false);
                            setSmartActionsOpen(false);
                          }}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="t8-smart-result-tool"
                          data-active={smartActionsOpen && (smartPreviewUrl || primarySmartImageUrl) === url ? 'true' : 'false'}
                          title="更多动作"
                          aria-label="更多动作"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSmartPreviewUrl(url);
                            setSmartActionsOpen((open) => !open);
                            setSmartInfoOpen(false);
                          }}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                      {smartInfoOpen && (smartPreviewUrl || primarySmartImageUrl) === url && (
                        <div
                          className="nodrag nopan t8-smart-result-popover t8-smart-result-popover--info"
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="t8-smart-result-popover__title">图片信息</div>
                          <div className="t8-smart-result-info">
                            {smartResultInfoRows.map((row) => (
                              <div key={row.label} className="t8-smart-result-info__row">
                                <span>{row.label}</span>
                                <strong title={row.value}>{row.value}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {smartActionsOpen && (smartPreviewUrl || primarySmartImageUrl) === url && (
                        <div
                          className="nodrag nopan t8-smart-result-popover t8-smart-result-popover--actions"
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="t8-smart-result-popover__title">结果动作</div>
                          {renderResultQuickActions(url)}
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="t8-smart-node-empty">
                  <Wand2 size={26} />
                </div>
              )}
              {status === 'generating' && (
                <div className="t8-smart-preview-status t8-smart-node-status--generating">
                  <Loader2 size={11} className="animate-spin" />
                  <span>{d?.progress || '生成中'}</span>
                </div>
              )}
            </div>
            {error && (
              <div className="t8-smart-node-error">
                <AlertCircle size={12} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {smartComposerOpen && (
          <SmartNodeComposer
            portal
            anchorRef={smartNodeRef}
            style={{ width: smartComposerWidth }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <MaterialPreviewSection
              texts={orderedTexts}
              images={orderedImages}
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
              groups={['text', 'image']}
              title={`输入素材 · 图 ${orderedImages.length}/${maxRefs}`}
              imageUploadAction={
                refImages.length < maxRefs
                  ? {
                      onClick: handlePickFile,
                      title: '上传本地参考图',
                      remaining: maxRefs - refImages.length,
                    }
                  : undefined
              }
              compactAccessory={
                <>
                  {status !== 'idle' && (
                    <span className={`t8-chip t8-smart-mini-status t8-smart-node-status--${status}`}>{statusLabel}</span>
                  )}
                  <span className="t8-chip t8-smart-mini-status">输入 {totalInputCount || 0}</span>
                  <span className="t8-chip t8-smart-mini-status">{imageUrl && smartImageAspectRatio ? `${smartImageAspectRatio.toFixed(2)}:1` : aspectRatio || mjAr || nbAspect}</span>
                  <button
                    type="button"
                    className="nodrag nopan t8-btn t8-smart-classic-switch"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      switchImageNodeVariant('classic');
                    }}
                    title="切换到经典版节点"
                    aria-label="切换到经典版节点"
                  >
                    <RefreshCcw size={13} />
                  </button>
                </>
              }
            />
            <div className="t8-smart-composer-row t8-smart-image-model-row">
              {imageAdvancedProviders.length > 0 && (
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>来源</span>
                  <select
                    value={isExternalSelected ? providerSelection.providerId : 'zhenzhen'}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (nextId === 'zhenzhen') {
                        update({ providerSource: 'zhenzhen', providerId: '', providerModel: '', ...clearModelscopeLoraParams() });
                        return;
                      }
                      const provider = imageAdvancedProviders.find((item) => item.id === nextId);
                      if (!provider) return;
                      const nextModels = advancedProviderModelOptions(provider, 'image');
                      update({
                        providerSource: provider.protocol,
                        providerId: provider.id,
                        providerModel: nextModels[0] || '',
                        ...clearModelscopeLoraParams(),
                      });
                    }}
                    className="t8-select t8-smart-select"
                  >
                    <option value="zhenzhen">默认</option>
                    {imageAdvancedProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label || provider.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {isExternalSelected && providerSelection.provider ? (
                <label className="t8-smart-field">
                  <span>模型</span>
                  <select
                    value={externalProviderModel}
                    onChange={(e) => update({ providerModel: e.target.value, ...clearModelscopeLoraParams() })}
                    className="t8-select t8-smart-select"
                  >
                    {externalModelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <div className="t8-smart-segment" aria-label="图像模型">
                    {IMAGE_MODELS.map((m) => {
                      const isActive = m.id === model;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => switchModel(m.id)}
                          title={m.description}
                          className="t8-smart-segment__item"
                          data-active={isActive ? 'true' : 'false'}
                        >
                          {m.tabLabel}
                        </button>
                      );
                    })}
                  </div>
                  {!isMj && (
                    <label className="t8-smart-field">
                      <span>具体模型</span>
                      <select
                        value={defaultProviderApiModel}
                        onChange={(e) => switchApiModel(e.target.value)}
                        className="t8-select t8-smart-select"
                      >
                        {apiModelOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
            {isExternalSelected && providerSelection.provider && (
              <div className="t8-smart-composer-row">
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>数量</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_IMAGE_OUTPUT_COUNT}
                    value={externalImageCount}
                    onChange={(e) => patchProviderParams({ n: clampImageOutputCount(e.target.value, 1) })}
                    className="t8-input t8-smart-input"
                  />
                </label>
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>质量</span>
                  <select
                    value={externalImageQuality}
                    onChange={(e) => patchProviderParams({ quality: e.target.value })}
                    className="t8-select t8-smart-select"
                  >
                    <option value="auto">Auto</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
            )}

            <LocalNodeAddonSlot
              nodeId={id}
              nodeType="image"
              data={d}
              update={update}
              context={{
                providerSource: isExternalSelected ? providerSelection.providerSource : 'zhenzhen',
                providerId: providerSelection.providerId,
                providerModel: isExternalSelected ? externalProviderModel : effectiveApiModel,
                model: modelDef.id,
                apiModel: effectiveApiModel,
                providerKind: isFal ? 'fal' : modelDef.paramKind,
              }}
            />

            <div className="t8-smart-prompt-shell t8-smart-prompt-shell--compact">
              <MentionPromptInput
                title="图像 Prompt"
                value={localPrompt}
                mentions={promptMentions}
                materials={mentionMaterials}
                onChange={(value, mentions) => update({ prompt: value, promptMentions: mentions })}
                onSubmit={() => {
                  if (status !== 'generating') void handleGenerate();
                }}
                placeholder={orderedTexts.length > 0 ? '已连接上游文本，也可在这里补充提示词' : '描述要生成的画面'}
                isDark={isDark}
                isPixel={isPixel}
                promptTemplateKind="image"
                className="t8-textarea t8-smart-prompt-input"
              />
            </div>

            <div className="t8-smart-composer-row t8-smart-composer-row--params t8-smart-image-param-row">
              {!isExternalSelected && !isFal && !isMj && (
                <label className="t8-smart-field t8-smart-field--compact">
                  <span>提交方式</span>
                  <select
                    value={coreSubmitMode}
                    onChange={(e) => update({ imageSubmitMode: e.target.value })}
                    className="t8-select t8-smart-select"
                  >
                    <option value="async">异步</option>
                    <option value="sync">同步</option>
                  </select>
                </label>
              )}
              {!isExternalSelected && !isFal && !isMj && !isComfyExternal && (
                <>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>比例</span>
                    <select
                      value={aspectRatio}
                      onChange={(e) => update({ aspectRatio: e.target.value })}
                      className="t8-select t8-smart-select"
                    >
                      {modelDef.aspectRatios.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  {!isGrokImage && modelDef.sizes.length > 0 && (
                    <label className="t8-smart-field t8-smart-field--compact">
                      <span>尺寸</span>
                      <select
                        value={sizeLevel}
                        onChange={(e) => update({ sizeLevel: e.target.value })}
                        className="t8-select t8-smart-select"
                      >
                        {modelDef.sizes.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              {!isExternalSelected && isMj && (
                <>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>版本</span>
                    <select value={mjVersion} onChange={(e) => update({ mjVersion: e.target.value })} className="t8-select t8-smart-select">
                      {MJ_VERSIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>比例</span>
                    <select value={mjAr} onChange={(e) => update({ mjAr: e.target.value })} className="t8-select t8-smart-select">
                      {MJ_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>速度</span>
                    <select value={mjSpeed} onChange={(e) => update({ mjSpeed: e.target.value })} className="t8-select t8-smart-select">
                      {MJ_SPEEDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                </>
              )}
              {!isExternalSelected && isFal && falKind === 'gpt-fal' && (
                <>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>模式</span>
                    <select value={falMode} onChange={(e) => update({ falMode: e.target.value })} className="t8-select t8-smart-select">
                      <option value="edit">Edit</option>
                      <option value="gen">Generate</option>
                    </select>
                  </label>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>尺寸</span>
                    <select value={falSize} onChange={(e) => update({ falSize: e.target.value })} className="t8-select t8-smart-select">
                      {GPT_FAL_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>质量</span>
                    <select value={falQuality} onChange={(e) => update({ falQuality: e.target.value })} className="t8-select t8-smart-select">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="auto">Auto</option>
                    </select>
                  </label>
                </>
              )}
              {!isExternalSelected && !isFal && !isMj && (
                <>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>数量</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_IMAGE_OUTPUT_COUNT}
                      value={coreImageCount}
                      onChange={(e) => update({ imageCount: clampImageOutputCount(e.target.value, 1) })}
                      className="t8-input t8-smart-input"
                    />
                  </label>
                  {modelDef.paramKind === 'gpt-size' && (
                    <label className="t8-smart-field t8-smart-field--compact">
                      <span>质量</span>
                      <select
                        value={coreImageQuality}
                        onChange={(e) => update({ imageQuality: e.target.value })}
                        className="t8-select t8-smart-select"
                      >
                        <option value="auto">Auto</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                  )}
                </>
              )}
              {!isExternalSelected && isFal && falKind === 'nbpro-fal' && (
                <>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>比例</span>
                    <select value={nbAspect} onChange={(e) => update({ nbAspect: e.target.value })} className="t8-select t8-smart-select">
                      {NBPRO_FAL_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="t8-smart-field t8-smart-field--compact">
                    <span>清晰度</span>
                    <select value={nbResolution} onChange={(e) => update({ nbResolution: e.target.value })} className="t8-select t8-smart-select">
                      {NBPRO_FAL_RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                </>
              )}
              <button
                type="button"
                onClick={handlePickFile}
                className="t8-btn t8-smart-ref-btn"
                disabled={refImages.length >= maxRefs}
                title={refImages.length >= maxRefs ? '参考图已满' : '上传本地参考图'}
              >
                <Plus size={13} />
                <span>参考 {orderedImages.length}/{maxRefs}</span>
              </button>
              <div className="t8-smart-param-spacer" />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={status === 'generating'}
                className="t8-btn t8-btn-primary t8-smart-run-btn"
              >
                {status === 'generating' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>{status === 'generating' ? d?.progress || '生成中' : '生成'}</span>
              </button>
            </div>

            <input
              ref={mainFileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFiles}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleMjFiles}
              className="hidden"
            />
          </SmartNodeComposer>
        )}
        <SmartMediaPreviewModal
          open={smartPreviewOpen}
          url={smartPreviewUrl || primarySmartImageUrl}
          title="生成图片"
          meta={smartResultSize ? `${smartResultSize.width}×${smartResultSize.height}` : sourceLabel}
          infoRows={smartResultInfoRows}
          onClose={() => setSmartPreviewOpen(false)}
          onSaveResource={() => (smartPreviewUrl || primarySmartImageUrl) ? handleResultQuickAction('save-resource', smartPreviewUrl || primarySmartImageUrl) : undefined}
        />
        {editingUrl && (
          <ImageEditModal
            srcUrl={editingUrl}
            onClose={() => setEditingUrl(null)}
            onProduce={handleProduce}
          />
        )}
      </SmartNodeShell>
    );
  }

  return (
    <div
      className={`t8-node t8-image-node-classic relative transition-all ${selected ? 't8-image-node-classic--selected' : ''} ${
        isAccepting ? 't8-image-node-classic--accepting' : ''
      }`}
      {...dropProps}
    >
      <Handle type="target" position={Position.Left} className="t8-smart-node-port !border-0" />
      <Handle type="source" position={Position.Right} className="t8-smart-node-port !border-0" />

      {/* 头部 */}
      <div className="t8-node-header t8-image-node-classic__header">
        <div className="t8-smart-node-icon">
          <ImageIcon size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="t8-smart-node-title">图像</div>
          <div className="t8-smart-node-subtitle">
            {isExternalSelected && providerSelection.provider
              ? `${providerSelection.provider.label || providerSelection.provider.id} · ${externalProviderModel || '未选模型'}`
              : `${modelDef.label} · ${modelDef.description}`}
          </div>
        </div>
        <button
          type="button"
          className="nodrag nopan t8-btn t8-smart-classic-switch"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            switchImageNodeVariant('smart-card');
          }}
          title="切回卡片版节点"
          aria-label="切回卡片版节点"
        >
          <RefreshCcw size={13} />
        </button>
      </div>

      {/* 配置区 */}
      <div className="p-2.5 space-y-2" onMouseDown={(e) => e.stopPropagation()}>
        {imageAdvancedProviders.length > 0 && (
          <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-2">
            <button
              type="button"
              onClick={() => update({ advancedProviderOpen: !d?.advancedProviderOpen })}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70 hover:text-white"
            >
              <span>高级来源</span>
              <span>{isExternalSelected && providerSelection.provider ? providerSelection.provider.label : '默认图像接口'}</span>
            </button>
            {d?.advancedProviderOpen && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">平台</label>
                  <select
                    value={isExternalSelected ? providerSelection.providerId : 'zhenzhen'}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (nextId === 'zhenzhen') {
                        update({ providerSource: 'zhenzhen', providerId: '', providerModel: '', ...clearModelscopeLoraParams() });
                        return;
                      }
                      const provider = imageAdvancedProviders.find((item) => item.id === nextId);
                      if (!provider) return;
                      const nextModels = advancedProviderModelOptions(provider, 'image');
                      update({
                        providerSource: provider.protocol,
                        providerId: provider.id,
                        providerModel: nextModels[0] || '',
                        ...clearModelscopeLoraParams(),
                      });
                    }}
                    style={{ background: '#18181b', color: '#ffffff' }}
                    className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                  >
                    <option value="zhenzhen" style={{ background: '#18181b', color: '#ffffff' }}>默认图像接口</option>
                    {imageAdvancedProviders.map((provider) => (
                      <option key={provider.id} value={provider.id} style={{ background: '#18181b', color: '#ffffff' }}>
                        {provider.label || provider.id}
                      </option>
                    ))}
                  </select>
                </div>
                {isExternalSelected && providerSelection.provider && (
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">外部模型</label>
                    <select
                      value={externalProviderModel}
                      onChange={(e) => update({ providerModel: e.target.value, ...clearModelscopeLoraParams() })}
                      style={{ background: '#18181b', color: '#ffffff' }}
                      className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                    >
                      {externalModelOptions.map((m) => (
                        <option key={m} value={m} style={{ background: '#18181b', color: '#ffffff' }}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                {isExternalSelected && providerSelection.provider && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">生成数量</label>
                      <input
                        type="number"
                        min={1}
                        max={MAX_IMAGE_OUTPUT_COUNT}
                        value={externalImageCount}
                        onChange={(e) => patchProviderParams({ n: clampImageOutputCount(e.target.value, 1) })}
                        style={{ background: '#18181b', color: '#ffffff' }}
                        className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Quality</label>
                      <select
                        value={externalImageQuality}
                        onChange={(e) => patchProviderParams({ quality: e.target.value })}
                        style={{ background: '#18181b', color: '#ffffff' }}
                        className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                      >
                        <option value="auto" style={{ background: '#18181b', color: '#ffffff' }}>Auto</option>
                        <option value="low" style={{ background: '#18181b', color: '#ffffff' }}>Low</option>
                        <option value="medium" style={{ background: '#18181b', color: '#ffffff' }}>Medium</option>
                        <option value="high" style={{ background: '#18181b', color: '#ffffff' }}>High</option>
                      </select>
                    </div>
                  </div>
                )}
                {isModelScopeExternal && (
                  <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-white/70">
                        <input
                          type="checkbox"
                          checked={modelscopeLoraEnabled}
                          disabled={!modelscopeLoras.length}
                          onChange={(e) => {
                            const nextEnabled = e.target.checked;
                            if (!nextEnabled) {
                              applyModelscopeLoraSelection([], false);
                              return;
                            }
                            const next = selectedModelscopeLoras[0] || modelscopeLoras[0];
                            applyModelscopeLoraSelection(next ? [{
                              id: next.id,
                              strength: normalizeModelscopeLoraStrength(next.strength, 0.8),
                            }] : []);
                          }}
                        />
                        <span>LoRA</span>
                      </label>
                      <span className="text-[10px] text-white/40">
                        {modelscopeLoras.length
                          ? `${selectedModelscopeLoras.length}/${Math.min(MAX_MODELSCOPE_NODE_LORAS, modelscopeLoras.length)} 已选 · 权重 ${selectedModelscopeLoraTotal.toFixed(2)}/1.00`
                          : '当前模型无绑定'}
                      </span>
                    </div>
                    {modelscopeLoras.length > 0 && modelscopeLoraEnabled && (
                      <div className="space-y-2">
                        <div className="rounded border border-amber-300/20 bg-amber-400/[0.06] p-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="font-semibold text-amber-100">官方总权重</span>
                            <span className={selectedModelscopeLoraTotal >= MODELSCOPE_LORA_TOTAL_WEIGHT - 0.0001 ? 'text-amber-100' : 'text-white/65'}>
                              {selectedModelscopeLoraTotal.toFixed(2)} / 1.00
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                            <div
                              className="h-full rounded-full bg-amber-300 transition-all"
                              style={{ width: `${Math.min(100, selectedModelscopeLoraTotal * 100)}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-white/45">
                            <span>
                              {selectedModelscopeLoras.length > 1
                                ? selectedModelscopeLoraRemaining > 0.0001
                                  ? `多个 LoRA 权重总和必须为 1.00；还可分配 ${selectedModelscopeLoraRemaining.toFixed(2)}。`
                                  : '多个 LoRA 权重总和已到 1.00；要添加或提高某项，请先降低其他 LoRA。'
                                : '单个 LoRA 可直接提交；多个 LoRA 时官方要求总和为 1.00。'}
                            </span>
                            <button
                              type="button"
                              onClick={distributeSelectedModelscopeLoraWeights}
                              disabled={selectedModelscopeLoras.length < 2}
                              className="rounded border border-white/15 px-2 py-0.5 font-semibold text-white/65 disabled:opacity-40 disabled:cursor-not-allowed hover:text-white"
                              title="把当前选择的 LoRA 权重平均分配到总和 1.00"
                            >
                              均分到 1.00
                            </button>
                          </div>
                        </div>
                        {selectedModelscopeLoras.map((selectedLora, index) => {
                          const currentOption = modelscopeLoras.find((lora) => lora.id === selectedLora.id) || modelscopeLoras[0];
                          const rowOptions = modelscopeLoras.filter((lora) => (
                            lora.id === selectedLora.id || !selectedModelscopeLoraIds.has(lora.id)
                          ));
                          const rowOtherTotal = modelscopeLoraWeightTotal(selectedModelscopeLoras.filter((_, i) => i !== index));
                          const rowMax = Math.max(0, Number((MODELSCOPE_LORA_TOTAL_WEIGHT - rowOtherTotal).toFixed(4)));
                          const strength = normalizeModelscopeLoraStrength(selectedLora.strength, currentOption?.strength ?? 0.8);
                          return (
                            <div key={`${selectedLora.id}-${index}`} className="rounded border border-white/10 bg-black/10 p-2 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={selectedLora.id}
                                  onChange={(e) => {
                                    const next = modelscopeLoras.find((lora) => lora.id === e.target.value) || currentOption;
                                    updateModelscopeLoraSelection(index, {
                                      id: next?.id || '',
                                      strength: next?.strength ?? 0.8,
                                    });
                                  }}
                                  style={{ background: '#18181b', color: '#ffffff' }}
                                  className="min-w-0 flex-1 rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                                >
                                  {rowOptions.map((lora) => (
                                    <option key={lora.id} value={lora.id} style={{ background: '#18181b', color: '#ffffff' }}>
                                      {lora.name || lora.id}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => removeModelscopeLoraSelection(index)}
                                  className="h-7 w-7 shrink-0 rounded border border-white/15 inline-flex items-center justify-center text-white/60 hover:text-white"
                                  title="移除这组 LoRA"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              <label className="block space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-white/50">
                                  <span title="ModelScope 多 LoRA 官方权重总和必须为 1.00；本行最大值会随其他 LoRA 权重自动变化。">官方权重</span>
                                  <span>{strength.toFixed(2)} · 最多 {rowMax.toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={rowMax}
                                  step={0.01}
                                  value={strength}
                                  onChange={(e) => updateModelscopeLoraSelection(index, { strength: Number(e.target.value) })}
                                  className="w-full accent-amber-400"
                                />
                              </label>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={addModelscopeLoraSelection}
                          disabled={
                            selectedModelscopeLoras.length >= MAX_MODELSCOPE_NODE_LORAS ||
                            !unselectedModelscopeLoras.length ||
                            (selectedModelscopeLoras.length > 0 && selectedModelscopeLoraRemaining <= 0.0001)
                          }
                          className="w-full rounded border border-white/15 px-2 py-1 text-[11px] font-semibold text-white/70 disabled:opacity-40 disabled:cursor-not-allowed hover:text-white"
                          title={selectedModelscopeLoraRemaining <= 0.0001 ? '总权重已满，请先降低其他 LoRA 权重' : '添加一组 LoRA'}
                        >
                          <Plus size={12} className="inline mr-1" />
                          {selectedModelscopeLoraRemaining <= 0.0001 && selectedModelscopeLoras.length > 0
                            ? '总权重已满'
                            : `添加 LoRA（最多 ${MAX_MODELSCOPE_NODE_LORAS} 个）`}
                        </button>
                      </div>
                    )}
                    {!modelscopeLoras.length && (
                      <div className="text-[10px] leading-relaxed text-white/45">
                        到 API 设置的 ModelScope LoRA 区，为当前外部模型绑定 LoRA 后即可在这里选择。
                      </div>
                    )}
                  </div>
                )}
                {isComfyExternal && (
                  <div className="rounded border border-cyan-300/25 bg-cyan-400/[0.06] p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold text-white/80">ComfyUI 工作流参数</div>
                      <span className="text-[10px] text-cyan-200/80">{comfyParamFields.length} 项</span>
                    </div>
                    <div className="text-[10px] leading-relaxed text-white/45">
                      {[
                        comfyHasPromptField ? 'Prompt 会按此处字段注入到 workflow' : '此工作流未声明 Prompt 字段',
                        comfyRequiredImageCount > 0
                          ? `需要 ${comfyRequiredImageCount} 张图片；当前 ${orderedImages.length} 张`
                          : '未声明图片输入',
                      ].join('；')}
                    </div>
                    {comfyRequiredImageCount > orderedImages.length && (
                      <div className="text-[10px] text-amber-200">
                        请连接上传素材或在 ComfyUI 输入素材区添加图片，否则对应 LoadImage 字段会缺失。
                      </div>
                    )}
                    {comfyParamFields.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {comfyParamFields.map((field: any) => {
                          const source = comfyFieldSource(field);
                          const label = COMFY_APP_SOURCE_LABELS[source] || source;
                          const target = field?.nodeId && field?.fieldName ? `#${field.nodeId}.${field.fieldName}` : '';
                          const value = providerParams[source] ?? comfyFieldDefault(field);
                          const selectOptions = Array.isArray(field?.options) ? field.options : [];
                          const isNumber = COMFY_NUMERIC_FIELD_SOURCES.has(source);
                          if (source === 'prompt' || source === 'positive') {
                            const promptValue = localPrompt || String(providerParams[source] ?? providerParams.prompt ?? '');
                            return (
                              <label key={`${field.nodeId}-${field.fieldName}-${source}`} className="space-y-1 col-span-2">
                                <span className="flex items-center justify-between gap-2 text-[10px] text-white/55">
                                  <span>{label}</span>
                                  {target && <span className="text-cyan-100/80">{target}</span>}
                                </span>
                                <MentionPromptInput
                                  title="ComfyUI 正向 Prompt"
                                  value={promptValue}
                                  mentions={promptMentions}
                                  materials={mentionMaterials}
                                  onChange={(nextValue, mentions) => {
                                    const nextParams = {
                                      ...providerParams,
                                      [source]: nextValue,
                                      prompt: nextValue,
                                    };
                                    update({ prompt: nextValue, promptMentions: mentions, providerParams: nextParams });
                                  }}
                                  placeholder={String(comfyFieldDefault(field) || '填写 ComfyUI 正向 Prompt')}
                                  isDark={isDark}
                                  isPixel={isPixel}
                                  promptTemplateKind="image"
                                  className="w-full min-h-[68px] resize-y rounded bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-cyan-300/60 placeholder:text-white/30"
                                />
                                {orderedTexts.length > 0 && (
                                  <span className="block text-[10px] text-amber-200/80">
                                    已连接 {orderedTexts.length} 条上游文本，运行时会优先使用上游文本。
                                  </span>
                                )}
                              </label>
                            );
                          }
                          if (source === 'negative') {
                            const negativeValue = String(providerParams.negative ?? providerParams.negativePrompt ?? '');
                            return (
                              <label key={`${field.nodeId}-${field.fieldName}-${source}`} className="space-y-1 col-span-2">
                                <span className="flex items-center justify-between gap-2 text-[10px] text-white/55">
                                  <span>{label}</span>
                                  {target && <span className="text-cyan-100/80">{target}</span>}
                                </span>
                                <PromptTextarea
                                  title="ComfyUI 负向 Prompt"
                                  value={negativeValue}
                                  onValueChange={(value) => patchProviderParams({ negative: value, negativePrompt: value })}
                                  placeholder={String(comfyFieldDefault(field) || '填写 ComfyUI 负向 Prompt')}
                                  rows={3}
                                  promptTemplateKind="image"
                                  style={{ background: '#18181b', color: '#ffffff' }}
                                  className="w-full rounded border border-white/10 px-2 py-1 text-[11px] outline-none focus:border-cyan-300/60 placeholder:text-white/30"
                                />
                              </label>
                            );
                          }
                          const imageSlot = comfyImageSourceIndex(source);
                          if (imageSlot > 0) {
                            const imageMaterial = orderedImages[imageSlot - 1];
                            return (
                              <div key={`${field.nodeId}-${field.fieldName}-${source}`} className="col-span-2 rounded border border-white/10 bg-black/10 p-2">
                                <div className="flex items-center justify-between gap-2 text-[10px] text-white/55">
                                  <span>{label}</span>
                                  {target && <span className="text-cyan-100/80">{target}</span>}
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/60">
                                  <span>{imageMaterial ? `使用第 ${imageSlot} 张图片：${imageMaterial.label || imageMaterial.url}` : `等待第 ${imageSlot} 张图片`}</span>
                                  <button
                                    type="button"
                                    onClick={handlePickFile}
                                    className="nodrag rounded border border-cyan-300/30 px-2 py-1 text-cyan-100 hover:bg-cyan-300/10"
                                  >
                                    添加图片
                                  </button>
                                </div>
                              </div>
                            );
                          }
                            if (/^(video|audio)(?:_|-)?\d+$/i.test(source)) {
                            return (
                              <div key={`${field.nodeId}-${field.fieldName}-${source}`} className="col-span-2 rounded border border-amber-300/20 bg-amber-400/10 p-2 text-[10px] text-amber-100">
                                {label} {target ? `(${target})` : ''} 已映射，但图像节点当前仅提交文本和图片输入；如需视频/音频工作流，后续应放到对应节点入口。
                              </div>
                            );
                          }
                          return (
                            <label key={`${field.nodeId}-${field.fieldName}-${source}`} className="space-y-1">
                              <span className="flex items-center justify-between gap-2 text-[10px] text-white/55">
                                <span>{label}</span>
                                {target && <span className="text-cyan-100/80">{target}</span>}
                              </span>
                              {selectOptions.length > 0 ? (
                                <select
                                  value={String(value ?? selectOptions[0] ?? '')}
                                  onChange={(e) => patchProviderParams({ [source]: e.target.value })}
                                  style={{ background: '#18181b', color: '#ffffff' }}
                                  className="nodrag nowheel w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-cyan-300/60"
                                >
                                  {selectOptions.map((option: string | number) => (
                                    <option key={String(option)} value={String(option)} style={{ background: '#18181b', color: '#ffffff' }}>
                                      {String(option)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={isNumber ? 'number' : 'text'}
                                  value={String(value ?? '')}
                                  step={source === 'cfg' || source === 'denoise' || source.startsWith('strength_') ? 0.1 : 1}
                                  min={source === 'width' || source === 'height' ? 64 : source === 'batch_size' ? 1 : undefined}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    patchProviderParams({ [source]: isNumber && raw !== '' ? Number(raw) : raw });
                                  }}
                                  placeholder={String(comfyFieldDefault(field) ?? '')}
                                  style={{ background: '#18181b', color: '#ffffff' }}
                                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-cyan-300/60"
                                />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-200">
                        当前工作流没有保存字段映射，请到 API 设置中点“自动映射”，或使用 ComfyUI应用制作工具重新导入 workflow。
                      </div>
                    )}
                    {(comfyImageInputFields.length > 0 || orderedTexts.length > 0 || excludedUpstreamCount > 0) && (
                      <MaterialPreviewSection
                        texts={orderedTexts}
                        images={orderedImages}
                        order={materialOrder}
                        onReorder={setMaterialOrder}
                        onRemoveLocal={handleRemoveLocalMaterial}
                        onExcludeUpstream={handleExcludeUpstreamMaterial}
                        excludedCount={excludedUpstreamCount}
                        onRestoreExcluded={handleRestoreExcludedMaterials}
                        selected={!!selected}
                        isDark={isDark}
                        isPixel={isPixel}
                        groups={comfyImageInputFields.length > 0 ? ['text', 'image'] : ['text']}
                        title="ComfyUI 输入素材 · 上游+本地"
                        imageUploadAction={
                          comfyImageInputFields.length > 0 && refImages.length < maxRefs
                            ? {
                                onClick: handlePickFile,
                                title: '上传 ComfyUI 输入图',
                                remaining: maxRefs - refImages.length,
                              }
                            : undefined
                        }
                      />
                    )}
                  </div>
                )}
                {savedExternalMissing && (
                  <div className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                    当前画布记录的扩展平台未启用或不存在，已临时回到默认来源。
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 模型 TAB 切换(对应主项目 gpt-image-2-web Tab 0/1/2) */}
        {!isExternalSelected && <div>
          <label className="text-[10px] text-white/50 block mb-1">模型</label>
          <div
            className={`flex gap-0.5 p-0.5 rounded ${isPixel ? '' : 'bg-white/5'}`}
            style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
          >
            {IMAGE_MODELS.map((m) => {
              const isActive = m.id === model;
              return (
                <button
                  key={m.id}
                  onClick={() => switchModel(m.id)}
                  title={m.description}
                  className={`flex-1 py-1 text-[10px] font-semibold rounded transition-all ${
                    isActive ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  style={
                    isPixel && isActive
                      ? { background: 'var(--px-yellow)', color: 'var(--px-ink)', border: '1.5px solid var(--px-ink)', boxShadow: '1px 1px 0 var(--px-ink)' }
                      : isPixel ? { color: 'var(--px-ink-soft)' } : undefined
                  }
                >
                  {m.tabLabel}
                </button>
              );
            })}
          </div>
        </div>}

        {/* 子模型选择(对齐主项目 Tab 内的 model 下拉) - MJ 模式隐藏(用下面专属版本选择) */}
        {!isExternalSelected && !isMj && (
          <div>
            <label className="text-[10px] text-white/50 block mb-1">具体模型</label>
            <select
              value={defaultProviderApiModel}
              onChange={(e) => switchApiModel(e.target.value)}
              style={{ background: '#18181b', color: '#ffffff' }}
              className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
            >
              {apiModelOptions.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ background: '#18181b', color: '#ffffff' }}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        <LocalNodeAddonSlot
          nodeId={id}
          nodeType="image"
          data={d}
          update={update}
          context={{
            providerSource: isExternalSelected ? providerSelection.providerSource : 'zhenzhen',
            providerId: providerSelection.providerId,
            providerModel: isExternalSelected ? externalProviderModel : effectiveApiModel,
            model: modelDef.id,
            apiModel: effectiveApiModel,
            providerKind: isFal ? 'fal' : modelDef.paramKind,
          }}
        />

        {/* 比例 + 尺寸 并排(非 FAL 且非 MJ 模型);Grok Image 只需要比例 */}
        {(!isFal && !isMj && !isComfyExternal) && (
          <div className={`grid gap-2 ${isGrokImage || !modelDef.sizes.length ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">比例</label>
              <select
                value={aspectRatio}
                onChange={(e) => update({ aspectRatio: e.target.value })}
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              >
                {modelDef.aspectRatios.map((r) => (
                  <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>{r}</option>
                ))}
              </select>
            </div>
            {!isGrokImage && modelDef.sizes.length > 0 && (
              <div>
                <label className="text-[10px] text-white/50 block mb-1">尺寸</label>
                <select
                  value={sizeLevel}
                  onChange={(e) => update({ sizeLevel: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {modelDef.sizes.map((s) => (
                    <option key={s} value={s} style={{ background: '#18181b', color: '#ffffff' }}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {!isExternalSelected && !isFal && !isMj && (
          <div className={`grid gap-2 ${modelDef.paramKind === 'gpt-size' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">提交方式</label>
              <select
                value={coreSubmitMode}
                onChange={(e) => update({ imageSubmitMode: e.target.value })}
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              >
                <option value="async" style={{ background: '#18181b', color: '#ffffff' }}>异步</option>
                <option value="sync" style={{ background: '#18181b', color: '#ffffff' }}>同步</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">生成数量</label>
              <input
                type="number"
                min={1}
                max={MAX_IMAGE_OUTPUT_COUNT}
                value={coreImageCount}
                onChange={(e) => update({ imageCount: clampImageOutputCount(e.target.value, 1) })}
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              />
            </div>
            {modelDef.paramKind === 'gpt-size' && (
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Quality</label>
                <select
                  value={coreImageQuality}
                  onChange={(e) => update({ imageQuality: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="auto" style={{ background: '#18181b', color: '#ffffff' }}>Auto</option>
                  <option value="low" style={{ background: '#18181b', color: '#ffffff' }}>Low</option>
                  <option value="medium" style={{ background: '#18181b', color: '#ffffff' }}>Medium</option>
                  <option value="high" style={{ background: '#18181b', color: '#ffffff' }}>High</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* ========== FAL 专属参数面板(完全对齐 gpt-image-2-web gf_panel / nano_fal_panel) ========== */}
        {!isExternalSelected && isFal && falKind === 'gpt-fal' && (
          <div className="space-y-2 rounded border border-blue-400/30 bg-blue-500/5 p-2">
            <div className="text-[10px] text-blue-300 font-semibold tracking-wide">
              💡 FAL Queue API · openai/gpt-image-2
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Mode</label>
                <select
                  value={falMode}
                  onChange={(e) => update({ falMode: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="edit" style={{ background: '#18181b', color: '#ffffff' }}>Edit</option>
                  <option value="gen" style={{ background: '#18181b', color: '#ffffff' }}>Generate</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Size</label>
                <select
                  value={falSize}
                  onChange={(e) => update({ falSize: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {GPT_FAL_SIZES.map((s) => (
                    <option key={s.value} value={s.value} style={{ background: '#18181b', color: '#ffffff' }}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {falSize === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Width (≈1 6倍)</label>
                  <input
                    type="number" min={256} max={3840} step={16}
                    value={falCustomW}
                    onChange={(e) => update({ falCustomW: parseInt(e.target.value) || 0 })}
                    style={{ background: '#18181b', color: '#ffffff' }}
                    className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Height (≈1 6倍)</label>
                  <input
                    type="number" min={256} max={3840} step={16}
                    value={falCustomH}
                    onChange={(e) => update({ falCustomH: parseInt(e.target.value) || 0 })}
                    style={{ background: '#18181b', color: '#ffffff' }}
                    className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Quality</label>
                <select
                  value={falQuality}
                  onChange={(e) => update({ falQuality: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="low" style={{ background: '#18181b', color: '#ffffff' }}>Low</option>
                  <option value="medium" style={{ background: '#18181b', color: '#ffffff' }}>Medium</option>
                  <option value="high" style={{ background: '#18181b', color: '#ffffff' }}>High</option>
                  <option value="auto" style={{ background: '#18181b', color: '#ffffff' }}>Auto</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">N</label>
                <input
                  type="number" min={1} max={MAX_IMAGE_OUTPUT_COUNT}
                  value={falN}
                  onChange={(e) => update({ falN: clampImageOutputCount(e.target.value, 1) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Format</label>
                <select
                  value={falFormat}
                  onChange={(e) => update({ falFormat: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="png" style={{ background: '#18181b', color: '#ffffff' }}>PNG</option>
                  <option value="jpeg" style={{ background: '#18181b', color: '#ffffff' }}>JPEG</option>
                  <option value="webp" style={{ background: '#18181b', color: '#ffffff' }}>WebP</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-white/60">
              <input
                type="checkbox"
                checked={falSync}
                onChange={(e) => update({ falSync: e.target.checked })}
              />
              <span>同步模式 (sync_mode: 适合快速返回场景)</span>
            </label>
          </div>
        )}

        {!isExternalSelected && isFal && falKind === 'nbpro-fal' && (
          <div className="space-y-2 rounded border border-blue-400/30 bg-blue-500/5 p-2">
            <div className="text-[10px] text-blue-300 font-semibold tracking-wide">
              💡 FAL Queue API · fal-ai/nano-banana-pro/edit (需参考图)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">N</label>
                <input
                  type="number" min={1} max={MAX_IMAGE_OUTPUT_COUNT}
                  value={falN}
                  onChange={(e) => update({ falN: clampImageOutputCount(e.target.value, 1) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Aspect</label>
                <select
                  value={nbAspect}
                  onChange={(e) => update({ nbAspect: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {NBPRO_FAL_RATIOS.map((r) => (
                    <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Resolution</label>
                <select
                  value={nbResolution}
                  onChange={(e) => update({ nbResolution: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {NBPRO_FAL_RESOLUTIONS.map((r) => (
                    <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Format</label>
                <select
                  value={falFormat}
                  onChange={(e) => update({ falFormat: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="png" style={{ background: '#18181b', color: '#ffffff' }}>PNG</option>
                  <option value="jpeg" style={{ background: '#18181b', color: '#ffffff' }}>JPEG</option>
                  <option value="webp" style={{ background: '#18181b', color: '#ffffff' }}>WebP</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Safety</label>
                <select
                  value={nbSafety}
                  onChange={(e) => update({ nbSafety: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="1" style={{ background: '#18181b', color: '#ffffff' }}>1 (严)</option>
                  <option value="2" style={{ background: '#18181b', color: '#ffffff' }}>2</option>
                  <option value="3" style={{ background: '#18181b', color: '#ffffff' }}>3</option>
                  <option value="4" style={{ background: '#18181b', color: '#ffffff' }}>4</option>
                  <option value="5" style={{ background: '#18181b', color: '#ffffff' }}>5</option>
                  <option value="6" style={{ background: '#18181b', color: '#ffffff' }}>6 (松)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">ImgMode</label>
                <select
                  value={nbImgMode}
                  onChange={(e) => update({ nbImgMode: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="image_url" style={{ background: '#18181b', color: '#ffffff' }}>URL</option>
                  <option value="base64" style={{ background: '#18181b', color: '#ffffff' }}>Base64</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Seed (0=不传)</label>
                <input
                  type="number" min={0}
                  value={nbSeed}
                  onChange={(e) => update({ nbSeed: Math.max(0, parseInt(e.target.value) || 0) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-white/60 mt-4">
                <input
                  type="checkbox"
                  checked={nbWebSearch}
                  onChange={(e) => update({ nbWebSearch: e.target.checked })}
                />
                <span>Web Search</span>
              </label>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">System Prompt (可选)</label>
              <PromptTextarea
                title="图像扩展模型 System Prompt"
                value={nbSysPrompt}
                onValueChange={(value) => update({ nbSysPrompt: value })}
                placeholder="可选系统指令"
                rows={2}
                promptTemplateKind="image"
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              />
            </div>
          </div>
        )}

        {/* ========== MJ 专属参数面板(完全对齐 gpt-image-2-web mj_* 控件 L1552~L1580) ========== */}
        {!isExternalSelected && isMj && (
          <div className="space-y-2 rounded border border-purple-400/30 bg-purple-500/5 p-2">
            <div className="text-[10px] text-purple-300 font-semibold tracking-wide">
              ✨ Midjourney(严格对齐主项目 runMJ)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">版本</label>
                <select
                  value={mjVersion}
                  onChange={(e) => update({ mjVersion: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {MJ_VERSIONS.map((m) => (
                    <option key={m.value} value={m.value} style={{ background: '#18181b', color: '#ffffff' }}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">比例</label>
                <select
                  value={mjAr}
                  onChange={(e) => update({ mjAr: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {MJ_RATIOS.map((r) => (
                    <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">速度</label>
                <select
                  value={mjSpeed}
                  onChange={(e) => update({ mjSpeed: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {MJ_SPEEDS.map((s) => (
                    <option key={s.value} value={s.value} style={{ background: '#18181b', color: '#ffffff' }}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="chaos 0~100">--c</label>
                <input
                  type="number" min={0} max={100}
                  value={mjC}
                  onChange={(e) => update({ mjC: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="stylize 0~1000">--s</label>
                <input
                  type="number" min={0} max={1000}
                  value={mjS}
                  onChange={(e) => update({ mjS: Math.max(0, Math.min(1000, parseInt(e.target.value) || 0)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="image weight 0~3">--iw</label>
                <input
                  type="number" min={0} max={3} step={0.25}
                  value={mjIw}
                  onChange={(e) => update({ mjIw: Math.max(0, Math.min(3, parseFloat(e.target.value) || 0)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="style ref weight 0~1000">--sw</label>
                <input
                  type="number" min={0} max={1000}
                  value={mjSw}
                  onChange={(e) => update({ mjSw: Math.max(0, Math.min(1000, parseInt(e.target.value) || 0)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">--sv</label>
                <select
                  value={mjSv}
                  onChange={(e) => update({ mjSv: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {MJ_SVS.map((o) => (
                    <option key={o.value} value={o.value} style={{ background: '#18181b', color: '#ffffff' }}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="seed 0=不传">seed</label>
                <input
                  type="number" min={0}
                  value={mjSeed}
                  onChange={(e) => update({ mjSeed: Math.max(0, parseInt(e.target.value) || 0) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="排除词">--no</label>
                <input
                  type="text"
                  value={mjNo}
                  onChange={(e) => update({ mjNo: e.target.value })}
                  placeholder="text, blurry"
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="轮询最大次数">maxPoll</label>
                <input
                  type="number" min={10} max={3600}
                  value={mjMaxPoll}
                  onChange={(e) => update({ mjMaxPoll: Math.max(10, Math.min(3600, parseInt(e.target.value) || 1200)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1" title="轮询间隔(s)">pollInt(s)</label>
                <input
                  type="number" min={1} max={30}
                  value={mjPollInt}
                  onChange={(e) => update({ mjPollInt: Math.max(1, Math.min(30, parseInt(e.target.value) || 3)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
            </div>
            {/* sref 风格参考图 */}
            <div>
              <label className="text-[10px] text-white/50 block mb-1">--sref 风格参考 · {mjSrefImages.length}/{MJ_REF_MAX}</label>
              <div className="flex flex-wrap gap-1.5">
                {mjSrefImages.map((url, i) => (
                  <div key={i} className="relative w-12 h-12 rounded overflow-hidden border border-purple-300/30">
                    <SmartImage src={url} alt={`sref-${i}`} className="w-full h-full object-cover" thumbSize={160} />
                    <button
                      onClick={() => removeMjRef('sref', i)}
                      className="absolute top-0 right-0 w-4 h-4 bg-red-500/80 hover:bg-red-500 flex items-center justify-center rounded-bl"
                      title="移除"
                    >
                      <X size={9} className="text-white" />
                    </button>
                  </div>
                ))}
                {mjSrefImages.length < MJ_REF_MAX && (
                  <button
                    onClick={() => handleMjPick('sref')}
                    className="w-12 h-12 rounded border-2 border-dashed border-purple-300/30 hover:border-purple-300/60 flex items-center justify-center text-purple-300/60 hover:text-purple-300 transition-colors"
                    title="上传 sref 风格参考图"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </div>
            {/* oref 角色参考图 */}
            <div>
              <label className="text-[10px] text-white/50 block mb-1">--oref 角色参考 · {mjOrefImages.length}/{MJ_REF_MAX}</label>
              <div className="flex flex-wrap gap-1.5">
                {mjOrefImages.map((url, i) => (
                  <div key={i} className="relative w-12 h-12 rounded overflow-hidden border border-purple-300/30">
                    <SmartImage src={url} alt={`oref-${i}`} className="w-full h-full object-cover" thumbSize={160} />
                    <button
                      onClick={() => removeMjRef('oref', i)}
                      className="absolute top-0 right-0 w-4 h-4 bg-red-500/80 hover:bg-red-500 flex items-center justify-center rounded-bl"
                      title="移除"
                    >
                      <X size={9} className="text-white" />
                    </button>
                  </div>
                ))}
                {mjOrefImages.length < MJ_REF_MAX && (
                  <button
                    onClick={() => handleMjPick('oref')}
                    className="w-12 h-12 rounded border-2 border-dashed border-purple-300/30 hover:border-purple-300/60 flex items-center justify-center text-purple-300/60 hover:text-purple-300 transition-colors"
                    title="上传 oref 角色参考图"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 上游素材聚合预览区 (新机制) - 本地上传 + 上游接入统一呈现, 可拖动排序 */}
        {(!isComfyExternal && (isExternalSelected || modelDef.supportsReference)) && (
          <MaterialPreviewSection
            texts={orderedTexts}
            images={orderedImages}
            order={materialOrder}
            onReorder={setMaterialOrder}
            onRemoveLocal={handleRemoveLocalMaterial}
            onExcludeUpstream={handleExcludeUpstreamMaterial}
            excludedCount={excludedUpstreamCount}
            onRestoreExcluded={handleRestoreExcludedMaterials}
            selected={!!selected}
            isDark={isDark}
            isPixel={isPixel}
            groups={['text', 'image']}
            title={isMj ? '主参考图 · 上游+本地' : '参考图 · 上游+本地'}
            imageUploadAction={
              refImages.length < maxRefs
                ? {
                    onClick: handlePickFile,
                    title: '上传本地参考图',
                    remaining: maxRefs - refImages.length,
                  }
                : undefined
            }
          />
        )}
        {/* 隐藏的主参考图上传 input - 走 mainFileInputRef + handleFiles */}
        <input
          ref={mainFileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
        {/* 隐藏的 MJ sref/oref 上传 input - 走 fileInputRef + handleMjFiles */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleMjFiles}
          className="hidden"
        />

        {/* 本地 prompt(优先取上游) */}
        {!isComfyExternal && <div>
          <label className="text-[10px] text-white/50 block mb-1">本地 Prompt(可选,优先取上游 text)</label>
          <MentionPromptInput
            title="图像 Prompt"
            value={localPrompt}
            mentions={promptMentions}
            materials={mentionMaterials}
            onChange={(value, mentions) => update({ prompt: value, promptMentions: mentions })}
            placeholder="备用:无上游连接时使用此提示词"
            isDark={isDark}
            isPixel={isPixel}
            promptTemplateKind="image"
            className="w-full h-14 resize-none rounded bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-white/30 placeholder:text-white/30"
          />
        </div>}

        {/* 生成按钮(包含异步进度) */}
        <button
          onClick={handleGenerate}
          disabled={status === 'generating'}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {status === 'generating' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> 生成中 {d?.progress || ''}
            </>
          ) : (
            <>
              <Sparkles size={12} /> 生成
            </>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-1 text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
            <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}
      </div>

      {/* 结果展示：仅在未外挂 OutputNode 时在节点内预览，避免与下游 OutputNode 重复 */}
      {imageUrl && !hasAutoOutput && (
        <div className="border-t border-white/10 p-2">
          <SmartImage
            src={imageUrl}
            alt="生成结果"
            className="w-full rounded object-cover"
            thumbSize={720}
            data-drag-source
            data-drag-kind="image"
            data-drag-url={imageUrl}
            data-drag-preview={imageUrl}
            data-drag-node-id={id}
            draggable={false}
            data-resource-title={imageUrl.split('/').pop() || '生成图像'}
            data-prompt-template-kind="image"
            data-prompt-template-category="image-reference-edit"
            data-prompt-template-prompt={d?.lastPrompt || localPrompt || String(providerParams.prompt ?? providerParams.positive ?? '')}
            data-prompt-template-negative={String(providerParams.negative ?? providerParams.negativePrompt ?? '')}
            onDragStart={(e) => e.preventDefault()}
            onMouseDown={(e) =>
              beginMaterialDrag(e, { kind: 'image', url: imageUrl, sourceNodeId: id, previewUrl: imageUrl })
            }
            title="Ctrl+拖拽可送到其他节点"
          />
          {renderResultQuickActions(imageUrl)}
        </div>
      )}
      {editingUrl && (
        <ImageEditModal
          srcUrl={editingUrl}
          onClose={() => setEditingUrl(null)}
          onProduce={handleProduce}
        />
      )}
    </div>
  );
};

export default memo(ImageNode);
