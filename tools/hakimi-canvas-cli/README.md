# Hakimi Canvas CLI 使用说明

Hakimi Canvas CLI 是哈基米画布的命令行控制入口。它通过本地后端 API 控制画布，并且会让用户在画布上看见 agent 的操作过程，包括节点排队、运行、完成和失败状态。

## 前提条件

使用 CLI 前先确认：

- 哈基米画布 Web 后端或桌面端后端已经启动。
- CLI 能访问后端地址，默认是 `http://127.0.0.1:18766`。
- 本机有 Node.js 运行时。

开发仓库内可以直接这样运行：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs --help
```

也可以用 npm script：

```powershell
npm run hakimi:canvas -- --help
```

注意 npm script 后面的 CLI 参数要放在 `--` 后面。

后端启动时会自动准备 CLI 启动器，并绑定当前后端地址。启动日志里会出现类似：

```text
Hakimi Canvas CLI: 已就绪 <data>\hakimi-canvas-cli\hakimi-canvas.cmd
CLI 后端地址: http://127.0.0.1:18766
```

之后可以直接运行这个 `.cmd` 或 `.ps1` 文件，不需要手动补 `--base-url`。

## 连接后端

默认连接：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs status
```

指定后端地址：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs status --base-url http://127.0.0.1:18767
```

也可以用环境变量：

```powershell
$env:HAKIMI_CANVAS_API='http://127.0.0.1:18767'
node tools\hakimi-canvas-cli\hakimi-canvas.mjs status
```

## 桌面端打包后的路径

CLI 会随 Electron 桌面端一起打包到 resources 目录：

```text
resources\tools\hakimi-canvas-cli\hakimi-canvas.mjs
```

桌面端打开后，可以从安装目录附近运行：

```powershell
node resources\tools\hakimi-canvas-cli\hakimi-canvas.mjs status
```

如果桌面端后端使用了其他端口：

```powershell
node resources\tools\hakimi-canvas-cli\hakimi-canvas.mjs status --base-url http://127.0.0.1:18767
```

## 常用命令

查看后端状态：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs status
```

列出画布：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs list
```

查看某个画布快照：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs snapshot <canvasId>
```

运行单个节点，并等待结果：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs run-node <canvasId> <nodeId> --watch
```

运行多个节点：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs run-group <canvasId> <nodeA> <nodeB> <nodeC> --watch
```

从一个或多个节点继续执行下游节点：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs continue-downstream <canvasId> <nodeId> --watch
```

导出一次 agent run 的日志：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs export-run <runId>
```

监听一次 agent run：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs watch <runId>
```

## Agent 标识

默认 agent 标识是 `hakimi-cli`。可以用 `--agent` 指定，这个标识会出现在画布可见活动里：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs run-node <canvasId> <nodeId> --agent codex-agent --watch
```

## 预览与自动模式

`apply` 和 `actions` 支持预览模式：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs apply <canvasId> plan.json --preview
```

预览模式会走 diff/计划校验，不真正提交画布改动。

自动模式：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs apply <canvasId> plan.json --autopilot --watch
```

`--autopilot` 会把 `drivingMode` 设置为 `autopilot`。普通命令默认是 `copilot`。

画布控制默认使用 `approvalPolicy: "never"`，也就是普通读取、预演、提交、验证、运行节点都直接执行；需要关键用户决策时，agent 应该显式发送 `ask_user` 动作，而不是把工具审批当问题抛给用户。

如果要给其他 agent 一个更保守的模式，可以显式传：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs apply <canvasId> plan.json --approval-policy ask_destructive --watch
```

可选值：

- `never`: 默认值，最适合 Codex/Hakimi 画布自动控制。
- `ask_destructive`: 只在高风险或破坏性动作前询问。
- `ask_everything`: 调试或演示时每一步都询问。

## Codex SDK 与工作区 Skills

当前侧栏使用 `@openai/codex-sdk` 作为底层执行器。这个 TypeScript SDK 原生支持：

- `startThread()` / `resumeThread()` 复用真实 Codex thread。
- `runStreamed()` 流式接收 `reasoning`、`agent_message`、`mcp_tool_call`、`command_execution` 等 item。
- 本地图片输入、结构化输出、工作目录、sandbox、approval policy、model 和 reasoning effort 配置。

这个 TypeScript SDK 目前没有公开“回答原生 ask/approval 请求”的 API，也没有公开 `thread/read`、`turn/steer`、`thread/inject_items` 这些 app-server JSON-RPC 通道。因此侧栏仍保留一层很薄的自建问答/记录兼容层：只在关键生成决策、不可逆操作或成本风险时显示 Ask；普通画布工具调用默认放行。

Codex SDK/CDK 运行时会收到 Hakimi Canvas CLI 的可执行说明，因此 Codex 除了使用 Hakimi MCP，也可以在需要脚本化、调试或给非 Codex agent 复用时调用：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs snapshot <canvasId> --base-url http://127.0.0.1:18766
node tools\hakimi-canvas-cli\hakimi-canvas.mjs diff <canvasId> plan.json --base-url http://127.0.0.1:18766
node tools\hakimi-canvas-cli\hakimi-canvas.mjs apply <canvasId> plan.json --approval-policy never --watch --base-url http://127.0.0.1:18766
```

Ask 交互不要由前端写死。Skill 的 `Sidebar Questions` 只是动态问题候选；真正的 `ask_user` 必须由 Codex 按当前用户意图、画布状态、模型成本和不可逆风险生成 2-3 个短选项。

工作区 Skills 的加载规则：

- 只读取当前工作区内的 `.agents/skills/<name>/SKILL.md`，以及项目随包提供的 `skills/<name>/SKILL.md` 画布控制技能。
- 用户在侧栏选择业务 Skill 后，后端会把该 Skill 的 `Sidebar Directions`、`Sidebar Canvas Templates`、`Sidebar Verification` 和正文摘要注入 Codex SDK 的 thread instructions。
- 画布控制类 Skills 默认后台启用，不在业务 Skill 选择区打扰用户。
- 修改或导入 Skill 后，下一轮会按新的 Skill 内容重新注入上下文。

## CanvasPlan 示例

`diff` 和 `apply` 接收 CanvasPlan JSON。

先创建 `plan.json`：

```json
{
  "nodes": [
    {
      "id": "note-1",
      "type": "note",
      "position": { "x": 120, "y": 120 },
      "data": {
        "title": "CLI 创建的节点",
        "text": "这是 agent 通过 CLI 放到画布上的内容。"
      }
    }
  ],
  "edges": [],
  "runNodeIds": ["note-1"],
  "focusViewport": {
    "x": 120,
    "y": 120,
    "zoom": 0.9
  }
}
```

查看计划差异：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs diff <canvasId> plan.json
```

提交计划并让画布可见运行：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs apply <canvasId> plan.json --agent codex-agent --watch
```

## Actions 示例

`actions` 接收动作数组，或者带 `actions` 字段的对象。

创建 `actions.json`：

```json
[
  {
    "type": "note",
    "payload": {
      "message": "准备运行节点"
    }
  },
  {
    "type": "run_node",
    "payload": {
      "nodeId": "image-node-1"
    }
  },
  {
    "type": "focus_viewport",
    "payload": {
      "x": 200,
      "y": 120,
      "zoom": 0.85
    }
  }
]
```

执行动作：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs actions <canvasId> actions.json --agent codex-agent --watch
```

## 获取 canvasId 和 nodeId

先列出画布：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs list
```

再查看快照：

```powershell
node tools\hakimi-canvas-cli\hakimi-canvas.mjs snapshot <canvasId>
```

快照里会包含 `nodes` 和 `edges`。节点 ID 在每个节点的 `id` 字段里。

## 输出格式

大多数命令会输出 JSON。例如 `run-node` 会返回类似：

```json
{
  "success": true,
  "data": {
    "runId": "hakimi-cli-1760000000000-ab12cd"
  }
}
```

如果加了 `--watch`，CLI 会继续监听事件并打印简短进度：

```text
[agent:run_node_status] running
[agent:run_node_status] success
```

## 命令总览

```text
hakimi-canvas status [--base-url <url>]
hakimi-canvas list [--base-url <url>]
hakimi-canvas snapshot <canvasId> [--base-url <url>]
hakimi-canvas diff <canvasId> <plan.json> [--base-url <url>]
hakimi-canvas apply <canvasId> <plan.json> [--preview] [--agent <id>] [--autopilot] [--approval-policy <never|ask_destructive|ask_everything>] [--watch] [--base-url <url>]
hakimi-canvas actions <canvasId> <actions.json> [--preview] [--agent <id>] [--autopilot] [--approval-policy <never|ask_destructive|ask_everything>] [--watch] [--base-url <url>]
hakimi-canvas run-node <canvasId> <nodeId> [--agent <id>] [--watch] [--base-url <url>]
hakimi-canvas run-group <canvasId> <nodeId...> [--agent <id>] [--watch] [--base-url <url>]
hakimi-canvas continue-downstream <canvasId> <nodeId...> [--agent <id>] [--watch] [--base-url <url>]
hakimi-canvas export-run <runId> [--base-url <url>]
hakimi-canvas watch <runId> [--base-url <url>]
```

## 排障

如果看到：

```text
无法连接哈基米画布桌面端后端
```

检查：

- 桌面端或后端是否已启动。
- 端口是否是默认 `18766`。
- 如果端口不同，使用 `--base-url` 或 `HAKIMI_CANVAS_API`。

如果 `run-node` 没有实际产出：

- 确认 `nodeId` 存在。
- 确认画布前端正在打开对应画布。
- 确认该节点本身支持当前运行方式。
- 使用 `--watch` 查看节点是否进入 `running`、`success` 或 `error`。

如果 `continue-downstream` 没有执行节点：

- 确认起始节点有下游连线。
- 用 `snapshot <canvasId>` 查看 `edges` 是否连接到目标节点。
- 多个起点可以一起传入：`continue-downstream <canvasId> <nodeA> <nodeB>`。

## 给其他 agent 调用的建议

推荐流程：

1. `list` 找到目标画布。
2. `snapshot` 读取节点和连线。
3. 用 `actions` 或 `apply --preview` 让用户先看到计划。
4. 用户确认后用 `apply`、`run-node`、`run-group` 或 `continue-downstream` 执行。
5. 使用 `--watch` 等待结果。
6. 用 `export-run <runId>` 保存本次操作记录。
