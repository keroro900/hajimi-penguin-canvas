import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const testDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

test('backend exposes generic agent canvas action protocol', () => {
  const server = read('../backend/src/server.js');
  const route = read('../backend/src/routes/agentCanvas.js');
  const planUtil = read('../backend/src/utils/canvasPlan.js');

  assert.match(server, /agentCanvasRouter/);
  assert.match(server, /app\.use\('\/api\/agent\/canvas'/);
  assert.match(route, /router\.post\('\/actions'/);
  assert.match(route, /router\.get\('\/snapshot\/:canvasId'/);
  assert.match(route, /router\.post\('\/plans\/apply'/);
  assert.match(route, /router\.post\('\/plans\/diff'/);
  assert.match(route, /router\.post\('\/plans\/verify'/);
  assert.match(route, /executeAgentActions/);
  assert.match(route, /createCanvasSnapshot/);
  assert.match(route, /normalizeCanvasPlan/);
  assert.match(route, /createPlanDiff/);
  assert.match(route, /verifyCanvasPlan/);
  assert.match(route, /runId/);
  assert.match(route, /agent:run_started/);
  assert.match(route, /agent:tool_call_start/);
  assert.match(route, /canvas:preview_node/);
  assert.match(route, /canvas:add_node/);
  assert.match(route, /canvas:update_node/);
  assert.match(route, /canvas:connect_edge/);
  assert.match(route, /canvas:focus_viewport/);
  assert.match(route, /canvas:run_node/);
  assert.match(route, /agent:plan_diff/);
  assert.match(route, /agent:run_node_status/);
  assert.match(route, /agent:run_done/);
  assert.match(route, /agent:verification/);
  assert.match(route, /GET \/api\/agent\/canvas\/runs\/:runId\/events/);

  assert.match(planUtil, /function createCanvasSnapshot/);
  assert.match(planUtil, /function normalizeCanvasPlan/);
  assert.match(planUtil, /function layoutCanvasPlan/);
  assert.match(planUtil, /function createPlanDiff/);
  assert.match(planUtil, /function scoreNodeQuality/);
  assert.doesNotMatch(planUtil, /IMAGE_MODEL_REGISTRY/);
  assert.doesNotMatch(planUtil, /VIDEO_MODEL_REGISTRY/);
  assert.match(planUtil, /function canvasPlanToActions/);
  assert.match(planUtil, /function verifyCanvasPlan/);
  assert.match(planUtil, /runNodeIds/);
  assert.match(planUtil, /focusViewport/);
});

test('agent canvas protocol supports driving modes and user questions', () => {
  const route = read('../backend/src/routes/agentCanvas.js');
  const tools = read('../tools/hakimi-mcp/src/tools.mjs');
  const api = read('../src/services/api.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const skill = read('../skills/hakimi-canvas-os/SKILL.md');
  const workflow = read('../skills/hakimi-canvas-os/references/workflow-planning.md');

  assert.match(route, /normalizeDrivingMode/);
  assert.match(route, /autopilot/);
  assert.match(route, /copilot/);
  assert.match(route, /approvalPolicy/);
  assert.match(route, /agent:phase/);
  assert.match(route, /agent:ask_user/);
  assert.match(route, /agent:user_answer/);
  assert.match(route, /router\.post\('\/runs\/:runId\/answers'/);
  assert.match(route, /router\.get\('\/runs\/:runId\/answers'/);
  assert.match(route, /ask_user/);

  assert.match(api, /submitAgentCanvasAnswer/);
  assert.match(api, /\/agent\/canvas\/runs\/\$\{encodeURIComponent\(runId\)\}\/answers/);
  assert.match(api, /getAgentCanvasSnapshot/);
  assert.match(api, /applyAgentCanvasPlan/);
  assert.match(api, /diffAgentCanvasPlan/);
  assert.match(api, /verifyAgentCanvasPlan/);
  assert.match(api, /\/agent\/canvas\/plans\/apply/);
  assert.match(api, /\/agent\/canvas\/plans\/diff/);
  assert.match(api, /\/agent\/canvas\/plans\/verify/);

  assert.match(tools, /drivingMode/);
  assert.match(tools, /approvalPolicy/);
  assert.match(tools, /ask_user/);
  assert.match(tools, /phase/);
  assert.match(tools, /run_node/);
  assert.match(tools, /hakimi_canvas_snapshot/);
  assert.match(tools, /hakimi_canvas_apply_plan/);
  assert.match(tools, /hakimi_canvas_diff_plan/);
  assert.match(tools, /hakimi_canvas_verify_plan/);

  assert.match(canvas, /agent:phase/);
  assert.match(canvas, /agent:plan_diff/);
  assert.match(canvas, /agent:run_node_status/);
  assert.match(canvas, /agent:ask_user/);
  assert.match(canvas, /canvas:run_node/);
  assert.match(canvas, /triggerRun/);
  assert.match(canvas, /自动驾驶/);
  assert.match(canvas, /副驾驶/);
  assert.match(canvas, /等待用户选择/);
  assert.match(canvas, /submitAgentCanvasAnswer/);
  assert.match(canvas, /t8-agent-activity__options/);

  assert.match(skill, /自动驾驶/);
  assert.match(skill, /副驾驶/);
  assert.match(skill, /ask_user/);
  assert.match(skill, /hakimi_canvas_snapshot/);
  assert.match(skill, /hakimi_canvas_diff_plan/);
  assert.match(skill, /hakimi_canvas_apply_plan/);
  assert.match(skill, /hakimi_canvas_verify_plan/);
  assert.match(workflow, /CanvasIntent/);
  assert.match(workflow, /CanvasPlan/);
  assert.match(workflow, /hakimi_canvas_diff_plan/);
  assert.match(workflow, /runNodeIds/);
});

test('agent canvas actions normalize displayable image and text node data', () => {
  const route = read('../backend/src/routes/agentCanvas.js');

  assert.match(route, /function normalizeAgentNodeData/);
  assert.match(route, /nodeType === 'image'/);
  assert.match(route, /imageUrl/);
  assert.match(route, /imageUrls/);
  assert.match(route, /nodeType === 'text'/);
  assert.match(route, /typeof next\.prompt !== 'string'/);
  assert.match(route, /typeof next\.text === 'string'/);
  assert.match(route, /ensureContentfulImageNodeData/);
  assert.match(route, /apiModel/);
  assert.match(route, /sizeLevel/);
  assert.match(route, /referenceImages/);
});

test('Hakimi MCP exposes an agent action runner for other agents', () => {
  const tools = read('../tools/hakimi-mcp/src/tools.mjs');
  const readme = read('../tools/hakimi-mcp/README.md');

  assert.match(tools, /hakimi_agent_run_actions/);
  assert.match(tools, /\/api\/agent\/canvas\/actions/);
  assert.match(tools, /hakimi_canvas_apply_plan/);
  assert.match(tools, /\/api\/agent\/canvas\/plans\/apply/);
  assert.match(tools, /preview_node/);
  assert.match(tools, /focus_viewport/);
  assert.match(readme, /hakimi_agent_run_actions/);
  assert.match(readme, /hakimi_canvas_snapshot/);
  assert.match(readme, /hakimi_canvas_diff_plan/);
  assert.match(readme, /hakimi_canvas_apply_plan/);
  assert.match(readme, /hakimi_canvas_verify_plan/);
  assert.match(readme, /CanvasPlan/);
  assert.match(readme, /Codex|Claude|LangGraph|agent/i);
});

test('frontend renders agent activity stream from realtime events', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const styles = read('../src/styles/index.css');

  assert.match(canvas, /agentActivityItems/);
  assert.match(canvas, /agentRunNodeMetaRef/);
  assert.match(canvas, /agent:tool_call_start/);
  assert.match(canvas, /agent:plan_diff/);
  assert.match(canvas, /agent:run_node_status/);
  assert.match(canvas, /canvas:preview_node/);
  assert.match(canvas, /agentRunNodeMetaRef\.current\.set\(nodeId/);
  assert.match(canvas, /!agentRunNodeMetaRef\.current\.has\(lastDone\.id\)/);
  assert.match(canvas, /submitAgentCanvasNodeResult/);
  assert.match(canvas, /t8-agent-activity/);
  assert.match(styles, /\.t8-agent-activity/);
  assert.match(styles, /\.t8-agent-cursor/);
});

test('frontend auto-dismisses transient agent activity cards', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /AGENT_ACTIVITY_DISMISS_MS/);
  assert.match(canvas, /setAgentActivityItems\(\(items\) => items\.filter/);
  assert.match(canvas, /item\.status === 'waiting'/);
  assert.match(canvas, /window\.setTimeout/);
  assert.match(canvas, /window\.clearTimeout/);
});

test('CanvasPlan utilities preserve real model ids, layout, diff, and score quality', () => {
  const {
    normalizeCanvasPlan,
    createPlanDiff,
    scoreNodeQuality,
    verifyCanvasPlan,
  } = require('../backend/src/utils/canvasPlan.js');

  const canvas = {
    nodes: [{ id: 'source-1', type: 'upload', position: { x: 100, y: 80 }, data: { label: '参考图', imageUrl: '/a.png' } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  const normalized = normalizeCanvasPlan({
    nodes: [
      {
        id: 'variant-a',
        type: 'image',
        data: {
          label: 'A 版',
          prompt: '基于参考图做童装印花变体',
          model: 'missing-model',
          apiModel: 'bad-api',
          aspectRatio: 'bad-ratio',
          referenceImages: ['/a.png', '/b.png'],
          sourceNodeId: 'source-1',
        },
      },
      {
        id: 'review-a',
        type: 'text',
        data: { label: '复核', text: '商业童装印花建议：保留可爱图形，下一步对比色彩。' },
      },
      {
        id: 'motion-a',
        type: 'video',
        data: {
          label: '视频预览',
          prompt: '把印花变体做成童装动态展示',
          model: 'veo3.1',
          apiModel: 'bad-video-api',
          aspectRatio: '1:1',
          duration: 99,
          sourceNodeId: 'variant-a',
        },
      },
    ],
    edges: [{ source: 'source-1', target: 'variant-a' }, { source: 'variant-a', target: 'review-a' }, { source: 'variant-a', target: 'motion-a' }],
    runNodeIds: ['variant-a', 'motion-a'],
    verification: [{ id: 'review-score' }],
  }, {
    beforeSnapshot: {
      nodeCount: 1,
      bounds: { minX: 100, minY: 80, maxX: 100, maxY: 80 },
      nodes: [{ id: 'source-1', type: 'upload' }],
    },
    autoLayout: true,
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.plan.nodes[0].data.model, 'bad-api');
  assert.equal(normalized.plan.nodes[0].data.apiModel, 'bad-api');
  assert.equal(normalized.plan.nodes[0].data.aspectRatio, 'bad-ratio');
  assert.ok(normalized.plan.nodes[0].position.x > 100);
  assert.equal(normalized.plan.nodes[2].data.mainId, '');
  assert.equal(normalized.plan.nodes[2].data.model, 'bad-video-api');
  assert.equal(normalized.plan.nodes[2].data.apiModel, 'bad-video-api');
  assert.equal(normalized.plan.nodes[2].data.ratio, '1:1');
  assert.equal(normalized.plan.nodes[2].data.duration, 99);
  assert.equal(normalized.warnings.length, 0);

  const diff = createPlanDiff(canvas, normalized.plan);
  assert.equal(diff.addNodes.length, 3);
  assert.match(diff.summary, /新增 3 节点/);

  const quality = scoreNodeQuality(normalized.plan.nodes[0]);
  assert.ok(quality.score >= 70);

  const afterCanvas = {
    ...canvas,
    nodes: [...canvas.nodes, ...normalized.plan.nodes],
    edges: normalized.plan.edges,
  };
  const verification = verifyCanvasPlan(afterCanvas, normalized.plan, { nodeCount: 1 });
  assert.equal(verification.ok, true);
  assert.ok(verification.quality.find((item: any) => item.nodeId === 'variant-a'));
  assert.ok(verification.checks.find((item: any) => item.id === 'skill:review-score'));
});

test('CanvasPlan preserves exact generation parameters on updates', () => {
  const { normalizeCanvasPlan } = require('../backend/src/utils/canvasPlan.js');
  const normalized = normalizeCanvasPlan({
    updates: [{
      nodeId: 'image-existing',
      data: { model: 'missing', apiModel: 'missing', aspectRatio: 'missing', prompt: '更新提示词' },
    }],
  }, {
    beforeSnapshot: {
      nodes: [{ id: 'image-existing', type: 'image' }],
    },
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.plan.updates[0].data.model, 'missing');
  assert.equal(normalized.plan.updates[0].data.apiModel, 'missing');
  assert.equal(normalized.plan.updates[0].data.aspectRatio, 'missing');
});

test('CanvasPlan verification distinguishes pending, completed, and broken generation output', () => {
  const { verifyCanvasPlan } = require('../backend/src/utils/canvasPlan.js');
  const plan = { runNodeIds: ['image-a'] };
  const pending = verifyCanvasPlan({
    nodes: [{ id: 'image-a', type: 'image', data: { prompt: 'a', model: 'gpt-image-2', status: 'running' } }],
    edges: [],
  }, plan, null);
  assert.equal(pending.checks.find((item: any) => item.id === 'result:image-a')?.pending, true);
  assert.equal(pending.ok, true);

  const completed = verifyCanvasPlan({
    nodes: [{ id: 'image-a', type: 'image', data: { prompt: 'a', model: 'gpt-image-2', status: 'success', imageUrl: '/result.png' } }],
    edges: [],
  }, plan, null);
  assert.equal(completed.checks.find((item: any) => item.id === 'result:image-a')?.ok, true);

  const broken = verifyCanvasPlan({
    nodes: [{ id: 'image-a', type: 'image', data: { prompt: 'a', model: 'gpt-image-2', status: 'success' } }],
    edges: [],
  }, plan, null);
  assert.equal(broken.checks.find((item: any) => item.id === 'result:image-a')?.ok, false);
  assert.equal(broken.ok, false);
});

test('agent canvas apply persists an undoable operation batch', () => {
  const route = read('../backend/src/routes/agentCanvas.js');

  assert.match(route, /function persistOperationBatch/);
  assert.match(route, /operationBatchId/);
  assert.match(route, /router\.post\('\/operations\/:operationBatchId\/undo'/);
  assert.match(route, /agent:operation_undone/);
  assert.match(route, /beforeCanvas/);
});

test('node results trigger asynchronous plan verification and at most one targeted repair', () => {
  const {
    shouldAutoRepairNodeResult,
  } = require('../backend/src/utils/canvasPlan.js');
  const route = read('../backend/src/routes/agentCanvas.js');
  const canvas = read('../src/components/Canvas.tsx');

  assert.equal(shouldAutoRepairNodeResult({
    ok: true,
    node: { type: 'image', data: { status: 'success' } },
  }, { alreadyRetried: false }).repair, true);
  assert.equal(shouldAutoRepairNodeResult({
    ok: false,
    error: 'unsupported aspect ratio',
    node: { type: 'video', data: { status: 'error' } },
  }, { alreadyRetried: false }).repair, true);
  assert.equal(shouldAutoRepairNodeResult({
    ok: false,
    error: 'user cancelled generation',
    node: { type: 'image', data: { status: 'error' } },
  }, { alreadyRetried: false }).repair, false);
  assert.equal(shouldAutoRepairNodeResult({
    ok: true,
    node: { type: 'image', data: { status: 'success' } },
  }, { alreadyRetried: true }).repair, false);

  assert.match(route, /findOperationBatchByRunId/);
  assert.match(route, /agent:verification/);
  assert.match(route, /agent:repair_started/);
  assert.match(route, /retryNodeIds/);
  assert.match(route, /plan:\s*normalized\.plan/);
  assert.match(route, /agent-node-result-sync/);
  assert.match(canvas, /agent:repair_started/);
  assert.match(canvas, /agent:verification/);
});

test('frontend exposes one-click undo for a completed Codex operation batch', () => {
  const api = read('../src/services/api.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const styles = read('../src/styles/index.css');

  assert.match(api, /undoAgentCanvasOperationBatch/);
  assert.match(api, /operations\/\$\{encodeURIComponent\(operationBatchId\)\}\/undo/);
  assert.match(canvas, /operationBatchId/);
  assert.match(canvas, /handleAgentOperationUndo/);
  assert.match(canvas, /撤销本轮/);
  assert.match(styles, /\.t8-agent-activity__undo/);
});

test('frontend coalesces agent events into a stable item timeline', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /timelineKey/);
  assert.match(canvas, /agentActivityTimelineKey/);
  assert.match(canvas, /item\.timelineKey === nextItem\.timelineKey/);
  assert.match(canvas, /agent:operation_undone/);
  assert.match(canvas, /agent:verification_error/);
});

test('CanvasPlan layout reserves measured space and supports explicit layout intent', () => {
  const { layoutCanvasPlan } = require('../backend/src/utils/canvasPlan.js');
  const plan = layoutCanvasPlan({
    layoutIntent: { direction: 'left-to-right', columnGap: 420, rowGap: 280 },
    nodes: [
      { id: 'source-a', type: 'upload', data: { variantLane: 'source' } },
      { id: 'variant-a', type: 'image', data: { variantLane: 'variant' } },
      { id: 'variant-b', type: 'image', data: { variantLane: 'variant' } },
    ],
  }, {
    bounds: { minX: 0, minY: 0, maxX: 900, maxY: 500 },
  }, { autoLayout: true });

  assert.ok(plan.nodes[0].position.x >= 1320);
  assert.ok(plan.nodes[1].position.x - plan.nodes[0].position.x >= 420);
  assert.ok(plan.nodes[2].position.y - plan.nodes[1].position.y >= 280);
  assert.equal(plan.layoutResolved.direction, 'left-to-right');
});

test('project ships reusable Hakimi skills for non-Codex agents', () => {
  const root = join(testDir, '..', 'skills');
  const expected = [
    'hakimi-canvas-os',
    'hakimi-canvas-control',
    'hakimi-image-workflow',
    'hakimi-video-workflow',
    'hakimi-apparel-design',
  ];

  for (const name of expected) {
    const skillPath = join(root, name, 'SKILL.md');
    assert.equal(existsSync(skillPath), true, `${name} SKILL.md should exist`);
    const skill = read(`../skills/${name}/SKILL.md`);
    assert.match(skill, new RegExp(`name:\\s*"?${name}"?`));
    assert.match(skill, /description:/);
    assert.match(skill, /Hakimi|画布|agent|MCP/i);
  }
});

test('Hakimi canvas OS skill routes large workflow knowledge by module', () => {
  const root = join(testDir, '..', 'skills', 'hakimi-canvas-os');
  const skill = read('../skills/hakimi-canvas-os/SKILL.md');
  const references = [
    'canvas-control.md',
    'image-workflow.md',
    'apparel-design.md',
    'workflow-planning.md',
    'design-planning.md',
    'video-workflow.md',
  ];

  assert.match(skill, /name:\s*hakimi-canvas-os/);
  assert.match(skill, /Routing|路由/i);
  assert.match(skill, /references\/canvas-control\.md/);
  assert.match(skill, /references\/image-workflow\.md/);
  assert.match(skill, /references\/apparel-design\.md/);
  assert.match(skill, /references\/workflow-planning\.md/);
  assert.match(skill, /references\/design-planning\.md/);
  assert.match(skill, /hakimi_canvas_diff_plan/);
  assert.match(skill, /type:\s*"image"/);
  assert.match(skill, /imageUrl/);

  for (const ref of references) {
    const refPath = join(root, 'references', ref);
    assert.equal(existsSync(refPath), true, `${ref} should exist`);
  }

  for (const name of ['hakimi-canvas-control', 'hakimi-image-workflow', 'hakimi-apparel-design']) {
    const wrapper = read(`../skills/${name}/SKILL.md`);
    assert.match(wrapper, /hakimi-canvas-os/);
  }
});

test('Hakimi canvas OS keeps Lovart-inspired command discipline and node-native model routing', () => {
  const skill = read('../skills/hakimi-canvas-os/SKILL.md');
  const workflow = read('../skills/hakimi-canvas-os/references/workflow-planning.md');
  const design = read('../skills/hakimi-canvas-os/references/design-planning.md');
  const apparel = read('../skills/hakimi-canvas-os/references/apparel-design.md');

  assert.match(skill, /Lovart-style command discipline/);
  assert.match(skill, /recordId\/canvasId\/threadId/);
  assert.match(skill, /Model routing is node-native/);
  assert.match(skill, /streamed-delivery/);
  assert.match(workflow, /One execution surface/);
  assert.match(workflow, /Watchable progress/);
  assert.match(workflow, /Artifact readback/);
  assert.match(workflow, /Soft model preference/);
  assert.match(design, /Design Kit Pattern/);
  assert.match(design, /Model Routing/);
  assert.match(design, /deliverable manifest/);
  assert.match(apparel, /modelShotType/);
  assert.match(apparel, /identity generic|authorized reference/);
});
