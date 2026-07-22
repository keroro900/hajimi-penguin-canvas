import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameScheduler } from '../src/utils/frameScheduler.ts';

type FrameCallback = () => void;

const createFakeFrames = () => {
  let nextId = 1;
  const pending = new Map<number, FrameCallback>();
  const cancelled: number[] = [];

  return {
    requestFrame(callback: FrameCallback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    cancelFrame(id: number) {
      cancelled.push(id);
      pending.delete(id);
    },
    flushNext() {
      const entry = pending.entries().next().value as [number, FrameCallback] | undefined;
      assert.ok(entry, 'expected a pending animation frame');
      pending.delete(entry[0]);
      entry[1]();
    },
    pending,
    cancelled,
  };
};

test('frame scheduler coalesces multiple signals into one callback', () => {
  const frames = createFakeFrames();
  let calls = 0;
  const scheduler = createFrameScheduler(frames.requestFrame, frames.cancelFrame, () => calls++);

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();

  assert.equal(frames.pending.size, 1);
  frames.flushNext();
  assert.equal(calls, 1);
});

test('frame scheduler clears its pending id before invoking the callback', () => {
  const frames = createFakeFrames();
  let calls = 0;
  let scheduler: ReturnType<typeof createFrameScheduler>;
  scheduler = createFrameScheduler(frames.requestFrame, frames.cancelFrame, () => {
    calls += 1;
    scheduler.schedule();
  });

  scheduler.schedule();
  frames.flushNext();

  assert.equal(calls, 1);
  assert.equal(frames.pending.size, 1, 'rescheduling inside callback creates a later frame');
  frames.flushNext();
  assert.equal(calls, 2);
});

test('frame scheduler dispose cancels pending work and ignores future signals', () => {
  const frames = createFakeFrames();
  let calls = 0;
  const scheduler = createFrameScheduler(frames.requestFrame, frames.cancelFrame, () => calls++);

  scheduler.schedule();
  scheduler.dispose();
  scheduler.schedule();

  assert.deepEqual(frames.cancelled, [1]);
  assert.equal(frames.pending.size, 0);
  assert.equal(calls, 0);
});
