const {
  createCubeLutText,
  parseCubeLut,
} = require('../utils/lutCube');

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function roundSeconds(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function roundHundredths(value) {
  return Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
}

function audioTempoChain(value) {
  const filters = [];
  let remaining = clipSpeed(value);
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 0.000001) {
    filters.push(`atempo=${roundSeconds(remaining)}`);
  }
  return filters;
}

function cleanHexColor(value, fallback = '#000000') {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function normalizeFit(value) {
  return value === 'cover' || value === 'fill' ? value : 'contain';
}

function normalizeTransition(value) {
  return [
    'fade',
    'wipeleft',
    'wiperight',
    'slideleft',
    'slideright',
  ].includes(value) ? value : 'none';
}

function normalizeBlendMode(value) {
  return ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].includes(value) ? value : 'normal';
}

function normalizeLutId(value) {
  const text = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._-]{0,96}$/i.test(text) ? text : '';
}

function normalizeLutName(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 120) : undefined;
}

function normalizeLutText(value) {
  const text = String(value || '').trim();
  return /LUT_3D_SIZE/i.test(text) ? text.slice(0, 3_000_000) : undefined;
}

function normalizeLutAmount(value) {
  return roundSeconds(clampNumber(value, 0, 1, 1));
}

function normalizeColorHue(value) {
  if (value == null) return undefined;
  return Math.round(clampNumber(value, -180, 180, 0));
}

function normalizeColorPercent(value) {
  if (value == null) return undefined;
  return Math.round(clampNumber(value, 0, 200, 100));
}

function normalizeFilter(value) {
  return [
    'cinematic',
    'warm',
    'cool',
    'bw',
    'vivid',
    'fade',
    'color-teal-orange',
    'color-japanese-clean',
    'color-food',
    'color-night',
    'color-portrait-soft',
    'color-product-clean',
    'color-cyberpunk',
    'color-sunset',
    'color-documentary',
    'color-matte-film',
    'color-clean-bright',
    'color-moody-fall',
    'color-korean-soft',
    'color-blue-hour',
    'color-fashion-contrast',
    'color-vlog-natural',
    'color-anime-pop',
    'cssgram-clarendon',
    'cssgram-moon',
    'cssgram-lofi',
    'cssgram-aden',
    'cssgram-reyes',
    'cssgram-gingham',
    'cssgram-walden',
    'cssgram-hudson',
    'cssgram-inkwell',
    'cssgram-nashville',
    'ffmpeg-sharpen',
    'ffmpeg-denoise',
    'ffmpeg-vignette',
    'ffmpeg-film-grain',
    'ffmpeg-soft-glow',
    'ffmpeg-retro',
    'ffmpeg-sketch',
    'ffmpeg-scanlines',
    'ffmpeg-high-contrast-bw',
    'ffmpeg-dream-blur',
    'ffmpeg-vhs',
    'ffmpeg-comic',
    'ffmpeg-cctv',
    'ffmpeg-light-leak',
    'ffmpeg-neon-edge',
  ].includes(value) ? value : 'none';
}

function clipPercent(value, fallback) {
  return clampNumber(value, 0, 100, fallback);
}

function normalizeVisualTransform(raw) {
  const nested = raw?.transform && typeof raw.transform === 'object' ? raw.transform : {};
  const source = { ...raw, ...nested };
  const hasTransform = source.scale != null
    || source.x != null
    || source.y != null
    || source.rotation != null
    || source.opacity != null;
  if (!hasTransform) return undefined;
  return {
    scale: roundSeconds(clampNumber(source.scale, 0.1, 3, 1)),
    x: clipPercent(source.x, 50),
    y: clipPercent(source.y, 50),
    rotation: roundSeconds(clampNumber(source.rotation, -180, 180, 0)),
    opacity: roundSeconds(clampNumber(source.opacity, 0, 1, 1)),
  };
}

function normalizeVisualKeyframes(raw, duration) {
  const items = Array.isArray(raw?.keyframes) ? raw.keyframes : [];
  const safeDuration = roundSeconds(clampNumber(duration, 0.1, 24 * 60 * 60, 3));
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      time: roundSeconds(clampNumber(item.time, 0, safeDuration, 0)),
      scale: roundHundredths(clampNumber(item.scale, 10, 400, 100)),
      x: roundHundredths(clampNumber(item.x, -2000, 2000, 0)),
      y: roundHundredths(clampNumber(item.y, -2000, 2000, 0)),
      rotation: roundHundredths(clampNumber(item.rotation, -360, 360, 0)),
      opacity: roundHundredths(clampNumber(item.opacity, 0, 100, 100)),
    }))
    .sort((a, b) => a.time - b.time);
}

function ffmpegNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function linearTweenExpression(keyframes, pickValue, fallback) {
  const sorted = (Array.isArray(keyframes) ? keyframes : [])
    .filter((item) => item && Number.isFinite(Number(item.time)))
    .map((item) => ({ time: Math.max(0, Number(item.time)), value: Number(pickValue(item)) }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => a.time - b.time);
  if (sorted.length === 0) return ffmpegNumber(fallback);
  if (sorted.length === 1) return ffmpegNumber(sorted[0].value);
  const expression = sorted.slice(0, -1).reduceRight((tail, before, index) => {
    const after = sorted[index + 1];
    const start = ffmpegNumber(before.time);
    const end = ffmpegNumber(after.time);
    const span = ffmpegNumber(Math.max(0.001, after.time - before.time));
    const from = ffmpegNumber(before.value);
    const to = ffmpegNumber(after.value);
    return `if(between(t,${start},${end}),${from}+(${to}-${from})*((t-${start})/${span}),${tail})`;
  }, ffmpegNumber(sorted[sorted.length - 1].value));
  return `(${expression})`;
}

function filterIntensity(value, fallback = 65) {
  return Math.round(clampNumber(value, 0, 100, fallback));
}

function clipSpeed(value) {
  return roundSeconds(clampNumber(value, 0.25, 4, 1));
}

function transitionDuration(clip) {
  const duration = roundSeconds(clampNumber(clip?.duration, 0.1, 24 * 60 * 60, 3));
  return roundSeconds(clampNumber(clip?.transitionDuration, 0.1, Math.min(5, duration / 2), 0.5));
}

function escapeFilterPath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function blendedCubeText(rawText, amount, title) {
  const lut = parseCubeLut(rawText);
  const strength = normalizeLutAmount(amount);
  if (strength >= 0.999) {
    return rawText.trim();
  }
  const table = lut.table;
  const size = lut.size;
  return createCubeLutText(title || lut.title || 'Clip LUT', size, (r, g, b) => {
    const ri = Math.round(r * (size - 1));
    const gi = Math.round(g * (size - 1));
    const bi = Math.round(b * (size - 1));
    const sample = table[ri + gi * size + bi * size * size] || [r, g, b];
    return [
      r + (sample[0] - r) * strength,
      g + (sample[1] - g) * strength,
      b + (sample[2] - b) * strength,
    ];
  });
}

function visualLutChain(clip, index, options = {}) {
  const text = normalizeLutText(clip?.lutText);
  if (!text || typeof options.writeLutFile !== 'function') return '';
  const lutText = blendedCubeText(text, clip?.lutAmount, normalizeLutName(clip?.lutName) || normalizeLutId(clip?.lutPresetId) || 'Clip LUT');
  const filePath = options.writeLutFile(clip, index, lutText);
  if (!filePath) return '';
  return `lut3d=file='${escapeFilterPath(filePath)}':interp=tetrahedral`;
}

function visualBasicAdjustChain(clip) {
  const hue = normalizeColorHue(clip?.hue) ?? 0;
  const saturation = normalizeColorPercent(clip?.saturation) ?? 100;
  const brightness = normalizeColorPercent(clip?.brightness) ?? 100;
  const contrast = normalizeColorPercent(clip?.contrast) ?? 100;
  const filters = [];
  if (hue !== 0 || saturation !== 100) {
    filters.push(`hue=h=${roundSeconds(hue)}:s=${roundSeconds(saturation / 100)}`);
  }
  if (brightness !== 100 || contrast !== 100) {
    filters.push(`eq=contrast=${roundSeconds(contrast / 100)}:brightness=${roundSeconds((brightness - 100) / 100)}`);
  }
  return filters.join(',');
}

function visualFilterChain(clip) {
  const intensity = filterIntensity(clip?.intensity, 65) / 100;
  const preset = normalizeFilter(clip?.filter);
  if (preset === 'cinematic') {
    const contrast = 1 + 0.2 * intensity;
    const brightness = 0.05 * intensity;
    const saturation = 1 + 0.3 * intensity;
    return `eq=contrast=${roundSeconds(contrast)}:brightness=${roundSeconds(brightness)}:saturation=${roundSeconds(saturation)},curves=preset=medium_contrast`;
  }
  if (preset === 'warm') {
    return `eq=contrast=${roundSeconds(1 + 0.08 * intensity)}:brightness=${roundSeconds(0.02 * intensity)}:saturation=${roundSeconds(1 + 0.22 * intensity)},colorbalance=rs=${roundSeconds(0.12 * intensity)}:gs=${roundSeconds(0.03 * intensity)}:bs=${roundSeconds(-0.08 * intensity)}`;
  }
  if (preset === 'cool') {
    return `eq=contrast=${roundSeconds(1 + 0.06 * intensity)}:saturation=${roundSeconds(1 + 0.12 * intensity)},colorbalance=rs=${roundSeconds(-0.08 * intensity)}:gs=${roundSeconds(0.02 * intensity)}:bs=${roundSeconds(0.14 * intensity)}`;
  }
  if (preset === 'bw') {
    return `hue=s=0,eq=contrast=${roundSeconds(1 + 0.16 * intensity)}:brightness=${roundSeconds(0.02 * intensity)}`;
  }
  if (preset === 'vivid') {
    return `eq=contrast=${roundSeconds(1 + 0.16 * intensity)}:brightness=${roundSeconds(0.02 * intensity)}:saturation=${roundSeconds(1 + 0.45 * intensity)}`;
  }
  if (preset === 'fade') {
    return `eq=contrast=${roundSeconds(1 - 0.18 * intensity)}:brightness=${roundSeconds(0.04 * intensity)}:saturation=${roundSeconds(1 - 0.35 * intensity)}`;
  }
  if (preset === 'color-teal-orange') {
    return `eq=contrast=${roundSeconds(1 + 0.16 * intensity)}:saturation=${roundSeconds(1 + 0.18 * intensity)},colorbalance=rs=${roundSeconds(0.1 * intensity)}:gs=${roundSeconds(-0.05 * intensity)}:bs=${roundSeconds(-0.15 * intensity)}`;
  }
  if (preset === 'color-japanese-clean') {
    return `eq=contrast=${roundSeconds(1 - 0.08 * intensity)}:brightness=${roundSeconds(0.12 * intensity)}:saturation=${roundSeconds(1 - 0.08 * intensity)},colorbalance=rs=${roundSeconds(0.04 * intensity)}:bs=${roundSeconds(0.04 * intensity)}`;
  }
  if (preset === 'color-food') {
    return `eq=contrast=${roundSeconds(1 + 0.08 * intensity)}:brightness=${roundSeconds(0.08 * intensity)}:saturation=${roundSeconds(1 + 0.32 * intensity)},colorbalance=rs=${roundSeconds(0.08 * intensity)}:gs=${roundSeconds(0.04 * intensity)}:bs=${roundSeconds(-0.08 * intensity)}`;
  }
  if (preset === 'color-night') {
    return `eq=contrast=${roundSeconds(1 + 0.18 * intensity)}:brightness=${roundSeconds(-0.06 * intensity)}:saturation=${roundSeconds(1 + 0.28 * intensity)},colorbalance=rs=${roundSeconds(-0.08 * intensity)}:bs=${roundSeconds(0.14 * intensity)}`;
  }
  if (preset === 'color-portrait-soft') {
    return `eq=contrast=${roundSeconds(1 - 0.08 * intensity)}:brightness=${roundSeconds(0.08 * intensity)}:saturation=${roundSeconds(1 + 0.08 * intensity)},colorbalance=rs=${roundSeconds(0.05 * intensity)}:gs=${roundSeconds(0.02 * intensity)}:bs=${roundSeconds(-0.03 * intensity)}`;
  }
  if (preset === 'color-product-clean') {
    return `eq=contrast=${roundSeconds(1 + 0.12 * intensity)}:brightness=${roundSeconds(0.06 * intensity)}:saturation=${roundSeconds(1 - 0.04 * intensity)},curves=preset=lighter`;
  }
  if (preset === 'color-cyberpunk') {
    return `eq=contrast=${roundSeconds(1 + 0.22 * intensity)}:saturation=${roundSeconds(1 + 0.42 * intensity)},colorbalance=rs=${roundSeconds(-0.1 * intensity)}:gs=${roundSeconds(-0.04 * intensity)}:bs=${roundSeconds(0.22 * intensity)}`;
  }
  if (preset === 'color-sunset') {
    return `eq=contrast=${roundSeconds(1 + 0.1 * intensity)}:brightness=${roundSeconds(0.06 * intensity)}:saturation=${roundSeconds(1 + 0.24 * intensity)},colorbalance=rs=${roundSeconds(0.14 * intensity)}:gs=${roundSeconds(0.06 * intensity)}:bs=${roundSeconds(-0.12 * intensity)}`;
  }
  if (preset === 'color-documentary') {
    return `eq=contrast=${roundSeconds(1 + 0.14 * intensity)}:brightness=${roundSeconds(-0.02 * intensity)}:saturation=${roundSeconds(1 - 0.18 * intensity)},curves=preset=medium_contrast`;
  }
  if (preset === 'color-matte-film') {
    return `eq=contrast=${roundSeconds(1 - 0.12 * intensity)}:brightness=${roundSeconds(0.06 * intensity)}:saturation=${roundSeconds(1 - 0.12 * intensity)},colorbalance=rs=${roundSeconds(0.05 * intensity)}:bs=${roundSeconds(-0.04 * intensity)}`;
  }
  if (preset === 'color-clean-bright') {
    return `eq=contrast=${roundSeconds(1 + 0.06 * intensity)}:brightness=${roundSeconds(0.14 * intensity)}:saturation=${roundSeconds(1 + 0.08 * intensity)},curves=preset=lighter`;
  }
  if (preset === 'color-moody-fall') {
    return `eq=contrast=${roundSeconds(1 + 0.12 * intensity)}:brightness=${roundSeconds(-0.03 * intensity)}:saturation=${roundSeconds(1 - 0.1 * intensity)},colorbalance=rs=${roundSeconds(0.12 * intensity)}:gs=${roundSeconds(0.04 * intensity)}:bs=${roundSeconds(-0.1 * intensity)}`;
  }
  if (preset === 'color-korean-soft') {
    return `eq=contrast=${roundSeconds(1 - 0.1 * intensity)}:brightness=${roundSeconds(0.1 * intensity)}:saturation=${roundSeconds(1 + 0.04 * intensity)},colorbalance=rs=${roundSeconds(0.06 * intensity)}:bs=${roundSeconds(-0.02 * intensity)}`;
  }
  if (preset === 'color-blue-hour') {
    return `eq=contrast=${roundSeconds(1 + 0.12 * intensity)}:brightness=${roundSeconds(-0.04 * intensity)}:saturation=${roundSeconds(1 + 0.12 * intensity)},colorbalance=rs=${roundSeconds(-0.1 * intensity)}:gs=${roundSeconds(-0.02 * intensity)}:bs=${roundSeconds(0.18 * intensity)}`;
  }
  if (preset === 'color-fashion-contrast') {
    return `eq=contrast=${roundSeconds(1 + 0.28 * intensity)}:brightness=${roundSeconds(-0.02 * intensity)}:saturation=${roundSeconds(1 - 0.06 * intensity)},curves=preset=strong_contrast`;
  }
  if (preset === 'color-vlog-natural') {
    return `eq=contrast=${roundSeconds(1 + 0.05 * intensity)}:brightness=${roundSeconds(0.06 * intensity)}:saturation=${roundSeconds(1 + 0.12 * intensity)},colorbalance=rs=${roundSeconds(0.03 * intensity)}:bs=${roundSeconds(-0.02 * intensity)}`;
  }
  if (preset === 'color-anime-pop') {
    return `eq=contrast=${roundSeconds(1 + 0.18 * intensity)}:brightness=${roundSeconds(0.04 * intensity)}:saturation=${roundSeconds(1 + 0.58 * intensity)}`;
  }
  if (preset === 'cssgram-clarendon') {
    return `eq=contrast=${roundSeconds(1 + 0.2 * intensity)}:brightness=0:saturation=${roundSeconds(1 + 0.35 * intensity)},colorbalance=bs=${roundSeconds(0.04 * intensity)}`;
  }
  if (preset === 'cssgram-moon') {
    return `hue=s=${roundSeconds(1 - intensity)},eq=contrast=${roundSeconds(1 + 0.1 * intensity)}:brightness=${roundSeconds(0.1 * intensity)}`;
  }
  if (preset === 'cssgram-lofi') {
    return `eq=contrast=${roundSeconds(1 + 0.5 * intensity)}:saturation=${roundSeconds(1 + 0.1 * intensity)}`;
  }
  if (preset === 'cssgram-aden') {
    return `hue=h=${roundSeconds(-20 * intensity)}:s=${roundSeconds(1 - 0.15 * intensity)},eq=contrast=${roundSeconds(1 - 0.1 * intensity)}:brightness=${roundSeconds(0.2 * intensity)}`;
  }
  if (preset === 'cssgram-reyes') {
    return `colorbalance=rs=${roundSeconds(0.08 * intensity)}:gs=${roundSeconds(0.04 * intensity)}:bs=${roundSeconds(-0.04 * intensity)},eq=contrast=${roundSeconds(1 - 0.15 * intensity)}:brightness=${roundSeconds(0.1 * intensity)}:saturation=${roundSeconds(1 - 0.25 * intensity)}`;
  }
  if (preset === 'cssgram-gingham') {
    return `hue=h=${roundSeconds(-10 * intensity)},eq=brightness=${roundSeconds(0.05 * intensity)}`;
  }
  if (preset === 'cssgram-walden') {
    return `hue=h=${roundSeconds(-10 * intensity)}:s=${roundSeconds(1 + 0.6 * intensity)},eq=brightness=${roundSeconds(0.1 * intensity)},colorbalance=bs=${roundSeconds(0.08 * intensity)}`;
  }
  if (preset === 'cssgram-hudson') {
    return `eq=contrast=${roundSeconds(1 - 0.1 * intensity)}:brightness=${roundSeconds(0.2 * intensity)}:saturation=${roundSeconds(1 + 0.1 * intensity)},colorbalance=bs=${roundSeconds(0.05 * intensity)}`;
  }
  if (preset === 'cssgram-inkwell') {
    return `hue=s=${roundSeconds(1 - intensity)},eq=contrast=${roundSeconds(1 + 0.1 * intensity)}:brightness=${roundSeconds(0.1 * intensity)},colorbalance=rs=${roundSeconds(0.03 * intensity)}`;
  }
  if (preset === 'cssgram-nashville') {
    return `eq=contrast=${roundSeconds(1 + 0.2 * intensity)}:brightness=${roundSeconds(0.05 * intensity)}:saturation=${roundSeconds(1 + 0.2 * intensity)},colorbalance=rs=${roundSeconds(0.08 * intensity)}:bs=${roundSeconds(0.05 * intensity)}`;
  }
  if (preset === 'ffmpeg-sharpen') {
    return `unsharp=5:5:${roundSeconds(1.5 * intensity)}:3:3:${roundSeconds(0.5 * intensity)}`;
  }
  if (preset === 'ffmpeg-denoise') {
    return `hqdn3d=${roundSeconds(1.5 + 4.5 * intensity)}:${roundSeconds(1.5 + 3.5 * intensity)}:${roundSeconds(3 + 6 * intensity)}:${roundSeconds(3 + 6 * intensity)}`;
  }
  if (preset === 'ffmpeg-vignette') {
    return `vignette=angle=${roundSeconds(0.25 + 0.55 * intensity)}:mode=backward,eq=contrast=${roundSeconds(1 + 0.08 * intensity)}:brightness=${roundSeconds(-0.03 * intensity)}`;
  }
  if (preset === 'ffmpeg-film-grain') {
    return `noise=alls=${Math.round(20 * intensity)}:allf=t,eq=contrast=${roundSeconds(1 + 0.08 * intensity)}:saturation=${roundSeconds(1 - 0.08 * intensity)}`;
  }
  if (preset === 'ffmpeg-soft-glow') {
    return `gblur=sigma=${roundSeconds(0.2 + 1.4 * intensity)}:steps=1,eq=brightness=${roundSeconds(0.08 * intensity)}:contrast=${roundSeconds(1 - 0.1 * intensity)}:saturation=${roundSeconds(1 + 0.06 * intensity)}`;
  }
  if (preset === 'ffmpeg-retro') {
    return `curves=vintage,noise=alls=${Math.round(10 * intensity)}:allf=t,eq=contrast=${roundSeconds(1 + 0.12 * intensity)}:saturation=${roundSeconds(1 - 0.16 * intensity)}`;
  }
  if (preset === 'ffmpeg-sketch') {
    return `edgedetect=low=${roundSeconds(0.2 * intensity)}:high=${roundSeconds(0.8 * intensity)},format=gray,eq=contrast=${roundSeconds(1 + 0.35 * intensity)}`;
  }
  if (preset === 'ffmpeg-scanlines') {
    return `noise=alls=${Math.round(8 * intensity)}:allf=t,eq=contrast=${roundSeconds(1 + 0.2 * intensity)}:brightness=${roundSeconds(-0.04 * intensity)}`;
  }
  if (preset === 'ffmpeg-high-contrast-bw') {
    return `hue=s=0,eq=contrast=${roundSeconds(1 + 0.6 * intensity)}:brightness=${roundSeconds(-0.05 * intensity)}`;
  }
  if (preset === 'ffmpeg-dream-blur') {
    return `gblur=sigma=${roundSeconds(0.4 + 2.2 * intensity)}:steps=1,eq=brightness=${roundSeconds(0.12 * intensity)}:contrast=${roundSeconds(1 - 0.16 * intensity)}:saturation=${roundSeconds(1 + 0.12 * intensity)}`;
  }
  if (preset === 'ffmpeg-vhs') {
    return `noise=alls=${Math.round(12 * intensity)}:allf=t,eq=contrast=${roundSeconds(1 + 0.18 * intensity)}:saturation=${roundSeconds(1 - 0.18 * intensity)},colorbalance=rs=${roundSeconds(0.08 * intensity)}:bs=${roundSeconds(-0.08 * intensity)}`;
  }
  if (preset === 'ffmpeg-comic') {
    return `edgedetect=low=${roundSeconds(0.08 * intensity)}:high=${roundSeconds(0.45 + 0.25 * intensity)},eq=contrast=${roundSeconds(1 + 0.65 * intensity)}:saturation=${roundSeconds(1 + 0.18 * intensity)}`;
  }
  if (preset === 'ffmpeg-cctv') {
    return `hue=s=${roundSeconds(1 - 0.65 * intensity)},noise=alls=${Math.round(10 * intensity)}:allf=t,eq=contrast=${roundSeconds(1 + 0.18 * intensity)}:brightness=${roundSeconds(-0.08 * intensity)}`;
  }
  if (preset === 'ffmpeg-light-leak') {
    return `eq=brightness=${roundSeconds(0.18 * intensity)}:contrast=${roundSeconds(1 - 0.08 * intensity)}:saturation=${roundSeconds(1 + 0.16 * intensity)},colorbalance=rs=${roundSeconds(0.18 * intensity)}:gs=${roundSeconds(0.05 * intensity)}:bs=${roundSeconds(-0.12 * intensity)}`;
  }
  if (preset === 'ffmpeg-neon-edge') {
    return `edgedetect=low=${roundSeconds(0.05 * intensity)}:high=${roundSeconds(0.35 + 0.3 * intensity)},eq=contrast=${roundSeconds(1 + 0.36 * intensity)}:saturation=${roundSeconds(1 + 0.44 * intensity)},colorbalance=bs=${roundSeconds(0.16 * intensity)}`;
  }
  return '';
}

function visualFadeChain(clip) {
  const duration = roundSeconds(clampNumber(clip?.duration, 0.1, 24 * 60 * 60, 3));
  const fadeIn = roundSeconds(clampNumber(clip?.fadeIn, 0, duration / 2, 0));
  const fadeOut = roundSeconds(clampNumber(clip?.fadeOut, 0, duration / 2, 0));
  const filters = [];
  if (fadeIn > 0) filters.push(`fade=t=in:st=0:d=${fadeIn}`);
  if (fadeOut > 0) filters.push(`fade=t=out:st=${roundSeconds(Math.max(0, duration - fadeOut))}:d=${fadeOut}`);
  return filters.join(',');
}

function escapeDrawtextText(value) {
  return String(value || '')
    .slice(0, 500)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n/g, '\\n');
}

function normalizeClip(raw, trackKind, index) {
  const kind = raw?.kind === 'video' || raw?.kind === 'audio' || raw?.kind === 'text' ? raw.kind : 'image';
  const sourceUrl = String(raw?.sourceUrl || raw?.url || '').trim();
  const text = String(raw?.text || '').trim();
  if (kind !== 'text' && !sourceUrl) return null;
  if (kind === 'text' && !text) return null;
  const duration = roundSeconds(clampNumber(raw?.duration, 0.1, 24 * 60 * 60, trackKind === 'visual' ? 3 : 1));
  return {
    id: String(raw?.id || `${trackKind}-${index}`),
    kind,
    sourceUrl: kind === 'text' ? undefined : sourceUrl,
    text: kind === 'text' ? text : undefined,
    label: typeof raw?.label === 'string' ? raw.label : undefined,
    start: roundSeconds(clampNumber(raw?.start, 0, 24 * 60 * 60, 0)),
    duration,
    trimStart: raw?.trimStart == null ? undefined : roundSeconds(clampNumber(raw.trimStart, 0, 24 * 60 * 60, 0)),
    trimEnd: raw?.trimEnd == null ? undefined : roundSeconds(clampNumber(raw.trimEnd, 0, 24 * 60 * 60, 0)),
    volume: raw?.volume == null ? undefined : clampNumber(raw.volume, 0, 4, 1),
    fadeIn: raw?.fadeIn == null ? undefined : roundSeconds(clampNumber(raw.fadeIn, 0, duration, 0)),
    fadeOut: raw?.fadeOut == null ? undefined : roundSeconds(clampNumber(raw.fadeOut, 0, duration, 0)),
    fontSize: raw?.fontSize == null ? undefined : Math.round(clampNumber(raw.fontSize, 8, 240, 42)),
    color: raw?.color == null ? undefined : cleanHexColor(raw.color, '#ffffff'),
    x: raw?.x == null ? undefined : clipPercent(raw.x, 50),
    y: raw?.y == null ? undefined : clipPercent(raw.y, 88),
    fit: normalizeFit(raw?.fit),
    filter: normalizeFilter(raw?.filter),
    intensity: filterIntensity(raw?.intensity, 65),
    hue: normalizeColorHue(raw?.hue),
    saturation: normalizeColorPercent(raw?.saturation),
    brightness: normalizeColorPercent(raw?.brightness),
    contrast: normalizeColorPercent(raw?.contrast),
    lutPresetId: normalizeLutId(raw?.lutPresetId),
    lutName: normalizeLutName(raw?.lutName),
    lutText: normalizeLutText(raw?.lutText),
    lutAmount: normalizeLutAmount(raw?.lutAmount),
    speed: clipSpeed(raw?.speed),
    transition: normalizeTransition(raw?.transition),
    transitionDuration: transitionDuration(raw),
    blendMode: normalizeBlendMode(raw?.blendMode),
    transform: trackKind === 'visual' ? normalizeVisualTransform(raw) : undefined,
    keyframes: trackKind === 'visual' ? normalizeVisualKeyframes(raw, duration) : undefined,
  };
}

function normalizeTrack(raw, index) {
  const kind = raw?.kind === 'audio' || raw?.kind === 'text' ? raw.kind : 'visual';
  const clips = Array.isArray(raw?.clips)
    ? raw.clips.map((clip, clipIndex) => normalizeClip(clip, kind, clipIndex)).filter(Boolean)
    : [];
  return {
    id: String(raw?.id || `${kind}-${index}`),
    kind,
    clips: clips.filter((clip) => {
      if (kind === 'visual') return clip.kind === 'image' || clip.kind === 'video';
      return clip.kind === kind;
    }),
  };
}

function clipProjectDuration(project) {
  let max = 0;
  for (const track of project.tracks || []) {
    for (const clip of track.clips || []) {
      max = Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0));
    }
  }
  return roundSeconds(max);
}

function visualConcatFilter(visualClips, textClips) {
  const output = textClips.length > 0 ? '[vbase]' : '[vout]';
  const totalDuration = visualClips.reduce((total, clip, index) => {
    const next = roundSeconds(total + Number(clip.duration || 0));
    if (index === 0) return next;
    const previous = visualClips[index - 1];
    return normalizeTransition(previous.transition) === 'none'
      ? next
      : roundSeconds(next - transitionDuration(previous));
  }, 0);
  const transitions = visualClips.slice(0, -1).map((clip) => normalizeTransition(clip.transition));
  if (!transitions.some((transition) => transition !== 'none')) {
    const labels = visualClips.map((_, index) => `[v${index}]`).join('');
    return {
      filters: [`${labels}concat=n=${visualClips.length}:v=1:a=0${output}`],
      output,
      duration: totalDuration,
    };
  }

  const filters = [];
  let previousLabel = '[v0]';
  let elapsed = roundSeconds(Number(visualClips[0]?.duration || 0));
  for (let index = 1; index < visualClips.length; index += 1) {
    const previousClip = visualClips[index - 1];
    const transition = normalizeTransition(previousClip.transition);
    const currentLabel = `[v${index}]`;
    const nextLabel = index === visualClips.length - 1 ? output : `[vx${index}]`;
    if (transition === 'none') {
      filters.push(`${previousLabel}${currentLabel}concat=n=2:v=1:a=0${nextLabel}`);
      elapsed = roundSeconds(elapsed + Number(visualClips[index]?.duration || 0));
    } else {
      const duration = transitionDuration(previousClip);
      const offset = roundSeconds(Math.max(0, elapsed - duration));
      filters.push(`${previousLabel}${currentLabel}xfade=transition=${transition}:duration=${duration}:offset=${offset}${nextLabel}`);
      elapsed = roundSeconds(elapsed + Number(visualClips[index]?.duration || 0) - duration);
    }
    previousLabel = nextLabel;
  }
  return { filters, output, duration: totalDuration };
}

function normalizeClipProject(raw) {
  const tracks = Array.isArray(raw?.tracks)
    ? raw.tracks.map(normalizeTrack)
    : [];
  const project = {
    version: 1,
    title: typeof raw?.title === 'string' ? raw.title.trim().slice(0, 80) : '',
    width: Math.round(clampNumber(raw?.width, 240, 3840, 1280)),
    height: Math.round(clampNumber(raw?.height, 240, 3840, 720)),
    fps: Math.round(clampNumber(raw?.fps, 12, 60, 30)),
    background: cleanHexColor(raw?.background),
    tracks,
  };
  const visualCount = tracks.reduce((sum, track) => (
    track.kind === 'visual' ? sum + track.clips.length : sum
  ), 0);
  if (visualCount < 1) throw new Error('至少需要 1 个图片或视频片段');
  return project;
}

function createClipRenderPlan(project, options = {}) {
  const visualClips = [];
  const audioClips = [];
  const textClips = [];
  const inputRefs = [];
  for (const track of project.tracks || []) {
    for (const clip of track.clips || []) {
      if (track.kind === 'visual') {
        visualClips.push(clip);
        inputRefs.push({
          kind: clip.kind,
          url: clip.sourceUrl,
          clipId: clip.id,
          inputDuration: clip.kind === 'image' ? roundSeconds(Number(clip.duration || 0) * clipSpeed(clip.speed)) : undefined,
        });
      } else if (track.kind === 'audio') {
        audioClips.push(clip);
        inputRefs.push({ kind: 'audio', url: clip.sourceUrl, clipId: clip.id });
      } else if (track.kind === 'text') {
        textClips.push(clip);
      }
    }
  }
  const visualFilters = visualClips.map((clip, index) => {
    const padColor = String(project.background || '#000000').replace(/^#/, '0x');
    const scale = clip.fit === 'cover'
      ? `scale=${project.width}:${project.height}:force_original_aspect_ratio=increase,crop=${project.width}:${project.height}`
      : clip.fit === 'fill'
        ? `scale=${project.width}:${project.height}`
        : `scale=${project.width}:${project.height}:force_original_aspect_ratio=decrease,pad=${project.width}:${project.height}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`;
    const visualFilter = visualFilterChain(clip);
    const visualLut = visualLutChain(clip, index, options);
    const visualBasicAdjust = visualBasicAdjustChain(clip);
    const visualFade = visualFadeChain(clip);
    const speed = clipSpeed(clip.speed);
    const sourceDuration = roundSeconds(Number(clip.duration || 0) * speed);
    const setpts = speed === 1 ? 'setpts=PTS-STARTPTS' : `setpts=${roundSeconds(1 / speed)}*(PTS-STARTPTS)`;
    const sourceFilters = [scale, visualFilter, visualLut, visualBasicAdjust, `setsar=1`, `fps=${project.fps}`, `trim=duration=${sourceDuration}`, setpts, visualFade];
    const keyframes = Array.isArray(clip.keyframes) ? clip.keyframes : [];
    const transform = clip.transform;
    const blendMode = normalizeBlendMode(clip.blendMode);
    const hasKeyframes = keyframes.length > 0;
    const hasTransform = !!transform || hasKeyframes;
    if (!hasTransform && blendMode === 'normal') {
      return `[${index}:v]${sourceFilters.filter(Boolean).join(',')}[v${index}]`;
    }
    const blendLabel = `[vb${index}]`;
    const transformedLabel = `[vt${index}]`;
    const positionBackgroundLabel = `[vposbg${index}]`;
    const backgroundLabel = `[vbg${index}]`;
    const scaleFactor = hasKeyframes
      ? linearTweenExpression(keyframes, (frame) => clampNumber(frame.scale, 10, 400, 100) / 100, 1)
      : hasTransform ? roundSeconds(clampNumber(transform.scale, 0.1, 3, 1)) : 1;
    const rotationRadians = hasKeyframes
      ? linearTweenExpression(keyframes, (frame) => clampNumber(frame.rotation, -360, 360, 0) * Math.PI / 180, 0)
      : hasTransform ? roundSeconds(clampNumber(transform.rotation, -180, 180, 0) * Math.PI / 180) : 0;
    const opacity = hasKeyframes
      ? linearTweenExpression(keyframes, (frame) => clampNumber(frame.opacity, 0, 100, 100) / 100, 1)
      : hasTransform ? roundSeconds(clampNumber(transform.opacity, 0, 1, 1)) : 1;
    const x = hasKeyframes
      ? linearTweenExpression(keyframes, (frame) => clampNumber(frame.x, -2000, 2000, 0) / 100, 0.5)
      : hasTransform ? roundSeconds(clipPercent(transform.x, 50) / 100) : 0.5;
    const y = hasKeyframes
      ? linearTweenExpression(keyframes, (frame) => clampNumber(frame.y, -2000, 2000, 0) / 100, 0.5)
      : hasTransform ? roundSeconds(clipPercent(transform.y, 50) / 100) : 0.5;
    const transformFilters = [
      'format=rgba',
      !hasKeyframes && scaleFactor === 1 ? '' : `scale=ceil(iw*${scaleFactor}/2)*2:ceil(ih*${scaleFactor}/2)*2`,
      !hasKeyframes && rotationRadians === 0 ? '' : `rotate=${rotationRadians}:c=none:ow=rotw(iw):oh=roth(ih)`,
      !hasKeyframes && opacity === 1 ? '' : `colorchannelmixer=aa=${opacity}`,
    ];
    const transformed = `[${index}:v]${[...sourceFilters, ...transformFilters].filter(Boolean).join(',')}${transformedLabel}`;
    const positionCanvas = `color=c=black@0:s=${project.width}x${project.height}:d=${sourceDuration},format=rgba${positionBackgroundLabel}`;
    const positionOverlay = `${positionBackgroundLabel}${transformedLabel}overlay=x=(W-w)*${x}:y=(H-h)*${y}:format=auto:shortest=1${blendLabel}`;
    const background = `color=c=${padColor}@1:s=${project.width}x${project.height}:d=${sourceDuration},format=rgba${backgroundLabel}`;
    const blended = blendMode === 'normal'
      ? `${backgroundLabel}${blendLabel}overlay=x=0:y=0:format=auto:shortest=1[v${index}]`
      : `${backgroundLabel}${blendLabel}blend=all_mode=${blendMode}:all_opacity=1:shortest=1[v${index}]`;
    return `${transformed};${positionCanvas};${positionOverlay};${background};${blended}`;
  });
  const visualConcat = visualConcatFilter(visualClips, textClips);
  const textFilters = textClips.map((clip, index) => {
    const inputLabel = index === 0 ? '[vbase]' : `[vt${index - 1}]`;
    const outputLabel = index === textClips.length - 1 ? '[vout]' : `[vt${index}]`;
    const start = roundSeconds(Number(clip.start || 0));
    const end = roundSeconds(start + Number(clip.duration || 0));
    const fontColor = String(cleanHexColor(clip.color, '#ffffff')).replace(/^#/, '0x');
    const fontSize = Math.round(clampNumber(clip.fontSize, 8, 240, 42));
    const textX = Math.round(clipPercent(clip.x, 50)) / 100;
    const textY = Math.round(clipPercent(clip.y, 88)) / 100;
    return `${inputLabel}drawtext=text='${escapeDrawtextText(clip.text)}':fontcolor=${fontColor}:fontsize=${fontSize}:x=(w-text_w)*${textX}:y=(h-text_h)*${textY}:box=1:boxcolor=black@0.45:boxborderw=12:enable='between(t,${start},${end})'${outputLabel}`;
  });
  const audioOffset = visualClips.length;
  const audioFilters = audioClips.map((clip, index) => {
    const inputIndex = audioOffset + index;
    const delayMs = Math.max(0, Math.round(Number(clip.start || 0) * 1000));
    const volume = Number.isFinite(Number(clip.volume)) ? Number(clip.volume) : 1;
    const trimStart = roundSeconds(clampNumber(clip.trimStart, 0, 24 * 60 * 60, 0));
    const speed = clipSpeed(clip.speed);
    const sourceSpan = roundSeconds(Number(clip.duration || 0) * speed);
    const trimEnd = roundSeconds(trimStart + sourceSpan);
    const trimFilter = trimStart > 0 ? `atrim=start=${trimStart}:end=${trimEnd}` : `atrim=0:${sourceSpan}`;
    const filters = [trimFilter, 'asetpts=PTS-STARTPTS', ...audioTempoChain(speed), `volume=${volume}`];
    if (Number(clip.fadeIn) > 0) {
      filters.push(`afade=t=in:st=0:d=${clip.fadeIn}`);
    }
    if (Number(clip.fadeOut) > 0) {
      const fadeOutStart = roundSeconds(Math.max(0, Number(clip.duration || 0) - Number(clip.fadeOut || 0)));
      filters.push(`afade=t=out:st=${fadeOutStart}:d=${clip.fadeOut}`);
    }
    filters.push(`adelay=${delayMs}|${delayMs}`);
    return `[${inputIndex}:a]${filters.join(',')}[a${index + 1}]`;
  });
  const trackDuration = clipProjectDuration(project);
  const duration = roundSeconds(Math.max(trackDuration, visualConcat.duration || 0));
  const silent = `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${duration}[a0]`;
  const audioMix = audioClips.length === 0
    ? '[a0]anull[aout]'
    : `${['[a0]', ...audioClips.map((_, index) => `[a${index + 1}]`)].join('')}amix=inputs=${audioClips.length + 1}:duration=first:dropout_transition=0[aout]`;
  const filterComplex = [
    ...visualFilters,
    ...visualConcat.filters,
    ...textFilters,
    silent,
    ...audioFilters,
    audioMix,
  ].join(';');
  return { duration, visualClips, audioClips, textClips, inputRefs, filterComplex };
}

module.exports = {
  clipProjectDuration,
  createClipRenderPlan,
  normalizeClipProject,
};
