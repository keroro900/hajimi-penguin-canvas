/**
 * T8-penguin-canvas 后端 API 封装
 * 所有请求走 Vite proxy → http://127.0.0.1:18766
 */
import type { AdvancedProviderConfig, ApiSettings, CanvasData, CanvasListItem, CloudUploadSummary, CloudUploadTargetConfig } from '../types/canvas';
import type { ThemeTemplate } from '../theme/types';
import type { MediaKind } from '../utils/mediaCollection';

const BASE = '/api';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errMsg = data.error || data.message || errMsg;
    } catch {
      /* ignore */
    }
    throw new Error(errMsg);
  }
  return res.json();
}

// ========== 状态 ==========
export async function checkBackendStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/status`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkCanvasStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/canvas`);
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.success === true && Array.isArray(data?.data);
  } catch {
    return false;
  }
}

export async function checkHakimiMcpStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/hakimi-mcp/status`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.ok === true && String(data?.service || '').startsWith('hakimi-mcp');
  } catch {
    return false;
  }
}

// ========== 画布列表 ==========
export async function listCanvases(): Promise<CanvasListItem[]> {
  const res = await request<{ success: boolean; data: CanvasListItem[] }>(`${BASE}/canvas`);
  return res.data || [];
}

export function createCanvasEventSource(): EventSource {
  return new EventSource(`${BASE}/canvas/events`);
}

export async function submitAgentCanvasAnswer(runId: string, payload: {
  canvasId?: string;
  questionId: string;
  value: unknown;
  label?: string;
}): Promise<void> {
  await request(`${BASE}/agent/canvas/runs/${encodeURIComponent(runId)}/answers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitAgentCanvasNodeResult(runId: string, payload: {
  canvasId?: string;
  nodeId: string;
  ok: boolean;
  error?: string;
  node?: any;
  completedAt?: number;
}): Promise<void> {
  await request(`${BASE}/agent/canvas/runs/${encodeURIComponent(runId)}/node-result`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAgentCanvasSnapshot(canvasId: string): Promise<any> {
  const res = await request<{ success: boolean; data: any }>(
    `${BASE}/agent/canvas/snapshot/${encodeURIComponent(canvasId)}`,
  );
  return res.data;
}

export async function applyAgentCanvasPlan(payload: {
  canvasId: string;
  agentId?: string;
  runId?: string;
  planId?: string;
  mode?: 'preview' | 'commit';
  drivingMode?: 'copilot' | 'autopilot';
  approvalPolicy?: 'ask_destructive' | 'ask_everything' | 'never';
  plan: any;
}): Promise<any> {
  const res = await request<{ success: boolean; data: any }>(`${BASE}/agent/canvas/plans/apply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function diffAgentCanvasPlan(payload: {
  canvasId: string;
  plan: any;
  autoLayout?: boolean;
}): Promise<any> {
  const res = await request<{ success: boolean; data: any }>(`${BASE}/agent/canvas/plans/diff`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function verifyAgentCanvasPlan(payload: {
  canvasId: string;
  plan: any;
  beforeSnapshot?: any;
}): Promise<any> {
  const res = await request<{ success: boolean; data: any }>(`${BASE}/agent/canvas/plans/verify`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function undoAgentCanvasOperationBatch(operationBatchId: string, payload: {
  canvasId?: string;
  force?: boolean;
} = {}): Promise<any> {
  const res = await request<{ success: boolean; data: any }>(
    `${BASE}/agent/canvas/operations/${encodeURIComponent(operationBatchId)}/undo`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

export async function createCanvas(name?: string): Promise<CanvasListItem> {
  const res = await request<{ success: boolean; data: CanvasListItem }>(`${BASE}/canvas`, {
    method: 'POST',
    body: JSON.stringify({ name: name || '未命名画布' }),
  });
  return res.data;
}

export async function getCanvasData(id: string): Promise<CanvasData> {
  const res = await request<{ success: boolean; data: CanvasData }>(`${BASE}/canvas/${id}`);
  return res.data;
}

export async function saveCanvasData(id: string, data: CanvasData, options?: { allowEmpty?: boolean }): Promise<void> {
  const query = options?.allowEmpty ? '?allowEmpty=1' : '';
  await request(`${BASE}/canvas/${id}${query}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function autoSaveCanvasData(
  id: string,
  data: CanvasData,
): Promise<{ path?: string; nodeCount?: number; edgeCount?: number }> {
  const res = await request<{
    success: boolean;
    data: { path?: string; nodeCount?: number; edgeCount?: number };
  }>(`${BASE}/canvas/${id}/auto-save`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data || {};
}

export async function deleteCanvas(id: string): Promise<void> {
  await request(`${BASE}/canvas/${id}`, { method: 'DELETE' });
}

export async function renameCanvas(id: string, name: string): Promise<CanvasListItem> {
  const res = await request<{ success: boolean; data: CanvasListItem }>(
    `${BASE}/canvas/${id}/name`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }
  );
  return res.data;
}

// ========== 设置(三套通用 Key + 分类 Key) ==========
export async function getSettings(): Promise<ApiSettings> {
  const res = await request<{ success: boolean; data: ApiSettings }>(`${BASE}/settings`);
  return res.data;
}

// 获取明文 Key（仅用于设置弹窗内眼睛预览，不脱敏）
export async function getRawSettings(): Promise<ApiSettings> {
  const res = await request<{ success: boolean; data: ApiSettings }>(`${BASE}/settings/raw`);
  return res.data;
}

export async function updateSettings(patch: Partial<ApiSettings>): Promise<void> {
  await request(`${BASE}/settings`, {
    method: 'POST',
    body: JSON.stringify(patch),
  });
}

export type TaskCompletionSoundSettings = NonNullable<ApiSettings['taskCompletionSound']>;

export async function getTaskCompletionSoundSettings(): Promise<TaskCompletionSoundSettings> {
  const res = await request<{ success: boolean; data: TaskCompletionSoundSettings }>(
    `${BASE}/settings/task-completion-sound`,
  );
  return res.data || { mode: 'default', url: '' };
}

export async function uploadTaskCompletionSound(file: File): Promise<TaskCompletionSoundSettings> {
  const form = new FormData();
  form.append('audio', file);
  const res = await fetch(`${BASE}/settings/task-completion-sound`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errMsg = data.error || data.message || errMsg;
    } catch {
      /* ignore */
    }
    throw new Error(errMsg);
  }
  const data = await res.json();
  return data.data || { mode: 'default', url: '' };
}

export async function resetTaskCompletionSound(): Promise<TaskCompletionSoundSettings> {
  const res = await request<{ success: boolean; data: TaskCompletionSoundSettings }>(
    `${BASE}/settings/task-completion-sound`,
    { method: 'DELETE' },
  );
  return res.data || { mode: 'default', url: '' };
}

export interface AdvancedProviderTestResult {
  ok: boolean;
  code: string;
  providerId: string;
  protocol: string;
  message?: string;
  error?: string;
  provider?: AdvancedProviderConfig;
  cached?: boolean;
  fetchedAt?: string;
  modelListUrl?: string;
  warning?: string;
}

export interface AdvancedProviderModelsResult {
  ok: boolean;
  code: string;
  providerId: string;
  protocol: string;
  total?: number;
  modelCount?: number;
  imageModels?: string[];
  videoModels?: string[];
  audioModels?: string[];
  unknownModels?: string[];
  chatModels?: string[];
  all?: string[];
  message?: string;
  error?: string;
  provider?: AdvancedProviderConfig;
}

export async function testAdvancedProvider(payload: {
  providerId?: string;
  provider?: AdvancedProviderConfig;
  dryRun?: boolean;
}): Promise<AdvancedProviderTestResult> {
  const res = await request<{
    success: boolean;
    code?: string;
    error?: string;
    data?: AdvancedProviderTestResult;
  }>(`${BASE}/proxy/external/test-provider`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.success && res.data) return res.data;
  if (!res.success) {
    return {
      ok: false,
      code: res.code || 'provider_test_failed',
      providerId: payload.providerId || payload.provider?.id || '',
      protocol: payload.provider?.protocol || '',
      error: res.error || '测试失败',
    };
  }
  return res.data || {
    ok: false,
    code: 'empty_response',
    providerId: payload.providerId || payload.provider?.id || '',
    protocol: payload.provider?.protocol || '',
    error: '测试接口没有返回结果',
  };
}

export async function fetchAdvancedProviderModels(payload: {
  providerId?: string;
  provider?: AdvancedProviderConfig;
  timeoutMs?: number;
}): Promise<AdvancedProviderModelsResult> {
  const res = await request<{
    success: boolean;
    code?: string;
    error?: string;
    data?: AdvancedProviderModelsResult;
  }>(`${BASE}/proxy/external/fetch-models`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.success && res.data) return res.data;
  if (!res.success) {
    return {
      ok: false,
      code: res.code || 'provider_models_fetch_failed',
      providerId: payload.providerId || payload.provider?.id || '',
      protocol: payload.provider?.protocol || '',
      error: res.error || '拉取模型失败',
    };
  }
  return res.data || {
    ok: false,
    code: 'empty_response',
    providerId: payload.providerId || payload.provider?.id || '',
    protocol: payload.provider?.protocol || '',
    error: '模型拉取接口没有返回结果',
  };
}

export async function fetchZhenzhenModels(payload: {
  baseUrl?: string;
  apiKey?: string;
  apiKeyField?: string;
  timeoutMs?: number;
}): Promise<AdvancedProviderModelsResult> {
  const res = await request<{
    success: boolean;
    code?: string;
    error?: string;
    data?: AdvancedProviderModelsResult;
  }>(`${BASE}/settings/zhenzhen-models`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.success && res.data) return res.data;
  if (!res.success) {
    return {
      ok: false,
      code: res.code || 'zhenzhen_models_fetch_failed',
      providerId: 'zhenzhen-default',
      protocol: 'openai-compatible',
      error: res.error || '拉取模型失败',
    };
  }
  return res.data || {
    ok: false,
    code: 'empty_response',
    providerId: 'zhenzhen-default',
    protocol: 'openai-compatible',
    error: '模型拉取接口没有返回结果',
  };
}

export interface CloudUploadStatus {
  targets: CloudUploadTargetConfig[];
  summary: CloudUploadSummary;
}

export interface CloudUploadTestResult {
  ok: boolean;
  supported?: boolean;
  message?: string;
  error?: string;
  code?: string;
  hint?: string;
  statusCode?: number;
  providerCode?: string;
  providerMessage?: string;
  requestId?: string;
  target?: CloudUploadTargetConfig;
}

export interface CloudUploadAssetResult {
  provider: string;
  targetId: string;
  label: string;
  objectKey?: string;
  path?: string;
  url?: string;
  filename?: string;
  size?: number;
  mime?: string;
  kind?: string;
  uploadedAt?: string;
}

export function getCloudUploadStatus() {
  return safeRequest<CloudUploadStatus>(`${BASE}/cloud-uploads/status`);
}

export function testCloudUploadTarget(payload: {
  targetId?: string;
  target?: CloudUploadTargetConfig;
}) {
  return safeRequest<CloudUploadTestResult>(`${BASE}/cloud-uploads/test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function uploadCloudAsset(payload: {
  targetId: string;
  url: string;
  kind?: ResourceMediaKind | string;
  filename?: string;
  title?: string;
  sourceNodeId?: string;
  sourceCanvasId?: string;
}) {
  return safeRequest<CloudUploadAssetResult>(`${BASE}/cloud-uploads/upload`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ========== 文件自动保存到本地路径 (v1.2.10.2) ==========
// 静默失败(后端不可用/路径不存在/写入床夫败等) —— 仅返回布尔, 不抛
// 以免阐业务外主生成链路(OutputNode 只负责 "心愿尝试保存")。
export async function saveAssetToDisk(
  url: string,
  filename?: string,
): Promise<{ ok: boolean; path?: string; exist?: boolean; error?: string }> {
  try {
    if (!url) return { ok: false, error: 'empty url' };
    const res = await fetch(`${BASE}/files/save-to-disk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, filename }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true, path: json?.data?.path, exist: !!json?.data?.exist };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export type OkData<T> = { success: true; data: T };
export type ErrData = { success: false; error: string; data?: any };
export type Result<T> = OkData<T> | ErrData;

async function safeRequest<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: json.error || `HTTP ${res.status}`, data: json.data };
    if (json && typeof json === 'object' && 'success' in json) return json as Result<T>;
    return { success: true, data: json as T };
  } catch (e: any) {
    return { success: false, error: e?.message || '网络错误' };
  }
}

// ========== 资源库 (v1.3.4) ==========
export type ResourceKind = 'image' | 'video' | 'audio' | 'panorama' | 'set' | 'pose' | 'workflow';
export type ResourceMediaKind = 'image' | 'video' | 'audio';
export type ResourceAddKind = ResourceMediaKind | 'panorama';
export type ResourceMaterialSetKind = 'text' | 'image' | 'video' | 'audio';

export interface ResourceCategory {
  id: string;
  kind: ResourceKind;
  name: string;
  order: number;
  system?: boolean;
  createdAt: number;
}

export interface ResourceItem {
  id: string;
  kind: ResourceKind;
  categoryId: string;
  title: string;
  originalName?: string;
  fileUrl: string;
  thumbUrl?: string;
  mime?: string;
  size: number;
  width?: number;
  height?: number;
  sha256?: string;
  tags: string[];
  favorite: boolean;
  sourceUrl?: string;
  sourceNodeId?: string;
  sourceCanvasId?: string;
  materialSetKind?: ResourceMaterialSetKind;
  materialSetItems?: Array<{
    id: string;
    kind: ResourceMaterialSetKind;
    url?: string;
    text?: string;
    name?: string;
    size?: number;
    mime?: string;
  }>;
  workflowNodeCount?: number;
  workflowEdgeCount?: number;
  workflowNodeTypes?: string[];
  workflowPreview?: {
    nodes: Array<{ id: string; type: string; label: string; x: number; y: number }>;
    edges: Array<{ source: string; target: string }>;
  };
  workflowFragment?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface AddResourceSetPayload {
  materialSetKind: ResourceMaterialSetKind;
  materialSetItems: Array<{
    id?: string;
    kind: ResourceMaterialSetKind;
    url?: string;
    text?: string;
    name?: string;
    size?: number;
    mime?: string;
  }>;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export interface AddResourcePayload {
  url: string;
  kind: ResourceAddKind;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export interface AddResourcePosePayload {
  poseBackup: Record<string, any>;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export interface AddResourceWorkflowPayload {
  workflowFragment: Record<string, any>;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export function getResourceCategories(kind?: ResourceKind) {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return safeRequest<ResourceCategory[]>(`${BASE}/resources/categories${q}`);
}

export function addResourceCategory(kind: ResourceKind, name: string) {
  return safeRequest<ResourceCategory>(`${BASE}/resources/categories`, {
    method: 'POST',
    body: JSON.stringify({ kind, name }),
  });
}

export function renameResourceCategory(id: string, name: string) {
  return safeRequest<ResourceCategory>(`${BASE}/resources/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export function deleteResourceCategory(id: string) {
  return safeRequest<{ movedTo: string }>(`${BASE}/resources/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getResourceItems(params: {
  kind?: ResourceKind;
  categoryId?: string;
  q?: string;
  favorite?: boolean;
} = {}) {
  const sp = new URLSearchParams();
  if (params.kind) sp.set('kind', params.kind);
  if (params.categoryId) sp.set('categoryId', params.categoryId);
  if (params.q) sp.set('q', params.q);
  if (params.favorite) sp.set('favorite', '1');
  const qs = sp.toString();
  return safeRequest<ResourceItem[]>(`${BASE}/resources/items${qs ? `?${qs}` : ''}`);
}

export function addResourceItem(payload: AddResourcePayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/items/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addResourceSet(payload: AddResourceSetPayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/sets/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addResourcePose(payload: AddResourcePosePayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/poses/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addResourceWorkflow(payload: AddResourceWorkflowPayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/workflows/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateResourceItem(id: string, patch: Partial<Pick<ResourceItem, 'title' | 'categoryId' | 'tags' | 'favorite'>> & { touch?: boolean }) {
  return safeRequest<ResourceItem>(`${BASE}/resources/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteResourceItem(id: string) {
  return safeRequest<void>(`${BASE}/resources/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ========== Eagle 本地库 ==========
export interface EagleImportMaterial {
  id?: string;
  kind: ResourceMaterialSetKind;
  url?: string;
  text?: string;
  name?: string;
  tags?: string[];
}

export interface EagleImportResult {
  base: string;
  imported: Array<{ kind: string; name: string; result?: any }>;
  skipped: Array<{ kind: string; name: string; reason: string }>;
  failures: Array<{ kind: string; name: string; error: string }>;
}

export interface FigmaImportResult {
  base: string;
  sent: number;
  result?: any;
}

export interface PhotoshopImportResult {
  commandId: string;
  queued: boolean;
  queueSize: number;
  sent: number;
  skipped: number;
}

export function sendToEagle(payload: {
  materials: EagleImportMaterial[];
  tags?: string[];
  folderId?: string;
  eagleApiBase?: string;
}) {
  return safeRequest<EagleImportResult>(`${BASE}/eagle/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendToFigma(payload: {
  materials: EagleImportMaterial[];
  tags?: string[];
  figmaApiBase?: string;
}) {
  return safeRequest<FigmaImportResult>(`${BASE}/figma/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendToPhotoshop(payload: {
  materials: EagleImportMaterial[];
  tags?: string[];
  sourceCanvasId?: string;
  sourceLabel?: string;
}) {
  return safeRequest<PhotoshopImportResult>(`${BASE}/photoshop-bridge/send-to-photoshop`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ========== 主题模板 (v1.3.6) ==========

export interface ThemeTemplatesResponse {
  path: string;
  templates: ThemeTemplate[];
}

export function getThemeTemplates() {
  return safeRequest<ThemeTemplatesResponse>(`${BASE}/themes/templates`);
}

export function importThemeTemplate(template: ThemeTemplate) {
  return safeRequest<ThemeTemplate>(`${BASE}/themes/templates/import`, {
    method: 'POST',
    body: JSON.stringify({ template }),
  });
}

export function saveThemeTemplate(template: ThemeTemplate) {
  return safeRequest<ThemeTemplate>(`${BASE}/themes/templates/${encodeURIComponent(template.id)}`, {
    method: 'PUT',
    body: JSON.stringify(template),
  });
}

export function exportThemeTemplate(id: string) {
  return safeRequest<ThemeTemplate>(`${BASE}/themes/templates/${encodeURIComponent(id)}/export`);
}

export function deleteThemeTemplate(id: string) {
  return safeRequest<void>(`${BASE}/themes/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
