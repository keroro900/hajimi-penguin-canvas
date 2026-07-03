---
name: hakimi-image-workflow
description: Build Hakimi 画布 image generation workflows. Use when an agent needs to plan prompts, attach reference images, call image generation such as gpt-image-2, place generated bitmap results, or compare/refine image variants on the canvas.
---

# Hakimi Image Workflow

This is a compatibility entry for older agents and tests. For current work, use `hakimi-canvas-os` and read `references/image-workflow.md`.

## Required Route

1. Load `skills/hakimi-canvas-os/SKILL.md`.
2. Follow its always-on rules.
3. Read `skills/hakimi-canvas-os/references/image-workflow.md`.

## Compatibility Rules

- Put the full prompt directly on the image generation node as `data.prompt`.
- Generated bitmap results should normally stay on the same `type: "image"` node: set `data.imageUrl` and `data.imageUrls` so the node displays the result while keeping RUN, prompt, model, and reference controls.
- Treat this same image node as the generation config record.
- Use `type: "upload"` mainly for static imported/reference assets.
- Do not create separate prompt text nodes unless the prompt needs to be edited or reused independently.

## Sidebar Directions

- `reference-bind` | 参考绑定 | 收集画布图片、上传图和素材库引用，写入 referenceImages。
- `prompt-node` | 生图节点 | 把完整 prompt、模型、比例、尺寸和负面约束写进 image 节点。
- `variant-lane` | 变体队列 | 一次只改变一个变量，建立可比较的 image 节点队列。
- `run-node` | 真实生成 | 用 run_node 触发画布节点自己的模型和生成设置。
- `quality-check` | 结果质检 | 回读 imageUrl、imageUrls、模型、提示词和来源关系。

## Sidebar Questions

- `variant-count` | 需要几张或几组变体？ | 1 张 / 3 张 / 5 张 / 先问用户 | 3 张
- `reference-policy` | 参考图应该如何约束结果？ | 严格保持主体 / 只参考风格 / 只参考构图 / 让用户补充 | 严格保持主体
- `run-now` | 节点写好后是否立即运行？ | 立即运行 / 只创建节点 / 先预览再运行 | 先预览再运行

## Sidebar Canvas Templates

- `image-node-flow` | 生图节点流程 | reference -> promptful image node -> run_node -> result imageUrl -> quality check
- `variant-comparison` | 变体对比流程 | source reference -> variant image nodes -> parallel run_node -> comparison/review node

## Sidebar Verification

- `prompt-on-image-node` | 提示词在 image 节点 | 检查 data.prompt 写在 type:image 节点而不是空 text 节点
- `model-preferences` | 模型参数写入节点 | 检查 data.model/apiModel/aspectRatio/sizeLevel/quality
- `result-url` | 结果可显示 | 检查 data.imageUrl 或 data.imageUrls 已回写
