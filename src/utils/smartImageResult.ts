export type SmartImageResultInfoInput = {
  url?: string;
  width?: number;
  height?: number;
  sourceLabel?: string;
  statusLabel?: string;
  prompt?: string;
};

export type SmartImageResultInfoRow = {
  label: string;
  value: string;
};

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function compactText(value: string, max = 120): string {
  const clean = cleanText(value).replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 3))}...` : clean;
}

function fileNameFromResultUrl(url: string): string {
  const clean = cleanText(url).split('#')[0]?.split('?')[0] || '';
  if (!clean) return '';
  try {
    const parsed = new URL(clean, 'http://t8.local');
    const pathname = parsed.pathname || '';
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
  } catch {
    return decodeURIComponent(clean.split('/').filter(Boolean).pop() || '');
  }
}

function resolutionLabel(width: unknown, height: unknown): string {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '';
  return `${Math.round(w)}×${Math.round(h)}`;
}

function aspectLabel(width: unknown, height: unknown): string {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '';
  return `${(w / h).toFixed(2)}:1`;
}

export function buildSmartImageResultInfo(input: SmartImageResultInfoInput): SmartImageResultInfoRow[] {
  const rows: SmartImageResultInfoRow[] = [];
  const size = resolutionLabel(input.width, input.height);
  const ratio = aspectLabel(input.width, input.height);
  const source = compactText(input.sourceLabel || '', 90);
  const status = compactText(input.statusLabel || '', 60);
  const filename = compactText(fileNameFromResultUrl(input.url || ''), 90);
  const prompt = compactText(input.prompt || '', 120);

  if (size) rows.push({ label: '尺寸', value: size });
  if (ratio) rows.push({ label: '比例', value: ratio });
  if (source) rows.push({ label: '来源', value: source });
  if (status) rows.push({ label: '状态', value: status });
  if (filename) rows.push({ label: '文件', value: filename });
  if (prompt) rows.push({ label: '提示词', value: prompt });

  return rows;
}
