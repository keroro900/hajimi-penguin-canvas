import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImageNodeFinalPrompt } from '../src/utils/imageNodePromptPriority.ts';

test('image node generation prefers an edited local prompt over upstream image prompt text', () => {
  assert.equal(
    resolveImageNodeFinalPrompt({
      upstreamPrompt: '这个男人在嬉笑',
      localPrompt: '这个男人在哭笑',
      comfyPrompt: '',
      isComfyExternal: false,
    }),
    '这个男人在哭笑',
  );
});

test('image node generation inherits upstream prompt only when local prompt is empty', () => {
  assert.equal(
    resolveImageNodeFinalPrompt({
      upstreamPrompt: '沿用上游提示词',
      localPrompt: '   ',
      comfyPrompt: '',
      isComfyExternal: false,
    }),
    '沿用上游提示词',
  );
});

test('ComfyUI image node generation prefers mapped prompt before upstream prompt', () => {
  assert.equal(
    resolveImageNodeFinalPrompt({
      upstreamPrompt: '旧的上游提示词',
      localPrompt: '节点本地提示词',
      comfyPrompt: 'ComfyUI 映射提示词',
      isComfyExternal: true,
    }),
    'ComfyUI 映射提示词',
  );
});
