# Workflow Planning

## Trigger

Use this module when the user asks for a complex canvas process, a reusable agent workflow, multi-agent handoff, higher accuracy, or a visible step-by-step operating lane before generation.

## Intent and Plan

Represent the user's request as a `CanvasIntent` before changing the canvas:

- goal
- source assets
- output types
- constraints
- missing decisions
- risk level
- recommended driving mode

Then produce a `CanvasPlan`:

- stages
- nodes to create or update
- edges to connect
- generation calls
- confirmation points
- verification checks

For Hakimi MCP, encode the executable subset as:

- `nodes`: stable-id nodes with type, position, and complete data.
- `updates`: node patches for existing nodes.
- `edges`: source/target relationships.
- `runNodeIds`: image/video/seedance nodes that should trigger their own generation.
- `focusViewport`: the viewport after the batch.

Use `phase` actions to show the plan progressing on the frontend.

For speed and reliability, prefer `hakimi_canvas_diff_plan` before `hakimi_canvas_apply_plan` for the executable batch, then `hakimi_canvas_verify_plan` afterward. Use `hakimi_agent_run_actions` only when you need a custom hand-authored sequence.

The backend plan layer will:

- validate stable node ids, edge endpoints, and runnable `runNodeIds`
- auto-layout nodes when positions are missing
- lock image/video/seedance data to the canvas model registries
- emit a plan diff before execution
- score node quality and run skill verification checks during readback

## Lovart-Inspired Command Discipline

Use this discipline for smooth Codex-level canvas control:

- One execution surface: do not call raw provider APIs from the model. Use Hakimi MCP, Hakimi Canvas CLI, or the backend agent canvas HTTP protocol.
- One project context: carry `canvasId`, `recordId`, and available Codex thread id through every run so follow-up messages do not feel stateless.
- One task per active turn: if a record is running, steer or wait when the platform supports it; otherwise append the user's instruction to the same record and continue in the same thread after the current run.
- One source of truth for model parameters: image/video/seedance node data, locked by the canvas model registry.
- Watchable progress: emit `phase`, `preview_node`, `add_node`, `run_node`, and verification events so the user can see the agent moving, not just waiting.
- Cost gates: use `ask_user` only for real cost/risk choices such as high-cost video, destructive overwrite, or multiple expensive variants.
- Artifact readback: after each generation, read the canvas and attach `imageUrl`, `videoUrl`, local/CDN URLs, prompt, model, and source ids to the same lineage.

## Driving Modes

- `copilot` / 副驾驶: default. Ask only through explicit `ask_user` before expensive generation, irreversible edits, or unclear design direction.
- `autopilot` / 自动驾驶: use only when the user says to proceed directly, says no need to answer, or gives exact enough requirements.
- `approvalPolicy: "never"`: default for Hakimi MCP canvas control so ordinary snapshot, diff, apply, verify, and run-node calls stay fluid.
- `approvalPolicy: "ask_everything"`: use for high-risk or user-guided sessions.
- `approvalPolicy: "ask_destructive"`: use only when the user explicitly wants guarded/destructive confirmation behavior.

When asking, send an `ask_user` action with `question`, `options`, and a recommended option. Keep options short and mutually exclusive.

## Default Lane Pattern

1. Reference/source inputs.
2. Intent brief.
3. Constraint checklist.
4. Variant plan.
5. Runnable generation nodes.
6. Generated result nodes.
7. Review and decision notes.
8. Next-action or handoff node.

## Accuracy Pattern

- Read before writing with `hakimi_canvas_snapshot`, preview with `hakimi_canvas_diff_plan`, then verify after writing with `hakimi_canvas_verify_plan`.
- Keep one source of truth for each prompt: usually the runnable image/video node.
- Add lineage fields rather than relying on visual proximity.
- Use small batches so frontend events feel live.
- For multi-asset design tasks, generate a deliverable manifest first: asset role, source refs, model node, required ratio/size, and verification criteria.
- Soft model preference: set preferred `data.model/apiModel` if available. Hard model requirement: ask or fail before running if the node registry cannot satisfy it.
- When multiple agents can operate, include stable node ids and exact resume instructions in node data.
- For destructive edits, create a preview or note first.

## Cross-Agent Handoff

Other agents should use the same shared protocol:

```http
POST /api/agent/canvas/actions
GET /api/agent/canvas/snapshot/:canvasId
POST /api/agent/canvas/plans/diff
POST /api/agent/canvas/plans/apply
POST /api/agent/canvas/plans/verify
GET /api/agent/canvas/runs/:runId/events
GET /api/canvas/events
```

MCP agents should prefer `hakimi_canvas_diff_plan` then `hakimi_canvas_apply_plan` for full workflows and `hakimi_agent_run_actions` for small action sequences; non-MCP agents can send equivalent HTTP calls.
