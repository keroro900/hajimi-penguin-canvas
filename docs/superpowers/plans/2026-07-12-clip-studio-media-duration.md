# Clip Studio Media Duration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent video clips, preview playback, thumbnails, and exports from extending past their real source media while preserving intentional trims and speed changes.

**Architecture:** Add a pure URL-bound source metadata reconciliation layer in `clipProject.ts`, then make `ClipStudioNode` own probe deduplication and export-local reconciliation. The editor consumes transient invalid-state and half-open playback resolution, while source-time trim arithmetic remains in pure timeline utilities.

**Tech Stack:** React 19, TypeScript, Node test runner, FFmpeg-backed clip export, Vite.

---

## Chunk 1: Duration Correctness And Integration

### Task 1: Pure source-duration reconciliation

**Files:**
- Modify: `src/utils/clipProject.ts`
- Test: `tests/clipProject.test.ts`

- [ ] **Step 1: Write failing reconciliation tests**

Add table-driven tests that call the desired `reconcileClipVisualSourceDurations` API with URL-bound metadata:

```ts
const result = reconcileClipVisualSourceDurations({
  visuals: [{ id: 'v1', kind: 'video', url: '/v.mp4', duration: 21.2 }],
  currentDurations: { v1: 21.2 },
  currentSourceMetadata: {},
  probes: [{ url: '/v.mp4', duration: 15.07 }],
});
assert.equal(result.durations.v1, 15.07);
assert.deepEqual(result.sourceMetadata.v1, { url: '/v.mp4', duration: 15.07 });
```

Add one named test per behavior: images remain unchanged; explicit edit duration wins over visual duration; visual duration wins over source maximum when shorter; missing duration is filled; intentional shorter duration is preserved; trim start and speed reduce the maximum; duplicate URLs reuse a probe; URL replacement with the same ID rejects stale metadata after reopen; invalid and partial probes are ignored; persisted metadata recomputes `invalidIds` with no probes; `0.1s` to `0.25s` output remains exact; sub-`0.1s` output is invalid; a timeline overrun smaller than `0.04s` still clamps; source metadata changes smaller than `0.04s` do not request another persistence write.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/clipProject.test.ts`

Expected: FAIL because `reconcileClipVisualSourceDurations` is not exported.

- [ ] **Step 3: Add source metadata and result types**

Add optional transient state to `ClipTimelineVisualMaterial` and new metadata/result types:

```ts
export interface ClipVisualSourceMetadata {
  url: string;
  duration: number;
}

export interface ClipVisualDurationReconciliation {
  durations: Record<string, unknown>;
  sourceMetadata: Record<string, ClipVisualSourceMetadata>;
  invalidIds: string[];
  durationsChanged: boolean;
  sourceMetadataChanged: boolean;
}
```

Add `sourceInvalid?: boolean` to `ClipTimelineVisualMaterial`. Do not add network or React concerns to these types.

- [ ] **Step 4: Implement metadata identity and effective-duration selection**

Implement helpers that normalize URLs, accept persisted metadata only when `normalize(metadata.url) === normalize(visual.url)`, and select effective duration in this exact order: `currentDurations[id]`, `visual.duration`, source maximum.

- [ ] **Step 5: Implement source boundary reconciliation**

Implement `reconcileClipVisualSourceDurations` with source remaining span, speed conversion, millisecond rounding, exact positive-overrun clamping, invalid-ID derivation from either probes or matching persisted metadata, and separate change flags. Retain `mergeProbedClipVisualDurations` as a compatibility wrapper during caller migration.

- [ ] **Step 6: Write and run failing speed-helper tests**

Add one test proving metadata clamps the preserved source span to `sourceDuration - trimStart`, and one proving missing metadata preserves `timelineDuration * oldSpeed`. Run `node --test tests/clipProject.test.ts`.

Expected: FAIL because `resolveClipSpeedDuration` is not exported.

- [ ] **Step 7: Add a pure speed-duration helper**

Implement `resolveClipSpeedDuration` with this behavior:

```ts
const inferredSpan = timelineDuration * oldSpeed;
const remaining = sourceDuration == null ? inferredSpan : Math.max(0, sourceDuration - trimStart);
const preservedSpan = Math.min(inferredSpan, remaining);
return roundSeconds(preservedSpan / newSpeed);
```

When source metadata is absent, preserve the inferred source span without blocking the edit.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `node --test tests/clipProject.test.ts`

Expected: PASS with the new reconciliation and speed cases.

### Task 2: Source-time split, trim, and half-open playback

**Files:**
- Modify: `src/utils/clipProject.ts`
- Test: `tests/clipProject.test.ts`

- [ ] **Step 1: Write failing boundary tests**

Add tests proving:

```ts
// At 2x speed, splitting 1 timeline second into the clip advances trimStart by 2 source seconds.
assert.equal(right.trimStart, originalTrimStart + 2);

// The clip ending at t=4 is not active at exactly t=4.
assert.equal(resolveClipTimelinePlayback([clip], 4), null);
```

Also cover left-edge trim at non-default speed and two adjacent clips where the second clip wins at the shared boundary.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/clipProject.test.ts`

Expected: FAIL because current split/trim increments source offsets in timeline seconds and playback uses an inclusive end.

- [ ] **Step 3: Correct source-time arithmetic and interval resolution**

Update split and left-trim utilities so `trimStartDelta` is multiplied by the clip speed. Change playback matching from `time <= end` to `time < end`, with adjacent clips sorted by lane/order rules already present in the layout.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/clipProject.test.ts`

Expected: PASS.

### Task 3: Probe lifecycle and transient invalid visuals

**Files:**
- Modify: `src/components/nodes/ClipStudioNode.tsx`
- Modify: `src/components/nodes/ClipStudioEditor.tsx`
- Test: `tests/clipStudioEditorFrontend.test.ts`

- [ ] **Step 1: Write failing frontend contract tests**

Add named source-contract assertions requiring:

- `clipVisualSourceMetadata` parsing with `{ url, duration }`.
- URL-keyed `clipProbePromisesRef` and `clipValidatedProbeRef` registries.
- Filtering videos by matching source metadata/session validation rather than missing timeline duration.
- Skipping generation drafts without a URL and probing generated-success videos with a URL.
- Marking validation before `update`, ignoring partial results, and checking effect cancellation before persistence.
- Transient `sourceInvalid` derivation and `buildClipDraftFromTimeline` filtering it.
- Preview source time `trimStart + localTime * speed`, clamped strictly below finite `video.duration` with a `0.001s` playback epsilon unrelated to metadata comparison tolerance.
- `onEnded` advancing the playhead to at least the active clip end, preserving selection, and not calling `setPlaying(false)`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/clipStudioEditorFrontend.test.ts`

Expected: FAIL on named assertions for missing metadata parsing, missing registries, missing generated-video filtering, raw seek time, inclusive media end handling, and missing invalid-draft filtering.

- [ ] **Step 3: Parse URL-bound source metadata**

Read `d.clipVisualSourceMetadata` as URL-bound records and reject records whose URL no longer matches the visual. Keep this parsing isolated from probe effects.

- [ ] **Step 4: Derive invalid visuals and filter normal drafts**

Reconcile persisted metadata with edited visuals, map every returned `durations[id]` onto the derived timeline visual immediately, attach `sourceInvalid` to matching visuals, and pass those reconciled non-invalid visuals to normal `buildClipDraftFromTimeline` calls before any persistence round trip. Automatic metadata persistence uses `update`, not `commitClipPatch`, so it does not pollute undo history.

- [ ] **Step 5: Add in-flight and validated probe registries**

Add URL-keyed refs and one helper that returns an existing in-flight promise or starts `probeClipMedia([url])`. It records successful `url + duration` validation before returning and removes only the matching settled promise.

- [ ] **Step 6: Replace the editor-open probe effect**

Probe every video with a URL that lacks matching metadata/session validation, including generated-success videos. Skip drafts without URLs. Reconcile partial returned results, persist only changed maps, and suppress persistence when cleanup has made the effect obsolete. On rejection, preserve the current clip state and set the existing non-blocking `视频时长读取失败` error.

- [ ] **Step 7: Consume invalid state in timeline and preview selection**

Exclude `sourceInvalid` clips from `resolveClipTimelinePlayback`, normal draft inputs, and active visual counts. Show a compact media-boundary error badge on their timeline cards without deleting or disabling user state.

- [ ] **Step 8: Correct preview seek and ended handling**

Seek with `trimStart + localTimelineTime * speed` and clamp to at most `video.duration - 0.001` when duration is finite. On `ended`, set playhead to `max(current, clipEnd)` without changing selection; let the timeline clock stop only at project duration.

- [ ] **Step 9: Run frontend and utility tests**

Run: `node --test tests/clipProject.test.ts tests/clipStudioEditorFrontend.test.ts`

Expected: PASS.

### Task 4: Export-local reconciliation

**Files:**
- Modify: `src/components/nodes/ClipStudioNode.tsx`
- Test: `tests/clipStudioEditorFrontend.test.ts`
- Test: `tests/clipProject.test.ts`

- [ ] **Step 1: Write failing export contract test**

Require `handleRender` to call the same URL-keyed probe helper (reusing an editor-open in-flight promise), call `reconcileClipVisualSourceDurations`, block on `invalidIds` or unprobed active videos, create `reconciledVisuals` from returned durations, and pass those visuals directly to `buildClipDraftFromTimeline` rather than relying on a state update or raw probe duration replacement.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/clipProject.test.ts tests/clipStudioEditorFrontend.test.ts`

Expected: FAIL because export currently maps URL probe duration directly onto every video and can overwrite intentional trims.

- [ ] **Step 3: Build export draft from local reconciled state**

After probing, reconcile source metadata and durations locally. If any active video ID is invalid or has no valid source metadata after the export probe, throw a specific preflight error. Otherwise map only reconciled timeline durations into a fresh visual list and build the project from that list. Persist metadata/duration changes separately for the next session.

- [ ] **Step 4: Run the focused clip suite**

Run: `node --test tests/clipProject.test.ts tests/clipStudioEditorFrontend.test.ts tests/clipBackend.test.ts`

Expected: PASS.

### Task 5: Full verification

**Files:**
- Verify only

- [ ] **Step 1: Run type checking**

Run: `npm run type-check`

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS; existing Vite chunk-size warnings are acceptable.

- [ ] **Step 3: Run public artifact check**

Run: `npm run public:check`

Expected: PASS.

- [ ] **Step 4: Browser regression check**

Check whether `http://127.0.0.1:5173/` is already serving the app; if not, run `npm run dev:vite` and use the printed local URL. Open the editor with a video whose stale timeline duration exceeds its source and verify the clip edge, final thumbnail slot, project-duration badge, playhead time badge, preview, and export summary all stop at the reconciled source boundary. Verify an intentionally shortened clip remains shortened and a speed change preserves its source span.

Because the working tree contains overlapping user changes in the same large editor files, implementation checkpoints will not create automatic code commits. This avoids committing unrelated in-progress work; verification output and the final diff provide the handoff boundary.
