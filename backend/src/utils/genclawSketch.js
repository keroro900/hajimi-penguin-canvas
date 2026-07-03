const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('../config');

function clampSize(value, fallback) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(128, Math.min(4096, n));
}

function extractSvgFromHtml(code) {
  const source = String(code || '');
  const start = source.search(/<svg[\s>]/i);
  if (start < 0) return source;
  const rest = source.slice(start);
  const end = rest.search(/<\/svg>/i);
  if (end < 0) return source;
  return rest.slice(0, end + '</svg>'.length);
}

function stripDangerousMarkup(code) {
  return String(code || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href|src)\s*=\s*(["'])\s*(?:https?:|javascript:|data:text\/html)[\s\S]*?\1/gi, '')
    .replace(/\s+(?:href|xlink:href|src)\s*=\s*(?:https?:|javascript:|data:text\/html)[^\s>]*/gi, '');
}

function ensureSvgSizing(code, width, height) {
  const trimmed = String(code || '').trim();
  if (!/^<svg[\s>]/i.test(trimmed)) {
    throw new Error('当前仅支持 SVG 草图，HTML 草图需要包含内联 <svg>');
  }
  let out = trimmed;
  if (!/\sxmlns\s*=/i.test(out)) {
    out = out.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\sviewBox\s*=/i.test(out) && !/\swidth\s*=/i.test(out)) {
    out = out.replace(/<svg\b/i, `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`);
  }
  return out;
}

function sanitizeSketchCode(code, kind = 'svg', width = 1024, height = 1024) {
  const source = kind === 'html' ? extractSvgFromHtml(code) : code;
  return ensureSvgSizing(stripDangerousMarkup(source), width, height);
}

function safeTitle(value) {
  return String(value || 'genclaw')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 48) || 'genclaw';
}

async function renderSketchToFiles(params) {
  const width = clampSize(params.width, 1024);
  const height = clampSize(params.height, 1024);
  const kind = params.kind === 'html' ? 'html' : 'svg';
  const svg = sanitizeSketchCode(params.code, kind, width, height);
  if (!fs.existsSync(config.OUTPUT_DIR)) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  const hash = crypto.createHash('sha1').update(svg).digest('hex').slice(0, 10);
  const base = `${safeTitle(params.title)}_${Date.now()}_${hash}`;
  const svgFilename = `${base}.svg`;
  const pngFilename = `${base}.png`;
  const svgPath = path.join(config.OUTPUT_DIR, svgFilename);
  const pngPath = path.join(config.OUTPUT_DIR, pngFilename);
  fs.writeFileSync(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg)).resize({ width, height, fit: 'contain' }).png().toFile(pngPath);
  return {
    imageUrl: `/files/output/${encodeURIComponent(pngFilename)}`,
    svgUrl: `/files/output/${encodeURIComponent(svgFilename)}`,
    width,
    height,
    mime: 'image/png',
    kind: 'svg',
  };
}

module.exports = {
  sanitizeSketchCode,
  renderSketchToFiles,
};

