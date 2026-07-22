const { resolveMediaRef } = require('./mediaResolver');
const { normalizeLlmMessageMedia } = require('./llmMedia');

const DEFAULT_TIMEOUT_MS = 8000;
const VIDEO_SUCCESS_STATUSES = new Set(['SUCCESS', 'SUCCEED', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'DONE', 'FINISHED', 'OK', 'READY']);
const VIDEO_FAILURE_STATUSES = new Set(['FAILURE', 'FAILED', 'FAIL', 'ERROR', 'ERRORED', 'CANCELED', 'CANCELLED', 'TIMEOUT', 'TIMEDOUT', 'REJECTED', 'EXPIRED']);
const VIDEO_TRANSIENT_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function hasApiKey(provider) {
  return typeof provider?.apiKey === 'string' && provider.apiKey.trim().length > 0;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || fetch;
  const { timeoutMs, fetchImpl: _fetchImpl, ...fetchOptions } = options;
  try {
    return await fetchImpl(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function validateProvider(provider, { apiKeyRequired = true } = {}) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl);
  if (!baseUrl) {
    return { ok: false, code: 'missing_base_url', error: '请先填写 Base URL。' };
  }
  if (apiKeyRequired && !hasApiKey(provider)) {
    return { ok: false, code: 'missing_api_key', error: '请先填写 API Key。' };
  }
  return { ok: true, baseUrl };
}

function providerEndpointUrl(provider, defaultPath, overrideKeys = []) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl);
  const defaults = provider?.defaults || {};
  const override = overrideKeys
    .map((key) => defaults[key])
    .find((value) => typeof value === 'string' && value.trim());
  const rawPath = String(override || defaultPath || '').trim();
  if (/^https?:\/\//i.test(rawPath)) return rawPath.replace(/\/+$/, '');
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const apiBase = baseUrl.endsWith('/v1') || baseUrl.endsWith('/v1beta') ? baseUrl : `${baseUrl}/v1`;
  return `${apiBase}${path}`;
}

function providerProtocol(provider) {
  return String(provider?.protocol || '').trim().toLowerCase();
}

function isGeminiProvider(provider) {
  return providerProtocol(provider) === 'gemini';
}

function geminiEndpointUrl(provider, model) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
  return `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
}

function selectedModel(requested, providerModels, fallback) {
  const fromList = Array.isArray(providerModels) ? providerModels.find((item) => String(item || '').trim()) : '';
  const model = String(requested || fromList || fallback || '').trim();
  if (!model) throw new Error('模型名称不能为空。');
  if (model.length > 240 || /[\x00-\x1f\x7f]/.test(model)) throw new Error('模型名称不合法。');
  return model;
}

function bearerHeaders(provider) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json',
  };
}

function providerHeaders(provider) {
  if (isGeminiProvider(provider)) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-goog-api-key': provider.apiKey,
    };
  }
  return bearerHeaders(provider);
}

function trimBodyForError(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function errorText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || String(value);
  if (typeof value !== 'object') return String(value);
  const parts = [];
  for (const key of ['message', 'msg', 'detail', 'error', 'fail_reason', 'failReason', 'code', 'status']) {
    const item = value[key];
    if (typeof item === 'string' && item.trim()) parts.push(item.trim());
    else if (typeof item === 'number' || typeof item === 'boolean') parts.push(String(item));
    else if (item && typeof item === 'object' && key !== 'error') parts.push(errorText(item));
  }
  if (parts.filter(Boolean).length) return parts.filter(Boolean).join(' · ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cleanErrorText(value) {
  return errorText(value).replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function responseJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function unwrapOpenAIResponse(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) && !raw.choices && !raw.data?.url && !raw.data?.b64_json) {
      return raw.data;
    }
  }
  return raw;
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function textFromGeminiParts(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map((part) => {
      if (typeof part?.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractChatText(raw) {
  const data = unwrapOpenAIResponse(raw);
  const geminiCandidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const geminiText = textFromGeminiParts(geminiCandidate?.content?.parts);
  if (geminiText) return geminiText;
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text ?? data?.output_text ?? data?.text;
  return textFromContent(content).trim();
}

function normalizeBase64Image(value, mime = 'image/png') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^data:image\//i.test(text)) return text;
  return `data:${mime || 'image/png'};base64,${text}`;
}

function normalizeRemoteImageUrl(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  if (/^\/\//.test(text)) return `https:${text}`;
  if (/^(https?:\/\/|data:image\/|\/files\/output\/)/i.test(text)) return text;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?\//i.test(text)) return `https://${text}`;
  return '';
}

function collectImageUrls(value, out = []) {
  if (!value) return out;
  if (typeof value === 'string') {
    const text = normalizeRemoteImageUrl(value);
    if (text) out.push(text);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageUrls(item, out);
    return out;
  }
  if (typeof value !== 'object') return out;

  const mime = value.mime_type || value.mime || value.content_type || 'image/png';
  const direct = value.url || value.image_url || value.imageUrl || value.uri || value.value || value.image?.url || value.image_url?.url;
  if (direct) collectImageUrls(direct, out);
  if (value.b64_json || value.base64) out.push(normalizeBase64Image(value.b64_json || value.base64, mime));
  if (value.inlineData || value.inline_data) {
    const inline = value.inlineData || value.inline_data;
    const data = inline.data || inline.b64_json || inline.base64;
    if (data) out.push(normalizeBase64Image(data, inline.mimeType || inline.mime_type || mime));
  }

  for (const key of ['data', 'images', 'image_urls', 'imageUrls', 'output_images', 'outputs', 'results', 'choices', 'message', 'candidates', 'content', 'parts']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) collectImageUrls(value[key], out);
  }
  return out;
}

function extractImageUrls(raw) {
  const data = unwrapOpenAIResponse(raw);
  return [...new Set(collectImageUrls(data))];
}

function collectVideoUrls(value, out = []) {
  if (!value) return out;
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^(https?:\/\/|data:video\/|\/files\/output\/)/i.test(text)) out.push(text);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectVideoUrls(item, out);
    return out;
  }
  if (typeof value !== 'object') return out;

  const direct = (
    value.video_url || value.videoUrl || value.mp4_url || value.mp4Url ||
    value.result_url || value.resultUrl || value.output_url || value.outputUrl ||
    value.download_url || value.downloadUrl || value.video || value.url ||
    value.uri || value.value || value.src || value.path
  );
  if (direct) collectVideoUrls(direct, out);
  for (const key of [
    'data',
    'result',
    'resultUrls',
    'result_urls',
    'videos',
    'video_urls',
    'videoUrls',
    'output_videos',
    'outputs',
    'results',
    'files',
    'content',
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) collectVideoUrls(value[key], out);
  }
  return out;
}

function extractVideoUrls(raw) {
  const data = unwrapOpenAIResponse(raw);
  return [...new Set(collectVideoUrls(data))];
}

function extractTaskId(raw) {
  const data = unwrapOpenAIResponse(raw);
  return String(
    data?.video_id ||
    data?.task_id ||
    data?.taskId ||
    data?.id ||
    raw?.video_id ||
    raw?.task_id ||
    raw?.taskId ||
    raw?.id ||
    '',
  ).trim();
}

function extractVideoStatus(raw) {
  const data = unwrapOpenAIResponse(raw);
  return String(
    data?.status ||
    data?.task_status ||
    data?.taskStatus ||
    raw?.status ||
    raw?.task_status ||
    raw?.taskStatus ||
    '',
  ).trim().toUpperCase();
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function classifyModelId(modelId, item) {
  const endpointTypes = Array.isArray(item?.supported_endpoint_types)
    ? item.supported_endpoint_types.map((value) => String(value || '').toLowerCase())
    : [];
  if (endpointTypes.some((value) => value.includes('video'))) return 'video';
  if (endpointTypes.some((value) => value.includes('image'))) return 'image';
  if (endpointTypes.some((value) => value.includes('audio') || value.includes('speech') || value.includes('music'))) return 'audio';
  if (endpointTypes.some((value) => value.includes('chat') || value.includes('completion') || value === 'openai')) return 'chat';
  const text = String(modelId || '').toLowerCase();
  const videoKeys = ['veo', 'sora', 'wan2', 'wanx', 'seedance', 'kling', 'hailuo', 'video', 't2v-', 'i2v-', 's2v'];
  if (videoKeys.some((key) => text.includes(key))) return 'video';
  const imageKeys = ['banana', 'image', 'dalle', 'dall-e', 'imagen', 'flux', 'stable', 'sdxl', 'midjourney', 'ideogram', 'z-image', 'qwen-image', 'seedream', 'text-to-image', 'image-to-image'];
  if (imageKeys.some((key) => text.includes(key))) return 'image';
  const audioKeys = ['audio', 'speech', 'tts', 'suno', 'music', 'voice', 'sound', 'song', 'vocal'];
  if (audioKeys.some((key) => text.includes(key))) return 'audio';
  const chatKeys = ['gpt-', 'chatgpt', 'claude', 'deepseek', 'qwen', 'llama', 'mistral', 'gemini', 'glm-', 'moonshot', 'kimi', 'minimax', 'command-r'];
  if (chatKeys.some((key) => text.includes(key))) return 'chat';
  return 'unknown';
}

function modelIdFromItem(item, provider) {
  let id = '';
  if (typeof item === 'string') id = item;
  else if (item && typeof item === 'object') id = item.id || item.name || item.model || '';
  id = String(id || '').trim();
  if (isGeminiProvider(provider) && id.startsWith('models/')) id = id.slice('models/'.length);
  if (!id || id.length > 240 || /[\x00-\x1f\x7f]/.test(id)) return '';
  return id;
}

function parseModelList(raw, provider) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let items = Array.isArray(source.data) ? source.data : null;
  if (!items) items = Array.isArray(source.models) ? source.models : null;
  if (!items) items = Array.isArray(source.list) ? source.list : [];

  const all = [];
  for (const item of items) {
    const id = modelIdFromItem(item, provider);
    if (id && !all.includes(id)) all.push(id);
  }

  const grouped = { imageModels: [], chatModels: [], videoModels: [], audioModels: [], unknownModels: [] };
  for (const id of all) {
    const item = items.find((candidate) => modelIdFromItem(candidate, provider) === id);
    const kind = classifyModelId(id, item);
    if (kind === 'image') grouped.imageModels.push(id);
    else if (kind === 'video') grouped.videoModels.push(id);
    else if (kind === 'audio') grouped.audioModels.push(id);
    else if (kind === 'chat') grouped.chatModels.push(id);
    else grouped.unknownModels.push(id);
  }
  return { ...grouped, all };
}

async function resolveReferenceImages(refs, options = {}) {
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const value = typeof ref === 'string' ? ref : ref?.url || ref?.imageUrl || ref?.value;
    if (!value) continue;
    const resolved = await resolveMediaRef(value, {
      target: options.referenceTarget || 'data-url',
      baseUrl: options.baseUrl,
    });
    out.push(resolved.dataUrl || resolved.url || resolved.path || value);
  }
  return out;
}

function uniqueUrls(values) {
  return [...new Set(values.filter(Boolean))];
}

function videoEndpointCandidates(provider) {
  const primary = providerEndpointUrl(provider, '/videos/generations', ['videoGenerationEndpoint', 'video_generation_endpoint']);
  const singular = providerEndpointUrl(provider, '/video/generations', []);
  return uniqueUrls([primary, singular]);
}

function zhenzhenCompatibleVideoEndpointCandidates(provider) {
  const defaults = provider?.defaults || {};
  const override = defaults.videoGenerationEndpoint || defaults.video_generation_endpoint;
  if (typeof override === 'string' && override.trim()) {
    return uniqueUrls([providerEndpointUrl(provider, '/videos/generations', ['videoGenerationEndpoint', 'video_generation_endpoint'])]);
  }
  const baseUrl = cleanBaseUrl(provider?.baseUrl);
  const root = baseUrl.replace(/\/v1(?:beta)?$/i, '').replace(/\/v2$/i, '');
  return uniqueUrls([`${root}/v2/videos/generations`]);
}

function isSingularVideoTaskEndpoint(url) {
  return /\/video\/generations(?:\/|$)/.test(String(url || ''));
}

function videoTaskPollUrl(submitUrl, taskId) {
  return `${String(submitUrl || '').replace(/\/+$/, '')}/${encodeURIComponent(taskId)}`;
}

function videoSubmitBodyForEndpoint(body, input, endpointUrl) {
  const next = { ...body };
  if (!isSingularVideoTaskEndpoint(endpointUrl)) return next;

  const ratio = input.size || input.aspect_ratio || input.ratio;
  if (ratio) next.size = String(ratio);
  if (input.seconds != null) next.seconds = Number(input.seconds);
  if (Array.isArray(next.images) && next.images.length) {
    next.reference_images = next.images;
  }
  return next;
}

function providerKind(input = {}) {
  return String(input.providerKind || input.provider_kind || input.providerParams?.providerKind || input.providerParams?.provider_kind || '').trim().toLowerCase();
}

function stripDataUrlPrefix(value) {
  const text = String(value || '').trim();
  const match = text.match(/^data:[^;,]+;base64,(.*)$/i);
  return match ? match[1] : text;
}

function buildZhenzhenCompatibleVideoBody(input = {}, model, prompt, refs = []) {
  const kind = providerKind(input);
  if (!kind) return null;
  const ratio = input.ratio || input.aspect_ratio || '16:9';

  if (kind === 'grok') {
    const body = {
      prompt,
      model,
      ratio: String(ratio || '16:9'),
      duration: parseInt(input.duration ?? input.seconds ?? 15, 10),
      resolution: String(input.resolution || '720P'),
    };
    if (input.seed != null && Number(input.seed) > 0) body.seed = Number(input.seed);
    if (refs.length) body.images = refs.slice(0, 7);
    return body;
  }

  if (kind === 'sora') {
    const body = {
      prompt,
      model,
      aspect_ratio: String(input.aspect_ratio || input.ratio || '16:9'),
      duration: String(input.duration ?? input.seconds ?? 15),
      private: input.private !== false && input.is_private !== false,
    };
    if (input.seed != null && Number(input.seed) > 0) body.seed = Number(input.seed);
    if (refs.length) body.images = refs.slice(0, 1).map(stripDataUrlPrefix).filter(Boolean);
    return body;
  }

  if (kind === 'veo' || kind === 'seedance') {
    const body = {
      prompt,
      model,
      enhance_prompt: input.enhance_prompt !== false,
    };
    if (input.aspect_ratio || input.ratio) body.aspect_ratio = String(input.aspect_ratio || input.ratio);
    if (input.seed != null && Number(input.seed) > 0) body.seed = Number(input.seed);
    if (input.enable_upsample) body.enable_upsample = true;
    if (refs.length) body.images = refs.slice(0, 3);
    return body;
  }

  return null;
}

async function submitVideoGeneration(provider, candidateUrls, body, input, options = {}) {
  let lastFailure = null;
  for (const url of candidateUrls) {
    const requestBody = videoSubmitBodyForEndpoint(body, input, url);
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: bearerHeaders(provider),
      body: JSON.stringify(requestBody),
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    const raw = await responseJson(res);
    if (res.ok) return { ok: true, url, raw };
    lastFailure = { res, raw, url };
    if (![404, 405].includes(Number(res.status))) break;
  }
  return { ok: false, ...lastFailure };
}

async function pollVideoGenerationTask(provider, submitUrl, taskId, options = {}) {
  const maxPolls = clampNumber(options.maxPolls, 720, 1, 720);
  const sleepImpl = options.sleepImpl || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollUrl = videoTaskPollUrl(submitUrl, taskId);
  let lastRaw = {};

  for (let i = 0; i < maxPolls; i += 1) {
    if (i > 0 || !options.skipInitialSleep) await sleepImpl(Number(options.pollIntervalMs || 5000));
    const res = await fetchWithTimeout(pollUrl, {
      method: 'GET',
      headers: bearerHeaders(provider),
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    const raw = await responseJson(res);
    lastRaw = raw;
    if (!res.ok) {
      if (VIDEO_TRANSIENT_HTTP_STATUSES.has(Number(res.status))) continue;
      return {
        ok: false,
        code: 'http_error',
        raw,
        error: `扩展视频任务查询失败：HTTP ${res.status}${raw?.message ? ` ${trimBodyForError(raw.message)}` : ''}`,
      };
    }

    const videoUrls = extractVideoUrls(raw);
    if (videoUrls.length) return { ok: true, raw, videoUrls };

    const status = extractVideoStatus(raw);
    if (VIDEO_FAILURE_STATUSES.has(status)) {
      return {
        ok: false,
        code: 'provider_task_failed',
        raw,
        error: `扩展视频任务失败：${cleanErrorText(raw?.message || raw?.error || raw?.data?.fail_reason || raw?.data?.error || status)}`,
      };
    }
    if (VIDEO_SUCCESS_STATUSES.has(status) && !videoUrls.length) {
      return { ok: false, code: 'empty_video', raw, error: '扩展视频任务完成但没有返回视频。' };
    }
  }

  return {
    ok: false,
    code: 'timeout',
    raw: lastRaw,
    error: `扩展视频任务超时：${cleanErrorText(lastRaw) || taskId}`,
  };
}

function geminiTextFromMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => textFromContent(message?.content))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function geminiBodyFromText(text, options = {}) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
  };
  const generationConfig = {};
  if (options.temperature != null) generationConfig.temperature = Number(options.temperature);
  if (options.maxTokens != null) generationConfig.maxOutputTokens = Number(options.maxTokens);
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  return body;
}

function openAiImageProtocol(provider) {
  const raw = String(provider?.defaults?.imageProtocol || provider?.defaults?.image_protocol || '').trim();
  return raw === 'openai-chat' ? 'openai-chat' : 'images';
}

function imageChatMessages(prompt, refs = [], options = {}) {
  const hints = [];
  if (options.aspectRatio) hints.push(`aspect ratio: ${options.aspectRatio}`);
  if (options.size) hints.push(`image size: ${options.size}`);
  const text = hints.length ? `${prompt}\n\n${hints.join('\n')}` : prompt;
  const content = [{ type: 'text', text }];
  for (const ref of refs) {
    if (!ref) continue;
    content.push({ type: 'image_url', image_url: { url: ref } });
  }
  return [{ role: 'user', content }];
}

function imageParamKind(input = {}, provider = {}) {
  return String(input.paramKind || input.providerParams?.paramKind || provider.defaults?.imageParamKind || '').trim();
}

function imageLevelUpper(value, fallback = '2K') {
  const text = String(value || fallback || '').trim();
  return text ? text.toUpperCase() : '';
}

function imageLevelLower(value, fallback = '2K') {
  const text = String(value || fallback || '').trim();
  return text ? text.toLowerCase() : '';
}

function isAutoAspect(value) {
  const text = String(value || '').trim();
  return !text || ['auto', 'empty'].includes(text.toLowerCase());
}

function buildZhenzhenCompatibleImageBody(input = {}, model, prompt, refs = []) {
  const paramKind = imageParamKind(input);
  const aspectRatio = input.aspect_ratio || input.ratio;
  const imageSize = input.image_size || input.resolution;
  const size = input.size ? String(input.size) : '';
  const n = Number(input.n) || 1;
  const quality = input.quality ? String(input.quality) : 'auto';

  if (paramKind === 'gpt-size') {
    const body = { model, prompt, n, quality };
    if (size) body.size = size;
    if (imageSize) {
      body.resolution = imageLevelLower(imageSize, '1K');
      body.image_size = imageLevelUpper(imageSize, '1K');
    }
    if (refs.length) {
      body.images = refs;
      body.image = refs[0];
      body.image_urls = refs;
    }
    return body;
  }

  if (paramKind === 'grok-image') {
    const body = {
      model,
      prompt,
      aspect_ratio: isAutoAspect(aspectRatio) ? '1:1' : String(aspectRatio),
    };
    if (refs.length) body.image = refs;
    return body;
  }

  if (paramKind === 'banana-ratio') {
    const body = {
      prompt,
      model,
      aspect_ratio: isAutoAspect(aspectRatio) ? '1:1' : String(aspectRatio || '1:1'),
      image_size: imageLevelUpper(imageSize, '2K'),
      n,
    };
    if (refs.length) body.image = refs;
    return body;
  }

  return null;
}

async function generateChat(provider, input = {}, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return validation;

  let model;
  try {
    model = selectedModel(input.model || input.providerModel, provider.chatModels, provider.defaults?.chatModel || 'gpt-4o-mini');
  } catch (e) {
    return { ok: false, code: 'invalid_model', providerId: provider.id, protocol: provider.protocol, error: e.message };
  }

  const messages = Array.isArray(input.messages) && input.messages.length
    ? input.messages
    : [{ role: 'user', content: String(input.prompt || '').trim() }];
  if (!messages.some((message) => String(message?.content || '').trim())) {
    return { ok: false, code: 'missing_prompt', providerId: provider.id, protocol: provider.protocol, error: '请输入要发送给 LLM 的内容。' };
  }

  let normalizedMessages;
  try {
    normalizedMessages = await normalizeLlmMessageMedia(messages, input, {
      baseUrl: options.baseUrl,
      ffmpegPath: options.ffmpegPath,
      ffmpegTimeoutMs: options.ffmpegTimeoutMs,
    });
  } catch (e) {
    return {
      ok: false,
      code: 'invalid_multimodal_reference',
      providerId: provider.id,
      protocol: provider.protocol,
      error: e?.message || 'LLM 多模态素材预处理失败。',
    };
  }

  const body = {
    model,
    messages: normalizedMessages,
  };
  if (input.temperature != null) body.temperature = Number(input.temperature);
  if (input.maxTokens != null) body.max_tokens = Number(input.maxTokens);
  if (input.max_tokens != null) body.max_tokens = Number(input.max_tokens);
  if (input.stream != null) body.stream = !!input.stream;

  const url = isGeminiProvider(provider)
    ? geminiEndpointUrl(provider, model)
    : providerEndpointUrl(provider, '/chat/completions', ['chatEndpoint', 'chat_endpoint']);
  const requestBody = isGeminiProvider(provider)
    ? geminiBodyFromText(geminiTextFromMessages(normalizedMessages), { temperature: body.temperature, maxTokens: body.max_tokens })
    : body;
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: providerHeaders(provider),
      body: JSON.stringify(requestBody),
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    const raw = await responseJson(res);
    if (!res.ok) {
      return {
        ok: false,
        code: 'http_error',
        providerId: provider.id,
        protocol: provider.protocol,
        error: `扩展 LLM 调用失败：HTTP ${res.status}${raw?.message ? ` ${trimBodyForError(raw.message)}` : ''}`,
        raw,
      };
    }
    const text = extractChatText(raw);
    if (!text) {
      return { ok: false, code: 'empty_text', providerId: provider.id, protocol: provider.protocol, error: '扩展 LLM 没有返回文本。', raw };
    }
    const data = unwrapOpenAIResponse(raw);
    const finishReason = data?.choices?.[0]?.finish_reason || data?.choices?.[0]?.finishReason || '';
    return {
      ok: true,
      kind: 'llm',
      code: 'completed',
      providerId: provider.id,
      protocol: provider.protocol,
      model,
      text,
      finishReason,
      truncated: ['length', 'max_tokens', 'content_length'].includes(String(finishReason || '').toLowerCase()),
      raw,
    };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: provider.protocol,
      error: e?.name === 'AbortError' ? '扩展 LLM 调用超时。' : (e?.message || '扩展 LLM 调用失败。'),
    };
  }
}

async function generateImage(provider, input = {}, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return validation;

  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    return { ok: false, code: 'missing_prompt', providerId: provider.id, protocol: provider.protocol, error: '请输入图像提示词。' };
  }

  let model;
  try {
    model = selectedModel(input.model || input.providerModel, provider.imageModels, provider.defaults?.imageModel || '');
  } catch (e) {
    return { ok: false, code: 'invalid_model', providerId: provider.id, protocol: provider.protocol, error: e.message };
  }

  let body = {
    model,
    prompt,
  };
  if (input.size) body.size = String(input.size);
  if (input.n != null) body.n = Number(input.n);
  if (input.quality) body.quality = String(input.quality);
  if (input.response_format) body.response_format = String(input.response_format);
  // 比例 / 清晰度：OpenAI 兼容中转（New API / apishu 等）按 aspect_ratio + image_size 识别，
  // 这两个字段过去从未写进 body，导致上游只能按默认 1:1 / 1K 生成。ratio / resolution 作为同义兜底。
  const aspectRatioValue = input.aspect_ratio || input.ratio;
  if (aspectRatioValue) body.aspect_ratio = String(aspectRatioValue);
  const imageSizeValue = input.image_size || input.resolution;
  if (imageSizeValue) body.image_size = String(imageSizeValue);

  try {
    const refs = await resolveReferenceImages(input.images || input.referenceImages || input.reference_images, {
      baseUrl: options.baseUrl,
      referenceTarget: input.referenceTarget || provider.defaults?.referenceTarget || 'data-url',
    });
    const zhenzhenBody = buildZhenzhenCompatibleImageBody(input, model, prompt, refs);
    if (zhenzhenBody) body = zhenzhenBody;
    else if (refs.length) body.image = refs;
  } catch (e) {
    return { ok: false, code: 'invalid_reference', providerId: provider.id, protocol: provider.protocol, error: e?.message || '参考图解析失败。' };
  }

  const hasResolvedRefs = Array.isArray(body.image) && body.image.length > 0;
  const useImageChat = !isGeminiProvider(provider) && hasResolvedRefs && openAiImageProtocol(provider) === 'openai-chat';
  const url = isGeminiProvider(provider)
    ? geminiEndpointUrl(provider, model)
    : (useImageChat
      ? providerEndpointUrl(provider, '/chat/completions', ['chatEndpoint', 'chat_endpoint'])
      : providerEndpointUrl(provider, '/images/generations', ['imageGenerationEndpoint', 'image_generation_endpoint']));
  const requestBody = isGeminiProvider(provider)
    ? geminiBodyFromText(prompt)
    : (useImageChat
      ? {
          model,
          messages: imageChatMessages(prompt, body.image || [], {
            aspectRatio: input.aspect_ratio || input.ratio,
            size: input.image_size || input.resolution || input.size,
          }),
          response_format: { type: 'url' },
        }
      : body);
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: providerHeaders(provider),
      body: JSON.stringify(requestBody),
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    const raw = await responseJson(res);
    if (!res.ok) {
      return {
        ok: false,
        code: 'http_error',
        providerId: provider.id,
        protocol: provider.protocol,
        error: `扩展图像调用失败：HTTP ${res.status}${raw?.message ? ` ${trimBodyForError(raw.message)}` : ''}`,
        raw,
      };
    }
    const imageUrls = extractImageUrls(raw);
    if (!imageUrls.length) {
      return { ok: false, code: 'empty_image', providerId: provider.id, protocol: provider.protocol, error: '扩展图像接口没有返回图片。', raw };
    }
    return { ok: true, kind: 'image', code: 'completed', providerId: provider.id, protocol: provider.protocol, model, imageUrls, raw };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: provider.protocol,
      error: e?.name === 'AbortError' ? '扩展图像调用超时。' : (e?.message || '扩展图像调用失败。'),
    };
  }
}

async function generateVideo(provider, input = {}, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return validation;

  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    return { ok: false, code: 'missing_prompt', providerId: provider.id, protocol: provider.protocol, error: '请输入视频提示词。' };
  }

  let model;
  try {
    model = selectedModel(input.model || input.providerModel, provider.videoModels, provider.defaults?.videoModel || '');
  } catch (e) {
    return { ok: false, code: 'invalid_model', providerId: provider.id, protocol: provider.protocol, error: e.message };
  }

  let body = { model, prompt };
  if (input.aspect_ratio) body.aspect_ratio = String(input.aspect_ratio);
  if (input.ratio) body.ratio = String(input.ratio);
  if (input.size) body.size = String(input.size);
  if (input.duration != null) body.duration = Number(input.duration);
  if (input.seconds != null) body.seconds = Number(input.seconds);
  if (input.resolution) body.resolution = String(input.resolution);
  if (input.seed != null && Number(input.seed) >= 0) body.seed = Number(input.seed);

  try {
    const refs = await resolveReferenceImages(input.images || input.referenceImages || input.reference_images, {
      baseUrl: options.baseUrl,
      referenceTarget: input.referenceTarget || provider.defaults?.videoReferenceTarget || provider.defaults?.referenceTarget || 'data-url',
    });
    const zhenzhenBody = buildZhenzhenCompatibleVideoBody(input, model, prompt, refs);
    if (zhenzhenBody) body = zhenzhenBody;
    else if (refs.length) body.images = refs;
  } catch (e) {
    return { ok: false, code: 'invalid_reference', providerId: provider.id, protocol: provider.protocol, error: e?.message || '参考图解析失败。' };
  }

  try {
    const submitted = await submitVideoGeneration(
      provider,
      providerKind(input) ? zhenzhenCompatibleVideoEndpointCandidates(provider) : videoEndpointCandidates(provider),
      body,
      input,
      options,
    );
    if (!submitted.ok) {
      const raw = submitted.raw || {};
      const status = submitted.res?.status || 0;
      return {
        ok: false,
        code: 'http_error',
        providerId: provider.id,
        protocol: provider.protocol,
        error: `扩展视频调用失败：HTTP ${status}${raw?.message ? ` ${trimBodyForError(raw.message)}` : ''}`,
        raw,
      };
    }
    const raw = submitted.raw;
    let videoUrls = extractVideoUrls(raw);
    const taskId = extractTaskId(raw);
    let finalRaw = raw;
    if (!videoUrls.length && taskId) {
      const polled = await pollVideoGenerationTask(provider, submitted.url, taskId, options);
      finalRaw = polled.raw || raw;
      if (!polled.ok) {
        return {
          ok: false,
          code: polled.code || 'provider_task_failed',
          providerId: provider.id,
          protocol: provider.protocol,
          error: polled.error || '扩展视频任务失败。',
          taskId,
          raw: finalRaw,
        };
      }
      videoUrls = polled.videoUrls || [];
    }
    if (!videoUrls.length) {
      return { ok: false, code: 'empty_video', providerId: provider.id, protocol: provider.protocol, error: '扩展视频接口没有返回视频。', taskId, raw: finalRaw };
    }
    return { ok: true, kind: 'video', code: 'completed', providerId: provider.id, protocol: provider.protocol, model, taskId, videoUrls, raw: finalRaw };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: provider.protocol,
      error: e?.name === 'AbortError' ? '扩展视频调用超时。' : (e?.message || '扩展视频调用失败。'),
    };
  }
}

async function testProvider(provider, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return validation;

  if (options.dryRun) {
    return {
      ok: true,
      code: 'dry_run_ok',
      providerId: provider.id,
      protocol: provider.protocol,
      message: '配置格式可用，已跳过真实网络请求。',
    };
  }

  const url = isGeminiProvider(provider)
    ? `${validation.baseUrl}/models?key=${encodeURIComponent(provider.apiKey)}`
    : `${validation.baseUrl}/models`;
  const headers = isGeminiProvider(provider)
    ? { Accept: 'application/json' }
    : { Authorization: `Bearer ${provider.apiKey}` };
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    if (!res.ok) {
      return {
        ok: false,
        code: 'http_error',
        providerId: provider.id,
        protocol: provider.protocol,
        error: `测试连接失败：HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      code: 'connected',
      providerId: provider.id,
      protocol: provider.protocol,
      message: '连接成功。',
    };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: provider.protocol,
      error: e?.name === 'AbortError' ? '测试连接超时。' : (e?.message || '测试连接失败。'),
    };
  }
}

async function fetchModels(provider, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return { ...validation, providerId: provider?.id || '', protocol: provider?.protocol || '' };

  const headers = isGeminiProvider(provider)
    ? { Accept: 'application/json' }
    : { Accept: 'application/json', Authorization: `Bearer ${provider.apiKey}` };
  const candidateUrls = isGeminiProvider(provider)
    ? [`${validation.baseUrl}/models?key=${encodeURIComponent(provider.apiKey)}`]
    : (validation.baseUrl.endsWith('/v1')
      ? [`${validation.baseUrl}/models`]
      : [`${validation.baseUrl}/v1/models`, `${validation.baseUrl}/models`]);
  let lastFailure = null;
  try {
    for (const url of candidateUrls) {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers,
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
      });
      const raw = await responseJson(res);
      if (!res.ok) {
        lastFailure = {
          ok: false,
          code: 'http_error',
          providerId: provider.id,
          protocol: provider.protocol,
          error: `拉取模型列表失败：HTTP ${res.status}${raw?.message ? ` ${trimBodyForError(raw.message)}` : ''}`,
          raw,
        };
        continue;
      }
      const parsed = parseModelList(raw, provider);
      if (!parsed.all.length && /<!doctype html|<html[\s>]/i.test(String(raw?.message || '')) && url !== candidateUrls[candidateUrls.length - 1]) {
        continue;
      }
      return {
        ok: true,
        code: 'models_fetched',
        providerId: provider.id,
        protocol: provider.protocol,
        total: parsed.all.length,
        modelCount: parsed.all.length,
        imageModels: parsed.imageModels,
        chatModels: parsed.chatModels,
        videoModels: parsed.videoModels,
        audioModels: parsed.audioModels,
        unknownModels: parsed.unknownModels,
        all: parsed.all,
        message: parsed.all.length ? `已拉取 ${parsed.all.length} 个模型。` : '模型列表接口可达，但未解析到模型。',
        raw,
        modelListUrl: url,
      };
    }
    return lastFailure || {
      ok: false,
      code: 'provider_models_fetch_failed',
      providerId: provider.id,
      protocol: provider.protocol,
      error: '拉取模型列表失败。',
    };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: provider.protocol,
      error: e?.name === 'AbortError' ? '拉取模型列表超时。' : (e?.message || '拉取模型列表失败。'),
    };
  }
}

module.exports = {
  cleanBaseUrl,
  extractChatText,
  extractImageUrls,
  extractVideoUrls,
  fetchModels,
  fetchWithTimeout,
  generateChat,
  generateImage,
  generateVideo,
  parseModelList,
  providerEndpointUrl,
  testProvider,
  validateProvider,
};
