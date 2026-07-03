import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  GROK_VIDEO_1_5_NEW_MODELS,
  VIDEO_FAL_REGISTRY,
  VIDEO_MODELS,
  GROK_VIDEO_1_5_NEW_SIZES,
  grokVideo15NewSizeFromRatio,
  isFalVideoModel,
  isGrokVideo15NewModel,
} from '../src/providers/models.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const proxyModule = require('../backend/src/routes/proxy.js');

test('video model type order defaults to Grok Video then Veo then Sora2', () => {
  const visibleVideoModels = VIDEO_MODELS.filter((model) => model.kind !== 'seedance');

  assert.deepEqual(
    visibleVideoModels.map((model) => model.label),
    ['Grok Video', 'Veo', 'Sora2'],
  );
  assert.equal(VIDEO_MODELS[0].kind, 'grok');
});

test('grok video tab defaults to grok-video-3 zhenzhen model with the new display name', () => {
  const grok = VIDEO_MODELS.find((model) => model.kind === 'grok');

  assert.ok(grok);
  assert.equal(grok.apiModelOptions[0].value, 'grok-video-3');
  assert.equal(grok.apiModelOptions[0].label, 'grok-video-3（新版1.5）');
  assert.ok(grok.apiModelOptions.some((option) => option.value === 'grok-imagine-video-1.5'));
});

test('Grok Video includes the new zhenzhen grok 1.5 models without treating them as FAL', () => {
  const grok = VIDEO_MODELS.find((model) => model.kind === 'grok');

  assert.ok(grok);
  assert.deepEqual(
    GROK_VIDEO_1_5_NEW_MODELS,
    ['grok-1.5-video-6s', 'grok-1.5-video-10s', 'grok-1.5-video-15s'],
  );
  for (const model of GROK_VIDEO_1_5_NEW_MODELS) {
    assert.ok(grok.apiModelOptions.some((option) => option.value === model), `${model} should be selectable`);
    assert.equal(isGrokVideo15NewModel(model), true);
    assert.equal(isFalVideoModel(model), false);
  }
});

test('Grok Video 1.5 new models use Comfly size mapping instead of old duration/resolution fields', () => {
  assert.deepEqual(
    GROK_VIDEO_1_5_NEW_SIZES.map((item) => item.value),
    ['1280x720', '720x1280'],
  );
  assert.equal(grokVideo15NewSizeFromRatio('16:9'), '1280x720');
  assert.equal(grokVideo15NewSizeFromRatio('9:16'), '720x1280');
  assert.equal(grokVideo15NewSizeFromRatio('1:1'), '1280x720');

  const videoNode = read('../src/components/nodes/VideoNode.tsx');
  assert.match(videoNode, /isGrok15New/);
  assert.match(videoNode, /const grok15NewSize =/);
  assert.ok(videoNode.includes('payload.size = grok15NewSize'));
  assert.match(videoNode, /尺寸/);
  assert.match(videoNode, /Grok 1\.5 New 需要 1 张参考图/);
});

test('Grok Video 1.5 new backend path follows Comfly /v1/videos multipart protocol', () => {
  const proxyRoute = read('../backend/src/routes/proxy.js');

  assert.match(proxyRoute, /GROK_VIDEO_1_5_NEW_MODELS/);
  assert.match(proxyRoute, /isGrokVideo15NewModel\(lowerModel\)/);
  assert.match(proxyRoute, /form\.append\('model', model\)/);
  assert.match(proxyRoute, /form\.append\('prompt', prompt\)/);
  assert.match(proxyRoute, /form\.append\('size', grokVideo15NewSizeFromRatio/);
  assert.match(proxyRoute, /appendGrokVideo15InputReference\(form, refs\[0\]/);
  assert.match(proxyRoute, /rememberTaskKey\(taskId, apiKey, \{ model,/);
  assert.match(proxyRoute, /isVeoOmniModel\(queryModel\) \|\| isGrokVideo15NewModel\(queryModel\)/);
});

test('Veo category defaults to Apishu Veo Omni without removing legacy Veo options', () => {
  const veo = VIDEO_MODELS.find((model) => model.kind === 'veo');

  assert.ok(veo);
  assert.equal(veo.label, 'Veo');
  assert.equal(veo.apiModelOptions[0].value, 'veo-omni-flash');
  assert.equal(veo.apiModelOptions[0].label, 'Veo Omni');
  assert.ok(veo.apiModelOptions.some((option) => option.value === 'veo-omni-flash-video-edit'));
  assert.ok(veo.apiModelOptions.some((option) => option.value === 'veo-omni-10s'));
  assert.ok(veo.apiModelOptions.some((option) => option.value === 'veo3.1'));
  assert.ok(veo.apiModelOptions.some((option) => option.value === 'veo3.1-fal'));
});

test('Grok Video 1.5 uses the v1.5 image-to-video FAL endpoint with base64 images', () => {
  const fal = VIDEO_FAL_REGISTRY['grok-imagine-video-1.5'];

  assert.ok(fal);
  assert.equal(fal.paramKind, 'grok-fal');
  assert.equal(fal.endpoint, 'xai/grok-imagine-video/v1.5/image-to-video');
  assert.equal(fal.maxRefImages, 1);
  assert.equal(fal.defaultImageMode, 'base64');
});

test('Sora2 keeps the existing FAL option and adds a separate Zhenzhen API option', () => {
  const sora = VIDEO_MODELS.find((model) => model.kind === 'sora');

  assert.ok(sora);
  assert.deepEqual(
    sora.apiModelOptions.map((option) => option.value),
    ['sora-2', 'sora-2-zhenzhen'],
  );
  assert.equal(isFalVideoModel('sora-2'), true);
  assert.equal(isFalVideoModel('sora-2-zhenzhen'), false);
  assert.deepEqual(sora.ratios, ['16:9', '9:16']);
  assert.deepEqual(sora.durations, [15]);
  assert.equal(sora.maxRefImages, 1);
});

test('Sora2 has an independent classified API key field', () => {
  const apiSettings = read('../src/components/ApiSettings.tsx');
  const settingsRoute = read('../backend/src/routes/settings.js');
  const proxyRoute = read('../backend/src/routes/proxy.js');

  assert.match(apiSettings, /'soraApiKey'/);
  assert.match(apiSettings, /label: 'sora2 系列'/);
  assert.match(settingsRoute, /soraApiKey: ''/);
  assert.match(settingsRoute, /'soraApiKey'/);
  assert.match(proxyRoute, /m\.includes\('sora'\)\) return settings\.soraApiKey \|\| fb/);
});

test('Sora2 Zhenzhen API channel maps to upstream sora-2 without touching FAL sora-2', () => {
  const proxyRoute = read('../backend/src/routes/proxy.js');

  assert.match(proxyRoute, /const isSoraZhenzhen = lowerModel === 'sora-2-zhenzhen'/);
  assert.match(proxyRoute, /model: 'sora-2'/);
  assert.match(proxyRoute, /private: privateVideo !== false && is_private !== false/);
  assert.match(proxyRoute, /images\.slice\(0,\s*1\)\.map\(stripDataUrlPrefix\)/);
  assert.match(proxyRoute, /getUpstreamErrorMessage\(data, text, r\.status\)/);
});

test('Veo Omni uses the Comfly /v1/videos multipart protocol', () => {
  const proxyRoute = read('../backend/src/routes/proxy.js');
  const videoNode = read('../src/components/nodes/VideoNode.tsx');

  assert.match(proxyRoute, /const VEO_OMNI_PUBLIC_MODEL = 'veo-omni-10s'/);
  assert.match(proxyRoute, /const VEO_OMNI_UPSTREAM_MODEL = 'omni_flash-10s'/);
  assert.match(proxyRoute, /\/v1\/videos/);
  assert.match(proxyRoute, /form\.append\('input_reference'/);
  assert.match(proxyRoute, /rememberTaskKey\(taskId, apiKey, \{ model: VEO_OMNI_PUBLIC_MODEL,/);
  assert.match(proxyRoute, /isVeoOmniModel\(queryModel\)/);
  assert.ok(videoNode.includes('payload.duration = 10'));
  assert.match(videoNode, /veo-omni-10s 需要 1 张参考图/);
});

test('Apishu Veo Omni models use JSON /v1/videos and v1 polling', () => {
  const proxyRoute = read('../backend/src/routes/proxy.js');
  const videoNode = read('../src/components/nodes/VideoNode.tsx');

  assert.match(proxyRoute, /function isApishuVeoOmniModel\(model\)/);
  assert.match(proxyRoute, /veo-omni-flash-video-edit/);
  assert.match(proxyRoute, /buildApishuVeoOmniPayload/);
  assert.match(proxyRoute, /Ingredients_images/);
  assert.match(proxyRoute, /duration:\s*10/);
  assert.match(proxyRoute, /apishuVideosEndpoint\(settings\)/);
  assert.match(proxyRoute, /protocol: 'apishu-veo-omni'/);
  assert.match(proxyRoute, /rememberedMeta\?\.protocol === 'apishu-veo-omni'/);
  assert.match(videoNode, /isApishuVeoOmni/);
  assert.match(videoNode, /maxApishuVeoOmniRefs/);
  assert.match(videoNode, /payload\.duration = 10/);
});

test('Apishu Veo Omni edit converts local app video URLs to video data URIs', async () => {
  const proxyRoute = read('../backend/src/routes/proxy.js');
  assert.match(proxyRoute, /buildApishuVeoOmniPayload/);
  assert.match(proxyRoute, /readLocalMediaRefBuffer/);

  const payload = await proxyModule._testOnly.buildApishuVeoOmniPayload({
    model: 'veo-omni-flash-video-edit',
    prompt: 'replace the subject',
    aspect_ratio: '9:16',
    video_url: '/files/input/up_1782569239002_0u30.mp4',
    images: ['/files/input/up_1782569249004_i6a4.jpg'],
  });

  assert.equal(payload.model, 'veo-omni-flash-video-edit');
  assert.match(payload.video_url, /^data:video\/mp4;base64,/);
  assert.equal(payload.Ingredients_images.length, 1);
  assert.match(payload.Ingredients_images[0], /^data:image\/jpeg;base64,/);
});

test('Apishu video polling treats Chinese success and Video URL fields as completed', () => {
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus('成功'), 'SUCCESS');
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus('失败'), 'FAILURE');
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus('处理中'), 'RUNNING');
  assert.equal(proxyModule._testOnly.extractApishuVideoUrl({
    status: '成功',
    'Video URL': 'https://videos.apishu.example/task.mp4',
  }), 'https://videos.apishu.example/task.mp4');
});

test('Apishu video polling tolerates nested statuses and common output URL shapes', () => {
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus({ data: { task_status: '生成成功' } }), 'SUCCESS');
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus({ status_code: 200, output_video_url: 'https://videos.apishu.example/code.mp4' }), 'SUCCESS');
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus({ code: 0, data: { output: { video_url: 'https://videos.apishu.example/output.mp4' } } }), 'SUCCESS');
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus({ progress: 100, result: { videos: ['https://videos.apishu.example/progress.mp4'] } }), 'SUCCESS');
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus({ data: { state: 'IN_QUEUE' } }), 'PENDING');
  assert.equal(proxyModule._testOnly.normalizeVideoTaskStatus({ data: { status: 'timeout' } }), 'FAILURE');

  assert.equal(proxyModule._testOnly.extractApishuVideoUrl({
    data: { output: { video_url: 'https://videos.apishu.example/output.mp4' } },
  }), 'https://videos.apishu.example/output.mp4');
  assert.equal(proxyModule._testOnly.extractApishuVideoUrl({
    result: { videos: [{ url: 'https://videos.apishu.example/result-object.mp4' }] },
  }), 'https://videos.apishu.example/result-object.mp4');
  assert.equal(proxyModule._testOnly.extractApishuVideoUrl({
    files: [{ file_url: 'https://videos.apishu.example/file.mp4' }],
  }), 'https://videos.apishu.example/file.mp4');
});

test('Apishu Seedance submit exposes protocol metadata for persisted polling recovery', () => {
  const proxyRoute = read('../backend/src/routes/proxy.js');

  assert.match(proxyRoute, /data:\s*\{\s*taskId,\s*protocol:\s*'apishu-v1-videos',\s*effectiveModel,\s*requestedModel/);
  assert.match(proxyRoute, /const looksApishuV1Task = \/\^task_/);
  assert.match(proxyRoute, /\|\| looksApishuV1Task/);
  assert.match(proxyRoute, /SAVE_REMOTE_VIDEO_TIMEOUT_MS/);
  assert.match(proxyRoute, /AbortController/);
});

test('FAL routes use the common zhenzhen key instead of group tokens', () => {
  const proxyRoute = read('../backend/src/routes/proxy.js');
  const imageNode = read('../src/components/nodes/ImageNode.tsx');
  const videoNode = read('../src/components/nodes/VideoNode.tsx');

  assert.match(proxyRoute, /FAL 全部固定使用通用贞贞 API Key/);
  assert.match(proxyRoute, /ensureDefaultZhenzhenKey\(settings, res, '图像 FAL'\)/);
  assert.match(proxyRoute, /ensureDefaultZhenzhenKey\(settings, res, '视频 FAL'\)/);
  assert.doesNotMatch(proxyRoute, /route: 'image\/fal\/submit'[\s\S]*?applyZhenzhenProviderContext/);
  assert.doesNotMatch(proxyRoute, /route: 'video\/fal\/submit'[\s\S]*?applyZhenzhenProviderContext/);
  assert.match(imageNode, /providerKind: isFal \? 'fal' : modelDef\.paramKind/);
  assert.match(videoNode, /providerKind: isFal \? 'fal' : modelDef\.kind/);
});
