# Group Material Routing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `groupBox` into a bidirectional virtual material boundary that broadcasts inputs to internal entry nodes and exposes pass-through, local, and generated materials through one output.

**Architecture:** Extract geometry-only group membership and canonical material extraction into pure utilities. Build a cached route index from node geometry and edge topology, then let `useUpstreamMaterials` resolve direct and virtual group routes without hidden edges or member-data mutation. A split `groupIn`/`groupOut` dependency graph validates every edge mutation path and prevents virtual feedback cycles.

**Tech Stack:** React 19, TypeScript 5.7, `@xyflow/react`, Zustand, Node's built-in test runner.

**Specification:** `docs/superpowers/specs/2026-07-13-group-material-routing-design.md`

---

## Chunk 1: Pure Routing Foundation

### Task 1: Canonical Geometry-Only Membership

**Files:**
- Create: `src/utils/groupMembership.ts`
- Create: `tests/groupMembership.test.ts`
- Modify: `src/utils/canvasClipboard.ts`
- Modify: `tests/canvasClipboard.test.ts`

- [ ] **Step 1: Write failing membership tests**

Cover inclusive center-in-rectangle bounds, dimension precedence (`measured`, explicit node size, group data size, fallback), exclusion of groups, stable canvas order, and stale `data.memberIds` not granting membership.

```ts
assert.deepEqual(getGroupMemberIds(group, nodes), ['inside', 'boundary']);
assert.equal(getGroupMemberIds(group, nodes).includes('stale-outside'), false);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupMembership.test.ts tests/canvasClipboard.test.ts`
Expected: FAIL because `groupMembership.ts` and geometry-only clipboard behavior do not exist.

- [ ] **Step 3: Implement the shared geometry API**

Export focused helpers:

```ts
export function resolveNodeSize(node: Node, fallback?: { width: number; height: number }): { width: number; height: number };
export function isNodeCenterInsideGroup(group: Node, candidate: Node): boolean;
export function getGroupMemberIds(group: Node, nodes: Node[]): string[];
export function getContainingGroupIds(node: Node, nodes: Node[]): string[];
```

Use geometry only at runtime. Update `getClipboardGroupMemberIds` to delegate to the helper and recompute pasted `memberIds` from remapped geometry.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/groupMembership.test.ts tests/canvasClipboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --check -- src/utils/groupMembership.ts src/utils/canvasClipboard.ts tests/groupMembership.test.ts tests/canvasClipboard.test.ts`

### Task 2: Route Index And Static Entry Discovery

**Files:**
- Create: `src/utils/groupMaterialRouting.ts`
- Create: `tests/groupMaterialRouting.test.ts`
- Modify: `src/config/portTypes.ts`

- [ ] **Step 1: Write failing route-index tests**

Test that internal material edges remove a member from the entry set, external direct edges do not, control-only edges do not, overlapping groups are independent, and `groupBox` accepts/outputs `any`.

```ts
const index = getGroupMaterialRouteIndex(nodes, edges);
assert.deepEqual(index.entryMemberIdsByGroup.get('group-a'), ['entry']);
assert.deepEqual(index.virtualGroupIdsByMember.get('entry'), ['group-a']);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupMaterialRouting.test.ts`
Expected: FAIL because the route-index API is missing and group inputs are empty.

- [ ] **Step 3: Implement signature-based route indexing**

Add geometry and topology signature builders, a small bounded module cache, membership maps, static entry maps, group-input descriptors, and virtual source lookup. Material topology must use edge `data.portType` plus `getNodeInputs`/`getNodeOutputs`, never current result data.

Update the registry to:

```ts
groupBox: { inputs: ['any'], outputs: ['any'] },
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/groupMaterialRouting.test.ts tests/upstreamMaterialsPortFiltering.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --check -- src/utils/groupMaterialRouting.ts src/config/portTypes.ts tests/groupMaterialRouting.test.ts`

### Task 3: Canonical Material Bundles And Recursive Group Output

**Files:**
- Modify: `src/utils/groupMaterialRouting.ts`
- Modify: `tests/groupMaterialRouting.test.ts`
- Modify: `src/components/nodes/useUpstreamMaterials.ts`

- [ ] **Step 1: Write failing bundle tests**

Test node-data extraction for text/image/video/audio fields, material-set slot identity, source metadata preservation, edge port filtering, pass-through-first merge order, trim-only boundary dedupe, plural compatibility fields, group-to-group recursion, and defensive cycle truncation.

```ts
const bundle = resolveGroupOutputBundle('group-b', nodes, edges);
assert.deepEqual(bundle.images.map((item) => item.value), ['input.png', 'local.png', 'result.png']);
assert.deepEqual(bundle.images[0].sourceGroupPath, ['group-a', 'group-b']);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupMaterialRouting.test.ts`
Expected: FAIL on missing extraction, merge, recursion, or compatibility conversion behavior.

- [ ] **Step 3: Implement canonical bundle operations**

Export `collectNodeMaterialBundle`, `filterMaterialBundle`, `mergeGroupMaterialBundles`, `resolveGroupOutputBundle`, `materialBundleSignature`, and `materialBundleToCompatibilityData`. Reuse the existing `Material` field semantics from `useUpstreamMaterials`; preserve direct-node behavior by applying new dedupe only at group boundaries.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/groupMaterialRouting.test.ts tests/upstreamMaterialsPortFiltering.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --check -- src/utils/groupMaterialRouting.ts src/components/nodes/useUpstreamMaterials.ts tests/groupMaterialRouting.test.ts`

---

## Chunk 2: Runtime Integration And UI

### Task 4: Virtual Inputs In `useUpstreamMaterials`

**Files:**
- Modify: `src/components/nodes/useUpstreamMaterials.ts`
- Create: `tests/groupUpstreamMaterials.test.ts`
- Modify: `tests/upstreamMaterialsPortFiltering.test.ts`

- [ ] **Step 1: Write failing hook-integration contract tests**

Assert the hook combines direct sources with virtual group routes, subscribes separately to relevant source data, intersects group-edge kinds with consumer input capabilities, retains edge/source metadata, and updates when membership or an input edge changes.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupUpstreamMaterials.test.ts tests/upstreamMaterialsPortFiltering.test.ts`
Expected: FAIL because virtual route descriptors are not consumed.

- [ ] **Step 3: Integrate the route index**

Keep the public `useUpstreamMaterials(nodeId)` API unchanged. Merge direct incoming materials with group-input sources only when `nodeId` is an entry member; ordinary direct-source ordering and slot behavior must remain unchanged.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/groupUpstreamMaterials.test.ts tests/upstreamMaterialsPortFiltering.test.ts tests/canvasPerformancePhase2.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --check -- src/components/nodes/useUpstreamMaterials.ts tests/groupUpstreamMaterials.test.ts tests/upstreamMaterialsPortFiltering.test.ts`

### Task 5: Group Handles, Summary, And Compatibility Output

**Files:**
- Modify: `src/components/nodes/GroupBoxNode.tsx`
- Create: `tests/groupBoxMaterialRouting.test.ts`

- [ ] **Step 1: Write failing GroupBox contracts**

Test source contains a left `group-in` target handle and existing right `group-out` source handle, output uses canonical recursive resolution, writes `videoUrls` and `audioUrls`, avoids unchanged data writes, and renders compact IN/OUT counts.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupBoxMaterialRouting.test.ts`
Expected: FAIL because `group-in`, plural fields, and canonical group output are absent.

- [ ] **Step 3: Refactor GroupBoxNode**

Replace local membership/collection duplication with shared utilities. Add the target handle, count tooltips/summary, canonical output resolver, signature-guarded compatibility data sync, and derived `memberIds` sync. Keep resize, drag, rename, run, delete, theme, and z-order behavior unchanged.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/groupBoxMaterialRouting.test.ts tests/groupMembership.test.ts tests/groupMaterialRouting.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --check -- src/components/nodes/GroupBoxNode.tsx tests/groupBoxMaterialRouting.test.ts`

---

## Chunk 3: Connection Safety And Canvas Integration

### Task 6: Split-Vertex Cycle And Batch Connection Validation

**Files:**
- Modify: `src/utils/groupMaterialRouting.ts`
- Modify: `tests/groupMaterialRouting.test.ts`

- [ ] **Step 1: Write failing validation tests**

Cover self-group, member-to-own-group, own-group-to-member, group-to-group cycles, pass-through cycles for empty groups, legal acyclic sibling branches, reconnect replacement, and sequential batch acceptance with consolidated diagnostics.

```ts
assert.equal(validateMaterialConnection(nodes, edges, candidate).valid, false);
assert.deepEqual(validateMaterialConnections(nodes, edges, candidates).accepted.map((e) => e.id), ['safe']);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupMaterialRouting.test.ts`
Expected: FAIL because expanded split-vertex validation is missing.

- [ ] **Step 3: Implement authoritative validators**

Build dependency vertices `node:<id>`, `groupIn:<id>`, and `groupOut:<id>`, with `groupIn -> entry`, `groupIn -> groupOut`, and `member -> groupOut`; never add `groupOut -> groupIn`. Export single and sequential batch validators with replacement-edge support and deterministic diagnostics.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/groupMaterialRouting.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --check -- src/utils/groupMaterialRouting.ts tests/groupMaterialRouting.test.ts`

### Task 7: Route Every Canvas Edge Mutation Through One Validator

**Files:**
- Modify: `src/components/Canvas.tsx`
- Modify: `tests/connectionErgonomics.test.ts`
- Create: `tests/groupCanvasConnections.test.ts`

- [ ] **Step 1: Write failing Canvas integration contracts**

Assert connect, reconnect, Shift bulk reconnect, linked paste/duplicate edge restoration, and other local edge insertion paths call the shared validator. Assert group-body drops target `group-in`, invalid batch siblings are skipped without discarding valid edges, and visible edge handles are persisted.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupCanvasConnections.test.ts tests/connectionErgonomics.test.ts`
Expected: FAIL because Canvas still uses separate `isConnectionValid` checks and unchecked bulk insertion paths.

- [ ] **Step 3: Centralize Canvas edge admission**

Create small local adapters for edge styling/port metadata, call `validateMaterialConnection` from preview/connect/reconnect, call `validateMaterialConnections` from bulk and paste paths, and report one skipped-edge diagnostic. Remove group-output duplicate-edge deletion that depends on stale `memberIds`. Resolve drops on group bodies to `{ target: groupId, targetHandle: 'group-in' }`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/groupCanvasConnections.test.ts tests/connectionErgonomics.test.ts tests/canvasClipboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --check -- src/components/Canvas.tsx tests/groupCanvasConnections.test.ts tests/connectionErgonomics.test.ts`

### Task 8: Replace Remaining Membership Duplication And Verify End To End

**Files:**
- Modify: `src/components/Canvas.tsx`
- Modify: `src/utils/groupExecutionPlan.ts` only if needed to consume shared membership input
- Modify: `tests/canvasClipboard.test.ts`
- Modify: `tests/groupMembership.test.ts`

- [ ] **Step 1: Write failing consistency tests**

Prove Canvas group run/delete/drag/copy behavior uses geometry-derived membership and stale cached ids do not affect execution or clipboard expansion. Keep group execution stages based on internal visible edges and do not auto-run upstream groups.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/groupMembership.test.ts tests/canvasClipboard.test.ts tests/groupExecutionPlan.test.ts`
Expected: FAIL wherever duplicated stale-id union behavior remains; if `groupExecutionPlan.test.ts` is absent, run the existing group execution test discovered by `rg --files tests | rg group`.

- [ ] **Step 3: Replace duplicate consumers**

Delegate Canvas membership lookups to `groupMembership.ts`, retain `memberIds` only as a derived cache, and preserve current run/delete/drag semantics. Do not introduce cross-group automatic execution.

- [ ] **Step 4: Run focused regression suite**

Run: `npm test -- tests/groupMembership.test.ts tests/groupMaterialRouting.test.ts tests/groupUpstreamMaterials.test.ts tests/groupBoxMaterialRouting.test.ts tests/groupCanvasConnections.test.ts tests/upstreamMaterialsPortFiltering.test.ts tests/canvasClipboard.test.ts tests/connectionErgonomics.test.ts tests/canvasPerformancePhase2.test.ts`
Expected: PASS.

- [ ] **Step 5: Run type and full verification**

Run: `npx tsc --noEmit --pretty false`
Expected: exit 0.

Run: `npm test`
Expected: exit 0.

- [ ] **Step 6: Browser smoke test**

Run `npm run dev:vite`, then verify node-to-group, group-to-node, group-to-group, disconnect, move in/out, resize, save/load, multi-edge reconnect, and group Run. Confirm there are no hidden edges, no member-local reference mutation, no overlapping handles/text, and no console errors.

- [ ] **Step 7: Final diff audit**

Run: `git diff --check`

Review only intended files, preserve unrelated dirty-worktree changes, and record any pre-existing unrelated test failures separately.
