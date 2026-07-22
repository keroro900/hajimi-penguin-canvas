import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sidebarSource = readFileSync(
  new URL('../src/components/CodexAgentSidebar.tsx', import.meta.url),
  'utf8',
);
const themeCss = readFileSync(
  new URL('../src/styles/theme-core.css', import.meta.url),
  'utf8',
);

test('Codex sidebar uses a compact empty state without mascot artwork or oversized greeting', () => {
  assert.doesNotMatch(sidebarSource, /codex-agent-sidebar__hero-avatar/);
  assert.doesNotMatch(sidebarSource, /codex-agent-sidebar__mascot-(?:hair|face)/);
  assert.doesNotMatch(sidebarSource, /今天一起创作点什么/);
  assert.match(sidebarSource, /codex-agent-sidebar__empty-welcome/);
  assert.match(sidebarSource, /codex-agent-sidebar__empty-skill/);
});

test('Codex sidebar keeps Skills accessible from the compact empty state', () => {
  assert.match(sidebarSource, />\s*选择 Skill\s*</);
  assert.match(sidebarSource, /setSkillLibraryOpen\(true\)/);
  assert.match(sidebarSource, /businessSkills\.filter/);
});

test('compact sidebar styling uses the shared T8 theme and constrained spacing', () => {
  assert.match(themeCss, /\.codex-agent-sidebar__empty-state\s*\{/);
  assert.match(themeCss, /\.codex-agent-sidebar__empty-welcome\s*\{/);
  assert.match(themeCss, /\.codex-agent-sidebar__empty-skill\s*\{/);
  assert.match(themeCss, /background:\s*var\(--t8-bg-panel\)/);
  assert.match(themeCss, /padding:\s*16px 18px/);
});
