import { modelsForCatalogKind } from './modelCatalog.ts';
import type { ApiSettings } from '../types/canvas';

/**
 * 模型注册表 - 集中定义可扩展模型清单
 * 后续要新增模型只需在对应数组里追加即可
 */

export type ProviderType = 'zhenzhen' | 'llm-direct';

// ========== 图像 ==========
// paramKind:决定调用上游时使用哪种参数协议
//  - 'gpt-size'    : OpenAI 兼容,size 字段为像素串(1024x1024 等),编辑端点 multipart
//  - 'banana-ratio': nano-banana 协议,使用 aspect_ratio + image_size(1K/2K/4K) + image[]
//  - 'grok-image'  : Grok Image 协议,JSON /generations,参考图默认 base64 dataURL
//  - 'mj'          : Midjourney 协议,走专属 /api/proxy/mj/* 路由(speed_map + sref/oref)
export type ImageParamKind = 'gpt-size' | 'banana-ratio' | 'grok-image' | 'mj';

export interface SidebarParameterOption {
  value: string;
  label: string;
}

export interface SidebarParameterControl {
  id: string;
  label: string;
  valueKey: string;
  type: 'select' | 'number' | 'boolean';
  options?: SidebarParameterOption[];
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  showWhenApiModel?: string[];
}

export interface SidebarParameterGroup {
  id: string;
  label: string;
  controls: SidebarParameterControl[];
}

export type ModelSelectOption = { value: string; label: string };

function modelIdsFromObject(value: unknown, out: string[]) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) modelIdsFromObject(item, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  const direct = obj.id ?? obj.model ?? obj.value;
  if (typeof direct === 'string') {
    const item = direct.trim();
    if (item && !out.includes(item)) out.push(item);
  }
  for (const key of ['data', 'models', 'items', 'list']) {
    modelIdsFromObject(obj[key], out);
  }
}

export function parseModelList(value: unknown): string[] {
  const jsonOut: string[] = [];
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    modelIdsFromObject(value, jsonOut);
    if (jsonOut.length) return jsonOut;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^[\[{]/.test(text)) {
      try {
        modelIdsFromObject(JSON.parse(text), jsonOut);
        if (jsonOut.length) return jsonOut;
      } catch {
        // Fall through to plain text parsing.
      }
    }
  }
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '').split(/[\r\n,，;；]+/);
  const out: string[] = [];
  for (const raw of rawItems) {
    const item = String(raw || '').trim();
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

export function stringifyModelList(value: unknown): string {
  return parseModelList(value).join('\n');
}

export function withUpstreamModelOption<T extends ModelSelectOption>(
  options: readonly T[],
  upstreamModel: string | string[] | undefined | null,
): T[] {
  const base = (Array.isArray(options) ? options : []).map((option) => {
    const matched = parseModelList(upstreamModel).find((model) => option.value === model);
    if (matched) {
      return { ...option, label: matched };
    }
    return option;
  });
  const additions = parseModelList(upstreamModel)
    .filter((model) => !base.some((option) => option.value === model))
    .map((model) => ({ value: model, label: model } as T));
  return [...additions, ...base];
}

export interface ImageModelDef {
  id: string;             // 节点内部 id(如 'gpt-image-2')
  apiModel: string;       // 默认上游真实模型名(透传给 API)
  label: string;          // 长名(用于描述行)
  tabLabel: string;       // TAB 短名
  provider: ProviderType;
  paramKind: ImageParamKind;
  capabilities: ('t2i' | 'i2i' | 'edit' | 'text-render')[];
  // 子模型变体(对齐主项目 gpt-image-2-web 的 g_model / n_model 下拉)
  apiModelOptions: Array<{ value: string; label: string }>;
  // 比例选项(双协议通用,Auto/1:1/16:9 …)
  aspectRatios: string[];
  defaultAspectRatio: string;
  // 尺寸选项:gpt-size 用像素串(1024x1024…), banana-ratio 用等级(1K/2K/4K)
  sizes: string[];
  defaultSize: string;
  // 是否支持参考图(图生图)
  supportsReference: boolean;
  // 参考图最大数量
  maxReferenceImages: number;
  description?: string;
  sidebarParameterGroups?: SidebarParameterGroup[];
}

// 主项目 gpt-image-2-web 的 aspectRatio 全集(14 种 + Auto)
const GPT_RATIOS = ['Auto', '1:1', '16:9', '4:3', '4:5', '3:2', '2:3', '3:4', '5:4', '9:16', '21:9', '1:4', '4:1', '1:8', '8:1'];
// nano-banana-2(Flash)支持全部 14 个比例,Pro 支持精简集
const BANANA_FLASH_RATIOS = GPT_RATIOS;
const BANANA_PRO_RATIOS = ['Auto', '1:1', '16:9', '4:3', '4:5', '3:2', '2:3', '3:4', '5:4', '9:16', '21:9'];
// gpt-image-2-web Grok Image Tab 的比例集合,默认参考图传入方式为 Base64
const GROK_IMAGE_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

export const GPT_IMAGE_2_ZHENZHEN_SIZE_VARIANTS: Record<string, '2K' | '4K'> = {};

export function gptImage2ZhenzhenVariantSize(apiModel: string | undefined | null): '2K' | '4K' | null {
  return GPT_IMAGE_2_ZHENZHEN_SIZE_VARIANTS[String(apiModel || '').trim()] || null;
}

export const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: '',
    apiModel: '',
    label: 'Image',
    tabLabel: 'Image',
    provider: 'zhenzhen',
    paramKind: 'gpt-size',
    capabilities: ['t2i', 'i2i', 'edit', 'text-render'],
    apiModelOptions: [],
    aspectRatios: GPT_RATIOS,
    defaultAspectRatio: '1:1',
    sizes: ['1K', '2K', '4K'],
    defaultSize: '2K', // 主项目默认为 2K
    supportsReference: true,
    maxReferenceImages: 9,
    description: 'Dynamic image model parameter template',
  },
];

export function imageModelDefFor(modelId: string, protocol = ''): ImageModelDef {
  const model = String(modelId || '').trim();
  const exact = IMAGE_MODELS.find((item) => item.id && (item.id === model || item.apiModel === model));
  if (exact) return exact;

  const template = IMAGE_MODELS[0];
  const isGeminiImage = String(protocol || '').startsWith('gemini-')
    || /(?:^|[-_.])(gemini|nano[-_.]?banana)(?:[-_.]|$)/i.test(model);
  return {
    ...template,
    id: model,
    apiModel: model,
    label: model || template.label,
    tabLabel: model || template.tabLabel,
    paramKind: isGeminiImage ? 'banana-ratio' : template.paramKind,
    aspectRatios: isGeminiImage ? [...BANANA_FLASH_RATIOS] : [...template.aspectRatios],
    sizes: isGeminiImage ? ['1K', '2K', '4K'] : [...template.sizes],
    defaultSize: isGeminiImage ? '2K' : template.defaultSize,
    description: isGeminiImage ? 'Gemini image generation parameters' : template.description,
  };
}

// ========================================================================
// MJ 常量(对齐 gpt-image-2-web/index.html L1552~L1580 mj_model/mj_ar 下拉)
// ========================================================================
/** 11 个 MJ 版本(v 8.1 默认 + niji 系列) */
export const MJ_VERSIONS: Array<{ value: string; label: string }> = [
  { value: 'v 8.1', label: 'v 8.1 (默认)' },
  { value: 'v 8',   label: 'v 8' },
  { value: 'v 7',   label: 'v 7' },
  { value: 'v 6.1', label: 'v 6.1' },
  { value: 'v 6.0', label: 'v 6.0' },
  { value: 'v 5.2', label: 'v 5.2' },
  { value: 'v 5.1', label: 'v 5.1' },
  { value: 'niji 7', label: 'niji 7' },
  { value: 'niji 6', label: 'niji 6' },
  { value: 'niji 5', label: 'niji 5' },
  { value: 'niji 4', label: 'niji 4' },
];
export const DEFAULT_MJ_VERSION = 'v 8.1';

/** 7 个 MJ 比例 */
export const MJ_RATIOS = ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '9:16'];
export const DEFAULT_MJ_RATIO = '1:1';

/** 3 档速度 */
export const MJ_SPEEDS: Array<{ value: 'fast' | 'turbo' | 'relax'; label: string }> = [
  { value: 'fast',  label: 'Fast (默认)' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'relax', label: 'Relax' },
];
export const DEFAULT_MJ_SPEED = 'fast';

/** 4 档 sv(Stylize Version) */
export const MJ_SVS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'sv 1 (默认)' },
  { value: '2', label: 'sv 2' },
  { value: '3', label: 'sv 3' },
  { value: '4', label: 'sv 4' },
];

/** 判断 modelDef.paramKind === 'mj' */
export function isMjModel(apiModel: string | undefined | null): boolean {
  if (!apiModel) return false;
  const def = IMAGE_MODELS.find((m) => m.id === apiModel || m.apiModel === apiModel);
  return def?.paramKind === 'mj';
}

// ========================================================================
// FAL 渠道注册表(完全对齐 gpt-image-2-web SKILL.md §FAL模型渠道接入规范)
//   - URL: {baseUrl}/fal/{endpoint}   (替换官方 queue.fal.run)
//   - 同步: response.images[]; 异步: request_id + response_url + 轮询
//   - response_url 域名修复: queue.fal.run → {baseUrl}/fal
//   - 轮询 HTTP 非 200 时,body 中 status==='IN_QUEUE'/'IN_PROGRESS' 时重试,否则抛错
// ========================================================================
// FAL 参数协议种类
//   - 'gpt-fal'      : openai/gpt-image-2(/edit) — quality/num_images/output_format/image_size/sync_mode
//   - 'nbpro-fal'    : fal-ai/nano-banana-pro/edit — num_images/aspect_ratio/resolution/output_format/safety_tolerance/system_prompt/enable_web_search
export type FalParamKind = 'gpt-fal' | 'nbpro-fal';

export interface FalEndpointDef {
  /** 文生图(无参考图)endpoint */
  endpoint: string;
  /** 图生图(有参考图,image_urls)endpoint;不填则与 endpoint 相同 */
  editEndpoint?: string;
  paramKind: FalParamKind;
  /** 最大参考图数(主项目: gpt=5, nbpro=8) */
  maxRefs: number;
}

/** 按 apiModel(如 'gpt-image-2-fal' / 'nano-banana-pro-fal' / 'nano-banana-2-fal')索引 */
export const FAL_REGISTRY: Record<string, FalEndpointDef> = {};

/** 判断一个 apiModel 是否走 FAL 协议 */
export function isFalModel(apiModel: string | undefined | null): boolean {
  if (!apiModel) return false;
  return !!FAL_REGISTRY[String(apiModel)];
}

/** GPT FAL 预设尺寸枚举(主项目 g_model 切到 fal 时的 gf_size 下拉) */
export const GPT_FAL_SIZES = [
  { value: 'auto', label: 'Auto' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 4:3' },
  { value: 'portrait_16_9', label: 'Portrait 16:9' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'custom', label: 'Custom (16 倍数)' },
];

/** Nano Banana Pro FAL 比例枚举(主项目 nf_ratio) */
export const NBPRO_FAL_RATIOS = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'];
/** Nano Banana Pro FAL 分辨率枚举(主项目 nf_resolution) */
export const NBPRO_FAL_RESOLUTIONS = ['1K', '2K', '4K'];

// ========== 视频 ==========
// kind 决定上游 payload 协议(后端会根据 model 名自动识别,前端主要用于控制参数 UI 列表)
export type VideoKind = 'veo' | 'grok' | 'sora' | 'seedance';

// ---- Video FAL 渠道注册表 (1:1 对齐 gpt-image-2-web runVeo3Fal / runGrokFal / runSora2Fal) ----
export interface VideoFalEndpointDef {
  /** 文生视频 endpoint */
  endpoint: string;
  /** 图生视频 endpoint (有参考图时走这个) */
  i2vEndpoint?: string;
  /** 参考生视频 endpoint (多参考图时走这个) */
  referenceEndpoint?: string;
  paramKind: 'veo-fal' | 'grok-fal' | 'sora-fal';
  maxRefImages: number;
  /** 参考图默认传入方式；Grok/Sora 新 FAL 默认走 base64 */
  defaultImageMode?: 'image_url' | 'base64';
  /** 该 FAL 端点是否必须带参考图 */
  requiresImage?: boolean;
  /** 该 FAL 端点是否不支持 aspect_ratio UI/参数 */
  disableAspectRatio?: boolean;
}
export const VIDEO_FAL_REGISTRY: Record<string, VideoFalEndpointDef> = {};
export function isFalVideoModel(apiModel: string): boolean {
  return apiModel in VIDEO_FAL_REGISTRY;
}
/** Veo FAL 比例(主项目 vf_ratio) */
export const VEO_FAL_RATIOS = ['16:9', '9:16'];
/** Veo FAL 时长(主项目 vf_duration) */
export const VEO_FAL_DURATIONS = ['8s'];
/** Veo FAL 分辨率(主项目 vf_resolution) */
export const VEO_FAL_RESOLUTIONS = ['720p', '1080p', '4k'];
/** Grok FAL 比例(主项目 gkf_ratio) */
export const GROK_FAL_RATIOS = ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', 'auto'];
/** Grok FAL 分辨率(主项目 gkf_resolution) */
export const GROK_FAL_RESOLUTIONS = ['720p', '480p'];
/** Grok FAL 模式(主项目 gkf_mode) */
export const GROK_FAL_MODES = [
  { value: 'image_to_video', label: '图生' },
  { value: 'reference_to_video', label: '参考' },
] as const;
/** Sora2 FAL 模式(主项目 srf_mode) */
export const SORA2_FAL_MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'text_to_video', label: 'Text' },
  { value: 'image_to_video', label: 'Image' },
] as const;
/** Sora2 FAL 比例(主项目 srf_ratio) */
export const SORA2_FAL_RATIOS = ['16:9', '9:16', 'auto'];
/** Sora2 FAL 时长(主项目 srf_duration) */
export const SORA2_FAL_DURATIONS = [4, 8, 12, 16, 20];
/** Sora2 FAL 分辨率(主项目 srf_resolution) */
export const SORA2_FAL_RESOLUTIONS = ['720p', 'auto'];

export const GROK_VIDEO_1_5_NEW_MODELS = [] as const;

export type GrokVideo15NewModel = typeof GROK_VIDEO_1_5_NEW_MODELS[number];

export const GROK_VIDEO_1_5_NEW_SIZES = [
  { value: '1280x720', label: '横屏 1280x720' },
  { value: '720x1280', label: '竖屏 720x1280' },
] as const;

export function isGrokVideo15NewModel(model: string): model is GrokVideo15NewModel {
  return (GROK_VIDEO_1_5_NEW_MODELS as readonly string[]).includes(String(model || '').trim());
}

export function grokVideo15NewSizeFromRatio(ratioOrSize: string): '1280x720' | '720x1280' {
  const value = String(ratioOrSize || '').trim();
  if (value === '720x1280') return '720x1280';
  if (value === '9:16') return '720x1280';
  return '1280x720';
}

export const APISHU_VEO_OMNI_MODELS = [] as const;

export type ApishuVeoOmniModel = string;

export function apishuVeoOmniMode(model: string): 'flash' | 'components' | 'edit' | null {
  const normalized = String(model || '').trim().toLowerCase().replace(/^veo-/, '');
  if (!/^omni-flash(?:-(?:components|edit|video-edit))?$/.test(normalized)) return null;
  if (normalized.endsWith('-video-edit') || normalized.endsWith('-edit')) return 'edit';
  if (normalized.endsWith('-components')) return 'components';
  return 'flash';
}

export function isApishuVeoOmniModel(model: string): model is ApishuVeoOmniModel {
  return apishuVeoOmniMode(model) !== null;
}

export interface VideoModelDef {
  id: string;                // 节点默认 model 字段(也是上游真实 model)
  label: string;             // 主选项显示名
  kind: VideoKind;
  provider: ProviderType;
  description?: string;
  // 子模型下拉(参考项目 类似 gpt-image-2-web 的 g_model / veo_model / gk_model)
  apiModelOptions: Array<{ value: string; label: string }>;
  // 比例/尺寸 — 字段名上游各不同,这里只是 UI 选项
  ratios: string[];
  defaultRatio: string;
  // Grok 专用:duration(s)、resolution 下拉
  durations?: number[];
  defaultDuration?: number;
  resolutions?: string[];
  defaultResolution?: string;
  // 参考图
  supportImages: boolean;
  maxRefImages: number;
  sidebarParameterGroups?: SidebarParameterGroup[];
}

// Veo 系列子模型。第一项是切到 Veo 分类时的默认具体模型。
const VEO_MODELS: Array<{ value: string; label: string }> = [];

export const SEEDANCE_MODEL_OPTIONS: Array<{ value: string; label: string }> = [];

export function resolveSeedanceVideoOverride(overrides: Record<string, unknown> | undefined, model: unknown): string {
  const savedModel = String(model || '').trim();
  void overrides;
  return savedModel;
}
export const SEEDANCE_RATIO_OPTIONS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21', 'adaptive'];
export const SEEDANCE_RESOLUTION_OPTIONS = ['480p', '720p', 'native1080p', 'native4K', '1080p', '2k', '4k'];
export const SEEDANCE_DURATION_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const SEEDANCE_API_MODEL_VALUES = SEEDANCE_MODEL_OPTIONS.map((item) => item.value);

export const VIDEO_MODELS: VideoModelDef[] = [
  {
    id: '',
    label: 'Video',
    kind: 'veo',
    provider: 'zhenzhen',
    description: 'Dynamic video model parameter template',
    apiModelOptions: [],
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    defaultRatio: '16:9',
    durations: [5, 10, 15],
    defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p', '4k'],
    defaultResolution: '720p',
    supportImages: true,
    maxRefImages: 9,
  },
];

const optionList = (items: Array<string | number | SidebarParameterOption>): SidebarParameterOption[] => items.map((item) => (
  typeof item === 'object' ? item : { value: String(item), label: String(item) }
));

IMAGE_MODELS.forEach((model) => {
  const controls: SidebarParameterControl[] = [
    {
      id: 'aspectRatio',
      label: '比例',
      valueKey: 'aspectRatio',
      type: 'select',
      options: optionList(model.aspectRatios),
      defaultValue: model.defaultAspectRatio,
    },
  ];
  if (model.sizes.length > 0) {
    controls.push({
      id: 'size',
      label: '尺寸',
      valueKey: 'size',
      type: 'select',
      options: optionList(model.sizes),
      defaultValue: model.defaultSize,
    });
  }
  controls.push(
    {
      id: 'imageCount',
      label: '数量',
      valueKey: 'imageCount',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 4,
      step: 1,
    },
    {
      id: 'quality',
      label: '质量',
      valueKey: 'quality',
      type: 'select',
      options: optionList(['auto', 'low', 'medium', 'high']),
      defaultValue: 'auto',
    },
    {
      id: 'falSize',
      label: 'FAL尺寸',
      valueKey: 'falSize',
      type: 'select',
      options: GPT_FAL_SIZES,
      defaultValue: 'auto',
      showWhenApiModel: ['gpt-image-2-fal'],
    },
    {
      id: 'nbResolution',
      label: 'FAL清晰度',
      valueKey: 'nbResolution',
      type: 'select',
      options: optionList(NBPRO_FAL_RESOLUTIONS),
      defaultValue: '2K',
      showWhenApiModel: ['nano-banana-pro-fal', 'nano-banana-2-fal'],
    },
    {
      id: 'nbAspect',
      label: 'FAL比例',
      valueKey: 'nbAspect',
      type: 'select',
      options: optionList(NBPRO_FAL_RATIOS),
      defaultValue: 'auto',
      showWhenApiModel: ['nano-banana-pro-fal', 'nano-banana-2-fal'],
    },
    {
      id: 'seed',
      label: 'Seed',
      valueKey: 'seed',
      type: 'number',
      defaultValue: -1,
      min: -1,
      max: 2147483647,
      step: 1,
    },
    {
      id: 'webSearch',
      label: 'Web Search',
      valueKey: 'webSearch',
      type: 'boolean',
      defaultValue: false,
      showWhenApiModel: ['nano-banana-pro-fal', 'nano-banana-2-fal'],
    },
  );
  model.sidebarParameterGroups = [{ id: 'image-node-params', label: '参数', controls }];
});

VIDEO_MODELS.forEach((model) => {
  const controls: SidebarParameterControl[] = [
    {
      id: 'aspectRatio',
      label: '比例',
      valueKey: 'aspectRatio',
      type: 'select',
      options: optionList(model.ratios),
      defaultValue: model.defaultRatio,
    },
  ];
  if (model.durations?.length) {
    controls.push({
      id: 'duration',
      label: '时长',
      valueKey: 'duration',
      type: 'select',
      options: optionList(model.durations.map((item) => ({ value: String(item), label: `${item}s` }))),
      defaultValue: model.defaultDuration || model.durations[0],
    });
  }
  if (model.resolutions?.length) {
    controls.push({
      id: 'resolution',
      label: '清晰度',
      valueKey: 'resolution',
      type: 'select',
      options: optionList(model.resolutions),
      defaultValue: model.defaultResolution || model.resolutions[0],
    });
  }
  controls.push(
    {
      id: 'seed',
      label: 'Seed',
      valueKey: 'seed',
      type: 'number',
      defaultValue: -1,
      min: -1,
      max: 2147483647,
      step: 1,
    },
    {
      id: 'referenceMode',
      label: '参考图模式',
      valueKey: 'referenceMode',
      type: 'select',
      options: optionList([
        { value: 'auto', label: '全部参考图(auto)' },
        { value: 'first_frame', label: '首帧' },
        { value: 'last_frame', label: '尾帧' },
        { value: 'reference', label: '参考' },
      ]),
      defaultValue: 'auto',
    },
    {
      id: 'generateAudio',
      label: '生成音频',
      valueKey: 'generateAudio',
      type: 'boolean',
      defaultValue: model.kind === 'seedance',
      showWhenApiModel: SEEDANCE_API_MODEL_VALUES,
    },
    {
      id: 'webSearch',
      label: 'Web Search',
      valueKey: 'webSearch',
      type: 'boolean',
      defaultValue: model.kind === 'seedance',
      showWhenApiModel: SEEDANCE_API_MODEL_VALUES,
    },
    {
      id: 'watermark',
      label: '水印',
      valueKey: 'watermark',
      type: 'boolean',
      defaultValue: false,
    },
  );
  model.sidebarParameterGroups = [{ id: 'video-node-params', label: '参数', controls }];
});

// ========== 音频(Suno) ==========
export interface AudioModelDef {
  id: string;
  label: string;
  provider: ProviderType;
  mode: 'generate' | 'cover' | 'extend';
  description?: string;
}

export const AUDIO_MODELS: AudioModelDef[] = [];

// Suno 版本下拉选项（完全对齐主项目 gpt-image-2-web 的 SUNO_MV_MAP）。
// value 将被原样发送给后端。
export const SUNO_VERSIONS: Array<{ value: string; label: string }> = [];
export const DEFAULT_SUNO_VERSION = '';

// ========== LLM/Vision ==========
// LLM 模型名由 API 设置里拉取/填写的真实模型列表驱动。
export interface LlmModelDef {
  id: string;
  label: string;
  provider: ProviderType;
  /** 是否支持多模态(图片输入) */
  vision?: boolean;
  /** 是否支持图像输出(gpt-image-2-all) */
  imageOutput?: boolean;
  /** 是否仅支持非流式(出图模型走非流式) */
  nonStreaming?: boolean;
  contextLength?: number;
  description?: string;
}

export const LLM_MODEL_OVERRIDE_KEY = 'llm-direct';
export const LLM_MODELS: LlmModelDef[] = [];
export const DEFAULT_LLM_MODEL = '';

export type LlmModelSource = 'llm-direct' | 'zhenzhen';

export type LlmModelSettingsLike = Pick<ApiSettings, 'zhenzhenModelCatalog' | 'llmModelCatalog'>;

export interface LlmModelChoice extends ModelSelectOption {
  model: string;
  source: LlmModelSource;
}

export function encodeLlmModelChoice(model: string, source: LlmModelSource): string {
  return `${source}::${String(model || '').trim()}`;
}

export function decodeLlmModelChoice(value: unknown): { model: string; source: LlmModelSource } {
  const clean = String(value || '').trim();
  if (clean.startsWith('zhenzhen::')) return { model: clean.slice('zhenzhen::'.length), source: 'zhenzhen' };
  if (clean.startsWith('llm-direct::')) return { model: clean.slice('llm-direct::'.length), source: 'llm-direct' };
  return { model: clean, source: 'llm-direct' };
}

export function llmModelChoicesFromSettings(settings?: LlmModelSettingsLike | null): LlmModelChoice[] {
  if (!settings) return [];
  const groups: Array<{ source: LlmModelSource; label: string; models: string[] }> = [
    { source: 'llm-direct', label: 'LLM 独立', models: modelsForCatalogKind(settings.llmModelCatalog, 'chat') },
    { source: 'zhenzhen', label: '通用服务', models: modelsForCatalogKind(settings.zhenzhenModelCatalog, 'chat') },
  ];
  return groups.flatMap(({ source, label, models }) => models.map((model) => ({
    value: encodeLlmModelChoice(model, source),
    label: `${model} · ${label}`,
    model,
    source,
  })));
}

export function resolveConfiguredLlmChoice(
  modelValue: unknown,
  sourceValue: unknown,
  settings?: LlmModelSettingsLike | null,
): { model: string; source: LlmModelSource; value: string } {
  const model = String(modelValue || '').trim();
  const source: LlmModelSource = sourceValue === 'zhenzhen' ? 'zhenzhen' : 'llm-direct';
  if (model) return { model, source, value: encodeLlmModelChoice(model, source) };
  const first = llmModelChoicesFromSettings(settings)[0];
  return first
    ? { model: first.model, source: first.source, value: first.value }
    : { model: '', source, value: encodeLlmModelChoice('', source) };
}

export function configuredLlmModelList(settings?: LlmModelSettingsLike | null): string[] {
  return settings ? Array.from(new Set(llmModelChoicesFromSettings(settings).map((choice) => choice.model))) : [];
}

export function llmModelOptionsFromSettings(settings?: LlmModelSettingsLike | null): ModelSelectOption[] {
  return llmModelChoicesFromSettings(settings);
}

export function resolveConfiguredLlmModel(value: unknown, settings?: LlmModelSettingsLike | null): string {
  const clean = String(value || '').trim();
  if (clean) return clean;
  return configuredLlmModelList(settings)[0] || DEFAULT_LLM_MODEL;
}

export function configuredLlmModelLabel(modelId: string, settings?: LlmModelSettingsLike | null): string {
  const model = String(modelId || '').trim();
  return llmModelOptionsFromSettings(settings).find((option) => option.value === model)?.label || model;
}

/** 是否为出图模型(需走非流式 + 检测 generate_image 指令) */
export function isImageOutputLlm(modelId: string): boolean {
  return LLM_MODELS.find((m) => m.id === modelId)?.imageOutput === true;
}
