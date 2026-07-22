# Canvas Performance Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升 React Flow 画布在拖拽、缩放和大画布场景下的体感帧率，同时降低缩小时的无效渲染。

**Architecture:** 先不拆 `Canvas.tsx`，优先在热路径上做低风险优化：把拖拽对齐改成 `requestAnimationFrame` 合帧、把可见区裁剪常开、通过统一的 LOD profile 给节点和覆盖层加“缩小时省流”开关。实现尽量落在纯工具函数与 CSS 数据属性上，减少业务回归面。

**Tech Stack:** React 19、@xyflow/react、TypeScript、Node test、CSS data attributes

---

## Chunk 1: Performance primitives

### Task 1: 新增性能工具与失败测试

**Files:**
- Modify: `tests/canvasPerformancePhase1.test.ts`
- Create: `src/utils/canvasPerformance.ts`

- [ ] **Step 1: 写失败测试**
- [ ] **Step 2: 运行 `node --test tests/canvasPerformancePhase1.test.ts` 确认失败**
- [ ] **Step 3: 实现 `createRafThrottle`、`calculateNodeSnapGuides`、`getCanvasPerformanceProfile`**
- [ ] **Step 4: 再次运行 `node --test tests/canvasPerformancePhase1.test.ts` 确认通过**

## Chunk 2: Canvas hot-path integration

### Task 2: 把拖拽对齐改成 rAF 合帧

**Files:**
- Modify: `src/components/Canvas.tsx`

- [ ] **Step 1: 引入性能工具并建立拖拽 rAF 调度器**
- [ ] **Step 2: 把普通节点辅助线/吸附更新迁到 rAF callback**
- [ ] **Step 3: 把 GroupBox 成员联动迁到 rAF callback**
- [ ] **Step 4: 在拖拽结束和卸载时清理 pending rAF**

### Task 3: 常开可见区裁剪与 LOD profile

**Files:**
- Modify: `src/components/Canvas.tsx`
- Modify: `src/styles/theme-core.css`

- [ ] **Step 1: 使用 `useViewport` 生成 `canvasPerformance`**
- [ ] **Step 2: `onlyRenderVisibleElements` 改为由 `canvasPerformance.renderVisibleElementsOnly` 驱动**
- [ ] **Step 3: 给 `.t8-canvas-shell` 写入 `data-canvas-lod` 等属性**
- [ ] **Step 4: 在 CSS 中为 `compact/outline` 模式隐藏重内容、缩小节点装饰、关闭背景/覆盖层细节**

## Chunk 3: Verification

### Task 4: 跑针对性验证

**Files:**
- Modify: `tests/canvasPerformancePhase1.test.ts`

- [ ] **Step 1: 运行 `node --test tests/canvasPerformancePhase1.test.ts`**
- [ ] **Step 2: 运行 `npm run type-check`**
- [ ] **Step 3: 如有必要，运行 `npm run build` 做最终编译验证**

Plan complete and saved to `docs/superpowers/plans/2026-07-05-canvas-performance-phase1.md`. Ready to execute.
