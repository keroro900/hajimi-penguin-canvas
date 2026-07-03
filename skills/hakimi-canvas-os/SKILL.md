---
name: hakimi-canvas-os
description: Use when an agent controls Hakimi canvas through MCP/HTTP, builds visible agent workflows, plans or runs image/video generation, creates apparel second-development flows, or routes reusable design/generation planning modules for Codex and other agents.
---

# Hakimi Canvas OS

Hakimi Canvas OS is the routed entry skill for canvas control, generation workflows, apparel design, and future reusable planning modules. Keep this file loaded as the dispatcher, then read only the reference modules needed for the user's current task.

## Start Here

1. Identify the requested job type from the routing table.
2. Read the matching `references/*.md` file before acting.
3. Choose a driving mode: use `copilot` by default, use `autopilot` only when the user explicitly says not to ask, to continue directly, or gives enough exact constraints.
4. If the task spans multiple areas, read the smallest useful set of references.
5. Use MCP tools when available; use the HTTP action protocol for non-MCP agents.
6. For multi-node work, prefer the plan fast path: `hakimi_canvas_snapshot` -> `hakimi_canvas_diff_plan` -> `hakimi_canvas_apply_plan` -> `hakimi_canvas_verify_plan`.
7. Verify the canvas after each committed batch.
8. Follow the Lovart-style command discipline: use Hakimi MCP/CLI/API as the only canvas execution surface, keep project/thread/record identity explicit, stream visible artifact progress, and never bypass the canvas node model registry.

## Routing Table

| User intent | Read |
| --- | --- |
| Read canvas, add/update/connect nodes, show Codex control, agent progress, non-Codex access | `references/canvas-control.md` |
| Image generation, prompt cards, reference images, gpt-image-2 results, result image nodes | `references/image-workflow.md` |
| Clothing second development, print-to-garment flows, mockups, colorways, e-commerce apparel visuals | `references/apparel-design.md` |
| Multi-step lanes, reusable agent operating procedures, accuracy checkpoints, cross-agent handoff | `references/workflow-planning.md` |
| Visual/design direction, critique, layout, variant planning, prompt/design briefs before generation | `references/design-planning.md` |
| Storyboards, image-to-video, video jobs, async polling, video result placement | `references/video-workflow.md` |
| Commercial art direction, e-commerce美工, model/editorial generation, brand kits | `references/design-planning.md` plus the selected project business skill |

## Sidebar Directions

- `canvas-control` | 画布读取 | 读取画布、定位素材、预览落点并执行可视动作。
- `image-workflow` | 生图节点 | 创建内容完整的 image 节点，通过画布模型运行生成。
- `video-workflow` | 视频分镜 | 规划关键帧、运动 prompt、视频任务和结果回写。
- `apparel-design` | 服装二开 | 从印花到版型、位置、变体 mockup 和商品复核。
- `workflow-planning` | 流程编排 | 拆解复杂任务、设置确认点、验证点和跨 agent handoff。
- `design-planning` | 设计规划 | 明确受众、渠道、风格、构图、约束和评审标准。
- `model-routing` | 模型路由 | 把用户偏好翻译成 image/video 节点参数，区分软偏好和硬约束。

## Sidebar Questions

- `output-type` | 这轮主要输出是什么？ | 图像节点 / 视频节点 / 画布流程 / 复核报告 | 图像节点
- `execution-mode` | 现在要直接执行还是先预览？ | 先预览 / 直接执行 / 只规划 | 先预览
- `missing-source` | 如果引用素材不明确，优先使用哪个来源？ | 当前选中节点 / 上传参考图 / 素材库 / 让用户补充 | 当前选中节点

## Sidebar Canvas Templates

- `visible-workflow` | 可视流程骨架 | read canvas -> phase -> preview_node -> add/update nodes -> connect_edge -> focus_viewport -> readback
- `image-lane` | 生图节点流程 | reference asset -> image node variants -> run_node -> result readback -> review node
- `video-lane` | 视频节点流程 | source image/video -> storyboard -> video node -> status tracking -> result placement
- `plan-fast-path` | 批量计划流程 | snapshot -> CanvasPlan(nodes/edges/runNodeIds/focusViewport) -> diff_plan -> apply_plan -> verify_plan
- `streamed-delivery` | 流式交付流程 | record/thread -> running node -> run events -> artifact URL readback -> review/handoff node

## Sidebar Verification

- `node-content` | 节点内容完整 | 检查新增节点有 prompt/text/model/reference/status 等关键 data
- `lineage` | 来源关系可追溯 | 检查连线、sourceNodeId、referenceImages 和生成参数保留
- `viewport` | 视口定位正确 | 检查 focus_viewport 落在新流程区域且节点不堆叠
- `generation-result` | 生成结果可见 | 检查 imageUrl/videoUrl/imageUrls/videoUrls 和 run 状态
- `thread-record` | 会话记录可复用 | 检查 recordId、threadId、sourceNodeId、result node 和上次选择可追溯

## Always-On Rules

- Read the target canvas before changing it. For compact planning, prefer `hakimi_canvas_snapshot`; use full `hakimi_canvas_get` only when exact raw node data is needed.
- Treat the canvas agent as a command client, not a hidden creator. Use Hakimi MCP first; use Hakimi Canvas CLI for scriptable/debuggable or non-Codex agent flows; use backend HTTP only when MCP is unavailable.
- Prefer `hakimi_canvas_diff_plan` before `hakimi_canvas_apply_plan` for multi-node workflows so the frontend/user can preview planned nodes, edges, layout, and model runs before the committed batch. Use `hakimi_agent_run_actions` for small repairs or hand-authored actions. Pass `drivingMode: "copilot"` for 副驾驶 or `drivingMode: "autopilot"` for 自动驾驶.
- Build a `CanvasPlan` before committing complex work: include `title`, `goal`, stable node ids, `nodes`, `updates`, `edges`, `runNodeIds`, `focusViewport`, and optional `verification` items. Let the backend normalize missing positions, validate edges/run targets, score node quality, and lock image/video model parameters to the canvas registries.
- In 副驾驶 mode, ask the user with an `ask_user` action when intent, destructive changes, model cost, or visual direction is unclear. In 自动驾驶 mode, continue without asking unless the next action is impossible or unsafe.
- Use `phase` actions to show intent understanding, planning, preview, execution, generation, and verification stages.
- Commit small explicit actions: `preview_node`, `focus_viewport`, `add_node`, `update_node`, `connect_edge`, `run_node`.
- Text nodes render `data.prompt`; set both `data.prompt` and `data.text` for compatibility.
- Generated bitmap results should normally be `type: "image"` nodes with `data.prompt`, `data.imageUrl`, `data.imageUrls`, `data.model` or `data.apiModel`, references, and lineage metadata.
- Do not use Codex CLI `image_generation` for canvas image work. To generate, create/update a contentful `type: "image"` node first, then send `run_node` with `{ "nodeId": "<image-node-id>" }` so the canvas node runs its selected model and settings.
- Use `type: "upload"` mainly for static imported/reference assets.
- Preserve source lineage: source node ids, source URLs, exact prompt, model, size, provider, and generation settings.
- Preserve conversation identity: every multi-turn flow should carry recordId/canvasId/threadId when available, and every result node should mention the prompt/source node that produced it.
- Model routing is node-native: soft preferences become node `data.model/apiModel/mainId` values when supported; hard constraints become verification requirements and should fail loudly if the canvas registry cannot satisfy them.
- After changes, call `hakimi_canvas_verify_plan` or read the canvas again and verify node count, edge count, visible result URLs, positions, lineage, model parameters, and important data.

## Extension Pattern

Add future modules as one-level reference files under `references/`, then add one route row above. Good module names describe the domain, for example `brand-planning.md`, `product-photography.md`, `video-storyboard.md`, or `commercial-review.md`.

Each new reference should include:

- Trigger: when this module is needed.
- Workflow: the default operating sequence.
- Canvas node rules: node types, required data fields, and lineage.
- Accuracy rules: what the agent must verify or avoid.
- Handoff rules: how another agent can resume the work.
