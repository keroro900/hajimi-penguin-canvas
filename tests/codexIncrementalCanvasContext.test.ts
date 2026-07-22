import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSdkPromptForTests } = require('../backend/src/utils/codexSdkManager.js');

test('Codex SDK sends full canvas context once, then only changed context sections', () => {
  const body = {
    canvasId: 'canvas-a',
    message: '继续',
    canvasIntent: { goal: '生成童装主图' },
    generationPreferences: { imageModel: 'gpt-image-2', size: '1K' },
    mentions: [{ id: 'image-a', url: '/a.png' }],
  };

  const first = buildSdkPromptForTests(body, {});
  assert.equal(first.sentFullInstructions, true);
  assert.match(first.text, /本轮画布运行上下文/);

  const remembered = {
    codexThreadId: 'thread-a',
    threadInitialized: true,
    nativeContextHash: first.runtimeHash,
    nativeContextItems: first.contextItems,
    nativeWorkspaceSkillsHash: first.workspaceSkillsHash,
  };
  const unchanged = buildSdkPromptForTests(body, remembered);
  assert.equal(unchanged.sentFullInstructions, false);
  assert.doesNotMatch(unchanged.text, /本轮画布运行上下文/);
  assert.doesNotMatch(unchanged.text, /画布上下文增量/);

  const changed = buildSdkPromptForTests({
    ...body,
    generationPreferences: { imageModel: 'gpt-image-2', size: '2K' },
  }, remembered);
  assert.equal(changed.sentFullInstructions, false);
  assert.match(changed.text, /画布上下文增量/);
  assert.match(changed.text, /生成偏好/);
  assert.doesNotMatch(changed.text, /Mentions：/);
});
