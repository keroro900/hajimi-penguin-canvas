# JIMI AI UI Foundation Design

## Goal

Replace the current industrial default product chrome with the first implementation slice of the JIMI AI design system. This slice establishes the new product identity, pure system-aware surfaces, and the empty-card node interaction model used by image, video, and SD 2.0-style generation nodes.

This is a product-foundation change, not an additional selectable theme. The existing compatibility ID `tech-default` remains the default template ID, but its display name, token values, and visuals become the JIMI default. Existing optional theme packs may continue to override visual tokens.

## Confirmed Product Direction

- Product name: `JIMI AI`.
- Brand mark: `Soft Pebble`, an original, slightly wide rounded orange form with two asymmetric dark eyes.
- Personality: professional editorial tool with warmer, more approachable interaction details.
- Dark mode: pure solid charcoal canvas and panels.
- Light mode: pure solid warm-white canvas and panels.
- Follow the operating system color preference by default while retaining the existing manual override.
- Do not use grid, dot, gradient, illustration, watermark, or decorative canvas backgrounds in the JIMI default language.
- Brand orange is limited to the logo, primary actions, active focus, and running state.

## Scope Decomposition

The full redesign contains three independently testable slices:

1. **This spec: JIMI foundation and empty-card smart nodes.** Brand asset, tokens, shared node shell, downward property popover, and focused migration of image/video/SD 2.0 generation nodes.
2. **Later spec: application shell and navigation.** Compact top bar, 44px tool rail, searchable node palette, canvas switcher, and agent entry.
3. **Later spec: canvas interaction surfaces.** Context menu, edge-hover actions, node action bar, property-panel collision handling, and remaining legacy nodes.

This ordering makes the new node interaction usable before the larger navigation shell changes and prevents a single unreviewable rewrite of `Canvas.tsx`, `Sidebar.tsx`, and all node implementations.

## Visual System

### Brand mark

Create a reusable SVG React component rather than a bitmap asset.

- Default lockup: Soft Pebble mark plus `JIMI AI` wordmark.
- Compact mark: symbol only for application icon-sized and collapsed-control use.
- Minimum in-app mark size: 24px wide.
- The mark has no cat ears, whiskers, nose, mouth, gradients, shadows, or animated expressions.
- Mark colors are tokenized so light and dark surfaces preserve contrast.

### Core tokens

Add a product-level JIMI token layer with semantic roles rather than component-specific colors:

- solid app, canvas, panel, elevated-panel, muted-panel, node, and field surfaces;
- primary, muted, and dim text;
- subtle, strong, and focus borders;
- brand orange, success, warning, and danger states;
- 12px controls, 16px floating surfaces, and 20px node radii;
- low-spread shadows for floating UI only;
- 120–180ms motion with reduced-motion fallbacks.

JIMI tokens must map into the existing `--t8-*` semantic variables so legacy components remain readable during migration. The implementation must not remove the existing theme-template storage or optional visual themes.

Token precedence is explicit:

1. `jimi-foundation.css` defines the product defaults and the solid JIMI canvas.
2. The active theme template maps its tokens onto `--t8-*` after the foundation.
3. An optional visual skin may then add its intentional pattern and component overrides.

The JIMI default keeps the existing template ID `tech-default`; it replaces the current Tech Default template content and is renamed `JIMI Default`. Keeping the ID means existing users already on `tech-default` migrate in place without rewriting persisted state. Users persisted on any other template ID remain on that optional theme. New stores resolve to `tech-default`. The no-pattern selector is scoped to `data-theme-template="tech-default"`. Existing decorative optional themes retain their patterns. Because composers portal to `document.body`, their base appearance uses root-level semantic variables rather than selectors that require a `.react-flow__node` ancestor. Optional themes may target the stable `.t8-smart-node-composer--portal` class when they intentionally need composer-specific decoration.

### Appearance preference model

Extend appearance state with two distinct values:

- persisted `appearancePreference: 'system' | 'light' | 'dark'`;
- resolved runtime `theme: 'light' | 'dark'` used by existing consumers.

New installations default to `system`. When the preference is `system`, subscribe to `matchMedia('(prefers-color-scheme: dark)')` and update the resolved theme live. Existing persisted stores that contain only `theme` migrate to a matching explicit `light` or `dark` preference so an upgrade does not unexpectedly change an existing user's UI. The compact top-bar toggle continues to switch between explicit light and dark. When clicked from System, it chooses the explicit opposite of the currently resolved mode; subsequent clicks toggle explicit light/dark. The settings surface provides the System option. Selecting System resumes live OS updates.

## Empty-Card Node Model

### Node responsibility

The node body is a canvas object and result container, not a form.

When closed, a generation node contains only:

- a short external or top-edge title;
- a centered type glyph or generated result preview;
- subtle input/output handles;
- a small state indicator only while ready, running, complete, or failed.

The closed node does not contain prompt fields, model selectors, ratio controls, size controls, counts, advanced parameters, or a permanent run bar.

### Property popover responsibility

Clicking the node opens one property popover containing the node's complete authoring controls. The existing data schema and generation behavior remain unchanged; controls move presentation location only.

Required behavior:

- The popover is portalled above the canvas stacking context.
- Preferred placement is directly below the node, matching the current product interaction.
- Use an 8px anchor gap and a 12px viewport margin.
- Horizontal alignment starts at the node center and clamps inside the viewport margin; the pointer offset separately clamps inside the popover.
- If the measured popover cannot fit below but fits above, it flips above the node.
- If it fits on neither side, choose the side with more available height; ties stay below. Set `maxHeight` to the available height on that side and make the popover body scroll.
- Position updates on window resize, ancestor scroll, viewport pan/zoom, and node movement. While the one primary composer is open, a single `requestAnimationFrame` observer compares the anchor rectangle to the previous rectangle and remeasures only when it changes. `ResizeObserver` covers anchor/popover size changes. Both observers are disconnected on close.
- A capture-phase pointer listener closes the composer when the target is outside both the composer and its anchor. Therefore canvas empty space, application chrome, another node, or unrelated floating UI closes it. Handles and media tools inside the same anchor do not close it. Clicking another smart node closes the previous composer first and that node's click then opens the replacement.
- Interacting inside the popover never drags or pans the canvas.
- Unsaved field edits are already node state and are not discarded when the popover closes.
- Starting generation does not require the popover to stay open.
- Only one primary smart-node property popover is open at a time.
- The popover is non-modal and exposes `role="dialog"`, `aria-modal="false"`, an accessible name, and a close control.
- Smart-card shells are focusable `role="group"` containers with an accessible node label, not buttons, because they contain nested media/action buttons. When the shell itself owns focus, `Enter` or `Space` opens the composer; keyboard events originating from nested controls retain their native behavior. Initial focus moves to the prompt control when present, otherwise to the first interactive control.
- `Escape` closes only the active composer and returns focus to its anchor. `SmartNodeComposer` accepts `fallbackFocusRef?: RefObject<HTMLElement | null>` and uses it when the anchor no longer exists. Migrated nodes receive the canvas focus root through the shared canvas context; as a defensive fallback, the composer queries `[data-canvas-focus-root]`.

### Media and result behavior

- Empty image/video nodes show the common glyph placeholder.
- Generated image/video results fill the card surface with the existing aspect-ratio behavior.
- Media hover tools remain contextual and do not force the property popover open.
- Existing preview, download, compare, send, and edit actions remain available.
- Advanced controls belonging to Image, Video, and SD 2.0 (`SeedanceNode.tsx`) keep their functional fields, but those fields live inside the same downward popover pattern.

### Status behavior

- Ready: neutral border and optional small success-colored state dot.
- Running: brand-orange state dot and restrained border progress treatment; no large glow.
- Complete: result fades into the card and the state dot returns to neutral.
- Failed: danger-colored state dot and concise error summary; full details remain in the popover.
- Status must remain distinguishable without color alone through text or icon labels exposed on focus/hover.

## Component Architecture

### `JimiLogo`

`src/components/brand/JimiLogo.tsx`

- Renders symbol or lockup variants.
- Accepts `variant`, `size`, and accessible-label props.
- Has no dependency on canvas or theme stores.

### `SmartNodeShell`

Existing shared node shell remains the boundary for closed-card presentation.

- Add stable JIMI classes/data attributes for empty, result, selected, running, and failed states.
- Keep geometry, resize behavior, handles, drop targeting, and result tools owned by existing node integrations.
- Do not duplicate generation fields inside the shell.

### `SmartNodeComposer`

Existing `src/components/nodes/shared/SmartNodeComposer.tsx` becomes the shared anchored property popover.

- Replace point-only positioning with measured placement metadata: `top`, `left`, `placement`, and `maxHeight`.
- Prefer `bottom`; flip to `top` only when required.
- Measure both the anchor and popover using refs after render.
- Expose placement through `data-placement` for pointer and animation styling.
- Retain the existing portal option and canvas-event suppression.
- Add dialog semantics and shared `initialFocusRef`, `fallbackFocusRef`, and `onRequestClose` props without requiring every node to reimplement positioning or focus behavior.

### `smartNodeComposer` coordinator

Create `src/stores/smartNodeComposer.ts` as a non-persisted Zustand store with this interface:

- `activeNodeId: string | null`;
- `open(nodeId: string): void`;
- `close(nodeId?: string): void`, where an omitted id closes any composer and a supplied id closes only if it is active;
- `isOpen(nodeId: string): boolean` exposed through a selector hook.

Each migrated node derives composer visibility from this coordinator instead of independent local open state. Opening node B atomically replaces node A. A node cleanup effect calls `close(id)` when it unmounts. The coordinator owns exclusivity only; `SmartNodeComposer` owns outside-dismissal, placement, and focus return.

### Node adapters

Migrate exactly these smart generation nodes in the first batch:

- `ImageNode.tsx`
- `VideoNode.tsx`
- `SeedanceNode.tsx`, registered as SD 2.0

Each adapter keeps existing generation state, provider logic, fields, references, and persistence. It changes only which content is rendered in the closed shell versus the composer.

Nodes outside this batch keep their behavior and inherit safe token/radius improvements only.

Saved `uiVariant` compatibility is explicit:

- existing `uiVariant: 'classic'` nodes remain classic in this slice;
- existing `uiVariant: 'smart-card'` nodes adopt the new empty-card presentation;
- nodes without `uiVariant` use the existing/new-node smart-card default;
- persisted `smartComposerOpen`-style fields are ignored on load and are no longer written, because open state is session-only;
- no stored graph data is destructively migrated.

## Data Flow

1. A node uses its existing local/store state and renders a closed `SmartNodeShell`.
2. A click asks the shared composer coordinator to open or close that node id through the existing panel-toggle gesture helper.
3. `SmartNodeComposer` receives the node anchor ref and portals the existing control tree to `document.body`.
4. The composer measures itself and the anchor, chooses bottom or top placement, and writes CSS variables/data attributes.
5. Field edits continue using the existing node update functions and persistence schema.
6. Generation runs through the existing service/provider path and can continue after the composer closes.
7. Result and status changes update the closed card without altering the stored graph schema.

## Error Handling and Edge Cases

- Missing anchor: do not render a visible off-screen composer; retry placement on the next layout pass. If the anchor was removed, close the coordinator entry and focus the canvas shell.
- Oversized composer: clamp width to the viewport and set a scrollable maximum height.
- Node near bottom edge: flip above.
- Node near left/right edge: clamp horizontally while keeping the pointer as close to the anchor center as possible.
- Canvas zoom: position from the DOM bounding rectangle, not graph coordinates.
- Multiple selected nodes: selection remains independent, but opening a composer atomically replaces the previous primary composer through the coordinator.
- Node deletion while open: unmount the composer without errors and clear the open-node registry.
- Dragging/panning: composer stays positioned from the latest anchor rectangle and never becomes a drag handle.
- Reduced motion: disable popover translation and result-fade motion.

## Testing

Add focused tests before implementation:

- JIMI logo renders symbol and lockup variants without legacy product text.
- product root exposes JIMI identity and system-aware default mode behavior.
- JIMI default canvas uses a solid color and has no grid/dot/decorative pseudo-background.
- smart composer prefers bottom placement when space permits.
- smart composer flips above when bottom space is insufficient.
- smart composer clamps horizontally and constrains oversized content.
- a tall composer that fits neither side chooses the larger side and receives the exact available `maxHeight`.
- Escape and outside-canvas interaction close the composer.
- clicking application chrome, unrelated floating UI, or node B closes node A; node B can then open normally.
- pointer/mouse interaction inside the composer does not reach canvas drag/pan handlers.
- image/video/SD 2.0 closed nodes do not render prompt/model/ratio/run controls.
- clicking those nodes renders their existing controls inside the composer.
- generation continues and status remains visible when the composer is closed.
- existing image/video generation and graph persistence regression tests remain green.
- existing classic nodes remain classic, existing smart-card nodes use the empty card, and stale persisted composer-open fields do not reopen a composer.
- a deleted active anchor closes cleanly and returns focus to the canvas shell.
- JIMI default suppresses patterns while an existing decorative optional theme still renders its intended pattern.
- a new store defaults to system preference, legacy stored light/dark migrates to an explicit preference, and live OS changes update only the System preference.

Run focused tests, TypeScript checking, and the production build. Manually verify the packaged Electron window in both system light and system dark modes at common viewport sizes.

## Non-Goals for This Slice

- Replacing the full left sidebar with the final compact rail.
- Redesigning canvas and node context menus.
- Implementing edge-hover insertion/reconnect/delete controls.
- Migrating every specialist node in one pass.
- Changing graph schemas, provider APIs, generation payloads, or saved-workflow compatibility.
- Removing user-created or optional theme templates.

## Acceptance Criteria

- The running app identifies as JIMI AI with the approved Soft Pebble SVG mark.
- Default light/dark surfaces follow system preference and contain no decorative canvas background.
- Migrated smart-card/default generation-node instances are clean empty/result cards when closed; preserved classic instances remain classic.
- Clicking a migrated smart-card/default node instance opens its complete property controls below the node.
- The popover flips only when necessary, closes predictably, and does not interfere with canvas gestures.
- Generation, persistence, media previews, and existing provider behavior remain unchanged.
- Focused tests, type checking, and production build pass.
