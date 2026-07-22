import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  nextTogglePreference,
  resolveMigratedPreference,
  resolveSystemTheme,
} from '../src/theme/appearance.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(path: string) {
  return readFileSync(resolve(__dirname, '..', path), 'utf8');
}

test('JimiLogo component exists with symbol/lockup variants and JIMI identity', () => {
  const src = read('src/components/brand/JimiLogo.tsx');
  assert.match(src, /data-jimi-logo/);
  assert.match(src, /JIMI AI/);
  assert.match(src, /variant\?:\s*'symbol' \| 'lockup'/);
  assert.match(src, /--t8-brand-accent/);
  assert.match(src, /--t8-brand-pebble-eye/);
  // Soft Pebble: 无猫耳等遗留动物特征
  assert.doesNotMatch(src, /猫|cat|whisker|ear/i);
});

test('JIMI mark favicon exists', () => {
  const svg = read('public/jimi-mark.svg');
  assert.match(svg, /<svg/);
  assert.match(svg, /#5f8dff/i);
});

test('jimi-foundation.css is imported first in index.css', () => {
  const css = read('src/styles/index.css');
  const foundationIdx = css.indexOf("@import './jimi-foundation.css';");
  const coreIdx = css.indexOf("@import './theme-core.css';");
  const pixelIdx = css.indexOf("@import './theme-pixel.css';");
  assert.ok(foundationIdx >= 0, 'jimi-foundation.css should be imported');
  assert.ok(foundationIdx < pixelIdx, 'foundation should load before theme-pixel.css');
  assert.ok(foundationIdx < coreIdx, 'foundation should load before theme-core.css');
});

test('jimi-foundation.css defines brand tokens and pre-boot JIMI dark fallbacks', () => {
  const css = read('src/styles/jimi-foundation.css');
  assert.match(css, /--t8-brand-accent:\s*#5f8dff/);
  assert.match(css, /--t8-brand-pebble-eye:/);
  assert.match(css, /--t8-bg-app:\s*#121214/);
  assert.match(css, /--t8-accent:\s*#5f8dff/);
});

test('canvas stays solid globally without mounting ReactFlow background artwork', () => {
  const canvas = read('src/components/Canvas.tsx');
  const css = read('src/styles/index.css');
  assert.doesNotMatch(canvas, /\bBackground\b/);
  assert.match(
    css,
    /\.t8-canvas-shell\s+\.react-flow__background\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    css,
    /\.t8-canvas-shell\s+\.react-flow__background\s*\{[^}]*background:\s*transparent/s,
  );
});

test('tech-default template is renamed JIMI Default with solid visuals', () => {
  const src = read('src/theme/defaultTemplates.ts');
  assert.match(src, /name:\s*'JIMI Default'/);
  assert.match(src, /headerMark:\s*'JIMI'/);
  assert.match(src, /canvasPattern:\s*'none'/);
  // tech-default 条目不再保留旧名称（其他模板名称不受影响）
  const techEntry = src.slice(src.indexOf('id: TECH_TEMPLATE_ID'), src.indexOf('id: TECH_TEMPLATE_ID') + 800);
  assert.doesNotMatch(techEntry, /科技风/);
  assert.match(src, /#5f8dff/);
  assert.match(src, /#2f6df6/);
});

test('branding surfaces identify as JIMI AI', () => {
  const indexHtml = read('index.html');
  assert.match(indexHtml, /<title>JIMI AI<\/title>/);
  assert.match(indexHtml, /\/jimi-mark\.svg/);
  assert.match(indexHtml, /JIMI AI 正在启动/);

  const appSrc = read('src/App.tsx');
  // 顶栏已整体移除：App.tsx 不含 t8-topbar，也不再有版本号 chip
  assert.doesNotMatch(appSrc, /t8-topbar/);
  assert.doesNotMatch(appSrc, /__APP_VERSION__/);
  assert.match(appSrc, /startSystemThemeSync/);
  assert.match(appSrc, /跟随系统/);

  // 品牌符号标（symbol 变体）由应用轨道承载
  const railSrc = read('src/components/shell/AppRail.tsx');
  assert.match(railSrc, /import JimiLogo from '\.\.\/brand\/JimiLogo'/);
  assert.match(railSrc, /<JimiLogo variant="symbol"/);

  const canvasSrc = read('src/components/Canvas.tsx');
  assert.match(canvasSrc, />JIMI AI</);

  const electronSrc = read('electron/main.cjs');
  assert.match(electronSrc, /JIMI AI v\$\{APP_VERSION\}/);

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.build.productName, 'JIMI AI');
  assert.equal(pkg.author, 'JIMI AI');
  assert.match(pkg.description, /^JIMI AI/);
  // 升级连续性：name 与 appId 不变
  assert.equal(pkg.name, 'hajimi-canvas');
  assert.equal(pkg.build.appId, 'cn.hajimi.canvas');
});

test('theme store persists appearancePreference and syncs system theme', () => {
  const store = read('src/stores/theme.ts');
  assert.match(store, /appearancePreference: AppearancePreference/);
  assert.match(store, /appearancePreference: state\.appearancePreference/);
  assert.match(store, /resolveMigratedPreference/);
  assert.match(store, /export function startSystemThemeSync/);
  assert.match(store, /prefers-color-scheme: dark/);

  const manager = read('src/components/ThemeTemplateManager.tsx');
  assert.match(manager, /跟随系统/);
  assert.match(manager, /setAppearancePreference\('system'\)/);
});

// ---------- 纯逻辑测试：迁移 / 切换 ----------

test('resolveMigratedPreference keeps an existing explicit or system preference', () => {
  assert.equal(resolveMigratedPreference({ appearancePreference: 'system', theme: 'dark' }), 'system');
  assert.equal(resolveMigratedPreference({ appearancePreference: 'light', theme: 'dark' }), 'light');
  assert.equal(resolveMigratedPreference({ appearancePreference: 'dark', theme: 'light' }), 'dark');
});

test('resolveMigratedPreference migrates legacy theme-only stores to explicit preference', () => {
  assert.equal(resolveMigratedPreference({ theme: 'dark' }), 'dark');
  assert.equal(resolveMigratedPreference({ theme: 'light' }), 'light');
  assert.equal(resolveMigratedPreference({}), 'light');
  assert.equal(resolveMigratedPreference({ appearancePreference: 'bogus', theme: 'dark' }), 'dark');
});

test('resolveSystemTheme maps matchMedia result', () => {
  assert.equal(resolveSystemTheme(true), 'dark');
  assert.equal(resolveSystemTheme(false), 'light');
});

test('nextTogglePreference from system picks the explicit opposite of the resolved theme', () => {
  assert.equal(nextTogglePreference('system', 'dark'), 'light');
  assert.equal(nextTogglePreference('system', 'light'), 'dark');
});

test('nextTogglePreference flips explicit preferences', () => {
  assert.equal(nextTogglePreference('light', 'light'), 'dark');
  assert.equal(nextTogglePreference('dark', 'dark'), 'light');
});
