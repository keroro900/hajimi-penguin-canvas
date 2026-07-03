import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const nodeRoot = path.resolve('src/components/nodes');
const cssPath = path.resolve('src/styles/theme-core.css');

function readNode(name: string) {
  return fs.readFileSync(path.join(nodeRoot, name), 'utf8');
}

test('RunningHub node uses the shared smart card shell and keeps classic switchable', () => {
  const source = readNode('RunningHubNode.tsx');

  assert.match(source, /SmartNodeShell/);
  assert.match(source, /SmartNodeComposer/);
  assert.match(source, /useSmartNodePanelToggle/);
  assert.match(source, /useNodeGeometrySync/);
  assert.match(source, /uiVariant/);
  assert.match(source, /switchRunningHubNodeVariant/);
  assert.match(source, /t8-smart-rh-card/);
  assert.match(source, /t8-smart-rh-composer/);
  assert.match(source, /切回卡片版节点|切换到经典版节点/);
});

test('Fal toolbox node uses the shared smart card shell and keeps classic switchable', () => {
  const source = readNode('FalToolboxNode.tsx');

  assert.match(source, /SmartNodeShell/);
  assert.match(source, /SmartNodeComposer/);
  assert.match(source, /useSmartNodePanelToggle/);
  assert.match(source, /useNodeGeometrySync/);
  assert.match(source, /uiVariant/);
  assert.match(source, /switchFalToolboxNodeVariant/);
  assert.match(source, /t8-smart-fal-card/);
  assert.match(source, /t8-smart-fal-composer/);
  assert.match(source, /切回卡片版节点|切换到经典版节点/);
});

test('RH toolbox node uses the shared smart card shell and keeps classic switchable', () => {
  const source = readNode('RHToolboxNode.tsx');

  assert.match(source, /SmartNodeShell/);
  assert.match(source, /SmartNodeComposer/);
  assert.match(source, /useSmartNodePanelToggle/);
  assert.match(source, /useNodeGeometrySync/);
  assert.match(source, /uiVariant/);
  assert.match(source, /switchRhToolboxNodeVariant/);
  assert.match(source, /t8-smart-rh-toolbox-card/);
  assert.match(source, /t8-smart-rh-toolbox-composer/);
  assert.match(source, /切回卡片版节点|切换到经典版节点/);
});

test('RH toolbox smart composer previews only media inputs', () => {
  const source = readNode('RHToolboxNode.tsx');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(source, /renderRhToolboxInputPreview/);
  assert.match(source, /t8-smart-rh-toolbox-media-preview/);
  assert.match(source, /<SmartImage/);
  assert.match(source, /<LoopingVideo/);
  assert.match(source, /<audio/);
  assert.doesNotMatch(source, /rh-toolbox-param-value/);
  assert.match(css, /\.t8-smart-rh-toolbox-card/);
  assert.match(css, /\.t8-smart-rh-toolbox-composer/);
  assert.match(css, /\.t8-smart-rh-toolbox-media-preview/);
  assert.match(css, /\.t8-smart-rh-toolbox-composer\s+\.t8-smart-node-error/);
});

test('RunningHub and Fal smart cards are styled through theme-core global classes', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.t8-smart-rh-card/);
  assert.match(css, /\.t8-smart-rh-composer/);
  assert.match(css, /\.t8-smart-fal-card/);
  assert.match(css, /\.t8-smart-fal-composer/);
  assert.match(css, /\.t8-smart-rh-toolbox-card/);
  assert.match(css, /\.t8-smart-rh-toolbox-composer/);
  assert.match(css, /var\(--t8-/);
});

test('RunningHub smart composer keeps errors in flow and previews parameter values', () => {
  const source = readNode('RunningHubNode.tsx');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(source, /renderRhParamValuePreview/);
  assert.match(source, /t8-smart-rh-param-preview/);
  assert.match(source, /<SmartImage/);
  assert.match(source, /<LoopingVideo/);
  assert.match(source, /<audio/);
  assert.doesNotMatch(source, /renderRhParamValuePreview\('number'/);
  assert.doesNotMatch(source, /renderRhParamValuePreview\('text'/);
  assert.match(css, /\.t8-smart-rh-composer\s+\.t8-smart-node-error/);
  assert.match(css, /\.t8-smart-rh-param-preview/);
});

test('RunningHub smart composer hides empty previews and clears stale upstream media', () => {
  const source = readNode('RunningHubNode.tsx');

  assert.match(source, /if \(!raw\) return null/);
  assert.doesNotMatch(source, /暂无内容/);
  assert.match(source, /if \(!upUrl\) \{/);
  assert.match(source, /cur\?\.sourceFromUpstream === true/);
  assert.match(source, /value: ''/);
});
