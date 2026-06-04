export type PanoramaRatioId =
  | 'square'
  | 'portrait'
  | 'landscape'
  | 'portrait43'
  | 'landscape43'
  | 'story'
  | 'wide'
  | 'ultrawide'
  | 'ultratall'
  | 'custom';

export interface PanoramaRatio {
  w: number;
  h: number;
}

export const PANORAMA_RATIO_PRESETS: Record<Exclude<PanoramaRatioId, 'custom'>, PanoramaRatio> = {
  square: { w: 1, h: 1 },
  portrait: { w: 2, h: 3 },
  landscape: { w: 3, h: 2 },
  portrait43: { w: 3, h: 4 },
  landscape43: { w: 4, h: 3 },
  story: { w: 9, h: 16 },
  wide: { w: 16, h: 9 },
  ultrawide: { w: 21, h: 9 },
  ultratall: { w: 9, h: 21 },
};

export const PANORAMA_RATIO_OPTIONS: Array<{ id: PanoramaRatioId; label: string }> = [
  { id: 'square', label: '1:1' },
  { id: 'portrait', label: '2:3' },
  { id: 'landscape', label: '3:2' },
  { id: 'portrait43', label: '3:4' },
  { id: 'landscape43', label: '4:3' },
  { id: 'story', label: '9:16' },
  { id: 'wide', label: '16:9' },
  { id: 'ultrawide', label: '21:9' },
  { id: 'ultratall', label: '9:21' },
  { id: 'custom', label: '自定义' },
];

export type PanoramaGenerationMode = 'text' | 'image';
export type PanoramaPanelMode = 'preview' | PanoramaGenerationMode;
export type PanoramaSizeLevel = '1K' | '2K';

export interface PanoramaGenerationHistoryItem {
  url: string;
  mode: PanoramaGenerationMode;
  sizeLevel: PanoramaSizeLevel;
  prompt: string;
  promptFinal: string;
  referenceUrl?: string;
  createdAt: string;
}

export const PANORAMA_FIXED_PROMPT =
  '将参考图生成一个720度的全景VR图，左右边缘100%像素级无缝衔接，可无限循环拼接；上下极点（南北极）自然过渡，无明显断层或拉伸，场景一致性，以及场景的逻辑性，封闭场景需要有门。';

export const PANORAMA_SIZE_LEVELS: PanoramaSizeLevel[] = ['1K', '2K'];
export const PANORAMA_PROMPT_TEMPLATES = ['室内展厅', '科幻基地', '古风庭院', '自然峡谷', '游戏关卡', '产品展台'];

export function safePanoramaPanelMode(value: unknown): PanoramaPanelMode {
  return value === 'preview' || value === 'image' ? value : 'text';
}

export function safePanoramaGenerationMode(value: unknown): PanoramaGenerationMode {
  return value === 'image' ? 'image' : 'text';
}

export function safePanoramaSizeLevel(value: unknown): PanoramaSizeLevel {
  return value === '2K' ? '2K' : '1K';
}

export function buildPanoramaPromptFinal(userPrompt: unknown) {
  const extra = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  return extra ? `${PANORAMA_FIXED_PROMPT}\n${extra}` : PANORAMA_FIXED_PROMPT;
}

export function validatePanoramaGeneration(params: {
  mode: PanoramaGenerationMode;
  prompt?: unknown;
  referenceUrl?: unknown;
}) {
  const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  const referenceUrl = typeof params.referenceUrl === 'string' ? params.referenceUrl.trim() : '';
  if (params.mode === 'text' && !prompt) {
    return { ok: false as const, error: '文生全景需要填写场景提示词' };
  }
  if (params.mode === 'image' && !referenceUrl) {
    return { ok: false as const, error: '图生全景需要上游图片或节点内参考图' };
  }
  return { ok: true as const };
}

export function buildPanoramaImageRequest(params: {
  mode: PanoramaGenerationMode;
  prompt?: unknown;
  sizeLevel?: unknown;
  referenceUrl?: unknown;
}) {
  const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  const referenceUrl = typeof params.referenceUrl === 'string' ? params.referenceUrl.trim() : '';
  const sizeLevel = safePanoramaSizeLevel(params.sizeLevel);
  return {
    model: 'gpt-image-2',
    apiModel: 'gpt-image-2',
    paramKind: 'gpt-size' as const,
    prompt: buildPanoramaPromptFinal(prompt),
    aspectRatio: '21:9',
    aspect_ratio: '21:9',
    sizeLevel,
    image_size: sizeLevel,
    images: params.mode === 'image' && referenceUrl ? [referenceUrl] : [],
    n: 1,
  };
}

export function prependPanoramaHistory(
  current: unknown,
  item: PanoramaGenerationHistoryItem,
  maxItems = 3,
): PanoramaGenerationHistoryItem[] {
  const list = Array.isArray(current) ? current : [];
  return [
    item,
    ...list
      .filter((entry): entry is PanoramaGenerationHistoryItem => {
        return !!entry && typeof entry === 'object' && typeof (entry as any).url === 'string';
      })
      .filter((entry) => entry.url !== item.url),
  ].slice(0, Math.max(1, maxItems));
}

export function clampPanoramaNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function resolvePanoramaRatio(id: unknown, customW: unknown, customH: unknown): PanoramaRatio {
  const key = typeof id === 'string' ? id : 'wide';
  if (key !== 'custom' && Object.prototype.hasOwnProperty.call(PANORAMA_RATIO_PRESETS, key)) {
    return PANORAMA_RATIO_PRESETS[key as Exclude<PanoramaRatioId, 'custom'>];
  }
  return {
    w: clampPanoramaNumber(customW, 1, 999, 16),
    h: clampPanoramaNumber(customH, 1, 999, 9),
  };
}

export function panoramaRenderSize(ratio: PanoramaRatio, longSide = 1536) {
  const safeW = Math.max(1, Number(ratio.w) || 16);
  const safeH = Math.max(1, Number(ratio.h) || 9);
  const aspect = safeW / safeH;
  if (aspect >= 1) {
    return { width: longSide, height: Math.max(1, Math.round(longSide / aspect)) };
  }
  return { width: Math.max(1, Math.round(longSide * aspect)), height: longSide };
}

export function isLikelyPanoramaImage(meta: {
  url?: string;
  label?: string;
  title?: string;
  prompt?: string;
  width?: number;
  height?: number;
}) {
  const text = [meta.url, meta.label, meta.title, meta.prompt].filter(Boolean).join(' ');
  if (/(?:360|720|全景|环景|panorama|equirect|spherical|vr\b)/i.test(text)) return true;
  const w = Number(meta.width || 0);
  const h = Number(meta.height || 0);
  if (!(w > 0 && h > 0)) return false;
  const aspect = w / h;
  return aspect >= 1.9 && aspect <= 2.1;
}
