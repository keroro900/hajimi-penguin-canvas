import test from 'node:test';
import assert from 'node:assert/strict';

import { stripLeadingImeAsciiLeak } from '../src/utils/imeComposition.ts';

test('stripLeadingImeAsciiLeak removes a single pinyin prefix leaked before CJK composition text', () => {
  assert.deepEqual(
    stripLeadingImeAsciiLeak({
      beforeText: '',
      afterText: 'x习近平',
      caret: 4,
      candidate: { start: 0, end: 1, data: 'x' },
    }),
    { text: '习近平', caretDelta: -1, changed: true },
  );
});

test('stripLeadingImeAsciiLeak infers the leaked pinyin prefix when compositionstart snapshot is missing', () => {
  assert.deepEqual(
    stripLeadingImeAsciiLeak({
      beforeText: '',
      afterText: 'x习近平',
      caret: 4,
      candidate: null,
    }),
    { text: '习近平', caretDelta: -1, changed: true },
  );
});

test('stripLeadingImeAsciiLeak keeps normal English words before CJK text', () => {
  assert.deepEqual(
    stripLeadingImeAsciiLeak({
      beforeText: 'love ',
      afterText: 'love 习近平',
      caret: 8,
      candidate: { start: 5, end: 6, data: 'x' },
    }),
    { text: 'love 习近平', caretDelta: 0, changed: false },
  );
});
