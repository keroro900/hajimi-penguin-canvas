import { memo, useCallback, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Check, ChevronDown, Copy, Eye, Play, RefreshCw, WandSparkles } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import {
  GENCLAW_RECOMMENDED_STEPS,
  createDefaultGenClawState,
  genClawStepStatusLabel,
  markGenClawStep,
} from '../../genclaw/pipeline';
import { buildDefaultSvgSketch, extractSketchCode } from '../../genclaw/sketchCode';
import {
  briefToText,
  buildFinalImagePrompt,
  buildGenClawBriefMessages,
  buildGenClawSketchMessages,
  buildReviewText,
  createLocalBrief,
} from '../../genclaw/promptBuilders';
import {
  GENCLAW_IMAGE_MODELS,
  GENCLAW_SYSTEM_PROMPT,
  resolveGenClawModelConfig,
} from '../../genclaw/config';
import { LLM_MODELS, gptImage2ZhenzhenVariantSize } from '../../providers/models';
import type { GenClawSketch, GenClawStepId } from '../../genclaw/types';
import { renderGenClawSketch } from '../../services/genclaw';
import { generateExternalImage, generateExternalLlm, generateImage, generateLlm } from '../../services/generation';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useApiKeysStore } from '../../stores/apiKeys';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import SmartImage from '../SmartImage';
import SketchPreviewPanel from './SketchPreviewPanel';

const COLOR = '#38bdf8';
type GenClawPreviewTab = 'svg' | 'render' | 'final' | 'brief';

const PREVIEW_TABS: Array<{ id: GenClawPreviewTab; label: string }> = [
  { id: 'svg', label: 'SVG' },
  { id: 'render', label: '草图渲染' },
  { id: 'final', label: '最终图' },
  { id: 'brief', label: 'Brief' },
];

function isRenderableSvg(code: string): boolean {
  return /^<svg[\s>]/i.test(String(code || '').trim());
}

function normalizeStepState(data: any) {
  return {
    ...createDefaultGenClawState(),
    stepStatus: {
      ...createDefaultGenClawState().stepStatus,
      ...(data?.genclawStepStatus || {}),
    },
  };
}

function providerParamsFrom(data: any, key: string): Record<string, any> {
  const params = data?.[key];
  return params && typeof params === 'object' && !Array.isArray(params) ? params : {};
}

const GenClawNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const upstream = useUpstreamMaterials(id);
  const advancedProviders = useApiKeysStore((s) => s.settings.advancedProviders);
  const d = (data as any) || {};
  const [busyStep, setBusyStep] = useState<GenClawStepId | 'all' | null>(null);

  const prompt = typeof d.genclawPrompt === 'string' ? d.genclawPrompt : '';
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const effectivePrompt = [upstreamText, prompt].filter((item) => item.trim()).join('\n\n').trim();
  const state = normalizeStepState(d);
  const previewTab: GenClawPreviewTab = ['svg', 'render', 'final', 'brief'].includes(d.genclawPreviewTab)
    ? d.genclawPreviewTab
    : 'svg';
  const advancedOpen = d.genclawAdvancedOpen === true;
  const modelConfig = useMemo(() => resolveGenClawModelConfig(d), [
    d.genclawLlmModel,
    d.genclawImageModel,
    d.genclawImageApiModel,
    d.genclawApiModel,
    d.genclawModel,
    d.genclawSystemPrompt,
    d.genclawSketchSystemPrompt,
    d.aspectRatio,
    d.sizeLevel,
    d.imageCount,
    d.imageQuality,
    d.providerParams,
    d.genclawAspectRatio,
    d.genclawSize,
    d.genclawImageCount,
    d.genclawImageQuality,
    d.genclawImageProviderParams,
  ]);
  const imageParams = modelConfig.imageParams;
  const width = imageParams.renderWidth;
  const height = imageParams.renderHeight;
  const llmAdvancedProviders = useMemo(
    () => advancedProvidersForNode(advancedProviders, 'llm'),
    [advancedProviders],
  );
  const imageAdvancedProviders = useMemo(
    () => advancedProvidersForNode(advancedProviders, 'image'),
    [advancedProviders],
  );
  const llmProviderSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'llm', {
      providerSource: d.genclawLlmProviderSource,
      providerId: d.genclawLlmProviderId,
      providerModel: d.genclawLlmProviderModel,
    }),
    [advancedProviders, d.genclawLlmProviderSource, d.genclawLlmProviderId, d.genclawLlmProviderModel],
  );
  const imageProviderSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'image', {
      providerSource: d.genclawImageProviderSource,
      providerId: d.genclawImageProviderId,
      providerModel: d.genclawImageProviderModel,
    }),
    [advancedProviders, d.genclawImageProviderSource, d.genclawImageProviderId, d.genclawImageProviderModel],
  );
  const isExternalLlmSelected = llmProviderSelection.available && llmProviderSelection.providerSource !== 'zhenzhen';
  const isExternalImageSelected = imageProviderSelection.available && imageProviderSelection.providerSource !== 'zhenzhen';
  const llmExternalModelOptions = llmProviderSelection.provider
    ? advancedProviderModelOptions(llmProviderSelection.provider, 'llm')
    : [];
  const imageExternalModelOptions = imageProviderSelection.provider
    ? advancedProviderModelOptions(imageProviderSelection.provider, 'image')
    : [];
  const externalLlmModel = llmProviderSelection.providerModel || llmExternalModelOptions[0] || '';
  const externalImageModel = imageProviderSelection.providerModel || imageExternalModelOptions[0] || '';
  const genclawProviderParams = providerParamsFrom(d, 'genclawProviderParams');
  const genclawImageProviderParams = providerParamsFrom(d, 'genclawImageProviderParams');

  const patchStep = useCallback((step: GenClawStepId, status: 'idle' | 'running' | 'done' | 'error', extra: Record<string, any> = {}) => {
    const next = markGenClawStep(normalizeStepState({ ...d, ...extra }), step, status);
    update({ genclawStepStatus: next.stepStatus, ...extra });
  }, [d, update]);

  const runGenClawLlm = useCallback((messages: any[], options: { temperature: number; max_tokens: number }) => {
    if (isExternalLlmSelected && llmProviderSelection.provider) {
      return generateExternalLlm({
        providerId: llmProviderSelection.provider.id,
        providerModel: externalLlmModel,
        model: externalLlmModel,
        messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        providerParams: genclawProviderParams,
      });
    }
    return generateLlm({
      model: modelConfig.llmModel,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
    });
  }, [externalLlmModel, genclawProviderParams, isExternalLlmSelected, llmProviderSelection.provider, modelConfig.llmModel]);

  const runBrief = useCallback(async () => {
    patchStep('brief', 'running', { status: 'generating', error: '' });
    let text = '';
    let llmError = '';
    try {
      const result = await runGenClawLlm(
        buildGenClawBriefMessages({
          systemPrompt: modelConfig.systemPrompt,
          prompt: effectivePrompt,
          imageCount: upstream.images.length,
        }),
        { temperature: 0.35, max_tokens: 1600 },
      );
      text = String(result.content || '').trim();
      if (!text) throw new Error('LLM 未返回构思内容');
    } catch (error: any) {
      llmError = error?.message || 'LLM 构思失败，已使用本地 brief';
      const brief = createLocalBrief(effectivePrompt, upstream.images.length);
      text = briefToText(brief);
    }
    patchStep('brief', 'done', {
      genclawBriefText: text,
      genclawUsedLlmModel: modelConfig.llmModel,
      genclawLastLlmError: llmError,
      outputText: text,
      status: 'success',
      error: '',
    });
    return text;
  }, [effectivePrompt, modelConfig.llmModel, modelConfig.systemPrompt, patchStep, runGenClawLlm, upstream.images.length]);

  const runSketch = useCallback(async (briefTextOverride?: string): Promise<GenClawSketch> => {
    patchStep('sketch', 'running', { status: 'generating', error: '' });
    const briefText = briefTextOverride || d.genclawBriefText || await runBrief();
    let rawCode = '';
    let llmError = '';
    try {
      const result = await runGenClawLlm(
        buildGenClawSketchMessages({
          systemPrompt: modelConfig.sketchSystemPrompt,
          prompt: effectivePrompt,
          briefText,
          width,
          height,
        }),
        { temperature: 0.2, max_tokens: 2400 },
      );
      rawCode = String(result.content || '').trim();
      if (!rawCode) throw new Error('LLM 未返回草图代码');
    } catch (error: any) {
      llmError = error?.message || 'LLM 草图失败，已使用本地 SVG 草图';
      rawCode = buildDefaultSvgSketch(`${briefText}\n${effectivePrompt}`, { width, height });
    }
    let sketch = extractSketchCode(rawCode);
    if (!isRenderableSvg(sketch.code)) {
      if (!llmError) llmError = 'LLM 草图不是可渲染 SVG，已使用本地 SVG 草图';
      sketch = extractSketchCode(buildDefaultSvgSketch(`${briefText}\n${effectivePrompt}`, { width, height }));
    }
    patchStep('sketch', 'done', {
      genclawSketchCode: sketch.code,
      genclawSketchKind: sketch.kind,
      genclawLastSketchLlmError: llmError,
      outputText: sketch.code,
      status: 'success',
      error: '',
    });
    return sketch;
  }, [d.genclawBriefText, effectivePrompt, height, modelConfig.llmModel, modelConfig.sketchSystemPrompt, patchStep, runBrief, runGenClawLlm, width]);

  const runRender = useCallback(async (sketchOverride?: GenClawSketch) => {
    patchStep('render', 'running', { status: 'generating', error: '' });
    const sketch = sketchOverride || (d.genclawSketchCode
      ? extractSketchCode(d.genclawSketchCode)
      : await runSketch());
    const result = await renderGenClawSketch({
      code: sketch.code,
      kind: sketch.kind,
      width,
      height,
      title: 'genclaw-sketch',
    });
    patchStep('render', 'done', {
      genclawSketchCode: sketch.code,
      genclawSketchKind: sketch.kind,
      genclawSketchImageUrl: result.imageUrl,
      imageUrl: result.imageUrl,
      imageUrls: [result.imageUrl],
      outputText: sketch.code,
      status: 'success',
      error: '',
    });
    return result.imageUrl;
  }, [d.genclawSketchCode, height, patchStep, runSketch, width]);

  const runFinalReview = useCallback(async (sketchImageOverride?: string, briefTextOverride?: string) => {
    patchStep('final-review', 'running', { status: 'generating', error: '' });
    const sketchImageUrl = sketchImageOverride || d.genclawSketchImageUrl || await runRender();
    let finalUrls: string[] = [];
    const shouldGenerate = d.genclawSkipFinalGeneration !== true;
    if (shouldGenerate) {
      const promptText = buildFinalImagePrompt({
        prompt: effectivePrompt,
        briefText: briefTextOverride || d.genclawBriefText || '',
        negativePrompt: d.genclawNegativePrompt,
      });
      try {
        const imageRefs = [sketchImageUrl, ...upstream.images.map((item) => item.url)].filter(Boolean);
        if (isExternalImageSelected && imageProviderSelection.provider) {
          const result = await generateExternalImage({
            providerId: imageProviderSelection.provider.id,
            providerModel: externalImageModel,
            model: externalImageModel,
            prompt: promptText,
            size: imageParams.renderSize,
            // 比例 / 清晰度等级带给扩展平台（aspect_ratio + image_size），Auto 不下发。
            aspect_ratio: imageParams.aspectRatio && imageParams.aspectRatio !== 'Auto' ? imageParams.aspectRatio : undefined,
            image_size: imageParams.sizeLevel || undefined,
            images: imageRefs,
            negativePrompt: d.genclawNegativePrompt || undefined,
            negative: d.genclawNegativePrompt || undefined,
            n: imageParams.imageCount,
            quality: imageParams.imageQuality !== 'auto' ? imageParams.imageQuality : undefined,
            providerParams: imageParams.providerParams,
          });
          finalUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
        } else {
          const result = await generateImage({
            model: modelConfig.imageModel,
            apiModel: modelConfig.imageApiModel,
            paramKind: modelConfig.imageParamKind,
            prompt: promptText,
            images: imageRefs,
            n: imageParams.imageCount,
            aspect_ratio: imageParams.aspectRatio,
            image_size: imageParams.sizeLevel,
            quality: imageParams.imageQuality,
            providerParams: imageParams.providerParams,
          });
          finalUrls = Array.isArray(result.urls) ? result.urls : [];
        }
      } catch (error: any) {
        const review = buildReviewText({ hasFinalImage: false, sketchImageUrl, prompt: effectivePrompt });
        patchStep('final-review', 'error', {
          genclawReviewText: `${review}\n生成接口未完成: ${error?.message || '未知错误'}`,
          outputText: `${review}\n生成接口未完成: ${error?.message || '未知错误'}`,
          status: 'error',
          error: error?.message || '成片生成失败',
        });
        return;
      }
    }
    const imageUrls = finalUrls.length > 0 ? finalUrls : [sketchImageUrl];
    const review = buildReviewText({ hasFinalImage: finalUrls.length > 0, sketchImageUrl, prompt: effectivePrompt });
    patchStep('final-review', 'done', {
      genclawFinalImageUrls: finalUrls,
      genclawReviewText: review,
      genclawUsedImageModel: modelConfig.imageModel,
      genclawUsedImageApiModel: modelConfig.imageApiModel,
      imageUrl: imageUrls[0],
      imageUrls,
      outputText: review,
      status: 'success',
      error: '',
    });
  }, [d.genclawBriefText, d.genclawNegativePrompt, d.genclawSkipFinalGeneration, d.genclawSketchImageUrl, effectivePrompt, externalImageModel, imageParams, imageProviderSelection.provider, isExternalImageSelected, modelConfig.imageApiModel, modelConfig.imageModel, modelConfig.imageParamKind, patchStep, runRender, upstream.images]);

  const runStep = useCallback(async (step: GenClawStepId) => {
    setBusyStep(step);
    try {
      if (step === 'brief') await runBrief();
      if (step === 'sketch') await runSketch();
      if (step === 'render') await runRender();
      if (step === 'final-review') await runFinalReview();
    } finally {
      setBusyStep(null);
    }
  }, [runBrief, runFinalReview, runRender, runSketch]);

  const runRecommended = useCallback(async () => {
    setBusyStep('all');
    try {
      const briefText = await runBrief();
      const sketch = await runSketch(briefText);
      const sketchImageUrl = await runRender(sketch);
      await runFinalReview(sketchImageUrl, briefText);
    } catch (error: any) {
      update({ status: 'error', error: error?.message || 'GenClaw 推荐流程失败' });
    } finally {
      setBusyStep(null);
    }
  }, [runBrief, runFinalReview, runRender, runSketch, update]);

  useRunTrigger(id, runRecommended, 'genclaw');

  const finalImageUrl = Array.isArray(d.genclawFinalImageUrls) && d.genclawFinalImageUrls.length > 0
    ? d.genclawFinalImageUrls[0]
    : d.imageUrl;
  const sketchImageUrl = d.genclawSketchImageUrl || '';

  const copySketchCode = useCallback(async () => {
    const code = String(d.genclawSketchCode || '');
    if (!code.trim()) return;
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      /* noop */
    }
  }, [d.genclawSketchCode]);

  const patchGenClawProviderParams = useCallback((patch: Record<string, any>) => {
    update({ genclawProviderParams: { ...genclawProviderParams, ...patch } });
  }, [genclawProviderParams, update]);

  const patchGenClawImageProviderParams = useCallback((patch: Record<string, any>) => {
    const next = { ...genclawImageProviderParams, ...patch };
    update({ genclawImageProviderParams: next, providerParams: next });
  }, [genclawImageProviderParams, update]);

  const switchImageModel = useCallback((nextModelId: string) => {
    const nextModel = GENCLAW_IMAGE_MODELS.find((model) => model.id === nextModelId) || GENCLAW_IMAGE_MODELS[0];
    const patch: Record<string, any> = {
      genclawImageModel: nextModelId,
      genclawImageApiModel: nextModel?.apiModel || '',
      genclawModel: nextModelId,
      model: nextModelId,
      apiModel: nextModel?.apiModel || '',
    };
    if (nextModel && !nextModel.aspectRatios.includes(imageParams.aspectRatio)) {
      patch.aspectRatio = nextModel.defaultAspectRatio;
      patch.genclawAspectRatio = nextModel.defaultAspectRatio;
    }
    if (nextModel && nextModel.sizes.length > 0 && !nextModel.sizes.includes(imageParams.sizeLevel)) {
      patch.sizeLevel = nextModel.defaultSize;
      patch.genclawSize = nextModel.defaultSize;
    }
    update(patch);
  }, [imageParams.aspectRatio, imageParams.sizeLevel, update]);

  const switchImageApiModel = useCallback((nextApiModel: string) => {
    const forcedSize = gptImage2ZhenzhenVariantSize(nextApiModel);
    update(forcedSize
      ? { genclawImageApiModel: nextApiModel, apiModel: nextApiModel, sizeLevel: forcedSize, genclawSize: forcedSize }
      : { genclawImageApiModel: nextApiModel, apiModel: nextApiModel });
  }, [update]);

  return (
    <div
      className={`t8-node relative w-[560px] transition-all ${selected ? 'ring-2 ring-sky-300' : ''}`}
      data-genclaw-root
    >
      <Handle id="text" type="target" position={Position.Left} className="!border-0" style={{ background: PORT_COLOR.text, top: 150 }} />
      <Handle id="image" type="target" position={Position.Left} className="!border-0" style={{ background: PORT_COLOR.image, top: 190 }} />
      <Handle id="image" type="source" position={Position.Right} className="!border-0" style={{ background: PORT_COLOR.image, top: 150 }} />
      <Handle id="text" type="source" position={Position.Right} className="!border-0" style={{ background: PORT_COLOR.text, top: 190 }} />

      <div className="t8-node-header flex items-center gap-2 rounded-t-[inherit] px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-current/10" style={{ color: COLOR }}>
          <WandSparkles size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black leading-tight">GenClaw 白盒生图</div>
          <div className="text-[10px] leading-tight opacity-70">构思 → 代码草图 → 渲染 → 成片审稿</div>
        </div>
        <Eye size={15} className="opacity-70" />
      </div>

      <div className="space-y-3 p-3 text-xs">
        <textarea
          value={prompt}
          placeholder={upstreamText ? '已读取上游文本，也可补充目标...' : '描述你想生成的画面...'}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => update({ genclawPrompt: event.target.value })}
          className="t8-input nodrag nowheel h-20 w-full resize-none px-2 py-2 text-[11px] leading-relaxed"
        />

        <div className="grid grid-cols-3 gap-2">
          {llmAdvancedProviders.length > 0 && (
            <label className="space-y-1">
              <span className="text-[10px] font-bold opacity-70">LLM 来源</span>
              <select
                value={isExternalLlmSelected ? llmProviderSelection.providerId : 'zhenzhen'}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId === 'zhenzhen') {
                    update({ genclawLlmProviderSource: 'zhenzhen', genclawLlmProviderId: '', genclawLlmProviderModel: '' });
                    return;
                  }
                  const provider = llmAdvancedProviders.find((item) => item.id === nextId);
                  if (!provider) return;
                  const nextModels = advancedProviderModelOptions(provider, 'llm');
                  update({
                    genclawLlmProviderSource: provider.protocol,
                    genclawLlmProviderId: provider.id,
                    genclawLlmProviderModel: nextModels[0] || '',
                  });
                }}
                className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
              >
                <option value="zhenzhen">默认</option>
                {llmAdvancedProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1">
            <span className="text-[10px] font-bold opacity-70">LLM 模型</span>
            {isExternalLlmSelected && llmProviderSelection.provider ? (
              <select
                value={externalLlmModel}
                onChange={(event) => update({ genclawLlmProviderModel: event.target.value })}
                className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
              >
                {llmExternalModelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            ) : (
              <select
                value={modelConfig.llmModel}
                onChange={(event) => update({ genclawLlmModel: event.target.value })}
                className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
              >
                {LLM_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>{model.label}</option>
                ))}
              </select>
            )}
          </label>
          {imageAdvancedProviders.length > 0 && (
            <label className="space-y-1">
              <span className="text-[10px] font-bold opacity-70">图片来源</span>
              <select
                value={isExternalImageSelected ? imageProviderSelection.providerId : 'zhenzhen'}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId === 'zhenzhen') {
                    update({ genclawImageProviderSource: 'zhenzhen', genclawImageProviderId: '', genclawImageProviderModel: '' });
                    return;
                  }
                  const provider = imageAdvancedProviders.find((item) => item.id === nextId);
                  if (!provider) return;
                  const nextModels = advancedProviderModelOptions(provider, 'image');
                  update({
                    genclawImageProviderSource: provider.protocol,
                    genclawImageProviderId: provider.id,
                    genclawImageProviderModel: nextModels[0] || '',
                  });
                }}
                className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
              >
                <option value="zhenzhen">默认</option>
                {imageAdvancedProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1">
            <span className="text-[10px] font-bold opacity-70">图片模型</span>
            {isExternalImageSelected && imageProviderSelection.provider ? (
              <select
                value={externalImageModel}
                onChange={(event) => update({ genclawImageProviderModel: event.target.value })}
                className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
              >
                {imageExternalModelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            ) : (
              <select
                value={modelConfig.imageModel}
                data-model-field="genclawImageModel"
                onChange={(event) => switchImageModel(event.target.value)}
                className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
              >
                {GENCLAW_IMAGE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>{model.label}</option>
                ))}
              </select>
            )}
          </label>
          <button
            type="button"
            className="t8-btn mt-4 h-8 px-2 text-[10px]"
            onClick={() => update({ genclawAdvancedOpen: !advancedOpen })}
          >
            <ChevronDown size={12} className={advancedOpen ? 'rotate-180' : ''} />
            高级设置
          </button>
        </div>

        {advancedOpen && (
          <div className="space-y-2 rounded-lg border border-current/15 bg-current/[0.035] p-2">
            <div className="grid grid-cols-3 gap-2">
              {!isExternalImageSelected && (
                <label className="space-y-1">
                  <span className="text-[10px] font-bold opacity-70">具体模型</span>
                  <select
                    value={modelConfig.imageApiModel}
                    data-model-field="genclawImageApiModel"
                    onChange={(event) => switchImageApiModel(event.target.value)}
                    className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  >
                    {modelConfig.imageModelDef.apiModelOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="space-y-1">
                <span className="text-[10px] font-bold opacity-70">比例</span>
                <select
                  value={imageParams.aspectRatio}
                  onChange={(event) => update({
                    aspectRatio: event.target.value,
                    genclawAspectRatio: event.target.value,
                  })}
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                >
                  {modelConfig.imageModelDef.aspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>{ratio}</option>
                  ))}
                </select>
              </label>
              {modelConfig.imageModelDef.sizes.length > 0 && (
                <label className="space-y-1">
                  <span className="text-[10px] font-bold opacity-70">尺寸</span>
                  <select
                    value={imageParams.sizeLevel}
                    onChange={(event) => update({
                      sizeLevel: event.target.value,
                      genclawSize: event.target.value,
                    })}
                    className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  >
                    {modelConfig.imageModelDef.sizes.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="space-y-1">
                <span className="text-[10px] font-bold opacity-70">生成数量</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={imageParams.imageCount}
                  onChange={(event) => update({
                    imageCount: Number(event.target.value) || 1,
                    genclawImageCount: Number(event.target.value) || 1,
                  })}
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold opacity-70">Quality</span>
                <select
                  value={imageParams.imageQuality}
                  onChange={(event) => update({
                    imageQuality: event.target.value,
                    genclawImageQuality: event.target.value,
                  })}
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                >
                  <option value="auto">Auto</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <div className="space-y-1">
                <span className="block text-[10px] font-bold opacity-70">渲染尺寸</span>
                <div className="flex h-8 items-center rounded-md border border-current/15 px-2 text-[11px] opacity-70">
                  {width}×{height}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {isExternalLlmSelected && (
                <label className="space-y-1">
                  <span className="text-[10px] font-bold opacity-70">LLM 分组</span>
                  <input
                    value={String(genclawProviderParams.zhenzhenGroup || genclawProviderParams.t8Group || '')}
                    onChange={(event) => patchGenClawProviderParams({ zhenzhenGroup: event.target.value })}
                    placeholder="可选，复用高级来源分组"
                    className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  />
                </label>
              )}
              {isExternalImageSelected && (
                <label className="space-y-1">
                  <span className="text-[10px] font-bold opacity-70">图片分组</span>
                  <input
                    value={String(genclawImageProviderParams.zhenzhenGroup || genclawImageProviderParams.t8Group || '')}
                    onChange={(event) => patchGenClawImageProviderParams({ zhenzhenGroup: event.target.value })}
                    placeholder="可选，复用高级来源分组"
                    className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  />
                </label>
              )}
            </div>

            <label className="block space-y-1">
              <span className="flex items-center justify-between text-[10px] font-bold opacity-70">
                <span>系统提示词</span>
                <button
                  type="button"
                  className="text-[10px] opacity-70 hover:opacity-100"
                  onClick={() => update({ genclawSystemPrompt: GENCLAW_SYSTEM_PROMPT })}
                >
                  重置
                </button>
              </span>
              <textarea
                value={modelConfig.systemPrompt}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => update({ genclawSystemPrompt: event.target.value })}
                className="t8-input nodrag nowheel h-16 w-full resize-none px-2 py-2 text-[10px] leading-relaxed"
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-4 gap-1.5">
          {GENCLAW_RECOMMENDED_STEPS.map((step, index) => {
            const status = state.stepStatus[step.id];
            const active = busyStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                title={step.description}
                className={`t8-btn min-h-10 px-1 text-[10px] ${status === 'done' ? 't8-btn-primary' : ''}`}
                disabled={busyStep !== null}
                onClick={() => runStep(step.id)}
              >
                {status === 'done' ? <Check size={12} /> : <span className="font-black">{index + 1}</span>}
                {active ? '执行中' : step.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="t8-btn t8-btn-primary min-h-9 w-full px-3 text-[11px]"
          disabled={busyStep !== null}
          onClick={runRecommended}
        >
          <Play size={14} />
          {busyStep === 'all' ? '推荐流程执行中...' : '一键推荐流程'}
        </button>

        <div className="grid grid-cols-4 gap-1.5 text-[10px]">
          {GENCLAW_RECOMMENDED_STEPS.map((step) => (
            <div key={step.id} className="rounded-md border border-current/15 px-2 py-1 opacity-75">
              {step.label}: {genClawStepStatusLabel(state.stepStatus[step.id])}
            </div>
          ))}
        </div>

        {d.error && (
          <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
            {d.error}
          </div>
        )}

        <section className="t8-card overflow-hidden p-2">
          <div className="mb-2 flex items-center gap-1.5">
            {PREVIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`t8-btn h-7 px-2 text-[10px] ${previewTab === tab.id ? 't8-btn-primary' : ''}`}
                onClick={() => update({ genclawPreviewTab: tab.id })}
              >
                {tab.label}
              </button>
            ))}
            <div className="flex-1" />
            {previewTab === 'svg' && (
              <>
                <button type="button" className="t8-btn h-7 px-2 text-[10px]" onClick={copySketchCode}>
                  <Copy size={12} />
                  复制 SVG
                </button>
                <button type="button" className="t8-btn h-7 px-2 text-[10px]" disabled={busyStep !== null} onClick={() => runStep('sketch')}>
                  <RefreshCw size={12} />
                  重生成
                </button>
              </>
            )}
          </div>

          {previewTab === 'svg' && (
            <div className="grid grid-cols-2 gap-3">
              <textarea
                value={d.genclawSketchCode || ''}
                placeholder="生成草图后可在这里微调 SVG..."
                spellCheck={false}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => update({ genclawSketchCode: event.target.value })}
                className="t8-input nodrag nowheel h-52 w-full resize-none px-2 py-2 font-mono text-[10px] leading-relaxed"
              />
              <SketchPreviewPanel code={d.genclawSketchCode || ''} className="h-52" />
            </div>
          )}

          {previewTab === 'render' && (
            <div className="min-h-52">
              {sketchImageUrl ? (
                <SmartImage src={sketchImageUrl} alt="GenClaw 草图渲染" className="h-52 w-full rounded-md object-contain" />
              ) : (
                <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-current/25 text-[11px] opacity-60">
                  渲染草图后会显示 PNG 预览
                </div>
              )}
            </div>
          )}

          {previewTab === 'final' && (
            <div className="min-h-52">
              {finalImageUrl ? (
                <SmartImage src={finalImageUrl} alt="GenClaw 最终图" className="h-52 w-full rounded-md object-contain" />
              ) : (
                <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-current/25 text-[11px] opacity-60">
                  成片完成后会显示最终图
                </div>
              )}
            </div>
          )}

          {previewTab === 'brief' && (
            <pre className="h-52 overflow-auto rounded-md border border-current/15 bg-current/[0.04] p-2 text-[10px] leading-relaxed opacity-85">
              {d.genclawBriefText || '构思完成后会显示 brief。'}
            </pre>
          )}
        </section>

        {(d.genclawLastLlmError || d.genclawLastSketchLlmError) && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">
            {d.genclawLastLlmError || d.genclawLastSketchLlmError}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(GenClawNode);
