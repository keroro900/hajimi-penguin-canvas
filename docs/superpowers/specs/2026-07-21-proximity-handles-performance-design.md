# Proximity Handles and Canvas Pan Performance Design

## Goal

Make connection ports feel like contextual add/connect controls: they sit visibly away from the node border, stay hidden while the pointer is elsewhere, and reveal only on the side nearest the pointer. Remove the newly observed canvas-pan jank without weakening the enlarged hit target or cross-theme geometry guarantees.

## Interaction design

- A visible regular port remains 14px; a smart port remains 16px.
- The 38px concentric hit target remains unchanged.
- The 14px/16px React Flow Handle box and its 38px pseudo-element hit target are concentric. Their shared center is exactly 19px outside the node border. The visible port's inner edge is therefore separated from the border by `(38px - visible size) / 2`: 12px for regular ports and 11px for smart ports.
- The 38px hit target's inner boundary touches the node border exactly. Visibility changes use opacity and pointer-events only; they never use display, visibility, or geometry-changing transforms, so the React Flow anchor center and SVG routing remain stable.
- Ports are hidden and non-interactive by default.
- One delegated pointer tracker resolves ownership from the event path: a `.react-flow__node` or one of its revealed Handle hit targets owns the pointer. It never scans all nodes. It writes `data-t8-handle-side="left"` or `"right"` directly to the owning node. Left/right is computed from that node's one bounding rectangle: `clientX < midpoint` is left; otherwise right.
- Only handles on that side become visible and interactive. Moving to the other half switches sides; leaving the active node-plus-revealed-hit-target union clears the attribute.
- The active pointer region is the union of the node and its revealed Handle hit targets. Moving from the node into the outside hit target retains ownership. Clear only after leaving that union, when another node takes ownership, on pointercancel/window blur, or on unmount.
- State precedence is active connection > focused Handle > touch/pen selected fallback > mouse proximity > hidden. Idle Handles remain mounted. A focused Handle remains visible regardless of proximity. With the installed React Flow version, `.react-flow__handle.connectingfrom` keeps the source visible and `.react-flow__handle.connectingto.valid` reveals eligible candidates; existing application compatibility aliases may be retained, but tests must include these emitted compound classes. Connection end/cancel cleans up. Touch/pen pointerdown temporarily reveals both connectable sides; pointerup/cancel clears that transient reveal unless selection now owns the fallback. Selection reveal lasts until deselection. Blur and unmount also clear transient state. Phantom Handles never reveal.
- The port uses a compact plus mark similar to the supplied reference, while theme files continue to own color only.

## Performance design

The reproduced 20-node canvas used about 751ms main-thread task time during an approximately one-second pan: about 402ms script and 236ms style recalculation. Heap usage was about 37.5MB, so memory pressure is not the primary cause. A CPU profile showed repeated React development rendering (`jsxDEV`/`createElement`) during viewport movement.

The primary tested hypothesis is that `CanvasInner` subscribing to `useViewport()` re-renders the large Canvas component for every viewport frame. Replace that subscription with the React Flow `onMove` payload:

- initialize the zoom ref and LOD state from the current viewport;
- update the zoom ref on every move without React state;
- use a guarded functional state update only when the derived LOD bucket changes;
- reconcile final zoom/LOD on move end only when different; programmatic moves use the same callback path;
- a fixed-zoom pan must not update zoom/LOD state;
- retain the existing move-start/move-end busy flags;
- keep snapping logic reading the ref;
- do not add polling, continuous observers, or per-node pointer listeners.

The delegated handle-side tracker also avoids React state. The same node and side causes zero mutations; a side change causes one set; an ownership change causes at most one clear plus one set; cleanup causes at most one clear.

## Compatibility and safety

- Preserve phantom routing handles as invisible 1px exceptions that bypass the spacing/reveal rules.
- Preserve GroupBox custom geometry and negative stacking.
- Preserve exact React Flow outer-edge SVG anchoring and theme-change remeasurement.
- Preserve focus-visible indicators and enlarged hit targets across all 11 themes in light/dark modes.
- Do not reintroduce patterned canvas backgrounds or theme-owned handle geometry.

## Verification

- Test the exact gap formula, hidden default, side-only reveal selectors, plus mark, connection/focus fallbacks, and no phantom reveal.
- Test the delegated tracker as a pure/injected controller: event-path ownership, node-to-hit-target retention, node/side changes, same-side suppression, midpoint split, active-union exit, pointerup without selection, pointercancel, blur, connection cleanup, and dispose/unmount cleanup.
- Test the precedence and installed React Flow compound classes for connection, focus, selected touch/pen, transient touch/pen, pointer proximity, hidden idle, and phantom exclusion.
- Source-test that Canvas no longer calls `useViewport()` and that `onMove` updates refs while React state changes only at LOD boundaries/end.
- Run existing handle geometry/theme architecture tests and TypeScript/build checks.
- Instrument a CanvasInner render counter in the browser audit: a fixed-zoom pan may render for move start/end but must not render once per pointer frame.
- Re-run the same warmed 20-node browser pan with the same 11-point, 150px input path on the same browser/build. Collect at least five baseline and five post-change runs and compare medians. Require at least 30% lower ScriptDuration, at least 20% lower TaskDuration, and no more than 10% worse RecalcStyleDuration. Record raw runs and medians in `codex-temp/canvas-pan-performance-audit.json`.
