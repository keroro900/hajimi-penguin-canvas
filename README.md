# 哈基米画布 · Hajimi Penguin Canvas

[![Version](https://img.shields.io/badge/version-2.3.8-111827?style=for-the-badge)](package.json)
[![React](https://img.shields.io/badge/React-19-2563eb?style=for-the-badge)](https://react.dev/)
[![Electron](https://img.shields.io/badge/Electron-Desktop-4b5563?style=for-the-badge)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-16a34a?style=for-the-badge)](LICENSE)

哈基米画布是一个面向 AI 创作的节点式画布工作流工具。它把图像生成、视频生成、音频生成、LLM、RunningHub、ComfyUI、扩展 API 平台、本地素材管理和自动化工作流放在同一张无限画布里，用节点、连线、素材卡片和批量任务把创作过程串起来。

你可以把它理解成一个更偏 AI 创作者、工作流玩家和多模型中转站用户的可视化创作台：一张图可以继续接图生图、视频、剪辑、放大、对比、输出；一段文本可以接 LLM、Prompt 优化、批量生图；一个工作流可以沉淀成可复用的节点组。

## 快速入口

| 项目 | 地址 |
|---|---|
| 当前仓库 | <https://github.com/keroro900/hajimi-penguin-canvas> |
| 推荐中转站 | <https://api.skylee9.cloudns.ch/> |
| 联系 QQ | `1479704008` |

## 项目亮点

| 能力 | 说明 |
|---|---|
| 一张画布串完整流程 | 上传、文本、LLM、生图、视频、音频、剪辑、输出、资源库都可以用节点连接 |
| 多模型与多协议适配 | 支持 OpenAI 兼容中转、Images API、Chat 协议、Gemini Native、Veo、Seedance、即梦 CLI 等 |
| 默认服务与扩展平台并存 | 普通用户用默认服务，进阶用户可添加多个扩展 API 平台和模型覆盖 |
| 同步/异步任务兼容 | 适配排队、轮询、网关超时和后台成功回填，减少“上游成功但画布失败”的情况 |
| 素材复用顺手 | 图片、视频、音频、文本都能作为参考素材拖拽、排序、删除、排除和跨节点复用 |
| 桌面端与本地能力 | Electron 桌面端、本地后端、Figma Bridge、Chrome 扩展、Hakimi MCP / CLI |
| 面向批量创作 | 支持数量批量、任务队列、部分成功先显示、组内执行和串联工作流 |

## 适合谁用

- 想把文生图、图生图、图生视频、LLM 改写和素材管理放到一张画布里的人。
- 需要同时使用 New API / OpenAI 兼容服务、RunningHub、ComfyUI、ModelScope、火山引擎、即梦 CLI 等多个上游的人。
- 想要对模型名称、请求协议、同步异步、真实上游模型名做细粒度配置的中转站用户。
- 做电商图、产品图、服装图、视频分镜、短视频素材、Prompt 工作流和批量生成的人。
- 想把常用创作链路保存成节点模板、素材集、工具箱或可复用画布的人。

## 功能总览

### 画布与节点

- 基于 `@xyflow/react` 的无限画布，支持缩放、拖拽、连线、框选、复制粘贴、撤销重做、迷你地图和快捷键。
- 核心节点覆盖上传、文本、LLM、图像、视频、音频、Seedance、RunningHub、ComfyUI、批处理、循环、素材集、输出、画板、宫格、3D 全景、图像对比、视频剪辑等。
- 节点支持卡片模式和面板模式，上游素材可用缩略图预览、排序、删除、排除、拖拽复用。
- 组框支持节点编组、移动联动、组内执行和工作流整理。
- Prompt 输入框支持 `@` 引用上游图像、视频、音频和文本素材。

### 图像生成

- 支持 GPT Image、Nano Banana、Grok Image、Midjourney、Seedream 等图像入口。
- 支持文生图、图生图、多参考图、编辑接口、生成接口和 OpenAI Chat 兼容图像返回。
- 支持尺寸、比例、质量、数量、模型覆盖、上游模型选择和协议选择。
- 适配部分渠道使用 `generations`、部分渠道使用 `edits`、部分渠道走 Chat 的情况。
- 支持异步任务：拿到任务 ID 后继续轮询，后台完成后回填画布。

### 视频生成

- 支持 Veo、Sora、Seedance、即梦 CLI、OpenAI 兼容视频接口和扩展 API 视频模型。
- 支持图片到视频、文本到视频、参考图、参考视频、首尾帧、时长、比例、清晰度和批量数量。
- 可在节点中切换同步/异步模式；选择异步时会按异步协议提交并轮询结果。
- 批量任务中有结果会先显示，不会因为单个失败把整组默认判失败。
- 参考素材使用紧凑缩略图展示，避免视频或图片直接撑满卡片。

### LLM 与 Prompt

- LLM 节点可用于提示词扩写、翻译、结构化、图片理解和批量文本处理。
- 可把文本节点、图片节点、视频节点的内容作为上下文继续传给后续模型。
- Prompt 模板库支持分类、标签、媒体套件和节点右键保存。
- 肖像大师、姿势大师、动漫标签大师、艺术风格大师等节点用于结构化 Prompt。

### 扩展平台

- OpenAI 兼容平台：图像、视频、聊天模型可配置 Base URL、API Key 和模型列表。
- ModelScope：支持图像、LLM、LoRA 管理和模型列表。
- 火山引擎：支持 Seedream、Seedance 等模型。
- Agnes、即梦 CLI、ComfyUI 等作为高级平台接入。
- 默认服务和扩展平台共用模型注册表与请求协议配置，减少前后端硬编码。

### RunningHub 与 RH 工具

- RunningHub 节点可运行个人工作流。
- RH 工具箱支持图像、视频、文本、音频类能力封装。
- 支持素材上传、参数绑定、任务查询、取消、批量并发和结果转存。
- RH 文本参数可绑定画布文本节点或上游文本。

### 素材、资源库与剪辑

- 上传节点支持图片、视频、音频、本地文件和剪贴板素材。
- 素材集节点支持同类素材合并、排序、打散、导入导出和跨画布发送。
- 资源库可保存常用素材、素材集、角色、模板和工作流片段。
- 图像编辑弹窗支持裁剪、蒙版、笔刷、网格和组合图层。
- 视频剪辑节点支持时间线、轨道、字幕、音频、调色、动效、AI 生成片段和导出。
- 宫格剪裁、宫格编辑、图像对比、去背景、高清放大、Topaz、去 AI 水印等工具节点可直接串到生成链路。

### 桌面端与自动化

- Electron 桌面端支持本地后端、自动更新、资源打包和本地文件拖拽。
- Figma Bridge 可把画布素材发送到 Figma 插件。
- Chrome 网页图片反推扩展可把网页图片、提示词或图文结果送回画布。
- Hakimi MCP / CLI 允许外部智能体读取画布、创建节点、连接边、运行节点和调用生成代理。

## 快速开始

### 环境要求

- Node.js 18 或更高版本，推荐 Node.js 20+
- npm 9 或更高版本
- Windows、macOS 或 Linux
- 浏览器建议使用 Chromium 内核

可选依赖：

- ComfyUI：使用 ComfyUI 节点时需要自行启动。
- FFmpeg：视频剪辑、转码、帧提取等能力需要 FFmpeg。打包版会携带运行时；源码运行可使用系统 FFmpeg 或项目准备脚本。
- 即梦 CLI：使用即梦 CLI 平台时需要本机登录并配置 CLI 路径。

### 安装依赖

```bash
git clone https://github.com/keroro900/hajimi-penguin-canvas.git
cd hajimi-penguin-canvas
npm install
cd backend
npm install
cd ..
```

### 启动开发模式

```bash
npm run dev
```

开发模式会同时启动：

| 服务 | 地址 |
|---|---|
| 前端 Vite | <http://127.0.0.1:11422> |
| 后端 Express | <http://127.0.0.1:18766> |

Windows 也可以双击：

```text
start-dev.bat
```

### 单独启动

```bash
npm run dev:vite
npm run dev:backend
```

### 桌面端开发

先启动前后端，再启动 Electron：

```bash
npm run dev
npm run electron:dev
```

## 中转站与 API 配置

首次进入画布后，点击右上角设置按钮，按需配置 API Key。配置保存在本地 `data/settings.json`，前端只看到脱敏值，明文只在后端代理中使用。

推荐中转站地址：

```text
https://api.skylee9.cloudns.ch/
```

常见配置方式：

| 配置项 | 推荐填写 | 用途 |
|---|---|---|
| 通用服务 Base URL | `https://api.skylee9.cloudns.ch/` | 默认图像、视频、音频、Suno 等 |
| 通用服务 API Key | 你的中转站 Key | 默认服务请求鉴权 |
| LLM Base URL | 可填同一个中转站地址 | LLM 节点、视觉理解、文本处理 |
| LLM API Key | 你的 LLM Key | 与图像服务可分开计费和限流 |
| 分类 API Key | 按模型分类单独填写 | GPT Image、Nano Banana、MJ、Veo、Grok、Seedance、Suno |
| 默认服务模型覆盖 | 画布模型名映射上游真实模型名 | 适合中转站模型映射和多上游模型 |
| 扩展 API 平台 | 自定义 Base URL / API Key / 模型列表 | 适合多个渠道并行切换 |

### 模型覆盖

如果你的中转站里使用自定义模型名，可以在设置中填写映射。例如：

```text
画布模型：gpt-image-2
上游模型：gpt-image-2-4K
协议：Images API · edits 或 Images API · generations
```

多个上游模型可按换行、逗号或分号分隔。节点里会显示这些上游模型并允许切换。

### 协议选择

不同中转对图像和视频接口的支持不完全一样，模型覆盖里可以指定请求协议：

| 协议 | 适用场景 |
|---|---|
| Images API | 由系统自动判断生成或编辑 |
| Images API · generations | 文生图、无参考图生成 |
| Images API · edits | 图生图、多参考图、图片编辑 |
| OpenAI Chat | 上游把图片或视频结果放在 Chat 返回里 |
| Gemini Native | Gemini 原生图像能力 |
| Video Async | 视频排队、长耗时任务、需要轮询的中转 |

### 同步与异步

图像和视频节点支持同步和异步提交。对于容易排队或耗时较长的上游，建议使用异步。异步模式会先拿任务 ID，再轮询状态；遇到 524、520、522、503、504、429 等临时网关错误时，会继续等待，不会直接把任务判为失败。

## 常用工作流

### 文本到图像

1. 在画布空白处右键添加文本节点或图像节点。
2. 在图像节点里选择模型、比例、清晰度和数量。
3. 填写 Prompt，点击运行。
4. 生成结果会作为输出素材显示，可继续连到视频、编辑、放大、对比或资源库。

### 图生图 / 多参考图

1. 拖入图片或使用上传节点。
2. 将图片连到图像节点。
3. 在 Prompt 中说明保留内容和修改目标。
4. 如果上游要求 edit 接口，可在模型覆盖里选择 `Images API · edits`。

### 图片到视频

1. 上传或生成一张图片。
2. 连到视频节点或 Seedance 节点。
3. 设置模型、时长、比例、清晰度和异步模式。
4. 任务完成后视频会回填到节点，可继续接视频剪辑或输出节点。

### LLM 辅助生成 Prompt

1. 文本节点写需求。
2. 连到 LLM 节点扩写、翻译或结构化。
3. 再连到图像或视频节点。
4. 可用 `@` 引用上游素材，让 LLM 知道参考图、视频或文本上下文。

### RunningHub 工作流

1. 在设置里填写 RunningHub API Key。
2. 添加 RunningHub 节点或 RH 工具箱节点。
3. 填写应用 ID / workflow 配置和参数映射。
4. 上游图像、文本、视频会自动写入对应字段。
5. 输出会转存到本地 `output` 并作为画布素材使用。

### ComfyUI 工作流

1. 启动本机 ComfyUI，默认地址 `http://127.0.0.1:8188`。
2. 在设置里配置 ComfyUI 地址。
3. 导入 workflow JSON 或使用 ComfyUI 应用节点。
4. 绑定 Prompt、图片、宽高、seed 等字段。
5. 运行后结果回填画布。

默认只允许本机 ComfyUI。需要访问远端 ComfyUI 时，请只在可信网络中开启设置里的远端地址开关，或设置环境变量：

```bash
T8_COMFYUI_ALLOW_REMOTE=1
```

## 项目结构

```text
.
├─ src/                         # React 前端
│  ├─ components/               # 画布、设置、弹窗、节点 UI
│  ├─ components/nodes/         # 所有节点实现
│  ├─ services/                 # 前端 API 调用封装
│  ├─ stores/                   # Zustand 状态
│  ├─ utils/                    # 画布、素材、生成、布局等工具
│  ├─ providers/                # 模型定义和前端模型注册
│  └─ styles/                   # Tailwind 与主题样式
├─ backend/                     # Express 后端
│  ├─ src/routes/               # 代理、设置、文件、画布、工具路由
│  ├─ src/providers/            # 扩展平台适配器
│  ├─ src/utils/                # 后端工具
│  └─ src/server.js             # 后端入口
├─ shared/                      # 前后端共享注册表
├─ electron/                    # Electron 主进程、预加载、打包资源
├─ extension/                   # Chrome 网页图片反推扩展
├─ tools/                       # Figma Bridge、Hakimi MCP、运行时说明
├─ resources/                   # 内置资源、LUT、成就媒体等
├─ tests/                       # Node test 回归测试
├─ docs/                        # 设计文档、工作流说明和路线记录
└─ release-notes/               # 历史版本说明
```

## 命令速查

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同时启动前端和后端 |
| `npm run dev:vite` | 只启动前端 |
| `npm run dev:backend` | 只启动后端 |
| `npm run electron:dev` | 启动 Electron 开发壳 |
| `npm run build` | TypeScript 构建与 Vite 打包 |
| `npm run type-check` | TypeScript 类型检查 |
| `npm test` | 运行测试 |
| `npm run verify` | 类型检查、测试和公开包检查 |
| `npm run hakimi:mcp` | 启动 Hakimi MCP 服务 |
| `npm run hakimi:canvas` | 运行 Hakimi Canvas CLI |
| `npm run figma:bridge` | 启动 Figma 本地桥接服务 |
| `npm run dist` | 构建 Windows Electron 安装包 |
| `npm run dist:dir` | 构建未打包的 Electron 目录 |

## 测试与质量检查

运行全部测试：

```bash
npm test
```

运行单个测试文件：

```bash
npm test -- tests/imageModelMapping.test.ts
```

类型检查：

```bash
npm run type-check
```

完整验证：

```bash
npm run verify
```

## Docker 部署

Docker 模式运行 Web 前端和 Express 后端，不包含 Electron 桌面端。

```bash
docker compose up -d --build
```

访问：

| 服务 | 地址 |
|---|---|
| Web | <http://127.0.0.1:18766> |
| 健康检查 | <http://127.0.0.1:18766/api/status> |

容器中的 `localhost` 指容器自身。连接宿主机或其他机器上的 ComfyUI 时，请填写容器可访问的地址。

## Electron 打包

Windows 安装包：

```bash
npm run dist
```

目录构建：

```bash
npm run dist:dir
```

打包会执行前端构建、后端加密准备、运行时归档准备和 Electron Builder。大型运行时与安装包不会提交到 Git，请通过 release 或本地构建产物分发。

## Hakimi MCP / CLI

Hakimi MCP 让 Codex 或其它智能体通过 MCP 工具读取和控制画布，包括创建节点、连接边、运行节点、调用图像/视频生成代理、读取结果 URL 等。

```bash
npm run dev:backend
npm run hakimi:mcp
```

更多说明见：

- `tools/hakimi-mcp/README.md`
- `tools/hakimi-canvas-cli/README.md`

## Figma Bridge

1. 打开 Figma Desktop。
2. 通过 `Plugins -> Development -> Import plugin from manifest...` 导入：

```text
tools/figma-bridge/plugin/manifest.json
```

3. 在 Figma 文件里运行 `T8 Penguin Canvas Bridge`。
4. 回到画布点击发送到 Figma。

素材会先进本机队列，再由 Figma 插件导入。图像会作为图片图层，文本会作为文本图层，视频和音频会作为引用卡片。

## 数据与安全

| 数据 | 默认位置 |
|---|---|
| 设置文件 | `data/settings.json` |
| 画布数据 | `data/` |
| 上传素材 | `input/` |
| 输出素材 | `output/` |
| 缩略图 | `thumbnails/` |

这些目录默认不提交 Git。请不要把 API Key、Cookie、登录态、私有工作流参数、用户素材和生成产物提交到公开仓库。

后端代理负责注入密钥，前端只调用 `/api/*` 或 `/api/proxy/*`。设置接口返回时会脱敏密钥。

## 常见问题

### 推荐中转站怎么填？

在设置里把通用服务 Base URL 填为：

```text
https://api.skylee9.cloudns.ch/
```

然后填写你的 API Key。LLM、图像、视频可以共用这个地址，也可以按分类 API Key 单独配置。

### 为什么上游后台成功，画布却显示 HTTP 524？

524 通常是网关等待上游响应超时，不代表任务一定失败。异步模式下，画布会保留任务 ID 并继续轮询。当前版本已经把 524、520、522、503、504、429 等临时状态当作 pending 处理，避免后台任务成功但画布提前失败。

### 为什么模型名传错？

检查设置里的“默认服务模型覆盖”。画布模型名是 UI 层名称，上游模型名可以在覆盖表里映射。多模型用换行、逗号或分号分隔，节点中可切换实际上游模型。

### 为什么图生图走了错误端点？

不同中转对 Images API 的支持不一致。可在模型覆盖中为模型选择：

- `Images API`
- `Images API · generations`
- `Images API · edits`
- `OpenAI Chat`
- `Gemini Native`

如果渠道只支持某一路径，请显式指定协议。

### 为什么 ComfyUI 远端地址不可用？

默认只允许本机地址，避免误把内网服务暴露给不可信来源。需要远端时，在设置里对该 ComfyUI 配置开启远端地址开关，或设置 `T8_COMFYUI_ALLOW_REMOTE=1`。

### 为什么 Git 里没有输出图片和打包产物？

`output/`、`input/`、`data/`、`dist/`、`dist_electron/`、`release_packages/`、运行时 zip 和本地日志都被 `.gitignore` 排除。源码仓库只保留可复现构建所需文件。

## 联系与支持

| 方式 | 信息 |
|---|---|
| QQ | `1479704008` |
| 中转站 | <https://api.skylee9.cloudns.ch/> |
| 仓库问题 | <https://github.com/keroro900/hajimi-penguin-canvas/issues> |

## 版本与许可证

当前源码版本：`2.3.8`

许可证：MIT

本仓库保留原项目来源和相关致谢；二次发布、修改和分发请遵守原项目许可证及各上游平台服务条款。

原项目入口：<https://github.com/T8mars/T8-penguin-canvas>
