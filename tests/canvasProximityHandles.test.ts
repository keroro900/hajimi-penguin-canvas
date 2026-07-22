import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canvas = readFileSync(resolve(root, 'src/components/Canvas.tsx'), 'utf8');

function callbackBody(name: string): string {
  const start = canvas.indexOf(`const ${name} = useCallback(`);
  assert.notEqual(start, -1, `${name} callback is present`);
  const next = canvas.indexOf('\n  const ', start + 1);
  return canvas.slice(start, next === -1 ? canvas.length : next);
}

test('Canvas owns one proximity controller for the actual shell element', () => {
  assert.match(
    canvas,
    /import\s*\{[^}]*createProximityHandleController[^}]*type ProximityHandleController[^}]*\}\s*from '\.\.\/utils\/proximityHandleController';/s,
  );
  assert.match(
    canvas,
    /const \[canvasShellElement, setCanvasShellElement\] = useState<HTMLDivElement \| null>\(null\);/,
  );
  assert.match(
    canvas,
    /const proximityHandleControllerRef = useRef<ProximityHandleController \| null>\(null\);/,
  );
  assert.match(canvas, /const controller = createProximityHandleController\(canvasShellElement\);/);
  assert.match(canvas, /proximityHandleControllerRef\.current = controller;/);
  assert.match(canvas, /\}, \[canvasShellElement\]\);/);
});

test('source lifecycle contract assigns the callback ref to both mutually exclusive shell roots', () => {
  const shellTags = canvas.match(/<div\s+ref=\{setCanvasShellElement\}\s+className=(?:"t8-canvas-shell[^"]*"|\{`t8-canvas-shell[^`]*`\})/g) ?? [];
  assert.equal(shellTags.length, 2);
});

test('controller lifecycle installs and removes the exact capture listeners before dispose', () => {
  const effectStart = canvas.indexOf('const controller = createProximityHandleController(canvasShellElement);');
  assert.notEqual(effectStart, -1);
  const effectEnd = canvas.indexOf('}, [canvasShellElement]);', effectStart);
  assert.notEqual(effectEnd, -1);
  const effect = canvas.slice(effectStart, effectEnd);

  for (const [target, event, handler] of [
    ['canvasShellElement', 'pointermove', 'onPointerMove'],
    ['canvasShellElement', 'pointerdown', 'onPointerDown'],
    ['window', 'pointerup', 'onPointerUp'],
    ['window', 'pointercancel', 'onPointerCancel'],
    ['window', 'blur', 'onBlur'],
  ]) {
    assert.match(effect, new RegExp(`${target}\\.addEventListener\\('${event}', ${handler}, true\\);`));
    assert.match(effect, new RegExp(`${target}\\.removeEventListener\\('${event}', ${handler}, true\\);`));
  }

  const removeLastListener = effect.lastIndexOf('removeEventListener');
  const dispose = effect.indexOf('controller.dispose();');
  const guardedClear = effect.indexOf('if (proximityHandleControllerRef.current === controller)');
  assert.ok(removeLastListener < dispose, 'listeners are removed before dispose');
  assert.ok(dispose < guardedClear, 'the ref is cleared only after disposing its owning controller');
});

test('selection forwarding preserves the last-selected ids behavior', () => {
  const body = callbackBody('onSelectionChange');
  assert.match(body, /const selectedIds = ns\.map\(\(n\) => n\.id\);/);
  assert.match(body, /lastSelectedIdsRef\.current = selectedIds;/);
  assert.match(
    body,
    /proximityHandleControllerRef\.current\?\.selectionChange\(new Set\(selectedIds\)\);/,
  );
  assert.equal(body.match(/ns\.map\(\(n\) => n\.id\)/g)?.length, 1);
});

test('terminal connection finalizer ends the controller guard and resets pan mode', () => {
  const finalizer = callbackBody('finalizeConnectionPanMode');
  assert.match(finalizer, /proximityHandleControllerRef\.current\?\.connectionEnd\(\);/);
  assert.match(finalizer, /resetConnectionPanMode\(\);/);
  assert.match(finalizer, /\[resetConnectionPanMode\]/);
});

test('connection guard starts after validation and finalizes after the pan-mode continuation branch', () => {
  const start = callbackBody('onConnectStart');
  const validation = start.indexOf('if (!params.nodeId || !params.handleType) return;');
  const connectionStart = start.indexOf('proximityHandleControllerRef.current?.connectionStart();');
  assert.ok(validation >= 0 && connectionStart > validation);

  const end = callbackBody('onConnectEnd');
  const panBranch = end.indexOf('if (connectionPanModeRef.current && from && !droppedOnHandle && !bulkReconnectRef.current)');
  const panReturn = end.indexOf('return;', panBranch);
  const finalizer = end.indexOf('finalizeConnectionPanMode();');
  const bulkBranch = end.indexOf('if (bulkReconnectRef.current)');
  assert.ok(panBranch >= 0 && panReturn > panBranch);
  assert.ok(finalizer > panReturn, 'pan continuation leaves the controller logically active');
  assert.ok(bulkBranch > finalizer, 'all bulk and normal completion paths end the guard');
  assert.doesNotMatch(end, /proximityHandleControllerRef\.current\?\.connectionEnd\(\);/);
});

test('connect, target-click, shortcut cancellation, and blur all reach the terminal finalizer', () => {
  const connect = callbackBody('onConnect');
  assert.match(connect, /finalizeConnectionPanMode\(\);/);
  assert.doesNotMatch(connect, /resetConnectionPanMode\(\);/);
  assert.match(connect, /\[finalizeConnectionPanMode,/);

  const panEffectStart = canvas.indexOf('// 拉线时按 Space 进入“连线导航”模式');
  const panEffectEnd = canvas.indexOf('// ===== 全局 SHIFT+Handle', panEffectStart);
  assert.ok(panEffectStart >= 0 && panEffectEnd > panEffectStart);
  const panEffect = canvas.slice(panEffectStart, panEffectEnd);
  assert.match(panEffect, /connectingFromRef\.current = null;\s+onConnect\(params\);/);
  assert.match(panEffect, /if \(handle\) \{[\s\S]*?connectPendingToHandle\(handle\);[\s\S]*?return;/);
  assert.match(
    panEffect,
    /if \(connectionPanModeRef\.current\) \{\s+connectingFromRef\.current = null;\s+finalizeConnectionPanMode\(\);\s+return;/,
  );
  assert.match(panEffect, /const onBlur = \(\) => finalizeConnectionPanMode\(\);/);
  assert.match(panEffect, /\[getViewport, onConnect, finalizeConnectionPanMode,/);
});

test('integration does not add per-node listeners or React state for handle side', () => {
  assert.doesNotMatch(
    canvas,
    /querySelectorAll\([^)]*\.react-flow__node[^)]*\)[\s\S]{0,300}addEventListener/,
  );
  assert.doesNotMatch(canvas, /useState(?:<[^>]*>)?\([^)]*(?:handleSide|handle-side)[^)]*\)/i);
});
