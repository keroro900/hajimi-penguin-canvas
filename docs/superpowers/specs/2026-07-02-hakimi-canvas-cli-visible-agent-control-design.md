# Hakimi Canvas CLI Visible Agent Control Design

## Goal

Build a first-phase Hakimi Canvas CLI that controls existing canvases through the current agent canvas protocol, while users can visibly watch the agent add nodes, update nodes, connect edges, focus the viewport, and trigger existing node execution in the open canvas UI.

## Scope

This phase does not migrate node execution out of React components. Existing node `handleRun` implementations continue to run through the frontend `runBus` and `useRunTrigger` path. The new work makes that path controllable from CLI/API/MCP and observable by the backend so CLI users can watch completion or failure.

## Current System

- `backend/src/routes/agentCanvas.js` already supports snapshots, plan diff/apply/verify, action execution, run events, and `canvas:run_node`.
- `src/components/Canvas.tsx` already subscribes to `/api/canvas/events`, displays agent activity, and calls `useRunBusStore.getState().triggerRun(nodeId, 'single')` when `canvas:run_node` arrives for the active canvas.
- `src/hooks/useRunTrigger.ts` and `src/stores/runBus.ts` already provide the actual frontend execution mechanism.
- Existing CLI-level control exists indirectly through MCP, but there is no user-facing `hakimi-canvas` CLI and no backend run-node result callback.

## Design

### CLI

Add a lightweight Node CLI under `tools/hakimi-canvas-cli/hakimi-canvas.mjs`.

Commands:

- `status`: probe backend status.
- `list`: list canvases.
- `snapshot <canvasId>`: print compact agent snapshot.
- `diff <canvasId> <plan.json>`: validate and preview a CanvasPlan.
- `apply <canvasId> <plan.json> [--preview] [--agent <id>] [--autopilot] [--watch]`: apply a CanvasPlan.
- `actions <canvasId> <actions.json> [--preview] [--agent <id>] [--autopilot] [--watch]`: run raw visible actions.
- `run-node <canvasId> <nodeId> [--agent <id>] [--watch]`: trigger an existing node through visible agent control.
- `run-group <canvasId> <nodeId...> [--agent <id>] [--watch]`: trigger multiple visible node runs in one agent session.
- `continue-downstream <canvasId> <nodeId...> [--agent <id>] [--watch]`: read the current snapshot, calculate descendants from the given node ids, and submit downstream `run_node` actions in topological order.
- `export-run <runId>`: print the persisted run log as JSON.
- `watch <runId>`: stream run events.

The CLI talks only to the backend HTTP API. It should not read or mutate canvas JSON files directly.

### Backend Run Completion

Add `POST /api/agent/canvas/runs/:runId/node-result`.

Request payload:

```json
{
  "canvasId": "canvas-...",
  "nodeId": "image-1",
  "ok": true,
  "error": "",
  "node": { "id": "image-1", "type": "image", "data": {} },
  "completedAt": 1782930000000
}
```

Backend behavior:

- Normalize and store recent node results per run.
- Broadcast `agent:run_node_status` with `success` or `error`.
- Broadcast `agent:node_result` with a compact result summary.
- Emit these events to both global canvas SSE and per-run SSE clients.

This makes CLI `--watch` and MCP callers aware that a frontend-run node finished.

### Run Log Persistence

Every `emitRun()` event is appended to `data/agent_canvas_runs/<runId>.json` with a bounded event list. The log is intentionally event-shaped, not workflow-shaped, so future features can derive replay, audit, resume, and debugging views without changing the live event protocol.

### Frontend Completion Callback

When Canvas receives `canvas:run_node`, store the run metadata by `nodeId`, not only the node id. When `lastDone` reports completion for that node:

- Find the latest node data from `nodesRef`.
- Call `api.submitAgentCanvasNodeResult(runId, payload)`.
- Keep the existing local activity update for responsiveness.
- Clear the pending node entry.

If the callback fails, the local UI should still show completion; the error is logged, not user-blocking.

### Node Coverage

`run_node` should not be restricted to image, video, or Seedance nodes. In this phase the backend only verifies that the node exists, marks it queued/running for visibility, and lets the open frontend decide whether an actual `useRunTrigger` handler exists. Nodes without a frontend run handler may remain running until a future executor layer or manual result callback handles them.

### Group and Downstream Execution

`run-group` is a thin visible batch: it submits one `run_node` action per node id. `continue-downstream` is CLI-planned: it reads the compact backend snapshot, finds descendants through canvas edges, ignores unrelated external dependencies, sorts the reachable subgraph topologically, and submits the resulting `run_node` actions.

This phase does not guarantee dependency-aware waiting between downstream nodes. The open frontend receives all visible run requests through the existing run bus; later work can add a backend sequencer that waits for `agent:node_result` before dispatching the next node.

### Extensibility

The first phase deliberately introduces stable seams without implementing backend node execution:

- The CLI command shape can later add `run-workflow`, `resume`, `cancel`, and `export-run`.
- Backend run logs can later power replay, resume, and timeline UI.
- `continue-downstream` can later move from CLI-side planning to backend orchestration with result-aware sequencing.
- `node-result` can later accept richer output contracts per node type.
- A future `nodeRuntimeRegistry` can reuse the same `agent:run_node_status` and `agent:node_result` events when selected node types become backend-executable.
- Frontend lease execution remains the compatibility layer for interactive or UI-only nodes.

## Error Handling

- Missing backend returns a clear CLI message with the base URL.
- Invalid JSON plan/action files fail before sending.
- Backend validation errors are printed with server details.
- `run-node --watch` exits when it sees success, error, `agent:run_done`, or `agent:run_error` for the run.
- A node can remain running if the canvas UI is not open; the CLI should say that node execution requires an open matching canvas for this phase.

## Tests

- Add backend route tests by source/API contract for `node-result` events.
- Add frontend contract tests that `Canvas.tsx` calls `submitAgentCanvasNodeResult` and tracks `runId` per agent-triggered node.
- Add CLI tests for command parsing, endpoint selection, JSON loading, and request payloads without requiring a live backend.
