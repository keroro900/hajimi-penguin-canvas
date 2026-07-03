import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('classifyClipError returns actionable render error codes and hints', () => {
  const { classifyClipError } = require('../backend/src/providers/clipErrors.js');

  assert.deepEqual(
    classifyClipError(new Error('素材不存在：/files/input/missing.mp4')).code,
    'missing-media',
  );

  const timeout = classifyClipError(new Error('剪辑渲染超时(90s)'));
  assert.equal(timeout.code, 'ffmpeg-timeout');
  assert.match(timeout.hint, /时长|素材|重试/);
  assert.match(timeout.message, /超时/);

  const filter = classifyClipError(new Error('剪辑渲染失败(1): No such filter: "curvesx"'));
  assert.equal(filter.code, 'unsupported-filter');
  assert.match(filter.hint, /滤镜|特效/);

  const encoder = classifyClipError(new Error('Unknown encoder "libx264"'));
  assert.equal(encoder.code, 'encoder-missing');
  assert.match(encoder.hint, /编码器|ffmpeg/i);

  const audio = classifyClipError(new Error('Stream specifier aout in filtergraph matches no streams'));
  assert.equal(audio.code, 'audio-stream');
  assert.match(audio.hint, /音频|静音/);

  const unknown = classifyClipError(new Error('some unrecognised ffmpeg stderr'));
  assert.equal(unknown.code, 'unknown-render-error');
  assert.match(unknown.message, /some unrecognised/);
});

test('mapWithConcurrency limits active probes while preserving output order', async () => {
  const { mapWithConcurrency } = require('../backend/src/providers/clipProbe.js');
  const activeCounts: number[] = [];
  let active = 0;

  const results = await mapWithConcurrency([30, 10, 20, 5, 15], 3, async (delay: number, index: number) => {
    active += 1;
    activeCounts.push(active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return `item-${index}`;
  });

  assert.deepEqual(results, ['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
  assert.equal(Math.max(...activeCounts), 3);
});
