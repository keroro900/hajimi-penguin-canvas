# Hakimi MCP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Hakimi MCP server that exposes the canvas, node catalog, generation routes, files, settings, resources, and every backend API route to Codex.

**Architecture:** Add an isolated `tools/hakimi-mcp` package with a small MCP stdio server. Keep all canvas behavior behind HTTP calls to the existing backend, and expose both semantic canvas tools and a generic backend API bridge so new canvas features become reachable without rewriting the MCP server.

**Tech Stack:** Node.js ESM, `@modelcontextprotocol/sdk`, `zod`, existing Express backend routes, Node built-in test runner.

---

## Chunk 1: MCP Core

### Task 1: Tool Manifest And Backend Client

**Files:**
- Create: `tools/hakimi-mcp/src/canvasCatalog.mjs`
- Create: `tools/hakimi-mcp/src/backendClient.mjs`
- Create: `tools/hakimi-mcp/src/tools.mjs`
- Test: `tests/hakimiMcp.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- node catalog includes every `NODE_REGISTRY` type and ports from `NODE_PORTS`
- generic backend bridge rejects non-API paths and unsafe methods
- tool manifest includes semantic canvas tools and `hakimi_backend_request`

- [ ] **Step 2: Run tests to verify red**

Run: `npm test -- tests/hakimiMcp.test.ts`

- [ ] **Step 3: Implement minimal catalog/client/tool manifest**

Parse the TypeScript registry text conservatively for static metadata, define backend request validation, and export tool definitions.

- [ ] **Step 4: Run tests to verify green**

Run: `npm test -- tests/hakimiMcp.test.ts`

### Task 2: MCP Stdio Server

**Files:**
- Create: `tools/hakimi-mcp/src/server.mjs`
- Create: `tools/hakimi-mcp/package.json`
- Modify: `package.json`
- Test: `tests/hakimiMcp.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- package name is `hakimi-mcp`
- root script can launch the MCP server
- server registers every tool in the manifest

- [ ] **Step 2: Run tests to verify red**

Run: `npm test -- tests/hakimiMcp.test.ts`

- [ ] **Step 3: Implement stdio server**

Use `McpServer`, `StdioServerTransport`, and tool handlers from `tools.mjs`.

- [ ] **Step 4: Run tests to verify green**

Run: `npm test -- tests/hakimiMcp.test.ts`

### Task 3: Docs And Verification

**Files:**
- Create: `tools/hakimi-mcp/README.md`
- Modify: `README.md`

- [ ] **Step 1: Write docs**

Document Codex config, backend URL, tool list, safety model, and example commands.

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- tests/hakimiMcp.test.ts`

- [ ] **Step 3: Run type check**

Run: `npm run type-check`

- [ ] **Step 4: Run package build sanity**

Run: `npm run build`
