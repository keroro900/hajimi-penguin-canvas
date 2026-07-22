import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPendingMediaSlots,
  markMediaSlotCancelled,
  markMediaSlotFailed,
  markMediaSlotSuccess,
  resolveMediaResultSlots,
  successfulMediaSlotUrls,
  summarizeMediaSlots,
} from '../src/utils/mediaTaskSlots.ts';

test('media task slots support partial success without failing the batch', () => {
  let slots = createPendingMediaSlots(3);

  slots = markMediaSlotSuccess(slots, 1, ['b.png', 'ignored.png']);
  slots = markMediaSlotFailed(slots, 2, new Error('quota'));

  assert.deepEqual(slots.map((slot) => slot.status), ['pending', 'success', 'failed']);
  assert.equal(slots[1].url, 'b.png');
  assert.equal(slots[2].error, 'quota');

  assert.deepEqual(summarizeMediaSlots(slots), {
    total: 3,
    pending: 1,
    running: 0,
    success: 1,
    failed: 1,
    cancelled: 0,
    done: false,
    hasOutput: true,
    urls: ['b.png'],
  });
});

test('media task slots can cancel unfinished work while keeping completed outputs', () => {
  let slots = createPendingMediaSlots(2);

  slots = markMediaSlotSuccess(slots, 0, ['a.png']);
  slots = markMediaSlotCancelled(slots, 1, '用户停止');

  assert.deepEqual(slots.map((slot) => slot.status), ['success', 'cancelled']);
  assert.deepEqual(summarizeMediaSlots(slots), {
    total: 2,
    pending: 0,
    running: 0,
    success: 1,
    failed: 0,
    cancelled: 1,
    done: true,
    hasOutput: true,
    urls: ['a.png'],
  });
});

test('media result slots fall back to persisted output urls when slots are missing', () => {
  assert.deepEqual(resolveMediaResultSlots([], ['a.png', 'b.png'], 10), [
    { index: 0, status: 'success', url: 'a.png', urls: ['a.png'] },
    { index: 1, status: 'success', url: 'b.png', urls: ['b.png'] },
  ]);
});

test('media result slots recover the primary url from legacy urls arrays', () => {
  assert.deepEqual(resolveMediaResultSlots([
    { index: 3, status: 'success', urls: ['', 'legacy.png'] },
    { index: 4, status: 'running', taskId: 'task-4' },
  ], ['stale.png'], 10), [
    { index: 3, status: 'success', url: 'legacy.png', urls: ['legacy.png'] },
    { index: 4, status: 'running', taskId: 'task-4' },
  ]);
});

test('successful media slot urls expose one primary output per result slot', () => {
  assert.deepEqual(successfulMediaSlotUrls([
    { index: 0, status: 'success', url: 'primary.png', urls: ['primary.png', 'duplicate.png'] },
    { index: 1, status: 'success', url: 'second.png', urls: ['second.png'] },
    { index: 2, status: 'running' },
  ]), ['primary.png', 'second.png']);
});
