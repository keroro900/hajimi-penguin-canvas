import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('resized text nodes keep long prompts inside a scrollable editor', () => {
  const textNode = read('../src/components/nodes/TextNode.tsx');
  const mentionInput = read('../src/components/nodes/MentionPromptInput.tsx');

  assert.match(textNode, /const smartCardHeight = Math\.max\(120, Number\(d\?\.smartCardHeight\) \|\| 170\)/);
  assert.match(textNode, /style=\{\{ height: smartCardHeight \}\}/);
  assert.match(textNode, /className="t8-smart-node-body t8-smart-text-body"/);
  assert.match(textNode, /\sfillHeight\s/);
  assert.doesNotMatch(textNode, /min-h-\[72px\]/);

  assert.match(mentionInput, /fillHeight\?: boolean/);
  assert.match(mentionInput, /const fillLayout = fillHeight \|\| !expandable/);
  assert.match(mentionInput, /height: fillLayout \? '100%' : style\?\.height/);
  assert.match(mentionInput, /minHeight: fillLayout \? 0 : \(style\?\.minHeight \?\? 56\)/);
});

test('text nodes render agent-provided data.text when data.prompt is absent', () => {
  const textNode = read('../src/components/nodes/TextNode.tsx');

  assert.match(textNode, /const promptText = typeof d\?\.prompt === 'string' \? d\.prompt : ''/);
  assert.match(textNode, /const legacyText = typeof d\?\.text === 'string' \? d\.text : ''/);
  assert.match(textNode, /const text = promptText \|\| legacyText/);
});
