---
name: hakimi-canvas-control
description: Control Hakimi 画布 through MCP or HTTP. Use when an agent must read a canvas, add/update/connect nodes, focus the viewport, preview changes, show visible progress, or coordinate Codex/Claude/LangGraph style canvas actions.
---

# Hakimi Canvas Control

This is a compatibility entry for older agents and tests. For current work, use `hakimi-canvas-os` and read `references/canvas-control.md`.

## Required Route

1. Load `skills/hakimi-canvas-os/SKILL.md`.
2. Follow its always-on rules.
3. Read `skills/hakimi-canvas-os/references/canvas-control.md`.

## Compatibility Rules

- Text nodes render `data.prompt`; set both `data.prompt` and `data.text`.
- Displayable image generation cards should use `type: "image"` with `data.prompt`, model settings, and `data.imageUrl`/`data.imageUrls`.
- Use `type: "upload"` mainly for static imported/reference assets.
- Use `hakimi_agent_run_actions` for visible multi-step work.

## Sidebar Directions

- `read-canvas` | 画布读取 | 读取当前画布、节点、连线、视口和能力。
- `preview-layout` | 预览落点 | 用 preview_node 和 focus_viewport 展示将要修改的位置。
- `atomic-actions` | 原子动作 | 小批量 add_node、update_node、connect_edge，避免一次乱改。
- `visible-progress` | 可视进度 | 通过 phase 和 agent events 让用户看见执行状态。
- `verify-canvas` | 回读验证 | 执行后核对节点数、连线、图片 URL 和关键 data 字段。

## Sidebar Questions

- `target-area` | 新内容应该放在哪里？ | 选中节点右侧 / 当前视口中心 / 画布空白区 / 先预览 | 选中节点右侧
- `mutation-scope` | 允许修改哪些内容？ | 只新增 / 可更新选中节点 / 可整理连线 / 先确认 | 只新增
- `focus-after` | 执行后是否聚焦新流程？ | 聚焦新节点 / 保持视图 / 只高亮 | 聚焦新节点

## Sidebar Canvas Templates

- `safe-canvas-actions` | 安全画布动作 | get canvas -> preview_node -> add/update nodes -> connect_edge -> focus_viewport -> verify
- `visible-progress` | 可视进度动作 | phase intent -> phase plan -> phase execute -> phase verify

## Sidebar Verification

- `action-count` | 动作数量可控 | 检查一次提交的小批量动作没有无关节点
- `node-data` | 节点 data 可渲染 | 检查 text 节点 data.prompt/data.text，image 节点 data.prompt/imageUrl
- `canvas-readback` | 回读结果一致 | 检查节点数、连线数、视口和关键节点 data
