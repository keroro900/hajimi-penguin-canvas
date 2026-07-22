# LLM Rounded Focus Border Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the rectangular focus outline that breaks the LLM card's rounded selected border.

**Architecture:** Keep visual selection on the painted `.t8-smart-node-card`. Prevent non-actionable `SmartNodeShell` callers from injecting a focus stop, while preserving the shell's existing `onKeyboardActivate` focus behavior.

**Tech Stack:** React 19, TypeScript, Node test runner.

---

### Task 1: Remove the non-actionable LLM shell focus stop

**Files:**
- Modify: `src/components/nodes/LLMNode.tsx:707-715`
- Create: `tests/llmNodeBorderGeometry.test.ts`

- [ ] Add a source regression test that rejects `tabIndex` inside `SmartNodeShell.rootProps` and preserves conditional shell focusability for `onKeyboardActivate`.
- [ ] Run `node scripts/run-tests.cjs tests/llmNodeBorderGeometry.test.ts` and verify RED on LLM's current `tabIndex: 0`.
- [ ] Remove the LLM caller's `tabIndex: 0` without changing drag/drop props or nested controls.
- [ ] Re-run focused smart-node and theme tests, type checking, build, and browser computed-style verification.
