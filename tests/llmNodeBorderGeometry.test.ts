import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const llm = readFileSync(resolve(root, 'src/components/nodes/LLMNode.tsx'), 'utf8');
const shell = readFileSync(resolve(root, 'src/components/nodes/shared/SmartNodeShell.tsx'), 'utf8');

test('LLM keeps drag/drop props and exposes keyboard activation for its composer', () => {
  const shellStart = llm.indexOf('<SmartNodeShell');
  const shellEnd = llm.indexOf('    >', shellStart);
  assert.ok(shellStart >= 0 && shellEnd > shellStart);
  const openingTag = llm.slice(shellStart, shellEnd + 1);
  assert.match(openingTag, /onKeyboardActivate=\{\(\) => setSmartComposerOpenLocal\(true\)\}/);
  assert.match(openingTag, /rootProps=\{\{[\s\S]*\.\.\.dropProps/);
  assert.match(openingTag, /className=\{`t8-smart-llm-node[\s\S]*is-selected/);
});

test('SmartNodeShell remains focusable only when it exposes a meaningful keyboard action', () => {
  assert.match(shell, /type SmartNodeRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'tabIndex'>[\s\S]*`data-\$\{string\}`/);
  assert.match(shell, /rootProps\?: SmartNodeRootProps/);
  assert.match(shell, /tabIndex=\{onKeyboardActivate \? 0 : undefined\}/);
  assert.match(shell, /if \(event\.target !== event\.currentTarget\) return;/);
  assert.match(shell, /if \(event\.key !== ' '\) return;/);
});

test('LLM nested controls retain their native keyboard entry points', () => {
  assert.match(llm, /<select/);
  assert.match(llm, /<PromptTextarea/);
  assert.match(llm, /<button/);
});
