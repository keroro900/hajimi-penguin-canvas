import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('large canvas image previews defer decoding and network work', () => {
  const materialThumbnail = read('../src/components/nodes/MaterialThumbnail.tsx');
  const outputNode = read('../src/components/nodes/OutputNode.tsx');
  const uploadNode = read('../src/components/nodes/UploadNode.tsx');
  const panorama3dNode = read('../src/components/nodes/Panorama3DNode.tsx');

  assert.match(materialThumbnail, /src=\{material\.url\}[\s\S]*loading="lazy"[\s\S]*decoding="async"/);
  assert.match(outputNode, /src=\{u\}[\s\S]*loading="lazy"[\s\S]*decoding="async"/);
  assert.match(uploadNode, /src=\{item\.url\}[\s\S]*loading="lazy"[\s\S]*decoding="async"/);
  assert.match(panorama3dNode, /src=\{outputUrl\}[\s\S]*loading="lazy"[\s\S]*decoding="async"/);
});
