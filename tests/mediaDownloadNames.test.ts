import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('image preview and media nodes use explicit media download filenames', () => {
  const preview = read('../src/components/nodes/shared/SmartMediaPreviewModal.tsx');
  const output = read('../src/components/nodes/OutputNode.tsx');
  const image = read('../src/components/nodes/ImageNode.tsx');
  const upload = read('../src/components/nodes/UploadNode.tsx');
  const videoOutput = read('../src/components/nodes/VideoOutputNode.tsx');
  const modelPreview = read('../src/components/nodes/Model3DPreviewNode.tsx');
  const codexImage = read('../src/components/nodes/CodexImageConjureNode.tsx');
  const canvas = read('../src/components/Canvas.tsx');
  const download = read('../src/utils/downloadMedia.ts');

  assert.match(download, /export async function downloadMediaUrl/);
  assert.match(download, /URL\.createObjectURL\(blob\)/);
  assert.match(download, /a\.download = fileName/);

  assert.match(preview, /mediaDownloadFileName/);
  assert.match(preview, /download=\{mediaDownloadFileName\('image', safeUrl, 0\)\}/);
  assert.doesNotMatch(preview, /\sdownload\s*\n\s*className="t8-btn t8-smart-media-preview__tool"/);

  assert.match(output, /download=\{mediaDownloadFileName\('image', u, i\)\}/);
  assert.match(output, /download=\{mediaDownloadFileName\('video', u, i\)\}/);
  assert.match(output, /download=\{mediaDownloadFileName\('audio', u, i\)\}/);
  assert.match(output, /download=\{mediaDownloadFileName\('model3d', u, i\)\}/);

  assert.match(image, /download=\{mediaDownloadFileName\('image', url, index\)\}/);
  assert.match(upload, /download=\{mediaDownloadFileName\(previewItem\.kind, previewItem\.url, 0, previewItem\.mime\)\}/);
  assert.match(videoOutput, /download=\{mediaDownloadFileName\(isVideoUrl\(u\) \? 'video' : 'image', u, i\)\}/);
  assert.match(modelPreview, /download=\{mediaDownloadFileName\('model3d', currentUrl, 0\)\}/);
  assert.match(codexImage, /download=\{mediaDownloadFileName\('image', latestUrls\[0\], 0\)\}/);
  assert.match(canvas, /downloadMediaUrl\(item\.kind, item\.url, index, item\.mime\)/);

  for (const source of [preview, output, image, upload, videoOutput, modelPreview, codexImage]) {
    assert.match(source, /downloadMediaUrl/);
    assert.match(source, /preventDefault\(\)/);
  }
});

test('blob download URLs stay alive long enough for large media downloads', () => {
  const download = read('../src/utils/downloadMedia.ts');

  assert.match(download, /DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS/);
  assert.doesNotMatch(download, /,\s*1500\)/);
});
