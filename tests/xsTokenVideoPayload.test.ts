import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const proxy = require('../backend/src/routes/proxy.js');

test('Videos API Sora payload uses real model id and video_config', async () => {
  const payload = await proxy._testOnly.buildVideosApiPayload({
    model: 'sora-v3-pro',
    prompt: 'camera pan',
    duration: 5,
    ratio: '16:9',
    resolution: '720p',
    refImages: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
    videos: ['https://cdn.example.com/ref.mp4'],
  });

  assert.equal(payload.model, 'sora-v3-pro');
  assert.equal(payload.duration, 5);
  assert.deepEqual(payload.video_config, {
    aspect_ratio: '16:9',
    resolution_name: '720p',
    reference_mode: 'start_end',
  });
  assert.deepEqual(payload.reference_image_urls, ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png']);
  assert.equal(payload.reference_video, 'https://cdn.example.com/ref.mp4');
  assert.equal(payload.resolution, undefined);
});

test('Videos API Seedance payload uses real model id, mode, and media arrays', async () => {
  const payload = await proxy._testOnly.buildVideosApiPayload({
    model: 'seedance-fast-2.0',
    prompt: 'turn around',
    duration: 6,
    ratio: '9:16',
    resolution: '1080p',
    firstFrame: 'https://cdn.example.com/start.png',
    lastFrame: 'https://cdn.example.com/end.png',
    audios: ['https://cdn.example.com/voice.mp3'],
    generate_audio: false,
  });

  assert.equal(payload.model, 'seedance-fast-2.0');
  assert.equal(payload.mode, 'multi_ref');
  assert.equal(payload.duration, 6);
  assert.equal(payload.ratio, '9:16');
  assert.equal(payload.resolution, '1080p');
  assert.deepEqual(payload.image_urls, ['https://cdn.example.com/start.png', 'https://cdn.example.com/end.png']);
  assert.deepEqual(payload.audio_urls, ['https://cdn.example.com/voice.mp3']);
  assert.equal(payload.generate_audio, false);
});

test('Videos API local references use New API presign public URLs instead of gallery uploads', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url: any) => {
    const target = String(url);
    calls.push(target);
    assert.doesNotMatch(target, /\/images\/upload|\/v1\/files/);
    if (target.endsWith('/files/input/local-ref.png')) {
      return new Response(Buffer.from('PNGDATA'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    if (target.endsWith('/v1/media/uploads/presign')) {
      return Response.json({
        upload_url: 'https://upload.example.com/local-ref-put',
        public_url: 'https://cdn.example.com/local-ref.png',
      });
    }
    if (target === 'https://upload.example.com/local-ref-put') {
      return new Response('', { status: 200 });
    }
    throw new Error(`unexpected fetch ${target}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const payload = await proxy._testOnly.buildVideosApiPayload({
    settings: { zhenzhenBaseUrl: 'https://api-direct.skylee9.cloudns.ch' },
    apiKey: 'sk-test',
    model: 'seedance-2.0-480p',
    prompt: 'slow push in',
    duration: 5,
    ratio: '21:9',
    resolution: '720p',
    firstFrame: '/files/input/local-ref.png',
  });

  assert.equal(payload.model, 'seedance-2.0-480p');
  assert.equal(payload.mode, 'image_to_video');
  assert.deepEqual(payload.image_urls, ['https://cdn.example.com/local-ref.png']);
  assert.ok(calls.some((item) => item.endsWith('/v1/media/uploads/presign')));
});

test('Videos API structured refImages objects are sent in JSON without gallery uploads', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any) => {
    const target = String(url);
    assert.doesNotMatch(target, /\/images\/upload|\/v1\/files/);
    if (target.endsWith('/files/input/voice.mp3')) {
      return new Response(Buffer.from('MP3DATA'), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }
    if (target.endsWith('/v1/media/uploads/presign')) {
      return Response.json({
        upload_url: 'https://upload.example.com/voice-put',
        public_url: 'https://cdn.example.com/voice.mp3',
      });
    }
    if (target === 'https://upload.example.com/voice-put') {
      return new Response('', { status: 200 });
    }
    throw new Error(`unexpected fetch ${target}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const payload = await proxy._testOnly.buildVideosApiPayload({
    settings: { zhenzhenBaseUrl: 'https://api-direct.skylee9.cloudns.ch' },
    apiKey: 'sk-test',
    model: 'seedance-fast-2.0',
    prompt: 'speak naturally',
    refImages: [
      { url: 'https://cdn.example.com/person.jpg', name: '角色A', type: 'image' },
      { url: '/files/input/voice.mp3', name: '角色A', type: 'audio' },
    ],
  });

  assert.equal(payload.model, 'seedance-fast-2.0');
  assert.equal(payload.mode, 'multi_ref');
  assert.deepEqual(payload.refImages[0], {
    url: 'https://cdn.example.com/person.jpg',
    name: '角色A',
    type: 'image',
  });
  assert.equal(payload.refImages[1].name, '角色A');
  assert.equal(payload.refImages[1].type, 'audio');
  assert.equal(payload.refImages[1].url, 'https://cdn.example.com/voice.mp3');
  assert.equal(payload.image_urls, undefined);
});

test('Videos API payload preserves arbitrary model ids from settings', async () => {
  const soraPayload = await proxy._testOnly.buildVideosApiPayload({
    model: 'sora-custom-from-settings',
    prompt: 'wide establishing shot',
    ratio: '9:16',
    resolution: '1080p',
  });
  assert.equal(soraPayload.model, 'sora-custom-from-settings');
  assert.deepEqual(soraPayload.video_config, {
    aspect_ratio: '9:16',
    resolution_name: '1080p',
  });

  const seedancePayload = await proxy._testOnly.buildVideosApiPayload({
    model: 'seedance-custom-from-settings',
    prompt: 'walk cycle',
    ratio: '1:1',
    resolution: '720p',
  });
  assert.equal(seedancePayload.model, 'seedance-custom-from-settings');
  assert.equal(seedancePayload.mode, 'text_to_video');
  assert.equal(seedancePayload.ratio, '1:1');
});

test('Images API JSON reference fields can use New API presign public URLs', async (t) => {
  const originalFetch = globalThis.fetch;
  let generationBody: any = null;
  globalThis.fetch = async (url: any, init?: any) => {
    const target = String(url);
    assert.doesNotMatch(target, /\/images\/upload|\/v1\/files/);
    if (target.endsWith('/files/input/local-image.png')) {
      return new Response(Buffer.from('PNGDATA'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    if (target.endsWith('/v1/media/uploads/presign')) {
      return Response.json({
        data: {
          upload_url: 'https://upload.example.com/local-image-put',
          public_url: 'https://cdn.example.com/local-image.png',
        },
      });
    }
    if (target === 'https://upload.example.com/local-image-put') {
      return new Response('', { status: 200 });
    }
    if (target.endsWith('/v1/images/generations')) {
      generationBody = JSON.parse(String(init?.body || '{}'));
      return Response.json({ data: [{ url: 'https://cdn.example.com/out.png' }] });
    }
    throw new Error(`unexpected fetch ${target}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await proxy._testOnly.callImageUpstreamAsync({
    settings: {
      zhenzhenBaseUrl: 'https://api-direct.skylee9.cloudns.ch',
      zhenzhenImageModelProtocols: { 'gpt-image-2': 'images-generations' },
    },
    routeModelId: 'gpt-image-2',
    apiKey: 'sk-test',
    originalApiModel: 'gpt-image-2',
    finalApiModel: 'gpt-image-2',
    paramKind: 'gpt-size',
    prompt: 'use the reference',
    refs: ['/files/input/local-image.png'],
    aspect_ratio: '16:9',
    image_size: '1K',
  });

  assert.equal(response.ok, true);
  assert.equal(generationBody.model, 'gpt-image-2');
  assert.deepEqual(generationBody.image_urls, ['https://cdn.example.com/local-image.png']);
  assert.equal(generationBody.image, 'https://cdn.example.com/local-image.png');
});

test('Seedance submit defaults to Videos API when settings provide upstream video models', () => {
  assert.equal(
    proxy._testOnly.resolveSeedanceSubmitProtocol({
      zhenzhenVideoModelOverrides: { 'seedance-2.0': 'sora-v3-pro' },
      zhenzhenVideoModelProtocols: {},
    }, 'sora-v3-pro', 'sora-v3-pro'),
    'videos',
  );
  assert.equal(
    proxy._testOnly.resolveSeedanceSubmitProtocol({
      zhenzhenVideoModelOverrides: { 'seedance-2.0': 'sora-v3-pro' },
      zhenzhenVideoModelProtocols: { 'seedance-2.0': 'seedance-v3' },
    }, 'sora-v3-pro', 'sora-v3-pro'),
    'seedance-v3',
  );
});

test('Generic video submit protocol can opt into Videos API without model-name routing', () => {
  const settings = {
    zhenzhenVideoModelProtocols: {
      'grok-video-3': 'videos',
      'sd2-720p': 'videos',
    },
  };

  assert.equal(
    proxy._testOnly.resolveVideoSubmitProtocol(settings, 'grok-video-3', 'sd2-720p', 'grok-video-3'),
    'videos',
  );
  assert.equal(
    proxy._testOnly.resolveVideoSubmitProtocol({ zhenzhenVideoModelProtocols: {} }, 'grok-video-3', 'grok-video-3', 'grok-video-3'),
    '',
  );
});

test('Fetched default-service video models use the standard Videos API without model-name hardcoding', () => {
  const settings = {
    zhenzhenModelCatalog: {
      videoModels: ['kling', 'custom-video-model'],
    },
    zhenzhenVideoModelProtocols: {},
  };

  assert.equal(
    proxy._testOnly.resolveVideoSubmitProtocol(settings, 'kling', 'kling', 'kling'),
    'videos',
  );
  assert.equal(
    proxy._testOnly.resolveVideoSubmitProtocol(settings, 'custom-video-model', 'custom-video-model', 'custom-video-model'),
    'videos',
  );
  assert.equal(
    proxy._testOnly.resolveVideoSubmitProtocol({
      ...settings,
      zhenzhenVideoModelProtocols: { kling: 'seedance-v3' },
    }, 'kling', 'kling', 'kling'),
    'seedance-v3',
  );
});

test('Grok Imagine video models default to Videos API from the public docs', () => {
  assert.equal(
    proxy._testOnly.resolveVideoSubmitProtocol(
      { zhenzhenVideoModelProtocols: {} },
      'grok-video-3',
      'grok-imagine-video-1.5-1080p',
      'grok-video-3',
    ),
    'videos',
  );
  assert.equal(
    proxy._testOnly.resolveVideoSubmitProtocol(
      { zhenzhenVideoModelProtocols: { 'grok-video-3': 'seedance-v3' } },
      'grok-video-3',
      'grok-imagine-video-1.5-1080p',
      'grok-video-3',
    ),
    'seedance-v3',
  );
});

test('dynamic video nodes always forward the selected duration to Videos API routing', () => {
  const videoNode = readFileSync(new URL('../src/components/nodes/VideoNode.tsx', import.meta.url), 'utf8');
  assert.match(videoNode, /const payload: VideoSubmitRequest = \{[\s\S]*?duration:\s*Number\(duration\)/);
  assert.match(videoNode, /resolution:\s*resolution \|\| modelDef\.defaultResolution \|\| '720p'/);
});

test('Zhenzhen file uploads include model_name when a video model is supplied', async (t) => {
  const originalFetch = globalThis.fetch;
  let uploadedModelName = '';
  let uploadedModel = '';
  let uploadedCamelModelName = '';
  globalThis.fetch = async (url: any, init?: any) => {
    const target = String(url);
    if (target.endsWith('/v1/files')) {
      const form = init?.body as FormData;
      uploadedModelName = String(form.get('model_name') || '');
      uploadedModel = String(form.get('model') || '');
      uploadedCamelModelName = String(form.get('modelName') || '');
      assert.ok(form.get('file'));
      return Response.json({ url: 'https://cdn.example.com/grok-ref.png' });
    }
    throw new Error(`unexpected fetch ${target}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const url = await proxy._testOnly.uploadRefToZhenzhen(
    { zhenzhenBaseUrl: 'https://api.skylee9.cloudns.ch' },
    'data:image/png;base64,UE5HREFUQQ==',
    'sk-test',
    '参考素材',
    { modelName: 'grok-imagine-video-1.5-1080p' },
  );

  assert.equal(url, 'https://cdn.example.com/grok-ref.png');
  assert.equal(uploadedModelName, 'grok-imagine-video-1.5-1080p');
  assert.equal(uploadedModel, 'grok-imagine-video-1.5-1080p');
  assert.equal(uploadedCamelModelName, 'grok-imagine-video-1.5-1080p');
});

test('Videos API Seedance model resolution preserves selected configured model names', () => {
  const settings = {
    zhenzhenVideoModelOverrides: {
      'seedance-2.0': 'video-standard-720p\nsora-v3-pro\nsora-v3-pro-1080p',
    },
    zhenzhenVideoModelProtocols: { 'seedance-2.0': 'videos' },
  };

  assert.equal(
    proxy._testOnly.resolveVideosApiSeedanceModel(settings, 'video-standard-720p', 'video-standard-720p'),
    'video-standard-720p',
  );
  assert.equal(
    proxy._testOnly.resolveVideosApiSeedanceModel(settings, 'sora-v3-pro-1080p', 'sora-v3-pro-1080p'),
    'sora-v3-pro-1080p',
  );
});

test('Seedance video routing ignores legacy override aliases and preserves the selected model', () => {
  const settings = {
    zhenzhenVideoModelOverrides: {
      'seedance-2.0': 'video-standard-720p\nsora-v3-pro\nsora-v3-pro-1080p',
    },
  };

  assert.equal(
    proxy._testOnly.resolveSeedanceVideoModelOverride(settings, 'seedance-2.0'),
    'seedance-2.0',
  );
  assert.equal(
    proxy._testOnly.resolveSeedanceVideoModelOverride(settings, 'video-standard-720p'),
    'video-standard-720p',
  );
});

test('Seedance video override preserves the exact user-selected upstream model', () => {
  const settings = {
    zhenzhenVideoModelOverrides: {
      'seedance-2.0': 'sora-v3-pro-1080p\nsora-v3-pro',
    },
    zhenzhenVideoModelProtocols: { 'seedance-2.0': 'videos' },
  };

  assert.equal(
    proxy._testOnly.resolveSeedanceVideoModelOverride(settings, 'sora-v3-pro'),
    'sora-v3-pro',
  );
  assert.equal(
    proxy._testOnly.resolveVideosApiSeedanceModel(settings, 'sora-v3-pro', 'sora-v3-pro'),
    'sora-v3-pro',
  );
});
