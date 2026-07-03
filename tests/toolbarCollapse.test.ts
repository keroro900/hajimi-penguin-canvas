import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('canvas toolbar can collapse to a single restore button', () => {
  const toolbar = read('../src/components/CanvasToolbar.tsx');

  assert.match(toolbar, /toolbarCollapsed,\s*setToolbarCollapsed/);
  assert.match(toolbar, /data-canvas-toolbar-collapsed=\{toolbarCollapsed \? ['"]true['"] : ['"]false['"]\}/);
  assert.match(toolbar, /if\s*\(\s*toolbarCollapsed\s*\)/);
  assert.match(toolbar, /aria-label=['"]展开工具栏['"]/);
  assert.match(toolbar, /aria-label=['"]收起工具栏['"]/);
  assert.match(toolbar, /aria-expanded=\{!toolbarCollapsed\}/);
});
