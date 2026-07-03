function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeClipCoverRequest(raw, duration = 0) {
  const mode = raw?.mode === 'local' ? 'local' : raw?.mode === 'none' ? 'none' : 'frame';
  const safeDuration = clampNumber(duration, 0, 24 * 60 * 60, 0);
  const time = Math.round(clampNumber(raw?.time, 0, Math.max(0, safeDuration - 0.04), 0) * 1000) / 1000;
  const url = typeof raw?.url === 'string' ? raw.url.trim().slice(0, 2000) : '';
  return { mode, time, url };
}

function buildClipCoverArgs(inputPath, outputPath, cover, duration = 0) {
  const safe = normalizeClipCoverRequest(cover, duration);
  return [
    '-y',
    '-hide_banner',
    '-ss',
    String(safe.time),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    outputPath,
  ];
}

module.exports = {
  buildClipCoverArgs,
  normalizeClipCoverRequest,
};
