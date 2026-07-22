import assert from 'node:assert/strict';
import test from 'node:test';

import { createProximityHandleController } from '../src/utils/proximityHandleController.ts';

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  mutations = 0;
  readonly classes: string[];
  readonly id?: string;
  private readonly rect: { left: number; width: number };

  constructor(
    classes: string[] = [],
    id?: string,
    rect = { left: 0, width: 100 },
  ) {
    this.classes = classes;
    this.id = id;
    this.rect = rect;
  }

  append(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  matches(selector: string) {
    return selector.startsWith('.') && this.classes.includes(selector.slice(1));
  }

  contains(candidate: FakeElement) {
    for (let current: FakeElement | null = candidate; current; current = current.parent) {
      if (current === this) return true;
    }
    return false;
  }

  getAttribute(name: string) {
    if (name === 'data-id') return this.id ?? null;
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string) {
    if (this.attributes.get(name) === value) return;
    this.attributes.set(name, value);
    this.mutations += 1;
  }

  removeAttribute(name: string) {
    if (!this.attributes.delete(name)) return;
    this.mutations += 1;
  }

  getBoundingClientRect() {
    return { ...this.rect } as DOMRect;
  }
}

type PointerKind = 'mouse' | 'touch' | 'pen';

const event = (
  path: FakeElement[],
  pointerType: PointerKind,
  clientX = 0,
  pointerId = 1,
) => ({ pointerType, clientX, pointerId, composedPath: () => path }) as unknown as PointerEvent;

const side = (node: FakeElement) => node.getAttribute('data-t8-handle-side');
const mode = (node: FakeElement) => node.getAttribute('data-t8-handle-mode');

function fixture() {
  const root = new FakeElement(['react-flow']);
  const left = root.append(new FakeElement(['react-flow__node'], 'left', { left: 20, width: 80 }));
  const right = root.append(new FakeElement(['react-flow__node'], 'right', { left: 200, width: 100 }));
  const handle = left.append(new FakeElement(['react-flow__handle']));
  const phantom = left.append(new FakeElement(['t8-bulk-phantom-handle']));
  const scheduled: Array<() => void> = [];
  const cancelled: unknown[] = [];
  const controller = createProximityHandleController(root as unknown as HTMLElement, {
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancel: (task) => cancelled.push(task),
  });
  return { root, left, right, handle, phantom, scheduled, cancelled, controller };
}

test('mouse midpoint chooses left below midpoint and right at midpoint with one rect read per move', () => {
  const { controller, left } = fixture();
  let reads = 0;
  const original = left.getBoundingClientRect.bind(left);
  left.getBoundingClientRect = () => { reads += 1; return original(); };

  controller.pointerMove(event([left], 'mouse', 59));
  assert.equal(side(left), 'left');
  controller.pointerMove(event([left], 'mouse', 60));
  assert.equal(side(left), 'right');
  assert.equal(reads, 2);
});

test('production resolver uses path owner, retains it over a handle, and rejects phantom paths', () => {
  const { controller, root, left, handle, phantom } = fixture();
  controller.pointerMove(event([left, root], 'mouse', 30));
  controller.pointerMove(event([handle, left, root], 'mouse', 90));
  assert.equal(side(left), 'right');

  controller.pointerMove(event([phantom, left, root], 'mouse', 30));
  assert.equal(side(left), null);
});

test('same owner and side has zero mutations; side and owner changes are tightly bounded', () => {
  const { controller, left, right } = fixture();
  controller.pointerMove(event([left], 'mouse', 30));
  const initial = left.mutations;
  controller.pointerMove(event([left], 'mouse', 40));
  assert.equal(left.mutations, initial);

  controller.pointerMove(event([left], 'mouse', 90));
  assert.equal(left.mutations, initial + 1);
  const beforeOwnerChange = left.mutations;
  controller.pointerMove(event([right], 'mouse', 220));
  assert.equal(left.mutations, beforeOwnerChange + 2);
  assert.equal(right.mutations, 2);
});

test('pane exit clears only mouse proximity and preserves the active touch-selected union', () => {
  const { controller, root, left, right } = fixture();
  controller.pointerDown(event([left], 'touch', 30, 7));
  controller.selectionChange(new Set(['left']));
  controller.pointerMove(event([right], 'mouse', 220));
  controller.pointerMove(event([root], 'mouse', 0));
  assert.equal(side(right), null);
  assert.equal(side(left), 'both');
  assert.equal(mode(left), 'touch-selected');
});

for (const pointerType of ['touch', 'pen'] as const) {
  test(`${pointerType} candidate becomes transient and promotes only after selection`, () => {
    const { controller, left } = fixture();
    controller.pointerDown(event([left], pointerType, 30, 9));
    assert.equal(side(left), 'both');
    assert.equal(mode(left), 'touch-transient');
    controller.selectionChange(new Set(['left']));
    assert.equal(mode(left), 'touch-selected');
  });
}

test('already selected touch target promotes without being overwritten as transient', () => {
  const { controller, left } = fixture();
  controller.selectionChange(new Set(['left']));
  controller.pointerDown(event([left], 'touch', 30, 3));
  assert.equal(side(left), 'both');
  assert.equal(mode(left), 'touch-selected');
});

test('selection immediately before or after pointerup promotes the recorded touch candidate', () => {
  for (const selectionFirst of [true, false]) {
    const { controller, left, scheduled } = fixture();
    controller.pointerDown(event([left], 'touch', 30, 4));
    if (selectionFirst) controller.selectionChange(new Set(['left']));
    controller.pointerUp(event([left], 'touch', 30, 4));
    if (!selectionFirst) controller.selectionChange(new Set(['left']));
    scheduled.splice(0).forEach((callback) => callback());
    assert.equal(mode(left), 'touch-selected');
  }
});

test('a synchronous scheduler can finalize an already-selected touch candidate', () => {
  const root = new FakeElement();
  const node = root.append(new FakeElement(['react-flow__node'], 'node'));
  const controller = createProximityHandleController(root as unknown as HTMLElement, {
    schedule: (callback) => {
      callback();
      return null;
    },
    cancel: () => assert.fail('completed synchronous task must not be cancelled'),
  });
  controller.pointerDown(event([node], 'touch', 10, 31));
  controller.selectionChange(new Set(['node']));
  controller.pointerUp(event([node], 'touch', 10, 31));
  assert.equal(mode(node), 'touch-selected');
  controller.selectionChange(new Set());
  assert.equal(mode(node), null);
});

test('a nullable task token is cancellable and its stale callback cannot clear a newer transient', () => {
  const root = new FakeElement();
  const first = root.append(new FakeElement(['react-flow__node'], 'first'));
  const second = root.append(new FakeElement(['react-flow__node'], 'second'));
  const callbacks: Array<() => void> = [];
  const cancelled: unknown[] = [];
  const controller = createProximityHandleController(root as unknown as HTMLElement, {
    schedule: (callback) => {
      callbacks.push(callback);
      return null;
    },
    cancel: (token) => cancelled.push(token),
  });
  controller.pointerDown(event([first], 'touch', 10, 41));
  controller.pointerUp(event([first], 'touch', 10, 41));
  controller.pointerDown(event([second], 'touch', 10, 42));
  assert.deepEqual(cancelled, [null]);
  callbacks[0]();
  assert.equal(mode(second), 'touch-transient');
});

test('a cancelled callback with a reused token cannot finalize a replacement task', () => {
  const root = new FakeElement();
  const first = root.append(new FakeElement(['react-flow__node'], 'first'));
  const second = root.append(new FakeElement(['react-flow__node'], 'second'));
  const callbacks: Array<() => void> = [];
  const controller = createProximityHandleController(root as unknown as HTMLElement, {
    schedule: (callback) => {
      callbacks.push(callback);
      return 'reused-token';
    },
    cancel: () => {},
  });
  controller.pointerDown(event([first], 'touch', 10, 51));
  controller.pointerUp(event([first], 'touch', 10, 51));
  controller.pointerDown(event([second], 'touch', 10, 52));
  controller.pointerUp(event([second], 'touch', 10, 52));
  callbacks[0]();
  assert.equal(mode(second), 'touch-transient');
  callbacks[1]();
  assert.equal(mode(second), null);
});

test('dispose cancels a nullable pending token and ignores its callback if it still executes', () => {
  const root = new FakeElement();
  const node = root.append(new FakeElement(['react-flow__node'], 'node'));
  const callbacks: Array<() => void> = [];
  const cancelled: unknown[] = [];
  const controller = createProximityHandleController(root as unknown as HTMLElement, {
    schedule: (callback) => {
      callbacks.push(callback);
      return null;
    },
    cancel: (token) => cancelled.push(token),
  });
  controller.pointerDown(event([node], 'touch', 10, 61));
  controller.pointerUp(event([node], 'touch', 10, 61));
  controller.dispose();
  const mutations = node.mutations;
  assert.deepEqual(cancelled, [null]);
  callbacks[0]();
  assert.equal(node.mutations, mutations);
  assert.equal(mode(node), null);
});

test('cancellation during schedule waits for token assignment and then cancels that token', () => {
  const root = new FakeElement();
  const node = root.append(new FakeElement(['react-flow__node'], 'node'));
  const cancelled: unknown[] = [];
  let staleCallback: (() => void) | null = null;
  let controller: ReturnType<typeof createProximityHandleController>;
  controller = createProximityHandleController(root as unknown as HTMLElement, {
    schedule: (callback) => {
      staleCallback = callback;
      controller.dispose();
      return null;
    },
    cancel: (token) => cancelled.push(token),
  });
  controller.pointerDown(event([node], 'touch', 10, 62));
  controller.pointerUp(event([node], 'touch', 10, 62));
  assert.deepEqual(cancelled, [null]);
  staleCallback?.();
  assert.equal(mode(node), null);
});

test('mouse and keyboard selection never acquire fallback attributes', () => {
  const { controller, left, right } = fixture();
  controller.pointerDown(event([left], 'mouse', 30, 1));
  controller.selectionChange(new Set(['left']));
  controller.selectionChange(new Set(['right']));
  assert.equal(mode(left), null);
  assert.equal(mode(right), null);
});

test('deselection removes touch fallback once and mouse never overwrites it', () => {
  const { controller, left, right, scheduled } = fixture();
  controller.pointerDown(event([left], 'touch', 30, 5));
  controller.selectionChange(new Set(['left']));
  controller.pointerUp(event([left], 'touch', 30, 5));
  scheduled.splice(0).forEach((callback) => callback());
  const beforeMouse = left.mutations;
  controller.pointerMove(event([left], 'mouse', 90));
  assert.equal(left.mutations, beforeMouse);
  controller.pointerMove(event([right], 'mouse', 220));
  assert.equal(mode(left), 'touch-selected');
  controller.selectionChange(new Set());
  const afterDeselect = left.mutations;
  controller.selectionChange(new Set());
  assert.equal(left.mutations, afterDeselect);
  assert.equal(mode(left), null);
});

test('pointercancel finalizes after same-event selection or clears an unselected transient', () => {
  const selected = fixture();
  selected.controller.pointerDown(event([selected.left], 'pen', 30, 11));
  selected.controller.pointerCancel();
  selected.controller.selectionChange(new Set(['left']));
  selected.scheduled.splice(0).forEach((callback) => callback());
  assert.equal(mode(selected.left), 'touch-selected');

  const unselected = fixture();
  unselected.controller.pointerDown(event([unselected.left], 'touch', 30, 12));
  unselected.controller.pointerCancel();
  unselected.scheduled.splice(0).forEach((callback) => callback());
  assert.equal(mode(unselected.left), null);
});

test('blur clears proximity and transient while preserving selected fallback', () => {
  const selected = fixture();
  selected.controller.pointerDown(event([selected.left], 'touch', 30, 1));
  selected.controller.selectionChange(new Set(['left']));
  selected.controller.pointerMove(event([selected.right], 'mouse', 220));
  selected.controller.blur();
  assert.equal(mode(selected.left), 'touch-selected');
  assert.equal(mode(selected.right), null);

  const transient = fixture();
  transient.controller.pointerDown(event([transient.left], 'touch', 30, 2));
  transient.controller.blur();
  assert.equal(mode(transient.left), null);
});

test('connection guard clears active hover/transient, suppresses mouse, and resumes after end', () => {
  const { controller, left, right } = fixture();
  controller.pointerMove(event([right], 'mouse', 220));
  controller.pointerDown(event([left], 'touch', 30, 2));
  controller.connectionStart();
  assert.equal(mode(left), null);
  assert.equal(mode(right), null);
  controller.pointerMove(event([right], 'mouse', 280));
  assert.equal(mode(right), null);
  controller.connectionEnd();
  controller.pointerMove(event([right], 'mouse', 280));
  assert.equal(mode(right), 'proximity');
});

test('pointer cancel does not drop the connection guard before connection end', () => {
  const { controller, right } = fixture();
  controller.connectionStart();
  controller.pointerCancel();
  controller.pointerMove(event([right], 'mouse', 280));
  assert.equal(mode(right), null);
  controller.connectionEnd();
  controller.pointerMove(event([right], 'mouse', 280));
  assert.equal(mode(right), 'proximity');
});

test('connection guard ignores touch and pen pointer down candidates', () => {
  for (const pointerType of ['touch', 'pen'] as const) {
    const { controller, left } = fixture();
    controller.connectionStart();
    controller.pointerDown(event([left], pointerType, 30, 71));
    assert.equal(mode(left), null);
    assert.equal(side(left), null);
  }
});

test('connection operations preserve selected fallback', () => {
  const { controller, left } = fixture();
  controller.pointerDown(event([left], 'touch', 30, 2));
  controller.selectionChange(new Set(['left']));
  controller.connectionStart();
  controller.connectionEnd();
  assert.equal(mode(left), 'touch-selected');
});

test('injected resolver and id reader are honored', () => {
  const root = new FakeElement();
  const node = root.append(new FakeElement([], undefined));
  const controller = createProximityHandleController(root as unknown as HTMLElement, {
    resolveNode: () => node as unknown as HTMLElement,
    getNodeId: () => 'custom',
  });
  controller.pointerDown(event([], 'touch', 0, 8));
  controller.selectionChange(new Set(['custom']));
  assert.equal(mode(node), 'touch-selected');
  controller.dispose();
});

test('dispose cancels one pending finalize and clears every ownership attribute at most once', () => {
  const { controller, left, right, cancelled } = fixture();
  controller.pointerDown(event([left], 'touch', 30, 10));
  controller.selectionChange(new Set(['left']));
  controller.pointerMove(event([right], 'mouse', 220));
  controller.pointerUp(event([left], 'touch', 30, 10));
  controller.dispose();
  assert.equal(cancelled.length, 1);
  assert.equal(mode(left), null);
  assert.equal(mode(right), null);
  const mutations = left.mutations + right.mutations;
  controller.dispose();
  assert.equal(left.mutations + right.mutations, mutations);
});
