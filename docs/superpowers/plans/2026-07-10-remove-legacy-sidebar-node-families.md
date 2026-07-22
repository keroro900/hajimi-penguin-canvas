# Remove Legacy Sidebar Node Families Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the RH, FAL toolbox, Grok OAuth, Codex CLI, inspiration, and ComfyUI node families from the product and codebase.

**Architecture:** Delete the target node metadata, category groups, Canvas render registrations, node components, and feature-specific client/server modules. Preserve only shared provider plumbing that is still called by remaining core nodes, notably FAL support in the image and video nodes. Remove tests that exclusively cover deleted features and add a registry regression test that rejects every removed category and type.

**Tech Stack:** React, TypeScript, Express, Node.js test runner.

---

## Chunk 1: Registry And Canvas Surface

### Task 1: Prove the removed node families are currently exposed

**Files:**
- Create: `tests/removedSidebarNodeFamilies.test.ts`
- Modify: `src/config/nodeRegistry.ts`
- Modify: `src/components/Canvas.tsx`

- [ ] **Step 1: Write the failing test**

Assert that the six group keys and all removed node types are absent from `NODE_GROUPS`, `NODE_REGISTRY`, and the Canvas-specific node registrations.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/removedSidebarNodeFamilies.test.ts`

Expected: FAIL because the current registry still exposes the target groups and types.

- [ ] **Step 3: Remove the registry and Canvas registrations**

Delete the `rh`, `fal`, `grok`, `codex`, `inspiration`, and `comfyui` metadata/group entries. Remove their lazy imports and `SPECIFIC_NODES` registrations from Canvas, including the private maker loader used only by RH/FAL maker nodes.

- [ ] **Step 4: Run the regression test**

Run: `npm test -- tests/removedSidebarNodeFamilies.test.ts`

Expected: PASS.

## Chunk 2: Feature Modules And Backend Routes

### Task 2: Delete node-specific source and routes

**Files:**
- Delete: `src/components/nodes/RunningHubNode.tsx`, `src/components/nodes/RhConfigNode.tsx`, `src/components/nodes/RHToolsNode.tsx`, `src/components/nodes/RHToolboxNode.tsx`, `src/components/nodes/FalToolboxNode.tsx`, `src/components/nodes/VibeXNode.tsx`
- Delete: `src/components/nodes/GrokOAuthAgentNode.tsx`, `src/components/nodes/CodexCliAgentNode.tsx`, `src/components/nodes/CodexImageConjureNode.tsx`, `src/components/nodes/GenClawNode.tsx`
- Delete: `src/components/nodes/ArtistStyleMasterNode.tsx`, `src/components/nodes/AnimeTagMasterNode.tsx`, `src/components/nodes/ComfyUIStoreNode.tsx`, `src/components/nodes/ComfyUIAppMakerNode.tsx`
- Modify/Delete: only modules exclusively imported by those deleted features, as determined by repository-wide reference checks.
- Modify: `backend/src/server.js` and dedicated route modules that become unreachable.

- [ ] **Step 1: Identify exclusive imports before each deletion batch**

Use `rg -l` to distinguish feature-only modules from shared FAL, media, and canvas utilities.

- [ ] **Step 2: Delete feature-only modules and route registrations**

Remove source files, imports, route mounts, API client methods, type declarations, styles, and MCP capability entries that reference only the removed node families. Keep shared FAL provider support used by `ImageNode` and `VideoNode`.

- [ ] **Step 3: Delete feature-only tests and update cross-feature assertions**

Remove dedicated test files and replace registry assertions with checks for the remaining feature set.

- [ ] **Step 4: Run type checking and focused test suites**

Run: `npm run type-check` and `npm test -- tests/removedSidebarNodeFamilies.test.ts`.

Expected: both pass with no unresolved imports.

## Chunk 3: Full Regression Verification

### Task 3: Verify no deleted node identifier remains in product code

**Files:**
- Modify: tests only if a remaining source reference is legitimate shared-provider documentation.

- [ ] **Step 1: Search product source for removed node type identifiers**

Run `rg` across `src`, `backend`, `tools`, and `shared`; every result must be either absent or an explicitly retained generic FAL provider capability unrelated to the toolbox node.

- [ ] **Step 2: Run the full validation suite**

Run: `npm run verify`.

Expected: type check, automated tests, and public-source checks pass.

- [ ] **Step 3: Review the final diff**

Confirm only the requested node families and dependencies were removed; preserve unrelated dirty-worktree changes.
