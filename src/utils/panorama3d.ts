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
