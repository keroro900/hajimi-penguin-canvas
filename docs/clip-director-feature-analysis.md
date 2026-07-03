# 剪辑台与导演台功能分析

> 生成日期：2026-06-13  
> 范围：先分析剪辑功能与导演台能力，不做 UI 风格重绘。  
> 结论：先做项目内生的轻量剪辑台和导演台骨架，后续再决定是否接入 OpenCut 上游 MIT 代码或做 RunningHub 风格 UI。

## 1. 总结

当前项目已经具备做这两类工作台的基础：

- 后端已有 `ffmpeg` 打包链路，Electron 包会把 `tools/ffmpeg-runtime` 放到 `resources/tools/ffmpeg`。
- 后端已有媒体路径解析器，可以把 `/files/input/*`、`/files/output/*`、资源库文件和本地路径解析为可处理媒体。
- 前端节点数据已经统一使用 `imageUrl`、`videoUrl`、`audioUrl`、`imageUrls`、`videoUrls`、`audioUrls` 等字段。
- `useUpstreamMaterials` 已经能收集上游文本、图片、视频和音频素材。
- 前端已有 `three`、3D 模型预览节点、3D 全景节点和全屏“3D 全景导演台”雏形。

因此第一期不建议直接引入完整外部剪辑器，也不建议直接复用 RunningHub CDN bundle。更稳的路线是：

1. 剪辑台先做“可把画布素材拼成视频”的内建 MVP。
2. 导演台先把现有 3D 全景能力抽象成独立工作台入口。
3. 两者都把结果回写为标准 `OutputNode` / 资源库素材，继续保持画布工作流闭环。

## 2. RunningHub 页面观察

RunningHub 画布左侧有几个和本项目对应的新工作区：

| 工作区 | 观察到的能力 | 对 T8 的启发 |
| --- | --- | --- |
| 导演台 | 3D/2D 切换、保存工程、从画布导入、对象与机位、FOV、镜头距离、灯光、网格、全景、截图、录制视频、机位、快捷键、模型选择 | 不只是一个 3D 节点，而是“镜头/对象/场景”的工作台 |
| 剪辑 | 媒体、音效、文本、设置、导入素材、画布素材、历史记录、我的资产、播放器、草稿参数、底部时间线、轨道控制、吸附/链接/缩放/导出 | 不只是合并视频，而是“素材池 + 时间线 + 导出”的工作台 |
| 资产 / 历史 | 素材回流、历史结果复用 | T8 已有资源库和输出节点，可以直接承接 |

注意：RunningHub 的线上 bundle 即使没有混淆，也不能作为可直接复制的依据。可借鉴交互和信息架构；如果后续接入完整剪辑器，应优先评估 OpenCut 上游源码和许可证，而不是复制线上构建产物。

## 3. 当前项目已有能力

### 3.1 后端

已有基础：

- `backend/src/server.js` 已注册标准 Express 路由，适合新增 `/api/clip`。
- `backend/src/providers/llmMedia.js` 已有 `resolveBundledFfmpeg`、`runFfmpeg`、抽帧和压缩相关逻辑。
- `backend/src/providers/mediaResolver.js` 能将本地输出、输入、资源库文件、data URL、远端 URL 统一解析。
- `backend/src/routes/files.js` 已有上传、输出目录列表、base64 图片保存、缩略图等能力。
- `package.json` 已有 `@ffmpeg-installer/ffmpeg`，打包配置已包含 `tools/ffmpeg-runtime`。

缺口：

- 没有独立剪辑 API。
- 没有项目级 clip JSON 存取。
- 没有 render job / progress / cancel。
- 没有视频转码、图片转视频、音轨混合、字幕烧录的统一封装。

### 3.2 前端

已有基础：

- `src/config/nodeRegistry.ts` 已有视频、音频、素材集、输出、抽帧、首尾帧、3D 模型预览、3D 全景等节点。
- `src/components/nodes/useUpstreamMaterials.ts` 已经能聚合上游素材。
- `src/types/canvas.ts` 已定义媒体字段和扩展 provider 结构。
- `src/components/nodes/Panorama3DNode.tsx` 已经包含全屏导演台、机位、导演镜头、FOV、人物/热点/遮罩、截图输出等大量雏形。
- `src/components/nodes/Model3DPreviewNode.tsx` 已支持 GLB/GLTF/OBJ/STL/FBX/USDZ 预览与快照。

缺口：

- 没有“剪辑台”节点或全屏工作区入口。
- 没有时间线数据结构。
- 没有把多个画布素材按顺序变成一个成片的功能。
- 导演台能力目前主要藏在 `panorama-3d` 节点里，入口和数据模型都不够独立。

## 4. 剪辑台功能拆解

### 4.1 第一阶段：轻量剪辑 MVP

目标：让用户可以从画布选中或连接上游素材，快速生成一个可导出的视频。

建议支持：

- 从上游或选中节点收集图片、视频、音频。
- 自动生成时间线草稿：
  - 图片默认 3 秒。
  - 视频使用原时长。
  - 音频作为背景音轨。
  - 文本可作为字幕轨。
- 基础剪辑参数：
  - 画幅：16:9、9:16、1:1。
  - 分辨率：720p、1080p。
  - FPS：24、30。
  - 图片转场：先做硬切，后续再做淡入淡出。
  - 背景：黑色或模糊填充。
- 后端渲染输出 MP4。
- 渲染完成后生成标准输出：
  - `videoUrl: /files/output/clip_*.mp4`
  - 可一键创建 `OutputNode`
  - 可保存进资源库。

这一阶段不需要完整复杂 UI。可以先用“剪辑台节点 + 弹窗 / 全屏面板”实现：

- 左侧：素材列表。
- 中间：预览播放器。
- 下方：简化时间线。
- 右侧：导出参数。

### 4.2 第二阶段：可编辑时间线

在 MVP 稳定后补齐创作者常用剪辑能力：

- 拖拽调整片段顺序。
- 裁剪视频片段的入点和出点。
- 调整图片持续时间。
- 文本字幕轨：开始时间、结束时间、字体大小、位置、颜色。
- 音频轨：音量、淡入淡出、循环或裁剪。
- 时间线缩放、吸附、分轨锁定。
- 保存草稿。

建议继续保留 T8 自己的数据结构，不把剪辑项目强绑定到某个 UI 库。这样后续即使换成 OpenCut UI，也能复用后端渲染和画布集成。

### 4.3 第三阶段：完整剪辑工作台

后续如果要追 RunningHub 那种剪辑台体验，可以评估两条路：

| 方案 | 优点 | 风险 |
| --- | --- | --- |
| 集成 OpenCut 上游 MIT 源码 | 时间线成熟度更高，能更快接近专业剪辑器 | 需要适配 React 版本、状态结构、样式隔离和打包体积 |
| 自研 T8 轻量时间线 | 和节点画布集成最干净，维护边界清楚 | 功能补齐速度慢 |

推荐先自研 MVP，再评估是否只引入 OpenCut 的时间线思想或上游模块，而不是整包塞入。

## 5. 剪辑台后端建议

新增路由：`backend/src/routes/clip.js`

建议 API：

| API | 用途 |
| --- | --- |
| `POST /api/clip/probe` | 解析素材时长、尺寸、音视频轨信息 |
| `POST /api/clip/draft` | 根据素材列表生成默认时间线草稿 |
| `POST /api/clip/render` | 根据 ClipProject 渲染成 MP4 |
| `GET /api/clip/jobs/:id` | 查询渲染进度，第二阶段再做 |
| `POST /api/clip/jobs/:id/cancel` | 取消渲染，第二阶段再做 |

第一期可以先同步渲染，避免引入任务队列；视频时间较长后再升级 job 模式。

建议数据结构：

```ts
interface ClipProject {
  version: 1;
  title?: string;
  width: number;
  height: number;
  fps: 24 | 30;
  background: string;
  tracks: ClipTrack[];
}

interface ClipTrack {
  id: string;
  kind: 'video' | 'image' | 'audio' | 'text';
  clips: ClipItem[];
}

interface ClipItem {
  id: string;
  sourceUrl?: string;
  text?: string;
  start: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  fit?: 'contain' | 'cover' | 'fill';
}
```

FFmpeg 渲染策略：

- 图片片段：`-loop 1 -t duration -i image` 转成视频流。
- 视频片段：按 `trimStart` / `trimEnd` 裁剪并统一尺寸、FPS、像素格式。
- 串联：使用 `filter_complex concat`。
- 音频：单背景音先 `atrim` + `volume` + `amix`，无音频时加静音轨保证兼容播放器。
- 字幕：第一期可先烧录简单 `drawtext`，如 Windows 字体路径问题复杂，则先延后到第二阶段。
- 输出：`libx264 + aac + yuv420p + faststart`，保存到 `config.OUTPUT_DIR`。

安全边界：

- 只允许解析本项目输入、输出、资源库或明确本地文件路径。
- 远端 URL 如需处理，先下载到临时目录，限制大小和超时。
- 所有临时文件放到系统 temp 下，以 job id 清理。
- ffmpeg 参数必须数组化传给 `spawn`，不要拼接 shell 字符串。

## 6. 剪辑台前端建议

新增文件建议：

| 文件 | 职责 |
| --- | --- |
| `src/components/nodes/ClipStudioNode.tsx` | 画布上的剪辑台节点，收集上游素材、显示草稿摘要、打开工作台 |
| `src/components/clip/ClipStudioModal.tsx` | 全屏或大弹窗工作区 |
| `src/components/clip/ClipTimeline.tsx` | 简化时间线，第一期只排序和调整时长 |
| `src/components/clip/ClipPreview.tsx` | 预览播放器 |
| `src/services/clip.ts` | 调用 `/api/clip/*` |
| `src/utils/clipProject.ts` | 生成草稿、校验项目、计算总时长 |
| `tests/clipProject.test.ts` | 时间线纯逻辑测试 |

节点注册：

- `NodeType` 增加 `clip-studio`。
- `NODE_REGISTRY` 增加“剪辑台”，建议归到 `utility` 或新增 `studio` 分类。
- 端口类型：输入 `text/image/video/audio`，输出 `video`。

输出回流：

- 节点自身写入 `videoUrl`。
- 支持创建 `OutputNode`。
- 支持保存到资源库。

## 7. 导演台功能拆解

### 7.1 当前已有雏形

`Panorama3DNode` 里已经有大量接近导演台的能力：

- 全屏导演台入口。
- 360 全景预览。
- yaw / pitch / fov 调整。
- 机位保存、应用、删除、设默认。
- 导演镜头模式和当前视角模式。
- 目标角色、目标骨骼、构图比例、特写强度、低机位。
- 热点、遮罩、角色、动作规划。
- 截图输出、场景快照、控制图、序列帧素材集。

这说明导演台第一期不必从零做，只需要把这些能力从“3D 全景节点的高级面板”提升为“独立工作台能力”。

### 7.2 第一阶段：导演台 MVP

目标：做一个可以从画布导入素材、摆场景、调镜头、输出截图/控制图的导演台。

建议支持：

- 入口：
  - 保留 `panorama-3d` 节点内入口。
  - 新增“导演台”节点或工具栏入口，后续再决定。
- 导入：
  - 图片作为背景 / 全景贴图。
  - 视频先作为参考素材，不直接进 3D 场景。
  - 3D 模型使用现有模型预览加载能力。
  - 文本作为导演指令。
- 场景：
  - 背景图 / 全景图。
  - 简单角色或 3D 模型对象。
  - 对象列表：显示、锁定、删除、层级。
  - 网格 / 安全框。
- 镜头：
  - yaw、pitch、fov。
  - 镜头预设和机位列表。
  - 截图输出。
- 输出：
  - 当前帧截图：`imageUrl`。
  - 控制图 / 分镜图：`imageUrls` 或素材集。
  - 导演提示词：`text` / `outputText`。

### 7.3 第二阶段：镜头序列和录制

补齐 RunningHub 导演台里更像“拍摄”的能力：

- 镜头序列：
  - 每个镜头保存相机、时长、目标对象、FOV。
  - 支持镜头间插值预览。
- 录制：
  - 浏览器端 `MediaRecorder` 录制 canvas。
  - 或输出帧序列后交给后端 ffmpeg 合成 MP4。
- 灯光：
  - 环境光、方向光、点光源。
  - 亮度、颜色、位置。
- 2D/3D 模式：
  - 2D 模式用于图片分镜和构图。
  - 3D 模式用于模型/全景/相机运动。

### 7.4 第三阶段：导演台项目化

当用户开始长期复用场景后，需要把导演台工程独立保存：

```ts
interface DirectorProject {
  version: 1;
  title?: string;
  assets: DirectorAsset[];
  objects: DirectorObject[];
  cameras: DirectorCamera[];
  shots: DirectorShot[];
  lights: DirectorLight[];
  render: {
    width: number;
    height: number;
    fps: number;
  };
}
```

保存位置可以有两种：

- 轻量：直接存在节点 `data.directorProject`。
- 稳定：后端保存到 `data/director_projects/*.json`，节点只保存 `projectId`。

推荐第一期存在节点 data，第二期再做后端项目文件。

## 8. 导演台前端建议

短期不要重写 `Panorama3DNode`，它已经很大，直接继续塞功能会让维护困难。建议拆出纯逻辑和工作台组件：

| 文件 | 职责 |
| --- | --- |
| `src/components/director/DirectorStudio.tsx` | 独立导演台主组件 |
| `src/components/director/DirectorStage.tsx` | 画面 / canvas / Three 渲染区域 |
| `src/components/director/DirectorObjectPanel.tsx` | 对象列表 |
| `src/components/director/DirectorCameraPanel.tsx` | 机位与镜头参数 |
| `src/components/director/DirectorExportPanel.tsx` | 截图 / 控制图 / 序列导出 |
| `src/utils/directorProject.ts` | 项目结构校验与迁移 |

第一步可以从 `Panorama3DNode` 中抽出可复用函数和类型，而不是一口气重写。

## 9. 导演台后端建议

第一期导演台基本可以不需要后端，只用现有 `/api/files/upload-base64` 保存截图。

第二期再新增：

| API | 用途 |
| --- | --- |
| `POST /api/director/projects` | 保存导演台项目 |
| `GET /api/director/projects/:id` | 读取项目 |
| `POST /api/director/render-video` | 把帧序列合成为视频 |

如果剪辑台已经有 `/api/clip/render`，导演台视频导出可以复用同一套 ffmpeg job 机制。

## 10. 推荐实施顺序

### P0：先做剪辑台 MVP

原因：剪辑台最能立刻补上“多段视频/图片成片”的缺口，并且后端 ffmpeg 已经在项目里。

验收标准：

- 连接 3 张图片，生成一个 9 秒 MP4。
- 连接 2 个视频，按顺序合成一个 MP4。
- 连接 1 个音频，作为背景音混入。
- 输出写回 `videoUrl`，可以接到输出节点。

### P1：整理导演台入口

原因：导演台能力已有，但藏得深，先产品化比重写划算。

验收标准：

- 能从画布素材打开导演台。
- 能保存 3 个机位。
- 能输出当前镜头截图。
- 能把截图作为下游图片素材继续接工作流。

### P2：剪辑台可编辑时间线

验收标准：

- 可拖拽排序。
- 可改每张图片时长。
- 可裁剪视频入点/出点。
- 可保存草稿。

### P3：导演台镜头序列和录制

验收标准：

- 多机位镜头序列。
- 镜头间插值预览。
- 导出短视频。

## 11. 风险与注意事项

- 不建议直接复制 RunningHub CDN bundle；后续若集成 OpenCut，必须从上游源码和许可证出发。
- Windows 下 ffmpeg 字幕字体路径容易踩坑，字幕烧录不要放进第一期核心验收。
- `Panorama3DNode.tsx` 已经很大，导演台继续扩展前应优先拆组件。
- 剪辑渲染可能耗时，应尽快从同步接口升级为 job + progress，但第一期可以先做同步闭环。
- 大文件和远端 URL 要限制大小、超时和临时文件清理。
- 前端预览不必第一期做到完全所见即所得，最终结果以后端 ffmpeg 为准。

## 12. 下一步建议

下一步可以直接进入“剪辑台 MVP 实施计划”，拆成以下任务：

1. 后端新增 `/api/clip/probe` 和 `/api/clip/render`。
2. 增加 `src/utils/clipProject.ts` 和纯逻辑测试。
3. 新增 `ClipStudioNode`，复用 `useUpstreamMaterials` 收集素材。
4. 新增简化剪辑工作台，先支持排序、时长、画幅、导出。
5. 渲染完成写回节点 `videoUrl`，并支持创建输出节点。

