export function resolveVideoDisplaySize(
  width: unknown,
  height: unknown,
  rotation: unknown,
): { width: number; height: number; ratio: string } | null {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const normalizedRotation = ((Number(rotation) % 360) + 360) % 360;
  const swap = Math.abs(normalizedRotation - 90) < 1 || Math.abs(normalizedRotation - 270) < 1;
  const displayWidth = Math.round(swap ? h : w);
  const displayHeight = Math.round(swap ? w : h);
  return { width: displayWidth, height: displayHeight, ratio: `${displayWidth}:${displayHeight}` };
}
