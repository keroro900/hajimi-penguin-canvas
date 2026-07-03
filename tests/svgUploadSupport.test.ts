import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mediaDownloadFileName } from '../src/utils/mediaCollection.ts';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('upload material node accepts SVG as image input', () => {
  const upload = read('../src/components/nodes/UploadNode.tsx');

  assert.match(upload, /image\/svg\+xml/);
  assert.match(upload, /\.svg/);
  assert.match(upload, /m\s*===\s*'image\/svg\+xml'|image\/svg\+xml.*startsWith\('image\/'\)/s);
});

test('upstream material classification treats SVG URLs as images', () => {
  const upstream = read('../src/components/nodes/useUpstreamMaterials.ts');

  assert.match(upstream, /IMAGE_RE\s*=\s*\/\\\.\([^)]*svg/);
});

test('media collection preserves SVG extension and mime download names', () => {
  assert.equal(mediaDownloadFileName('image', '/files/input/logo.svg', 0), 'logo.svg');
  assert.equal(mediaDownloadFileName('image', 'blob:http://localhost/svg', 0, 'image/svg+xml'), 't8-output-image-1.svg');
});

