import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  AtSign,
  ChevronDown,
  Circle,
  Clock3,
  Copy,
  ImagePlus,
  Info,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Reply,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useCanvasStore } from '../stores/canvas';
import { CODEX_MODEL_OPTIONS } from '../config/codexModelOptions';
import { IMAGE_MODELS, VIDEO_MODELS, type SidebarParameterControl, type SidebarParameterGroup } from '../providers/models';
// CODEX_MODEL_OPTIONS includes GPT-5.5 plus default/custom Codex CLI modes.
import {
  addResourceItem,
  getCanvasData,
  getResourceItems,
  saveCanvasData,
  type ResourceItem,
} from '../services/api';
import {
  adaptCodexProjectSkillForSidebar,
  answerGlobalCodexSessionRequest,
  createCodexProjectSkill,
  deleteGlobalCodexRecord,
  getCodexCliSkills,
  getCodexResearchSummary,
  getCodexProjectSkillFiles,
  getGlobalCodexSession,
  injectGlobalCodexContext,
  importCodexProjectSkillArchive,
  listGlobalCodexRecords,
  listGlobalCodexThreadTurns,
  openGlobalCodexSession,
  readGlobalCodexThread,
  readCodexProjectSkillFile,
  rollbackGlobalCodexSession,
  searchCodexReferenceImages,
  steerGlobalCodexSession,
  stopGlobalCodexSession,
  streamGlobalCodexSessionMessage,
  validateCodexProjectSkill,
  writeCodexProjectSkillFile,
  type CodexReferenceImageResult,
  type CodexRecordSnapshot,
  type CodexResearchSummary,
  type CodexSkill,
  type CodexSkillFileEntry,
  type CodexSkillValidation,
  type CodexGlobalSession,
  type CodexStreamEvent,
  type CodexTimelineItem,
} from '../services/codexCli';
import { uploadFile } from '../services/generation';
import MentionPromptInput from './nodes/MentionPromptInput';
import { findMediaMentionQuery, materialMentionKey, resolveMediaMentions, type MediaMention } from './nodes/mediaMentions';
import type { Material } from './nodes/useUpstreamMaterials';

type PermissionPresetId = 'readonly' | 'canvas' | 'autopilot' | 'full';
type DrivingMode = 'copilot' | 'autopilot';
type MessageRole = 'user' | 'assistant' | 'process';
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
type CanvasOutputType = 'image' | 'video' | 'canvas' | 'text' | 'mixed';
type ResearchMode = 'none' | 'quick' | 'deep';
type SkillSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'imported';
type SkillAnalysisView = 'files' | 'parsed' | 'validation';
type SkillImportTone = 'idle' | 'dragging' | 'loading' | 'success' | 'warning' | 'error';

interface CodexAgentSidebarProps {
  open: boolean;
  onClose: () => void;
}

interface SidebarMessage {
  id: string;
  role: MessageRole;
  text: string;
  status?: 'running' | 'success' | 'error';
  steps?: ProcessStep[];
}

interface ProcessStep {
  id: string;
  kind: 'reasoning' | 'tool' | 'status' | 'error';
  text: string;
  time: number;
}

interface ReferenceImage {
  id: string;
  name: string;
  filename: string;
  url: string;
}

interface HistoryItem {
  id: string;
  text: string;
  skillLabel: string;
  canvasId: string | null;
  createdAt: number;
}

interface ConversationRecord {
  id: string;
  title: string;
  messages: SidebarMessage[];
  messageCount?: number;
  lastMessagePreview?: string;
  codexThreadId?: string;
  codexTurnId?: string;
  canvasId?: string | null;
  skillName?: string;
  directionId?: string;
  generationPreferences?: GenerationPreferences;
  mentions?: ResolvedMention[];
  researchSummary?: ResearchSummaryNode | null;
  taskPreview?: TaskPreview | null;
  lineage?: RecordLineageItem[];
  askAnswers?: Array<{ requestId: string; question?: string; answer: string; answeredAt: number }>;
  status?: 'idle' | 'running' | 'success' | 'error';
  createdAt: number;
  updatedAt: number;
}

interface CanvasInfo {
  id: string;
  name: string;
  nodeCount: number;
  edgeCount: number;
  viewport?: { x: number; y: number; zoom: number };
  nodeTypes: string[];
}

interface DiagnosticLog {
  id: string;
  text: string;
  time: number;
  tone?: 'info' | 'success' | 'warning' | 'error';
  expiresAt?: number;
}

interface MentionAsset {
  id: string;
  label: string;
  hint: string;
  value: string;
  source: 'canvas' | 'resource' | 'reference' | 'skill' | 'context';
  kind?: Material['kind'];
  thumbUrl?: string;
  url?: string;
}

interface SkillDirection {
  id: string;
  label: string;
  hint: string;
}

interface AskOption {
  id: string;
  requestId: string;
  questionId?: string;
  label: string;
  value: string;
  decision?: string;
}

interface SkillImportStatus {
  tone: SkillImportTone;
  text: string;
}

const NONCRITICAL_ASK_AUTO_ANSWER = '请基于当前记录、画布摘要和用户输入继续执行；只有关键生成、模型成本、不可逆修改或缺少必要创作决策时才再次询问。';
const CRITICAL_ASK_PATTERN = /(真实生成|生成|生图|生视频|运行模型|模型|成本|消耗|扣费|覆盖|删除|清空|发布|导出|尺寸|比例|分辨率|质量|时长|秒|数量|几套|几张|版型|款式|方向|素材|参考图|授权|不可逆)/i;
const LOW_VALUE_ASK_PATTERN = /(是否继续|要我继续|需要我继续|我可以继续|下一步|接下来|是否开始分析|是否读取|是否查看|是否检查|确认普通|工具审批|继续吗|开始吗)/i;
const CODEX_ROUTE_MISSING_PATTERN = /(后端路由未加载|会话接口未加载|skills 接口未加载|\/api\/codex-cli 生效|HTTP\s*404|404\s*\(Not Found\))/i;
const DIAGNOSTIC_LOG_LIMIT = 24;
const DIAGNOSTIC_LOG_TTL_MS = 6500;
const TRANSIENT_DIAGNOSTIC_TONES = new Set<NonNullable<DiagnosticLog['tone']>>(['info', 'success']);

function shouldExpireDiagnosticLog(tone: DiagnosticLog['tone']) {
  return TRANSIENT_DIAGNOSTIC_TONES.has(tone || 'info');
}

function isCodexRouteMissingText(value?: string) {
  return CODEX_ROUTE_MISSING_PATTERN.test(String(value || ''));
}

function isCodexUserInputRequest(event: CodexStreamEvent) {
  return event.rawType === 'item/tool/requestUserInput' || event.type === 'ask_user' || event.event === 'ask_user';
}

function normalizeAskText(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function askTextFromEvent(event: CodexStreamEvent) {
  const params = event.params || event.payload || {};
  const questionText = Array.isArray(params.questions) ? params.questions.map((question: any) => [
    question.header,
    question.question,
    Array.isArray(question.options) ? question.options.map((option: any) => (
      typeof option === 'string' ? option : `${option.label || ''} ${option.description || ''}`
    )).join(' ') : '',
  ].filter(Boolean).join(' ')).join(' ') : '';
  const parts = [
    event.message,
    params.question,
    params.prompt,
    params.message,
    params.title,
    questionText,
    Array.isArray(params.options) ? params.options.map((option: any) => (
      typeof option === 'string' ? option : `${option.label || option.title || ''} ${option.value || option.text || ''}`
    )).join(' ') : '',
    Array.isArray(params.choices) ? params.choices.map((option: any) => (
      typeof option === 'string' ? option : `${option.label || option.title || ''} ${option.value || option.text || ''}`
    )).join(' ') : '',
  ];
  return normalizeAskText(parts.filter(Boolean).join(' '));
}

function isCriticalAskText(text: string) {
  const value = normalizeAskText(text);
  if (!value) return false;
  if (LOW_VALUE_ASK_PATTERN.test(value) && !/(真实生成|生成|模型|成本|覆盖|删除|清空|发布|导出|不可逆)/i.test(value)) {
    return false;
  }
  return CRITICAL_ASK_PATTERN.test(value);
}

function hasAnsweredAsk(record: ConversationRecord | null, askText: string) {
  const normalized = normalizeAskText(askText);
  if (!normalized || !record?.askAnswers?.length) return false;
  return record.askAnswers.some((item) => {
    const question = normalizeAskText(item.question || '');
    if (!question) return false;
    return question === normalized || normalized.includes(question) || question.includes(normalized);
  });
}

function shouldShowAskEvent(event: CodexStreamEvent, record: ConversationRecord | null) {
  const askText = askTextFromEvent(event);
  if (!isCriticalAskText(askText)) return false;
  return !hasAnsweredAsk(record, askText);
}

function extractCodexAskOptions(event: CodexStreamEvent): AskOption[] {
  const requestId = String(event.requestId || event.actionId || '').trim();
  if (!requestId) return [];
  const params = event.params || event.payload || event;
  const questions = Array.isArray(params.questions) ? params.questions : [];
  if (questions.length) {
    return questions.flatMap((question: any, questionIndex: number) => {
      const questionId = String(question.id || `question-${questionIndex + 1}`).trim();
      const rawQuestionOptions = Array.isArray(question.options) ? question.options : [];
      return rawQuestionOptions.map((option: any, index: number) => {
        const label = typeof option === 'string'
          ? option
          : String(option.label || option.title || option.text || option.value || `选项 ${index + 1}`);
        const description = typeof option === 'string' ? '' : String(option.description || option.hint || option.value || option.text || '');
        return {
          id: `${requestId}-${questionId}-${index}`,
          requestId,
          questionId,
          label,
          value: description && description !== label ? `${label}：${description}` : label,
        };
      });
    });
  }
  const rawOptions = Array.isArray(params.options) ? params.options : Array.isArray(params.choices) ? params.choices : [];
  return rawOptions.map((option: any, index: number) => {
    if (typeof option === 'string') {
      return { id: `${requestId}-${index}`, requestId, label: option, value: option };
    }
    return {
      id: `${requestId}-${index}`,
      requestId,
      label: String(option.label || option.title || option.text || option.value || `选项 ${index + 1}`),
      value: String(option.value || option.text || option.label || option.title || ''),
    };
  }).filter((option: AskOption) => option.label.trim() || option.value.trim());
}

function codexAskPromptFromEvent(event: CodexStreamEvent) {
  const params = event.params || event.payload || event;
  const questions = Array.isArray(params.questions) ? params.questions : [];
  if (questions.length) {
    return questions
      .map((question: any) => [question.header, question.question].filter(Boolean).join('：'))
      .filter(Boolean)
      .join('\n');
  }
  return String(event.message || params.question || params.prompt || params.message || 'Codex 需要你补充一个关键决策');
}

function findAskShortcutOption(text: string, options: AskOption[]) {
  const value = text.trim().toLowerCase();
  if (!value || options.length === 0) return null;
  const letterIndex = value.length === 1 ? value.charCodeAt(0) - 97 : -1;
  if (letterIndex >= 0 && letterIndex < options.length) return options[letterIndex];
  const numberIndex = /^\d+$/.test(value) ? Number(value) - 1 : -1;
  if (numberIndex >= 0 && numberIndex < options.length) return options[numberIndex];
  return options.find((option) => {
    const label = option.label.trim().toLowerCase();
    const optionValue = option.value.trim().toLowerCase();
    return value === label || value === optionValue;
  }) || null;
}

function nativeApprovalDecisionLabel(decision: string) {
  if (decision === 'accept') return '允许一次';
  if (decision === 'acceptForSession') return '本会话允许';
  if (decision === 'decline') return '拒绝';
  if (decision === 'cancel') return '取消任务';
  return decision;
}

function nativeApprovalOptions(event: CodexStreamEvent): AskOption[] {
  const requestId = String(event.requestId || event.actionId || '').trim();
  if (!requestId) return [];
  const decisions = Array.isArray(event.availableDecisions) && event.availableDecisions.length
    ? event.availableDecisions
    : ['accept', 'decline'];
  return decisions.map((decision) => ({
    id: `${requestId}-${decision}`,
    requestId,
    label: nativeApprovalDecisionLabel(decision),
    value: decision,
    decision,
  }));
}

const HAKIMI_MCP_APPROVAL_PATTERN = /(hakimi_http|mcp__hakimi|hakimi_canvas_|hakimi_agent_|读取画布|当前画布|预演画布|应用画布|验证画布|执行可视化动作|运行生成节点|画布 MCP|canvas_snapshot|canvas_diff|canvas_apply|canvas_verify|run_node)/i;

function eventTextCorpus(event: CodexStreamEvent) {
  const params = event.params || event.payload || {};
  const pieces = [
    event.type,
    event.event,
    event.rawType,
    event.message,
    event.toolName,
    event.server,
    event.requestId,
    params.server,
    params.tool,
    params.toolName,
    params.name,
    params.title,
    params.message,
  ];
  try {
    pieces.push(JSON.stringify(event).slice(0, 4000));
  } catch {
    // ignore circular event payloads
  }
  return pieces.filter(Boolean).join(' ');
}

function isHakimiMcpApprovalEvent(event: CodexStreamEvent) {
  if (!(event.type === 'approval.requested' || event.event === 'approval.requested')) return false;
  return HAKIMI_MCP_APPROVAL_PATTERN.test(eventTextCorpus(event));
}

function autoApprovalDecision(event: CodexStreamEvent) {
  const decisions = Array.isArray(event.availableDecisions) && event.availableDecisions.length
    ? event.availableDecisions.map((item) => String(item || '').trim())
    : ['acceptForSession', 'accept'];
  return decisions.includes('acceptForSession') ? 'acceptForSession' : decisions.includes('accept') ? 'accept' : '';
}

async function autoAcceptHakimiMcpApproval(event: CodexStreamEvent) {
  const requestId = String(event.requestId || event.actionId || '').trim();
  const decision = autoApprovalDecision(event);
  if (!requestId || !decision) return;
  await answerGlobalCodexSessionRequest({
    requestId,
    decision,
    answer: decision,
    answers: [decision],
  });
}

interface GenerationPreferences {
  image: {
    model: string;
    apiModel: string;
    size: string;
    aspectRatio: string;
    quality: string;
    imageCount?: number;
    falSize?: string;
    nbResolution?: string;
    nbAspect?: string;
    seed?: number;
    webSearch?: boolean;
  };
  video: {
    model: string;
    apiModel: string;
    duration: number;
    aspectRatio: string;
    resolution: string;
    motion: string;
    quality: string;
    seed?: number;
    referenceMode?: string;
    generateAudio?: boolean;
    webSearch?: boolean;
    watermark?: boolean;
  };
}

interface ResolvedMention {
  id: string;
  kind: Material['kind'];
  label: string;
  url: string;
  token?: string;
  sourceNodeId?: string;
}

interface ResearchSummaryNode extends CodexResearchSummary {
  nodeId?: string;
}

interface RecordLineageItem {
  id: string;
  label: string;
  nodeIds: string[];
  sourceUrls: string[];
  createdAt: number;
}

interface TaskPreview {
  id: string;
  title: string;
  nodes: Array<{ type: string; label: string; detail: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
  models: Array<{ kind: string; model: string; params: string }>;
  confirmation: 'ask' | 'auto';
  createdAt: number;
}

interface GeneratedResultRef {
  nodeId: string;
  nodeType: string;
  kind: 'image' | 'video';
  url: string;
  label: string;
  prompt?: string;
}

const PERMISSION_PRESETS: Array<{
  id: PermissionPresetId;
  label: string;
  hint: string;
  sandbox: string;
  approvalPolicy: string;
}> = [
  { id: 'readonly', label: '只读观察', hint: '只看不改', sandbox: 'read-only', approvalPolicy: 'on-request' },
  { id: 'canvas', label: '画布协作', hint: '画布 MCP 默认放行', sandbox: 'workspace-write', approvalPolicy: 'never' },
  { id: 'autopilot', label: '自动驾驶', hint: '画布内自动执行', sandbox: 'workspace-write', approvalPolicy: 'never' },
  { id: 'full', label: '完全权限', hint: '高风险确认', sandbox: 'danger-full-access', approvalPolicy: 'on-request' },
];

const STORAGE_KEY = 't8-global-codex-sidebar-preferences';
const HISTORY_STORAGE_KEY = 't8-global-codex-sidebar-history';
const RECORD_STORAGE_KEY = 't8-global-codex-sidebar-records';
const HISTORY_LIMIT = 12;
const RECORD_LIMIT = 10;
const RECORD_MESSAGE_LIMIT = 48;
const RECORD_STEP_LIMIT = 10;
const DEFAULT_SIDEBAR_WIDTH = 540;
const DEFAULT_COMPOSER_HEIGHT = 112;
const MIN_SIDEBAR_WIDTH = 380;
const MAX_SIDEBAR_WIDTH = 760;
const MIN_COMPOSER_HEIGHT = 88;
const MAX_COMPOSER_HEIGHT = 260;
const LEGACY_DEFAULT_COMPOSER_HEIGHT = 180;

const PROJECT_SKILL_COPY: Record<string, { label: string; hint: string }> = {
  'apparel-collection-design-workflow': { label: '服装系列设计', hint: '服装系列、版型、印花、色组和商品图规划。' },
  'brand-visual-system-director': { label: '品牌视觉系统', hint: '品牌板、VI 气质、KV 一致性和成套视觉规则。' },
  'childrenswear-model-tryon-workflow': { label: '童装模特试穿', hint: '童装上身图、儿童模特电商主图和安全保真。' },
  'childrenswear-print-workflow': { label: '童装印花开发', hint: '童装印花、系列方向、二开和可售性优化。' },
  'commercial-art-design-workflow': { label: '商业美工设计', hint: '主图、海报、banner、详情图和广告视觉。' },
  'ecommerce-detail-art-director': { label: '电商详情美工', hint: '详情页视觉、卖点模块、信息层级和商品保真。' },
  'fashion-model-tryon-generation': { label: '模特试穿生成', hint: '服装上身图、lookbook、电商模特图和保真复核。' },
  'hakimi-apparel-design': { label: '服装设计', hint: '服装二次开发、印花、版型与商品图规划。' },
  'hakimi-canvas-control': { label: '画布控制', hint: '节点、连线、布局与画布自动化控制。' },
  'hakimi-canvas-os': { label: '画布总控', hint: '按任务路由画布流程、规划与执行方式。' },
  'hakimi-image-workflow': { label: '生图流程', hint: '图像节点、参考图、提示词与质检流程。' },
  'hakimi-video-workflow': { label: '生视频流程', hint: '分镜、关键帧、视频节点与镜头规划。' },
  'image-edit-retouch-workflow': { label: '图片修图改图', hint: '局部修改、瑕疵修复、背景清理和改图复核。' },
  'lookbook-model-director': { label: 'Lookbook 模特导演', hint: '模特姿势、镜头、系列 Lookbook 和成套上身图。' },
  'outfit-change-product-visuals': { label: '换装商品图', hint: '模特换装、服装替换、姿势锁定和对比图。' },
  'packaging-mockup-visuals': { label: '包装 Mockup', hint: '包装结构、贴图 mockup、材质场景和展示图。' },
  'poster-layout-critic': { label: '海报版式诊断', hint: '版式层级、标题信息、留白节奏和海报改稿。' },
  'product-hero-photography': { label: '商品主图摄影', hint: '商品主图、棚拍/场景摄影、光影和卖点构图。' },
  'scene-background-board': { label: '场景背景板', hint: '背景场景、材质空间、道具氛围和主品承托。' },
  'social-campaign-kit': { label: '社媒活动套图', hint: '社媒广告、活动套图、多比例素材和统一传播。' },
  'temu-image-gen': { label: 'Temu 童装电商图', hint: 'Temu/SHEIN listing、模特图、平铺图和质检。' },
  'visual-consistency-qa': { label: '视觉一致性质检', hint: '批量输出复核、风格一致、产品保真和修复建议。' },
  'visual-prompt-director': { label: '视觉提示词导演', hint: '提示词结构、模型适配、多变体和质量复核。' },
};

const IMAGE_QUALITY_OPTIONS = ['auto', 'standard', 'high'];
const VIDEO_MOTION_OPTIONS = ['low', 'medium', 'high'];
const VIDEO_QUALITY_OPTIONS = ['draft', 'standard', 'high'];
const INTERNAL_CANVAS_SKILL_NAMES = new Set([
  'hakimi-canvas-control',
  'hakimi-canvas-os',
  'hakimi-image-workflow',
  'hakimi-video-workflow',
]);

const REASONING_OPTIONS: Array<{ id: ReasoningEffort; label: string }> = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'xhigh', label: '超高' },
];

const RESEARCH_MODE_OPTIONS: Array<{ id: ResearchMode; label: string; hint: string }> = [
  { id: 'none', label: '不调研', hint: '直接按输入和画布执行' },
  { id: 'quick', label: '快速调研', hint: '先联网找 2-4 个参考方向' },
  { id: 'deep', label: '深度调研', hint: '多角度调研趋势、竞品和提示词' },
];

function makeMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function skillNameFromFileName(filename: string) {
  const base = filename.replace(/\.[^.]+$/, '').trim().toLowerCase();
  const slug = base.replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return slug || `imported-skill-${Date.now()}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function readPreferences(): { permissionPreset: PermissionPresetId; drivingMode: DrivingMode; researchMode: ResearchMode; codexModelMode: string; customCodexModel: string; reasoningEffort: ReasoningEffort } {
  const fallback = {
    permissionPreset: 'canvas' as PermissionPresetId,
    drivingMode: 'copilot' as DrivingMode,
    researchMode: 'none' as ResearchMode,
    codexModelMode: CODEX_MODEL_OPTIONS[0].value,
    customCodexModel: '',
    reasoningEffort: 'high' as ReasoningEffort,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const storedMode = String(data.codexModelMode || data.codexModel || CODEX_MODEL_OPTIONS[0].value);
    const codexModelMode = CODEX_MODEL_OPTIONS.some((item) => item.value === storedMode) ? storedMode : CODEX_MODEL_OPTIONS[0].value;
    return {
      permissionPreset: PERMISSION_PRESETS.some((item) => item.id === data.permissionPreset) ? data.permissionPreset : 'canvas',
      drivingMode: data.drivingMode === 'autopilot' ? 'autopilot' : 'copilot',
      researchMode: RESEARCH_MODE_OPTIONS.some((item) => item.id === data.researchMode) ? data.researchMode : 'none',
      codexModelMode,
      customCodexModel: String(data.customCodexModel || (codexModelMode === 'custom' ? data.codexModel : '') || ''),
      reasoningEffort: REASONING_OPTIONS.some((item) => item.id === data.reasoningEffort) ? data.reasoningEffort : 'high',
    };
  } catch {
    return fallback;
  }
}

function readGenerationPreferences(): GenerationPreferences {
  const imageModelDef = IMAGE_MODELS[0];
  const videoModelDef = VIDEO_MODELS[0];
  const fallback: GenerationPreferences = {
    image: {
      model: imageModelDef.id,
      apiModel: imageModelDef.apiModelOptions[0]?.value || imageModelDef.apiModel,
      size: imageModelDef.defaultSize,
      aspectRatio: imageModelDef.defaultAspectRatio,
      quality: IMAGE_QUALITY_OPTIONS[0],
      imageCount: 1,
      falSize: 'auto',
      nbResolution: '2K',
      nbAspect: 'auto',
      seed: -1,
      webSearch: false,
    },
    video: {
      model: videoModelDef.id,
      apiModel: videoModelDef.apiModelOptions[0]?.value || videoModelDef.id,
      duration: videoModelDef.defaultDuration || videoModelDef.durations?.[0] || 5,
      aspectRatio: videoModelDef.defaultRatio,
      resolution: videoModelDef.defaultResolution || videoModelDef.resolutions?.[0] || '',
      motion: VIDEO_MOTION_OPTIONS[1],
      quality: VIDEO_QUALITY_OPTIONS[1],
      seed: -1,
      referenceMode: 'auto',
      generateAudio: videoModelDef.kind === 'seedance',
      webSearch: videoModelDef.kind === 'seedance',
      watermark: false,
    },
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const image = data.generationPreferences?.image || {};
    const video = data.generationPreferences?.video || {};
    const savedImageModel = IMAGE_MODELS.find((item) => item.id === image.model) || fallback && imageModelDef;
    const savedVideoModel = VIDEO_MODELS.find((item) => item.id === video.model) || fallback && videoModelDef;
    return {
      image: {
        model: savedImageModel.id,
        apiModel: savedImageModel.apiModelOptions.some((item) => item.value === image.apiModel) ? image.apiModel : (savedImageModel.apiModelOptions[0]?.value || savedImageModel.apiModel),
        size: savedImageModel.sizes.includes(image.size) ? image.size : savedImageModel.defaultSize,
        aspectRatio: savedImageModel.aspectRatios.includes(image.aspectRatio) ? image.aspectRatio : savedImageModel.defaultAspectRatio,
        quality: IMAGE_QUALITY_OPTIONS.includes(image.quality) ? image.quality : fallback.image.quality,
        imageCount: clampNumber(Number(image.imageCount || 1), 1, 4),
        falSize: String(image.falSize || 'auto'),
        nbResolution: String(image.nbResolution || '2K'),
        nbAspect: String(image.nbAspect || 'auto'),
        seed: Number.isFinite(Number(image.seed)) ? Number(image.seed) : -1,
        webSearch: Boolean(image.webSearch),
      },
      video: {
        model: savedVideoModel.id,
        apiModel: savedVideoModel.apiModelOptions.some((item) => item.value === video.apiModel) ? video.apiModel : (savedVideoModel.apiModelOptions[0]?.value || savedVideoModel.id),
        duration: clampNumber(Number(video.duration || savedVideoModel.defaultDuration || fallback.video.duration), 1, 30),
        aspectRatio: savedVideoModel.ratios.includes(video.aspectRatio) ? video.aspectRatio : savedVideoModel.defaultRatio,
        resolution: savedVideoModel.resolutions?.includes(video.resolution) ? video.resolution : (savedVideoModel.defaultResolution || savedVideoModel.resolutions?.[0] || ''),
        motion: VIDEO_MOTION_OPTIONS.includes(video.motion) ? video.motion : fallback.video.motion,
        quality: VIDEO_QUALITY_OPTIONS.includes(video.quality) ? video.quality : fallback.video.quality,
        seed: Number.isFinite(Number(video.seed)) ? Number(video.seed) : -1,
        referenceMode: String(video.referenceMode || 'auto'),
        generateAudio: video.generateAudio == null ? savedVideoModel.kind === 'seedance' : Boolean(video.generateAudio),
        webSearch: video.webSearch == null ? savedVideoModel.kind === 'seedance' : Boolean(video.webSearch),
        watermark: Boolean(video.watermark),
      },
    };
  } catch {
    return fallback;
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function parameterDefaults(groups: SidebarParameterGroup[] | undefined, apiModel: string) {
  const defaults: Record<string, string | number | boolean> = {};
  (groups || []).forEach((group) => {
    group.controls.forEach((control) => {
      if (control.showWhenApiModel?.length && !control.showWhenApiModel.includes(apiModel)) return;
      const fallback = control.defaultValue ?? control.options?.[0]?.value;
      if (fallback !== undefined) defaults[control.valueKey] = fallback;
    });
  });
  return defaults;
}

function readLayoutPreferences(): { sidebarWidth: number; composerHeight: number } {
  if (typeof window === 'undefined') {
    return { sidebarWidth: DEFAULT_SIDEBAR_WIDTH, composerHeight: DEFAULT_COMPOSER_HEIGHT };
  }
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const savedComposerHeight = Number(data.composerHeight || DEFAULT_COMPOSER_HEIGHT);
    const composerHeight = savedComposerHeight === LEGACY_DEFAULT_COMPOSER_HEIGHT
      ? DEFAULT_COMPOSER_HEIGHT
      : clampNumber(savedComposerHeight, MIN_COMPOSER_HEIGHT, MAX_COMPOSER_HEIGHT);
    return {
      sidebarWidth: clampNumber(Number(data.sidebarWidth || DEFAULT_SIDEBAR_WIDTH), MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
      composerHeight,
    };
  } catch {
    return { sidebarWidth: DEFAULT_SIDEBAR_WIDTH, composerHeight: DEFAULT_COMPOSER_HEIGHT };
  }
}

function sessionLabel(session: CodexGlobalSession | null): string {
  if (!session) return 'SDK检测中';
  if (session.status === 'running') return 'SDK运行中';
  if (session.status === 'stopping') return 'SDK停止中';
  if (session.status === 'error') return session.lastError ? 'SDK不可用' : 'SDK异常';
  if (session.cliStatus?.available) return 'SDK已就绪';
  if (session.cliStatus && session.cliStatus.available === false) {
    return /login|登录/i.test(session.cliStatus.message || session.cliStatus.authStatus || '') ? 'SDK未登录' : 'SDK不可用';
  }
  return 'SDK检测中';
}

function sessionShortId(session: CodexGlobalSession | null) {
  const id = session?.sessionId || 'global-codex';
  return id.length > 15 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

function connectionTone(session: CodexGlobalSession | null, error: string) {
  const label = sessionLabel(session);
  if (session?.status === 'running') return 'running';
  if (error || /不可用|未登录|异常/.test(label)) return 'warning';
  if (label === 'SDK已就绪') return 'ready';
  return 'idle';
}

function sessionDetail(session: CodexGlobalSession | null) {
  if (!session) return '正在读取 Codex SDK 状态';
  const parts = [
    session.status === 'idle' ? '空闲' : session.status,
    session.cliStatus?.version,
    session.cliStatus?.authStatus,
    session.pid ? `PID ${session.pid}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || session.cliStatus?.message || '等待诊断信息';
}

function readHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item && typeof item.text === 'string')
      .slice(0, HISTORY_LIMIT)
      .map((item) => ({
        id: String(item.id || makeMessageId('history')),
        text: String(item.text || ''),
        skillLabel: String(item.skillLabel || '未记录技能'),
        canvasId: typeof item.canvasId === 'string' ? item.canvasId : null,
        createdAt: Number(item.createdAt || Date.now()),
      }));
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
}

function compactRecordMessages(messages: SidebarMessage[]) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-RECORD_MESSAGE_LIMIT)
    .map((message) => ({
      ...message,
      text: compactText(String(message.text || ''), message.role === 'assistant' ? 2400 : 900),
      steps: message.steps?.slice(-RECORD_STEP_LIMIT),
    }));
}

function conversationRecordStoragePayload(item: ConversationRecord): ConversationRecord {
  const compactMessages = compactRecordMessages(item.messages || []);
  const lastPreview = lastUserMessage(compactMessages)
    || compactMessages.slice().reverse().find((message) => message.text.trim())?.text
    || item.lastMessagePreview
    || '';
  return {
    ...item,
    messages: compactMessages,
    messageCount: compactMessages.length || item.messageCount || 0,
    lastMessagePreview: compactText(lastPreview, 120),
  };
}

function readConversationRecords(): ConversationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = JSON.parse(window.localStorage.getItem(RECORD_STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item && typeof item.id === 'string')
      .slice(0, RECORD_LIMIT)
      .map((item) => ({
        id: String(item.id),
        title: String(item.title || '新记录'),
        messages: compactRecordMessages(item.messages || []),
        messageCount: Number(item.messageCount || (Array.isArray(item.messages) ? item.messages.length : 0)),
        lastMessagePreview: String(item.lastMessagePreview || ''),
        codexThreadId: String(item.codexThreadId || ''),
        codexTurnId: String(item.codexTurnId || ''),
        canvasId: typeof item.canvasId === 'string' ? item.canvasId : null,
        skillName: String(item.skillName || ''),
        directionId: String(item.directionId || ''),
        generationPreferences: item.generationPreferences,
        mentions: Array.isArray(item.mentions) ? item.mentions : [],
        researchSummary: item.researchSummary,
        taskPreview: item.taskPreview,
        lineage: Array.isArray(item.lineage) ? item.lineage : [],
        askAnswers: Array.isArray(item.askAnswers) ? item.askAnswers : [],
        status: ['idle', 'running', 'success', 'error'].includes(item.status) ? item.status : 'idle',
        createdAt: Number(item.createdAt || Date.now()),
        updatedAt: Number(item.updatedAt || Date.now()),
      }));
  } catch {
    return [];
  }
}

function readInitialSidebarState() {
  const records = readConversationRecords();
  return {
    records,
    activeRecordId: records[0]?.id || '',
    messages: records[0]?.messages || [],
  };
}

function normalizeRecordStatus(value: unknown): ConversationRecord['status'] {
  return ['idle', 'running', 'success', 'error'].includes(String(value)) ? String(value) as ConversationRecord['status'] : 'idle';
}

function sdkSnapshotMessages(snapshot: CodexRecordSnapshot): SidebarMessage[] {
  return compactRecordMessages((snapshot.messages || [])
    .map((message, index) => ({
      id: makeMessageId(`sdk-${snapshot.recordId || snapshot.id || index}`),
      role: (message.role === 'user' ? 'user' : 'assistant') as MessageRole,
      text: String(message.text || ''),
      status: 'success' as const,
    }))
    .filter((message) => message.text.trim()));
}

function mergeConversationRecordsWithSdkSnapshots(
  current: ConversationRecord[],
  snapshots: CodexRecordSnapshot[] = [],
): ConversationRecord[] {
  const byId = new Map(current.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const mergedFromSdk = snapshots
    .map((snapshot) => {
      const id = String(snapshot.recordId || snapshot.id || '').trim();
      if (!id) return null;
      seen.add(id);
      const existing = byId.get(id);
      const sdkMessages = sdkSnapshotMessages(snapshot);
      const messages = existing?.messages?.length ? existing.messages : sdkMessages;
      const messageCount = Number(snapshot.messageCount || messages.length || existing?.messageCount || 0);
      const lastMessagePreview = compactText(
        String(snapshot.lastMessagePreview || existing?.lastMessagePreview || messages.slice().reverse().find((item) => item.text.trim())?.text || ''),
        120,
      );
      return {
        id,
        title: compactText(String(snapshot.title || existing?.title || lastMessagePreview || '新记录'), 28),
        messages,
        messageCount,
        lastMessagePreview,
        codexThreadId: String(snapshot.codexThreadId || existing?.codexThreadId || ''),
        codexTurnId: String(snapshot.codexTurnId || existing?.codexTurnId || ''),
        canvasId: typeof snapshot.canvasId === 'string' ? snapshot.canvasId : existing?.canvasId ?? null,
        skillName: String(snapshot.skillName || existing?.skillName || ''),
        directionId: String(snapshot.directionId || existing?.directionId || ''),
        generationPreferences: existing?.generationPreferences,
        mentions: existing?.mentions || [],
        researchSummary: existing?.researchSummary || null,
        taskPreview: existing?.taskPreview || null,
        lineage: existing?.lineage || [],
        askAnswers: existing?.askAnswers || [],
        status: normalizeRecordStatus(snapshot.status || existing?.status),
        createdAt: Number(snapshot.createdAt || existing?.createdAt || Date.now()),
        updatedAt: Number(snapshot.updatedAt || existing?.updatedAt || Date.now()),
      } as ConversationRecord;
    })
    .filter(Boolean) as ConversationRecord[];
  const localOnly = current.filter((record) => !seen.has(record.id));
  return [...mergedFromSdk, ...localOnly]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECORD_LIMIT);
}

function saveConversationRecords(items: ConversationRecord[]) {
  if (typeof window === 'undefined') return;
  const compacted = items.slice(0, RECORD_LIMIT).map(conversationRecordStoragePayload);
  window.localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(compacted));
}

function recordMessageCount(record: ConversationRecord) {
  return Number(record.messageCount || record.messages?.length || 0);
}

function recordThreadLabel(record: ConversationRecord) {
  const thread = String(record.codexThreadId || '').trim();
  if (!thread) return '未创建 SDK thread';
  return `SDK ${thread.length > 12 ? `${thread.slice(0, 6)}…${thread.slice(-4)}` : thread}`;
}

function recordStatusLabel(status: ConversationRecord['status']) {
  if (status === 'running') return '运行中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  return '空闲';
}

function formatHistoryTime(createdAt: number) {
  const date = new Date(createdAt);
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function skillSaveStatusLabel(status: SkillSaveStatus) {
  if (status === 'dirty') return '未保存';
  if (status === 'saving') return '保存中';
  if (status === 'saved') return '已保存';
  if (status === 'error') return '保存失败';
  if (status === 'imported') return '导入完成';
  return '已同步';
}

function canvasInfoToPrompt(info: CanvasInfo | null) {
  if (!info) return '当前画布信息：未读取。';
  return [
    `当前画布：${info.name}`,
    `画布 ID：${info.id}`,
    `节点：${info.nodeCount} 个，连线：${info.edgeCount} 条`,
    info.nodeTypes.length ? `节点类型：${info.nodeTypes.join(', ')}` : '',
    info.viewport ? `视图：x=${Math.round(info.viewport.x)}, y=${Math.round(info.viewport.y)}, zoom=${Number(info.viewport.zoom).toFixed(2)}` : '',
  ].filter(Boolean).join('\n');
}

function compactText(value: string, max = 36) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function normalizeSkillName(name: string) {
  return String(name || '').replace(/^\$/, '').trim().toLowerCase();
}

function isProjectCodexSkill(skill: CodexSkill) {
  return skill.scope === 'project';
}

function isInternalCanvasSkill(skill: CodexSkill | null) {
  return INTERNAL_CANVAS_SKILL_NAMES.has(normalizeSkillName(skill?.name || ''));
}

function isVisibleBusinessSkill(skill: CodexSkill) {
  return isProjectCodexSkill(skill) && !isInternalCanvasSkill(skill);
}

function displaySkillLabel(skill: CodexSkill | null) {
  if (!skill) return '未选择技能';
  const mapped = PROJECT_SKILL_COPY[normalizeSkillName(skill.name)];
  if (mapped) return mapped.label;
  return compactText(
    skill.name
      .replace(/^hakimi-/i, '')
      .replace(/-/g, ' ')
      .replace(/\bcanvas\b/i, '画布')
      .replace(/\bimage\b/i, '生图')
      .replace(/\bvideo\b/i, '视频')
      .replace(/\bworkflow\b/i, '流程'),
    18,
  );
}

function displaySkillHint(skill: CodexSkill | null) {
  if (!skill) return '只显示当前项目 skills';
  const mapped = PROJECT_SKILL_COPY[normalizeSkillName(skill.name)];
  if (mapped) return mapped.hint;
  const desc = String(skill.description || skill.category || '当前项目可用的 Codex skill。');
  if (/apparel|clothing|garment|fashion|print/i.test(desc)) return '服装、印花和商品视觉流程。';
  if (/canvas|node|workflow|mcp/i.test(desc)) return '画布节点、流程和 MCP 控制。';
  if (/image|visual|prompt/i.test(desc)) return '生图提示词、参考图和视觉产物。';
  if (/video|storyboard|shot/i.test(desc)) return '分镜、关键帧和生视频流程。';
  return compactText(desc, 34);
}

function skillLibraryCategory(skill: CodexSkill) {
  const text = `${skill.name} ${skill.description || ''} ${skill.category || ''} ${skill.body || ''}`.toLowerCase();
  if (/brand|visual identity|vi|logo|palette|typography|consistency|品牌|视觉系统|主视觉|一致性/.test(text)) return '品牌视觉';
  if (/retouch|edit|repair|cleanup|inpaint|修图|改图|局部修改|瑕疵/.test(text)) return '修图/质检';
  if (/qa|quality|verification|一致性质检|复核|检查/.test(text)) return '修图/质检';
  if (/poster|layout|hierarchy|typography|海报|版式|标题|层级/.test(text)) return '海报/版式';
  if (/packaging|mockup|package|box|label|包装|贴图|盒型/.test(text)) return '包装/场景';
  if (/scene|background|set design|environment|背景|场景|道具|空间/.test(text)) return '包装/场景';
  if (/social|campaign|ad kit|feed|story|社媒|活动套图|广告套图/.test(text)) return '社媒活动';
  if (/temu|shein|listing|ecommerce|marketplace|product hero|detail|电商|商品|主图|详情|美工|commercial/.test(text)) return '电商视觉';
  if (/child|children|kids|童装|儿童|childrenswear/.test(text)) return '童装';
  if (/tryon|try-on|model|lookbook|outfit|swap|garment-to-model|模特|试穿|上身|换装/.test(text)) return '模特/换装';
  if (/apparel|clothing|fashion|garment|print|服装|印花|版型|系列/.test(text)) return '服装设计';
  if (/prompt|提示词|director|model-aware/.test(text)) return '提示词';
  if (/vj|stage|visual|舞台|演唱会/.test(text)) return '舞台视觉';
  return '其他';
}

function skillLibrarySearchText(skill: CodexSkill) {
  return [
    skill.name,
    skill.category,
    skill.description,
    displaySkillLabel(skill),
    displaySkillHint(skill),
    skillLibraryCategory(skill),
    ...(skill.directions || []).flatMap((item) => [item.id, item.label, item.hint || '']),
  ].filter(Boolean).join(' ').toLowerCase();
}

function skillLabel(skill: CodexSkill | null) {
  return displaySkillLabel(skill);
}

function skillHint(skill: CodexSkill | null) {
  return displaySkillHint(skill);
}

function parseSelectedSkillDirections(skill: CodexSkill | null): SkillDirection[] {
  const directions = Array.isArray(skill?.directions) ? skill.directions : [];
  return directions
    .filter((item) => item?.id && item?.label)
    .map((item) => ({
      id: String(item.id),
      label: compactText(String(item.label), 18),
      hint: String(item.hint || ''),
    }));
}

function codexModelValue(codexModelMode: string, customCodexModel = '') {
  if (codexModelMode === 'default') return '';
  if (codexModelMode === 'custom') return String(customCodexModel || '').trim();
  return String(codexModelMode || '').trim();
}

function skillMentionValue(skill: CodexSkill | null) {
  if (!skill) return '@技能 未选择';
  return `@技能 ${skill.name}${skill.description ? `：${skill.description}` : ''}`;
}

function firstSkillFilePath(files: CodexSkillFileEntry[]): string {
  for (const file of files) {
    if (file.type === 'file') return file.path;
    const child = firstSkillFilePath(file.children || []);
    if (child) return child;
  }
  return 'SKILL.md';
}

function imageUrlsFromNodeData(data: any): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    const url = String(value || '').trim();
    if (url && !urls.includes(url)) urls.push(url);
  };
  push(data?.imageUrl);
  push(data?.directImageUrl);
  for (const key of ['imageUrls', 'urls', 'generatedImages', 'directImageUrls', 'referenceImages', 'resultImageUrls']) {
    if (Array.isArray(data?.[key])) data[key].forEach(push);
  }
  return urls;
}

function mentionAssetFromResource(item: ResourceItem): MentionAsset | null {
  const url = item.thumbUrl || item.fileUrl || item.materialSetItems?.find((entry) => entry.url)?.url || '';
  if (!url && !item.title) return null;
  const kind = item.kind === 'video' ? 'video' : item.kind === 'audio' ? 'audio' : 'image';
  return {
    id: `resource:${item.id}`,
    label: item.title || item.originalName || item.id,
    hint: `资源库 · ${item.kind}`,
    value: `@素材 ${item.title || item.id}${item.fileUrl ? ` ${item.fileUrl}` : ''}`,
    source: 'resource',
    kind,
    thumbUrl: item.thumbUrl || item.fileUrl || url,
    url: item.fileUrl || url,
  };
}

function materialFromMentionAsset(item: MentionAsset): Material | null {
  const url = String(item.url || item.value || '').trim();
  if (!url) return null;
  const kind = item.kind || (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(url) ? 'audio' : item.source === 'skill' || item.source === 'context' ? 'text' : 'image');
  return {
    id: item.id,
    kind,
    url,
    sourceNodeId: item.id.replace(/^(canvas|resource|reference|skill|context):/, ''),
    origin: 'local',
    label: item.label.replace(/^@/, ''),
    mentionKey: item.id,
  } as Material;
}

function resolveSidebarMentions(mentions: MediaMention[], materials: Material[]): ResolvedMention[] {
  if (!mentions.length) return [];
  const byKey = new Map(materials.map((material) => [materialMentionKey(material), material]));
  return mentions
    .map((mention) => {
      const material = byKey.get(mention.materialKey);
      if (!material) return null;
      return {
        id: mention.materialKey,
        kind: material.kind,
        label: material.label || mention.label || mention.token,
        url: material.url,
        token: mention.token,
        sourceNodeId: material.sourceNodeId,
      };
    })
    .filter(Boolean) as ResolvedMention[];
}

function inferOutputType(prompt: string, mentions: ResolvedMention[]): CanvasOutputType {
  const text = `${prompt} ${mentions.map((item) => `${item.kind} ${item.label}`).join(' ')}`;
  if (/视频|分镜|运镜|video|storyboard|motion/i.test(text)) return 'video';
  if (/图片|图像|生图|改图|image|mockup|海报|商品图/i.test(text)) return 'image';
  if (/画布|节点|连线|布局|canvas|workflow/i.test(text)) return 'canvas';
  if (/文案|文本|提示词|prompt|copy/i.test(text)) return 'text';
  return 'mixed';
}

function buildGenerationPreferences(
  generationPreferences: GenerationPreferences,
  codexModelMode: string,
  customCodexModel: string,
  reasoningEffort: ReasoningEffort,
  permissionPreset: PermissionPresetId,
  permission: typeof PERMISSION_PRESETS[number],
) {
  return {
    ...generationPreferences,
    codex: {
      model: codexModelValue(codexModelMode, customCodexModel),
      codexModelMode,
      customCodexModel,
      reasoningEffort,
      permissionPreset,
      sandbox: permission.sandbox,
      approvalPolicy: permission.approvalPolicy,
    },
  };
}

function canvasNodeDataContract(generationPreferences: ReturnType<typeof buildGenerationPreferences>) {
  const imageNodeData = {
    prompt: '<用户创作意图原文>',
    model: generationPreferences.image.model,
    apiModel: generationPreferences.image.apiModel,
    aspectRatio: generationPreferences.image.aspectRatio,
    size: generationPreferences.image.size,
    quality: generationPreferences.image.quality,
    imageCount: generationPreferences.image.imageCount,
    seed: generationPreferences.image.seed,
    referenceImages: '<上传参考图和 @ 引用图片 URL 数组>',
    label: '<中文节点标题>',
    status: 'idle',
  };
  const videoNodeData = {
    prompt: '<用户创作意图原文>',
    mainId: generationPreferences.video.model,
    model: generationPreferences.video.apiModel,
    apiModel: generationPreferences.video.apiModel,
    aspectRatio: generationPreferences.video.aspectRatio,
    ratio: generationPreferences.video.aspectRatio,
    duration: generationPreferences.video.duration,
    resolution: generationPreferences.video.resolution,
    motion: generationPreferences.video.motion,
    quality: generationPreferences.video.quality,
    seed: generationPreferences.video.seed,
    referenceImages: '<上传参考图和 @ 引用图片 URL 数组>',
    referenceVideos: '<@ 引用视频 URL 数组>',
    label: '<中文节点标题>',
    status: 'idle',
  };
  return {
    imageNodeData,
    videoNodeData,
    rules: [
      '图像任务必须创建或更新 type: "image" 节点，并把 imageNodeData 合并进节点 data。',
      '视频任务必须创建或更新 type: "video" 或 "seedance" 节点，并把 videoNodeData 合并进节点 data；mainId 是画布主模型，model/apiModel 是节点真实模型字段，ratio 是 VideoNode 实际读取的比例字段。',
      '不要使用 Codex imagegen；所有生成都走画布节点和 Hakimi MCP run_node。',
      '节点运行后必须回读 imageUrl/videoUrl，并在缺失时报告具体节点。',
    ],
  };
}

function buildCanvasIntent(
  target: string,
  canvasId: string | null,
  skill: CodexSkill | null,
  direction: SkillDirection | null,
  mentions: ResolvedMention[],
  referenceImages: ReferenceImage[],
  drivingMode: DrivingMode,
  researchMode: ResearchMode,
) {
  return {
    target,
    canvasId,
    outputType: inferOutputType(target, mentions),
    skillName: skill?.name || '',
    directionId: direction?.id || '',
    directionHint: direction?.hint || '',
    researchMode,
    researchRequired: researchMode !== 'none',
    mentions,
    referenceImages: referenceImages.map((item) => item.url),
    missingDecisions: drivingMode === 'copilot' ? ['数量、模型成本、是否立即运行不明确时用 ask_user 询问'] : [],
    risks: ['不要使用 Codex imagegen', '不要创建空节点', '执行后必须回读画布验证'],
  };
}

function buildCanvasPlanPreference(skill: CodexSkill | null, direction: SkillDirection | null) {
  return {
    skillName: skill?.name || '',
    directionId: direction?.id || '',
    directionHint: direction?.hint || '',
    templates: skill?.templates || [],
    questions: skill?.questions || [],
    verification: skill?.verification || [],
    rule: '模板只作为画布结构参考；节点内容必须来自用户输入、@ 引用素材、画布数据和 skill 规则。',
  };
}

function researchCacheKey(query: string, skill: CodexSkill | null, direction: SkillDirection | null, mode: ResearchMode) {
  return [
    String(query || '').trim().replace(/\s+/g, ' ').toLowerCase(),
    String(skill?.name || '').trim().toLowerCase(),
    String(direction?.id || '').trim().toLowerCase(),
    mode,
  ].join('|');
}

function summarizePreferencesForPreview(generationPreferences: ReturnType<typeof buildGenerationPreferences>) {
  return {
    image: `${generationPreferences.image.model} / ${generationPreferences.image.apiModel} / ${generationPreferences.image.aspectRatio} / ${generationPreferences.image.size}`,
    video: `${generationPreferences.video.model} / ${generationPreferences.video.apiModel} / ${generationPreferences.video.aspectRatio} / ${generationPreferences.video.duration}s`,
    codex: `${generationPreferences.codex.model || '默认'} / ${generationPreferences.codex.reasoningEffort}`,
  };
}

function buildTaskPreview(options: {
  prompt: string;
  outputType: CanvasOutputType;
  skill: CodexSkill | null;
  direction: SkillDirection | null;
  researchSummary?: ResearchSummaryNode | null;
  referenceImages: ReferenceImage[];
  mentions: ResolvedMention[];
  generationPreferences: ReturnType<typeof buildGenerationPreferences>;
  drivingMode: DrivingMode;
}): TaskPreview {
  const prefs = summarizePreferencesForPreview(options.generationPreferences);
  const nodes = [
    options.researchSummary ? { type: 'text', label: '调研摘要节点', detail: `${options.researchSummary.keywords.slice(0, 6).join(' / ')}` } : null,
    options.referenceImages.length || options.mentions.length ? { type: 'image/text', label: '参考素材 board', detail: `${options.referenceImages.length + options.mentions.length} 个引用素材` } : null,
    options.outputType === 'video'
      ? { type: 'video', label: '视频生成节点', detail: prefs.video }
      : options.outputType === 'image'
        ? { type: 'image', label: '图像生成节点', detail: prefs.image }
        : { type: 'text', label: '画布规划/执行节点', detail: options.direction?.label || options.skill?.name || '通用流程' },
    { type: 'text', label: '回读验证节点', detail: '检查节点 data、结果 URL、连线和视口定位' },
  ].filter(Boolean) as TaskPreview['nodes'];
  return {
    id: makeMessageId('preview'),
    title: compactText(options.prompt, 42) || '任务预演',
    nodes,
    edges: nodes.length > 1 ? nodes.slice(1).map((node, index) => ({
      from: nodes[index].label,
      to: node.label,
      label: index === 0 ? '参考/调研' : '执行',
    })) : [],
    models: [
      { kind: '图像', model: options.generationPreferences.image.model, params: prefs.image },
      { kind: '视频', model: options.generationPreferences.video.model, params: prefs.video },
      { kind: 'Codex', model: options.generationPreferences.codex.model || '默认', params: prefs.codex },
    ],
    confirmation: options.drivingMode === 'copilot' ? 'ask' : 'auto',
    createdAt: Date.now(),
  };
}

function researchSummaryText(summary: ResearchSummaryNode) {
  return [
    `调研摘要：${summary.query}`,
    summary.cached ? '来源：已复用最近调研缓存' : '来源：本轮联网调研',
    summary.keywords.length ? `关键词：${summary.keywords.join(' / ')}` : '',
    summary.promptStructure.length ? `Prompt 结构：\n${summary.promptStructure.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
    summary.sources.length ? `来源链接：\n${summary.sources.slice(0, 8).map((item, index) => `${index + 1}. ${item.title} - ${item.url}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function createResearchSummaryNode(summary: ResearchSummaryNode, position: { x: number; y: number }) {
  return {
    id: summary.nodeId || `codex-research-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'text',
    position,
    selected: true,
    data: {
      label: `调研摘要：${compactText(summary.query, 18)}`,
      text: researchSummaryText(summary),
      prompt: researchSummaryText(summary),
      researchSummary: summary,
      source: 'codex-sidebar-research',
    },
  };
}

function createReferenceBoardNode(results: CodexReferenceImageResult[], query: string, position: { x: number; y: number }) {
  const referenceBoardItems = results.slice(0, 12).map((item, index) => ({
    id: `ref-img-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'image',
    url: item.thumbUrl || item.url,
    name: item.title || `参考图 ${index + 1}`,
    mime: 'image/*',
  }));
  const note = [
    `参考图搜索：${query}`,
    '这些图片只作为构思参考和来源 board，不自动复刻、不直接写入生成节点。',
    ...results.slice(0, 8).map((item, index) => `${index + 1}. ${item.title} (${item.license || '参考来源'})\n${item.sourceUrl || item.url}`),
  ].join('\n\n');
  return {
    id: `codex-reference-board-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'material-set',
    position,
    selected: true,
    data: {
      label: `参考图 board：${compactText(query, 18)}`,
      title: `参考图 board：${compactText(query, 24)}`,
      materialSetKind: 'image',
      materialSetItems: referenceBoardItems,
      imageUrl: referenceBoardItems[0]?.url || '',
      imageUrls: referenceBoardItems.map((item) => item.url).filter(Boolean),
      urls: referenceBoardItems.map((item) => item.url).filter(Boolean),
      prompt: note,
      outputText: note,
      references: results,
      referenceBoardItems: results.map((item) => ({
        title: item.title,
        url: item.url,
        thumbUrl: item.thumbUrl || item.url,
        sourceUrl: item.sourceUrl || item.url,
        license: item.license || '参考来源',
      })),
      smartMaterialSetWidth: 320,
      smartMaterialSetHeight: 240,
      source: 'codex-sidebar-reference-search',
    },
  };
}

function collectGeneratedCanvasMedia(canvasData: any): GeneratedResultRef[] {
  const nodes = Array.isArray(canvasData?.nodes) ? canvasData.nodes : [];
  const refs: GeneratedResultRef[] = [];
  const seen = new Set<string>();
  const push = (node: any, kind: 'image' | 'video', value: any, index = 0) => {
    const url = String(value || '').trim();
    if (!url || url.startsWith('data:text/')) return;
    const nodeId = String(node?.id || '');
    const key = `${nodeId}:${kind}:${url}`;
    if (!nodeId || seen.has(key)) return;
    seen.add(key);
    const data = node?.data || {};
    refs.push({
      nodeId,
      nodeType: String(node?.type || 'unknown'),
      kind,
      url,
      label: String(data.label || data.title || `${kind === 'image' ? '图像' : '视频'}结果 ${index + 1}`),
      prompt: typeof data.prompt === 'string' ? data.prompt : undefined,
    });
  };

  for (const node of nodes) {
    const data = node?.data || {};
    push(node, 'image', data.imageUrl, 0);
    for (const field of ['imageUrls', 'urls', 'generatedImages'] as const) {
      const arr = data[field];
      if (Array.isArray(arr)) arr.forEach((url, index) => push(node, 'image', url, index));
    }
    push(node, 'video', data.videoUrl, 0);
    if (Array.isArray(data.videoUrls)) data.videoUrls.forEach((url: any, index: number) => push(node, 'video', url, index));
  }
  return refs;
}

function resultRefSignature(ref: GeneratedResultRef) {
  return `${ref.nodeId}:${ref.kind}:${ref.url}`;
}

function createResultReviewNode(options: {
  refs: GeneratedResultRef[];
  prompt: string;
  reply: string;
  position: { x: number; y: number };
}) {
  const lines = [
    '结果对比 / 评审',
    `用户目标：${options.prompt}`,
    `本轮识别到 ${options.refs.length} 个新结果：`,
    ...options.refs.map((ref, index) => `${index + 1}. ${ref.kind === 'image' ? '图像' : '视频'} · ${ref.label} · ${ref.nodeType} / ${ref.nodeId}\n${ref.url}`),
    '',
    '优点：',
    '- 结果已回写到画布节点，可继续连到素材集、输出或下一轮生成节点。',
    '- 节点 ID、媒体 URL 和原始提示词已保留，方便复用记录回放。',
    '',
    '问题：',
    '- 当前评审只做结构化回读，不替代人工视觉判断。',
    '- 如果某个生成节点没有返回 imageUrl/videoUrl，需要检查模型运行日志。',
    '',
    '下一轮修改建议：',
    '- 保留满意结果，复制为参考图或接入素材集后再做局部变体。',
    '- 对不满意结果直接 @ 对应节点，说明要改的版型、构图、颜色或镜头。',
    '',
    `推荐保留：${options.refs[0] ? `${options.refs[0].label} (${options.refs[0].nodeId})` : '暂无可保留结果'}`,
    options.reply ? `\nCodex 最终回复：\n${options.reply}` : '',
  ].filter(Boolean).join('\n');

  return {
    id: `codex-result-review-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'text',
    position: options.position,
    selected: true,
    data: {
      label: `结果对比：${options.refs.length} 个结果`,
      text: lines,
      prompt: lines,
      outputText: lines,
      generatedResultRefs: options.refs,
      resultReview: {
        prompt: options.prompt,
        reply: options.reply,
        resultCount: options.refs.length,
        createdAt: Date.now(),
      },
      source: 'codex-sidebar-result-review',
    },
  };
}

function recordReplayPayload(record: ConversationRecord | null) {
  if (!record) return {};
  const memorySummary = recordMemoryForPrompt(record);
  return {
    codexThreadId: record.codexThreadId || '',
    previousResearchSummary: record.researchSummary || null,
    previousTaskPreview: record.taskPreview || null,
    previousGenerationPreferences: record.generationPreferences || null,
    previousMentions: record.mentions || [],
    previousAskAnswers: record.askAnswers || [],
    lineage: record.lineage || [],
    memorySummary,
  };
}

function recordMemoryForPrompt(record: ConversationRecord | null) {
  if (!record) return '本轮会话记忆：暂无可复用记录。';
  const askAnswers = (record.askAnswers || [])
    .slice(-6)
    .map((item, index) => `${index + 1}. ${item.question ? `${compactText(item.question, 72)} -> ` : ''}${compactText(item.answer, 72)}`);
  const mentions = (record.mentions || [])
    .slice(-8)
    .map((item) => `${item.label || item.id}${item.kind ? `(${item.kind})` : ''}`);
  const lineage = (record.lineage || [])
    .slice(-5)
    .map((item, index) => `${index + 1}. ${item.label}：${item.nodeIds.join(', ')}`);
  return [
    `本轮会话记忆：record=${record.id}，标题=${record.title || '未命名'}，状态=${record.status || 'idle'}`,
    record.codexThreadId ? `Codex thread：${record.codexThreadId}` : '',
    record.canvasId ? `绑定画布：${record.canvasId}` : '',
    record.skillName ? `上次 Skill：${record.skillName}${record.directionId ? ` / ${record.directionId}` : ''}` : '',
    record.messageCount ? `原生历史消息数：${record.messageCount}` : '',
    record.lastMessagePreview ? `最近消息预览：${compactText(record.lastMessagePreview, 160)}` : '',
    askAnswers.length ? `已经回答过的关键问题，不要重复问：\n${askAnswers.join('\n')}` : '',
    mentions.length ? `已引用素材：${mentions.join(' / ')}` : '',
    record.researchSummary ? `上次调研：${record.researchSummary.query}；关键词：${record.researchSummary.keywords?.slice(0, 8).join(' / ') || ''}` : '',
    lineage.length ? `画布 lineage：\n${lineage.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

function buildCanvasRuntimeContext(
  canvasId: string | null,
  drivingMode: DrivingMode,
  researchMode: ResearchMode,
  referenceImages: ReferenceImage[],
  canvasInfo: CanvasInfo | null,
  direction: SkillDirection | null,
  skill: CodexSkill | null,
  generationPreferences: ReturnType<typeof buildGenerationPreferences>,
  mentions: ResolvedMention[],
  recordMemory: string,
) {
  const modeText = drivingMode === 'autopilot'
    ? '自动驾驶：如果用户意图明确，请直接通过哈基米画布 MCP 执行动作。'
    : '副驾驶：先判断用户意图，只有关键生成决策、模型成本、不可逆修改或确实缺少必要信息时才用 ask_user；普通读取画布、检查节点、布局和复核不要问，直接做。';
  const researchText = researchMode === 'none'
    ? '联网调研要求：本轮不强制调研，除非用户明确要求查资料。'
    : researchMode === 'quick'
      ? '联网调研要求：先用 Codex 联网能力快速搜索 2-4 个相关参考、趋势或提示词线索，输出可见调研摘要，再规划画布节点。不要直接跳到生成。'
      : '联网调研要求：先用 Codex 联网能力做深度调研，覆盖趋势、竞品/参考、视觉关键词、避雷点和可执行 prompt 结构；把摘要写入可见消息，并优先创建/更新画布参考调研节点后再生成。';
  const referenceText = referenceImages.length
    ? [
      '本轮参考图：',
      ...referenceImages.map((item, index) => `${index + 1}. ${item.name} - ${item.url}`),
      '请把这些图片作为视觉约束写入图像/视频节点 data.referenceImages，不要只在文本里描述。',
    ].join('\n')
    : '本轮未上传参考图。';
  const mentionText = mentions.length
    ? [
      '本轮 @ 引用：',
      ...mentions.map((item, index) => `${index + 1}. [${item.kind}] ${item.label} - ${item.url}`),
      '必须优先把 @ 引用素材写入对应 image/video 节点 data.referenceImages/sourceUrls，并保留来源。',
    ].join('\n')
    : '本轮没有 @ 引用 token。';
  const skillGuidance = skill
    ? [
      `当前 Skill：${skill.name}`,
      skill.questions?.length ? `动态 Ask 候选（仅缺关键决策时参考，不要强制弹出；必须按用户意图和画布上下文重新组织问题与选项）：${skill.questions.map((item) => `${item.label}${item.options?.length ? `（${item.options.join(' / ')}）` : ''}`).join('；')}` : '',
      skill.templates?.length ? `画布模板（结构参考）：${skill.templates.map((item) => `${item.label}: ${item.flow || ''}`).join('；')}` : '',
      skill.verification?.length ? `验证项：${skill.verification.map((item) => `${item.label}${item.hint ? `-${item.hint}` : ''}`).join('；')}` : '',
    ].filter(Boolean).join('\n')
    : '当前 Skill：未选择。';
  return [
    '你现在是哈基米画布的全局 Codex 侧边栏，不是画布节点。',
    '你是“Codex 画布 Agent”；Codex SDK/CLI 只是执行器后端。不要把执行器状态当成用户要创作的画布内容。',
    `当前画布 ID：${canvasId || '未加载'}`,
    direction ? `当前技能方向：${direction.label} - ${direction.hint}` : '当前技能方向：未选择。',
    skillGuidance,
    modeText,
    researchText,
    canvasInfoToPrompt(canvasInfo),
    referenceText,
    mentionText,
    recordMemory,
    `生成偏好（只控制执行参数，不代表创作风格）：${JSON.stringify(generationPreferences, null, 2)}`,
    `画布模型节点 data contract：${JSON.stringify(canvasNodeDataContract(generationPreferences), null, 2)}`,
    '必须优先使用 Hakimi MCP 控制画布。复杂流程先调用 hakimi_canvas_snapshot 读取摘要，再用 hakimi_canvas_diff_plan 预演 CanvasPlan，确认无结构问题后再用 hakimi_canvas_apply_plan 一次批量提交；小修小补再用 hakimi_agent_run_actions。',
    '执行后必须调用 hakimi_canvas_verify_plan 或重新 snapshot 回读验证节点、连线、模型参数、结果 URL 和视口。用 phase、preview_node、add_node、connect_edge、focus_viewport 让用户看见过程；ask_user 只用于关键决策，不要用来确认普通工具调用。',
    '不要使用 Codex 的 image_generation / imagen / imagegen 直接生成图片；图像生成必须通过画布 type: "image" 节点和画布模型选择完成。',
    '创建图像节点时必须写入真实内容：data.prompt、data.model、data.apiModel、data.aspectRatio、data.size、data.quality、data.referenceImages、data.label、data.status。不要创建空 image 节点或空文字节点。',
    '创建视频节点时必须写入真实内容：data.prompt、data.mainId、data.model、data.apiModel、data.ratio、data.aspectRatio、data.duration、data.resolution、data.motion、data.quality、data.referenceImages、data.referenceVideos、data.label、data.status。',
    '如果要直接开始真实生成，请先 add_node/update_node 写好 image 节点参数，再提交 run_node action 触发该节点自己的生成逻辑；这会使用画布节点当前选择的模型、比例、清晰度和参考图。',
    '不要随机堆文本节点；提示词应写入对应图像/视频节点，只有确实需要说明、选项或复用提示词时才创建 text 节点，并同时设置 data.prompt 和 data.text。',
    '布局规则：先读取画布和视口，把新流程放在当前素材右侧或下方，按“参考素材 -> 变体 image 节点 -> 结果/复盘”成列排列，使用 connect_edge 保留来源关系，最后 focus_viewport 到新流程区域。',
    'CanvasPlan 格式建议：{ title, goal, nodes:[{id,type,position,data}], updates:[{nodeId,data,position}], edges:[{source,target}], runNodeIds:[...], focusViewport:{x,y,zoom} }。节点 id 要稳定，方便后续更新和验证。',
    '副驾驶下，只在主题/版型/数量/比例/模型成本/是否真实生成等会影响结果质量或成本的关键点不明确时，才用 ask_user 给 2-3 个中文选项；这些选项必须由你结合当前 Skill、用户输入、画布状态动态生成，前端不会补固定业务选项。如果信息已在历史、recordReplay、画布摘要或用户回复中出现，不要重复问。',
  ].join('\n\n');
}

function messageRoleLabel(role: MessageRole) {
  if (role === 'user') return '你';
  if (role === 'process') return '思考流程';
  return 'Codex';
}

function processStepLabel(kind: ProcessStep['kind']) {
  if (kind === 'reasoning') return '分析';
  if (kind === 'tool') return '工具';
  if (kind === 'error') return '失败';
  return '状态';
}

function messageStatusLabel(status?: SidebarMessage['status']) {
  if (status === 'running') return '进行中';
  if (status === 'success') return '完成';
  if (status === 'error') return '失败';
  return '';
}

function processStepKey(kind: ProcessStep['kind'], text: string) {
  return `${kind}:${String(text || '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

function processSummaryText(message: SidebarMessage) {
  const steps = message.steps || [];
  const counts = steps.reduce((acc, step) => {
    acc[step.kind] = (acc[step.kind] || 0) + 1;
    return acc;
  }, {} as Record<ProcessStep['kind'], number>);
  const parts = [
    counts.reasoning ? `分析 ${counts.reasoning}` : '',
    counts.tool ? `工具 ${counts.tool}` : '',
    counts.error ? `失败 ${counts.error}` : '',
    counts.status ? `状态 ${counts.status}` : '',
  ].filter(Boolean);
  const lastError = [...steps].reverse().find((step) => step.kind === 'error');
  const lastMeaningful = [...steps].reverse().find((step) => step.kind !== 'status') || steps[steps.length - 1];
  if (message.status === 'error') return compactText(lastError?.text || message.text || 'Codex 任务失败', 120);
  const status = messageStatusLabel(message.status) || '处理中';
  const tail = lastMeaningful?.text ? compactText(lastMeaningful.text, 82) : compactText(message.text, 82);
  return [status, parts.join(' · '), tail].filter(Boolean).join(' · ');
}

function nativeItemText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(nativeItemText).filter(Boolean).join('\n');
  if (typeof value !== 'object') return '';
  const direct = value.text || value.delta || value.content || value.message || value.summary || value.summaryText;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(value.content)) return value.content.map(nativeItemText).filter(Boolean).join('\n');
  if (Array.isArray(value.text_elements)) return value.text_elements.map(nativeItemText).filter(Boolean).join('\n');
  return '';
}

function nativeItemRole(value: any): MessageRole | null {
  const type = String(value?.type || value?.itemType || '').toLowerCase();
  const role = String(value?.role || '').toLowerCase();
  if (role === 'user' || type.includes('usermessage')) return 'user';
  if (role === 'assistant' || type.includes('agentmessage')) return 'assistant';
  if (type.includes('reasoning') || type.includes('tool') || type.includes('command') || type.includes('mcp')) return 'process';
  return null;
}

function hydrateMessagesFromNativeThread(thread: any, turnsData: any[] = []): SidebarMessage[] {
  const rawTurns = Array.isArray(turnsData) && turnsData.length ? turnsData : (Array.isArray(thread?.turns) ? thread.turns : []);
  return rawTurns
    .slice()
    .reverse()
    .flatMap((turn: any, turnIndex: number) => {
      const items = Array.isArray(turn?.items) ? turn.items : Array.isArray(turn?.summary?.items) ? turn.summary.items : [];
      return items.flatMap((item: any, itemIndex: number) => {
        const role = nativeItemRole(item);
        const text = nativeItemText(item).trim();
        if (!role || !text) return [];
        return [{
          id: `native-${turn?.id || turn?.turnId || turnIndex}-${item?.id || itemIndex}`,
          role,
          text: compactText(text, role === 'assistant' ? 2400 : 900),
          status: role === 'process' ? 'success' as const : undefined,
          steps: role === 'process' ? [{
            id: makeMessageId('step'),
            kind: /reasoning/i.test(String(item?.type || '')) ? 'reasoning' as const : 'tool' as const,
            text: compactText(text, 420),
            time: Date.now(),
          }] : undefined,
        }];
      });
    });
}

function updateTimelineItemFromCodexEvent(
  current: Record<string, CodexTimelineItem>,
  event: CodexStreamEvent,
): Record<string, CodexTimelineItem> {
  const itemId = String(event.itemId || event.turnId || event.rawType || event.event || event.type || '').trim();
  const kind = String(event.itemType || event.toolName || event.type || event.event || 'step').trim();
  if (!itemId && !kind) return current;
  const id = itemId || `timeline-${kind}`;
  const prev = current[id];
  const status = event.status === 'success' || event.status === 'error' || event.status === 'running'
    ? event.status
    : event.type === 'turn.failed' || event.event === 'turn.failed'
      ? 'error'
      : event.type === 'turn.completed' || event.event === 'turn.completed'
        ? 'success'
        : prev?.status || 'running';
  const title = event.toolName
    ? `工具：${event.toolName}`
    : event.type === 'reasoning.delta' || event.event === 'reasoning.delta'
      ? '思考摘要'
      : event.type === 'message.delta' || event.event === 'message.delta'
        ? '回复生成'
        : String(event.message || kind || 'Codex 步骤');
  const message = compactText(String(event.message || event.text || event.delta || prev?.message || ''), 180);
  return {
    ...current,
    [id]: {
      id,
      itemId: event.itemId,
      turnId: event.turnId,
      type: event.itemType || event.type || event.event,
      toolName: event.toolName,
      title: compactText(title, 46),
      message,
      status,
      rawType: event.rawType,
      updatedAt: Date.now(),
    },
  };
}

function lastUserMessage(messages: SidebarMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].text;
  }
  return '';
}

function findUserMessageForAction(messages: SidebarMessage[], messageId: string) {
  const index = messages.findIndex((item) => item.id === messageId);
  if (index < 0) return null;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === 'user') return messages[cursor];
  }
  return null;
}

function countTurnsFromMessage(messages: SidebarMessage[], userMessageId: string) {
  const index = messages.findIndex((item) => item.id === userMessageId);
  if (index < 0) return 1;
  return Math.max(1, messages.slice(index).filter((item) => item.role === 'user').length);
}

function trimMessagesFromUserMessage(messages: SidebarMessage[], userMessageId: string) {
  const index = messages.findIndex((item) => item.id === userMessageId);
  return index >= 0 ? messages.slice(0, index) : messages;
}

export default function CodexAgentSidebar({ open, onClose }: CodexAgentSidebarProps) {
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const canvases = useCanvasStore((state) => state.canvases);
  const loadCanvases = useCanvasStore((state) => state.loadCanvases);
  const [{ permissionPreset, drivingMode, researchMode, codexModelMode, customCodexModel, reasoningEffort }, setPreferences] = useState(readPreferences);
  const [generationPreferences, setGenerationPreferences] = useState<GenerationPreferences>(readGenerationPreferences);
  const [{ sidebarWidth, composerHeight }, setLayoutPreferences] = useState(readLayoutPreferences);
  const [initialSidebarState] = useState(readInitialSidebarState);
  const [session, setSession] = useState<CodexGlobalSession | null>(null);
  const [messages, setMessages] = useState<SidebarMessage[]>(() => initialSidebarState.messages);
  const [prompt, setPrompt] = useState('');
  const [promptMentions, setPromptMentions] = useState<MediaMention[]>([]);
  const [editingMessageId, setEditingMessageId] = useState('');
  const [error, setError] = useState('');
  const [codexSkills, setCodexSkills] = useState<CodexSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [selectedDirectionId, setSelectedDirectionId] = useState('');
  const [prefOpen, setPrefOpen] = useState(false);
  const [skillLibraryOpen, setSkillLibraryOpen] = useState(false);
  const [skillLibraryQuery, setSkillLibraryQuery] = useState('');
  const [skillLibraryCategoryFilter, setSkillLibraryCategoryFilter] = useState('全部');
  const [skillDetailOpen, setSkillDetailOpen] = useState(false);
  const [skillEditMode, setSkillEditMode] = useState<'readonly' | 'edit'>('readonly');
  const [skillImportDragging, setSkillImportDragging] = useState(false);
  const [skillImportStatus, setSkillImportStatus] = useState<SkillImportStatus>({ tone: 'idle', text: '拖入 zip / SKILL.md / json，导入后自动校验。' });
  const [skillFileTree, setSkillFileTree] = useState<CodexSkillFileEntry[]>([]);
  const [selectedSkillFilePath, setSelectedSkillFilePath] = useState('SKILL.md');
  const [selectedSkillFileContent, setSelectedSkillFileContent] = useState('');
  const [skillFileDirty, setSkillFileDirty] = useState(false);
  const [skillFileLoading, setSkillFileLoading] = useState(false);
  const [skillSaveStatus, setSkillSaveStatus] = useState<SkillSaveStatus>('idle');
  const [skillAnalysisView, setSkillAnalysisView] = useState<SkillAnalysisView>('files');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; end: number; query: string } | null>(null);
  const [processCollapsedById, setProcessCollapsedById] = useState<Record<string, boolean>>({});
  const [itemTimelineById, setItemTimelineById] = useState<Record<string, CodexTimelineItem>>({});
  const [nativeThreadHydrated, setNativeThreadHydrated] = useState('');
  const [nativeTurnHistoryUnavailable, setNativeTurnHistoryUnavailable] = useState(false);
  const [canvasInfoOpen, setCanvasInfoOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(readHistory);
  const [conversationRecords, setConversationRecords] = useState<ConversationRecord[]>(() => initialSidebarState.records);
  const [activeRecordId, setActiveRecordId] = useState(() => initialSidebarState.activeRecordId);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [researchSummary, setResearchSummary] = useState<ResearchSummaryNode | null>(null);
  const [cachedResearch, setCachedResearch] = useState<Record<string, ResearchSummaryNode>>({});
  const [referenceSearchOpen, setReferenceSearchOpen] = useState(false);
  const [referenceSearchQuery, setReferenceSearchQuery] = useState('');
  const [referenceSearchResults, setReferenceSearchResults] = useState<CodexReferenceImageResult[]>([]);
  const [referenceSearchLoading, setReferenceSearchLoading] = useState(false);
  const [taskPreview, setTaskPreview] = useState<TaskPreview | null>(null);
  const [taskPreviewExpanded, setTaskPreviewExpanded] = useState(false);
  const [skillValidation, setSkillValidation] = useState<CodexSkillValidation | null>(null);
  const [selectedMentionAssets, setSelectedMentionAssets] = useState<MentionAsset[]>([]);
  const [askOptions, setAskOptions] = useState<AskOption[]>([]);
  const [askPrompt, setAskPrompt] = useState('');
  const [askRequestId, setAskRequestId] = useState('');
  const [approvalOptions, setApprovalOptions] = useState<AskOption[]>([]);
  const [approvalPrompt, setApprovalPrompt] = useState('');
  const [uploadingReference, setUploadingReference] = useState(false);
  const [canvasInfo, setCanvasInfo] = useState<CanvasInfo | null>(null);
  const [canvasInfoLoading, setCanvasInfoLoading] = useState(false);
  const [mentionAssets, setMentionAssets] = useState<MentionAsset[]>([]);
  const [mentionAssetsLoading, setMentionAssetsLoading] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLog[]>(() => {
    const time = Date.now();
    return [{
      id: makeMessageId('log'),
      text: '侧边栏已打开，等待 Codex SDK 状态检查。',
      time,
      tone: 'info',
      expiresAt: time + DIAGNOSTIC_LOG_TTL_MS,
    }];
  });
  const abortRef = useRef<AbortController | null>(null);
  const answeredAskMemoryRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skillImportInputRef = useRef<HTMLInputElement | null>(null);
  const lastSessionSignatureRef = useRef('');
  const running = session?.status === 'running' || session?.status === 'stopping';
  const activeCanvas = useMemo(
    () => canvases.find((item) => item.id === activeCanvasId) || null,
    [activeCanvasId, canvases],
  );
  const currentPermission = useMemo(
    () => PERMISSION_PRESETS.find((item) => item.id === permissionPreset) || PERMISSION_PRESETS[1],
    [permissionPreset],
  );
  const imageModelOptions = IMAGE_MODELS;
  const videoModelOptions = VIDEO_MODELS;
  const imageModelDef = useMemo(
    () => imageModelOptions.find((item) => item.id === generationPreferences.image.model) || imageModelOptions[0],
    [generationPreferences.image.model, imageModelOptions],
  );
  const videoModelDef = useMemo(
    () => videoModelOptions.find((item) => item.id === generationPreferences.video.model) || videoModelOptions[0],
    [generationPreferences.video.model, videoModelOptions],
  );
  const imageApiModelOptions = imageModelDef.apiModelOptions;
  const videoApiModelOptions = videoModelDef.apiModelOptions;
  const defaultSize = imageModelDef.defaultSize;
  const visibleParamGroups = (groups: SidebarParameterGroup[] | undefined, apiModel: string) => (groups || [])
    .map((group) => ({
      ...group,
      controls: group.controls.filter((control) => !control.showWhenApiModel?.length || control.showWhenApiModel.includes(apiModel)),
    }))
    .filter((group) => group.controls.length > 0);
  const imageParamGroups = visibleParamGroups(imageModelDef.sidebarParameterGroups, generationPreferences.image.apiModel);
  const videoParamGroups = visibleParamGroups(videoModelDef.sidebarParameterGroups, generationPreferences.video.apiModel);
  const currentCodexModelOption = CODEX_MODEL_OPTIONS.find((item) => item.value === codexModelMode) || CODEX_MODEL_OPTIONS[0];
  const imageModel = generationPreferences.image.model;
  const imageAspectRatio = generationPreferences.image.aspectRatio;
  const imageSize = generationPreferences.image.size;
  const videoModel = generationPreferences.video.model;
  const videoDuration = generationPreferences.video.duration;
  const videoAspectRatio = generationPreferences.video.aspectRatio;
  const businessSkills = useMemo(() => codexSkills.filter(isVisibleBusinessSkill), [codexSkills]);
  const skillLibraryCategories = useMemo(() => {
    const order = ['全部', '童装', '模特/换装', '电商视觉', '服装设计', '提示词', '舞台视觉', '其他'];
    const categories = new Set(['全部']);
    businessSkills.forEach((skill) => categories.add(skillLibraryCategory(skill)));
    return order.filter((item) => categories.has(item)).concat([...categories].filter((item) => !order.includes(item)).sort());
  }, [businessSkills]);
  const filteredSkillLibrarySkills = useMemo(() => {
    const query = skillLibraryQuery.trim().toLowerCase();
    return businessSkills.filter((skill) => {
      const category = skillLibraryCategory(skill);
      if (skillLibraryCategoryFilter !== '全部' && category !== skillLibraryCategoryFilter) return false;
      if (!query) return true;
      return skillLibrarySearchText(skill).includes(query);
    });
  }, [businessSkills, skillLibraryCategoryFilter, skillLibraryQuery]);
  const timelineItems = useMemo(
    () => Object.values(itemTimelineById).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [itemTimelineById],
  );
  const internalCanvasSkillNames = useMemo(
    () => codexSkills.filter(isInternalCanvasSkill).map((skill) => skill.name),
    [codexSkills],
  );
  const selectedSkill = useMemo(
    () => businessSkills.find((item) => item.id === selectedSkillId) || businessSkills[0] || null,
    [businessSkills, selectedSkillId],
  );
  const selectedSkillDirections = useMemo(() => parseSelectedSkillDirections(selectedSkill), [selectedSkill]);
  const selectedDirection = useMemo(
    () => selectedSkillDirections.find((item) => item.id === selectedDirectionId) || selectedSkillDirections[0] || null,
    [selectedDirectionId, selectedSkillDirections],
  );
  const activeRecord = useMemo(
    () => conversationRecords.find((item) => item.id === activeRecordId) || null,
    [activeRecordId, conversationRecords],
  );
  useEffect(() => {
    answeredAskMemoryRef.current = new Set(
      (activeRecord?.askAnswers || [])
        .map((item) => normalizeAskText(item.question || item.answer || ''))
        .filter(Boolean),
    );
  }, [activeRecord?.askAnswers, activeRecord?.id]);
  const mentionItems = useMemo<MentionAsset[]>(() => [
    {
      id: 'context:canvas',
      label: '@当前画布',
      value: `@当前画布 ${activeCanvas?.name || activeCanvasId || '未加载画布'}`,
      hint: activeCanvasId || '没有激活画布',
      source: 'context',
    },
    {
      id: 'context:references',
      label: '@参考图',
      value: `@参考图 ${referenceImages.map((item) => `${item.name} ${item.url}`).join('；') || '请使用已上传参考图'}`,
      hint: `${referenceImages.length} 张`,
      source: 'reference',
      kind: 'image',
      thumbUrl: referenceImages[0]?.url,
      url: referenceImages[0]?.url,
    },
    {
      id: 'context:skill',
      label: '@所选技能',
      value: skillMentionValue(selectedSkill),
      hint: skillHint(selectedSkill),
      source: 'skill',
    },
    ...mentionAssets,
  ], [activeCanvas?.name, activeCanvasId, mentionAssets, referenceImages, selectedSkill]);
  const renderParamControl = (
    control: SidebarParameterControl,
    value: string | number | boolean | undefined,
    onChange: (value: string | number | boolean) => void,
  ) => {
    if (control.type === 'boolean') {
      return (
        <label className="codex-agent-sidebar__param-check">
          <input
            type="checkbox"
            checked={Boolean(value ?? control.defaultValue)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{control.label}</span>
        </label>
      );
    }
    if (control.type === 'number') {
      return (
        <input
          type="number"
          value={String(value ?? control.defaultValue ?? '')}
          min={control.min}
          max={control.max}
          step={control.step || 1}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      );
    }
    return (
      <select
        value={String(value ?? control.defaultValue ?? control.options?.[0]?.value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      >
        {(control.options || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    );
  };
  const renderParamButtons = (
    groups: SidebarParameterGroup[],
    values: Record<string, any>,
    onSelect: (control: SidebarParameterControl, value: string | number | boolean) => void,
  ) => (
    <div className="codex-agent-sidebar__param-grid">
      {groups.map((group) => (
        <div key={group.id} className="codex-agent-sidebar__param-row">
          <span>{group.label}</span>
          <div>
            {group.controls.map((control) => (
              <label key={control.id} className="codex-agent-sidebar__param-control" data-type={control.type}>
                <small>{control.label}</small>
                {renderParamControl(control, values[control.valueKey], (value) => onSelect(control, value))}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  const mentionMaterials = useMemo<Material[]>(() => {
    const fromItems = mentionItems.map(materialFromMentionAsset).filter(Boolean) as Material[];
    const fromReferences = referenceImages.map((item) => ({
      id: `reference:${item.id}`,
      kind: 'image' as const,
      url: item.url,
      sourceNodeId: item.id,
      origin: 'local' as const,
      label: item.name,
      mentionKey: `reference:${item.id}`,
    } as Material));
    const seen = new Set<string>();
    return [...fromReferences, ...fromItems].filter((material) => {
      const key = materialMentionKey(material);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 48);
  }, [mentionItems, referenceImages]);
  const resolvedMentions = useMemo(() => {
    const tokenMentions = resolveSidebarMentions(promptMentions, mentionMaterials);
    const manualMentions = selectedMentionAssets
      .map(materialFromMentionAsset)
      .filter(Boolean)
      .map((material) => ({
        id: materialMentionKey(material as Material),
        kind: (material as Material).kind,
        label: (material as Material).label || materialMentionKey(material as Material),
        url: (material as Material).url,
        sourceNodeId: (material as Material).sourceNodeId,
      }));
    const seen = new Set<string>();
    return [...tokenMentions, ...manualMentions].filter((item) => {
      const key = `${item.kind}:${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [mentionMaterials, promptMentions, selectedMentionAssets]);
  const filteredMentionItems = useMemo(() => {
    const q = (mentionQuery?.query || '').trim().toLowerCase();
    if (!q) return mentionItems;
    return mentionItems.filter((item) => `${item.label} ${item.hint} ${item.value}`.toLowerCase().includes(q));
  }, [mentionItems, mentionQuery?.query]);
  const appendDiagnosticLog = useCallback((text: string, tone: DiagnosticLog['tone'] = 'info') => {
    const time = Date.now();
    setDiagnosticLogs((prev) => [
      {
        id: makeMessageId('log'),
        text,
        time,
        tone,
        expiresAt: shouldExpireDiagnosticLog(tone) ? time + DIAGNOSTIC_LOG_TTL_MS : undefined,
      },
      ...prev.filter((item) => !item.expiresAt || item.expiresAt > time),
    ].slice(0, DIAGNOSTIC_LOG_LIMIT));
  }, []);

  useEffect(() => {
    const now = Date.now();
    const hasExpired = diagnosticLogs.some((item) => item.expiresAt && item.expiresAt <= now);
    if (hasExpired) {
      setDiagnosticLogs((prev) => prev.filter((item) => !item.expiresAt || item.expiresAt > Date.now()));
      return undefined;
    }
    const nextExpiresAt = diagnosticLogs
      .map((item) => item.expiresAt)
      .filter((value): value is number => typeof value === 'number' && value > now)
      .sort((a, b) => a - b)[0];
    if (!nextExpiresAt) return undefined;
    const timer = window.setTimeout(() => {
      setDiagnosticLogs((prev) => prev.filter((item) => !item.expiresAt || item.expiresAt > Date.now()));
    }, Math.max(0, nextExpiresAt - now + 50));
    return () => window.clearTimeout(timer);
  }, [diagnosticLogs]);

  const clearCodexRouteMissingDiagnostics = useCallback(() => {
    setError((current) => isCodexRouteMissingText(current) ? '' : current);
    setDiagnosticLogs((prev) => prev.filter((item) => !isCodexRouteMissingText(item.text)));
  }, []);

  const handleAskExpired = useCallback((message?: string) => {
    setAskOptions([]);
    setAskPrompt('');
    setAskRequestId('');
    appendDiagnosticLog(message || 'Codex 的提问请求已结束；如果还需要这个决策，请直接重新发送一条明确回复。', 'warning');
  }, [appendDiagnosticLog]);

  const syncRecordThreadIds = useCallback((threadId?: string, turnId?: string) => {
    const codexThreadId = String(threadId || '').trim();
    const codexTurnId = String(turnId || '').trim();
    if (!activeRecordId || (!codexThreadId && !codexTurnId)) return;
    setConversationRecords((prev) => {
      const now = Date.now();
      const next = prev.map((record) => record.id === activeRecordId ? {
        ...record,
        codexThreadId: codexThreadId || record.codexThreadId,
        codexTurnId: codexTurnId || record.codexTurnId,
        updatedAt: now,
      } : record);
      saveConversationRecords(next);
      return next;
    });
  }, [activeRecordId]);

  const syncRecordWithCodexSession = useCallback((nextSession: CodexGlobalSession | null) => {
    syncRecordThreadIds(nextSession?.codexThreadId, nextSession?.codexTurnId);
  }, [syncRecordThreadIds]);

  const syncRecordWithCodexResult = useCallback((result: any) => {
    const record = result?.record || {};
    syncRecordThreadIds(record.codexThreadId || result?.codexThreadId, record.codexTurnId || result?.codexTurnId);
    if (record?.recordId || record?.id) {
      setConversationRecords((prev) => {
        const next = mergeConversationRecordsWithSdkSnapshots(prev, [{
          ...record,
          id: record.recordId || record.id,
          recordId: record.recordId || record.id,
          codexThreadId: record.codexThreadId || result?.codexThreadId || '',
          codexTurnId: record.codexTurnId || result?.codexTurnId || '',
          status: record.status || (result?.status === 'completed' ? 'success' : undefined),
        }]);
        saveConversationRecords(next);
        return next;
      });
    }
  }, [syncRecordThreadIds]);

  const refreshSdkConversationRecords = useCallback(async () => {
    const sdkRecords = await listGlobalCodexRecords({ limit: RECORD_LIMIT });
    setSession(sdkRecords.session);
    setConversationRecords((prev) => {
      const next = mergeConversationRecordsWithSdkSnapshots(prev, sdkRecords.records || []);
      saveConversationRecords(next);
      return next;
    });
  }, []);

  const closeFloatingPanels = useCallback((keep?: 'history' | 'mention' | 'canvasInfo' | 'preferences' | 'skillDetail' | 'skillLibrary' | 'referenceSearch') => {
    if (keep !== 'history') setHistoryOpen(false);
    if (keep !== 'mention') setMentionOpen(false);
    if (keep !== 'canvasInfo') setCanvasInfoOpen(false);
    if (keep !== 'preferences') setPrefOpen(false);
    if (keep !== 'skillLibrary') setSkillLibraryOpen(false);
    if (keep !== 'skillDetail') setSkillDetailOpen(false);
    if (keep !== 'referenceSearch') setReferenceSearchOpen(false);
  }, []);

  const refreshProjectSkills = useCallback(async (preferredName?: string) => {
    const next = await getCodexCliSkills({ workspaceDir: session?.workspaceDir });
    const realSkills = (next.skills || [])
      .filter((skill) => skill?.name && skill?.id && isProjectCodexSkill(skill))
      .sort((a, b) => a.name.localeCompare(b.name));
    const visibleSkills = realSkills.filter(isVisibleBusinessSkill);
    setCodexSkills(realSkills);
    const preferred = preferredName ? visibleSkills.find((skill) => skill.name === preferredName) : null;
    setSelectedSkillId((current) => (
      preferred?.id || (visibleSkills.some((skill) => skill.id === current) ? current : (visibleSkills[0]?.id || ''))
    ));
    return { workspaceDir: next.workspaceDir || session?.workspaceDir, skills: realSkills, selected: preferred || visibleSkills[0] || null };
  }, [session?.workspaceDir]);

  const loadSkillFileTree = useCallback(async (skill: CodexSkill | null) => {
    if (!skill?.name) return;
    setSkillFileLoading(true);
    try {
      const result = await getCodexProjectSkillFiles({
        workspaceDir: session?.workspaceDir,
        name: skill.name,
      });
      setSkillFileTree(result.files);
      const nextPath = result.files.some((item) => item.path === selectedSkillFilePath)
        ? selectedSkillFilePath
        : firstSkillFilePath(result.files);
      setSelectedSkillFilePath(nextPath);
      if (!nextPath) {
        setSelectedSkillFileContent('');
        setSkillFileDirty(false);
        setSkillSaveStatus('idle');
        return;
      }
      const file = await readCodexProjectSkillFile({
        workspaceDir: session?.workspaceDir,
        name: skill.name,
        path: nextPath,
      });
      setSelectedSkillFileContent(file.content);
      setSkillFileDirty(false);
      setSkillSaveStatus('idle');
    } catch (nextError: any) {
      appendDiagnosticLog(nextError?.message || '读取 Skill 文件失败', 'error');
    } finally {
      setSkillFileLoading(false);
    }
  }, [appendDiagnosticLog, selectedSkillFilePath, session?.workspaceDir]);

  const syncImportedSkillFile = useCallback(async (skill: CodexSkill | null, workspaceDir?: string) => {
    if (!skill?.name) return '';
    setSelectedSkillId(skill.id);
    setSelectedSkillFilePath('SKILL.md');
    const file = await readCodexProjectSkillFile({
      workspaceDir: workspaceDir || session?.workspaceDir,
      name: skill.name,
      path: 'SKILL.md',
    });
    setSelectedSkillFileContent(file.content);
    setSkillFileDirty(false);
    setSkillSaveStatus('idle');
    void loadSkillFileTree(skill);
    return file.content;
  }, [loadSkillFileTree, session?.workspaceDir]);

  const validateSelectedSkillByName = useCallback(async (name: string, workspaceDir?: string) => {
    if (!name) return null;
    const result = await validateCodexProjectSkill({
      workspaceDir: workspaceDir || session?.workspaceDir,
      name,
    });
    setSkillValidation(result);
    appendDiagnosticLog(
      result.ok ? 'Skill 校验通过。' : `Skill 校验：缺 ${result.missingSections.length} 个 section，${result.parseWarnings.length} 条解析提醒。`,
      result.ok ? 'success' : 'warning',
    );
    return result;
  }, [appendDiagnosticLog, session?.workspaceDir]);

  const openSkillFile = useCallback(async (filePath: string) => {
    if (!selectedSkill?.name) return;
    setSelectedSkillFilePath(filePath);
    setSkillFileLoading(true);
    try {
      const file = await readCodexProjectSkillFile({
        workspaceDir: session?.workspaceDir,
        name: selectedSkill.name,
        path: filePath,
      });
      setSelectedSkillFileContent(file.content);
      setSkillFileDirty(false);
      setSkillSaveStatus('idle');
    } catch (nextError: any) {
      appendDiagnosticLog(nextError?.message || '读取 Skill 文件失败', 'error');
    } finally {
      setSkillFileLoading(false);
    }
  }, [appendDiagnosticLog, selectedSkill?.name, session?.workspaceDir]);

  const saveSkillFile = useCallback(async () => {
    if (!selectedSkill?.name || !selectedSkillFilePath) return;
    setSkillFileLoading(true);
    setSkillSaveStatus('saving');
    try {
      await writeCodexProjectSkillFile({
        workspaceDir: session?.workspaceDir,
        name: selectedSkill.name,
        path: selectedSkillFilePath,
        content: selectedSkillFileContent,
      });
      setSkillFileDirty(false);
      setSkillSaveStatus('saved');
      appendDiagnosticLog(`已保存 Skill 文件：${selectedSkillFilePath}`, 'success');
      await refreshProjectSkills(selectedSkill.name);
      await validateSelectedSkillByName(selectedSkill.name);
    } catch (nextError: any) {
      setSkillSaveStatus('error');
      appendDiagnosticLog(nextError?.message || '保存 Skill 文件失败', 'error');
    } finally {
      setSkillFileLoading(false);
    }
  }, [appendDiagnosticLog, refreshProjectSkills, selectedSkill?.name, selectedSkillFileContent, selectedSkillFilePath, session?.workspaceDir, validateSelectedSkillByName]);

  const adaptSelectedSkillForSidebar = useCallback(async () => {
    if (!selectedSkill?.name) return;
    setSkillFileLoading(true);
    try {
      const result = await adaptCodexProjectSkillForSidebar({
        workspaceDir: session?.workspaceDir,
        name: selectedSkill.name,
      });
      const refreshed = await refreshProjectSkills(result.skill.name);
      const adapted = refreshed.selected || result.skill;
      await syncImportedSkillFile(adapted, result.workspaceDir || refreshed.workspaceDir);
      await validateSelectedSkillByName(adapted.name, result.workspaceDir || refreshed.workspaceDir);
      appendDiagnosticLog(`已适配侧栏：${displaySkillLabel(adapted)}`, 'success');
    } catch (nextError: any) {
      appendDiagnosticLog(nextError?.message || '适配侧栏失败', 'error');
    } finally {
      setSkillFileLoading(false);
    }
  }, [appendDiagnosticLog, refreshProjectSkills, selectedSkill?.name, session?.workspaceDir, syncImportedSkillFile, validateSelectedSkillByName]);

  const importSkillFile = useCallback(async (file: File) => {
    if (!file) return;
    setSkillFileLoading(true);
    setSkillImportDragging(false);
    setSkillImportStatus({ tone: 'loading', text: `正在导入 ${file.name}...` });
    try {
      const name = skillNameFromFileName(file.name);
      const isArchive = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
      const result = isArchive
        ? await importCodexProjectSkillArchive({
            workspaceDir: session?.workspaceDir,
            name,
            filename: file.name,
            archiveBase64: arrayBufferToBase64(await file.arrayBuffer()),
          })
        : await createCodexProjectSkill({
            workspaceDir: session?.workspaceDir,
            name,
            title: name,
            description: '从侧栏导入的项目 Skill',
            category: 'imported',
            body: await file.text(),
          });
      const refreshed = await refreshProjectSkills(result.skill.name);
      const imported = refreshed.selected || result.skill;
      await syncImportedSkillFile(imported, result.workspaceDir || refreshed.workspaceDir);
      const validation = await validateSelectedSkillByName(imported.name, result.workspaceDir || refreshed.workspaceDir);
      setSkillEditMode('edit');
      setSkillLibraryOpen(false);
      setSkillDetailOpen(true);
      setSkillSaveStatus('imported');
      setSkillAnalysisView('validation');
      setSkillImportStatus({
        tone: validation?.ok ? 'success' : 'warning',
        text: validation?.ok
          ? `已导入 ${displaySkillLabel(imported)}，校验通过。`
          : `已导入 ${displaySkillLabel(imported)}，需要补齐 ${validation?.missingSections.length || 0} 个 section。`,
      });
      appendDiagnosticLog(
        validation?.ok
          ? `已导入并校验 Skill：${displaySkillLabel(imported)}`
          : `已导入并校验 Skill：${displaySkillLabel(imported)}，请查看缺失 section。`,
        validation?.ok ? 'success' : 'warning',
      );
    } catch (nextError: any) {
      setSkillImportStatus({ tone: 'error', text: nextError?.message || '导入 Skill 失败' });
      appendDiagnosticLog(nextError?.message || '导入 Skill 失败', 'error');
    } finally {
      setSkillFileLoading(false);
    }
  }, [appendDiagnosticLog, refreshProjectSkills, session?.workspaceDir, syncImportedSkillFile, validateSelectedSkillByName]);

  const handleSkillImport = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importSkillFile(file);
  }, [importSkillFile]);

  const handleSkillImportDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!skillFileLoading) {
      setSkillImportDragging(true);
      setSkillImportStatus({ tone: 'dragging', text: '松开即可导入到当前项目 .agents/skills。' });
    }
  }, [skillFileLoading]);

  const handleSkillImportDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setSkillImportDragging(false);
    setSkillImportStatus((prev) => prev.tone === 'dragging'
      ? { tone: 'idle', text: '拖入 zip / SKILL.md / json，导入后自动校验。' }
      : prev);
  }, []);

  const handleSkillImportDrop = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSkillImportDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    const file = files.find((item) => /\.(zip|md|markdown|txt|json)$/i.test(item.name)) || files[0];
    if (!file) {
      setSkillImportStatus({ tone: 'warning', text: '没有检测到可导入文件。' });
      return;
    }
    if (!/\.(zip|md|markdown|txt|json)$/i.test(file.name)) {
      setSkillImportStatus({ tone: 'warning', text: '只支持 zip、md、txt、json 格式的 Skill。' });
      return;
    }
    void importSkillFile(file);
  }, [importSkillFile]);

  useEffect(() => {
    if (!open) return;
    if (activeRecordId) return;
    const now = Date.now();
    const nextRecord = {
      id: makeMessageId('record'),
      title: '新记录',
      messages: [],
      codexThreadId: '',
      codexTurnId: '',
      canvasId: activeCanvasId,
      skillName: selectedSkill?.name || '',
      directionId: selectedDirection?.id || '',
      generationPreferences,
      mentions: resolvedMentions,
      researchSummary,
      taskPreview,
      lineage: [],
      askAnswers: [],
      status: 'idle' as const,
      createdAt: now,
      updatedAt: now,
    };
    setConversationRecords((prev) => {
      const next = [nextRecord, ...prev].slice(0, RECORD_LIMIT);
      saveConversationRecords(next);
      return next;
    });
    setActiveRecordId(nextRecord.id);
  }, [activeCanvasId, activeRecordId, generationPreferences, open, researchSummary, resolvedMentions, selectedDirection?.id, selectedSkill?.name, taskPreview]);

  useEffect(() => {
    if (!activeRecordId) return;
    const timer = window.setTimeout(() => {
      setConversationRecords((prev) => {
        const now = Date.now();
        const compactMessages = compactRecordMessages(messages);
        const lastMessagePreview = compactText(
          lastUserMessage(compactMessages)
            || compactMessages.slice().reverse().find((message) => message.text.trim())?.text
            || activeRecord?.lastMessagePreview
            || '',
          120,
        );
        const title = compactText(lastUserMessage(compactMessages) || activeRecord?.title || activeRecord?.lastMessagePreview || '新记录', 28);
        const exists = prev.some((item) => item.id === activeRecordId);
        const next = exists
          ? prev.map((item) => item.id === activeRecordId ? {
            ...item,
            title,
            messages: compactMessages,
            messageCount: compactMessages.length || item.messageCount || 0,
            lastMessagePreview,
            canvasId: activeCanvasId,
            skillName: selectedSkill?.name || item.skillName || '',
            directionId: selectedDirection?.id || item.directionId || '',
            generationPreferences,
            mentions: resolvedMentions,
            researchSummary,
            taskPreview,
            lineage: item.lineage || [],
            updatedAt: now,
          } : item)
          : [{
            id: activeRecordId,
            title,
            messages: compactMessages,
            messageCount: compactMessages.length,
            lastMessagePreview,
            codexThreadId: '',
            codexTurnId: '',
            canvasId: activeCanvasId,
            skillName: selectedSkill?.name || '',
            directionId: selectedDirection?.id || '',
            generationPreferences,
            mentions: resolvedMentions,
            researchSummary,
            taskPreview,
            lineage: [],
            askAnswers: [],
            status: 'idle' as const,
            createdAt: now,
            updatedAt: now,
          }, ...prev];
        const limited = next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECORD_LIMIT);
        saveConversationRecords(limited);
        return limited;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeCanvasId, activeRecord?.title, activeRecordId, generationPreferences, messages, researchSummary, resolvedMentions, selectedDirection?.id, selectedSkill?.name, taskPreview]);

  useEffect(() => {
    if (!open) return;
    void refreshSdkConversationRecords().catch(() => undefined);
  }, [open, refreshSdkConversationRecords]);

  useEffect(() => {
    if (!historyOpen) return;
    void refreshSdkConversationRecords().catch((nextError: any) => {
      appendDiagnosticLog(nextError?.message || '刷新 SDK 记录失败', 'warning');
    });
  }, [appendDiagnosticLog, historyOpen, refreshSdkConversationRecords]);

  useEffect(() => {
    if (!open) return;
    const threadId = activeRecord?.codexThreadId || session?.codexThreadId || '';
    if (!threadId || nativeThreadHydrated === threadId) return;
    let cancelled = false;
    const hydrate = async () => {
      try {
        const turns = await listGlobalCodexThreadTurns({ codexThreadId: threadId, limit: 40, itemsView: 'summary' });
        if (cancelled) return;
        if (turns.unsupported) {
          setNativeTurnHistoryUnavailable(true);
          const thread = await readGlobalCodexThread({ codexThreadId: threadId, includeTurns: true });
          if (cancelled) return;
          if (thread.unsupported) {
            setNativeThreadHydrated(threadId);
            appendDiagnosticLog('当前 Codex SDK 不提供原生历史读取，继续使用侧栏 SDK 记录。', 'warning');
            return;
          }
          const hydrated = hydrateMessagesFromNativeThread(thread.thread, []);
          if (hydrated.length) {
            setMessages(hydrated);
            setNativeThreadHydrated(threadId);
          } else if (!running) setNativeThreadHydrated(threadId);
          return;
        }
        const hydrated = hydrateMessagesFromNativeThread(null, turns.data);
        if (hydrated.length) {
          setMessages(hydrated);
          setNativeThreadHydrated(threadId);
        }
        if (!hydrated.length && !running) setNativeThreadHydrated(threadId);
        setNativeTurnHistoryUnavailable(false);
      } catch (nextError: any) {
        if (cancelled) return;
        setNativeTurnHistoryUnavailable(true);
        if (!running) setNativeThreadHydrated(threadId);
        appendDiagnosticLog(nextError?.message || '读取 Codex 原生历史失败，继续使用侧栏本地记录。', 'warning');
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [activeRecord?.codexThreadId, appendDiagnosticLog, nativeThreadHydrated, open, running, session?.codexThreadId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await getGlobalCodexSession();
        if (!cancelled) {
          clearCodexRouteMissingDiagnostics();
          setSession(next);
          syncRecordWithCodexSession(next);
          const signature = [
            next.status,
            next.pid || '',
            next.cliStatus?.available === true ? 'available' : next.cliStatus?.available === false ? 'unavailable' : 'unknown',
            next.cliStatus?.authStatus || '',
            next.lastError || '',
          ].join(':');
          if (signature !== lastSessionSignatureRef.current) {
            lastSessionSignatureRef.current = signature;
            appendDiagnosticLog(
              `${sessionLabel(next)}：${next.cliStatus?.message || sessionDetail(next)}`,
              next.cliStatus?.available === false || next.status === 'error' ? 'warning' : next.cliStatus?.available ? 'success' : 'info',
            );
          }
        }
      } catch (nextError: any) {
        if (!cancelled) {
          const message = nextError?.message || '读取 Codex 会话失败';
          setError(message);
          appendDiagnosticLog(message, 'error');
        }
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, running ? 1500 : 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [appendDiagnosticLog, clearCodexRouteMissingDiagnostics, open, running, syncRecordWithCodexSession]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      permissionPreset,
      drivingMode,
      researchMode,
      codexModel: codexModelValue(codexModelMode, customCodexModel),
      codexModelMode,
      customCodexModel,
      reasoningEffort,
      generationPreferences,
      sidebarWidth,
      composerHeight,
    }));
  }, [permissionPreset, drivingMode, researchMode, codexModelMode, customCodexModel, reasoningEffort, generationPreferences, sidebarWidth, composerHeight]);

  useEffect(() => {
    setSelectedDirectionId((current) => (
      selectedSkillDirections.some((item) => item.id === current) ? current : (selectedSkillDirections[0]?.id || '')
    ));
  }, [selectedSkillDirections]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSkillsLoading(true);
    void refreshProjectSkills().then((result) => {
      if (cancelled) return;
      clearCodexRouteMissingDiagnostics();
      appendDiagnosticLog(
        result.skills.length ? `已加载 ${result.skills.length} 个项目 Codex skills。` : '当前项目没有发现可用 Codex skills。',
        result.skills.length ? 'success' : 'warning',
      );
    }).catch((nextError: any) => {
      if (cancelled) return;
      const message = nextError?.message || '读取 Codex skills 失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
    }).finally(() => {
      if (!cancelled) setSkillsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [appendDiagnosticLog, clearCodexRouteMissingDiagnostics, open, refreshProjectSkills]);

  useEffect(() => {
    if (!skillDetailOpen || !selectedSkill) return;
    void loadSkillFileTree(selectedSkill);
  }, [loadSkillFileTree, selectedSkill, skillDetailOpen]);

  const openSession = useCallback(async () => {
    setError('');
    appendDiagnosticLog('正在检查 Codex SDK 与登录状态...', 'info');
    try {
      const next = await openGlobalCodexSession({
        permissionPreset,
        sandbox: currentPermission.sandbox,
        approvalPolicy: currentPermission.approvalPolicy,
        model: codexModelValue(codexModelMode, customCodexModel),
        reasoningEffort,
      });
      clearCodexRouteMissingDiagnostics();
      setSession(next);
      appendDiagnosticLog(`${sessionLabel(next)}：${next.cliStatus?.message || sessionDetail(next)}`, next.cliStatus?.available ? 'success' : 'warning');
    } catch (nextError: any) {
      const message = nextError?.message || '打开 Codex 会话失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
    }
  }, [appendDiagnosticLog, clearCodexRouteMissingDiagnostics, codexModelMode, customCodexModel, currentPermission.approvalPolicy, currentPermission.sandbox, permissionPreset, reasoningEffort]);

  const stopSession = useCallback(async () => {
    setError('');
    abortRef.current?.abort();
    appendDiagnosticLog('正在停止当前 Codex SDK 任务...', 'warning');
    try {
      const next = await stopGlobalCodexSession();
      setSession(next);
      appendDiagnosticLog('Codex SDK 任务已停止，侧边栏回到空闲。', 'info');
      setMessages((prev) => prev.map((item) => (
        item.status === 'running' ? { ...item, status: 'error', text: item.text || 'Codex 任务已停止' } : item
      )));
    } catch (nextError: any) {
      const message = nextError?.message || '停止 Codex 任务失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
    }
  }, [appendDiagnosticLog]);

  const appendProcessStep = useCallback((processId: string, kind: ProcessStep['kind'], rawText: string) => {
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) return;
    setProcessCollapsedById((prev) => (
      Object.prototype.hasOwnProperty.call(prev, processId) ? prev : { ...prev, [processId]: true }
    ));
    setMessages((prev) => prev.map((item) => {
      if (item.id !== processId) return item;
      const steps = item.steps || [];
      const last = steps[steps.length - 1];
      const stepKey = processStepKey(kind, text);
      if (steps.some((step) => processStepKey(step.kind, step.text) === stepKey)) return item;
      if (last?.kind === 'reasoning' && kind === 'reasoning') {
        const merged = compactText(`${last.text} ${text}`, 420);
        const nextSteps = [
          ...steps.slice(0, -1),
          { ...last, text: merged, time: Date.now() },
        ].slice(-12);
        return {
          ...item,
          status: item.status || 'running',
          text: processSummaryText({ ...item, steps: nextSteps }),
          steps: nextSteps,
        };
      }
      if (last?.kind === kind && last.text === text) return item;
      if (last?.kind === kind && kind !== 'error' && last.text.includes(text)) return item;
      if (last?.kind === kind && kind !== 'error' && text.includes(last.text)) {
        const nextSteps = [
          ...steps.slice(0, -1),
          { ...last, text, time: Date.now() },
        ].slice(-12);
        return {
          ...item,
          status: item.status || 'running',
          text: processSummaryText({ ...item, steps: nextSteps }),
          steps: nextSteps,
        };
      }
      const nextSteps = [
        ...steps,
        { id: makeMessageId('step'), kind, text, time: Date.now() },
      ].slice(-12);
      return {
        ...item,
        status: item.status || 'running',
        text: processSummaryText({ ...item, steps: nextSteps }),
        steps: nextSteps,
      };
    }));
  }, []);

  const updatePermissionPreset = useCallback((nextPreset: PermissionPresetId) => {
    if (nextPreset === 'full') {
      const ok = window.confirm('完全权限会允许 Codex 使用 danger-full-access。只建议在你信任当前任务且需要本机全权限时开启。');
      if (!ok) return;
    }
    setPreferences((prev) => ({ ...prev, permissionPreset: nextPreset }));
  }, []);

  const addHistoryItem = useCallback((text: string) => {
    setHistory((prev) => {
      const trimmed = text.trim();
      const next = [
        {
          id: makeMessageId('history'),
          text: trimmed,
          skillLabel: skillLabel(selectedSkill),
          canvasId: activeCanvasId,
          createdAt: Date.now(),
        },
        ...prev.filter((item) => item.text !== trimmed),
      ].slice(0, HISTORY_LIMIT);
      saveHistory(next);
      return next;
    });
  }, [activeCanvasId, selectedSkill]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const reuseRecordContext = useCallback((record: ConversationRecord | null) => {
    const replay = recordReplayPayload(record);
    if (record?.researchSummary) setResearchSummary(record.researchSummary);
    else setResearchSummary(null);
    if (record?.taskPreview) setTaskPreview(record.taskPreview);
    else setTaskPreview(null);
    setTaskPreviewExpanded(false);
    if (record?.generationPreferences) setGenerationPreferences(record.generationPreferences);
    appendDiagnosticLog(`已准备复用记录上下文：${Object.keys(replay).length} 类数据。`, 'info');
    return replay;
  }, [appendDiagnosticLog]);

  const createConversationRecord = useCallback(() => {
    const now = Date.now();
    const nextRecord: ConversationRecord = {
      id: makeMessageId('record'),
      title: '新记录',
      messages: [],
      codexThreadId: '',
      codexTurnId: '',
      canvasId: activeCanvasId,
      skillName: selectedSkill?.name || '',
      directionId: selectedDirection?.id || '',
      generationPreferences,
      mentions: resolvedMentions,
      researchSummary,
      taskPreview,
      lineage: [],
      askAnswers: [],
      status: 'idle',
      createdAt: now,
      updatedAt: now,
    };
    setConversationRecords((prev) => {
      const next = [nextRecord, ...prev].slice(0, RECORD_LIMIT);
      saveConversationRecords(next);
      return next;
    });
    setActiveRecordId(nextRecord.id);
    setMessages([]);
    setNativeThreadHydrated('');
    setPrompt('');
    setPromptMentions([]);
    closeFloatingPanels();
  }, [activeCanvasId, closeFloatingPanels, generationPreferences, researchSummary, resolvedMentions, selectedDirection?.id, selectedSkill?.name, taskPreview]);

  const reuseConversationRecord = useCallback((record: ConversationRecord) => {
    setActiveRecordId(record.id);
    setMessages(record.messages || []);
    setNativeThreadHydrated('');
    setPrompt('');
    setPromptMentions([]);
    reuseRecordContext(record);
    if (record.skillName) {
      setSelectedSkillId((current) => codexSkills.find((skill) => skill.name === record.skillName)?.id || current);
    }
    if (record.directionId) setSelectedDirectionId(record.directionId);
    closeFloatingPanels();
  }, [closeFloatingPanels, codexSkills, reuseRecordContext]);

  const deleteConversationRecord = useCallback(async (record: ConversationRecord) => {
    if (record.status === 'running') {
      appendDiagnosticLog('这条记录仍在运行，先停止当前 Codex 任务再删除。', 'warning');
      return;
    }
    try {
      const result = await deleteGlobalCodexRecord({ recordId: record.id });
      if (result.session) setSession(result.session);
    } catch (nextError: any) {
      const message = nextError?.message || '删除 Codex 记录失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
      return;
    }
    const nextRecords = conversationRecords.filter((item) => item.id !== record.id);
    saveConversationRecords(nextRecords);
    setConversationRecords(nextRecords);
    if (activeRecordId === record.id) {
      const nextActive = nextRecords[0] || null;
      setActiveRecordId(nextActive?.id || '');
      setMessages(nextActive?.messages || []);
      setNativeThreadHydrated('');
      if (nextActive) {
        reuseRecordContext(nextActive);
      } else {
        setResearchSummary(null);
        setTaskPreview(null);
        setPrompt('');
        setPromptMentions([]);
      }
    }
    appendDiagnosticLog(`已删除 Codex 记录：${record.title || record.id}`, 'success');
  }, [activeRecordId, appendDiagnosticLog, conversationRecords, reuseRecordContext]);

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      setLayoutPreferences((prev) => ({
        ...prev,
        sidebarWidth: clampNumber(startWidth + delta, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }, [sidebarWidth]);

  const startComposerResize = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = startY - moveEvent.clientY;
      setLayoutPreferences((prev) => ({
        ...prev,
        composerHeight: clampNumber(startHeight + delta, MIN_COMPOSER_HEIGHT, MAX_COMPOSER_HEIGHT),
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }, [composerHeight]);

  const insertPromptText = useCallback((text: string) => {
    setPrompt((current) => {
      const prefix = current.trim() ? `${current.trimEnd()}\n` : '';
      return `${prefix}${text}`;
    });
  }, []);

  const publishReferenceImageToCanvas = useCallback(async (image: ReferenceImage, index = 0) => {
    if (!activeCanvasId) {
      appendDiagnosticLog('上传成功，但当前没有激活画布，未创建图片节点。', 'warning');
      return;
    }
    const data = await getCanvasData(activeCanvasId);
    const viewport = data.viewport || { x: 0, y: 0, zoom: 1 };
    const zoom = viewport.zoom || 1;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const baseX = -viewport.x / zoom + 80;
    const baseY = -viewport.y / zoom + 120 + index * 260;
    const nodeId = `codex-ref-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextNode = {
      id: nodeId,
      type: 'image',
      position: { x: baseX, y: baseY },
      selected: true,
      data: {
        label: image.name,
        title: image.name,
        prompt: `Codex 侧边栏上传参考图：${image.name}`,
        imageUrl: image.url,
        imageUrls: [image.url],
        urls: [image.url],
        directImageUrl: image.url,
        directImageUrls: [image.url],
        referenceImages: [image.url],
        source: 'codex-agent-sidebar-reference-upload',
        uploadedFilename: image.filename,
        uploadedAt: Date.now(),
      },
    };
    await saveCanvasData(activeCanvasId, {
      ...data,
      nodes: [...nodes.map((node: any) => ({ ...node, selected: false })), nextNode],
      edges: Array.isArray(data.edges) ? data.edges : [],
      viewport,
      nextNodeSerialId: Number(data.nextNodeSerialId || nodes.length + 1) + 1,
    });
    await addResourceItem({
      kind: 'image',
      url: image.url,
      title: image.name,
      sourceCanvasId: activeCanvasId,
      sourceNodeId: nodeId,
      tags: ['codex-sidebar', 'reference'],
    }).catch(() => undefined);
    window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
    await loadCanvases();
    appendDiagnosticLog(`上传后已添加到当前画布：${image.name}`, 'success');
  }, [activeCanvasId, appendDiagnosticLog, loadCanvases]);

  const publishResearchSummaryToCanvas = useCallback(async (summary: ResearchSummaryNode) => {
    if (!activeCanvasId) {
      appendDiagnosticLog('已生成调研摘要，但当前没有激活画布，未落节点。', 'warning');
      return summary;
    }
    const data = await getCanvasData(activeCanvasId);
    const viewport = data.viewport || { x: 0, y: 0, zoom: 1 };
    const zoom = viewport.zoom || 1;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const position = { x: -viewport.x / zoom + 120, y: -viewport.y / zoom + 120 };
    const node = createResearchSummaryNode(summary, position);
    await saveCanvasData(activeCanvasId, {
      ...data,
      nodes: [...nodes.map((item: any) => ({ ...item, selected: false })), node],
      edges: Array.isArray(data.edges) ? data.edges : [],
      viewport,
      nextNodeSerialId: Number(data.nextNodeSerialId || nodes.length + 1) + 1,
    });
    const nextSummary = { ...summary, nodeId: node.id };
    setResearchSummary(nextSummary);
    setConversationRecords((prev) => {
      const next = prev.map((record) => record.id === activeRecordId ? {
        ...record,
        researchSummary: nextSummary,
        lineage: [
          ...(record.lineage || []),
          {
            id: makeMessageId('lineage'),
            label: '调研摘要节点',
            nodeIds: [node.id],
            sourceUrls: summary.sources.map((item) => item.url).filter(Boolean),
            createdAt: Date.now(),
          },
        ],
      } : record);
      saveConversationRecords(next);
      return next;
    });
    await loadCanvases();
    appendDiagnosticLog(`调研摘要已落画布：${compactText(summary.query, 28)}`, summary.cached ? 'info' : 'success');
    return nextSummary;
  }, [activeCanvasId, activeRecordId, appendDiagnosticLog, loadCanvases]);

  const createReferenceBoardFromResults = useCallback(async (results: CodexReferenceImageResult[], query: string) => {
    if (!activeCanvasId || !results.length) return;
    const data = await getCanvasData(activeCanvasId);
    const viewport = data.viewport || { x: 0, y: 0, zoom: 1 };
    const zoom = viewport.zoom || 1;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const position = { x: -viewport.x / zoom + 480, y: -viewport.y / zoom + 120 };
    const node = createReferenceBoardNode(results, query, position);
    await saveCanvasData(activeCanvasId, {
      ...data,
      nodes: [...nodes.map((item: any) => ({ ...item, selected: false })), node],
      edges: Array.isArray(data.edges) ? data.edges : [],
      viewport,
      nextNodeSerialId: Number(data.nextNodeSerialId || nodes.length + 1) + 1,
    });
    setConversationRecords((prev) => {
      const next = prev.map((record) => record.id === activeRecordId ? {
        ...record,
        lineage: [
          ...(record.lineage || []),
          {
            id: makeMessageId('lineage'),
            label: '参考图搜索 board',
            nodeIds: [node.id],
            sourceUrls: results.map((item) => item.sourceUrl || item.url).filter(Boolean),
            createdAt: Date.now(),
          },
        ],
      } : record);
      saveConversationRecords(next);
      return next;
    });
    await loadCanvases();
    appendDiagnosticLog(`参考图 board 已添加到画布：${compactText(query, 28)}`, 'success');
  }, [activeCanvasId, activeRecordId, appendDiagnosticLog, loadCanvases]);

  const publishResultReviewToCanvas = useCallback(async (options: {
    beforeCanvasData: any;
    prompt: string;
    reply: string;
  }) => {
    if (!activeCanvasId) return;
    const afterData = await getCanvasData(activeCanvasId);
    const beforeSignatures = new Set(collectGeneratedCanvasMedia(options.beforeCanvasData).map(resultRefSignature));
    const afterRefs = collectGeneratedCanvasMedia(afterData);
    const generatedRefs = afterRefs
      .filter((ref) => !beforeSignatures.has(resultRefSignature(ref)))
      .slice(0, 12);
    if (generatedRefs.length === 0) {
      appendDiagnosticLog('本轮未发现新的 imageUrl/videoUrl，跳过结果评审节点。', 'warning');
      return;
    }
    const viewport = afterData.viewport || { x: 0, y: 0, zoom: 1 };
    const zoom = viewport.zoom || 1;
    const nodes = Array.isArray(afterData.nodes) ? afterData.nodes : [];
    const rightMost = nodes.reduce((max: number, node: any) => Math.max(max, Number(node?.position?.x) || 0), -viewport.x / zoom);
    const position = { x: rightMost + 420, y: -viewport.y / zoom + 160 };
    const reviewNode = createResultReviewNode({
      refs: generatedRefs,
      prompt: options.prompt,
      reply: options.reply,
      position,
    });
    await saveCanvasData(activeCanvasId, {
      ...afterData,
      nodes: [...nodes.map((item: any) => ({ ...item, selected: false })), reviewNode],
      edges: Array.isArray(afterData.edges) ? afterData.edges : [],
      viewport,
      nextNodeSerialId: Number(afterData.nextNodeSerialId || nodes.length + 1) + 1,
    });
    setConversationRecords((prev) => {
      const next = prev.map((record) => record.id === activeRecordId ? {
        ...record,
        lineage: [
          ...(record.lineage || []),
          {
            id: makeMessageId('lineage'),
            label: '本轮结果评审节点',
            nodeIds: [reviewNode.id, ...generatedRefs.map((ref) => ref.nodeId)],
            sourceUrls: generatedRefs.map((ref) => ref.url).filter(Boolean),
            createdAt: Date.now(),
          },
        ],
      } : record);
      saveConversationRecords(next);
      return next;
    });
    await loadCanvases();
    appendDiagnosticLog(`本轮结果评审节点已添加：${generatedRefs.length} 个结果。`, 'success');
  }, [activeCanvasId, activeRecordId, appendDiagnosticLog, loadCanvases]);

  const runReferenceImageSearch = useCallback(async () => {
    const query = (referenceSearchQuery || prompt || selectedSkill?.description || '').trim();
    if (!query) return;
    setReferenceSearchLoading(true);
    try {
      const result = await searchCodexReferenceImages({ query, limit: 8 });
      setReferenceSearchResults(result.images);
      appendDiagnosticLog(`参考图搜索完成：${result.images.length} 条。只作为参考 board，不自动复刻。`, 'success');
      await createReferenceBoardFromResults(result.images, result.query);
    } catch (nextError: any) {
      appendDiagnosticLog(nextError?.message || '参考图搜索失败', 'error');
    } finally {
      setReferenceSearchLoading(false);
    }
  }, [appendDiagnosticLog, createReferenceBoardFromResults, prompt, referenceSearchQuery, selectedSkill?.description]);

  const validateSelectedSkill = useCallback(async () => {
    if (!selectedSkill?.name) return;
    try {
      await validateSelectedSkillByName(selectedSkill.name);
    } catch (nextError: any) {
      appendDiagnosticLog(nextError?.message || 'Skill 校验失败', 'error');
    }
  }, [appendDiagnosticLog, selectedSkill?.name, validateSelectedSkillByName]);

  const prepareResearchSummary = useCallback(async (query: string) => {
    if (researchMode === 'none') return researchSummary;
    const key = researchCacheKey(query, selectedSkill, selectedDirection, researchMode);
    const cached = cachedResearch[key] || activeRecord?.researchSummary;
    if (cached && cached.cacheKey === key) {
      const nextCached = { ...cached, cached: true };
      setResearchSummary(nextCached);
      await publishResearchSummaryToCanvas(nextCached);
      return nextCached;
    }
    const summary = await getCodexResearchSummary({
      query,
      skillName: selectedSkill?.name,
      directionId: selectedDirection?.id,
      mode: researchMode,
      limit: researchMode === 'deep' ? 8 : 4,
    });
    const nextSummary: ResearchSummaryNode = summary;
    setCachedResearch((prev) => ({ ...prev, [key]: nextSummary }));
    const published = await publishResearchSummaryToCanvas(nextSummary);
    return published;
  }, [activeRecord?.researchSummary, cachedResearch, publishResearchSummaryToCanvas, researchMode, researchSummary, selectedDirection, selectedSkill]);

  const loadMentionAssets = useCallback(async () => {
    const nextAssets: MentionAsset[] = [];
    setMentionAssetsLoading(true);
    try {
      if (activeCanvasId) {
        const data = await getCanvasData(activeCanvasId);
        (Array.isArray(data.nodes) ? data.nodes : []).forEach((node: any) => {
          const urls = imageUrlsFromNodeData(node.data);
          if (!urls.length) return;
          const label = String(node.data?.label || node.data?.title || node.data?.name || node.id || '画布图片');
          nextAssets.push({
            id: `canvas:${node.id}`,
            label,
            hint: `画布节点 · ${node.type || 'node'}`,
            value: `@画布节点 ${label} ${urls[0]}`,
            source: 'canvas',
            thumbUrl: urls[0],
            url: urls[0],
          });
        });
      }
      const resources = await Promise.all([
        getResourceItems({ kind: 'image' }),
        getResourceItems({ kind: 'video' }),
        getResourceItems({ kind: 'set' }),
      ]);
      resources.flatMap((result) => (result.success ? (result.data || []) : []))
        .map(mentionAssetFromResource)
        .filter(Boolean)
        .forEach((item) => {
        if (!item) return;
        if (!nextAssets.some((asset) => asset.id === item.id)) nextAssets.push(item);
      });
      setMentionAssets(nextAssets.slice(0, 36));
    } catch (nextError: any) {
      const message = nextError?.message || '读取 @ 引用素材失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
    } finally {
      setMentionAssetsLoading(false);
    }
  }, [activeCanvasId, appendDiagnosticLog]);

  const syncPromptMentionQuery = useCallback((value: string, caret: number) => {
    const query = findMediaMentionQuery(value, caret, []);
    if (query) {
      setMentionQuery(query);
      setMentionOpen(true);
      closeFloatingPanels('mention');
      void loadMentionAssets();
      return;
    }
    setMentionQuery(null);
  }, [closeFloatingPanels, loadMentionAssets]);

  const handlePromptChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value;
    setPrompt(value);
    syncPromptMentionQuery(value, event.currentTarget.selectionStart ?? value.length);
  }, [syncPromptMentionQuery]);

  const selectMentionItem = useCallback((item: MentionAsset) => {
    setSelectedMentionAssets((prev) => {
      if (prev.some((asset) => asset.id === item.id)) return prev;
      return [...prev, item].slice(-8);
    });
    setPrompt((current) => {
      if (!mentionQuery) {
        const prefix = current.trim() ? `${current.trimEnd()}\n` : '';
        return `${prefix}${item.value}`;
      }
      return `${current.slice(0, mentionQuery.start)}${item.value} ${current.slice(mentionQuery.end)}`;
    });
    if (item.url && item.source !== 'reference') {
      setReferenceImages((prev) => {
        if (prev.some((ref) => ref.url === item.url)) return prev;
        return [...prev, {
          id: makeMessageId('ref'),
          name: item.label,
          filename: item.label,
          url: item.url || '',
        }].slice(-8);
      });
    }
    setMentionOpen(false);
    setMentionQuery(null);
  }, [mentionQuery]);

  const removeMentionAsset = useCallback((id: string) => {
    setSelectedMentionAssets((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const loadCanvasInfo = useCallback(async () => {
    if (!activeCanvasId) {
      setCanvasInfo(null);
      setError('当前没有激活画布');
      appendDiagnosticLog('读取画布信息失败：当前没有激活画布。', 'warning');
      return;
    }
    setCanvasInfoLoading(true);
    setError('');
    try {
      const data = await getCanvasData(activeCanvasId);
      const nodeTypes = Array.from(new Set(
        (data.nodes || [])
          .map((node: any) => String(node.type || node.data?.type || 'unknown'))
          .filter(Boolean),
      )).slice(0, 8);
      setCanvasInfo({
        id: activeCanvasId,
        name: activeCanvas?.name || activeCanvasId,
        nodeCount: Array.isArray(data.nodes) ? data.nodes.length : 0,
        edgeCount: Array.isArray(data.edges) ? data.edges.length : 0,
        viewport: data.viewport,
        nodeTypes,
      });
      appendDiagnosticLog(`已读取画布信息：${activeCanvas?.name || activeCanvasId}`, 'success');
    } catch (nextError: any) {
      const message = nextError?.message || '读取画布信息失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
    } finally {
      setCanvasInfoLoading(false);
    }
  }, [activeCanvas?.name, activeCanvasId, appendDiagnosticLog]);

  const toggleCanvasInfo = useCallback(() => {
    setCanvasInfoOpen((value) => {
      const next = !value;
      if (next) {
        setHistoryOpen(false);
        setMentionOpen(false);
        setPrefOpen(false);
        void loadCanvasInfo();
      }
      return next;
    });
  }, [loadCanvasInfo]);

  const handleReferenceUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []).filter((file) => file.type.startsWith('image/'));
    event.currentTarget.value = '';
    if (!files.length) return;
    setUploadingReference(true);
    setError('');
    appendDiagnosticLog(`正在上传 ${files.length} 张参考图...`, 'info');
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const result = await uploadFile(file);
        return {
          id: makeMessageId('ref'),
          name: file.name || result.filename,
          filename: result.filename,
          url: result.url,
        };
      }));
      setReferenceImages((prev) => [...prev, ...uploaded].slice(-8));
      appendDiagnosticLog(`参考图已上传：${uploaded.map((item) => item.name).join('、')}`, 'success');
      await Promise.all(uploaded.map((item, index) => publishReferenceImageToCanvas(item, index)));
      void loadMentionAssets();
    } catch (nextError: any) {
      const message = nextError?.message || '上传参考图失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
    } finally {
      setUploadingReference(false);
    }
  }, [appendDiagnosticLog, loadMentionAssets, publishReferenceImageToCanvas]);

  useEffect(() => {
    if (!open) return;
    void loadMentionAssets();
  }, [activeCanvasId, loadMentionAssets, open]);

  const sendPrompt = useCallback(async (
    text: string,
    restart = false,
    executePreview = false,
    options: { rollbackFromMessageId?: string; overrideRecordId?: string; overrideCodexThreadId?: string } = {},
  ) => {
    const value = text.trim();
    if (!value) return;
    const targetRecordId = options.overrideRecordId || activeRecordId;
    const targetCodexThreadId = options.overrideCodexThreadId || activeRecord?.codexThreadId || session?.codexThreadId;
    setError('');
    addHistoryItem(value);
    appendDiagnosticLog(`发送到 Codex：${value.slice(0, 56)}${value.length > 56 ? '...' : ''}`, 'info');
    if (running && !restart) {
      try {
        const steered = await steerGlobalCodexSession({
          prompt: value,
          recordId: targetRecordId,
          canvasId: activeCanvasId,
          codexThreadId: targetCodexThreadId,
          codexTurnId: session?.codexTurnId || session?.currentTurnId,
          workspaceDir: session?.workspaceDir,
          permissionPreset,
          sandbox: currentPermission.sandbox,
          approvalPolicy: currentPermission.approvalPolicy,
        });
        setSession(steered.session || null);
        setMessages((prev) => [
          ...prev,
          { id: makeMessageId('user'), role: 'user', text: value, status: 'success' },
        ]);
        setItemTimelineById((prev) => updateTimelineItemFromCodexEvent(prev, {
          type: 'turn.steered',
          event: 'turn.steered',
          message: steered.unsupported ? '当前 Codex SDK 不支持运行中追加，请停止后继续同一会话。' : '已追加到当前 Codex turn',
          status: steered.unsupported ? 'error' : 'success',
          turnId: steered.turnId,
        }));
        appendDiagnosticLog(steered.unsupported ? 'Codex SDK 当前不支持运行中追加，已记录这条输入。' : '已把消息追加到当前 Codex turn。', steered.unsupported ? 'warning' : 'success');
        if (!steered.unsupported) setPrompt('');
      } catch (nextError: any) {
        const message = nextError?.message || '追加到当前 Codex turn 失败';
        setError(message);
        appendDiagnosticLog(message, 'error');
      }
      return;
    }

    const userMessage: SidebarMessage = { id: makeMessageId('user'), role: 'user', text: value };
    const processId = makeMessageId('process');
    const assistantId = makeMessageId('assistant');

    let streamed = '';
    let activeController: AbortController | null = null;
    try {
      const resolvedPromptText = resolveMediaMentions(value, promptMentions, mentionMaterials);
      const payloadGenerationPreferences = buildGenerationPreferences(
        generationPreferences,
        codexModelMode,
        customCodexModel,
        reasoningEffort,
        permissionPreset,
        currentPermission,
      );
      const rollbackMessageId = options.rollbackFromMessageId || editingMessageId;
      let baseMessages: SidebarMessage[] | null = null;
      let effectiveRecord = activeRecord;
      if (rollbackMessageId) {
        const rollbackUserMessage = findUserMessageForAction(messages, rollbackMessageId);
        if (rollbackUserMessage) {
          const numTurns = countTurnsFromMessage(messages, rollbackUserMessage.id);
          baseMessages = trimMessagesFromUserMessage(messages, rollbackUserMessage.id);
          effectiveRecord = activeRecord ? { ...activeRecord, messages: baseMessages } : activeRecord;
          const threadId = activeRecord?.codexThreadId || session?.codexThreadId || '';
          if (threadId) {
            const rollback = await rollbackGlobalCodexSession({
              codexThreadId: threadId,
              recordId: activeRecordId,
              workspaceDir: session?.workspaceDir,
              numTurns,
              permissionPreset,
              sandbox: currentPermission.sandbox,
              approvalPolicy: currentPermission.approvalPolicy,
              canvasRuntimeContext: buildCanvasRuntimeContext(
                activeCanvasId,
                drivingMode,
                researchMode,
                referenceImages,
                canvasInfo,
                selectedDirection,
                selectedSkill,
                payloadGenerationPreferences,
                resolvedMentions,
                recordMemoryForPrompt(effectiveRecord),
              ),
            });
            setSession(rollback.session || null);
            syncRecordThreadIds(rollback.codexThreadId || rollback.threadId);
            appendDiagnosticLog(`已回滚 Codex 原生会话 ${numTurns} 轮，准备重新发送。`, 'success');
          } else {
            appendDiagnosticLog('当前记录没有 Codex threadId，仅回退侧栏本地消息后重试。', 'warning');
          }
        }
      }
      setEditingMessageId('');
      setProcessCollapsedById((prev) => ({ ...prev, [processId]: true }));
      setMessages((prev) => [
        ...(baseMessages || prev),
        userMessage,
        {
          id: processId,
          role: 'process',
          text: '正在理解意图并准备控制画布...',
          status: 'running',
          steps: [{
            id: makeMessageId('step'),
            kind: 'status',
            text: researchMode === 'none' ? '已收到任务，正在读取当前画布和所选技能。' : '已收到任务，将先联网调研参考和提示词方向。',
            time: Date.now(),
          }],
        },
        { id: assistantId, role: 'assistant', text: '', status: 'running' },
      ]);
      setConversationRecords((prev) => {
        const now = Date.now();
        const next = prev.map((record) => record.id === targetRecordId ? { ...record, status: 'running' as const, updatedAt: now } : record);
        saveConversationRecords(next);
        return next;
      });
      const canvasIntent = buildCanvasIntent(
        resolvedPromptText,
        activeCanvasId,
        selectedSkill,
        selectedDirection,
        resolvedMentions,
        referenceImages,
        drivingMode,
        researchMode,
      );
      const nextResearchSummary = await prepareResearchSummary(resolvedPromptText).catch((nextError) => {
        appendDiagnosticLog(nextError?.message || '调研摘要生成失败，继续任务预演。', 'warning');
        return researchSummary;
      });
      const nextTaskPreview = buildTaskPreview({
        prompt: resolvedPromptText,
        outputType: canvasIntent.outputType,
        skill: selectedSkill,
        direction: selectedDirection,
        researchSummary: nextResearchSummary,
        referenceImages,
        mentions: resolvedMentions,
        generationPreferences: payloadGenerationPreferences,
        drivingMode,
      });
      setTaskPreview(nextTaskPreview);
      setTaskPreviewExpanded(false);
      setConversationRecords((prev) => {
        const now = Date.now();
        const next = prev.map((record) => record.id === targetRecordId ? {
          ...record,
          researchSummary: nextResearchSummary || undefined,
          taskPreview: nextTaskPreview,
          updatedAt: now,
        } : record);
        saveConversationRecords(next);
        return next;
      });
      appendProcessStep(
        processId,
        'status',
        executePreview
          ? '正在按任务预演交给 Codex 执行。'
          : '任务预演已作为上下文发送给 Codex；是否需要关键 Ask 或直接执行由 Codex 判断。',
      );
      setPrompt('');
      setPromptMentions([]);
      const runtimeContext = buildCanvasRuntimeContext(
        activeCanvasId,
        drivingMode,
        researchMode,
        referenceImages,
        canvasInfo,
        selectedDirection,
        selectedSkill,
        payloadGenerationPreferences,
        resolvedMentions,
        recordMemoryForPrompt(effectiveRecord),
      );
      let nativeContextInjected = false;
      if (targetCodexThreadId) {
        await injectGlobalCodexContext({
          prompt: resolvedPromptText,
          canvasRuntimeContext: runtimeContext,
          recordId: targetRecordId,
          canvasId: activeCanvasId,
          codexThreadId: targetCodexThreadId,
          workspaceDir: session?.workspaceDir,
          permissionPreset,
          sandbox: currentPermission.sandbox,
          approvalPolicy: currentPermission.approvalPolicy,
          injectContext: true,
        }).then((result) => {
          if (result.unsupported) {
            appendDiagnosticLog('当前 Codex SDK 不支持预注入上下文，继续用本轮上下文。', 'warning');
          } else if (result.injected) {
            nativeContextInjected = Boolean(result.injected);
            appendProcessStep(processId, 'status', '画布上下文已预注入 Codex 原生 thread。');
          }
        }).catch((nextError) => {
          appendDiagnosticLog(nextError?.message || '原生上下文预注入失败，继续用本轮上下文。', 'warning');
        });
      }
      const beforeCanvasData = activeCanvasId ? await getCanvasData(activeCanvasId).catch(() => null) : null;
      const controller = new AbortController();
      activeController = controller;
      abortRef.current = controller;
      const canvasPlanPreference = buildCanvasPlanPreference(selectedSkill, selectedDirection);
      const result = await streamGlobalCodexSessionMessage({
        prompt: resolvedPromptText,
        canvasRuntimeContext: nativeContextInjected ? '' : runtimeContext,
        command: 'global-codex-sidebar',
        mode: drivingMode === 'autopilot' ? 'canvas-autopilot' : 'canvas-copilot',
        drivingMode,
        canvasId: activeCanvasId,
        images: referenceImages.map((item) => item.url),
        referenceTexts: nativeContextInjected ? [] : [
          canvasInfoToPrompt(canvasInfo),
          `用户原始输入：${value}`,
          nextResearchSummary ? `调研摘要：${researchSummaryText(nextResearchSummary)}` : '',
          recordMemoryForPrompt(effectiveRecord),
          `记录回放：${JSON.stringify(recordReplayPayload(effectiveRecord))}`,
        ].filter(Boolean),
        permissionPreset,
        sandbox: currentPermission.sandbox,
        approvalPolicy: currentPermission.approvalPolicy,
        model: codexModelValue(codexModelMode, customCodexModel),
        reasoningEffort,
        selectedSkillNames: Array.from(new Set([
          ...internalCanvasSkillNames,
          ...(selectedSkill?.name ? [selectedSkill.name] : []),
        ])),
        selectedSkillName: selectedSkill?.name,
        selectedDirectionId: selectedDirection?.id,
        selectedSkillDirection: selectedDirection,
        canvasIntent,
        canvasPlanPreference,
        generationPreferences: payloadGenerationPreferences,
        mentions: resolvedMentions,
        researchSummary: nextResearchSummary,
        taskPreview: nextTaskPreview,
        recordReplay: nativeContextInjected ? undefined : recordReplayPayload(effectiveRecord),
        recordId: targetRecordId,
        codexThreadId: targetCodexThreadId,
        injectContext: nativeContextInjected ? false : true,
        researchMode,
        webSearch: researchMode !== 'none',
        includePlanTool: true,
        imageGeneration: false,
        generateImage: false,
        restart,
      }, {
        signal: controller.signal,
        onDelta(delta) {
          streamed += delta;
          setMessages((prev) => prev.map((item) => (
            item.id === assistantId ? { ...item, text: streamed, status: 'running' } : item
          )));
        },
        onEvent(event: CodexStreamEvent) {
          if (event.session) {
            setSession(event.session);
            syncRecordWithCodexSession(event.session);
          }
          setItemTimelineById((prev) => updateTimelineItemFromCodexEvent(prev, event));
          const eventMessage = String(event.message || '').trim();
          if (event.type === 'reasoning.delta' || event.event === 'reasoning.delta') {
            const text = String(event.delta || event.text || '').trim();
            if (!text) return;
            appendProcessStep(processId, 'reasoning', text);
          }
          if (event.type === 'tool.call' || event.event === 'tool.call') {
            const msg = eventMessage || String(event.toolName ? `调用工具：${event.toolName}` : '').trim();
            if (!msg) return;
            appendDiagnosticLog(msg, 'info');
            appendProcessStep(processId, 'tool', msg);
          }
          if (event.type === 'turn.started' || event.event === 'turn.started') {
            appendDiagnosticLog(eventMessage || 'Codex 全局侧边栏任务已开始', 'info');
            appendProcessStep(processId, 'status', eventMessage || 'Codex 全局侧边栏任务已开始');
          }
          if (event.type === 'plan.updated' || event.event === 'plan.updated') {
            const planText = eventMessage || String(event.explanation || event.title || 'Codex 已更新执行计划');
            appendProcessStep(processId, 'status', planText);
          }
          if (event.type === 'session.updated' || event.event === 'session.updated') {
            appendDiagnosticLog(eventMessage || 'Codex SDK 状态已更新', 'success');
            appendProcessStep(processId, 'status', eventMessage || 'Codex SDK 状态已更新');
          }
          if (event.type === 'serverRequest.resolved' || event.event === 'serverRequest.resolved') {
            const requestId = String(event.requestId || '').trim();
            if (!requestId || requestId === askRequestId) {
              setAskOptions([]);
              setAskPrompt('');
              setAskRequestId('');
            }
            if (!requestId || approvalOptions.some((option) => option.requestId === requestId)) {
              setApprovalOptions([]);
              setApprovalPrompt('');
            }
            appendProcessStep(processId, 'status', 'Codex 已处理本次提问请求。');
          }
          if (event.type === 'turn.failed' || event.event === 'turn.failed') {
            appendDiagnosticLog(eventMessage || event.error || 'Codex 任务失败', 'error');
            appendProcessStep(processId, 'error', eventMessage || event.error || 'Codex 任务失败');
          }
          if (event.type === 'tool.progress' || event.event === 'tool.progress') {
            const msg = eventMessage;
            if (!msg) return;
            appendDiagnosticLog(msg, 'info');
            appendProcessStep(processId, 'tool', msg);
          }
          if (isCodexUserInputRequest(event)) {
            const askText = askTextFromEvent(event);
            if (!shouldShowAskEvent(event, activeRecord) || answeredAskMemoryRef.current.has(askText)) {
              if (askText) answeredAskMemoryRef.current.add(askText);
              appendProcessStep(processId, 'status', '已跳过非关键或重复提问，继续按当前记录执行。');
              const requestId = String(event.requestId || event.actionId || '').trim();
              if (requestId) {
                void answerGlobalCodexSessionRequest({
                  requestId,
                  answer: NONCRITICAL_ASK_AUTO_ANSWER,
                  answers: [NONCRITICAL_ASK_AUTO_ANSWER],
                }).catch(() => undefined);
              }
              return;
            }
            const options = extractCodexAskOptions(event);
            if (options.length) setAskOptions(options);
            setAskRequestId(String(event.requestId || event.actionId || '').trim());
            setAskPrompt(codexAskPromptFromEvent(event));
            appendProcessStep(processId, 'status', eventMessage || 'Codex 正在等待你的选择');
          } else if (event.type === 'approval.requested' || event.event === 'approval.requested') {
            if (isHakimiMcpApprovalEvent(event)) {
              setApprovalOptions([]);
              setApprovalPrompt('');
              appendDiagnosticLog('画布 MCP 权限已默认放行。', 'success');
              appendProcessStep(processId, 'status', '画布 MCP 权限已默认放行。');
              void autoAcceptHakimiMcpApproval(event).catch((nextError) => {
                appendDiagnosticLog(nextError?.message || '画布 MCP 自动放行回写失败，已继续隐藏常规审批。', 'warning');
              });
              return;
            }
            const options = nativeApprovalOptions(event);
            if (options.length) {
              setApprovalOptions(options);
              setApprovalPrompt(eventMessage || 'Codex 原生审批');
            }
            appendDiagnosticLog(eventMessage || 'Codex 原生审批', 'info');
          }
        },
      });
      const finalText = result.reply || result.text || streamed || 'Codex 已完成任务。';
      syncRecordWithCodexResult(result);
      appendDiagnosticLog('Codex 任务完成。', 'success');
      await publishResultReviewToCanvas({
        beforeCanvasData,
        prompt: resolvedPromptText,
        reply: finalText,
      }).catch((nextError) => {
        appendDiagnosticLog(nextError?.message || '结果评审节点创建失败。', 'warning');
      });
      void loadCanvasInfo().then(() => {
        appendProcessStep(processId, 'status', '已回读当前画布，用于验证节点、连线和结果 URL。');
      }).catch(() => undefined);
      setMessages((prev) => prev.map((item) => (
        item.id === assistantId || item.status === 'running'
          ? { ...item, text: item.id === assistantId ? finalText : item.text, status: 'success' }
          : item
      )));
      setConversationRecords((prev) => {
        const now = Date.now();
        const next = prev.map((record) => record.id === targetRecordId ? { ...record, status: 'success' as const, updatedAt: now } : record);
        saveConversationRecords(next);
        return next;
      });
      setProcessCollapsedById((prev) => ({ ...prev, [processId]: true }));
      void getGlobalCodexSession().then(setSession).catch(() => undefined);
    } catch (nextError: any) {
      const message = nextError?.message || 'Codex 任务失败';
      setError(message);
      appendDiagnosticLog(message, 'error');
      setMessages((prev) => prev.map((item) => (
        item.id === assistantId || item.id === processId
          ? { ...item, text: item.id === assistantId ? (streamed || message) : message, status: 'error' }
          : item
      )));
      setConversationRecords((prev) => {
        const now = Date.now();
        const next = prev.map((record) => record.id === targetRecordId ? { ...record, status: 'error' as const, updatedAt: now } : record);
        saveConversationRecords(next);
        return next;
      });
      void getGlobalCodexSession().then(setSession).catch(() => undefined);
    } finally {
      if (activeController && abortRef.current === activeController) abortRef.current = null;
    }
  }, [activeCanvasId, activeRecord, activeRecordId, addHistoryItem, appendDiagnosticLog, appendProcessStep, approvalOptions, askRequestId, canvasInfo, codexModelMode, customCodexModel, currentPermission, drivingMode, editingMessageId, generationPreferences, internalCanvasSkillNames, loadCanvasInfo, mentionMaterials, messages, permissionPreset, prepareResearchSummary, promptMentions, publishResultReviewToCanvas, reasoningEffort, referenceImages, researchMode, researchSummary, resolvedMentions, running, selectedDirection, selectedSkill, session?.codexThreadId, session?.codexTurnId, session?.currentTurnId, session?.workspaceDir, syncRecordThreadIds, syncRecordWithCodexResult, syncRecordWithCodexSession]);

  const chooseSkill = useCallback((skill: CodexSkill) => {
    setSelectedSkillId(skill.id);
    setSelectedDirectionId('');
    setSkillLibraryOpen(false);
  }, []);

  const renderSkillFileTree = useCallback((files: CodexSkillFileEntry[], depth = 0): ReactNode[] => (
    files.map((file) => (
      <div key={file.path} className="codex-agent-sidebar__skill-file-branch" style={{ '--skill-file-depth': depth } as CSSProperties}>
        {file.type === 'dir' ? (
          <>
            <span className="codex-agent-sidebar__skill-file-dir">{file.name}</span>
            {renderSkillFileTree(file.children || [], depth + 1)}
          </>
        ) : (
          <button
            type="button"
            data-active={selectedSkillFilePath === file.path}
            onClick={() => void openSkillFile(file.path)}
            title={file.path}
          >
            {file.name}
          </button>
        )}
      </div>
    ))
  ), [openSkillFile, selectedSkillFilePath]);

  const answerAskOption = useCallback(async (option: AskOption) => {
    if (!option.requestId) {
      insertPromptText(`选择：${option.value}`);
      setAskOptions([]);
      setAskPrompt('');
      setAskRequestId('');
      return;
    }
    try {
      await answerGlobalCodexSessionRequest({
        requestId: option.requestId,
        questionId: option.questionId,
        answer: option.value,
        answers: [option.value],
      });
      const askKey = normalizeAskText(askPrompt || option.value);
      if (askKey) answeredAskMemoryRef.current.add(askKey);
      setMessages((prev) => [
        ...prev,
        { id: makeMessageId('user'), role: 'user', text: option.value, status: 'success' },
      ]);
      appendDiagnosticLog(`已选择：${option.label}`, 'success');
      setConversationRecords((prev) => {
        const now = Date.now();
        const next = prev.map((record) => record.id === activeRecordId ? {
          ...record,
          askAnswers: [
            ...(record.askAnswers || []),
            { requestId: option.requestId, question: askPrompt, answer: option.value, answeredAt: now },
          ],
          updatedAt: now,
        } : record);
        saveConversationRecords(next);
        return next;
      });
      setAskOptions([]);
      setAskPrompt('');
      setAskRequestId('');
    } catch (nextError: any) {
      const message = nextError?.message || '提交选择失败';
      handleAskExpired(message);
    }
  }, [activeRecordId, appendDiagnosticLog, askPrompt, handleAskExpired, insertPromptText]);

  const answerAskText = useCallback(async (text: string) => {
    const answer = text.trim();
    if (!askRequestId || !answer) return;
    try {
      await answerGlobalCodexSessionRequest({
        requestId: askRequestId,
        answer,
        answers: [answer],
      });
      const askKey = normalizeAskText(askPrompt || answer);
      if (askKey) answeredAskMemoryRef.current.add(askKey);
      setMessages((prev) => [
        ...prev,
        { id: makeMessageId('user'), role: 'user', text: answer, status: 'success' },
      ]);
      appendDiagnosticLog('已回复 Codex 的关键问题。', 'success');
      setConversationRecords((prev) => {
        const now = Date.now();
        const next = prev.map((record) => record.id === activeRecordId ? {
          ...record,
          askAnswers: [
            ...(record.askAnswers || []),
            { requestId: askRequestId, question: askPrompt, answer, answeredAt: now },
          ],
          updatedAt: now,
        } : record);
        saveConversationRecords(next);
        return next;
      });
      setPrompt('');
      setPromptMentions([]);
      setAskOptions([]);
      setAskPrompt('');
      setAskRequestId('');
    } catch (nextError: any) {
      const message = nextError?.message || '提交回复失败';
      handleAskExpired(message);
    }
  }, [activeRecordId, appendDiagnosticLog, askPrompt, askRequestId, handleAskExpired]);

  const answerNativeApprovalOption = useCallback(async (option: AskOption) => {
    if (!option.requestId || !option.decision) return;
    try {
      await answerGlobalCodexSessionRequest({
        requestId: option.requestId,
        decision: option.decision,
        answer: option.decision,
      });
      setApprovalOptions([]);
      setApprovalPrompt('');
      appendDiagnosticLog(`Codex 原生审批：${option.label}`, option.decision === 'decline' || option.decision === 'cancel' ? 'warning' : 'success');
    } catch (nextError: any) {
      setApprovalOptions([]);
      setApprovalPrompt('');
      appendDiagnosticLog(nextError?.message || '提交 Codex 原生审批失败', 'error');
    }
  }, [appendDiagnosticLog]);

  const copySidebarMessage = useCallback(async (item: SidebarMessage) => {
    const text = item.text.trim();
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      appendDiagnosticLog('已复制消息内容。', 'success');
    } catch {
      appendDiagnosticLog('复制失败：当前浏览器没有开放剪贴板权限。', 'warning');
    }
  }, [appendDiagnosticLog]);

  const editSidebarMessage = useCallback((item: SidebarMessage) => {
    const userMessage = findUserMessageForAction(messages, item.id);
    if (!userMessage) return;
    setEditingMessageId(userMessage.id);
    setPrompt(userMessage.text);
    setPromptMentions([]);
    closeFloatingPanels();
    appendDiagnosticLog('已进入编辑重试模式，发送后会回滚对应 Codex 原生会话轮次。', 'info');
  }, [appendDiagnosticLog, closeFloatingPanels, messages]);

  const retrySidebarMessage = useCallback((item: SidebarMessage) => {
    const userMessage = findUserMessageForAction(messages, item.id);
    if (!userMessage) return;
    void sendPrompt(userMessage.text, false, false, { rollbackFromMessageId: userMessage.id });
  }, [messages, sendPrompt]);

  const continueFromSidebarMessage = useCallback((item: SidebarMessage) => {
    const text = item.text.trim();
    if (!text) return;
    setEditingMessageId('');
    setPrompt((current) => {
      const prefix = current.trim() ? `${current.trimEnd()}\n` : '';
      return `${prefix}基于这条继续：${compactText(text, 360)}`;
    });
    setPromptMentions([]);
    closeFloatingPanels();
  }, [closeFloatingPanels]);

  const deleteSidebarMessage = useCallback((item: SidebarMessage) => {
    setMessages((prev) => prev.filter((message) => message.id !== item.id));
    if (editingMessageId === item.id) setEditingMessageId('');
    appendDiagnosticLog('已从侧栏记录中删除这条消息；Codex 原生 thread 不会因此改变。', 'info');
  }, [appendDiagnosticLog, editingMessageId]);

  const skillLibraryModal = skillLibraryOpen ? (
    <div
      className="codex-agent-sidebar__skill-modal-backdrop codex-agent-sidebar__skill-library-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="项目 Skill 库"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSkillLibraryOpen(false);
      }}
    >
      <div
        className="codex-agent-sidebar__quick-panel codex-agent-sidebar__skill-library codex-agent-sidebar__skill-modal"
        data-import-dragging={skillImportDragging ? 'true' : 'false'}
        onDragOver={handleSkillImportDragOver}
        onDragLeave={handleSkillImportDragLeave}
        onDrop={handleSkillImportDrop}
      >
        <div className="codex-agent-sidebar__skill-modal-head">
          <div className="codex-agent-sidebar__skill-title">
            <strong>项目 Skill 库</strong>
            <small>只显示当前工作区业务 skill；画布控制 skill 已默认给 Codex 使用</small>
          </div>
          <div className="codex-agent-sidebar__skill-head-actions">
            <button type="button" onClick={() => void refreshProjectSkills(selectedSkill?.name)} title="刷新 Skill"><RefreshCw size={13} /></button>
            <button type="button" onClick={() => setSkillLibraryOpen(false)} title="关闭"><X size={13} /></button>
          </div>
        </div>

        <div className="codex-agent-sidebar__skill-library-toolbar">
          <input
            className="t8-input"
            value={skillLibraryQuery}
            onChange={(event) => setSkillLibraryQuery(event.target.value)}
            placeholder="搜索 skill、方向、用途..."
          />
          <input
            ref={skillImportInputRef}
            type="file"
            accept=".zip,.md,.txt,.json,application/zip,application/x-zip-compressed,text/markdown,text/plain,application/json"
            className="codex-agent-sidebar__file-input"
            onChange={handleSkillImport}
          />
          <button type="button" onClick={() => skillImportInputRef.current?.click()} disabled={skillFileLoading}>
            导入 Skill
          </button>
        </div>
        <button
          type="button"
          className="codex-agent-sidebar__skill-import-dropzone"
          data-tone={skillImportStatus.tone}
          onClick={() => skillImportInputRef.current?.click()}
          disabled={skillFileLoading}
        >
          <UploadCloud size={15} />
          <span>{skillImportStatus.text}</span>
        </button>

        <div className="codex-agent-sidebar__skill-library-categories" aria-label="Skill 分类">
          {skillLibraryCategories.map((category) => (
            <button
              key={category}
              type="button"
              data-active={skillLibraryCategoryFilter === category}
              onClick={() => setSkillLibraryCategoryFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="codex-agent-sidebar__skill-library-body">
          {skillsLoading ? (
            <div className="codex-agent-sidebar__empty-popover">正在读取项目 skills...</div>
          ) : filteredSkillLibrarySkills.length ? (
            <div className="codex-agent-sidebar__skill-library-grid">
              {filteredSkillLibrarySkills.map((skill) => {
                const active = selectedSkill?.id === skill.id;
                const directions = parseSelectedSkillDirections(skill).slice(0, 4);
                return (
                  <article key={skill.id} className="codex-agent-sidebar__skill-card" data-active={active ? 'true' : 'false'}>
                    <button
                      type="button"
                      className="codex-agent-sidebar__skill-card-select"
                      onClick={() => chooseSkill(skill)}
                      title={`${displaySkillLabel(skill)}\n${skill.name}\n${skill.description || ''}`}
                    >
                      <div className="codex-agent-sidebar__skill-card-head">
                        <span className="codex-agent-sidebar__skill-card-icon"><Sparkles size={16} /></span>
                        <div>
                          <strong>{displaySkillLabel(skill)}</strong>
                          <small>{skillLibraryCategory(skill)} · {skill.name}</small>
                        </div>
                      </div>
                      <p>{displaySkillHint(skill)}</p>
                      <div className="codex-agent-sidebar__skill-card-directions">
                        {directions.length
                          ? directions.map((direction) => <span key={direction.id}>{direction.label}</span>)
                          : <span data-empty="true">未定义方向</span>}
                      </div>
                    </button>
                    <div className="codex-agent-sidebar__skill-card-meta">
                      {active ? <span data-active="true">当前</span> : null}
                      <span>{(skill.questions || []).length} 问题</span>
                      <span>{(skill.templates || []).length} 模板</span>
                      <span>{(skill.verification || []).length} 验证</span>
                    </div>
                    <div className="codex-agent-sidebar__skill-card-actions">
                      <button
                        type="button"
                        onClick={() => {
                          chooseSkill(skill);
                          setSkillEditMode('readonly');
                          setSkillDetailOpen(true);
                        }}
                      >
                        查看
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          chooseSkill(skill);
                          setSkillEditMode('edit');
                          setSkillDetailOpen(true);
                        }}
                      >
                        编辑
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="codex-agent-sidebar__empty-popover">没有匹配的业务 skill，可以清空搜索或导入新的 SKILL.md。</div>
          )}
        </div>

        <div className="codex-agent-sidebar__skill-library-foot">
          <span>共 {businessSkills.length} 个业务 skill，当前显示 {filteredSkillLibrarySkills.length} 个。</span>
          <span>内部画布控制 skill 不展示给用户，但会随 Codex 运行默认加载。</span>
        </div>
      </div>
    </div>
  ) : null;

  const skillDetailModal = skillDetailOpen && selectedSkill ? (
      <div
        className="codex-agent-sidebar__skill-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Skill 文件管理"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSkillDetailOpen(false);
        }}
      >
      <div className="codex-agent-sidebar__quick-panel codex-agent-sidebar__skill-detail codex-agent-sidebar__skill-modal">
        <div className="codex-agent-sidebar__skill-modal-head">
          <div className="codex-agent-sidebar__skill-title">
            <strong>{displaySkillLabel(selectedSkill)}</strong>
            <small>{selectedSkill.name} · 仅作用于当前项目目录</small>
          </div>
          <div className="codex-agent-sidebar__skill-head-actions">
            <span className="codex-agent-sidebar__skill-mode" aria-label="Skill 查看模式">
              <button type="button" data-active={skillEditMode === 'readonly'} onClick={() => setSkillEditMode('readonly')}>只读</button>
              <button type="button" data-active={skillEditMode === 'edit'} onClick={() => setSkillEditMode('edit')}>编辑</button>
            </span>
            <button type="button" onClick={() => setSkillDetailOpen(false)} title="关闭"><X size={13} /></button>
          </div>
        </div>
        <div className="codex-agent-sidebar__skill-actions" aria-label="Skill 工具">
          <input
            ref={skillImportInputRef}
            type="file"
            accept=".zip,.md,.txt,.json,application/zip,application/x-zip-compressed,text/markdown,text/plain,application/json"
            className="codex-agent-sidebar__file-input"
            onChange={handleSkillImport}
          />
          <button
            type="button"
            onClick={() => skillImportInputRef.current?.click()}
            disabled={skillFileLoading}
            aria-label="导入 Skill"
            title="导入 zip、md、txt 或 json 到当前项目 .agents/skills"
          >
            <strong>导入</strong>
            <small>zip / md / json</small>
          </button>
          <button
            type="button"
            onClick={() => void adaptSelectedSkillForSidebar()}
            disabled={skillFileLoading}
            aria-label="适配侧栏"
            title="补齐 Sidebar Directions / Questions / Canvas Templates / Verification"
          >
            <strong>适配</strong>
            <small>补侧栏 section</small>
          </button>
          <button
            type="button"
            onClick={() => void validateSelectedSkill()}
            disabled={skillFileLoading}
            aria-label="校验 Skill"
            title="检查 frontmatter、SKILL.md 和侧栏 section 是否能被解析"
          >
            <strong>校验</strong>
            <small>检查解析结果</small>
          </button>
          <span className="codex-agent-sidebar__skill-action-note">
            {skillFileLoading
              ? '正在处理 Skill 文件...'
              : skillSaveStatus !== 'idle'
                ? skillSaveStatusLabel(skillSaveStatus)
                : skillFileDirty
                  ? '有未保存修改'
                : skillValidation
                  ? (skillValidation.ok ? '最近校验：通过' : `最近校验：缺 ${skillValidation.missingSections.length} 项`)
                  : '导入后会刷新文件树并读取原文'}
          </span>
        </div>
        <div className="codex-agent-sidebar__skill-modal-body">
          <div className="codex-agent-sidebar__skill-modal-grid codex-agent-sidebar__skill-files">
            <aside>
              <strong>项目 Skill 文件</strong>
              <small>SKILL.md / references / scripts</small>
              <div>
                {skillFileTree.length
                  ? renderSkillFileTree(skillFileTree)
                  : skillFileLoading ? <span>读取中...</span> : (selectedSkillFileContent || selectedSkill.body)
                    ? <span className="codex-agent-sidebar__skill-single-file">单文件：正在编辑 SKILL.md</span>
                    : <span>暂无可读取的项目 Skill 文件</span>}
              </div>
            </aside>
            <main className="codex-agent-sidebar__skill-editor">
              <div className="codex-agent-sidebar__skill-editor-head">
                <span>{selectedSkillFilePath || 'SKILL.md'}</span>
                {skillFileLoading && <small>读取中</small>}
                <small className="codex-agent-sidebar__skill-save-state" data-status={skillSaveStatus}>
                  {skillFileDirty ? '未保存' : skillSaveStatusLabel(skillSaveStatus)}
                </small>
                {skillEditMode === 'edit' && (
                  <button type="button" disabled={!skillFileDirty || skillFileLoading} onClick={() => void saveSkillFile()}>
                    保存
                  </button>
                )}
              </div>
              <div className="codex-agent-sidebar__skill-editor-body">
                {skillEditMode === 'edit' ? (
                  <textarea
                    className="t8-textarea codex-agent-sidebar__skill-textarea"
                    value={selectedSkillFileContent || selectedSkill.body || ''}
                    onChange={(event) => {
                      setSelectedSkillFileContent(event.target.value);
                      setSkillFileDirty(true);
                      setSkillSaveStatus('dirty');
                    }}
                    placeholder="这个 Skill 暂无可编辑内容。"
                  />
                ) : (
                  <pre className="codex-agent-sidebar__skill-preview">{selectedSkillFileContent || selectedSkill.body || '这个 Skill 暂无可预览内容。'}</pre>
                )}
              </div>
            </main>
          </div>
          <details className="codex-agent-sidebar__skill-analysis">
            <summary>当前解析</summary>
            <div className="codex-agent-sidebar__skill-tabs">
              {([
                ['files', '文件'],
                ['parsed', '解析'],
                ['validation', '校验'],
              ] as Array<[SkillAnalysisView, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  data-active={skillAnalysisView === id}
                  onClick={() => setSkillAnalysisView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <section data-view={skillAnalysisView}>
              {skillAnalysisView === 'files' && (
                <p><b>当前文件</b><span>{selectedSkillFilePath || 'SKILL.md'} · {skillFileTree.length ? `${skillFileTree.length} 个顶层条目` : '单文件 Skill'}</span></p>
              )}
              {skillAnalysisView === 'parsed' && (
                <>
                  {(selectedSkill.directions || []).map((item) => (
                    <p key={item.id}><b>{item.label}</b><span>{item.hint || '按 skill 规则规划流程。'}</span></p>
                  ))}
                  {(selectedSkill.questions || []).length ? <p><b>可问问题</b><span>{selectedSkill.questions?.map((item) => item.label).join(' / ')}</span></p> : null}
                  {(selectedSkill.templates || []).length ? <p><b>画布模板</b><span>{selectedSkill.templates?.map((item) => item.label).join(' / ')}</span></p> : null}
                  {(selectedSkill.verification || []).length ? <p><b>验证项</b><span>{selectedSkill.verification?.map((item) => item.label).join(' / ')}</span></p> : null}
                </>
              )}
              {skillAnalysisView === 'validation' && (
                <p>
                  <b>Skill 校验器</b>
                  <span>
                    {skillValidation
                      ? (skillValidation.ok ? '通过' : `缺失：${skillValidation.missingSections.join(' / ') || '无'}；提醒：${skillValidation.parseWarnings.join(' / ') || '无'}`)
                      : '尚未校验，点击上方“校验”检查 section 与解析结果。'}
                  </span>
                </p>
              )}
            </section>
          </details>
        </div>
      </div>
      </div>
  ) : null;

  if (!open) return null;

  return (
    <aside
      className="codex-agent-sidebar t8-panel"
      data-codex-agent-sidebar="true"
      style={{
        background: 'var(--t8-bg-panel)',
        borderColor: 'var(--t8-border)',
        width: `min(${sidebarWidth}px, 42vw, calc(100vw - 320px))`,
      }}
    >
      <span
        className="codex-agent-sidebar__resize-handle"
        role="separator"
        aria-orientation="vertical"
        title="拖动调整侧栏宽度"
        onPointerDown={startSidebarResize}
      />
      <header className="codex-agent-sidebar__header">
        <div className="codex-agent-sidebar__identity">
          <span className="codex-agent-sidebar__avatar" aria-hidden="true">
            <span className="codex-agent-sidebar__mascot-hair" />
            <span className="codex-agent-sidebar__mascot-face" />
          </span>
          <div className="min-w-0">
            <div className="codex-agent-sidebar__name">Codex 画布 Agent</div>
            <div className="codex-agent-sidebar__session">
              Codex 记录 · {activeRecord?.title || '新记录'}
              <span
                className="codex-agent-sidebar__connection"
                data-tone={connectionTone(session, error)}
              >
                Codex SDK 执行器 · {sessionLabel(session)}
              </span>
            </div>
          </div>
        </div>
        <div className="codex-agent-sidebar__header-actions">
          <button
            type="button"
            className="codex-agent-sidebar__icon-btn"
            title="历史会话"
            onClick={() => {
              setHistoryOpen((value) => {
                const next = !value;
                if (next) closeFloatingPanels('history');
                return next;
              });
            }}
          >
            <Clock3 size={15} />
          </button>
          <button type="button" className="codex-agent-sidebar__icon-btn" title="刷新 Codex SDK 状态" onClick={openSession}>
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className="codex-agent-sidebar__icon-btn codex-agent-sidebar__stop-btn"
            title={running ? '停止当前 Codex SDK 任务' : '当前没有运行中的 Codex SDK 任务'}
            onClick={stopSession}
            disabled={!running}
          >
            <Square size={15} />
          </button>
          <button type="button" className="codex-agent-sidebar__icon-btn" onClick={onClose} title="关闭 Codex 侧边栏">
            <X size={16} />
          </button>
        </div>
      </header>

      <section className="codex-agent-sidebar__diagnostics" data-open={diagnosticsOpen ? 'true' : 'false'}>
        <button
          type="button"
          className="codex-agent-sidebar__diagnostics-strip"
          onClick={() => setDiagnosticsOpen((value) => !value)}
        >
          <span className="codex-agent-sidebar__diagnostics-dot" data-tone={connectionTone(session, error)} />
          <span className="codex-agent-sidebar__diagnostics-main">
            <strong>运行动态 · {sessionLabel(session)}</strong>
            <small>Codex SDK · {sessionShortId(session)} · {sessionDetail(session)}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        {diagnosticsOpen && (
          <div className="codex-agent-sidebar__diagnostics-log">
            {diagnosticLogs.map((item) => (
              <div key={item.id} data-tone={item.tone || 'info'}>
                <time>{formatHistoryTime(item.time)}</time>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <main className="codex-agent-sidebar__main">
        {timelineItems.length > 0 && (
          <section className="codex-agent-sidebar__timeline" aria-label="Codex 原生事件时间线">
            {timelineItems.map((item) => (
              <span key={item.id} data-status={item.status || 'running'} title={[item.rawType, item.message].filter(Boolean).join('\n')}>
                <b>{item.title}</b>
                {item.message ? <small>{item.message}</small> : null}
              </span>
            ))}
          </section>
        )}
        {nativeTurnHistoryUnavailable && nativeThreadHydrated && messages.length === 0 && (
          <div className="codex-agent-sidebar__empty-popover">原生历史不可用，当前显示侧栏本地记录。</div>
        )}
        {messages.length === 0 ? (
          <>
            <section className="codex-agent-sidebar__hero">
              <span className="codex-agent-sidebar__hero-avatar" aria-hidden="true">
                <span className="codex-agent-sidebar__mascot-hair" />
                <span className="codex-agent-sidebar__mascot-face" />
              </span>
              <div>
                <div className="codex-agent-sidebar__hello">Hi keroro!</div>
                <h2>今天一起创作点什么？</h2>
              </div>
            </section>

            <section className="codex-agent-sidebar__skill-directions" aria-label="项目技能方向">
              <div className="codex-agent-sidebar__section-head">
                <span className="codex-agent-sidebar__section-label">项目 Skills</span>
                <button
                  type="button"
                  onClick={() => {
                    setSkillLibraryOpen(true);
                    closeFloatingPanels('skillLibrary');
                  }}
                >
                  Skill 库
                </button>
              </div>
              {skillsLoading && <div className="codex-agent-sidebar__empty-popover">正在读取 Codex skills...</div>}
              {!skillsLoading && businessSkills.length === 0 && (
                <div className="codex-agent-sidebar__empty-popover">当前项目没有可选择的业务 skills</div>
              )}
              {selectedSkill && (
                <button
                  type="button"
                  className="codex-agent-sidebar__skill-row"
                  data-active="true"
                  onClick={() => {
                    setSkillLibraryOpen(true);
                    closeFloatingPanels('skillLibrary');
                  }}
                  title={`${selectedSkill.name}\n${selectedSkill.description || ''}\n${selectedSkill.path || ''}`}
                >
                  <span className="codex-agent-sidebar__skill-icon"><Sparkles size={17} /></span>
                  <span className="codex-agent-sidebar__skill-copy">
                    <strong>{displaySkillLabel(selectedSkill)}</strong>
                    <small>{displaySkillHint(selectedSkill)}</small>
                  </span>
                </button>
              )}
              <div className="codex-agent-sidebar__skill-mini-grid" aria-label="快捷选择">
                {businessSkills.filter((skill) => skill.id !== selectedSkill?.id).slice(0, 3).map((skill) => (
                  <button key={skill.id} type="button" onClick={() => chooseSkill(skill)} title={displaySkillHint(skill)}>
                    {displaySkillLabel(skill)}
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="codex-agent-sidebar__messages">
            {messages.map((item) => {
              const collapsed = item.role === 'process' && processCollapsedById[item.id] === true;
              const steps = item.steps || [];
              return (
                <article
                  key={item.id}
                  data-role={item.role === 'process' ? 'process' : item.role}
                  data-status={item.status || ''}
                  data-collapsed={item.role === 'process' && collapsed ? 'true' : undefined}
                >
                  <div className="codex-agent-sidebar__message-meta">
                    <span className="codex-agent-sidebar__message-icon">
                      {item.role === 'process' ? <Terminal size={11} /> : item.role === 'assistant' ? <Sparkles size={11} /> : <MessageSquare size={11} />}
                    </span>
                    {item.role === 'process' ? (
                      <button
                        type="button"
                        className="codex-agent-sidebar__process-toggle"
                        data-running={item.status === 'running' ? 'true' : 'false'}
                        data-collapsed={collapsed ? 'true' : 'false'}
                        aria-expanded={!collapsed}
                        onClick={() => setProcessCollapsedById((prev) => ({ ...prev, [item.id]: !collapsed }))}
                      >
                        <strong>{messageRoleLabel(item.role)}</strong>
                        <small>{collapsed ? '点击展开' : '点击收起'} · {messageStatusLabel(item.status)} · {steps.length} 步</small>
                        <ChevronDown size={13} />
                      </button>
                    ) : (
                      <>
                        <strong>{messageRoleLabel(item.role)}</strong>
                        {messageStatusLabel(item.status) ? <small>{messageStatusLabel(item.status)}</small> : null}
                        <span className="codex-agent-sidebar__message-actions" aria-label="消息操作">
                          <span className="codex-agent-sidebar__message-actions-trigger" aria-hidden="true">
                            <MoreHorizontal size={13} />
                          </span>
                          <button type="button" title="复制" onClick={() => void copySidebarMessage(item)}>
                            <Copy size={12} />
                          </button>
                          <button type="button" title="编辑重试" onClick={() => editSidebarMessage(item)} disabled={running}>
                            <Pencil size={12} />
                          </button>
                          <button type="button" title="重试" onClick={() => retrySidebarMessage(item)} disabled={running}>
                            <RotateCcw size={12} />
                          </button>
                          <button type="button" title="继续对话" onClick={() => continueFromSidebarMessage(item)}>
                            <Reply size={12} />
                          </button>
                          <button type="button" title="删除" onClick={() => deleteSidebarMessage(item)}>
                            <Trash2 size={12} />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                  {item.role === 'process' ? (
                    <div className="codex-agent-sidebar__process-steps" data-collapsed={collapsed ? 'true' : 'false'}>
                      {!collapsed && steps.map((step) => (
                        <div key={step.id} data-kind={step.kind}>
                          <span>{processStepLabel(step.kind)}</span>
                          <p>{step.text}</p>
                        </div>
                      ))}
                      {collapsed && (
                        <p className="codex-agent-sidebar__process-summary">
                          {processSummaryText(item)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="codex-agent-sidebar__message-body">
                      {item.text || (item.status === 'running' ? 'Codex 正在处理当前画布...' : '')}
                    </div>
                  )}
                </article>
              );
            })}
            {(askOptions.length > 0 || askPrompt) && (
              <article data-role="process" data-status="running" className="codex-agent-sidebar__ask-card">
                <div className="codex-agent-sidebar__message-meta">
                  <span className="codex-agent-sidebar__message-icon"><MessageSquare size={11} /></span>
                  <strong>Codex 提问</strong>
                  <small>Ask 模式</small>
                </div>
                {askPrompt && <p className="codex-agent-sidebar__ask-prompt">{askPrompt}</p>}
                <div className="codex-agent-sidebar__ask-options">
                  {askOptions.length ? askOptions.map((option, index) => (
                    <button key={option.id} type="button" onClick={() => void answerAskOption(option)}>
                      <span>{String.fromCharCode(65 + index)}</span>
                      <strong>{option.label}</strong>
                    </button>
                  )) : <span className="codex-agent-sidebar__ask-freeform">直接在输入框回复。</span>}
                </div>
              </article>
            )}
            {approvalOptions.length > 0 && (
              <article data-role="process" data-status="running" className="codex-agent-sidebar__ask-card">
                <div className="codex-agent-sidebar__message-meta">
                  <span className="codex-agent-sidebar__message-icon"><Terminal size={11} /></span>
                  <strong>Codex 原生审批</strong>
                  <small>permission</small>
                </div>
                <p className="codex-agent-sidebar__ask-prompt">{approvalPrompt || 'Codex 正在等待权限决策'}</p>
                <div className="codex-agent-sidebar__ask-options">
                  {approvalOptions.map((option) => (
                    <button key={option.id} type="button" onClick={() => void answerNativeApprovalOption(option)}>
                      <span>{option.decision === 'acceptForSession' ? 'S' : option.label.slice(0, 1)}</span>
                      <strong>{option.label}</strong>
                    </button>
                  ))}
                </div>
              </article>
            )}
          </section>
        )}
      </main>

      <form
        className="codex-agent-sidebar__composer"
        onSubmit={(event) => {
          event.preventDefault();
          const askShortcut = findAskShortcutOption(prompt, askOptions);
          if (askShortcut) void answerAskOption(askShortcut);
          else if (askRequestId) void answerAskText(prompt);
          else void sendPrompt(prompt);
        }}
      >
        <div
          className="codex-agent-sidebar__composer-card"
          style={{ '--codex-composer-height': `${composerHeight}px` } as CSSProperties}
        >
          <span
            className="codex-agent-sidebar__composer-resize"
            role="separator"
            aria-orientation="horizontal"
            title="拖动调整输入框高度"
            onPointerDown={startComposerResize}
          />
          {editingMessageId && (
            <div className="codex-agent-sidebar__edit-banner">
              <span><Pencil size={12} />正在编辑重试</span>
              <small>{compactText(findUserMessageForAction(messages, editingMessageId)?.text || prompt, 72)}</small>
              <button type="button" onClick={() => setEditingMessageId('')} title="取消编辑">
                <X size={12} />
              </button>
            </div>
          )}
          <div className="codex-agent-sidebar__active-skill">
            <span><Circle size={7} fill="var(--t8-accent)" /> {skillLabel(selectedSkill)}</span>
            <small>{skillHint(selectedSkill)}</small>
            <button
              type="button"
              onClick={() => {
                setSkillLibraryOpen((value) => {
                  const next = !value;
                  if (next) closeFloatingPanels('skillLibrary');
                  return next;
                });
              }}
              title="打开 Skill 库"
            >
              Skill 库
            </button>
            <button
              type="button"
              onClick={() => {
                setSkillDetailOpen((value) => {
                  const next = !value;
                  if (next) closeFloatingPanels('skillDetail');
                  return next;
                });
              }}
              title="查看 Skill"
            >
              查看 Skill
            </button>
            <button type="button" onClick={() => setSelectedSkillId(businessSkills[0]?.id || '')} title="重置技能">
              <X size={13} />
            </button>
          </div>
          {selectedSkillDirections.length > 0 ? (
            <div className="codex-agent-sidebar__direction-chipbar" aria-label="当前技能方向">
              {selectedSkillDirections.map((direction) => (
                <button
                  key={direction.id}
                  type="button"
                  data-active={selectedDirection?.id === direction.id}
                  onClick={() => setSelectedDirectionId(direction.id)}
                  title={direction.hint}
                >
                  {direction.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="codex-agent-sidebar__direction-empty">
              <span>这个 Skill 还没有定义 Sidebar Directions</span>
              <button
                type="button"
                onClick={() => {
                  setSkillEditMode('edit');
                  setSkillDetailOpen(true);
                }}
              >
                编辑
              </button>
              <button type="button" onClick={() => void adaptSelectedSkillForSidebar()}>适配</button>
            </div>
          )}

          {referenceImages.length > 0 && (
            <div className="codex-agent-sidebar__reference-strip">
              {referenceImages.map((item, index) => (
                <div key={item.id} className="codex-agent-sidebar__reference-thumb" title={item.name}>
                  <img src={item.url} alt={item.name} />
                  <span>{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setReferenceImages((prev) => prev.filter((ref) => ref.id !== item.id))}
                    title="移除参考图"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {researchSummary && (
            <div className="codex-agent-sidebar__research-summary">
              <strong>{researchSummary.cached ? '已复用调研缓存' : '调研摘要已生成'}</strong>
              <small>{researchSummary.keywords.slice(0, 6).join(' / ') || researchSummary.query}</small>
            </div>
          )}

          {taskPreview && (
            <div className="codex-agent-sidebar__task-preview" data-expanded={taskPreviewExpanded ? 'true' : 'false'}>
              <div className="codex-agent-sidebar__task-preview-head">
                <button
                  type="button"
                  className="codex-agent-sidebar__task-preview-toggle"
                  onClick={() => setTaskPreviewExpanded((value) => !value)}
                  title={taskPreviewExpanded ? '收起任务预演' : '展开任务预演详情'}
                >
                  <span><Sparkles size={12} />任务预演</span>
                  <small>{taskPreview.nodes.length} 节点 · {taskPreview.edges.length} 连线 · {taskPreview.confirmation === 'ask' ? 'Ask' : 'Auto'}</small>
                </button>
                <button
                  type="button"
                  onClick={() => void sendPrompt(prompt || lastUserMessage(messages) || taskPreview.title, false, true)}
                  disabled={running}
                >
                  执行
                </button>
                <button
                  type="button"
                  className="codex-agent-sidebar__task-preview-clear"
                  onClick={() => setTaskPreview(null)}
                  title="清除任务预演"
                >
                  <X size={12} />
                </button>
              </div>
              {taskPreviewExpanded && (
                <div className="codex-agent-sidebar__task-preview-popover">
                  <div className="codex-agent-sidebar__task-preview-grid">
                    <span>节点 {taskPreview.nodes.length}</span>
                    <span>连线 {taskPreview.edges.length}</span>
                    <span>{taskPreview.confirmation === 'ask' ? 'Ask 确认' : 'Auto 执行'}</span>
                  </div>
                  <div className="codex-agent-sidebar__preview-confirm-list">
                    <span>将创建：{taskPreview.nodes.map((node) => node.label).join('、') || '无新增节点'}</span>
                    <span>将连接：{taskPreview.edges.length ? `${taskPreview.edges.length} 条线` : '不连线'}</span>
                    <span>运行模型：{taskPreview.models.map((item) => `${item.kind}:${item.model}`).join(' / ') || '不运行模型'}</span>
                  </div>
                  <ul>
                    {taskPreview.nodes.map((node) => (
                      <li key={`${node.type}-${node.label}`}>
                        <b>{node.label}</b>
                        <span>{node.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {canvasInfoOpen && (
            <div className="codex-agent-sidebar__canvas-info">
              <div>
                <strong>{canvasInfoLoading ? '正在读取画布...' : (canvasInfo?.name || activeCanvas?.name || '当前画布')}</strong>
                <small>{canvasInfo?.id || activeCanvasId || '未加载画布'}</small>
              </div>
              <div className="codex-agent-sidebar__canvas-info-grid">
                <span>节点 <b>{canvasInfo?.nodeCount ?? activeCanvas?.nodeCount ?? 0}</b></span>
                <span>连线 <b>{canvasInfo?.edgeCount ?? 0}</b></span>
                <span>缩放 <b>{canvasInfo?.viewport ? Number(canvasInfo.viewport.zoom).toFixed(2) : '-'}</b></span>
              </div>
              {canvasInfo?.nodeTypes.length ? <p>{canvasInfo.nodeTypes.join(' / ')}</p> : null}
              <button type="button" onClick={() => insertPromptText(canvasInfoToPrompt(canvasInfo))}>
                插入画布信息
              </button>
            </div>
          )}

          <div className="codex-agent-sidebar__compose-row">
            {selectedMentionAssets.length > 0 && (
              <div className="codex-agent-sidebar__mention-chipbar" aria-label="已引用内容">
                {selectedMentionAssets.map((item) => (
                  <span key={item.id} className="codex-agent-sidebar__mention-chip" data-source={item.source}>
                    <span className="codex-agent-sidebar__mention-chip-thumb" data-empty={item.thumbUrl ? 'false' : 'true'}>
                      {item.thumbUrl ? <img src={item.thumbUrl} alt="" /> : <AtSign size={12} />}
                    </span>
                    <span>{item.label.replace(/^@/, '')}</span>
                    <button type="button" onClick={() => removeMentionAsset(item.id)} title="移除引用">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <MentionPromptInput
              className="t8-textarea codex-agent-sidebar__rich-input"
              value={prompt}
              mentions={promptMentions}
              materials={mentionMaterials}
              onChange={(nextValue, nextMentions) => {
                setPrompt(nextValue);
                setPromptMentions(nextMentions);
                const query = findMediaMentionQuery(nextValue, nextValue.length, nextMentions);
                if (!query) setMentionQuery(null);
              }}
              onSubmit={(nextValue, nextMentions) => {
                setPrompt(nextValue);
                setPromptMentions(nextMentions);
                void sendPrompt(nextValue);
              }}
              placeholder="告诉 Codex 要怎么控制当前画布，输入 @ 引用图片、视频或节点..."
              style={{ height: composerHeight, minHeight: composerHeight }}
              fillHeight
              isDark={false}
              isPixel={false}
              expandable={false}
              promptTemplateKind={false}
            />
          </div>

          {error && (
            <div className="codex-agent-sidebar__inline-error" title={error}>
              {error}
            </div>
          )}

          <div className="codex-agent-sidebar__composer-toolbar">
            <span className="codex-agent-sidebar__agent-pill"><Sparkles size={13} />Agent</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="codex-agent-sidebar__file-input"
              onChange={handleReferenceUpload}
            />
            <button
              type="button"
              className="codex-agent-sidebar__add-ref"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingReference}
              title="上传参考图"
            >
              <ImagePlus size={14} />
            </button>
            <span className="codex-agent-sidebar__toolbar-popover-anchor">
              <button
                type="button"
                className="codex-agent-sidebar__tool-btn"
                onClick={() => {
                  setReferenceSearchOpen((value) => {
                    const next = !value;
                    if (next) closeFloatingPanels('referenceSearch');
                    return next;
                  });
                }}
                title="参考图搜索"
              >
                <Search size={14} />
              </button>
              {referenceSearchOpen && (
                <div className="codex-agent-sidebar__quick-panel codex-agent-sidebar__research-popover codex-agent-sidebar__anchored-popover">
                  <div className="codex-agent-sidebar__popover-head">
                    <strong>参考图搜索</strong>
                    {referenceSearchLoading && <span>搜索中</span>}
                    <button type="button" onClick={() => setReferenceSearchOpen(false)} title="关闭"><X size={12} /></button>
                  </div>
                  <div className="codex-agent-sidebar__research-row">
                    <input
                      className="t8-input"
                      value={referenceSearchQuery}
                      onChange={(event) => setReferenceSearchQuery(event.target.value)}
                      placeholder="关键词，只生成参考 board"
                    />
                    <button type="button" onClick={() => void runReferenceImageSearch()} disabled={referenceSearchLoading}>
                      {referenceSearchLoading ? '搜索中' : '搜索'}
                    </button>
                  </div>
                  {referenceSearchResults.length > 0 && (
                    <div className="codex-agent-sidebar__reference-search-grid">
                      {referenceSearchResults.slice(0, 6).map((item) => (
                        <a key={item.id} href={item.sourceUrl || item.url} target="_blank" rel="noreferrer" title={item.license || item.title}>
                          <img src={item.thumbUrl || item.url} alt={item.title} />
                          <span>{item.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </span>
            <span className="codex-agent-sidebar__toolbar-popover-anchor">
              <button
                type="button"
                className="codex-agent-sidebar__tool-btn"
                onClick={() => {
                  setMentionOpen((value) => {
                    const next = !value;
                    if (next) {
                      setMentionQuery(null);
                      closeFloatingPanels('mention');
                      void loadMentionAssets();
                    }
                    return next;
                  });
                }}
                title="@ 引用"
              >
                <AtSign size={14} />
              </button>
              {mentionOpen && (
                <div className="codex-agent-sidebar__quick-panel codex-agent-sidebar__mention-popover codex-agent-sidebar__anchored-popover">
                  <div className="codex-agent-sidebar__popover-head">
                    <strong>插入引用</strong>
                    {mentionAssetsLoading && <span>读取中</span>}
                    <button type="button" onClick={() => setMentionOpen(false)} title="关闭"><X size={12} /></button>
                  </div>
                  <div className="codex-agent-sidebar__mention-grid">
                    {filteredMentionItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectMentionItem(item)}
                      >
                        <span className="codex-agent-sidebar__mention-thumb" data-empty={item.thumbUrl ? 'false' : 'true'}>
                          {item.thumbUrl ? <img src={item.thumbUrl} alt="" /> : <AtSign size={14} />}
                        </span>
                        <span className="codex-agent-sidebar__mention-copy">
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </span>
            <button
              type="button"
              className="codex-agent-sidebar__tool-btn"
              onClick={toggleCanvasInfo}
              title="画布说明"
            >
              <Info size={14} />
            </button>
            <span className="codex-agent-sidebar__toolbar-spacer" />
            <button
              type="button"
              className="codex-agent-sidebar__mode-btn"
              onClick={() => setPreferences((prev) => ({ ...prev, drivingMode: prev.drivingMode === 'copilot' ? 'autopilot' : 'copilot' }))}
              title={drivingMode === 'copilot' ? '副驾驶：Ask' : '自动驾驶：Auto'}
            >
              <MessageSquare size={14} />
              {drivingMode === 'copilot' ? 'Ask' : 'Auto'}
              <ChevronDown size={13} />
            </button>
            <span className="codex-agent-sidebar__toolbar-popover-anchor">
              <button
                type="button"
                className="codex-agent-sidebar__mode-btn"
                onClick={() => {
                  setPrefOpen((value) => {
                    const next = !value;
                    if (next) closeFloatingPanels('preferences');
                    return next;
                  });
                }}
                title="生成偏好"
              >
                <Settings2 size={15} />
                {currentPermission.label}
              </button>
              {prefOpen && (
                <div className="codex-agent-sidebar__quick-panel codex-agent-sidebar__pref-popover codex-agent-sidebar__anchored-popover">
                  <div className="codex-agent-sidebar__popover-head">
                    <strong>运行偏好</strong>
                    <button type="button" onClick={() => setPrefOpen(false)} title="关闭"><X size={12} /></button>
                  </div>
                  <div className="codex-agent-sidebar__model-summary">
                    <span><b>图像</b>{generationPreferences.image.apiModel || generationPreferences.image.model} · {generationPreferences.image.aspectRatio} · {generationPreferences.image.size || 'auto'}</span>
                    <span><b>视频</b>{generationPreferences.video.apiModel || generationPreferences.video.model} · {generationPreferences.video.aspectRatio} · {generationPreferences.video.duration}s</span>
                    <span><b>Codex</b>{codexModelValue(codexModelMode, customCodexModel) || '默认'} · {reasoningEffort}</span>
                  </div>
                  <div className="codex-agent-sidebar__preference-tabs codex-agent-sidebar__pref-mode">
                    <button type="button" data-active={drivingMode === 'copilot'} onClick={() => setPreferences((prev) => ({ ...prev, drivingMode: 'copilot' }))}>
                      <MessageSquare size={18} />
                      <span><strong>Ask</strong><small>生成前请求确认</small></span>
                    </button>
                    <button type="button" data-active={drivingMode === 'autopilot'} onClick={() => setPreferences((prev) => ({ ...prev, drivingMode: 'autopilot' }))}>
                      <Sparkles size={18} />
                      <span><strong>Auto</strong><small>无需确认直接生成</small></span>
                    </button>
                  </div>
                  <div className="codex-agent-sidebar__preference-section">
                    <strong>先调研</strong>
                    <div className="codex-agent-sidebar__pref-mode">
                      {RESEARCH_MODE_OPTIONS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          data-active={researchMode === item.id}
                          onClick={() => setPreferences((prev) => ({ ...prev, researchMode: item.id }))}
                          title={item.hint}
                        >
                          <RefreshCw size={18} />
                          <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="codex-agent-sidebar__preference-section">
                    <strong>图像参数</strong>
                    <div className="codex-agent-sidebar__preference-compact">
                      <span>尺寸 {generationPreferences.image.size || 'auto'}</span>
                      <span>比例 {generationPreferences.image.aspectRatio}</span>
                      <span>质量 {generationPreferences.image.quality || 'auto'}</span>
                    </div>
                    <label>
                      <span>模型</span>
                      <select
                        value={generationPreferences.image.model}
                        onChange={(event) => {
                          const nextDef = IMAGE_MODELS.find((item) => item.id === event.target.value) || IMAGE_MODELS[0];
                          setGenerationPreferences((prev) => ({
                            ...prev,
                            image: {
                              ...prev.image,
                              model: nextDef.id,
                              apiModel: nextDef.apiModelOptions[0]?.value || nextDef.apiModel,
                              ...parameterDefaults(nextDef.sidebarParameterGroups, nextDef.apiModelOptions[0]?.value || nextDef.apiModel),
                              aspectRatio: nextDef.defaultAspectRatio,
                              size: nextDef.defaultSize || defaultSize,
                            },
                          }));
                        }}
                      >
                        {imageModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>子模型</span>
                      <select
                        value={generationPreferences.image.apiModel}
                        onChange={(event) => setGenerationPreferences((prev) => ({
                          ...prev,
                          image: {
                            ...prev.image,
                            apiModel: event.target.value,
                            ...parameterDefaults(imageModelDef.sidebarParameterGroups, event.target.value),
                          },
                        }))}
                      >
                        {imageApiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <details className="codex-agent-sidebar__preference-disclosure">
                      <summary>更多图像参数</summary>
                      {renderParamButtons(imageParamGroups, generationPreferences.image, (control, value) => {
                        setGenerationPreferences((prev) => ({
                          ...prev,
                          image: {
                            ...prev.image,
                            [control.valueKey]: value,
                          },
                        }));
                      })}
                    </details>
                  </div>
                  <div className="codex-agent-sidebar__preference-section">
                    <strong>视频参数</strong>
                    <div className="codex-agent-sidebar__preference-compact">
                      <span>时长 {generationPreferences.video.duration}s</span>
                      <span>比例 {generationPreferences.video.aspectRatio}</span>
                      <span>清晰度 {generationPreferences.video.resolution || generationPreferences.video.quality}</span>
                    </div>
                    <label>
                      <span>模型</span>
                      <select
                        value={generationPreferences.video.model}
                        onChange={(event) => {
                          const nextDef = VIDEO_MODELS.find((item) => item.id === event.target.value) || VIDEO_MODELS[0];
                          setGenerationPreferences((prev) => ({
                            ...prev,
                            video: {
                              ...prev.video,
                              model: nextDef.id,
                              apiModel: nextDef.apiModelOptions[0]?.value || nextDef.id,
                              ...parameterDefaults(nextDef.sidebarParameterGroups, nextDef.apiModelOptions[0]?.value || nextDef.id),
                              aspectRatio: nextDef.defaultRatio,
                              duration: nextDef.defaultDuration || nextDef.durations?.[0] || prev.video.duration,
                              resolution: nextDef.defaultResolution || nextDef.resolutions?.[0] || '',
                            },
                          }));
                        }}
                      >
                        {videoModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>子模型</span>
                      <select
                        value={generationPreferences.video.apiModel}
                        onChange={(event) => setGenerationPreferences((prev) => ({
                          ...prev,
                          video: {
                            ...prev.video,
                            apiModel: event.target.value,
                            ...parameterDefaults(videoModelDef.sidebarParameterGroups, event.target.value),
                          },
                        }))}
                      >
                        {videoApiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <details className="codex-agent-sidebar__preference-disclosure">
                      <summary>更多视频参数</summary>
                      {renderParamButtons(videoParamGroups, generationPreferences.video, (control, value) => {
                        setGenerationPreferences((prev) => ({
                          ...prev,
                          video: {
                            ...prev.video,
                            [control.valueKey]: control.valueKey === 'duration' ? clampNumber(Number(value), 1, 30) : value,
                          },
                        }));
                      })}
                    </details>
                  </div>
                  <div className="codex-agent-sidebar__codex-config">
                    <strong>Codex 参数</strong>
                    <label>
                      <span>推理强度</span>
                      <div>
                        {REASONING_OPTIONS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            data-active={reasoningEffort === item.id}
                            onClick={() => setPreferences((prev) => ({ ...prev, reasoningEffort: item.id }))}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </label>
                    <label>
                      <span>Codex 模型</span>
                      <select
                        value={codexModelMode}
                        onChange={(event) => setPreferences((prev) => ({ ...prev, codexModelMode: event.target.value }))}
                      >
                        {CODEX_MODEL_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    {codexModelMode === 'custom' ? (
                      <label>
                        <span>模型 ID</span>
                        <input
                          className="t8-input"
                          value={customCodexModel}
                          placeholder="例如：gpt-5.5"
                          onChange={(event) => setPreferences((prev) => ({ ...prev, customCodexModel: event.target.value }))}
                        />
                      </label>
                    ) : (
                      <small title={currentCodexModelOption.hint}>{currentCodexModelOption.hint}</small>
                    )}
                  </div>
                  <div className="codex-agent-sidebar__permission-grid">
                    {PERMISSION_PRESETS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-active={permissionPreset === item.id}
                        onClick={() => updatePermissionPreset(item.id)}
                        title={`${item.sandbox} / ${item.approvalPolicy}`}
                      >
                        <span>{item.label}</span>
                        <small>{item.hint}</small>
                      </button>
                    ))}
                  </div>
                  <div className="codex-agent-sidebar__process-row">
                    <span><Terminal size={13} />Codex SDK 执行器 · {sessionLabel(session)}{session?.pid ? ` · PID ${session.pid}` : ''}</span>
                    <button type="button" onClick={openSession}><RefreshCw size={12} />刷新状态</button>
                    <button type="button" onClick={stopSession} disabled={!running}><Square size={12} />停止</button>
                    {running && (
                      <button type="button" onClick={() => void sendPrompt(prompt || lastUserMessage(messages), true)}>
                        <RefreshCw size={12} />停止并重启
                      </button>
                    )}
                  </div>
                </div>
              )}
            </span>
            {running ? (
              <button type="button" className="codex-agent-sidebar__send" onClick={stopSession} title="停止">
                <Square size={15} />
              </button>
            ) : (
              <button type="submit" className="codex-agent-sidebar__send" disabled={!prompt.trim()} title="发送">
                <Send size={16} />
              </button>
            )}
          </div>

          {historyOpen && (
            <div className="codex-agent-sidebar__quick-panel codex-agent-sidebar__history-popover">
              <div className="codex-agent-sidebar__popover-head">
                <strong>Codex 记录</strong>
                <span>
                  <button type="button" onClick={createConversationRecord}>新建记录</button>
                  <button type="button" onClick={() => void refreshSdkConversationRecords()}>刷新</button>
                  <button type="button" onClick={clearHistory}>清空输入</button>
                  <button type="button" onClick={() => setHistoryOpen(false)} title="关闭"><X size={12} /></button>
                </span>
              </div>
              <div className="codex-agent-sidebar__record-actions">
                {conversationRecords.map((record) => (
                  <div
                    key={record.id}
                    className="codex-agent-sidebar__record-row"
                    data-active={record.id === activeRecordId}
                  >
                    <button
                      type="button"
                      className="codex-agent-sidebar__record-main"
                      onClick={() => reuseConversationRecord(record)}
                    >
                      <span>{record.title}</span>
                      <small>
                        {recordMessageCount(record)} 条 · {recordStatusLabel(record.status)} · {formatHistoryTime(record.updatedAt)}
                        {' · '}{recordThreadLabel(record)}
                        {record.researchSummary ? ' · 含调研' : ''}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="codex-agent-sidebar__record-delete"
                      data-codex-record-action="delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteConversationRecord(record);
                      }}
                      title="删除记录"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              {history.length ? history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="codex-agent-sidebar__history-item"
                  onClick={() => {
                    setPrompt(item.text);
                    setHistoryOpen(false);
                  }}
                >
                  <span>{item.text}</span>
                  <small>{item.skillLabel} · {formatHistoryTime(item.createdAt)}</small>
                </button>
              )) : <div className="codex-agent-sidebar__empty-popover">还没有最近输入</div>}
            </div>
          )}

        </div>
      </form>
      {skillLibraryModal}
      {skillDetailModal}
    </aside>
  );
}
