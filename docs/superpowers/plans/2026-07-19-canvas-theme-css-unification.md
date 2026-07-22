# Canvas Theme CSS Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all 11 built-in themes a solid canvas and a dependable canvas→node→floating-surface hierarchy in both modes while consolidating shared node decoration and preserving behavior.

**Architecture:** Keep the existing theme registry and `--t8-*` compatibility API. Enforce opaque semantic surface tokens in the registry/application layer, remove React Flow/decorative canvas backgrounds globally, and make shared CSS primitives own node decoration while theme files retain palette character only.

**Tech Stack:** React 19, TypeScript, Zustand, `@xyflow/react`, PostCSS, Node test runner, Vite.

---

## File Structure

- Create `src/theme/solidColor.ts`: pure opaque-color validation, normalization, luminance, and contrast helpers.
- Create `tests/themeSurfaceContract.test.ts`: registry-wide semantic surface and custom fallback contract.
- Create `tests/themeCssArchitecture.test.ts`: PostCSS/static checks for solid canvas, shared node ownership, aliases, and forbidden fixed selected rings.
- Modify `src/theme/applyTheme.ts`: normalize canvas colors, force canvas-pattern metadata to `none`, and publish compatibility aliases.
- Modify `src/theme/defaultTemplates.ts`: solid opaque mode tokens, `canvasPattern: 'none'`, and updated descriptions for all 11 templates.
- Modify `src/components/Canvas.tsx`: remove the React Flow `Background` import/render path while preserving pane hit testing.
- Modify `src/styles/jimi-foundation.css`: global solid-canvas guard, canonical node-shadow token, aliases, and pre-boot surfaces.
- Modify `src/styles/theme-core.css`: shared node/card/header/port/selected/floating surface contract.
- Modify `src/styles/theme-{pixel,rh,soft,wabi,vapor,utility,skeuo,retro,ink,tap-studio}.css`: remove canvas art and regular-node surface overrides that violate the shared contract.
- Modify selected node components identified by the registry/static test: replace fixed Tailwind rings and inline selected shadows with `is-selected`/shared semantic styling without changing geometry.
- Modify affected existing tests (`tapStudioTheme`, `canvasThemeDragBackground`, theme registration tests) to reflect the global solid-canvas contract.

Because the working tree already contains extensive user edits, implementation tasks do not stage or commit source files. Before touching each overlapping file, inspect and retain its current `git diff -- <exact-file>`; after the change, inspect the same exact-file diff and verify every newly introduced hunk belongs to this plan. Documentation commits already exist separately, but source integration remains in the user's dirty tree for explicit review.

## Chunk 1: Theme Data and Runtime Contract

### Task 1: Add failing registry-wide surface tests

**Files:**
- Create: `tests/themeSurfaceContract.test.ts`
- Test: `tests/themeSurfaceContract.test.ts`

- [ ] **Step 1: Write the failing opaque-color and luminance tests**

Import `BUILT_IN_THEME_TEMPLATES` and assert exactly 11 entries. For every light/dark mode require non-empty app/canvas/panel/elevated/muted/node/header/text/border/shadow tokens; require opaque `canvasBg`, `nodeBg`, `nodeHeaderBg`, and `panelBgElevated`; require `canvasPattern === 'none'`; calculate WCAG luminance and assert canvas/node `1.12:1`, mode ordering, header/body `0.015`, and `textMain`/header `4.5:1`.

- [ ] **Step 2: Write failing custom normalization and DOM application tests**

Exercise a wished-for `normalizeSolidCanvasColor(value, fallback)` API with valid hex/rgb and invalid gradient, URL, transparent, named, rgba, eight-digit hex, and slash-alpha inputs. Use a minimal document-root style/attribute stub to call `applyThemeTemplate` with custom templates and prove valid canvas values survive, invalid dark values become `#121214`, invalid light values become `#faf7f1`, the input template object is deep-equal to its pre-call snapshot, and `data-theme-canvas-pattern` is always `none`.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- tests/themeSurfaceContract.test.ts`

Expected: FAIL because `solidColor.ts` does not exist and built-in themes still expose pattern metadata/translucent or gradient node surfaces.

### Task 2: Implement color helpers and theme application guard

**Files:**
- Create: `src/theme/solidColor.ts`
- Modify: `src/theme/applyTheme.ts`
- Test: `tests/themeSurfaceContract.test.ts`

- [ ] **Step 1: Implement the minimal pure helper**

Provide `parseOpaqueSolidColor`, `normalizeSolidCanvasColor`, `relativeLuminance`, and `contrastRatio`. Export `FOUNDATION_CANVAS_BY_MODE = { dark: '#121214', light: '#faf7f1' }`. Accept only the formats pinned by the spec; return `null` for alpha/decorative inputs.

- [ ] **Step 2: Apply normalized canvas and compatibility aliases**

In `applyThemeTemplate`, skip the raw `canvasBg` entry in the generic token loop and set its normalized value exactly once using `FOUNDATION_CANVAS_BY_MODE[mode]`; set `data-theme-canvas-pattern="none"`; set `--t8-shadow-node` to `tokens.shadowPanel || '0 8px 24px rgba(0, 0, 0, 0.18)'`; and map:

```ts
root.style.setProperty('--t8-node-bg', 'var(--t8-bg-node)');
root.style.setProperty('--t8-node-header-bg', 'var(--t8-bg-node-header)');
root.style.setProperty('--t8-node-shadow', 'var(--t8-shadow-node)');
root.style.setProperty('--t8-text', 'var(--t8-text-main)');
```

- [ ] **Step 3: Run normalization tests**

Run: `npm test -- tests/themeSurfaceContract.test.ts`

Expected: normalization subtests PASS; registry palette subtests still FAIL.

### Task 3: Convert all built-in theme metadata and surface palettes

**Files:**
- Modify: `src/theme/defaultTemplates.ts`
- Modify: `src/components/ThemeTemplateManager.tsx` if its built-in presets duplicate pattern metadata
- Test: `tests/themeSurfaceContract.test.ts`

- [ ] **Step 1: Change all 11 built-ins to `canvasPattern: 'none'`**

Update descriptions so they no longer promise canvas grids, dots, paper, wood, maps, or textures. Keep IDs, names, music, and node-frame metadata stable.

- [ ] **Step 2: Replace non-solid surface tokens**

For both modes of every built-in template, use opaque solid `canvasBg`, `nodeBg`, `nodeHeaderBg`, and `panelBgElevated`. Adjust light palettes to a tinted canvas plus brighter node; adjust dark palettes to monotonically lighter node/elevated surfaces. Preserve each theme's hue family.

- [ ] **Step 3: Tune values until the objective contract passes**

Run: `npm test -- tests/themeSurfaceContract.test.ts`

Expected: PASS for all 11 templates and both modes.

- [ ] **Step 4: Inspect exact-file diffs for Chunk 1**

Run `git diff --` with the exact five Chunk 1 paths. Verify no pre-existing hunks were removed and no unrelated hunk was introduced. Do not stage or commit source files in this dirty worktree.

## Chunk 2: Solid Canvas Rendering

### Task 4: Add failing canvas CSS architecture tests

**Files:**
- Create: `tests/themeCssArchitecture.test.ts`
- Modify: `tests/canvasThemeDragBackground.test.ts`
- Modify: `tests/tapStudioTheme.test.ts`

- [ ] **Step 1: Pin the no-background render contract**

Assert `Canvas.tsx` no longer imports or renders `Background`/`BackgroundVariant`, while `.react-flow__background` may remain in pane-target hit testing.

- [ ] **Step 2: Parse all theme CSS files with PostCSS**

Reject active canvas-shell pseudo-element artwork, canvas `background-image`, React Flow background pattern styling, and repeating/radial/linear gradients attached to canvas selectors. Replace the old drag-background test with an assertion that viewport/drag states cannot restore decorative canvas layers.

- [ ] **Step 3: Run and verify RED**

Run: `npm test -- tests/themeCssArchitecture.test.ts tests/canvasThemeDragBackground.test.ts tests/tapStudioTheme.test.ts`

Expected: FAIL on the current `Background` render and theme pseudo-element rules.

### Task 5: Remove canvas decorations at the source

**Files:**
- Modify: `src/components/Canvas.tsx`
- Modify: `src/styles/index.css`
- Modify: `src/styles/jimi-foundation.css`
- Modify: all ten `src/styles/theme-*.css` files listed above

- [ ] **Step 1: Remove React Flow background rendering**

Delete `Background` and `BackgroundVariant` imports and the JSX block. Do not change pane hit-testing or interaction handlers.

- [ ] **Step 2: Establish the global solid guard**

Make `.t8-canvas-shell`, `.react-flow`, pane, renderer, and viewport inherit the solid canvas token. Disable shell decorative pseudo-elements globally. Use no new theme-specific `!important`; remove obsolete higher-specificity canvas blocks from theme files.

- [ ] **Step 3: Delete theme canvas artwork blocks**

Remove the soft/wabi/vapor/utility/skeuo/retro/ink/tap/RH/pixel background pattern and pseudo-element blocks, plus stale comments/variables that promise them. Preserve feature-local gradients that are not canvas or regular node surfaces.

- [ ] **Step 4: Run focused canvas tests**

Run: `npm test -- tests/themeCssArchitecture.test.ts tests/canvasThemeDragBackground.test.ts tests/tapStudioTheme.test.ts tests/themeCoreCssSyntax.test.ts`

Expected: PASS with every CSS file parseable.

- [ ] **Step 5: Inspect exact-file diffs for Chunk 2**

Review each modified canvas/style/test path explicitly with `git diff -- <exact-file>`. Do not use directory-wide staging or commit source files.

## Chunk 3: Shared Node Surfaces and Selection

### Task 6: Extend failing architecture tests for node surfaces

**Files:**
- Modify: `tests/themeCssArchitecture.test.ts`
- Create or modify: `tests/jimiNodeVisuals.test.ts`

- [ ] **Step 1: Add AST assertions for shared primitives**

Require opaque token-backed backgrounds for `.t8-node`, `.t8-smart-node-card`, and `.t8-node-header`; require semantic hover and `.is-selected`/selected wrapper rules; reject gradient/alpha regular-node body/header overrides in built-in theme CSS.

- [ ] **Step 2: Add registered-node source scan**

Parse TSX with the TypeScript compiler API. Derive every registered type and its component from `NODE_REGISTRY` plus the `Canvas.tsx` node-type mapping, then inspect every top-level JSX element returned by that component function regardless of its current class names. A return is top-level only when its nearest owning function is the component itself, not a nested callback/render helper. Require every regular root variant to adopt `t8-node`, `t8-smart-node-card`, or the explicit shared marker `data-canvas-node-root="true"`; inspect selection styling only on that returned root. Reject fixed `ring-*-300`, `selected`/`p.selected` inline shadows, and selected inline theme colors there. Exclude `GroupBoxNode` and `bulkPhantom`. Add a Layer Agent regression proving its current non-semantic root and outer `p.selected` border/shadow produce RED, then require the migrated root to use the semantic root/`is-selected` contract. Its internal `selectedLayerId === layer.id` ring and row-selection styles remain allowed because AST ancestry identifies them as descendants rather than component return roots.

- [ ] **Step 3: Pin geometry invariants**

Assert shared hover rules contain no `transform`, width, height, padding, overflow, or box-sizing changes. Pin exact source contracts: `VideoEditNode` retains `min-w-[760px] max-w-[760px] overflow-hidden` and 12px handles; smart `ImageNode` retains `style={{ width: smartCardWidth }}`, `style={{ height: smartCardHeight }}`, two `t8-smart-node-port` handles, and `.t8-smart-node-preview`; `GroupBoxNode` retains outer `overflow: 'visible'`, 14px target/source handles, `HEADER_H`, and its existing body height calculation. These assertions pass before and after; only the hover-transform prohibition starts RED.

- [ ] **Step 3b: Pin floating-surface ownership**

Require `.t8-panel`, `.t8-smart-node-composer`, `.t8-context-menu`, `.t8-control-rail .react-flow__controls`, and `.t8-canvas-toolbar` to consume `--t8-bg-panel-elevated`, `--t8-border`, `--t8-radius-panel`/button, and `--t8-shadow-panel` in the shared layer. Theme files may change tokens but may not repaint these shared outer surfaces with unrelated hard-coded colors.

- [ ] **Step 4: Run and verify RED**

Run: `npm test -- tests/themeCssArchitecture.test.ts tests/jimiNodeVisuals.test.ts`

Expected: FAIL on fixed rings, inline selected shadows, gradient/translucent theme node surfaces, and the current JIMI hover translation.

### Task 7: Consolidate shared node decoration

**Files:**
- Modify: `src/styles/jimi-foundation.css`
- Modify: `src/styles/theme-core.css`
- Modify: built-in `src/styles/theme-*.css` files
- Modify: registered node components reported by the failing scan

- [ ] **Step 1: Define shared node surface rules**

Use token-backed solid body/header surfaces, `--t8-shadow-node`, semantic border/hover/selected states, and port cutout rings in `theme-core.css`. Remove the JIMI `translateY(-1px)` hover movement.

- [ ] **Step 2: Remove conflicting regular-node theme overrides**

Keep theme palette/radius/border/shadow variables and specialist inner-editor styling. Delete only rules that repaint common node bodies/headers with gradients/translucency or duplicate selected geometry.

- [ ] **Step 3: Migrate component selected states**

Replace outer fixed Tailwind rings and inline selected shadows in the test-reported components with an `is-selected` class consumed by the shared rule. Do not change widths, padding, media viewport, overflow, handle offsets, or transforms.

- [ ] **Step 4: Run focused node tests**

Run: `npm test -- tests/themeCssArchitecture.test.ts tests/jimiNodeVisuals.test.ts tests/nodeResizeBehavior.test.ts tests/nodeSerialBadgeLayout.test.ts tests/connectionErgonomics.test.ts`

Expected: PASS.

- [ ] **Step 5: Inspect exact-file diffs for Chunk 3**

Review every reported node/style/test file separately. Confirm internal editor selection styles remain unchanged and no geometry hunk was introduced. Do not stage or commit source files.

## Chunk 4: Verification and Visual Self-Audit

### Task 8: Run automated verification

- [ ] **Step 1: Run focused theme/canvas/node suite**

Run: `npm test -- tests/themeSurfaceContract.test.ts tests/themeCssArchitecture.test.ts tests/themeCoreCssSyntax.test.ts tests/themeRoutes.test.ts tests/apiSettingsTheme.test.ts tests/tapStudioTheme.test.ts tests/canvasThemeDragBackground.test.ts tests/jimiFoundation.test.ts tests/jimiNodeVisuals.test.ts`

- [ ] **Step 2: Run full verification**

Run: `npm run verify`

Expected: exit 0, no failed tests or type errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: exit 0.

### Task 9: Browser visual audit

- [ ] **Step 1: Launch the development app with explicit commands**

Start `npm run dev:backend` and `npm run dev:vite -- --host 127.0.0.1` as separate background processes, then open the reported local Vite URL in the in-app browser.

- [ ] **Step 2: Audit all 22 built-in combinations**

Before switching themes, evaluate `JSON.stringify(localStorage)` in the test page and retain the snapshot in session memory. For each of 11 templates in light and dark mode, inspect: empty canvas, classic node, smart node, selected node, ports, edge, toolbar, menu/popover, and zoomed-out overview. Confirm no dots/grids/textures and verify light-mode surface separation first. In a `finally`-style cleanup, clear test-page localStorage, restore every key/value from the snapshot, reload, and verify `t8-canvas-theme` matches the original snapshot. This isolates only browser storage; it does not alter template files or graph data.

- [ ] **Step 3: Record any visual failure as a test before fixing**

Add a focused regression assertion, verify it fails, implement the smallest fix, and rerun the relevant suite.

- [ ] **Step 4: Final diff and CSS debt check**

Run `git diff --check`, count touched-file `!important` usage, and confirm the change did not increase it or add new high-specificity theme selectors.

- [ ] **Step 5: Final exact-file diff review**

Run `git diff --check`, review every implementation path explicitly, and leave the verified source changes unstaged for the user to review in the existing dirty worktree.
