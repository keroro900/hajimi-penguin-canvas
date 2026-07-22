import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string) {
  return fs.readFileSync(path.resolve(rel), 'utf8');
}

test('smart node composer coordinator store exposes the specified interface', () => {
  const store = read('src/stores/smartNodeComposer.ts');

  assert.match(store, /activeNodeId: string \| null/);
  assert.match(store, /open: \(nodeId: string\) => void/);
  assert.match(store, /close: \(nodeId\?: string\) => void/);
  assert.match(store, /useIsSmartNodeComposerOpen/);
  assert.match(store, /smartNodeComposerActions/);
  assert.doesNotMatch(store, /persist\(/);
});

test('smart node composer is a measured anchored dialog popover', () => {
  const composer = read('src/components/nodes/shared/SmartNodeComposer.tsx');

  // Dialog semantics and dismissal
  assert.match(composer, /role: 'dialog'/);
  assert.match(composer, /aria-modal.*false/);
  assert.match(composer, /onRequestClose/);
  assert.match(composer, /ariaLabel/);
  assert.match(composer, /closeLabel = '关闭'/);
  assert.match(composer, /event\.key !== 'Escape'/);
  assert.match(composer, /addEventListener\('pointerdown', handlePointerDown, true\)/);
  // Measured placement machinery
  assert.match(composer, /resolveComposerPlacement/);
  assert.match(composer, /ResizeObserver/);
  assert.match(composer, /requestAnimationFrame/);
  assert.match(composer, /data-placement/);
  assert.match(composer, /--t8-smart-composer-pointer-left/);
  assert.match(composer, /getBoundingClientRect/);
  assert.match(composer, /Math\.max\(popoverRect\.height,\s*popover\.scrollHeight\)/);
  // Focus management
  assert.match(composer, /initialFocusRef/);
  assert.match(composer, /fallbackFocusRef/);
  assert.match(composer, /data-canvas-focus-root/);
  // Legacy compatibility for existing consumers
  assert.match(composer, /createPortal/);
  assert.match(composer, /portal\?: boolean/);
  assert.match(composer, /anchorRef\?: RefObject<HTMLElement>/);
  assert.match(composer, /document\.body/);
  assert.match(composer, /onPointerDown/);
  assert.match(composer, /onPointerUp/);
  assert.match(composer, /onClick/);
  assert.match(composer, /t8-smart-node-composer--portal/);
  assert.match(composer, /data-canvas-floating-ui/);
});

test('composer portal CSS is bottom-only and owns constrained form scrolling', () => {
  const css = read('src/styles/theme-core.css');

  assert.match(css, /\.t8-smart-node-composer--portal/);
  assert.match(css, /data-placement='bottom'/);
  assert.doesNotMatch(css, /data-placement='top'/);
  assert.doesNotMatch(css, /data-placement='viewport'/);
  assert.match(css, /--t8-smart-composer-pointer-left/);
  assert.match(css, /--t8-smart-composer-caret-top/);
  assert.match(css, /\.t8-smart-node-composer--portal\s*\{[\s\S]*?min-height:\s*0/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /\.t8-smart-node-composer--portal\s*>\s*\*\s*\{[\s\S]*?min-height:\s*0/);
  assert.doesNotMatch(css, /animation:\s*t8-smart-composer-enter/);
  assert.doesNotMatch(css, /@keyframes t8-smart-composer-enter-/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /\.t8-smart-node-composer--portal::-webkit-scrollbar/);
  assert.match(css, /\.t8-smart-node-composer__close/);
});

test('compact smart composer bounds prompt overflow and reserves its action column', () => {
  const css = read('src/styles/theme-core.css');

  assert.match(css, /\.t8-smart-prompt-input\s*\{[\s\S]*?max-height:\s*150px[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.t8-smart-prompt-shell--compact \.t8-smart-prompt-input\s*\{[\s\S]*?max-height:\s*96px/);
  assert.match(css, /\.t8-smart-composer-row--params \.t8-smart-field\s*\{[\s\S]*?padding:\s*0[\s\S]*?border:\s*0[\s\S]*?background:\s*transparent/);
  assert.match(css, /\.t8-smart-composer-row--params \.t8-smart-run-btn\s*\{[\s\S]*?flex:\s*0 0 78px[\s\S]*?width:\s*78px[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.t8-smart-node-composer--portal \.t8-smart-composer-row--params\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(css, /@media \(max-width:\s*639px\)\s*\{[\s\S]*?\.t8-smart-node-composer--portal \.t8-smart-composer-row--params\s*\{[\s\S]*?flex-wrap:\s*wrap/);
});

test('composer settles its initial placement before display and focus cannot scroll it', () => {
  const composer = read('src/components/nodes/shared/SmartNodeComposer.tsx');

  assert.match(composer, /INITIAL_PLACEMENT_SETTLE_FRAMES\s*=\s*3/);
  assert.match(composer, /placementReady/);
  assert.match(composer, /measured && placementReady/);
  assert.match(composer, /focus\(\{\s*preventScroll:\s*true\s*\}\)/);
});

test('smart node shell exposes group role, keyboard activation, and state attributes', () => {
  const shell = read('src/components/nodes/shared/SmartNodeShell.tsx');

  assert.match(shell, /t8-smart-node-shell relative overflow-visible/);
  assert.match(shell, /accessibleLabel/);
  assert.match(shell, /role=\{accessibleLabel \? 'group' : undefined\}/);
  assert.match(shell, /onKeyboardActivate/);
  assert.match(shell, /event\.target !== event\.currentTarget/);
  assert.match(shell, /event\.key !== ' '/);
  assert.doesNotMatch(shell, /event\.key !== 'Enter'/);
  assert.match(shell, /tabIndex=\{onKeyboardActivate \? 0 : undefined\}/);
  assert.match(shell, /data-smart-state/);
  assert.match(shell, /stateAttrs/);
});

test('resize pointer gestures suppress smart-card property popovers', () => {
  const toggle = read('src/components/nodes/shared/useSmartNodePanelToggle.ts');

  assert.match(toggle, /isResizeTarget/);
  assert.match(toggle, /if \(isResizeTarget\(event\.target\)\) \{[\s\S]*suppressClickRef\.current = true/);
  assert.match(toggle, /if \(open\) onDragClose\?\.\(\)/);
});

test('migrated smart nodes derive composer visibility from the coordinator', () => {
  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx', 'UploadNode.tsx', 'OutputNode.tsx', 'LLMNode.tsx', 'AudioNode.tsx', 'MaterialSetNode.tsx']) {
    const source = read(`src/components/nodes/${file}`);

    assert.match(source, /from '\.\.\/\.\.\/stores\/smartNodeComposer'/, file);
    assert.match(source, /useIsSmartNodeComposerOpen\(id\)/, file);
    assert.match(source, /smartNodeComposerActions\.open\(id\)/, file);
    assert.match(source, /smartNodeComposerActions\.close\(id\)/, file);
    assert.doesNotMatch(source, /smartComposerOpenLocal,\s*setSmartComposerOpenLocal\]\s*=\s*useState/, file);
    // The composer owns outside dismissal; the node-level useOutsideClose is
    // retained (coordinator-backed) to keep ignoring portalled prompt editors.
    assert.match(source, /useOutsideClose\(\{[\s\S]*onOutside: \(\) => setSmartComposerOpenLocal\(false\)/, file);
    // Dialog wiring + accessible labels
    assert.match(source, /onRequestClose=\{\(\) => setSmartComposerOpenLocal\(false\)\}/, file);
    assert.match(source, /ariaLabel="[^"]+节点属性"/, file);
    assert.match(source, /accessibleLabel=/, file);
    assert.match(source, /smartState=\{smart\w+CardState\}/, file);
    assert.match(source, /onKeyboardActivate=/, file);
    // Existing integration points stay intact
    assert.match(source, /useSmartNodePanelToggle/, file);
    assert.match(source, /<SmartNodeComposer[\s\S]*portal[\s\S]*anchorRef=\{smartNodeRef\}/, file);
    // Variant switch only exists on nodes that keep a classic variant.
    if (file !== 'OutputNode.tsx' && file !== 'LLMNode.tsx') {
      assert.match(source, /切回卡片版节点|切换到经典版节点/, file);
    }
    // initialFocusRef is only wired on composers with a prompt focus target.
    if (file !== 'UploadNode.tsx' && file !== 'OutputNode.tsx' && file !== 'MaterialSetNode.tsx') {
      assert.match(source, /initialFocusRef=\{smartPromptRef\}/, file);
    }
  }
});

test('seedance node ignores persisted composer-open fields (session-only open state)', () => {
  const seedance = read('src/components/nodes/SeedanceNode.tsx');

  assert.doesNotMatch(seedance, /Boolean\(\(data as any\)\?\.smartComposerOpen\)/);
  assert.doesNotMatch(seedance, /smartComposerOpen:\s*/);
  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx', 'UploadNode.tsx', 'OutputNode.tsx', 'LLMNode.tsx', 'AudioNode.tsx', 'MaterialSetNode.tsx']) {
    assert.doesNotMatch(read(`src/components/nodes/${file}`), /smartComposerOpen:\s*/, file);
  }
});

test('canvas root exposes a programmatic focus root for composer focus return', () => {
  const canvas = read('src/components/Canvas.tsx');

  assert.match(canvas, /data-canvas-focus-root/);
  assert.match(canvas, /tabIndex=\{-1\}/);
});

test('image op frame and combine node derive composer visibility from the coordinator', () => {
  for (const file of ['ImageOpFrame.tsx', 'CombineNode.tsx']) {
    const source = read(`src/components/nodes/${file}`);

    assert.match(source, /from '\.\.\/\.\.\/stores\/smartNodeComposer'/, file);
    assert.match(source, /useIsSmartNodeComposerOpen\(id\)/, file);
    assert.match(source, /smartNodeComposerActions\.open\(id\)/, file);
    assert.match(source, /smartNodeComposerActions\.close\(id\)/, file);
    assert.doesNotMatch(source, /smartComposerOpenLocal,\s*setSmartComposerOpenLocal\]\s*=\s*useState/, file);
    // The composer owns outside dismissal; the node-level useOutsideClose is
    // retained (coordinator-backed) to keep ignoring portalled floating editors.
    assert.match(source, /useOutsideClose\(\{[\s\S]*onOutside: \(\) => setSmartComposerOpenLocal\(false\)/, file);
    // Dialog wiring + accessible labels
    assert.match(source, /onRequestClose=\{\(\) => setSmartComposerOpenLocal\(false\)\}/, file);
    assert.match(source, /accessibleLabel=/, file);
    assert.match(source, /smartState=\{smart\w+CardState\}/, file);
    assert.match(source, /onKeyboardActivate=/, file);
    // Existing integration points stay intact
    assert.match(source, /useSmartNodePanelToggle/, file);
    assert.match(source, /<SmartNodeComposer[\s\S]*portal[\s\S]*anchorRef=\{smartNodeRef\}/, file);
    // Open is gated on local coordinator state + drag state only (no useState open flag)
    assert.match(source, /smartComposerOpenLocal && !smartCardDragging && !dragging/, file);
    assert.doesNotMatch(source, /smartComposerOpen:\s*/, file);
  }

  // CombineNode is a standalone node: literal Chinese labels.
  const combine = read('src/components/nodes/CombineNode.tsx');
  assert.match(combine, /accessibleLabel="合并节点"/);
  assert.match(combine, /ariaLabel="合并节点属性"/);

  // ImageOpFrame delegates its labels to wrapper-supplied props.
  const frame = read('src/components/nodes/ImageOpFrame.tsx');
  assert.match(frame, /accessibleLabel=\{accessibleLabel \|\| `\$\{title\}节点`\}/);
  assert.match(frame, /ariaLabel=\{composerAriaLabel \|\| `\$\{title\}节点属性`\}/);

  // Wrapper nodes supply their Chinese names through the frame.
  const upscale = read('src/components/nodes/UpscaleNode.tsx');
  assert.match(upscale, /composerAriaLabel="放大节点属性"/);
  assert.match(upscale, /dragging=\{p\.dragging\}/);
  const resize = read('src/components/nodes/ResizeNode.tsx');
  assert.match(resize, /composerAriaLabel="调整尺寸节点属性"/);
  assert.match(resize, /dragging=\{p\.dragging\}/);
  const removeBg = read('src/components/nodes/RemoveBgNode.tsx');
  assert.match(removeBg, /composerAriaLabel="抠图节点属性"/);
  assert.match(removeBg, /dragging=\{p\.dragging\}/);
  const gridCrop = read('src/components/nodes/GridCropNode.tsx');
  assert.match(gridCrop, /composerAriaLabel="网格切图节点属性"/);
  assert.match(gridCrop, /dragging=\{p\.dragging\}/);
  const lutColor = read('src/components/nodes/LutColorNode.tsx');
  assert.match(lutColor, /composerAriaLabel="LUT 调色节点属性"/);
  assert.match(lutColor, /dragging=\{p\.dragging\}/);
});

test('image op frame closed card keeps settings and the run button inside the composer', () => {
  const frame = read('src/components/nodes/ImageOpFrame.tsx');
  const composerStart = frame.indexOf('<SmartNodeComposer');
  assert.ok(composerStart > 0, 'frame renders a SmartNodeComposer');
  const cardSource = frame.slice(0, composerStart);
  const composerSource = frame.slice(composerStart);
  assert.ok(!cardSource.includes('renderSettings()'), 'settings render inside the composer only');
  assert.ok(!cardSource.includes('处理中...'), 'run button renders inside the composer only');
  assert.ok(composerSource.includes('renderSettings()'), 'composer renders the settings form');
  assert.ok(composerSource.includes('处理中...'), 'composer renders the run button');
  // The same runOp flow backs both the composer button and the run bus.
  assert.match(frame, /useRunTrigger\(id, handleRun\)/);
  assert.match(composerSource, /onClick=\{handleRun\}/);
});
