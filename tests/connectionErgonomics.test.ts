import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('canvas connection ergonomics widen handle targeting without relaxing port validation', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const css = read('../src/styles/index.css');

  assert.match(canvas, /ConnectionMode/);
  assert.match(canvas, /connectionMode=\{ConnectionMode\.Strict\}/);
  assert.match(canvas, /connectionRadius=\{40\}/);
  assert.match(canvas, /isValidConnection=\{onIsValidConnection\}/);
  assert.match(canvas, /isConnectionValid\(src,\s*tgt\)/);
  assert.match(css, /\.react-flow__handle::before\s*\{[\s\S]*top:\s*-12px/);
  assert.match(css, /\.react-flow__handle::before\s*\{[\s\S]*left:\s*-12px/);
  assert.match(css, /\.react-flow__handle::before\s*\{[\s\S]*right:\s*-12px/);
  assert.match(css, /\.react-flow__handle::before\s*\{[\s\S]*bottom:\s*-12px/);
});
