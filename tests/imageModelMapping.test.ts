import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const modelProtocolRegistry = require('../shared/modelProtocolRegistry.json');
const proxyModule = require('../backend/src/routes/proxy.js');

import { IMAGE_MODELS, gptImage2ZhenzhenVariantSize, isFalModel, resolveSeedanceVideoOverride, withUpstreamModelOption } from '../src/providers/models.ts';

const imageNodeSource = fs.readFileSync(new URL('../src/components/nodes/ImageNode.tsx', import.meta.url), 'utf8');
const videoNodeSource = fs.readFileSync(new URL('../src/components/nodes/VideoNode.tsx', import.meta.url), 'utf8');
const seedanceNodeSource = fs.readFileSync(new URL('../src/components/nodes/SeedanceNode.tsx', import.meta.url), 'utf8');
const proxySource = fs.readFileSync(new URL('../backend/src/routes/proxy.js', import.meta.url), 'utf8');
const generationServiceSource = fs.readFileSync(new URL('../src/services/generation.ts', import.meta.url), 'utf8');
const apiSettingsSource = fs.readFileSync(new URL('../src/components/ApiSettings.tsx', import.meta.url), 'utf8');
const apiStoreSource = fs.readFileSync(new URL('../src/stores/apiKeys.ts', import.meta.url), 'utf8');
const canvasTypesSource = fs.readFileSync(new URL('../src/types/canvas.ts', import.meta.url), 'utf8');
const settingsRouteSource = fs.readFileSync(new URL('../backend/src/routes/settings.js', import.meta.url), 'utf8');
const apiServiceSource = fs.readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const modelsSource = fs.readFileSync(new URL('../src/providers/models.ts', import.meta.url), 'utf8');

function sourceFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

test('Nano Banana 2 maps to the current Gemini Flash image upstream model', () => {
  const banana2 = IMAGE_MODELS.find((model) => model.id === 'nano-banana-2');

  assert.equal(banana2?.apiModel, 'gemini-3.1-flash-image');
  assert.equal(banana2?.apiModelOptions[0]?.value, 'gemini-3.1-flash-image');
  assert.equal(banana2?.apiModelOptions[0]?.label, 'nano-banana-2 (Flash)');
  assert.equal(banana2?.paramKind, 'banana-ratio');
  assert.equal(banana2?.apiModelOptions.some((option) => option.value === 'nano-banana-2-fal'), true);
});

test('old saved nano-banana-2 apiModel values are not submitted as upstream model ids', () => {
  assert.match(imageNodeSource, /configuredApiModelOptions\.some\(\(opt\) => opt\.value === savedApiModel\)/);
  assert.match(proxySource, /function normalizeImageApiModel\(model\)/);
  assert.match(proxySource, /defaultService\?\.imageAliases/);
  assert.equal(
    proxyModule._testOnly.normalizeImageApiModel('nano-banana-2'),
    modelProtocolRegistry.defaultService.imageAliases['nano-banana-2'],
  );
  assert.equal(
    proxyModule._testOnly.normalizeImageApiModel('gemini-3.1-flash-image-preview'),
    'gemini-3.1-flash-image',
  );
  assert.equal(
    proxyModule._testOnly.normalizeImageApiModel('gemini-3.1-flash-image-previiew'),
    'gemini-3.1-flash-image',
  );
});

test('Gemini image models still use nano-banana key and image_size protocol', () => {
  assert.match(proxySource, /m\.includes\('flash-image'\)/);
  assert.match(proxySource, /m\.includes\('gemini-3-pro-image'\)/);
  assert.match(proxySource, /function isBananaImageModel\(model\)/);
  assert.match(proxySource, /form\.append\('image_size', lvlUpper\)/);
  assert.match(proxySource, /body\.image_size = lvlUpper/);
});

test('G-AISC/New API nano-banana protocols are explicit settings instead of hidden base-url routing', () => {
  const chatCallSource = sourceFunctionBody(proxySource, 'callGaiscOpenAiCompatibleImageAsync');
  const chatEndpointSource = sourceFunctionBody(proxySource, 'gaiscChatCompletionsEndpointUrl');
  const geminiCallSource = sourceFunctionBody(proxySource, 'callGaiscGeminiImageAsync');

  assert.match(proxySource, /function isGaiscBaseUrl\(baseUrl\)/);
  assert.match(proxySource, /function isGeminiImagePreviewModel\(model\)/);
  assert.match(proxySource, /function gaiscChatCompletionsEndpointUrl\(baseUrl\)/);
  assert.match(chatEndpointSource, /return `\$\{apiBase\}\/chat\/completions`/);
  assert.match(chatCallSource, /gaiscChatCompletionsEndpointUrl\(zhenzhenBaseUrl\(settings\)\)/);
  assert.match(chatCallSource, /messages:\s*\[[\s\S]*?role:\s*'user'[\s\S]*?content/);
  assert.match(chatCallSource, /type:\s*'image_url'/);
  assert.match(chatCallSource, /response_format:\s*\{\s*type:\s*'url'/);
  assert.match(proxySource, /function gaiscGeminiEndpointUrl\(baseUrl,\s*model\)/);
  assert.match(proxySource, /function shouldFallbackBananaToGemini\(response,\s*text\)/);
  assert.match(proxySource, /Images API is not supported for this platform/);
  assert.match(proxySource, /return `\$\{apiBase\}\/models\/\$\{encodeURIComponent\(model\)\}:generateContent`/);
  assert.match(geminiCallSource, /const body = \{\s*model:\s*finalApiModel,/);
  assert.match(geminiCallSource, /const body = \{[\s\S]*?contents:\s*\[[\s\S]*?parts/);
  assert.match(geminiCallSource, /generationConfig:\s*\{[\s\S]*?responseModalities:\s*\['IMAGE'\]/);
  assert.match(geminiCallSource, /inlineData:\s*\{/);
  assert.match(geminiCallSource, /fileData:\s*\{/);
  assert.match(proxySource, /function imageModelProtocol\(settings,\s*modelId\)/);
  assert.match(proxySource, /protocol === 'openai-chat'[\s\S]*?callGaiscOpenAiCompatibleImageAsync\(geminiFallbackOptions\)/);
  assert.match(proxySource, /protocol === 'gemini-native'[\s\S]*?callGaiscGeminiImageAsync\(geminiFallbackOptions\)/);
  assert.doesNotMatch(proxySource, /paramKind === 'banana-ratio' && isGaiscBaseUrl\(zhenzhenBaseUrl\(settings\)\)/);
  assert.match(proxySource, /return await retryBananaWithGeminiIfUnsupported/);
  assert.doesNotMatch(proxySource, /sub\.g-aisc\.com['"`]\s*\+\s*['"`]\/v1\/images/);
});

test('Nano Banana Pro keeps friendly short ids while Gemini Pro preview ids normalize separately', () => {
  const bananaPro = IMAGE_MODELS.find((model) => model.id === 'nano-banana-pro');
  const options = bananaPro?.apiModelOptions.map((option) => option.value) || [];

  assert.equal(bananaPro?.apiModel, 'nano-banana-pro');
  assert.ok(options.includes('nano-banana-pro'));
  assert.ok(options.includes('nano-banana-pro-2k'));
  assert.ok(options.includes('nano-banana-pro-4k'));
  assert.ok(options.includes('nano-banana-pro-fal'));
  assert.equal(isFalModel('nano-banana-pro-fal'), true);
  assert.equal(isFalModel('nano-banana-pro'), false);
  assert.equal(
    proxyModule._testOnly.normalizeImageApiModel('nano-banana-pro'),
    'nano-banana-pro',
  );
  assert.equal(
    proxyModule._testOnly.normalizeImageApiModel('gemini-3-pro-image-preview'),
    'gemini-3-pro-image',
  );
  assert.equal(
    proxyModule._testOnly.normalizeImageApiModel('gemini-3-pro-image-2k-preview'),
    'gemini-3-pro-image-2k',
  );
  assert.equal(
    proxyModule._testOnly.normalizeImageApiModel('gemini-3-pro-image-4k-preview'),
    'gemini-3-pro-image-4k',
  );
  assert.equal(
    modelProtocolRegistry.defaultService.imageModelOverrides.some((field: any) => (
      field.id === 'nano-banana-pro' && field.placeholder === 'nano-banana-pro'
    )),
    true,
  );
  assert.match(apiSettingsSource, /MODEL_REGISTRY_DEFAULT_SERVICE\.imageModelOverrides/);
});

test('core image proxy can read Gemini inlineData image responses', () => {
  assert.match(proxySource, /function normalizeInlineImageData\(value,\s*fallbackMime = 'image\/png'\)/);
  assert.match(proxySource, /value\.inlineData \|\| value\.inline_data/);
  assert.match(proxySource, /inline\.mimeType \|\| inline\.mime_type/);
  assert.match(proxySource, /for \(const k of \[[\s\S]*'image_urls'[\s\S]*'imageUrls'[\s\S]*\]\)/);
  assert.match(proxySource, /for \(const k of \[[\s\S]*'media_urls'[\s\S]*'mediaUrls'[\s\S]*'Media URLs'[\s\S]*\]\)/);
  assert.match(proxySource, /for \(const k of \[[\s\S]*'choices'[\s\S]*'message'[\s\S]*'candidates'[\s\S]*'content'[\s\S]*'parts'[\s\S]*\]\)/);
});

test('core image status can extract completed task media URL fields', () => {
  assert.equal(typeof proxyModule._testOnly.normalizeImageItems, 'function');
  const items = proxyModule._testOnly.normalizeImageItems({
    status: 'completed',
    media_urls: ['https://cdn.example.test/a.png'],
    data: {
      mediaUrls: [{ url: 'https://cdn.example.test/b.png' }],
      'Media URLs': ['https://cdn.example.test/c.png'],
    },
  });

  assert.deepEqual(items.map((item: any) => item.url), [
    'https://cdn.example.test/a.png',
    'https://cdn.example.test/b.png',
    'https://cdn.example.test/c.png',
  ]);
  assert.match(proxySource, /media_urls/);
  assert.match(proxySource, /Media URLs/);
});

test('core image async task urls are treated as task ids, not completed image urls', () => {
  assert.equal(typeof proxyModule._testOnly.normalizeImageItems, 'function');
  assert.equal(typeof proxyModule._testOnly.imageTaskId, 'function');

  const taskPathPayload = {
    id: 'task_dB47aOMoz1DNvv4uVa8bQZLwW8UpIV3J',
    data: '/v1/images/tasks/task_dB47aOMoz1DNvv4uVa8bQZLwW8UpIV3J',
  };
  const taskUrlPayload = {
    data: {
      response_url: 'https://newapi.example.test/v1/images/generations/task_abc123XYZ',
    },
  };
  const topLevelTaskUrlPayload = {
    response_url: 'https://newapi.example.test/v1/images/edits/task_topLevel123',
  };

  assert.deepEqual(proxyModule._testOnly.normalizeImageItems(taskPathPayload), []);
  assert.equal(proxyModule._testOnly.imageTaskId(taskPathPayload), 'task_dB47aOMoz1DNvv4uVa8bQZLwW8UpIV3J');
  assert.deepEqual(proxyModule._testOnly.normalizeImageItems(taskUrlPayload), []);
  assert.equal(proxyModule._testOnly.imageTaskId(taskUrlPayload), 'task_abc123XYZ');
  assert.deepEqual(proxyModule._testOnly.normalizeImageItems(topLevelTaskUrlPayload), []);
  assert.equal(proxyModule._testOnly.imageTaskId(topLevelTaskUrlPayload), 'task_topLevel123');
});

test('GPT Image 2 2K and 4K variants are submitted as their concrete upstream models', () => {
  const gpt2 = IMAGE_MODELS.find((model) => model.id === 'gpt-image-2');
  const options = gpt2?.apiModelOptions.map((option) => option.value) || [];

  assert.ok(options.includes('gpt-image-2-2K'));
  assert.ok(options.includes('gpt-image-2-4K'));
  assert.equal(gptImage2ZhenzhenVariantSize('gpt-image-2-2K'), '2K');
  assert.equal(gptImage2ZhenzhenVariantSize('gpt-image-2-4K'), '4K');
  assert.equal(proxyModule._testOnly.normalizeImageApiModel('gpt-image-2-2K'), 'gpt-image-2-2K');
  assert.equal(proxyModule._testOnly.normalizeImageApiModel('gpt-image-2-4K'), 'gpt-image-2-4K');
  assert.equal(isFalModel('gpt-image-2-2K'), false);
  assert.equal(isFalModel('gpt-image-2-4K'), false);
  assert.match(imageNodeSource, /gptImage2ZhenzhenVariantSize\(nextApiModel\)/);
  assert.match(proxySource, /image_size: gptImage2ForcedSize \|\| image_size/);
  assert.match(proxySource, /size: gptImage2ForcedSize \? undefined : size/);
});

test('GPT Image 2 4K variant keeps its model id in Images API payloads', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ task_id: 'task-gpt-4k' }),
    } as any;
  }) as any;

  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: {},
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2-4K',
      finalApiModel: proxyModule._testOnly.normalizeImageApiModel('gpt-image-2-4K'),
      paramKind: 'gpt-size',
      prompt: 'keep this character unchanged',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '4K',
      refs: ['data:image/png;base64,UkVG'],
      quality: 'auto',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/edits?async=true');
  assert.equal(calls[0].init.body.get('model'), 'gpt-image-2-4K');
  assert.equal(calls[0].init.body.get('image_size'), '4K');
  assert.equal(calls[0].init.body.get('resolution'), '4k');
});

test('core image async submit sends explicit async flags in upstream payloads', async () => {
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ task_id: 'task-async-flags' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test',
        zhenzhenImageModelProtocols: { 'gpt-image-2': 'images-generations' },
      },
      apiKey: 'KEY',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'async text',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '2K',
      refs: [],
      quality: 'auto',
      forceAsync: true,
    });

    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test',
        zhenzhenImageModelProtocols: { 'gpt-image-2': 'images-edits' },
      },
      apiKey: 'KEY',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'async edit',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '2K',
      refs: ['data:image/png;base64,UkVG'],
      quality: 'auto',
      forceAsync: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/generations?async=true');
  const jsonBody = JSON.parse(calls[0].init.body);
  assert.equal(jsonBody.async, true);
  assert.equal(jsonBody.sync_mode, false);
  assert.equal(calls[1].url, 'https://api.example.test/v1/images/edits?async=true');
  assert.equal(calls[1].init.body.get('async'), 'true');
  assert.equal(calls[1].init.body.get('sync_mode'), 'false');
});

test('core image proxy preserves multi-image async poll results', () => {
  assert.match(proxySource, /const urls = await pollImageTask\(settings,\s*norm\.taskId,\s*settings\.zhenzhenApiKey/);
  assert.match(proxySource, /data: \{ urls, raw: data, taskId: norm\.taskId/);
  assert.match(proxySource, /async function pollImageTask/);
  assert.doesNotMatch(proxySource, /return urls\[0\] \|\| null/);
});

test('core image node can switch between async submit and sync image routes', () => {
  assert.match(imageNodeSource, /generateImage,/);
  assert.match(imageNodeSource, /const coreSubmitMode: 'async' \| 'sync'/);
  assert.match(imageNodeSource, /imageSubmitMode/);
  assert.match(imageNodeSource, /coreSubmitMode === 'sync'[\s\S]*?await generateImage\(coreImageRequest\)/);
  assert.match(imageNodeSource, /const submit = await submitImageAsync\(coreImageRequest\)/);
  assert.match(imageNodeSource, /提交方式/);
  assert.match(imageNodeSource, /<option value="async">异步<\/option>/);
  assert.match(imageNodeSource, /<option value="sync">同步<\/option>/);
});

test('core image count submits one upstream request per requested image', () => {
  assert.match(imageNodeSource, /Array\.from\(\{ length: coreImageCount \}/);
  assert.match(imageNodeSource, /const buildCoreImageRequest = \(\) => \(\{[\s\S]*?n: 1,/);
  assert.match(imageNodeSource, /allCoreImageUrls\.push\(\.\.\.nextUrls\)/);
  assert.match(imageNodeSource, /appendCoreImageUrls\(syncResult\.urls\)/);
  assert.match(imageNodeSource, /appendCoreImageUrls\(q\.urls \|\| \[\]\)/);
  assert.doesNotMatch(imageNodeSource, /n: coreImageCount,/);
});

test('core image async count submits every task before polling', () => {
  const submitIndex = imageNodeSource.indexOf('const coreAsyncSubmissions = await Promise.allSettled');
  const pollIndex = imageNodeSource.indexOf('queryImageStatus(task.taskId');
  assert.ok(submitIndex >= 0, 'missing batched async submission');
  assert.ok(pollIndex > submitIndex, 'polling should happen after batched submission');
  const submitBeforePoll = imageNodeSource.slice(submitIndex, pollIndex);
  assert.match(submitBeforePoll, /Array\.from\(\{ length: coreImageCount \}/);
  assert.match(submitBeforePoll, /await submitImageAsync\(coreImageRequest\)/);
  assert.doesNotMatch(submitBeforePoll, /await queryImageStatus/);
});

test('core image sync count submits every request together', () => {
  const syncStart = imageNodeSource.indexOf("if (coreSubmitMode === 'sync')");
  const asyncStart = imageNodeSource.indexOf('const coreAsyncSubmissions = await Promise.allSettled');
  assert.ok(syncStart >= 0, 'missing sync branch');
  assert.ok(asyncStart > syncStart, 'missing async branch after sync branch');
  const syncBranch = imageNodeSource.slice(syncStart, asyncStart);
  assert.match(syncBranch, /const coreSyncResults = await Promise\.allSettled\(Array\.from\(\{ length: coreImageCount \}/);
  assert.match(syncBranch, /await generateImage\(coreImageRequest\)/);
  assert.doesNotMatch(syncBranch, /for \(let requestIndex = 0; requestIndex < coreImageCount; requestIndex \+= 1\)[\s\S]*await generateImage/);
});

test('core image batch keeps successful images when some requests fail', () => {
  assert.match(imageNodeSource, /const allCoreFailures: string\[\] = \[\]/);
  assert.match(imageNodeSource, /coreSyncResults\.forEach\(\(result, requestIndex\) =>/);
  assert.match(imageNodeSource, /coreAsyncSubmissions\.forEach\(\(result, requestIndex\) =>/);
  assert.match(imageNodeSource, /const polledCoreSettled = await Promise\.allSettled/);
  assert.match(imageNodeSource, /if \(!allCoreImageUrls\.length\) throw new Error\(allCoreFailures\.join\('; '\) \|\| '生成完成但未返回图片'\)/);
  assert.match(imageNodeSource, /if \(allCoreFailures\.length\) \{\s*logBus\.warn/);
  assert.match(imageNodeSource, /error: null,/);
});

test('core image batch appends each successful result immediately', () => {
  assert.match(imageNodeSource, /const appendCoreImageUrls = \(urls: string\[\]\) =>/);
  assert.match(imageNodeSource, /imageUrls: \[\.\.\.allCoreImageUrls\]/);
  assert.match(imageNodeSource, /appendCoreImageUrls\(syncResult\.urls\)/);
  assert.match(imageNodeSource, /appendCoreImageUrls\(submit\.urls\)/);
  assert.match(imageNodeSource, /appendCoreImageUrls\(q\.urls \|\| \[\]\)/);
  assert.doesNotMatch(imageNodeSource, /for \(const item of fulfilledSyncResults/);
  assert.doesNotMatch(imageNodeSource, /for \(const item of completedSubmissions/);
  assert.doesNotMatch(imageNodeSource, /for \(const item of polledCoreResults/);
});

test('image upstream helper receives route settings at every call site', () => {
  assert.match(proxySource, /async function callImageUpstreamAsync\(\{\s*settings,/);

  const callSites = [...proxySource.matchAll(/const r = await callImageUpstreamAsync\(\{[\s\S]*?\n\s*\}\);/g)];
  assert.equal(callSites.length, 3);
  for (const callSite of callSites) {
    assert.match(callSite[0], /{\s*settings,/);
  }
});

test('default image protocol inputs preserve explicit Images API selections', () => {
  const normalizeSource = sourceFunctionBody(apiSettingsSource, 'normalizeImageModelProtocolInputs');

  assert.match(normalizeSource, /allowed\.has\(value as ImageModelProtocol\)/);
  assert.doesNotMatch(normalizeSource, /value !== 'images'/);
});

test('explicit Images API protocol submits GPT-size text-to-image through generations JSON', async () => {
  assert.equal(typeof proxyModule._testOnly.callImageUpstreamAsync, 'function');

  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ url: 'https://cdn.example.test/out.png' }] }),
    } as any;
  }) as any;

  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: { 'gpt-image-2': 'images' },
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'a small red boat',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '4K',
      refs: [],
      quality: 'auto',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/generations');
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.headers['Content-Type'], /application\/json/);
  assert.doesNotMatch(calls[0].url, /edits\?async=true/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.prompt, 'a small red boat');
  assert.equal(body.size, '2880x2880');
  assert.equal(body.resolution, '4k');
  assert.equal(body.image_size, '4K');
  assert.equal(body.n, 1);
  assert.equal(body.quality, 'auto');
});

test('default Images API protocol submits GPT-size text-to-image through generations JSON without saved settings', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ url: 'https://cdn.example.test/out.png' }] }),
    } as any;
  }) as any;

  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: {},
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'a small red boat',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '4K',
      refs: [],
      quality: 'auto',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/generations');
  assert.doesNotMatch(calls[0].url, /edits\?async=true/);
  assert.equal(JSON.parse(calls[0].init.body).size, '2880x2880');
  assert.equal(JSON.parse(calls[0].init.body).resolution, '4k');
  assert.equal(JSON.parse(calls[0].init.body).image_size, '4K');
});

test('default Images API protocol submits GPT-size image references through async edits with level aliases', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ url: 'https://cdn.example.test/out.png' }] }),
    } as any;
  }) as any;

  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: {},
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'add a person into this room',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '4K',
      refs: ['data:image/png;base64,UkVG'],
      quality: 'auto',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/edits?async=true');
  assert.equal(calls[0].init.body.get('model'), 'gpt-image-2');
  assert.equal(calls[0].init.body.get('prompt'), 'add a person into this room');
  assert.equal(calls[0].init.body.get('size'), '2880x2880');
  assert.equal(calls[0].init.body.get('resolution'), '4k');
  assert.equal(calls[0].init.body.get('image_size'), '4K');
});

test('forced generations endpoint submits GPT-size image references through generations JSON', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ task_id: 'task_generations_refs' }),
    } as any;
  }) as any;

  try {
    const response: any = await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: { 'gpt-image-2': 'images-generations' },
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'keep character and change outfit',
      n: 1,
      aspect_ratio: '16:9',
      image_size: '4K',
      refs: ['data:image/png;base64,UkVG'],
      quality: 'high',
    });
    assert.equal(response.__t8ImageStatusKind, 'generations');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/generations');
  assert.match(calls[0].init.headers['Content-Type'], /application\/json/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.prompt, 'keep character and change outfit');
  assert.equal(body.size, '3840x2160');
  assert.equal(body.resolution, '4k');
  assert.equal(body.image_size, '4K');
  assert.equal(body.quality, 'high');
  assert.equal(body.images[0], 'data:image/png;base64,UkVG');
  assert.equal(body.image, 'data:image/png;base64,UkVG');
  assert.doesNotMatch(calls[0].url, /edits\?async=true/);
});

test('auto endpoint retries GPT-size reference edits through generations on channel routing errors', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const rejected = calls.length === 1;
    return {
      ok: !rejected,
      status: rejected ? 400 : 200,
      text: async () => rejected
        ? JSON.stringify({ error: { message: 'No available channel for model gpt-image-2-4K under group vip. model is not priced for /v1/images/edits' } })
        : JSON.stringify({ task_id: 'task_generations_after_edits' }),
    } as any;
  }) as any;

  try {
    const response: any = await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: {},
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2-4K',
      paramKind: 'gpt-size',
      prompt: 'keep character and change outfit',
      n: 1,
      aspect_ratio: '16:9',
      image_size: '4K',
      refs: ['data:image/png;base64,UkVG'],
      quality: 'high',
    });
    assert.equal(response.__t8ImageStatusKind, 'generations');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/edits?async=true');
  assert.equal(calls[1].url, 'https://api.example.test/v1/images/generations');
  assert.equal(JSON.parse(calls[1].init.body).images[0], 'data:image/png;base64,UkVG');
});

test('GPT-size Images API retries with OpenAI allowed dimensions when upstream rejects source size', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const rejected = calls.length === 1;
    return {
      ok: !rejected,
      status: rejected ? 400 : 200,
      text: async () => rejected
        ? JSON.stringify({ error: { message: 'Image size "2880x2880" is not supported. Allowed sizes: 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152, 3840x2160, 2160x3840, auto.' } })
        : JSON.stringify({ data: [{ url: 'https://cdn.example.test/out.png' }] }),
    } as any;
  }) as any;

  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: {},
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'a small red boat',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '4K',
      refs: [],
      quality: 'auto',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].init.body).size, '2880x2880');
  assert.equal(JSON.parse(calls[1].init.body).size, '2048x2048');
});

test('GPT-size async edits retry with OpenAI allowed dimensions when upstream rejects source size', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const rejected = calls.length === 1;
    return {
      ok: !rejected,
      status: rejected ? 400 : 200,
      text: async () => rejected
        ? JSON.stringify({ message: 'Failed running ChatGPT Images 2.0 Edit: Image size "2880x2880" is not supported for 图像模型. Allowed sizes: 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152, 3840x2160, 2160x3840, auto.' })
        : JSON.stringify({ task_id: 'task_retry_ok' }),
    } as any;
  }) as any;

  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: {},
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'add a person into this room',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '4K',
      refs: ['data:image/png;base64,UkVG'],
      quality: 'auto',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body.get('size'), '2880x2880');
  assert.equal(calls[1].init.body.get('size'), '2048x2048');
  assert.equal(calls[1].init.body.get('resolution'), '4k');
  assert.equal(calls[1].init.body.get('image_size'), '4K');
});

test('GPT-size async status size failure resubmits edits with OpenAI allowed dimensions', async () => {
  assert.equal(typeof proxyModule._testOnly.retryImageTaskAfterAsyncFailure, 'function');
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ task_id: 'task_retry_after_status' }),
    } as any;
  }) as any;

  try {
    const result = await proxyModule._testOnly.retryImageTaskAfterAsyncFailure({
      settings: { zhenzhenBaseUrl: 'https://api.example.test/v1' },
      apiKey: 'test-token',
      oldTaskId: 'task_failed',
      meta: {
        apiKey: 'test-token',
        imageStatusKind: 'edits',
        imageRetry: {
          originalApiModel: 'gpt-image-2',
          finalApiModel: 'gpt-image-2',
          paramKind: 'gpt-size',
          prompt: 'add a person into this room',
          n: 1,
          aspect_ratio: '1:1',
          image_size: '4K',
          refs: ['data:image/png;base64,UkVG'],
          quality: 'auto',
        },
      },
      errorText: 'Failed running ChatGPT Images 2.0 Edit: Image size "2880x2880" is not supported for 图像模型. Allowed sizes: 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152, 3840x2160, 2160x3840, auto.',
    });

    assert.equal(result?.kind, 'async');
    assert.equal(result?.taskId, 'task_retry_after_status');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/edits?async=true');
  assert.equal(calls[0].init.body.get('size'), '2048x2048');
  assert.equal(calls[0].init.body.get('resolution'), '4k');
  assert.equal(calls[0].init.body.get('image_size'), '4K');
});

test('image status route includes New API async edit task fallback endpoint', () => {
  assert.match(proxySource, /function imageStatusUrlCandidates\(settings,\s*taskId,\s*preferredKind/);
  assert.match(proxySource, /\/images\/\$\{kind\}\/\$\{encodeURIComponent\(tid\)\}/);
  assert.match(proxySource, /imageStatusKind:\s*r\.__t8ImageStatusKind \|\| \(hasRefs && paramKind === 'gpt-size' \? 'edits'/);
});

test('image async submit forces upstream async mode for text-to-image requests', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ task_id: 'task_force_async_text' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;

  try {
    await proxyModule._testOnly.callImageUpstreamAsync({
      settings: {
        zhenzhenBaseUrl: 'https://api.example.test/v1',
        zhenzhenImageModelProtocols: {},
      },
      apiKey: 'test-token',
      originalApiModel: 'gpt-image-2',
      finalApiModel: 'gpt-image-2',
      paramKind: 'gpt-size',
      prompt: 'a long running scene',
      n: 1,
      aspect_ratio: '1:1',
      image_size: '4K',
      refs: [],
      quality: 'auto',
      forceAsync: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/images/generations?async=true');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.async, true);
  assert.equal(body.sync_mode, false);
});

test('image status query treats upstream 524 as pending instead of final failure', async () => {
  assert.equal(typeof proxyModule._testOnly.isTransientImageTaskHttpStatus, 'function');
  assert.equal(proxyModule._testOnly.isTransientImageTaskHttpStatus(524), true);
  assert.equal(proxyModule._testOnly.isTransientImageTaskHttpStatus(404), false);

  const statusRoute = proxySource.slice(
    proxySource.indexOf("router.get('/image/status/:tid'"),
    proxySource.indexOf('// ========== 图像异步任务轮询', proxySource.indexOf("router.get('/image/status/:tid'")),
  );

  assert.match(statusRoute, /isTransientImageTaskHttpStatus\(r\.status\)/);
  assert.match(statusRoute, /status:\s*'pending'/);
});

test('image edit task status polls task endpoint before edit endpoint', () => {
  assert.equal(typeof proxyModule._testOnly.imageStatusUrlCandidates, 'function');
  const candidates = proxyModule._testOnly.imageStatusUrlCandidates(
    { zhenzhenBaseUrl: 'https://api.example.test/v1' },
    'task_edit_status',
    'edits',
  );

  assert.equal(candidates[0].kind, 'tasks');
  assert.equal(candidates[0].url, 'https://api.example.test/v1/images/tasks/task_edit_status');
  assert.ok(candidates.some((candidate: any) => candidate.kind === 'edits'));
});

test('image submit route defines hasRefs before storing async image task metadata', () => {
  const submitRouteStart = proxySource.indexOf("router.post('/image/submit'");
  const submitRouteEnd = proxySource.indexOf('// 查询异步图像任务状态', submitRouteStart);
  assert.notEqual(submitRouteStart, -1);
  assert.notEqual(submitRouteEnd, -1);
  const submitRoute = proxySource.slice(submitRouteStart, submitRouteEnd);

  assert.match(submitRoute, /const refs = Array\.isArray\(images\) \? images\.filter\(Boolean\) : \[\]/);
  assert.match(submitRoute, /const hasRefs = refs\.length > 0/);
  assert.match(submitRoute, /rememberTaskKey\(norm\.taskId[\s\S]*?imageStatusKind:\s*r\.__t8ImageStatusKind \|\| \(hasRefs && paramKind === 'gpt-size' \? 'edits'/);
});

test('sync image route defines hasRefs before polling async image tasks', () => {
  const imageRouteStart = proxySource.indexOf("router.post('/image'");
  const imageRouteEnd = proxySource.indexOf("router.post('/image/submit'", imageRouteStart);
  assert.notEqual(imageRouteStart, -1);
  assert.notEqual(imageRouteEnd, -1);
  const imageRoute = proxySource.slice(imageRouteStart, imageRouteEnd);

  assert.match(imageRoute, /const refs = Array\.isArray\(images\) \? images\.filter\(Boolean\) : \[\]/);
  assert.match(imageRoute, /const hasRefs = refs\.length > 0/);
  assert.match(imageRoute, /const imageStatusKind = r\.__t8ImageStatusKind \|\| \(hasRefs && paramKind === 'gpt-size' \? 'edits' : ''\)/);
});

test('core image proxy treats schemeless CDN image URLs as remote URLs', () => {
  assert.match(proxySource, /function normalizeRemoteMediaUrl\(url\)/);
  assert.match(proxySource, /return `https:\/\/\$\{text\}`;/);
  assert.match(proxySource, /const fetchUrl = normalizeRemoteMediaUrl\(url\);/);
  assert.match(proxySource, /setTimeout\(\(\) => controller\.abort\(\), 15000\)/);
  assert.match(proxySource, /isRemoteMediaUrl\(item\) \? \{ url: normalizeRemoteMediaUrl\(item\) \}/);
});

test('image generation service parses empty or non-json responses safely', () => {
  assert.match(generationServiceSource, /返回空响应：HTTP \$\{response\.status\}/);
  for (const label of [
    '核心图像生成',
    '扩展图像生成',
    '图像异步提交',
    '图像任务轮询',
    'FAL 图像提交',
    'FAL 图像轮询',
  ]) {
    assert.match(generationServiceSource, new RegExp(`safeJsonResponse\\(r, '${label}'\\)`));
  }
});

test('default image channel lets users override built-in upstream image model ids', () => {
  assert.match(canvasTypesSource, /zhenzhenImageModelOverrides\?:\s*Record<string,\s*string>/);
  assert.match(canvasTypesSource, /zhenzhenImageModelProtocols\?:\s*Record<string,\s*'images' \| 'images-generations' \| 'images-edits' \| 'openai-chat' \| 'gemini-native'>/);
  assert.match(apiStoreSource, /zhenzhenImageModelOverrides:\s*\{\}/);
  assert.match(apiStoreSource, /zhenzhenImageModelProtocols:\s*\{\}/);
  assert.match(settingsRouteSource, /zhenzhenImageModelOverrides:\s*\{\}/);
  assert.match(settingsRouteSource, /zhenzhenImageModelProtocols:\s*\{\}/);
  assert.match(settingsRouteSource, /normalizeImageModelOverrides\(settings\.zhenzhenImageModelOverrides\)/);
  assert.match(settingsRouteSource, /normalizeImageModelProtocols\(settings\.zhenzhenImageModelProtocols\)/);
  assert.match(settingsRouteSource, /router\.post\('\/zhenzhen-models'/);
  assert.match(apiServiceSource, /fetchZhenzhenModels/);
  assert.match(apiSettingsSource, /modelOverridesOpen/);
  assert.match(apiSettingsSource, /默认服务图像模型覆盖/);
  assert.match(apiSettingsSource, /aria-label="打开默认服务图像模型覆盖"/);
  assert.match(apiSettingsSource, /使用当前通用服务 Base URL 和 API Key 拉取模型列表/);
  assert.match(apiSettingsSource, /拉取模型/);
  assert.match(apiSettingsSource, /<select/);
  assert.match(apiSettingsSource, /zhenzhenImageModelProtocolsInput/);
  assert.match(apiSettingsSource, /IMAGE_MODEL_PROTOCOL_OPTIONS/);
  assert.equal(
    modelProtocolRegistry.defaultService.imageProtocolOptions.some((option: any) => option.label === 'OpenAI Chat'),
    true,
  );
  assert.equal(
    modelProtocolRegistry.defaultService.imageProtocolOptions.some((option: any) => option.label === 'Gemini Native'),
    true,
  );
  assert.match(apiSettingsSource, /MODEL_REGISTRY_DEFAULT_SERVICE\.imageProtocolOptions/);
  assert.match(apiSettingsSource, /grid-cols-\[minmax\(0,140px\)_minmax\(0,1fr\)_minmax\(0,150px\)\]/);
  assert.match(apiSettingsSource, /sticky bottom-0/);
  assert.match(apiSettingsSource, /suggestImageModelOverride/);
  assert.match(apiSettingsSource, /modelMatchesOverrideField/);
  assert.match(apiSettingsSource, /looksLikeFetchedModelDisplayName/);
  assert.match(apiSettingsSource, /reconcileFetchedModelOverride/);
  assert.doesNotMatch(apiSettingsSource, /normalized\.length === 1/);
  assert.match(apiSettingsSource, /IMAGE_MODEL_OVERRIDE_FIELDS\.map/);
  assert.match(imageNodeSource, /const configuredApiModelOverride = String\(apiSettings\.zhenzhenImageModelOverrides\?\.\[modelDef\.id\] \|\| ''\)\.trim\(\)/);
  assert.match(imageNodeSource, /const effectiveApiModel = apiModel/);
  assert.match(imageNodeSource, /apiModel: effectiveApiModel/);
  assert.match(imageNodeSource, /queryImageStatus\(task\.taskId,\s*effectiveApiModel\)/);
});

test('default service model override panel separates image and video model mappings', () => {
  assert.match(canvasTypesSource, /zhenzhenVideoModelOverrides\?:\s*Record<string,\s*string>/);
  assert.match(apiStoreSource, /zhenzhenVideoModelOverrides:\s*\{\}/);
  assert.match(settingsRouteSource, /zhenzhenVideoModelOverrides:\s*\{\}/);
  assert.match(settingsRouteSource, /normalizeModelOverrides\(settings\.zhenzhenVideoModelOverrides\)/);
  assert.match(apiSettingsSource, /modelOverrideTab/);
  assert.match(apiSettingsSource, /默认服务模型覆盖/);
  assert.match(apiSettingsSource, /图片模型/);
  assert.match(apiSettingsSource, /视频模型/);
  assert.match(apiSettingsSource, /VIDEO_MODEL_OVERRIDE_FIELDS/);
  assert.match(apiSettingsSource, /zhenzhenVideoModelOverridesInput/);
  assert.match(apiSettingsSource, /setModelOverrideTab\('image'\)/);
  assert.match(apiSettingsSource, /setModelOverrideTab\('video'\)/);
  assert.match(apiSettingsSource, /aria-label="打开默认服务模型覆盖"/);
});

test('video nodes and proxy apply default service video model overrides without losing protocol routing', () => {
  assert.match(videoNodeSource, /const configuredApiModelOverride = String\(apiSettings\.zhenzhenVideoModelOverrides\?\.\[modelDef\.id\] \|\| ''\)\.trim\(\)/);
  assert.match(videoNodeSource, /const effectiveApiModel = apiModel/);
  assert.match(videoNodeSource, /model:\s*effectiveApiModel/);
  assert.match(videoNodeSource, /queryVideo\(tid,\s*pollingApiModel\)/);
  assert.match(seedanceNodeSource, /resolveSeedanceVideoOverride/);
  assert.match(seedanceNodeSource, /const configuredModels = parseModelList\(configuredModelOverride\)/);
  assert.match(seedanceNodeSource, /const effectiveModel = model/);
  assert.match(seedanceNodeSource, /model:\s*effectiveModel/);
  assert.match(seedanceNodeSource, /querySeedance\(tid,\s*pollingModel\)/);
  assert.match(proxySource, /function resolveVideoModelOverride\(settings,\s*model\)/);
  assert.match(proxySource, /const requestedModel = String\(model \|\| ''\)\.trim\(\)/);
  assert.match(proxySource, /const effectiveModel = resolveVideoModelOverride\(settings,\s*requestedModel\)/);
  assert.match(proxySource, /const protocolModel = requestedModel \|\| effectiveModel/);
  assert.match(proxySource, /isApishuSeedanceVideoModel\(effectiveModel\)/);
});

test('seedance video overrides use selected and default model fallbacks without leaking settings globals', () => {
  assert.equal(resolveSeedanceVideoOverride({
    'doubao-seedance-2-0-fast-260128': 'video-standard-720p-fast',
  }, 'doubao-seedance-2-0-fast-260128'), 'video-standard-720p-fast');
  assert.equal(resolveSeedanceVideoOverride({
    'doubao-seedance-2-0-fast-260128': 'video-standard-720p-fast',
  }, 'doubao-seedance-2-0-260128'), '');
  assert.equal(resolveSeedanceVideoOverride({
    'doubao-seedance-2-0-fast-260128': 'video-standard-720p-fast',
  }, 'seedance-2-0-fast'), 'video-standard-720p-fast');

  assert.match(modelsSource, /export function resolveSeedanceVideoOverride/);
  assert.match(seedanceNodeSource, /resolveSeedanceVideoOverride\(apiSettings\.zhenzhenVideoModelOverrides,\s*savedModel\)/);
  assert.match(proxySource, /function resolveSeedanceVideoModelOverride/);
  assert.match(proxySource, /resolveSeedanceVideoModelOverride\(settings,\s*requestedModel\)/);
  assert.match(proxySource, /async function uploadRefToZhenzhen\(settings,\s*ref,\s*apiKey/);
  assert.doesNotMatch(proxySource, /async function uploadRefToZhenzhen\(ref,\s*apiKey/);
});

test('default service override upstream models are shown in node model selectors', () => {
  assert.match(modelsSource, /export function parseModelList/);
  assert.match(modelsSource, /export function withUpstreamModelOption/);
  assert.match(imageNodeSource, /withUpstreamModelOption\(modelDef\.apiModelOptions,\s*configuredApiModelOverride\)/);
  assert.match(videoNodeSource, /withUpstreamModelOption\(modelDef\.apiModelOptions,\s*configuredApiModelOverride\)/);
  assert.match(seedanceNodeSource, /withUpstreamModelOption\(MODEL_OPTIONS,\s*configuredModelOverride\)/);
  assert.match(imageNodeSource, /value=\{defaultProviderApiModel\}/);
  assert.match(videoNodeSource, /value=\{defaultProviderApiModel\}/);
  assert.match(seedanceNodeSource, /value=\{defaultProviderModel\}/);
});

test('default service image overrides can expose multiple upstream model choices', () => {
  const modelsSource = fs.readFileSync(new URL('../src/providers/models.ts', import.meta.url), 'utf8');
  const options = withUpstreamModelOption(
    [
      { value: 'gpt-image-2', label: 'gpt-image-2' },
      { value: 'gpt-image-2-4K', label: 'gpt-image-2-4K' },
    ],
    'gpt-image-2-4K\ngpt-image-2-2K, gpt-image-2-4K',
  );

  assert.deepEqual(
    options.map((option) => option.value),
    ['gpt-image-2-2K', 'gpt-image-2', 'gpt-image-2-4K'],
  );
  assert.match(modelsSource, /function parseModelList\(value: unknown\): string\[\]/);
  assert.match(apiSettingsSource, /parseModelList/);
  assert.match(apiSettingsSource, /stringifyModelList/);
  assert.match(apiSettingsSource, /type="checkbox"/);
  assert.match(apiSettingsSource, /selectedModels\.includes\(model\)/);
  assert.match(apiSettingsSource, /stringifyModelList\(next\)/);
  assert.doesNotMatch(apiSettingsSource, /selectedOptions/);
  assert.match(imageNodeSource, /const configuredApiModelOptions = withUpstreamModelOption\(modelDef\.apiModelOptions,\s*configuredApiModelOverride\)/);
  assert.match(imageNodeSource, /const effectiveApiModel = apiModel/);
  assert.doesNotMatch(imageNodeSource, /const effectiveApiModel = configuredApiModelOverride \|\| apiModel/);
});

test('default service video overrides use the same multi-select surface as image overrides', () => {
  assert.match(apiSettingsSource, /const selectedVideoModels = parseModelList/);
  assert.match(apiSettingsSource, /setZhenzhenVideoModelOverridesInput\(\(prev\) => \(\{ \.\.\.prev, \[field\.id\]: stringifyModelList\(next\) \}\)\)/);
  assert.match(apiSettingsSource, /selectedVideoModels\.includes\(model\)/);
  assert.doesNotMatch(apiSettingsSource, /<select\s+[^>]*value=\{zhenzhenVideoModelOverridesInput\[field\.id\] \|\| ''\}/);
  assert.match(proxySource, /function firstConfiguredVideoModel\(value\)/);
  assert.match(proxySource, /\.split\(\/\[\\r\\n,，;；\]\+\/\)/);
  assert.match(proxySource, /return firstConfiguredVideoModel\(raw\) \|\| String\(model \|\| ''\)\.trim\(\)/);
});
