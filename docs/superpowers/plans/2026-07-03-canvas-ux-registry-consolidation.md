# Canvas UX Registry Consolidation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate card-mode material input, media task state, model protocol metadata, group execution preview, canvas interaction rules, and node visual consistency.

**Architecture:** Add small shared utilities first, then migrate nodes incrementally. Keep existing node behavior stable while exposing common helpers that tests can lock down before broader integration.

**Tech Stack:** React 19, TypeScript, Zustand, @xyflow/react, Node test runner.

---

## Chunk 1: Shared Foundations

### Task 1: Media task slots

**Files:**
- Create: `src/utils/mediaTaskSlots.ts`
- Test: `tests/mediaTaskSlots.test.ts`
- Later integration targets: `src/components/nodes/ImageNode.tsx`, `src/components/nodes/VideoNode.tsx`, `src/components/nodes/SeedanceNode.tsx`, `src/components/nodes/AudioNode.tsx`

- [ ] Write tests for pending/success/failed/cancelled slot creation and partial completion.
- [ ] Implement pure helpers without React dependencies.
- [ ] Run `npm test -- tests/mediaTaskSlots.test.ts`.

### Task 2: Model protocol metadata

**Files:**
- Create: `src/utils/modelProtocolRegistry.ts`
- Test: `tests/modelProtocolRegistry.test.ts`
- Existing references: `shared/modelProtocolRegistry.json`, `src/providers/models.ts`, `backend/src/providers/registry.js`

- [ ] Load and normalize shared registry metadata for image/video/audio model protocols.
- [ ] Expose lookup helpers for display name, upstream model, endpoint mode, sync/async capability, and media input support.
- [ ] Run `npm test -- tests/modelProtocolRegistry.test.ts`.

### Task 3: Group execution preview

**Files:**
- Create: `src/utils/groupExecutionPlan.ts`
- Test: `tests/groupExecutionPlan.test.ts`
- Integration target: `src/components/Canvas.tsx`, `src/components/nodes/GroupBoxNode.tsx`

- [ ] Write topology tests: independent nodes parallel, connected chains ordered, non-runnable inputs skipped.
- [ ] Implement pure graph planner returning ordered stages and skipped reasons.
- [ ] Run `npm test -- tests/groupExecutionPlan.test.ts`.

## Chunk 2: UI Integration

### Task 4: Unified compact material rail

**Files:**
- Modify: `src/components/nodes/MaterialPreviewSection.tsx`
- Modify: `src/components/nodes/ImageNode.tsx`
- Modify: `src/components/nodes/VideoNode.tsx`
- Modify: `src/components/nodes/SeedanceNode.tsx`
- Modify: `src/components/nodes/AudioNode.tsx`
- Test: `tests/smartCoreNodesUi.test.ts`

- [ ] Ensure all card nodes use compact single rail with optional accessory.
- [ ] Keep classic panels on default grouped mode.
- [ ] Run smart node UI tests.

### Task 5: Canvas interaction rules

**Files:**
- Modify: `src/components/Canvas.tsx`
- Test: `tests/canvasMouseInteractions.test.ts`

- [ ] Lock down middle mouse drag vs long press menu rules.
- [ ] Keep group move member locking behavior.
- [ ] Run mouse interaction tests.

### Task 6: Visual consistency tokens

**Files:**
- Modify: `src/styles/theme-core.css`
- Test: `tests/smartCoreNodesUi.test.ts`

- [ ] Introduce card composer density classes and shared compact field sizing.
- [ ] Apply to image/video/seedance/audio card composers.
- [ ] Run UI tests and type check.

