import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panelSource = fs.readFileSync('src/components/shell/ShellPanel.tsx', 'utf-8');

test('shell panel keeps its scrollable node list shrinkable inside the flex column', () => {
  assert.match(panelSource, /t8-shell-panel h-full min-h-0 flex flex-col/);
  assert.match(panelSource, /t8-shell-panel__palette flex-1 min-h-0 overflow-y-auto p-2 space-y-1 scrollbar-hide/);
  assert.match(panelSource, /t8-shell-panel__canvas-list flex-1 min-h-0 overflow-y-auto p-2/);
});

test('canvas panel header keeps title → collapse → create button order', () => {
  const headerStart = panelSource.indexOf('t8-shell-panel__header');
  const titleIndex = panelSource.indexOf('t8-shell-panel__title');
  const collapseIndex = panelSource.indexOf('aria-label="收起面板"');
  const createIndex = panelSource.indexOf('title="新建画布"');

  assert.ok(headerStart > 0);
  assert.ok(titleIndex > headerStart, 'panel title should render inside the header');
  assert.ok(collapseIndex > titleIndex, 'collapse button should render after the panel title');
  assert.ok(createIndex > collapseIndex, 'new canvas button should stay after the collapse button');
  assert.match(panelSource, /handleCreateCanvas/);
  assert.match(panelSource, /createCanvas\(name\)/);
});

test('nodes panel keeps the searchable palette', () => {
  assert.match(panelSource, /t8-sidebar-search-box/);
  assert.match(panelSource, /placeholder="搜索节点\.\.\."/);
  assert.match(panelSource, /filterNodes/);
  assert.match(panelSource, /Object\.entries\(NODE_GROUPS\)/);
  assert.match(panelSource, /t8-sidebar-node/);
  assert.match(panelSource, /onAddNode\(n\.type\)/);
});
