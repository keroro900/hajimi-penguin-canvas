import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('video node renders API error objects as text', () => {
  const source = read('../src/components/nodes/VideoNode.tsx');

  assert.match(source, /function formatVideoNodeText/);
  assert.match(source, /const safeError = formatVideoNodeText\(error\)/);
  assert.match(source, /const safeProgress = formatVideoNodeText\(progress\)/);
  assert.match(source, /<span>\{safeError\}<\/span>/);
  assert.match(source, /<span className="break-all">\{safeError\}<\/span>/);
  assert.doesNotMatch(source, /<span>\{error\}<\/span>/);
  assert.doesNotMatch(source, /<span className="break-all">\{error\}<\/span>/);
});
