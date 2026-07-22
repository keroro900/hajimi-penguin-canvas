# Clip Studio Media Duration Design

## Objective

Make the Clip Studio timeline, preview player, and export draft agree on the playable duration of video clips. A clip may be intentionally shorter than its source, but it must never extend beyond the remaining source media after trim and speed are applied.

This is the first delivery of the broader commercial-editor UX upgrade. It fixes the correctness layer before drag behavior, track creation, panel orchestration, and timeline virtualization are changed.

## Problem

The current editor stores timeline duration in `clipVisualDurations` and also treats that value as if it were reliable source metadata. Media probing only fills missing durations. If an imported or upstream video already carries an incorrect duration, such as `21.2s` for a source that ends at `15.07s`, the probe result is ignored.

The consequences are visible across the editor:

- The timeline clip continues after the source has ended.
- The preview becomes black or retains stale content while the playhead keeps moving.
- Thumbnail slots are generated beyond playable media.
- The inspector and export summary report an incorrect project duration.
- Render preflight cannot distinguish a deliberate timeline gap from an invalid clip overrun.

## Duration Model

Video clips use the following concepts:

- `sourceDuration`: immutable duration reported by media probing.
- `trimStart`: source-media offset where playback begins.
- `speed`: playback rate, clamped to the existing supported range.
- `timelineDuration`: duration occupied by the clip on the timeline.
- `maximumTimelineDuration`: `(sourceDuration - trimStart) / speed`.

Source metadata is persisted in an optional node-level `clipVisualSourceMetadata` map keyed by visual ID. Each value stores `{ url, duration }`, so metadata is used only when its normalized URL still matches the visual's current URL. Existing projects remain compatible because missing or URL-mismatched entries are populated by probing when the editor opens. Every URL-replacement path either writes matching metadata atomically or leaves the old entry unusable because of the identity check. The map is metadata, not an editable timeline property, and is not included in normal undo history.

Reconciliation rules:

1. Images are unchanged.
2. Videos without a valid probe result are unchanged and remain eligible for later probing.
3. Effective timeline duration precedence is `clipVisualDurations[id]`, then the visual's own valid `duration`, then `maximumTimelineDuration`.
4. A timeline duration shorter than or equal to `maximumTimelineDuration` is preserved because it may represent a deliberate trim.
5. A timeline duration longer than `maximumTimelineDuration` is clamped.
6. A non-zero `trimStart` and non-default `speed` participate in the clamp.
7. Values are rounded to milliseconds. Every positive timeline overrun after rounding is clamped; no playback-overrun tolerance is allowed. A `0.04s` tolerance may be used only when comparing two source-metadata probe values for repeated-write suppression, never when deciding whether to preserve a timeline duration.
8. Normal user editing keeps the existing `0.25s` minimum. Automatic source correction may produce a shorter positive duration when the remaining source is between `0.1s` and `0.25s`.
9. A maximum timeline duration below `0.1s`, including `trimStart >= sourceDuration`, marks the clip invalid for preview and export. The `0.1s` threshold is applied after speed conversion because it matches the renderer's minimum timeline clip duration. The clip is not silently lengthened, removed, or disabled in persisted user state.

Reconciliation truth table:

| Probe | Effective timeline duration | Remaining source / speed | Result |
| --- | --- | --- | --- |
| Invalid or absent | Any | Unknown | Preserve current state |
| Valid | Missing | Positive | Fill from maximum |
| Valid | Less than or equal to maximum | Positive | Preserve intentional trim |
| Valid | Greater than maximum | Positive | Clamp to maximum |
| Valid | Any | Maximum timeline duration less than `0.1s` | Return clip ID in `invalidIds` |

## Units And Boundaries

### Duration Reconciliation Utility

`src/utils/clipProject.ts` owns a pure function that accepts timeline visuals, current persisted duration edits, current URL-bound source metadata, and media probe results. It returns the next timeline-duration map, next source-metadata map, `invalidIds`, and separate change flags. When there are no new probe results, the same helper recomputes `invalidIds` from persisted URL-matching metadata.

The utility does not perform network calls, React state updates, or node mutations. It is independently testable and is the only unit allowed to decide whether a probed source duration should replace or clamp a timeline duration. A second pure helper calculates speed changes while preserving source span:

`preservedSourceSpan = min(timelineDuration * oldSpeed, sourceDuration - trimStart)`

`nextTimelineDuration = preservedSourceSpan / newSpeed`

This prevents a speed change from expanding an intentionally shortened clip back to the full source.

When source metadata is missing or probing has failed, a speed edit remains available and preserves the inferred source span without a source clamp: `nextTimelineDuration = timelineDuration * oldSpeed / newSpeed`. The clip remains unvalidated. A later successful probe reconciles and clamps it if necessary.

`trimStart` is always measured in source-media seconds. Moving a left timeline boundary by `deltaTimeline` advances the source offset by `deltaTimeline * speed`. Splitting at local timeline time `t` assigns the right clip `trimStart + t * speed`.

### Clip Studio Node Integration

`src/components/nodes/ClipStudioNode.tsx` owns probing and persistence:

- Probe every video whose source metadata has not been validated in persisted metadata or the current editor session, not only videos with missing timeline duration.
- Reconcile probe results through the pure utility.
- Persist only when reconciliation reports a change.
- Reuse the same reconciliation before export so rendering cannot use a known-invalid overrun.
- Preserve existing undo behavior for user edits; automatic metadata correction must not create repeated history entries.

The node must avoid probe/update loops under React Strict Mode. A request registry keyed by URL tracks in-flight promises, and a validated registry records the successful `URL + probed duration` signature. URLs are marked validated before metadata is persisted. Effect cleanup suppresses updates from an obsolete editor instance but does not launch a duplicate request while an identical promise is in flight. URL changes invalidate the old visual-to-source association. Partial probe responses validate only returned URLs; missing URLs remain eligible for a later retry.

`ClipStudioNode` attaches a transient `sourceInvalid` flag to each derived timeline visual from the current reconciliation result. The flag is not persisted in user edit state. `ClipStudioEditor` excludes flagged clips from playback resolution and marks their timeline card with a media-boundary error. Draft construction filters flagged clips, while export performs its own fresh reconciliation and blocks if an active clip remains invalid. Because the flag is derived from persisted URL-bound metadata as well as fresh probes, reopening a project reproduces the same invalid state without requiring a new probe first.

### Preview Playback Boundary

`src/components/nodes/ClipStudioEditor.tsx` continues to resolve the active visual through timeline layout. Active intervals are half-open: a clip is active at `[start, start + duration)`. At the exact end, resolution advances to another visible clip at that time or returns empty.

Additional safeguards:

- Seeking uses source time `trimStart + localTimelineTime * speed`.
- Source time is clamped below the media element's known duration.
- A media `ended` event advances the playhead to at least the clip end and lets the timeline resolver select the next state. It does not clear selection and does not stop global playback by itself.
- The timeline clock stops global playback only at project duration. It may continue through a real gap or another active track, but the ended clip itself is not stretched or retained in preview.

### Draft And Export Boundary

Normal draft construction receives reconciled timeline durations and excludes `invalidIds`. Backend rendering continues to trim source media using the existing duration and speed pipeline. No separate backend duration interpretation is introduced in this delivery.

Export never relies on persisting metadata and immediately reading memoized React state. It awaits all unique video probes required for the export, reconciles against the returned results in local variables, applies the resulting durations to a local visual list, builds a fresh draft from that list, and passes that draft to rendering. Persisted metadata is updated as a side effect for later sessions, but render input uses the locally reconciled result. If any active video remains invalid or unprobed after the export probe, export is blocked with a specific preflight error.

Preflight should report genuine gaps after correction rather than treating source overrun as valid visual coverage.

## User Experience

When a project opens, video metadata is checked in the background. If a clip is longer than its available source range, its right edge contracts to the valid endpoint without a modal or blocking toast. The time badge, project duration, thumbnails, preview, and export summary update together.

Deliberately shortened clips remain unchanged. Users can still trim a video to any duration within the source boundary and can change speed; speed changes recalculate the occupied timeline duration from the same playable source span.

If metadata probing fails, the editor keeps the current clip and shows the existing non-blocking media-duration error. It does not destroy edits or guess a new duration.

## Error And Edge Cases

- Duplicate timeline clips sharing one URL reuse one probe result but reconcile independently using their own `trimStart`, speed, and duration.
- Split clips preserve source-time trim offsets. At speed `s`, splitting after timeline time `t` gives the right clip `trimStart + t * s`.
- Generated videos are probed after generation succeeds and becomes a normal material.
- A generation draft without a media URL is not probed.
- Zero, `NaN`, negative, or absent probe durations are ignored.
- A maximum timeline duration between `0.1s` and `0.25s` is represented exactly after automatic correction; below `0.1s` the clip is invalid.
- Audio duration reconciliation remains unchanged in this delivery.

## Testing

Unit tests in `tests/clipProject.test.ts` cover:

- Filling a missing video duration from a probe.
- Clamping an existing duration that exceeds the source.
- Preserving an intentional shorter duration.
- Accounting for `trimStart` and speed.
- Effective-duration precedence between explicit edit, upstream visual duration, and source maximum.
- Reusing one probe for duplicate source URLs.
- Ignoring invalid probes and images, including partial probe responses.
- Returning invalid IDs when maximum timeline duration is below `0.1s` or trim starts at/after source end.
- Preserving intentional source span through speed changes.
- Applying speed to trim offsets during split and left-edge trim.
- Rejecting stale source metadata when a visual keeps its ID but changes URL, including after project reopen.
- Preserving inferred source span when speed changes before metadata is available.
- Clamping an overrun smaller than `0.04s` after millisecond rounding without causing a persistence loop.

Frontend source-contract tests in `tests/clipStudioEditorFrontend.test.ts` cover:

- The editor probes existing video durations rather than only missing values, deduplicates in-flight probes, and does not persist twice after validation.
- The same reconciliation utility is used before export.
- Preview seek includes trim offset and speed.
- Playback resolution uses half-open clip intervals and `ended` does not stop global timeline playback.

An export regression test covers exporting while an editor-open probe is still in flight: export awaits or reuses that promise, builds directly from local reconciled visuals, and never renders the stale duration.

Verification includes the focused clip tests, TypeScript type checking, production build, and a browser check of a clip whose stale duration is longer than its source.

## Out Of Scope

The following approved improvements are separate deliveries built on this correctness layer:

- Transactional cross-track dragging and edge-dwell track creation.
- Timeline autoscroll, snapping guides, and virtualization.
- A timeline-clock-led media compositor for multi-layer playback.
- Unified generation-task lifecycle and reference routing.
- A single overlay manager for generation popovers and the inspector.
- Full left-side color, motion, audio, and text workspaces.

Those deliveries must use the duration model defined here and may not reintroduce a second interpretation of playable clip length.
