import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  calculateNodeSnapGuides,
  createCanvasZoomTrackingState,
  createRafThrottle,
  getCanvasLodLevel,
  getCanvasPerformanceProfile,
  reduceCanvasZoomTracking,
} from '../src/utils/canvasPerformance.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

test('performance profile enables visible-only rendering and progressive LOD by zoom', () => {
  const full = getCanvasPerformanceProfile({
    zoom: 1,
    nodeCount: 12,
    edgeCount: 8,
    viewportMoving: false,
    nodeDragging: false,
  });
  assert.equal(full.renderVisibleElementsOnly, true);
  assert.equal(full.lodLevel, 'full');
  assert.equal(full.hideHeavyNodeContent, false);

  const compact = getCanvasPerformanceProfile({
    zoom: 0.62,
    nodeCount: 80,
    edgeCount: 120,
    viewportMoving: false,
    nodeDragging: false,
  });
  assert.equal(compact.lodLevel, 'compact');
  assert.equal(compact.hideHeavyNodeContent, false);
  assert.equal('hideBackground' in compact, false);

  const outline = getCanvasPerformanceProfile({
    zoom: 0.35,
    nodeCount: 160,
    edgeCount: 240,
    viewportMoving: true,
    nodeDragging: false,
  });
  assert.equal(outline.lodLevel, 'outline');
  assert.equal(outline.hideHeavyNodeContent, true);
  assert.equal(outline.hideHeavyOverlays, true);
});

test('canvas LOD uses exact zoom boundaries and normalizes non-finite zoom', () => {
  assert.equal(getCanvasLodLevel(0.4499), 'outline');
  assert.equal(getCanvasLodLevel(0.45), 'compact');
  assert.equal(getCanvasLodLevel(0.7199), 'compact');
  assert.equal(getCanvasLodLevel(0.72), 'full');
  assert.equal(getCanvasLodLevel(Number.NaN), 'full');
  assert.equal(getCanvasLodLevel(Number.POSITIVE_INFINITY), 'full');
  assert.equal(getCanvasLodLevel(Number.NEGATIVE_INFINITY), 'full');
});

test('zoom tracking ignores repeated same-LOD moves and requests one update on a boundary crossing', () => {
  let state = createCanvasZoomTrackingState(1);
  let requestedUpdates = 0;
  for (const zoom of [0.98, 0.9, 0.8, 0.73]) {
    const result = reduceCanvasZoomTracking(state, { type: 'move', zoom });
    state = result.state;
    if (result.renderZoom !== null) requestedUpdates += 1;
  }
  assert.equal(requestedUpdates, 0);
  assert.deepEqual(state, { liveZoom: 0.73, renderedZoom: 1 });

  const crossing = reduceCanvasZoomTracking(state, { type: 'move', zoom: 0.7 });
  assert.equal(crossing.renderZoom, 0.7);
  assert.deepEqual(crossing.state, { liveZoom: 0.7, renderedZoom: 0.7 });
});

test('zoom tracking reconciles exact final zoom after same-bucket and crossed-bucket motion', () => {
  let state = createCanvasZoomTrackingState(1);
  let result = reduceCanvasZoomTracking(state, { type: 'move', zoom: 0.8 });
  assert.equal(result.renderZoom, null);
  result = reduceCanvasZoomTracking(result.state, { type: 'end', zoom: 0.8 });
  assert.equal(result.renderZoom, 0.8);
  assert.deepEqual(result.state, { liveZoom: 0.8, renderedZoom: 0.8 });

  state = createCanvasZoomTrackingState(1);
  result = reduceCanvasZoomTracking(state, { type: 'move', zoom: 0.7 });
  assert.equal(result.renderZoom, 0.7);
  result = reduceCanvasZoomTracking(result.state, { type: 'move', zoom: 0.6 });
  assert.equal(result.renderZoom, null);
  result = reduceCanvasZoomTracking(result.state, { type: 'end', zoom: 0.6 });
  assert.equal(result.renderZoom, 0.6);
  assert.deepEqual(result.state, { liveZoom: 0.6, renderedZoom: 0.6 });
});

test('zoom tracking emits no update for a fixed pan and lock alignment ignores moved payload zoom', () => {
  const initial = createCanvasZoomTrackingState(1);
  const fixedPan = reduceCanvasZoomTracking(initial, { type: 'end', zoom: 1 });
  assert.equal(fixedPan.renderZoom, null);

  const moved = reduceCanvasZoomTracking(initial, { type: 'move', zoom: 0.4 });
  assert.equal(moved.renderZoom, 0.4);
  const locked = reduceCanvasZoomTracking(moved.state, { type: 'locked', zoom: 1 });
  assert.equal(locked.renderZoom, 1);
  assert.deepEqual(locked.state, { liveZoom: 1, renderedZoom: 1 });
  const lockedAgain = reduceCanvasZoomTracking(locked.state, { type: 'locked', zoom: 1 });
  assert.equal(lockedAgain.renderZoom, null);
  assert.deepEqual(lockedAgain.state, { liveZoom: 1, renderedZoom: 1 });
});

test('canvas interactions shed heavy overlays without a background profile flag', () => {
  const moving = getCanvasPerformanceProfile({
    zoom: 1,
    nodeCount: 12,
    edgeCount: 8,
    viewportMoving: true,
    nodeDragging: false,
  });
  assert.equal(moving.lodLevel, 'full');
  assert.equal(moving.hideHeavyOverlays, true);
  assert.equal('hideBackground' in moving, false);

  const dragging = getCanvasPerformanceProfile({
    zoom: 1,
    nodeCount: 12,
    edgeCount: 8,
    viewportMoving: false,
    nodeDragging: true,
  });
  assert.equal(dragging.lodLevel, 'full');
  assert.equal(dragging.hideHeavyOverlays, true);
  assert.equal('hideBackground' in dragging, false);
});

test('snap guide calculation returns aligned guides and a snapped position', () => {
  const result = calculateNodeSnapGuides({
    draggedNode: {
      id: 'drag',
      position: { x: 109, y: 207 },
      measured: { width: 100, height: 80 },
    },
    nodes: [
      {
        id: 'other',
        position: { x: 10, y: 200 },
        measured: { width: 100, height: 80 },
      },
      {
        id: 'far',
        position: { x: 500, y: 500 },
        measured: { width: 120, height: 90 },
      },
    ],
    threshold: 12,
  });

  assert.deepEqual(result.vertical, [110]);
  assert.deepEqual(result.horizontal, [200, 240, 280]);
  assert.deepEqual(result.snapPosition, { x: 110, y: 200 });
});

test('raf throttle merges burst updates into the latest frame payload', async () => {
  const queue: Array<() => void> = [];
  const seen: number[] = [];
  const throttle = createRafThrottle<number>(
    (value) => {
      seen.push(value);
    },
    (cb) => {
      queue.push(cb);
      return queue.length;
    },
    () => {},
  );

  throttle.schedule(1);
  throttle.schedule(2);
  throttle.schedule(3);
  assert.deepEqual(seen, []);
  assert.equal(queue.length, 1);

  queue.shift()?.();
  await Promise.resolve();
  assert.deepEqual(seen, [3]);

  throttle.schedule(4);
  assert.equal(queue.length, 1);
  throttle.cancel();
  queue.shift()?.();
  await Promise.resolve();
  assert.deepEqual(seen, [3]);
});

test('phase 1 canvas integration keeps visible-only rendering, raf throttling, and LOD css hooks wired in', () => {
  const canvas = readProjectFile('src/components/Canvas.tsx');
  const css = readProjectFile('src/styles/theme-core.css');

  assert.match(canvas, /createRafThrottle/);
  assert.match(canvas, /calculateNodeSnapGuides/);
  assert.match(canvas, /getCanvasPerformanceProfile/);
  assert.match(canvas, /onlyRenderVisibleElements=\{canvasPerformance\.renderVisibleElementsOnly\}/);
  assert.match(canvas, /data-canvas-lod=\{canvasPerformance\.lodLevel\}/);

  assert.match(css, /data-canvas-lod='compact'/);
  assert.match(css, /data-canvas-lod='outline'/);
  assert.match(css, /\.t8-smart-node-body/);
  assert.doesNotMatch(
    css,
    /data-canvas-lod='compact'\s*\]\s*\.t8-smart-node-body\s*\{[^}]*display:\s*none/i,
  );
  assert.doesNotMatch(
    css,
    /data-canvas-lod='outline'\s*\]\s*\.t8-smart-node-body\s*\{[^}]*display:\s*none/i,
  );
  assert.match(
    css,
    /data-canvas-lod='outline'\][^{]*\.t8-smart-node-body\s*>\s*:not\(\.t8-smart-node-preview\)/i,
  );
});
