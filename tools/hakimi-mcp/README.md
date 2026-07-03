# 哈基米 MCP

哈基米 MCP 把哈基米画布暴露给 Codex。它通过本地 stdio MCP 运行，所有动作最终调用现有画布后端的 `/api/*` 路由。

## 启动

先启动画布后端：

```bash
npm run dev:backend
```

再把 MCP 配到 Codex：

```toml
[mcp_servers.hakimi]
command = "npm"
args = ["run", "hakimi:mcp"]
cwd = "E:\\1\\T8-penguin-canvas-main"
```

默认后端地址是 `http://127.0.0.1:18766`。需要改端口时设置：

```bash
set HAKIMI_BACKEND_URL=http://127.0.0.1:18766
```

也可以在画布的「系统设置」里填写「Hakimi MCP 后端地址」。后端拉起 `codex app-server` 时会把这个地址写入 `HAKIMI_BACKEND_URL`，本地 Codex 通过 MCP 控制服务器画布时直接填服务器后端地址，例如：

```bash
set HAKIMI_BACKEND_URL=http://server-ip:18766
```

如果服务器后端只监听本机，先在本地开 SSH 隧道，再保持默认地址：

```bash
ssh -L 18766:127.0.0.1:18766 user@server
set HAKIMI_BACKEND_URL=http://127.0.0.1:18766
```

MCP 状态检查端口默认是 `http://127.0.0.1:18767/status`，前端顶部状态栏会用它显示 `Codex已连接` / `Codex未连接`。

## 工具

- `hakimi_get_capabilities`: 返回全部节点类型、端口、后端路由分组。
- `hakimi_backend_request`: 调用任意现有 Hakimi backend API，限制为相对 `/api/*` 路径。
- `hakimi_canvas_list`: 列出画布。
- `hakimi_canvas_get`: 读取画布节点、连线和视口。
- `hakimi_canvas_save`: 保存完整画布。
- `hakimi_canvas_add_node`: 添加任意注册节点。
- `hakimi_canvas_update_node`: 修改节点数据或位置。
- `hakimi_canvas_connect`: 创建节点连线。
- `hakimi_canvas_import_asset`: 导入 base64 图片并可放到画布。
- `hakimi_agent_run_actions`: 运行可视化 agent 动作序列，支持 `phase`、`ask_user`、`preview_node`、`add_node`、`update_node`、`connect_edge`、`focus_viewport`，前端会显示 Codex/agent 正在控制画布。
- `hakimi_canvas_snapshot`: 读取紧凑画布快照，包含节点/连线数量、视口、节点摘要、结果 URL 和 lineage 线索。
- `hakimi_canvas_diff_plan`: 预演 CanvasPlan，不改画布，返回校验结果、自动布局后的位置、节点/连线/运行摘要。
- `hakimi_canvas_apply_plan`: 批量应用 CanvasPlan，支持 `nodes`、`updates`、`edges`、`runNodeIds`、`focusViewport`，并返回验证结果。
- `hakimi_canvas_verify_plan`: 根据当前画布回读验证 CanvasPlan。
- `hakimi_canvas_generate_image`: 调用图像生成代理。
- `hakimi_canvas_generate_video`: 提交视频生成任务。
- `hakimi_canvas_run_codex_agent`: 调用现有 Codex CLI 创作者 Agent 后端。

## Agent 动作协议

推荐 Codex、Claude、LangGraph 或其他 agent 按任务复杂度选择：

- 完整工作流：`hakimi_canvas_snapshot` -> `hakimi_canvas_diff_plan` -> `hakimi_canvas_apply_plan` -> `hakimi_canvas_verify_plan`
- 小步修补：`hakimi_agent_run_actions`

底层会调用：

```http
POST /api/agent/canvas/actions
GET /api/agent/canvas/snapshot/:canvasId
POST /api/agent/canvas/plans/diff
POST /api/agent/canvas/plans/apply
POST /api/agent/canvas/plans/verify
GET /api/agent/canvas/runs/:runId/events
GET /api/canvas/events
```

最小请求：

```json
{
  "canvasId": "canvas-xxx",
  "agentId": "codex",
  "mode": "commit",
  "drivingMode": "copilot",
  "approvalPolicy": "never",
  "actions": [
    { "type": "phase", "payload": { "phase": "intent", "label": "理解用户意图", "detail": "整理目标、素材和输出约束" } },
    { "type": "ask_user", "payload": { "question": "这次要直接执行还是先预览？", "options": [{ "label": "先预览", "value": "preview" }, { "label": "直接执行", "value": "commit" }], "recommended": "preview" } },
    { "type": "preview_node", "payload": { "position": { "x": 100, "y": 100 }, "type": "text", "label": "准备添加节点" } },
    { "type": "add_node", "payload": { "id": "agent-note-1", "type": "text", "position": { "x": 100, "y": 100 }, "data": { "text": "Codex 已接管画布" } } },
    { "type": "focus_viewport", "payload": { "x": 100, "y": 100, "zoom": 0.9 } }
  ]
}
```

批量计划请求：

```json
{
  "canvasId": "canvas-xxx",
  "agentId": "codex",
  "mode": "commit",
  "drivingMode": "autopilot",
  "approvalPolicy": "never",
  "plan": {
    "title": "服装二开工作流",
    "goal": "基于参考印花生成 4 个童装变体",
    "nodes": [
      { "id": "analysis-1", "type": "text", "position": { "x": 100, "y": 100 }, "data": { "label": "素材分析", "text": "..." } },
      { "id": "variant-a", "type": "image", "position": { "x": 480, "y": 100 }, "data": { "label": "商业款", "prompt": "...", "model": "gpt-image-2", "apiModel": "gpt-image-2-all" } }
    ],
    "edges": [{ "source": "analysis-1", "target": "variant-a" }],
    "runNodeIds": ["variant-a"],
    "focusViewport": { "x": 280, "y": 120, "zoom": 0.85 }
  }
}
```

准确率建议：

- 完整流程先 `hakimi_canvas_snapshot` 读状态，再 `hakimi_canvas_apply_plan` 批量提交。
- 默认用 `approvalPolicy: "never"` 让画布 MCP 普通读取、预演、应用、验证和运行节点保持流畅；需要用户决定时显式发送 `ask_user`。
- 默认用 `drivingMode: "copilot"`；用户明确说“不用回答、直接做、自动跑”时再切到 `drivingMode: "autopilot"`。
- 意图不清、会清空/覆盖、会消耗生图额度时，用 `ask_user` 给 2-3 个互斥选项。
- 长流程用 `phase` 标记“理解意图 / 规划 / 预览 / 执行 / 生图 / 验收”，让前端能同步显示。
- 小步提交，每步带稳定 id、节点类型、位置和关键 data。
- 大改先 `preview_node` / `focus_viewport`，再 `commit`。
- 提交后用 `hakimi_canvas_verify_plan` 或重新读回画布，确认节点、连线、URL、prompt 和模型参数。
- 图像/视频流程把参考图、模型、尺寸、prompt、结果 URL 都写进节点 data，方便其他 agent 续跑。

## 安全边界

MCP 只允许访问相对 `/api/*` 路径，不接受外部 URL，不支持 `CONNECT` 等隧道方法。删除画布、删除资源、重写设置等高风险能力仍可通过 `hakimi_backend_request` 触达，所以交给 Codex 前应在对话里明确确认规则。

## 示例

让 Codex 先调用 `hakimi_get_capabilities`，再调用 `hakimi_canvas_list` 和 `hakimi_canvas_get` 理解当前画布。之后可以要求：

```text
读取当前画布，新增一个文本节点、一个图像节点，把文本节点连到图像节点，并把图像节点 prompt 改成赛博风企鹅海报。
```
