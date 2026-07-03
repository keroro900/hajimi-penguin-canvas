# LUT Color Node Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable LUT color grading node that applies built-in or imported `.cube` LUTs to upstream images.

**Architecture:** Keep LUT parsing and pixel sampling in a backend utility with no Express or Sharp coupling. Expose it through `/api/image/lut`, then wire a thin frontend service and node around the existing `ImageOpFrame` pattern.

**Tech Stack:** React 19, TypeScript, Express, Sharp, Node test runner.

---

## Chunk 1: Backend LUT Core

### Task 1: Parser And Sampler

**Files:**
- Create: `backend/src/utils/lutCube.js`
- Test: `tests/lutCube.test.ts`

- [ ] Write tests for identity LUT, inversion LUT, amount blending, domain scaling, and invalid cube errors.
- [ ] Run `npm run test -- tests/lutCube.test.ts` and verify failures are for missing implementation.
- [ ] Implement `parseCubeLut`, `sampleCubeLut`, `applyCubeLutToRgba`, and `createCubeLutText`.
- [ ] Run `npm run test -- tests/lutCube.test.ts`.

## Chunk 2: Backend Route And Presets

### Task 2: Image API

**Files:**
- Modify: `backend/src/routes/imageOps.js`
- Create: `src/utils/lutPresets.ts`
- Modify: `src/services/imageOps.ts`
- Test: `tests/lutColorNode.test.ts`

- [ ] Add tests proving `/api/image/lut`, `opLut`, presets, and node registration are wired.
- [ ] Run focused tests and verify expected failures.
- [ ] Add `POST /api/image/lut` using Sharp raw pixels and `lutCube`.
- [ ] Add frontend preset metadata with generated `.cube` text for original built-in LUTs.
- [ ] Add `opLut` service helper.
- [ ] Run focused tests.

## Chunk 3: Frontend Node

### Task 3: Node UI

**Files:**
- Create: `src/components/nodes/LutColorNode.tsx`
- Modify: `src/components/Canvas.tsx`
- Modify: `src/config/nodeRegistry.ts`
- Modify: `src/config/portTypes.ts`
- Modify: `src/types/canvas.ts`
- Modify: `src/components/NodeActionBar.tsx`
- Test: `tests/lutColorNode.test.ts`

- [ ] Add registration assertions for the visible image-to-image utility node.
- [ ] Run focused tests and verify failures.
- [ ] Implement the node with built-in presets, `.cube` file import, amount slider, and `ImageOpFrame`.
- [ ] Register the node in canvas, ports, types, and executable toolbar.
- [ ] Run `npm run test -- tests/lutCube.test.ts tests/lutColorNode.test.ts`.
- [ ] Run `npm run type-check`.
