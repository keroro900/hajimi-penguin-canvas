/**
 * 上游 API 代理路由
 * 1. 隐藏 API Key,前端只通过 /api/proxy/* 调用
 * 2. 自动注入对应的 Key(通用服务 / LLM 独立)
 * 3. 图像生成结果自动转存到 /output 并返回本地 URL
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const { getWhitePng } = require('../utils/whitePng');
const { tryDecodeDuckPayload } = require('../utils/duckPayload');
const { normalizeLlmMessageMedia } = require('../providers/llmMedia');
const {
  buildGeminiLlmPayload,
  isGeminiLlmModel,
  normalizeGeminiLlmResponse,
} = require('../providers/geminiLlm');
const settingsRouter = require('./settings');
const MODEL_PROTOCOL_REGISTRY = require('../../../shared/modelProtocolRegistry.json');

const router = express.Router();

// 音频文件上传中间件(内存存储, 50MB)
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function safeOutputExt(ext, fallback = 'png') {
  const s = String(ext || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);
  return s || fallback;
}

function extFromContentType(contentType) {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/flac': 'flac',
  };
  return map[ct] || '';
}

function normalizeRemoteMediaUrl(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  if (/^\/\//.test(text)) return `https:${text}`;
  if (/^(https?:\/\/|data:|\/files\/|\/output\/|\/input\/)/i.test(text)) return text;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?\//i.test(text)) return `https://${text}`;
  return text;
}

function isRemoteMediaUrl(url) {
  const text = String(url || '').trim();
  return /^(https?:\/\/|\/\/|[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?\/)/i.test(text);
}

// ========== 工具:加载 Settings 明文 ==========
function loadRawSettings() {
  if (!fs.existsSync(config.SETTINGS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function currentSettings() {
  try {
    return settingsRouter.loadSettings({ persistMigrations: false }) || {};
  } catch {
    return loadRawSettings() || {};
  }
}

function zhenzhenBaseUrl(settings) {
  return String((settings || currentSettings()).zhenzhenBaseUrl || config.ZHENZHEN_BASE_URL).trim().replace(/\/+$/, '');
}

function ensureDefaultServiceBaseUrl(settings, res, label = '通用服务') {
  if (zhenzhenBaseUrl(settings)) return true;
  res.status(400).json({ success: false, error: `未配置 ${label} Base URL，请先在【设置】中填写通用服务 Base URL` });
  return false;
}

function isGaiscBaseUrl(baseUrl) {
  try {
    const host = new URL(String(baseUrl || '').trim()).hostname.toLowerCase();
    return host === 'sub.g-aisc.com' || host.endsWith('.g-aisc.com');
  } catch {
    return false;
  }
}

function isSkyleeNewApiBaseUrl(baseUrl) {
  try {
    const host = new URL(String(baseUrl || '').trim()).hostname.toLowerCase();
    return host === 'api.skylee9.cloudns.ch' || host === 'api-direct.skylee9.cloudns.ch';
  } catch {
    return false;
  }
}

function isOfficialGeminiBaseUrl(baseUrl) {
  try {
    const host = new URL(String(baseUrl || '').trim()).hostname.toLowerCase();
    return host === 'generativelanguage.googleapis.com'
      || host === 'ai.google.dev'
      || host.endsWith('.googleapis.com');
  } catch {
    return false;
  }
}

function gaiscGeminiEndpointUrl(baseUrl, model) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
  const apiBase = clean.endsWith('/v1')
    ? `${clean.slice(0, -3)}/v1beta`
    : (clean.endsWith('/v1beta') ? clean : `${clean}/v1beta`);
  return `${apiBase}/models/${encodeURIComponent(model)}:generateContent`;
}

function gaiscGeminiInteractionsEndpointUrl(baseUrl) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
  const apiBase = clean.endsWith('/v1')
    ? `${clean.slice(0, -3)}/v1beta`
    : (clean.endsWith('/v1beta') ? clean : `${clean}/v1beta`);
  return `${apiBase}/interactions`;
}

function gaiscChatCompletionsEndpointUrl(baseUrl) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
  const apiBase = clean.endsWith('/v1beta')
    ? `${clean.slice(0, -7)}/v1`
    : (clean.endsWith('/v1') ? clean : `${clean}/v1`);
  return `${apiBase}/chat/completions`;
}

function llmBaseUrl(settings) {
  const s = settings || currentSettings();
  return String(s.llmBaseUrl || s.zhenzhenBaseUrl || config.ZHENZHEN_BASE_URL).trim().replace(/\/+$/, '');
}

function resolveLlmCredentials(settings, requestedSource) {
  const source = requestedSource === 'zhenzhen' ? 'zhenzhen' : 'llm-direct';
  if (source === 'zhenzhen') {
    return {
      source,
      baseUrl: String(settings?.zhenzhenBaseUrl || config.ZHENZHEN_BASE_URL).trim().replace(/\/+$/, ''),
      apiKey: String(settings?.zhenzhenApiKey || '').trim(),
    };
  }
  return {
    source,
    baseUrl: llmBaseUrl(settings),
    apiKey: String(settings?.llmApiKey || settings?.zhenzhenApiKey || '').trim(),
  };
}

// ========== 工具: 按提示词（模型名 / endpoint / 路由名）选择分类 API Key ==========
// 未填分类 key 时 fallback 到通用服务 API Key。
// hint 例: 'gpt-image-1' / 'gemini-3-pro-image' / 'gemini-3.1-flash-image' / 'mj-fast' / 'veo3.1-fal'
//          / 'grok-video-fal' / 'seedance-v3' / 'suno-v5.5' / 'fal-ai/nano-banana/edit'
function pickApiKey(settings, hint = '') {
  if (!settings) return '';
  const fb = settings.zhenzhenApiKey || '';
  const m = String(hint || '').toLowerCase();
  if (!m) return fb;
  if (m.includes('gpt-image') || m.includes('gpt2') || m.includes('gpt_image') || m.includes('gptimage')) return settings.gptImageApiKey || fb;
  if (m.includes('nano-banana') || m.includes('nano_banana') || m.includes('nanobanana') || m.includes('flash-image') || m.includes('gemini-3-pro-image')) return settings.nanoBananaApiKey || fb;
  if (m.includes('midjourney') || /\bmj[-_/]/.test(m) || m.startsWith('mj') || m === 'mj') return settings.mjApiKey || fb;
  if (m.includes('veo')) return settings.veoApiKey || fb;
  if (m.includes('sora')) return settings.soraApiKey || fb;
  if (m.includes('grok')) return settings.grokApiKey || fb;
  if (m.includes('seedance')) return settings.seedanceApiKey || fb;
  if (m.includes('suno') || m.includes('chirp')) return settings.sunoApiKey || fb;
  return fb;
}

function normalizeImageApiModel(model) {
  return String(model || '').trim();
}

function resolveConfiguredImageApiModel(_settings, _routeModelId, model) {
  return normalizeImageApiModel(model);
}

function gptImage2ZhenzhenVariantSize(model) {
  const raw = String(model || '').trim().toLowerCase();
  return MODEL_PROTOCOL_REGISTRY.defaultService?.gptImage2VariantSizes?.[raw] || '';
}

function isBananaImageModel(model) {
  const m = String(model || '').toLowerCase();
  return m.includes('nano-banana')
    || m.includes('nano_banana')
    || m.includes('nanobanana')
    || m.includes('flash-image')
    || m.includes('gemini-3-pro-image');
}

function isGeminiImagePreviewModel(model) {
  const m = String(model || '').toLowerCase();
  return m.includes('gemini') && m.includes('image-preview');
}

function imageModelProtocol(settings, modelId) {
  const raw = String((settings?.zhenzhenImageModelProtocols || {})[String(modelId || '').trim()] || '').trim();
  if (raw === 'openai-chat' || raw === 'gemini-native' || raw === 'gemini-generate-content' || raw === 'gemini-interactions') return raw;
  if (raw === 'images' || raw === 'azure-gpt-image' || raw === 'images-generations' || raw === 'images-edits') return raw;
  return '';
}

function imageProtocolRouteKind(protocol, hasRefs) {
  if (protocol === 'images-generations') return 'generations';
  if (protocol === 'images-edits') return 'edits';
  return hasRefs ? 'edits' : 'generations';
}

function markImageStatusKind(response, kind) {
  if (!response || !kind) return response;
  try {
    Object.defineProperty(response, '__t8ImageStatusKind', {
      value: kind,
      enumerable: false,
      configurable: true,
    });
  } catch {
    response.__t8ImageStatusKind = kind;
  }
  return response;
}

function shouldRetryGptImageEndpoint(response, text) {
  if (!response || response.ok) return false;
  if (![400, 404, 405, 422].includes(Number(response.status))) return false;
  const body = String(text || '');
  return /no available channel|not\s+priced|pricing|price|unsupported\s+endpoint|endpoint\s+not\s+supported|method\s+not\s+allowed|no access to model|unknown model|模型.*定价|没有.*渠道|无可用渠道|渠道.*不可用|接口.*不支持|端点.*不支持|路径.*不支持|\/v1\/images\/edits|\/images\/edits/i.test(body);
}

function convertedImageRefsToDataUrls(convertedRefs) {
  return (Array.isArray(convertedRefs) ? convertedRefs : [])
    .map((conv) => {
      const buf = conv?.buf;
      if (!buf) return '';
      const mime = String(conv.mime || 'image/png');
      return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
    })
    .filter(Boolean);
}

function firstConfiguredVideoModel(value) {
  return String(value || '')
    .split(/[\r\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)[0] || '';
}

function parseConfiguredModelList(value) {
  return String(value || '')
    .split(/[\r\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function videoModelProtocol(settings, modelId) {
  const raw = String((settings?.zhenzhenVideoModelProtocols || {})[String(modelId || '').trim()] || '').trim();
  if (raw === 'seedance-v3' || raw === 'videos') return raw;
  return '';
}

function isNewApiGrokImagineVideoModel(modelId) {
  const text = String(modelId || '').trim().toLowerCase();
  return text.includes('grok-imagine') && text.includes('video');
}

function isFetchedDefaultVideoModel(settings, ...modelIds) {
  const fetchedModels = Array.isArray(settings?.zhenzhenModelCatalog?.videoModels)
    ? settings.zhenzhenModelCatalog.videoModels
    : [];
  if (!fetchedModels.length) return false;
  const fetched = new Set(fetchedModels.map((item) => String(item || '').trim()).filter(Boolean));
  return modelIds.some((modelId) => fetched.has(String(modelId || '').trim()));
}

function defaultVideoSubmitProtocol(settings, requestedModel, effectiveModel, routeModel) {
  if (isFetchedDefaultVideoModel(settings, requestedModel, effectiveModel, routeModel)) return 'videos';
  if (isNewApiGrokImagineVideoModel(effectiveModel) || isNewApiGrokImagineVideoModel(requestedModel)) return 'videos';
  return '';
}

function resolveVideoSubmitProtocol(settings, requestedModel, effectiveModel, routeModel) {
  return videoModelProtocol(settings, routeModel)
    || videoModelProtocol(settings, requestedModel)
    || videoModelProtocol(settings, effectiveModel)
    || defaultVideoSubmitProtocol(settings, requestedModel, effectiveModel, routeModel)
    || '';
}

function resolveSeedanceSubmitProtocol(settings, requestedModel, effectiveModel) {
  const explicitProtocol = videoModelProtocol(settings, requestedModel)
    || videoModelProtocol(settings, effectiveModel)
    || videoModelProtocol(settings, 'seedance-2.0');
  if (explicitProtocol) return explicitProtocol;
  if (firstConfiguredVideoModel(settings?.zhenzhenVideoModelOverrides?.['seedance-2.0'])) return 'videos';
  return 'seedance-v3';
}

function resolveVideosApiSeedanceModel(_settings, requestedModel, effectiveModel) {
  const requested = String(requestedModel || '').trim();
  const effective = String(effectiveModel || '').trim();
  if (requested) return requested;
  if (effective) return effective;
  return effective || requested;
}

function resolveVideoModelOverride(settings, model) {
  const requestedModel = String(model || '').trim();
  return requestedModel;
}

function resolveSeedanceVideoModelOverride(_settings, model) {
  return String(model || '').trim();
}

// ========== 工具: 以提示词为准，将 settings.zhenzhenApiKey 临时覆盖为分类 key ==========
// 调用后，后续所有 settings.zhenzhenApiKey 引用默认都会拿到分类 key（零侵入原逻辑）。
function applyClassifiedKey(settings, hint) {
  if (!settings) return;
  const picked = pickApiKey(settings, hint);
  if (picked) settings.zhenzhenApiKey = picked;
}

// ========== v1.2.9.15 新增：「专属优先 fallback 通用」一体化 API Key 校验 ==========
// 修复 v1.2.9.14 之前的两类 bug：
//   ① 旧路由先校验 settings.zhenzhenApiKey 非空 → 再 applyClassifiedKey；
//      若用户「只配置了分类专属 key 而通用 key 留空」，会被第一道检查误拦，
//      报「未配置通用服务 API Key」，但其实专属 key 已存在；
//   ② 即使 zhenzhenApiKey 是错误值（如 '123'），按旧顺序通过校验后 applyClassifiedKey
//      仍能用 sunoApiKey 覆盖，但用户错配了 audio/upload 这类「完全没调 applyClassifiedKey」
//      的子路由 → Suno 上传步骤直接用 zhenzhenApiKey='123' 上传 → 上游返回令牌错误。
//
// 用法：
//   const settings = currentSettings();
//   if (!ensureKey(settings, res, 'suno', 'Suno')) return;
//   // 此时 settings.zhenzhenApiKey 已是 effective key（专属优先 fallback 通用），
//   // 后续直接 `Bearer ${settings.zhenzhenApiKey}` 即可。
//
// 副作用：成功时（return true）已对 settings 做 applyClassifiedKey；
//        失败时（return false）已通过 res 写入 400 响应，调用方应直接 return。
//
// 设计原则：
//   - 「专属优先」：sunoApiKey 非空 → 用 sunoApiKey；
//   - 「通用 fallback」：sunoApiKey 留空但 zhenzhenApiKey 非空 → 用 zhenzhenApiKey；
//   - 「双空才拒」：两者都空时报「分类专属 + 通用 至少填其一」。
function ensureKey(settings, res, hint, label) {
  if (!settings) {
    res.status(400).json({ success: false, error: '未找到 settings 文件，请先在【设置】中配置 API Key' });
    return false;
  }
  applyClassifiedKey(settings, hint || '');
  if (!settings.zhenzhenApiKey) {
    const tip = label
      ? `未配置 ${label} 专属 API Key，且通用服务 API Key 也为空（请在【设置】中至少填写其中一个）`
      : '未配置通用服务 API Key（请在【设置】中填写）';
    res.status(400).json({ success: false, error: tip });
    return false;
  }
  if (!ensureDefaultServiceBaseUrl(settings, res, '通用服务')) return false;
  return true;
}

function ensureDefaultZhenzhenKey(settings, res, label = '通用服务') {
  if (!settings) {
    res.status(400).json({ success: false, error: '未找到 settings 文件，请先在【设置】中配置 API Key' });
    return false;
  }
  if (!settings.zhenzhenApiKey) {
    res.status(400).json({ success: false, error: `${label} 使用通用服务 API Key，请先在【设置】中填写通用服务 API Key` });
    return false;
  }
  if (!ensureDefaultServiceBaseUrl(settings, res, label)) return false;
  return true;
}

// ========== 工具: taskId → 实际使用的 apiKey 内存映射 ==========
// submit 阶段根据 hint 选了分类 key 后，将 (taskId → key) 记下，
// query/status 阶段优先从该 Map 恢复 key，
// 防止前端未透传 model 时轮询错误 fallback 到通用 key 导致“令牌不合法”。
// 3 小时过期自清：前端视频轮询最长 60 分钟，长任务/页面恢复不能在中途丢 key/protocol。
const TASK_KEY_TTL_MS = 3 * 60 * 60 * 1000;
const taskKeyMap = new Map();
function rememberTaskKey(taskId, apiKey, meta = {}) {
  if (!taskId || !apiKey) return;
  taskKeyMap.set(String(taskId), { apiKey, ...meta });
  const timer = setTimeout(() => taskKeyMap.delete(String(taskId)), TASK_KEY_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}
function recallTaskMeta(taskId) {
  if (!taskId) return null;
  const item = taskKeyMap.get(String(taskId));
  if (!item) return null;
  return typeof item === 'string' ? { apiKey: item } : item;
}
function recallTaskKey(taskId) {
  return recallTaskMeta(taskId)?.apiKey || null;
}

// ========== 工具:保存上游返回的图像到本地 ==========
async function saveRemoteImage(url) {
  const fetchUrl = normalizeRemoteMediaUrl(url);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(fetchUrl, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!res.ok) throw new Error(`下载失败: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (fetchUrl.match(/\.(png|jpe?g|webp|gif)/i)?.[1] || 'png').toLowerCase();
    const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const filePath = path.join(config.OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, buf);
    return `/files/output/${filename}`;
  } catch (e) {
    console.error('⚠ 转存图像失败:', e.message);
    return fetchUrl || url; // 退化:返回可被前端解析的原 URL
  }
}

// ========== 工具:保存上游返回的音频到本地 ==========
async function saveRemoteAudio(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (url.match(/\.(mp3|wav|m4a|ogg|flac|aac)/i)?.[1] || 'mp3').toLowerCase();
    const filename = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const filePath = path.join(config.OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, buf);
    return `/files/output/${filename}`;
  } catch (e) {
    console.error('⚠ 转存音频失败:', e.message);
    return url; // 退化:返回原 URL
  }
}

// 处理 b64_json 格式
function saveBase64Image(b64) {
  try {
    const raw = String(b64 || '');
    const clean = raw.includes(',') ? raw.split(',').pop() : raw;
    const buf = Buffer.from(clean || '', 'base64');
    const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
    const filePath = path.join(config.OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, buf);
    return `/files/output/${filename}`;
  } catch (e) {
    console.error('⚠ 解析 b64 失败:', e.message);
    return null;
  }
}

// ========== POST /api/proxy/image — 图像生成 ==========
// body: { model, apiModel?, paramKind?, prompt, aspect_ratio?, image_size?, images?[], size?, image?, quality?, n? }
//
// 主项目对齐的双协议路由:
//  1. paramKind === 'gpt-size'
//     - 无参考图 → POST /v1/images/generations (JSON)  body: { model, prompt, size }
//     - 有参考图 → POST /v1/images/edits        (multipart) image 多次 append
//     - size 从 (aspect_ratio + image_size 等级) 映射为像素串(1024x1024/1536x1024/1024x1536/2048x2048…)
//  2. paramKind === 'banana-ratio'
//     - POST /v1/images/generations (JSON) body: { model, prompt, aspect_ratio, image_size:'1K'|'2K'|'4K', image:[base64...]? }

// ========== 主项目 gpt-image-2-web 完整 GPT_SIZE_MAP(line 2173)==========
const GPT_SIZE_MAP = {
  '1:1_1k': '1024x1024', '1:1_2k': '2048x2048', '1:1_4k': '2880x2880',
  '3:2_1k': '1248x832',  '3:2_2k': '2496x1664', '3:2_4k': '3504x2336',
  '2:3_1k': '832x1248',  '2:3_2k': '1664x2496', '2:3_4k': '2336x3504',
  '4:3_1k': '1152x864',  '4:3_2k': '2304x1728', '4:3_4k': '3264x2448',
  '3:4_1k': '864x1152',  '3:4_2k': '1728x2304', '3:4_4k': '2448x3264',
  '5:4_1k': '1120x896',  '5:4_2k': '2240x1792', '5:4_4k': '3200x2560',
  '4:5_1k': '896x1120',  '4:5_2k': '1792x2240', '4:5_4k': '2560x3200',
  '16:9_1k': '1280x720', '16:9_2k': '2560x1440', '16:9_4k': '3840x2160',
  '9:16_1k': '720x1280', '9:16_2k': '1440x2560', '9:16_4k': '2160x3840',
  '2:1_1k': '2048x1024', '2:1_2k': '2688x1344', '2:1_4k': '3840x1920',
  '1:2_1k': '1024x2048', '1:2_2k': '1344x2688', '1:2_4k': '1920x3840',
  '21:9_1k': '1456x624', '21:9_2k': '3024x1296', '21:9_4k': '3696x1584',
  '9:21_1k': '624x1456', '9:21_2k': '1296x3024', '9:21_4k': '1584x3696',
  '3:1_1k': '1536x512', '3:1_2k': '3072x1024', '3:1_4k': '3840x1280',
  '1:3_1k': '512x1536', '1:3_2k': '1024x3072', '1:3_4k': '1280x3840',
};

// 将 (aspectRatio + sizeLevel) 用主项目 GPT_SIZE_MAP 映射成像素串;Auto 返 'auto'
function aspectToGptSize(aspectRatio, sizeLevel) {
  const ar = String(aspectRatio || '').trim();
  const lvl = String(sizeLevel || '1K').toLowerCase();
  const isAuto = !ar || ar === 'Auto' || ar === 'AUTO' || ar === 'empty';
  if (isAuto) return 'auto';
  const key = `${ar}_${lvl}`;
  return GPT_SIZE_MAP[key] || '1024x1024';
}

const AZURE_GPT_IMAGE_RATIO_ALIASES = {
  '4:1': '3:1',
  '8:1': '3:1',
  '1:4': '1:3',
  '1:8': '1:3',
};

function aspectToAzureGptImageSize(aspectRatio, sizeLevel) {
  const rawAspect = String(aspectRatio || '').trim();
  const isAuto = !rawAspect || rawAspect === 'Auto' || rawAspect === 'AUTO' || rawAspect === 'empty';
  if (isAuto) return 'auto';
  const azureAspect = AZURE_GPT_IMAGE_RATIO_ALIASES[rawAspect] || rawAspect;
  return aspectToGptSize(azureAspect, sizeLevel);
}

const GPT_OPENAI_IMAGE_SIZES = new Set([
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '2048x2048',
  '2048x1152',
  '3840x2160',
  '2160x3840',
  'auto',
]);

function parseAspectRatio(aspectRatio) {
  const match = String(aspectRatio || '').trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function aspectToGptOpenAiSize(aspectRatio, sizeLevel) {
  const candidate = aspectToGptSize(aspectRatio, sizeLevel);
  if (GPT_OPENAI_IMAGE_SIZES.has(candidate)) return candidate;
  const ar = String(aspectRatio || '').trim();
  const lvl = String(sizeLevel || '1K').toLowerCase();
  const parsed = parseAspectRatio(ar);
  if (!parsed) return 'auto';
  if (parsed.width === parsed.height) return lvl === '1k' ? '1024x1024' : '2048x2048';
  if (parsed.width > parsed.height) {
    if (ar === '16:9' || ar === '21:9' || ar === '2:1') return lvl === '4k' ? '3840x2160' : '2048x1152';
    return '1536x1024';
  }
  if (ar === '9:16' || ar === '9:21' || ar === '1:2') return lvl === '4k' ? '2160x3840' : '1024x1536';
  return '1024x1536';
}

function shouldRetryGptImageSize(response, text) {
  if (!response || response.ok) return false;
  return isGptImageSizeError(text);
}

function isGptImageSizeError(text) {
  return /image size|allowed sizes|尺寸|大小|分辨率/i.test(String(text || ''));
}

function shouldRetryGptImageFieldStrategy(response, text) {
  if (!response || response.ok) return false;
  return /unknown|unrecognized|unsupported parameter|invalid parameter|unexpected|not allowed|not permitted|字段|参数/i.test(String(text || ''));
}

async function responseTextForRetry(response) {
  try {
    const readable = response?.clone ? response.clone() : response;
    return await readable.text();
  } catch {
    return '';
  }
}

function imageRequestProtocolConfig(paramKind, routeKind) {
  const config = MODEL_PROTOCOL_REGISTRY.defaultService?.imageRequestProtocols?.[paramKind]?.[routeKind];
  return config && typeof config === 'object' ? config : {};
}

function requestProtocolFields(config, variant, fallback) {
  const fields = config?.[variant]?.fields;
  if (Array.isArray(fields) && fields.length) return fields;
  return fallback;
}

function setRequestField(target, name, value) {
  if (value == null) return;
  if (target && typeof target.append === 'function') {
    target.append(name, String(value));
    return;
  }
  target[name] = value;
}

function gptImageSizeFieldValue(field, { pixelSize, aspectRatio, isAuto, lvlLower, lvlUpper }) {
  if (field === 'size') return pixelSize && pixelSize !== 'auto' ? pixelSize : undefined;
  if (field === 'aspectRatio') return isAuto ? '' : aspectRatio;
  if (field === 'aspect_ratio') return isAuto ? '1:1' : aspectRatio;
  if (field === 'resolution') return lvlLower;
  if (field === 'image_size') return lvlUpper;
  return undefined;
}

function appendGptImageSizeFields(target, fields, values) {
  for (const field of Array.isArray(fields) ? fields : []) {
    setRequestField(target, field, gptImageSizeFieldValue(field, values));
  }
  return target;
}

function buildAsyncImageRetryMeta({
  routeModelId,
  originalApiModel,
  finalApiModel,
  paramKind,
  prompt,
  n,
  aspect_ratio,
  image_size,
  refs,
  size,
  quality,
}) {
  if (paramKind !== 'gpt-size' || !Array.isArray(refs) || refs.length === 0) return null;
  const ar = String(aspect_ratio || '').trim();
  const lvlLower = String(image_size || '1K').toLowerCase();
  const initialSize = size || aspectToGptSize(ar, lvlLower);
  const fallbackSize = aspectToGptOpenAiSize(ar, lvlLower);
  if (!fallbackSize || fallbackSize === initialSize) return null;
  return {
    routeModelId,
    originalApiModel,
    finalApiModel,
    paramKind,
    prompt,
    n,
    aspect_ratio,
    image_size,
    refs: refs.slice(0, 8),
    size,
    quality,
    initialSize,
    fallbackSize,
  };
}

async function retryImageTaskAfterAsyncFailure({ settings, apiKey, oldTaskId, meta, errorText }) {
  const retry = meta?.imageRetry;
  if (!retry || meta?.imageRetryAttempted || !isGptImageSizeError(errorText)) return null;
  const fallbackSize = retry.fallbackSize || aspectToGptOpenAiSize(retry.aspect_ratio, String(retry.image_size || '1K').toLowerCase());
  if (!fallbackSize || fallbackSize === retry.initialSize) return null;
  console.warn('[upstream] GPT2 async task size retry after status failure:', retry.initialSize || retry.size || 'auto', '→', fallbackSize);
  const r = await callImageUpstreamAsync({
    settings,
    routeModelId: retry.routeModelId,
    apiKey,
    originalApiModel: retry.originalApiModel,
    finalApiModel: retry.finalApiModel,
    paramKind: retry.paramKind,
    prompt: retry.prompt,
    n: retry.n,
    aspect_ratio: retry.aspect_ratio,
    image_size: retry.image_size,
    refs: retry.refs,
    size: fallbackSize,
    quality: retry.quality,
    forceAsync: true,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  if (!r.ok) {
    return { kind: 'failed', error: data?.error?.message || data?.message || `上游 HTTP ${r.status}`, raw: data };
  }
  const norm = await normalizeImageResponse(data);
  if (norm.kind === 'async') {
    const nextMeta = {
      ...meta,
      imageRetryAttempted: true,
      retryTaskId: norm.taskId,
      imageStatusKind: r.__t8ImageStatusKind || meta?.imageStatusKind || 'edits',
    };
    rememberTaskKey(oldTaskId, apiKey, nextMeta);
    rememberTaskKey(norm.taskId, apiKey, nextMeta);
    return { kind: 'async', taskId: norm.taskId, raw: data };
  }
  if (norm.kind === 'sync') {
    return { kind: 'sync', urls: norm.urls, raw: data };
  }
  if (norm.kind === 'failed') {
    return { kind: 'failed', error: norm.error, raw: data };
  }
  return { kind: 'failed', error: '重试后上游未返回图片也未返 task_id', raw: data };
}

function imageMimeFromLocalPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase().replace(/^\./, '');
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    avif: 'image/avif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return map[ext] || 'image/png';
}

function mediaMimeFromLocalPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase().replace(/^\./, '');
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    avif: 'image/avif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
  };
  return map[ext] || imageMimeFromLocalPath(filePath);
}

function assertInsideDir(root, target) {
  const base = path.resolve(root);
  const full = path.resolve(target);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function toLocalPathnameIfSameApp(url) {
  const raw = String(url || '').trim();
  try {
    const u = new URL(raw);
    const host = String(u.hostname || '').toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
      return decodeURIComponent(u.pathname || '');
    }
  } catch {
    // Relative app URLs stay on the normal path below.
  }
  return raw;
}

function resolveStaticImagePath(ref) {
  const raw = toLocalPathnameIfSameApp(ref);
  const candidates = [
    ['/files/input/', config.INPUT_DIR],
    ['/input/', config.INPUT_DIR],
    ['/files/output/', config.OUTPUT_DIR],
    ['/output/', config.OUTPUT_DIR],
    ['/files/thumbnails/', config.THUMBNAILS_DIR],
  ];
  for (const [prefix, root] of candidates) {
    if (!raw.startsWith(prefix)) continue;
    const rel = decodeURIComponent(raw.slice(prefix.length).split('?')[0].split('#')[0]);
    return assertInsideDir(root, path.join(root, rel));
  }
  return null;
}

function readLocalImageRefBuffer(ref) {
  const full = resolveStaticImagePath(ref);
  if (!full || !fs.existsSync(full)) return null;
  const mime = imageMimeFromLocalPath(full);
  return {
    buf: fs.readFileSync(full),
    mime,
    ext: safeOutputExt(path.extname(full), 'png'),
  };
}

function readLocalMediaRefBuffer(ref) {
  const full = resolveStaticImagePath(ref);
  if (!full || !fs.existsSync(full)) return null;
  const mime = mediaMimeFromLocalPath(full);
  return {
    buf: fs.readFileSync(full),
    mime,
    ext: safeOutputExt(path.extname(full), extFromContentType(mime) || 'bin'),
  };
}

function getResourceLibraryRootForProxy() {
  const settings = loadRawSettings() || {};
  return String(settings.resourceLibraryPath || config.DEFAULT_RESOURCE_LIBRARY_DIR || '').trim();
}

function readResourceLibraryDbForProxy(root) {
  if (!root) return null;
  const dbPath = path.join(root, 'resource_library.json');
  if (!fs.existsSync(dbPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function resolveResourceImageRef(ref) {
  const clean = toLocalPathnameIfSameApp(ref).split(/[?#]/)[0];
  const fileMatch = /^\/api\/resources\/file\/([^/?#]+)/.exec(clean);
  const setFileMatch = /^\/api\/resources\/set-file\/([^/?#]+)\/(\d+)/.exec(clean);
  if (!fileMatch && !setFileMatch) return null;

  const root = getResourceLibraryRootForProxy();
  const db = readResourceLibraryDbForProxy(root);
  const items = Array.isArray(db?.items) ? db.items : [];
  if (!root || items.length === 0) return null;

  if (fileMatch) {
    const id = decodeURIComponent(fileMatch[1]);
    const item = items.find((entry) => entry?.id === id);
    const fileRel = String(item?.fileRel || '').trim();
    if (!item || !fileRel) return null;
    const full = assertInsideDir(root, path.join(root, fileRel));
    if (!full) return null;
    return {
      full,
      mime: item.mime || imageMimeFromLocalPath(full),
      ext: safeOutputExt(path.extname(full), 'png'),
    };
  }

  const id = decodeURIComponent(setFileMatch[1]);
  const index = Number(setFileMatch[2]);
  const item = items.find((entry) => entry?.id === id);
  const children = Array.isArray(item?.materialSetItems) ? item.materialSetItems : [];
  const child = Number.isFinite(index) ? children[index] : null;
  const fileRel = String(child?.fileRel || '').trim();
  if (!child || !fileRel) return null;
  const full = assertInsideDir(root, path.join(root, fileRel));
  if (!full) return null;
  return {
    full,
    mime: child.mime || imageMimeFromLocalPath(full),
    ext: safeOutputExt(path.extname(full), 'png'),
  };
}

function readResourceImageRefBuffer(ref) {
  const resolved = resolveResourceImageRef(ref);
  if (!resolved || !fs.existsSync(resolved.full)) return null;
  const mime = String(resolved.mime || imageMimeFromLocalPath(resolved.full)).toLowerCase();
  if (mime && !mime.startsWith('image/')) return null;
  return {
    buf: fs.readFileSync(resolved.full),
    mime: resolved.mime || imageMimeFromLocalPath(resolved.full),
    ext: resolved.ext || safeOutputExt(path.extname(resolved.full), 'png'),
  };
}

// 将 base64 dataURL / http(s) URL 转成 multipart Buffer
async function refToBuffer(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref.startsWith('data:')) {
    const m = ref.match(/^data:([^;,]+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1] || 'image/png';
    const buf = Buffer.from(m[2], 'base64');
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return { buf, mime, ext };
  }
  if (
    ref.startsWith('http://') ||
    ref.startsWith('https://') ||
    ref.startsWith('/files/') ||
    ref.startsWith('/api/resources/file/') ||
    ref.startsWith('/api/resources/set-file/')
  ) {
    const local = readLocalMediaRefBuffer(ref);
    if (local) return local;
    const resource = readResourceImageRefBuffer(ref);
    if (resource) return resource;
    // /files/* 是本地静态,走 127.0.0.1:18766
    const url = ref.startsWith('/') ? `http://127.0.0.1:${config.PORT}${ref}` : ref;
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = (ct.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return { buf, mime: ct, ext };
  }
  return null;
}

function mediaUploadEndpointCandidates(settings) {
  const configured = zhenzhenBaseUrl(settings).replace(/\/+$/, '');
  const root = configured.replace(/\/v1$/i, '');
  return [
    `${root}/v1/media/uploads/presign`,
    `${root}/api/media/uploads/presign`,
  ].filter((item, index, arr) => item && arr.indexOf(item) === index);
}

function mediaUploadFilename(ref, kind, ext) {
  const text = String(ref || '').trim();
  const fallbackExt = safeOutputExt(ext, kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png');
  if (text && !text.startsWith('data:')) {
    try {
      const clean = text.split(/[?#]/)[0].replace(/\\/g, '/');
      const base = clean.split('/').filter(Boolean).pop() || '';
      if (base && /\.[a-z0-9]{2,8}$/i.test(base)) return base.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
    } catch {}
  }
  return `reference_${Date.now()}.${fallbackExt}`;
}

function presignUploadInfo(data) {
  const root = data && typeof data === 'object' ? data : {};
  const nested = root.data && typeof root.data === 'object' ? root.data : {};
  const uploadUrl = root.upload_url || root.uploadUrl || root.url || nested.upload_url || nested.uploadUrl || nested.url;
  const publicUrl = root.public_url || root.publicUrl || root.file_url || root.fileUrl || nested.public_url || nested.publicUrl || nested.file_url || nested.fileUrl;
  return {
    uploadUrl: String(uploadUrl || '').trim(),
    publicUrl: String(publicUrl || '').trim(),
  };
}

async function newApiPublicMediaUrl(settings, apiKey, ref, kind = 'image') {
  const text = String(ref || '').trim();
  if (!text) return '';
  if (/^(https?:\/\/|asset:\/\/)/i.test(text)) return text;
  const conv = await refToBuffer(text);
  if (!conv?.buf) return '';
  const fallbackMime = kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png';
  const mime = String(conv.mime || fallbackMime).split(';')[0].trim() || fallbackMime;
  if (kind === 'image' && !mime.toLowerCase().startsWith('image/')) return '';
  if (kind === 'video' && !mime.toLowerCase().startsWith('video/')) return '';
  if (kind === 'audio' && !mime.toLowerCase().startsWith('audio/')) return '';
  if (!apiKey) return '';
  const filename = mediaUploadFilename(text, kind, conv.ext || extFromContentType(mime));
  const body = {
    filename,
    content_type: mime,
    contentType: mime,
    size: conv.buf.length,
  };
  let lastError = '';
  for (const endpoint of mediaUploadEndpointCandidates(settings)) {
    try {
      const presign = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const presignText = await presign.text();
      let presignData = {};
      try { presignData = presignText ? JSON.parse(presignText) : {}; } catch {
        lastError = `presign 非 JSON ${presign.status}: ${presignText.slice(0, 160)}`;
        continue;
      }
      if (!presign.ok) {
        lastError = getUpstreamErrorMessage(presignData, presignText, presign.status);
        continue;
      }
      const info = presignUploadInfo(presignData);
      if (!info.uploadUrl || !info.publicUrl) {
        lastError = `presign 未返回 upload_url/public_url: ${presignText.slice(0, 180)}`;
        continue;
      }
      const uploaded = await fetch(info.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: conv.buf,
      });
      if (!uploaded.ok) {
        let uploadText = '';
        try { uploadText = await uploaded.text(); } catch {}
        lastError = `PUT 上传 HTTP ${uploaded.status}: ${uploadText.slice(0, 160)}`;
        continue;
      }
      return info.publicUrl;
    } catch (error) {
      lastError = error?.message || String(error || '');
    }
  }
  try {
    const root = zhenzhenBaseUrl(settings).replace(/\/+$/, '').replace(/\/v1$/i, '');
    const form = new FormData();
    form.append('file', new Blob([conv.buf], { type: mime }), filename);
    const direct = await fetch(`${root}/v1/media/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const directText = await direct.text();
    let directData = {};
    try { directData = directText ? JSON.parse(directText) : {}; } catch {}
    if (direct.ok) {
      const info = presignUploadInfo(directData);
      if (info.publicUrl) return info.publicUrl;
    }
    lastError = getUpstreamErrorMessage(directData, directText, direct.status);
  } catch (error) {
    lastError = error?.message || String(error || '');
  }
  if (lastError) console.warn('[newapi] media upload failed:', lastError);
  return '';
}

async function newApiPublicMediaUrlList(settings, apiKey, refs, kind = 'image') {
  const rawRefs = Array.isArray(refs) ? refs : [];
  const out = [];
  for (const ref of rawRefs) {
    const url = await newApiPublicMediaUrl(settings, apiKey, ref, kind);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

async function publicizeChatMessageMedia(settings, apiKey, messages) {
  if (!Array.isArray(messages) || !apiKey) return messages;
  const out = JSON.parse(JSON.stringify(messages));
  for (const msg of out) {
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (!part || typeof part !== 'object') continue;
      const imageUrl = part.image_url && typeof part.image_url === 'object' ? part.image_url : null;
      if (imageUrl && typeof imageUrl.url === 'string') {
        const publicUrl = await newApiPublicMediaUrl(settings, apiKey, imageUrl.url, 'image');
        if (publicUrl) imageUrl.url = publicUrl;
      }
      const videoUrl = part.video_url && typeof part.video_url === 'object' ? part.video_url : null;
      if (videoUrl && typeof videoUrl.url === 'string') {
        const publicUrl = await newApiPublicMediaUrl(settings, apiKey, videoUrl.url, 'video');
        if (publicUrl) videoUrl.url = publicUrl;
      }
      const inputVideo = part.input_video && typeof part.input_video === 'object' ? part.input_video : null;
      if (inputVideo && typeof inputVideo.url === 'string') {
        const publicUrl = await newApiPublicMediaUrl(settings, apiKey, inputVideo.url, 'video');
        if (publicUrl) inputVideo.url = publicUrl;
      }
    }
  }
  return out;
}

function summarizeImageRef(ref, index) {
  const text = String(ref || '').trim();
  if (!text) return `#${index + 1} 空引用`;
  if (text.startsWith('data:')) {
    const mime = text.match(/^data:([^;,]+)/)?.[1] || 'image';
    return `#${index + 1} data:${mime};base64,...`;
  }
  return `#${index + 1} ${text.length > 140 ? `${text.slice(0, 96)}...${text.slice(-24)}` : text}`;
}

async function collectConvertedImageRefs(refs, label = '参考图') {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const convertedRefs = [];
  const failedRefs = [];
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    try {
      const conv = await refToBuffer(ref);
      if (!conv) {
        failedRefs.push({ index: i, ref, reason: '读取结果为空或 HTTP 非成功' });
        continue;
      }
      const mime = String(conv.mime || '').toLowerCase();
      if (mime && !mime.startsWith('image/')) {
        failedRefs.push({ index: i, ref, reason: `非图片内容 ${conv.mime}` });
        continue;
      }
      convertedRefs.push({ ...conv, index: i, ref });
    } catch (error) {
      failedRefs.push({ index: i, ref, reason: error?.message || '读取异常' });
    }
  }
  if (refs.length > 0 && convertedRefs.length === 0) {
    const preview = failedRefs
      .slice(0, 3)
      .map((item) => `${summarizeImageRef(item.ref, item.index)} ${item.reason}`)
      .join('；');
    throw new Error(`${label}读取失败，已中止生成，避免按无参考图生成${preview ? `：${preview}` : ''}`);
  }
  if (failedRefs.length > 0) {
    const preview = failedRefs
      .slice(0, 3)
      .map((item) => `${summarizeImageRef(item.ref, item.index)} ${item.reason}`)
      .join('；');
    console.warn(`[upstream] ${label}部分读取失败 converted=${convertedRefs.length}/${refs.length}: ${preview}`);
  }
  return convertedRefs;
}

function appendConvertedImagesToForm(form, convertedRefs, fieldName = 'image') {
  for (let i = 0; i < convertedRefs.length; i++) {
    const conv = convertedRefs[i];
    const blob = new Blob([conv.buf], { type: conv.mime || 'image/png' });
    const ext = safeOutputExt(conv.ext, 'png');
    form.append(fieldName, blob, `image_${Number.isFinite(conv.index) ? conv.index : i}.${ext}`);
  }
}

// 将 base64/URL 参考图转成 banana 希望的 dataURL 或保留外部 URL
function isLocalImageDataRef(ref) {
  return (
    typeof ref === 'string' &&
    (
      ref.startsWith('/files/') ||
      ref.startsWith('/api/resources/file/') ||
      ref.startsWith('/api/resources/set-file/')
    )
  );
}

async function localImageRefToDataUrl(ref) {
  const conv = await refToBuffer(ref);
  if (!conv) return null;
  const mime = String(conv.mime || 'image/png');
  if (!mime.toLowerCase().startsWith('image/')) return null;
  return `data:${mime};base64,${conv.buf.toString('base64')}`;
}

async function refToBananaImage(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref.startsWith('data:')) return ref;
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;
  if (
    ref.startsWith('/files/') ||
    ref.startsWith('/api/resources/file/') ||
    ref.startsWith('/api/resources/set-file/')
  ) {
    // 本地资源 → 转 base64
    try {
      return await localImageRefToDataUrl(ref);
    } catch { return null; }
  }
  return null;
}

// Grok Image 默认按 gpt-image-2-web 的 Base64 方式传参考图,最多 4 张。
async function refToGrokImage(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref.startsWith('data:')) return ref.startsWith('data:image') ? ref : null;
  if (
    ref.startsWith('http://') ||
    ref.startsWith('https://') ||
    ref.startsWith('/files/') ||
    ref.startsWith('/api/resources/file/') ||
    ref.startsWith('/api/resources/set-file/')
  ) {
    try {
      if (isLocalImageDataRef(ref)) return await localImageRefToDataUrl(ref);
      const url = ref.startsWith('/') ? `http://127.0.0.1:${config.PORT}${ref}` : ref;
      const r = await fetch(url);
      if (!r.ok) return ref.startsWith('http') ? ref : null;
      const ct = r.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await r.arrayBuffer());
      if (!String(ct).toLowerCase().startsWith('image/')) return null;
      return `data:${ct};base64,${buf.toString('base64')}`;
    } catch {
      // 外网图片转 base64 失败时保留 URL,避免破坏已有可公网访问的上游图。
      return ref.startsWith('http') ? ref : null;
    }
  }
  return null;
}

function imageTaskIdFromString(value) {
  const s = String(value || '').trim();
  if (!s || /^data:image\//i.test(s)) return '';
  const endpointMatch = s.match(/(?:^|\/)(?:v\d+\/)?images\/(?:tasks|generations|edits)\/([^/?#\s]+)/i);
  if (endpointMatch?.[1]) {
    try {
      return decodeURIComponent(endpointMatch[1]);
    } catch {
      return endpointMatch[1];
    }
  }
  return /^[A-Za-z0-9_-]{8,256}$/.test(s) ? s : '';
}

function isImageTaskString(s) {
  return Boolean(imageTaskIdFromString(s));
}

function imageTaskId(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
  for (const k of ['task_id', 'id', 'request_id', 'response_url', 'responseUrl']) {
    if (result[k]) return imageTaskIdFromString(result[k]) || String(result[k]);
  }
  const d = result.data;
  if (typeof d === 'string') return imageTaskIdFromString(d);
  if (d && typeof d === 'object') {
    for (const k of ['task_id', 'id', 'request_id', 'response_url', 'responseUrl']) {
      if (d[k]) return imageTaskIdFromString(d[k]) || String(d[k]);
    }
  }
  return '';
}

function imageError(result) {
  if (!result) return '';
  if (typeof result === 'string') return result.substring(0, 500);
  if (Array.isArray(result)) return JSON.stringify(result.slice(0, 3)).substring(0, 500);
  if (typeof result !== 'object') return '';
  for (const k of ['detail', 'fail_reason', 'error', 'message']) {
    const v = result[k];
    if (!v) continue;
    if (typeof v === 'string') return v.substring(0, 500);
    if (typeof v === 'object') return String(v.message || v.detail || JSON.stringify(v)).substring(0, 500);
  }
  const d = result.data;
  if (d && typeof d === 'object') {
    const nested = imageError(d);
    if (nested) return nested;
  }
  return '';
}

function summarizeImageDebugPayload(value, max = 500) {
  if (value == null) return '';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, max);
  try {
    return JSON.stringify(value).replace(/\s+/g, ' ').trim().slice(0, max);
  } catch {
    return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
  }
}

function extractImageUpstreamRequestId(result) {
  const fromText = (text) => {
    const s = String(text || '');
    if (!s) return '';
    const m = s.match(/request[_\s-]*id\s*[:：]\s*([A-Za-z0-9._:-]+)/i);
    return m?.[1] ? String(m[1]) : '';
  };
  const walk = (value, depth = 0) => {
    if (!value || depth > 4) return '';
    if (typeof value === 'string') return fromText(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return '';
    }
    if (typeof value !== 'object') return '';
    for (const key of ['request_id', 'requestId', 'req_id', 'reqId', 'id']) {
      const raw = value[key];
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
    }
    for (const key of ['message', 'detail']) {
      const found = fromText(value[key]);
      if (found) return found;
    }
    for (const key of ['error', 'data']) {
      const found = walk(value[key], depth + 1);
      if (found) return found;
    }
    return '';
  };
  return walk(result);
}

function buildImageUpstreamErrorMessage(result, fallback = '') {
  const base = imageError(result) || String(fallback || '').trim() || '上游图像任务失败';
  const requestId = extractImageUpstreamRequestId(result);
  if (!requestId || new RegExp(`request[_\\s-]*id\\s*[:：]\\s*${requestId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(base)) {
    return base;
  }
  return `${base} (request id: ${requestId})`;
}

function imageApiFailed(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const code = String(result.code ?? '').toLowerCase();
  if (code && !['success', 'ok', '0', '200'].includes(code)) return true;
  if (result.detail || result.error) return true;
  return false;
}

function imageStatus(result) {
  if (!result || typeof result !== 'object') return '';
  for (const k of ['status', 'task_status', 'state']) {
    if (result[k]) return String(result[k]).toUpperCase();
  }
  const d = result.data;
  if (d && typeof d === 'object') {
    for (const k of ['status', 'task_status', 'state']) {
      if (d[k]) return String(d[k]).toUpperCase();
    }
  }
  return '';
}

function imageStatusUrlCandidates(settings, taskId, preferredKind = '') {
  const tid = String(taskId || '').trim();
  const imageApiRoot = zhenzhenBaseUrl(settings).endsWith('/v1') ? zhenzhenBaseUrl(settings) : `${zhenzhenBaseUrl(settings)}/v1`;
  const order = preferredKind === 'generations'
    ? ['tasks', 'generations', 'edits']
    : ['tasks', 'edits', 'generations'];
  return order.map((kind) => ({
    kind,
    url: `${imageApiRoot}/images/${kind}/${encodeURIComponent(tid)}`,
  }));
}

function isTransientImageTaskHttpStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(Number(status));
}

function isExplicitImageTaskFailure(result) {
  const status = String(imageStatus(result) || '').toLowerCase();
  return ['failure', 'failed', 'error', 'cancelled', 'canceled'].includes(status);
}

function isTransientImageTaskState(result) {
  const status = String(imageStatus(result) || '').toLowerCase();
  return status === 'terminated';
}

async function fetchImageTaskStatus(settings, taskId, apiKey, preferredKind = '') {
  const candidates = imageStatusUrlCandidates(settings, taskId, preferredKind);
  let last = null;
  let completedWithoutOutput = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const r = await fetch(candidate.url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    const errorText = data?.error?.message || data?.message || imageError(data) || `上游 HTTP ${r.status}`;
    last = { response: r, data, errorText, candidate };
    if (r.ok && !imageApiFailed(data)) {
      const status = String(imageStatus(data) || '').toLowerCase();
      const urls = normalizeImageItems(data);
      if (urls.length) return last;
      if (['success', 'completed', 'complete', 'done', 'finished'].includes(status)) {
        completedWithoutOutput = last;
        if (i < candidates.length - 1) {
          console.warn('[upstream] image status completed without output, probing result endpoint:', candidate.kind, '→', candidates[i + 1].kind);
          continue;
        }
      }
      return completedWithoutOutput || last;
    }
    const routingMismatch = r.status === 400
      || r.status === 404
      || /no access to model|unknown task|not found|unsupported|invalid endpoint|不存在|无权限|没有权限/i.test(String(errorText || ''));
    if (!routingMismatch || i === candidates.length - 1) return last;
    console.warn('[upstream] image status fallback:', candidate.kind, '→', candidates[i + 1].kind, String(errorText || '').slice(0, 180));
  }
  return completedWithoutOutput || last;
}

function imageItems(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    const out = [];
    for (const item of result) {
      const nested = imageItems(item);
      if (nested.length) out.push(...nested);
      else if (item) out.push(item);
    }
    return out;
  }
  if (typeof result === 'string') {
    const s = result.trim();
    return s && !isImageTaskString(s) ? [s] : [];
  }
  if (typeof result !== 'object') return [];
  if (result.url || result.image_url || result.b64_json || result.base64 || result.image_base64) return [result];
  if (result.imageUrl || result.outputUrl || result.output_url || result.mediaUrl || result.media_url || result.fileUrl || result.file_url) return [result];
  if (result.inlineData || result.inline_data) return [result];
  if (normalizeGeminiFileDataImageUrl(result)) return [result];
  if ((result.mime_type || result.mimeType) && typeof result.data === 'string') return [result];
  const out = [];
  for (const k of ['media', 'media_url', 'mediaUrl', 'media_urls', 'mediaUrls', 'Media URL', 'Media URLs', 'images', 'image_urls', 'imageUrls', 'image', 'output_image', 'outputImage', 'url', 'output', 'outputs', 'output_url', 'outputUrl', 'output_urls', 'outputUrls', 'file_url', 'fileUrl', 'data', 'result', 'results', 'choices', 'message', 'candidates', 'content', 'parts']) {
    const v = result[k];
    if (!v) continue;
    if (Array.isArray(v)) {
      const nested = imageItems(v);
      if (nested.length) out.push(...nested);
      else out.push(...v);
      continue;
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || isImageTaskString(s)) continue;
      out.push(s);
      continue;
    }
    if (typeof v === 'object') {
      const nested = imageItems(v);
      if (nested.length) out.push(...nested);
    }
  }
  return out;
}

function normalizeInlineImageData(value, fallbackMime = 'image/png') {
  if (!value || typeof value !== 'object') return '';
  const inline = value.inlineData || value.inline_data;
  if (!inline || typeof inline !== 'object') return '';
  const data = String(inline.data || inline.b64_json || inline.base64 || '').trim();
  if (!data) return '';
  if (data.startsWith('data:image/')) return data;
  const mime = inline.mimeType || inline.mime_type || fallbackMime || 'image/png';
  return `data:${mime};base64,${data}`;
}

function normalizeGeminiFileDataImageUrl(value) {
  if (!value || typeof value !== 'object') return '';
  const fileData = value.fileData || value.file_data || value;
  if (!fileData || typeof fileData !== 'object') return '';
  const mime = String(fileData.mimeType || fileData.mime_type || '').trim().toLowerCase();
  if (mime && !mime.startsWith('image/')) return '';
  const fileUri = String(fileData.fileUri || fileData.file_uri || '').trim();
  return isRemoteMediaUrl(fileUri) ? normalizeRemoteMediaUrl(fileUri) : '';
}

function normalizeImageItems(result) {
  const normalized = imageItems(result).map((item) => {
    if (typeof item === 'string') {
      return isRemoteMediaUrl(item) ? { url: normalizeRemoteMediaUrl(item) } : { b64_json: item.startsWith('data:image') ? item : item };
    }
    if (item && typeof item === 'object') {
      const inlineImage = normalizeInlineImageData(item);
      if (inlineImage) return { b64_json: inlineImage };
      const geminiFileUrl = normalizeGeminiFileDataImageUrl(item);
      if (geminiFileUrl) return { url: geminiFileUrl };
      if ((item.mime_type || item.mimeType) && typeof item.data === 'string' && item.data.trim()) {
        const mime = item.mime_type || item.mimeType || 'image/png';
        return { b64_json: `data:${mime};base64,${String(item.data).trim()}` };
      }
      const directUrl = item.url
        || item.image_url
        || item.imageUrl
        || item.output_url
        || item.outputUrl
        || item.media_url
        || item.mediaUrl
        || item.file_url
        || item.fileUrl
        || item['Media URL']
        || (typeof item.image === 'string' && isRemoteMediaUrl(item.image) ? item.image : '');
      const url = directUrl ? normalizeRemoteMediaUrl(directUrl) : '';
      const b64 = item.b64_json || item.base64 || item.image_base64 || (!url && typeof item.image === 'string' ? item.image : '');
      if (url) return { url };
      if (b64) return { b64_json: b64 };
    }
    return null;
  }).filter(Boolean);
  const seen = new Set();
  return normalized.filter((item) => {
    const key = item.url ? `url:${item.url}` : `b64:${item.b64_json || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function saveImageItemsFromResult(result) {
  const urls = [];
  for (const it of normalizeImageItems(result)) {
    if (it?.b64_json) {
      const u = saveBase64Image(it.b64_json);
      if (u) urls.push(u);
    } else if (it?.url) {
      const u = await saveRemoteImage(it.url);
      urls.push(u);
    }
  }
  return urls;
}

// LLM 多模态 image_url 预处理:
//   上游 LLM 服务无法访问本地 /files/* 路径,需提前转成 base64 dataURL inline。
//   - data: 保留
//   - http(s):// 保留(上游可访问)
//   - /files/* → 本地拉 buffer 转 base64 dataURL
//   对齐 gpt-image-2-web chat 模式处理参考图的思路。
//   零破坏:对于 content 为字符串的普通文本消息不动;仅处理 content 为数组且含 image_url 部分。
async function normalizeLlmMessageImages(messages) {
  if (!Array.isArray(messages)) return messages;
  for (const msg of messages) {
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (!part || part.type !== 'image_url' || !part.image_url) continue;
      const url = part.image_url.url;
      if (typeof url !== 'string' || !url) continue;
      // 已是 base64 或外网 URL→不动
      if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) continue;
      // 本地路径→转 base64 dataURL
      if (url.startsWith('/files/')) {
        const dataUrl = await refToBananaImage(url);
        if (dataUrl) {
          part.image_url.url = dataUrl;
        } else {
          // 转换失败:报一个明确错误,避免上游 'base64:/files/...' 这种误导报错
          throw new Error(`本地图片读取失败: ${url}`);
        }
      }
      // 其它未知前缀:保留原值,让上游报真错误
    }
  }
  return messages;
}

function dataUrlToGeminiInlinePart(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1] || 'image/png';
  if (!mime.toLowerCase().startsWith('image/')) return null;
  return {
    inlineData: {
      mimeType: mime,
      data: match[2],
    },
  };
}

async function refToGeminiImagePart(ref) {
  const conv = await refToBuffer(ref);
  if (conv?.buf) {
    const mime = String(conv.mime || 'image/png');
    if (!mime.toLowerCase().startsWith('image/')) return null;
    return {
      inlineData: {
        mimeType: mime,
        data: conv.buf.toString('base64'),
      },
    };
  }
  const dataUrl = await refToBananaImage(ref);
  if (dataUrl?.startsWith('data:')) return dataUrlToGeminiInlinePart(dataUrl);
  if (typeof dataUrl === 'string' && /^https?:\/\//i.test(dataUrl)) {
    return {
      fileData: {
        mimeType: 'image/png',
        fileUri: dataUrl,
      },
    };
  }
  return null;
}

async function refToGeminiInteractionInputItem(ref) {
  const conv = await refToBuffer(ref);
  if (conv?.buf) {
    const mime = String(conv.mime || 'image/png');
    if (!mime.toLowerCase().startsWith('image/')) return null;
    return {
      type: 'image',
      mime_type: mime,
      data: conv.buf.toString('base64'),
    };
  }
  const dataUrl = await refToBananaImage(ref);
  const match = String(dataUrl || '').match(/^data:(image\/[^;,]+);base64,(.+)$/i);
  if (match) {
    return {
      type: 'image',
      mime_type: match[1] || 'image/png',
      data: match[2],
    };
  }
  return null;
}

async function callGaiscGeminiGenerateContentImageAsync({ settings, apiKey, finalApiModel, prompt, aspect_ratio, image_size, refs, forceAsync = false }) {
  const baseUrl = zhenzhenBaseUrl(settings);
  const parts = [{ text: prompt }];
  const hasRefs = Array.isArray(refs) && refs.length > 0;
  if (hasRefs) {
    for (const ref of refs) {
      const part = await refToGeminiImagePart(ref);
      if (part) parts.push(part);
    }
    if (parts.length === 1) {
      throw new Error('Gemini generateContent 参考图读取失败，已中止生成，避免按无参考图生成');
    }
  }
  const ar = String(aspect_ratio || '').trim();
  const isAuto = !ar || ar === 'Auto' || ar === 'AUTO' || ar === 'empty';
  const imageConfig = {};
  if (!isAuto) imageConfig.aspectRatio = ar;
  if (image_size) imageConfig.imageSize = String(image_size);
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
    },
  };
  const url = imageAsyncUrl(gaiscGeminiEndpointUrl(baseUrl, finalApiModel), forceAsync);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const authMode = isOfficialGeminiBaseUrl(baseUrl) ? 'x-goog-api-key' : 'bearer';
  if (authMode === 'x-goog-api-key') headers['x-goog-api-key'] = apiKey;
  else headers.Authorization = `Bearer ${apiKey}`;
  console.log('[upstream] Gemini generateContent image model:', finalApiModel, 'aspect_ratio:', isAuto ? 'Auto' : ar, 'size:', image_size || 'auto', 'auth:', authMode, { requested: refs?.length || 0, converted: parts.length - 1 });
  return await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function callGaiscGeminiInteractionsImageAsync({ settings, apiKey, finalApiModel, prompt, aspect_ratio, image_size, refs, n }) {
  const baseUrl = zhenzhenBaseUrl(settings);
  const input = [{ type: 'text', text: prompt }];
  const hasRefs = Array.isArray(refs) && refs.length > 0;
  if (hasRefs) {
    for (const ref of refs) {
      const item = await refToGeminiInteractionInputItem(ref);
      if (item?.data) input.push(item);
    }
    if (input.length === 1) {
      throw new Error('G-AISC nano-banana 参考图读取失败，已中止生成，避免按无参考图生成');
    }
  }
  const ar = String(aspect_ratio || '').trim();
  const isAuto = !ar || ar === 'Auto' || ar === 'AUTO' || ar === 'empty';
  const body = {
    model: finalApiModel,
    input,
    response_format: {
      type: 'image',
    },
  };
  if (!isAuto) body.response_format.aspect_ratio = ar;
  if (image_size) body.response_format.image_size = String(image_size);
  const count = Number(n) || 1;
  if (count > 1) body.n = count;
  const url = gaiscGeminiInteractionsEndpointUrl(baseUrl);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const authMode = isOfficialGeminiBaseUrl(baseUrl) ? 'x-goog-api-key' : 'bearer';
  if (authMode === 'x-goog-api-key') headers['x-goog-api-key'] = apiKey;
  else headers.Authorization = `Bearer ${apiKey}`;
  console.log('[upstream] G-AISC nano-banana Gemini interactions model:', finalApiModel, 'aspect_ratio:', isAuto ? 'Auto' : ar, 'size:', image_size || '2K', 'auth:', authMode, { requested: refs?.length || 0, converted: input.length - 1 });
  console.log('[upstream] Gemini interactions request:', summarizeImageDebugPayload({
    url,
    model: finalApiModel,
    auth: authMode,
    input,
    response_format: body.response_format,
    n: body.n || 1,
  }, 800));
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let responsePreview = '';
  try {
    if (typeof response?.clone === 'function') responsePreview = await response.clone().text();
  } catch {
    responsePreview = '';
  }
  console.log('[upstream] Gemini interactions response:', summarizeImageDebugPayload({
    status: response?.status,
    ok: !!response?.ok,
    body: responsePreview,
  }, 800));
  return response;
}

async function callGaiscGeminiImageAsync(options) {
  return await callGaiscGeminiInteractionsImageAsync(options);
}

async function callGaiscOpenAiCompatibleImageAsync({ settings, apiKey, finalApiModel, prompt, aspect_ratio, image_size, refs, n }) {
  const ar = String(aspect_ratio || '').trim();
  const isAuto = !ar || ar === 'Auto' || ar === 'AUTO' || ar === 'empty';
  const content = [{ type: 'text', text: prompt }];
  const hasRefs = Array.isArray(refs) && refs.length > 0;
  if (hasRefs) {
    for (const ref of refs) {
      const dataUrl = await refToBananaImage(ref);
      if (dataUrl) {
        content.push({
          type: 'image_url',
          image_url: { url: dataUrl },
        });
      }
    }
    if (content.length === 1) {
      throw new Error('G-AISC nano-banana 参考图读取失败，已中止生成，避免按无参考图生成');
    }
  }
  if (!isAuto || image_size) {
    const hints = [];
    if (!isAuto) hints.push(`aspect ratio: ${ar}`);
    if (image_size) hints.push(`image size: ${image_size}`);
    if (hints.length) content[0].text = `${prompt}\n\n${hints.join('\n')}`;
  }
  const body = {
    model: finalApiModel,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    response_format: { type: 'url' },
  };
  // 真正的 body 字段，供 New API / apishu 等中转解析（文本提示无法被解析）。
  if (!isAuto) { body.aspect_ratio = ar; body.ratio = ar; }
  if (image_size) { body.image_size = String(image_size); body.size = String(image_size); }
  body.n = Number(n) || 1;
  const url = gaiscChatCompletionsEndpointUrl(zhenzhenBaseUrl(settings));
  console.log('[upstream] G-AISC nano-banana OpenAI chat → /chat/completions model:', finalApiModel, 'aspect_ratio:', isAuto ? 'Auto' : ar, 'size:', image_size || '2K', { requested: refs?.length || 0, converted: content.length - 1 });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  return await retryBananaWithGeminiIfUnsupported(response, {
    settings,
    apiKey,
    finalApiModel,
    prompt,
    aspect_ratio,
    image_size,
    refs,
  });
}

function shouldFallbackBananaToGemini(response, text) {
  const body = String(text || '');
  if (response?.status === 405) return true;
  return /Images API is not supported for this platform|images\s+api.*not\s+supported|not\s+supported.*images\s+api|method\s+not\s+allowed/i.test(body);
}

async function retryBananaWithGeminiIfUnsupported(response, fallbackOptions) {
  let text = '';
  try {
    text = await response.clone().text();
  } catch {
    text = '';
  }
  if (!shouldFallbackBananaToGemini(response, text)) return response;
  console.warn('[upstream] nano-banana Images API unsupported, retrying with Gemini generateContent. 如这是 New API 中转，建议在设置里显式选择 Nano Banana Pro 协议。');
  return await callGaiscGeminiImageAsync(fallbackOptions);
}

// ========================================================================
// 核心 helper:完全对齐主项目 gpt-image-2-web 的上游调用
//   - GPT2 文生图默认走 OpenAI 兼容 /v1/images/generations 同步 JSON
//   - GPT2 带参考图时走 multipart /v1/images/edits?async=true
//   - GPT2 字段: prompt/model/n/quality/moderation/size(像素串)/aspectRatio(camelCase)/resolution(1k|2k|4k)
//   - nano-banana 文生图: JSON /generations?async=true { prompt, model, aspect_ratio, image_size }
//   - nano-banana 图生图: multipart /edits?async=true 添加 image 多个
//   - Grok Image: JSON /generations?async=true { model, prompt, aspect_ratio, image:[base64...]? }
// ========================================================================
function imageAsyncUrl(url, forceAsync) {
  if (!forceAsync) return url;
  if (/[?&]async=/i.test(url)) return url;
  return url.includes('?') ? `${url}&async=true` : `${url}?async=true`;
}

function appendAsyncJsonFields(body, forceAsync) {
  if (!forceAsync) return body;
  body.async = true;
  body.sync_mode = false;
  return body;
}

function appendAsyncFormFields(form, forceAsync) {
  if (!forceAsync) return form;
  form.append('async', 'true');
  form.append('sync_mode', 'false');
  return form;
}

function isTransientFetchConnectionError(error) {
  const code = String(error?.cause?.code || error?.code || '').toUpperCase();
  return ['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code);
}

async function fetchWithConnectionRetry(url, initFactory, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, initFactory());
    } catch (error) {
      lastError = error;
      if (!isTransientFetchConnectionError(error) || attempt >= maxAttempts) throw error;
      console.warn(`[upstream] connection failed (${error?.cause?.code || error?.code || 'unknown'}), retrying ${attempt}/${maxAttempts - 1}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

async function callImageUpstreamAsync({ settings, routeModelId, apiKey, originalApiModel, finalApiModel, paramKind, prompt, n, aspect_ratio, image_size, refs, size, quality, forceAsync = false }) {
  const imageApiRoot = zhenzhenBaseUrl(settings).endsWith('/v1') ? zhenzhenBaseUrl(settings) : `${zhenzhenBaseUrl(settings)}/v1`;
  const upstreamBase = `${imageApiRoot}/images`;
  const auth = `Bearer ${apiKey}`;
  const ar = String(aspect_ratio || '').trim();
  const isAuto = !ar || ar === 'Auto' || ar === 'AUTO' || ar === 'empty';
  const lvlLower = String(image_size || '1K').toLowerCase();
  const lvlUpper = String(image_size || '2K').toUpperCase();
  const hasRefs = Array.isArray(refs) && refs.length > 0;
  const geminiFallbackOptions = {
    settings,
    apiKey,
    finalApiModel,
    prompt,
    aspect_ratio,
    image_size: lvlUpper,
    refs,
    n,
    forceAsync,
  };

  const protocol = imageModelProtocol(settings, routeModelId)
    || imageModelProtocol(settings, originalApiModel)
    || imageModelProtocol(settings, finalApiModel);
  if (protocol === 'openai-chat') return await callGaiscOpenAiCompatibleImageAsync(geminiFallbackOptions);
  if (protocol === 'gemini-generate-content') return await callGaiscGeminiGenerateContentImageAsync(geminiFallbackOptions);
  if (protocol === 'gemini-interactions' || protocol === 'gemini-native') return await callGaiscGeminiInteractionsImageAsync(geminiFallbackOptions);

  // ===== Grok Image 路径(对齐 gpt-image-2-web Tab 12,默认参考图 Base64) =====
  if (paramKind === 'grok-image') {
    const grokRefs = [];
    if (hasRefs) {
      for (const ref of refs.slice(0, 4)) {
        const converted = await refToGrokImage(ref);
        if (converted) grokRefs.push(converted);
      }
      if (grokRefs.length === 0) {
        throw new Error('Grok 参考图读取失败，已中止生成，避免按无参考图生成');
      }
    }
    const body = appendAsyncJsonFields({ model: finalApiModel, prompt, aspect_ratio: isAuto ? '1:1' : ar }, forceAsync);
    if (grokRefs.length) body.image = grokRefs;
    const url = imageAsyncUrl(`${upstreamBase}/generations`, forceAsync);
    console.log('[upstream] Grok Image JSON →', url.replace(upstreamBase, ''), 'model:', finalApiModel, 'aspect_ratio:', body.aspect_ratio, { requested: refs?.length || 0, converted: grokRefs.length });
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });
  }

  // ===== GPT2 文生图走 Images API；图生图走 New API edits 异步 =====
  if (paramKind === 'gpt-size') {
    const explicitProtocol = imageModelProtocol(settings, originalApiModel) || imageModelProtocol(settings, finalApiModel);
    const isAzureGptImageProtocol = explicitProtocol === 'azure-gpt-image';
    const upstreamForceAsync = forceAsync && !isAzureGptImageProtocol;
    const includeAsyncPayloadFields = upstreamForceAsync;
    const fetchImageRequest = (url, initFactory) => (
      isAzureGptImageProtocol
        ? fetchWithConnectionRetry(url, initFactory)
        : fetch(url, initFactory())
    );
    const azureQuality = String(quality || '').trim().toLowerCase();
    const hasAzureQuality = ['low', 'medium', 'high'].includes(azureQuality);
    const useImagesProtocol = !explicitProtocol || explicitProtocol === 'images' || isAzureGptImageProtocol || explicitProtocol === 'images-generations' || explicitProtocol === 'images-edits';
    const routeKind = imageProtocolRouteKind(explicitProtocol || 'images', hasRefs);
    const px = isAzureGptImageProtocol
      ? aspectToAzureGptImageSize(ar, lvlLower)
      : (size || aspectToGptSize(ar, lvlLower));
    const fallbackPx = isAzureGptImageProtocol
      ? px
      : (useImagesProtocol ? aspectToGptOpenAiSize(ar, lvlLower) : px);
    const sizeFieldValues = (nextSize) => ({
      pixelSize: nextSize,
      aspectRatio: ar,
      isAuto,
      lvlLower,
      lvlUpper,
    });

    let convertedRefs = [];
    if (hasRefs) {
      convertedRefs = await collectConvertedImageRefs(refs, 'GPT2 参考图');
    }

    const submitGenerations = async () => {
      const requestProtocol = imageRequestProtocolConfig('gpt-size', 'generations');
      const primaryFields = isAzureGptImageProtocol
        ? ['size']
        : requestProtocolFields(requestProtocol, 'primary', ['size', 'resolution', 'image_size']);
      const pixelOnlyFields = isAzureGptImageProtocol
        ? ['size']
        : requestProtocolFields(requestProtocol, 'pixelOnly', ['size']);
      const publicRefUrls = await newApiPublicMediaUrlList(settings, apiKey, refs, 'image');
      const refDataUrls = publicRefUrls.length ? publicRefUrls : convertedImageRefsToDataUrls(convertedRefs);
      const buildBody = (nextSize, fields = primaryFields) => {
        const body = appendGptImageSizeFields({
          model: finalApiModel,
          prompt,
          n: Number(n) || 1,
        }, fields, sizeFieldValues(nextSize));
        if (!isAzureGptImageProtocol || hasAzureQuality) {
          body.quality = isAzureGptImageProtocol ? azureQuality : (quality || 'auto');
        }
        if (isAzureGptImageProtocol) {
          body.output_format = 'png';
          body.background = 'auto';
        }
        return appendAsyncJsonFields(body, includeAsyncPayloadFields);
      };
      const body = buildBody(px);
      if (refDataUrls.length) {
        body.images = refDataUrls;
        body.image = refDataUrls[0];
        body.image_urls = refDataUrls;
      }
      const url = imageAsyncUrl(`${upstreamBase}/generations`, upstreamForceAsync);
      console.log('[upstream] GPT2 Images API JSON → /generations model:', finalApiModel, 'size:', body.size || 'auto', { requested: refs.length, imageUrls: refDataUrls.length });
      let currentSize = px;
      let response = await fetchImageRequest(url, () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(body),
      }));
      let responseText = '';
      if (fallbackPx && fallbackPx !== px) {
        responseText = await responseTextForRetry(response);
        if (shouldRetryGptImageSize(response, responseText)) {
          const retryBody = buildBody(fallbackPx);
          console.warn('[upstream] GPT2 Images API size retry:', px, '→', fallbackPx);
          currentSize = fallbackPx;
          response = await fetchImageRequest(url, () => ({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify(retryBody),
          }));
          responseText = '';
        }
      }
      if (primaryFields.join('|') !== pixelOnlyFields.join('|')) {
        responseText = responseText || await responseTextForRetry(response);
        if (shouldRetryGptImageFieldStrategy(response, responseText)) {
          const retryBody = buildBody(currentSize, pixelOnlyFields);
          console.warn('[upstream] GPT2 Images API field retry with pixel-only size fields:', primaryFields.join(','), '→', pixelOnlyFields.join(','));
          response = await fetchImageRequest(url, () => ({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify(retryBody),
          }));
        }
      }
      return markImageStatusKind(response, 'generations');
    };

    const submitEdits = async () => {
      const requestProtocol = imageRequestProtocolConfig('gpt-size', 'edits');
      const primaryFields = isAzureGptImageProtocol
        ? ['size']
        : requestProtocolFields(requestProtocol, 'primary', ['size', 'aspectRatio', 'resolution', 'image_size']);
      const pixelOnlyFields = isAzureGptImageProtocol
        ? ['size']
        : requestProtocolFields(requestProtocol, 'pixelOnly', ['size', 'aspectRatio']);
      const buildForm = (nextSize, fields = primaryFields) => {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('model', finalApiModel);
        form.append('n', String(n || 1));
        if (!isAzureGptImageProtocol || hasAzureQuality) {
          form.append('quality', isAzureGptImageProtocol ? azureQuality : (quality || 'auto'));
        }
        if (!isAzureGptImageProtocol) form.append('moderation', 'auto');
        if (isAzureGptImageProtocol) {
          form.append('output_format', 'png');
          form.append('background', 'auto');
        }
        appendGptImageSizeFields(form, fields, sizeFieldValues(nextSize));
        if (hasRefs) {
          appendConvertedImagesToForm(form, convertedRefs, isAzureGptImageProtocol ? 'image[]' : 'image');
        } else {
          // 主项目 line 2861: 无参考图时创建 1024x1024 白图占位
          const whiteBuf = getWhitePng(1024, 1024);
          const blob = new Blob([whiteBuf], { type: 'image/png' });
          form.append('image', blob, 'blank.png');
        }
        return appendAsyncFormFields(form, includeAsyncPayloadFields);
      };

      const url = imageAsyncUrl(`${upstreamBase}/edits`, upstreamForceAsync);
      console.log('[upstream] GPT2 multipart →', url.replace(upstreamBase, ''), 'model:', finalApiModel, 'size:', px, 'aspectRatio:', ar, 'resolution:', lvlLower, { requested: refs.length, converted: convertedRefs.length });
      let currentSize = px;
      let response = await fetchImageRequest(url, () => ({ method: 'POST', headers: { Authorization: auth }, body: buildForm(px) }));
      let responseText = '';
      if (fallbackPx && fallbackPx !== px) {
        responseText = await responseTextForRetry(response);
        if (shouldRetryGptImageSize(response, responseText)) {
          console.warn('[upstream] GPT2 multipart size retry:', px, '→', fallbackPx);
          currentSize = fallbackPx;
          response = await fetchImageRequest(url, () => ({ method: 'POST', headers: { Authorization: auth }, body: buildForm(fallbackPx) }));
          responseText = '';
        }
      }
      if (primaryFields.join('|') !== pixelOnlyFields.join('|')) {
        responseText = responseText || await responseTextForRetry(response);
        if (shouldRetryGptImageFieldStrategy(response, responseText)) {
          console.warn('[upstream] GPT2 multipart field retry with pixel-only size fields:', primaryFields.join(','), '→', pixelOnlyFields.join(','));
          response = await fetchImageRequest(url, () => ({ method: 'POST', headers: { Authorization: auth }, body: buildForm(currentSize, pixelOnlyFields) }));
        }
      }
      return markImageStatusKind(response, 'edits');
    };

    if (routeKind === 'generations') {
      return await submitGenerations();
    }

    let response = await submitEdits();
    if (hasRefs && useImagesProtocol && (explicitProtocol === '' || explicitProtocol === 'images' || !explicitProtocol)) {
      const responseText = await responseTextForRetry(response);
      if (shouldRetryGptImageEndpoint(response, responseText)) {
        console.warn('[upstream] GPT2 edits endpoint rejected by channel, retrying /generations model:', finalApiModel);
        response = await submitGenerations();
      }
    }
    return response;
  }

  // ===== nano-banana 路径 =====
  if (hasRefs) {
    // 图生图 → multipart /edits?async=true
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('model', finalApiModel);
    form.append('aspect_ratio', isAuto ? '1:1' : ar);
    form.append('image_size', lvlUpper);
    form.append('n', String(Number(n) || 1));
    const convertedRefs = await collectConvertedImageRefs(refs, 'nano-banana 参考图');
    appendConvertedImagesToForm(form, convertedRefs);
    appendAsyncFormFields(form, forceAsync);
    const url = imageAsyncUrl(`${upstreamBase}/edits`, forceAsync);
    console.log('[upstream] nano-banana multipart →', url.replace(upstreamBase, ''), 'model:', finalApiModel, 'aspect_ratio:', ar, 'image_size:', lvlUpper, { requested: refs.length, converted: convertedRefs.length });
    const response = await fetch(url, { method: 'POST', headers: { Authorization: auth }, body: form });
    return await retryBananaWithGeminiIfUnsupported(response, geminiFallbackOptions);
  }
  // 文生图 → JSON /generations?async=true
  const body = appendAsyncJsonFields({ prompt, model: finalApiModel, aspect_ratio: isAuto ? '1:1' : ar }, forceAsync);
  body.image_size = lvlUpper;
  body.n = Number(n) || 1;
  const url = imageAsyncUrl(`${upstreamBase}/generations`, forceAsync);
  console.log('[upstream] nano-banana JSON →', url.replace(upstreamBase, ''), 'model:', finalApiModel, 'aspect_ratio:', body.aspect_ratio, 'image_size:', body.image_size);
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
  return await retryBananaWithGeminiIfUnsupported(response, geminiFallbackOptions);
}

// 将上游响应 normalize 为 { kind: 'sync'|'async', urls?, taskId? }
async function normalizeImageResponse(data) {
  if (imageApiFailed(data)) {
    return { kind: 'failed', error: imageError(data) || '上游图像 API 返回失败' };
  }
  const urls = await saveImageItemsFromResult(data);
  if (urls.length) return { kind: 'sync', urls };
  // 异步任务 task_id
  const taskId = imageTaskId(data);
  if (taskId) return { kind: 'async', taskId };
  return { kind: 'unknown' };
}

router.post('/image', async (req, res) => {
  const settings = currentSettings();
  const {
    model, apiModel, paramKind: paramKindIn,
    prompt, n,
    aspect_ratio, image_size,
    images, image, size, quality,
  } = req.body || {};
  // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
  if (!ensureKey(settings, res, apiModel || model || '', '图像')) return;
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt 必填' });
  const originalApiModel = String(apiModel || model || '');
  const gptImage2ForcedSize = gptImage2ZhenzhenVariantSize(originalApiModel);
  const finalApiModel = resolveConfiguredImageApiModel(settings, model, originalApiModel);
  const ml = `${originalApiModel} ${finalApiModel}`.toLowerCase();
  const paramKind = paramKindIn || (ml.includes('grok') && ml.includes('image') ? 'grok-image' : (isBananaImageModel(ml) ? 'banana-ratio' : 'gpt-size'));
  if (!finalApiModel) return res.status(400).json({ success: false, error: 'model 必填' });
  const refs = Array.isArray(images) ? images.filter(Boolean) : [];
  if (typeof image === 'string' && image && !refs.includes(image)) refs.unshift(image);
  const hasRefs = refs.length > 0;

  try {
    const r = await callImageUpstreamAsync({
      settings,
      routeModelId: model,
      originalApiModel,
      apiKey: settings.zhenzhenApiKey, finalApiModel, paramKind,
      prompt, n, aspect_ratio, image_size: gptImage2ForcedSize || image_size, refs, size: gptImage2ForcedSize ? undefined : size, quality,
      forceAsync: false,
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch {
      return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 300) });
    }
    if (!r.ok) {
      const errorText = buildImageUpstreamErrorMessage(data, `上游 HTTP ${r.status}`);
      return res.status(r.status).json({
        success: false,
        error: errorText,
        upstreamRequestId: extractImageUpstreamRequestId(data) || undefined,
        raw: data,
      });
    }
    const norm = await normalizeImageResponse(data);
    if (norm.kind === 'failed') {
      const errorText = buildImageUpstreamErrorMessage(data, norm.error || '上游图像任务失败');
      return res.status(500).json({ success: false, error: errorText, upstreamRequestId: extractImageUpstreamRequestId(data) || undefined, raw: data });
    }
    if (norm.kind === 'sync') {
      return res.json({ success: true, data: { urls: norm.urls, raw: data, model: finalApiModel, prompt } });
    }
    if (norm.kind === 'async') {
      // 同步接口需要同步返回结果 → 内部轮询
      const imageStatusKind = r.__t8ImageStatusKind || (hasRefs && paramKind === 'gpt-size' ? 'edits' : '');
      const pollResult = await pollImageTaskDetailed(settings, norm.taskId, settings.zhenzhenApiKey, undefined, undefined, imageStatusKind);
      if (!pollResult.ok) {
        return res.status(500).json({
          success: false,
          error: pollResult.error || '异步任务轮询超时/失败',
          taskId: norm.taskId,
          status: pollResult.status,
          progress: pollResult.progress,
          raw: pollResult.raw,
        });
      }
      return res.json({ success: true, data: { urls: pollResult.urls, raw: data, taskId: norm.taskId, model: finalApiModel, prompt } });
    }
    return res.status(500).json({ success: false, error: '上游未返回图片也未返 task_id: ' + JSON.stringify(data).slice(0, 300) });
  } catch (e) {
    console.error('proxy/image 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

// ========================================================================
// 图像异步任务接口(与主项目 gpt-image-2-web 一致)
// POST /api/proxy/image/submit -> { taskId }(同 submit 逻辑,但不同步轮询)
// GET  /api/proxy/image/status/:tid -> { status, progress, urls? }
// ========================================================================
router.post('/image/submit', async (req, res) => {
  const settings = currentSettings();
  try {
    const { model, apiModel, paramKind: paramKindIn, prompt, n,
            aspect_ratio, image_size, images, image, size, quality } = req.body || {};
    // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
    if (!ensureKey(settings, res, apiModel || model || '', '图像')) return;
    if (!prompt) return res.status(400).json({ success: false, error: 'prompt 不得为空' });
    const originalApiModel = String(apiModel || model || '');
    const gptImage2ForcedSize = gptImage2ZhenzhenVariantSize(originalApiModel);
    const finalApiModel = resolveConfiguredImageApiModel(settings, model, originalApiModel);
    const ml = `${originalApiModel} ${finalApiModel}`.toLowerCase();
    const paramKind = paramKindIn || (ml.includes('grok') && ml.includes('image') ? 'grok-image' : (isBananaImageModel(ml) ? 'banana-ratio' : 'gpt-size'));
    if (!finalApiModel) return res.status(400).json({ success: false, error: 'model 必填' });
    const refs = Array.isArray(images) ? images.filter(Boolean) : [];
    if (typeof image === 'string' && image && !refs.includes(image)) refs.unshift(image);
    const hasRefs = refs.length > 0;

    // 完全对齐主项目 gpt-image-2-web:走 ?async=true,GPT2 强制 multipart edits + 白图占位
    const r = await callImageUpstreamAsync({
      settings,
      routeModelId: model,
      originalApiModel,
      apiKey: settings.zhenzhenApiKey, finalApiModel, paramKind,
      prompt, n, aspect_ratio, image_size: gptImage2ForcedSize || image_size, refs, size: gptImage2ForcedSize ? undefined : size, quality,
      forceAsync: true,
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    if (!r.ok) {
      const errorText = buildImageUpstreamErrorMessage(data, `上游 HTTP ${r.status}`);
      return res.status(r.status).json({ success: false, error: errorText, upstreamRequestId: extractImageUpstreamRequestId(data) || undefined, raw: data });
    }

    const norm = await normalizeImageResponse(data);
    if (norm.kind === 'failed') {
      const errorText = buildImageUpstreamErrorMessage(data, norm.error || '上游图像任务失败');
      return res.status(500).json({ success: false, error: errorText, upstreamRequestId: extractImageUpstreamRequestId(data) || undefined, raw: data });
    }
    if (norm.kind === 'sync') {
      return res.json({ success: true, data: { sync: true, status: 'completed', progress: '100%', urls: norm.urls, raw: data } });
    }
    if (norm.kind === 'async') {
      const imageRetry = buildAsyncImageRetryMeta({
        routeModelId: model,
        originalApiModel,
        finalApiModel,
        paramKind,
        prompt,
        n,
        aspect_ratio,
        image_size: gptImage2ForcedSize || image_size,
        refs,
        size: gptImage2ForcedSize ? undefined : size,
        quality,
      });
      rememberTaskKey(norm.taskId, settings.zhenzhenApiKey, {
        model: finalApiModel,
        imageStatusKind: r.__t8ImageStatusKind || (hasRefs && paramKind === 'gpt-size' ? 'edits' : ''),
        ...(imageRetry ? { imageRetry } : {}),
      });
      return res.json({ success: true, data: { sync: false, taskId: norm.taskId, status: 'pending', progress: '0%', raw: data } });
    }
    return res.status(500).json({ success: false, error: '未获取到 task_id 且无同步结果: ' + JSON.stringify(data).slice(0, 300) });
  } catch (e) {
    console.error('proxy/image/submit 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

// 查询异步图像任务状态
router.get('/image/status/:tid', async (req, res) => {
  const settings = currentSettings();
  // 优先从 submit 阶段记录的 (taskId → key) 映射恢复，防止前端未传 model 导致 fallback 错 key。
  const rememberedMeta = recallTaskMeta(req.params.tid);
  if (rememberedMeta?.apiKey) {
    if (settings) settings.zhenzhenApiKey = rememberedMeta.apiKey;
    else return res.status(400).json({ success: false, error: '未找到 settings' });
  } else {
    // v1.2.9.15: 一体化「专属优先 fallback 通用」校验（查询阶段可选传 ?model=xxx）
    if (!ensureKey(settings, res, String(req.query.model || ''), '图像')) return;
  }
  const tid = req.params.tid;
  const effectiveTid = rememberedMeta?.retryTaskId || tid;
  try {
    const statusResult = await fetchImageTaskStatus(settings, effectiveTid, settings.zhenzhenApiKey, rememberedMeta?.imageStatusKind || '');
    const r = statusResult?.response;
    const data = statusResult?.data || {};
    if (isTransientImageTaskState(data)) {
      return res.json({
        success: true,
        data: {
          status: 'pending',
          progress: data?.data?.progress || data?.progress || '0%',
          transient: true,
          raw: data,
        },
      });
    }
    if (!r.ok) {
      const errorText = statusResult?.errorText || data?.error?.message || data?.message || `上游 HTTP ${r.status}`;
      const explicitFailure = isExplicitImageTaskFailure(data);
      if (isTransientImageTaskHttpStatus(r.status) && !explicitFailure) {
        return res.json({
          success: true,
          data: {
            status: 'pending',
            progress: data?.data?.progress || data?.progress || '0%',
            error: errorText,
            transient: true,
            raw: data,
          },
        });
      }
      if (explicitFailure) {
        return res.json({
          success: false,
          data: {
            status: 'failed',
            progress: data?.data?.progress || data?.progress || '0%',
            error: errorText,
            raw: data,
          },
        });
      }
      return res.status(r.status).json({ success: false, error: errorText, raw: data });
    }
    if (imageApiFailed(data)) {
      const errorText = imageError(data) || '任务失败';
      const retried = await retryImageTaskAfterAsyncFailure({
        settings,
        apiKey: settings.zhenzhenApiKey,
        oldTaskId: tid,
        meta: rememberedMeta || {},
        errorText,
      });
      if (retried?.kind === 'sync') {
        return res.json({ success: true, data: { status: 'completed', progress: '100%', urls: retried.urls, raw: retried.raw } });
      }
      if (retried?.kind === 'async') {
        return res.json({ success: true, data: { status: 'pending', progress: '5%', taskId: retried.taskId, raw: retried.raw } });
      }
      return res.json({ success: false, data: { status: 'failed', progress: '0%', error: errorText, raw: data } });
    }
    const statusRaw = imageStatus(data);
    const status = String(statusRaw || '').toLowerCase();
    const inner = data?.data && typeof data.data === 'object' ? data.data : {};
    const progress = inner.progress || data?.progress || '0%';
    const SUCCESS = ['success', 'completed', 'complete', 'done', 'finished'];
    const FAILURE = ['failure', 'failed', 'error', 'cancelled', 'canceled'];
    const urls = await saveImageItemsFromResult(data);
    if (SUCCESS.includes(status) || urls.length) {
      return res.json({ success: true, data: { status: 'completed', progress: '100%', urls, raw: data } });
    }
    if (FAILURE.includes(status)) {
      const errorText = imageError(data) || inner.fail_reason || '任务失败';
      const retried = await retryImageTaskAfterAsyncFailure({
        settings,
        apiKey: settings.zhenzhenApiKey,
        oldTaskId: tid,
        meta: rememberedMeta || {},
        errorText,
      });
      if (retried?.kind === 'sync') {
        return res.json({ success: true, data: { status: 'completed', progress: '100%', urls: retried.urls, raw: retried.raw } });
      }
      if (retried?.kind === 'async') {
        return res.json({ success: true, data: { status: 'pending', progress: '5%', taskId: retried.taskId, raw: retried.raw } });
      }
      return res.json({ success: false, data: { status: 'failed', progress, error: imageError(data) || inner.fail_reason || '任务失败', raw: data } });
    }
    res.json({ success: true, data: { status: status || 'pending', progress, raw: data } });
  } catch (e) {
    console.error('proxy/image/status 错误:', e);
    res.status(500).json({ success: false, error: e.message || '查询失败' });
  }
});

// ========== 图像异步任务轮询(同步代理内部使用,路径对齐主项目 /v1/images/tasks/) ==========
// 轮询上限:1800 × 2s = 3600s = 60 分钟,与前端 ImageNode 标准路径保持一致,
// 避免 GPT2 复杂 prompt / 多参考图任务被 120s 提前中断。
async function pollImageTaskDetailed(settings, taskId, apiKey, maxRetries = 1800, interval = 2000, preferredKind = '') {
  let lastProgress = '0%';
  let lastRaw = null;
  let lastError = '';
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, interval));
    try {
      const statusResult = await fetchImageTaskStatus(settings, taskId, apiKey, preferredKind);
      const r = statusResult?.response;
      const data = statusResult?.data || {};
      lastRaw = data;
      if (isTransientImageTaskState(data)) continue;
      if (!r.ok) {
        lastError = statusResult?.errorText || data?.error?.message || data?.message || imageError(data) || `上游 HTTP ${r.status}`;
        const explicitFailure = isExplicitImageTaskFailure(data);
        if (isTransientImageTaskHttpStatus(r.status) && !explicitFailure) continue;
        return { ok: false, status: 'failed', progress: lastProgress, error: lastError, raw: data };
      }
      const st = String(imageStatus(data) || '').toLowerCase();
      const inner = data?.data && typeof data.data === 'object' ? data.data : {};
      lastProgress = inner.progress || data?.progress || lastProgress;
      const urls = await saveImageItemsFromResult(data);
      if (['success', 'completed', 'complete', 'done', 'finished'].includes(st) || urls.length) {
        return { ok: true, status: 'completed', progress: '100%', urls, raw: data };
      }
      if (['failure', 'failed', 'error', 'cancelled', 'canceled'].includes(st) || imageApiFailed(data)) {
        lastError = imageError(data) || st;
        console.error('[poll] 任务失败:', lastError);
        return { ok: false, status: 'failed', progress: lastProgress, error: lastError, raw: data };
      }
    } catch (e) {
      lastError = e.message;
      console.warn('[poll] 轮询异常:', e.message);
    }
  }
  return { ok: false, status: 'timeout', progress: lastProgress, error: lastError || '异步任务轮询超时', raw: lastRaw };
}

async function pollImageTask(settings, taskId, apiKey, maxRetries = 1800, interval = 2000, preferredKind = '') {
  const result = await pollImageTaskDetailed(settings, taskId, apiKey, maxRetries, interval, preferredKind);
  if (!result.ok) return [];
  return result.urls || [];
}

// ========================================================================
// FAL 渠道 —— 完全对齐 gpt-image-2-web SKILL.md §FAL模型渠道接入规范
// 不破坏原有 /image · /image/submit · /image/status/:tid 三个路由。
//
// 核心路由:
//   POST /api/proxy/image/fal/submit   -> { sync, urls?, requestId?, responseUrl?, endpoint? }
//   POST /api/proxy/image/fal/query    -> { status, images?, error? }   body: { responseUrl, endpoint, requestId }
//
// 主项目上游协议(index.html line 2890 runGPTFal / line 3587 runNanoFal):
//   URL: ${baseUrl}/fal/${endpoint}
//   Auth: Bearer ${apiKey}
//   GPT FAL  endpoint: 'openai/gpt-image-2' 或 'openai/gpt-image-2/edit'
//   NBPro FAL endpoint: 'fal-ai/nano-banana-pro/edit'
//   参考图上传: POST ${baseUrl}/v1/files  (复用现有 uploadRefToZhenzhen)
//   response_url 域名修复: queue.fal.run → ${baseUrl}/fal
//   轮询 HTTP 非200时 body 中 status=IN_QUEUE/IN_PROGRESS 仍视为进行中
// ========================================================================

const FAL_REGISTRY = {
  'gpt-image-2-fal': {
    endpoint: 'openai/gpt-image-2',
    editEndpoint: 'openai/gpt-image-2/edit',
    paramKind: 'gpt-fal',
    maxRefs: 5,
  },
  'nano-banana-pro-fal': {
    endpoint: 'fal-ai/nano-banana-pro/edit',
    editEndpoint: 'fal-ai/nano-banana-pro/edit',
    paramKind: 'nbpro-fal',
    maxRefs: 8,
  },
  // 主项目 runGeminiFal (line 3491) 与 runNanoFal 共用同一 fal-ai/nano-banana-pro/edit 端点 + 同 paramKind。
  // 只是 UI 控件 id 前缀不同 (g2f_* vs nf_*)。后端零增量分支，复用 nbpro-fal payload 组装。
  'nano-banana-2-fal': {
    endpoint: 'fal-ai/nano-banana-pro/edit',
    editEndpoint: 'fal-ai/nano-banana-pro/edit',
    paramKind: 'nbpro-fal',
    maxRefs: 8,
  },
};

// 按 16 倍数对齐(主项目 line 2904)
function snap16(v, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(256, Math.min(3840, Math.round(n / 16) * 16));
}

// 修复 response_url 域名(主项目 line 2954)
function fixFalResponseUrl(responseUrl, baseUrl, endpoint, requestId) {
  let url = String(responseUrl || '');
  if (url.includes('queue.fal.run')) {
    url = url.replace('https://queue.fal.run', `${baseUrl}/fal`);
  }
  if (!url) {
    const requestEndpoint = String(endpoint || '').startsWith('fal-ai/sora-2/')
      ? 'fal-ai/sora-2'
      : endpoint;
    url = `${baseUrl}/fal/${requestEndpoint}/requests/${requestId}`;
  }
  return url;
}

// POST /api/proxy/image/fal/submit
//   body 公用: { apiModel, prompt, images?, n?, format?, sync?, ... }
//   gpt-fal 专属: { mode?: 'edit'|'gen', size?: '1024x1024'|'square'|...|'custom', customW?, customH?, quality?: low|medium|high|auto }
//   nbpro-fal 专属: { aspect_ratio, resolution, safety_tolerance, seed?, system_prompt?, enable_web_search?, image_mode?: 'image_url'|'base64' }
router.post('/image/fal/submit', async (req, res) => {
  const settings = currentSettings();
  const {
    apiModel, prompt, images, n, format, sync,
    // gpt-fal
    mode, size, customW, customH, quality,
    // nbpro-fal
    aspect_ratio, resolution, safety_tolerance, seed,
    system_prompt, enable_web_search, image_mode,
  } = req.body || {};
  // FAL 全部固定使用通用服务 API Key，不参与 New API 分组令牌。
  if (!ensureDefaultZhenzhenKey(settings, res, '图像 FAL')) return;
  let apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);

  if (!apiModel) return res.status(400).json({ success: false, error: 'apiModel 必填' });
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt 不得为空' });

  const reg = FAL_REGISTRY[apiModel];
  if (!reg) return res.status(400).json({ success: false, error: `未知的 FAL 模型: ${apiModel}` });

  const refs = Array.isArray(images) ? images.filter(Boolean) : [];
  const trimmedRefs = refs.slice(0, reg.maxRefs);
  const numImages = Math.max(1, Math.min(10, parseInt(n ?? 1, 10) || 1));
  const outputFormat = String(format || 'png').toLowerCase();

  // ========== 根据 paramKind 组装 payload ==========
  let payload;
  let endpoint;
  try {
    if (reg.paramKind === 'gpt-fal') {
      // 选 endpoint: edit 或 gen
      const useEdit = (mode === 'edit') || (mode !== 'gen' && trimmedRefs.length > 0);
      endpoint = useEdit ? (reg.editEndpoint || reg.endpoint) : reg.endpoint;
      // image_size
      let imageSize;
      const sz = String(size || 'auto');
      if (sz === 'custom') {
        imageSize = { width: snap16(customW, 1280), height: snap16(customH, 1280) };
      } else if (sz && sz !== 'auto') {
        imageSize = sz; // 预设字串 square_hd / portrait_16_9 等,或像素串
      }
      payload = {
        prompt,
        quality: String(quality || 'medium'),
        num_images: numImages,
        output_format: outputFormat,
      };
      if (imageSize) payload.image_size = imageSize;
      // image_urls 仅在 edit 下添加
      if (useEdit && trimmedRefs.length) {
        const urls = [];
        for (let i = 0; i < trimmedRefs.length; i++) {
          const u = await uploadRefToZhenzhen(settings, trimmedRefs[i], apiKey);
          if (u) urls.push(u);
          else throw new Error(`FAL 参考图 #${i + 1} 上传失败`);
        }
        if (urls.length) payload.image_urls = urls;
      }
      if (sync === true || sync === 'true') payload.sync_mode = true;
    } else if (reg.paramKind === 'nbpro-fal') {
      // nano-banana-pro 只有 edit 端点
      endpoint = reg.endpoint;
      payload = {
        prompt,
        num_images: numImages,
        aspect_ratio: String(aspect_ratio || 'auto'),
        resolution: String(resolution || '2K'),
        output_format: outputFormat,
        safety_tolerance: String(safety_tolerance || '4'),
      };
      if (seed && Number(seed) > 0) payload.seed = Number(seed);
      if (system_prompt) payload.system_prompt = String(system_prompt);
      if (enable_web_search === true || enable_web_search === 'true') payload.enable_web_search = true;
      // 参考图(最多 8 张)
      if (trimmedRefs.length) {
        const imgs = [];
        const useBase64 = String(image_mode || 'image_url') === 'base64';
        for (let i = 0; i < trimmedRefs.length; i++) {
          const r = trimmedRefs[i];
          if (useBase64) {
            // 转 base64 dataURI
            const conv = await refToBananaImage(r);
            if (conv) imgs.push(conv);
          } else {
            const u = await uploadRefToZhenzhen(settings, r, apiKey);
            if (u) imgs.push(u);
            else throw new Error(`FAL 参考图 #${i + 1} 上传失败`);
          }
        }
        if (imgs.length) payload.image_urls = imgs;
      }
    } else {
      return res.status(400).json({ success: false, error: `不支持的 FAL paramKind: ${reg.paramKind}` });
    }

    const falUrl = `${baseUrl}/fal/${endpoint}`;
    console.log('[fal/submit]', apiModel, '→', falUrl, '| payload keys:', Object.keys(payload), '| refs:', trimmedRefs.length);

    const resp = await fetch(falUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    if (!resp.ok) {
      return res.status(resp.status).json({
        success: false,
        error: data?.error || data?.detail || data?.message || `FAL HTTP ${resp.status}: ${text.slice(0, 300)}`,
      });
    }
    if (Array.isArray(data)) {
      return res.status(400).json({ success: false, error: `FAL 参数校验错误: ${JSON.stringify(data).slice(0, 300)}` });
    }
    if (data?.detail && !data?.images && !data?.request_id) {
      return res.status(400).json({ success: false, error: `FAL 错误: ${JSON.stringify(data.detail).slice(0, 300)}` });
    }

    // 同步返回
    if (Array.isArray(data?.images) && data.images.length) {
      const urls = [];
      for (const it of data.images) {
        if (it?.url) {
          const local = await saveRemoteImage(it.url);
          urls.push(local);
        }
      }
      return res.json({ success: true, data: { sync: true, urls, endpoint, raw: data } });
    }

    // 异步
    const requestId = data?.request_id;
    let responseUrl = data?.response_url || '';
    if (!requestId) {
      return res.status(500).json({ success: false, error: '未获取到 request_id: ' + JSON.stringify(data).slice(0, 300) });
    }
    responseUrl = fixFalResponseUrl(responseUrl, baseUrl, endpoint, requestId);
    rememberTaskKey(requestId, apiKey, { model: apiModel, endpoint });
    return res.json({
      success: true,
      data: { sync: false, requestId, responseUrl, endpoint, raw: data },
    });
  } catch (e) {
    console.error('proxy/image/fal/submit 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

// POST /api/proxy/image/fal/query
//   body: { responseUrl, endpoint, requestId }
//   返回: { status: 'pending'|'completed'|'failed', urls?, error? }
router.post('/image/fal/query', async (req, res) => {
  const settings = currentSettings();
  const { responseUrl: rawUrl, endpoint, requestId } = req.body || {};
  const rememberedMeta = recallTaskMeta(requestId);
  if (rememberedMeta?.apiKey) {
    if (settings) settings.zhenzhenApiKey = rememberedMeta.apiKey;
    else return res.status(400).json({ success: false, error: '未找到 settings' });
  } else {
    // FAL 查询和提交保持同一策略：只用通用服务 API Key。
    if (!ensureDefaultZhenzhenKey(settings, res, '图像 FAL')) return;
  }
  const apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);
  const responseUrl = fixFalResponseUrl(rawUrl, baseUrl, endpoint, requestId);
  if (!responseUrl) return res.status(400).json({ success: false, error: 'responseUrl 或 (endpoint+requestId) 必填' });

  try {
    const pr = await fetch(responseUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await pr.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    // HTTP 非200: 主项目规范 - body 中 status=IN_QUEUE/IN_PROGRESS 视为继续等待,其他报错
    if (!pr.ok) {
      if (data && (data.status === 'IN_QUEUE' || data.status === 'IN_PROGRESS')) {
        return res.json({ success: true, data: { status: 'pending', raw: data } });
      }
      return res.status(pr.status).json({
        success: false,
        error: `FAL Poll HTTP ${pr.status}: ${text.slice(0, 300)}`,
        raw: data,
      });
    }
    if (!data) {
      return res.status(500).json({ success: false, error: 'FAL Poll 响应非 JSON: ' + text.slice(0, 200) });
    }
    // 完成
    if (Array.isArray(data.images) && data.images.length) {
      const urls = [];
      for (const it of data.images) {
        if (it?.url) {
          const local = await saveRemoteImage(it.url);
          urls.push(local);
        }
      }
      return res.json({ success: true, data: { status: 'completed', urls, raw: data } });
    }
    const st = String(data.status || '').toUpperCase();
    if (st === 'FAILED' || st === 'CANCELLED') {
      return res.json({
        success: false,
        data: { status: 'failed', error: data.error || data.detail || `FAL ${st}` },
      });
    }
    // IN_QUEUE / IN_PROGRESS / 空 => pending
    return res.json({ success: true, data: { status: 'pending', falStatus: st || 'IN_QUEUE', raw: data } });
  } catch (e) {
    console.error('proxy/image/fal/query 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '查询失败' });
  }
});

// ============================================================================
// Midjourney 三路由：严格对齐 gpt-image-2-web server.py _handle_mj_imagine / _handle_mj_fetch_task / _handle_mj_upload
//   上游：{ZHENZHEN_BASE_URL}/{mj-turbo|mj-fast|mj-relax}/mj/submit/imagine
//          {ZHENZHEN_BASE_URL}/{...}/mj/task/{id}/fetch
//          {ZHENZHEN_BASE_URL}/{...}/mj/submit/upload-discord-images
//   服从通用服务集中 Key（同上其他默认服务路由）。
// ============================================================================
const MJ_SPEED_MAP = { turbo: 'mj-turbo', fast: 'mj-fast', relax: 'mj-relax' };
function mjSpeedSeg(speed) {
  return MJ_SPEED_MAP[String(speed || '').toLowerCase()] || 'mj-fast';
}

// ---- POST /api/proxy/mj/imagine ----
// body: { prompt, ar?, no?, c?, s?, iw?, sw?, cw?, sv?, seed?, base64Array?, speed?, modes?, instanceId?, notifyHook?, remix? }
// 返回上游 imagine 原始响应 { code, description, result(taskId), properties }
router.post('/mj/imagine', async (req, res) => {
  const settings = currentSettings();
  // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
  if (!ensureKey(settings, res, 'mj', 'MJ')) return;
  const body = req.body || {};
  const speedSeg = mjSpeedSeg(body.speed);
  const url = `${zhenzhenBaseUrl(settings)}/${speedSeg}/mj/submit/imagine`;
  // 严格对齐主项目 runMJ payload（index.html L4547~L4587）
  const payload = {
    base64Array: Array.isArray(body.base64Array) ? body.base64Array : [],
    instanceId: body.instanceId || '',
    modes: Array.isArray(body.modes) ? body.modes : [],
    notifyHook: body.notifyHook || '',
    prompt: String(body.prompt || ''),
    remix: body.remix !== false,
    state: body.state || '',
    ar: body.ar || null,
    no: body.no || null,
    c: body.c || null,
    s: body.s || null,
    iw: body.iw || null,
    tile: false,
    r: null,
    video: false,
    sw: body.sw || null,
    cw: body.cw || null,
    sv: body.sv || null,
    seed: body.seed || null,
  };
  try {
    console.log(`[mj/imagine] -> ${url}\n  prompt: ${payload.prompt.slice(0, 200)}`);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.zhenzhenApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) }); }
    if (!r.ok) return res.status(r.status).json({ success: false, error: data?.error || data?.description || `上游 HTTP ${r.status}` });
    return res.json({ success: true, data });
  } catch (e) {
    console.error('proxy/mj/imagine 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '提交失败' });
  }
});

// ---- GET /api/proxy/mj/task/:id?speed=fast ----
// 轮询任务状态
router.get('/mj/task/:id', async (req, res) => {
  const settings = currentSettings();
  // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
  if (!ensureKey(settings, res, 'mj', 'MJ')) return;
  const taskId = req.params.id;
  const speedSeg = mjSpeedSeg(req.query.speed);
  if (!taskId) return res.status(400).json({ success: false, error: 'taskId 必填' });
  const url = `${zhenzhenBaseUrl(settings)}/${speedSeg}/mj/task/${encodeURIComponent(taskId)}/fetch`;
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.zhenzhenApiKey}`,
      },
    });
    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + raw.slice(0, 200) }); }
    if (!r.ok) return res.status(r.status).json({ success: false, error: data?.error || data?.description || `上游 HTTP ${r.status}` });
    // image_urls 可能是 JSON 字符串也可能已是数组，透传，让前端统一处理
    return res.json({ success: true, data });
  } catch (e) {
    console.error('proxy/mj/task 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '查询失败' });
  }
});

// ---- POST /api/proxy/mj/upload ----
// body: { base64Data: 'data:image/png;base64,xxxx', speed? }
// 上传参考图到 MJ Discord，返回 URL（主项目 uploadMJImage L4407 + server.py L2457）
router.post('/mj/upload', async (req, res) => {
  const settings = currentSettings();
  // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
  if (!ensureKey(settings, res, 'mj', 'MJ')) return;
  const { base64Data, speed } = req.body || {};
  if (!base64Data) return res.status(400).json({ success: false, error: 'base64Data 不得为空' });
  const speedSeg = mjSpeedSeg(speed);
  const url = `${zhenzhenBaseUrl(settings)}/${speedSeg}/mj/submit/upload-discord-images`;
  const payload = { base64Array: [base64Data], instanceId: '', notifyHook: '' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.zhenzhenApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) }); }
    if (!r.ok) return res.status(r.status).json({ success: false, error: data?.error || data?.description || `上游 HTTP ${r.status}` });
    if (data.status === 'FAILURE') return res.status(500).json({ success: false, error: data.fail_reason || data.failReason || 'MJ upload failed' });
    let imgUrl = '';
    if (Array.isArray(data.result)) imgUrl = data.result[0] || '';
    else if (typeof data.result === 'string') imgUrl = data.result;
    if (!imgUrl) return res.status(500).json({ success: false, error: '上游未返回 URL: ' + JSON.stringify(data).slice(0, 200) });
    return res.json({ success: true, data: { url: imgUrl, raw: data } });
  } catch (e) {
    console.error('proxy/mj/upload 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '上传失败' });
  }
});

// ========== POST /api/proxy/llm — LLM Chat(独立 Key) ==========
function hasLlmVideoParts(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((msg) => Array.isArray(msg?.content) && msg.content.some((part) => (
    part?.type === 'video_url' || part?.type === 'input_video' || !!part?.video_url || !!part?.input_video
  )));
}

// body: { model, messages, temperature?, max_tokens?, stream?, llmVideoMode? }
//   - messages[i].content 支持 string 或 多模态数组 [{type:'text',text} | {type:'image_url',image_url:{url}} | {type:'video_url',video_url:{url}}]
//   - stream=true → 透传上游 SSE(text/event-stream) 到前端；有视频时强制非流式，避免网关丢多模态附件
//   - 完全对齐 gpt-image-2-web _doSendChat (index.html L8128~L8305)
router.post('/llm', async (req, res) => {
  const settings = currentSettings();
  const credentials = resolveLlmCredentials(settings, req.body?.modelSource);
  if (!credentials.apiKey) {
    const label = credentials.source === 'zhenzhen' ? '通用服务' : 'LLM 独立';
    return res.status(400).json({ success: false, error: `未配置${label} API Key` });
  }
  const { model, messages, temperature, max_tokens, stream } = req.body || {};
  if (!model || !messages) {
    return res.status(400).json({ success: false, error: 'model 和 messages 必填' });
  }
  const inputHadVideos = hasLlmVideoParts(messages);
  const useNativeGeminiVideo = isGeminiLlmModel(model) && inputHadVideos;

  // 预处理 messages 中的 image_url / video_url:
  //   - 图片: 本地 /files/* 转 base64 dataURL
  //   - 视频: 完整视频压缩为 Base64，Gemini 走原生 inlineData 协议
  // 避免上游 LLM 服务拿着本地相对路径报 convert_request_failed。
  let normalizedMessages;
  try {
    const sourceMessages = useNativeGeminiVideo
      ? messages
      : await publicizeChatMessageMedia(settings, credentials.apiKey, messages);
    const mediaOptions = useNativeGeminiVideo
      ? { ...(req.body || {}), llmVideoMode: 'native-base64' }
      : (req.body || {});
    normalizedMessages = await normalizeLlmMessageMedia(sourceMessages, mediaOptions, {
      baseUrl: `http://127.0.0.1:${config.PORT}`,
      requireVideoBase64: useNativeGeminiVideo,
    });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || '多模态素材预处理失败' });
  }

  const baseUrl = credentials.baseUrl;
  const upstream = useNativeGeminiVideo
    ? gaiscGeminiEndpointUrl(baseUrl, model)
    : `${baseUrl}/v1/chat/completions`;
  const payload = useNativeGeminiVideo
    ? buildGeminiLlmPayload({
      messages: normalizedMessages,
      temperature,
      maxTokens: max_tokens,
    })
    : {
      model,
      messages: normalizedMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 16384,
      stream: !!stream && !inputHadVideos,
    };

  try {
    const r = await fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    // ===== 流式分支:SSE pass-through =====
    if (!useNativeGeminiVideo && payload.stream) {
      if (!r.ok) {
        const errText = await r.text();
        return res.status(r.status).json({
          success: false,
          error: `上游 HTTP ${r.status}: ${errText.slice(0, 300)}`,
        });
      }
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      // Node 18+ fetch response.body 为 ReadableStream
      try {
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        // 透传上游字节,前端按 SSE 解析
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (streamErr) {
        console.error('proxy/llm SSE 转发异常:', streamErr);
      }
      return res.end();
    }

    // ===== 非流式分支(gpt-image-2-all 等) =====
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
    }
    if (!r.ok) {
      return res.status(r.status).json({
        success: false,
        error: data?.error?.message || `上游 HTTP ${r.status}`,
      });
    }
    if (useNativeGeminiVideo) {
      return res.json({
        success: true,
        data: normalizeGeminiLlmResponse(data, model),
      });
    }
    // 处理 content 可能是字符串或多模态数组(gpt-image-2-all 出图)
    const choice = data?.choices?.[0];
    let content = choice?.message?.content || '';
    const imageUrls = [];
    if (Array.isArray(content)) {
      let textParts = '';
      content.forEach((part) => {
        if (part?.type === 'text') textParts += part.text || '';
        else if (part?.type === 'image_url' && part.image_url?.url) imageUrls.push(part.image_url.url);
        else if (part?.type === 'image' && part.image_url?.url) imageUrls.push(part.image_url.url);
      });
      content = textParts;
    }
    if (Array.isArray(data?.data)) {
      data.data.forEach((d) => {
        if (d?.url) imageUrls.push(d.url);
        else if (d?.b64_json) imageUrls.push('data:image/png;base64,' + d.b64_json);
      });
    }
    const finishReason = choice?.finish_reason || choice?.finishReason || '';
    res.json({
      success: true,
      data: {
        content,
        imageUrls,
        raw: data,
        model,
        finishReason,
        truncated: ['length', 'max_tokens', 'content_length'].includes(String(finishReason || '').toLowerCase()),
      },
    });
  } catch (e) {
    console.error('proxy/llm 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

// ========================================================================
// 视频生成(异步) — 完全对齐 gpt-image-2-web
// 协议: POST /v2/videos/generations + GET /v2/videos/generations/:tid
//
// 通过 model 字段自动选择上游 payload 协议:
//   - veo-omni-10s  → Veo Omni 协议: POST /v1/videos multipart
//                      { model=omni_flash-10s, prompt, size, seconds=10, watermark, input_reference }
//   - 含 'veo'      → Veo3.1 协议:  { prompt, model, enhance_prompt, aspect_ratio, seed?, enable_upsample?, images?(base64,最多3) }
//                       (主项目 runVeo3, index.html line 3372)
//   - 含 'grok'     → Grok Video 协议: { prompt, model, ratio, duration(数字秒), resolution, seed?, images?(URL,最多7) }
//                       (主项目 runGrok3, index.html line 3863) — 参考图先 POST /v1/files 取 URL
//   - 其它(seedance 等)→ 沿用旧 Veo 字段(零破坏)
// ========================================================================

// 上传本地/远端参考素材到上游 /v1/files 取 URL
// 对齐 gpt-image-2-web 的 uploadFileToAPI: Seedance 的图像、视频、音频都不能直接传 /files/* 本地 URL。
async function uploadRefToZhenzhen(settings, ref, apiKey, label = '参考素材', options = {}) {
  if (typeof ref !== 'string' || !ref) throw new Error(`${label} 上传失败: 引用为空`);
  const trimmed = ref.trim();
  if (/^asset-[a-z0-9_-]+$/i.test(trimmed)) return trimmed;
  let buf, mime, ext;
  if (trimmed.startsWith('data:')) {
    const m = trimmed.match(/^data:([^;,]+);base64,(.+)$/);
    if (!m) throw new Error(`${label} 上传失败: data URL 格式无效`);
    mime = m[1] || 'image/png';
    buf = Buffer.from(m[2], 'base64');
    ext = extFromContentType(mime) || (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  } else if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/files/') ||
    trimmed.startsWith('/api/resources/file/') ||
    trimmed.startsWith('/api/resources/set-file/')
  ) {
    const url = trimmed.startsWith('/') ? `http://127.0.0.1:${config.PORT}${trimmed}` : trimmed;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${label} 上传失败: 读取素材 HTTP ${r.status}`);
    mime = r.headers.get('content-type') || 'image/png';
    buf = Buffer.from(await r.arrayBuffer());
    const tailExt = url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,8})$/i)?.[1];
    ext = extFromContentType(mime) || tailExt || (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  } else {
    throw new Error(`${label} 上传失败: 不支持的引用地址`);
  }
  const fd = new FormData();
  const modelName = String(options?.modelName || options?.model_name || '').trim();
  if (modelName) {
    fd.append('model_name', modelName);
    fd.append('model', modelName);
    fd.append('modelName', modelName);
  }
  const blob = new Blob([buf], { type: mime });
  fd.append('file', blob, `ref_${Date.now()}.${ext}`);
  const upR = await fetch(`${llmBaseUrl(settings)}/v1/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  const upText = await upR.text();
  const preview = String(upText || '').replace(/\s+/g, ' ').slice(0, 300);
  if (!upR.ok) {
    console.warn('[video] /v1/files 上传失败', label, 'status=', upR.status, preview);
    throw new Error(`${label} 上传失败: /v1/files HTTP ${upR.status} ${preview}`);
  }
  let j;
  try {
    j = upText ? JSON.parse(upText) : {};
  } catch {
    throw new Error(`${label} 上传失败: /v1/files 返回非 JSON ${preview}`);
  }
  const uploadedUrl = j?.url || j?.file_url || j?.data?.url || j?.data?.file_url || null;
  if (!uploadedUrl) throw new Error(`${label} 上传失败: /v1/files 未返回 url ${preview}`);
  return uploadedUrl;
}

// ========================================================================
// Video FAL 渠道 — 完全对齐 gpt-image-2-web runVeo3Fal / runGrokFal
// 不破坏原有 /video/submit · /video/query 路由。
//
// POST /api/proxy/video/fal/submit  → { sync, videoUrl?, requestId?, responseUrl?, endpoint? }
// POST /api/proxy/video/fal/query   → { status, videoUrl?, error? }   body: { responseUrl, endpoint, requestId }
// ========================================================================

const VIDEO_FAL_REGISTRY = {
  'veo3.1-fal': {
    endpoint: 'fal-ai/veo3.1/fast/reference-to-video',
    paramKind: 'veo-fal',
    maxRefImages: 3,
  },
  'grok-video-fal': {
    endpoint: 'xai/grok-imagine-video/text-to-video',
    i2vEndpoint: 'xai/grok-imagine-video/image-to-video',
    referenceEndpoint: 'xai/grok-imagine-video/reference-to-video',
    paramKind: 'grok-fal',
    maxRefImages: 7,
    defaultImageMode: 'base64',
  },
  'grok-imagine-video-1.5': {
    endpoint: 'xai/grok-imagine-video/v1.5/image-to-video',
    paramKind: 'grok-fal',
    maxRefImages: 1,
    defaultImageMode: 'base64',
    requiresImage: true,
    disableAspectRatio: true,
  },
  'sora-2': {
    endpoint: 'fal-ai/sora-2/text-to-video',
    i2vEndpoint: 'fal-ai/sora-2/image-to-video',
    paramKind: 'sora-fal',
    maxRefImages: 1,
    defaultImageMode: 'base64',
  },
};

function getFalVideoUrl(data) {
  const video = data && data.video;
  if (video && typeof video === 'object' && video.url) return video.url;
  if (typeof video === 'string') return video;
  return data?.video_url
    || data?.url
    || data?.output?.video?.url
    || data?.data?.output
    || data?.data?.video_url
    || data?.data?.video?.url
    || '';
}

function looseObjectKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

function pushUniqueVideoUrl(out, value) {
  const text = String(value || '').trim();
  if (!text) return;
  if (!/^(https?:\/\/|\/\/|data:video\/|\/files\/|\/output\/)/i.test(text)) return;
  if (!out.includes(text)) out.push(text);
}

function collectLooseVideoUrls(value, out = [], seen = new WeakSet(), acceptString = false) {
  if (!value) return out;
  if (typeof value === 'string') {
    if (acceptString) pushUniqueVideoUrl(out, value);
    return out;
  }
  if (typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLooseVideoUrls(item, out, seen, acceptString);
    }
    return out;
  }
  const preferredKeys = new Set([
    'videourl',
    'videourls',
    'video',
    'videos',
    'outputvideo',
    'outputvideos',
    'outputvideourl',
    'outputvideourls',
    'resultvideo',
    'resultvideos',
    'resultvideourl',
    'resultvideourls',
    'resulturl',
    'resulturls',
    'outputurl',
    'outputurls',
    'fileurl',
    'downloadurl',
    'url',
  ]);
  for (const [key, item] of Object.entries(value)) {
    if (!preferredKeys.has(looseObjectKey(key))) continue;
    if (typeof item === 'string') pushUniqueVideoUrl(out, item);
    else collectLooseVideoUrls(item, out, seen, true);
  }
  for (const item of Object.values(value)) {
    collectLooseVideoUrls(item, out, seen, false);
  }
  return out;
}

function findLooseVideoUrl(value, seen = new WeakSet()) {
  const urls = collectLooseVideoUrls(value, [], seen);
  return urls[0] || '';
}

async function saveRemoteVideos(urls) {
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    const local = await saveRemoteVideo(url);
    if (local && !out.includes(local)) out.push(local);
  }
  return out;
}

function collectMetadataResultUrls(meta, out) {
  if (!meta || typeof meta !== 'object') return;
  const resultUrls = meta.result_urls || meta.resultUrls;
  if (Array.isArray(resultUrls)) {
    for (const url of resultUrls) pushUniqueVideoUrl(out, url);
  }
  pushUniqueVideoUrl(out, meta.result_url || meta.resultUrl || meta.url);
}

function extractApishuVideoUrls(data) {
  const out = [];
  pushUniqueVideoUrl(out, data?.video_url);
  pushUniqueVideoUrl(out, data?.videoUrl);
  pushUniqueVideoUrl(out, data?.url);
  collectMetadataResultUrls(data?.metadata, out);
  pushUniqueVideoUrl(out, data?.data?.video_url);
  pushUniqueVideoUrl(out, data?.data?.videoUrl);
  pushUniqueVideoUrl(out, data?.data?.url);
  collectMetadataResultUrls(data?.data?.metadata, out);
  collectLooseVideoUrls(data, out);
  return out;
}

function extractApishuVideoUrl(data) {
  const urls = extractApishuVideoUrls(data);
  return urls[0] || '';
}

function findLooseValueByKeys(value, keys, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findLooseValueByKeys(item, keys, seen);
      if (nested !== undefined && nested !== null && nested !== '') return nested;
    }
    return undefined;
  }
  for (const [key, item] of Object.entries(value)) {
    if (keys.has(looseObjectKey(key)) && item !== undefined && item !== null && item !== '') return item;
  }
  for (const item of Object.values(value)) {
    const nested = findLooseValueByKeys(item, keys, seen);
    if (nested !== undefined && nested !== null && nested !== '') return nested;
  }
  return undefined;
}

const APISHU_SEEDANCE_MODEL_MAP = new Map(
  Object.entries(MODEL_PROTOCOL_REGISTRY.defaultService?.apishuSeedanceModels || {})
    .map(([key, value]) => [String(key).trim().toLowerCase(), String(value || '').trim()]),
);

function apishuSeedanceUpstreamModel(model) {
  return APISHU_SEEDANCE_MODEL_MAP.get(String(model || '').trim().toLowerCase()) || '';
}

function isApishuSeedanceVideoModel(model) {
  return !!apishuSeedanceUpstreamModel(model);
}

function isApishuVeoOmniModel(model) {
  return /^(?:veo-)?omni-flash(?:-(?:components|edit|video-edit))?$/
    .test(String(model || '').trim().toLowerCase());
}

function apishuVeoOmniMode(model) {
  const normalized = String(model || '').trim().toLowerCase().replace(/^veo-/, '');
  if (normalized.endsWith('-video-edit') || normalized.endsWith('-edit')) return 'edit';
  if (normalized.endsWith('-components')) return 'components';
  return 'flash';
}

function apishuVideosEndpoint(settings, taskId = '') {
  const configured = zhenzhenBaseUrl(settings);
  const base = configured.replace(/\/+$/, '').replace(/\/v1$/i, '');
  const suffix = taskId ? `/${encodeURIComponent(String(taskId))}` : '';
  return `${base}/v1/videos${suffix}`;
}

async function apishuSeedanceImageRef(ref) {
  const text = String(ref || '').trim();
  if (!text) return '';
  if (/^(https?:\/\/|data:image\/)/i.test(text)) return text;
  const conv = await refToBuffer(text);
  if (!conv) return '';
  const mime = String(conv.mime || 'image/png').split(';')[0].trim() || 'image/png';
  if (!mime.toLowerCase().startsWith('image/')) return '';
  return `data:${mime};base64,${Buffer.from(conv.buf).toString('base64')}`;
}

async function videosApiMediaRef(settings, apiKey, ref, kind = 'image') {
  const text = String(ref || '').trim();
  if (!text) return '';
  if (/^(https?:\/\/|asset:\/\/)/i.test(text)) return text;
  if (text.startsWith('data:')) {
    const mime = text.match(/^data:([^;,]+)/)?.[1] || '';
    if (kind === 'image' && !/^image\//i.test(mime)) return '';
    if (kind === 'video' && !/^video\//i.test(mime)) return '';
    if (kind === 'audio' && !/^audio\//i.test(mime)) return '';
    return await newApiPublicMediaUrl(settings, apiKey, text, kind) || text;
  }
  const publicUrl = await newApiPublicMediaUrl(settings, apiKey, text, kind);
  if (publicUrl) return publicUrl;
  const conv = await refToBuffer(text);
  if (!conv?.buf) return '';
  const fallbackMime = kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png';
  const mime = String(conv.mime || fallbackMime).split(';')[0].trim() || fallbackMime;
  if (kind === 'image' && !mime.toLowerCase().startsWith('image/')) return '';
  if (kind === 'video' && !mime.toLowerCase().startsWith('video/')) return '';
  if (kind === 'audio' && !mime.toLowerCase().startsWith('audio/')) return '';
  return `data:${mime};base64,${Buffer.from(conv.buf).toString('base64')}`;
}

function videosApiRefObjectUrl(ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return '';
  const direct = ref.url || ref.file_url || ref.fileUrl || ref.src || ref.href;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = ref.image_url || ref.imageUrl || ref.video_url || ref.videoUrl || ref.audio_url || ref.audioUrl;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  if (nested && typeof nested === 'object' && typeof nested.url === 'string') return nested.url.trim();
  return '';
}

function videosApiRefObjectKind(ref, fallback = 'image') {
  const raw = String(ref?.type || ref?.kind || ref?.mediaType || fallback || 'image').trim().toLowerCase();
  if (raw.includes('video')) return 'video';
  if (raw.includes('audio')) return 'audio';
  return 'image';
}

async function videosApiStructuredRefs(settings, apiKey, refs, fallbackKind = 'image') {
  const rawRefs = Array.isArray(refs) ? refs : [];
  const out = [];
  for (const ref of rawRefs) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue;
    const kind = videosApiRefObjectKind(ref, fallbackKind);
    const rawUrl = videosApiRefObjectUrl(ref);
    if (!rawUrl) continue;
    const url = await videosApiMediaRef(settings, apiKey, rawUrl, kind);
    if (!url) continue;
    out.push({
      ...ref,
      type: ref.type || kind,
      url,
    });
  }
  return out;
}

async function xsTokenMediaUrlList(settings, apiKey, refs, kind = 'image') {
  const rawRefs = Array.isArray(refs) ? refs : [];
  const out = [];
  for (const ref of rawRefs) {
    const text = String(ref || '').trim();
    if (!text) continue;
    let url = '';
    if (kind === 'image' || kind === 'video' || kind === 'audio') {
      url = await videosApiMediaRef(settings, apiKey, text, kind);
    }
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

function xsTokenVideoResolution(model, inputResolution) {
  const raw = String(inputResolution || '').trim().toLowerCase();
  const modelText = String(model || '').trim().toLowerCase();
  if (modelText.includes('1080p')) return '1080p';
  if (['480p', '720p', '1080p'].includes(raw)) return raw;
  return '720p';
}

async function buildVideosApiPayload(input = {}) {
  const settings = input.settings || null;
  const apiKey = input.apiKey || '';
  const providerParams = input.providerParams && typeof input.providerParams === 'object' ? input.providerParams : {};
  const model = String(input.model || '').trim();
  if (!model) throw new Error('XS-Token 视频模型不能为空');
  const prompt = String(input.prompt || '').trim();
  const duration = Math.max(4, Math.min(15, parseInt(input.duration ?? providerParams.duration ?? 5, 10) || 5));
  const ratio = String(input.ratio || input.aspect_ratio || providerParams.ratio || providerParams.aspect_ratio || '16:9');
  const resolution = xsTokenVideoResolution(model, input.resolution || providerParams.resolution);

  const imageCandidates = [];
  if (input.firstFrame) imageCandidates.push(input.firstFrame);
  if (input.lastFrame) imageCandidates.push(input.lastFrame);
  const refImageObjects = [];
  if (Array.isArray(input.refImages)) {
    for (const ref of input.refImages) {
      if (ref && typeof ref === 'object' && !Array.isArray(ref)) refImageObjects.push(ref);
      else imageCandidates.push(ref);
    }
  }
  const imageUrls = await xsTokenMediaUrlList(settings, apiKey, imageCandidates.slice(0, 9), 'image');
  const structuredRefs = await videosApiStructuredRefs(settings, apiKey, refImageObjects.slice(0, 9), 'image');
  const videoUrls = await xsTokenMediaUrlList(settings, apiKey, Array.isArray(input.videos) ? input.videos.slice(0, 3) : [], 'video');
  const audioUrls = await xsTokenMediaUrlList(settings, apiKey, Array.isArray(input.audios) ? input.audios.slice(0, 3) : [], 'audio');

  if (/sora/i.test(model)) {
    const payload = {
      model,
      prompt,
      duration,
      video_config: {
        aspect_ratio: ratio,
        resolution_name: resolution,
      },
    };
    if (imageUrls.length === 1) {
      payload.image_url = imageUrls[0];
      payload.video_config.reference_mode = 'image_reference';
    } else if (imageUrls.length > 1) {
      payload.reference_image_urls = imageUrls;
      payload.video_config.reference_mode = imageUrls.length >= 2 ? 'start_end' : 'auto';
    }
    if (structuredRefs.length) {
      payload.refImages = structuredRefs;
      payload.video_config.reference_mode = payload.video_config.reference_mode || 'auto';
    }
    if (videoUrls.length === 1) payload.reference_video = videoUrls[0];
    if (videoUrls.length > 1) payload.reference_videos = videoUrls;
    return payload;
  }

  const payload = {
    model,
    mode: 'text_to_video',
    prompt,
    resolution,
    duration,
    ratio,
    generate_audio: input.generate_audio !== false,
  };
  if (imageUrls.length) {
    payload.image_urls = imageUrls;
    payload.mode = input.firstFrame && input.lastFrame && imageUrls.length >= 2 ? 'first_last_frame' : 'image_to_video';
  }
  if (videoUrls.length) {
    payload.video_urls = videoUrls;
    payload.mode = 'multi_ref';
  }
  if (audioUrls.length) {
    payload.audio_urls = audioUrls;
    payload.mode = 'multi_ref';
  }
  if (structuredRefs.length) {
    payload.refImages = structuredRefs;
    payload.mode = 'multi_ref';
  }
  if (typeof input.seed === 'number' && input.seed !== -1) payload.seed = input.seed;
  return payload;
}

async function apishuVeoOmniMediaRef(ref, expectedKind = 'image') {
  const text = String(ref || '').trim();
  if (!text) return '';
  const kindPattern = expectedKind === 'video' ? /^data:video\//i : /^data:image\//i;
  if (/^https?:\/\//i.test(text) || kindPattern.test(text)) return text;
  const conv = await refToBuffer(text);
  if (!conv) return '';
  const fallbackMime = expectedKind === 'video' ? 'video/mp4' : 'image/png';
  const mime = String(conv.mime || fallbackMime).split(';')[0].trim() || fallbackMime;
  if (expectedKind === 'video' && !mime.toLowerCase().startsWith('video/')) return '';
  if (expectedKind === 'image' && !mime.toLowerCase().startsWith('image/')) return '';
  return `data:${mime};base64,${Buffer.from(conv.buf).toString('base64')}`;
}

async function skyleeOmniPublicMediaRef(settings, apiKey, ref, expectedKind = 'image') {
  const text = String(ref || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  const publicUrl = await newApiPublicMediaUrl(settings, apiKey, text, expectedKind);
  return /^https?:\/\//i.test(publicUrl) ? publicUrl : '';
}

function apishuSeedanceReferenceName(url, index, kind) {
  const prefix = kind === 'audio' ? 'Audio' : 'Image';
  try {
    if (String(url || '').startsWith('data:')) return `${prefix}${index + 1}`;
    const clean = String(url || '').split(/[?#]/)[0];
    const base = clean.split('/').pop() || '';
    const stem = base.replace(/\.[a-z0-9]{2,8}$/i, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
    return stem.slice(0, 48) || `${prefix}${index + 1}`;
  } catch {
    return `${prefix}${index + 1}`;
  }
}

async function buildApishuSeedancePayload(input = {}) {
  const providerParams = input.providerParams && typeof input.providerParams === 'object' ? input.providerParams : {};
  const payload = {
    model: apishuSeedanceUpstreamModel(input.model),
    prompt: String(input.prompt || '').trim(),
    duration: Math.max(4, Math.min(15, parseInt(input.duration ?? providerParams.duration ?? 5, 10) || 5)),
    aspect_ratio: String(input.ratio || input.aspect_ratio || providerParams.ratio || providerParams.aspect_ratio || '16:9'),
  };
  const externalRequestId = input.external_request_id || providerParams.external_request_id || providerParams.externalRequestId;
  if (externalRequestId) payload.external_request_id = String(externalRequestId);

  const imageCandidates = [];
  if (input.firstFrame) imageCandidates.push(input.firstFrame);
  if (input.lastFrame) imageCandidates.push(input.lastFrame);
  if (Array.isArray(input.refImages)) imageCandidates.push(...input.refImages);
  const images = [];
  for (const ref of imageCandidates.slice(0, 9)) {
    const url = await apishuSeedanceImageRef(ref);
    if (url && !images.includes(url)) images.push(url);
  }

  const references = [];
  images.forEach((url, index) => {
    references.push({ type: 'image', url, name: apishuSeedanceReferenceName(url, index, 'image') });
  });
  if (Array.isArray(input.audios)) {
    for (const raw of input.audios.slice(0, 3)) {
      const url = String(raw || '').trim();
      if (!/^(https?:\/\/|data:audio\/)/i.test(url)) continue;
      references.push({ type: 'audio', url, name: apishuSeedanceReferenceName(url, references.length, 'audio') });
    }
  }
  if (references.length) payload.references = references;
  return payload;
}

async function buildApishuVeoOmniPayload(input = {}) {
  const providerParams = input.providerParams && typeof input.providerParams === 'object' ? input.providerParams : {};
  const model = String(input.model || '').trim();
  const mode = apishuVeoOmniMode(model);
  const isLegacyModel = /^veo-/i.test(model);

  if (!isLegacyModel) {
    const allowedSeconds = new Set([4, 6, 8, 10]);
    const requestedSeconds = parseInt(input.seconds ?? input.duration ?? providerParams.seconds ?? providerParams.duration ?? 6, 10);
    const seconds = allowedSeconds.has(requestedSeconds) ? requestedSeconds : 6;
    const requestedResolution = String(input.resolution || providerParams.resolution || '720p').trim().toLowerCase();
    const resolution = ['720p', '1080p', '4k'].includes(requestedResolution) ? requestedResolution : '720p';
    const aspectRatio = String(input.aspect_ratio || input.ratio || providerParams.aspect_ratio || providerParams.ratio || '16:9');
    const payload = {
      model,
      prompt: String(input.prompt || '').trim(),
      resolution,
      aspect_ratio: aspectRatio,
      seconds,
    };

    if (mode === 'edit') {
      const rawVideos = Array.isArray(input.videos)
        ? input.videos
        : [input.video_url || input.video || providerParams.video_url || providerParams.videoUrl || providerParams.video].filter(Boolean);
      const videoUrl = await skyleeOmniPublicMediaRef(input.settings, input.apiKey, rawVideos[0], 'video');
      if (!videoUrl) throw new Error('omni-flash-edit 需要 1 个源视频，且素材必须可公开上传');
      payload.video_urls = [videoUrl];
      return payload;
    }

    const rawImages = Array.isArray(input.images) ? input.images : [];
    const maxImages = mode === 'components' ? 9 : 1;
    const imageUrls = [];
    for (const ref of rawImages.slice(0, maxImages)) {
      const url = await skyleeOmniPublicMediaRef(input.settings, input.apiKey, ref, 'image');
      if (!url) throw new Error('Omni 参考图无法上传为公开 URL，请重新选择素材');
      if (!imageUrls.includes(url)) imageUrls.push(url);
    }
    if (mode === 'components' && imageUrls.length === 0) {
      throw new Error('omni-flash-components 至少需要 1 张参考图');
    }
    if (imageUrls.length) payload.image_urls = imageUrls;
    return payload;
  }

  const isEdit = mode === 'edit';
  const payload = {
    model,
    prompt: String(input.prompt || '').trim(),
    duration: 10,
    aspect_ratio: String(input.aspect_ratio || input.ratio || providerParams.aspect_ratio || providerParams.ratio || '16:9'),
  };
  const externalRequestId = input.external_request_id || providerParams.external_request_id || providerParams.externalRequestId;
  if (externalRequestId) payload.external_request_id = String(externalRequestId);

  const imageRefs = Array.isArray(input.images) ? input.images : [];
  const images = [];
  for (const ref of imageRefs.slice(0, 9)) {
    const url = await apishuVeoOmniMediaRef(ref, 'image');
    if (url && !images.includes(url)) images.push(url);
  }

  if (isEdit) {
    const rawVideo = String(
      (Array.isArray(input.videos) ? input.videos[0] : '') ||
      input.video_url ||
      input.video ||
      providerParams.video_url ||
      providerParams.videoUrl ||
      providerParams.video ||
      '',
    ).trim();
    const videoUrl = await apishuVeoOmniMediaRef(rawVideo, 'video');
    if (!videoUrl) throw new Error('veo-omni-flash-video-edit 需要 1 个源视频(video_url/video)，仅参考图不能编辑视频');
    payload.video_url = videoUrl;
    if (images.length) payload.Ingredients_images = images;
    if (providerParams.strip_audio != null || providerParams.stripAudio != null) {
      payload.strip_audio = Boolean(providerParams.strip_audio ?? providerParams.stripAudio);
    }
    return payload;
  }

  const legacyMode = String(providerParams.veoOmniMode || providerParams.mode || '').trim().toLowerCase();
  if (legacyMode === 'frames') {
    payload.mode = 'frames';
    if (images.length) payload.images = images.slice(0, 2);
  } else if (legacyMode === 'text') {
    payload.mode = 'text';
  } else if (images.length) {
    payload.mode = 'reference';
    payload.Ingredients_images = images;
  }
  return payload;
}

function splitSoraCharacterIds(raw) {
  return String(raw || '')
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function splitGrokReferenceUrls(raw) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(/[,，\n]/);
  return values
    .map((s) => String(s || '').trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

function stripDataUrlPrefix(value) {
  const text = String(value || '').trim();
  const match = /^data:[^,;]+;base64,(.+)$/i.exec(text);
  return match ? match[1].trim() : text;
}

const VEO_OMNI_PUBLIC_MODEL = 'veo-omni-10s';
const VEO_OMNI_UPSTREAM_MODEL = 'omni_flash-10s';
const GROK_VIDEO_1_5_NEW_MODELS = new Set([
  'grok-1.5-video-6s',
  'grok-1.5-video-10s',
  'grok-1.5-video-15s',
]);

function isVeoOmniModel(model) {
  const m = String(model || '').trim().toLowerCase();
  return m === VEO_OMNI_PUBLIC_MODEL || m === VEO_OMNI_UPSTREAM_MODEL;
}

function isGrokVideo15NewModel(model) {
  const m = String(model || '').trim().toLowerCase();
  return GROK_VIDEO_1_5_NEW_MODELS.has(m);
}

function veoOmniSizeFromAspect(aspectRatio) {
  return String(aspectRatio || '').trim() === '9:16' ? '720x1280' : '1280x720';
}

function grokVideo15NewSizeFromRatio(ratioOrSize) {
  const value = String(ratioOrSize || '').trim();
  if (value === '720x1280') return '720x1280';
  if (value === '9:16') return '720x1280';
  return '1280x720';
}

async function appendGrokVideo15InputReference(form, ref) {
  const refText = String(ref || '').trim();
  if (!refText) return false;
  if (/^https?:\/\//i.test(refText)) {
    form.append('input_reference', refText);
    return true;
  }
  const conv = await refToBuffer(refText);
  if (!conv) return false;
  form.append('input_reference', new Blob([conv.buf], { type: conv.mime || 'image/png' }), `input_reference.${conv.ext || 'png'}`);
  return true;
}

function normalizeVideoTaskStatus(status) {
  const payload = status && typeof status === 'object' ? status : null;
  const statusKeys = new Set(['status', 'taskstatus', 'state', 'genstatus', 'generationstatus', 'taskstate', 'resultstatus']);
  const codeKeys = new Set(['statuscode', 'code', 'errorcode', 'errcode']);
  const progressKeys = new Set(['progress', 'percentage', 'percent']);
  const rawValue = payload ? findLooseValueByKeys(payload, statusKeys) : status;
  const raw = String(rawValue ?? '').trim();
  const lower = raw.toLowerCase();
  if (['success', 'succeeded', 'completed', 'complete', 'done', 'finished', 'ok', 'generated', '生成成功', '任务成功', 'successed', '成功', '已成功', '完成', '已完成', '已生成'].includes(lower)) return 'SUCCESS';
  if (['failure', 'failed', 'fail', 'error', 'errored', 'cancelled', 'canceled', 'timeout', 'timedout', 'expired', 'rejected', '生成失败', '任务失败', '失败', '已失败', '错误', '异常', '超时', '已超时', '取消', '已取消'].includes(lower)) return 'FAILURE';
  if (['running', 'processing', 'in_progress', 'in-progress', 'inprogress', 'progressing', 'generating', 'started', 'active', '生成中', '处理中', '进行中', '执行中', '运行中'].includes(lower)) return 'RUNNING';
  if (['queued', 'pending', 'created', 'submitted', 'starting', 'waiting', 'wait', 'in_queue', 'in-queue', 'inqueue', '排队中', '队列中', '等待中', '待处理', '已提交', '已创建'].includes(lower)) return 'PENDING';
  if (payload) {
    const codeRaw = findLooseValueByKeys(payload, codeKeys);
    const code = String(codeRaw ?? '').trim().toLowerCase();
    if (['400', '401', '403', '404', '408', '409', '422', '429', '500', '502', '503', '504', '-1', 'false'].includes(code)) return 'FAILURE';
    const remoteVideo = extractApishuVideoUrl(payload);
    const progressRaw = findLooseValueByKeys(payload, progressKeys);
    const progress = parseFloat(String(progressRaw ?? '').replace('%', ''));
    if (remoteVideo && (['0', '200', 'success', 'ok', 'true'].includes(code) || !code || progress >= 100)) return 'SUCCESS';
    if (progress >= 100 && !imageError(payload)) return 'SUCCESS';
  }
  return raw ? raw.toUpperCase() : '';
}

function stringifyUpstreamErrorValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if (typeof value.message === 'string') return value.message.trim();
    if (typeof value.msg === 'string') return value.msg.trim();
    if (typeof value.detail === 'string') return value.detail.trim();
    try { return JSON.stringify(value).slice(0, 500); } catch { return ''; }
  }
  return String(value).trim();
}

function getUpstreamErrorMessage(data, text, status) {
  const candidates = [
    data?.error?.message,
    data?.error,
    data?.message,
    data?.msg,
    data?.detail,
    data?.error_msg,
    data?.fail_reason,
    data?.data?.error?.message,
    data?.data?.error,
    data?.data?.message,
    data?.data?.msg,
    data?.data?.detail,
    data?.data?.fail_reason,
  ];
  for (const candidate of candidates) {
    const msg = stringifyUpstreamErrorValue(candidate);
    if (msg) return `上游 HTTP ${status}: ${msg}`;
  }
  const rawText = String(text || '').trim();
  if (rawText) return `上游 HTTP ${status}: ${rawText.slice(0, 500)}`;
  return `上游 HTTP ${status}`;
}

const SAVE_REMOTE_VIDEO_TIMEOUT_MS = 12000;

// 保存远程视频到本地；远程下载慢或需要鉴权时不阻塞轮询完成，直接回填远程 URL。
async function saveRemoteVideo(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAVE_REMOTE_VIDEO_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`下载失败: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (url.match(/\.(mp4|webm|mov)/i)?.[1] || 'mp4').toLowerCase();
    const filename = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const filePath = path.join(config.OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, buf);
    return `/files/output/${filename}`;
  } catch (e) {
    console.error('⚠ 转存视频失败:', e.message);
    return url;
  } finally {
    clearTimeout(timer);
  }
}

async function saveAuthenticatedVideoContent(settings, apiKey, taskId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAVE_REMOTE_VIDEO_TIMEOUT_MS);
  try {
    const response = await fetch(`${apishuVideosEndpoint(settings, taskId)}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`视频内容下载失败: HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const ext = safeOutputExt(extFromContentType(contentType), 'mp4');
    const filename = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    fs.writeFileSync(path.join(config.OUTPUT_DIR, filename), Buffer.from(await response.arrayBuffer()));
    return `/files/output/${filename}`;
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/proxy/video/fal/submit
router.post('/video/fal/submit', async (req, res) => {
  const settings = currentSettings();
  const {
    apiModel, prompt, images,
    // veo-fal
    aspect_ratio, duration, resolution, generate_audio, safety_tolerance, image_mode,
    // grok-fal
    gkDuration, gkRatio, gkMode, gkReferenceUrls,
    // sora-fal
    soraMode, soraRatio, soraDuration, soraResolution, soraDeleteVideo, soraBlockIp, soraCharacterIds,
  } = req.body || {};
  const rawApiModel = String(apiModel || '').trim();
  // 历史节点里可能保存过日期版 Sora2 选项；T8 现在只暴露稳定的 sora-2 FAL。
  const effectiveApiModel = /^sora-2(?:-\d{4}-\d{2}-\d{2})?$/.test(rawApiModel) ? 'sora-2' : rawApiModel;
  // FAL 全部固定使用通用服务 API Key，不参与 New API 分组令牌。
  if (!ensureDefaultZhenzhenKey(settings, res, '视频 FAL')) return;
  let apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);

  if (!rawApiModel) return res.status(400).json({ success: false, error: 'apiModel 必填' });
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt 不得为空' });

  const reg = VIDEO_FAL_REGISTRY[effectiveApiModel];
  if (!reg) return res.status(400).json({ success: false, error: `未知的 Video FAL 模型: ${rawApiModel}` });

  const refs = Array.isArray(images) ? images.filter(Boolean) : [];
  const trimmedRefs = refs.slice(0, reg.maxRefImages);

  let payload;
  let endpoint;
  try {
    if (reg.paramKind === 'veo-fal') {
      // ===== Veo3.1 FAL (主项目 runVeo3Fal line 3694) =====
      endpoint = reg.endpoint;
      payload = {
        prompt,
        aspect_ratio: String(aspect_ratio || '16:9'),
        duration: String(duration || '8s'),
        resolution: String(resolution || '720p'),
        generate_audio: generate_audio === true,
        safety_tolerance: parseInt(safety_tolerance ?? 4, 10) || 4,
      };
      // 参考图(最多 3 张)
      if (trimmedRefs.length) {
        const imgArr = [];
        const useBase64 = String(image_mode || 'image_url') === 'base64';
        for (let i = 0; i < trimmedRefs.length; i++) {
          if (useBase64) {
            // base64 直传
            const conv = await refToBananaImage(trimmedRefs[i]);
            if (conv) imgArr.push(conv);
          } else {
            const u = await uploadRefToZhenzhen(settings, trimmedRefs[i], apiKey);
            if (u) imgArr.push(u);
            else throw new Error(`FAL 参考图 #${i + 1} 上传失败`);
          }
        }
        if (imgArr.length) payload.image_urls = imgArr;
      }
    } else if (reg.paramKind === 'grok-fal') {
      // ===== Grok Video FAL (主项目 runGrokFal line 3787) =====
      const isV15 = effectiveApiModel === 'grok-imagine-video-1.5';
      const grokUploadOptions = { modelName: effectiveApiModel };
      const mode = isV15
        ? 'image_to_video'
        : String(gkMode || 'image_to_video') === 'reference_to_video' ? 'reference_to_video' : 'image_to_video';
      const extraReferenceUrls = splitGrokReferenceUrls(gkReferenceUrls);
      const hasImg = trimmedRefs.length > 0;
      const effectiveRatio = (mode === 'reference_to_video' || !hasImg) && String(gkRatio || '16:9') === 'auto'
        ? '16:9'
        : String(gkRatio || '16:9');
      payload = {
        prompt,
        duration: parseInt(gkDuration ?? 6, 10) || 6,
        resolution: String(resolution || '720p'),
      };
      if (!isV15) payload.aspect_ratio = effectiveRatio;
      const useBase64 = String(image_mode || reg.defaultImageMode || 'base64') === 'base64';
      if (isV15) {
        endpoint = reg.endpoint;
        if (!hasImg) throw new Error('Grok Video 1.5 requires one uploaded image');
        const imgData = useBase64
          ? await refToBananaImage(trimmedRefs[0])
          : await uploadRefToZhenzhen(settings, trimmedRefs[0], apiKey, 'Grok Video 1.5 参考图', grokUploadOptions);
        if (imgData) payload.image_url = imgData;
        else throw new Error('Grok Video 1.5 参考图处理失败');
      } else if (mode === 'reference_to_video') {
        endpoint = reg.referenceEndpoint || reg.i2vEndpoint || reg.endpoint;
        const referenceImageUrls = [];
        const uploadRefs = trimmedRefs.slice(0, 7);
        for (let i = 0; i < uploadRefs.length && referenceImageUrls.length < 7; i++) {
          const imgData = useBase64
            ? await refToBananaImage(uploadRefs[i])
            : await uploadRefToZhenzhen(settings, uploadRefs[i], apiKey, `Grok FAL 参考图 #${i + 1}`, grokUploadOptions);
          if (imgData) referenceImageUrls.push(imgData);
          else throw new Error(`Grok FAL 参考图 #${i + 1} 处理失败`);
        }
        for (const url of extraReferenceUrls) {
          if (referenceImageUrls.length >= 7) break;
          referenceImageUrls.push(url);
        }
        if (!referenceImageUrls.length) throw new Error('Grok FAL 参考生视频需要至少 1 张参考图或 URL');
        payload.reference_image_urls = referenceImageUrls;
      } else {
        endpoint = hasImg ? (reg.i2vEndpoint || reg.endpoint) : reg.endpoint;
        // 图生视频模式: 单张 image_url；无图时保留文生视频 fallback。
        if (hasImg) {
          const imgData = useBase64
            ? await refToBananaImage(trimmedRefs[0])
            : await uploadRefToZhenzhen(settings, trimmedRefs[0], apiKey, 'Grok FAL 参考图', grokUploadOptions);
          if (imgData) payload.image_url = imgData;
          else throw new Error('Grok FAL 参考图处理失败');
        }
      }
    } else if (reg.paramKind === 'sora-fal') {
      // ===== Sora2 FAL (主项目 runSora2Fal line 5341) =====
      const hasImg = trimmedRefs.length > 0;
      let mode = String(soraMode || 'auto');
      if (!['auto', 'text_to_video', 'image_to_video'].includes(mode)) mode = 'auto';
      if (mode === 'auto') mode = hasImg ? 'image_to_video' : 'text_to_video';
      if (mode === 'image_to_video' && !hasImg) throw new Error('FAL Sora2 image-to-video requires one uploaded image');

      const ratio = String(soraRatio || aspect_ratio || '16:9');
      const reso = String(soraResolution || resolution || '720p');
      endpoint = mode === 'image_to_video' ? (reg.i2vEndpoint || reg.endpoint) : reg.endpoint;
      payload = {
        prompt,
        resolution: mode === 'text_to_video' && reso === 'auto' ? '720p' : reso,
        aspect_ratio: mode === 'text_to_video' && ratio === 'auto' ? '16:9' : ratio,
        duration: parseInt(soraDuration ?? duration ?? 4, 10) || 4,
        delete_video: soraDeleteVideo !== false,
        model: effectiveApiModel,
        detect_and_block_ip: soraBlockIp === true,
      };
      const ids = splitSoraCharacterIds(soraCharacterIds);
      if (ids.length) payload.character_ids = ids;
      if (mode === 'image_to_video') {
        const useBase64 = String(image_mode || 'base64') === 'base64';
        const imgData = useBase64
          ? await refToBananaImage(trimmedRefs[0])
          : await uploadRefToZhenzhen(settings, trimmedRefs[0], apiKey);
        if (imgData) payload.image_url = imgData;
        else throw new Error('Sora2 FAL 参考图处理失败');
      }
    } else {
      return res.status(400).json({ success: false, error: `不支持的 Video FAL paramKind: ${reg.paramKind}` });
    }

    const falUrl = `${baseUrl}/fal/${endpoint}`;
    console.log('[video/fal/submit]', effectiveApiModel, '→', falUrl, '| payload keys:', Object.keys(payload), '| refs:', trimmedRefs.length);

    const resp = await fetch(falUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    if (!resp.ok) {
      return res.status(resp.status).json({
        success: false,
        error: data?.error || data?.detail || data?.message || `FAL HTTP ${resp.status}: ${text.slice(0, 300)}`,
      });
    }
    if (Array.isArray(data)) {
      return res.status(400).json({ success: false, error: `FAL 参数校验错误: ${JSON.stringify(data).slice(0, 300)}` });
    }
    if (data?.detail && !data?.video && !data?.request_id) {
      return res.status(400).json({ success: false, error: `FAL 错误: ${JSON.stringify(data.detail).slice(0, 300)}` });
    }

    // 同步返回: result.video.url 或同类 video_url/url 字段
    const syncVideoUrl = getFalVideoUrl(data);
    if (syncVideoUrl) {
      const local = await saveRemoteVideo(syncVideoUrl);
      return res.json({ success: true, data: { sync: true, videoUrl: local, endpoint, raw: data } });
    }

    // 异步: request_id + response_url
    const requestId = data?.request_id;
    let responseUrl = data?.response_url || '';
    if (!requestId) {
      return res.status(500).json({ success: false, error: '未获取到 request_id: ' + JSON.stringify(data).slice(0, 300) });
    }
    responseUrl = fixFalResponseUrl(responseUrl, baseUrl, endpoint, requestId);
    rememberTaskKey(requestId, apiKey, { model: effectiveApiModel, endpoint });
    return res.json({
      success: true,
      data: { sync: false, requestId, responseUrl, endpoint, raw: data },
    });
  } catch (e) {
    console.error('proxy/video/fal/submit 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

// POST /api/proxy/video/fal/query
//   body: { responseUrl, endpoint, requestId }
//   完成标志: data.video.url (区别于图像的 data.images[])
router.post('/video/fal/query', async (req, res) => {
  const settings = currentSettings();
  const { responseUrl: rawUrl, endpoint, requestId } = req.body || {};
  const rememberedMeta = recallTaskMeta(requestId);
  if (rememberedMeta?.apiKey) {
    if (settings) settings.zhenzhenApiKey = rememberedMeta.apiKey;
    else return res.status(400).json({ success: false, error: '未找到 settings' });
  } else {
    // FAL 查询和提交保持同一策略：只用通用服务 API Key。
    if (!ensureDefaultZhenzhenKey(settings, res, '视频 FAL')) return;
  }
  const apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);
  const responseUrl = fixFalResponseUrl(rawUrl, baseUrl, endpoint, requestId);
  if (!responseUrl) return res.status(400).json({ success: false, error: 'responseUrl 或 (endpoint+requestId) 必填' });

  try {
    const pr = await fetch(responseUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await pr.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    // HTTP 非200: 主项目规范 - body 中 status=IN_QUEUE/IN_PROGRESS 视为继续等待
    if (!pr.ok) {
      if (data && (data.status === 'IN_QUEUE' || data.status === 'IN_PROGRESS')) {
        return res.json({ success: true, data: { status: 'pending', raw: data } });
      }
      return res.status(pr.status).json({
        success: false,
        error: `FAL Poll HTTP ${pr.status}: ${text.slice(0, 300)}`,
        raw: data,
      });
    }
    if (!data) {
      return res.status(500).json({ success: false, error: 'FAL Poll 响应非 JSON: ' + text.slice(0, 200) });
    }
    // 完成: video.url 或同类 video_url/url 字段
    const finishedVideoUrl = getFalVideoUrl(data);
    if (finishedVideoUrl) {
      const local = await saveRemoteVideo(finishedVideoUrl);
      return res.json({ success: true, data: { status: 'completed', videoUrl: local, raw: data } });
    }
    const st = String(data.status || '').toUpperCase();
    if (st === 'FAILED' || st === 'CANCELLED') {
      return res.json({
        success: false,
        data: { status: 'failed', error: data.error || data.detail || `FAL ${st}` },
      });
    }
    // IN_QUEUE / IN_PROGRESS / 空 => pending
    return res.json({ success: true, data: { status: 'pending', falStatus: st || 'IN_QUEUE', raw: data } });
  } catch (e) {
    console.error('proxy/video/fal/query 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '查询失败' });
  }
});

// ========================================================================
// Fal 超市通用 FAL Queue 适配器
// 不替换现有 /image/fal/* 与 /video/fal/* 路由；这里只服务新的 Fal超市节点。
// ========================================================================

const FAL_TOOLBOX_PENDING = new Set(['IN_QUEUE', 'IN_PROGRESS', 'PENDING', 'RUNNING', 'QUEUED']);
const FAL_TOOLBOX_COMPLETED = new Set(['COMPLETED', 'COMPLETE', 'DONE', 'SUCCEEDED', 'SUCCESS']);
const FAL_TOOLBOX_FAILED = new Set(['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED']);

function isFalToolboxEndpoint(value) {
  const endpoint = String(value || '').trim();
  return !!endpoint && /^[a-z0-9._~:/-]+$/i.test(endpoint) && !endpoint.includes('..') && !/^https?:\/\//i.test(endpoint);
}

function falToolboxStatusValue(data) {
  if (!data || typeof data !== 'object') return '';
  const status = data.status ?? data.state ?? data.task_status ?? data.taskStatus;
  return String(status || '').trim().toUpperCase();
}

function falToolboxErrorMessage(data, fallback = 'FAL 任务失败') {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  const candidates = [
    data.failure_details,
    data.failure_reason,
    data.fail_reason,
    data.error,
    data.errors,
    data.detail,
    data.message,
    data.msg,
    data.data?.failure_details,
    data.data?.error,
    data.data?.detail,
    data.data?.message,
  ];
  for (const candidate of candidates) {
    if (candidate == null || candidate === '' || (Array.isArray(candidate) && !candidate.length)) continue;
    const msg = stringifyUpstreamErrorValue(candidate);
    if (msg) return msg;
  }
  try {
    return JSON.stringify(data).slice(0, 800);
  } catch {
    return fallback;
  }
}

function fixFalToolboxUrl(url, baseUrl, endpoint, requestId) {
  let value = String(url || '').trim();
  if (value.includes('queue.fal.run')) value = value.replace('https://queue.fal.run', `${baseUrl}/fal`);
  if (value.includes('fal.run')) value = value.replace('https://fal.run', `${baseUrl}/fal`);
  if (!value && endpoint && requestId) value = `${baseUrl}/fal/${endpoint}/requests/${requestId}`;
  return value;
}

function getByPath(data, pathText) {
  if (!data || !pathText) return undefined;
  const parts = String(pathText).split('.').filter(Boolean);
  let cur = data;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function collectFalToolboxUrls(value, out = []) {
  const pushUrl = (url) => {
    const text = String(url || '').trim();
    if (text && !out.includes(text)) out.push(text);
  };
  if (value == null) return out;
  if (typeof value === 'string') {
    if (/^(https?:\/\/|\/files\/|\/output\/|\/input\/)/i.test(value) || /^data:/i.test(value)) pushUrl(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFalToolboxUrls(item, out);
    return out;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') pushUrl(value.url);
    if (typeof value.file_url === 'string') pushUrl(value.file_url);
    if (typeof value.fileUrl === 'string') pushUrl(value.fileUrl);
    for (const child of Object.values(value)) collectFalToolboxUrls(child, out);
  }
  return out;
}

function collectFalToolboxText(value, out = []) {
  if (value == null) return out;
  if (typeof value === 'string') {
    if (!/^(https?:\/\/|\/files\/|data:)/i.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFalToolboxText(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'caption', 'prompt']) {
      if (typeof value[key] === 'string') out.push(value[key]);
    }
  }
  return out;
}

async function saveRemoteFalToolboxFile(url, kind) {
  if (/^\/(files|output|input)\//i.test(String(url || ''))) return url;
  if (kind === 'image') return saveRemoteImage(url);
  if (kind === 'video') return saveRemoteVideo(url);
  if (kind === 'audio') return saveRemoteAudio(url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const cleanUrl = String(url || '').split(/[?#]/)[0];
    const match = cleanUrl.match(/\.([a-z0-9]{2,8})$/i);
    const ext = safeOutputExt(match?.[1], kind === 'model3d' ? 'glb' : 'bin');
    const prefix = kind === 'model3d' ? 'model3d' : 'fal';
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    fs.writeFileSync(path.join(config.OUTPUT_DIR, filename), buf);
    return `/files/output/${filename}`;
  } catch (e) {
    console.error('⚠ 转存 FAL 文件失败:', e.message);
    return url;
  }
}

async function extractFalToolboxOutputs(data, outputSchema) {
  const outputs = Array.isArray(outputSchema) ? outputSchema : [];
  const urls = [];
  const imageUrls = [];
  const videoUrls = [];
  const audioUrls = [];
  const modelUrls = [];
  const textOutputs = [];
  const jsonOutputs = [];

  const normalizedOutputs = outputs.length ? outputs : [
    { key: 'images', kind: 'image', pathCandidates: ['images', 'data.images'] },
    { key: 'video', kind: 'video', pathCandidates: ['video', 'data.video', 'video_url', 'url'] },
    { key: 'audio', kind: 'audio', pathCandidates: ['audio', 'data.audio', 'audio_url'] },
    { key: 'model', kind: 'model3d', pathCandidates: ['model', 'mesh', 'file', 'files'] },
  ];

  for (const output of normalizedOutputs) {
    const kind = String(output?.kind || 'json');
    const candidates = Array.isArray(output?.pathCandidates) && output.pathCandidates.length
      ? output.pathCandidates
      : [output?.key].filter(Boolean);
    for (const candidate of candidates) {
      const value = getByPath(data, candidate);
      if (value == null) continue;
      if (kind === 'text') {
        textOutputs.push(...collectFalToolboxText(value));
        continue;
      }
      if (kind === 'json') {
        jsonOutputs.push(value);
        continue;
      }
      const found = collectFalToolboxUrls(value, []);
      for (const remote of found) {
        const local = await saveRemoteFalToolboxFile(remote, kind);
        urls.push(local);
        if (kind === 'image') imageUrls.push(local);
        else if (kind === 'video') videoUrls.push(local);
        else if (kind === 'audio') audioUrls.push(local);
        else if (kind === 'model3d') modelUrls.push(local);
      }
    }
  }

  return {
    urls: Array.from(new Set(urls)),
    imageUrls: Array.from(new Set(imageUrls)),
    videoUrls: Array.from(new Set(videoUrls)),
    audioUrls: Array.from(new Set(audioUrls)),
    modelUrls: Array.from(new Set(modelUrls)),
    textOutputs: Array.from(new Set(textOutputs.filter(Boolean))),
    jsonOutputs,
  };
}

function falToolboxHasOutput(result) {
  return Boolean(result.urls.length || result.textOutputs.length || result.jsonOutputs.length);
}

async function resolveFalToolboxMediaPayload(settings, payload, mediaFields, apiKey) {
  const next = { ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}) };
  const fields = Array.isArray(mediaFields) ? mediaFields : [];
  for (const field of fields) {
    const key = String(field?.key || '').trim();
    if (!key || !(key in next)) continue;
    const rawValues = Array.isArray(next[key]) ? next[key] : [next[key]];
    const resolved = [];
    for (const raw of rawValues) {
      const value = String(raw || '').trim();
      if (!value) continue;
      if (field?.upload === false) {
        resolved.push(value);
      } else if (field?.kind === 'image' && field?.mediaMode === 'base64') {
        const dataUrl = await refToBananaImage(value);
        if (!dataUrl) throw new Error(`FAL 图片读取失败: ${value.slice(0, 80)}`);
        resolved.push(dataUrl);
      } else {
        const url = await uploadRefToZhenzhen(settings, value, apiKey);
        if (!url) throw new Error(`FAL 素材上传失败: ${value.slice(0, 80)}`);
        resolved.push(url);
      }
    }
    if (field?.multiple === false || !Array.isArray(next[key])) next[key] = resolved[0] || '';
    else next[key] = resolved;
  }
  return next;
}

router.post('/fal-toolbox/submit', async (req, res) => {
  const settings = currentSettings();
  if (!ensureDefaultZhenzhenKey(settings, res, 'Fal超市')) return;
  const apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);
  const {
    toolId,
    title,
    endpoint,
    payload,
    mediaFields,
    outputSchema,
    statusPath,
  } = req.body || {};
  if (!isFalToolboxEndpoint(endpoint)) {
    return res.status(400).json({ success: false, error: `非法 FAL endpoint: ${endpoint || ''}` });
  }
  try {
    const finalPayload = await resolveFalToolboxMediaPayload(settings, payload, mediaFields, apiKey);
    const falUrl = `${baseUrl}/fal/${endpoint}`;
    console.log('[fal-toolbox/submit]', toolId || title || endpoint, '→', falUrl, '| payload keys:', Object.keys(finalPayload));
    const upstream = await fetch(falUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload),
    });
    const text = await upstream.text();
    let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        error: falToolboxErrorMessage(data, `FAL HTTP ${upstream.status}: ${text.slice(0, 300)}`),
        raw: data,
      });
    }
    if (Array.isArray(data)) {
      return res.status(400).json({ success: false, error: `FAL 参数校验错误: ${JSON.stringify(data).slice(0, 500)}` });
    }
    const st = falToolboxStatusValue(data);
    if (FAL_TOOLBOX_FAILED.has(st)) {
      return res.json({ success: false, data: { status: 'failed', error: falToolboxErrorMessage(data, `FAL ${st}`), raw: data } });
    }

    const output = await extractFalToolboxOutputs(data, outputSchema);
    if (falToolboxHasOutput(output)) {
      return res.json({ success: true, data: { sync: true, endpoint, ...output, raw: data } });
    }

    const requestId = data?.request_id || data?.requestId;
    if (!requestId) {
      return res.status(500).json({ success: false, error: 'FAL 未返回 request_id: ' + JSON.stringify(data).slice(0, 400), raw: data });
    }
    const responseUrl = fixFalToolboxUrl(data?.response_url || data?.responseUrl, baseUrl, endpoint, requestId);
    const rawStatusUrl = data?.status_url || data?.statusUrl || (statusPath === 'result-only' ? '' : `${responseUrl}/status`);
    const statusUrl = rawStatusUrl ? fixFalToolboxUrl(rawStatusUrl, baseUrl, endpoint, requestId) : '';
    rememberTaskKey(requestId, apiKey, {
      route: 'fal-toolbox',
      toolId,
      title,
      endpoint,
      outputSchema,
      responseUrl,
      statusUrl,
      statusPath,
    });
    return res.json({
      success: true,
      data: { sync: false, requestId, responseUrl, statusUrl, endpoint, raw: data },
    });
  } catch (e) {
    console.error('proxy/fal-toolbox/submit 错误:', e);
    return res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

router.post('/fal-toolbox/query', async (req, res) => {
  const settings = currentSettings();
  const { responseUrl: rawResponseUrl, statusUrl: rawStatusUrl, endpoint: rawEndpoint, requestId, outputSchema: bodyOutputSchema, statusPath: rawStatusPath } = req.body || {};
  const rememberedMeta = recallTaskMeta(requestId);
  if (rememberedMeta?.apiKey) {
    if (settings) settings.zhenzhenApiKey = rememberedMeta.apiKey;
    else return res.status(400).json({ success: false, error: '未找到 settings' });
  } else {
    if (!ensureDefaultZhenzhenKey(settings, res, 'Fal超市')) return;
  }
  const apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);
  const endpoint = rememberedMeta?.endpoint || rawEndpoint;
  const outputSchema = rememberedMeta?.outputSchema || bodyOutputSchema;
  const statusPath = rememberedMeta?.statusPath || rawStatusPath;
  const responseUrl = fixFalToolboxUrl(rawResponseUrl || rememberedMeta?.responseUrl, baseUrl, endpoint, requestId);
  const rawEffectiveStatusUrl = rawStatusUrl || rememberedMeta?.statusUrl || (statusPath === 'result-only' ? '' : (responseUrl ? `${responseUrl}/status` : ''));
  const statusUrl = rawEffectiveStatusUrl ? fixFalToolboxUrl(rawEffectiveStatusUrl, baseUrl, endpoint, requestId) : '';
  if (!responseUrl && !statusUrl) return res.status(400).json({ success: false, error: 'responseUrl/statusUrl 或 requestId 必填' });

  const fetchJson = async (url) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { r, text, data };
  };

  try {
    let statusData = null;
    if (statusUrl) {
      const statusResp = await fetchJson(statusUrl);
      statusData = statusResp.data;
      if (!statusResp.r.ok) {
        const st = falToolboxStatusValue(statusData);
        if (FAL_TOOLBOX_PENDING.has(st)) {
          return res.json({ success: true, data: { status: 'pending', falStatus: st, requestId, responseUrl, statusUrl, raw: statusData } });
        }
        return res.status(statusResp.r.status).json({
          success: false,
          data: { status: 'failed', error: falToolboxErrorMessage(statusData, `FAL Poll HTTP ${statusResp.r.status}: ${statusResp.text.slice(0, 300)}`), raw: statusData },
        });
      }
      const st = falToolboxStatusValue(statusData);
      if (FAL_TOOLBOX_FAILED.has(st)) {
        return res.json({ success: false, data: { status: 'failed', error: falToolboxErrorMessage(statusData, `FAL ${st}`), falStatus: st, requestId, responseUrl, statusUrl, raw: statusData } });
      }
      const statusOutput = await extractFalToolboxOutputs(statusData, outputSchema);
      if (falToolboxHasOutput(statusOutput)) {
        return res.json({ success: true, data: { status: 'completed', requestId, responseUrl, statusUrl, ...statusOutput, raw: statusData } });
      }
      if (st && !FAL_TOOLBOX_COMPLETED.has(st)) {
        return res.json({ success: true, data: { status: 'pending', falStatus: st, requestId, responseUrl, statusUrl, raw: statusData } });
      }
    }

    const resultResp = await fetchJson(responseUrl || statusUrl);
    if (!resultResp.r.ok) {
      const st = falToolboxStatusValue(resultResp.data);
      if (FAL_TOOLBOX_PENDING.has(st)) {
        return res.json({ success: true, data: { status: 'pending', falStatus: st, requestId, responseUrl, statusUrl, raw: resultResp.data } });
      }
      return res.status(resultResp.r.status).json({
        success: false,
        data: { status: 'failed', error: falToolboxErrorMessage(resultResp.data, `FAL Result HTTP ${resultResp.r.status}: ${resultResp.text.slice(0, 300)}`), raw: resultResp.data },
      });
    }
    if (!resultResp.data) {
      return res.status(500).json({ success: false, data: { status: 'failed', error: 'FAL 响应非 JSON: ' + resultResp.text.slice(0, 200) } });
    }
    const resultStatus = falToolboxStatusValue(resultResp.data);
    if (FAL_TOOLBOX_FAILED.has(resultStatus)) {
      return res.json({ success: false, data: { status: 'failed', error: falToolboxErrorMessage(resultResp.data, `FAL ${resultStatus}`), falStatus: resultStatus, requestId, responseUrl, statusUrl, raw: resultResp.data } });
    }
    const output = await extractFalToolboxOutputs(resultResp.data, outputSchema);
    if (falToolboxHasOutput(output)) {
      return res.json({ success: true, data: { status: 'completed', requestId, responseUrl, statusUrl, ...output, raw: resultResp.data } });
    }
    return res.json({ success: true, data: { status: 'pending', falStatus: resultStatus || falToolboxStatusValue(statusData) || 'IN_PROGRESS', requestId, responseUrl, statusUrl, raw: resultResp.data || statusData } });
  } catch (e) {
    console.error('proxy/fal-toolbox/query 错误:', e);
    return res.status(500).json({ success: false, data: { status: 'failed', error: e.message || '查询失败' } });
  }
});

router.post('/video/submit', async (req, res) => {
  const settings = currentSettings();
  const {
    model, prompt,
    // Veo 参数
    aspect_ratio, enhance_prompt, enable_upsample,
    // Grok 参数
    ratio, duration, resolution,
    // 通用
    seed, private: privateVideo, is_private, watermark, images, videos, video_url, video, referenceVideos, videoUrls, providerParams, size, protocolModel: protocolModelInput,
  } = req.body || {};
  // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
  if (!ensureKey(settings, res, protocolModelInput || model || '', '视频')) return;
  if (!model || !prompt) {
    return res.status(400).json({ success: false, error: 'model 和 prompt 必填' });
  }
  const requestedModel = String(model || '').trim();
  const effectiveModel = resolveVideoModelOverride(settings, requestedModel);
  const protocolModel = requestedModel || effectiveModel;
  const routeModel = String(protocolModelInput || protocolModel).trim() || protocolModel;
  const submitProtocol = resolveVideoSubmitProtocol(settings, requestedModel, effectiveModel, routeModel);
  const lowerModel = String(routeModel).toLowerCase();
  const effectiveLowerModel = String(effectiveModel).toLowerCase();
  const isApishuVeoOmni = isApishuVeoOmniModel(lowerModel) || isApishuVeoOmniModel(effectiveLowerModel);
  const isVeoOmni = isVeoOmniModel(lowerModel) || isVeoOmniModel(effectiveLowerModel);
  const isGrokVideo15New = isGrokVideo15NewModel(lowerModel) || isGrokVideo15NewModel(effectiveLowerModel);
  const isGrok = lowerModel.includes('grok');
  const isSoraZhenzhen = lowerModel === 'sora-2-zhenzhen';
  const isVeo = lowerModel.includes('veo');
  let body;

  try {
    const apiKey = settings.zhenzhenApiKey;
    if (submitProtocol === 'videos' && !isApishuVeoOmni) {
      const mediaVideos = Array.isArray(videos)
        ? videos
        : (Array.isArray(referenceVideos) ? referenceVideos : (Array.isArray(videoUrls) ? videoUrls : []));
      const payload = await buildVideosApiPayload({
        settings,
        apiKey,
        model: requestedModel || effectiveModel,
        prompt,
        duration,
        ratio: ratio || aspect_ratio,
        resolution,
        firstFrame: Array.isArray(images) ? images[0] : undefined,
        refImages: Array.isArray(images) ? images.slice(1) : [],
        videos: mediaVideos,
        providerParams,
        seed,
      });
      console.log('[upstream] Videos API → /v1/videos model:', payload.model,
        'duration:', payload.duration,
        'ratio:', payload.ratio || payload.video_config?.aspect_ratio,
        'resolution:', payload.resolution || payload.video_config?.resolution_name,
        'mode:', payload.mode || payload.video_config?.reference_mode || 'video_config');
      const r = await fetch(apishuVideosEndpoint(settings), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch {
        return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
      }
      if (!r.ok) {
        const errorText = getUpstreamErrorMessage(data, text, r.status);
        return res.status(r.status).json({ success: false, error: errorText, raw: data });
      }
      const taskId = data?.task_id || data?.id;
      if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
      rememberTaskKey(taskId, apiKey, {
        model: payload.model,
        effectiveModel,
        requestedModel,
        routeModel,
        protocol: 'videos-api',
      });
      return res.json({ success: true, data: { taskId, protocol: 'videos-api', effectiveModel: payload.model, requestedModel, raw: data } });
    } else if (isApishuVeoOmni) {
      const payload = await buildApishuVeoOmniPayload({
        settings,
        apiKey,
        model: effectiveModel,
        prompt,
        duration,
        resolution,
        aspect_ratio,
        ratio,
        images,
        videos: Array.isArray(videos) ? videos : (Array.isArray(referenceVideos) ? referenceVideos : (Array.isArray(videoUrls) ? videoUrls : [])),
        video_url,
        video,
        external_request_id: req.body?.external_request_id,
        providerParams,
      });
      console.log('[upstream] Apishu Veo Omni → /v1/videos model:', payload.model,
        'duration:', payload.duration, 'aspect_ratio:', payload.aspect_ratio,
        'mode:', payload.mode || (payload.video_url ? 'edit' : 'reference'),
        'refs:', payload.Ingredients_images?.length || payload.images?.length || 0);
      const r = await fetch(apishuVideosEndpoint(settings), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch {
        return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
      }
      if (!r.ok) {
        const errorText = getUpstreamErrorMessage(data, text, r.status);
        return res.status(r.status).json({ success: false, error: errorText, raw: data });
      }
      const taskId = data?.task_id || data?.id;
      if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
      rememberTaskKey(taskId, apiKey, {
        model: effectiveModel,
        requestedModel,
        routeModel,
        protocol: 'apishu-veo-omni',
      });
      return res.json({ success: true, data: { taskId, protocol: 'apishu-veo-omni', effectiveModel, requestedModel, raw: data } });
    } else if (isVeoOmni) {
      // ===== Veo Omni 协议(参考 Comfly_veo_omini): POST /v1/videos multipart =====
      const veoOmniSubmitModel = effectiveModel === requestedModel ? VEO_OMNI_UPSTREAM_MODEL : effectiveModel;
      const refs = Array.isArray(images) ? images.slice(0, 1) : [];
      if (!refs.length) {
        return res.status(400).json({ success: false, error: 'veo-omni-10s 需要 1 张参考图' });
      }
      const conv = await refToBuffer(refs[0]);
      if (!conv) {
        return res.status(400).json({ success: false, error: 'veo-omni-10s 参考图读取失败' });
      }
      const form = new FormData();
      const seconds = ['4', '5', '6', '8', '10'].includes(String(duration)) ? String(duration) : '10';
      const size = veoOmniSizeFromAspect(aspect_ratio || ratio || '16:9');
      form.append('model', veoOmniSubmitModel);
      form.append('prompt', prompt);
      form.append('size', size);
      form.append('seconds', seconds);
      form.append('watermark', String(Boolean(watermark)).toLowerCase());
      form.append('input_reference', new Blob([conv.buf], { type: conv.mime }), `input_reference.${conv.ext || 'png'}`);

      const upstream = `${zhenzhenBaseUrl(settings)}/v1/videos`;
      console.log('[upstream] Veo Omni → /v1/videos model:', veoOmniSubmitModel, 'size:', size, 'seconds:', seconds, 'refs:', refs.length);
      const r = await fetch(upstream, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch {
        return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
      }
      if (!r.ok) {
        const errorText = getUpstreamErrorMessage(data, text, r.status);
        return res.status(r.status).json({ success: false, error: errorText, raw: data });
      }
      const taskId = data?.task_id || data?.id;
      if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
      rememberTaskKey(taskId, apiKey, { model: VEO_OMNI_PUBLIC_MODEL, effectiveModel, routeModel });
      return res.json({ success: true, data: { taskId, raw: data } });
    } else if (isGrokVideo15New) {
      // ===== Grok Video 1.5 New 协议(参考 Comfly_grok_video_1_5): POST /v1/videos multipart =====
      const refs = Array.isArray(images) ? images.slice(0, 1) : [];
      if (!refs.length) {
        return res.status(400).json({ success: false, error: 'Grok 1.5 New 需要 1 张参考图' });
      }
      const form = new FormData();
      {
        const model = effectiveModel;
        form.append('model', model);
      }
      form.append('prompt', prompt);
      form.append('size', grokVideo15NewSizeFromRatio(size || aspect_ratio || ratio || '16:9'));
      const hasReference = await appendGrokVideo15InputReference(form, refs[0]);
      if (!hasReference) {
        return res.status(400).json({ success: false, error: 'Grok 1.5 New 参考图读取失败' });
      }

      const upstream = `${zhenzhenBaseUrl(settings)}/v1/videos`;
      console.log('[upstream] Grok Video 1.5 New → /v1/videos model:', effectiveModel, 'size:', grokVideo15NewSizeFromRatio(size || aspect_ratio || ratio || '16:9'), 'refs:', refs.length);
      const r = await fetch(upstream, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch {
        return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
      }
      if (!r.ok) {
        const errorText = getUpstreamErrorMessage(data, text, r.status);
        return res.status(r.status).json({ success: false, error: errorText, raw: data });
      }
      const taskId = data?.task_id || data?.id;
      if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
      {
        const model = routeModel;
        rememberTaskKey(taskId, apiKey, { model, effectiveModel });
      }
      return res.json({ success: true, data: { taskId, raw: data } });
      } else if (isSoraZhenzhen) {
      // ===== Sora2 Zhenzhen API 协议(参考 gpt-image-2-web runSora2) =====
      body = {
        prompt,
          model: 'sora-2',
        aspect_ratio: aspect_ratio || ratio || '16:9',
        duration: String(duration ?? 15),
        private: privateVideo !== false && is_private !== false,
      };
      if (seed && seed > 0) body.seed = seed;
      if (Array.isArray(images) && images.length) {
        const refs = images.slice(0, 1).map(stripDataUrlPrefix).filter(Boolean);
        if (refs.length) body.images = refs;
      }
      console.log('[upstream] Sora2 Zhenzhen → /v2/videos/generations model:', body.model, 'aspect_ratio:', body.aspect_ratio, 'duration:', body.duration, 'private:', body.private, 'refs:', body.images?.length || 0);
    } else if (isGrok) {
      // ===== Grok Video 协议(主项目 runGrok3 line 3863) =====
      body = {
        prompt,
        model: effectiveModel,
        ratio: ratio || '16:9',
        duration: parseInt(duration ?? 15, 10),
        resolution: resolution || '720P',
      };
      if (seed && seed > 0) body.seed = seed;
      if (Array.isArray(images) && images.length) {
        const refs = images.slice(0, 7); // Grok 最多 7 张
        const urls = [];
        for (let i = 0; i < refs.length; i++) {
          const u = await uploadRefToZhenzhen(settings, refs[i], apiKey, `参考图 #${i + 1}`, { modelName: effectiveModel });
          if (u) urls.push(u);
          else throw new Error(`参考图 #${i + 1} 上传失败`);
        }
        if (urls.length) body.images = urls;
      }
      console.log('[upstream] Grok Video → /v2/videos/generations model:', effectiveModel, 'ratio:', body.ratio, 'duration:', body.duration, 'resolution:', body.resolution, 'refs:', body.images?.length || 0);
    } else {
      // ===== Veo3.1 协议(主项目 runVeo3 line 3372)=====
      // 旧 seedance / 默认行为也走这里(零破坏)
      body = { prompt, model: effectiveModel, enhance_prompt: enhance_prompt !== false };
      if (aspect_ratio) body.aspect_ratio = aspect_ratio;
      if (seed && seed > 0) body.seed = seed;
      if (enable_upsample) body.enable_upsample = true;
      if (Array.isArray(images) && images.length) body.images = images.slice(0, 3); // base64 dataURL
      console.log('[upstream] Veo/Default → /v2/videos/generations model:', effectiveModel, 'aspect_ratio:', body.aspect_ratio, 'refs:', body.images?.length || 0, isVeo ? '(veo)' : '(legacy)');
    }

    const upstream = `${zhenzhenBaseUrl(settings)}/v2/videos/generations`;
    const r = await fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
    }
    if (!r.ok) {
      const errorText = getUpstreamErrorMessage(data, text, r.status);
      return res.status(r.status).json({ success: false, error: errorText, raw: data });
    }
    const taskId = data?.task_id || data?.id;
    if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
    rememberTaskKey(taskId, apiKey, { model: routeModel, effectiveModel });
    res.json({ success: true, data: { taskId, raw: data } });
  } catch (e) {
    console.error('proxy/video/submit 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

router.get('/video/query', async (req, res) => {
  const settings = currentSettings();
  const taskId = String(req.query.taskId || '').trim();
  const rememberedMeta = recallTaskMeta(taskId);
  const queryModel = String(req.query.model || rememberedMeta?.model || '').trim();
  const protocolQueryModel = String(rememberedMeta?.model || queryModel || '').trim();
  // 优先从 submit 阶段记录的 (taskId → key) 映射恢复，防止前端未传 model 导致 fallback 错 key。
  if (rememberedMeta?.apiKey) {
    if (settings) settings.zhenzhenApiKey = rememberedMeta.apiKey;
    else return res.status(400).json({ success: false, error: '未找到 settings' });
  } else {
    // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
    if (!ensureKey(settings, res, queryModel, '视频')) return;
  }
  if (!taskId) return res.status(400).json({ success: false, error: 'taskId 必填' });
  const usesApishuVeoOmniQuery = rememberedMeta?.protocol === 'apishu-veo-omni'
    || isApishuVeoOmniModel(queryModel)
    || isApishuVeoOmniModel(protocolQueryModel)
    || isApishuVeoOmniModel(rememberedMeta?.effectiveModel);
  const usesLegacyV1VideoQuery = isVeoOmniModel(queryModel) || isGrokVideo15NewModel(queryModel)
    || isVeoOmniModel(protocolQueryModel)
    || isGrokVideo15NewModel(protocolQueryModel);
  const configuredQueryProtocol = resolveVideoSubmitProtocol(settings, queryModel, queryModel, protocolQueryModel);
  const usesVideosApiQuery = rememberedMeta?.protocol === 'videos-api' || configuredQueryProtocol === 'videos';
  const usesV1VideoQuery = usesApishuVeoOmniQuery || usesLegacyV1VideoQuery || usesVideosApiQuery;
  const upstream = usesApishuVeoOmniQuery
    ? apishuVideosEndpoint(settings, taskId)
    : usesV1VideoQuery
      ? apishuVideosEndpoint(settings, taskId)
    : `${zhenzhenBaseUrl(settings)}/v2/videos/generations/${encodeURIComponent(taskId)}`;
  try {
    const r = await fetch(upstream, {
      headers: { Authorization: `Bearer ${settings.zhenzhenApiKey}` },
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
    }
    if (!r.ok) {
      const errorText = getUpstreamErrorMessage(data, text, r.status);
      return res.status(r.status).json({ success: false, error: errorText, raw: data });
    }
    const st = normalizeVideoTaskStatus(data);
    let videoUrl = null;
    let videoUrls = [];
    if (st === 'SUCCESS') {
      const remotes = (usesApishuVeoOmniQuery || usesVideosApiQuery) ? extractApishuVideoUrls(data) : [getFalVideoUrl(data)].filter(Boolean);
      if (remotes.length) {
        videoUrls = await saveRemoteVideos(remotes);
        videoUrl = videoUrls[0] || null;
      } else if (usesV1VideoQuery) {
        try {
          videoUrl = await saveAuthenticatedVideoContent(settings, settings.zhenzhenApiKey, taskId);
          videoUrls = videoUrl ? [videoUrl] : [];
        } catch (contentError) {
          console.warn('[video/query] completed task content download failed:', contentError?.message || contentError);
        }
      }
    }
    res.json({
      success: true,
      data: {
        status: st || 'PENDING',
        progress: data?.progress == null ? '' : String(data.progress),
        videoUrl,
        videoUrls,
        failReason: data?.fail_reason || data?.failure_details || data?.error || data?.message || null,
        raw: data,
      },
    });
  } catch (e) {
    console.error('proxy/video/query 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

// ========================================================================
// Seedance 2.0(异步)— 完全对齐 gpt-image-2-web runSeedance / pollSeedance
//   submit: POST ${ZHENZHEN_BASE_URL}/seedance/v3/contents/generations/tasks
//   query : GET  ${ZHENZHEN_BASE_URL}/seedance/v3/contents/generations/tasks/{tid}
// model includes: doubao-seedance-2-0-260128 / doubao-seedance-2-0-fast-260128 / doubao-seedance-2.0-mini
// resolution includes: 480p / 720p / native1080p / native4K / 1080p / 2k / 4k
// payload: { model, content[], duration, ratio, resolution, generate_audio,
//            return_last_frame, watermark, tools?[web_search], seed? }
// content 数组成员:
//   { type:'text', text }
//   { type:'image_url', image_url:{url}, role:'first_frame'|'last_frame'|'reference_image' }
//   { type:'video_url', video_url:{url}, role:'reference_video' }   // 需先 /v1/files 上传换 URL
//   { type:'audio_url', audio_url:{url}, role:'reference_audio' }   // 需先 /v1/files 上传换 URL
// ========================================================================
router.post('/seedance/submit', async (req, res) => {
  const settings = currentSettings();
  // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
  let apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);
  const {
    model, prompt,
    duration, ratio, resolution,
    generate_audio, return_last_frame, watermark, web_search,
    seed,
    firstFrame, lastFrame,
    refImages,
    videos, audios,
    providerParams,
  } = req.body || {};
  if (!ensureKey(settings, res, 'seedance', 'Seedance')) return;
  apiKey = settings.zhenzhenApiKey;

  if (!model) return res.status(400).json({ success: false, error: 'model 必填' });
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt 不得为空' });
  const requestedModel = String(model || '').trim();
  const effectiveModel = resolveSeedanceVideoModelOverride(settings, requestedModel);
  const submitProtocol = resolveSeedanceSubmitProtocol(settings, requestedModel, effectiveModel);

  try {
    if (submitProtocol === 'videos') {
      const videosApiModel = resolveVideosApiSeedanceModel(settings, requestedModel, effectiveModel);
      const payload = await buildVideosApiPayload({
        settings,
        apiKey,
        model: videosApiModel,
        prompt,
        duration,
        ratio,
        resolution,
        generate_audio,
        seed,
        firstFrame,
        lastFrame,
        refImages,
        videos,
        audios,
        providerParams,
      });
      console.log('[upstream] Videos API → /v1/videos model:', payload.model,
        'duration:', payload.duration,
        'ratio:', payload.ratio || payload.video_config?.aspect_ratio,
        'resolution:', payload.resolution || payload.video_config?.resolution_name,
        'mode:', payload.mode || payload.video_config?.reference_mode || 'video_config');
      const r = await fetch(apishuVideosEndpoint(settings), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch {
        return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
      }
      if (!r.ok) {
        const errorText = getUpstreamErrorMessage(data, text, r.status);
        return res.status(r.status).json({ success: false, error: errorText, raw: data });
      }
      const taskId = data?.task_id || data?.id;
      if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
      rememberTaskKey(taskId, apiKey, { model: payload.model, requestedModel, protocol: 'videos-api' });
      return res.json({ success: true, data: { taskId, protocol: 'videos-api', effectiveModel: payload.model, requestedModel, raw: data } });
    }

    if (isApishuSeedanceVideoModel(effectiveModel) || isApishuSeedanceVideoModel(requestedModel)) {
      const payload = await buildApishuSeedancePayload({
        model: effectiveModel,
        prompt,
        duration,
        ratio,
        firstFrame,
        lastFrame,
        refImages,
        audios,
        providerParams,
      });
      console.log('[upstream] Apishu Seedance → /v1/videos model:', payload.model,
        'duration:', payload.duration, 'aspect_ratio:', payload.aspect_ratio,
        'references:', Array.isArray(payload.references) ? payload.references.length : 0);
      const r = await fetch(apishuVideosEndpoint(settings), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch {
        return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
      }
      if (!r.ok) {
        const errorText = getUpstreamErrorMessage(data, text, r.status);
        return res.status(r.status).json({ success: false, error: errorText, raw: data });
      }
      const taskId = data?.task_id || data?.id;
      if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
      rememberTaskKey(taskId, apiKey, { model: effectiveModel, requestedModel, protocol: 'apishu-v1-videos' });
      return res.json({ success: true, data: { taskId, protocol: 'apishu-v1-videos', effectiveModel, requestedModel, raw: data } });
    }

    const content = [{ type: 'text', text: String(prompt) }];

    const hasF = !!firstFrame;
    const hasL = !!lastFrame;

    // first_frame:
    //   - 单独 first_frame(无 last_frame): 不带 role
    //   - 与 last_frame 同时存在: role='first_frame'
    if (hasF) {
      const u = await uploadRefToZhenzhen(settings, firstFrame, apiKey, 'first_frame');
      if (!u) throw new Error('first_frame 上传失败');
      const e = { type: 'image_url', image_url: { url: u } };
      if (hasL) e.role = 'first_frame';
      content.push(e);
    }

    // last_frame: 必须与 first_frame 同时
    if (hasL && hasF) {
      const u = await uploadRefToZhenzhen(settings, lastFrame, apiKey, 'last_frame');
      if (!u) throw new Error('last_frame 上传失败');
      content.push({ type: 'image_url', image_url: { url: u }, role: 'last_frame' });
    }

    // reference_image
    if (Array.isArray(refImages)) {
      for (let i = 0; i < refImages.length; i++) {
        const u = await uploadRefToZhenzhen(settings, refImages[i], apiKey, `reference_image ${i + 1}`);
        if (u) content.push({ type: 'image_url', image_url: { url: u }, role: 'reference_image' });
      }
    }

    // reference_video / reference_audio:
    // gpt-image-2-web 的 runSeedance 会把本地视频/音频先上传到 /v1/files，再把返回 URL 放入 content。
    // 画布上游素材通常是 /files/input 或 /files/output，本地地址不能直接提交给 Seedance。
    if (Array.isArray(videos)) {
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        if (typeof v === 'string' && v) {
          const u = await uploadRefToZhenzhen(settings, v, apiKey, `reference_video ${i + 1}`);
          if (!u) throw new Error(`reference_video ${i + 1} 上传失败`);
          content.push({ type: 'video_url', video_url: { url: u }, role: 'reference_video' });
        }
      }
    }
    if (Array.isArray(audios)) {
      for (let i = 0; i < audios.length; i++) {
        const a = audios[i];
        if (typeof a === 'string' && a) {
          const u = await uploadRefToZhenzhen(settings, a, apiKey, `reference_audio ${i + 1}`);
          if (!u) throw new Error(`reference_audio ${i + 1} 上传失败`);
          content.push({ type: 'audio_url', audio_url: { url: u }, role: 'reference_audio' });
        }
      }
    }

    const payload = {
      model: effectiveModel,
      content,
      duration: parseInt(duration ?? 5, 10),
      ratio: ratio || '16:9',
      resolution: resolution || '720p',
      generate_audio: generate_audio !== false,
      return_last_frame: return_last_frame === true,
      watermark: watermark === true,
    };
    if (web_search === true) payload.tools = [{ type: 'web_search' }];
    if (typeof seed === 'number' && seed !== -1) payload.seed = seed;

    console.log('[upstream] Seedance2.0 → /seedance/v3/contents/generations/tasks model:', effectiveModel,
      'duration:', payload.duration, 'ratio:', payload.ratio, 'resolution:', payload.resolution,
      'content_items:', content.length);

    const r = await fetch(`${baseUrl}/seedance/v3/contents/generations/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
    }
    if (!r.ok) {
      const errorText = data?.error?.message || data?.message || `上游 HTTP ${r.status}`;
      return res.status(r.status).json({ success: false, error: errorText });
    }
    const taskId = data?.id || data?.task_id;
    if (!taskId) return res.status(500).json({ success: false, error: '未获取到 task_id: ' + text.slice(0, 200) });
    rememberTaskKey(taskId, apiKey, { model: effectiveModel, requestedModel });
    res.json({ success: true, data: { taskId, raw: data } });
  } catch (e) {
    console.error('proxy/seedance/submit 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

router.get('/seedance/query', async (req, res) => {
  const settings = currentSettings();
  const taskId = String(req.query.taskId || '').trim();
  if (!taskId) return res.status(400).json({ success: false, error: 'taskId 必填' });
  const rememberedMeta = recallTaskMeta(taskId);
  const queryModel = String(req.query.model || rememberedMeta?.model || '').trim();
  if (rememberedMeta?.apiKey) {
    if (settings) settings.zhenzhenApiKey = rememberedMeta.apiKey;
    else return res.status(400).json({ success: false, error: '未找到 settings' });
  } else {
    // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
    if (!ensureKey(settings, res, 'seedance', 'Seedance')) return;
  }

  const apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);
  const looksApishuV1Task = /^task_[A-Za-z0-9]/.test(taskId);
  const isApishuQuery = isApishuSeedanceVideoModel(queryModel)
    || isApishuSeedanceVideoModel(rememberedMeta?.model)
    || rememberedMeta?.protocol === 'apishu-v1-videos'
    || rememberedMeta?.protocol === 'videos-api'
    || looksApishuV1Task;
  const upstream = `${baseUrl}/seedance/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`;

  try {
    const r = await fetch(isApishuQuery ? apishuVideosEndpoint(settings, taskId) : upstream, { headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) });
    }
    if (!r.ok) {
      const errorText = data?.error?.message || data?.message || `上游 HTTP ${r.status}`;
      return res.status(r.status).json({ success: false, error: errorText });
    }
    if (isApishuQuery) {
      const st = normalizeVideoTaskStatus(data).toLowerCase();
      let videoUrl = null;
      let videoUrls = [];
      if (st === 'success') {
        const remotes = extractApishuVideoUrls(data);
        if (remotes.length) {
          videoUrls = await saveRemoteVideos(remotes);
          videoUrl = videoUrls[0] || null;
        }
      }
      return res.json({
        success: true,
        data: {
          status: st === 'success' ? 'succeeded' : (st === 'failure' ? 'failed' : (st || 'pending')),
          progress: data?.progress == null ? '' : String(data.progress),
          videoUrl,
          videoUrls,
          failReason: data?.error?.message || data?.message || data?.fail_reason || data?.failReason || null,
          raw: data,
        },
      });
    }
    // 状态归一(对齐主项目)
    let st = String(data?.status || '').toLowerCase();
    if (st === 'success') st = 'succeeded';
    if (st === 'fail' || st === 'failure') st = 'failed';

    let videoUrl = null;
    let videoUrls = [];
    if (st === 'succeeded') {
      // 多重路径解析 video_url(对齐 pollSeedance line 3287-3296)
      let vUrl = null;
      const rc = data?.content;
      if (rc && typeof rc === 'object' && !Array.isArray(rc)) {
        vUrl = rc.video_url || rc.videoUrl;
      }
      if (!vUrl && data?.data && typeof data.data === 'object') {
        const dc = data.data.content;
        if (dc && typeof dc === 'object') vUrl = dc.video_url || dc.videoUrl;
        if (!vUrl) vUrl = data.data.video_url || data.data.videoUrl;
      }
      if (!vUrl && Array.isArray(data?.results)) {
        for (const it of data.results) {
          if (it && (it.outputType === 'mp4' || it.outputType === 'video' || (it.url && /\.mp4(\?|$)/i.test(it.url)))) {
            vUrl = it.url; break;
          }
          if (it && it.url && !vUrl) vUrl = it.url;
        }
      }
      if (!vUrl && Array.isArray(data?.content)) {
        for (const it of data.content) {
          if (it?.type === 'video_url') {
            const vu = it.video_url;
            vUrl = typeof vu === 'string' ? vu : (vu && vu.url);
            if (vUrl) break;
          }
        }
      }
      if (!vUrl) vUrl = data?.video_url || data?.videoUrl;

      if (vUrl) {
        // 转存到本地
        videoUrl = await saveRemoteVideo(vUrl);
        videoUrls = [videoUrl].filter(Boolean);
      }
    }

    return res.json({
      success: true,
      data: {
        status: st || 'pending',
        progress: data?.progress || '',
        videoUrl,
        videoUrls,
        failReason: data?.fail_reason || data?.failReason || null,
        raw: data,
      },
    });
  } catch (e) {
    console.error('proxy/seedance/query 错误:', e);
    res.status(500).json({ success: false, error: e.message || '查询失败' });
  }
});

// ========================================================================
// 音频生成(Suno - 异步)
// 协议: POST /suno/generate + GET /suno/feed/:clipIds + POST /suno/submit/music
// 模式:generate / cover / extend
// 模型由渠道 /models 动态提供，mv 原样透传。
// ========================================================================
router.post('/audio/submit', async (req, res) => {
  const settings = currentSettings();
  // v1.2.9.15: 一体化「专属优先 fallback 通用」校验 —— 先 applyClassifiedKey('suno') 再校验 effective key
  const { mode, prompt, title, tags, model, version, seed, continue_clip_id, continue_at, cover_clip_id } = req.body || {};
  if (!ensureKey(settings, res, 'suno', 'Suno')) return;
  const m = mode || 'generate';
  if (!prompt && m !== 'extend') {
    return res.status(400).json({ success: false, error: 'prompt 必填' });
  }
  const mv = String(model || version || '').trim();
  if (!mv) return res.status(400).json({ success: false, error: '请先从渠道模型列表选择音频模型' });
  try {
    const apiKey = settings.zhenzhenApiKey;
    const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    if (m === 'generate') {
      const body = { prompt: prompt || '', tags: tags || '', mv, title: title || '' };
      if (seed && seed > 0) body.seed = seed;
      const r = await fetch(`${zhenzhenBaseUrl(settings)}/suno/generate`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) }); }
      if (!r.ok) {
        const errorText = data?.error?.message || data?.message || `上游 HTTP ${r.status}`;
        return res.status(r.status).json({ success: false, error: errorText });
      }
      const taskId = data?.id;
      const clipIds = (data?.clips || []).map((c) => c.id).filter(Boolean);
      if (!taskId || clipIds.length < 1) return res.status(500).json({ success: false, error: '未获取到 task/clip: ' + text.slice(0, 200) });
      rememberTaskKey(taskId, apiKey, { model: mv });
      for (const clipId of clipIds) rememberTaskKey(clipId, apiKey, { model: mv, taskId });
      return res.json({ success: true, data: { taskId, clipIds, raw: data } });
    }
    if (m === 'extend') {
      if (!continue_clip_id) return res.status(400).json({ success: false, error: 'extend 模式需 continue_clip_id' });
      const body = { prompt: prompt || '', tags: tags || '', mv, title: title || '', task: 'upload_extend', continue_clip_id, continue_at: continue_at ?? 28 };
      if (seed && seed > 0) body.seed = seed;
      const r = await fetch(`${zhenzhenBaseUrl(settings)}/suno/generate`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) }); }
      if (!r.ok) {
        const errorText = data?.error?.message || data?.message || `上游 HTTP ${r.status}`;
        return res.status(r.status).json({ success: false, error: errorText });
      }
      const taskId = data?.id;
      const clipIds = (data?.clips || []).map((c) => c.id).filter(Boolean);
      if (!taskId) return res.status(500).json({ success: false, error: '未获取 task' });
      rememberTaskKey(taskId, apiKey, { model: mv });
      for (const clipId of clipIds) rememberTaskKey(clipId, apiKey, { model: mv, taskId });
      return res.json({ success: true, data: { taskId, clipIds, raw: data } });
    }
    if (m === 'cover') {
      if (!cover_clip_id) return res.status(400).json({ success: false, error: 'cover 模式需 cover_clip_id' });
      const body = {
        prompt: prompt || '', tags: tags || '', mv, title: title || '', task: 'cover',
        cover_clip_id, generation_type: 'TEXT', make_instrumental: false, negative_tags: '',
        continue_clip_id: null, continue_at: null, continued_aligned_prompt: null,
        infill_start_s: null, infill_end_s: null,
      };
      if (seed && seed > 0) body.seed = seed;
      const r = await fetch(`${zhenzhenBaseUrl(settings)}/suno/submit/music`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) }); }
      if (!r.ok) {
        const errorText = data?.error?.message || data?.message || `上游 HTTP ${r.status}`;
        return res.status(r.status).json({ success: false, error: errorText });
      }
      const taskId = (typeof data?.data === 'string' ? data.data : data?.id) || '';
      const clipIds = Array.isArray(data?.data) ? data.data.map((c) => c.id || c.clip_id).filter(Boolean) : (data?.clips || []).map((c) => c.id);
      if (!taskId) return res.status(500).json({ success: false, error: '未获取 task: ' + text.slice(0, 200) });
      rememberTaskKey(taskId, apiKey, { model: mv });
      for (const clipId of clipIds) rememberTaskKey(clipId, apiKey, { model: mv, taskId });
      return res.json({ success: true, data: { taskId, clipIds, raw: data } });
    }
    return res.status(400).json({ success: false, error: `未知模式: ${m}` });
  } catch (e) {
    console.error('proxy/audio/submit 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

router.get('/audio/query', async (req, res) => {
  const settings = currentSettings();
  const ids = String(req.query.clipIds || req.query.taskId || '').trim();
  if (!ids) return res.status(400).json({ success: false, error: 'clipIds 或 taskId 必填' });
  const rememberedMeta = recallTaskMeta(ids.split(',')[0]?.trim() || ids);
  if (rememberedMeta?.apiKey) {
    if (settings) settings.zhenzhenApiKey = rememberedMeta.apiKey;
    else return res.status(400).json({ success: false, error: '未找到 settings' });
  } else {
    // v1.2.9.15: 一体化「专属优先 fallback 通用」校验
    if (!ensureKey(settings, res, 'suno', 'Suno')) return;
  }
  // 是否将完成的音频转存到本地 output 目录(默认 true)
  const saveLocal = String(req.query.saveLocal ?? 'true').toLowerCase() !== 'false';
  try {
    const r = await fetch(`${zhenzhenBaseUrl(settings)}/suno/feed/${encodeURIComponent(ids)}`, {
      headers: { Authorization: `Bearer ${settings.zhenzhenApiKey}` },
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ success: false, error: '上游响应非 JSON: ' + text.slice(0, 200) }); }
    if (!r.ok) {
      const errorText = data?.error?.message || data?.message || `上游 HTTP ${r.status}`;
      return res.status(r.status).json({ success: false, error: errorText });
    }
    const clips = Array.isArray(data) ? data : (data?.clips || []);
    const tracks = [];
    for (const c of clips) {
      if (c?.status === 'complete' && c?.audio_url) {
        const remoteUrl = c.audio_url;
        const localUrl = saveLocal ? await saveRemoteAudio(remoteUrl) : remoteUrl;
        tracks.push({
          id: c.id || c.clip_id,
          clipId: c.clip_id || c.id,
          audioUrl: localUrl,
          remoteUrl,
          imageUrl: c.image_large_url || c.image_url || '',
          title: c.title || '',
          tags: c.tags || '',
          duration: c.metadata?.duration || 0,
        });
      }
    }
    const allDone = clips.length > 0 && tracks.length === clips.length;
    res.json({
      success: true,
      data: {
        status: allDone ? 'SUCCESS' : 'PENDING',
        tracks,
        total: clips.length,
        completed: tracks.length,
        raw: data,
      },
    });
  } catch (e) {
    console.error('proxy/audio/query 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

// ========================================================================
// 音频上传 (Suno cover/extend 使用)
// 完全对齐主项目 gpt-image-2-web 的 _sunoUploadAudio 5 步流程:
// 1) POST /suno/uploads/audio { extension }  -> { id, url, fields? }
// 2) S3 上传: 有 fields 走 POST FormData / 无 fields 走 PUT 预签 URL
// 3) POST /suno/uploads/audio/{id}/upload-finish { upload_type, upload_filename }
// 4) GET /suno/uploads/audio/{id} 轮询 30 × 2s 直到 status='complete'
// 5) POST /suno/uploads/audio/{id}/initialize-clip {} -> { clip_id }
// ========================================================================
router.post('/audio/upload', audioUpload.single('file'), async (req, res) => {
  const settings = currentSettings();
  // v1.2.9.15: 修复 BUG —— 之前完全缺失 applyClassifiedKey('suno')，
  // 导致 Suno cover/extend 上传步骤即使配置了 sunoApiKey 也始终用通用 zhenzhenApiKey，
  // 与 audio/submit · audio/query 的 key 不一致。改用 ensureKey 统一「专属优先 fallback 通用」。
  if (!req.file) return res.status(400).json({ success: false, error: '未接收到音频文件 (field=file)' });
  if (!ensureKey(settings, res, 'suno', 'Suno')) return;
  let apiKey = settings.zhenzhenApiKey;
  const baseUrl = zhenzhenBaseUrl(settings);
  const audioBuf = req.file.buffer;
  const filename = req.file.originalname || 'audio.mp3';
  const ext = (filename.split('.').pop() || 'mp3').toLowerCase();
  const mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', wma: 'audio/x-ms-wma' };
  const ct = mimeMap[ext] || req.file.mimetype || 'audio/mpeg';
  try {
    // 1) init
    const r1 = await fetch(`${baseUrl}/suno/uploads/audio`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ extension: ext }),
    });
    if (!r1.ok) {
      const errorText = `Upload init failed: ${r1.status} ${await r1.text()}`;
      return res.status(r1.status).json({ success: false, error: errorText });
    }
    const r1Json = await r1.json();
    const upData = (r1Json.code && r1Json.data) ? r1Json.data : r1Json;
    const uploadId = upData.id;
    const uploadUrl = upData.url;
    const fields = upData.fields;
    if (!uploadId || !uploadUrl) return res.status(500).json({ success: false, error: 'Upload init 返回无效: missing id/url' });
    // 2) S3 upload
    let r2;
    if (fields && Object.keys(fields).length > 0) {
      const fd = new FormData();
      Object.keys(fields).forEach((k) => fd.append(k, fields[k]));
      fd.append('file', new Blob([audioBuf], { type: ct }), filename);
      r2 = await fetch(uploadUrl, { method: 'POST', body: fd });
    } else {
      r2 = await fetch(uploadUrl, { method: 'PUT', body: audioBuf, headers: { 'Content-Type': ct } });
    }
    if (r2.status !== 204 && r2.status !== 200 && !r2.ok) {
      return res.status(500).json({ success: false, error: `S3 upload failed: ${r2.status}` });
    }
    // 3) finish
    const r3 = await fetch(`${baseUrl}/suno/uploads/audio/${uploadId}/upload-finish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_type: 'file_upload', upload_filename: filename }),
    });
    if (!r3.ok) {
      const errorText = `Upload finish failed: ${r3.status} ${await r3.text()}`;
      return res.status(500).json({ success: false, error: errorText });
    }
    // 4) poll status
    let clipId = '';
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const sr = await fetch(`${baseUrl}/suno/uploads/audio/${uploadId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!sr.ok) continue;
      const srJson = await sr.json();
      const sd = (srJson.code && srJson.data) ? srJson.data : srJson;
      const st = sd.status || sd.state || '';
      if (st === 'complete') {
        // 5) initialize-clip
        const r4 = await fetch(`${baseUrl}/suno/uploads/audio/${uploadId}/initialize-clip`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!r4.ok) {
          const errorText = `Initialize clip failed: ${r4.status} ${await r4.text()}`;
          return res.status(500).json({ success: false, error: errorText });
        }
        const r4Json = await r4.json();
        const initData = (r4Json.code && r4Json.data) ? r4Json.data : r4Json;
        clipId = initData.clip_id || initData.id || '';
        break;
      } else if (st === 'failed' || st === 'error') {
        const errMsg = sd.error_message || sd.error || sd.detail || sd.message || st;
        return res.status(500).json({ success: false, error: `音频处理失败: ${errMsg}` });
      }
    }
    if (!clipId) return res.status(504).json({ success: false, error: 'Upload timeout - no clip_id (60s)' });
    return res.json({ success: true, data: { clipId, uploadId, filename, size: req.file.size, mime: ct } });
  } catch (e) {
    console.error('proxy/audio/upload 错误:', e);
    res.status(500).json({ success: false, error: e.message || '请求失败' });
  }
});

router._testOnly = {
  resolveLlmCredentials,
  apishuSeedanceUpstreamModel,
  isApishuVeoOmniModel,
  buildVideosApiPayload,
  uploadRefToZhenzhen,
  resolveVideoSubmitProtocol,
  resolveSeedanceSubmitProtocol,
  resolveSeedanceVideoModelOverride,
  resolveVideosApiSeedanceModel,
  buildImageUpstreamErrorMessage,
  buildApishuVeoOmniPayload,
  saveAuthenticatedVideoContent,
  callImageUpstreamAsync,
  extractImageUpstreamRequestId,
  extractApishuVideoUrl,
  extractApishuVideoUrls,
  gptImage2ZhenzhenVariantSize,
  fetchImageTaskStatus,
  imageTaskId,
  normalizeImageItems,
  normalizeImageApiModel,
  resolveConfiguredImageApiModel,
  imageStatusUrlCandidates,
  isExplicitImageTaskFailure,
  isTransientImageTaskState,
  isTransientImageTaskHttpStatus,
  normalizeVideoTaskStatus,
  retryImageTaskAfterAsyncFailure,
};

module.exports = router;
