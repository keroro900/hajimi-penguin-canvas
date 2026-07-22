import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('app shell exposes the rail + collapsible panel layout with H shortcut', () => {
  const app = read('../src/App.tsx');
  const css = read('../src/styles/index.css');

  // 新外壳状态：'t8-shell-panel' 持久化 + 旧 't8-sidebar-collapsed' 偏好迁移
  assert.match(app, /SHELL_PANEL_STORAGE_KEY\s*=\s*'t8-shell-panel'/);
  assert.match(app, /LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY\s*=\s*'t8-sidebar-collapsed'/);
  assert.match(app, /readShellPanelPreference/);
  assert.match(app, /localStorage\.setItem\(SHELL_PANEL_STORAGE_KEY, activePanel \?\? 'collapsed'\)/);

  // H 快捷键依旧绑定 global.sidebar-toggle，现在切换外壳面板
  assert.match(app, /matchesAnyShortcut\(shortcuts\['global\.sidebar-toggle'\],\s*e\)/);
  assert.match(app, /isShortcutTypingTarget\(e\.target\)/);
  assert.match(app, /toggleShellPanel\(\)/);
  assert.match(app, /setActivePanel\(\(panel\)\s*=>\s*\(panel === null \? lastOpenPanelRef\.current : null\)\)/);

  // 布局：AppRail + ShellPanel 取代旧的 {!sidebarCollapsed && <Sidebar …/>}
  assert.match(app, /<AppRail/);
  assert.match(app, /<ShellPanel panel=\{activePanel\}/);
  assert.doesNotMatch(app, /\{!sidebarCollapsed && <Sidebar/);
  assert.doesNotMatch(app, /t8-sidebar-toggle/);
  assert.doesNotMatch(app, /t8-main-layout--sidebar-collapsed/);

  // CSS：轨道 44px + 面板 264px
  assert.match(css, /\.t8-main-layout\s*\{[\s\S]*--t8-app-rail-width:\s*44px/);
  assert.match(css, /\.t8-main-layout\s*\{[\s\S]*--t8-shell-panel-width:\s*264px/);
  assert.match(css, /\.t8-app-rail\s*\{[\s\S]*width:\s*var\(--t8-app-rail-width\)/);
  assert.match(css, /\.t8-shell-panel\s*\{[\s\S]*width:\s*var\(--t8-shell-panel-width\)/);
  assert.match(css, /\.t8-app-rail__button\.is-active\s*\{[\s\S]*var\(--t8-accent/);
  assert.match(css, /\.t8-shell-panel__header\s*\{[\s\S]*height:\s*44px/);
  assert.match(css, /\.t8-main-layout > \.t8-canvas-shell\s*\{[\s\S]*min-width:\s*0/);
  assert.doesNotMatch(css, /\.t8-sidebar-toggle\s*\{/);
});
