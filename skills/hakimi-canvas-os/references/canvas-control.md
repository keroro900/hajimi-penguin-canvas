# Canvas Control

## Trigger

Use this module when an agent must read a Hakimi canvas, add/update/connect nodes, focus the viewport, preview changes, show visible progress, or expose canvas control to Codex, Claude, LangGraph, browser agents, and local scripts.

## Workflow

1. Read capabilities with `hakimi_get_capabilities` when node types, ports, or node data rules are uncertain.
2. Read a compact state with `hakimi_canvas_snapshot` before changing it. Use `hakimi_canvas_get` only when full raw node data is needed.
3. For multi-node work, build a `CanvasPlan` and submit it through `hakimi_canvas_apply_plan`.
4. Use `hakimi_agent_run_actions` for small repairs, manual preview sequences, or single-purpose edits.
5. Preview layout-sensitive changes with `preview_node` and `focus_viewport`.
6. Commit small atomic actions when not using a plan: `add_node`, `update_node`, `connect_edge`.
7. Call `hakimi_canvas_verify_plan` or read the canvas again and verify ids, positions, node count, edge count, and important node data.

## CanvasPlan Fast Path

Use this shape when a task creates a visible workflow:

```json
{
  "title": "服装二开工作流",
  "goal": "基于参考印花生成 4 个童装变体",
  "nodes": [
    { "id": "analysis-1", "type": "text", "position": { "x": 100, "y": 100 }, "data": { "label": "素材分析", "text": "..." } },
    { "id": "variant-a", "type": "image", "position": { "x": 480, "y": 100 }, "data": { "label": "变体 A", "prompt": "...", "model": "gpt-image-2" } }
  ],
  "edges": [{ "source": "analysis-1", "target": "variant-a" }],
  "runNodeIds": ["variant-a"],
  "focusViewport": { "x": 260, "y": 120, "zoom": 0.85 }
}
```

Submit with `mode: "preview"` to show planned nodes without writing them, or `mode: "commit"` to write nodes, emit `run_node`, focus the viewport, and receive verification.

## Accuracy Rules

- Keep action payloads explicit: ids, node types, positions, source/target handles, labels, prompts, and model settings.
- Use stable ids for important nodes so later agents can update them.
- Text nodes should set both `data.prompt` and `data.text`.
- Displayable image generation cards should use `type: "image"` with `data.prompt`, model settings, and `data.imageUrl`/`data.imageUrls` when a result exists.
- Use `type: "upload"` mainly for static imported/reference assets.
- If an action fails, stop and read back the canvas before trying a repair.
- Prefer plan batches over many tiny MCP calls when the user asks for a full workflow; this keeps Codex control fast and easier to verify.

## HTTP Equivalent

Non-MCP agents can call:

```http
POST /api/agent/canvas/actions
GET /api/agent/canvas/snapshot/:canvasId
POST /api/agent/canvas/plans/apply
POST /api/agent/canvas/plans/verify
GET /api/agent/canvas/runs/:runId/events
GET /api/canvas/events
```

The action protocol is the shared bridge for Codex, Claude, LangGraph, browser agents, and local scripts.
