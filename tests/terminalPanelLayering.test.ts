import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('terminal panel renders above canvas floating controls in every theme branch', () => {
  const terminal = read('../src/components/TerminalPanel.tsx');

  assert.match(terminal, /const terminalLayerCls = ['"]t8-terminal-panel absolute left-3 right-3 bottom-3 z-\[10070\] select-none pointer-events-auto['"]/);
  assert.equal((terminal.match(/className=\{terminalLayerCls\}/g) || []).length, 2);
  assert.doesNotMatch(terminal, /absolute left-3 right-3 bottom-3 z-30 select-none pointer-events-auto/);
});
