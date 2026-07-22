import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelList } from '../src/providers/models.ts';
import { extractSeedancePromptPayload } from '../src/utils/seedancePromptPayload.ts';

test('model override inputs can parse copied JSON model objects', () => {
  assert.deepEqual(
    parseModelList('[{"id":"video-standard-720p"},{"model":"seedance-2.0-480p"},{"value":"sd2-720p"}]'),
    ['video-standard-720p', 'seedance-2.0-480p', 'sd2-720p'],
  );
  assert.deepEqual(
    parseModelList('{"data":[{"id":"grok-imagine-video"},{"id":"seedance-2.0-1080p"}]}'),
    ['grok-imagine-video', 'seedance-2.0-1080p'],
  );
});

test('Seedance prompt input can carry structured refImages JSON objects', () => {
  const parsed = extractSeedancePromptPayload(JSON.stringify({
    prompt: '角色A 按音频自然说话',
    refImages: [
      { url: 'https://cdn.example.com/person.jpg', name: '角色A', type: 'image' },
      { url: '/files/input/voice.mp3', name: '角色A', type: 'audio' },
    ],
  }));

  assert.equal(parsed.prompt, '角色A 按音频自然说话');
  assert.deepEqual(parsed.refImages, [
    { url: 'https://cdn.example.com/person.jpg', name: '角色A', type: 'image' },
    { url: '/files/input/voice.mp3', name: '角色A', type: 'audio' },
  ]);
});

test('Seedance prompt input strips an inline refImages block from natural prompt text', () => {
  const parsed = extractSeedancePromptPayload(`镜头缓慢推进
refImages: [{"url":"https://cdn.example.com/person.jpg","name":"角色A","type":"image"}]`);

  assert.equal(parsed.prompt, '镜头缓慢推进');
  assert.deepEqual(parsed.refImages, [
    { url: 'https://cdn.example.com/person.jpg', name: '角色A', type: 'image' },
  ]);
});
