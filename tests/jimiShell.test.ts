import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('app rail hosts all primary entries with accessible labels', () => {
  const rail = read('../src/components/shell/AppRail.tsx');

  // 品牌标记
  assert.match(rail, /<JimiLogo variant="symbol" size=\{24\}/);
  assert.match(rail, /aria-label="应用导航"/);

  // 顶部：节点 / 画布 / 资源库
  assert.match(rail, /aria-label="节点"/);
  assert.match(rail, /aria-label="画布"/);
  assert.match(rail, /aria-label="资源库"/);
  assert.match(rail, /onSelectPanel\('nodes'\)/);
  assert.match(rail, /onSelectPanel\('canvases'\)/);
  assert.match(rail, /onClick=\{onOpenResource\}/);

  // 底部（承接原顶栏入口）：主题模板 / 自动更新 / Agent / API 设置 / 主题切换 + 状态点
  assert.match(rail, /aria-label="Agent"/);
  assert.match(rail, /aria-label="API 设置"/);
  assert.match(rail, /aria-label="主题切换"/);
  assert.match(rail, /aria-pressed=\{agentOpen\}/);
  assert.match(rail, /t8-app-rail__section--bottom/);
  assert.match(rail, /aria-label="主题模板"/);
  assert.match(rail, /onClick=\{onOpenThemeTemplates\}/);
  assert.match(rail, /<AppUpdaterButton isPixel=\{isPixel\} isDark=\{isDark\} rail \/>/);
  assert.match(rail, /<LocalTopbarSlot isPixel=\{isPixel\} isDark=\{isDark\} \/>/);

  // 底部顺序：主题模板 → 自动更新 → Agent → API 设置 → 主题切换 → 状态点
  const bottom = rail.slice(rail.indexOf('t8-app-rail__section--bottom'));
  const order = [
    'aria-label="主题模板"',
    'AppUpdaterButton',
    'aria-label="Agent"',
    'aria-label="API 设置"',
    'aria-label="主题切换"',
    't8-app-rail__status',
  ];
  const positions = order.map((marker) => bottom.indexOf(marker));
  assert.ok(positions.every((pos) => pos >= 0), `bottom section markers missing: ${positions}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);

  // 状态点：8px 圆点，tooltip 承载中文状态文案
  assert.match(rail, /t8-app-rail__status-dot--\$\{backendStatus\}/);
  assert.match(rail, /t8-app-rail__status-dot--\$\{codexStatus\}/);
  assert.match(rail, /title=\{backendStatusTitle\}/);
  assert.match(rail, /title=\{codexStatusTitle\}/);

  // 面板入口激活态
  assert.match(rail, /aria-pressed=\{activePanel === 'nodes'\}/);
  assert.match(rail, /aria-pressed=\{activePanel === 'canvases'\}/);
  assert.match(rail, /is-active/);
});

test('shell panel hosts the searchable node palette and canvas switcher', () => {
  const panel = read('../src/components/shell/ShellPanel.tsx');

  assert.match(panel, /t8-shell-panel/);
  assert.match(panel, /aria-label="收起面板"/);
  assert.match(panel, /placeholder="搜索节点\.\.\."/);
  assert.match(panel, /t8-sidebar-search-box/);
  assert.match(panel, /Object\.entries\(NODE_GROUPS\)/);
  assert.match(panel, /t8-sidebar-node/);
  assert.match(panel, /onAddNode\(n\.type\)/);
  assert.match(panel, /t8-sidebar-canvas-row/);
  assert.match(panel, /t8-sidebar-canvas-update-dot/);
  assert.match(panel, /renameCanvas/);
  assert.match(panel, /setActive\(c\.id\)/);
  // 面板收起时不渲染
  assert.match(panel, /if \(!panel\) return null/);
});

test('topbar is removed entirely; rail carries status dots and moved controls', () => {
  const app = read('../src/App.tsx');

  // 顶栏整体移除：无 <header>、无 t8-topbar、无版本号 chip、无 lockup 字标
  assert.doesNotMatch(app, /<header/);
  assert.doesNotMatch(app, /t8-topbar/);
  assert.doesNotMatch(app, /__APP_VERSION__/);
  assert.doesNotMatch(app, /variant="lockup"/);

  // 状态 chip 变为轨道状态点：中文状态文案仍在 App 侧计算
  assert.match(app, /后端已连接/);
  assert.match(app, /后端未连接/);
  assert.match(app, /Codex已连接/);
  assert.match(app, /Codex未连接/);
  assert.match(app, /codexStatusDetail/);

  // 轨道接线：主题模板 / 更新按钮状态点 / 原有入口仍切换同一批状态
  assert.match(app, /onOpenThemeTemplates=\{\(\) => setThemeManagerOpen\(true\)\}/);
  assert.match(app, /backendStatus=\{backendStatus\}/);
  assert.match(app, /codexStatus=\{codexStatus\}/);
  assert.match(app, /backendStatusTitle=\{backendStatusTitle\}/);
  assert.match(app, /codexStatusTitle=\{codexStatusTitle\}/);
  assert.match(app, /onToggleAgent=\{\(\) => setCodexSidebarOpen\(\(open\) => !open\)\}/);
  assert.match(app, /agentOpen=\{codexSidebarOpen\}/);
  assert.match(app, /onOpenResource=\{\(\) => setResourceOpen\(true\)\}/);
  assert.match(app, /onOpenSettings=\{\(\) => setSettingsOpen\(true\)\}/);
  assert.match(app, /onToggleTheme=\{toggleTheme\}/);
});

test('legacy sidebar components are deleted and no longer imported', () => {
  assert.ok(!existsSync(new URL('../src/components/Sidebar.tsx', import.meta.url)));
  assert.ok(!existsSync(new URL('../src/components/CanvasManager.tsx', import.meta.url)));

  const app = read('../src/App.tsx');
  assert.doesNotMatch(app, /components\/Sidebar/);
  assert.doesNotMatch(app, /CanvasManager/);
});

test('resource drawer outside-click whitelist covers the new shell chrome', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /target\.closest\('\.t8-app-rail'\)/);
  assert.match(app, /target\.closest\('\.t8-shell-panel'\)/);
  // 顶栏已删除，白名单不再引用它
  assert.doesNotMatch(app, /closest\('\.t8-topbar'\)/);
});
