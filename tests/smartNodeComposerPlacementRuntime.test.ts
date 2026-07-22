import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const composer = readFileSync(
  new URL('../src/components/nodes/shared/SmartNodeComposer.tsx', import.meta.url),
  'utf8',
);
const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');

test('composer uses one coalescing scheduler and a separate bounded three-frame startup', () => {
  assert.match(composer, /createFrameScheduler/);
  assert.match(composer, /INITIAL_PLACEMENT_SETTLE_FRAMES\s*=\s*3/);
  assert.match(composer, /startupFrame\s*=\s*window\.requestAnimationFrame\(settle\)/);
  assert.doesNotMatch(composer, /const tick\s*=|requestAnimationFrame\(tick\)/);
  assert.match(composer, /placementsEqual\(prev, withCaret\)\s*\?\s*prev\s*:\s*withCaret/);
});

test('composer rebinds observation when its anchor identity changes', () => {
  assert.match(composer, /const rebindPlacementTargets = \(targets:/);
  assert.match(composer, /latestAnchor\.closest\('\.react-flow'\)/);
  assert.match(composer, /latestAnchor\.closest\('\.react-flow__node'\)/);
  assert.match(composer, /querySelector\('\.react-flow__viewport'\)/);
  assert.match(composer, /new MutationObserver\(schedulePlacement\)/);
  assert.match(composer, /attributeFilter:\s*\['style',\s*'class'\]/);
  assert.match(composer, /resizeObserver\.unobserve\(observedAnchor\)/);
  assert.match(composer, /resizeObserver\.observe\(latestAnchor\)/);
  assert.match(composer, /resizeObserver\.observe\(popover\)/);
  assert.match(composer, /const rootObserver = new MutationObserver\(\(\) => \{[\s\S]*?rebindPlacementTargets\(latestTargets\);[\s\S]*?schedulePlacement\(\)/);
  assert.match(composer, /rootObserver\.observe\(reactFlowRoot, \{ childList: true, subtree: true \}\)/);
  assert.match(composer, /rootObserver\.disconnect\(\)/);
});

test('composer owns Escape in capture and restores focus through one helper', () => {
  assert.match(composer, /const restoreFocusAfterClose = useCallback/);
  assert.match(composer, /anchor\?\.isConnected/);
  assert.match(composer, /event\.stopImmediatePropagation\(\)/);
  assert.match(composer, /addEventListener\('keydown', handleKeyDown, true\)/);
  assert.match(composer, /removeEventListener\('keydown', handleKeyDown, true\)/);

  const escapeBlock = composer.slice(
    composer.indexOf('const handleKeyDown = (event: KeyboardEvent) =>'),
    composer.indexOf("window.addEventListener('keydown', handleKeyDown"),
  );
  assert.match(escapeBlock, /if \(event\.key !== 'Escape'\) return;[\s\S]*const targetInside = [\s\S]*const activeInside = /);
  assert.match(escapeBlock, /if \(!targetInside && !activeInside\) return/);
  assert.match(escapeBlock, /event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\)/);
  assert.match(escapeBlock, /onRequestCloseRef\.current\?\.\(\);[\s\S]*restoreFocusAfterClose\(\)/);

  const closeButtonBlock = composer.slice(
    composer.indexOf('className="t8-smart-node-composer__close"'),
    composer.indexOf('</button>', composer.indexOf('className="t8-smart-node-composer__close"')),
  );
  assert.match(closeButtonBlock, /onRequestCloseRef\.current\?\.\(\);[\s\S]*restoreFocusAfterClose\(\)/);
});

test('composer defers Escape from unrelated targets and higher modal layers', () => {
  const escapeBlock = composer.slice(
    composer.indexOf('const handleKeyDown = (event: KeyboardEvent) =>'),
    composer.indexOf("window.addEventListener('keydown', handleKeyDown"),
  );
  assert.match(escapeBlock, /document\.querySelectorAll<HTMLElement>\('\[aria-modal="true"\]'\)/);
  assert.match(escapeBlock, /\.find\(\(modal\) => !popover\.contains\(modal\)\)/);
  assert.match(escapeBlock, /if \(higherModal\) return/);
  assert.ok(escapeBlock.indexOf('if (!targetInside && !activeInside) return') < escapeBlock.indexOf('event.stopImmediatePropagation()'));
  assert.ok(escapeBlock.indexOf('if (higherModal) return') < escapeBlock.indexOf('event.stopImmediatePropagation()'));
});

test('root observer ignores unrelated subtree mutations when placement identities stay connected', () => {
  const observerBlock = composer.slice(
    composer.indexOf('const rootObserver = new MutationObserver'),
    composer.indexOf('if (reactFlowRoot)', composer.indexOf('const rootObserver = new MutationObserver')),
  );
  assert.match(observerBlock, /const latestTargets = readPlacementTargets\(\)/);
  assert.match(observerBlock, /const identitiesUnchanged =/);
  assert.match(observerBlock, /const connectivityChanged =/);
  assert.match(observerBlock, /if \(identitiesUnchanged && !connectivityChanged\) return/);
  assert.ok(observerBlock.indexOf('return;') < observerBlock.indexOf('rebindPlacementTargets(latestTargets)'));
  assert.ok(observerBlock.indexOf('return;') < observerBlock.indexOf('schedulePlacement()'));
});

test('canvas capture keyboard handlers defer to an active smart composer', () => {
  assert.match(canvas, /const isSmartNodeComposerKeyboardEvent = \(event: KeyboardEvent\) =>/);
  assert.match(canvas, /\[data-canvas-floating-ui="smart-node-composer"\]/);
  assert.match(canvas, /isSmartNodeComposerTarget\(event\.target\)[\s\S]*isSmartNodeComposerTarget\(document\.activeElement\)/);
  const captureRegistrations = canvas.match(/window\.addEventListener\('keydown', \w+, true\)/g) ?? [];
  const composerGuards = canvas.match(/if \(isSmartNodeComposerKeyboardEvent\((?:event|kev)\)\) return;/g) ?? [];
  assert.equal(captureRegistrations.length, 3, 'expected all three Canvas capture-keyboard paths');
  assert.equal(composerGuards.length, captureRegistrations.length, 'every capture-keyboard path must guard composer ownership');
});

test('nonportal dialogs are immediately eligible for initial focus', () => {
  assert.match(composer, /const focusReady = !shouldPortal \|\| placementReady/);
  assert.match(composer, /if \(!dialogMode \|\| !focusReady\) return/);
});

test('composer event signals schedule placement and pointer tracking is canvas-owned', () => {
  assert.match(composer, /addEventListener\('resize', schedulePlacement\)/);
  assert.match(composer, /addEventListener\('scroll', schedulePlacement, \{ capture: true, passive: true \}\)/);
  assert.match(composer, /addEventListener\('wheel', schedulePlacement, \{ passive: true \}\)/);
  assert.match(composer, /addEventListener\('pointermove', handlePointerMove, \{ passive: true \}\)/);
  assert.match(composer, /addEventListener\('pointerdown', handlePlacementPointerDown, true\)/);
  assert.match(composer, /addEventListener\('pointerup', handlePointerEnd, true\)/);
  assert.match(composer, /addEventListener\('pointercancel', handlePointerEnd, true\)/);
  assert.match(composer, /pointerInteractionRef\.current/);
  assert.match(composer, /owningFlow\.contains\(target\)|owningNode\.contains\(target\)/);
  assert.doesNotMatch(composer, /addEventListener\('(?:resize|scroll|wheel)', measure/);
});

test('composer is bottom-only and hides unusably short placements', () => {
  assert.match(composer, /const caretTop = next\.top - 5/);
  assert.doesNotMatch(composer, /next\.placement\s*===\s*'(?:top|viewport)'/);
  assert.match(composer, /const hasUsablePlacement = Boolean\(measured && placementReady && measured\.maxHeight >= 48\)/);
  assert.match(composer, /visibility: hasUsablePlacement \? undefined : 'hidden'/);
  assert.match(composer, /pointerEvents: measured && measured\.maxHeight < 48 \? 'none' : undefined/);
});

test('composer placement setup has matching cleanup for scheduled and observed work', () => {
  assert.match(composer, /scheduler\.dispose\(\)/);
  assert.match(composer, /window\.cancelAnimationFrame\(startupFrame\)/);
  assert.match(composer, /resizeObserver\.disconnect\(\)/);
  assert.match(composer, /mutationObserver\.disconnect\(\)/);
  for (const event of ['resize', 'scroll', 'wheel', 'pointermove', 'pointerdown', 'pointerup', 'pointercancel']) {
    assert.match(composer, new RegExp(`removeEventListener\\('${event}'`));
  }
});
