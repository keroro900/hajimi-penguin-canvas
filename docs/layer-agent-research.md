# AI 图片分层 Agent 调研与成本测算

更新时间：2026-07-04

目标：在哈基米画布中实现一个“混合模式”的 AI 图片分层 Agent。主软件只承担任务调度、图层协议、缩略图、mask 后处理、图层预览和合成；视觉理解、分割、抠图、OCR、背景修补等重活走远端 API 或用户自选 provider，避免让普通用户电脑承担大模型压力。

## 结论摘要

图片分层不要做成“内置大模型功能”，而应该做成 provider 化的 Agent 管线：

```text
原图
  -> VLM 规划图层
  -> 分割 / mask
  -> alpha / matting 精修
  -> 背景修补 / 文字区修补
  -> 输出 LayerStack
  -> 画布图层节点 / 分层 PNG / 后续 PSD 或 Figma 导出
```

更现代的实现不是单纯 `SAM + LaMa`。现在更合理的是：

- VLM 负责看懂画面层级和设计语义。
- 分割模型只负责 mask，不负责判断“哪些层有设计价值”。
- alpha/matting 模型负责透明边缘。
- `gpt-image-2`、Photoroom Plus、或其它 image edit 模型负责背景修补、去物体后重绘、文字区修补。
- 本地只用 `sharp` 做轻量图片处理和缓存。

LayerCraft、Canva Magic Layers 这类网页产品之所以拆得很强，通常不是靠一个便宜分割 API，而是“语义理解 + 多阶段 mask + alpha 精修 + 生成式背景补全 + 结果质检 + 可编辑协议重建”的组合能力。

## 为什么网页产品看起来已经很强

网页端做得很牛的拆层工具，大概率有几类能力叠加：

1. **图层规划**
   大模型先识别海报/商品/人物/文字/阴影/装饰/背景层级，而不是直接全图自动切 mask。

2. **区域级多轮拆解**
   先拆主层，再对主层内部继续“再分层”，比如产品组 -> 单个商品 -> 标签/高光/阴影。

3. **边缘精修**
   只用 SAM 类 mask 往往边缘粗，商业工具会接 matting/alpha 模型处理头发、透明物、反光商品边缘。

4. **生成式背景修补**
   删除对象之后的洞，用 image edit/inpainting 模型重绘，比传统 LaMa 更自然，尤其适合海报、电商、AI 生图。

5. **可编辑协议重建**
   真正有价值的不是“抠出一张 PNG”，而是把层级、bbox、类型、文字内容、透明图、mask、背景补全图整理成可编辑协议。

## 推荐的混合模式架构

### 本地职责

- 上传原图。
- 生成缩略图。
- 保存 `LayerStack` JSON。
- 用 `sharp` 做裁切、合成、alpha 应用、导出 PNG。
- 在画布中展示“分层结果节点”。
- 每层支持开关、拖出、删除、送图生图、导出。
- 缓存远端结果，避免重复扣费。

### 远端职责

- VLM 图层规划。
- SAM2 / Grounded-SAM / 检测 API 生成 mask。
- BiRefNet / RMBG / remove.bg / Photoroom 做 alpha 精修。
- OCR 或 VLM 提取文字内容和位置。
- image edit 模型修补背景。

## LayerStack 协议草案

```ts
interface LayerStack {
  id: string;
  sourceImageUrl: string;
  repairedBackgroundUrl?: string;
  previewUrl?: string;
  width: number;
  height: number;
  layers: LayerItem[];
  meta: {
    provider: string;
    mode: 'lite' | 'standard' | 'pro';
    costEstimateCny?: number;
    createdAt: string;
  };
}

interface LayerItem {
  id: string;
  name: string;
  type: 'background' | 'product' | 'person' | 'text' | 'logo' | 'effect' | 'prop' | 'shadow' | 'unknown';
  imageUrl?: string;
  maskUrl?: string;
  alphaUrl?: string;
  bbox: [number, number, number, number];
  confidence?: number;
  editable: boolean;
  text?: {
    content: string;
    color?: string;
    fontGuess?: string;
    rotation?: number;
  };
}
```

## 可用 API 与价格信息

换算汇率：`1 USD = 6.7814 CNY`，来源 Frankfurter API，日期 2026-07-03。

### Photoroom API

官网信息：

- Basic / Remove Background API：`$0.02 / image`
- Plus / Image Editing API：`$0.10 / image`
- 1000 次/月 sandbox 调用，带水印。
- 新账号有 10 次免费生产 Remove Background 调用。

人民币粗算：

| 调用 | USD | CNY |
|---|---:|---:|
| Remove Background | `$0.02` | `¥0.14` |
| Image Editing / Plus | `$0.10` | `¥0.68` |

适合：

- 商品图、人像、普通主体抠图。
- 背景编辑、AI 背景、阴影、商品美化等 Plus 能力。

### remove.bg API

官网信息：

- 每月前 50 次 API 调用免费。
- 支持最高 50MP 输入。
- PNG 透明输出最高 10MP。
- ZIP 输出包含 `color.jpg + alpha.png`，其中 `alpha.png` 是灰度 alpha matte，非常适合做图层协议。
- 价格页动态渲染，当前抓取不到稳定单价，需要按账号后台确认。

适合：

- 主体层透明 PNG。
- 需要 alpha matte 的分层后处理。
- 先做低成本试用。

### Clipdrop Remove Background

官网信息：

- 1 次成功背景移除 = 1 credit。
- 登录后可领取 100 个免费开发 credits。
- 后续 credits 需要联系 Jasper。

适合：

- 测试和备用 provider。
- 不适合作为长期默认依赖，因为后续成本不透明。

### Replicate

官网信息：

- 大量公开模型按运行硬件和秒计费。
- T4：`$0.000225/sec`
- L40S：`$0.000975/sec`
- A100 80GB：`$0.001400/sec`
- H100：`$0.001525/sec`

人民币粗算：

| 硬件 | USD/sec | CNY/sec | 20 秒 | 60 秒 |
|---|---:|---:|---:|---:|
| T4 | `$0.000225` | `¥0.0015` | `¥0.03` | `¥0.09` |
| L40S | `$0.000975` | `¥0.0066` | `¥0.13` | `¥0.40` |
| A100 | `$0.001400` | `¥0.0095` | `¥0.19` | `¥0.57` |
| H100 | `$0.001525` | `¥0.0103` | `¥0.21` | `¥0.62` |

适合：

- SAM2 / Grounded-SAM / BiRefNet 等开源模型测试。
- 需要 mask、多对象分割、实验 provider。

注意：

- 冷启动、排队、模型页面实际硬件会影响成本和速度。
- 单次任务很便宜，但体验不一定稳定。

### fal.ai

官网信息：

- fal 总价页显示自定义部署 GPU 可低至 H100 `$1.89/hr`，标价 H100 `$3.99/hr`。
- 图像模型示例：Seedream V4 `$0.03/image`、Flux Kontext Pro `$0.04/image`、Qwen `$0.02/MP`。
- 背景移除工具页提到 BiRefNet、RMBG、Pixelcut 等，但总价页没有明确列出每个背景移除 endpoint 单价。

按 GPU 小时粗算：

| H100 价格 | USD/sec | CNY/sec | 20 秒 | 60 秒 |
|---|---:|---:|---:|---:|
| 标价 `$3.99/hr` | `$0.001108` | `¥0.0075` | `¥0.15` | `¥0.45` |
| 低至 `$1.89/hr` | `$0.000525` | `¥0.0036` | `¥0.07` | `¥0.21` |

适合：

- 作为远端模型 provider。
- 背景移除、BiRefNet/RMBG 类模型候选。

注意：

- 最终成本必须以具体 fal model endpoint 的计费为准。

### OpenAI / GPT Image

官网信息：

- `gpt-image-2` 图片输入：`$8 / 1M tokens`
- `gpt-image-2` 图片输出：`$30 / 1M tokens`
- 文本输入：`$5 / 1M tokens`
- 支持 image edit、mask edit、多图参考、多轮编辑。
- `gpt-image-2` 当前不支持透明背景输出。

适合：

- 背景修补。
- 删除对象后重绘被遮挡区域。
- 文字区修补。
- 局部重绘和风格保持。

注意：

- 官方按 token 计费，不是固定每张图价格；需要用官方图片成本计算器或中转站实际价格估算。
- 在我们的产品预算里，建议先按 `¥0.5 - ¥2.0 / 次背景修补` 预留，具体以中转站 image2 价格为准。

## 一套图成本测算

这里“一套图”定义为：用户上传 1 张原图，系统输出 1 个 LayerStack，包含透明主体层、修补背景和若干图层元数据。

### 方案 A：轻量主品分层

目标：只拆主品/人物 + 原图背景，不做复杂多对象，不做高质量背景修补。

调用：

- VLM 规划 1 次。
- 背景移除 / 主体抠图 1 次。
- 本地合成与缓存。

成本估算：

| 项 | 估算 |
|---|---:|
| VLM 图层规划 | `¥0.01 - ¥0.05` |
| Photoroom Remove Background | `¥0.14` |
| 本地处理 | 近似 `¥0` |
| 合计 | `¥0.15 - ¥0.25 / 套` |

适合默认“快速拆主体”。

### 方案 B：主品分层 + 背景修补

目标：拆出主体透明 PNG，并生成一张没有主体的干净背景。

调用：

- VLM 规划 1 次。
- 背景移除 / 主体抠图 1 次。
- 背景修补 1 次。
- 本地合成与缓存。

如果背景修补用 Photoroom Plus：

| 项 | 估算 |
|---|---:|
| VLM 图层规划 | `¥0.01 - ¥0.05` |
| Photoroom Remove Background | `¥0.14` |
| Photoroom Plus / Image Editing | `¥0.68` |
| 本地处理 | 近似 `¥0` |
| 合计 | `¥0.83 - ¥0.90 / 套` |

如果背景修补用 `gpt-image-2 / image2`：

| 项 | 估算 |
|---|---:|
| VLM 图层规划 | `¥0.01 - ¥0.05` |
| 抠图 | `¥0.14` |
| image2 背景修补 | `¥0.5 - ¥2.0`，看中转站定价 |
| 合计 | `¥0.65 - ¥2.20 / 套` |

适合默认标准模式。

### 方案 C：多对象分层 5 层左右

目标：拆出主品、人物、logo、文字、装饰等 3-5 个有用层，并修补背景。

调用：

- VLM 图层规划 1 次。
- 多对象分割 1 次。
- 重点图层 alpha 精修 2-3 次。
- 背景修补 1 次。
- OCR 或 VLM 文字识别 1 次。

用 Replicate T4 跑多对象分割：

| 项 | 估算 |
|---|---:|
| VLM 图层规划 | `¥0.02 - ¥0.08` |
| Replicate T4 分割 20-60 秒 | `¥0.03 - ¥0.09` |
| 2-3 个重点层 alpha 精修 | `¥0.28 - ¥0.42` |
| 背景修补 | `¥0.68` 起，或 image2 `¥0.5 - ¥2.0` |
| OCR / 文字层识别 | `¥0 - ¥0.05` |
| 合计 | `¥1.0 - ¥2.6 / 套` |

适合“认真拆层”按钮，不适合默认每张图都自动跑。

### 方案 D：高质量商业分层 8 层左右

目标：接近 LayerCraft/Canva 那种更强拆解：主品、人物、文字、光效、阴影、装饰、背景，并且局部再分层。

调用：

- VLM 规划 1-2 次。
- 多对象分割 1-2 次。
- 重点 alpha 精修 4-6 次。
- 背景修补 1-2 次。
- 文字 OCR + 背景修补。
- 合成质检 1 次。

成本估算：

| 项 | 估算 |
|---|---:|
| VLM 规划 + 质检 | `¥0.05 - ¥0.20` |
| 多对象分割 | `¥0.05 - ¥0.30` |
| 4-6 个 alpha 精修 | `¥0.56 - ¥0.84` |
| 背景/文字区修补 1-2 次 | `¥0.68 - ¥4.0` |
| 合计 | `¥1.4 - ¥5.3 / 套` |

适合付费高级模式，或者用户明确点“精修分层”。

## 产品分级建议

| 模式 | 默认行为 | 预估成本 |
|---|---|---:|
| 快速主体 | 只拆主品/人物，不修补背景 | `¥0.15 - ¥0.25` |
| 标准分层 | 主体透明层 + 背景修补 + 文字区域识别 | `¥0.8 - ¥2.2` |
| 多层拆解 | 3-5 层 + 背景修补 + 文字层 | `¥1.0 - ¥2.6` |
| 商业精修 | 6-8 层 + 多轮修补 + 质检 | `¥1.4 - ¥5.3` |

默认建议：

1. 默认按钮只跑“标准分层”。
2. “拆更多层”作为二次按钮，用户确认后再扣更多成本。
3. “高清精修 / 商业分层”作为高级按钮。
4. 每一步都缓存，不重复扣费。
5. 每个 provider 在设置里显示预估成本，任务开始前给用户提示。

## 低成本优先路线

第一版：

```text
VLM 规划：走现有中转站视觉模型
主体透明层：Photoroom Basic 或 remove.bg 免费额度 / ZIP alpha
背景修补：image2 / gpt-image-2 edit
本地：sharp 合成、LayerStack 保存、画布展示
```

第二版：

```text
多对象分割：Replicate / fal / HF 上的 SAM2 或 Grounded-SAM
Alpha 精修：BiRefNet / RMBG / remove.bg ZIP alpha
文字层：OCR + VLM 复核
```

第三版：

```text
分层质检：合成图 vs 原图相似度检查
失败层重试：只重跑单层，不重跑整套图
导出：PSD / Figma JSON / 分层 PNG ZIP
```

## 实现注意事项

1. **不要默认压缩原图**
   用户不希望损失质量。可以默认保留原图，只有 provider 限制或用户选择“快速省钱”时才缩放。

2. **不要每层都调用昂贵 API**
   先用 VLM 判断哪些层有价值。只有主品、人像、文字、logo、重要装饰才精修。

3. **背景修补是成本大头**
   image edit 模型比普通分割贵。应该在 UI 上区分“只拆透明层”和“拆层并修补背景”。

4. **多层拆解要可中断**
   跑出第一层就先显示，后续层继续后台处理。

5. **透明 PNG 不是 image2 的强项**
   OpenAI 文档写 `gpt-image-2` 当前不支持透明背景输出，所以透明图层仍要依赖 mask/alpha pipeline；image2 更适合背景修补和局部重绘。

6. **网页产品强，不等于单 API 便宜**
   LayerCraft/Canva 这种效果强的产品，背后很可能是多模型、多轮调度、质检和自研数据积累。我们应先做 provider 化架构，避免被单一 API 绑定。

## 推荐下一步

先不要直接写复杂模型调用，先落下面三件事：

1. `LayerStack` 协议和结果节点。
2. 后端 `/api/layer-agent` 任务接口。
3. provider 插槽：
   - `planner`
   - `segmenter`
   - `matting`
   - `backgroundRepair`
   - `ocr`

第一版 provider 可以先只接：

- VLM planner：现有中转站。
- Matting：Photoroom Basic 或 remove.bg。
- Background repair：image2 / gpt-image-2 edit。

这样一套图标准模式成本大概控制在 `¥0.8 - ¥2.2`，快速主体模式可以压到 `¥0.15 - ¥0.25`。

## 参考来源

- OpenAI Image generation docs: <https://platform.openai.com/docs/guides/image-generation>
- OpenAI Pricing: <https://platform.openai.com/docs/pricing>
- Photoroom API Pricing: <https://www.photoroom.com/api/pricing>
- remove.bg API: <https://www.remove.bg/api>
- Clipdrop Remove Background API: <https://clipdrop.co/apis/docs/remove-background>
- Replicate Pricing: <https://replicate.com/pricing>
- fal Pricing: <https://fal.ai/pricing>
- LayerCraft: <https://layercraft.com.cn/>
- USD/CNY exchange rate: <https://api.frankfurter.app/latest?from=USD&to=CNY>
