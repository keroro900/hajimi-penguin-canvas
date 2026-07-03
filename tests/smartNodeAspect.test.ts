import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSmartMediaCardSize } from '../src/utils/smartNodeAspect.ts';

test('smart media cards follow landscape, portrait, and square ratios', () => {
  assert.deepEqual(resolveSmartMediaCardSize('16:9'), { width: 380, height: 214, ratio: 16 / 9 });
  assert.deepEqual(resolveSmartMediaCardSize('9:16'), { width: 300, height: 533, ratio: 9 / 16 });
  assert.deepEqual(resolveSmartMediaCardSize('1:1'), { width: 300, height: 300, ratio: 1 });
});

test('smart media cards fall back to landscape for adaptive or invalid ratios', () => {
  assert.deepEqual(resolveSmartMediaCardSize('adaptive'), { width: 380, height: 214, ratio: 16 / 9 });
  assert.deepEqual(resolveSmartMediaCardSize('bad'), { width: 380, height: 214, ratio: 16 / 9 });
});

test('smart media cards clamp manual width so tall ratios keep their shape', () => {
  assert.deepEqual(resolveSmartMediaCardSize('9:16', 760), { width: 405, height: 720, ratio: 9 / 16 });
  assert.deepEqual(resolveSmartMediaCardSize('16:9', 760), { width: 760, height: 428, ratio: 16 / 9 });
});
