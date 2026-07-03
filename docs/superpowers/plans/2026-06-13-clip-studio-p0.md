# Clip Studio P0 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the clip editor closer to RunningHub's core editing workflow by completing source tabs, editable audio/text clips, FPS settings, and type-aware parameters.

**Architecture:** Extend the existing `ClipProject` model instead of replacing the editor. Keep timeline editing helpers in `src/utils/clipProject.ts`, render/editor UI in `src/components/nodes/ClipStudioEditor.tsx`, and backend ffmpeg support in `backend/src/providers/clipProject.js`.

**Tech Stack:** React 19, TypeScript, existing node editor utilities, Node/Express ffmpeg backend, Node test runner.

---

## Chunk 1: Data Model And Tests

### Task 1: Editable non-visual clip helpers

**Files:**
- Modify: `src/utils/clipProject.ts`
- Test: `tests/clipProject.test.ts`

- [x] Add failing tests for moving and trimming audio/text clips by track and clip id.
- [x] Implement shared clip timing helpers that work for `audio` and `text`.
- [x] Verify clip project tests pass.

## Chunk 2: Editor Surface

### Task 2: RunningHub-style source tabs

**Files:**
- Modify: `src/components/nodes/ClipStudioEditor.tsx`
- Test: `tests/clipStudioEditorFrontend.test.ts`

- [x] Add failing frontend-source tests for `导入 / 画布素材 / 历史记录 / 我的资产`, sound subtabs, new text entry, and FPS settings.
- [x] Update the left panel without changing the existing material ingestion contract.
- [x] Add right-side type-aware controls for blend/audio/text basics.

## Chunk 3: Backend Render Awareness

### Task 3: Audio fade placeholders

**Files:**
- Modify: `backend/src/providers/clipProject.js`
- Test: `tests/clipBackend.test.ts`

- [x] Add failing backend tests for `fadeIn`, `fadeOut`, and preserved audio volume.
- [x] Extend ffmpeg audio filters with fade filters.
- [x] Verify targeted and full clip tests.
