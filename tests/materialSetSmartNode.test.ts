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

test('material set composer visibility comes from the session-only coordinator', () => {
  const source = read('../src/components/nodes/MaterialSetNode.tsx');

  assert.match(source, /from '\.\.\/\.\.\/stores\/smartNodeComposer'/);
  assert.match(source, /useIsSmartNodeComposerOpen\(id\)/);
  assert.match(source, /smartNodeComposerActions\.open\(id\)/);
  assert.match(source, /smartNodeComposerActions\.close\(id\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => smartNodeComposerActions\.close\(id\), \[id\]\)/);
  assert.match(source, /useOutsideClose\(\{[\s\S]*onOutside: \(\) => setSmartComposerOpenLocal\(false\)/);
  // The composer owns the open flag now: no node-local smartPanelOpen state.
  assert.doesNotMatch(source, /smartPanelOpen/);
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

test('material set composer is a portal dialog anchored to the card', () => {
  const source = read('../src/components/nodes/MaterialSetNode.tsx');

  assert.match(source, /<SmartNodeComposer[\s\S]*portal[\s\S]*anchorRef=\{smartNodeRef\}/);
  assert.match(source, /onRequestClose=\{\(\) => setSmartComposerOpenLocal\(false\)\}/);
  assert.match(source, /ariaLabel="素材集节点属性"/);
  assert.match(source, /style=\{\{ width: smartComposerWidth \}\}/);
  assert.match(source, /const smartComposerWidth = Math\.max\(smartCardWidth, 520\)/);
  // The old side-attached, non-portal positioning is gone.
  assert.doesNotMatch(source, /left:\s*smartCardWidth\s*\+\s*12/);
  assert.match(source, /accessibleLabel="素材集节点"/);
  assert.match(source, /smartState=\{smartMaterialSetCardState\}/);
  assert.match(source, /onKeyboardActivate=/);
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
