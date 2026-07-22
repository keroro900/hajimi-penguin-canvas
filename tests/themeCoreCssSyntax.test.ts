import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

test('theme-core css parses with postcss', () => {
  const css = readFileSync(new URL('../src/styles/theme-core.css', import.meta.url), 'utf8');

  assert.doesNotThrow(() => postcss.parse(css, { from: 'src/styles/theme-core.css' }));
});
