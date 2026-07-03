import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('material set node exposes smart card and classic variants', () => {
  const source = read('../src/components/nodes/MaterialSetNode.tsx');

  assert.match(source, /import SmartNodeShell from '\.\/shared\/SmartNodeShell'/);
  assert.match(source, /import SmartNodeComposer from '\.\/shared\/SmartNodeComposer'/);
  assert.match(source, /useSmartNodePanelToggle/);
  assert.match(source, /useNodeGeometrySync/);
  assert.match(source, /useOutsideClose/);
  assert.match(source, /materialSetNodeVariant/);
  assert.match(source, /d\.uiVariant === 'classic'/);
  assert.match(source, /uiVariant: nextVariant/);
  assert.match(source, /switchMaterialSetVariant/);
  assert.match(source, /renderClassicNode/);
  assert.match(source, /renderSmartCard/);
  assert.match(source, /renderSmartComposer/);
  assert.match(source, /切回卡片版节点/);
});

test('material set smart card keeps management controls in composer', () => {
  const source = read('../src/components/nodes/MaterialSetNode.tsx');

  assert.match(source, /t8-smart-material-set-card/);
  assert.match(source, /t8-smart-material-set-cover/);
  assert.match(source, /t8-smart-material-set-composer/);
  assert.match(source, /t8-smart-material-set-toolbar/);
  assert.match(source, /t8-smart-material-set-grid/);
  assert.match(source, /Card normal state stays summary-first/);
  assert.match(source, /Material set management lives in the external composer/);
});

test('material set auto collects upstream materials after connection changes', () => {
  const source = read('../src/components/nodes/MaterialSetNode.tsx');

  assert.match(source, /autoCollectSignature/);
  assert.match(source, /lastAutoCollectSignatureRef/);
  assert.match(source, /materialSetItemFromUpstream/);
  assert.match(source, /sourceNodeId/);
  assert.match(source, /commitItems\(nextKind,\s*\[\.\.\.existing,\s*\.\.\.appended\]\)/);
  assert.match(source, /素材集会在连线后自动收集同类型上游素材/);
});

test('material set smart styles use compact global theme classes', () => {
  const css = read('../src/styles/theme-core.css');

  assert.match(css, /\.t8-smart-material-set-card\s*\{[\s\S]*padding:\s*7px/);
  assert.match(css, /\.t8-smart-material-set-title/);
  assert.match(css, /\.t8-material-set-classic/);
  assert.match(css, /\.t8-smart-material-set-composer__hint/);
  assert.match(css, /\.t8-smart-material-set-icon-action/);
  assert.match(css, /\.t8-smart-material-set-composer\s*\{[\s\S]*width:\s*320px/);
  assert.match(css, /html\[data-theme-style="pixel"\] \.t8-smart-material-set-card/);
  assert.match(css, /--t8-material-set-ink/);
});
