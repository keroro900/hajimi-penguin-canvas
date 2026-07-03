# LAN Realtime Collaboration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build practical LAN multi-user realtime canvas editing with WebSocket rooms scoped by canvas id.

**Architecture:** Add a small operation protocol and pure apply helpers, wire a backend WebSocket hub by canvas room, and connect the React canvas to send local operations and apply remote operations. Keep current JSON persistence as the durable snapshot path.

**Tech Stack:** Node.js `ws`, Express HTTP upgrade, React/Vite, TypeScript pure helpers, `node --test`.

---

## Chunk 1: Shared Operation Protocol

### Task 1: Canvas Realtime Helpers

**Files:**
- Create: `src/utils/canvasRealtime.ts`
- Test: `tests/canvasRealtime.test.ts`

- [ ] Write failing tests for node add/update/remove, edge add/remove, snapshot replacement, and client loop prevention metadata.
- [ ] Run `npm run test -- tests/canvasRealtime.test.ts` and confirm the tests fail because the module does not exist.
- [ ] Implement `normalizeCanvasRealtimeOp`, `applyCanvasRealtimeOp`, and `makeCanvasRealtimeClientId`.
- [ ] Run `npm run test -- tests/canvasRealtime.test.ts` and confirm it passes.

## Chunk 2: Backend WebSocket Hub

### Task 2: Canvas Hub

**Files:**
- Create: `backend/src/realtime/canvasHub.js`
- Modify: `backend/src/server.js`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Test: `tests/canvasRealtimeBackend.test.ts`

- [ ] Write failing static tests confirming the server creates an HTTP server, wires `/api/canvas/realtime`, and the hub exposes room/client validation.
- [ ] Run `npm run test -- tests/canvasRealtimeBackend.test.ts` and confirm failure.
- [ ] Add `ws` to backend dependencies.
- [ ] Implement the hub with join, message validation, room fanout, heartbeat cleanup, and presence events.
- [ ] Update `backend/src/server.js` to use `http.createServer(app)` and attach the hub upgrade handler.
- [ ] Run `npm run test -- tests/canvasRealtimeBackend.test.ts`.

## Chunk 3: Frontend Client And Canvas Integration

### Task 3: Browser WebSocket Client

**Files:**
- Create: `src/services/canvasRealtime.ts`
- Modify: `src/components/Canvas.tsx`
- Test: `tests/canvasRealtimeFrontend.test.ts`

- [ ] Write failing tests confirming the frontend has a realtime service and Canvas subscribes by active canvas id.
- [ ] Run `npm run test -- tests/canvasRealtimeFrontend.test.ts` and confirm failure.
- [ ] Implement the browser client with connect, reconnect, send, close, and event callbacks.
- [ ] Integrate Canvas local operation emission for add/update/remove/edge changes through React Flow `onNodesChange` and `onEdgesChange`.
- [ ] Integrate remote operation application with sender suppression and safe fallback snapshot handling.
- [ ] Keep existing debounced persistence active as the durable save path.
- [ ] Run `npm run test -- tests/canvasRealtimeFrontend.test.ts`.

## Chunk 4: Verification

### Task 4: Focused Validation

**Files:**
- Existing test suite and build config.

- [ ] Run `npm run test -- tests/canvasRealtime.test.ts tests/canvasRealtimeBackend.test.ts tests/canvasRealtimeFrontend.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Run `npm run build`.
- [ ] If Docker is available, run `docker compose config`.
- [ ] Manually test two browser tabs on the same canvas and confirm one tab adding/moving nodes updates the other.
