# Tap Studio Canvas Language Design

## Goal

Redesign the `tap-studio` canvas UI language so the canvas feels softer, darker, rounder, and closer to the TapNow-style reference while keeping existing T8 canvas behavior and node business logic intact.

## Scope

- Apply the redesign only when `data-theme-visual="tap-studio"` is active.
- Keep third-party logo and brand assets out of the implementation.
- Replace decorative grid/dot canvas backgrounds with a pure dark canvas color.
- Restructure the visual language around floating islands instead of industrial bars.
- Soften node cards, node headers, handles, hover actions, zoom controls, and canvas chrome.

## Reference Language

TapNow reference traits:
- Pure black or near-black canvas surface.
- Light floating UI islands with pill/capsule geometry.
- Compact top-left identity/status and top-right action grouping.
- Left-side rounded tool rail.
- Bottom-left navigation and zoom island.
- Central prompt/template entry when the canvas is empty.

Infinite Canvas reference traits:
- Prompt and generation controls live close to canvas content.
- Node hover actions are contextual, compact, and icon-first.
- Canvas object interactions are prioritized over permanent side panels.

## Recommended Architecture

1. Add a `tap-studio` canvas chrome layer in `Canvas.tsx`.
   - Render a theme-only center prompt starter when the active canvas has no nodes.
   - Preserve existing `CanvasToolbar`, `Controls`, placement shelf, and modals.
   - Attach stable data attributes/classes so CSS can restyle without affecting other themes.

2. Rework `theme-tap-studio.css` as the primary design-language layer.
   - Define pure canvas tokens: surface, island, island border, soft shadow, pill radius, node radius.
   - Remove grid/dot pseudo-backgrounds from the theme.
   - Convert toolbar/control surfaces into rounded floating islands.
   - Increase node card radius and soften shadows/borders.

3. Keep behavior unchanged in phase one.
   - No changes to node execution, graph data, placement, persistence, shortcuts, or provider logic.
   - Existing controls remain functional; only presentation and empty-state entry are adjusted.

## UX Details

- Canvas background: pure dark, no grid, no dot matrix, no ornamental wash.
- Empty canvas: centered prompt starter with a primary “双击” cue and compact quick chips.
- Left-bottom controls: remain visible and usable under `tap-studio`, styled as a soft dock.
- Top-right toolbar: stay functional but visually becomes a pill island.
- Nodes: 18-24px radii, lower contrast borders, soft highlight on selection, less chrome in headers.
- Handles and resize affordances: visible but less sharp, using small glowing dots/capsules.

## Testing

- Add or update focused theme tests for:
  - `tap-studio` keeps ReactFlow zoom controls visible.
  - `tap-studio` CSS no longer defines dotted/grid canvas background.
  - Empty-state starter renders only in empty canvases.
- Run existing focused theme tests, type-check, and production build.

## Non-Goals

- Do not replace the application logo with TapNow assets.
- Do not redesign every node's internal form logic in this phase.
- Do not change graph storage, node schemas, execution behavior, or provider APIs.
