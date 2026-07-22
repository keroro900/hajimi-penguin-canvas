import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('DeletableEdge renders a hover action cluster with delete + insert buttons', () => {
  const edge = read('../src/components/edges/DeletableEdge.tsx');

  // cluster wrapper keeps the two midpoint actions together
  assert.match(edge, /t8-edge-action-cluster/);
  // the legacy cut button keeps its class, glyph and click handler
  assert.match(edge, /t8-edge-cut-button/);
  assert.match(edge, /t8-edge-cut-glyph/);
  assert.match(edge, /const handleCut = /);
  assert.match(edge, /penguin:edge-cut-feedback/);
  // the new insert button asks the canvas to open the insert menu
  assert.match(edge, /t8-edge-insert-button/);
  assert.match(edge, /t8-edge-insert-glyph/);
  assert.match(edge, /const handleInsertRequest = /);
  assert.match(edge, /penguin:edge-insert-node-request/);
  assert.match(edge, /在连线上插入节点/);
});

test('edge action cluster buttons are styled next to the legacy cut button', () => {
  const css = read('../src/styles/index.css');

  assert.match(css, /\.t8-edge-action-cluster\s*\{/);
  assert.match(css, /\.t8-edge-insert-button\s*\{/);
  assert.match(css, /\.t8-edge-insert-button:hover/);
  assert.match(css, /\.t8-edge-insert-glyph\s*\{/);
  // legacy cut button styles untouched
  assert.match(css, /\.t8-edge-cut-button\s*\{/);
  assert.match(css, /\.t8-edge-cut-button:hover/);
});

test('Canvas wires the edge insert request handler and the splice flow', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /import \{ listEdgeInsertCandidates, planEdgeSplice \} from '\.\/edges\/edgeInsertCandidates';/);
  assert.match(canvas, /penguin:edge-insert-node-request/);
  assert.match(canvas, /const \[edgeInsertMenu, setEdgeInsertMenu\] = useState/);
  assert.match(canvas, /const insertNodeIntoEdge = useCallback\(/);
  // splice replaces the original edge with two edges, never deleting without replacement
  assert.match(canvas, /planEdgeSplice\(edge, id, portType\)/);
  assert.match(canvas, /validateMaterialConnection\(/);
  assert.match(canvas, /\.\.\.eds\.filter\(\(ed\) => ed\.id !== edgeId\), upstreamEdge, downstreamEdge\]/);
  // fallback keeps the original edge and only drops an unconnected node
  assert.match(canvas, /无法把该节点串入连线/);
});

test('edge insert menu reuses the quick-add context menu visual pattern', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const menuStart = canvas.indexOf('{/* 连线中点「插入节点」菜单');
  assert.ok(menuStart > 0, 'edge insert menu should exist');
  const menuBlock = canvas.slice(menuStart, canvas.indexOf('})()', menuStart));

  // candidates are filtered by the edge port type
  assert.match(menuBlock, /listEdgeInsertCandidates\(edgeInsertMenu\.portType\)/);
  assert.match(menuBlock, /data-canvas-floating-ui="edge-insert-menu"/);
  assert.match(menuBlock, /t8-context-menu t8-context-menu--quick-add t8-context-menu--edge-insert/);
  assert.match(menuBlock, /t8-context-menu__header/);
  assert.match(menuBlock, /插入节点/);
  assert.match(menuBlock, /t8-context-menu__item/);
  assert.match(menuBlock, /t8-context-menu__node-icon/);
  assert.match(menuBlock, /t8-context-menu__empty/);
});

test('jimi foundation polishes context menus and the node action bar under tech-default', () => {
  const css = read('../src/styles/jimi-foundation.css');

  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-context-menu\s*\{/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-context-menu__item:hover/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-context-menu__item--danger/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-radial-node-menu__slot/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-node-action-bar\s*\{/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-node-action-bar button\[title="执行此节点"\]/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-node-action-bar button\[title\^="中止当前运行"\]/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-edge-cut-button/);
  assert.match(css, /html\[data-theme-template="tech-default"\] \.t8-edge-insert-button/);
});

test('material context menu shares the standard context menu classes', () => {
  const menu = read('../src/components/MaterialContextMenu.tsx');

  assert.match(menu, /t8-context-menu t8-context-menu--material/);
  assert.match(menu, /const itemCls = 't8-context-menu__item';/);
  assert.match(menu, /t8-context-menu__header/);
  // the outside-click guard attribute is preserved
  assert.match(menu, /data-resource-context-menu/);
  // container no longer hardcodes its own palette
  assert.doesNotMatch(menu, /background: isPixel \? '#FFFFFF' : isDark \? 'rgba\(20,20,22/);
});

test('smart composer passes floating canvas chrome rects to the placement solver', () => {
  const composer = read('../src/components/nodes/shared/SmartNodeComposer.tsx');

  assert.match(composer, /querySelectorAll\('\.t8-canvas-toolbar, \.t8-control-rail, \.t8-generation-history-panel'\)/);
  assert.match(composer, /avoid,/);
});

test('composer placement solver accepts avoid rects', () => {
  const solver = read('../src/components/nodes/shared/composerPlacement.ts');

  assert.match(solver, /avoid\?: ComposerAnchorRect\[\]/);
  assert.match(solver, /const avoidRects = /);
});
