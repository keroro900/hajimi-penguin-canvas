# T8 画布体验与模板能力改造路线

> 生成日期：2026-06-13  
> 范围：当前项目体验审计、同类成功产品调研、开源项目参考、后续功能路线  
> 说明：本文件用于后续开发排期。当前项目已经存在“工作流模板”入口，后续重点不是从零新增，而是把现有入口升级成更完整的模板 / 食谱中心。

## 1. 当前结论

T8-penguin-canvas 已经具备比较完整的创作画布基础：节点系统、资源库、提示词模板、ComfyUI / RunningHub / FAL 接入、日志面板、快捷键、画布模板、主题系统、Electron 桌面端能力都已经铺好。

下一阶段最值得做的方向不是继续堆节点，而是把现有能力串成更顺手的“创作者工作台”：

- 用户能更快开始：模板、食谱、命令面板、AI 起点。
- 用户能更稳运行：运行前体检、任务队列、结构化错误、保存状态。
- 用户能沉淀资产：结果复盘、资源回流、工作流模板、自定义模板。
- 用户能处理大画布：恢复 viewport、搜索防抖、长列表虚拟化、性能状态可见。

## 2. 现有模板入口确认

项目已经存在工作流模板按钮，位于画布右上工具栏。代码入口：

- `src/components/CanvasToolbar.tsx`
- `src/config/canvasTemplates.ts`

当前内置模板包括：

| 模板 | 当前描述 |
| --- | --- |
| 文生图 | Text -> Image |
| 图生视频 | Text -> Image -> Video |
| LLM 提示词扩写 | Text -> LLM -> Image |
| 三视图分镜 | Text -> 多角度 3D -> 分镜网格 |
| AI 音频 | Text -> Audio |

因此后续不应写成“新增工作流模板功能”，而应写成：

> 升级现有工作流模板下拉为“模板 / 食谱中心”。

建议升级内容：

- 增加搜索、分类、最近使用。
- 展示模板所需 API、所需模型、输入要求、适合场景。
- 将 `docs/workflow-recipes.md` 中的画布食谱转成真实可插入模板。
- 插入前做配置体检，例如缺 API Key、缺模型、RunningHub WebApp ID 未配置。
- 支持用户框选节点后保存为自定义模板。

## 3. 四个子任务发现摘要

### 3.1 当前项目体验审计

已发现项目基础体验较完整，但仍有几个高收益缺口：

- 画布加载失败时不要静默显示空白画布。
- 自动保存需要可见状态。
- 打开画布时恢复上次 viewport。
- 切换画布时增加加载遮罩并锁定交互。
- 大文件上传需要进度、失败重试和非阻塞反馈。
- 资源库搜索需要 debounce、请求取消和 stale guard。
- 资源库长列表需要分页或虚拟滚动。
- 连线失败需要给出明确原因。
- 批量运行需要任务队列或运行面板。
- ErrorBoundary 应默认展示用户友好摘要，技术堆栈折叠。
- SmartImage 应增加骨架屏和失败占位。

相关文件：

- `src/components/Canvas.tsx`
- `src/components/CanvasToolbar.tsx`
- `src/components/Sidebar.tsx`
- `src/components/ResourceLibraryDrawer.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/SmartImage.tsx`
- `src/stores/logs.ts`
- `src/stores/runBus.ts`
- `src/services/api.ts`
- `backend/src/routes/canvas.js`
- `backend/src/routes/resources.js`

### 3.2 成功产品调研

参考产品：

- Miro Canvas / Miro AI
- Figma / FigJam AI
- Canva AI / Magic Design / Magic Studio
- Runway
- ComfyUI
- InvokeAI
- React Flow
- tldraw

共同趋势：

> 成功的无限画布产品都在从“自由画布”升级为“可执行、可协作、可沉淀资产和流程的创作工作台”。

可借鉴方向：

- AI 生成画布 / 流程起点。
- 节点 / 工作流模板库。
- 执行队列、历史、复跑。
- 资产面板 / 结果画廊。
- 智能节点搜索与快捷添加。
- 节点右键菜单与局部操作。
- 自动布局、分组、子流程。
- 画布级 AI 助手。
- 多图层 / 遮罩 / 局部编辑。
- 参考一致性与变体比较。

### 3.3 开源项目调研

参考项目：

| 项目 | 可借鉴点 | 许可证注意 |
| --- | --- | --- |
| Excalidraw | 白板、库素材、导出、协作体验 | MIT |
| React Flow / xyflow | 节点图、右键菜单、自动布局示例 | MIT |
| litegraph.js | 节点搜索、子图、JSON 图结构 | MIT |
| Node-RED | 节点开发方式、部署校验、运行反馈 | Apache-2.0 |
| InvokeAI | 生成工作台、画廊、工作流体验 | Apache-2.0 |
| Langflow | AI 工作流、API / MCP 导出思路 | MIT |
| ComfyUI | queue / history、工作流图、模型管理 | GPL-3.0 |
| n8n | 模板市场、工作流自动化 | Sustainable Use License |
| tldraw | 无限画布 SDK、协作体验 | 自定义 license |
| Flowise | AI Agent 可视化编排 | Apache-2.0 为主，需注意企业限制目录 |

建议只借鉴交互和架构，不直接复制非宽松许可证项目代码。

### 3.4 自由发挥机会点

建议把项目从“节点很多、能力很全”升级为：

> 创作者有一套可复用的工作台记忆。

短期最有收益的功能：

- 食谱一键成画布。
- 运行前体检 / 一键修复。
- 结果复盘卡片。
- 魔法接线候选。
- 画布旅程回顾。

中期壁垒：

- 创作者资产记忆库。
- 工作流包 / 内容包市场。
- 生成可观测引擎。
- 批量导演台。
- 本地工具编排协议。

## 4. 综合优先级

### P0：先做，低风险且体验提升明显

#### 4.1 画布加载失败保护

问题：`getCanvasData` 失败时如果直接进入空白画布，用户会误以为数据丢失。

建议：

- 显示阻塞式错误层。
- 提供重试按钮。
- 提供打开自动备份目录。
- 禁止在加载失败状态下覆盖保存为空画布。

涉及：

- `src/components/Canvas.tsx`
- `backend/src/routes/canvas.js`

#### 4.2 自动保存状态

问题：保存失败目前不够可见，用户不知道画布是否真的保存成功。

建议：

- 工具栏显示保存状态 chip：保存中、已保存、保存失败、离线。
- 保存失败写入日志面板。
- 失败状态提供重试。

涉及：

- `src/components/Canvas.tsx`
- `src/components/CanvasToolbar.tsx`
- `src/stores/logs.ts`

#### 4.3 恢复上次 viewport

问题：后端和保存 payload 已经有 viewport，但加载时没有恢复用户上次视角。

建议：

- 打开画布时调用 `setViewport(data.viewport)`。
- 仅在没有 viewport 的旧画布上使用 fitView。

涉及：

- `src/components/Canvas.tsx`

#### 4.4 升级现有工作流模板为模板 / 食谱中心

问题：现有模板入口已经存在，但模板数量少，缺少搜索、分类、依赖说明和食谱承接。

建议：

- 将 `docs/workflow-recipes.md` 中的食谱转成 `CANVAS_TEMPLATES` 或独立 manifest。
- 模板列表增加分类：基础、图像、视频、音频、LLM、ComfyUI、RH、FAL。
- 模板卡片显示依赖：API Key、模型、后端能力、是否需要本地服务。
- 模板插入前运行依赖检查。

涉及：

- `src/components/CanvasToolbar.tsx`
- `src/config/canvasTemplates.ts`
- `docs/workflow-recipes.md`

#### 4.5 运行前体检

问题：生成失败经常不是创作问题，而是配置、模型、素材类型、远端接口或本地服务问题。

建议：

- 批量运行前检查 API Key。
- 检查节点输入输出类型。
- 检查 ComfyUI / RunningHub / FAL 配置可用性。
- 检查模型是否存在或是否可拉取。
- 检查循环依赖和孤立输入。

涉及：

- `src/utils/topologicalSort.ts`
- `src/config/portTypes.ts`
- `src/stores/runBus.ts`
- `backend/src/providers/*`

## 5. P1：第二批增强

### 5.1 节点搜索命令面板

目标：让用户通过快捷键、双击画布或侧栏搜索快速添加节点。

能力：

- 中文、英文、拼音模糊搜索。
- 最近使用。
- 收藏节点。
- 模板和节点一起搜索。
- 从空白画布位置直接插入。

涉及：

- `src/components/Sidebar.tsx`
- `src/components/RadialNodeMenu.tsx`
- `src/config/nodeRegistry.ts`
- `src/utils/pinyinMatch.ts`

### 5.2 执行队列 / 运行检查器

目标：用户知道当前跑到哪个节点、耗时多久、哪里失败、能否重试。

能力：

- 当前节点、等待中、成功、失败。
- 节点耗时。
- 错误分类。
- 取消当前节点或取消全部。
- 跳转到失败节点。
- 历史任务复跑。

涉及：

- `src/stores/runBus.ts`
- `src/components/TerminalPanel.tsx`
- `src/components/CanvasToolbar.tsx`
- `src/components/Canvas.tsx`

### 5.3 结果复盘卡片

目标：让每次成功生成都能沉淀为可复用资产。

能力：

- 展示模型、prompt、negative prompt、参数、上游素材、耗时。
- 支持再来一版。
- 支持保存为提示词模板。
- 支持保存为资源库素材。
- 支持从结果回填节点。

涉及：

- `src/components/nodes/OutputNode.tsx`
- `src/components/nodes/ImageCompareNode.tsx`
- `src/components/ResourceLibraryDrawer.tsx`

### 5.4 资源库性能优化

建议：

- 搜索输入 200-300ms debounce。
- AbortController 取消过期请求。
- requestId 防止旧结果覆盖新结果。
- 后端 items 支持 limit / offset。
- 前端长列表虚拟滚动或增量加载。

涉及：

- `src/components/ResourceLibraryDrawer.tsx`
- `backend/src/routes/resources.js`
- `src/services/api.ts`

### 5.5 连线失败原因提示

目标：拖线失败时用户知道为什么失败。

原因类型：

- 端口类型不兼容。
- 方向错误。
- 循环依赖。
- 目标端口不接受多个输入。
- 节点当前状态不可连接。

涉及：

- `src/components/Canvas.tsx`
- `src/config/portTypes.ts`

## 6. P2：中长期能力

### 6.1 子工作流 / 宏节点

把一组选中的节点保存为可复用节点或模板。

难点：

- 输入输出端口映射。
- 内部节点参数暴露。
- 执行边界。
- 版本兼容。

涉及：

- `src/components/nodes/GroupBoxNode.tsx`
- `src/utils/sendNodeFragment.ts`
- `src/config/nodeRegistry.ts`

### 6.2 创作者资产记忆库

把资源库、提示词模板、角色设定、成功参数、模型配置、工作流模板统一成个人创作记忆。

第一版可以先用本地 JSON / SQLite 索引，不急着上向量库。

### 6.3 迭代画廊

支持同一 prompt 多结果、A/B/C 对比、收藏最佳版本、从某个版本继续生成。

### 6.4 只读分享包 / 演示模式

先做导出 HTML / JSON + 素材缩略图，不急着做实时多人协作。

### 6.5 本地工具编排协议

统一管理 ComfyUI、Topaz、Figma、Eagle、云盘、本地脚本等桌面端能力。

## 7. 建议第一阶段执行顺序

建议第一阶段只做 5 件事：

1. 画布加载失败保护。
2. 自动保存状态 chip。
3. 恢复上次 viewport。
4. 升级现有工作流模板入口，先把 `workflow-recipes.md` 中 3-5 个食谱转成可插入模板。
5. 做运行前体检雏形，先检查 API Key、后端状态、端口类型、循环依赖。

这组改动收益高，风险相对可控，而且能直接改善用户对“稳定性”和“专业感”的感知。

## 8. RunningHub 页面观察补充

观察页面：

- `https://rhtv.runninghub.cn/projects/canvas/2039605740720701442`

观察重点：

- 左侧一级入口：资产、工作流、历史、导演台、剪辑。
- 节点能力：文本、图片、视频、3D 世界、音频、分镜格子、AI 应用、上传、从作品导入。
- 图片节点工具：全景图、增强、编辑元素、分镜大师、宫格裁剪、3D 相机角度、打光、更多、加入 Agent。
- 视频节点工具：文生视频、图生视频、首帧、首尾帧、全能参考、素材库、分辨率、时长、音频生成、联网搜索增强。
- 剪辑编辑器：媒体、音效、文本、设置、导入素材、画布素材、历史记录、我的资产、播放器、右侧参数、底部时间线、多轨控制、吸附、链接、缩放、导出。
- 导演台：3D / 2D 模式、保存工程、从画布导入、对象与机位、FOV、镜头距离、标准视角、灯光、复位、网格、全景、1080p、截图、录制视频、机位、快捷键。
- 3D 模型库：基础模型、人物、道具、场景、交通工具、我的模型、上传模型。基础模型可见女、男、地形、管道、立方体、球体、斜坡、圆环体等。
- AI 应用广场：广场、我的收藏、我的发布、搜索应用、按数字人 / 图片生成 / 视频生成 / 视频特效 / 二次元 / 风格转换 / 海报 / 音频生成 / 图片处理 / 摄影 / 影视游戏 / 3D 模型等分类浏览。

### 8.1 我们已经有或部分已有

| RunningHub 能力 | T8 当前情况 | 说明 |
| --- | --- | --- |
| 图生视频 / 首尾帧 / 全能参考 | 已有 | `VideoNode`、`SeedanceNode`、`FramePairNode` 已覆盖不少能力。 |
| RH AI 应用接入 | 已有 | `RH超市`、`RunningHub`、`RH钱包应用` 已存在，但入口更偏节点内部或 RH 分组。 |
| ComfyUI 工作流应用 | 已有 | `ComfyUI超市` 和 ComfyUI 工作流配置已存在。 |
| 分镜 / 宫格 | 部分已有 | 有 `GridEditorNode`、字幕条、grid compose、分镜模板，但还不是完整“分镜格子 -> 剪辑时间线”闭环。 |
| 3D 模型预览 | 部分已有 | 有 `3D模型预览`、`Panorama3DNode`、`可视化多角度`，但不是全局 3D 世界。 |
| 导演台 | 部分已有 | `Panorama3DNode` 有“3D 全景导演台”，但只服务全景节点，不是全画布级导演台。 |
| 工作流保存 / 插入 | 部分已有 | 资源库支持工作流片段保存和插入，但没有 RunningHub 那种左侧“工作流”一级入口和市场式浏览。 |
| 历史 | 部分已有 | 有撤销/重做、生成历史、资源库记录，但没有统一任务历史 / 画布历史 / 作品历史面板。 |

### 8.2 我们明显缺少

#### 全局导演台

RunningHub 的导演台不是单个节点，而是一个全屏创作模式。它可以从画布导入素材，然后在 3D / 2D 场景里管理对象、机位、灯光、FOV、镜头距离、截图和录屏。

T8 当前缺口：

- 缺全局 `Director Studio` 入口。
- 缺 3D 场景对象层和机位层。
- 缺对象列表、机位列表、灯光控制。
- 缺“从画布导入素材到导演台”的流程。
- 缺导演台工程保存 / 恢复。
- 缺导演台录制视频能力。

建议优先级：P1。

第一版可以不做完整 3D 引擎，只做：

- 从画布选中图片 / 3D 模型 / 全景节点导入导演台。
- 复用 Three.js 建一个全屏 3D stage。
- 左侧对象与机位列表。
- 底部 FOV、距离、灯光、网格、截图。
- 输出截图或短录屏回到画布。

涉及：

- `src/components/Canvas.tsx`
- `src/components/nodes/Model3DPreviewNode.tsx`
- `src/components/nodes/Panorama3DNode.tsx`
- 新增 `src/components/DirectorStudio.tsx`

#### 内置剪辑时间线

RunningHub 的剪辑不是一个视频节点，而是一个独立剪辑编辑器。它有媒体、音效、文本、设置、时间线、多轨、导出。

T8 当前缺口：

- 缺全局剪辑入口。
- 缺时间线编辑器。
- 缺视频 / 图片 / 音频 / 文本多轨。
- 缺素材从画布进入剪辑器。
- 缺字幕轨、音频轨、封面轨、转场轨。
- 缺导出成品视频。

建议优先级：P1。

第一版建议做轻量剪辑台：

- 从选中的视频 / 图片 / 音频节点发送到剪辑台。
- 先支持顺序拼接、裁剪时长、静音、封面、字幕文本轨。
- 后端用 ffmpeg 合成。
- 输出视频自动生成 Output 节点或保存到资源库。

涉及：

- `src/components/Canvas.tsx`
- `src/components/nodes/VideoNode.tsx`
- `src/components/nodes/AudioNode.tsx`
- `src/components/nodes/OutputNode.tsx`
- `backend/src/routes/*`
- 可新增 `backend/src/tools/ffmpeg/*`

#### 应用广场式节点入口

RunningHub 的 AI 应用不是普通节点列表，而是带分类、搜索、收藏、发布、使用量、封面图的应用广场。

T8 当前缺口：

- `RH超市` 已经有类似能力，但入口在 RH 分组或节点内部，不够像一级能力中心。
- 缺“我的收藏 / 我的发布”。
- 缺跨协议统一应用市场：RH、FAL、ComfyUI、自定义后端协议、用户模板应统一浏览。
- 缺应用卡片预览图、使用统计、依赖检查。

建议优先级：P0 / P1。

可以和现有“工作流模板 / 食谱中心”合并为一个“能力中心”：

- 模板：本地节点模板。
- 应用：RH / FAL / ComfyUI / 自定义协议应用。
- 模型：可拉取模型列表并绑定节点。
- 收藏：用户常用能力。
- 我的发布：用户自定义工具或工作流包。

涉及：

- `src/components/Sidebar.tsx`
- `src/components/CanvasToolbar.tsx`
- `src/components/nodes/RHToolsNode.tsx`
- `src/components/nodes/ComfyUIStoreNode.tsx`
- `src/data/rhToolboxManifest.ts`
- `src/data/falToolboxManifest.ts`

#### 图片节点后处理工具条

RunningHub 图片节点上直接提供全景图、增强、编辑元素、分镜大师、宫格裁剪、相机角度、打光、更多、加入 Agent。

T8 当前缺口：

- 有独立节点和工具节点，但图片节点本身缺少“常用后处理动作条”。
- 用户需要自己找节点或接线，路径更长。
- 缺“从结果图一键进入编辑 / 裁剪 / 分镜 / 打光 / 角度”的快捷链路。

建议优先级：P1。

第一版可在图片节点或输出节点增加快捷动作：

- 发送到图像增强。
- 发送到图像编辑。
- 发送到宫格编辑。
- 发送到图生视频。
- 保存到资源库。
- 加入剪辑台。
- 加入导演台。

涉及：

- `src/components/nodes/ImageNode.tsx`
- `src/components/nodes/OutputNode.tsx`
- `src/components/MaterialContextMenu.tsx`

#### 3D 世界节点

RunningHub 的添加节点里有“3D 世界”，并且导演台里有模型库和场景对象。

T8 当前缺口：

- 有 3D 模型预览和全景节点，但没有明确的“3D 世界”节点。
- 缺基础 3D 几何体、人物、道具、场景、交通工具库。
- 缺上传模型后进入统一 3D stage。

建议优先级：P2。

第一版可新增：

- `3D 世界` 节点：管理一个小型 Three.js 场景。
- 支持导入 GLB / GLTF / OBJ。
- 支持基础几何体。
- 支持截图输出到图像节点。
- 后续再接导演台。

涉及：

- `src/components/nodes/Model3DPreviewNode.tsx`
- 新增 `src/components/nodes/World3DNode.tsx`
- `src/config/nodeRegistry.ts`

### 8.3 更新后的推荐优先级

结合 RunningHub 页面观察，建议把原路线做一次微调：

1. P0：能力中心 / 模板中心升级  
   把现有工作流模板、RH 超市、FAL 工具箱、ComfyUI 超市、自定义协议应用统一成一个可搜索、可收藏、可配置检查的入口。

2. P0：图片 / 输出节点快捷动作条  
   让用户从结果图直接进入增强、编辑、分镜、宫格、图生视频、剪辑台、导演台、资源库。

3. P1：轻量剪辑台  
   先做素材导入、顺序拼接、字幕、音频、导出，不急着做完整专业剪辑。

4. P1：全局导演台 MVP  
   先从画布素材导入、机位、灯光、截图开始，逐步扩展到录屏和 3D 对象库。

5. P2：3D 世界节点  
   独立节点承载 3D 场景，后续可和导演台双向联动。

## 9. 可参考链接

- [Miro Canvas](https://miro.com/canvas/)
- [Miro AI](https://miro.com/ai/)
- [FigJam AI](https://www.figma.com/figjam/ai/)
- [Canva AI](https://www.canva.com/canva-ai/)
- [Runway Product](https://runwayml.com/product)
- [ComfyUI Docs](https://docs.comfy.org/)
- [ComfyUI GitHub](https://github.com/Comfy-Org/ComfyUI)
- [InvokeAI](https://invoke.ai/)
- [InvokeAI GitHub](https://github.com/invoke-ai/InvokeAI)
- [React Flow Examples](https://reactflow.dev/examples)
- [xyflow GitHub](https://github.com/xyflow/xyflow)
- [Excalidraw GitHub](https://github.com/excalidraw/excalidraw)
- [litegraph.js GitHub](https://github.com/jagenjo/litegraph.js)
- [Node-RED GitHub](https://github.com/node-red/node-red)
- [Langflow GitHub](https://github.com/langflow-ai/langflow)
