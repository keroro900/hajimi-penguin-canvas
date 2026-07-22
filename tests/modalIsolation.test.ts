import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  acquireCanvasModalIsolation,
  calculateNextFocusIndex,
  createModalController,
  isCanvasModalActive,
  isTopCanvasModalIsolation,
  isolateBodySiblings,
  restoreBodySiblings,
  setCanvasModalActive,
  snapshotBodySiblings,
} = await import('../src/utils/modalIsolation.ts');

class FakeElement {
  inert?: boolean;
  readonly attributes = new Map<string, string>();
  focusCount = 0;

  constructor(options: { inert?: boolean; inertAttribute?: string; ariaHidden?: string } = {}) {
    if ('inert' in options) {
      this.inert = options.inert;
      this.attributes.set('inert', '');
    }
    if (options.inertAttribute !== undefined) this.attributes.set('inert', options.inertAttribute);
    if (options.ariaHidden !== undefined) this.attributes.set('aria-hidden', options.ariaHidden);
  }

  hasAttribute(name: string) { return this.attributes.has(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  focus() { this.focusCount += 1; }
}

test('modalIsolation preserves and restores body siblings', () => {
  const absent = new FakeElement();
  const presentFalse = new FakeElement({ ariaHidden: 'false' });
  const presentTrue = new FakeElement({ inert: true, ariaHidden: 'true' });
  const oddPriorInert = new FakeElement({
    inert: false,
    inertAttribute: 'false',
    ariaHidden: 'false',
  });
  const lowerPortalSibling = new FakeElement({ ariaHidden: 'lower-portal' });
  const portalRoot = new FakeElement({ inert: false, ariaHidden: 'false' });
  const snapshots = snapshotBodySiblings(
    [absent, lowerPortalSibling, portalRoot, presentFalse, presentTrue, oddPriorInert],
    portalRoot,
  );

  assert.equal(snapshots.length, 5, 'only the exact portal root is excluded');
  isolateBodySiblings(snapshots);
  for (const element of [absent, lowerPortalSibling, presentFalse, presentTrue, oddPriorInert]) {
    assert.equal(element.inert, true);
    assert.equal(element.getAttribute('aria-hidden'), 'true');
  }
  assert.equal(portalRoot.inert, false);
  assert.equal(portalRoot.getAttribute('aria-hidden'), 'false');

  restoreBodySiblings(snapshots);
  assert.equal(absent.hasAttribute('inert'), false);
  assert.equal(absent.hasAttribute('aria-hidden'), false);
  assert.equal(lowerPortalSibling.hasAttribute('inert'), false);
  assert.equal(lowerPortalSibling.getAttribute('aria-hidden'), 'lower-portal');
  assert.equal(presentFalse.hasAttribute('inert'), false);
  assert.equal(presentFalse.getAttribute('aria-hidden'), 'false');
  assert.equal(presentTrue.inert, true);
  assert.equal(presentTrue.getAttribute('aria-hidden'), 'true');
  assert.equal(oddPriorInert.inert, false);
  assert.equal(oddPriorInert.getAttribute('inert'), 'false');
  assert.equal(oddPriorInert.getAttribute('aria-hidden'), 'false');

  restoreBodySiblings(snapshots);
  assert.equal(presentFalse.hasAttribute('inert'), false, 'restoration is idempotent');
  assert.equal(absent.hasAttribute('aria-hidden'), false);
});

test('focus index wraps in both directions and supports one or no controls', () => {
  assert.equal(calculateNextFocusIndex(3, 0, false), 1);
  assert.equal(calculateNextFocusIndex(3, 2, false), 0);
  assert.equal(calculateNextFocusIndex(3, 0, true), 2);
  assert.equal(calculateNextFocusIndex(3, 2, true), 1);
  assert.equal(calculateNextFocusIndex(1, 0, false), 0);
  assert.equal(calculateNextFocusIndex(0, -1, false), -1);
  assert.equal(calculateNextFocusIndex(3, -1, false), 0);
  assert.equal(calculateNextFocusIndex(3, -1, true), 2);
});

function fakeKey(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    defaultPrevented: false,
    preventCount: 0,
    propagationCount: 0,
    preventDefault() { this.defaultPrevented = true; this.preventCount += 1; },
    stopPropagation() { this.propagationCount += 1; },
  };
}

test('modal controller traps focus without swallowing ordinary descendant keys', () => {
  const close = new FakeElement();
  const second = new FakeElement();
  const opener = new FakeElement();
  let active: FakeElement | null = null;
  let restores = 0;
  const controller = createModalController({
    getFocusableElements: () => [close, second],
    getActiveElement: () => active,
    initialFocus: close,
    opener,
    isolate: () => () => { restores += 1; },
    onClose: () => {},
  });

  controller.activate();
  assert.equal(close.focusCount, 1, 'close control receives initial focus');

  active = close;
  const forward = fakeKey('Tab');
  controller.handleKey(forward);
  assert.equal(second.focusCount, 1);
  assert.equal(forward.preventCount, 1);
  assert.equal(forward.propagationCount, 1);

  active = close;
  const reverse = fakeKey('Tab', true);
  controller.handleKey(reverse);
  assert.equal(second.focusCount, 2);

  const letter = fakeKey('a');
  controller.handleKey(letter);
  assert.equal(letter.preventCount, 0, 'ordinary keys are not default-prevented');
  assert.equal(letter.propagationCount, 0, 'ordinary keys continue to modal descendants');
  assert.equal(restores, 0);
});

test('window canvas guard runs before modal capture while ordinary keys still reach descendants', () => {
  setCanvasModalActive(false);
  const app = new FakeElement();
  const portal = new FakeElement();
  const releaseModal = acquireCanvasModalIsolation([app, portal], portal);
  const controller = createModalController({
    getFocusableElements: () => [],
    getActiveElement: () => null,
    initialFocus: null,
    opener: null,
    isolate: () => () => {},
    onClose: () => {},
  });
  controller.activate();
  let canvasShortcutCount = 0;
  let descendantKeyCount = 0;
  const ordinaryKey = fakeKey('a');

  if (!isCanvasModalActive()) canvasShortcutCount += 1;
  controller.handleKey(ordinaryKey);
  if (ordinaryKey.propagationCount === 0) descendantKeyCount += 1;

  assert.equal(canvasShortcutCount, 0);
  assert.equal(descendantKeyCount, 1);
  const tab = fakeKey('Tab');
  controller.handleKey(tab);
  assert.equal(tab.preventCount, 1);
  assert.equal(tab.propagationCount, 1);
  const escape = fakeKey('Escape');
  controller.handleKey(escape);
  assert.equal(escape.preventCount, 1);
  assert.equal(escape.propagationCount, 1);
  releaseModal();
});

test('modal controller handles zero and one focusable control', () => {
  const only = new FakeElement();
  let controls: FakeElement[] = [];
  let active: FakeElement | null = null;
  const controller = createModalController({
    getFocusableElements: () => controls,
    getActiveElement: () => active,
    initialFocus: only,
    opener: null,
    isolate: () => () => {},
    onClose: () => {},
  });
  controller.activate();
  const none = fakeKey('Tab');
  controller.handleKey(none);
  assert.equal(none.preventCount, 1);
  controls = [only];
  active = only;
  const one = fakeKey('Tab', true);
  controller.handleKey(one);
  assert.equal(one.preventCount, 1);
  assert.equal(only.focusCount, 2);
});

test('modal controller gives Escape interception precedence', () => {
  let intercepted = true;
  let closes = 0;
  const controller = createModalController({
    getFocusableElements: () => [],
    getActiveElement: () => null,
    initialFocus: null,
    opener: null,
    isolate: () => () => {},
    onEscapeBeforeClose: () => intercepted,
    onClose: () => { closes += 1; },
  });
  controller.activate();
  const first = fakeKey('Escape');
  controller.handleKey(first);
  assert.equal(closes, 0);
  assert.equal(first.preventCount, 1);
  intercepted = false;
  controller.handleKey(fakeKey('Escape'));
  assert.equal(closes, 1);
});

test('modal controller closes only for the backdrop itself', () => {
  let closes = 0;
  const controller = createModalController({
    getFocusableElements: () => [],
    getActiveElement: () => null,
    initialFocus: null,
    opener: null,
    isolate: () => () => {},
    onClose: () => { closes += 1; },
  });
  controller.activate();
  const backdrop = {};
  controller.handleBackdrop({ target: {}, currentTarget: backdrop });
  assert.equal(closes, 0);
  controller.handleBackdrop({ target: backdrop, currentTarget: backdrop });
  assert.equal(closes, 1);
});

test('all modal close paths restore isolation and the exact opener once', () => {
  for (const path of ['requestClose', 'escape', 'backdrop', 'destroy'] as const) {
    const opener = new FakeElement();
    let closes = 0;
    let restores = 0;
    const controller = createModalController({
      getFocusableElements: () => [],
      getActiveElement: () => null,
      initialFocus: null,
      opener,
      isolate: () => () => { restores += 1; },
      onClose: () => { closes += 1; },
    });
    controller.activate();
    if (path === 'requestClose') controller.requestClose();
    if (path === 'escape') controller.handleKey(fakeKey('Escape'));
    if (path === 'backdrop') {
      const target = {};
      controller.handleBackdrop({ target, currentTarget: target });
    }
    if (path === 'destroy') controller.destroy();
    controller.destroy();
    assert.equal(restores, 1, `${path} restores once`);
    assert.equal(opener.focusCount, 1, `${path} restores the exact opener once`);
    assert.equal(closes, path === 'destroy' ? 0 : 1, `${path} close callback`);
  }
});

test('modal controller reacquires ownership after StrictMode effect replay', () => {
  setCanvasModalActive(false);
  const app = new FakeElement({ ariaHidden: 'false' });
  const portal = new FakeElement();
  const close = new FakeElement();
  const opener = new FakeElement();
  let closes = 0;
  const controller = createModalController({
    getFocusableElements: () => [close],
    getActiveElement: () => close,
    initialFocus: close,
    opener,
    isolate: () => acquireCanvasModalIsolation([app, portal], portal),
    onClose: () => { closes += 1; },
  });

  controller.activate();
  assert.equal(isCanvasModalActive(), true);
  assert.equal(app.inert, true);
  controller.destroy();
  controller.destroy();
  assert.equal(isCanvasModalActive(), false);
  assert.equal(app.hasAttribute('inert'), false);
  assert.equal(app.getAttribute('aria-hidden'), 'false');

  controller.activate();
  assert.equal(isCanvasModalActive(), true, 'replayed setup reacquires modal ownership');
  assert.equal(app.inert, true);
  controller.requestClose();
  controller.requestClose();
  controller.destroy();

  assert.equal(isCanvasModalActive(), false);
  assert.equal(app.hasAttribute('inert'), false);
  assert.equal(app.getAttribute('aria-hidden'), 'false');
  assert.equal(close.focusCount, 2, 'each effect setup applies initial focus');
  assert.equal(opener.focusCount, 2, 'each effect cleanup restores the opener once');
  assert.equal(closes, 1, 'only the active requestClose invokes onClose');
});

test('shared modal-active guard is explicit and resettable', () => {
  setCanvasModalActive(false);
  assert.equal(isCanvasModalActive(), false);
  setCanvasModalActive(true);
  assert.equal(isCanvasModalActive(), true);
  setCanvasModalActive(false);
  assert.equal(isCanvasModalActive(), false);
});

function assertOverlappingModalCloseOrder(order: 'lower-first' | 'upper-first') {
  setCanvasModalActive(false);
  const app = new FakeElement({ ariaHidden: 'false' });
  const lowerPortal = new FakeElement();
  const upperPortal = new FakeElement();
  const releaseLower = acquireCanvasModalIsolation([app, lowerPortal], lowerPortal);
  const releaseUpper = acquireCanvasModalIsolation(
    [app, lowerPortal, upperPortal],
    upperPortal,
  );

  assert.equal(isCanvasModalActive(), true);
  assert.equal(app.inert, true);
  assert.equal(lowerPortal.inert, true);
  assert.equal(upperPortal.hasAttribute('inert'), false);
  assert.equal(isTopCanvasModalIsolation(lowerPortal), false);
  assert.equal(isTopCanvasModalIsolation(upperPortal), true);

  const firstRelease = order === 'lower-first' ? releaseLower : releaseUpper;
  const lastRelease = order === 'lower-first' ? releaseUpper : releaseLower;
  firstRelease();
  firstRelease();
  assert.equal(isCanvasModalActive(), true, 'duplicate release keeps the other modal active');
  assert.equal(app.inert, true, 'app remains isolated until the last modal closes');
  const remainingPortal = order === 'lower-first' ? upperPortal : lowerPortal;
  assert.equal(remainingPortal.hasAttribute('inert'), false, 'remaining top portal is interactive');
  assert.equal(isTopCanvasModalIsolation(remainingPortal), true);

  lastRelease();
  lastRelease();
  assert.equal(isCanvasModalActive(), false);
  assert.equal(app.hasAttribute('inert'), false);
  assert.equal(app.getAttribute('aria-hidden'), 'false');
  assert.equal(lowerPortal.hasAttribute('inert'), false);
  assert.equal(lowerPortal.hasAttribute('aria-hidden'), false);
  assert.equal(upperPortal.hasAttribute('inert'), false);
  assert.equal(upperPortal.hasAttribute('aria-hidden'), false);
}

test('overlapping modals restore cleanly when the lower portal closes first', () => {
  assertOverlappingModalCloseOrder('lower-first');
});

test('overlapping modals restore cleanly when the upper portal closes first', () => {
  assertOverlappingModalCloseOrder('upper-first');
});
