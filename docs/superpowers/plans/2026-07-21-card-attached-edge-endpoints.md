# Card-attached Edge Endpoints Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep connection handles outside nodes while making all edge paths visually meet card boundaries.

**Architecture:** Add a pure endpoint-coordinate helper for the 27px outer-edge displacement of the largest Handle. Reuse it in completed edges and the connection preview, with an explicit GroupBox exemption.

**Tech Stack:** React 19, TypeScript, `@xyflow/react`, Node test runner.

---

### Task 1: Endpoint compensation

**Files:**
- Create: `src/utils/edgeEndpointGeometry.ts`
- Create: `tests/edgeEndpointGeometry.test.ts`
- Modify: `src/components/edges/DeletableEdge.tsx`
- Modify: `src/components/Canvas.tsx`

- [ ] Write tests asserting left `+27`, right `-27`, unchanged top/bottom, unchanged GroupBox, and both renderers using the helper.
- [ ] Run `node scripts/run-tests.cjs tests/edgeEndpointGeometry.test.ts` and verify it fails because the helper is absent.
- [ ] Implement the pure helper and apply it to completed-edge and connection-preview coordinates.
- [ ] Re-run the focused test and existing handle/connection tests.
- [ ] Run type checking, production build, and browser visual verification.
