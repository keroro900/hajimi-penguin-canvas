'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const settingsRouter = require('../routes/settings');
const {
  buildCodexProcessEnv,
  createCodexWorkspace,
  extractArtifactsFromText,
  extractArtifactsFromWorkspaceForTests: extractArtifactsFromWorkspace,
  listCodexSkills,
  normalizeArtifactUrlForTests: normalizeArtifactUrl,
  probeCodexStatus,
  resolveCodexExecutable,
  resolveCodexInputImagesForTests: resolveCodexInputImages,
} = require('./codexCliRunner');
const { resolveHakimiCanvasCliPath } = require('./hakimiCanvasCli');

const GLOBAL_CODEX_SESSION_ID = 'global-codex';
const DEFAULT_TURN_TIMEOUT_MS = 10 * 60 * 1000;

const SANDBOX_VALUES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const APPROVAL_POLICY_VALUES = new Set(['on-request', 'on-failure', 'never', 'untrusted']);
const REASONING_EFFORT_VALUES = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
const WEB_SEARCH_MODE_VALUES = new Set(['disabled', 'cached', 'live']);

const PERMISSION_PRESETS = {
  readonly: { label: '只读观察', sandbox: 'read-only', approvalPolicy: 'on-request' },
  canvas: { label: '画布协作', sandbox: 'workspace-write', approvalPolicy: 'never' },
  autopilot: { label: '自动驾驶', sandbox: 'workspace-write', approvalPolicy: 'never' },
  full: { label: '完全权限', sandbox: 'danger-full-access', approvalPolicy: 'on-request' },
};

const session = {
  sessionId: GLOBAL_CODEX_SESSION_ID,
  transport: 'sdk',
  status: 'idle',
  pid: null,
  startedAt: null,
  updatedAt: Date.now(),
  workspaceDir: config.BASE_DIR,
  permissionPreset: 'canvas',
  sandbox: PERMISSION_PRESETS.canvas.sandbox,
  approvalPolicy: PERMISSION_PRESETS.canvas.approvalPolicy,
  codexModel: '',
  reasoningEffort: '',
  currentTurnId: '',
  codexThreadId: '',
  codexTurnId: '',
  lastError: '',
};

let activeAbortController = null;
let activeRun = null;
let sdkModulePromise = null;
let eventSeq = 0;
const records = new Map();
const journal = [];

function makeHttpError(code, statusCode, message) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function publicSession() {
  return {
    sessionId: session.sessionId,
    transport: session.transport,
    status: session.status,
    pid: session.pid,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    workspaceDir: session.workspaceDir,
    permissionPreset: session.permissionPreset,
    sandbox: session.sandbox,
    approvalPolicy: session.approvalPolicy,
    codexModel: session.codexModel,
    reasoningEffort: session.reasoningEffort,
    currentTurnId: session.currentTurnId,
    codexThreadId: session.codexThreadId,
    codexTurnId: session.codexTurnId,
    lastError: session.lastError,
  };
}

function updateSession(patch = {}) {
  Object.assign(session, patch, { updatedAt: Date.now(), transport: 'sdk', pid: null });
  return publicSession();
}

function normalizeWorkspaceDir(value) {
  const dir = String(value || '').trim();
  return dir || config.BASE_DIR;
}

function getRecordId(body = {}) {
  return String(body.recordId || body.conversationId || body.sessionRecordId || GLOBAL_CODEX_SESSION_ID).trim() || GLOBAL_CODEX_SESSION_ID;
}

function validateCodexSessionPermission(input = {}) {
  const presetKey = String(input.permissionPreset || input.preset || 'canvas').trim();
  const preset = PERMISSION_PRESETS[presetKey] || PERMISSION_PRESETS.canvas;
  const sandbox = String(input.sandbox || preset.sandbox).trim();
  const approvalPolicy = String(input.approvalPolicy || input.askForApproval || preset.approvalPolicy).trim();

  if (!SANDBOX_VALUES.has(sandbox)) {
    throw makeHttpError('codex_sdk_invalid_permission', 400, `不支持的 sandbox：${sandbox}`);
  }
  if (!APPROVAL_POLICY_VALUES.has(approvalPolicy)) {
    throw makeHttpError('codex_sdk_invalid_permission', 400, `不支持的 approvalPolicy：${approvalPolicy}`);
  }
  if (sandbox === 'danger-full-access' && approvalPolicy === 'never') {
    throw makeHttpError('codex_sdk_invalid_permission', 400, '完全权限不能绑定自动批准，请改用 on-request。');
  }

  return {
    permissionPreset: PERMISSION_PRESETS[presetKey] ? presetKey : 'canvas',
    sandbox,
    approvalPolicy,
  };
}

function effectiveCodexApprovalPolicy(permission = {}, body = {}) {
  const command = String(body.command || '').trim();
  const drivingMode = String(body.drivingMode || '').trim();
  const isSidebarCanvasTurn = command === 'global-codex-sidebar'
    || /^canvas-/.test(String(body.mode || ''))
    || drivingMode === 'copilot'
    || drivingMode === 'autopilot';
  if (isSidebarCanvasTurn && permission.sandbox !== 'danger-full-access') return 'never';
  return permission.approvalPolicy;
}

function recordEvent(event) {
  const item = {
    seq: ++eventSeq,
    createdAt: Date.now(),
    ...event,
  };
  journal.push(item);
  if (journal.length > 5000) journal.splice(0, journal.length - 5000);
  const recordId = String(event.recordId || '').trim();
  if (recordId) {
    const record = records.get(recordId);
    if (record) {
      const events = Array.isArray(record.events) ? record.events : [];
      events.push(item);
      if (events.length > 600) events.splice(0, events.length - 600);
      records.set(recordId, { ...record, events, updatedAt: Date.now() });
    }
  }
  return item;
}

function resolveHakimiMcpBackendUrl() {
  try {
    const settings = settingsRouter.loadSettings({ persistMigrations: false });
    const configured = String(settings?.hakimiMcpBackendUrl || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
  } catch {
    // fall through to environment/default
  }
  return String(process.env.HAKIMI_BACKEND_URL || `http://127.0.0.1:${config.PORT}`).replace(/\/+$/, '');
}

function resolveHakimiHttpMcpUrl() {
  return `${resolveHakimiMcpBackendUrl()}/api/hakimi-mcp`;
}

async function loadCodexSdk() {
  if (!sdkModulePromise) sdkModulePromise = import('@openai/codex-sdk');
  return sdkModulePromise;
}

function sdkCodexConfig() {
  return {
    mcp_servers: {
      hakimi_http: {
        url: resolveHakimiHttpMcpUrl(),
      },
    },
  };
}

function sdkCodexOptions(body = {}) {
  const env = buildCodexProcessEnv({
    env: {
      HAKIMI_BACKEND_URL: resolveHakimiMcpBackendUrl(),
    },
    platform: body.platform,
  });
  const requested = String(body.executablePath || '').trim();
  const options = {
    env,
    config: sdkCodexConfig(),
  };
  if (requested) {
    const resolved = resolveCodexExecutable({
      executablePath: requested,
      env,
      platform: body.platform,
    });
    options.codexPathOverride = resolved.executable;
  }
  return options;
}

function normalizeReasoningEffort(value) {
  const effort = String(value || '').trim();
  return REASONING_EFFORT_VALUES.has(effort) ? effort : undefined;
}

function normalizeWebSearchMode(body = {}) {
  const explicit = String(body.webSearchMode || '').trim();
  if (WEB_SEARCH_MODE_VALUES.has(explicit)) return explicit;
  if (body.webSearch === true || body.webSearchEnabled === true) return 'live';
  if (body.webSearch === false || body.webSearchEnabled === false) return 'disabled';
  return undefined;
}

function threadOptionsForBody(body = {}, permission = validateCodexSessionPermission(body)) {
  const workspaceDir = normalizeWorkspaceDir(body.workspaceDir);
  const model = String(body.model || body.codexModel || '').trim();
  const effort = normalizeReasoningEffort(body.reasoningEffort);
  const webSearchMode = normalizeWebSearchMode(body);
  const additionalDirectories = Array.isArray(body.additionalDirectories)
    ? body.additionalDirectories.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    ...(model ? { model } : {}),
    sandboxMode: permission.sandbox,
    workingDirectory: workspaceDir,
    skipGitRepoCheck: true,
    ...(effort ? { modelReasoningEffort: effort } : {}),
    networkAccessEnabled: true,
    ...(webSearchMode ? { webSearchMode, webSearchEnabled: webSearchMode !== 'disabled' } : {}),
    approvalPolicy: effectiveCodexApprovalPolicy(permission, body),
    ...(additionalDirectories.length ? { additionalDirectories } : {}),
  };
}

function compactRuntimeValue(value, max = 12000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return String(text || '').trim().slice(0, max);
}

function buildCanvasRuntimeInstructions(body = {}) {
  const explicit = compactRuntimeValue(body.canvasRuntimeContext || '', 16000);
  if (explicit) return explicit;
  const sections = [];
  const add = (label, value, max) => {
    const text = compactRuntimeValue(value, max);
    if (text) sections.push(`${label}：${text}`);
  };
  add('画布摘要', Array.isArray(body.referenceTexts) ? body.referenceTexts.join('\n') : '', 5000);
  add('CanvasIntent', body.canvasIntent, 4000);
  add('CanvasPlanPreference', body.canvasPlanPreference, 3000);
  add('生成偏好', body.generationPreferences, 4000);
  add('Mentions', body.mentions, 3000);
  add('RecordReplay', body.recordReplay, 4000);
  add('ResearchSummary', body.researchSummary, 3000);
  add('TaskPreview', body.taskPreview, 3000);
  return sections.join('\n\n');
}

function contextHashForText(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

function selectedSkillNamesForBody(body = {}) {
  const names = [];
  const push = (value) => {
    const name = String(value || '').trim();
    if (name && !names.includes(name)) names.push(name);
  };
  (Array.isArray(body.selectedSkillNames) ? body.selectedSkillNames : []).forEach(push);
  push(body.selectedSkillName);
  return names;
}

function buildWorkspaceSkillInstructions(body = {}) {
  const selectedNames = selectedSkillNamesForBody(body);
  if (!selectedNames.length) return '';
  let skills = [];
  try {
    skills = listCodexSkills({ workspaceDir: normalizeWorkspaceDir(body.workspaceDir) });
  } catch {
    return '';
  }
  const selected = skills.filter((skill) => (
    selectedNames.includes(skill.name) && skill.scope === 'project'
  ));
  if (!selected.length) return '';
  return selected.slice(0, 8).map((skill) => {
    const bodyText = compactRuntimeValue(skill.body || skill.description || '', 5000);
    const directions = compactRuntimeValue(skill.directions, 1500);
    const questions = compactRuntimeValue(skill.questions, 1500);
    const templates = compactRuntimeValue(skill.templates, 1500);
    const verification = compactRuntimeValue(skill.verification, 1500);
    return [
      `工作区 Skill：${skill.name}`,
      skill.description ? `描述：${skill.description}` : '',
      directions ? `Sidebar Directions：${directions}` : '',
      questions ? `Sidebar Questions（动态 Ask 候选，不是前端固定按钮；只有缺少关键决策时，由你结合当前用户意图和画布上下文改写为 ask_user 选项）：${questions}` : '',
      templates ? `Sidebar Canvas Templates：${templates}` : '',
      verification ? `Sidebar Verification：${verification}` : '',
      bodyText ? `SKILL.md 正文摘要：\n${bodyText}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');
}

function quoteCliPath(value) {
  const text = String(value || '');
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function buildHakimiCanvasCliInstructions(body = {}) {
  const canvasId = String(body.canvasId || '<canvasId>').trim() || '<canvasId>';
  const cliPath = resolveHakimiCanvasCliPath();
  const baseUrl = resolveHakimiMcpBackendUrl();
  const command = `node ${quoteCliPath(cliPath)}`;
  return [
    'Hakimi Canvas CLI 已暴露给 Codex SDK/CDK 运行时，可通过 command_execution 调用；优先使用 Hakimi MCP，CLI 作为脚本化、调试、非 Codex agent 复用和 MCP 不便表达时的同级入口。',
    `CLI 路径：${cliPath}`,
    `后端地址：${baseUrl}（也可设置 HAKIMI_CANVAS_API=${baseUrl}）`,
    `常用命令：${command} status --base-url ${baseUrl}；${command} snapshot ${canvasId} --base-url ${baseUrl}；${command} diff ${canvasId} plan.json --base-url ${baseUrl}；${command} apply ${canvasId} plan.json --approval-policy never --watch --base-url ${baseUrl}`,
    'CLI 的画布权限默认使用 --approval-policy never；只有真正的创作分歧、成本风险或不可逆动作才用 ask_user。ask_user 的问题和选项必须由当前 Skill、用户意图、画布状态动态生成，不要复用固定按钮文案。',
  ].join('\n');
}

function buildThreadInstructions(body = {}) {
  const canvasId = String(body.canvasId || '').trim();
  const runtimeContext = buildCanvasRuntimeInstructions(body);
  const workspaceSkills = buildWorkspaceSkillInstructions(body);
  const hakimiCli = buildHakimiCanvasCliInstructions(body);
  return [
    '你是哈基米画布里的 Codex 画布 Agent。',
    'Codex SDK/CLI 是你的执行器，不是用户要创作的画布内容。',
    canvasId ? `当前画布 ID：${canvasId}` : '当前画布 ID：未提供。',
    '控制画布必须优先使用已配置的 Hakimi MCP 和画布事件；不要使用 Codex 自身 image_generation 直接生图。',
    hakimiCli,
    'Hakimi MCP 画布工具默认拥有当前会话内最大画布权限：普通读取、预演、应用、验证和运行节点都不要请求工具审批；只有关键创作决策、不可逆动作或成本风险才显式 ask_user。',
    '复杂画布流程优先走 hakimi_canvas_snapshot -> hakimi_canvas_diff_plan -> hakimi_canvas_apply_plan -> hakimi_canvas_verify_plan；小修小补可用 hakimi_agent_run_actions。',
    '图像生成必须创建或更新画布 type:"image" 节点，并写入 data.prompt、data.model、data.apiModel、referenceImages，然后触发 run_node。',
    'CanvasPlan 应包含稳定 node id、nodes、updates、edges、runNodeIds、focusViewport；执行前先 diff 预演，执行后必须回读验证节点、连线、模型参数、结果 URL 和视口。',
    '只有关键生成决策、不可逆修改、模型成本或用户意图确实不明确时，才给用户 2-3 个短选项；选项必须来自本轮 Skill 的 Sidebar Questions、当前画布和用户上下文的动态判断，不要把普通读取画布、MCP 工具审批或过程确认变成问题。',
    '复用当前 thread 和 record 的上下文；不要反复询问已经在历史、recordReplay、画布摘要或用户回复里出现过的信息。',
    '当用户明确说直接做时，可以按权限预设执行。',
    workspaceSkills ? `本轮已加载的工作区 Skills（按这些规则规划和控制画布，不要只复述 Skill 名称）：\n${workspaceSkills}` : '',
    runtimeContext ? `本轮画布运行上下文（不要原样复述给用户）：\n${runtimeContext}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildSdkPrompt(body = {}, record = {}) {
  const userPrompt = String(body.message || body.prompt || body.input || '').trim() || '继续。';
  const runtimeContext = buildCanvasRuntimeInstructions(body);
  const workspaceSkills = buildWorkspaceSkillInstructions(body);
  const runtimeHashSource = [runtimeContext, workspaceSkills].filter(Boolean).join('\n\n');
  const runtimeHash = runtimeHashSource ? contextHashForText(runtimeHashSource) : '';
  const shouldSendFullInstructions = !record.codexThreadId || !record.threadInitialized || (runtimeHash && runtimeHash !== record.nativeContextHash);
  const selectedSkillNames = Array.isArray(body.selectedSkillNames)
    ? body.selectedSkillNames.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const shortHeader = [
    body.canvasId ? `当前画布 ID：${body.canvasId}` : '',
    selectedSkillNames.length ? `本轮可用 Skill：${selectedSkillNames.map((name) => `$${name}`).join(' ')}` : '',
    body.selectedDirectionId ? `当前方向：${body.selectedDirectionId}` : '',
    body.drivingMode ? `驾驶模式：${body.drivingMode}` : '',
  ].filter(Boolean).join('\n');
  const parts = [
    shouldSendFullInstructions ? buildThreadInstructions(body) : shortHeader,
    `用户消息：\n${userPrompt}`,
  ].filter(Boolean);
  return {
    text: parts.join('\n\n'),
    runtimeHash,
    sentFullInstructions: shouldSendFullInstructions,
  };
}

function collectInputImageValues(body = {}) {
  const values = [];
  const push = (value) => {
    const text = String(value || '').trim();
    if (text && !values.includes(text)) values.push(text);
  };
  (Array.isArray(body.images) ? body.images : []).forEach(push);
  (Array.isArray(body.referenceImages) ? body.referenceImages : []).forEach((item) => push(item?.url || item));
  for (const mention of Array.isArray(body.mentions) ? body.mentions : []) {
    const kind = String(mention?.kind || mention?.type || '').toLowerCase();
    if (/image|图片|素材/.test(kind) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(String(mention?.url || mention?.src || ''))) {
      push(mention?.url || mention?.src || mention?.path || mention?.filePath);
    }
  }
  return values;
}

function buildSdkInput(body = {}, record = {}) {
  const prompt = buildSdkPrompt(body, record);
  const assetWorkspace = createCodexWorkspace({
    nodeId: 'global-codex-assets',
    sessionId: getRecordId(body),
  });
  const images = resolveCodexInputImages(collectInputImageValues(body), assetWorkspace);
  const input = [{ type: 'text', text: prompt.text }];
  for (const image of images) {
    if (fs.existsSync(image)) input.push({ type: 'local_image', path: image });
  }
  return {
    input,
    prompt,
    assetWorkspace,
    images,
  };
}

function toUserInput(body = {}) {
  const prompt = String(body.message || body.prompt || body.input || '').trim();
  return [{ type: 'text', text: prompt || '继续。', text_elements: [] }];
}

function canvasToolDisplayName(toolName = '', itemType = '') {
  const tool = String(toolName || '').trim();
  const type = String(itemType || '').trim();
  const key = tool || type;
  if (/hakimi_canvas_snapshot|canvas_snapshot/i.test(key)) return '读取画布';
  if (/hakimi_canvas_diff_plan|diff_plan/i.test(key)) return '预演画布计划';
  if (/hakimi_canvas_apply_plan|apply_plan/i.test(key)) return '应用画布动作';
  if (/hakimi_canvas_verify_plan|verify_plan/i.test(key)) return '验证画布结果';
  if (/hakimi_agent_run_actions|run_actions/i.test(key)) return '执行可视化动作';
  if (/hakimi_canvas_generate_image|generate_image/i.test(key)) return '提交图像生成';
  if (/hakimi_canvas_generate_video|generate_video/i.test(key)) return '提交视频生成';
  if (/run_node/i.test(key)) return '运行生成节点';
  if (/mcp_tool_call/i.test(type)) return '调用画布工具';
  if (/web_search/i.test(type)) return '联网查找参考';
  if (/command_execution/i.test(type)) return '执行命令';
  if (/file_change/i.test(type)) return '写入文件';
  if (/todo_list/i.test(type)) return '更新计划';
  return tool ? `调用工具：${tool}` : '执行步骤';
}

function summarizeMcpResult(result) {
  if (!result) return '';
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((item) => String(item?.text || item?.content || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 260);
  if (text) return text;
  if (result.structured_content) {
    return JSON.stringify(result.structured_content).replace(/\s+/g, ' ').slice(0, 260);
  }
  return '';
}

function itemDisplay(item = {}) {
  const type = String(item.type || '').trim();
  if (type === 'agent_message') return { kind: 'message', text: String(item.text || '') };
  if (type === 'reasoning') return { kind: 'reasoning', text: String(item.text || '') };
  if (type === 'mcp_tool_call') {
    const name = `${item.server || 'mcp'}.${item.tool || 'tool'}`;
    const status = item.status === 'completed' ? '完成' : item.status === 'failed' ? '失败' : '执行中';
    const result = summarizeMcpResult(item.result);
    const error = item.error?.message ? `：${item.error.message}` : '';
    return {
      kind: 'tool',
      toolName: name,
      text: `${canvasToolDisplayName(item.tool, type)}${status ? ` ${status}` : ''}${error}${result ? `：${result}` : ''}`,
    };
  }
  if (type === 'command_execution') {
    const output = String(item.aggregated_output || '').replace(/\s+/g, ' ').trim().slice(-220);
    const status = item.status === 'completed' ? `完成${typeof item.exit_code === 'number' ? `，exit ${item.exit_code}` : ''}` : item.status === 'failed' ? '失败' : '执行中';
    return {
      kind: 'tool',
      toolName: 'command_execution',
      text: `${canvasToolDisplayName('', type)}：${item.command || ''} ${status}${output ? `｜${output}` : ''}`.trim(),
    };
  }
  if (type === 'file_change') {
    const files = (Array.isArray(item.changes) ? item.changes : [])
      .map((change) => `${change.kind || 'update'} ${change.path || ''}`.trim())
      .filter(Boolean)
      .join(', ');
    return {
      kind: 'tool',
      toolName: 'file_change',
      text: `${canvasToolDisplayName('', type)}${item.status ? ` ${item.status}` : ''}${files ? `：${files}` : ''}`,
    };
  }
  if (type === 'web_search') {
    return { kind: 'tool', toolName: 'web_search', text: `${canvasToolDisplayName('', type)}：${item.query || ''}` };
  }
  if (type === 'todo_list') {
    const items = (Array.isArray(item.items) ? item.items : [])
      .slice(0, 5)
      .map((todo) => `${todo.completed ? '已完成' : '待办'} ${todo.text || ''}`.trim())
      .join('；');
    return { kind: 'plan', toolName: 'todo_list', text: items ? `计划更新：${items}` : '计划已更新' };
  }
  if (type === 'error') return { kind: 'error', text: item.message || 'Codex SDK 步骤失败' };
  return { kind: 'timeline', text: canvasToolDisplayName('', type) };
}

function mapSdkEvent(event = {}, state = {}) {
  const type = String(event.type || '');
  if (type === 'thread.started') {
    return {
      type: 'session.updated',
      channel: 'status',
      visibility: 'user',
      message: `Codex thread 已连接：${event.thread_id || ''}`,
      codexThreadId: event.thread_id,
      rawType: type,
    };
  }
  if (type === 'turn.started') {
    return {
      type: 'turn.started',
      channel: 'status',
      visibility: 'user',
      message: 'Codex SDK 轮次已开始',
      rawType: type,
    };
  }
  if (type === 'turn.completed') {
    return {
      type: 'turn.completed',
      channel: 'status',
      visibility: 'user',
      message: 'Codex 轮次完成',
      usage: event.usage,
      rawType: type,
    };
  }
  if (type === 'turn.failed') {
    return {
      type: 'turn.failed',
      channel: 'status',
      visibility: 'user',
      message: event.error?.message || 'Codex 轮次失败',
      error: event.error?.message || 'Codex 轮次失败',
      rawType: type,
    };
  }
  if (type === 'error') {
    return {
      type: 'turn.failed',
      channel: 'status',
      visibility: 'user',
      message: event.message || 'Codex SDK 流失败',
      error: event.message || 'Codex SDK 流失败',
      rawType: type,
    };
  }
  if (!/^item\./.test(type)) return null;

  const item = event.item || {};
  const itemId = String(item.id || '');
  const display = itemDisplay(item);
  const status = type === 'item.completed'
    ? (item.status === 'failed' ? 'error' : 'success')
    : item.status === 'failed'
      ? 'error'
      : 'running';
  if (display.kind === 'message' || display.kind === 'reasoning') {
    const bucket = display.kind === 'message' ? state.messageTextByItemId : state.reasoningTextByItemId;
    const prev = bucket.get(itemId) || '';
    const next = display.text || '';
    const delta = next.startsWith(prev) ? next.slice(prev.length) : next;
    bucket.set(itemId, next);
    return {
      type: display.kind === 'message' ? 'message.delta' : 'reasoning.delta',
      channel: display.kind === 'message' ? 'assistant' : 'status',
      visibility: 'user',
      delta,
      text: delta,
      fullText: next,
      itemId,
      itemType: item.type,
      status,
      rawType: type,
    };
  }
  const payload = {
    type: type === 'item.started' && display.kind === 'tool' ? 'tool.call' : display.kind === 'plan' ? 'plan.updated' : 'tool.progress',
    channel: display.kind === 'error' ? 'error' : 'tool',
    visibility: 'user',
    itemId,
    itemType: item.type,
    toolName: display.toolName,
    status,
    message: display.text,
    rawType: type,
  };
  if (display.kind === 'error') {
    payload.type = 'turn.failed';
    payload.error = display.text;
  }
  return payload;
}

function normalizeArtifacts(text, workspaceDir) {
  const byKey = new Map();
  const add = (artifact) => {
    const key = `${artifact.kind || ''}:${artifact.url || (artifact.urls || []).join('|')}:${artifact.text || artifact.content || ''}`;
    if (!byKey.has(key)) byKey.set(key, artifact);
  };
  try {
    for (const artifact of extractArtifactsFromText(text, workspaceDir)) add(artifact);
  } catch {
    // ignore artifact extraction errors
  }
  try {
    for (const artifact of extractArtifactsFromWorkspace(workspaceDir)) add(artifact);
  } catch {
    // ignore workspace scan errors
  }
  return [...byKey.values()].map((artifact) => {
    const urls = Array.isArray(artifact.urls) ? artifact.urls.map(normalizeArtifactUrl) : (artifact.url ? [normalizeArtifactUrl(artifact.url)] : []);
    return {
      ...artifact,
      ...(urls.length ? { url: urls[0], urls } : {}),
    };
  });
}

async function getOrCreateThread(body = {}) {
  const { Codex } = await loadCodexSdk();
  const recordId = getRecordId(body);
  const existing = records.get(recordId) || {};
  const permission = validateCodexSessionPermission(body);
  const threadOptions = threadOptionsForBody(body, permission);
  const codex = new Codex(sdkCodexOptions(body));
  const providedThreadId = String(body.codexThreadId || body.threadId || '').trim();
  const reusableThreadId = providedThreadId || existing.codexThreadId || '';
  const thread = reusableThreadId
    ? codex.resumeThread(reusableThreadId, threadOptions)
    : codex.startThread(threadOptions);
  const record = {
    ...existing,
    recordId,
    canvasId: body.canvasId || existing.canvasId || '',
    codexThreadId: reusableThreadId || existing.codexThreadId || '',
    codexTurnId: existing.codexTurnId || '',
    title: existing.title || String(body.title || body.message || body.prompt || '新记录').slice(0, 40),
    status: existing.status || 'idle',
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  records.set(recordId, record);
  return { codex, thread, record, permission, threadOptions };
}

function appendRecordMessage(recordId, message = {}) {
  const record = records.get(recordId);
  if (!record) return;
  const messages = Array.isArray(record.messages) ? record.messages : [];
  messages.push({ createdAt: Date.now(), ...message });
  if (messages.length > 120) messages.splice(0, messages.length - 120);
  const lastMessagePreview = messages.slice().reverse().find((item) => String(item?.text || '').trim())?.text || record.lastMessagePreview || '';
  records.set(recordId, {
    ...record,
    messages,
    messageCount: messages.length,
    lastMessagePreview: compactRecordPreview(lastMessagePreview, 180),
    updatedAt: Date.now(),
  });
}

function compactRecordPreview(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function publicRecordSnapshot(record = {}) {
  const messages = Array.isArray(record.messages) ? record.messages : [];
  const lastText = messages.slice().reverse().find((item) => String(item?.text || '').trim())?.text
    || record.lastMessagePreview
    || '';
  return {
    source: 'sdk-record',
    id: record.recordId || record.id || '',
    recordId: record.recordId || record.id || '',
    title: compactRecordPreview(record.title || lastText || '新记录', 40),
    codexThreadId: record.codexThreadId || '',
    codexTurnId: record.codexTurnId || '',
    canvasId: record.canvasId || '',
    skillName: record.skillName || '',
    directionId: record.directionId || '',
    status: record.status || 'idle',
    messageCount: Number(record.messageCount || messages.length || 0),
    lastMessagePreview: compactRecordPreview(lastText, 180),
    messages: messages.slice(-40).map((item) => ({
      role: item.role || 'assistant',
      text: compactRecordPreview(item.text, item.role === 'assistant' ? 2400 : 900),
      turnId: item.turnId || '',
      createdAt: item.createdAt || Date.now(),
    })),
    hasResearchSummary: Boolean(record.researchSummary),
    askAnswerCount: Array.isArray(record.askAnswers) ? record.askAnswers.length : 0,
    lineageCount: Array.isArray(record.lineage) ? record.lineage.length : 0,
    createdAt: Number(record.createdAt || Date.now()),
    updatedAt: Number(record.updatedAt || record.createdAt || Date.now()),
  };
}

function getGlobalCodexSessionStatus() {
  return publicSession();
}

function openGlobalCodexSession(input = {}) {
  const permission = validateCodexSessionPermission(input);
  return updateSession({
    ...permission,
    status: session.status === 'running' ? 'running' : 'idle',
    workspaceDir: normalizeWorkspaceDir(input.workspaceDir),
    codexModel: String(input.model || input.codexModel || session.codexModel || '').trim(),
    reasoningEffort: String(input.reasoningEffort || session.reasoningEffort || '').trim(),
    lastError: '',
  });
}

async function stopGlobalCodexSession() {
  if (session.status !== 'running' && session.status !== 'stopping') {
    activeAbortController = null;
    activeRun = null;
    return updateSession({ status: 'idle', currentTurnId: '', codexTurnId: '' });
  }
  updateSession({ status: 'stopping' });
  try {
    activeAbortController?.abort();
  } catch {
    // ignore
  }
  activeAbortController = null;
  activeRun = null;
  return updateSession({ status: 'idle', currentTurnId: '', codexTurnId: '' });
}

async function runGlobalCodexSessionMessage(body = {}, options = {}) {
  if (session.status === 'running' || session.status === 'stopping') {
    throw makeHttpError('codex_sdk_session_busy', 409, 'codex_sdk_session_busy: Codex 全局会话正在运行，请先停止当前任务。');
  }
  const handlers = options.handlers || {};
  const startedAt = Date.now();
  const turnId = String(body.turnId || `global-${Date.now()}`);
  const { thread, record, permission } = await getOrCreateThread(body);
  const recordId = record.recordId;
  const sdkInput = buildSdkInput(body, record);
  const turnAbortController = new AbortController();
  const externalSignal = handlers.signal;
  let timeout = null;
  let abortListener = null;
  let fullText = '';
  let codexThreadId = record.codexThreadId || '';
  const state = {
    messageTextByItemId: new Map(),
    reasoningTextByItemId: new Map(),
  };

  const finishSession = (patch = {}) => updateSession({
    status: 'idle',
    currentTurnId: '',
    codexTurnId: '',
    ...patch,
  });

  try {
    activeAbortController = turnAbortController;
    updateSession({
      ...permission,
      status: 'running',
      startedAt,
      currentTurnId: turnId,
      codexTurnId: turnId,
      codexThreadId,
      workspaceDir: normalizeWorkspaceDir(body.workspaceDir),
      codexModel: String(body.model || body.codexModel || session.codexModel || '').trim(),
      reasoningEffort: String(body.reasoningEffort || session.reasoningEffort || '').trim(),
      approvalPolicy: effectiveCodexApprovalPolicy(permission, body),
      lastError: '',
    });
    records.set(recordId, {
      ...(records.get(recordId) || record),
      status: 'running',
      codexTurnId: turnId,
      updatedAt: Date.now(),
    });

    appendRecordMessage(recordId, { role: 'user', text: String(body.message || body.prompt || body.input || '').trim(), turnId });
    handlers.onProcessStart?.();

    timeout = setTimeout(() => {
      turnAbortController.abort();
    }, Number(body.timeoutMs || DEFAULT_TURN_TIMEOUT_MS));
    timeout.unref?.();
    if (externalSignal) {
      abortListener = () => turnAbortController.abort();
      if (externalSignal.aborted) abortListener();
      else externalSignal.addEventListener('abort', abortListener, { once: true });
    }

    activeRun = thread.runStreamed(sdkInput.input, { signal: turnAbortController.signal });
    const { events } = await activeRun;
    for await (const event of events) {
      if (event.type === 'thread.started') {
        codexThreadId = event.thread_id || codexThreadId;
        const remembered = records.get(recordId) || record;
        records.set(recordId, {
          ...remembered,
          codexThreadId,
          codexTurnId: turnId,
          status: 'running',
          threadInitialized: true,
          nativeContextHash: sdkInput.prompt.runtimeHash || remembered.nativeContextHash || '',
          updatedAt: Date.now(),
        });
        updateSession({ codexThreadId });
      }
      const normalized = mapSdkEvent(event, state);
      if (!normalized) continue;
      const journalItem = recordEvent({
        recordId,
        codexThreadId,
        codexTurnId: turnId,
        payload: normalized,
        raw: event,
      });
      if (normalized.visibility === 'diagnostic') continue;
      if (normalized.type === 'message.delta') {
        const delta = normalized.delta || '';
        fullText += delta;
        handlers.onDelta?.(delta, { type: normalized.rawType, event: journalItem, item: event.item });
      } else if (normalized.type === 'reasoning.delta') {
        handlers.onReasoning?.(normalized.delta || '', { type: normalized.rawType, event: journalItem, item: event.item });
      } else if (normalized.type === 'tool.call') {
        handlers.onToolCall?.(normalized.message || '', { type: normalized.rawType, item: { name: normalized.toolName || '' }, event: journalItem });
      } else if (normalized.type === 'turn.failed') {
        handlers.onProgress?.(normalized.message || normalized.error || 'Codex 轮次失败', { type: normalized.rawType, event: journalItem });
        throw makeHttpError('codex_sdk_turn_failed', 500, normalized.error || normalized.message || 'Codex 轮次失败');
      } else {
        handlers.onProgress?.(normalized.message || normalized.type, { type: normalized.rawType, progress: normalized.progress, event: journalItem });
      }
    }

    const finalRecord = records.get(recordId) || record;
    records.set(recordId, {
      ...finalRecord,
      codexThreadId: codexThreadId || finalRecord.codexThreadId || '',
      codexTurnId: turnId,
      status: 'success',
      threadInitialized: true,
      nativeContextHash: sdkInput.prompt.runtimeHash || finalRecord.nativeContextHash || '',
      updatedAt: Date.now(),
    });
    appendRecordMessage(recordId, { role: 'assistant', text: fullText.trim(), turnId });
    const artifacts = normalizeArtifacts(fullText, normalizeWorkspaceDir(body.workspaceDir));
    finishSession({ codexThreadId: codexThreadId || session.codexThreadId, lastError: '' });
    return {
      text: fullText.trim(),
      reply: fullText.trim(),
      artifacts,
      workspace: normalizeWorkspaceDir(body.workspaceDir),
      executable: 'codex sdk',
      elapsedMs: Date.now() - startedAt,
      status: 'completed',
      progress: 100,
      codexThreadId: codexThreadId || session.codexThreadId,
      codexTurnId: turnId,
      record: records.get(recordId),
    };
  } catch (error) {
    const aborted = turnAbortController.signal.aborted || externalSignal?.aborted;
    const message = aborted ? 'Codex SDK 任务已停止。' : (error?.message || String(error));
    updateSession({
      status: aborted ? 'idle' : 'error',
      currentTurnId: '',
      codexTurnId: '',
      lastError: aborted ? '' : message,
    });
    const failedRecord = records.get(recordId);
    if (failedRecord) {
      records.set(recordId, {
        ...failedRecord,
        status: aborted ? 'idle' : 'error',
        lastError: aborted ? '' : message,
        updatedAt: Date.now(),
      });
    }
    const nextError = aborted
      ? makeHttpError('codex_sdk_session_stopped', 499, message)
      : error;
    nextError.partialText = fullText;
    nextError.workspace = normalizeWorkspaceDir(body.workspaceDir);
    nextError.executable = 'codex sdk';
    nextError.elapsedMs = Date.now() - startedAt;
    throw nextError;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (externalSignal && abortListener) externalSignal.removeEventListener('abort', abortListener);
    if (activeAbortController === turnAbortController) activeAbortController = null;
    activeRun = null;
  }
}

function respondToCodexServerRequest(input = {}) {
  return {
    answered: false,
    unsupported: true,
    requestId: String(input.requestId || input.id || ''),
    message: 'Codex SDK 当前没有暴露原生 ask/approval 回答通道；请直接在输入框继续说明，下一轮会复用同一 thread。',
    session: publicSession(),
  };
}

async function rollbackGlobalCodexSessionThread(input = {}) {
  const threadId = String(input.codexThreadId || input.threadId || session.codexThreadId || '').trim();
  const recordId = getRecordId(input);
  const record = records.get(recordId);
  const numTurns = Math.max(1, Math.min(Number(input.numTurns || 1), 20));
  if (record) {
    const messages = Array.isArray(record.messages) ? record.messages.slice(0, Math.max(0, record.messages.length - numTurns * 2)) : [];
    records.set(recordId, { ...record, messages, updatedAt: Date.now(), rollbackNote: `SDK 同 thread 重试：本地记录已回退 ${numTurns} 轮。` });
  }
  return {
    rolledBack: false,
    sdkRetrySameThread: true,
    unsupported: true,
    reason: 'Codex SDK 不暴露原生回滚；侧栏将复用同一个 codexThreadId 重新发送修改后的消息。',
    threadId,
    codexThreadId: threadId,
    numTurns,
    session: publicSession(),
  };
}

async function forkGlobalCodexSessionThread(input = {}) {
  const threadId = String(input.codexThreadId || input.threadId || session.codexThreadId || '').trim();
  return {
    forked: false,
    unsupported: true,
    reason: 'Codex SDK 不暴露原生分支；本项目正常重试固定复用同一 thread。',
    threadId,
    codexThreadId: threadId,
    sourceThreadId: threadId,
    recordId: getRecordId(input),
    session: publicSession(),
  };
}

function turnsForRecord(record = {}, limit = 40) {
  const messages = Array.isArray(record.messages) ? record.messages : [];
  const turns = [];
  for (let index = 0; index < messages.length; index += 2) {
    const user = messages[index];
    const assistant = messages[index + 1];
    const items = [];
    if (user?.text) items.push({ type: 'userMessage', role: 'user', text: user.text, content: [{ type: 'input_text', text: user.text }] });
    if (assistant?.text) items.push({ type: 'agentMessage', role: 'assistant', text: assistant.text, content: [{ type: 'output_text', text: assistant.text }] });
    if (items.length) turns.push({ id: user?.turnId || assistant?.turnId || `turn-${index / 2 + 1}`, items, summary: { items } });
  }
  return turns.slice(-Math.max(1, Number(limit) || 40));
}

async function readGlobalCodexSessionThread(input = {}) {
  const threadId = String(input.codexThreadId || input.threadId || session.codexThreadId || '').trim();
  const record = findRecordForThread(threadId) || records.get(getRecordId(input)) || null;
  const turns = record ? turnsForRecord(record, input.limit || 40) : [];
  return {
    unsupported: false,
    source: 'sdk-record',
    reason: 'Codex SDK 不提供原生历史读取；这里返回侧栏 SDK record/journal 快照。',
    threadId,
    codexThreadId: threadId,
    thread: {
      id: threadId,
      turns,
      items: turns.flatMap((turn) => turn.items || []),
    },
    turns,
    events: record?.events || [],
    session: publicSession(),
  };
}

async function listGlobalCodexSessionThreadTurns(input = {}) {
  const threadId = String(input.codexThreadId || input.threadId || session.codexThreadId || '').trim();
  const record = findRecordForThread(threadId) || records.get(getRecordId(input)) || null;
  return {
    unsupported: false,
    source: 'sdk-record',
    reason: 'Codex SDK 不提供原生轮次列表；这里返回侧栏 SDK record 快照。',
    threadId,
    codexThreadId: threadId,
    data: record ? turnsForRecord(record, input.limit || 40) : [],
    nextCursor: null,
    backwardsCursor: null,
    session: publicSession(),
  };
}

function listGlobalCodexSessionRecords(input = {}) {
  const limit = Math.min(Math.max(Number(input.limit || 40), 1), 100);
  const canvasId = String(input.canvasId || '').trim();
  const snapshots = [...records.values()]
    .map(publicRecordSnapshot)
    .filter((record) => !canvasId || record.canvasId === canvasId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
  return {
    source: 'sdk-record',
    records: snapshots,
    session: publicSession(),
  };
}

function deleteGlobalCodexSessionRecord(input = {}) {
  const recordId = getRecordId(input);
  const record = records.get(recordId) || null;
  const isActiveRecord = record && session.status === 'running' && (
    String(record.codexThreadId || '') === String(session.codexThreadId || '')
    || String(record.codexTurnId || '') === String(session.codexTurnId || session.currentTurnId || '')
  );
  if (isActiveRecord) {
    throw makeHttpError('codex_sdk_record_running', 409, '当前记录正在运行，停止任务后再删除。');
  }
  const deleted = records.delete(recordId);
  for (let index = journal.length - 1; index >= 0; index -= 1) {
    if (String(journal[index]?.recordId || '') === recordId) journal.splice(index, 1);
  }
  return {
    deleted,
    recordId,
    session: publicSession(),
  };
}

async function injectGlobalCodexSessionItems(input = {}) {
  const threadId = String(input.codexThreadId || input.threadId || session.codexThreadId || '').trim();
  const recordId = getRecordId(input);
  const record = records.get(recordId) || {};
  const runtimeContext = buildCanvasRuntimeInstructions(input);
  const nativeContextHash = runtimeContext ? contextHashForText(runtimeContext) : '';
  records.set(recordId, {
    ...record,
    recordId,
    codexThreadId: threadId || record.codexThreadId || '',
    pendingContext: runtimeContext,
    pendingContextHash: nativeContextHash,
    updatedAt: Date.now(),
  });
  return {
    injected: false,
    stored: Boolean(runtimeContext),
    unsupported: true,
    reason: 'Codex SDK 不暴露原生上下文注入；上下文已缓存到 record，下次 run 会按 hash 注入输入。',
    threadId,
    codexThreadId: threadId,
    session: publicSession(),
  };
}

async function steerGlobalCodexSessionTurn(input = {}) {
  const threadId = String(input.codexThreadId || input.threadId || session.codexThreadId || '').trim();
  const turnId = String(input.codexTurnId || input.turnId || session.codexTurnId || session.currentTurnId || '').trim();
  const recordId = getRecordId(input);
  const record = records.get(recordId) || {};
  const steers = Array.isArray(record.pendingSteers) ? record.pendingSteers : [];
  steers.push({
    prompt: String(input.prompt || input.message || '').trim(),
    createdAt: Date.now(),
    turnId,
  });
  records.set(recordId, { ...record, recordId, codexThreadId: threadId || record.codexThreadId || '', pendingSteers: steers.slice(-20), updatedAt: Date.now() });
  return {
    steered: false,
    unsupported: true,
    reason: 'Codex SDK 不暴露运行中追加输入；已记录这条追加输入，请等待当前任务结束或停止后继续同一 thread。',
    threadId,
    codexThreadId: threadId,
    turnId,
    session: publicSession(),
  };
}

function findRecordForThread(threadId) {
  const id = String(threadId || '').trim();
  if (!id) return null;
  for (const record of records.values()) {
    if (String(record?.codexThreadId || '') === id) return record;
  }
  return null;
}

function resolveCodexPlatformPackageName(platform = process.platform, arch = process.arch) {
  const platformPackageByTarget = {
    win32: {
      x64: '@openai/codex-win32-x64',
      arm64: '@openai/codex-win32-arm64',
    },
    darwin: {
      x64: '@openai/codex-darwin-x64',
      arm64: '@openai/codex-darwin-arm64',
    },
    linux: {
      x64: '@openai/codex-linux-x64',
      arm64: '@openai/codex-linux-arm64',
    },
  };
  return platformPackageByTarget[platform]?.[arch] || '';
}

function addUniquePath(list, value) {
  const text = String(value || '').trim();
  if (!text || list.includes(text)) return;
  list.push(text);
}

function packagedNodeModuleRoot(resourcesPath, packageName) {
  const root = String(resourcesPath || '').trim();
  if (!root || !packageName) return '';
  return path.join(root, 'app.asar.unpacked', 'node_modules', ...packageName.split('/'));
}

function asarUnpackedPackageRoot(pkgPath) {
  const text = String(pkgPath || '');
  if (!text) return '';
  const normalized = text.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return '';
  const packageRoot = text.slice(0, markerIndex + marker.length)
    + normalized.slice(markerIndex + marker.length).split('/').slice(0, 2).join(path.sep);
  return packageRoot.replace(/app\.asar(?=[\\/])/i, 'app.asar.unpacked');
}

function bundledCodexExecutableFromPackageRoot(packageRoot, platform = process.platform) {
  const vendorRoot = path.join(packageRoot, 'vendor');
  const targets = fs.existsSync(vendorRoot)
    ? fs.readdirSync(vendorRoot, { withFileTypes: true }).filter((item) => item.isDirectory())
    : [];
  for (const target of targets) {
    const executable = path.join(vendorRoot, target.name, 'bin', platform === 'win32' ? 'codex.exe' : 'codex');
    if (fs.existsSync(executable)) return executable;
    const legacy = path.join(vendorRoot, target.name, 'codex', platform === 'win32' ? 'codex.exe' : 'codex');
    if (fs.existsSync(legacy)) return legacy;
  }
  return '';
}

function resolveBundledCodexExecutable(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const resourcesPath = String(options.resourcesPath || process.resourcesPath || '').trim();
  const requireResolve = options.requireResolve || require.resolve;
  const packageName = resolveCodexPlatformPackageName(platform, arch);
  if (!packageName) return null;

  const packageRoots = [];
  addUniquePath(packageRoots, packagedNodeModuleRoot(resourcesPath, packageName));

  try {
    const pkgPath = requireResolve(`${packageName}/package.json`);
    addUniquePath(packageRoots, asarUnpackedPackageRoot(pkgPath));
    addUniquePath(packageRoots, path.dirname(pkgPath));
  } catch {
    // Packaged builds may resolve dependencies from app.asar.unpacked only.
  }

  for (const packageRoot of packageRoots) {
    const executable = bundledCodexExecutableFromPackageRoot(packageRoot, platform);
    if (executable) return executable;
  }

  return null;
}

async function probeCodexSdkStatus(options = {}) {
  const explicitPath = String(options.executablePath || '').trim();
  const bundledExecutable = explicitPath ? '' : resolveBundledCodexExecutable(options);
  const executablePath = explicitPath || bundledExecutable || undefined;
  const cliStatus = await probeCodexStatus({
    ...options,
    executablePath,
  }).catch((error) => ({
    available: false,
    message: error?.message || String(error),
  }));
  return {
    ...cliStatus,
    transport: 'sdk',
    sdkReady: Boolean(cliStatus.available),
    bundledExecutable: bundledExecutable || '',
    executable: cliStatus.executable || executablePath || 'codex',
    message: cliStatus.available
      ? `Codex SDK 可用：${cliStatus.authStatus || cliStatus.message || ''}`.trim()
      : cliStatus.message,
  };
}

function cleanupGlobalCodexSession() {
  void stopGlobalCodexSession();
}

module.exports = {
  GLOBAL_CODEX_SESSION_ID,
  PERMISSION_PRESETS,
  cleanupGlobalCodexSession,
  deleteGlobalCodexSessionRecord,
  forkGlobalCodexSessionThread,
  getGlobalCodexSessionStatus,
  injectGlobalCodexSessionItems,
  listGlobalCodexSessionRecords,
  listGlobalCodexSessionThreadTurns,
  buildCanvasRuntimeInstructionsForTests: buildCanvasRuntimeInstructions,
  buildThreadInstructionsForTests: buildThreadInstructions,
  mapSdkEventForTests: mapSdkEvent,
  openGlobalCodexSession,
  probeCodexSdkStatus,
  readGlobalCodexSessionThread,
  records,
  journal,
  resolveBundledCodexExecutableForTests: resolveBundledCodexExecutable,
  resolveHakimiHttpMcpUrl,
  resolveHakimiMcpBackendUrl,
  respondToCodexServerRequest,
  rollbackGlobalCodexSessionThread,
  runGlobalCodexSessionMessage,
  steerGlobalCodexSessionTurn,
  stopGlobalCodexSession,
  toUserInputForTests: toUserInput,
  validateCodexSessionPermission,
};
