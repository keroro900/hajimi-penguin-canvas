import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canvasSource = fs.readFileSync('src/components/Canvas.tsx', 'utf-8');

test('canvas overview can zoom far enough to fit large workflows', () => {
  assert.match(canvasSource, /const CANVAS_MIN_ZOOM\s*=\s*0\.02/);
  assert.match(canvasSource, /const CANVAS_OVERVIEW_FIT_OPTIONS\s*=\s*\{\s*padding:\s*0\.\d+,\s*minZoom:\s*CANVAS_MIN_ZOOM,\s*maxZoom:\s*1\.15,\s*\}/);
  assert.match(canvasSource, /<ReactFlow[\s\S]*\bminZoom=\{CANVAS_MIN_ZOOM\}/);
  assert.match(canvasSource, /<ReactFlow[\s\S]*\bfitViewOptions=\{CANVAS_OVERVIEW_FIT_OPTIONS\}/);
  assert.match(canvasSource, /<Controls[\s\S]*fitViewOptions=\{CANVAS_OVERVIEW_FIT_OPTIONS\}/);
  assert.match(canvasSource, /fitView\(\{\s*\.\.\.CANVAS_OVERVIEW_FIT_OPTIONS,\s*duration:\s*420\s*\}\)/);
});
