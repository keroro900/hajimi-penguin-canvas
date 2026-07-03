# Hakimi Canvas CLI Visible Agent Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `hakimi-canvas` CLI and complete the visible frontend node execution callback loop so CLI/MCP agents can control existing canvases and observe node completion.

**Architecture:** The CLI uses the existing backend HTTP API instead of touching canvas files directly. Backend `agentCanvas` remains the orchestration source and gains a node-result callback endpoint. The frontend keeps executing nodes through `runBus`, but reports agent-triggered completion back to the backend with run metadata.

**Tech Stack:** Node.js ESM CLI, Express route additions, React/TypeScript frontend API wrapper, existing node:test test runner.

---

## Chunk 1: Agent Node Result Callback

### Task 1: Backend Node Result Endpoint

**Files:**
- Modify: `backend/src/routes/agentCanvas.js`
- Test: `tests/hakimiCliVisibleAgentControl.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that `agentCanvas.js` exposes `router.post('/runs/:runId/node-result'`, stores node results, emits `agent:node_result`, and emits `agent:run_node_status`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/hakimiCliVisibleAgentControl.test.ts`

Expected: FAIL because the route and symbols do not exist yet.

- [ ] **Step 3: Implement backend callback**

Add a `runNodeResults` map, normalization helper, compact node result helper, `GET /runs/:runId/node-results`, and `POST /runs/:runId/node-result`.

- [ ] **Step 4: Run focused test**

Run: `npm run test -- tests/hakimiCliVisibleAgentControl.test.ts`

Expected: PASS.

## Chunk 2: Frontend Completion Reporting

### Task 2: Frontend API Wrapper and Canvas Wiring

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/components/Canvas.tsx`
- Test: `tests/hakimiCliVisibleAgentControl.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that `api.ts` exports `submitAgentCanvasNodeResult`, posts to `/agent/canvas/runs/${encodeURIComponent(runId)}/node-result`, and that `Canvas.tsx` stores agent run metadata by node id and calls the API on `lastDone`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/hakimiCliVisibleAgentControl.test.ts`

Expected: FAIL because the API wrapper and Canvas callback do not exist.

- [ ] **Step 3: Implement minimal frontend callback**

Replace the `Set<string>` pending agent node tracking with a `Map<string, { runId; agentId; canvasId; startedAt }>` and call `submitAgentCanvasNodeResult` when `lastDone` matches.

- [ ] **Step 4: Run focused test**

Run: `npm run test -- tests/hakimiCliVisibleAgentControl.test.ts`

Expected: PASS.

## Chunk 3: Hakimi Canvas CLI

### Task 3: CLI Commands

**Files:**
- Create: `tools/hakimi-canvas-cli/hakimi-canvas.mjs`
- Modify: `package.json`
- Test: `tests/hakimiCanvasCli.test.ts`

- [ ] **Step 1: Write CLI tests first**

Cover `parseArgs`, JSON file loading, request payload construction, `run-node`, `apply --watch`, and invalid command help.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- tests/hakimiCanvasCli.test.ts`

Expected: FAIL because CLI file does not exist.

- [ ] **Step 3: Implement CLI**

Create an ESM CLI with exported helpers for tests and a `main()` guarded by `if (import.meta.url === pathToFileURL(process.argv[1]).href)`.

- [ ] **Step 4: Add package script**

Add `"hakimi:canvas": "node tools/hakimi-canvas-cli/hakimi-canvas.mjs"` to `package.json`.

- [ ] **Step 5: Run focused CLI tests**

Run: `npm run test -- tests/hakimiCanvasCli.test.ts`

Expected: PASS.

### Task 3.5: Persist Run Logs for Future Replay

**Files:**
- Modify: `backend/src/routes/agentCanvas.js`
- Modify: `tools/hakimi-canvas-cli/hakimi-canvas.mjs`
- Test: `tests/hakimiCliVisibleAgentControl.test.ts`
- Test: `tests/hakimiCanvasCli.test.ts`

- [ ] **Step 1: Write failing tests**

Assert that backend appends run events to a bounded run log and exposes `GET /api/agent/canvas/runs/:runId/log`. Assert CLI supports `export-run <runId>`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- tests/hakimiCliVisibleAgentControl.test.ts tests/hakimiCanvasCli.test.ts`

Expected: FAIL because run log and export-run are not implemented.

- [ ] **Step 3: Implement run log and export command**

Persist events from `emitRun()`, cap events at 1000, and add `export-run` as a GET wrapper.

- [ ] **Step 4: Run focused tests**

Run: `npm run test -- tests/hakimiCliVisibleAgentControl.test.ts tests/hakimiCanvasCli.test.ts`

Expected: PASS.

### Task 3.6: Add Group and Downstream CLI Control

**Files:**
- Modify: `tools/hakimi-canvas-cli/hakimi-canvas.mjs`
- Test: `tests/hakimiCanvasCli.test.ts`

- [ ] **Step 1: Write failing tests**

Assert that `run-group <canvasId> <nodeId...>` builds multiple visible `run_node` actions. Assert that `continue-downstream <canvasId> <nodeId...>` can calculate downstream node ids from a snapshot in topological order.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- tests/hakimiCanvasCli.test.ts`

Expected: FAIL because the commands and planning helpers are not implemented.

- [ ] **Step 3: Implement CLI helpers and commands**

Add `planDownstreamRunActions`, `buildContinueDownstreamRequest`, `run-group`, and `continue-downstream`. In `main`, make `continue-downstream` fetch a snapshot first, then submit the planned visible actions.

- [ ] **Step 4: Run focused tests**

Run: `npm run test -- tests/hakimiCanvasCli.test.ts`

Expected: PASS.

## Chunk 4: Verification

### Task 4: Full Focused Verification

**Files:**
- No production files unless tests reveal issues.

- [ ] **Step 1: Run focused tests**

Run: `npm run test -- tests/hakimiCliVisibleAgentControl.test.ts tests/hakimiCanvasCli.test.ts`

Expected: PASS.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`

Expected: PASS or report exact existing/non-related failures.

- [ ] **Step 3: CLI smoke**

Run: `node tools/hakimi-canvas-cli/hakimi-canvas.mjs --help`

Expected: prints command help and exits 0.
