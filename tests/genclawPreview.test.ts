import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGenClawSvgPreviewDocument,
  isPreviewableGenClawSvg,
} from '../src/genclaw/preview.ts';

test('GenClaw SVG preview document sanitizes unsafe markup', () => {
  const doc = buildGenClawSvgPreviewDocument(`
    <svg viewBox="0 0 64 64" onclick="alert(1)">
      <script>alert('x')</script>
      <image href="https://example.com/a.png" />
      <rect width="64" height="64" fill="#38bdf8" />
    </svg>
  `);

  assert.match(doc.html, /<svg/);
  assert.match(doc.html, /<rect/);
  assert.doesNotMatch(doc.html, /<script/i);
  assert.doesNotMatch(doc.html, /onclick/i);
  assert.doesNotMatch(doc.html, /https:\/\/example\.com/i);
  assert.equal(doc.error, '');
});

test('GenClaw SVG preview reports empty or non-SVG sketches', () => {
  assert.equal(isPreviewableGenClawSvg('<svg viewBox="0 0 10 10"></svg>'), true);
  assert.equal(isPreviewableGenClawSvg('<div>not svg</div>'), false);

  const empty = buildGenClawSvgPreviewDocument('');
  assert.equal(empty.html, '');
  assert.match(empty.error, /没有可预览/);

  const nonSvg = buildGenClawSvgPreviewDocument('<div>not svg</div>');
  assert.equal(nonSvg.html, '');
  assert.match(nonSvg.error, /SVG/);
});

