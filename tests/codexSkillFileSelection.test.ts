import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/components/CodexAgentSidebar.tsx', import.meta.url),
  'utf8',
);

test('Skill file tree loading does not restart when the selected file path changes', () => {
  const loader = source.match(/const loadSkillFileTree = useCallback\([\s\S]*?\n  \}, \[([^\]]*)\]\);/);
  assert.ok(loader, 'loadSkillFileTree callback should exist');
  assert.doesNotMatch(loader[1], /selectedSkillFilePath/);
});

test('Skill file reads ignore stale responses that would replace the latest user selection', () => {
  assert.match(source, /skillFileRequestIdRef/);
  assert.match(source, /requestId !== skillFileRequestIdRef\.current/);
  assert.match(source, /selectedSkillFilePathRef\.current = filePath/);
});

test('Skill file selection is preserved for files nested in reference directories', () => {
  assert.match(source, /function skillFileTreeIncludesPath\(/);
  assert.match(source, /skillFileTreeIncludesPath\(file\.children \|\| \[\], filePath\)/);
  assert.match(source, /skillFileTreeIncludesPath\(result\.files, currentPath\)/);
});
