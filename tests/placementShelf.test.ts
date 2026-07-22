import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('placement shelf can be cleared without auto-restoring old canvas nodes', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /onClear/);
  assert.match(canvas, /aria-label="清空放置栏"/);
  assert.match(canvas, /title="清空放置栏"/);
  assert.match(canvas, /placementShelfClearedCanvasIdsRef/);
  assert.match(canvas, /placementShelfClearedCanvasIdsRef\.current\.add\(activeId\)/);
  assert.match(canvas, /placementShelfClearedCanvasIdsRef\.current\.has\(requestedCanvasId\)/);
  assert.match(canvas, /setPlacementShelfItems\(placementShelfClearedCanvasIdsRef\.current\.has\(requestedCanvasId\)\s*\?\s*\[\]\s*:\s*placementShelfItemsFromCanvasNodes\(fixedNs, '画布'\)\)/);
});

test('selection context menu can add current nodes to placement shelf', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /type PlacementShelfSource = '粘贴' \| '发送' \| '生成' \| '画布' \| '手动'/);
  assert.match(canvas, /addNodesToPlacementShelf/);
  assert.match(canvas, /placementShelfItemFromNode\(node, '手动'\)/);
  assert.match(canvas, /添加到放置栏/);
  assert.match(canvas, /LucideIcons\.Archive/);
});

test('placement shelf can be hidden and restored from the shared left control rail', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const css = read('../src/styles/index.css');

  assert.match(canvas, /const \[placementShelfHidden, setPlacementShelfHidden\] = useState\(false\)/);
  assert.match(canvas, /onHide=\{\(\) => setPlacementShelfHidden\(true\)\}/);
  assert.match(canvas, /data-canvas-floating-ui="placement-shelf-hide"/);
  assert.match(canvas, /aria-label="隐藏放置栏"/);
  assert.match(canvas, /title="隐藏放置栏"/);
  assert.match(canvas, /data-canvas-floating-ui="placement-shelf-toggle"/);
  assert.match(canvas, /className=\{`t8-control-rail-help t8-control-rail-placement-shelf t8-mini-icon-button\$\{!placementShelfHidden \? ' is-active' : ''\}`\}/);
  assert.match(canvas, /aria-expanded=\{!placementShelfHidden\}/);
  assert.match(canvas, /setPlacementShelfHidden\(\(value\) => !value\)/);
  assert.match(canvas, /\{!placementShelfHidden && \(\s*<PlacementShelf/);
  assert.match(canvas, /setPlacementShelfHidden\(false\);[\s\S]*setPlacementShelfOpen\(true\);/);
  assert.match(canvas, /setPlacementShelfHidden\(true\);[\s\S]*setPlacementShelfItems\(\[\]\);/);

  assert.match(css, /\.t8-control-rail-placement-shelf/);
  assert.match(css, /\.t8-placement-shelf__hide/);
  assert.match(css, /\.t8-placement-shelf\[data-placement-shelf-hidden="false"\]/);
  assert.match(css, /html\[data-theme-visual\] \.t8-canvas-shell \.t8-control-rail-placement-shelf/);
});

test('visual themes do not draw a panel behind the shared left control rail', () => {
  const soft = read('../src/styles/theme-soft.css');
  const wabi = read('../src/styles/theme-wabi.css');

  assert.doesNotMatch(soft, /html\[data-theme-visual="soft"\]\s+\.t8-control-rail\s*,/);
  assert.doesNotMatch(wabi, /html\[data-theme-visual="wabi"\]\s+\.t8-control-rail\s*,/);
});

test('shared CSS owns expanded and collapsed placement shelf paint as an opaque elevated panel', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const css = read('../src/styles/index.css');

  assert.match(canvas, /className="t8-placement-shelf t8-placement-shelf--collapsed/);
  assert.match(canvas, /className="t8-placement-shelf p-2"/);

  const shelfRule = css.match(/\.t8-placement-shelf\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? '';
  assert.match(shelfRule, /background:\s*var\(--t8-bg-panel-elevated\)\s*!important/);
  assert.match(shelfRule, /border:\s*1px solid var\(--t8-border\)\s*!important/);
  assert.match(shelfRule, /box-shadow:\s*var\(--t8-shadow-panel\)\s*!important/);
  assert.match(shelfRule, /z-index:\s*var\(--t8-z-canvas-chrome\)/);
  assert.doesNotMatch(shelfRule, /rgba?\s*\(|hsla?\s*\(|transparent|color-mix\s*\(|opacity\s*:|(?:-webkit-)?backdrop-filter\s*:/i);
});
