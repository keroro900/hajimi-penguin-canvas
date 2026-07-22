import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canvas = readFileSync(resolve(root, 'src/components/Canvas.tsx'), 'utf8');
const viteEnv = readFileSync(resolve(root, 'src/vite-env.d.ts'), 'utf8');

function callbackSlice(name: string, nextName: string): string {
  const start = canvas.indexOf(`const ${name}`);
  const end = canvas.indexOf(`const ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} callback must exist`);
  assert.notEqual(end, -1, `${nextName} callback must follow ${name}`);
  return canvas.slice(start, end);
}

test('CanvasInner avoids the reactive viewport subscription and initializes zoom once', () => {
  assert.doesNotMatch(canvas, /\buseViewport\b/);
  assert.match(canvas, /useState\s*\(\s*\(\)\s*=>[\s\S]{0,240}getViewport\(\)\.zoom/);
  assert.match(canvas, /currentCanvasZoomRef\s*=\s*useRef\([^)]*currentCanvasZoom/);
  assert.match(canvas, /canvasZoomTrackingRef\s*=\s*useRef\([^;]*createCanvasZoomTrackingState\(currentCanvasZoom\)/);
  assert.match(canvas, /createCanvasZoomTrackingState/);
});

test('viewport motion updates the zoom ref and renders only when crossing an LOD boundary', () => {
  const move = callbackSlice('handleViewportMove =', 'handleViewportMoveEnd =');
  assert.match(move, /viewportPayload\s*:\s*Viewport/);
  assert.match(move, /reduceCanvasZoomTracking\(/);
  assert.match(move, /type:\s*['"]move['"]/);
  assert.match(move, /currentCanvasZoomRef\.current\s*=\s*trackingResult\.state\.liveZoom/);
  assert.match(move, /trackingResult\.renderZoom\s*!==\s*null[\s\S]*setCurrentCanvasZoom\(trackingResult\.renderZoom\)/);
  assert.doesNotMatch(move, /setCurrentCanvasZoom\s*\(\s*\(?\s*(?:currentZoom|previousZoom|previous)/);
  assert.match(canvas, /onMove=\{handleViewportMove\}/);
});

test('move end reconciles the final payload before radial lock and preserves busy release behavior', () => {
  const start = callbackSlice('handleViewportMoveStart =', 'handleViewportMove =');
  const endStart = canvas.indexOf('const handleViewportMoveEnd =');
  const end = canvas.slice(endStart, canvas.indexOf('// ===== SHIFT+', endStart));
  assert.match(start, /setViewportMoving\(true\)/);
  assert.match(end, /viewportPayload\s*:\s*Viewport/);
  assert.match(end, /reduceCanvasZoomTracking\(/);
  assert.match(end, /type:\s*['"]end['"]/);
  assert.match(end, /trackingResult\.renderZoom\s*!==\s*null[\s\S]*setCurrentCanvasZoom\(trackingResult\.renderZoom\)/);
  assert.ok(
    end.indexOf("type: 'end'") < end.indexOf('releaseEdgeMotionSoon'),
    'final zoom must be reconciled before the radial-lock early return',
  );
  assert.match(end, /restoreRadialViewportLock\(\)[\s\S]*return/);
  assert.match(end, /releaseEdgeMotionSoon\(setViewportMoving\)/);
});

test('radial viewport lock ignores motion payloads and aligns tracking to the locked zoom', () => {
  const move = callbackSlice('handleViewportMove =', 'handleViewportMoveEnd =');
  const endStart = canvas.indexOf('const handleViewportMoveEnd =');
  const end = canvas.slice(endStart, canvas.indexOf('// ===== SHIFT+', endStart));
  for (const handler of [move, end]) {
    assert.match(handler, /const lockedViewport = radialViewportLockRef\.current/);
    assert.match(handler, /type:\s*['"]locked['"],\s*zoom:\s*lockedViewport\.zoom/);
    assert.match(handler, /restoreRadialViewportLock\(\)[\s\S]*return/);
  }
});

test('viewport handlers keep snapping ref-based and contain no polling or observers', () => {
  const handlers = canvas.slice(
    canvas.indexOf('const handleViewportMoveStart ='),
    canvas.indexOf('// ===== SHIFT+', canvas.indexOf('const handleViewportMoveStart =')),
  );
  assert.doesNotMatch(handlers, /setInterval|setTimeout|requestAnimationFrame|MutationObserver|getViewport\(\)/);
  assert.match(canvas, /currentCanvasZoomRef\.current\s*<\s*0\.55/);
  assert.match(canvas, /zoom:\s*currentCanvasZoom/);
});

test('development render counter is incremented and declared as optional window instrumentation', () => {
  assert.match(canvas, /typeof window\s*!==\s*['"]undefined['"]/);
  assert.match(canvas, /import\.meta\.env\.DEV\s*\|\|[\s\S]{0,160}URLSearchParams\(window\.location\.search\)\.has\(['"]perf-audit['"]\)/);
  assert.match(canvas, /window\.__t8CanvasInnerRenderCount\s*=\s*\(window\.__t8CanvasInnerRenderCount\s*\?\?\s*0\)\s*\+\s*1/);
  assert.match(viteEnv, /interface Window[\s\S]*__t8CanvasInnerRenderCount\?:\s*number/);
  assert.match(canvas, /render-function invocations[\s\S]*StrictMode[\s\S]*not committed renders/i);
});
