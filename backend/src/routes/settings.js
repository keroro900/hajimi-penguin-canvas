// 三套 API Key 设置路由
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const {
  maskAdvancedProviders,
  normalizeAdvancedProviders,
  summarizeAdvancedProviders,
} = require('../providers/registry');
const {
  maskCloudUploadTargets,
  normalizeCloudUploadTargets,
  summarizeCloudUploadTargets,
} = require('../cloudUploads/settings');
const {
  fetchModels: fetchOpenAICompatibleModels,
} = require('../providers/openaiCompatible');
const {
  normalizeCustomNodeWorkshopSettings,
} = require('../customNodes/manifest');

const router = express.Router();

const TASK_COMPLETION_SOUND_DEFAULT = {
  mode: 'default',
  name: '',
  fileName: '',
  mimeType: '',
  size: 0,
  updatedAt: 0,
  url: '',
};
const TASK_COMPLETION_SOUND_DIRNAME = 'task-completion-sound';
const TASK_COMPLETION_SOUND_ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm']);
const TASK_COMPLETION_SOUND_EXTENSION_BY_MIME = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'audio/webm': '.webm',
};

// 默认 settings 结构(通用服务、LLM 独立 Key + 8 类分类 Key)
const DEFAULT_SETTINGS = {
  // 通用服务与 LLM 独立 Key
  zhenzhenApiKey: '',
  zhenzhenBaseUrl: config.ZHENZHEN_BASE_URL,
  llmApiKey: '',
  llmBaseUrl: config.ZHENZHEN_BASE_URL,
  // 分类 Key（留空时 fallback 到 zhenzhenApiKey）
  gptImageApiKey: '',
  nanoBananaApiKey: '',
  mjApiKey: '',
  veoApiKey: '',
  soraApiKey: '',
  grokApiKey: '',
  seedanceApiKey: '',
  sunoApiKey: '',
  zhenzhenImageModelOverrides: {},
  zhenzhenVideoModelOverrides: {},
  zhenzhenLlmModelOverrides: {},
  zhenzhenModelCatalog: {
    all: [], imageModels: [], videoModels: [], audioModels: [], chatModels: [], unknownModels: [],
    manualModels: [], typeOverrides: {},
  },
  llmModelCatalog: {
    all: [], imageModels: [], videoModels: [], audioModels: [], chatModels: [], unknownModels: [],
    manualModels: [], typeOverrides: {},
  },
  zhenzhenImageModelProtocols: {},
  zhenzhenVideoModelProtocols: {},
  // v1.2.10.2: 全局生成素材自动保存到本地的路径(可用户自定义)
  fileSavePath: config.DEFAULT_LOCAL_SAVE_DIR,
  // v1.3.1: 画布自动保存导出路径(实际写入 <path>/canvases)
  canvasAutoSavePath: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
  // v1.3.4: 资源库路径(资源文件 + resource_library.json 元数据)
  resourceLibraryPath: config.DEFAULT_RESOURCE_LIBRARY_DIR,
  // v1.3.6: 自定义主题模板路径
  themeTemplatePath: config.DEFAULT_THEME_TEMPLATE_DIR,
  // 本地 Eagle API 地址，只用于“发送到 Eagle”功能。路由层仍会强制限制为本机地址。
  eagleApiBase: config.DEFAULT_EAGLE_API_BASE,
  // Hakimi MCP 连接的画布后端地址。本地 Codex 控制远端画布时可改成服务器后端地址。
  hakimiMcpBackendUrl: 'http://127.0.0.1:18766',
  // v1.8.0: 扩展 API 平台（高级可选）。默认只提供禁用的配置卡片，不影响主流程。
  advancedProviders: normalizeAdvancedProviders(),
  // v1.9.x: 云端上传目标（可选）。默认禁用，不影响资源库/自动保存主流程。
  cloudUploadTargets: normalizeCloudUploadTargets(),
  // 任务完成提示音；默认走前端内置短音，用户上传后走本地音频文件。
  taskCompletionSound: { ...TASK_COMPLETION_SOUND_DEFAULT },
  // 外挂式自定义节点工坊；默认关闭，插件根目录默认在用户目录下，不写入主项目。
  customNodeWorkshop: normalizeCustomNodeWorkshopSettings(),
  // 其他偏好
  preferences: {
    theme: 'dark',
    language: 'zh-CN',
  },
};

function normalizeTaskCompletionSoundSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const mode = value.mode === 'custom' ? 'custom' : 'default';
  if (mode !== 'custom') return { ...TASK_COMPLETION_SOUND_DEFAULT };
  const fileName = path.basename(String(value.fileName || ''));
  if (!fileName) return { ...TASK_COMPLETION_SOUND_DEFAULT };
  return {
    mode: 'custom',
    name: String(value.name || fileName).slice(0, 240),
    fileName,
    mimeType: String(value.mimeType || 'audio/mpeg').slice(0, 120),
    size: Number.isFinite(Number(value.size)) ? Number(value.size) : 0,
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
    url: '',
  };
}

function getTaskCompletionSoundDir() {
  return path.join(path.dirname(config.SETTINGS_FILE), TASK_COMPLETION_SOUND_DIRNAME);
}

function getTaskCompletionSoundFilePath(settings) {
  const sound = normalizeTaskCompletionSoundSettings(settings?.taskCompletionSound);
  if (sound.mode !== 'custom' || !sound.fileName) return '';
  const dir = getTaskCompletionSoundDir();
  const filePath = path.join(dir, sound.fileName);
  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir + path.sep)) return '';
  return resolvedFile;
}

function getTaskCompletionSoundPublic(settings) {
  const sound = normalizeTaskCompletionSoundSettings(settings?.taskCompletionSound);
  const filePath = getTaskCompletionSoundFilePath({ taskCompletionSound: sound });
  if (sound.mode !== 'custom' || !filePath || !fs.existsSync(filePath)) {
    return { ...TASK_COMPLETION_SOUND_DEFAULT };
  }
  const stat = fs.statSync(filePath);
  const updatedAt = sound.updatedAt || Math.max(0, Math.floor(stat.mtimeMs));
  return {
    mode: 'custom',
    name: sound.name || sound.fileName,
    fileName: sound.fileName,
    mimeType: sound.mimeType || 'audio/mpeg',
    size: sound.size || stat.size,
    updatedAt,
    url: `/api/settings/task-completion-sound/file?v=${updatedAt}`,
  };
}

function deleteTaskCompletionSoundFiles() {
  const dir = getTaskCompletionSoundDir();
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('task-completion-sound')) continue;
    fs.rmSync(path.join(dir, entry.name), { force: true });
  }
}

function isAllowedTaskCompletionSoundFile(file) {
  const ext = path.extname(String(file?.originalname || '')).toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  return TASK_COMPLETION_SOUND_ALLOWED_EXTENSIONS.has(ext) || mime.startsWith('audio/');
}

function getTaskCompletionSoundFileExtension(file) {
  const ext = path.extname(String(file?.originalname || '')).toLowerCase();
  if (TASK_COMPLETION_SOUND_ALLOWED_EXTENSIONS.has(ext)) return ext;
  const mime = String(file?.mimetype || '').toLowerCase();
  return TASK_COMPLETION_SOUND_EXTENSION_BY_MIME[mime] || '.mp3';
}

const uploadTaskCompletionSoundFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedTaskCompletionSoundFile(file)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持音频文件：mp3 / wav / ogg / m4a / aac / flac / webm'));
    }
  },
}).single('audio');

const CURRENT_DEFAULT_PATHS = {
  fileSavePath: config.DEFAULT_LOCAL_SAVE_DIR,
  canvasAutoSavePath: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
  resourceLibraryPath: config.DEFAULT_RESOURCE_LIBRARY_DIR,
  themeTemplatePath: config.DEFAULT_THEME_TEMPLATE_DIR,
};

const LEGACY_DEFAULT_PATHS = {
  fileSavePath: config.LEGACY_WINDOWS_DEFAULT_ROOT,
  canvasAutoSavePath: config.LEGACY_WINDOWS_DEFAULT_ROOT,
  resourceLibraryPath: `${config.LEGACY_WINDOWS_DEFAULT_ROOT}\\resources`,
  themeTemplatePath: `${config.LEGACY_WINDOWS_DEFAULT_ROOT}\\theme-templates`,
};

// 分类 key 字段列表（供 GET 脱敏与 POST 合并使用）
const CLASSIFIED_KEY_FIELDS = [
  'gptImageApiKey', 'nanoBananaApiKey', 'mjApiKey', 'veoApiKey', 'soraApiKey',
  'grokApiKey', 'seedanceApiKey', 'sunoApiKey',
];
const MODEL_FETCH_KEY_FIELDS = new Set(['zhenzhenApiKey', 'llmApiKey', ...CLASSIFIED_KEY_FIELDS]);

function normalizePathForCompare(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function migrateLegacyDefaultPaths(settings) {
  let changed = false;
  const next = { ...settings };
  for (const field of Object.keys(CURRENT_DEFAULT_PATHS)) {
    const current = String(next[field] || '').trim();
    if (!current) continue;
    if (normalizePathForCompare(current) === normalizePathForCompare(LEGACY_DEFAULT_PATHS[field])) {
      next[field] = CURRENT_DEFAULT_PATHS[field];
      changed = true;
    }
  }
  return { settings: next, changed };
}

function maskKey(k) {
  return k ? '****' + String(k).slice(-4) : '';
}

function normalizeBaseUrl(value, fallback) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return fallback || '';
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback || '';
    return text;
  } catch {
    return fallback || '';
  }
}

function dropLegacyPersonalBaseUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  try {
    const host = new URL(text).hostname.toLowerCase();
    const legacyDomain = ['t8', 'star'].join('');
    if (host === `ai.${legacyDomain}.org` || host === `ai.${legacyDomain}.cn`) return '';
  } catch (_) {}
  return text;
}

function normalizeModelOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  for (const [key, raw] of Object.entries(value)) {
    const id = String(key || '').trim();
    const models = String(raw || '')
      .split(/[\r\n,，;；]+/)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((item, index, arr) => arr.indexOf(item) === index);
    const model = models.join('\n');
    if (!id || !model) continue;
    if (id.length > 120 || model.length > 2000) continue;
    if (/[\x00-\x1f\x7f]/.test(id) || /[\x00-\x09\x0b-\x1f\x7f]/.test(model)) continue;
    next[id] = model;
  }
  return next;
}

function normalizeImageModelOverrides(value) {
  return normalizeModelOverrides(value);
}

function normalizeImageModelProtocols(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = new Set([
    'images',
    'azure-gpt-image',
    'images-generations',
    'images-edits',
    'openai-chat',
    'gemini-generate-content',
    'gemini-interactions',
    'gemini-native',
  ]);
  const next = {};
  for (const [key, raw] of Object.entries(value)) {
    const id = String(key || '').trim();
    const protocol = String(raw || '').trim();
    if (!id || !allowed.has(protocol)) continue;
    if (id.length > 120 || /[\x00-\x1f\x7f]/.test(id)) continue;
    next[id] = protocol;
  }
  return next;
}

function normalizeVideoModelProtocols(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = new Set(['seedance-v3', 'videos']);
  const next = {};
  for (const [key, raw] of Object.entries(value)) {
    const id = String(key || '').trim();
    const protocol = String(raw || '').trim();
    if (!id || !allowed.has(protocol)) continue;
    if (id.length > 120 || /[\x00-\x1f\x7f]/.test(id)) continue;
    next[id] = protocol;
  }
  return next;
}

function normalizeSettingsBaseUrls(settings) {
  const zhenzhenBaseUrl = normalizeBaseUrl(dropLegacyPersonalBaseUrl(settings.zhenzhenBaseUrl), config.ZHENZHEN_BASE_URL);
  return {
    ...settings,
    zhenzhenBaseUrl,
    llmBaseUrl: normalizeBaseUrl(dropLegacyPersonalBaseUrl(settings.llmBaseUrl), zhenzhenBaseUrl || config.ZHENZHEN_BASE_URL),
    hakimiMcpBackendUrl: normalizeBaseUrl(settings.hakimiMcpBackendUrl, DEFAULT_SETTINGS.hakimiMcpBackendUrl),
    zhenzhenImageModelOverrides: normalizeImageModelOverrides(settings.zhenzhenImageModelOverrides),
    zhenzhenVideoModelOverrides: normalizeModelOverrides(settings.zhenzhenVideoModelOverrides),
    zhenzhenLlmModelOverrides: normalizeModelOverrides(settings.zhenzhenLlmModelOverrides),
    zhenzhenImageModelProtocols: normalizeImageModelProtocols(settings.zhenzhenImageModelProtocols),
    zhenzhenVideoModelProtocols: normalizeVideoModelProtocols(settings.zhenzhenVideoModelProtocols),
  };
}

function loadSettings({ persistMigrations = true } = {}) {
  if (!fs.existsSync(config.SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf-8'));
    const merged = normalizeSettingsBaseUrls({
      ...DEFAULT_SETTINGS,
      ...data,
    });
    merged.advancedProviders = normalizeAdvancedProviders(data.advancedProviders);
    merged.cloudUploadTargets = normalizeCloudUploadTargets(data.cloudUploadTargets);
    merged.taskCompletionSound = normalizeTaskCompletionSoundSettings(data.taskCompletionSound);
    merged.customNodeWorkshop = normalizeCustomNodeWorkshopSettings(data.customNodeWorkshop);
    const migrated = migrateLegacyDefaultPaths(merged);
    if (persistMigrations && migrated.changed) {
      saveSettings(migrated.settings);
    }
    return migrated.settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  const dir = path.dirname(config.SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// v1.2.10.2/v1.3.1: 启动时确保本地保存路径存在(不存在则 mkdir -p)
function ensureLocalSavePaths() {
  try {
    const s = loadSettings();
    const paths = [
      { label: '文件自动保存路径', value: s.fileSavePath || config.DEFAULT_LOCAL_SAVE_DIR || '' },
      { label: '画布自动保存路径', value: s.canvasAutoSavePath || config.DEFAULT_CANVAS_AUTO_SAVE_DIR || '' },
      { label: '资源库路径', value: s.resourceLibraryPath || config.DEFAULT_RESOURCE_LIBRARY_DIR || '' },
      { label: '主题模板路径', value: s.themeTemplatePath || config.DEFAULT_THEME_TEMPLATE_DIR || '' },
    ];
    for (const item of paths) {
      const p = String(item.value || '').trim();
      if (!p) continue;
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
        console.log(`[settings] 创建${item.label}: ${p}`);
      }
    }
  } catch (e) {
    console.warn('[settings] 创建本地保存路径失败(忽略):', e?.message || e);
  }
}
ensureLocalSavePaths();

// GET /api/settings — 获取全部设置(脱敏 Key 仅返回最后4位)
router.get('/', (_req, res) => {
  const settings = loadSettings();
  const masked = {
    ...settings,
    zhenzhenApiKey: maskKey(settings.zhenzhenApiKey),
    llmApiKey: maskKey(settings.llmApiKey),
    advancedProviders: maskAdvancedProviders(settings.advancedProviders),
    advancedProviderSummary: summarizeAdvancedProviders(settings.advancedProviders),
    cloudUploadTargets: maskCloudUploadTargets(settings.cloudUploadTargets),
    cloudUploadSummary: summarizeCloudUploadTargets(settings.cloudUploadTargets),
    taskCompletionSound: getTaskCompletionSoundPublic(settings),
  };
  for (const f of CLASSIFIED_KEY_FIELDS) {
    masked[f] = maskKey(settings[f]);
  }
  res.json({ success: true, data: masked });
});

// GET /api/settings/raw — 内部接口,获取明文(供 Phase 4 代理调用使用)
router.get('/raw', (_req, res) => {
  res.json({ success: true, data: loadSettings() });
});

router.post('/zhenzhen-models', async (req, res) => {
  try {
    const settings = loadSettings();
    const apiKeyField = String(req.body?.apiKeyField || 'zhenzhenApiKey').trim();
    const savedKeyField = MODEL_FETCH_KEY_FIELDS.has(apiKeyField) ? apiKeyField : 'zhenzhenApiKey';
    const fallbackBaseUrl = savedKeyField === 'llmApiKey'
      ? (settings.llmBaseUrl || settings.zhenzhenBaseUrl || config.ZHENZHEN_BASE_URL)
      : (settings.zhenzhenBaseUrl || config.ZHENZHEN_BASE_URL);
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl, fallbackBaseUrl);
    if (!baseUrl) {
      return res.json({
        success: true,
        data: {
          ok: false,
          code: 'missing_base_url',
          error: '请先填写通用服务 Base URL 后再拉取模型。',
        },
      });
    }
    const incomingKey = String(req.body?.apiKey || '').trim();
    const apiKey = incomingKey || settings[savedKeyField] || settings.zhenzhenApiKey || '';
    if (!apiKey) {
      return res.json({
        success: true,
        data: {
          ok: false,
          code: 'missing_api_key',
          error: '请先填写通用服务 API Key，或保存已有 Key 后再拉取模型。',
        },
      });
    }
    const result = await fetchOpenAICompatibleModels({
      id: 'zhenzhen-default',
      protocol: 'openai-compatible',
      baseUrl,
      apiKey,
    }, {
      timeoutMs: Math.min(Math.max(Number(req.body?.timeoutMs) || 15000, 3000), 30000),
    });
    const { raw: _raw, provider: _provider, ...safeResult } = result || {};
    if (safeResult.ok && Array.isArray(safeResult.all)) {
      const catalogField = savedKeyField === 'llmApiKey' ? 'llmModelCatalog' : 'zhenzhenModelCatalog';
      const previous = settings[catalogField] && typeof settings[catalogField] === 'object'
        ? settings[catalogField]
        : {};
      const catalog = {
        all: safeResult.all,
        imageModels: safeResult.imageModels || [],
        videoModels: safeResult.videoModels || [],
        audioModels: safeResult.audioModels || [],
        chatModels: savedKeyField === 'llmApiKey' ? safeResult.all : (safeResult.chatModels || []),
        unknownModels: savedKeyField === 'llmApiKey' ? [] : (safeResult.unknownModels || []),
        manualModels: Array.isArray(previous.manualModels) ? previous.manualModels : [],
        typeOverrides: previous.typeOverrides && typeof previous.typeOverrides === 'object' ? previous.typeOverrides : {},
        fetchedAt: new Date().toISOString(),
        modelListUrl: safeResult.modelListUrl || '',
      };
      saveSettings({ ...settings, [catalogField]: catalog });
      return res.json({ success: true, data: { ...safeResult, ...catalog, cached: false } });
    }
    const cached = settings[savedKeyField === 'llmApiKey' ? 'llmModelCatalog' : 'zhenzhenModelCatalog'];
    if (Array.isArray(cached?.all) && cached.all.length > 0) {
      return res.json({
        success: true,
        data: {
          ok: true,
          code: 'models_cache_fallback',
          providerId: 'zhenzhen-default',
          protocol: 'openai-compatible',
          ...cached,
          cached: true,
          message: `实时拉取失败，已使用上次缓存的 ${cached.all.length} 个模型。`,
          warning: safeResult.error || safeResult.message || '',
        },
      });
    }
    res.json({ success: true, data: safeResult });
  } catch (e) {
    res.json({
      success: true,
      data: {
        ok: false,
        code: 'network_error',
        error: e?.message || '拉取模型列表失败。',
      },
    });
  }
});

// GET /api/settings/task-completion-sound — 获取当前提示音配置
router.get('/task-completion-sound', (_req, res) => {
  res.json({ success: true, data: getTaskCompletionSoundPublic(loadSettings()) });
});

// GET /api/settings/task-completion-sound/file — 播放/试听自定义提示音
router.get('/task-completion-sound/file', (_req, res) => {
  const settings = loadSettings();
  const sound = getTaskCompletionSoundPublic(settings);
  const filePath = getTaskCompletionSoundFilePath(settings);
  if (sound.mode !== 'custom' || !filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '未配置自定义提示音' });
  }
  res.type(sound.mimeType || 'audio/mpeg');
  res.sendFile(filePath);
});

// POST /api/settings/task-completion-sound — 上传自定义任务完成提示音
router.post('/task-completion-sound', (req, res) => {
  uploadTaskCompletionSoundFile(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || '上传提示音失败' });
    }
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ success: false, error: '请选择一个音频文件' });
    }
    try {
      const dir = getTaskCompletionSoundDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      deleteTaskCompletionSoundFiles();
      const ext = getTaskCompletionSoundFileExtension(req.file);
      const fileName = `task-completion-sound${ext}`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, req.file.buffer);
      const updatedAt = Date.now();
      const current = loadSettings();
      const next = {
        ...current,
        taskCompletionSound: {
          mode: 'custom',
          name: String(req.file.originalname || fileName).slice(0, 240),
          fileName,
          mimeType: req.file.mimetype || TASK_COMPLETION_SOUND_EXTENSION_BY_MIME[ext] || 'audio/mpeg',
          size: req.file.size || req.file.buffer.length,
          updatedAt,
          url: '',
        },
      };
      saveSettings(next);
      res.json({ success: true, data: getTaskCompletionSoundPublic(next) });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || '保存提示音失败' });
    }
  });
});

// DELETE /api/settings/task-completion-sound — 恢复默认提示音
router.delete('/task-completion-sound', (_req, res) => {
  try {
    deleteTaskCompletionSoundFiles();
    const current = loadSettings();
    const next = { ...current, taskCompletionSound: { ...TASK_COMPLETION_SOUND_DEFAULT } };
    saveSettings(next);
    res.json({ success: true, data: getTaskCompletionSoundPublic(next) });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || '恢复默认提示音失败' });
  }
});

// POST /api/settings — 更新设置
router.post('/', (req, res) => {
  const current = loadSettings();
  const incoming = req.body || {};
  const { taskCompletionSound: _ignoredTaskCompletionSound, ...safeIncoming } = incoming;
  const hasAdvancedProviders = Object.prototype.hasOwnProperty.call(incoming, 'advancedProviders');
  const hasCloudUploadTargets = Object.prototype.hasOwnProperty.call(incoming, 'cloudUploadTargets');
  const hasCustomNodeWorkshop = Object.prototype.hasOwnProperty.call(incoming, 'customNodeWorkshop');
  const merged = {
    ...current,
    ...safeIncoming,
  };
  Object.assign(merged, normalizeSettingsBaseUrls(merged));
  merged.advancedProviders = hasAdvancedProviders
    ? normalizeAdvancedProviders(incoming.advancedProviders, current.advancedProviders)
    : normalizeAdvancedProviders(current.advancedProviders);
  merged.cloudUploadTargets = hasCloudUploadTargets
    ? normalizeCloudUploadTargets(incoming.cloudUploadTargets, current.cloudUploadTargets)
    : normalizeCloudUploadTargets(current.cloudUploadTargets);
  merged.taskCompletionSound = normalizeTaskCompletionSoundSettings(current.taskCompletionSound);
  merged.customNodeWorkshop = hasCustomNodeWorkshop
    ? normalizeCustomNodeWorkshopSettings(incoming.customNodeWorkshop)
    : normalizeCustomNodeWorkshopSettings(current.customNodeWorkshop);
  saveSettings(merged);
  // v1.2.10.2/v1.3.1/v1.3.4: 保存后重新确保本地保存路径存在
  for (const field of ['fileSavePath', 'canvasAutoSavePath', 'resourceLibraryPath', 'themeTemplatePath']) {
    if (typeof incoming[field] !== 'string' || !incoming[field].trim()) continue;
    try {
      const p = incoming[field].trim();
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
        console.log(`[settings] 创建${field}: ${p}`);
      }
    } catch (e) {
      console.warn(`[settings] mkdir ${field} 失败:`, e?.message || e);
    }
  }
  res.json({ success: true });
});

// =====================
module.exports = router;
module.exports.loadSettings = loadSettings;
module.exports.saveSettings = saveSettings;
