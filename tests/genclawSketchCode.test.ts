import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSketchCode,
  sanitizeSketchCode,
} from '../src/genclaw/sketchCode.ts';

test('extractSketchCode reads fenced SVG sketches', () => {
  const extracted = extractSketchCode([
    '方案如下:',
    '```svg',
    '<svg viewBox="0 0 64 64"><rect width="64" height="64" /></svg>',
    '```',
  ].join('\n'));

  assert.equal(extracted.kind, 'svg');
  assert.match(extracted.code, /^<svg[\s\S]*<\/svg>$/);
});

test('sanitizeSketchCode strips scripts, handlers, and external image refs', () => {
  const result = sanitizeSketchCode(`
    <svg viewBox="0 0 64 64" onclick="alert(1)">
      <script>alert('x')</script>
      <image href="https://example.com/a.png" />
      <rect width="64" height="64" onmouseover="evil()" />
    </svg>
  `, 'svg');

  assert.equal(result.kind, 'svg');
  assert.doesNotMatch(result.code, /<script/i);
  assert.doesNotMatch(result.code, /onclick|onmouseover/i);
  assert.doesNotMatch(result.code, /https:\/\/example\.com/i);
  assert.match(result.code, /<rect/);
});

test('sanitizeSketchCode extracts SVG from simple HTML sketches', () => {
  const result = sanitizeSketchCode(`
    <main>
      <svg width="128" height="128"><circle cx="64" cy="64" r="24" /></svg>
    </main>
  `, 'html');

  assert.equal(result.kind, 'svg');
  assert.match(result.code, /<circle/);
});

