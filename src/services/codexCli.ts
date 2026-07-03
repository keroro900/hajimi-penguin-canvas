const BASE = '/api/codex-cli';
const CODEX_ROUTE_MISSING_MESSAGE = 'Codex SDK 后端路由未加载：请重启后端服务或桌面应用，让 /api/codex-cli 生效。';
const CODEX_SESSION_ROUTE_MISSING_MESSAGE = 'Codex SDK 会话接口未加载：请重启后端服务或桌面应用，让 /api/codex-cli/sessions/global 生效。';
const CODEX_SKILLS_ROUTE_MISSING_MESSAGE = 'Codex skills 接口未加载：请重启后端服务或桌面应用，让 /api/codex-cli/skills 生效。';

export function codexRouteMissingMessageForTests(status: number, url = ''): string {
  if (status === 404) {
    if (/\/sessions\/global/i.test(url)) return CODEX_SESSION_ROUTE_MISSING_MESSAGE;
    if (/\/skills/i.test(url)) return CODEX_SKILLS_ROUTE_MISSING_MESSAGE;
    return CODEX_ROUTE_MISSING_MESSAGE;
  }
  return `HTTP ${status}`;
}

export interface CodexCliStatus {
  available: boolean;
  executable?: string;
  version?: string;
  authStatus?: string;
  featureNames?: string[];
  features?: Array<{ name: string; stage?: string; enabled?: boolean }>;
  message?: string;
}

export type CodexSessionStatus = 'idle' | 'running' | 'stopping' | 'error';

export interface CodexGlobalSession {
  sessionId: string;
  status: CodexSessionStatus;
  pid?: number | null;
  startedAt?: number | null;
  updatedAt?: number;
  workspaceDir?: string;
  permissionPreset?: string;
  sandbox?: string;
  approvalPolicy?: string;
  codexModel?: string;
  reasoningEffort?: string;
  currentTurnId?: string;
  codexThreadId?: string;
  codexTurnId?: string;
  lastError?: string;
  cliStatus?: CodexCliStatus;
}

export interface CodexRecordSnapshot {
  source?: string;
  id: string;
  recordId: string;
  title: string;
  codexThreadId?: string;
  codexTurnId?: string;
  canvasId?: string | null;
  skillName?: string;
  directionId?: string;
  status?: 'idle' | 'running' | 'success' | 'error';
  messageCount?: number;
  lastMessagePreview?: string;
  messages?: Array<{ role?: string; text?: string; turnId?: string; createdAt?: number }>;
  hasResearchSummary?: boolean;
  askAnswerCount?: number;
  lineageCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface CodexSkillDirection {
  id: string;
  label: string;
  hint?: string;
}

export interface CodexSkillQuestion {
  id: string;
  label: string;
  options?: string[];
  recommended?: string;
}

export interface CodexSkillCanvasTemplate {
  id: string;
  label: string;
  flow?: string;
}

export interface CodexSkillVerificationItem {
  id: string;
  label: string;
  hint?: string;
}

export interface CodexSkill {
  id: string;
  name: string;
  description: string;
  category?: string;
  directions?: CodexSkillDirection[];
  questions?: CodexSkillQuestion[];
  templates?: CodexSkillCanvasTemplate[];
  verification?: CodexSkillVerificationItem[];
  body?: string;
  scope: 'global' | 'project';
  path?: string;
}

export interface CodexSkillValidation {
  name: string;
  path?: string;
  ok: boolean;
  requiredSections: string[];
  missingSections: string[];
  parseWarnings: string[];
  parsed: {
    directions?: CodexSkillDirection[];
    questions?: CodexSkillQuestion[];
    templates?: CodexSkillCanvasTemplate[];
    verification?: CodexSkillVerificationItem[];
  };
}

export interface CodexReferenceImageResult {
  id: string;
  title: string;
  url: string;
  thumbUrl?: string;
  sourceUrl: string;
  license?: string;
  author?: string;
}

export interface CodexResearchSummary {
  cacheKey: string;
  cached?: boolean;
  query: string;
  skillName?: string;
  directionId?: string;
  mode?: 'quick' | 'deep' | string;
  keywords: string[];
  sources: Array<{ title: string; url: string; type?: string }>;
  promptStructure: string[];
  createdAt: number;
}

export interface CodexSkillFileEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  children?: CodexSkillFileEntry[];
}

export interface CodexGenerationPreferences {
  image: {
    model: string;
    apiModel?: string;
    size: string;
    aspectRatio: string;
    quality: string;
  };
  video: {
    model: string;
    apiModel?: string;
    duration: number;
    aspectRatio: string;
    resolution?: string;
    motion: string;
    quality: string;
  };
  codex: {
    model: string;
    reasoningEffort: string;
    permissionPreset: string;
    sandbox: string;
    approvalPolicy: string;
  };
}

export interface CodexCanvasIntent {
  target: string;
  canvasId?: string | null;
  outputType?: 'image' | 'video' | 'canvas' | 'text' | 'mixed';
  skillName?: string;
  directionId?: string;
  directionHint?: string;
  mentions?: Array<{ id: string; kind?: string; label?: string; url?: string; token?: string }>;
  referenceImages?: string[];
  missingDecisions?: string[];
  risks?: string[];
}

export interface CodexAgentArtifact {
  id?: string;
  turnId?: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'model3d' | 'file';
  title?: string;
  text?: string;
  content?: string;
  url?: string;
  urls?: string[];
  status?: string;
  progress?: number;
  message?: string;
  createdAt?: number;
}

export interface CodexCliPayload {
  nodeId?: string;
  sessionId?: string;
  turnId?: string;
  mode?: string;
  command?: string;
  preset?: string;
  prompt?: string;
  referenceTexts?: string[];
  images?: string[];
  videos?: string[];
  audios?: string[];
  selectedSkillNames?: string[];
  selectedSkillName?: string;
  selectedDirectionId?: string;
  canvasRuntimeContext?: string;
  canvasIntent?: CodexCanvasIntent;
  canvasPlanPreference?: Record<string, any>;
  generationPreferences?: CodexGenerationPreferences;
  mentions?: Array<Record<string, any>>;
  recordId?: string;
  codexThreadId?: string;
  researchMode?: 'none' | 'quick' | 'deep';
  workspaceDir?: string;
  model?: string;
  profile?: string;
  sandbox?: string;
  approvalPolicy?: string;
  reasoningEffort?: string;
  webSearch?: boolean;
  includePlanTool?: boolean;
  extraArgs?: string[];
  executablePath?: string;
  [key: string]: any;
}

export interface CodexCliResult {
  text?: string;
  reply?: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  videoUrls?: string[];
  audioUrl?: string;
  audioUrls?: string[];
  modelUrl?: string;
  modelUrls?: string[];
  artifacts?: CodexAgentArtifact[];
  workspace?: string;
  status?: string;
  progress?: number;
  message?: string;
  [key: string]: any;
}

export interface CodexTimelineItem {
  id: string;
  itemId?: string;
  turnId?: string;
  type?: string;
  toolName?: string;
  title: string;
  message?: string;
  status?: 'running' | 'success' | 'error';
  rawType?: string;
  updatedAt: number;
}

export interface CodexStreamEvent {
  type?: string;
  event?: string;
  itemId?: string;
  turnId?: string;
  itemType?: string;
  toolName?: string;
  status?: 'running' | 'success' | 'error' | string;
  delta?: string;
  text?: string;
  message?: string;
  requestId?: string;
  actionId?: string;
  params?: Record<string, any>;
  payload?: Record<string, any>;
  availableDecisions?: string[];
  decision?: string;
  progress?: number;
  artifact?: CodexAgentArtifact;
  result?: CodexCliResult;
  session?: CodexGlobalSession;
  done?: boolean;
  error?: string;
  [key: string]: any;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    const error = new Error(data?.error || data?.message || codexRouteMissingMessageForTests(res.status, url)) as Error & {
      status?: number;
      code?: string;
      data?: unknown;
      expired?: boolean;
    };
    error.status = res.status;
    error.code = data?.code;
    error.data = data?.data;
    error.expired = Boolean(data?.data?.expired);
    throw error;
  }
  return (data?.data ?? data) as T;
}

function parseSseEvent(raw: string): any | null {
  const eventLine = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .find((line) => line.startsWith('event:'));
  const eventName = eventLine ? eventLine.slice(6).trim() : '';
  const dataLines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const text = dataLines.join('\n');
  if (!text || text === '[DONE]') return { done: true, event: eventName || 'done' };
  try {
    const parsed = JSON.parse(text);
    return eventName && !parsed.event ? { ...parsed, event: eventName } : parsed;
  } catch {
    return { text, event: eventName };
  }
}

export function extractCodexStreamDeltaForTests(event: any): { delta: string; done: boolean; error?: string } {
  if (!event) return { delta: '', done: false };
  if (event.error || event.type === 'artifact.failed' || event.event === 'artifact.failed' || event.type === 'turn.failed' || event.event === 'turn.failed') {
    return { delta: '', done: false, error: String(event.error || event.message || 'Codex SDK 流式任务失败') };
  }
  if (event.done || event.type === 'done' || event.event === 'done') return { delta: '', done: true };
  const delta =
    event.delta ||
    (event.type === 'message.delta' ? event.text : '') ||
    (event.event === 'message.delta' ? event.text : '') ||
    event.text_delta ||
    event.output_text_delta ||
    '';
  return { delta: typeof delta === 'string' ? delta : '', done: false };
}

function mergeArtifact(result: CodexCliResult, artifact: CodexAgentArtifact) {
  if (!artifact) return;
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  if (!artifact.id || !artifacts.some((item) => item.id === artifact.id)) artifacts.push(artifact);
  result.artifacts = artifacts;
  const urls = Array.isArray(artifact.urls) ? artifact.urls : (artifact.url ? [artifact.url] : []);
  if (artifact.text) {
    result.text = artifact.text;
    result.reply = artifact.text;
  }
  if (artifact.kind === 'image') {
    result.imageUrls = urls;
    result.imageUrl = urls[0] || result.imageUrl;
  }
  if (artifact.kind === 'video') {
    result.videoUrls = urls;
    result.videoUrl = urls[0] || result.videoUrl;
  }
  if (artifact.kind === 'audio') {
    result.audioUrls = urls;
    result.audioUrl = urls[0] || result.audioUrl;
  }
  if (artifact.kind === 'model3d') {
    result.modelUrls = urls;
    result.modelUrl = urls[0] || result.modelUrl;
  }
}

function mergeResult(target: CodexCliResult, patch?: CodexCliResult) {
  if (!patch || typeof patch !== 'object') return;
  Object.assign(target, patch);
  if (Array.isArray(patch.artifacts)) {
    patch.artifacts.forEach((artifact) => mergeArtifact(target, artifact));
  }
}

export async function getCodexCliStatus(executablePath?: string): Promise<CodexCliStatus> {
  const q = executablePath ? `?executablePath=${encodeURIComponent(executablePath)}` : '';
  return requestJson<CodexCliStatus>(`${BASE}/status${q}`);
}

export async function getGlobalCodexSession(): Promise<CodexGlobalSession> {
  return requestJson<CodexGlobalSession>(`${BASE}/sessions/global`);
}

export async function openGlobalCodexSession(payload: {
  permissionPreset?: string;
  sandbox?: string;
  approvalPolicy?: string;
  workspaceDir?: string;
  executablePath?: string;
  model?: string;
  codexModel?: string;
  reasoningEffort?: string;
} = {}): Promise<CodexGlobalSession> {
  return requestJson<CodexGlobalSession>(`${BASE}/sessions/global/open`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function stopGlobalCodexSession(): Promise<CodexGlobalSession> {
  return requestJson<CodexGlobalSession>(`${BASE}/sessions/global/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function listGlobalCodexRecords(payload: {
  limit?: number;
  canvasId?: string | null;
} = {}): Promise<{ source: string; records: CodexRecordSnapshot[]; session: CodexGlobalSession }> {
  const sp = new URLSearchParams();
  if (payload.limit) sp.set('limit', String(payload.limit));
  if (payload.canvasId) sp.set('canvasId', String(payload.canvasId));
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return requestJson<{ source: string; records: CodexRecordSnapshot[]; session: CodexGlobalSession }>(`${BASE}/sessions/global/records${q}`);
}

export async function deleteGlobalCodexRecord(payload: {
  recordId: string;
}): Promise<{ deleted: boolean; recordId: string; session: CodexGlobalSession }> {
  return requestJson<{ deleted: boolean; recordId: string; session: CodexGlobalSession }>(
    `${BASE}/sessions/global/records/${encodeURIComponent(payload.recordId)}`,
    { method: 'DELETE' },
  );
}

export async function rollbackGlobalCodexSession(payload: {
  codexThreadId?: string;
  threadId?: string;
  recordId?: string;
  workspaceDir?: string;
  numTurns: number;
  permissionPreset?: string;
  sandbox?: string;
  approvalPolicy?: string;
  canvasRuntimeContext?: string;
}): Promise<{ rolledBack: boolean; codexThreadId: string; threadId: string; numTurns: number; session: CodexGlobalSession }> {
  return requestJson<{ rolledBack: boolean; codexThreadId: string; threadId: string; numTurns: number; session: CodexGlobalSession }>(
    `${BASE}/sessions/global/rollback`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function forkGlobalCodexThread(payload: {
  codexThreadId?: string;
  threadId?: string;
  codexTurnId?: string;
  turnId?: string;
  recordId?: string;
  nextRecordId?: string;
  canvasId?: string | null;
  workspaceDir?: string;
  permissionPreset?: string;
  sandbox?: string;
  approvalPolicy?: string;
  canvasRuntimeContext?: string;
}): Promise<{
  forked: boolean;
  unsupported?: boolean;
  reason?: string;
  codexThreadId: string;
  threadId: string;
  sourceThreadId?: string;
  recordId?: string;
  session: CodexGlobalSession;
}> {
  return requestJson<{
    forked: boolean;
    unsupported?: boolean;
    reason?: string;
    codexThreadId: string;
    threadId: string;
    sourceThreadId?: string;
    recordId?: string;
    session: CodexGlobalSession;
  }>(`${BASE}/sessions/global/fork`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function readGlobalCodexThread(payload: {
  codexThreadId?: string;
  threadId?: string;
  includeTurns?: boolean;
  executablePath?: string;
} = {}): Promise<{ unsupported?: boolean; reason?: string; threadId: string; thread: any; session: CodexGlobalSession }> {
  const sp = new URLSearchParams();
  if (payload.codexThreadId || payload.threadId) sp.set('threadId', String(payload.codexThreadId || payload.threadId));
  if (payload.includeTurns === false) sp.set('includeTurns', 'false');
  if (payload.executablePath) sp.set('executablePath', payload.executablePath);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return requestJson<{ unsupported?: boolean; reason?: string; threadId: string; thread: any; session: CodexGlobalSession }>(`${BASE}/sessions/global/thread${q}`);
}

export async function listGlobalCodexThreadTurns(payload: {
  codexThreadId?: string;
  threadId?: string;
  limit?: number;
  cursor?: string;
  sortDirection?: 'asc' | 'desc';
  itemsView?: 'notLoaded' | 'summary' | 'full';
  executablePath?: string;
} = {}): Promise<{ unsupported?: boolean; reason?: string; threadId: string; data: any[]; nextCursor?: string | null; backwardsCursor?: string | null; session: CodexGlobalSession }> {
  const sp = new URLSearchParams();
  if (payload.codexThreadId || payload.threadId) sp.set('threadId', String(payload.codexThreadId || payload.threadId));
  if (payload.limit) sp.set('limit', String(payload.limit));
  if (payload.cursor) sp.set('cursor', payload.cursor);
  if (payload.sortDirection) sp.set('sortDirection', payload.sortDirection);
  if (payload.itemsView) sp.set('itemsView', payload.itemsView);
  if (payload.executablePath) sp.set('executablePath', payload.executablePath);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return requestJson<{ unsupported?: boolean; reason?: string; threadId: string; data: any[]; nextCursor?: string | null; backwardsCursor?: string | null; session: CodexGlobalSession }>(`${BASE}/sessions/global/turns${q}`);
}

export async function injectGlobalCodexContext(payload: CodexCliPayload & {
  items?: Array<Record<string, any>>;
}): Promise<{ injected?: boolean; unsupported?: boolean; reason?: string; threadId?: string; itemCount?: number; session: CodexGlobalSession }> {
  return requestJson<{ injected?: boolean; unsupported?: boolean; reason?: string; threadId?: string; itemCount?: number; session: CodexGlobalSession }>(
    `${BASE}/sessions/global/inject`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export async function steerGlobalCodexSession(payload: CodexCliPayload & {
  codexTurnId?: string;
}): Promise<{ steered: boolean; unsupported?: boolean; reason?: string; threadId?: string; turnId?: string; session: CodexGlobalSession }> {
  return requestJson<{ steered: boolean; unsupported?: boolean; reason?: string; threadId?: string; turnId?: string; session: CodexGlobalSession }>(
    `${BASE}/sessions/global/steer`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export async function answerGlobalCodexSessionRequest(payload: {
  requestId: string;
  questionId?: string;
  answer?: string;
  decision?: string;
  answers?: string[];
  answersByQuestion?: Record<string, string | string[]>;
}): Promise<{ requestId: string; answered: boolean; expired?: boolean; answers: string[]; decision?: string; availableDecisions?: string[]; result?: unknown }> {
  return requestJson<{ requestId: string; answered: boolean; expired?: boolean; answers: string[]; decision?: string; availableDecisions?: string[]; result?: unknown }>(`${BASE}/sessions/global/answer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function startCodexCliLogin(payload: { executablePath?: string; deviceAuth?: boolean } = {}): Promise<{ started: boolean; executable?: string; command?: string; mode?: string; scriptPath?: string; message?: string }> {
  return requestJson<{ started: boolean; executable?: string; command?: string; mode?: string; scriptPath?: string; message?: string }>(`${BASE}/login/start`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCodexCliSkills(payload: { nodeId?: string; sessionId?: string; workspaceDir?: string } = {}): Promise<{ workspaceDir: string; skills: CodexSkill[] }> {
  const sp = new URLSearchParams();
  if (payload.nodeId) sp.set('nodeId', payload.nodeId);
  if (payload.sessionId) sp.set('sessionId', payload.sessionId);
  if (payload.workspaceDir) sp.set('workspaceDir', payload.workspaceDir);
  const qs = sp.toString();
  return requestJson<{ workspaceDir: string; skills: CodexSkill[] }>(`${BASE}/skills${qs ? `?${qs}` : ''}`);
}

export async function validateCodexProjectSkill(payload: {
  workspaceDir?: string;
  name: string;
}): Promise<CodexSkillValidation> {
  const sp = new URLSearchParams();
  if (payload.workspaceDir) sp.set('workspaceDir', payload.workspaceDir);
  const qs = sp.toString();
  return requestJson<CodexSkillValidation>(
    `${BASE}/skills/project/${encodeURIComponent(payload.name)}/validate${qs ? `?${qs}` : ''}`,
  );
}

export async function searchCodexReferenceImages(payload: {
  query: string;
  limit?: number;
}): Promise<{ query: string; images: CodexReferenceImageResult[] }> {
  const sp = new URLSearchParams();
  sp.set('q', payload.query);
  if (payload.limit) sp.set('limit', String(payload.limit));
  return requestJson<{ query: string; images: CodexReferenceImageResult[] }>(`${BASE}/research/reference-images?${sp.toString()}`);
}

export async function getCodexResearchSummary(payload: {
  query: string;
  skillName?: string;
  directionId?: string;
  mode?: 'quick' | 'deep' | string;
  limit?: number;
}): Promise<CodexResearchSummary> {
  return requestJson<CodexResearchSummary>(`${BASE}/research/summary`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createCodexProjectSkill(payload: {
  nodeId?: string;
  sessionId?: string;
  workspaceDir?: string;
  name: string;
  title?: string;
  description?: string;
  category?: string;
  body?: string;
}): Promise<{ workspaceDir: string; skill: CodexSkill }> {
  return requestJson<{ workspaceDir: string; skill: CodexSkill }>(`${BASE}/skills/project`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function importCodexProjectSkillArchive(payload: {
  nodeId?: string;
  sessionId?: string;
  workspaceDir?: string;
  name?: string;
  filename?: string;
  archiveBase64: string;
}): Promise<{ workspaceDir: string; skill: CodexSkill }> {
  return requestJson<{ workspaceDir: string; skill: CodexSkill }>(`${BASE}/skills/project/import-archive`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adaptCodexProjectSkillForSidebar(payload: {
  nodeId?: string;
  sessionId?: string;
  workspaceDir?: string;
  name: string;
}): Promise<{ workspaceDir: string; skill: CodexSkill }> {
  return requestJson<{ workspaceDir: string; skill: CodexSkill }>(`${BASE}/skills/project/${encodeURIComponent(payload.name)}/adapt-sidebar`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCodexProjectSkill(payload: {
  nodeId?: string;
  sessionId?: string;
  workspaceDir?: string;
  oldName: string;
  name: string;
  title?: string;
  description?: string;
  category?: string;
  body?: string;
}): Promise<{ workspaceDir: string; skill: CodexSkill }> {
  return requestJson<{ workspaceDir: string; skill: CodexSkill }>(`${BASE}/skills/project/${encodeURIComponent(payload.oldName)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCodexProjectSkill(payload: {
  nodeId?: string;
  sessionId?: string;
  workspaceDir?: string;
  name: string;
}): Promise<{ workspaceDir: string; name: string; deleted: boolean }> {
  return requestJson<{ workspaceDir: string; name: string; deleted: boolean }>(`${BASE}/skills/project/${encodeURIComponent(payload.name)}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export async function getCodexProjectSkillFiles(payload: {
  workspaceDir?: string;
  name: string;
}): Promise<{ workspaceDir: string; name: string; baseDir: string; files: CodexSkillFileEntry[] }> {
  const sp = new URLSearchParams();
  if (payload.workspaceDir) sp.set('workspaceDir', payload.workspaceDir);
  const qs = sp.toString();
  return requestJson<{ workspaceDir: string; name: string; baseDir: string; files: CodexSkillFileEntry[] }>(
    `${BASE}/skills/project/${encodeURIComponent(payload.name)}/files${qs ? `?${qs}` : ''}`,
  );
}

export async function readCodexProjectSkillFile(payload: {
  workspaceDir?: string;
  name: string;
  path?: string;
}): Promise<{ workspaceDir: string; path: string; content: string }> {
  const sp = new URLSearchParams();
  if (payload.workspaceDir) sp.set('workspaceDir', payload.workspaceDir);
  if (payload.path) sp.set('path', payload.path);
  const qs = sp.toString();
  return requestJson<{ workspaceDir: string; path: string; content: string }>(
    `${BASE}/skills/project/${encodeURIComponent(payload.name)}/file${qs ? `?${qs}` : ''}`,
  );
}

export async function writeCodexProjectSkillFile(payload: {
  workspaceDir?: string;
  name: string;
  path: string;
  content: string;
}): Promise<{ workspaceDir: string; path: string; saved: boolean; bytes: number }> {
  return requestJson<{ workspaceDir: string; path: string; saved: boolean; bytes: number }>(
    `${BASE}/skills/project/${encodeURIComponent(payload.name)}/file`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export async function streamCodexCliAgent(
  payload: CodexCliPayload,
  options: {
    signal?: AbortSignal;
    onDelta?: (delta: string, event?: CodexStreamEvent) => void;
    onEvent?: (event: CodexStreamEvent) => void;
  } = {},
): Promise<CodexCliResult> {
  const res = await fetch(`${BASE}/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!res.ok) {
    let message = codexRouteMissingMessageForTests(res.status, `${BASE}/sessions/global/message/stream`);
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error('浏览器不支持流式读取。');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let reply = '';
  const result: CodexCliResult = {};

  const consume = (raw: string) => {
    const event = parseSseEvent(raw) as CodexStreamEvent | null;
    if (!event) return false;
    options.onEvent?.(event);
    const parsed = extractCodexStreamDeltaForTests(event);
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.delta) {
      reply += parsed.delta;
      result.text = reply;
      result.reply = reply;
      options.onDelta?.(parsed.delta, event);
    }
    if (event.artifact) mergeArtifact(result, event.artifact);
    if (event.result) mergeResult(result, event.result);
    return parsed.done;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitAt = buffer.indexOf('\n\n');
    while (splitAt >= 0) {
      const chunk = buffer.slice(0, splitAt);
      buffer = buffer.slice(splitAt + 2);
      if (consume(chunk)) return result;
      splitAt = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) consume(buffer);
  return result;
}

export async function streamGlobalCodexSessionMessage(
  payload: CodexCliPayload & {
    permissionPreset?: string;
    drivingMode?: 'copilot' | 'autopilot';
    canvasId?: string | null;
    restart?: boolean;
  },
  options: {
    signal?: AbortSignal;
    onDelta?: (delta: string, event?: CodexStreamEvent) => void;
    onEvent?: (event: CodexStreamEvent) => void;
  } = {},
): Promise<CodexCliResult> {
  const res = await fetch(`${BASE}/sessions/global/message/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!res.ok) {
    let message = codexRouteMissingMessageForTests(res.status, `${BASE}/agent/stream`);
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error('浏览器不支持流式读取。');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let reply = '';
  const result: CodexCliResult = {};

  const consume = (raw: string) => {
    const event = parseSseEvent(raw) as CodexStreamEvent | null;
    if (!event) return false;
    options.onEvent?.(event);
    const parsed = extractCodexStreamDeltaForTests(event);
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.delta) {
      reply += parsed.delta;
      result.text = reply;
      result.reply = reply;
      options.onDelta?.(parsed.delta, event);
    }
    if (event.artifact) mergeArtifact(result, event.artifact);
    if (event.result) mergeResult(result, event.result);
    return parsed.done;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitAt = buffer.indexOf('\n\n');
    while (splitAt >= 0) {
      const chunk = buffer.slice(0, splitAt);
      buffer = buffer.slice(splitAt + 2);
      if (consume(chunk)) return result;
      splitAt = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) consume(buffer);
  return result;
}
