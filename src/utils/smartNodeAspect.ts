export type SmartMediaCardSize = {
  width: number;
  height: number;
  ratio: number;
};

const DEFAULT_RATIO = 16 / 9;
const LANDSCAPE_WIDTH = 380;
const BASE_SIDE = 300;
const MIN_HEIGHT = 170;
const MAX_HEIGHT = 720;

export function parseAspectRatio(value: unknown, fallback = DEFAULT_RATIO): number {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return fallback;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return fallback;
  return width / height;
}

export function resolveSmartMediaCardSize(value: unknown, preferredWidth?: unknown): SmartMediaCardSize {
  const ratio = parseAspectRatio(value);
  const isLandscape = ratio > 1.15;
  const baseWidth = isLandscape ? LANDSCAPE_WIDTH : BASE_SIDE;
  const requestedWidth = Number(preferredWidth);
  const maxWidthForRatio = Math.min(760, Math.floor(MAX_HEIGHT * ratio));
  const width = Number.isFinite(requestedWidth) && requestedWidth > 0
    ? Math.max(BASE_SIDE, Math.min(maxWidthForRatio, Math.round(requestedWidth)))
    : baseWidth;
  const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(width / ratio)));

  return { width, height, ratio };
}
