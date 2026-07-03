import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

function readOptional(rel: string) {
  try {
    return read(rel);
  } catch {
    return '';
  }
}

function makeLocalZip(entries: Record<string, string>) {
  const chunks: Buffer[] = [];
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const body = Buffer.from(content, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(0, 10);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    chunks.push(header, nameBuffer, body);
  }
  return Buffer.concat(chunks);
}

test('Codex CLI Agent is registered as a creator-facing canvas node', () => {
  const types = read('../src/types/canvas.ts');
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const sidebar = read('../src/components/Sidebar.tsx');
  const features = read('../features.json');

  assert.match(types, /'codex-cli-agent'/);
  assert.match(types, /'codex'/);
  assert.match(registry, /type:\s*'codex-cli-agent'[\s\S]*label:\s*'Codex CLI Agent'[\s\S]*category:\s*'codex'/);
  assert.match(registry, /codex:\s*\{\s*label:\s*'CODEX CLI'/);
  assert.match(ports, /'codex-cli-agent':\s*\{\s*inputs:\s*\['text', 'image', 'video', 'audio'\],\s*outputs:\s*\['text', 'image', 'video', 'audio', 'model3d'\]/);
  assert.match(canvas, /CodexCliAgentNode/);
  assert.match(canvas, /import\('\.\/nodes\/CodexCliAgentNode'\)/);
  assert.match(canvas, /'codex-cli-agent': CodexCliAgentNode/);
  assert.match(sidebar, /'codex-cli-agent': 'TerminalSquare'/);
  assert.match(features, /codexCliCreatorAgent/);
  assert.match(features, /Codex CLI Agent/);
  assert.match(features, /Codex CLI 创作者 Agent 节点/);
});

test('Codex CLI Agent studio derives readable text colors for themed controls', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');
  const palette = readOptional('../src/utils/readableStudioPalette.ts');

  assert.match(palette, /createReadableStudioPalette/);
  assert.match(palette, /readableTextOn/);
  assert.match(node, /createReadableStudioPalette/);
  assert.match(node, /readableTextOn/);
  assert.match(node, /studioAccentText/);
  assert.match(node, /studioHeaderText/);
  assert.match(node, /const activeControlText = readableTextOn\(accent, isDark\)/);
  assert.match(node, /segmentedControlButtonStyle/);
  assert.match(node, /\.\.\.segmentedControlButtonStyle\(active\)/);
  assert.match(node, /style=\{segmentedControlButtonStyle\(artifactLibraryTab === 'image'\)\}/);
  assert.match(node, /style=\{segmentedControlButtonStyle\(artifactLibraryTab === 'text'\)\}/);
  assert.doesNotMatch(node, /artifactLibraryTab === 'image' \? activeControlText : inactiveControlText/);
  assert.doesNotMatch(node, /artifactLibraryTab === 'text' \? activeControlText : inactiveControlText/);
  assert.doesNotMatch(node, /color:\s*active \? activeControlText : inactiveControlText/);
  assert.doesNotMatch(palette, /accentText:\s*PIXEL_INVERSE_TEXT/);
  assert.doesNotMatch(palette, /headerText:\s*PIXEL_TEXT/);
  assert.doesNotMatch(node, /color:\s*isDark \? '#04111f' : '#fff'/);
});

test('Codex CLI backend exposes status, skill, workspace, and streaming routes', () => {
  const server = read('../backend/src/server.js');
  const route = read('../backend/src/routes/codexCli.js');
  const service = read('../src/services/codexCli.ts');

  assert.match(server, /const codexCliRouter = require\('\.\/routes\/codexCli'\)/);
  assert.match(server, /app\.use\('\/api\/codex-cli', codexCliRouter\)/);
  assert.match(route, /router\.get\('\/status'/);
  assert.match(route, /router\.post\('\/login\/start'/);
  assert.match(route, /router\.get\('\/skills'/);
  assert.match(route, /router\.post\('\/skills\/project'/);
  assert.match(route, /router\.put\('\/skills\/project\/:name'/);
  assert.match(route, /router\.delete\('\/skills\/project\/:name'/);
  assert.match(route, /router\.post\('\/agent\/stream'/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /startSseHeartbeat/);
  assert.match(route, /event:\s*'heartbeat'|sendSse\(res,\s*'heartbeat'/);
  assert.match(route, /turn\.started/);
  assert.match(route, /message\.delta/);
  assert.match(route, /artifact\.completed/);
  assert.match(route, /tool\.progress/);
  assert.match(route, /turn\.failed/);
  assert.match(route, /event:\s*'done'|sendSse\(res,\s*'done'/);
  assert.match(route, /req\.on\('close'/);
  assert.match(route, /signal:/);
  assert.match(service, /streamCodexCliAgent/);
  assert.match(service, /startCodexCliLogin/);
  assert.match(service, /command\?: string/);
  assert.match(service, /scriptPath\?: string/);
  assert.match(service, /getCodexCliSkills/);
  assert.match(service, /createCodexProjectSkill/);
  assert.match(service, /updateCodexProjectSkill/);
  assert.match(service, /deleteCodexProjectSkill/);
  assert.match(service, /extractCodexStreamDeltaForTests/);
  assert.match(service, /codexRouteMissingMessageForTests/);
  assert.match(service, /Codex SDK 后端路由未加载/);
  assert.match(service, /Codex SDK 会话接口未加载/);
  assert.match(service, /Codex skills 接口未加载/);
  assert.match(service, /codexRouteMissingMessageForTests\(res\.status,\s*url\)/);
});

test('Codex CLI backend exposes a guarded global sidebar session API', () => {
  const route = read('../backend/src/routes/codexCli.js');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const service = read('../src/services/codexCli.ts');

  assert.match(route, /router\.get\('\/sessions\/global'/);
  assert.match(route, /probeCodexSdkStatus[\s\S]*getGlobalCodexSessionStatus/);
  assert.match(route, /router\.post\('\/sessions\/global\/open'/);
  assert.match(route, /router\.post\('\/sessions\/global\/stop'/);
  assert.match(route, /router\.post\('\/sessions\/global\/answer'/);
  assert.match(route, /router\.post\('\/sessions\/global\/message\/stream'/);
  assert.match(route, /codexSdkManager/);
  assert.doesNotMatch(route, /runCodexExecStream/);
  assert.match(manager, /GLOBAL_CODEX_SESSION_ID\s*=\s*'global-codex'/);
  assert.match(manager, /transport:\s*'sdk'/);
  assert.match(manager, /codex_sdk_session_busy/);
  assert.match(manager, /validateCodexSessionPermission/);
  assert.match(manager, /import\('@openai\/codex-sdk'\)/);
  assert.match(manager, /codex\.startThread/);
  assert.match(manager, /codex\.resumeThread/);
  assert.match(manager, /thread\.runStreamed/);
  assert.match(manager, /respondToCodexServerRequest/);
  assert.match(manager, /DEFAULT_TURN_TIMEOUT_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
  assert.doesNotMatch(manager, /appClient\.request|app-server|turn\/start|taskkill/);
  assert.match(service, /getGlobalCodexSession/);
  assert.match(service, /openGlobalCodexSession/);
  assert.match(service, /stopGlobalCodexSession/);
  assert.match(service, /streamGlobalCodexSessionMessage/);
});

test('Codex SDK manager validates permissions and normalizes stream events', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');

  const defaultPermission = manager.validateCodexSessionPermission({});
  assert.equal(defaultPermission.permissionPreset, 'canvas');
  assert.equal(defaultPermission.sandbox, 'workspace-write');
  assert.equal(defaultPermission.approvalPolicy, 'never');

  assert.throws(
    () => manager.validateCodexSessionPermission({ sandbox: 'danger-full-access', approvalPolicy: 'never' }),
    /完全权限/,
  );
  assert.throws(
    () => manager.validateCodexSessionPermission({ sandbox: 'workspace-write', approvalPolicy: 'bad-policy' }),
    /approvalPolicy/,
  );

  const state = { messageTextByItemId: new Map(), reasoningTextByItemId: new Map() };
  assert.deepEqual(
    manager.mapSdkEventForTests({ type: 'item.updated', item: { id: 'msg-1', type: 'agent_message', text: '你好' } }, state),
    { type: 'message.delta', channel: 'assistant', visibility: 'user', delta: '你好', text: '你好', fullText: '你好', itemId: 'msg-1', itemType: 'agent_message', status: 'running', rawType: 'item.updated' },
  );
  assert.match(
    manager.mapSdkEventForTests({ type: 'item.updated', item: { id: 'todo-1', type: 'todo_list', items: [{ text: '读取画布', completed: false }] } }, state).type,
    /plan\.updated/,
  );
  const status = manager.getGlobalCodexSessionStatus();
  assert.equal(status.transport, 'sdk');
  assert.equal(status.sessionId, 'global-codex');
});

test('Codex SDK manager follows streamed item contracts without JSON-RPC requests', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');
  const source = read('../backend/src/utils/codexSdkManager.js');
  const state = { messageTextByItemId: new Map(), reasoningTextByItemId: new Map() };

  assert.equal(
    manager.mapSdkEventForTests({ type: 'item.updated', item: { id: 'r1', type: 'reasoning', text: '需要核对节点' } }, state).type,
    'reasoning.delta',
  );
  const tool = manager.mapSdkEventForTests({ type: 'item.started', item: { id: 'tool-1', type: 'mcp_tool_call', server: 'hakimi_http', tool: 'hakimi_canvas_diff_plan', arguments: {}, status: 'in_progress' } }, state);
  assert.equal(tool.type, 'tool.call');
  assert.equal(tool.toolName, 'hakimi_http.hakimi_canvas_diff_plan');
  assert.match(tool.message, /预演画布计划/);
  assert.match(source, /runStreamed/);
  assert.doesNotMatch(source, /appClient\.request|thread\/start|turn\/start/);
});

test('Codex SDK answer expiration is structured and never implies a fake prompt fallback', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');

  const result = manager.respondToCodexServerRequest({ requestId: 'missing-request', answer: '继续' });
  assert.equal(result.unsupported, true);
  assert.match(result.message, /Codex SDK/);

  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  assert.doesNotMatch(sidebar, /已按同一记录继续发送选择/);
  assert.doesNotMatch(sidebar, /sendPrompt\(`我选择/);
  assert.match(sidebar, /handleAskExpired/);
  assert.match(sidebar, /serverRequest\.resolved/);
});

test('Codex global sidebar is mounted from App with session controls and theme tokens', () => {
  const app = read('../src/App.tsx');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = read('../src/styles/theme-core.css');

  assert.match(app, /CodexAgentSidebar/);
  assert.match(app, /codexSidebarOpen/);
  assert.match(app, /title="Codex 侧边栏"/);
  assert.match(sidebar, /useCanvasStore/);
  assert.match(sidebar, /只读观察/);
  assert.match(sidebar, /画布协作/);
  assert.match(sidebar, /自动驾驶/);
  assert.match(sidebar, /完全权限/);
  assert.match(sidebar, /副驾驶/);
  assert.match(sidebar, /streamGlobalCodexSessionMessage/);
  assert.match(sidebar, /stopGlobalCodexSession/);
  assert.match(sidebar, /var\(--t8-bg-panel/);
  assert.match(styles, /\.codex-agent-sidebar/);
  assert.match(styles, /--t8-bg-panel/);
});

test('Codex global sidebar wires real skills, reference upload, mentions, stop, and resizing', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = read('../src/styles/theme-core.css');
  const service = read('../src/services/codexCli.ts');

  assert.match(sidebar, /今天一起创作点什么/);
  assert.match(sidebar, /getCodexCliSkills/);
  assert.match(sidebar, /type\s+CodexSkill/);
  assert.match(service, /directions\?:\s*CodexSkillDirection\[\]/);
  assert.match(sidebar, /codexSkills/);
  assert.match(sidebar, /isProjectCodexSkill/);
  assert.match(sidebar, /INTERNAL_CANVAS_SKILL_NAMES/);
  assert.match(sidebar, /businessSkills/);
  assert.match(sidebar, /isVisibleBusinessSkill/);
  assert.match(sidebar, /\.\.\.internalCanvasSkillNames/);
  assert.match(sidebar, /skill\.scope\s*===\s*'project'/);
  assert.match(sidebar, /displaySkillLabel/);
  assert.match(sidebar, /displaySkillHint/);
  assert.match(sidebar, /项目 Skills/);
  assert.match(sidebar, /服装设计/);
  assert.match(sidebar, /画布控制/);
  assert.match(sidebar, /saveCanvasData/);
  assert.match(sidebar, /publishReferenceImageToCanvas/);
  assert.match(sidebar, /referenceSearchOpen/);
  assert.match(sidebar, /codex-agent-sidebar__research-popover/);
  assert.doesNotMatch(sidebar, /<details className="codex-agent-sidebar__research-panel"/);
  assert.match(sidebar, /getResourceItems/);
  assert.match(sidebar, /mentionAssets/);
  assert.match(sidebar, /findMediaMentionQuery/);
  assert.match(sidebar, /handlePromptChange/);
  assert.match(sidebar, /syncPromptMentionQuery/);
  assert.match(sidebar, /selectMentionItem/);
  assert.match(sidebar, /selectedMentionAssets/);
  assert.match(sidebar, /codex-agent-sidebar__mention-chip/);
  assert.match(sidebar, /sidebarWidth/);
  assert.match(sidebar, /composerHeight/);
  assert.match(sidebar, /startSidebarResize/);
  assert.match(sidebar, /startComposerResize/);
  assert.match(sidebar, /codex-agent-sidebar__stop-btn/);
  assert.match(sidebar, /conversationRecords/);
  assert.match(sidebar, /createConversationRecord/);
  assert.match(sidebar, /reuseConversationRecord/);
  assert.match(sidebar, /Codex 记录/);
  assert.match(sidebar, /Codex SDK 执行器/);
  assert.match(sidebar, /刷新 Codex SDK 状态|刷新状态/);
  assert.doesNotMatch(sidebar, /title="打开 CLI"/);
  assert.doesNotMatch(sidebar, /const SKILL_BOOK/);
  assert.doesNotMatch(sidebar, /电商套图/);
  assert.doesNotMatch(sidebar, /爆款实验室/);
  assert.match(sidebar, /codex-agent-sidebar__hero/);
  assert.match(sidebar, /codex-agent-sidebar__mascot-face/);
  assert.match(sidebar, /codex-agent-sidebar__composer-card/);
  assert.match(sidebar, /codex-agent-sidebar__pref-popover/);
  assert.match(sidebar, /codex-agent-sidebar__inline-error/);
  assert.doesNotMatch(sidebar, /error && <div className="codex-agent-sidebar__error"/);
  assert.match(sidebar, /Agent/);
  assert.match(sidebar, /Ask/);
  assert.match(sidebar, /Auto/);
  assert.match(sidebar, /codexModel/);
  assert.match(sidebar, /reasoningEffort/);
  assert.match(sidebar, /GPT-5\.5/);
  assert.match(sidebar, /推理强度/);
  assert.match(sidebar, /askOptions/);
  assert.match(sidebar, /answerGlobalCodexSessionRequest/);
  assert.match(sidebar, /historyOpen/);
  assert.match(sidebar, /referenceImages/);
  assert.match(sidebar, /diagnosticLogs/);
  assert.match(sidebar, /appendDiagnosticLog/);
  assert.match(sidebar, /DIAGNOSTIC_LOG_TTL_MS/);
  assert.match(sidebar, /expiresAt:\s*shouldExpireDiagnosticLog/);
  assert.match(sidebar, /setDiagnosticLogs\(\(prev\)\s*=>\s*prev\.filter\(\(item\)\s*=>\s*!item\.expiresAt/);
  assert.match(sidebar, /diagnosticsOpen/);
  assert.match(sidebar, /reasoning\.delta/);
  assert.match(sidebar, /tool\.call/);
  assert.match(sidebar, /type MessageRole = 'user' \| 'assistant' \| 'process'/);
  assert.match(sidebar, /appendProcessStep/);
  assert.match(sidebar, /processCollapsedById/);
  assert.match(sidebar, /思考流程/);
  assert.match(sidebar, /data-role=\{item\.role === 'process' \? 'process' : item\.role\}/);
  assert.doesNotMatch(sidebar, /执行流/);
  assert.doesNotMatch(sidebar, /回复流/);
  assert.doesNotMatch(sidebar, /codex-agent-sidebar__stream-tabs/);
  assert.match(sidebar, /uploadFile/);
  assert.match(sidebar, /mentionOpen/);
  assert.match(sidebar, /canvasInfoOpen/);
  assert.match(sidebar, /getCanvasData/);
  assert.match(sidebar, /closeFloatingPanels/);
  assert.match(sidebar, /height:\s*composerHeight/);
  assert.match(sidebar, /codex-agent-sidebar__history-popover/);
  assert.match(sidebar, /codex-agent-sidebar__reference-strip/);
  assert.match(sidebar, /codex-agent-sidebar__mention-popover/);
  assert.match(sidebar, /codex-agent-sidebar__mention-grid/);
  assert.match(sidebar, /codex-agent-sidebar__mention-thumb/);
  assert.match(sidebar, /codex-agent-sidebar__canvas-info/);
  assert.match(sidebar, /codex-agent-sidebar__diagnostics/);
  assert.match(sidebar, /codex-agent-sidebar__quick-panel/);
  assert.match(sidebar, /上传后已添加到当前画布/);
  assert.doesNotMatch(sidebar, /const SKILL_DIRECTIONS/);
  assert.doesNotMatch(sidebar, /全套 8 图|UGC 生活化|亚马逊适配/);
  assert.match(styles, /\.codex-agent-sidebar__hero/);
  assert.match(styles, /\.codex-agent-sidebar__mascot-face/);
  assert.match(styles, /\.codex-agent-sidebar__skill-directions/);
  assert.match(styles, /\.codex-agent-sidebar__direction-chipbar/);
  assert.match(styles, /\.codex-agent-sidebar__mention-chip/);
  assert.match(styles, /\.codex-agent-sidebar__anchored-popover/);
  assert.match(styles, /\.codex-agent-sidebar__ask-options/);
  assert.match(styles, /\.codex-agent-sidebar__messages article\[data-role="process"\]/);
  assert.match(styles, /\.codex-agent-sidebar__process-steps/);
  assert.match(styles, /\.codex-agent-sidebar__composer-card/);
  assert.match(styles, /\.codex-agent-sidebar__history-popover/);
  assert.match(styles, /\.codex-agent-sidebar__reference-strip/);
  assert.match(styles, /\.codex-agent-sidebar__mention-popover/);
  assert.match(styles, /\.codex-agent-sidebar__mention-grid/);
  assert.match(styles, /\.codex-agent-sidebar__mention-thumb/);
  assert.match(styles, /\.codex-agent-sidebar__resize-handle/);
  assert.match(styles, /\.codex-agent-sidebar__composer-resize/);
  assert.match(styles, /\.codex-agent-sidebar__record-actions/);
  assert.match(styles, /-webkit-line-clamp:\s*1/);
  assert.match(styles, /\.codex-agent-sidebar__canvas-info/);
  assert.match(styles, /\.codex-agent-sidebar__diagnostics/);
  assert.match(styles, /\.codex-agent-sidebar__quick-panel/);
  assert.match(styles, /\.codex-agent-sidebar__message-meta/);
  assert.match(styles, /\.codex-agent-sidebar__message-icon/);
  assert.match(styles, /cursor:\s*ew-resize/);
  assert.match(styles, /cursor:\s*ns-resize/);
});

test('Codex sidebar skill schema exposes questions, canvas templates, and verification metadata', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const service = read('../src/services/codexCli.ts');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-skill-sidebar-schema-'));
  const skillDir = path.join(root, 'hakimi-test-skill');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: hakimi-test-skill',
    'description: 测试侧栏 schema',
    'category: Hakimi',
    '---',
    '',
    '# 测试 Skill',
    '',
    '## Sidebar Directions',
    '- `plan` | 规划流程 | 先读画布再拆动作',
    '',
    '## Sidebar Questions',
    '- `variant-count` | 需要几套变体？ | 2 套 / 4 套 / 6 套 | 4 套',
    '',
    '## Sidebar Canvas Templates',
    '- `image-flow` | 生图流程 | reference -> image -> review -> focus',
    '',
    '## Sidebar Verification',
    '- `image-node-data` | 图像节点参数 | 检查 prompt/model/apiModel/referenceImages',
    '',
  ].join('\n'), 'utf8');

  const listed = runner.listCodexSkills({ roots: [root], workspaceDir: '' });
  const skill = listed.find((item: any) => item.name === 'hakimi-test-skill');

  assert.equal(skill.questions[0].id, 'variant-count');
  assert.equal(skill.questions[0].label, '需要几套变体？');
  assert.deepEqual(skill.questions[0].options, ['2 套', '4 套', '6 套']);
  assert.equal(skill.questions[0].recommended, '4 套');
  assert.equal(skill.templates[0].id, 'image-flow');
  assert.equal(skill.templates[0].flow, 'reference -> image -> review -> focus');
  assert.equal(skill.verification[0].id, 'image-node-data');
  assert.match(service, /export interface CodexSkillQuestion/);
  assert.match(service, /questions\?:\s*CodexSkillQuestion\[\]/);
  assert.match(service, /templates\?:\s*CodexSkillCanvasTemplate\[\]/);
  assert.match(service, /verification\?:\s*CodexSkillVerificationItem\[\]/);
});

test('Bundled Hakimi sidebar skills include workflow questions, templates, and verification hints', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const listed = runner.listCodexSkills({ roots: [path.resolve('skills')], workspaceDir: path.resolve('.') });
  const hakimiSkills = listed.filter((item: any) => /^hakimi-/.test(item.name));

  assert.ok(hakimiSkills.length >= 4);
  for (const skill of hakimiSkills) {
    assert.ok(Array.isArray(skill.directions), `${skill.name} directions missing`);
    assert.ok(Array.isArray(skill.questions), `${skill.name} questions missing`);
    assert.ok(Array.isArray(skill.templates), `${skill.name} templates missing`);
    assert.ok(Array.isArray(skill.verification), `${skill.name} verification missing`);
  }
  assert.ok(hakimiSkills.some((skill: any) => skill.templates.some((item: any) => /image|生图|图像/i.test(`${item.id} ${item.label}`))));
  assert.ok(hakimiSkills.some((skill: any) => skill.templates.some((item: any) => /video|视频|分镜/i.test(`${item.id} ${item.label}`))));
});

test('Codex sidebar skill roots resolve SDK workspaces back to project skills', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const appServerWorkspace = path.resolve('data/codex-workspaces/global-codex');
  mkdirSync(appServerWorkspace, { recursive: true });

  const skillWorkspace = runner.resolveProjectSkillWorkspaceDir(appServerWorkspace, 'childrenswear-print-workflow');
  const roots = runner.projectSkillRootsForWorkspace(appServerWorkspace);
  const listed = runner.listCodexSkills({ workspaceDir: skillWorkspace, roots });
  const childrenswear = listed.find((item: any) => item.name === 'childrenswear-print-workflow');

  assert.equal(skillWorkspace, path.resolve('.'));
  assert.ok(roots.some((root: string) => path.resolve(root) === path.resolve('.agents/skills')));
  assert.equal(childrenswear?.scope, 'project');
});

test('Childrenswear sidebar skill defines canvas plan quality gates', () => {
  const skill = read('../.agents/skills/childrenswear-print-workflow/SKILL.md');

  assert.match(skill, /Canvas Agent Workflow/);
  assert.match(skill, /hakimi_canvas_snapshot/);
  assert.match(skill, /CanvasPlan/);
  assert.match(skill, /runNodeIds/);
  assert.match(skill, /hakimi_canvas_verify_plan/);
  assert.match(skill, /commercial-core/);
  assert.match(skill, /hero-print/);
  assert.match(skill, /placement-graphic/);
  assert.match(skill, /series-extension/);
  assert.match(skill, /variant-quality/);
  assert.match(skill, /review-score/);
});

test('Codex sidebar sends structured canvas intent, independent generation preferences, mentions, and record context', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const service = read('../src/services/codexCli.ts');

  assert.match(service, /export interface CodexGenerationPreferences/);
  assert.match(service, /export interface CodexCanvasIntent/);
  assert.match(service, /generationPreferences\?:\s*CodexGenerationPreferences/);
  assert.match(service, /canvasIntent\?:\s*CodexCanvasIntent/);
  assert.match(service, /canvasRuntimeContext\?:\s*string/);
  assert.match(service, /mentions\?:/);
  assert.match(service, /recordId\?:\s*string/);
  assert.match(sidebar, /buildCanvasIntent/);
  assert.match(sidebar, /buildCanvasRuntimeContext/);
  assert.match(sidebar, /buildCanvasPlanPreference/);
  assert.match(sidebar, /generationPreferences/);
  assert.match(sidebar, /prompt:\s*resolvedPromptText/);
  assert.match(sidebar, /canvasRuntimeContext:\s*buildCanvasRuntimeContext/);
  assert.doesNotMatch(sidebar, /prompt:\s*buildCanvasPrompt/);
  assert.match(sidebar, /selectedSkillName:\s*selectedSkill\?\.name/);
  assert.match(sidebar, /selectedDirectionId:\s*selectedDirection\?\.id/);
  assert.match(sidebar, /canvasIntent/);
  assert.match(sidebar, /canvasPlanPreference/);
  assert.match(sidebar, /recordId:\s*targetRecordId/);
  assert.match(sidebar, /mentions:\s*resolvedMentions/);
  assert.match(sidebar, /compactRecordMessages/);
  assert.match(sidebar, /RECORD_MESSAGE_LIMIT/);
  assert.match(sidebar, /window\.setTimeout\(\(\) => \{/);
  assert.match(sidebar, /imageModel/);
  assert.match(sidebar, /imageAspectRatio/);
  assert.match(sidebar, /imageSize/);
  assert.match(sidebar, /videoModel/);
  assert.match(sidebar, /videoDuration/);
  assert.match(sidebar, /videoAspectRatio/);
  assert.doesNotMatch(sidebar, /GENERATION_PREFERENCES_BY_SKILL/);
  assert.doesNotMatch(sidebar, /selectedSkill[\s\S]{0,180}setGenerationPreferences/);
});

test('Codex SDK keeps visible user input short while runtime context stays in instructions', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');

  assert.deepEqual(
    manager.toUserInputForTests({ prompt: '生成 4 个童装印花变体', canvasRuntimeContext: '当前画布 ID：canvas-1\n生成偏好：...' }),
    [{ type: 'text', text: '生成 4 个童装印花变体', text_elements: [] }],
  );

  const instructions = manager.buildThreadInstructionsForTests({
    canvasId: 'canvas-1',
    canvasRuntimeContext: '当前 Skill：childrenswear-print-workflow\n生成偏好：gpt-image-2',
  });
  assert.match(instructions, /当前 Skill：childrenswear-print-workflow/);
  assert.match(instructions, /生成偏好：gpt-image-2/);
  assert.doesNotMatch(instructions, /用户请求：生成 4 个童装印花变体/);
});

test('Codex sidebar reuses MentionPromptInput and exposes read-only skill metadata panel', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = read('../src/styles/theme-core.css');

  assert.match(sidebar, /import MentionPromptInput/);
  assert.match(sidebar, /type MediaMention/);
  assert.match(sidebar, /mentionMaterials/);
  assert.match(sidebar, /resolvedMentions/);
  assert.match(sidebar, /<MentionPromptInput/);
  assert.match(sidebar, /onChange=\{\(nextValue,\s*nextMentions\)/);
  assert.match(sidebar, /查看 Skill/);
  assert.match(sidebar, /skillDetailOpen/);
  assert.match(sidebar, /Sidebar Questions|可问问题/);
  assert.match(sidebar, /Sidebar Canvas Templates|画布模板/);
  assert.match(sidebar, /Sidebar Verification|验证项/);
  assert.match(styles, /\.codex-agent-sidebar__skill-detail/);
  assert.match(styles, /\.codex-agent-sidebar__preference-section/);
});

test('Codex sidebar skills are project-local, layered by files, and editable when enabled', () => {
  const route = read('../backend/src/routes/codexCli.js');
  const runner = read('../backend/src/utils/codexCliRunner.js');
  const service = read('../src/services/codexCli.ts');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = read('../src/styles/theme-core.css');

  assert.match(route, /config\.BASE_DIR/);
  assert.match(route, /router\.get\('\/skills\/project\/:name\/files'/);
  assert.match(route, /router\.get\('\/skills\/project\/:name\/file'/);
  assert.match(route, /router\.put\('\/skills\/project\/:name\/file'/);
  assert.match(route, /router\.post\('\/skills\/project\/import-archive'/);
  assert.match(route, /router\.post\('\/skills\/project\/:name\/adapt-sidebar'/);
  assert.match(runner, /listProjectSkillFiles/);
  assert.match(runner, /readProjectSkillFile/);
  assert.match(runner, /writeProjectSkillFile/);
  assert.match(runner, /importProjectSkillArchive/);
  assert.match(runner, /adaptProjectSkillForSidebar/);
  assert.match(runner, /projectSkillBaseDir/);
  assert.match(service, /getCodexProjectSkillFiles/);
  assert.match(service, /readCodexProjectSkillFile/);
  assert.match(service, /writeCodexProjectSkillFile/);
  assert.match(service, /importCodexProjectSkillArchive/);
  assert.match(service, /adaptCodexProjectSkillForSidebar/);
  assert.match(sidebar, /skillEditMode/);
  assert.match(sidebar, /skillFileTree/);
  assert.match(sidebar, /selectedSkillFilePath/);
  assert.match(sidebar, /readCodexProjectSkillFile/);
  assert.match(sidebar, /writeCodexProjectSkillFile/);
  assert.match(sidebar, /只读|编辑/);
  assert.match(sidebar, /SKILL\.md/);
  assert.match(sidebar, /references/);
  assert.match(sidebar, /skillFileLoading \? <span>读取中\.\.\.<\/span>/);
  assert.match(sidebar, /暂无可读取的项目 Skill 文件/);
  assert.match(sidebar, /单文件：正在编辑 SKILL\.md/);
  assert.match(sidebar, /codex-agent-sidebar__skill-modal-backdrop/);
  assert.match(sidebar, /role="dialog"/);
  assert.match(sidebar, /selectedSkillFileContent \|\| selectedSkill\.body \|\| ''/);
  assert.match(sidebar, /skillImportInputRef/);
  assert.match(sidebar, /handleSkillImport/);
  assert.match(sidebar, /createCodexProjectSkill/);
  assert.match(sidebar, /importCodexProjectSkillArchive/);
  assert.match(sidebar, /adaptCodexProjectSkillForSidebar/);
  assert.match(sidebar, /arrayBufferToBase64/);
  assert.match(sidebar, /导入 Skill/);
  assert.match(sidebar, /适配侧栏/);
  assert.match(sidebar, /导入后会刷新文件树并读取原文/);
  assert.match(sidebar, /补侧栏 section/);
  assert.match(sidebar, /检查解析结果/);
  assert.match(sidebar, /\.zip/);
  assert.match(sidebar, /codex-agent-sidebar__skill-modal-body/);
  assert.match(sidebar, /codex-agent-sidebar__skill-actions/);
  assert.match(sidebar, /codex-agent-sidebar__skill-modal-head/);
  assert.match(sidebar, /codex-agent-sidebar__skill-editor-body/);
  assert.match(sidebar, /codex-agent-sidebar__skill-textarea/);
  assert.match(sidebar, /codex-agent-sidebar__skill-preview/);
  assert.match(sidebar, /skillEditMode === 'edit'/);
  assert.match(sidebar, /codex-agent-sidebar__skill-analysis/);
  assert.match(sidebar, /<summary>当前解析<\/summary>/);
  assert.match(sidebar, /const skillDetailModal =/);
  assert.match(sidebar, /<\/form>\s*\{skillLibraryModal\}\s*\{skillDetailModal\}/);
  assert.doesNotMatch(sidebar, /<form[\s\S]{0,2500}codex-agent-sidebar__skill-modal-backdrop/);
  assert.match(sidebar, /skillSaveStatus/);
  assert.match(sidebar, /codex-agent-sidebar__skill-save-state/);
  assert.match(sidebar, /未保存/);
  assert.match(sidebar, /已保存/);
  assert.match(sidebar, /保存失败/);
  assert.match(sidebar, /导入完成/);
  assert.match(sidebar, /setSkillEditMode\('edit'\)/);
  assert.match(sidebar, /codex-agent-sidebar__skill-tabs/);
  assert.match(sidebar, /data-view=\{skillAnalysisView\}/);
  assert.match(styles, /\.codex-agent-sidebar__skill-files/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor/);
  assert.match(styles, /\.codex-agent-sidebar__skill-modal-backdrop/);
  assert.match(styles, /\.codex-agent-sidebar__skill-modal/);
  assert.match(styles, /\.codex-agent-sidebar__skill-modal-body/);
  assert.match(styles, /\.codex-agent-sidebar__skill-detail\.codex-agent-sidebar__skill-modal[\s\S]*height:\s*min\(780px,\s*calc\(100vh - 56px\)\)/);
  assert.match(styles, /\.codex-agent-sidebar__skill-actions[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*minmax\(136px,\s*0\.72fr\)/);
  assert.match(styles, /\.codex-agent-sidebar__skill-files[\s\S]*grid-template-columns:\s*minmax\(176px,\s*0\.3fr\)\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor-body[\s\S]*display:\s*flex/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor-body[\s\S]*flex-direction:\s*column/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor-body[\s\S]*flex:\s*1 1 auto/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor \.codex-agent-sidebar__skill-textarea,[\s\S]*\.codex-agent-sidebar__skill-editor \.codex-agent-sidebar__skill-preview[\s\S]*flex:\s*1 1 auto/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor \.codex-agent-sidebar__skill-textarea,[\s\S]*box-sizing:\s*border-box/);
  assert.match(styles, /\.codex-agent-sidebar__composer textarea[\s\S]*max-height:\s*280px/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor \.codex-agent-sidebar__skill-textarea,[\s\S]*max-height:\s*none !important/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor \.codex-agent-sidebar__skill-textarea,[\s\S]*block-size:\s*100% !important/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor[\s\S]*flex-direction:\s*column/);
  assert.match(styles, /\.codex-agent-sidebar__main[\s\S]*background:\s*var\(--t8-bg-panel\)/);
  assert.match(styles, /\.codex-agent-sidebar__composer-card[\s\S]*background:\s*var\(--t8-bg-panel-elevated\)/);
  assert.match(styles, /\.codex-agent-sidebar__skill-save-state/);
  assert.match(styles, /\.codex-agent-sidebar__skill-tabs/);
  assert.match(styles, /overflow-y:\s*auto/);
});

test('Codex sidebar exposes research mode before canvas execution', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const service = readOptional('../src/services/codexCli.ts');

  assert.match(sidebar, /type ResearchMode = 'none' \| 'quick' \| 'deep'/);
  assert.match(sidebar, /RESEARCH_MODE_OPTIONS/);
  assert.match(sidebar, /researchMode/);
  assert.match(sidebar, /先调研/);
  assert.match(sidebar, /快速调研/);
  assert.match(sidebar, /深度调研/);
  assert.match(sidebar, /webSearch:\s*researchMode !== 'none'/);
  assert.match(sidebar, /researchMode,/);
  assert.match(sidebar, /联网调研要求/);
  assert.match(service, /researchMode\?:\s*'none' \| 'quick' \| 'deep'/);
});

test('Codex sidebar supports research boards, cached research, skill validation, previews, and record replay', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const service = readOptional('../src/services/codexCli.ts');
  const route = readOptional('../backend/src/routes/codexCli.js');
  const runner = readOptional('../backend/src/utils/codexCliRunner.js');

  assert.match(service, /export interface CodexResearchSummary/);
  assert.match(service, /getCodexResearchSummary/);
  assert.match(service, /searchCodexReferenceImages/);
  assert.match(service, /validateCodexProjectSkill/);
  assert.match(route, /router\.post\('\/research\/summary'/);
  assert.match(route, /router\.get\('\/research\/reference-images'/);
  assert.match(route, /router\.get\('\/skills\/project\/:name\/validate'/);
  assert.match(runner, /validateProjectSkill/);
  assert.match(runner, /missingSections/);
  assert.match(sidebar, /ResearchSummaryNode/);
  assert.match(sidebar, /researchCacheKey/);
  assert.match(sidebar, /publishResearchSummaryToCanvas/);
  assert.match(sidebar, /createResearchSummaryNode/);
  assert.match(sidebar, /参考图搜索/);
  assert.match(sidebar, /searchCodexReferenceImages/);
  assert.match(sidebar, /createReferenceBoardNode/);
  assert.match(sidebar, /type:\s*'material-set'/);
  assert.match(sidebar, /materialSetKind:\s*'image'/);
  assert.match(sidebar, /materialSetItems/);
  assert.match(sidebar, /referenceBoardItems/);
  assert.match(sidebar, /不自动复刻/);
  assert.match(sidebar, /任务预演/);
  assert.match(sidebar, /buildTaskPreview/);
  assert.match(sidebar, /sendPrompt\(prompt \|\| lastUserMessage\(messages\) \|\| taskPreview\.title,\s*false,\s*true\)/);
  assert.match(sidebar, /validateSelectedSkill/);
  assert.match(sidebar, /skillValidation/);
  assert.match(sidebar, /reuseRecordContext/);
  assert.match(sidebar, /researchSummary\?:\s*ResearchSummaryNode/);
  assert.match(sidebar, /lineage\?:\s*RecordLineageItem\[\]/);
  assert.match(sidebar, /recordReplayPayload/);
  assert.match(sidebar, /cachedResearch/);
});

test('Codex sidebar keeps SDK thread identity and compact ask/preview interactions', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const service = readOptional('../src/services/codexCli.ts');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const styles = readOptional('../src/styles/theme-core.css');

  assert.match(service, /codexThreadId\?:\s*string/);
  assert.match(service, /codexTurnId\?:\s*string/);
  assert.match(service, /codexThreadId\?:\s*string/);
  assert.match(sidebar, /codexThreadId\?:\s*string/);
  assert.match(sidebar, /useState<SidebarMessage\[\]>\(\(\) => initialSidebarState\.messages\)/);
  assert.match(sidebar, /syncRecordWithCodexSession/);
  assert.match(sidebar, /syncRecordWithCodexResult/);
  assert.match(sidebar, /record\.codexThreadId \|\| result\?\.codexThreadId/);
  assert.match(sidebar, /codexThreadId:\s*targetCodexThreadId/);
  assert.match(sidebar, /findAskShortcutOption/);
  assert.match(sidebar, /answerAskOption\(askShortcut\)/);
  assert.match(sidebar, /handleAskExpired/);
  assert.doesNotMatch(sidebar, /sendPrompt\(`我选择/);
  assert.match(sidebar, /taskPreviewExpanded/);
  assert.match(sidebar, /data-expanded=\{taskPreviewExpanded \? 'true' : 'false'\}/);
  assert.match(manager, /body\.codexThreadId/);
  assert.match(manager, /codex\.resumeThread\(reusableThreadId/);
  assert.match(manager, /codex\.startThread\(threadOptions\)/);
  assert.match(manager, /threadInitialized/);
  assert.match(manager, /records\.set\(recordId/);
  assert.match(manager, /modelReasoningEffort:\s*effort/);
  assert.match(styles, /\.codex-agent-sidebar__task-preview\[data-expanded="false"\]/);
  assert.match(styles, /\.codex-agent-sidebar__task-preview-toggle/);
  assert.match(styles, /\.codex-agent-sidebar__task-preview-popover/);
  assert.match(styles, /position:\s*absolute;[\s\S]*bottom:\s*calc\(100% \+ 8px\)/);
});

test('Codex sidebar clears stale route-missing diagnostics after any Codex API succeeds', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');

  assert.match(sidebar, /CODEX_ROUTE_MISSING_PATTERN/);
  assert.match(sidebar, /isCodexRouteMissingText/);
  assert.match(sidebar, /clearCodexRouteMissingDiagnostics/);
  assert.match(sidebar, /setError\(\(current\) => isCodexRouteMissingText\(current\) \? '' : current\)/);
  assert.match(sidebar, /setDiagnosticLogs\(\(prev\) => prev\.filter\(\(item\) => !isCodexRouteMissingText\(item\.text\)\)\)/);
  assert.match(sidebar, /clearCodexRouteMissingDiagnostics\(\);\s*setSession\(next\)/);
  assert.match(sidebar, /clearCodexRouteMissingDiagnostics\(\);\s*appendDiagnosticLog\(\s*result\.skills\.length/);
});

test('Codex sidebar message actions support copy edit retry continue and local delete through SDK same-thread retry', () => {
  const route = readOptional('../backend/src/routes/codexCli.js');
  const service = readOptional('../src/services/codexCli.ts');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = readOptional('../src/styles/theme-core.css');

  assert.match(route, /router\.post\('\/sessions\/global\/rollback'/);
  assert.match(manager, /rollbackGlobalCodexSessionThread/);
  assert.match(manager, /sdkRetrySameThread/);
  assert.match(manager, /Codex SDK 不暴露原生回滚/);
  assert.doesNotMatch(manager, /appClient\.request\('thread\/rollback'/);
  assert.match(service, /rollbackGlobalCodexSession/);
  assert.match(service, /numTurns:\s*number/);
  assert.match(sidebar, /editingMessageId/);
  assert.match(sidebar, /rollbackFromMessageId/);
  assert.match(sidebar, /let effectiveRecord = activeRecord/);
  assert.match(sidebar, /effectiveRecord = activeRecord \? \{ \.\.\.activeRecord,\s*messages:\s*baseMessages \} : activeRecord/);
  assert.match(sidebar, /recordReplay:\s*nativeContextInjected \? undefined : recordReplayPayload\(effectiveRecord\)/);
  assert.match(sidebar, /rollbackGlobalCodexSession/);
  assert.match(sidebar, /copySidebarMessage/);
  assert.match(sidebar, /editSidebarMessage/);
  assert.match(sidebar, /retrySidebarMessage/);
  assert.match(sidebar, /continueFromSidebarMessage/);
  assert.match(sidebar, /deleteSidebarMessage/);
  assert.match(sidebar, /codex-agent-sidebar__message-actions/);
  assert.match(sidebar, /title="复制"/);
  assert.match(sidebar, /title="编辑重试"/);
  assert.match(sidebar, /title="重试"/);
  assert.match(sidebar, /title="继续对话"/);
  assert.match(sidebar, /title="删除"/);
  assert.match(styles, /\.codex-agent-sidebar__message-actions/);
  assert.match(styles, /\.codex-agent-sidebar__edit-banner/);
});

test('Codex sidebar uses SDK record history, steer compatibility, context cache, and item timeline events', () => {
  const route = readOptional('../backend/src/routes/codexCli.js');
  const service = readOptional('../src/services/codexCli.ts');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = readOptional('../src/styles/theme-core.css');

  assert.match(manager, /readGlobalCodexSessionThread/);
  assert.match(manager, /listGlobalCodexSessionThreadTurns/);
  assert.match(manager, /injectGlobalCodexSessionItems/);
  assert.match(manager, /steerGlobalCodexSessionTurn/);
  assert.match(manager, /source:\s*'sdk-record'/);
  assert.match(manager, /pendingContext/);
  assert.match(manager, /pendingSteers/);
  assert.match(manager, /Codex SDK 不暴露运行中追加输入/);
  assert.doesNotMatch(manager, /appClient\.request|experimentalApi:\s*true|threadNativeUnsupported/);

  assert.match(route, /router\.get\('\/sessions\/global\/thread'/);
  assert.match(route, /router\.get\('\/sessions\/global\/turns'/);
  assert.match(route, /router\.post\('\/sessions\/global\/steer'/);
  assert.match(route, /router\.post\('\/sessions\/global\/inject'/);
  assert.match(route, /steerGlobalCodexSessionTurn/);

  assert.match(service, /readGlobalCodexThread/);
  assert.match(service, /listGlobalCodexThreadTurns/);
  assert.match(service, /steerGlobalCodexSession/);
  assert.match(service, /injectGlobalCodexContext/);
  assert.match(service, /CodexTimelineItem/);

  assert.match(sidebar, /nativeThreadHydrated/);
  assert.match(sidebar, /hydrateMessagesFromNativeThread/);
  assert.match(sidebar, /steerGlobalCodexSession/);
  assert.match(sidebar, /injectGlobalCodexContext/);
  assert.match(sidebar, /itemTimelineById/);
  assert.match(sidebar, /updateTimelineItemFromCodexEvent/);
  assert.match(sidebar, /nativeTurnHistoryUnavailable/);
  assert.match(styles, /\.codex-agent-sidebar__timeline/);
});

test('Codex sidebar keeps compact record snapshots while native thread history remains authoritative', () => {
  const route = readOptional('../backend/src/routes/codexCli.js');
  const service = readOptional('../src/services/codexCli.ts');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = readOptional('../src/styles/theme-core.css');

  assert.match(manager, /listGlobalCodexSessionRecords/);
  assert.match(manager, /function publicRecordSnapshot/);
  assert.match(manager, /deleteGlobalCodexSessionRecord/);
  assert.match(route, /router\.get\('\/sessions\/global\/records'/);
  assert.match(route, /router\.delete\('\/sessions\/global\/records\/:recordId'/);
  assert.match(service, /listGlobalCodexRecords/);
  assert.match(service, /deleteGlobalCodexRecord/);
  assert.match(sidebar, /refreshSdkConversationRecords/);
  assert.match(sidebar, /deleteConversationRecord/);
  assert.match(sidebar, /mergeConversationRecordsWithSdkSnapshots/);
  assert.match(sidebar, /recordMessageCount\(record\)/);
  assert.match(sidebar, /data-codex-record-action="delete"/);
  assert.match(styles, /\.codex-agent-sidebar__record-delete/);
  assert.doesNotMatch(sidebar, /record\.messages\.length\}\s*条/);
  assert.match(sidebar, /function conversationRecordStoragePayload/);
  assert.match(sidebar, /messages:\s*compactMessages/);
  assert.match(sidebar, /messages:\s*compactRecordMessages\(item\.messages \|\| \[\]\)/);
  assert.match(sidebar, /messageCount:/);
  assert.match(sidebar, /lastMessagePreview:/);
  assert.match(sidebar, /function readInitialSidebarState/);
  assert.match(sidebar, /useState\(readInitialSidebarState\)/);
  assert.match(sidebar, /useState<SidebarMessage\[\]>\(\(\) => initialSidebarState\.messages\)/);
  assert.match(sidebar, /setMessages\(\[\]\)/);
  assert.match(sidebar, /setMessages\(record\.messages \|\| \[\]\)/);
  assert.match(sidebar, /setNativeThreadHydrated\(''\)/);
  assert.doesNotMatch(sidebar, /if \(!open \|\| running\) return/);
  assert.match(sidebar, /const hydrated = hydrateMessagesFromNativeThread\(null,\s*turns\.data\)/);
  assert.match(sidebar, /setMessages\(hydrated\)/);
  assert.match(sidebar, /if \(!hydrated\.length && !running\) setNativeThreadHydrated\(threadId\)/);
});

test('Codex SDK records can be deleted from the backend snapshot store', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');
  manager.records.set('record-delete-test', {
    recordId: 'record-delete-test',
    title: 'delete me',
    messages: [{ role: 'user', text: 'hello' }],
    status: 'idle',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const result = manager.deleteGlobalCodexSessionRecord({ recordId: 'record-delete-test' });

  assert.equal(result.deleted, true);
  assert.equal(result.recordId, 'record-delete-test');
  assert.equal(manager.records.has('record-delete-test'), false);
});

test('Codex SDK runtime injects selected workspace skill content instead of only skill names', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');
  const source = readOptional('../backend/src/utils/codexSdkManager.js');

  assert.match(source, /listCodexSkills/);
  assert.match(source, /function buildWorkspaceSkillInstructions/);
  assert.match(source, /工作区 Skill/);

  const instructions = manager.buildThreadInstructionsForTests({
    workspaceDir: process.cwd(),
    selectedSkillNames: ['childrenswear-print-workflow'],
  });

  assert.match(instructions, /工作区 Skill：childrenswear-print-workflow/);
  assert.match(instructions, /Sidebar Directions|服装|印花|children/i);
});

test('Codex SDK runtime exposes Hakimi Canvas CLI to SDK and CDK canvas turns', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');

  const instructions = manager.buildThreadInstructionsForTests({
    workspaceDir: process.cwd(),
    canvasId: 'canvas-sdk-cli',
    selectedSkillNames: ['childrenswear-print-workflow'],
  });

  assert.match(instructions, /Hakimi Canvas CLI 已暴露给 Codex SDK\/CDK/);
  assert.match(instructions, /tools[\\/]+hakimi-canvas-cli[\\/]+hakimi-canvas\.mjs/);
  assert.match(instructions, /HAKIMI_CANVAS_API/);
  assert.match(instructions, /snapshot canvas-sdk-cli/);
  assert.match(instructions, /apply canvas-sdk-cli plan\.json --approval-policy never --watch/);
  assert.match(instructions, /优先使用 Hakimi MCP/);
  assert.match(instructions, /ask_user 的问题和选项必须由当前 Skill、用户意图、画布状态动态生成/);
});

test('Imported Tian VJ skill is project-local, layered, and parsed for dynamic sidebar control', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const skillSource = read('../.agents/skills/tian-vj-visual-design/SKILL.md');

  assert.match(skillSource, /name:\s*tian-vj-visual-design/);
  assert.match(skillSource, /## Sidebar Directions/);
  assert.match(skillSource, /## Sidebar Questions/);
  assert.match(skillSource, /## Sidebar Canvas Templates/);
  assert.match(skillSource, /## Sidebar Verification/);
  assert.match(skillSource, /references\/design-rules\.md/);
  assert.equal(existsSync(path.resolve('.agents/skills/tian-vj-visual-design/references/design-rules.md')), true);
  assert.equal(existsSync(path.resolve('.agents/skills/tian-vj-visual-design/references/style-templates.md')), true);

  const skills = runner.listCodexSkills({ workspaceDir: process.cwd() });
  const skill = skills.find((item: any) => item.name === 'tian-vj-visual-design');

  assert.ok(skill, 'tian-vj-visual-design should be discovered from .agents/skills');
  assert.equal(skill.scope, 'project');
  assert.ok(skill.directions.some((item: any) => item.id === 'reference-reverse'));
  assert.ok(skill.questions.some((item: any) => item.id === 'execution-scope' && item.options.includes('直接运行模型')));
  assert.ok(skill.templates.some((item: any) => item.id === 'canvas-cli-handoff'));
  assert.ok(skill.verification.some((item: any) => item.id === 'readback'));
});

test('Workspace includes design, apparel, art, and model generation business skills', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const expected = [
    'commercial-art-design-workflow',
    'apparel-collection-design-workflow',
    'fashion-model-tryon-generation',
    'visual-prompt-director',
    'temu-image-gen',
    'childrenswear-model-tryon-workflow',
    'outfit-change-product-visuals',
    'brand-visual-system-director',
    'ecommerce-detail-art-director',
    'product-hero-photography',
    'poster-layout-critic',
    'social-campaign-kit',
    'packaging-mockup-visuals',
    'scene-background-board',
    'lookbook-model-director',
    'image-edit-retouch-workflow',
    'visual-consistency-qa',
  ];

  const skills = runner.listCodexSkills({ workspaceDir: process.cwd() });
  for (const name of expected) {
    const skill = skills.find((item: any) => item.name === name);
    assert.ok(skill, `${name} should be discovered from current workspace .agents/skills`);
    assert.equal(skill.scope, 'project');
    assert.ok(skill.directions.length >= 4, `${name} should expose Sidebar Directions`);
    assert.ok(skill.questions.length >= 4, `${name} should expose dynamic Sidebar Questions`);
    assert.ok(skill.templates.length >= 3, `${name} should expose Canvas Templates`);
    assert.ok(skill.verification.length >= 4, `${name} should expose Verification checks`);
    assert.match(skill.body, /Hakimi|canvas|画布|image|video/i);
    assert.equal(existsSync(path.resolve('.agents/skills', name, 'agents', 'openai.yaml')), true);
  }

  assert.match(read('../.agents/skills/fashion-model-tryon-generation/SKILL.md'), /identity-safe|身份安全/);
  assert.match(read('../.agents/skills/commercial-art-design-workflow/SKILL.md'), /product-fidelity|产品真实度/);
  assert.match(read('../.agents/skills/visual-prompt-director/SKILL.md'), /model-aware|模型适配/);
  assert.match(read('../.agents/skills/apparel-collection-design-workflow/SKILL.md'), /print-fidelity|印花来源保留/);
  assert.match(read('../.agents/skills/temu-image-gen/SKILL.md'), /Temu\/SHEIN|marketplace-ready|童装/);
  assert.match(read('../.agents/skills/childrenswear-model-tryon-workflow/SKILL.md'), /child-safe|儿童安全|童装上身/);
  assert.match(read('../.agents/skills/outfit-change-product-visuals/SKILL.md'), /换装|garment swap|identity/);
  assert.match(read('../.agents/skills/brand-visual-system-director/SKILL.md'), /brand system|品牌|visual system/i);
  assert.match(read('../.agents/skills/ecommerce-detail-art-director/SKILL.md'), /详情|detail|product-fidelity/i);
  assert.match(read('../.agents/skills/product-hero-photography/SKILL.md'), /hero|主图|photography/i);
  assert.match(read('../.agents/skills/poster-layout-critic/SKILL.md'), /poster|版式|hierarchy/i);
  assert.match(read('../.agents/skills/social-campaign-kit/SKILL.md'), /social|campaign|社媒/i);
  assert.match(read('../.agents/skills/packaging-mockup-visuals/SKILL.md'), /packaging|mockup|包装/i);
  assert.match(read('../.agents/skills/scene-background-board/SKILL.md'), /scene|background|场景/i);
  assert.match(read('../.agents/skills/lookbook-model-director/SKILL.md'), /lookbook|model|模特/i);
  assert.match(read('../.agents/skills/image-edit-retouch-workflow/SKILL.md'), /retouch|edit|修图|改图/i);
  assert.match(read('../.agents/skills/visual-consistency-qa/SKILL.md'), /consistency|QA|质检/i);
});

test('Global Codex sidebar exposes a compact searchable project skill library', () => {
  const sidebar = read('../src/components/CodexAgentSidebar.tsx');
  const styles = read('../src/styles/theme-core.css');

  assert.match(sidebar, /skillLibraryOpen/);
  assert.match(sidebar, /skillLibraryQuery/);
  assert.match(sidebar, /skillLibraryCategoryFilter/);
  assert.match(sidebar, /filteredSkillLibrarySkills/);
  assert.match(sidebar, /项目 Skill 库/);
  assert.match(sidebar, /只显示当前工作区业务 skill/);
  assert.match(sidebar, /skillLibraryCategory\(skill\)/);
  assert.match(sidebar, /chooseSkill\(skill\)/);
  assert.match(sidebar, /onClick=\{\(\) => chooseSkill\(skill\)\}/);
  assert.doesNotMatch(sidebar, />\{active \? '使用中' : '使用'\}<\/button>/);
  assert.match(sidebar, /导入 Skill/);
  assert.match(sidebar, /handleSkillImportDrop/);
  assert.match(sidebar, /skillImportStatus/);
  assert.match(sidebar, /codex-agent-sidebar__skill-import-dropzone/);
  assert.match(sidebar, /品牌视觉系统/);
  assert.match(sidebar, /电商详情美工/);
  assert.match(sidebar, /商品主图摄影/);
  assert.match(sidebar, /海报版式诊断/);
  assert.match(sidebar, /社媒活动套图/);
  assert.match(sidebar, /包装 Mockup/);
  assert.match(sidebar, /场景背景板/);
  assert.match(sidebar, /Lookbook 模特导演/);
  assert.match(sidebar, /图片修图改图/);
  assert.match(sidebar, /视觉一致性质检/);
  assert.match(sidebar, /品牌视觉/);
  assert.match(sidebar, /包装\/场景/);
  assert.match(sidebar, /修图\/质检/);
  assert.match(sidebar, /setSkillDetailOpen\(true\)/);
  assert.match(styles, /codex-agent-sidebar__skill-library/);
  assert.match(styles, /codex-agent-sidebar__skill-library-grid/);
  assert.match(styles, /codex-skill-modal-in/);
  assert.match(styles, /codex-skill-card-in/);
  assert.match(styles, /codex-agent-sidebar__skill-import-dropzone/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /overflow-x:\s*hidden/);
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /codex-agent-sidebar__skill-card-select/);
  assert.match(styles, /font-family:\s*inherit/);
  assert.match(styles, /codex-agent-sidebar__direction-empty/);
  assert.doesNotMatch(sidebar, /fallbackDirectionsFromSkill/);
  assert.match(sidebar, /parseSelectedSkillDirections/);
});

test('Codex SDK workspace skill instructions inject dynamic questions as ask candidates', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');

  const instructions = manager.buildThreadInstructionsForTests({
    workspaceDir: process.cwd(),
    selectedSkillNames: ['tian-vj-visual-design'],
    canvasId: 'canvas-tian',
  });

  assert.match(instructions, /工作区 Skill：tian-vj-visual-design/);
  assert.match(instructions, /Sidebar Questions（动态 Ask 候选/);
  assert.match(instructions, /execution-scope/);
  assert.match(instructions, /画布模板|Sidebar Canvas Templates/);
  assert.match(instructions, /只有关键生成决策[\s\S]*选项必须来自本轮 Skill 的 Sidebar Questions/);
  assert.match(sidebar, /动态 Ask 候选/);
  assert.match(sidebar, /前端不会补固定业务选项/);
  assert.doesNotMatch(sidebar, /label:\s*'确认执行'/);
  assert.doesNotMatch(sidebar, /label:\s*'调整方案'/);
});

test('Codex SDK fork endpoint stays compatible but normal sidebar retry stays in the same thread', () => {
  const route = readOptional('../backend/src/routes/codexCli.js');
  const service = readOptional('../src/services/codexCli.ts');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');

  assert.match(manager, /forkGlobalCodexSessionThread/);
  assert.match(manager, /Codex SDK 不暴露原生分支/);
  assert.match(manager, /forked:\s*false/);
  assert.match(route, /router\.post\('\/sessions\/global\/fork'/);
  assert.match(route, /forkGlobalCodexSessionThread/);
  assert.match(service, /forkGlobalCodexThread/);
  assert.match(service, /forked:\s*boolean/);
  assert.match(sidebar, /retrySidebarMessage[\s\S]{0,260}rollbackFromMessageId/);
  assert.doesNotMatch(sidebar, /branchRetrySidebarMessage/);
  assert.doesNotMatch(sidebar, /title="分支重试"/);
  assert.doesNotMatch(sidebar, /分支重试/);
  assert.doesNotMatch(sidebar, /forkGlobalCodexThread/);
});

test('Codex sidebar sends short turns when SDK context cache is unchanged', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');

  assert.match(sidebar, /let nativeContextInjected = false/);
  assert.match(sidebar, /nativeContextInjected = Boolean\(result\.injected\)/);
  assert.match(sidebar, /canvasRuntimeContext:\s*nativeContextInjected \? '' : runtimeContext/);
  assert.match(sidebar, /referenceTexts:\s*nativeContextInjected \? \[\] : \[/);
  assert.match(sidebar, /recordReplay:\s*nativeContextInjected \? undefined : recordReplayPayload\(effectiveRecord\)/);
  assert.match(manager, /pendingContext/);
  assert.match(manager, /nativeContextHash/);
  assert.match(manager, /sentFullInstructions/);
});

test('Codex SDK answer endpoint reports unsupported native approval instead of fake approval', () => {
  const service = readOptional('../src/services/codexCli.ts');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');

  assert.match(service, /availableDecisions\?:/);
  assert.match(service, /decision\?:\s*string/);
  assert.match(manager, /respondToCodexServerRequest/);
  assert.match(manager, /unsupported:\s*true/);
  assert.match(manager, /Codex SDK 当前没有暴露原生 ask\/approval/);
  assert.match(sidebar, /nativeApprovalOptions/);
  assert.match(sidebar, /decision:\s*option\.decision/);
  assert.match(sidebar, /acceptForSession/);
  assert.match(sidebar, /Codex 原生审批/);
});

test('Hakimi MCP canvas approvals default to maximum non-dangerous permissions', () => {
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const httpMcp = readOptional('../backend/src/routes/hakimiMcp.js');
  const stdioMcp = readOptional('../tools/hakimi-mcp/src/tools.mjs');

  assert.match(manager, /canvas:\s*\{\s*label:\s*'画布协作',\s*sandbox:\s*'workspace-write',\s*approvalPolicy:\s*'never'/);
  assert.match(sidebar, /isHakimiMcpApprovalEvent/);
  assert.match(sidebar, /autoAcceptHakimiMcpApproval/);
  assert.match(sidebar, /画布 MCP 权限已默认放行/);
  assert.match(httpMcp, /approvalPolicy:\s*z\.enum\(\['ask_destructive',\s*'ask_everything',\s*'never'\]\)\.default\('never'\)/);
  assert.match(stdioMcp, /approvalPolicy:\s*z\.enum\(\['ask_destructive',\s*'ask_everything',\s*'never'\]\)\.default\('never'\)/);
  assert.doesNotMatch(httpMcp, /approvalPolicy:[\s\S]{0,120}\.default\('ask_destructive'\)/);
  assert.doesNotMatch(stdioMcp, /approvalPolicy:[\s\S]{0,120}\.default\('ask_destructive'\)/);
});

test('Codex SDK resolves bundled CLI and does not keep an app-server attachment registry', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');
  const source = read('../backend/src/utils/codexSdkManager.js');

  assert.equal(typeof manager.resolveBundledCodexExecutableForTests, 'function');
  assert.match(source, /resolveBundledCodexExecutable/);
  assert.doesNotMatch(source, /activeThreadIds|markThreadAttached|isThreadAttached/);
});

test('Codex sidebar separates tool approvals from real Ask cards and keeps process steps foldable', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const manager = readOptional('../backend/src/utils/codexSdkManager.js');
  const styles = readOptional('../src/styles/theme-core.css');

  assert.match(sidebar, /isCodexUserInputRequest/);
  assert.match(sidebar, /shouldShowAskEvent/);
  assert.match(sidebar, /isCriticalAskText/);
  assert.match(sidebar, /NONCRITICAL_ASK_AUTO_ANSWER/);
  assert.match(sidebar, /extractCodexAskOptions/);
  assert.match(sidebar, /event\.rawType\s*===\s*'item\/tool\/requestUserInput'/);
  assert.doesNotMatch(sidebar, /label:\s*'确认执行'/);
  assert.doesNotMatch(sidebar, /label:\s*'调整方案'/);
  assert.doesNotMatch(sidebar, /label:\s*'取消'/);
  assert.doesNotMatch(sidebar, /event\.type === 'approval\.requested'[\s\S]{0,260}setAskOptions/);
  assert.match(sidebar, /const collapsed = item\.role === 'process' && processCollapsedById\[item\.id\] === true/);
  assert.match(sidebar, /data-running=\{item\.status === 'running' \? 'true' : 'false'\}/);
  assert.match(sidebar, /data-collapsed=\{item\.role === 'process' && collapsed \? 'true' : undefined\}/);
  assert.match(sidebar, /processSummaryText\(item\)/);
  assert.match(sidebar, /\[processId\]:\s*true/);
  assert.match(sidebar, /answeredAskMemoryRef/);
  assert.match(sidebar, /answeredAskMemoryRef\.current\.has\(askText\)/);
  assert.match(sidebar, /recordMemoryForPrompt/);
  assert.match(sidebar, /本轮会话记忆/);
  assert.doesNotMatch(sidebar, /任务预演已生成，等待你点击/);
  assert.doesNotMatch(sidebar, /点击“执行预演”开始/);
  assert.match(styles, /\.codex-agent-sidebar__process-toggle\[data-running="true"\]/);
  assert.match(styles, /\.codex-agent-sidebar__process-toggle\[data-collapsed="true"\]/);
  assert.match(styles, /\.codex-agent-sidebar__process-steps\[data-collapsed="true"\]/);
  assert.match(styles, /\.codex-agent-sidebar__process-summary/);

  assert.match(manager, /effectiveCodexApprovalPolicy/);
  assert.match(manager, /respondToCodexServerRequest/);
  assert.match(manager, /unsupported:\s*true/);
  assert.match(manager, /Codex SDK 当前没有暴露原生 ask\/approval/);
  assert.match(manager, /steerGlobalCodexSessionTurn/);
  assert.match(manager, /pendingSteers/);
  assert.doesNotMatch(manager, /decision:\s*'approved'/);
  assert.doesNotMatch(manager, /respondToServerRequest|autoApprovedToolRequest|approveServerRequestResult/);
});

test('Codex sidebar creates result comparison review nodes after canvas generation', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');

  assert.match(sidebar, /createResultReviewNode/);
  assert.match(sidebar, /publishResultReviewToCanvas/);
  assert.match(sidebar, /collectGeneratedCanvasMedia/);
  assert.match(sidebar, /结果对比/);
  assert.match(sidebar, /优点/);
  assert.match(sidebar, /问题/);
  assert.match(sidebar, /下一轮修改建议/);
  assert.match(sidebar, /推荐保留/);
  assert.match(sidebar, /generatedResultRefs/);
  assert.match(sidebar, /result-review/);
  assert.match(sidebar, /本轮结果评审节点/);
});

test('Codex sidebar reuses image/video node registries and Codex CLI model options', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const codexModels = readOptional('../src/config/codexModelOptions.ts');
  const modelRegistry = readOptional('../src/providers/models.ts');

  assert.match(sidebar, /IMAGE_MODELS/);
  assert.match(sidebar, /VIDEO_MODELS/);
  assert.match(sidebar, /imageModelDef\.sidebarParameterGroups/);
  assert.match(sidebar, /videoModelDef\.sidebarParameterGroups/);
  assert.match(sidebar, /renderParamControl/);
  assert.match(sidebar, /imageCount/);
  assert.match(sidebar, /seed/);
  assert.match(modelRegistry, /sidebarParameterGroups/);
  assert.match(modelRegistry, /type:\s*'select'/);
  assert.match(modelRegistry, /type:\s*'number'/);
  assert.match(modelRegistry, /type:\s*'boolean'/);
  assert.match(modelRegistry, /showWhenApiModel/);
  assert.match(modelRegistry, /SEEDANCE_RATIO_OPTIONS/);
  assert.match(modelRegistry, /'9:21'/);
  assert.match(modelRegistry, /'adaptive'/);
  assert.match(modelRegistry, /SEEDANCE_RESOLUTION_OPTIONS/);
  assert.match(sidebar, /imageModelOptions/);
  assert.match(sidebar, /videoModelOptions/);
  assert.match(sidebar, /imageModelDef/);
  assert.match(sidebar, /videoModelDef/);
  assert.match(sidebar, /apiModelOptions/);
  assert.match(sidebar, /aspectRatios/);
  assert.match(sidebar, /defaultSize/);
  assert.match(sidebar, /videoModelDef\.sidebarParameterGroups/);
  assert.match(sidebar, /CODEX_MODEL_OPTIONS/);
  assert.match(codexModels, /默认模型/);
  assert.match(codexModels, /自定义模型/);
  assert.match(sidebar, /codexModelMode/);
  assert.match(sidebar, /customCodexModel/);
  assert.doesNotMatch(sidebar, /const IMAGE_MODEL_OPTIONS =/);
  assert.doesNotMatch(sidebar, /const VIDEO_MODEL_OPTIONS =/);
  assert.doesNotMatch(sidebar, /const CODEX_MODEL_OPTIONS = \[/);
});

test('Codex sidebar keeps skills import validated and canvas model payloads node-native', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = readOptional('../src/styles/theme-core.css');

  assert.match(sidebar, /refreshProjectSkills/);
  assert.match(sidebar, /syncImportedSkillFile/);
  assert.match(sidebar, /validateSelectedSkillByName/);
  assert.match(sidebar, /已导入并校验 Skill/);
  assert.match(sidebar, /canvasNodeDataContract/);
  assert.match(sidebar, /imageNodeData/);
  assert.match(sidebar, /videoNodeData/);
  assert.match(sidebar, /mainId:\s*generationPreferences\.video\.model/);
  assert.match(sidebar, /model:\s*generationPreferences\.video\.apiModel/);
  assert.match(sidebar, /ratio:\s*generationPreferences\.video\.aspectRatio/);
  assert.match(sidebar, /必须创建或更新 type: "image" 节点/);
  assert.match(sidebar, /必须创建或更新 type: "video" 或 "seedance" 节点/);
  assert.match(styles, /codex-agent-sidebar__model-summary/);
  assert.match(styles, /codex-agent-sidebar__skill-modal-grid/);
  assert.match(styles, /codex-agent-sidebar__preference-tabs/);
  assert.doesNotMatch(styles, /overflow-x:\s*auto/);
});

test('Codex sidebar keeps model parameters nested, model-aware, and avoids horizontal overflow', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = read('../src/styles/theme-core.css');

  assert.match(sidebar, /codex-agent-sidebar__preference-disclosure/);
  assert.match(sidebar, /codex-agent-sidebar__preference-compact/);
  assert.match(sidebar, /更多图像参数/);
  assert.match(sidebar, /更多视频参数/);
  assert.match(sidebar, /codex-agent-sidebar__preview-confirm-list/);
  assert.match(sidebar, /将创建/);
  assert.match(sidebar, /运行模型/);
  assert.match(sidebar, /codex-agent-sidebar__param-grid/);
  assert.match(sidebar, /renderParamButtons/);
  assert.match(sidebar, /imageParamGroups/);
  assert.match(sidebar, /videoParamGroups/);
  assert.match(sidebar, /filter\(\(group\) => group\.controls\.length > 0\)/);
  assert.match(sidebar, /generationPreferences\.image\.apiModel/);
  assert.match(sidebar, /generationPreferences\.video\.apiModel/);
  assert.match(sidebar, /selectedSkillFileContent \|\| selectedSkill\.body/);
  assert.match(sidebar, /codex-agent-sidebar__message-body/);
  assert.match(styles, /\.codex-agent-sidebar__preference-disclosure/);
  assert.match(styles, /\.codex-agent-sidebar__preference-compact/);
  assert.match(styles, /\.codex-agent-sidebar__preview-confirm-list/);
  assert.match(styles, /\.codex-agent-sidebar__param-grid/);
  assert.match(styles, /\.codex-agent-sidebar__messages article\[data-role="user"\]/);
  assert.match(styles, /\.codex-agent-sidebar__message-body/);
  assert.match(styles, /\.codex-agent-sidebar__skill-editor \.codex-agent-sidebar__skill-preview/);
  assert.match(styles, /overflow-x:\s*hidden/);
  assert.doesNotMatch(styles, /\.codex-agent-sidebar__direction-chipbar\s*\{[\s\S]{0,160}overflow-x:\s*auto/);
});

test('Codex sidebar composer height and direction chips stay compact with rich input', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const styles = read('../src/styles/theme-core.css');

  assert.match(sidebar, /DEFAULT_COMPOSER_HEIGHT = 112/);
  assert.match(sidebar, /MIN_COMPOSER_HEIGHT = 88/);
  assert.match(sidebar, /MAX_COMPOSER_HEIGHT = 260/);
  assert.match(sidebar, /fillHeight/);
  assert.match(sidebar, /minHeight:\s*composerHeight/);
  assert.match(styles, /\.codex-agent-sidebar__composer-card[\s\S]*gap:\s*6px/);
  assert.match(styles, /\.codex-agent-sidebar__composer-card[\s\S]*padding:\s*10px 12px 9px/);
  assert.match(styles, /\.codex-agent-sidebar__direction-chipbar button/);
  assert.match(styles, /font-size:\s*10px/);
  assert.match(styles, /min-height:\s*22px/);
  assert.match(styles, /\.codex-agent-sidebar__rich-input/);
  assert.match(styles, /\.codex-agent-sidebar__rich-input[\s\S]*font-size:\s*12px/);
  assert.match(styles, /min-height:\s*var\(--codex-composer-height/);
});

test('Codex global sidebar routes image work through canvas image nodes instead of Codex imagegen', () => {
  const sidebar = readOptional('../src/components/CodexAgentSidebar.tsx');
  const runner = require('../backend/src/utils/codexCliRunner.js');

  assert.match(sidebar, /不要使用 Codex 的 image_generation/);
  assert.match(sidebar, /hakimi_canvas_snapshot/);
  assert.match(sidebar, /hakimi_canvas_diff_plan/);
  assert.match(sidebar, /hakimi_canvas_apply_plan/);
  assert.match(sidebar, /hakimi_canvas_verify_plan/);
  assert.match(sidebar, /CanvasPlan 格式建议/);
  assert.match(sidebar, /图像生成必须通过画布 type: "image" 节点/);
  assert.match(sidebar, /data\.prompt/);
  assert.match(sidebar, /data\.model/);
  assert.match(sidebar, /data\.apiModel/);
  assert.match(sidebar, /run_node/);
  assert.match(sidebar, /imageGeneration:\s*false/);

  const prompt = runner.makeCreatorPrompt({
    command: 'global-codex-sidebar',
    mode: 'canvas-autopilot',
    canvasId: 'canvas-1',
    prompt: '基于参考图生成 3 张服装图',
    selectedSkillNames: ['hakimi-image-workflow'],
  });

  assert.match(prompt, /画布控制模式/);
  assert.match(prompt, /hakimi_canvas_snapshot/);
  assert.match(prompt, /hakimi_canvas_diff_plan/);
  assert.match(prompt, /hakimi_canvas_apply_plan/);
  assert.match(prompt, /hakimi_canvas_verify_plan/);
  assert.match(prompt, /不要使用 Codex CLI 的 image_generation/);
  assert.match(prompt, /画布 image 节点/);
  assert.doesNotMatch(prompt, /必须直接生成图片文件/);
});

test('Codex project skill manager updates categories, renames, and deletes skills', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-skill-crud-'));
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace, { recursive: true });
  const emptyRoot = path.join(root, 'empty-skills');
  mkdirSync(emptyRoot, { recursive: true });

  const created = runner.createProjectSkill({
    workspaceDir: workspace,
    name: 'portrait-style',
    title: '人像风格',
    description: '商业人像风格规范',
    category: '人像',
    body: '## 调用时机\n\n用于人像图像生成。',
  });
  assert.equal(created.category, '人像');

  const listed = runner.listCodexSkills({ roots: [emptyRoot], workspaceDir: workspace });
  const listedSkill = listed.find((item: any) => item.name === 'portrait-style');
  assert.equal(listedSkill.category, '人像');
  assert.match(listedSkill.body, /用于人像图像生成/);
  const files = runner.listProjectSkillFiles({ workspaceDir: workspace, name: 'portrait-style' });
  assert.equal(files.baseDir, path.join(workspace, '.agents', 'skills', 'portrait-style'));
  assert.equal(files.files.some((item: any) => item.name === 'SKILL.md'), true);
  const readSkill = runner.readProjectSkillFile({ workspaceDir: workspace, name: 'portrait-style', path: 'SKILL.md' });
  assert.match(readSkill.content, /商业人像风格规范/);
  runner.writeProjectSkillFile({
    workspaceDir: workspace,
    name: 'portrait-style',
    path: 'references/notes.md',
    content: '# Notes\n',
  });
  assert.equal(existsSync(path.join(workspace, '.agents', 'skills', 'portrait-style', 'references', 'notes.md')), true);

  const adapted = runner.adaptProjectSkillForSidebar({ workspaceDir: workspace, name: 'portrait-style' });
  assert.equal(adapted.directions.length > 0, true);
  assert.equal(adapted.questions.length > 0, true);
  const adaptedSource = readFileSync(path.join(workspace, '.agents', 'skills', 'portrait-style', 'SKILL.md'), 'utf8');
  assert.match(adaptedSource, /## Sidebar Directions/);
  assert.match(adaptedSource, /## Sidebar Questions/);
  assert.match(adaptedSource, /## Sidebar Canvas Templates/);
  assert.match(adaptedSource, /## Sidebar Verification/);

  const updated = runner.updateProjectSkill({
    workspaceDir: workspace,
    oldName: 'portrait-style',
    name: 'portrait-commercial',
    title: '商业人像',
    description: '商业棚拍人像规范',
    category: '商业',
    body: '## 输出格式\n\n给出主提示词、负面词和构图。',
  });
  assert.equal(updated.name, 'portrait-commercial');
  assert.equal(updated.category, '商业');
  assert.equal(existsSync(path.join(workspace, '.agents', 'skills', 'portrait-style')), false);
  assert.equal(existsSync(path.join(workspace, '.agents', 'skills', 'portrait-commercial', 'SKILL.md')), true);

  const renamedList = runner.listCodexSkills({ roots: [emptyRoot], workspaceDir: workspace });
  assert.equal(renamedList.some((item: any) => item.name === 'portrait-style'), false);
  assert.match(renamedList.find((item: any) => item.name === 'portrait-commercial').body, /负面词/);

  const deleted = runner.deleteProjectSkill({ workspaceDir: workspace, name: 'portrait-commercial' });
  assert.equal(deleted.deleted, true);
  assert.equal(existsSync(path.join(workspace, '.agents', 'skills', 'portrait-commercial')), false);
});

test('Codex project skill manager imports zip archives as layered project skills', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-skill-zip-'));
  const workspace = path.join(root, 'workspace');
  mkdirSync(workspace, { recursive: true });

  const archive = makeLocalZip({
    'SKILL.md': [
      '---',
      'name: childrenswear-print-workflow',
      'description: 童装印花二次开发工作流。',
      '---',
      '',
      '# 童装印花',
      '',
      '## Sidebar Directions',
      '- `remix` | 印花二开 | 基于参考印花延展。',
    ].join('\n'),
    'agents/openai.yaml': 'display_name: 童装印花\nshort_description: 印花二开\n',
  });

  const imported = runner.importProjectSkillArchive({
    workspaceDir: workspace,
    filename: 'childrenswear-print-workflow.zip',
    archiveBase64: archive.toString('base64'),
  });

  assert.equal(imported.name, 'childrenswear-print-workflow');
  assert.equal(existsSync(path.join(workspace, '.agents', 'skills', 'childrenswear-print-workflow', 'SKILL.md')), true);
  assert.equal(existsSync(path.join(workspace, '.agents', 'skills', 'childrenswear-print-workflow', 'agents', 'openai.yaml')), true);
  assert.equal(imported.directions[0].label, '印花二开');
});

test('Codex CLI runner parses JSONL helpers and extracts artifacts without exec wrapper', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  assert.equal(runner.buildCodexExecArgs, undefined);
  assert.equal(runner.runCodexExecStream, undefined);

  const parsed = runner.parseCodexJsonLine('{"type":"item.completed","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}}');
  assert.equal(parsed.type, 'item.completed');
  assert.equal(runner.extractTextDelta(parsed), 'hello');
  assert.equal(
    runner.extractTextDelta(runner.parseCodexJsonLine('{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"通过"}}')),
    '通过',
  );
  assert.equal(
    runner.extractTextDelta(runner.parseCodexJsonLine('{"type":"item.completed","item":{"type":"reasoning","content":[{"type":"reasoning_text","text":"内部思考"}]}}')),
    '',
  );
  assert.equal(
    runner.extractReasoningDeltaForTests(runner.parseCodexJsonLine('{"type":"item.completed","item":{"type":"reasoning","summary":[{"type":"summary_text","text":"正在检查画布状态"}]}}')),
    '正在检查画布状态',
  );
  assert.equal(
    runner.extractToolProgressForTests(runner.parseCodexJsonLine('{"type":"item.started","item":{"type":"tool_call","name":"hakimi_canvas_get"}}')),
    '调用工具：hakimi_canvas_get',
  );
  assert.equal(
    runner.extractTextDelta(runner.parseCodexJsonLine('SUCCESS: The process with PID 82032 (child process of PID 62832) has been terminated.')),
    '',
  );
  assert.equal(runner.shouldForwardCodexStderrForTests('2026-06-11T18:07:39Z  WARN codex_core_plugins::loader: noisy'), false);
  assert.equal(
    runner.shouldForwardCodexStderrForTests('2026-06-26T03:42:34Z  WARN codex_mcp::rmcp_client: failed to initialize MCP client during shutdown: MCP startup failed: handshaking with MCP server failed: connection closed: initialize response'),
    false,
  );
  assert.equal(runner.shouldForwardCodexStderrForTests('ERROR: The process "81144" not found.'), false);
  assert.equal(runner.shouldForwardCodexStderrForTests('error: unexpected argument'), true);

  const artifacts = runner.extractArtifactsFromText('完成：![hero](/files/output/hero.png) 和 /files/output/storyboard.mp4');
  assert.deepEqual(artifacts.map((item: any) => item.kind), ['image', 'video']);
  const relativeWindowsArtifacts = runner.extractArtifactsFromText('保存到了 agent-123\\outputs\\beauty-portrait.png');
  assert.equal(relativeWindowsArtifacts[0].kind, 'image');
  assert.match(relativeWindowsArtifacts[0].url, /agent-123\\outputs\\beauty-portrait\.png/);
  const finalCoverArtifacts = runner.extractArtifactsFromText('产物：\n- [最终封面](<E:/tmp/output/imagen/bernini_bilibili_cover_9x16_final.png>)');
  assert.equal(finalCoverArtifacts[0].kind, 'image');
  assert.equal(finalCoverArtifacts[0].url, 'E:/tmp/output/imagen/bernini_bilibili_cover_9x16_final.png');
  assert.equal(finalCoverArtifacts[0].title, 'bernini_bilibili_cover_9x16_final.png');
  const windowsMarkdownArtifacts = runner.extractArtifactsFromText(
    '产物路径：\n![B站封面](E:\\PenguinPravite\\T8-penguin-canvas\\data\\codex-workspaces\\node\\session\\output\\imagegen\\bilibili-bernini-cover-9x16.png)',
  );
  assert.equal(windowsMarkdownArtifacts[0].kind, 'image');
  assert.match(windowsMarkdownArtifacts[0].url, /bilibili-bernini-cover-9x16\.png$/);

  const imagePrompt = runner.makeCreatorPrompt({ preset: '图像生成', prompt: '生成一张霓虹企鹅海报' });
  assert.match(imagePrompt, /image_generation/);
  assert.match(imagePrompt, /Markdown 图片链接|本地文件路径/);

  const featureList = runner.parseCodexFeatureListForTests('image_generation stable true\nstandalone_web_search under development false\n');
  assert.deepEqual(featureList.map((item: any) => item.name), ['image_generation', 'standalone_web_search']);

  const workspace = mkdtempSync(path.join(tmpdir(), 't8-codex-artifact-'));
  mkdirSync(path.join(workspace, 'output'), { recursive: true });
  writeFileSync(path.join(workspace, 'output', 'neon.png'), 'png');
  const normalized = runner.normalizeArtifactUrlForTests('output/neon.png', workspace);
  assert.match(normalized, /^\/files\/output\/codex\/codex_.*\.png$/);

  const scanRoot = mkdtempSync(path.join(tmpdir(), 't8-codex-artifact-scan-'));
  const scanOutput = path.join(scanRoot, 'output', 'imagen');
  mkdirSync(scanOutput, { recursive: true });
  const oldFile = path.join(scanOutput, 'old-from-previous-run.png');
  writeFileSync(oldFile, 'old');
  const oldTime = new Date(Date.now() - 60_000);
  utimesSync(oldFile, oldTime, oldTime);
  const scanStartedAt = Date.now();
  const newFile = path.join(scanOutput, 'bernini_bilibili_cover_9x16_final.png');
  writeFileSync(newFile, 'new');
  const scannedArtifacts = runner.extractArtifactsFromWorkspaceForTests(
    { dir: scanRoot, outputDir: path.join(scanRoot, 'output') },
    new Map(),
    { createdAfterMs: scanStartedAt },
  );
  assert.equal(scannedArtifacts.some((item: any) => item.title === 'old-from-previous-run.png'), false);
  assert.equal(scannedArtifacts.some((item: any) => item.title === 'bernini_bilibili_cover_9x16_final.png'), true);
});

test('Codex CLI runner resolves canvas image URLs to readable local files', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const config = require('../backend/src/config.js');
  mkdirSync(config.INPUT_DIR, { recursive: true });
  const fileName = `codex-ref-${Date.now()}.png`;
  const filePath = path.join(config.INPUT_DIR, fileName);
  writeFileSync(filePath, 'png');

  const workspace = mkdtempSync(path.join(tmpdir(), 't8-codex-image-input-'));
  const resolved = runner.resolveCodexInputImagesForTests([
    `/files/input/${fileName}`,
    filePath,
    'https://example.com/remote.png',
  ], { dir: workspace, inputDir: path.join(workspace, 'inputs') });

  assert.equal(resolved[0], filePath);
  assert.equal(resolved[1], 'https://example.com/remote.png');
  assert.equal(resolved.length, 2);
});

test('Codex CLI runner prefers runnable Windows npm shims and can build login invocations', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-bin-'));
  const npmDir = path.join(root, 'npm');
  const windowsApps = path.join(root, 'WindowsApps');
  mkdirSync(npmDir, { recursive: true });
  mkdirSync(windowsApps, { recursive: true });
  writeFileSync(path.join(npmDir, 'codex'), '#!/bin/sh\n');
  writeFileSync(path.join(npmDir, 'codex.cmd'), '@echo codex\n');
  writeFileSync(path.join(windowsApps, 'codex.exe'), '');

  const resolved = runner.resolveCodexExecutable({
    executablePath: 'codex',
    env: {
      PATH: `${npmDir}${path.delimiter}${windowsApps}`,
      APPDATA: root,
      USERPROFILE: root,
    },
  });
  assert.equal(resolved.command, path.join(npmDir, 'codex.cmd'));
  assert.equal(resolved.shell, true);
  assert.equal(resolved.fromWindowsApps, false);

  const login = runner.buildCodexLoginStartInvocation({ executablePath: 'codex', env: { PATH: npmDir } });
  assert.equal(login.args[0], 'login');
  assert.equal(login.shell, true);
  assert.match(login.commandText, /codex\.cmd"? login/);

  const deviceLogin = runner.buildCodexLoginStartInvocation({ executablePath: 'codex', env: { PATH: npmDir }, deviceAuth: true });
  assert.deepEqual(deviceLogin.args, ['login', '--device-auth']);
  assert.match(deviceLogin.commandText, /--device-auth/);

  const runnerSource = read('../backend/src/utils/codexCliRunner.js');
  assert.match(runnerSource, /writeCodexLoginCmdScript/);
  assert.match(runnerSource, /startCodexLoginInVisibleTerminal/);
  assert.match(runnerSource, /windowsHide:\s*false/);
  assert.match(runnerSource, /登录完成后回到画布/);
});

test('Codex process env repairs packaged Windows homes and PATH for SDK', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-env-home-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });

  const env = runner.buildCodexProcessEnvForTests({
    baseEnv: {},
    env: { PATH: bin },
    platform: 'win32',
    homedir: root,
  });

  assert.equal(env.USERPROFILE, root);
  assert.equal(env.HOME, root);
  assert.equal(env.APPDATA, path.join(root, 'AppData', 'Roaming'));
  assert.equal(env.LOCALAPPDATA, path.join(root, 'AppData', 'Local'));
  const pathParts = String(env.PATH || env.Path || '').split(path.delimiter);
  assert.equal(pathParts[0], path.join(env.APPDATA, 'npm'));
  assert.ok(pathParts.includes(path.join(root, 'AppData', 'Roaming', 'npm')));
  assert.ok(pathParts.includes(bin));
});

test('Codex SDK uses the shared CLI resolver and repaired process env', () => {
  const manager = read('../backend/src/utils/codexSdkManager.js');
  const runner = read('../backend/src/utils/codexCliRunner.js');
  const rootPackage = read('../package.json');

  assert.match(runner, /function buildCodexProcessEnv/);
  assert.match(manager, /buildCodexProcessEnv/);
  assert.match(manager, /resolveCodexExecutable/);
  assert.match(manager, /const env = buildCodexProcessEnv/);
  assert.match(manager, /HAKIMI_BACKEND_URL:\s*resolveHakimiMcpBackendUrl\(\)/);
  assert.match(manager, /config:\s*sdkCodexConfig\(\)/);
  assert.match(manager, /mcp_servers:\s*\{/);
  assert.match(manager, /hakimi_http/);
  assert.match(manager, /codexPathOverride\s*=\s*resolved\.executable/);
  assert.match(manager, /resolveBundledCodexExecutable/);
  assert.match(rootPackage, /@openai\/codex-sdk/);
  assert.match(rootPackage, /node_modules\/@openai\/codex-\*/);
  assert.doesNotMatch(manager, /app-server|spawn\(resolved\.command|appClient\.request/);
});

test('Codex SDK resolves packaged bundled Codex executable from app.asar.unpacked resources', () => {
  const manager = require('../backend/src/utils/codexSdkManager.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-packaged-res-'));
  const packageRoot = path.join(root, 'app.asar.unpacked', 'node_modules', '@openai', 'codex-win32-x64');
  const exe = path.join(packageRoot, 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  mkdirSync(path.dirname(exe), { recursive: true });
  writeFileSync(exe, '');

  const resolved = manager.resolveBundledCodexExecutableForTests({
    platform: 'win32',
    arch: 'x64',
    resourcesPath: root,
    requireResolve: () => {
      const error: NodeJS.ErrnoException = new Error('not found');
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    },
  });

  assert.equal(resolved, exe);
});

test('Codex CLI status probe reports unavailable CLI without throwing HTTP-breaking errors', async () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const missingExecutable = path.join(tmpdir(), `missing-codex-${Date.now()}.exe`);

  const status = await runner.probeCodexStatus({ executablePath: missingExecutable });

  assert.equal(status.available, false);
  assert.equal(status.executable, missingExecutable);
  assert.match(status.message, /Codex CLI 不可用/);
});

test('Codex CLI status probe explains WindowsApps shim failures without 500s', async () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-windowsapps-'));
  const windowsApps = path.join(root, 'WindowsApps');
  mkdirSync(windowsApps, { recursive: true });
  const windowsAppsCodex = path.join(windowsApps, 'codex.exe');
  writeFileSync(windowsAppsCodex, '');

  const status = await runner.probeCodexStatus({
    executablePath: windowsAppsCodex,
    env: { PATH: windowsApps },
    timeoutMs: 1000,
  });

  assert.equal(status.available, false);
  assert.equal(status.executable, windowsAppsCodex);
  assert.match(status.message, /Codex CLI 不可用/);
  assert.match(status.message, /WindowsApps Codex 入口/);
  assert.match(status.message, /codex\.cmd/);
});

test('Codex CLI status probe explains invalid service tier config', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');

  const message = runner.codexUnavailableMessageForTests({
    stderr: 'Error loading configuration: C:\\Users\\Administrator\\.codex\\config.toml:10:16: unknown variant `default`, expected `fast` or `flex`',
  });

  assert.match(message, /config\.toml/);
  assert.match(message, /service_tier/);
  assert.match(message, /fast/);
  assert.match(message, /flex/);
  assert.match(message, /删除/);
});

test('Codex CLI status probe honors custom PATH env while checking login and features', async () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-env-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const isWin = process.platform === 'win32';
  const fakeCodex = path.join(bin, isWin ? 'codex.cmd' : 'codex');
  writeFileSync(fakeCodex, isWin
    ? '@echo off\r\nif "%1"=="--version" (echo codex-cli 9.9.9& exit /b 0)\r\nif "%1"=="login" if "%2"=="status" (echo Logged in using Test& exit /b 0)\r\nif "%1"=="features" if "%2"=="list" (echo image_generation stable true& exit /b 0)\r\necho unexpected %* 1>&2\r\nexit /b 2\r\n'
    : '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi\nif [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Logged in using Test"; exit 0; fi\nif [ "$1" = "features" ] && [ "$2" = "list" ]; then echo "image_generation stable true"; exit 0; fi\necho "unexpected $*" >&2\nexit 2\n');
  if (!isWin) chmodSync(fakeCodex, 0o755);

  const status = await runner.probeCodexStatus({
    executablePath: 'codex',
    env: {
      PATH: bin,
      Path: bin,
      APPDATA: root,
      USERPROFILE: root,
    },
    timeoutMs: 5000,
  });

  assert.equal(status.available, true);
  assert.equal(status.version, 'codex-cli 9.9.9');
  assert.equal(status.authStatus, 'Logged in using Test');
  assert.deepEqual(status.featureNames, ['image_generation']);
});

test('Codex skill scanner discovers global and project skills with creator metadata', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-skills-'));
  const globalDir = path.join(root, 'global');
  const projectDir = path.join(root, 'workspace', '.agents', 'skills', 'poster-director');
  mkdirSync(path.join(globalDir, 'imagegen'), { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(globalDir, 'imagegen', 'SKILL.md'), '---\nname: imagegen\ndescription: Generate bitmap images.\n---\n# Imagegen\n');
  writeFileSync(path.join(projectDir, 'SKILL.md'), '# 海报导演\n\n用于把商品图变成海报主视觉。\n\n## Sidebar Directions\n\n- `brief` | 创意简报 | 先整理商品、渠道、受众和限制。\n- `layout` | 海报构图 | 规划主视觉层级和画面结构。\n');

  const skills = runner.listCodexSkills({
    roots: [globalDir],
    workspaceDir: path.join(root, 'workspace'),
  });

  assert.deepEqual(skills.map((item: any) => item.name).sort(), ['imagegen', 'poster-director']);
  assert.equal(skills.find((item: any) => item.name === 'poster-director').scope, 'project');
  assert.match(skills.find((item: any) => item.name === 'imagegen').description, /Generate bitmap images/);
  assert.deepEqual(skills.find((item: any) => item.name === 'poster-director').directions, [
    { id: 'brief', label: '创意简报', hint: '先整理商品、渠道、受众和限制。' },
    { id: 'layout', label: '海报构图', hint: '规划主视觉层级和画面结构。' },
  ]);
});

test('Codex skill scanner exposes bundled Hakimi project skills as project skills', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-bundled-skills-'));

  const skills = runner.listCodexSkills({
    workspaceDir: path.join(root, 'workspace'),
    env: {
      CODEX_HOME: path.join(root, '.codex'),
      USERPROFILE: root,
      HOME: root,
      PATH: '',
    },
  });

  const hakimiSkill = skills.find((item: any) => item.name === 'hakimi-canvas-os');
  assert.ok(hakimiSkill, 'expected bundled Hakimi canvas skill to be discovered');
  assert.equal(hakimiSkill.scope, 'project');
  assert.ok(hakimiSkill.directions.length >= 4, 'expected Hakimi skill directions to come from SKILL.md metadata');
  assert.match(hakimiSkill.directions.map((item: any) => item.label).join(' / '), /画布读取|生图节点|视频分镜|服装二开/);
});

test('Codex skill scanner imports system and plugin-cache skills used by Codex', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const root = mkdtempSync(path.join(tmpdir(), 't8-codex-plugin-skills-'));
  const codexHome = path.join(root, '.codex');
  const systemSkill = path.join(codexHome, 'skills', '.system', 'openai-docs');
  const pluginSkill = path.join(codexHome, 'plugins', 'cache', 'openai-curated', 'creative', 'c6ea566d', 'skills', 'shot-explorer');
  const tmpPluginSkill = path.join(codexHome, '.tmp', 'plugins', 'plugins', 'superpowers', 'skills', 'using-superpowers');
  mkdirSync(systemSkill, { recursive: true });
  mkdirSync(pluginSkill, { recursive: true });
  mkdirSync(tmpPluginSkill, { recursive: true });
  writeFileSync(path.join(systemSkill, 'SKILL.md'), '---\nname: openai-docs\ndescription: Use official OpenAI docs.\n---\n# OpenAI Docs\n');
  writeFileSync(path.join(pluginSkill, 'SKILL.md'), '---\nname: shot-explorer\ndescription: Explore camera angle variants.\n---\n# Shot Explorer\n');
  writeFileSync(path.join(tmpPluginSkill, 'SKILL.md'), '---\nname: using-superpowers\ndescription: Load the Superpowers routing skill.\n---\n# Using Superpowers\n');

  const skills = runner.listCodexSkills({
    workspaceDir: path.join(root, 'workspace'),
    env: {
      CODEX_HOME: codexHome,
      USERPROFILE: root,
      HOME: root,
      PATH: '',
    },
  });

  assert.ok(skills.find((item: any) => item.name === 'openai-docs'), 'system skill should be visible');
  assert.ok(skills.find((item: any) => item.name === 'shot-explorer'), 'plugin-cache skill should be visible');
  assert.ok(skills.find((item: any) => item.name === 'using-superpowers'), 'tmp plugin skill should be visible');
  assert.match(skills.find((item: any) => item.name === 'shot-explorer').description, /camera angle/);
});

test('Codex creator node exposes simplified mode, studio mode, external skills, and user presets', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /Codex 创作台/);
  assert.match(node, /Codex 简约生成/);
  assert.match(node, /SYSTEM_CREATOR_PRESETS:\s*CreatorPreset\[\]\s*=\s*\[\]/);
  assert.match(node, /DEFAULT_CREATOR_PRESET/);
  assert.match(node, /CODEX_MODEL_OPTIONS/);
  assert.match(node, /codexModelMode/);
  assert.match(node, /gpt-5\.5/);
  assert.match(node, /gpt-5\.4-mini/);
  assert.match(node, /gpt-5\.3-codex-spark/);
  assert.match(node, /gpt-5\.3-codex/);
  assert.match(node, /创作模板/);
  assert.match(node, /模板工坊/);
  assert.match(node, /Skill 列表/);
  assert.match(node, /会话列表/);
  assert.match(node, /新建会话/);
  assert.match(node, /项目管理/);
  assert.match(node, /codexStudioSessions/);
  assert.match(node, /newCodexStudioSession/);
  assert.match(node, /switchCodexStudioSession/);
  assert.match(node, /CREATOR_SKILL_ALLOWLIST/);
  assert.match(node, /skillPurposeLabel/);
  assert.match(node, /renderPresetSelect/);
  assert.match(node, /renderSkillDropdown/);
  assert.match(node, /renderCompactCreatorControls/);
  assert.match(node, /skillSearchQuery/);
  assert.match(node, /scoreSkillMatch/);
  assert.match(node, /filteredCreatorSkills/);
  assert.match(node, /data-codex-skill-search/);
  assert.match(node, /data-codex-skill-option/);
  assert.match(node, /data-codex-skill-picker-portal/);
  assert.match(node, /openSkillPickerFromPrompt/);
  assert.match(node, /data-codex-prompt-frame-source="simple"/);
  assert.match(node, /data-codex-prompt-frame-source="studio"/);
  assert.match(node, /skillPickerOpen/);
  assert.doesNotMatch(node, /filteredCreatorSkills\.slice\(0,\s*16\)/);
  assert.doesNotMatch(node, /max-h-44 overflow-y-auto/);
  assert.doesNotMatch(node, /creatorPresets:\s*CreatorPreset\[\]\s*=\s*\[/);
  assert.match(node, /LLM_DEFAULT_CODEX_MODEL = 'gpt-5\.4-mini'/);
  assert.match(node, /IMG_DEFAULT_CODEX_MODEL = 'gpt-5\.5'/);
  assert.match(node, /autoCodexModelForRunIntent/);
  assert.match(node, /codexModelManual/);
  assert.match(node, /codexModelAutoPatchForRunIntent\(nextIntent\)/);
  assert.match(node, /extractSlashSkillReferences/);
  assert.match(node, /selectedSkillNamesForRun/);
  assert.match(node, /shouldForceImageGeneration/);
  assert.match(node, /codexRunIntent/);
  assert.match(node, /data-codex-run-intent/);
  assert.match(node, /data-codex-run-intent-option=\{item\.id\}/);
  assert.match(node, /data-codex-run-intent-active=\{active \? 'true' : 'false'\}/);
  assert.match(node, /aria-pressed=\{active\}/);
  assert.match(node, /data-codex-run-intent-summary=\{codexRunIntent\}/);
  assert.match(node, /当前：\{codexRunIntent === 'img'/);
  assert.match(node, /IMG 生图模式 · 默认 gpt-5\.5 \+ imagegen/);
  assert.match(node, /LLM 文字模式 · 默认 gpt-5\.4 mini/);
  assert.match(node, /label:\s*'LLM'/);
  assert.match(node, /label:\s*'IMG'/);
  assert.match(node, /llmOnly:\s*runIntent === 'llm'/);
  assert.match(node, /\/Skill/);
  assert.match(node, /工作台工具/);
  assert.match(node, /studioToolPanel/);
  assert.match(node, /codex-simple-prompt-frame/);
  assert.match(node, /absolute inset-4/);
  assert.match(node, /min-h-0 flex-1/);
  assert.match(node, /minHeight:\s*180/);
  assert.match(node, /minHeight:\s*150/);
  assert.match(node, /codexStopRunning/);
  assert.match(node, /abortRef\.current\?\.abort/);
  assert.match(node, /artifactMaterials/);
  assert.match(node, /@ 产物/);
  assert.match(node, /MaterialPreviewSection/);
  assert.match(node, /data-codex-studio-input-materials="true"/);
  assert.match(node, /上游素材 · Agent 输入/);
  assert.match(node, /orderedInputTexts/);
  assert.match(node, /inputMaterialTotal/);
  assert.match(node, /normalizeExcludedMaterialIds/);
  assert.match(node, /filterExcludedMaterials/);
  assert.match(node, /useDisconnectUpstreamMaterial/);
  assert.match(node, /pruneMaterialIdsForDisconnectedSource/);
  assert.match(node, /countExcludedMaterials/);
  assert.match(node, /onExcludeUpstream=\{excludeUpstreamMaterial\}/);
  assert.match(node, /onRestoreExcluded=\{restoreExcludedMaterials\}/);
  assert.match(node, /selectedSkillNames/);
  assert.match(node, /createCodexProjectSkill/);
  assert.match(node, /版本树/);
  assert.match(node, /质量检查/);
  assert.match(node, /streamCodexCliAgent/);
  assert.match(node, /publishArtifact/);
  assert.match(node, /saveArtifactToResourceLibrary/);
  assert.match(node, /useRunTrigger\(id, handleQuickRun, 'codex-cli-agent'\)/);
  assert.match(node, /artifactLibraryTab/);
  assert.match(node, /data-codex-artifact-tab/);
  assert.match(node, /activeControlText/);
  assert.match(node, /inactiveControlBg/);
  assert.match(node, /visibleStudioArtifacts/);
  assert.match(node, /renderArtifactCard/);
  assert.match(node, /deleteArtifact/);
  assert.match(node, /data-codex-artifact-action="delete"/);
  assert.match(node, /data-codex-artifact-zoom-trigger/);
  assert.match(node, /data-codex-artifact-zoom-preview/);
  assert.match(node, /100%/);
  assert.match(node, /renderSimpleCompletionSummary/);
  assert.match(node, /queueArtifactEdit\(artifact, true\)[\s\S]*变体/);
  assert.doesNotMatch(node, /renderArtifactPreview\(latestArtifact\)/);
  assert.doesNotMatch(node, />\s*转视频\s*</);
  assert.doesNotMatch(node, /creatorPresets\.slice\(0,\s*6\)\.map/);
  assert.doesNotMatch(node, /renderPresetList\(true\)/);
  assert.doesNotMatch(node, /renderSkillList\(true\)/);
  assert.doesNotMatch(node, /renderPresetList\(false\)/);
  assert.doesNotMatch(node, /renderSkillList\(false\)/);
  assert.doesNotMatch(node, /const renderPresetList/);
  assert.doesNotMatch(node, /const renderSkillList/);
  assert.doesNotMatch(node, /const renderModeSelect/);
  assert.doesNotMatch(node, /background:\s*msg\.role === 'tool'/);
  assert.match(node, /data-codex-studio-thread/);
  assert.match(node, /studioThreadScrollRef/);
  assert.match(node, /data-codex-studio-copyable/);
  assert.match(node, /data-codex-message-copyable/);
  assert.match(node, /copyCodexMessage/);
  assert.match(node, /stopImmediatePropagation/);
  assert.match(node, /document\.addEventListener\('pointerdown', stopSelectableTextGesture, true\)/);
  assert.match(node, /userSelect:\s*'text'/);
  assert.match(node, /nodrag nopan nowheel min-h-0 flex-1 overflow-auto/);
  assert.match(node, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(node, /data-codex-message-role/);
  assert.match(node, /w-full min-w-0/);
});

test('Codex creator studio exposes sortable visible input materials and disconnects upstream X actions', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /'codex-cli-agent':\s*\{[\s\S]*materialOrder:\s*\[\]/);
  assert.match(canvas, /'codex-cli-agent':\s*\{[\s\S]*excludedMaterialIds:\s*\[\]/);
  assert.match(node, /const visibleUpstreamImages = useMemo\([\s\S]*filterExcludedMaterials\(upstream\.images, excludedMaterialIds\)/);
  assert.match(node, /const studioConsumedMaterialIds = useMemo/);
  assert.match(node, /const activeUpstreamImages = useMemo\([\s\S]*studioOpen && !persistMaterials \? filterExcludedMaterials\(visibleUpstreamImages, studioConsumedMaterialIds\) : visibleUpstreamImages/);
  assert.match(node, /const orderedTexts = useOrderedMaterials\(activeUpstreamTexts, materialOrder\)/);
  assert.doesNotMatch(node, /const orderedTexts = useOrderedMaterials\(\[\.\.\.visibleUpstreamTexts, \.\.\.artifactMaterials/);
  assert.match(node, /const orderedImages = useOrderedMaterials\(activeUpstreamImages, materialOrder\)/);
  assert.match(node, /const setMaterialOrder = useCallback\(\(nextOrder: string\[\]\) => update\(\{ materialOrder: nextOrder \}\)/);
  assert.match(node, /if \(material\.origin !== 'upstream'\) return/);
  assert.match(node, /disconnectUpstreamMaterial\(material\)/);
  assert.match(node, /excludedMaterialIds: pruneMaterialIdsForDisconnectedSource\(excludedMaterialIds, material\.sourceNodeId\)/);
  assert.match(node, /materialOrder: pruneMaterialOrderForDisconnectedSource\(materialOrder, material\.sourceNodeId\)/);
  assert.match(node, /update\(\{ excludedMaterialIds: \[\] \}\)/);
  assert.match(node, /<MaterialPreviewSection[\s\S]*texts=\{orderedInputTexts\}[\s\S]*images=\{orderedImages\}[\s\S]*videos=\{orderedVideos\}[\s\S]*audios=\{orderedAudios\}/);
  assert.match(node, /finishPatch\.codexStudioConsumedMaterialIds = mergeMaterialIds\(studioConsumedMaterialIds, consumedIds\)/);
  assert.match(node, /codexPersistMaterials: event\.currentTarget\.checked[\s\S]*codexStudioConsumedMaterialIds: \[\]/);
});

test('Codex creator prompt promotes slash skill references and image skills', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');

  const prompt = runner.makeCreatorPrompt({
    preset: '提示词增强',
    mode: 'prompt',
    prompt: '生成一个美女图片',
    selectedSkillNames: ['imagen'],
  });

  assert.match(prompt, /\$imagen/);
  assert.match(prompt, /必须直接生成图片文件/);
  assert.match(prompt, /不要只输出提示词文本/);
});

test('Codex creator prompt does not auto-enable image generation in LLM mode', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');

  const prompt = runner.makeCreatorPrompt({
    preset: '默认创作',
    mode: 'chat',
    prompt: '生成一个美女图片',
    selectedSkillNames: [],
    llmOnly: true,
  });

  assert.doesNotMatch(prompt, /必须直接生成图片文件/);
  assert.doesNotMatch(prompt, /image_generation/);
});

test('Codex simple creator mode has explicit LLM IMG intent, model defaults, imagegen default skill, and image-first publishing', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /data-codex-simple-run-intent=\{codexRunIntent\}/);
  assert.match(node, /data-codex-simple-input-materials="true"/);
  assert.match(node, /const shouldClearPromptAfterRun = studioOpen && !persistPrompt/);
  assert.doesNotMatch(node, /if \(!persistPrompt\) startPatch\.codexQuickPrompt = ''/);
  assert.doesNotMatch(node, /if \(!persistPrompt\) finishPatch\.codexQuickPrompt = ''/);
  assert.match(node, /const runIntent: CodexRunIntent = codexRunIntent/);
  assert.doesNotMatch(node, /studioOpen \? codexRunIntent : 'auto'/);
  assert.match(node, /codexModelAutoPatchForRunIntent\(nextIntent\)/);
  assert.match(node, /findDefaultImageGenerationSkill/);
  assert.match(node, /codexAutoImagegenSkillName/);
  assert.match(node, /updateCodexRunIntent[\s\S]*nextIntent === 'img'[\s\S]*codexSelectedSkillNames/);
  assert.match(node, /codexRunIntent === 'llm'[\s\S]*codexAutoImagegenSkillName/);
  assert.doesNotMatch(node, /rawSkillNamesForRun\.push\(defaultImageGenerationSkill\.name\)/);
  assert.match(node, /selectAutoPublishArtifact/);
  assert.match(node, /selectAutoPublishArtifact\(runArtifactsForPublish,\s*runIntent,\s*latest\)/);
});

test('Codex creator exposes compact imagegen parameter lists and chips near prompt inputs', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /CODEX_IMAGEGEN_PARAM_LISTS/);
  assert.match(node, /CODEX_IMAGEGEN_QUICK_PARAMS/);
  assert.match(node, /appendCommaSeparatedPromptToken/);
  assert.match(node, /renderImagegenQuickParamBar/);
  assert.match(node, /data-codex-imagegen-param-bar=\{placement\}/);
  assert.match(node, /data-codex-imagegen-param-list=\{group\.label\}/);
  assert.match(node, /data-codex-imagegen-param=\{item\.value\}/);
  assert.match(node, /const CODEX_IMAGEGEN_QUICK_PARAMS = \[\s*\{ label: '1:1'[\s\S]*\{ label: '16:9'[\s\S]*\{ label: '9:16'[\s\S]*\{ label: '4:3'[\s\S]*\{ label: '3:4'[\s\S]*\{ label: '21:9'[\s\S]*\{ label: '9:21'[\s\S]*\{ label: '1K'[\s\S]*\{ label: '2K'[\s\S]*\{ label: '4K'/);
  assert.doesNotMatch(node, /const CODEX_IMAGEGEN_QUICK_PARAMS = \[[\s\S]*?\{ label: '4:5'/);
  assert.match(node, /label:\s*'文\+图'[\s\S]*value:\s*'文字和图片同时生成'/);
  assert.match(node, /label:\s*'比例'[\s\S]*value:\s*'9:21'/);
  assert.match(node, /label:\s*'尺寸'[\s\S]*value:\s*'1024x1536'/);
  assert.match(node, /label:\s*'质量'[\s\S]*value:\s*'high detail'/);
  assert.match(node, /label:\s*'风格'[\s\S]*value:\s*'cinematic'/);
  assert.match(node, /value:\s*'9:16'/);
  assert.match(node, /codexQuickPrompt: appendCommaSeparatedPromptToken\(quickPrompt, value\)/);
  assert.match(node, /renderImagegenQuickParamBar\('studio'\)[\s\S]*<MentionPromptInput/);
  assert.match(node, /<MentionPromptInput[\s\S]*renderImagegenQuickParamBar\('simple'\)/);
});

test('Codex creator prompt treats connected images as binding visual references', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');

  const prompt = runner.makeCreatorPrompt({
    preset: '图像生成',
    mode: 'image',
    prompt: '改成活动海报',
    selectedSkillNames: ['imagegen'],
    images: ['C:\\tmp\\reference.png'],
  });

  assert.match(prompt, /参考图使用约束/);
  assert.match(prompt, /主体身份/);
  assert.match(prompt, /不要脱离参考图另起炉灶/);
  assert.match(prompt, /如果参考图读取失败/);
});

test('Codex simple run accepts upstream image-only tasks and sends image references', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /buildImageOnlyPrompt/);
  assert.match(node, /imagesForRun\.length/);
  assert.match(node, /请填写任务，或连接上游图片/);
  assert.match(node, /promptForRun/);
  assert.match(node, /images:\s*imagesForRun/);
});

test('Codex creator node remains draggable and exposes setup/login guidance', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /data-codex-cli-agent-root/);
  assert.match(node, /data-codex-drag-surface/);
  assert.doesNotMatch(node, /className="nodrag nowheel"\s+style=\{rootStyle\}/);
  assert.match(node, /clearRecoverableCodexError/);
  assert.match(node, /codexStatusPanel/);
  assert.match(node, /startCodexCliLogin/);
  assert.match(node, /正在打开 Codex 登录窗口/);
  assert.match(node, /CODEX_LOGIN_FLOW_STEPS/);
  assert.match(node, /copyCodexSetupCommand/);
  assert.match(node, /codexLoginCommand/);
  assert.match(node, /friendlyCodexErrorMessage/);
  assert.match(node, /登录 Codex CLI/);
  assert.match(node, /打开登录/);
  assert.match(node, /复制安装命令/);
  assert.match(node, /普通 CMD 或 PowerShell/);
  assert.match(node, /登录流程/);
  assert.match(node, /需要登录或填写 Codex CLI 路径/);
  assert.match(node, /检测详情/);
  assert.match(node, /后端路由未加载/);
});

test('Codex creator node implements roadmap creator workflow extras', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /renderProjectSkillEditor/);
  assert.match(node, /buildCreatorBriefBlock/);
  assert.match(node, /codexBriefSubject/);
  assert.match(node, /codexStyleLock/);
  assert.match(node, /codexTargetPlatform/);
  assert.match(node, /codexBatchVariantCount/);
  assert.match(node, /createVariantPrompt/);
  assert.doesNotMatch(node, /createVideoPrompt/);
  assert.match(node, /openArtifactSendModal/);
  assert.match(node, /批量变体/);
  assert.match(node, /风格锁定/);
  assert.match(node, /平台转换/);
  assert.match(node, /自动负面词/);
  assert.match(node, /发送画布/);
});

test('Codex creator node keeps template and project-skill editors out of the narrow studio sidebar', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /studioToolPanel/);
  assert.match(node, /codexStudioTool/);
  assert.match(node, /data-codex-studio-tool="template-workshop"/);
  assert.match(node, /data-codex-studio-tool="project-skill"/);
  assert.doesNotMatch(node, /creatorSkillTemplates\.map/);
  assert.doesNotMatch(node, /让 Codex 生成/);
  assert.match(node, /data-codex-empty-template-option/);
});

test('Codex template and project skill workshops expose category, rename, and delete management', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /codexPresetDraftCategory/);
  assert.match(node, /codexTemplateCategoryFilter/);
  assert.match(node, /codexTemplateSelectCategory/);
  assert.match(node, /visibleSelectableCreatorPresets/);
  assert.match(node, /editingPresetId/);
  assert.match(node, /saveCustomPreset/);
  assert.match(node, /editCustomPreset/);
  assert.match(node, /deleteCustomPreset/);
  assert.match(node, /data-codex-template-category/);
  assert.match(node, /data-codex-template-category="select-filter"/);
  assert.match(node, /NO_CREATOR_PRESET_ID/);
  assert.match(node, />无模板</);
  assert.match(node, /hasActiveCreatorPreset/);
  assert.doesNotMatch(node, /item\.id === presetId \|\| item\.label === presetId \|\| item\.mode === mode/);
  assert.match(node, /data-codex-template-action="rename"/);
  assert.match(node, /data-codex-template-action="delete"/);
  assert.match(node, /skillDraftCategory/);
  assert.match(node, /editingSkillName/);
  assert.match(node, /projectSkillCategoryFilter/);
  assert.match(node, /updateCodexProjectSkill/);
  assert.match(node, /deleteCodexProjectSkill/);
  assert.match(node, /data-codex-project-skill-category/);
  assert.match(node, /data-codex-skill-action="rename"/);
  assert.match(node, /data-codex-skill-action="delete"/);
  assert.match(node, /保存修改/);
  assert.match(node, /重命名/);
  assert.match(node, /删除/);
});

test('Codex selected creator template survives IMG mode and is sent as explicit instructions', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /buildPresetInstructionBlock/);
  assert.match(node, /当前创作模板/);
  assert.match(node, /模板分类/);
  assert.match(node, /模板指令/);
  assert.match(node, /const presetInstruction = hasActiveCreatorPreset/);
  assert.match(node, /buildPresetInstructionBlock\(runPreset,\s*forceImageGeneration\)/);
  assert.match(node, /runPreset = hasActiveCreatorPreset[\s\S]*\? currentPreset/);
  assert.match(node, /const runMode = forceImageGeneration \? 'image' : runPreset\.mode/);
  assert.doesNotMatch(node, /const runPreset = forceImageGeneration \? imagePreset : currentPreset/);
});

test('Codex template and project skill workshops support import and export migration', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /templateImportInputRef/);
  assert.match(node, /projectSkillImportInputRef/);
  assert.match(node, /exportCustomPresets/);
  assert.match(node, /importCustomPresets/);
  assert.match(node, /exportProjectSkills/);
  assert.match(node, /importProjectSkills/);
  assert.match(node, /t8-codex-creator-templates/);
  assert.match(node, /t8-codex-project-skills/);
  assert.match(node, /导入/);
  assert.match(node, /导出/);
  assert.match(node, /accept="application\/json"/);
});

test('Codex creator run preferences and studio layout use the full conversation lane', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /codexAutoPublishOutput/);
  assert.match(node, /codexPersistPrompt/);
  assert.match(node, /codexPersistMaterials/);
  assert.match(node, /生成后自动发布到画布输出/);
  assert.match(node, /提示词持久化/);
  assert.match(node, /素材持久化/);
  assert.match(node, /studioAutoPublishOutput = d\.codexAutoPublishOutput === true/);
  assert.match(node, /autoPublishOutput = studioOpen \? studioAutoPublishOutput : true/);
  assert.match(node, /renderRunPreferenceControls = \(compact = false, showPersistence = true, showAutoPublish = true\)/);
  assert.match(node, /showAutoPublish &&/);
  assert.match(node, /showPersistence &&/);
  assert.match(node, /renderRunPreferenceControls\(!showManage, !showManage, !showManage\)/);
  assert.doesNotMatch(node, /renderRunPreferenceControls\(!showManage, !showManage\)/);
  assert.doesNotMatch(node, /codexAutoPublishOutput !== false/);
  assert.match(node, /const autoPublishArtifact = selectAutoPublishArtifact\(runArtifactsForPublish,\s*runIntent,\s*latest\)/);
  assert.match(node, /if \(autoPublishArtifact && autoPublishOutput\) publishArtifact\(autoPublishArtifact\)/);
  assert.match(node, /data-codex-studio-thread-inner/);
  assert.doesNotMatch(node, /mx-auto max-w-4xl space-y-5/);
  assert.match(node, /max-w-\[92%\]/);
});

test('Codex creator studio keeps session memory with automatic compression', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /CODEX_STUDIO_CONTEXT_DEFAULT_LIMIT = 30/);
  assert.match(node, /CODEX_STUDIO_CONTEXT_MAX_LIMIT = 80/);
  assert.match(node, /codexContextSummary/);
  assert.match(node, /codexContextCompressedCount/);
  assert.match(node, /codexContextLimit/);
  assert.match(node, /function buildCodexStudioMemoryContext/);
  assert.match(node, /function buildCodexStudioMemoryPrompt/);
  assert.match(node, /studioOpen \? buildCodexStudioMemoryContext\(messagesRef\.current/);
  assert.match(node, /const studioMemoryPrompt = studioMemory \? buildCodexStudioMemoryPrompt\(studioMemory\) : ''/);
  assert.match(node, /studioMemoryPrompt/);
  assert.match(node, /本轮创作台会话记忆/);
  assert.match(node, /codexContextSummary: ''/);
  assert.match(node, /codexContextCompressedCount: 0/);
  assert.match(node, /contextSummary: String\(d\.codexContextSummary/);
  assert.match(node, /contextCompressedCount: clampInteger\(d\.codexContextCompressedCount/);
  assert.match(node, /已压缩 \{codexContextCompressedCount\} 条历史为长期记忆/);
  assert.doesNotMatch(node, /studioMemoryPrompt[\s\S]{0,160}simple/);
});

test('Codex creator keeps streaming and history data canvas-performant', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /CODEX_MESSAGE_STORAGE_CHAR_LIMIT/);
  assert.match(node, /CODEX_ARTIFACT_TEXT_STORAGE_CHAR_LIMIT/);
  assert.match(node, /CODEX_STUDIO_SESSION_STORAGE_LIMIT/);
  assert.match(node, /function trimCodexStorageText/);
  assert.match(node, /function compactCodexStudioSessionForCanvas/);
  assert.match(node, /content:\s*trimCodexStorageText\(content,/);
  assert.match(node, /text:\s*trimCodexStorageText\(text,\s*CODEX_ARTIFACT_TEXT_STORAGE_CHAR_LIMIT\)/);
  assert.match(node, /compactCodexStudioSessionForCanvas\(current\)/);
  assert.match(node, /slice\(0,\s*CODEX_STUDIO_SESSION_STORAGE_LIMIT\)/);

  const deltaHandler = /onDelta:\s*\(delta\)\s*=>\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\s*onEvent:/.exec(node)?.[1] || '';
  assert.match(deltaHandler, /streamedText \+= delta/);
  assert.match(deltaHandler, /setStreamingReply\(streamedText\)/);
  assert.doesNotMatch(deltaHandler, /setMessages\(/);
  assert.doesNotMatch(deltaHandler, /replaceAssistant\(streamedText/);
  assert.match(node, /msg\.status === 'running' && msg\.role === 'assistant' \? streamingReply/);
});

test('Codex CLI Agent ports stay grouped around the node middle', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.match(node, /function codexAgentHandleTop\(index: number, count: number\)/);
  assert.match(node, /return '50%'/);
  assert.match(node, /calc\(50%/);
  assert.match(node, /top: codexAgentHandleTop\(0, 4\)/);
  assert.match(node, /top: codexAgentHandleTop\(3, 4\)/);
  assert.match(node, /top: codexAgentHandleTop\(0, 5\)/);
  assert.match(node, /top: codexAgentHandleTop\(4, 5\)/);
  assert.doesNotMatch(node, /top: 94/);
  assert.doesNotMatch(node, /top: 260/);
});

test('Codex creator product library supports durable deletion and batch cleanup', () => {
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');
  const runner = read('../backend/src/utils/codexCliRunner.js');
  const route = read('../backend/src/routes/codexCli.js');

  assert.match(node, /codexDeletedArtifactKeys/);
  assert.match(node, /artifactDeleteKeys/);
  assert.match(node, /artifactMatchesDeletedKeys/);
  assert.match(node, /filterDeletedArtifacts\(sanitizeArtifacts\(d\.codexArtifacts\), deletedArtifactKeys\)/);
  assert.match(node, /if \(artifactMatchesDeletedKeys\(stored, deletedArtifactKeysRef\.current\)\) return null/);
  assert.match(node, /filterDeletedArtifacts\(sanitizeArtifacts\(target\.artifacts\), deletedArtifactKeysRef\.current\)/);
  assert.match(node, /deleteArtifacts/);
  assert.match(node, /codexStudioSessions: nextSessions/);
  assert.match(node, /artifactBatchMode/);
  assert.match(node, /selectedArtifactIds/);
  assert.match(node, /删选中/);
  assert.match(node, /全选当前/);
  assert.match(node, /已清空 Codex 产物库/);
  assert.match(node, /outputText:\s*''/);
  assert.match(node, /prompt:\s*''/);
  assert.match(node, /lastPrompt:\s*''/);
  assert.match(node, /generatedImages:\s*\[\]/);
  assert.match(node, /directImageUrls:\s*\[\]/);
  assert.match(runner, /function collectCodexRunArtifacts/);
  assert.match(runner, /return artifactsByText\.length\s*\?\s*dedupeArtifacts\(artifactsByText\)\s*:\s*dedupeArtifacts\(artifactsByWorkspace\)/);
  assert.match(route, /const errorArtifacts = Array\.isArray\(error\?\.artifacts\)/);
  assert.match(route, /for \(const artifact of errorArtifacts\)/);
  assert.doesNotMatch(node, /artifactStableTitle\(artifact\)/);
  assert.doesNotMatch(node, /downloadName\(artifact\.url \|\| urls\[0\] \|\| '', ''\)/);
});

test('Codex creator filters raw CLI progress and does not persist slash Skill calls', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const node = read('../src/components/nodes/CodexCliAgentNode.tsx');

  assert.equal(runner.shouldForwardCodexProgressForTests('thread.started', { rawType: 'thread.started' }), false);
  assert.equal(runner.shouldForwardCodexProgressForTests('item.completed', { rawType: 'item.completed' }), false);
  assert.equal(runner.shouldForwardCodexProgressForTests('Reading prompt from stdin...', {}), false);
  assert.equal(runner.shouldForwardCodexProgressForTests('当前 Codex CLI 未提供 plan_tool feature，已跳过 Plan Tool CLI 开关。', { type: 'feature.skipped', feature: 'plan_tool' }), false);
  assert.equal(runner.shouldForwardCodexProgressForTests('正在生成图像...', {}), true);

  assert.match(node, /function shouldStoreTextArtifact/);
  assert.doesNotMatch(node, /if \(hasMedia\) return false/);
  assert.match(node, /role === 'tool' && !shouldDisplayCodexToolMessage/);
  assert.match(node, /if \(shouldDisplayCodexToolMessage\(event, msg\)\) appendToolMessage\(msg\)/);
  assert.match(node, /selectedRunnableSkillNames/);
  assert.match(node, /codexSelectedSkillNames: selectedRunnableSkillNames/);
  assert.doesNotMatch(node, /skillPickerMode === 'slash'[\s\S]{0,600}codexSelectedSkillNames/);
});

