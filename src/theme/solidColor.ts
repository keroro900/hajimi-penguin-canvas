import type { ThemeMode } from './types';

export const FOUNDATION_CANVAS_BY_MODE: Record<ThemeMode, string> = {
  dark: '#121214',
  light: '#faf7f1',
};

export type SolidRgbColor = {
  r: number;
  g: number;
  b: number;
};

function validChannel(value: string): number | null {
  const channel = Number(value);
  return Number.isInteger(channel) && channel >= 0 && channel <= 255 ? channel : null;
}

export function parseOpaqueSolidColor(value: string): SolidRgbColor | null {
  if (typeof value !== 'string') return null;

  const color = value.trim();
  const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(color);
  if (shortHex) {
    return {
      r: Number.parseInt(shortHex[1] + shortHex[1], 16),
      g: Number.parseInt(shortHex[2] + shortHex[2], 16),
      b: Number.parseInt(shortHex[3] + shortHex[3], 16),
    };
  }

  const longHex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (longHex) {
    return {
      r: Number.parseInt(longHex[1], 16),
      g: Number.parseInt(longHex[2], 16),
      b: Number.parseInt(longHex[3], 16),
    };
  }

  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color)
    || /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/i.exec(color);
  if (!rgb) return null;

  const channels = rgb.slice(1).map(validChannel);
  if (channels.some((channel) => channel === null)) return null;

  return { r: channels[0]!, g: channels[1]!, b: channels[2]! };
}

export function normalizeSolidCanvasColor(value: string, fallback: string): string {
  return parseOpaqueSolidColor(value) ? value : fallback;
}

export function relativeLuminance(colorString: string): number {
  const color = parseOpaqueSolidColor(colorString);
  if (!color) throw new TypeError(`Expected an opaque solid color, received: ${colorString}`);

  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

export function contrastRatio(a: string, b: string): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
