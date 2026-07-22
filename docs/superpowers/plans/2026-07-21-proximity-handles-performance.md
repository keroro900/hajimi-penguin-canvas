# Proximity Handles and Canvas Pan Performance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reveal only the connection handle on the node side nearest the pointer, keep its visible circle separated from the node border while retaining a 38px hit target, and eliminate Canvas-wide per-frame rerenders during fixed-zoom panning.

**Architecture:** A small DOM controller keeps independent mouse-proximity and touch/pen-transient ownership plus a map containing only nodes selected through touch/pen, writing `data-t8-handle-side` and `data-t8-handle-mode` without React state or per-node listeners. Shared theme CSS owns stable handle geometry and state precedence, while `CanvasInner` tracks zoom in a ref and updates React state only when the LOD bucket changes.

**Tech Stack:** React 19, TypeScript, `@xyflow/react`, PostCSS assertions, Node test runner, Vite.

---

## Chunk 1: Contextual connection handles

### Task 1: Pure proximity-side controller

**Files:**
- Create: `src/utils/proximityHandleController.ts`
- Create: `tests/proximityHandleController.test.ts`

- [ ] **Step 1: Write the mouse ownership and mutation-bound tests**

Import `createProximityHandleController` and drive its `pointerMove` method with injected fake nodes. Assert `clientX < rect.left + rect.width / 2` writes `data-t8-handle-side="left"`, equality/right writes `right`, a repeated same-side move performs zero new `setAttribute`/`removeAttribute` calls, a side change performs one set, a node change performs one old-node remove plus one new-node set, a move over the active Handle retains the node, and a move over the pane performs one clear.

Also assert precedence explicitly: after a touch-selected fallback is active, mouse proximity on the same or another node cannot overwrite or clear its `both/touch-selected` attributes; deselection removes only that fallback while any independent mouse owner remains intact.

- [ ] **Step 2: Write the touch, connection, and cleanup tests**

Assert `pointerDown({ pointerType: 'touch'|'pen' })` writes `data-t8-handle-side="both"` and `data-t8-handle-mode="touch-transient"`, or immediately uses `touch-selected` when the latest selection snapshot already contains that node. Assert `selectionChange(new Set([nodeId]))` promotes it regardless of whether selection arrives before or just after pointerup. Pointerup/pointercancel/blur/connection end clear only transient/proximity ownership while preserving `touch-selected`; deselection and `dispose()` remove selected fallback attributes at most once. Assert mouse pointerdown creates no transient marker and an event path containing `.t8-bulk-phantom-handle` is rejected before its enclosing node can become an owner.

Assert a node selected only by mouse or keyboard never enters `selectedFallbackNodes` and receives no `touch-selected` attributes.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node scripts/run-tests.cjs tests/proximityHandleController.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/proximityHandleController.ts`.

- [ ] **Step 4: Define and implement the controller API**

Export `type HandleSide = 'left' | 'right' | 'both'`, `type HandleMode = 'proximity' | 'touch-transient' | 'touch-selected'`, and `createProximityHandleController(root, options?)`. Return exactly `pointerMove(event)`, `pointerDown(event)`, `pointerUp(event)`, `pointerCancel()`, `selectionChange(selectedIds: ReadonlySet<string>)`, `connectionStart()`, `connectionEnd()`, `blur()`, and `dispose()`. `options.resolveNode(event)` is injectable; production first rejects a composed path containing `.t8-bulk-phantom-handle`, then resolves its first `.react-flow__node`. `options.getNodeId(node)` defaults to `data-id`; injectable zero-delay `scheduleTask/cancelTask` make post-pointerup selection ordering deterministic in tests. Keep mouse `proximityNode/proximitySide`, touch `transientNode/activePointerId`, an independent `Map<id,node>` of `selectedFallbackNodes`, `connectionActive`, and one pending-finalize task in closure state. Separate `applyProximity` and `syncSelectedFallbacks` helpers enforce mutation bounds; proximity never removes or replaces a node owned by the selected map.

- [ ] **Step 5: Implement precise event semantics**

For mouse `pointerMove`, ignore updates while a connection is active, resolve one owning node, call that node's `getBoundingClientRect()` once, and update only proximity ownership; selected fallback nodes remain `both/touch-selected`, including when one is hovered. Pane ownership clears proximity only. Touch/pen `pointerDown` records the touched candidate and applies `both/touch-selected` if it is already a touch-owned fallback, otherwise `both/touch-transient`. `selectionChange(selectedIds: ReadonlySet<string>)` may promote only the recorded touch candidate; it never adds unrelated mouse/keyboard-selected nodes, and removes an existing touch-owned fallback only when its id is absent. Matching pointerup/cancel schedules a zero-delay finalize so same-event selection can win; finalize promotes the recorded touch candidate if selected, otherwise clears transient state. `connectionStart()` sets `connectionActive = true` and clears only proximity/transient ownership. `connectionEnd()` (including cancel) sets it false and again clears only proximity/transient ownership; both preserve touch-owned selected fallbacks. Blur follows the same preservation rule; dispose cancels pending work and clears every ownership class. Tests assert mouse proximity is suppressed during a connection and resumes after end/cancel.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `node scripts/run-tests.cjs tests/proximityHandleController.test.ts`

Expected: all controller subtests PASS with zero failures.

- [ ] **Step 7: Record the controller checkpoint without staging**

Run: `git diff -- src/utils/proximityHandleController.ts tests/proximityHandleController.test.ts`

Expected: only the controller and its focused tests appear. Do not stage or commit because this existing worktree contains overlapping user-owned changes.

### Task 2: Stable outside geometry and state cascade

**Files:**
- Modify: `src/styles/theme-core.css:13-70`
- Modify: `src/styles/jimi-foundation.css:412-436`
- Modify: `tests/handleThemeGeometry.test.ts:32-165`
- Modify: `tests/jimiNodeVisuals.test.ts:90-115,170-185`

- [ ] **Step 1: Add exact geometry assertions**

Assert `--t8-handle-hit-size: 38px`, `left/right: calc(var(--t8-handle-hit-size) / -2)`, unchanged `translate(-50%, -50%)`/`translate(50%, -50%)`, and the derived gaps `(38 - 14) / 2 = 12` and `(38 - 16) / 2 = 11`. Assert the GroupBox selectors retain their existing custom placement and negative z-index.

- [ ] **Step 2: Add exact visibility cascade assertions**

Assert idle non-phantom Handles use `opacity: 0` and `pointer-events: none`; `[data-t8-handle-side="left"] .react-flow__handle-left` and the matching right selector reveal only one side; `both` reveals both; `:focus`, `.connectingfrom`, and `.connectingto.valid` reveal regardless of proximity; `:focus-visible` retains its indicator; `data-t8-handle-mode="touch-transient"|"touch-selected"` supports touch/pen; `::after` paints a centered plus with `currentColor` or a theme token; and every reveal selector excludes `.t8-bulk-phantom-handle`.

- [ ] **Step 3: Run focused CSS tests and verify RED**

Run: `node scripts/run-tests.cjs tests/handleThemeGeometry.test.ts tests/jimiNodeVisuals.test.ts`

Expected: FAIL on the old `calc(var(--t8-handle-size) / -2)` placement, missing idle opacity/pointer-events declarations, missing side selectors, and missing plus pseudo-element.

- [ ] **Step 4: Implement exact shared geometry**

Set left/right to `calc(var(--t8-handle-hit-size) / -2)` while keeping transforms unchanged. Keep the 38px transparent `::before` concentric. Add a centered `::after` plus using two `currentColor` linear gradients (or equivalent theme-token-owned paint) that do not affect layout. Do not apply shared left/right or z-index geometry to GroupBox custom handles, and retain the existing GroupBox negative stacking rule.

- [ ] **Step 5: Implement ordered visibility precedence**

Order the cascade as idle hidden; matching `data-t8-handle-side` revealed; `both`/touch revealed; `:focus` revealed (`:focus-visible` only adds its indicator); `.connectingfrom` and `.connectingto.valid` revealed; shift/bulk reconnect compatibility revealed; phantom hidden last with `!important`. Each visible state restores `opacity: 1` and `pointer-events: auto`. Remove `jimi-foundation.css` whole-card/shell hover rules that reveal both sides, leaving theme color/paint ownership intact.

- [ ] **Step 6: Run focused CSS tests and verify GREEN**

Run: `node scripts/run-tests.cjs tests/handleThemeGeometry.test.ts tests/jimiNodeVisuals.test.ts tests/connectionErgonomics.test.ts tests/themeCssArchitecture.test.ts`

Expected: all four named test files PASS with zero failures.

- [ ] **Step 7: Record the CSS checkpoint without staging**

Run: `git diff -- src/styles/theme-core.css src/styles/jimi-foundation.css tests/handleThemeGeometry.test.ts tests/jimiNodeVisuals.test.ts`

Expected: only the intended geometry/visibility contracts appear. Do not stage or commit in the dirty shared worktree.

### Task 3: Wire one delegated controller into Canvas

**Files:**
- Modify: `src/components/Canvas.tsx:1-55,3100-3160,7600-8100,9960-9985,10095-10135`
- Create: `tests/canvasProximityHandles.test.ts`

- [ ] **Step 1: Write failing Canvas integration source tests**

Assert one `canvasShellElement` callback-state ref is attached to both the empty-canvas shell and active-canvas shell. Assert one `createProximityHandleController` lifecycle effect depends on that actual element, root capture listeners for `pointermove` and `pointerdown`, window capture listeners for `pointerup` and `pointercancel`, a window `blur` listener, selection forwarding, connection start/end forwarding, and cleanup of every listener plus `dispose()`. Add a source/runtime contract that an empty-to-active shell identity change disposes the old controller before attaching the new root. Assert no per-node addEventListener loop and no React state for handle side.

- [ ] **Step 2: Run the focused integration test and verify RED**

Run: `node scripts/run-tests.cjs tests/canvasProximityHandles.test.ts`

Expected: FAIL on the missing controller import/factory, `canvasShellElement`, dual-branch callback refs, and lifecycle listener assertions.

- [ ] **Step 3: Add the exact delegated event lifecycle**

Use `const [canvasShellElement, setCanvasShellElement] = useState<HTMLDivElement | null>(null)` as a callback ref on both shell return branches. In one effect keyed by `canvasShellElement`, create the controller for the current element, add root capture `pointermove`/`pointerdown`, window capture `pointerup`/`pointercancel`, and window `blur`; dependency cleanup removes all five listeners and calls `dispose()` before a replacement shell attaches. Store the current controller in a ref so existing `onConnectStart` calls `connectionStart()`, both successful and cancelled `onConnectEnd` paths call `connectionEnd()`, and React Flow `onSelectionChange` forwards `new Set(selectedNodes.map(node => node.id))`. The controller promotes only its recorded touch/pen candidate and ignores unrelated mouse/keyboard-selected ids.

- [ ] **Step 4: Run handle integration tests and verify GREEN**

Run: `node scripts/run-tests.cjs tests/proximityHandleController.test.ts tests/canvasProximityHandles.test.ts tests/handleThemeGeometry.test.ts tests/jimiNodeVisuals.test.ts`

Expected: all four named test files PASS with zero failures.

- [ ] **Step 5: Record the integration checkpoint without staging**

Run: `git diff -- src/components/Canvas.tsx tests/canvasProximityHandles.test.ts`

Expected: only delegated controller wiring and its source test appear. Do not stage or commit in the dirty shared worktree.

## Chunk 2: Fixed-zoom pan performance

### Task 4: Capture the pre-change performance baseline

**Files:**
- Create: `codex-temp/canvas-pan-performance-baseline.json`

- [ ] **Step 1: Confirm the development page is ready**

Use the existing server at `http://127.0.0.1:11422/%EF%BC%8C%E5%93%8D%E5%BA%94`; expected result is the same warmed approximately 20-node/10-edge canvas. If unavailable, run `npm run dev -- --port 11422` and wait until Vite reports `Local: http://127.0.0.1:11422/`.

- [ ] **Step 2: Capture five raw baseline runs**

Through the Browser plugin raw CDP session, call `Performance.enable`, read `Performance.getMetrics`, perform a pane drag using pointer coordinates `(700,500)`, `(715,500)` ... `(850,500)` at 90ms intervals, then read metrics again and subtract `TaskDuration`, `ScriptDuration`, and `RecalcStyleDuration`. Warm once and discard it; record the next five runs. Each run must contain the three numeric deltas, node/edge/DOM counts, duration, and the exact path/timing metadata.

- [ ] **Step 3: Save the immutable baseline artifact**

Write the five raw runs and computed medians to `codex-temp/canvas-pan-performance-baseline.json` before modifying the viewport subscription. Expected: at least five runs and positive medians for all three metrics.

### Task 5: Remove the per-frame viewport subscription

**Files:**
- Modify: `src/utils/canvasPerformance.ts:1-35`
- Modify: `src/components/Canvas.tsx:1-45,2868-2885,3120-3140,3485-3545,9815-9835,10310-10325`
- Modify: `src/vite-env.d.ts`
- Create: `tests/canvasViewportPerformance.test.ts`
- Modify: `tests/canvasPerformancePhase1.test.ts`

- [ ] **Step 1: Write failing LOD threshold tests**

In `tests/canvasPerformancePhase1.test.ts`, import `getCanvasLodLevel` and assert `0.4499 => outline`, `0.45 => compact`, `0.7199 => compact`, and `0.72 => full`.

- [ ] **Step 2: Write failing Canvas source-contract tests**

Assert `CanvasInner` does not import/call `useViewport`, initializes zoom with `getViewport().zoom`, updates `currentCanvasZoomRef` in `handleViewportMove`, uses `setCurrentCanvasZoom(prev => getCanvasLodLevel(prev) === nextLod ? prev : zoom)`, supplies `onMove`, and calls the same reconcile helper from `onMoveEnd`. Also assert snapping still reads `currentCanvasZoomRef`, move-start/end busy flags remain, and no timer/observer is introduced in the viewport handler slice.

- [ ] **Step 3: Run focused performance tests and verify RED**

Run: `node scripts/run-tests.cjs tests/canvasPerformancePhase1.test.ts tests/canvasViewportPerformance.test.ts`

Expected: FAIL with missing `getCanvasLodLevel` export plus assertions showing `useViewport()` is still present and `onMove={handleViewportMove}` is absent.

- [ ] **Step 4: Export the shared LOD helper**

Add `getCanvasLodLevel(zoom): CanvasLodLevel` using the existing `<0.45`, `<0.72`, else thresholds and make `getCanvasPerformanceProfile` call it.

- [ ] **Step 5: Implement ref-based zoom tracking**

Remove the `useViewport` import and call. Initialize zoom/ref/LOD once from `getViewport()`. In `handleViewportMove`, update the ref every time and call a functional LOD setter that returns the previous value when the bucket is unchanged. In `handleViewportMoveEnd`, reconcile the payload before preserving the existing delayed busy-state release. Feed `getCanvasPerformanceProfile` the LOD-stable zoom state so fixed-zoom translation produces only start/end renders.

- [ ] **Step 6: Add the development-only render counter**

Increment `window.__t8CanvasInnerRenderCount` at the top of `CanvasInner` only when `import.meta.env.DEV`, and declare the optional global in `src/vite-env.d.ts`. The browser audit resets it immediately before each pan and reads it after `onMoveEnd` settles.

- [ ] **Step 7: Run focused performance tests and verify GREEN**

Run: `node scripts/run-tests.cjs tests/canvasPerformancePhase1.test.ts tests/canvasViewportPerformance.test.ts tests/imageLoadingPerformance.test.ts`

Expected: all three named test files PASS with zero failures.

- [ ] **Step 8: Record the viewport checkpoint without staging**

Run: `git diff -- src/utils/canvasPerformance.ts src/components/Canvas.tsx src/vite-env.d.ts tests/canvasPerformancePhase1.test.ts tests/canvasViewportPerformance.test.ts`

Expected: only LOD helper, ref-based viewport handling, development counter, and tests appear. Do not stage or commit in the dirty shared worktree.

## Chunk 3: Verification and browser audit

### Task 6: Static verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all targeted interaction/theme tests**

Run: `node scripts/run-tests.cjs tests/proximityHandleController.test.ts tests/canvasProximityHandles.test.ts tests/handleThemeGeometry.test.ts tests/jimiNodeVisuals.test.ts tests/connectionErgonomics.test.ts tests/themeCssArchitecture.test.ts tests/canvasPerformancePhase1.test.ts tests/canvasViewportPerformance.test.ts tests/imageLoadingPerformance.test.ts`

Expected: PASS.

- [ ] **Step 2: Run TypeScript checking**

Run: `npm run type-check`

Expected: exit 0.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0.

### Task 7: Visual and pan-performance browser audit

**Files:**
- Create: `codex-temp/canvas-pan-performance-audit.json`
- Create: `tests/canvasPanPerformanceArtifact.test.ts`

- [ ] **Step 1: Reload the warmed development page after implementation**

Open `http://127.0.0.1:11422/%EF%BC%8C%E5%93%8D%E5%BA%94`, retain the same approximately 20-node canvas, and verify idle handles are hidden.

- [ ] **Step 2: Verify proximity behavior visually**

Move across both halves of representative regular and smart nodes. Confirm only the nearer side appears, the visible circle has an 11-12px gap, the hit region has no dead strip, moving into the outside hit target does not hide it, the plus is readable, connection dragging keeps valid handles visible, and the phantom handle never appears.

- [ ] **Step 3: Collect five post-change pan samples**

Reset `window.__t8CanvasInnerRenderCount = 0`, repeat the exact `(700,500)` to `(850,500)` 11-point path at 90ms intervals, wait for move-end settling, and read the counter plus CDP metrics. Warm once, then record five raw post-change runs. The counter must be at most 2 for the fixed-zoom pan (start and delayed end), never 11.

- [ ] **Step 4: Write the performance artifact**

Record baseline raw runs from the design investigation, post-change raw runs, medians, percentage deltas, render-count observations, page/node/edge/DOM counts, and pass/fail thresholds in `codex-temp/canvas-pan-performance-audit.json`. Require ScriptDuration at least 30% lower, TaskDuration at least 20% lower, and RecalcStyleDuration no more than 10% worse.

- [ ] **Step 5: Write and run the artifact validator**

Create `tests/canvasPanPerformanceArtifact.test.ts` to assert exactly five-or-more numeric baseline runs and post-change runs, recomputed medians equal the stored medians, `scriptImprovementPct >= 30`, `taskImprovementPct >= 20`, `recalcStyleRegressionPct <= 10`, and every post-change `renderCount <= 2`.

Run: `node scripts/run-tests.cjs tests/canvasPanPerformanceArtifact.test.ts`

Expected: one artifact-validation test PASS with zero failures.
