import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveComposerPlacement,
  type ComposerPlacementResult,
} from '../src/components/nodes/shared/composerPlacement.ts';

const anchor = (top: number, left: number, width: number, height: number) => ({
  top,
  left,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const avoidRect = (top: number, left: number, width: number, height: number) => ({
  top,
  left,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const viewport = { width: 1000, height: 800 };
const target = anchor(100, 400, 200, 100);
const popoverSize = { width: 300, height: 400 };

function assertExact(
  actual: ComposerPlacementResult,
  expected: ComposerPlacementResult,
) {
  assert.deepEqual(actual, expected);
  for (const value of [actual.top, actual.left, actual.maxHeight, actual.pointerLeft]) {
    assert.ok(Number.isFinite(value), `expected finite output, received ${value}`);
  }
}

test('uses the centered candidate and viewport-available height with no obstacle', () => {
  assertExact(
    resolveComposerPlacement({ anchorRect: target, popoverSize, viewport }),
    { placement: 'bottom', top: 208, left: 350, maxHeight: 580, pointerLeft: 150 },
  );
});

test('uses the left candidate when it is the first obstacle-free slot', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      avoid: [avoidRect(400, 600, 200, 200)],
    }),
    { placement: 'bottom', top: 208, left: 300, maxHeight: 580, pointerLeft: 200 },
  );
});

test('uses the right candidate when centered and left candidates are blocked', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      avoid: [avoidRect(400, 200, 200, 200)],
    }),
    { placement: 'bottom', top: 208, left: 400, maxHeight: 580, pointerLeft: 100 },
  );
});

test('deduplicates candidates after viewport clamping', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: anchor(100, 112, 100, 100),
      popoverSize,
      viewport,
      avoid: [avoidRect(400, 100, 212, 200)],
    }),
    { placement: 'bottom', top: 208, left: 312, maxHeight: 580, pointerLeft: 14 },
  );
});

test('keeps stable candidate order when multiple blockers produce equal usable height', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      avoid: [
        avoidRect(400, 0, 400, 200),
        avoidRect(400, 300, 400, 200),
        avoidRect(400, 600, 400, 200),
      ],
    }),
    { placement: 'bottom', top: 208, left: 350, maxHeight: 192, pointerLeft: 150 },
  );
});

test('does not let a blocker outside the final horizontal span reduce height', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      avoid: [
        avoidRect(400, 600, 200, 200),
        avoidRect(220, 700, 100, 200),
      ],
    }),
    { placement: 'bottom', top: 208, left: 300, maxHeight: 580, pointerLeft: 200 },
  );
});

test('ignores a blocker behind the resolved top', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      avoid: [avoidRect(100, 350, 300, 108)],
    }),
    { placement: 'bottom', top: 208, left: 350, maxHeight: 580, pointerLeft: 150 },
  );
});

test('ignores a blocker beyond the bottom margin', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      avoid: [avoidRect(788, 350, 300, 100)],
    }),
    { placement: 'bottom', top: 208, left: 350, maxHeight: 580, pointerLeft: 150 },
  );
});

test('keeps the exact bottom-edge top and reports zero available height', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: anchor(700, 400, 200, 100),
      popoverSize,
      viewport,
    }),
    { placement: 'bottom', top: 808, left: 350, maxHeight: 0, pointerLeft: 150 },
  );
});

test('preserves an exact negative top for an anchor above the viewport', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: anchor(-120, 400, 200, 100),
      popoverSize,
      viewport,
    }),
    { placement: 'bottom', top: -12, left: 350, maxHeight: 760, pointerLeft: 150 },
  );
});

test('saturates overflowing top arithmetic while keeping every output finite', async (t) => {
  await t.test('positive overflow', () => {
    assertExact(
      resolveComposerPlacement({
        anchorRect: { ...target, bottom: Number.MAX_VALUE },
        popoverSize,
        viewport,
        gap: Number.MAX_VALUE,
      }),
      {
        placement: 'bottom',
        top: Number.MAX_VALUE,
        left: 350,
        maxHeight: 0,
        pointerLeft: 150,
      },
    );
  });

  await t.test('negative overflow', () => {
    assertExact(
      resolveComposerPlacement({
        anchorRect: { ...target, bottom: -Number.MAX_VALUE },
        popoverSize,
        viewport,
        gap: -Number.MAX_VALUE,
      }),
      {
        placement: 'bottom',
        top: -Number.MAX_VALUE,
        left: 350,
        maxHeight: 760,
        pointerLeft: 150,
      },
    );
  });
});

test('respects custom gap 20 and margin 30 exactly', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      gap: 20,
      margin: 30,
    }),
    { placement: 'bottom', top: 220, left: 350, maxHeight: 550, pointerLeft: 150 },
  );
});

test('clamps oversized and narrow widths', async (t) => {
  await t.test('oversized width', () => {
    assertExact(
      resolveComposerPlacement({
        anchorRect: target,
        popoverSize: { width: 2000, height: 400 },
        viewport,
      }),
      { placement: 'bottom', top: 208, left: 12, maxHeight: 580, pointerLeft: 488 },
    );
  });

  await t.test('narrow width', () => {
    assertExact(
      resolveComposerPlacement({
        anchorRect: target,
        popoverSize: { width: 20, height: 400 },
        viewport,
      }),
      { placement: 'bottom', top: 208, left: 490, maxHeight: 580, pointerLeft: 10 },
    );
  });
});

test('clamps the horizontal margin inside a viewport narrower than two margins', () => {
  assertExact(
    resolveComposerPlacement({
      anchorRect: anchor(100, 0, 10, 100),
      popoverSize,
      viewport: { width: 10, height: 800 },
    }),
    { placement: 'bottom', top: 208, left: 5, maxHeight: 580, pointerLeft: 0 },
  );
});

test('keeps the pointer at the caret inset near either viewport edge', async (t) => {
  await t.test('left edge', () => {
    assertExact(
      resolveComposerPlacement({
        anchorRect: anchor(100, 0, 20, 100),
        popoverSize,
        viewport,
      }),
      { placement: 'bottom', top: 208, left: 12, maxHeight: 580, pointerLeft: 14 },
    );
  });

  await t.test('right edge', () => {
    assertExact(
      resolveComposerPlacement({
        anchorRect: anchor(100, 980, 20, 100),
        popoverSize,
        viewport,
      }),
      { placement: 'bottom', top: 208, left: 688, maxHeight: 580, pointerLeft: 286 },
    );
  });
});

test('filters malformed and non-finite avoid rects', () => {
  const malformed = [
    { ...avoidRect(300, 350, 300, 200), top: Number.NaN },
    { ...avoidRect(300, 350, 300, 200), left: Number.POSITIVE_INFINITY },
    { ...avoidRect(300, 350, 300, 200), right: Number.NEGATIVE_INFINITY },
    { ...avoidRect(300, 350, 300, 200), bottom: Number.NaN },
    avoidRect(300, 350, 0, 200),
    avoidRect(300, 350, 300, 0),
    { ...avoidRect(300, 350, 300, 200), bottom: 300 },
  ];

  assertExact(
    resolveComposerPlacement({
      anchorRect: target,
      popoverSize,
      viewport,
      avoid: malformed,
    }),
    { placement: 'bottom', top: 208, left: 350, maxHeight: 580, pointerLeft: 150 },
  );
});
