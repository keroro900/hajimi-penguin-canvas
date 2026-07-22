# Canvas UX Foundation Design

## Goal

Unify canvas interaction behavior across every built-in theme so floating UI is predictable, controls remain readable and reachable, connection ports are easy to hit, and open-node interactions do not create avoidable frame work.

## Scope and Delivery Order

This work is split into three independently verifiable phases:

1. Interaction foundation: composer placement, layer ownership, modal isolation, placement-shelf opacity, and connection-port hit targets.
2. Cross-theme coverage: prevent theme CSS from undoing shared geometry, opacity, and z-index contracts while preserving each theme's colors and decorative language.
3. Performance and UX polish: replace continuous placement polling with event-coalesced measurement, tighten broad transitions, and repair compact composer overflow or control-weight issues exposed by regression checks.

The phases are implemented in this order because theme-level polish depends on a stable shared interaction contract.

## Considered Approaches

### Shared foundation first — selected

Put geometry, placement, hit targets, and layer ordering in shared code. Theme files may style colors and shadows but cannot change these interaction contracts. This produces consistent behavior and the smallest long-term maintenance surface.

### Global CSS quick patch

Override the screenshots with high-specificity CSS. This is faster initially but fragile: inline node styles, theme rules, transformed stacking contexts, and small viewports can bypass or conflict with the patch.

### Node-by-node repair

Tune every node independently. This gives local control but duplicates fixes across dozens of nodes and allows user experience to drift between themes and node types.

## Phase 1: Interaction Foundation

### Smart composer placement

- A portal smart composer always uses `bottom` placement.
- Its top edge is anchored at `anchorRect.bottom + gap`; it never flips above, moves beside the node, or uses viewport-center fallback.
- Horizontal position remains centered on the anchor and clamped to the viewport margin.
- For bottom-side obstacles, the solver builds exactly three horizontal candidates in order: centered/clamped; `min(relevantBlocker.left) - effectiveWidth`; and `max(relevantBlocker.right)`. Candidates are viewport-clamped and deduplicated. It selects the first candidate that intersects no relevant blocker; if none clears all blockers, it selects the candidate with greatest usable vertical space, breaking ties by the same order.
- After the final horizontal position is chosen, only obstacles intersecting that final horizontal span reduce the usable height. `maxHeight` is then `clamp(nearestObstacleTopOrViewportBottom - top - margin, 0, comfortableMaximum)`.
- The fixed-position composer root owns `max-height`, uses `box-sizing: border-box`, `min-height: 0`, and `overflow-y: auto`. Child forms cannot establish a larger minimum height.
- `top` is always exactly `anchorRect.bottom + gap` and is never vertically clamped upward. When usable height is less than 48px, the composer stays mounted but becomes `visibility: hidden` and `pointer-events: none` until pan/zoom creates enough bottom space; it never overlaps the node or renders beyond the viewport.
- Floating obstacles may therefore change horizontal position and remaining height, but cannot change vertical placement.
- Whenever the composer is visible, the pointer caret appears on its top edge and points toward the anchor center.
- Caret position is computed only after final horizontal placement and is clamped to the final rendered width with the existing corner inset.

### Placement measurement and motion

- Remove the always-running `requestAnimationFrame` loop that reads the anchor rectangle every frame while a composer is open.
- Use one coalesced animation-frame scheduler. Resize, captured scroll, `ResizeObserver`, pointer movement during canvas/node interaction, and wheel events request a measurement; multiple events in one frame collapse into one DOM read/write pass.
- A `MutationObserver` watches both the active `.react-flow__viewport` transform and the anchor's owning `.react-flow__node` wrapper style/class. These wrapper attributes—not merely the inner anchor—are the authoritative DOM signals for programmatic pan, zoom, keyboard movement, auto-layout, and node-transform changes that do not emit pointer or scroll events. Every observer/event calls the same scheduler and never measures synchronously.
- The initial hidden settling sequence remains but is capped at exactly three animation frames. Tests reject unbounded self-rescheduling RAF loops, not this bounded startup sequence.
- Placement state updates only when measured values actually change.
- All listeners, observers, and pending animation frames are removed on close.

### Layer model and modal isolation

Structural layer variables are declared once on `:root` in shared `theme-core.css`, outside every theme selector, and define the order:

- canvas decorations and edges;
- nodes;
- node-local handles and action bars;
- canvas chrome, control rail, and placement shelf;
- non-modal anchored composers;
- modal backdrop and modal dialog;
- emergency/system overlays.

Positioning, z-index, shelf opacity constraints, port geometry, and hit targets are owned by shared CSS. Theme files and runtime templates own semantic color/border/shadow token values only. Because active theme tokens are applied to `html`, document-body portals inherit them without `.t8-canvas-shell` ancestry.

The shortcut settings UI becomes a document-body portal with modal semantics. Its backdrop and dialog sit above the complete canvas stacking context, so the control rail and placement shelf cannot appear through or above it. Existing recording and theme behavior remains unchanged.

### Placement shelf surface

- Expanded and collapsed placement-shelf surfaces use an opaque semantic theme color, not alpha, transparency, or backdrop blur.
- The shelf is visually above canvas content but below composers and modals.
- Every built-in light and dark theme inherits the same opacity and layer contract. Themes may change tokens, borders, and shadows but cannot repaint the shelf with transparency. This no-alpha/no-blur requirement applies only to the placement shelf; modal backdrops may remain translucent, while dialog bodies must use an opaque semantic panel surface.

### Connection ports

- The actual React Flow `.react-flow__handle` box—not a displaced child decoration—owns the shared minimum visual diameter of 14px; important smart-node Handle boxes may be 16px.
- Left and right Handle boxes sit fully outside the node silhouette. React Flow therefore measures the same box center that the user sees, keeping the edge endpoint centered on the visible handle.
- Each Handle box exposes a concentric invisible minimum pointer target of 38px through its pseudo-element, without increasing the node box or changing edge routing.
- Hover, valid, and connecting states may change color, ring, and opacity but cannot change position or layout. Any scale feedback must preserve the side-specific translation.
- Theme files may recolor the Handle box or add centered rings, but cannot translate a child visual away from the measured center or shrink its visual/pointer target below the shared minimum.
- Group-box and intentionally custom geometry may keep larger existing handles but cannot become smaller.

## Phase 2: Cross-Theme Coverage

- All 11 built-in themes consume the shared opaque placement-shelf surface and semantic surfaces for canvas controls, dialog bodies, and smart composers. Modal backdrops remain intentionally translucent.
- Theme CSS cannot override shared z-index ownership for the control rail, shelf, composer, or modal stack.
- Theme handle overrides are audited for minimum dimensions, outside positioning, and stable hover geometry.
- Light themes retain higher canvas/node contrast and readable control boundaries; dark themes remain in the calm charcoal range established previously.
- No background grid, dots, speckles, texture image, or decorative canvas pattern is reintroduced.

## Phase 3: Performance and Compact UX Polish

- Replace `transition: all` on frequently interacted canvas controls with explicit paint/opacity/transform properties. Do not add blanket `will-change`.
- Avoid geometry-changing hover effects on nodes, handles, composer controls, and canvas chrome.
- Prompt editors use bounded overflow and cannot paint over the parameter row.
- Parameter rows retain the compact height already approved: no new field-wrapper padding or outer parameter cards.
- Generate/stop actions remain visually primary but do not force wrapping when normal composer width is available.
- Performance work is limited to evidence-backed hot paths touched by these interactions; broad rendering architecture changes are out of scope.

## Accessibility and Interaction

- Shortcut settings gains `role="dialog"`, `aria-modal="true"`, and an accessible label after portal isolation.
- Opening stores the exact trigger element, moves focus to the close control, and traps Tab/Shift+Tab within the dialog.
- While open, the modal enumerates every direct `document.body` child except the modal portal root, preserves its previous `inert`/`aria-hidden` values, and makes it inert with an `aria-hidden` fallback. This includes the React application root and any lower-layer body portals such as smart composers. Closing restores every preserved value exactly.
- A document capture-phase key handler owns Tab and Escape and stops propagation before canvas/composer listeners. Escape precedence is deterministic: while shortcut recording is active, the first Escape cancels recording without closing the modal; otherwise Escape closes the modal. Backdrop click closes it. Closing removes inert/fallback state and restores focus to the exact stored trigger.
- Anchored composers remain non-modal dialogs with existing Escape/outside dismissal and focus restoration.
- Expanded hit targets do not introduce extra tab stops.
- Focus-visible outlines remain visible in every theme.

## Error and Edge Cases

- Deleted or zero-size anchors close dialog-mode composers and return focus to the canvas fallback.
- Narrow viewports clamp composer width/left position without changing the bottom anchor rule.
- A bottom obstacle can reduce composer height below 48px; returned numeric values remain finite/non-negative and the mounted composer is hidden/non-interactive until usable space recovers.
- Oversized ports or theme rings cannot be clipped by regular node shells.
- Opening a modal while composer or shelf UI is visible must visually and interactively suppress the lower layers.

## Test Strategy

- Rewrite `composerPlacement` unit cases so every scenario returns `bottom`, never `top` or `viewport`, and verifies non-overlap plus remaining-space `maxHeight`.
- Add source/behavior tests for coalesced placement scheduling, transform MutationObserver coverage, cleanup, and the finite three-frame startup sequence; reject only unbounded recursive RAF polling.
- Add modal tests proving shortcut settings is body-portaled, traps focus, makes the canvas inert, suppresses canvas shortcuts, implements Escape recording precedence, restores the exact opener, and uses the shared modal layer contract.
- Extend placement-shelf tests to require an opaque semantic background and its layer token.
- Extend CSS AST architecture tests to enforce the shared layer order and block theme-level z-index/transparent shelf overrides.
- Extend handle tests to require minimum Handle-box dimensions, outside offsets, a concentric 38px hit target, and stable centered rings/translations. Add a runtime DOM geometry check that edge anchor coordinates and visible Handle centers stay aligned before/after hover for every built-in theme generated from `BUILT_IN_THEME_TEMPLATES`.
- Add transition audits for frequently interacted canvas surfaces.
- Run focused phase tests, the existing theme/node architecture suites, TypeScript checking, and a production build when all phases are complete.

## Non-Goals

- Redesigning node business forms or generation workflows.
- Replacing React Flow or changing edge routing algorithms.
- Rebranding individual themes.
- Refactoring unrelated modals, editors, or backend services.
