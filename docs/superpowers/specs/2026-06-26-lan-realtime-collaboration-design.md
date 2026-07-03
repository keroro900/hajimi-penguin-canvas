# LAN Realtime Collaboration Design

## Goal

Enable multiple LAN users to edit the same or different canvases at the same time. Changes on one client should appear on other clients that are viewing the same canvas, while clients on other canvases remain isolated.

## Scope

This design targets a practical collaboration layer, not full Figma-grade CRDT editing. The first version supports operation-based sync for common canvas edits and uses last-write-wins for conflicts. It keeps the current JSON canvas persistence and adds a realtime layer around it.

## Architecture

The backend owns a WebSocket hub that groups clients by `canvasId`. The frontend converts local canvas changes into small canvas operations, sends them to the hub, applies remote operations from the hub, and keeps the existing debounced save path as the durable snapshot.

Core pieces:

- `src/utils/canvasRealtime.ts`: shared operation schema and pure apply/diff helpers.
- `backend/src/realtime/canvasHub.js`: WebSocket room management, operation validation, fanout, heartbeat, and metrics.
- `backend/src/server.js`: HTTP server upgrade wiring for `/api/canvas/realtime`.
- `src/services/canvasRealtime.ts`: browser WebSocket client wrapper.
- `src/components/Canvas.tsx`: local operation emission and remote operation application.

## Data Flow

Clients connect to `/api/canvas/realtime?canvasId=<id>&clientId=<id>`. The server acknowledges the session, joins the client to the canvas room, and broadcasts presence to that room.

Each operation contains `opId`, `canvasId`, `clientId`, `type`, `payload`, and `createdAt`. Supported first-version operations include:

- `node:add`
- `node:update`
- `node:remove`
- `nodes:replace`
- `edge:add`
- `edge:remove`
- `edges:replace`
- `viewport:update`
- `canvas:snapshot`

The server does not broadcast an operation back to the sender. Other clients apply the operation locally and the existing debounced persistence writes snapshots to disk. If an operation cannot be expressed safely, the sender can send `canvas:snapshot` as a fallback.

## Conflict Model

The first version uses last-write-wins at node and edge identity level. Different canvases are independent rooms. Two users changing different nodes merge cleanly. Two users changing the same node may overwrite the same field, but the app remains consistent.

Future upgrades can add node locks, field-level versions, or Yjs without changing the outer room/session shape.

## Performance

Realtime traffic is lightweight because operations are small JSON messages. Drag and viewport updates must be throttled on the frontend. Durable saves remain debounced. Large media should continue to flow through existing file routes and be referenced by URL instead of embedded as base64.

Expected LAN usage of dozens of clients across multiple canvases is reasonable for a single Node process, provided drag updates are throttled and snapshots are used sparingly.

## Testing

Tests cover pure operation application first, then static wiring checks for the WebSocket hub and frontend client. Full browser-level concurrency can be added later with Playwright when the feature is stable.
