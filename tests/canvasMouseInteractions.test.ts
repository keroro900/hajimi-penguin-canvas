import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('canvas pans with middle drag until long press commits to radial menu', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /const CANVAS_PAN_MOUSE_BUTTONS = \[0\] as const;/);
  assert.match(canvas, /const RADIAL_MENU_MOUSE_BUTTON = 1;/);
  assert.doesNotMatch(canvas, /const RADIAL_MENU_MODIFIER_KEY/);
  assert.match(canvas, /const MIDDLE_PAN_MOUSE_BUTTON = 1;/);
  assert.match(canvas, /const MIDDLE_PAN_MOVE_TOLERANCE = 4;/);
  assert.match(canvas, /canvasPanLocked \? false : \[\.\.\.CANVAS_PAN_MOUSE_BUTTONS\]/);
  assert.match(canvas, /middlePanRef = useRef<MiddlePanState \| null>\(null\)/);
  assert.match(canvas, /setViewport\(\{\s*x: middlePan\.viewport\.x \+ dx,/);
  assert.match(canvas, /event\.button !== RADIAL_MENU_MOUSE_BUTTON/);
  assert.match(canvas, /radialContextMenuSuppressedUntilRef/);
  assert.match(canvas, /if \(isRadialMenuContextMenuSuppressed\(\)\) \{/);

  const radialGestureBlock = canvas.slice(
    canvas.indexOf('const openRadialFromPress = (press: RadialPressState) => {'),
    canvas.indexOf("window.addEventListener('blur', closeRadial);"),
  );
  assert.match(radialGestureBlock, /stopRadialPointerEvent\(event\);[\s\S]*const start = \{ x: event\.clientX, y: event\.clientY \};/);
  assert.doesNotMatch(radialGestureBlock, /wantsRadialMenu|shiftKey|if \(!wantsRadialMenu\) return;/);
  assert.match(radialGestureBlock, /const openRadialFromPress = \(press: RadialPressState\) => \{[\s\S]*clearMiddlePan\(\);[\s\S]*radialMenuRef\.current = next;/);
  assert.match(radialGestureBlock, /if \(middlePanRef\.current\?\.(?:dragging|pointerId)\) return;/);
  assert.match(radialGestureBlock, /distanceBetween\(middlePan\.start, point\) > MIDDLE_PAN_MOVE_TOLERANCE/);
  assert.match(radialGestureBlock, /suppressMiddlePanAuxClick\(\)/);
  assert.match(radialGestureBlock, /clearPress\(\);/);
  assert.doesNotMatch(radialGestureBlock, /event\.button !== 2/);
  assert.doesNotMatch(radialGestureBlock, /event\.button === 2/);
});

test('smart card media results stay draggable as nodes until explicit file drag-out chord', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /const isSmartNodeCardDragSource = \(source: HTMLElement\) =>/);
  assert.match(canvas, /source\.closest\('\.t8-smart-node-card'\)/);
  assert.match(canvas, /if \(!isSmartNodeCardDragSource\(source\)\) \{/);

  const armSourceBlock = canvas.slice(
    canvas.indexOf('const armSource = (source: HTMLElement) => {'),
    canvas.indexOf('const clearCandidate = () => {'),
  );
  assert.match(
    armSourceBlock,
    /if \(!isSmartNodeCardDragSource\(source\)\) \{\s*source\.classList\.add\('nodrag', 'nopan'\);\s*\}/,
  );
});

test('group box drag keeps member nodes locked to their starting relative positions', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /memberPositions:\s*Record<string,\s*\{\s*x:\s*number;\s*y:\s*number\s*\}>/);
  assert.match(canvas, /const memberPositions:\s*Record<string,\s*\{\s*x:\s*number;\s*y:\s*number\s*\}>\s*=\s*\{\};/);
  assert.match(canvas, /groupDragRef\.current\s*=\s*\{[\s\S]*startX:\s*node\.position\.x,[\s\S]*startY:\s*node\.position\.y,[\s\S]*memberPositions,/);

  const groupDragBlock = canvas.slice(
    canvas.indexOf('// 拖动 GroupBox 节点: 联动所有成员节点同步偏移'),
    canvas.indexOf('if (!snapEnabled) return;'),
  );
  assert.match(groupDragBlock, /const dx = node\.position\.x - ref\.startX;/);
  assert.match(groupDragBlock, /const dy = node\.position\.y - ref\.startY;/);
  assert.match(groupDragBlock, /const initial = ref\.memberPositions\[n\.id\];/);
  assert.match(groupDragBlock, /position:\s*\{\s*x:\s*initial\.x \+ dx,\s*y:\s*initial\.y \+ dy\s*\}/);
  assert.doesNotMatch(groupDragBlock, /lastX|lastY|liveMembers|n\.position\.x \+ dx|n\.position\.y \+ dy/);
});
