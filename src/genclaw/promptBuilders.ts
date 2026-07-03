import { GENCLAW_SKETCH_SYSTEM_PROMPT, GENCLAW_SYSTEM_PROMPT } from './config.ts';
import type { LlmMessage } from '../services/generation.ts';
import type { GenClawBrief } from './types.ts';

function compactLine(value: string, fallback: string): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean || fallback;
}

export function createLocalBrief(prompt: string, imageCount = 0): GenClawBrief {
  const subject = compactLine(prompt, '未命名视觉方案');
  return {
    subject,
    style: '白盒草图优先，结构清晰，主体和背景分层明确',
    composition: imageCount > 0 ? `参考 ${imageCount} 张上游图像，保留主体关系并重组画面` : '中央主体 + 辅助形状 + 明确留白',
    palette: '高对比基础色，方便后续模型识别结构',
    notes: [
      '先用 SVG 固定构图和主体轮廓',
      '再把渲染图作为参考进入成片生成',
      '最终审稿关注主体一致性、边缘清晰度和文字/水印问题',
    ],
  };
}

export function briefToText(brief: GenClawBrief): string {
  return [
    `主题: ${brief.subject}`,
    `风格: ${brief.style}`,
    `构图: ${brief.composition}`,
    `配色: ${brief.palette}`,
    `注意: ${brief.notes.join('；')}`,
  ].join('\n');
}

export function buildFinalImagePrompt(params: {
  prompt: string;
  briefText: string;
  negativePrompt?: string;
}): string {
  return [
    '根据白盒草图生成最终图像，保持构图、主体位置、形状关系和画面节奏。',
    params.briefText,
    `用户目标: ${compactLine(params.prompt, '根据草图成片')}`,
    params.negativePrompt ? `避免: ${params.negativePrompt}` : '避免: 水印、乱码文字、畸形肢体、过度杂乱背景',
  ].filter(Boolean).join('\n\n');
}

export function buildReviewText(params: {
  hasFinalImage: boolean;
  sketchImageUrl?: string;
  prompt: string;
}): string {
  const base = params.hasFinalImage ? '已完成成片。' : '已完成草图渲染。';
  const sketch = params.sketchImageUrl ? `草图参考: ${params.sketchImageUrl}` : '草图参考: 未生成';
  return [
    base,
    sketch,
    `审稿要点: 对照“${compactLine(params.prompt, '当前目标')}”检查主体是否清晰、构图是否遵循草图、是否有水印或乱码。`,
  ].join('\n');
}

export function buildGenClawBriefMessages(params: {
  systemPrompt?: string;
  prompt: string;
  imageCount?: number;
}): LlmMessage[] {
  const imageCount = Math.max(0, Number(params.imageCount) || 0);
  const referenceLine = imageCount > 0
    ? `当前有 ${imageCount} 张参考图。请在 brief 中说明需要保留或重组的主体关系。`
    : '当前没有参考图。请用文字目标建立清晰的主体和构图。';
  return [
    { role: 'system', content: compactLine(params.systemPrompt || GENCLAW_SYSTEM_PROMPT, GENCLAW_SYSTEM_PROMPT) },
    {
      role: 'user',
      content: [
        '请为 GenClaw 白盒生图流程生成 brief。',
        referenceLine,
        `用户目标: ${compactLine(params.prompt, '根据输入生成视觉方案')}`,
        '格式: 主题 / 风格 / 构图 / 配色 / 关键约束 / 风险规避。',
      ].join('\n'),
    },
  ];
}

export function buildGenClawSketchMessages(params: {
  systemPrompt?: string;
  prompt: string;
  briefText: string;
  width: number;
  height: number;
}): LlmMessage[] {
  const width = Math.max(128, Math.min(4096, Math.round(Number(params.width) || 1024)));
  const height = Math.max(128, Math.min(4096, Math.round(Number(params.height) || 1024)));
  return [
    { role: 'system', content: compactLine(params.systemPrompt || GENCLAW_SKETCH_SYSTEM_PROMPT, GENCLAW_SKETCH_SYSTEM_PROMPT) },
    {
      role: 'user',
      content: [
        `请生成 ${width}x${height} 的白盒 SVG 草图。`,
        '只输出可渲染 SVG，不要解释，不要 Markdown，不要外链图片。',
        `用户目标: ${compactLine(params.prompt, '根据 brief 生成草图')}`,
        'Brief:',
        compactLine(params.briefText, '主题: 未命名视觉方案'),
      ].join('\n'),
    },
  ];
}
