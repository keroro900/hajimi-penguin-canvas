---
name: hakimi-apparel-design
description: Create apparel design workflows on Hakimi 画布. Use when an agent works from prints, garments, children clothing, e-commerce product images, mockups, colorways, fabric notes, or clothing second-development visual prompts.
---

# Hakimi Apparel Design

This is a compatibility entry for older agents and tests. For current work, use `hakimi-canvas-os` and read `references/apparel-design.md`.

## Required Route

1. Load `skills/hakimi-canvas-os/SKILL.md`.
2. Follow its always-on rules.
3. Read `skills/hakimi-canvas-os/references/apparel-design.md`.

## Compatibility Rules

- Put the production prompt on the image node as `data.prompt`; avoid extra prompt-only text nodes unless the prompt itself is a reusable deliverable.
- Generated apparel mockups should be visible image result nodes: use `type: "image"` with `data.prompt`, `data.imageUrl`, and `data.imageUrls` so the same node shows the garment and remains runnable/editable.
- Use `type: "upload"` for static reference prints or imported assets.
- Keep generated result nodes linked with source print, source generation node, model, size level, and the exact prompt used.

## Sidebar Directions

- `print-analysis` | 印花分析 | 读取参考印花，提炼图案、比例、配色和可用区域。
- `garment-direction` | 版型方向 | 选择童装/服装版型、季节、受众和商品图目标。
- `placement-map` | 位置规划 | 规划印花在衣身、袖口、下摆或局部细节的落点。
- `mockup-variants` | 样衣变体 | 创建带 prompt、模型、参考图和比例的 image 节点变体。
- `commerce-review` | 商品复核 | 检查可售性、工艺可行性、印花保真和结果 lineage。

## Sidebar Questions

- `garment-type` | 这次要落在哪类服装版型？ | T 恤 / 卫衣 / 连衣裙 / 套装 / 用户自定 | 用户自定
- `variant-count` | 需要几个版型或配色变体？ | 2 个 / 4 个 / 6 个 / 先问用户 | 4 个
- `print-fidelity` | 印花保真优先级是什么？ | 严格保持 / 允许重绘细节 / 只保留主题 | 严格保持

## Sidebar Canvas Templates

- `apparel-second-development` | 服装二开流程 | source print -> analysis note -> garment image variants -> run_node -> commerce review
- `print-placement` | 印花落位流程 | print reference -> placement map -> mockup image nodes -> result comparison

## Sidebar Verification

- `print-reference` | 印花引用保留 | 检查 referenceImages 包含原始印花或素材节点 URL
- `garment-prompt` | 版型提示清楚 | 检查 prompt 写明服装类型、印花位置、材质、视角和限制
- `commerce-lineage` | 商品复核可追溯 | 检查变体节点连到来源印花并保留模型参数
