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

test('reconnected edges keep selectable edge state for property forms', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /reconnectEdge/);
  assert.match(canvas, /const onReconnect = useCallback\(/);
  assert.match(canvas, /onReconnect=\{onReconnect\}/);
  assert.match(canvas, /selected:\s*true/);
  assert.match(canvas, /selectable:\s*true/);
  assert.match(canvas, /data:\s*\{\s*\.\.\.\(\(edge\.data as Record<string,\s*unknown>\s*\|\s*undefined\)\s*\|\|\s*\{\}\),\s*portType:\s*matchedPortType\s*\}/);
});

test('connection interaction reset clears stale pending handle state after reconnects', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const resetBlock = canvas.slice(
    canvas.indexOf('const resetConnectionPanMode = useCallback(() => {'),
    canvas.indexOf('}, [setConnectionPanMode]);', canvas.indexOf('const resetConnectionPanMode = useCallback(() => {')),
  );

  assert.match(resetBlock, /isConnectionDraggingRef\.current\s*=\s*false/);
  assert.match(resetBlock, /connectingFromRef\.current\s*=\s*null/);
  assert.match(resetBlock, /connectionPanPointerRef\.current\s*=\s*null/);
});
