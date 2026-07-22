import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('LLM submissions add an instruction when media is connected without text', async () => {
  const module = await import('../src/utils/llmSubmission.ts').catch(() => null);
  assert.ok(module, 'llm submission normalization should exist');
  assert.equal(
    module.resolveLlmSubmissionText('', '', { images: 3, videos: 1 }),
    '请分析并解释所提供的图片和视频内容。',
  );
});

test('LLM submissions preserve upstream text priority and local fallback', async () => {
  const module = await import('../src/utils/llmSubmission.ts').catch(() => null);
  assert.ok(module, 'llm submission normalization should exist');
  assert.equal(module.resolveLlmSubmissionText('上游要求', '本地要求', { images: 1, videos: 0 }), '上游要求');
  assert.equal(module.resolveLlmSubmissionText('', '本地要求', { images: 1, videos: 0 }), '本地要求');
  assert.equal(module.resolveLlmSubmissionText('', '', { images: 0, videos: 0 }), '');
});

test('LLM node uses an inline workbench instead of a click-open composer', () => {
  const node = readFileSync(new URL('../src/components/nodes/LLMNode.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/theme-core.css', import.meta.url), 'utf8');
  assert.match(node, /t8-llm-workbench/);
  assert.match(node, /t8-llm-composer__prompt-stack/);
  assert.match(node, /<details[^>]*className="t8-llm-composer__advanced"/);
  assert.match(node, /t8-llm-composer__footer/);
  assert.doesNotMatch(node, /<SmartNodeComposer/);
  assert.doesNotMatch(node, /useIsSmartNodeComposerOpen/);
  assert.match(css, /\.t8-llm-composer__prompt-stack\s*\{/);
  assert.match(css, /\.t8-llm-composer__footer\s*\{/);
  assert.match(css, /\.t8-llm-workbench\s*\{/);
});

test('LLM node presents a compact prompt-first surface', () => {
  const node = readFileSync(new URL('../src/components/nodes/LLMNode.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/theme-core.css', import.meta.url), 'utf8');

  assert.match(node, /t8-llm-compact/);
  assert.match(node, /t8-llm-result/);
  assert.match(node, /t8-llm-settings/);
  assert.match(node, /density="compact"/);
  assert.match(node, /title="停止当前请求"/);
  assert.doesNotMatch(node, /onBlur=\{handleCommitEdit\}/);
  assert.match(node, /onClick=\{handleCommitEdit\}/);
  assert.match(node, /onClick=\{handleCancelEdit\}/);
  assert.match(node, /aria-label="新建会话"/);
  assert.match(node, /t8-llm-role/);
  assert.doesNotMatch(node, />LLM \/ Vision</);
  assert.doesNotMatch(node, /🧑|🤖|\(双击编辑\)/);
  assert.doesNotMatch(node, /t8-smart-llm-chat/);
  assert.doesNotMatch(node, /<option value="url"[^>]*>完整视频 URL<\/option>/);
  assert.match(css, /\.t8-llm-compact\s*\{/);
  assert.match(css, /\.t8-llm-result\s*\{/);
});

test('LLM results open in a floating conversation panel and model selections retain their source', () => {
  const node = readFileSync(new URL('../src/components/nodes/LLMNode.tsx', import.meta.url), 'utf8');
  const modalLayer = readFileSync(new URL('../src/components/nodes/shared/SmartNodeModalLayer.tsx', import.meta.url), 'utf8');

  assert.match(node, /<SmartNodeFloatingPanel/);
  assert.match(node, /open=\{resultOpen && hasChat\}/);
  assert.match(node, /onClick=\{\(\) => setResultOpen\(true\)\}/);
  assert.doesNotMatch(node, /<details className="t8-llm-result/);
  assert.match(node, /modelSource:\s*selectedModelSource/);
  assert.match(node, /update\(\{ model: next\.model, modelSource: next\.source \}\)/);
  assert.match(modalLayer, /if \(event\.target === event\.currentTarget\) onClose\(\)/);
});
