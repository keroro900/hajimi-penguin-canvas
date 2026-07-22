# Smart Composer Parameter Hierarchy Design

## Goal

Restore clear visual separation between the model selector, prompt editor, and individual generation parameters in the JIMI Default smart-node composer without returning to bright mid-gray surfaces.

## Context

The dark palette was deliberately lowered to a calm charcoal range. The resulting composer is comfortable, but its controls now sit on nearly the same surface and read as one flat block. The screenshot feedback specifically calls out the missing distinction between adjacent parameters.

## Considered Approaches

1. Increase the entire composer brightness again. This creates separation from the canvas, but reintroduces the glare and mid-gray problem that was just removed.
2. Add strong dividers between every row. This is compact, but produces a form/table appearance and does not help each parameter read as an independent control.
3. Use nested, low-contrast field cards with restrained borders. This gives each logical input a silhouette, but visual validation showed that wrapping the label and control adds too much vertical bulk.
4. Paint only the existing compact controls. This preserves the original composer height while separating adjacent parameter values. This is the selected approach after visual validation.

## Visual Design

- Keep the composer outer surface at the current charcoal token.
- Keep `.t8-smart-field` and `.t8-smart-prompt-shell` wrappers unpainted and unpadded so their original vertical rhythm is unchanged.
- Give each existing `.t8-smart-select` a nested token-derived background and `color-mix(in srgb, var(--t8-border-strong) 55%, var(--t8-border))` one-pixel border.
- Do not alter select height, padding, field gaps, row wrapping, or prompt geometry.
- Keep labels small, but improve their hierarchy through spacing and muted-to-main contrast rather than brighter backgrounds.
- Preserve the current primary generation button and the existing layout dimensions.

The styling applies to every smart composer that uses these shared field classes under `tech-default`; it is not Seedance-only. Other built-in themes retain their own visual language. All colors must be token-derived solid or `color-mix()` values, with no grid, speckle, texture, or gradient artwork.

## Implementation Boundaries

- Add a select rule scoped by both `html[data-theme-template="tech-default"]` and `.t8-smart-node-composer` in `src/styles/jimi-foundation.css`.
- Reuse existing shared smart composer classes; no JSX hook is needed because `.t8-smart-field` and `.t8-smart-prompt-shell` express the required groups.
- Do not change generation behavior, values, validation, data flow, composer placement, or node geometry.
- Do not broaden this adjustment to unrelated panels or themes.
- Preserve composer width and height, row flex/wrapping rules, select/button heights, prompt dimensions, and canvas-node geometry.

## Interaction and Accessibility

- Existing `:focus-visible` behavior remains authoritative.
- Hover may adjust border/background color but must not move, resize, or scale controls.
- Labels and values continue to use semantic text tokens.
- Disabled and busy behavior remains unchanged.

## Verification

- Add an AST-based CSS regression test confirming that scoped `.t8-smart-select` controls receive the token-derived nested background, specified 55% semantic border, and no box shadow.
- Confirm the global `:focus-visible` rule remains unchanged.
- Confirm there are no scoped `.t8-smart-field` or `.t8-smart-prompt-shell` wrapper paint rules.
- Confirm the select override is scoped to both `tech-default` and `.t8-smart-node-composer` and does not declare any layout or sizing properties.
- Run `tests/jimiNodeVisuals.test.ts`, `tests/themeCssArchitecture.test.ts`, and `tests/themeSurfaceContract.test.ts`.
- Run TypeScript type checking and `git diff --check` on touched files.
