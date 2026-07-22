# Canvas UX Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make anchored composers, modal layers, placement shelf surfaces, connection ports, and high-frequency canvas interactions predictable and consistent across all built-in themes.

**Architecture:** Shared TypeScript/CSS owns placement, layer order, hit geometry, and scheduling; theme templates own semantic color tokens only. Work is split into three independently testable chunks so placement behavior stabilizes before cross-theme and performance polish.

**Tech Stack:** React 19, TypeScript, React Flow, PostCSS AST tests, Node test runner, Vite.

**Worktree rule:** The repository is heavily dirty with user work. Modify only named files, do not stage or commit implementation files, and preserve unrelated changes.

---

## Chunk 1: Deterministic bottom composer placement

### Task 1: Rewrite the pure placement solver

**Files:**
- Modify: `src/components/nodes/shared/composerPlacement.ts`
- Modify: `tests/composerPlacement.test.ts`

- [ ] **Step 1: Replace flip/fallback tests with failing bottom-only cases**

Add table-driven named cases with exact expected values for: centered/no obstacle (`maxHeight = clamp(viewport.height - top - margin, 0, 760)`); left candidate; right candidate; duplicate candidates; multi-blocker stable tie; blocker outside final horizontal span; blocker behind `top`; blocker below the viewport margin; bottom-edge anchor (`top = bottom + gap`, `maxHeight = 0`); custom `gap: 20`/`margin: 30`; oversized/narrow width; caret inset; malformed/non-finite avoid rectangles. Every result has `placement === 'bottom'`, finite coordinates, and non-negative height.

- [ ] **Step 2: Run the solver tests and verify RED**

Run: `npm test -- tests/composerPlacement.test.ts`

Expected: old `top`/`viewport` behavior fails the new assertions.

- [ ] **Step 3: Implement the bottom-only solver**

Keep the public argument/result shapes for compatibility, but narrow `ComposerPlacement` to `'bottom'`. Filter avoid rectangles to finite positive geometry. Define `effectiveWidth = clamp(popover.width, 0, viewport.width - 2 * margin)`, `comfortableMaximum = 760`, `top = anchor.bottom + gap`, and `viewportAvailable = clamp(viewport.height - margin - top, 0, comfortableMaximum)`. With no relevant blockers, use only the centered candidate and `viewportAvailable`. Otherwise implement:

```ts
const top = anchorRect.bottom + gap;
const relevant = avoidRects.filter((rect) => rect.bottom > top && rect.top < viewport.height - margin);
const candidates = dedupe([
  centeredLeft,
  minRelevantLeft - effectiveWidth,
  maxRelevantRight,
].map((left) => clamp(left, margin, viewport.width - margin - effectiveWidth)));
```

For each candidate, compute horizontally intersecting blockers and `usableHeight = clamp(min(viewport.height - margin, nearestBlocker.top) - top, 0, comfortableMaximum)`. A blocker outside the final candidate span never reduces height. Choose the first blocker-free candidate; otherwise choose greatest usable height with stable candidate-order ties. Compute caret after final `left`. Return finite values only.

- [ ] **Step 4: Run solver tests and verify GREEN**

Run: `npm test -- tests/composerPlacement.test.ts`

Expected: all placement tests pass and no test expects top/viewport.

### Task 2: Replace continuous placement polling with a coalesced scheduler

**Files:**
- Modify: `src/components/nodes/shared/SmartNodeComposer.tsx`
- Create: `src/utils/frameScheduler.ts`
- Create: `tests/frameScheduler.test.ts`
- Create: `tests/smartNodeComposerPlacementRuntime.test.ts`
- Modify: `src/styles/theme-core.css`
- Modify: `tests/jimiSmartNodes.test.ts`

- [ ] **Step 1: Add failing source/runtime contracts**

Behavior-test an injected `createFrameScheduler(requestFrame, cancelFrame, callback): { schedule(): void; dispose(): void }` helper with fake frame functions: multiple schedules before a frame produce one callback; pending id clears before callback; schedule from inside callback creates one later frame; dispose cancels pending work and ignores later signals. Source/AST-audit the component to assert it:

- has one `scheduleMeasure()` that creates at most one pending RAF;
- uses exactly three bounded startup frames and retains `placementsEqual` unchanged-state suppression;
- has no unbounded `tick -> requestAnimationFrame(tick)` loop;
- observes `.react-flow__viewport` and `anchor.closest('.react-flow__node')` attributes;
- derives viewport from `anchor.closest('.react-flow')?.querySelector('.react-flow__viewport')`, observes it and `anchor.closest('.react-flow__node')` with `attributeFilter: ['style', 'class']`, observes both anchor and composer root with ResizeObserver, and routes all observers plus resize, captured/passive scroll, passive wheel, and pointermove only after pointerdown originating inside the owning React Flow canvas/node through the scheduler;
- disconnects observers and cancels pending RAF on cleanup;
- resets disposed state on setup, hides/disables pointer events when `maxHeight < 48`, and prevents direct children from imposing `min-height`.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- tests/frameScheduler.test.ts tests/smartNodeComposerPlacementRuntime.test.ts tests/composerPlacement.test.ts tests/jimiSmartNodes.test.ts`

Expected: scheduler helper is missing; old recursive polling and top/viewport CSS assertions fail.

- [ ] **Step 3: Implement scheduler and bottom-only rendering**

Implement the injected scheduler helper, then use it from the component. Keep startup RAF state separate and capped at three. Track pointerdown/up/cancel to gate pointermove scheduling. Remove listeners using matching capture options and dispose both scheduler/startup RAF plus both observers. In merged style, set:

```ts
maxHeight: measured ? `${measured.maxHeight}px` : undefined,
visibility: measured && placementReady && measured.maxHeight >= 48 ? undefined : 'hidden',
pointerEvents: measured && measured.maxHeight >= 48 ? undefined : 'none',
```

Set `caretTop = next.top - 5`. Update portal CSS/tests to require only bottom-facing caret styling, reject top/viewport selectors, set root and immediate form wrappers to `min-height: 0`, and keep root-owned vertical scrolling.

- [ ] **Step 4: Run chunk verification**

Run:

```powershell
npm test -- tests/composerPlacement.test.ts tests/frameScheduler.test.ts tests/smartNodeComposerPlacementRuntime.test.ts tests/jimiSmartNodes.test.ts tests/themeCssArchitecture.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run type-check
```

Expected: all tests pass and TypeScript reports no diagnostics.

---

## Chunk 2: Shared layers, opaque shelf, and isolated modal

### Task 3: Establish shared structural layer tokens and shelf ownership

**Files:**
- Modify: `src/styles/theme-core.css`
- Modify: `src/styles/index.css`
- Modify: `tests/placementShelf.test.ts`
- Modify: `tests/themeCssArchitecture.test.ts`
- Modify: `tests/themeSurfaceContract.test.ts`

- [ ] **Step 1: Add failing layer and shelf contracts**

Require exact shared tokens `--t8-z-canvas-decor`, `--t8-z-edge`, `--t8-z-node`, `--t8-z-node-ui`, `--t8-z-canvas-chrome`, `--t8-z-composer`, `--t8-z-modal-backdrop`, `--t8-z-modal-dialog`, and `--t8-z-system-overlay` with strictly increasing values. Map them respectively to canvas decoration layers, edge SVG, `.react-flow__node`, node handles/action bars, `.t8-control-rail` + `.t8-placement-shelf`, `.t8-smart-node-composer--portal`, `.t8-canvas-modal-backdrop`, `.t8-canvas-modal-dialog`, and `[data-t8-system-overlay]`. Require shelf and modal dialog body background `var(--t8-bg-panel-elevated)`, whose opacity is validated for exactly 11 themes × 2 modes in `themeSurfaceContract.test.ts`. Forbid shelf alpha/transparent/backdrop-filter and theme background/z-index repaint.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/placementShelf.test.ts tests/themeCssArchitecture.test.ts tests/themeSurfaceContract.test.ts`

Expected failures: missing structural tokens/consumer mapping, translucent/unpainted shelf, and missing 11×2 elevated-surface opacity assertion.

- [ ] **Step 3: Implement shared structural ownership**

Declare shared z tokens in `theme-core.css` and apply every token-to-selector mapping from Step 1. In shared CSS, make expanded/collapsed `.t8-placement-shelf` an opaque panel with semantic border/shadow and no backdrop blur. Replace numeric z-index values with tokens. Theme files remain color-token consumers and must not receive structural overrides.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/placementShelf.test.ts tests/themeCssArchitecture.test.ts tests/themeSurfaceContract.test.ts`

### Task 4: Portal and isolate shortcut settings

**Files:**
- Create: `src/components/CanvasModalPortal.tsx`
- Create: `src/utils/modalIsolation.ts`
- Modify: `src/components/CanvasToolbar.tsx`
- Modify: `src/components/Canvas.tsx`
- Create: `tests/canvasModalPortal.test.ts`
- Create: `tests/modalIsolation.test.ts`
- Modify: `src/styles/theme-core.css`

- [ ] **Step 1: Add failing modal behavior contracts**

Behavior-test pure/injected helpers in `modalIsolation.ts`: snapshot/isolate/restore body siblings, calculate next focus index, expose `setCanvasModalActive`/`isCanvasModalActive`, and create a modal key/lifecycle controller with injected focus/close/cancel/isolate dependencies. Use structural fake elements so no DOM dependency is required. Cases cover absent/present inert, absent/`true`/`false` aria-hidden, lower portal siblings, portal-root-only exclusion, forward/reverse wrapping, one/no focusable item, initial close-control focus, backdrop equality, opener restoration, all close paths, all-key propagation suppression, and idempotent restoration. Source/AST-audit the React portal to assert it invokes the tested controller and:

- portals to `document.body`;
- renders shared backdrop/dialog classes with `role="dialog"`, `aria-modal="true"`, and label;
- stores/restores the exact opener;
- makes every other direct body child inert and `aria-hidden`, preserving prior values;
- takes an initial-focus ref for the close control; traps Tab/Shift+Tab; closes on backdrop target equality;
- handles every key on document capture so canvas shortcuts cannot receive it, and supports `onEscapeBeforeClose(): boolean` before close;
- restores body-child attributes and removes its document capture listener on close.

Test CanvasToolbar's window-capture recorder bypasses Escape before `preventDefault`/`stopPropagation`, uses the portal, passes the close ref, and returns `true` from interception while recording so first unmodified Escape cancels recording only and second closes. Test Canvas window-capture shortcuts return immediately while `isCanvasModalActive()` is true; representative delete/undo and connection-pan-mode actions must not fire.

- [ ] **Step 2: Run modal tests and verify RED**

Run: `npm test -- tests/modalIsolation.test.ts tests/canvasModalPortal.test.ts tests/canvasMouseInteractions.test.ts`

Expected failures: `modalIsolation preserves and restores body siblings`, `modal controller traps focus and owns every key`, `CanvasToolbar delegates Escape recording precedence`, and `Canvas suppresses window-capture shortcuts while modal-active`.

- [ ] **Step 3: Implement `CanvasModalPortal` and migrate shortcut markup**

The component owns portal/backdrop/dialog/focus/inert mechanics but accepts themed class names and children. In `useLayoutEffect`, set the shared modal-active guard before focus work. Stop propagation for every captured key; prevent default only for trapped Tab and handled Escape. Store/restore body state through the tested controller on Escape, backdrop, ordinary close, and unmount; remove the capture listener separately. CanvasToolbar removes its old fixed wrapper and makes Escape bypass the recorder before any cancellation/propagation call. Canvas global window-capture shortcut handlers check the guard first.

- [ ] **Step 4: Run chunk verification**

Run:

```powershell
npm test -- tests/modalIsolation.test.ts tests/canvasModalPortal.test.ts tests/canvasMouseInteractions.test.ts tests/placementShelf.test.ts tests/themeCssArchitecture.test.ts tests/themeSurfaceContract.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run type-check
```

Expected: zero test failures/diagnostics; modal isolation, shelf, full token-to-selector map, 11×2 opacity matrix, and shortcut guard pass.

---

## Chunk 3: Reachable ports, cross-theme geometry, and interaction polish

### Task 5: Move Handle boxes outside nodes and enlarge hit targets

**Files:**
- Modify: `src/styles/theme-core.css`
- Modify: `src/styles/index.css`
- Modify: `src/styles/jimi-foundation.css`
- Modify: `src/styles/theme-ink.css`
- Modify: `src/styles/theme-pixel.css`
- Modify: `src/styles/theme-retro.css`
- Modify: `src/styles/theme-rh.css`
- Modify: `src/styles/theme-skeuo.css`
- Modify: `src/styles/theme-soft.css`
- Modify: `src/styles/theme-tap-studio.css`
- Modify: `src/styles/theme-utility.css`
- Modify: `src/styles/theme-vapor.css`
- Modify: `src/styles/theme-wabi.css`
- Modify: `src/components/Canvas.tsx`
- Modify: `src/App.tsx` (lazy query-gated import only)
- Create: `src/components/HandleGeometryAuditFixture.tsx`
- Create: `src/utils/handleGeometryAudit.ts`
- Modify: `tests/jimiNodeVisuals.test.ts`
- Modify: `tests/themeCssArchitecture.test.ts`
- Create: `tests/handleThemeGeometry.test.ts`

- [ ] **Step 1: Add failing shared and theme-matrix contracts**

Generate the static matrix from `BUILT_IN_THEME_TEMPLATES` and assert exactly 11 template IDs. Require actual interactive `.react-flow__handle` boxes to have at least 14px width/height (16px for smart ports), overflow-visible owning shells, and a concentric pseudo target with `content`, absolute 50%/50% centering, and at least 38px size. Exact formula: left Handle uses `left: calc(var(--t8-handle-size) / -2)` plus `translate(-50%, -50%)`; right uses mirrored `right` plus `translate(50%, -50%)`. Thus the Handle inner edge touches the node border and its center sits one full handle radius outside. Allow scale feedback only if computed center delta is ≤0.5px and layout box is unchanged across hover, valid, connectingto/from, and `react-flow__handle-valid/connecting` classes.

Add `t8-bulk-phantom-handle` to the two 1px routing-only Handles in `Canvas.tsx`; exempt only this class from visual/hit minimums and assert it remains invisible, 1px, and non-interactive. GroupBox remains at the 14px minimum with its existing custom positions. Regular and smart handles must not be exempt.

- [ ] **Step 2: Run handle tests and verify RED**

Run: `npm test -- tests/jimiNodeVisuals.test.ts tests/handleThemeGeometry.test.ts tests/themeCssArchitecture.test.ts`

Expected failures: missing 11-theme geometry ownership, undersized 10px smart ports, missing outside offsets/hit-target declarations, and missing phantom exemption class.

- [ ] **Step 3: Implement shared Handle geometry**

Put minimum geometry and exact outside positioning in shared CSS using `--t8-handle-size` and `--t8-handle-hit-size`. The Handle box owns the visible circle; `::before` is concentric and adds no tab stop/node size. Remove geometry from the ten named theme files while preserving colors/rings. Ensure regular/smart shells do not clip. Add a reporting utility exposed as `window.__t8RunHandleGeometryAudit()` only on the audit fixture. It reads computed node/Handle/pseudo rectangles, `elementsFromPoint` boundary samples, and connected React Flow SVG path `d` endpoints (independent `M` start and final coordinate), returning template, mode, node/edge/Handle IDs, variant, state, expected outside center, actual Handle center, inner-edge error, actual SVG endpoint, endpoint delta, clipping, and hit-stack owner.

- [ ] **Step 4: Run the browser geometry audit against the live development page**

Add `HandleGeometryAuditFixture`, loaded by `App.tsx` only for `?ux-handle-audit=1`, with deterministic connected regular, smart, GroupBox, phantom, and overlapping fixtures. Start with `npm run dev` and confirm the logged frontend URL/port; open `http://127.0.0.1:11422/?ux-handle-audit=1` through the in-app browser control capability. Invoke `window.__t8RunHandleGeometryAudit()` for every built-in template in light/dark. Assert inner-edge error and SVG endpoint delta ≤0.5px, rest-to-state center delta ≤0.5px, 38px boundary samples return the intended handle at the top of `elementsFromPoint`, no clipping, visible focus outline on canvas/composer actions in all 22 theme/mode combinations, and phantom exemption. Save JSON to `codex-temp/handle-geometry-audit.json`; stop only the dev process started by this audit if a prior server was not already running.

- [ ] **Step 5: Run handle tests and verify GREEN**

Run: `npm test -- tests/jimiNodeVisuals.test.ts tests/handleThemeGeometry.test.ts tests/themeCssArchitecture.test.ts tests/connectionErgonomics.test.ts`

### Task 6: Tighten high-frequency transitions and compact overflow

**Files:**
- Modify: `src/styles/index.css`
- Modify: `src/styles/theme-core.css`
- Modify: `src/styles/jimi-foundation.css`
- Modify: `tests/themeCssArchitecture.test.ts`
- Modify: `tests/jimiSmartNodes.test.ts`

- [ ] **Step 1: Add a fixture-backed transition audit**

Create fixture CSS strings proving the audit rejects `transition: all`, geometry-changing hover, and blanket `will-change`, but permits unrelated feature-local transitions and narrowly justified localized `will-change`. Audit only exact shared hot selector families: regular/smart node shells, interactive handles, control rail buttons, placement shelf, composer form controls, and generate/stop actions.

- [ ] **Step 2: Add compact composer layout contracts**

Require prompt inputs to use bounded vertical overflow, parameter rows to retain no field-wrapper padding/cards, and the normal-width (620px) composer action row to keep generate/stop buttons non-wrapping with a reserved fixed action width. Require reduced-motion coverage for the audited interactive selectors.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/themeCssArchitecture.test.ts tests/jimiSmartNodes.test.ts`

Expected failures name the exact selector/property violation or missing 620px no-wrap contract.

- [ ] **Step 4: Apply minimal evidence-backed polish**

Replace broad transitions only on audited hot selectors with explicit `background-color`, `border-color`, `color`, `box-shadow`, `opacity`, and existing stable transform transitions. Keep prompt overflow contained and retain the approved compact parameter row. Do not add blanket `will-change` or unrelated rendering refactors.

- [ ] **Step 5: Run complete targeted and full verification**

Run:

```powershell
npm test -- tests/composerPlacement.test.ts tests/smartNodeComposerPlacementRuntime.test.ts tests/canvasModalPortal.test.ts tests/placementShelf.test.ts tests/jimiNodeVisuals.test.ts tests/handleThemeGeometry.test.ts tests/themeCssArchitecture.test.ts tests/themeSurfaceContract.test.ts tests/connectionErgonomics.test.ts tests/jimiSmartNodes.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run type-check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
```

Expected: all targeted tests pass, TypeScript emits no diagnostics, and production build exits zero.

- [ ] **Step 6: Inspect only scoped changes**

Run exact scoped `git status --short -- <all named source/test files>`, `git diff --check -- <tracked named files>`, and `git diff -- <tracked named files>`. Read every new untracked test/utility directly because ordinary `git diff` omits them. Do not stage or commit implementation code. Confirm no theme patterns, user changes, backend files, or unrelated modal behavior changed.
