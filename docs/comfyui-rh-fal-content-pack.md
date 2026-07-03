# ComfyUI / RH / FAL 内容包

本内容包服务于 v2.1.8 的合并友好更新路线：只追加 manifest 示例、字段说明和排障清单，不改节点主流程。

## ComfyUI 字段映射

- Prompt：优先映射 `prompt`、`positive`、`negative`，再按节点标题修正常见正负提示词字段。
- 图片：优先映射 `image1`、`image2`、`mask`、`reference_image`、`control_image` 等输入。
- 尺寸与采样：`width`、`height`、`steps`、`cfg`、`sampler_name`、`scheduler` 默认暴露为用户参数。
- 视频/音频：`video1`、`audio1` 只作为应用制作器示例字段，不强行改现有图像节点协议。

## 排除规则

建议保存一份 `t8-comfyui-field-exclude-rules` 备份，常用规则如下：

```json
[
  "ckpt_name",
  "vae_name",
  "clip_name",
  "control_after_generate",
  "sampler_name"
]
```

这些规则适合把模型加载器、固定采样器和不希望用户修改的字段从自动参数里移除。

## 缺模型

- 现象：ComfyUI 报 `model not found`、`CheckpointLoaderSimple` 失败或工作流停在队列前。
- 处理：把 manifest 示例里的 Checkpoint 改成本机真实 `.safetensors` 文件名；LoRA、ControlNet、VAE 同理。
- 回退：先用基础文生图样例验证 ComfyUI 连通，再导入复杂 workflow。

## 缺节点

- 现象：ComfyUI 报 `unknown node type`、`custom node missing` 或 API Workflow 无法排队。
- 处理：按 workflow 原作者说明安装 custom node；安装后重启 ComfyUI，再重新导入 API Workflow。
- 回退：把缺失节点所在支路临时移除，先保存一个最小可运行 manifest。

## RunningHub 示例包

RH 工具箱新增的内容包模板默认 `enabled:false`，没有真实 WebApp ID 不会出现在可执行入口。启用前需要维护者补齐：

- `webappId`
- `inputSchema[].rhNodeId`
- `inputSchema[].fieldName`
- `outputSchema`
- `runtime.instanceType`

推荐先启用“产品图精修”“角色一致性九宫格”“短链素材入库”三类模板，覆盖图像、文本和素材管理。

## FAL 示例包

FAL 工具箱的内容包模板同样默认禁用，只作为公开 manifest 的字段参考。启用前需要确认：

- endpoint 是否仍可用
- 图像输入走 `base64` 还是 `url`
- 文本 prompt 是否需要放到 `prompt`、`text` 或嵌套 payload
- 输出字段是否落在 `images`、`video.url`、`audio.url` 或模型文件 URL

推荐从图生视频、产品图、音频/SFX 三条链路开始，每条链路都保留 `request_id` 排障入口。

## 导入清单

- 先导入 ComfyUI API Workflow，保存 manifest 前检查字段映射和排除规则。
- RH 只导入结构模板，不启用没有 WebApp ID 的工具。
- FAL 只导入已确认 endpoint 和 payload schema 的工具。
- 每次内容更新同步 README、features.json、release notes 和测试。
