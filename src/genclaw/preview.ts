import { sanitizeSketchCode } from './sketchCode.ts';

export interface GenClawSvgPreviewDocument {
  html: string;
  svg: string;
  error: string;
}

function escapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch] || ch));
}

export function isPreviewableGenClawSvg(code: string): boolean {
  const result = sanitizeSketchCode(code, 'svg');
  return /^<svg[\s>]/i.test(result.code.trim());
}

export function buildGenClawSvgPreviewDocument(code: string): GenClawSvgPreviewDocument {
  if (!String(code || '').trim()) {
    return { html: '', svg: '', error: '没有可预览的 SVG 草图' };
  }

  const result = sanitizeSketchCode(code, 'svg');
  const svg = result.code.trim();
  if (!/^<svg[\s>]/i.test(svg)) {
    return { html: '', svg: '', error: '当前草图不是可预览的 SVG' };
  }

  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    '<style>',
    'html,body{margin:0;width:100%;height:100%;background:#0b0f14;color:#e5e7eb;overflow:hidden;}',
    'body{display:grid;place-items:center;}',
    '.stage{width:100%;height:100%;display:grid;place-items:center;padding:10px;box-sizing:border-box;}',
    'svg{max-width:100%;max-height:100%;width:auto;height:auto;display:block;}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="stage">',
    svg,
    '</div>',
    `<!-- preview:${escapeHtml(svg.slice(0, 80))} -->`,
    '</body>',
    '</html>',
  ].join('');

  return { html, svg, error: '' };
}

