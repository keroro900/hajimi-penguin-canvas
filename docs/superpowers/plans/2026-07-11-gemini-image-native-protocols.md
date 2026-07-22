# Gemini Image Native Protocols Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add separately selectable Gemini generateContent and interactions image protocols to the default image service.

**Architecture:** Extend the shared protocol registry and persisted setting union, then route each protocol to a dedicated request builder in the image proxy. Preserve legacy `gemini-native` as an interactions alias.

**Tech Stack:** Node.js, Express, React/TypeScript, Node test runner

---

## Chunk 1: Protocol Routing

### Task 1: Add failing protocol tests

**Files:**
- Modify: `tests/imageModelMapping.test.ts`

- [x] Add a test for `gemini-generate-content` request URL, headers, body, references, ratio, and size.
- [x] Update the interactions test to use `gemini-interactions`.
- [x] Add a legacy alias assertion for `gemini-native`.
- [x] Run `node scripts/run-tests.cjs tests/imageModelMapping.test.ts` and verify the new test fails for missing routing.

### Task 2: Implement both native protocols

**Files:**
- Modify: `backend/src/routes/proxy.js`

- [x] Split the interactions caller from the new generateContent caller.
- [x] Route explicit protocol values and preserve the legacy alias.
- [x] Run the focused test and verify it passes.

## Chunk 2: Settings Surface

### Task 3: Expose and persist both choices

**Files:**
- Modify: `shared/modelProtocolRegistry.json`
- Modify: `backend/src/routes/settings.js`
- Modify: `src/components/ApiSettings.tsx`
- Modify: `src/types/canvas.ts`
- Modify: `tests/imageModelMapping.test.ts`

- [x] Add failing assertions for the new settings values and labels.
- [x] Run the focused test and verify it fails.
- [x] Add both options to the registry and type/normalization allowlists.
- [x] Run focused tests and `npm run type-check` (focused tests pass; type-check reaches an unrelated existing `RadialMenuSettingsModal.tsx` error).

## Chunk 3: Runtime Verification

### Task 4: Restart and verify

- [x] Restart the backend.
- [x] Verify `/api/status` returns HTTP 200.
- [x] Verify `tests/imageModelMapping.test.ts` passes with zero failures.
