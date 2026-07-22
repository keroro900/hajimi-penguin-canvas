# Tap Studio Canvas Language Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the `tap-studio` canvas UI into a pure-color, soft floating-island canvas language inspired by TapNow without copying brand assets.

**Architecture:** Keep behavior and data flow unchanged. Add a small `tap-studio` empty-state chrome layer in `Canvas.tsx`, then let `src/styles/theme-tap-studio.css` own the visual language for pure canvas background, floating controls, toolbar islands, and softer nodes.

**Tech Stack:** React, TypeScript, ReactFlow, CSS theme overrides, Node test runner.

---

## File Structure

- Modify: `tests/tapStudioTheme.test.ts`
  - Theme-level source tests for pure canvas background, floating island selectors, visible zoom controls, and empty-state class hooks.
- Modify: `src/components/Canvas.tsx`
  - Render a `tap-studio` only empty canvas prompt starter when `nodes.length === 0`.
  - Add stable class/data hooks around existing floating controls if needed.
- Modify: `src/styles/theme-tap-studio.css`
  - Replace grid/dot/wash background tokens with pure dark surface tokens.
  - Restyle existing topbar/sidebar/toolbar/control/node surfaces into softer rounded islands.
  - Increase node radius and reduce industrial borders.

---

## Chunk 1: Tests

### Task 1: Lock The Design Contract

**Files:**
- Modify: `tests/tapStudioTheme.test.ts`

- [ ] **Step 1: Add failing CSS contract assertions**

Add assertions that `theme-tap-studio.css` includes pure canvas tokens and does not define `--tap-canvas-grid` or dotted/grid pseudo-backgrounds.

- [ ] **Step 2: Add failing Canvas source assertions**

Read `src/components/Canvas.tsx` in the same test file and assert it contains `t8-tap-empty-starter`, `data-canvas-floating-ui="tap-empty-starter"`, and a `visualStyle === 'tap-studio' && nodes.length === 0` guard.

- [ ] **Step 3: Run focused tests and confirm they fail**

Run: `npm test -- tests/tapStudioTheme.test.ts`

Expected: FAIL until the implementation lands.

---

## Chunk 2: Canvas Empty-State Chrome

### Task 2: Add Tap Studio Empty Starter

**Files:**
- Modify: `src/components/Canvas.tsx`

- [ ] **Step 1: Add the theme-only JSX**

Near the existing floating UI setup, define a `tapStudioEmptyStarter` constant guarded by:

```tsx
const tapStudioEmptyStarter = visualStyle === 'tap-studio' && nodes.length === 0 ? (
  <div className="t8-tap-empty-starter nodrag nopan" data-canvas-floating-ui="tap-empty-starter" role="status">
    ...
  </div>
) : null;
```

Use existing `LucideIcons` and simple buttons/chips. Do not wire new business logic in this phase; keep it as visual guidance plus existing double-click/template cues.

- [ ] **Step 2: Render it above ReactFlow**

Place `{tapStudioEmptyStarter}` inside `.t8-canvas-shell` alongside other floating UI, before or after `CanvasToolbar`.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- tests/tapStudioTheme.test.ts`

Expected: CSS assertions may still fail, Canvas assertions pass.

---

## Chunk 3: Tap Studio CSS Language

### Task 3: Pure Canvas And Floating Islands

**Files:**
- Modify: `src/styles/theme-tap-studio.css`

- [ ] **Step 1: Replace canvas background tokens**

Remove or stop using grid/dot tokens:

```css
--tap-canvas-grid
```

Add pure-color tokens:

```css
--tap-canvas-solid: #030303;
--tap-island-bg: color-mix(in srgb, #202124 82%, transparent);
--tap-island-border: rgba(255, 255, 255, 0.10);
--tap-radius: 18px;
--tap-radius-sm: 14px;
```

- [ ] **Step 2: Make canvas pure color**

Update `.t8-canvas-shell` and its pseudo-elements so `tap-studio` has no dot/grid/linear ornamental layer. Pseudo-elements should be disabled or transparent.

- [ ] **Step 3: Restyle controls as soft islands**

Update selectors for:
- `.t8-canvas-toolbar`
- `.t8-toolbar-panel`
- `.t8-control-rail`
- `.t8-control-stack`
- `.react-flow__controls`
- `.react-flow__controls-button`
- `.t8-theme-music-toggle`

Use pill/rounded geometry, stable sizes, visible zoom buttons, and low-contrast borders.

- [ ] **Step 4: Restyle nodes**

Update selectors for:
- `.react-flow__node:not(.react-flow__node-groupBox) > div:first-child`
- `.t8-node`
- `.t8-smart-node-card`
- `.t8-output-card`
- `.t8-material-set-classic`
- headers, status chips, media frames, handles, resize handles.

Target 18-24px radius and softer shadows.

- [ ] **Step 5: Style empty starter**

Add CSS for:
- `.t8-tap-empty-starter`
- `.t8-tap-empty-starter__cue`
- `.t8-tap-empty-starter__chips`
- `.t8-tap-empty-starter__chip`

Keep text compact and centered. No feature-description wall copy.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- tests/tapStudioTheme.test.ts`

Expected: PASS.

---

## Chunk 4: Verification

### Task 4: Verify The Build

**Files:**
- No additional edits expected.

- [ ] **Step 1: Run focused route/theme tests**

Run: `npm test -- tests/themeRoutes.test.ts tests/tapStudioTheme.test.ts`

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS, allowing existing chunk-size warnings.

- [ ] **Step 4: Summarize changed files and residual risk**

Call out that the redesign is scoped to `tap-studio`, and mention whether screenshot QA was run.
