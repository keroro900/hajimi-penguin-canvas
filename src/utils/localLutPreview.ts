import type { LutCurveMap, LutCurvePoint } from '../services/imageOps';

type LutHslRange = 'master' | 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta';
type LutCurve = 'linear' | 'soft-contrast' | 'matte' | 'film-fade' | 'deep-shadow';

export interface LocalLutPreviewOptions {
  lutText: string;
  lutEnabled?: boolean;
  adjustEnabled?: boolean;
  amount?: number;
  hslHue?: number;
  hslSaturation?: number;
  hslLightness?: number;
  hslRange?: LutHslRange;
  hslColorize?: boolean;
  brightness?: number;
  contrast?: number;
  curve?: LutCurve;
  curveAmount?: number;
  curves?: LutCurveMap;
  maxSize?: number;
  signal?: AbortSignal;
}

interface CubeLut {
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  table: Array<[number, number, number]>;
}

const DEFAULT_CURVE: LutCurvePoint[] = [[0, 0], [255, 255]];
const HSL_COLOR_RANGES: Record<LutHslRange, number | null> = {
  master: null,
  red: 0,
  yellow: 60,
  green: 120,
  cyan: 180,
  blue: 240,
  magenta: 300,
};

const lutCache = new Map<string, CubeLut>();

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function normalizeHue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

function normalizeHslRange(value: unknown): LutHslRange {
  const key = String(value || 'master').toLowerCase() as LutHslRange;
  return Object.prototype.hasOwnProperty.call(HSL_COLOR_RANGES, key) ? key : 'master';
}

function stripComment(line: string) {
  const index = line.indexOf('#');
  return (index >= 0 ? line.slice(0, index) : line).trim();
}

function parseNumberTriplet(parts: string[]): [number, number, number] {
  const values = parts.slice(0, 3).map((part) => Number(part));
  if (values.length < 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('LUT 数据包含无效数值');
  }
  return values as [number, number, number];
}

function parseCubeLut(text: string): CubeLut {
  const cached = lutCache.get(text);
  if (cached) return cached;
  if (typeof text !== 'string' || !text.trim()) throw new Error('LUT 内容为空');

  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const table: Array<[number, number, number]> = [];

  for (const line of text.split(/\r?\n/)) {
    const clean = stripComment(line);
    if (!clean) continue;
    const parts = clean.split(/\s+/);
    const keyword = parts[0].toUpperCase();
    if (keyword === 'TITLE' || keyword === 'LUT_1D_SIZE') continue;
    if (keyword === 'LUT_3D_SIZE') {
      size = Number.parseInt(parts[1], 10);
      if (!Number.isInteger(size) || size < 2 || size > 128) throw new Error('LUT_3D_SIZE 范围必须在 2-128');
      continue;
    }
    if (keyword === 'DOMAIN_MIN') {
      domainMin = parseNumberTriplet(parts.slice(1));
      continue;
    }
    if (keyword === 'DOMAIN_MAX') {
      domainMax = parseNumberTriplet(parts.slice(1));
      continue;
    }
    if (/^[A-Z_]+$/i.test(parts[0])) continue;
    table.push(parseNumberTriplet(parts));
  }

  const expected = size * size * size;
  if (!size || table.length !== expected) throw new Error('LUT 数据数量不匹配');
  const lut = { size, domainMin, domainMax, table };
  lutCache.set(text, lut);
  if (lutCache.size > 6) {
    const oldestKey = lutCache.keys().next().value;
    if (oldestKey) lutCache.delete(oldestKey);
  }
  return lut;
}

function tableIndex(size: number, ri: number, gi: number, bi: number) {
  return ri + gi * size + bi * size * size;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sampleCubeLut(lut: CubeLut, r: number, g: number, b: number): [number, number, number] {
  const input = [r, g, b].map((value, index) => (
    clamp01((value - lut.domainMin[index]) / (lut.domainMax[index] - lut.domainMin[index]))
  ));
  const scaled = input.map((value) => value * (lut.size - 1));
  const low = scaled.map((value) => Math.floor(value));
  const high = low.map((value) => Math.min(lut.size - 1, value + 1));
  const frac = scaled.map((value, index) => value - low[index]);
  const out: [number, number, number] = [0, 0, 0];

  for (let bz = 0; bz <= 1; bz += 1) {
    const bi = bz ? high[2] : low[2];
    const bw = bz ? frac[2] : 1 - frac[2];
    for (let gy = 0; gy <= 1; gy += 1) {
      const gi = gy ? high[1] : low[1];
      const gw = gy ? frac[1] : 1 - frac[1];
      for (let rx = 0; rx <= 1; rx += 1) {
        const ri = rx ? high[0] : low[0];
        const rw = rx ? frac[0] : 1 - frac[0];
        const sample = lut.table[tableIndex(lut.size, ri, gi, bi)];
        const weight = rw * gw * bw;
        out[0] += sample[0] * weight;
        out[1] += sample[1] * weight;
        out[2] += sample[2] * weight;
      }
    }
  }
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
}

function applyLocalCubeLut(data: Uint8ClampedArray, lut: CubeLut, amount: number) {
  const strength = clamp01(amount);
  if (strength <= 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const sampled = sampleCubeLut(lut, r, g, b);
    data[i] = toByte(lerp(r, sampled[0], strength));
    data[i + 1] = toByte(lerp(g, sampled[1], strength));
    data[i + 2] = toByte(lerp(b, sampled[2], strength));
  }
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(normalizeHue(a) - normalizeHue(b)) % 360;
  return Math.min(d, 360 - d);
}

function hslRangeWeight(hue: number, range: LutHslRange) {
  if (range === 'master') return 1;
  const center = HSL_COLOR_RANGES[range];
  if (center == null) return 1;
  const dist = hueDistance(hue, center);
  if (dist <= 30) return 1;
  if (dist >= 50) return 0;
  return 1 - ((dist - 30) / 20);
}

function rgbToHsl(r8: number, g8: number, b8: number): [number, number, number] {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number) {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = normalizeHue(h) / 360;
  const sat = clamp01(s);
  const light = clamp01(l);
  if (sat === 0) {
    const v = Math.round(light * 255);
    return [v, v, v];
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  return [
    Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hue) * 255),
    Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  ];
}

function adjustSignedChannel(value: number, delta: number) {
  const d = Math.max(-1, Math.min(1, delta));
  return d >= 0 ? value + (1 - value) * d : value * (1 + d);
}

function applyLocalHslAdjustments(data: Uint8ClampedArray, options: LocalLutPreviewOptions) {
  const hue = clampNumber(options.hslHue, -180, 180, 0);
  const saturation = clampNumber(options.hslSaturation, -100, 100, 0);
  const lightness = clampNumber(options.hslLightness, -100, 100, 0);
  const range = normalizeHslRange(options.hslRange);
  const colorize = Boolean(options.hslColorize);
  if (!colorize && hue === 0 && saturation === 0 && lightness === 0) return;

  const satDelta = saturation / 100;
  const lightDelta = lightness / 100;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const original = [data[i], data[i + 1], data[i + 2]];
    let [h, s, l] = rgbToHsl(original[0], original[1], original[2]);
    const weight = hslRangeWeight(h, range);
    if (weight <= 0) continue;
    if (colorize) {
      h = normalizeHue(hue);
      s = clamp01(0.5 + satDelta / 2);
    } else {
      h = normalizeHue(h + hue);
      s = adjustSignedChannel(s, satDelta);
    }
    l = adjustSignedChannel(l, lightDelta);
    const [r, g, b] = hslToRgb(h, s, l);
    data[i] = Math.round(original[0] + (r - original[0]) * weight);
    data[i + 1] = Math.round(original[1] + (g - original[1]) * weight);
    data[i + 2] = Math.round(original[2] + (b - original[2]) * weight);
  }
}

function normalizeCurvePoints(points?: LutCurvePoint[]): LutCurvePoint[] {
  if (!Array.isArray(points)) return DEFAULT_CURVE;
  const parsed = points.map((point) => [
    Math.round(clampNumber(Array.isArray(point) ? point[0] : 0, 0, 255, 0)),
    Math.round(clampNumber(Array.isArray(point) ? point[1] : 0, 0, 255, 0)),
  ] as LutCurvePoint);
  parsed.push([0, 0], [255, 255]);
  const byX = new Map<number, number>();
  parsed.forEach(([x, y]) => byX.set(x, y));
  return [...byX.entries()].sort((a, b) => a[0] - b[0]) as LutCurvePoint[];
}

function isIdentityCurve(points: LutCurvePoint[]) {
  return points.length === 2 && points[0][0] === 0 && points[0][1] === 0 && points[1][0] === 255 && points[1][1] === 255;
}

function buildCurveLut(points?: LutCurvePoint[]) {
  const normalized = normalizeCurvePoints(points);
  const lut = new Uint8Array(256);
  let segment = 0;
  for (let x = 0; x < 256; x += 1) {
    while (segment < normalized.length - 2 && x > normalized[segment + 1][0]) segment += 1;
    const [x0, y0] = normalized[segment];
    const [x1, y1] = normalized[Math.min(segment + 1, normalized.length - 1)];
    const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
    lut[x] = Math.round(clampNumber(y0 + (y1 - y0) * t, 0, 255, x));
  }
  return lut;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function applyCurveChannel(value: number, curve: LutCurve) {
  if (curve === 'soft-contrast') return smoothstep(0, 1, value);
  if (curve === 'matte') return 0.08 + value * 0.86;
  if (curve === 'film-fade') return Math.pow(value, 0.86) * 0.94 + 0.035;
  if (curve === 'deep-shadow') return Math.pow(value, 1.18);
  return value;
}

function applyLocalToneAdjustments(data: Uint8ClampedArray, options: LocalLutPreviewOptions) {
  const brightness = clampNumber(options.brightness, -100, 100, 0) / 100;
  const contrast = clampNumber(options.contrast, -100, 100, 0) / 100;
  const curve = (['linear', 'soft-contrast', 'matte', 'film-fade', 'deep-shadow'].includes(String(options.curve))
    ? options.curve
    : 'linear') as LutCurve;
  const curveMix = clampNumber(options.curveAmount, 0, 100, 100) / 100;
  const curves = options.curves || {};
  const normalizedCurves = {
    rgb: normalizeCurvePoints(curves.rgb),
    r: normalizeCurvePoints(curves.r),
    g: normalizeCurvePoints(curves.g),
    b: normalizeCurvePoints(curves.b),
  };
  const hasCustomCurves = !isIdentityCurve(normalizedCurves.rgb)
    || !isIdentityCurve(normalizedCurves.r)
    || !isIdentityCurve(normalizedCurves.g)
    || !isIdentityCurve(normalizedCurves.b);
  if (brightness === 0 && contrast === 0 && (curve === 'linear' || curveMix === 0) && !hasCustomCurves) return;

  const rgbCurve = buildCurveLut(normalizedCurves.rgb);
  const channelCurves = [
    buildCurveLut(normalizedCurves.r),
    buildCurveLut(normalizedCurves.g),
    buildCurveLut(normalizedCurves.b),
  ];

  // Formula adapted from evanw/glfx.js brightnessContrast and curves filters (MIT).
  // Source project: https://github.com/evanw/glfx.js
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      let v = data[i + c] / 255;
      v = clamp01(v + brightness);
      if (contrast > 0) v = (v - 0.5) / Math.max(0.001, 1 - contrast) + 0.5;
      else if (contrast < 0) v = (v - 0.5) * (1 + contrast) + 0.5;
      v = clamp01(v);
      if (curve !== 'linear' && curveMix > 0) {
        const curved = clamp01(applyCurveChannel(v, curve));
        v += (curved - v) * curveMix;
      }
      let byte = Math.round(clamp01(v) * 255);
      if (hasCustomCurves) byte = channelCurves[c][rgbCurve[byte]];
      data[i + c] = byte;
    }
  }
}

function loadImage(url: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('本地实时预览加载图片失败'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    img.src = url;
  });
}

export async function renderLocalLutPreview(imageUrl: string, options: LocalLutPreviewOptions): Promise<string> {
  if (!imageUrl) return '';
  const img = await loadImage(imageUrl, options.signal);
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  if (!sourceWidth || !sourceHeight) return '';
  const maxSize = clampNumber(options.maxSize, 320, 1800, 960);
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  if (options.lutEnabled !== false && options.lutText) {
    applyLocalCubeLut(data, parseCubeLut(options.lutText), Number(options.amount ?? 1));
  }
  if (options.adjustEnabled !== false) {
    applyLocalHslAdjustments(data, options);
    applyLocalToneAdjustments(data, options);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
