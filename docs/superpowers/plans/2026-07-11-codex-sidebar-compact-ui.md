# Codex Sidebar Compact UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized Codex sidebar identity and empty-state hero with a compact, canvas-first chat layout.

**Architecture:** Keep all session, Skill, message, and composer behavior intact. Change only the empty-state markup and the sidebar's global-theme CSS so the header and diagnostics become compact, Skills become a small context picker, and the message/composer areas receive the available height.

**Tech Stack:** React, TypeScript, CSS, Node test runner

---

## Chunk 1: Compact Sidebar UI

### Task 1: Lock the compact structure

**Files:**
- Create: `tests/codexSidebarCompactUi.test.ts`
- Modify: `src/components/CodexAgentSidebar.tsx`

- [ ] Write a failing source-level regression test that rejects the mascot hero and oversized greeting while requiring the compact Skill entry.
- [ ] Run `node --test tests/codexSidebarCompactUi.test.ts` and confirm it fails on the current hero markup.
- [ ] Replace the empty-state hero with a small welcome row and compact Skill selector while preserving existing event handlers.
- [ ] Run the focused test and confirm it passes.

### Task 2: Apply the compact visual hierarchy

**Files:**
- Modify: `src/styles/theme-core.css`

- [ ] Add assertions for compact header, diagnostics, main spacing, empty-state, and Skill selector rules.
- [ ] Run the focused test and confirm the CSS assertions fail.
- [ ] Update the sidebar styles using only `--t8-*` theme tokens and responsive constraints.
- [ ] Run the focused test, relevant theme CSS tests, and the production build.

