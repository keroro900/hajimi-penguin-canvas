# Apparel Pack Node Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `apparel-pack` smart node that expands mode-specific apparel generation workflows for套图生成, 服装参考生成, and 灵感模式.

**Architecture:** Put workflow generation in a pure `src/utils/apparelPackPlan.ts` builder with tests, then wrap it with a React smart-card node. The node creates editable canvas nodes and optional `runNodeIds`; every output keeps garment/model consistency through explicit anchors, lineage fields, reference images, and canvas edges.

**Tech Stack:** React, TypeScript, @xyflow/react nodes/edges, existing T8 smart node CSS (`t8-smart-node-card`, `t8-btn`, `t8-select`, `t8-input`), Node test runner.

---

## Chunk 1: Plan Builder

### Task 1: Add Tested CanvasPlan Builder

**Files:**
- Create: `src/utils/apparelPackPlan.ts`
- Create: `tests/apparelPackPlan.test.ts`

- [ ] **Step 1: Write failing tests**

Cover three modes:
- `suite` creates five image nodes, uses a provided model reference and garment references, and runs the front anchor before dependent shots.
- `garment-reference` creates model and flatlay anchors from garment-only references, then derives back/detail shots from those anchors.
- `inspiration` creates an LLM planning node and constrains downstream image prompts through the structured brief.

- [ ] **Step 2: Verify tests fail**

Run: `npm run test -- tests/apparelPackPlan.test.ts`
Expected: FAIL because `src/utils/apparelPackPlan.ts` does not exist.

- [ ] **Step 3: Implement minimal builder**

Export:
- `APPAREL_PACK_NODE_TYPE`
- `APPAREL_PACK_MODE_OPTIONS`
- `DEFAULT_APPAREL_PACK_CONFIG`
- `buildApparelPackPlan(input)`

The builder returns `{ nodes, edges, runNodeIds, focusViewport, summary }` with stable ids based on `packId`.

- [ ] **Step 4: Verify tests pass**

Run: `npm run test -- tests/apparelPackPlan.test.ts`
Expected: PASS.

## Chunk 2: Node UI

### Task 2: Add Smart Card Node With Mode-Specific Panels

**Files:**
- Create: `src/components/nodes/ApparelPackNode.tsx`
- Modify: `src/config/nodeRegistry.ts`
- Modify: `src/components/Canvas.tsx`
- Modify: `src/types/canvas.ts`

- [ ] **Step 1: Write failing wiring tests**

Add assertions that registry, canvas mapping, executable node list, and smart CSS classes include `apparel-pack`.

- [ ] **Step 2: Verify tests fail**

Run the focused test file.

- [ ] **Step 3: Implement node UI**

The node uses global CSS classes and shows separate panels:
- Suite mode: model lock, garment count, shot count, output shot list, preservation level.
- Garment reference mode: target audience, garment type, model policy, flatlay/detail toggles.
- Inspiration mode: creative direction, product channel, audience, LLM planning strength, output count.

- [ ] **Step 4: Register node**

Add to registry, Canvas `SPECIFIC_NODES`, executable set, and `NodeType`.

- [ ] **Step 5: Verify focused tests pass**

Run relevant tests.

## Chunk 3: Execution Integration

### Task 3: Expand And Optional Run

**Files:**
- Modify: `src/components/nodes/ApparelPackNode.tsx`
- Optionally Modify: `src/utils/apparelPackPlan.ts`

- [ ] **Step 1: Write behavior tests for generated data**

Verify plan nodes include `referenceImages`, `sourceUrls`, `sourceNodeIds`, `lineageRole`, `anchorPolicy`, and model defaults accepted by `canvasPlan`.

- [ ] **Step 2: Implement expand action**

Use ReactFlow `addNodes`/`addEdges` for local expansion. Use generated `runNodeIds` through the run bus for `expand-and-run`.

- [ ] **Step 3: Verify**

Run:
- `npm run test -- tests/apparelPackPlan.test.ts`
- `npm run type-check`

## Chunk 4: Final Verification

### Task 4: Full Checks

- [ ] Run `npm run type-check`
- [ ] Run `npm run test -- tests/apparelPackPlan.test.ts`
- [ ] Run broader relevant tests if time allows: `npm run test -- tests/materialSetSmartNode.test.ts tests/imageNodePromptPriority.test.ts`
- [ ] Report any skipped checks explicitly.
