import {
  DEFAULT_LLM_MODEL,
  IMAGE_MODELS,
  LLM_MODELS,
  type ImageModelDef,
} from '../providers/models.ts';
import { externalImageSizeFor } from '../utils/advancedProviders.ts';

export const GENCLAW_DEFAULT_LLM_MODEL = DEFAULT_LLM_MODEL;
export const GENCLAW_LLM_MODELS = LLM_MODELS;
export const GENCLAW_IMAGE_MODELS = IMAGE_MODELS.filter((model) => model.paramKind !== 'mj');
export const GENCLAW_DEFAULT_IMAGE_MODEL = GENCLAW_IMAGE_MODELS[0]?.id || 'gpt-image-2';
export const GENCLAW_DEFAULT_IMAGE_API_MODEL =
  GENCLAW_IMAGE_MODELS.find((model) => model.id === GENCLAW_DEFAULT_IMAGE_MODEL)?.apiModel || GENCLAW_DEFAULT_IMAGE_MODEL;

export const GENCLAW_SYSTEM_PROMPT = [
  '你是 GenClaw 白盒生图流程的视觉策划助手。',
  '你的任务是把用户目标和参考素材整理成可执行 brief，优先服务后续 SVG 白盒草图和最终图像生成。',
  '输出要结构化、短句、可落地，必须覆盖主题、主体关系、构图、层次、配色、材质/光照和风险规避。',
  '不要写营销文案，不要扩写无关故事，不要生成最终图片提示词，只给白盒流程可用的设计说明。',
].join('\n');

export const GENCLAW_SKETCH_SYSTEM_PROMPT = [
  '你是 GenClaw 白盒草图工程师，只负责输出可渲染的内联 SVG。',
  'SVG 必须用简单图形表达主体、背景、层次、方向、留白和关键轮廓，方便图像模型按构图成片。',
  '禁止脚本、外链图片、事件属性、CSS/JS 动画和远程资源。',
  '只输出 SVG 代码本体，不要解释，不要 Markdown。',
].join('\n');

function modelIds(models: Array<{ id: string }>): Set<string> {
  return new Set(models.map((model) => model.id));
}

function resolveModelId(value: unknown, models: Array<{ id: string }>, fallback: string): string {
  const clean = String(value || '').trim();
  if (clean && modelIds(models).has(clean)) return clean;
  return fallback;
}

function resolveImageModelDef(imageModel: string): ImageModelDef {
  return (GENCLAW_IMAGE_MODELS.find((model) => model.id === imageModel) || GENCLAW_IMAGE_MODELS[0] || IMAGE_MODELS[0])!;
}

function resolveImageApiModel(imageModelDef: ImageModelDef, value: unknown): string {
  const clean = String(value || '').trim();
  if (clean && imageModelDef.apiModelOptions.some((option) => option.value === clean)) return clean;
  return imageModelDef.apiModel;
}

const GENCLAW_MAX_IMAGE_COUNT = 10;
const GENCLAW_IMAGE_QUALITIES = new Set(['auto', 'low', 'medium', 'high']);

function resolveChoice(value: unknown, options: string[], fallback: string): string {
  const clean = String(value || '').trim();
  if (clean && options.includes(clean)) return clean;
  return fallback;
}

function clampImageCount(value: unknown, fallback = 1): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(GENCLAW_MAX_IMAGE_COUNT, n));
}

function parseSize(value: string): { width: number; height: number } {
  const match = String(value || '').match(/^(\d+)x(\d+)$/i);
  if (!match) return { width: 1024, height: 1024 };
  return {
    width: Math.max(64, Number(match[1]) || 1024),
    height: Math.max(64, Number(match[2]) || 1024),
  };
}

export function resolveGenClawImageParams(data: any = {}, imageModelDef?: ImageModelDef) {
  const imageCandidate = data?.genclawImageModel || data?.genclawModel;
  const modelDef = imageModelDef || resolveImageModelDef(resolveModelId(imageCandidate, GENCLAW_IMAGE_MODELS, GENCLAW_DEFAULT_IMAGE_MODEL));
  const aspectRatio = resolveChoice(
    data?.aspectRatio || data?.genclawAspectRatio,
    modelDef.aspectRatios,
    modelDef.defaultAspectRatio || '1:1',
  );
  const sizeLevel = modelDef.sizes.length > 0
    ? resolveChoice(data?.sizeLevel || data?.genclawSize, modelDef.sizes, modelDef.defaultSize || modelDef.sizes[0])
    : '';
  const imageQuality = GENCLAW_IMAGE_QUALITIES.has(String(data?.imageQuality || data?.genclawImageQuality || 'auto'))
    ? String(data?.imageQuality || data?.genclawImageQuality || 'auto')
    : 'auto';
  const imageCount = clampImageCount(data?.imageCount ?? data?.genclawImageCount, 1);
  const providerParams = {
    ...((data?.providerParams && typeof data.providerParams === 'object') ? data.providerParams : {}),
    ...((data?.genclawImageProviderParams && typeof data.genclawImageProviderParams === 'object') ? data.genclawImageProviderParams : {}),
  };
  const renderSize = externalImageSizeFor(aspectRatio, sizeLevel || modelDef.defaultSize || '1K');
  const { width, height } = parseSize(renderSize);

  return {
    aspectRatio,
    sizeLevel,
    imageCount,
    imageQuality,
    providerParams,
    renderSize,
    renderWidth: width,
    renderHeight: height,
  };
}

export function resolveGenClawModelConfig(data: any = {}) {
  const imageCandidate = data?.genclawImageModel || data?.genclawModel;
  const llmModel = resolveModelId(data?.genclawLlmModel, GENCLAW_LLM_MODELS, GENCLAW_DEFAULT_LLM_MODEL);
  const imageModel = resolveModelId(imageCandidate, GENCLAW_IMAGE_MODELS, GENCLAW_DEFAULT_IMAGE_MODEL);
  const imageModelDef = resolveImageModelDef(imageModel);
  const imageApiModel = resolveImageApiModel(imageModelDef, data?.genclawImageApiModel || data?.genclawApiModel);
  const imageParams = resolveGenClawImageParams(data, imageModelDef);
  const systemPrompt = String(data?.genclawSystemPrompt || '').trim() || GENCLAW_SYSTEM_PROMPT;
  const sketchSystemPrompt = String(data?.genclawSketchSystemPrompt || '').trim() || GENCLAW_SKETCH_SYSTEM_PROMPT;

  return {
    llmModel,
    imageModel,
    imageModelDef,
    imageApiModel,
    imageParamKind: imageModelDef.paramKind,
    imageParams,
    systemPrompt,
    sketchSystemPrompt,
  };
}
