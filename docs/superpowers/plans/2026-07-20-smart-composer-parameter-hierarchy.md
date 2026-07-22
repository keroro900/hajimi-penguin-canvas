# Smart Composer Parameter Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give JIMI Default smart-composer parameters distinct compact controls without making the dark UI bright, gray, or taller.

**Architecture:** Keep the existing shared composer DOM and paint only existing select controls with a theme-scoped rule in `jimi-foundation.css`. Protect both the hierarchy and original vertical density with PostCSS AST assertions; no wrapper padding, React, or generation behavior changes are needed.

**Tech Stack:** CSS custom properties and `color-mix()`, PostCSS AST tests, Node test runner, TypeScript.

---

## Chunk 1: Shared JIMI parameter hierarchy

### Task 1: Add the visual contract and scoped styles

**Files:**
- Modify: `tests/jimiNodeVisuals.test.ts`
- Modify: `src/styles/jimi-foundation.css`
- Reference: `docs/superpowers/specs/2026-07-20-smart-composer-parameter-hierarchy-design.md`

- [ ] **Step 1: Write the failing CSS contract test**

Add a test that finds the exact JIMI-scoped nested-select rule while proving that no painted field or prompt wrappers add height. Assert:

```ts
const select = cssRules(jimiCssRoot, (selector) => selector === `${SCOPE} .t8-smart-node-composer .t8-smart-field .t8-smart-select`);
assert.ok(winningValues(select, 'background').includes('color-mix(in srgb, var(--t8-bg-panel-muted) 74%, var(--t8-bg-panel-elevated))'));
assert.ok(winningValues(select, 'border').includes('1px solid color-mix(in srgb, var(--t8-border-strong) 55%, var(--t8-border))'));
assert.ok(winningValues(select, 'box-shadow').includes('none'));

assert.deepEqual(cssRules(jimiCssRoot, (selector) => selector === `${SCOPE} .t8-smart-node-composer .t8-smart-field`), []);
assert.deepEqual(cssRules(jimiCssRoot, (selector) => selector === `${SCOPE} .t8-smart-node-composer .t8-smart-prompt-shell`), []);
```

Name the test `JIMI smart composer separates compact controls without increasing wrapper height`. Also:

- Assert the select rule does not declare padding, width, height, min/max dimensions, margin, flex, grid, position, transform, display, or box-sizing.
- Gather every rule in `jimi-foundation.css` that targets `.t8-smart-select` and assert each selector starts with `SCOPE` and contains `.t8-smart-node-composer`.
- Confirm the existing exact `${SCOPE} :focus-visible` rule still declares `outline: 2px solid var(--t8-brand-accent, #5f8dff)`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/jimiNodeVisuals.test.ts`

Expected: the compact-density test fails while the bulky wrapper rules still exist.

- [ ] **Step 3: Add the minimal scoped CSS**

Add under the JIMI Default refinement section:

```css
html[data-theme-template="tech-default"] .t8-smart-node-composer .t8-smart-field .t8-smart-select {
  border: 1px solid color-mix(in srgb, var(--t8-border-strong) 55%, var(--t8-border));
  background: color-mix(in srgb, var(--t8-bg-panel-muted) 74%, var(--t8-bg-panel-elevated));
  box-shadow: none;
}
```

Do not add gradients, fixed dimensions, layout declarations, or geometry-changing hover effects.

- [ ] **Step 4: Run focused and architecture tests and verify GREEN**

Run: `npm test -- tests/jimiNodeVisuals.test.ts tests/themeCssArchitecture.test.ts tests/themeSurfaceContract.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Run TypeScript verification**

Run: `npm run type-check`

Expected: TypeScript exits successfully with no diagnostics.

- [ ] **Step 6: Run whitespace verification**

Run a whitespace check that includes these currently untracked files rather than relying only on `git diff --check`.

Expected: no whitespace errors in the implementation files.

- [ ] **Step 7: Review the final diff without staging unrelated work**

Inspect the exact added CSS and test sections directly because these files are currently untracked.

Expected: only the scoped parameter hierarchy and its regression test appear. Do not commit or stage the implementation because the shared worktree already contains extensive user changes.
