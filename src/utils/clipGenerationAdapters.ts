import {
  FAL_REGISTRY,
  IMAGE_MODELS,
  VIDEO_FAL_REGISTRY,
  VIDEO_MODELS,
  isFalModel,
  isFalVideoModel,
  parseModelList,
  resolveSeedanceVideoOverride,
  withUpstreamModelOption,
  type ImageModelDef,
  type SidebarParameterControl,
  type SidebarParameterGroup,
  type VideoModelDef,
} from '../providers/models';
import type {
  FalSubmitRequest,
  GenerateImageRequest,
  SeedanceSubmitRequest,
  VideoFalSubmitRequest,
  VideoSubmitRequest,
} from '../services/generation';

type GenerationNodeType = 'image' | 'video';
type ClipGenerationReferenceKind = 'image' | 'video' | 'audio';

export const SEEDANCE_REFERENCE_LIMITS = { images: 3, videos: 3, audios: 3 };

export interface ClipGenerationChoiceInput {
  model?: unknown;
  mainId?: unknown;
  apiModel?: unknown;
  params?: Record<string, unknown>;
  imageOverrides?: Record<string, string>;
  videoOverrides?: Record<string, string>;
}

export interface ClipImageGenerationChoice {
  nodeType: 'image';
  modelDef: ImageModelDef;
  mainId: string;
  apiModel: string;
  apiModelOptions: Array<{ value: string; label: string }>;
  sidebarParameterGroups: SidebarParameterGroup[];
}

export interface ClipVideoGenerationChoice {
  nodeType: 'video';
  modelDef: VideoModelDef;
  mainId: string;
  apiModel: string;
  apiModelOptions: Array<{ value: string; label: string }>;
  sidebarParameterGroups: SidebarParameterGroup[];
}

export type ClipGenerationChoice = ClipImageGenerationChoice | ClipVideoGenerationChoice;

export interface ClipGenerationReferenceSupport {
  groups: ClipGenerationReferenceKind[];
  maxImages: number;
  maxVideos: number;
  maxAudios: number;
  accept: string;
}

export function clipGenerationModelGroupOptions(nodeType: GenerationNodeType): Array<{ value: string; label: string }> {
  return nodeType === 'image'
    ? IMAGE_MODELS.map((model) => ({ value: model.id, label: model.tabLabel || model.label }))
    : VIDEO_MODELS.map((model) => ({ value: model.id, label: model.label }));
}

export function clipGenerationReferenceSupport(choice: ClipGenerationChoice): ClipGenerationReferenceSupport {
  if (choice.nodeType === 'image') {
    return {
      groups: choice.modelDef.supportsReference ? ['image'] : [],
      maxImages: choice.modelDef.supportsReference ? choice.modelDef.maxReferenceImages : 0,
      maxVideos: 0,
      maxAudios: 0,
      accept: 'image/*',
    };
  }
  const maxImages = choice.modelDef.supportImages ? choice.modelDef.maxRefImages : 0;
  if (choice.modelDef.kind === 'seedance') {
    return {
      groups: ['image', 'video', 'audio'],
      maxImages: choice.modelDef.supportImages ? choice.modelDef.maxRefImages : 0,
      maxVideos: SEEDANCE_REFERENCE_LIMITS.videos,
      maxAudios: SEEDANCE_REFERENCE_LIMITS.audios,
      accept: 'image/*,video/*,audio/*',
    };
  }
  return {
    groups: maxImages > 0 ? ['image'] : [],
    maxImages: choice.modelDef.supportImages ? choice.modelDef.maxRefImages : 0,
    maxVideos: 0,
    maxAudios: 0,
    accept: maxImages > 0 ? 'image/*' : '',
  };
}

export function clipGenerationRefLimitForKind(
  support: ClipGenerationReferenceSupport,
  kind: ClipGenerationReferenceKind,
) {
  if (kind === 'image') return support.maxImages;
  if (kind === 'video') return support.maxVideos;
  return support.maxAudios;
}

export function clipGenerationRefsForRequest(
  refs: Array<{ kind: string; url?: string }>,
  choice: ClipGenerationChoice,
): ClipGenerationRefs {
  const support = clipGenerationReferenceSupport(choice);
  const take = (kind: ClipGenerationReferenceKind, limit: number) => refs
    .filter((item) => item.kind === kind && item.url)
    .map((item) => item.url!)
    .slice(0, limit);
  return {
    imageRefs: take('image', support.maxImages),
    videoRefs: take('video', support.maxVideos),
    audioRefs: take('audio', support.maxAudios),
  };
}

export interface ClipGenerationRefs {
  imageRefs?: string[];
  videoRefs?: string[];
  audioRefs?: string[];
}

export type ClipImageGenerationRequest =
  | { route: 'fal'; request: FalSubmitRequest }
  | { route: 'core'; request: GenerateImageRequest };

export type ClipVideoGenerationRequest =
  | { route: 'seedance'; request: SeedanceSubmitRequest }
  | { route: 'fal'; request: VideoFalSubmitRequest }
  | { route: 'core'; request: VideoSubmitRequest; pollingModel: string };

function textValue(value: unknown): string {
  return String(value || '').trim();
}

function numberValue(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function positiveSeed(value: unknown): number | undefined {
  const seed = Number(value);
  return Number.isFinite(seed) && seed >= 0 ? seed : undefined;
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find((item) => item !== undefined && item !== null && String(item) !== '') as T | undefined;
}

function defaultParamsFromGroups(groups: SidebarParameterGroup[], apiModel: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const control of visibleClipGenerationControls(groups, apiModel)) {
    if (control.defaultValue !== undefined) params[control.valueKey] = control.defaultValue;
  }
  return params;
}

export function visibleClipGenerationControls(
  groups: SidebarParameterGroup[] | undefined,
  apiModel: string,
): SidebarParameterControl[] {
  return (groups || []).flatMap((group) => group.controls || [])
    .filter((control) => !control.showWhenApiModel?.length || control.showWhenApiModel.includes(apiModel));
}

export function resolveClipImageGenerationChoice(input: ClipGenerationChoiceInput = {}): ClipImageGenerationChoice {
  const savedMainId = textValue(input.mainId || input.params?.mainId);
  const savedApiModel = textValue(input.apiModel || input.params?.apiModel || input.model);
  const modelDef = IMAGE_MODELS.find((item) => item.id === savedMainId)
    || IMAGE_MODELS.find((item) => item.id === savedApiModel || item.apiModelOptions.some((option) => option.value === savedApiModel))
    || IMAGE_MODELS[0];
  const configuredOverride = textValue(input.imageOverrides?.[modelDef.id]);
  const configuredModels = parseModelList(configuredOverride);
  const apiModelOptions = withUpstreamModelOption(modelDef.apiModelOptions, configuredOverride);
  const apiModel = savedApiModel
    && apiModelOptions.some((option) => option.value === savedApiModel)
    && (!configuredModels.length || configuredModels.includes(savedApiModel))
    ? savedApiModel
    : (configuredModels[0] || modelDef.apiModel);
  return {
    nodeType: 'image',
    modelDef,
    mainId: modelDef.id,
    apiModel,
    apiModelOptions,
    sidebarParameterGroups: modelDef.sidebarParameterGroups || [],
  };
}

export function resolveClipVideoGenerationChoice(input: ClipGenerationChoiceInput = {}): ClipVideoGenerationChoice {
  const savedMainId = textValue(input.mainId || input.params?.mainId);
  const savedApiModel = textValue(input.apiModel || input.params?.apiModel || input.model);
  const modelDef = VIDEO_MODELS.find((item) => item.id === savedMainId)
    || VIDEO_MODELS.find((item) => item.id === savedApiModel || item.apiModelOptions.some((option) => option.value === savedApiModel))
    || VIDEO_MODELS[0];
  const configuredOverride = modelDef.kind === 'seedance'
    ? resolveSeedanceVideoOverride(input.videoOverrides, savedApiModel || modelDef.id)
    : textValue(input.videoOverrides?.[modelDef.id]);
  const configuredModels = parseModelList(configuredOverride);
  const apiModelOptions = withUpstreamModelOption(modelDef.apiModelOptions, configuredOverride);
  const apiModel = savedApiModel
    && apiModelOptions.some((option) => option.value === savedApiModel)
    && (!configuredModels.length || configuredModels.includes(savedApiModel))
    ? savedApiModel
    : (configuredModels[0] || modelDef.apiModelOptions[0]?.value || modelDef.id);
  return {
    nodeType: 'video',
    modelDef,
    mainId: modelDef.id,
    apiModel,
    apiModelOptions,
    sidebarParameterGroups: modelDef.sidebarParameterGroups || [],
  };
}

export function resolveClipGenerationChoice(
  nodeType: GenerationNodeType,
  input: ClipGenerationChoiceInput = {},
): ClipGenerationChoice {
  return nodeType === 'image'
    ? resolveClipImageGenerationChoice(input)
    : resolveClipVideoGenerationChoice(input);
}

export function defaultClipGenerationParams(choice: ClipGenerationChoice): Record<string, unknown> {
  const defaults = defaultParamsFromGroups(choice.sidebarParameterGroups, choice.apiModel);
  if (choice.nodeType === 'image') {
    return {
      aspectRatio: choice.modelDef.defaultAspectRatio || '1:1',
      size: choice.modelDef.defaultSize || '2K',
      imageCount: 1,
      quality: 'auto',
      seed: -1,
      ...defaults,
      mainId: choice.mainId,
      apiModel: choice.apiModel,
    };
  }
  return {
    aspectRatio: choice.modelDef.defaultRatio || '16:9',
    duration: choice.modelDef.defaultDuration || choice.modelDef.durations?.[0] || 5,
    resolution: choice.modelDef.defaultResolution || choice.modelDef.resolutions?.[0] || '',
    seed: -1,
    ...defaults,
    mainId: choice.mainId,
    apiModel: choice.apiModel,
  };
}

export function normalizeClipGenerationParams(
  choice: ClipGenerationChoice,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const raw = params || {};
  const defaults = defaultClipGenerationParams(choice);
  if (choice.nodeType === 'image') {
    return {
      ...defaults,
      ...raw,
      aspectRatio: firstDefined(raw.aspectRatio, raw.aspect_ratio, raw.ratio, defaults.aspectRatio),
      size: firstDefined(raw.size, raw.sizeLevel, raw.image_size, defaults.size),
      quality: firstDefined(raw.quality, raw.imageQuality, defaults.quality),
      apiModel: choice.apiModel,
      mainId: choice.mainId,
    };
  }
  return {
    ...defaults,
    ...raw,
    aspectRatio: firstDefined(raw.aspectRatio, raw.ratio, defaults.aspectRatio),
    generateAudio: firstDefined(raw.generateAudio, raw.generate_audio, defaults.generateAudio),
    webSearch: firstDefined(raw.webSearch, raw.web_search, defaults.webSearch),
    apiModel: choice.apiModel,
    mainId: choice.mainId,
  };
}

export function buildClipImageGenerationRequest(
  choice: ClipImageGenerationChoice,
  prompt: string,
  params: Record<string, unknown>,
  refs: ClipGenerationRefs = {},
): ClipImageGenerationRequest {
  const p = normalizeClipGenerationParams(choice, params);
  const imageRefs = refs.imageRefs || [];
  if (isFalModel(choice.apiModel) && FAL_REGISTRY[choice.apiModel]) {
    const falDef = FAL_REGISTRY[choice.apiModel];
    const falKind = falDef.paramKind;
    return {
      route: 'fal',
      request: {
        apiModel: choice.apiModel,
        prompt,
        images: imageRefs.slice(0, falDef.maxRefs),
        n: Math.max(1, Math.min(4, numberValue(p.imageCount, 1))),
        format: (p.format === 'jpeg' || p.format === 'webp') ? p.format : 'png',
        sync: boolValue(p.sync, false),
        mode: falKind === 'gpt-fal' ? (imageRefs.length ? 'edit' : 'gen') : undefined,
        size: falKind === 'gpt-fal' ? textValue(firstDefined(p.falSize, p.size, 'auto')) : undefined,
        quality: falKind === 'gpt-fal' ? (textValue(firstDefined(p.quality, 'medium')) as FalSubmitRequest['quality']) : undefined,
        aspect_ratio: falKind === 'nbpro-fal' ? textValue(firstDefined(p.nbAspect, p.aspectRatio, 'auto')) : undefined,
        resolution: falKind === 'nbpro-fal' ? textValue(firstDefined(p.nbResolution, p.size, '2K')) : undefined,
        safety_tolerance: falKind === 'nbpro-fal' ? textValue(firstDefined(p.safetyTolerance, p.nbSafety, '4')) : undefined,
        seed: falKind === 'nbpro-fal' ? positiveSeed(p.seed) : undefined,
        enable_web_search: falKind === 'nbpro-fal' ? boolValue(firstDefined(p.webSearch, p.nbWebSearch), false) : undefined,
        image_mode: falKind === 'nbpro-fal' ? 'image_url' : undefined,
      },
    };
  }
  return {
    route: 'core',
    request: {
      model: choice.modelDef.id,
      apiModel: choice.apiModel,
      paramKind: choice.modelDef.paramKind,
      prompt,
      aspect_ratio: textValue(firstDefined(p.aspectRatio, choice.modelDef.defaultAspectRatio, '1:1')),
      image_size: textValue(firstDefined(p.size, choice.modelDef.defaultSize, '2K')),
      n: Math.max(1, Math.min(4, numberValue(p.imageCount, 1))),
      quality: textValue(firstDefined(p.quality, 'auto')),
      images: imageRefs,
    },
  };
}

export function buildClipVideoGenerationRequest(
  choice: ClipVideoGenerationChoice,
  prompt: string,
  params: Record<string, unknown>,
  refs: ClipGenerationRefs = {},
): ClipVideoGenerationRequest {
  const p = normalizeClipGenerationParams(choice, params);
  const ratio = textValue(firstDefined(p.aspectRatio, choice.modelDef.defaultRatio, '16:9'));
  const duration = numberValue(p.duration, choice.modelDef.defaultDuration || choice.modelDef.durations?.[0] || 5);
  const resolution = textValue(firstDefined(p.resolution, choice.modelDef.defaultResolution, '720p'));
  const imageRefs = refs.imageRefs || [];
  const videoRefs = refs.videoRefs || [];
  const audioRefs = refs.audioRefs || [];
  const seed = positiveSeed(p.seed);

  if (choice.modelDef.kind === 'seedance') {
    const referenceMode = textValue(p.referenceMode || 'auto');
    return {
      route: 'seedance',
      request: {
        model: choice.apiModel,
        prompt,
        duration: Math.max(4, Math.min(15, duration)),
        ratio,
        resolution,
        generate_audio: boolValue(p.generateAudio, true),
        watermark: boolValue(p.watermark, false),
        web_search: boolValue(p.webSearch, true),
        seed,
        firstFrame: referenceMode === 'first_frame' || referenceMode === 'last_frame' ? imageRefs[0] : undefined,
        lastFrame: referenceMode === 'last_frame' ? imageRefs[1] : undefined,
        refImages: referenceMode === 'reference' || referenceMode === 'auto' ? imageRefs : undefined,
        videos: videoRefs,
        audios: audioRefs,
      },
    };
  }

  if (isFalVideoModel(choice.apiModel) && VIDEO_FAL_REGISTRY[choice.apiModel]) {
    const falDef = VIDEO_FAL_REGISTRY[choice.apiModel];
    const request: VideoFalSubmitRequest = {
      apiModel: choice.apiModel,
      prompt,
      images: imageRefs.slice(0, falDef.maxRefImages),
      image_mode: falDef.defaultImageMode,
    };
    if (falDef.paramKind === 'veo-fal') {
      request.aspect_ratio = ratio;
      request.duration = typeof p.duration === 'string' && p.duration.endsWith('s') ? p.duration : `${Math.max(1, duration)}s`;
      request.resolution = resolution || '720p';
      request.generate_audio = boolValue(p.generateAudio, false);
      request.safety_tolerance = numberValue(p.safetyTolerance, 4);
    } else if (falDef.paramKind === 'grok-fal') {
      const referenceMode = textValue(p.referenceMode || 'image_to_video');
      request.gkMode = referenceMode === 'reference' || referenceMode === 'reference_to_video' ? 'reference_to_video' : 'image_to_video';
      request.gkRatio = ratio === 'auto' ? '16:9' : ratio;
      request.gkDuration = duration;
      request.resolution = resolution || '720p';
      request.gkReferenceUrls = textValue(p.referenceUrls).split(/[\r\n,，]+/).map((item) => item.trim()).filter(Boolean);
    } else if (falDef.paramKind === 'sora-fal') {
      request.soraMode = imageRefs.length ? 'image_to_video' : 'text_to_video';
      request.soraRatio = ratio === 'auto' ? '16:9' : ratio;
      request.soraDuration = duration;
      request.soraResolution = resolution || '720p';
      request.soraBlockIp = boolValue(p.blockIp, false);
    }
    return { route: 'fal', request };
  }

  const request: VideoSubmitRequest = {
    model: choice.apiModel,
    protocolModel: choice.apiModel,
    prompt,
  };
  if (choice.modelDef.kind === 'grok') {
    request.ratio = ratio;
    request.duration = duration;
    request.resolution = resolution || choice.modelDef.defaultResolution || '720P';
    if (seed !== undefined) request.seed = seed;
  } else if (choice.modelDef.kind === 'sora') {
    request.aspect_ratio = ratio;
    request.duration = duration;
    request.private = boolValue(p.private, true);
    if (seed !== undefined) request.seed = seed;
  } else {
    request.aspect_ratio = ratio;
    request.duration = duration;
    request.enhance_prompt = boolValue(p.enhancePrompt, false);
    if (boolValue(p.enableUpsample, false)) request.enable_upsample = true;
    if (seed !== undefined) request.seed = seed;
  }
  if (imageRefs.length) request.images = imageRefs.slice(0, choice.modelDef.maxRefImages);
  if (videoRefs.length) request.videos = videoRefs;
  return { route: 'core', request, pollingModel: choice.apiModel };
}
