import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sidebarSource = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

test('sidebar keeps its scrollable node list shrinkable inside the flex column', () => {
  assert.match(sidebarSource, /t8-sidebar w-64 h-full min-h-0 flex flex-col/);
  assert.match(sidebarSource, /flex-1 min-h-0 overflow-y-auto p-2 space-y-1 scrollbar-hide/);
});

test('canvas panel collapse action stays in the right-side button group', () => {
  const titleIndex = sidebarSource.indexOf('<FolderOpen size={12} />');
  const collapseIndex = sidebarSource.indexOf("title={canvasPanelOpen ? '收起画布列表' : '展开画布列表'}");
  const createIndex = sidebarSource.indexOf('title="新建画布"', collapseIndex);

  assert.ok(titleIndex > 0);
  assert.ok(collapseIndex > titleIndex, 'collapse button should render after the canvas title');
  assert.ok(createIndex > collapseIndex, 'new canvas button should stay after the collapse button');
  assert.doesNotMatch(
    sidebarSource.slice(titleIndex - 260, titleIndex),
    /setCanvasPanelOpen/,
    'canvas title text should not be the collapse hit target',
  );
});
