import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('CanvasModalPortal owns portal, dialog, isolation, and capture lifecycle', () => {
  const portal = read('../src/components/CanvasModalPortal.tsx');
  assert.match(portal, /createPortal\([\s\S]*document\.body\s*\)/);
  assert.match(portal, /createModalController(?:<[^>]+>)?\s*\(/);
  assert.match(portal, /acquireCanvasModalIsolation\(Array\.from\(document\.body\.children\),\s*portalRoot\)/);
  assert.match(portal, /useLayoutEffect\s*\(/);
  assert.match(portal, /controller\.activate\(\)/);
  assert.match(portal, /document\.addEventListener\('keydown',\s*handleKey,\s*true\)/);
  assert.match(portal, /document\.removeEventListener\('keydown',\s*handleKey,\s*true\)/);
  assert.match(portal, /if \(!portalRoot \|\| !isTopCanvasModalIsolation\(portalRoot\)\) return;/);
  assert.match(portal, /className=\{`t8-canvas-modal-backdrop/);
  assert.match(portal, /className=\{`t8-canvas-modal-dialog/);
  assert.match(portal, /role="dialog"/);
  assert.match(portal, /aria-modal="true"/);
  assert.match(portal, /aria-label=\{label\}/);
  assert.match(portal, /onEscapeBeforeClose/);
  assert.match(portal, /initialFocusRef/);
  assert.match(portal, /document\.activeElement/);
  assert.match(portal, /onClick=\{controller\.handleBackdrop\}/);
});

test('CanvasToolbar delegates Escape recording precedence to the portal', () => {
  const toolbar = read('../src/components/CanvasToolbar.tsx');
  assert.match(toolbar, /import CanvasModalPortal from ['"]\.\/CanvasModalPortal['"]/);
  assert.doesNotMatch(toolbar, /className=\{`fixed inset-0 z-50/);
  assert.match(toolbar, /<CanvasModalPortal/);
  assert.match(toolbar, /initialFocusRef=\{shortcutCloseRef\}/);
  assert.match(toolbar, /onEscapeBeforeClose=\{interceptShortcutEscape\}/);
  assert.match(toolbar, /aria-label="关闭快捷键设置"/);
  assert.match(toolbar, /const interceptShortcutEscape = \(\) => \{[\s\S]*if \(!recordingActionId\) return false;[\s\S]*setRecordingActionId\(null\);[\s\S]*return true;[\s\S]*\};/);

  const recorder = toolbar.slice(
    toolbar.indexOf('const onKeyDown = (event: KeyboardEvent) => {', toolbar.indexOf('if (!recordingActionId) return;')),
    toolbar.indexOf("window.addEventListener('keydown', onKeyDown, true)", toolbar.indexOf('if (!recordingActionId) return;')),
  );
  const escapeIndex = recorder.indexOf("event.key === 'Escape'");
  assert.ok(escapeIndex >= 0);
  assert.ok(escapeIndex < recorder.indexOf('event.preventDefault()'));
  assert.ok(escapeIndex < recorder.indexOf('event.stopPropagation()'));
});

test('Canvas suppresses window shortcut actions while modal-active', () => {
  const canvas = read('../src/components/Canvas.tsx');
  assert.match(canvas, /import \{ isCanvasModalActive \} from ['"]\.\.\/utils\/modalIsolation['"]/);

  const connectionHandler = canvas.slice(
    canvas.indexOf('const onKeyDown = (event: KeyboardEvent) => {', canvas.indexOf('const connectPendingToHandle')),
    canvas.indexOf("window.addEventListener('keydown', onKeyDown, true)", canvas.indexOf('const connectPendingToHandle')),
  );
  assert.match(connectionHandler, /if \(isCanvasModalActive\(\)\) return;[\s\S]*connection\.pan-mode/);

  const shortcutEffect = canvas.slice(
    canvas.lastIndexOf('const onKey = (e: KeyboardEvent) => {'),
    canvas.lastIndexOf("window.addEventListener('keydown', onKey)"),
  );
  assert.match(shortcutEffect, /if \(isCanvasModalActive\(\)\) return;/);
  assert.match(shortcutEffect, /shortcuts\['canvas\.undo'\]/);
  assert.match(shortcutEffect, /shortcuts\['canvas\.delete'\]/);
});

test('shared modal CSS uses structural layer tokens and an elevated body', () => {
  const css = read('../src/styles/theme-core.css');
  assert.match(css, /\.t8-canvas-modal-backdrop\s*\{[\s\S]*z-index:\s*var\(--t8-z-modal-backdrop\)/);
  assert.match(css, /\.t8-canvas-modal-dialog\s*\{[\s\S]*z-index:\s*var\(--t8-z-modal-dialog\)[\s\S]*background:\s*var\(--t8-bg-panel-elevated\)/);
});
