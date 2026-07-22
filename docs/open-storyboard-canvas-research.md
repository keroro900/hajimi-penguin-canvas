# open-storyboard-canvas 全景工作台调研

> 调研日期：2026-07-07
> 调研对象：[ganbo-gab/open-storyboard-canvas](https://github.com/ganbo-gab/open-storyboard-canvas)
> 调研目的：为本项目「导演台 / 3D 全景导演台」节点的 bug 修复与架构优化寻找可借鉴的开源实现。
> 调研方式：克隆仓库到本地逐文件阅读，非联网摘要。

---

## 1. 项目概况

### 1.1 基本信息

| 项 | 值 |
|---|---|
| 仓库 | ganbo-gab/open-storyboard-canvas |
| Star / Fork | 205 / 47 |
| 主分支 | main |
| 最近推送 | 2026-06-28 |
| 主语言 | TypeScript（3.16 MB）+ Rust（0.28 MB，Tauri 后端） |
| 许可证 | MIT（基于 henjicc/Storyboard-Copilot 二次开发，需保留原作者署名） |
| 描述 | 开源的 AI 分镜与导演台画布，支持全景图、摄像机控制、提示词预设和自定义供应商调用 |

### 1.2 技术栈

- **画布**：`@xyflow/react`（与本项目一致，React Flow）
- **桌面端**：Tauri（Rust + WebView），本项目用 Electron
- **3D**：原生 `three`（**未用** @react-three/fiber / drei）
- **全景查看**：`@photo-sphere-viewer/core`（独立库，非自己手写球体）
- **2D 画布**：`konva` + `react-konva`
- **状态**：`zustand`
- **i18n**：`i18next`
- **图片裁切**：`react-easy-crop` + `react-image-crop`

### 1.3 分层架构

采用 DDD 风格分层，比本项目扁平的 `components/nodes/` 更工程化：

```
src/features/canvas/
├── Canvas.tsx                  # 画布入口
├── application/                # 应用服务（纯逻辑，无 UI）
│   ├── panoramaNormalize.ts    # 全景图归一化（21:9 → 2:1 / 4:1）
│   ├── panoramaPrompt.ts       # 全景提示词构造
│   ├── directorStudioPanoramaImport.ts
│   ├── canvasServices.ts       # AI 网关
│   ├── imageData.ts            # 图片 URL 解析
│   └── ports.ts                # 端口定义
├── domain/                     # 领域模型（纯类型 + 常量）
│   ├── canvasNodes.ts          # 所有节点 schema（754 行）
│   ├── directorStudioBodyControls.ts
│   └── directorStudioModelCatalog.ts
├── infrastructure/             # 基础设施
├── ui/                         # UI 组件
│   ├── BlueprintScene.tsx              # 3D 视口（1993 行，含全景模式）
│   ├── DirectorStudioShell.tsx         # 导演台外壳（4377 行）
│   ├── CameraControlPanel.tsx
│   ├── CameraSphereControl.tsx         # 球面相机控制器
│   ├── LightingControlPanel.tsx
│   ├── LightingSphereControl.tsx       # 球面灯光控制器
│   ├── CameraPresetsPanel.tsx          # 相机预设库
│   ├── BlueprintPoseEditor.tsx
│   ├── blueprintMeshFactory.ts         # 过程化人物（1845 行）
│   └── blueprintGltfFactory.ts         # GLB 人物（426 行）
└── nodes/                      # React Flow 节点组件
    ├── PanoramaNode.tsx        # 全景查看节点（774 行）
    └── BlueprintNode.tsx       # 蓝图节点
```

### 1.4 节点清单

AiAudioNode、AiTextNode、AiVideoNode、AudioNode、BlueprintNode、GroupNode、ImageEditNode、ImageNode、JsonCardNode、PanoramaNode、StoryboardGenNode、StoryboardNode、TextAnnotationNode、UploadNode、VideoNode。

其中与导演台/全景相关：
- **PanoramaNode**：纯全景查看器（photo-sphere-viewer）
- **BlueprintNode**：3D 蓝图/导演台（用 BlueprintScene 渲染）

---

## 2. 全景工作台拆解

该项目的全景能力分成**两个独立节点**，而非融合成一个：

| 节点 | 渲染库 | 全景实现 | 3D 角色 | 录视频 |
|---|---|---|---|---|
| PanoramaNode | `@photo-sphere-viewer/core` | 库自带球体 | 无 | 无 |
| BlueprintNode（BlueprintScene） | 原生 three.js | 自写 `mode:'panorama'` 球体 | 有（GLB+过程化双轨） | 无 |

**关键认知**：photo-sphere-viewer 和 three.js 场景是两套独立渲染，不能把 3D 角色放进 photo-sphere-viewer 里。融合方案是 BlueprintScene 的 `mode:'panorama'`（自写球体），不是用 photo-sphere-viewer。

### 2.1 PanoramaNode（纯全景查看器，774 行）

文件：`src/features/canvas/nodes/PanoramaNode.tsx`

#### 核心 API（photo-sphere-viewer）

```ts
import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';

viewer = new Viewer({
  container,                    // DOM 容器
  panorama: normalizedUrl,      // equirectangular 全景图 URL
  defaultYaw: initialYaw ?? 0,
  defaultPitch: initialPitch ?? 0,
  defaultZoomLvl: initialFov ?? 50,
  minFov: 25,
  maxFov: 110,
  mousemove: enabled,           // 鼠标移动控制
});
```

#### 关键操作

| 操作 | API | 位置 |
|---|---|---|
| 旋转到指定角度 | `viewer.rotate({ yaw, pitch })` | :237-246, :312, :336, :344 |
| 缩放 | `viewer.zoom(level)` | :345 |
| 取当前位置 | `viewer.getPosition()` | :237, :301 |
| 渲染完成事件 | `viewer.addEventListener('ready', fadeIn)` | :204 |
| 请求重绘 | `viewer.needsUpdate()` | :92 |
| 销毁 | `viewer.destroy()` | :169, :274 |

#### 截图实现（值得借鉴）

截图不是裸调 `toDataURL`，而是**先等渲染完成 + 校验非空**：

```ts
// PanoramaNode.tsx:68-135
function getViewerCanvas(viewer): HTMLCanvasElement | null {
  // photo-sphere-viewer 的 WebGL canvas 藏在 renderer.renderer.domElement
  return viewer?.renderer?.renderer?.domElement ?? null;
}

function waitForViewerRender(viewer): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) { done = true; viewer.removeEventListener('render', handleRender); resolve(); }
    };
    const handleRender = () => finish();
    viewer.addEventListener('render', handleRender);
    timeoutId = window.setTimeout(finish, 600);  // 600ms 超时兜底
    viewer.needsUpdate();
  });
}

function assertCanvasHasCaptureContent(canvas): void {
  // 采样 16x16 像素，判断不是全黑才导出
  const sample = document.createElement('canvas');
  sample.width = 16; sample.height = 16;
  const ctx = sample.getContext('2d');
  ctx.drawImage(canvas, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  // 检查是否有非零像素，全黑则抛错
}

async function captureViewerCanvas(viewer): Promise<HTMLCanvasElement> {
  await waitForViewerRender(viewer);              // 等渲染
  const canvas = getViewerCanvas(viewer);
  assertCanvasHasCaptureContent(canvas);          // 校验非空
  return canvas;
}
```

#### 四宫格导出

```ts
// PanoramaNode.tsx:298-339
const yaws = [0, 90, 180, 270];
for (let i = 0; i < 4; i++) {
  viewer.rotate({ yaw: yaws[i] * Math.PI / 180, pitch: 0 });
  const canvas = await captureViewerCanvas(viewer);
  ctx.drawImage(canvas, col * 1024, row * 1024, 1024, 1024);
}
// 加中文标签「前(0°)/右(90°)/后(180°)/左(270°)」
```

#### 全景图归一化（panoramaNormalize.ts，222 行）

AI 生成模型通常只能出 21:9，photo-sphere-viewer 需要 2:1（球）或 4:1（柱）。这个模块做中心裁切 + 左右边缘羽化：

```ts
export type PanoramaProjection = 'spherical' | 'cylindrical';
// spherical → 2:1 equirectangular（全球）
// cylindrical → 4:1 环绕带（部分球）

function targetRatio(projection): number {
  return projection === 'spherical' ? 2 : 4;
}
// 中心裁切到目标比例 + featherPx(默认48) 左右边缘 alpha 羽化，让拼接缝看不出
```

### 2.2 BlueprintScene（融合 3D 视口，1993 行）

文件：`src/features/canvas/ui/BlueprintScene.tsx`

这是真正的「全景工作台」——一个 `mode: 'flat' | 'panorama'` 切换的 3D 舞台。

#### 全景球体（:670-676, :840-892）

```ts
const PANORAMA_SPHERE_RADIUS = 50;

// 场景初始化时创建（默认隐藏）
const panoGeom = new THREE.SphereGeometry(PANORAMA_SPHERE_RADIUS, 48, 32);
panoGeom.scale(-1, 1, 1);                                    // 内贴
const panoMesh = new THREE.Mesh(panoGeom, new THREE.MeshBasicMaterial({
  color: 0xffffff, fog: false,
}));
panoMesh.visible = false;                                     // 默认隐藏
scene.add(panoMesh);

// panorama 模式 + 有 URL 时加载纹理
useEffect(() => {
  if (mode === 'panorama' && panoramaUrl) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(panoramaUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      material.map = tex;
      material.needsUpdate = true;
      panoMesh.visible = true;
      requestRender();
    }, undefined, () => { panoMesh.visible = false; });       // 失败降级
  } else {
    panoMesh.visible = false;
    clearPanoramaMap();
  }
}, [mode, panoramaUrl, requestRender]);
```

#### 球内边界钳制（最值得抄，:235-255）

全景模式下，角色和相机都不能穿出球壁。用球面半径约束：

```ts
const PANORAMA_SPHERE_RADIUS = 50;
const PANORAMA_MAX_CAMERA_DISTANCE = PANORAMA_SPHERE_RADIUS - 5;   // 45
const PANORAMA_CAMERA_RADIUS_LIMIT = PANORAMA_SPHERE_RADIUS - 2;   // 48
const PANORAMA_OBJECT_RADIUS_LIMIT = PANORAMA_SPHERE_RADIUS - 3;   // 47

// 物体钳制：Y 钳制 + 水平半径按 sqrt(r²-y²) 钳制
function clampPanoramaPointAtFixedY(point): void {
  const radius = PANORAMA_OBJECT_RADIUS_LIMIT;
  point.y = THREE.MathUtils.clamp(point.y, -radius, radius);
  const horizontalLimit = Math.sqrt(Math.max(0, radius * radius - point.y * point.y));
  const horizontalLength = Math.hypot(point.x, point.z);
  if (horizontalLength > horizontalLimit && horizontalLength > 0) {
    const scale = horizontalLimit / horizontalLength;
    point.x *= scale;
    point.z *= scale;
  }
}

// 相机钳制：距离钳制 + 目标点半径钳制
function clampPanoramaCameraState(state): void {
  state.distance = THREE.MathUtils.clamp(state.distance, 2, PANORAMA_MAX_CAMERA_DISTANCE);
  const maxTargetRadius = Math.max(0, PANORAMA_CAMERA_RADIUS_LIMIT - state.distance);
  clampVectorToRadiusInPlace(state.target, maxTargetRadius);
}
```

调用点：拖拽物体时（:1025-1028, :1054-1060）、点击地面时（:1291）、相机移动时（:1474）。

#### 灯光系统（:614-619, :777-797）

很简洁，就 AmbientLight + 一个 DirectionalLight，用 yaw/pitch 球面坐标算位置：

```ts
const DEFAULT_LIGHTING = {
  enabled: true,
  mainIntensity: 0.65,
  mainYaw: 35,        // 方位角（度）
  mainPitch: 50,      // 仰角（度）
  mainColor: '#ffffff',
  ambientIntensity: 0.55,
  ambientColor: '#ffffff',
};

useEffect(() => {
  ambient.intensity = normalized.enabled ? Math.max(0, normalized.ambientIntensity) : 0;
  ambient.color.set(normalized.ambientColor);
  main.intensity = normalized.enabled ? Math.max(0, normalized.mainIntensity) : 0;
  main.color.set(normalized.mainColor);
  const yawRad = THREE.MathUtils.degToRad(normalized.mainYaw);
  const pitchRad = THREE.MathUtils.degToRad(normalized.mainPitch);
  const distance = 12;
  main.position.set(
    distance * Math.cos(pitchRad) * Math.sin(yawRad),
    Math.max(0.5, distance * Math.sin(pitchRad)),
    distance * Math.cos(pitchRad) * Math.cos(yawRad),
  );
  requestRender();
}, [lighting, requestRender]);
```

8 个预设（LightingControlPanel.tsx）：overexposed / blue-backlight / rembrandt / cyberpunk / sunset / mysterious / golden-hour / nolan-grey，每个带预览缩略图。

#### 人物模型双轨（blueprintMeshFactory + blueprintGltfFactory）

**过程化小人**（blueprintMeshFactory.ts，1845 行）：
- 胶囊 + 球 + 圆柱拼装的火柴人
- `applyPersonActionTransform`：keyword → 骨骼旋转映射表
- `BlueprintBodyControls` schema 可调身高/躯干宽/头比例/四肢长短

**GLB 真人**（blueprintGltfFactory.ts，426 行）：
- 模型 URL：`/blueprint-figure.glb`（本地化）
- `GLTFLoader` **懒加载**（`await import('three/examples/jsm/loaders/GLTFLoader.js')`）
- `SkeletonUtils.clone` 深拷贝骨架，每个实例独立姿势
- **bindEuler 叠加**（关键）：加载时存每个骨骼的 bind 旋转，套姿势时先 reset 到 bind 再叠加 delta
- 骨骼别名表兼容 `mixamorig` 前缀和裸名（`Hips` / `mixamorigHips`）
- 有 `__BLUEPRINT_USE_GLTF__` 开关，加载失败**静默降级**到过程化小人

```ts
// blueprintGltfFactory.ts 骨骼别名
const BONE_ALIASES = {
  hips:          ['Hips', 'mixamorigHips'],
  spine:         ['Spine', 'mixamorigSpine', 'Spine1', 'mixamorigSpine1'],
  leftShoulder:  ['LeftArm', 'mixamorigLeftArm', 'L_Arm'],
  leftElbow:     ['LeftForeArm', 'mixamorigLeftForeArm', 'L_ForeArm'],
  // ...
};

// bindEuler 存储
obj.userData.bindEuler = [obj.rotation.x, obj.rotation.y, obj.rotation.z];

// 套姿势：先 reset bind，再叠加 delta
const bind = bone.userData.bindEuler;
if (bind) bone.rotation.set(bind[0], bind[1], bind[2]);
if (typeof dx === 'number') bone.rotation.x += dx;
```

#### TransformControls（:684-697）

```ts
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.enabled = false;
transformControls.setSize(0.85);
transformControls.setColors(X色, Y色, Z色, active色);
const transformHelper = transformControls.getHelper();   // r169+ API
transformHelper.visible = false;
scene.add(transformHelper);
```

#### 按需渲染（requestRender）

不是持续 RAF，而是按需触发。到处都是 `requestRender()` 调用，触发点包括：TransformControls.dragging-changed、items 变化、灯光变化、相机变化、panorama 纹理加载完成等。

#### 截图（exportPng）

```ts
// BlueprintScene.tsx:65, :1661, :1742
exportPng: (options?: { frameAspect?, targetWidth?, targetHeight? }) => string | null;
// 内部走 toDataURL('image/png')，支持按画幅裁切
```

**没有录视频**：全项目 grep 不到 `MediaRecorder` / `captureStream`，只有 PNG 截图。

### 2.3 DirectorStudioShell（导演台外壳，4377 行）

文件：`src/features/canvas/ui/DirectorStudioShell.tsx`

全屏 portal 容器，把 BlueprintScene + 浮动面板（相机/灯光/网格/画幅/分辨率/提示词）组合起来。

#### 全景导入流程（:2193-2231）

```ts
const importPanorama = useCallback(async (url, label) => {
  const result = await importDirectorStudioPanorama({
    sourceUrl: url,
    projection: 'spherical',
    onProgress: setPanoramaImportStage,
    messages: { /* i18n 错误文案 */ },
  });
  onUpdateNodeData({
    mode: 'panorama',
    backgroundPanoramaUrl: result.panoramaUrl,
    backgroundImageUrl: result.panoramaUrl,
  });
}, [onUpdateNodeData, t]);
```

`importDirectorStudioPanorama`（application/directorStudioPanoramaImport.ts，59 行）：
1. `prepareLocalPanoramaSource` 把图归一化成 2:1
2. data: URL 走 `prepareNodeImage` 持久化到本地存储
3. 返回 `{ panoramaUrl, generated }`

#### 球面控制器（CameraSphereControl / LightingSphereControl）

不用滑块，而是 Canvas 2D 画个球 + 十字光标，点哪就是哪个角度：
- `CameraSphereControl.tsx`（360 行）：水平/垂直角度选择，可叠加预览图
- `LightingSphereControl.tsx`（262 行）：方位角/仰角，8 个预设位置（front/back/left/right/top/bottom/topLeft/topRight）

#### 相机预设库（CameraPresetsPanel，442 行）

可保存/编辑/删除相机预设（fov + 距离），持久化到 zustand store。

#### 快捷键系统

17 个 action 可绑键（transformMove/Rotate/Scale、focus、fit、reset、screenshot、model、lighting、grid、prompt、shortcuts、save、delete、copy、paste、undo、redo、advancedPedestrianTags）。

---

## 3. 可借鉴的 4 点

### 3.1 球内边界钳制 ⭐ 最值得抄

**问题**：本项目旧 panorama-3d 节点全景模式下，角色能拖到球外，相机也能穿出球壁。

**参考**：`BlueprintScene.tsx:235-255` 的 `clampPanoramaPointAtFixedY` / `clampPanoramaCameraState`

**思路**：
- 球半径 R = 50
- 物体半径限制 = R - 3（留 3 单位余量）
- Y 方向直接 clamp 到 [-limit, limit]
- 水平方向按 `sqrt(limit² - y²)` 算水平半径上限，超了就按比例缩回
- 相机距离 clamp 到 [2, R-5]，相机目标点按 (R-2 - distance) 钳制半径

**收益**：角色和相机都不会穿墙，全景沉浸感保住。

### 3.2 按需渲染（requestRender）

**问题**：本项目旧节点用持续 `requestAnimationFrame`，空载也吃 CPU。

**参考**：`BlueprintScene.tsx` 全文到处 `requestRender()`

**思路**：
- 不开持续 RAF
- 用一个 `needsRender` 标志 + `requestAnimationFrame` 单次触发
- 所有状态变化（拖拽、灯光、相机、纹理加载）都调 `requestRender()`
- TransformControls 的 `dragging-changed` 事件：拖拽中开持续渲染，松开回到按需

**收益**：空载 CPU 接近 0，拖拽时流畅。

### 3.3 GLB + 过程化双轨降级

**问题**：本项目旧导演台 GLB 加载失败（内网/URL 失效）直接空白。

**参考**：`blueprintGltfFactory.ts` + `blueprintMeshFactory.ts`

**思路**：
- 过程化胶囊小人作为 fallback，永远可用
- GLB 走 `__BLUEPRINT_USE_GLTF__` 开关 + 懒加载 `await import('GLTFLoader')`
- GLB 加载成功 → 用 GLB；失败 → 静默回退胶囊小人，控制台 warn
- `onGltfPersonTemplateReady` 回调通知 React 重渲染

**收益**：任何环境都能看到角色，不会白屏。

### 3.4 bindEuler 姿势叠加

**问题**：本项目旧代码套姿势时直接覆盖骨骼旋转，不同 rig 的 T-pose/A-pose 差异会污染姿势。

**参考**：`blueprintGltfFactory.ts:137, :263-264`

**思路**：
- GLB 加载时遍历所有骨骼，存 `bone.userData.bindEuler = [x, y, z]`
- 套姿势时先 `bone.rotation.set(bind[0], bind[1], bind[2])` reset 到 bind
- 再 `bone.rotation.x += dx` 叠加姿势 delta
- 骨骼别名表兼容 `mixamorig` 前缀和裸名（`Hips` / `mixamorigHips`）

**收益**：同一套姿势参数能跨不同 rig 复用，T-pose 和 A-pose 角色都能正确套姿势。

---

## 4. 对照本项目的修复建议

### 4.1 本项目现状（旧节点）

| 节点 | 文件 | 行数 | 核心问题 |
|---|---|---|---|
| director-studio | `src/components/director/DirectorStudio.tsx` | 2131 | useEffect 依赖不全、GLB 无降级、mimeType 硬编码 |
| panorama-3d | `src/components/nodes/Panorama3DNode.tsx` | 6510 | 单文件巨型、无录视频、角色穿球壁、导演预览基于快照 |

### 4.2 逐项修复建议

#### 修复 1：全景模式角色穿球壁

**本项目位置**：`Panorama3DNode.tsx` 的 `avatarWorldPosition`（:338 附近）
**参考代码**：`BlueprintScene.tsx:235-246` 的 `clampPanoramaPointAtFixedY`
**做法**：在把角色摆到球面表面后，额外调一次 clamp，确保不穿壁。相机同理。

#### 修复 2：GLB 加载失败无降级

**本项目位置**：`DirectorStudio.tsx:940-958` 的 `loadActorModel`，候选 URL 直接 fetch，失败空白
**参考代码**：`blueprintGltfFactory.ts` 的双轨 + 静默降级
**做法**：保留过程化胶囊小人作为 fallback；GLB 加载失败时回退胶囊小人并 console.warn

#### 修复 3：套姿势直接覆盖骨骼

**本项目位置**：`Panorama3DNode.tsx:496-684` 的 `applyAvatarPose` 直接 set rotation
**参考代码**：`blueprintGltfFactory.ts:137, :263-264` 的 bindEuler 存储 + reset + 叠加
**做法**：加载时存 bindEuler，套姿势时先 reset bind 再 += delta

#### 修复 4：截图无空画布防护

**本项目位置**：`Panorama3DNode.tsx` 多处 `toDataURL` 裸调（:963, :3060, :3186 等）
**参考代码**：`PanoramaNode.tsx:96-119` 的 `assertCanvasHasCaptureContent`
**做法**：截图前采样 16x16 像素校验非全黑，全黑给提示

#### 修复 5：持续 RAF 浪费 CPU

**本项目位置**：`DirectorStudio.tsx:1083-1096` 的 `requestAnimationFrame` 循环
**参考代码**：`BlueprintScene.tsx` 的 `requestRender` 按需渲染
**做法**：改成 needsRender 标志 + 单次 RAF；TransformControls 拖拽时才开持续渲染

#### 修复 6：MediaRecorder mimeType 硬编码

**本项目位置**：`DirectorStudio.tsx:1524` 硬编码 `'video/webm'`
**参考代码**：本调研未在 open-storyboard-canvas 找到录视频实现（它没有），需自行用 `MediaRecorder.isTypeSupported` 检测
**做法**：遍历候选 mime（webm vp9/vp8、mp4 h264），取第一个支持的

### 4.3 不要照抄的部分

- **photo-sphere-viewer**：它和 three.js 场景是两套渲染，不能把 3D 角色放进去。本项目要融合，应继续用自写球体，不引入此库。
- **DDD 分层**：open-storyboard-canvas 的 application/domain/ui 三层对本项目改动太大，本项目扁平结构够用，不必照搬。
- **Tauri**：本项目用 Electron，无需迁移。

### 4.4 本项目比它强的地方

- **录视频**：本项目旧导演台有 MediaRecorder（虽有 bug），open-storyboard-canvas 完全没有录视频能力。
- **双轨录制**：本项目可做实时+帧精确双轨，它是空白。
- **节点融合**：本项目目标是融合导演台+全景，它仍是两个独立节点。

---

## 5. 关键文件速查表

| 关注点 | 文件 | 行号 |
|---|---|---|
| 全景球体创建 | `ui/BlueprintScene.tsx` | 670-676 |
| 全景纹理加载 | `ui/BlueprintScene.tsx` | 840-892 |
| 球内物体钳制 | `ui/BlueprintScene.tsx` | 235-246 |
| 球内相机钳制 | `ui/BlueprintScene.tsx` | 248-255 |
| 灯光应用 | `ui/BlueprintScene.tsx` | 777-797 |
| TransformControls | `ui/BlueprintScene.tsx` | 684-697 |
| GLB 人物工厂 | `ui/blueprintGltfFactory.ts` | 全文 |
| bindEuler 存储 | `ui/blueprintGltfFactory.ts` | 137 |
| bindEuler 叠加 | `ui/blueprintGltfFactory.ts` | 263-264 |
| 骨骼别名表 | `ui/blueprintGltfFactory.ts` | 46-57 |
| 截图等待渲染 | `nodes/PanoramaNode.tsx` | 73-95 |
| 截图空画布校验 | `nodes/PanoramaNode.tsx` | 96-119 |
| 四宫格导出 | `nodes/PanoramaNode.tsx` | 298-339 |
| 全景归一化 | `application/panoramaNormalize.ts` | 全文 |
| 全景提示词 | `application/panoramaPrompt.ts` | 全文 |
| 节点 schema | `domain/canvasNodes.ts` | 338-551 |
