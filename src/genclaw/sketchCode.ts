import type { GenClawSketch, GenClawSketchKind } from './types.ts';

const FENCE_RE = /```(?:\s*(svg|html|xml))?\s*\n([\s\S]*?)```/i;

function detectKind(code: string, hinted?: string): GenClawSketchKind {
  const hint = String(hinted || '').toLowerCase();
  if (hint === 'svg') return 'svg';
  if (hint === 'html') return 'html';
  const trimmed = code.trim();
  if (/^<svg[\s>]/i.test(trimmed)) return 'svg';
  return 'html';
}

export function extractSketchCode(input: string): GenClawSketch {
  const text = String(input || '').trim();
  const fenced = FENCE_RE.exec(text);
  if (fenced) {
    const kind = detectKind(fenced[2], fenced[1]);
    return sanitizeSketchCode(fenced[2], kind);
  }
  const svgStart = text.search(/<svg[\s>]/i);
  const svgEnd = text.search(/<\/svg>/i);
  if (svgStart >= 0 && svgEnd > svgStart) {
    const code = text.slice(svgStart, svgEnd + '</svg>'.length);
    return sanitizeSketchCode(code, 'svg');
  }
  return sanitizeSketchCode(text, detectKind(text));
}

function extractSvgFromHtml(code: string): string {
  const start = code.search(/<svg[\s>]/i);
  if (start < 0) return code;
  const endMatch = /<\/svg>/i.exec(code.slice(start));
  if (!endMatch) return code;
  return code.slice(start, start + endMatch.index + '</svg>'.length);
}

function stripDangerousMarkup(code: string): string {
  return String(code || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href|src)\s*=\s*(["'])\s*(?:https?:|javascript:|data:text\/html)[\s\S]*?\1/gi, '')
    .replace(/\s+(?:href|xlink:href|src)\s*=\s*(?:https?:|javascript:|data:text\/html)[^\s>]*/gi, '');
}

function ensureSvgSizing(code: string): string {
  const trimmed = code.trim();
  if (!/^<svg[\s>]/i.test(trimmed)) return trimmed;
  let out = trimmed;
  if (!/\sxmlns\s*=/i.test(out)) {
    out = out.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\sviewBox\s*=/i.test(out) && !/\swidth\s*=/i.test(out)) {
    out = out.replace(/<svg\b/i, '<svg viewBox="0 0 1024 1024" width="1024" height="1024"');
  }
  return out;
}

export function sanitizeSketchCode(code: string, kind: GenClawSketchKind = 'svg'): GenClawSketch {
  const source = kind === 'html' ? extractSvgFromHtml(code) : code;
  const safe = ensureSvgSizing(stripDangerousMarkup(source));
  const safeKind = /^<svg[\s>]/i.test(safe) ? 'svg' : kind;
  return { kind: safeKind, code: safe };
}

export function buildDefaultSvgSketch(prompt: string, options: { width?: number; height?: number } = {}): string {
  const width = Math.max(256, Math.min(2048, Math.round(Number(options.width) || 1024)));
  const height = Math.max(256, Math.min(2048, Math.round(Number(options.height) || 1024)));
  const cleanPrompt = String(prompt || 'visual concept').replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] || ch)).slice(0, 120);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    '  <rect width="100%" height="100%" fill="#101114"/>',
    `  <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" rx="28" fill="#f8fafc"/>`,
    `  <circle cx="${width * 0.32}" cy="${height * 0.36}" r="${Math.min(width, height) * 0.16}" fill="#f59e0b" opacity="0.92"/>`,
    `  <rect x="${width * 0.42}" y="${height * 0.28}" width="${width * 0.34}" height="${height * 0.22}" rx="18" fill="#0ea5e9" opacity="0.88"/>`,
    `  <path d="M ${width * 0.18} ${height * 0.72} C ${width * 0.34} ${height * 0.58}, ${width * 0.54} ${height * 0.84}, ${width * 0.82} ${height * 0.62}" fill="none" stroke="#111827" stroke-width="18" stroke-linecap="round"/>`,
    `  <text x="${width * 0.12}" y="${height * 0.9}" font-family="Arial, sans-serif" font-size="36" fill="#111827">${cleanPrompt}</text>`,
    '</svg>',
  ].join('\n');
}

