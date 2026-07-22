# Canvas Theme CSS Unification Design

## Goal

Unify the canvas and node visual system across all 11 built-in theme templates. Every theme uses a solid canvas background, nodes remain visibly separated from the canvas in both modes, and light-mode themes receive an explicit surface hierarchy instead of relying on patterns, grids, glow, or accidental selector precedence.

## Confirmed Direction

- Apply the change to every built-in theme in one implementation cycle.
- Remove dot, grid, texture, image, pseudo-element, and decorative gradient canvas backgrounds.
- Apply the solid-canvas rule globally, including custom templates. Custom template records are not rewritten or deleted, but decorative canvas metadata no longer produces rendered canvas artwork.
- Keep theme personality through palette, typography, radius, border, and restrained shadow choices.
- Make node surfaces visibly distinct from the canvas, especially in light mode.
- Preserve existing theme IDs, saved preferences, graph data, node behavior, and provider behavior.
- Reduce CSS specificity and `!important` usage where the touched rules can safely move to the shared layer.

## Architecture

### Semantic surface contract

The existing `--t8-*` variables remain the compatibility API. The shared layer consumes a stricter surface hierarchy:

1. `--t8-bg-canvas`: solid canvas base.
2. `--t8-bg-node`: node body surface with a measurable visual step from the canvas.
3. `--t8-bg-node-header`: node header surface, distinct from the body without decorative artwork.
4. `--t8-bg-panel`: docked panels and secondary chrome.
5. `--t8-bg-panel-elevated`: menus, popovers, toolbars, and floating controls.
6. `--t8-border` and `--t8-border-strong`: resting and interactive boundaries.
7. `--t8-shadow-node`: the canonical resting node shadow, sourced from the active theme's restrained shadow palette and falling back to `0 8px 24px rgba(0, 0, 0, 0.18)`.

Each built-in light palette must use a non-white or tinted canvas and a white or clearly brighter node surface. Each dark palette must use the darkest canvas, a lifted node surface, and a still-higher floating surface. Theme-specific CSS may change the character of borders, radii, typography, and shadows, but may not reintroduce canvas imagery or erase the surface hierarchy.

The separation contract is deterministic. A shared test helper accepts opaque `#rgb`, `#rrggbb`, `rgb(r g b)`, or `rgb(r, g, b)` colors and calculates WCAG relative luminance. Built-in `canvasBg`, `nodeBg`, `nodeHeaderBg`, and `panelBgElevated` values must all be opaque solid colors; gradients, URLs, named colors, and alpha values fail validation. For light mode, `L(node) - L(canvas) >= 0.06`, `L(elevated) >= L(node)`, and the canvas/node contrast ratio must be at least `1.12:1`. For dark mode, `L(node) - L(canvas) >= 0.035`, `L(elevated) - L(node) >= 0.025`, and the canvas/node contrast ratio must be at least `1.12:1`. The header must differ from the node body by at least `0.015` luminance in either direction, and `textMain` against `nodeHeaderBg` must meet WCAG `4.5:1`. Border contrast and shadows remain additive cues, not substitutes for the surface threshold.

Custom templates pass through a non-mutating runtime `normalizeSolidCanvasColor` helper before their canvas token is applied. The helper accepts the same opaque solid formats and returns the input unchanged when valid; gradient, URL, named, transparent, and alpha-bearing inputs fall back to the current mode's foundation solid canvas value. It does not rewrite the stored custom template. Node/body tokens in custom templates retain the existing fallback behavior, while the global shared node surface remains opaque through its explicit fallback declaration.

### CSS layering

The shared canvas and node primitives become the single source of geometry and interaction styling. Theme stylesheets supply theme-scoped variables and only genuinely distinctive details.

- `jimi-foundation.css`: pre-boot defaults and product-level tokens only.
- `theme-core.css`: shared canvas, React Flow, node, header, port, selection, toolbar, and floating-surface primitives.
- `theme-*.css`: theme-scoped palette and restrained character overrides.
- `index.css`: import order and feature-specific styles; duplicated global canvas/node/theme overrides are removed from touched areas.

Shared selectors use low-specificity `:where(...)` scopes where possible. `!important` remains only where needed to override React Flow inline dimensions or unavoidable legacy inline styles. New theme rules must not solve precedence problems by adding selector depth.

The compatibility aliases `--t8-node-bg`, `--t8-node-header-bg`, `--t8-node-shadow`, and `--t8-text` remain mapped to `--t8-bg-node`, `--t8-bg-node-header`, `--t8-shadow-node`, and `--t8-text-main`. Existing custom CSS may continue consuming those aliases. Consolidation may migrate internal consumers, but must not silently remove the aliases.

## Canvas Layout and Chrome

- `Canvas.tsx` does not render the React Flow `Background` component for any template, including custom templates.
- The canvas shell and React Flow pane inherit the same solid canvas token.
- Decorative `::before` and `::after` canvas layers are disabled for every template. This is an intentional global visual behavior change; custom template palette, typography, node treatment, and persisted records remain intact.
- Floating controls use the elevated surface token, a consistent compact radius, and a clear border/shadow rather than blending into the canvas.
- Canvas controls keep their current positions and behavior; this change does not reorganize application navigation.
- Selection rectangles and edges use semantic tokens and remain readable against every solid background.

## Node Visual Contract

All node families using `.t8-node`, `.t8-smart-node-card`, or the React Flow built-in node wrappers share these rules:

- A solid node body, never transparent enough to merge with the canvas.
- A consistent border, radius, and low-spread shadow derived from theme tokens.
- A header surface that is visibly distinct but not a decorative gradient.
- One semantic selected state using `--t8-accent`; component-specific Tailwind ring colors are removed from migrated nodes.
- One semantic hover state that changes border/shadow without shifting node geometry during reduced motion.
- Ports have a canvas/node cutout ring and remain visible in light and dark modes.
- Serial badges, action bars, empty states, and status markers use semantic tokens.
- Media remains the visual focus of image/video nodes; common chrome must not cover previews.

Classic and smart-card node variants retain their functional layout. Consolidation owns shell decoration and interaction states only. Existing widths, heights, min/max constraints, padding, header dimensions, overflow behavior, media viewport geometry, handle offsets, React Flow transforms, and box sizing remain invariant. Hover never translates or scales the node shell in any motion mode; it may change only border, shadow, and color. This pass normalizes surfaces and interaction states rather than changing graph schemas or generation controls.

Coverage derives from the registered node inventory used by `Canvas.tsx` and `src/config/nodeRegistry.ts`, then maps registered components to their outer wrapper. Every regular registered node wrapper must use the semantic selected-state contract instead of fixed `ring-*-300`, inline selected shadows, or unscoped theme colors. `groupBox` is an explicit geometry/interaction exception with its own selection boundary, and `bulkPhantom` is a non-visual implementation node; both remain excluded from the regular-card decoration assertion. Representative classic, smart-card, and group tests pin geometry-sensitive selectors and handle positioning.

## Theme Coverage

The 11 built-in templates are:

- JIMI Default (`tech-default`)
- Pixel Candy
- RH Style
- Soft UI
- Wabi-Sabi
- Vaporwave
- Utility
- Skeuomorphism
- Retro OS
- Ink
- Tap Studio

Coverage is registry-driven: tests derive active built-in templates from `BUILT_IN_THEME_TEMPLATES` and assert that every mode provides the required surface tokens. Every built-in template changes `visuals.canvasPattern` to `none`, and descriptions no longer advertise grids, dots, textures, maps, paper, wood, or other canvas artwork. CSS checks reject canvas patterns and theme-scoped canvas pseudo-element artwork. The `plain` visual-style type is compatibility metadata, not a twelfth built-in template.

## Data Flow

1. The theme store resolves the template and light/dark mode as it does today.
2. `applyThemeTemplate` writes the selected mode's semantic tokens to the document root.
3. The canvas shell and React Flow pane consume `--t8-bg-canvas` as one solid surface.
4. Shared node primitives consume node/header/border/shadow tokens.
5. Theme CSS adds only palette-appropriate character without changing the shared hierarchy.

No persisted state or workflow schema changes.

## Error Handling and Compatibility

- Custom themes missing a token continue to inherit foundation fallbacks. Their stored pattern metadata is preserved but intentionally ignored by the now-solid canvas renderer.
- Invalid custom `canvasBg` values are normalized at application time to the mode-appropriate foundation solid color without mutating the saved template.
- Invalid or removed template IDs continue to resolve through the existing fallback path.
- Existing light/dark/system preference behavior remains unchanged.
- Inline media sizing and React Flow transforms are not rewritten.
- Existing user changes in the dirty worktree are preserved; edits stay limited to the theme/canvas/node visual surface and focused tests.
- Unsupported browser `color-mix` behavior continues to receive explicit token fallbacks before mixed values.

## Testing

Tests are written before implementation and must demonstrate the current failure.

- Every built-in theme mode exposes canvas, node, header, panel, elevated panel, text, border, and shadow tokens.
- Every built-in theme mode satisfies the explicit opaque-color, header-difference, luminance-ordering, and `1.12:1` surface-separation contract.
- Runtime custom-canvas normalization preserves valid opaque colors and rejects gradient, URL, transparent, named, and alpha-bearing values with the foundation fallback.
- `Canvas.tsx` no longer renders the React Flow `Background` component.
- Every built-in template declares `canvasPattern: 'none'`, and descriptions do not promise decorative canvas patterns.
- Theme CSS does not define canvas grid, dot, image, repeating gradient, or decorative canvas pseudo-element backgrounds; the global canvas rule also covers custom templates.
- Shared node primitives own resting, hover, selected, header, port, and floating-action styling.
- PostCSS AST checks reject translucent or gradient body/header backgrounds on the shared `.t8-node`, `.t8-smart-node-card`, and `.t8-node-header` primitives and on active built-in theme overrides.
- The complete registered regular-node inventory does not use fixed Tailwind selection rings or inline selected shadows; `groupBox` and `bulkPhantom` are documented exceptions.
- `--t8-shadow-node` is defined with a deterministic fallback, and compatibility aliases remain mapped to their semantic replacements.
- Representative classic, smart-card, and group nodes retain geometry, overflow, media viewport, and handle-positioning behavior; hover does not transform node shells.
- All theme CSS files remain PostCSS-parseable.
- Existing theme, canvas, node, type-check, build, and production tests remain green.

Manual verification covers every built-in theme in light and dark mode at normal zoom and a zoomed-out canvas overview, with special attention to light-mode node separation, ports, selected nodes, menus, and floating controls.

## Non-Goals

- Rebuilding application navigation or changing tool placement.
- Removing or rewriting user-created theme template records. Their canvas pattern metadata is retained but no longer rendered because all canvas backgrounds are now solid.
- Changing node schemas, graph persistence, provider requests, or generation behavior.
- Redesigning every feature-specific form inside specialist nodes.
- Deleting all legacy CSS in one unsafe mechanical pass.

## Acceptance Criteria

- All built-in themes show a solid canvas with no grid, dots, texture, or decorative background.
- Nodes are immediately distinguishable from the canvas in every theme and both modes.
- Light themes use a visibly tinted canvas plus a brighter node/elevated surface hierarchy.
- Classic and smart nodes share coherent border, radius, selection, port, and shadow behavior.
- Theme switching does not reveal uncovered hard-coded dark/light surfaces in the touched canvas/node chrome.
- Focused regression tests, the complete test suite, type checking, CSS parsing, and production build pass.
