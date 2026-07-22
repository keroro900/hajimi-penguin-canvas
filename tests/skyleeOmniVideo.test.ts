import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { apishuVeoOmniMode, isApishuVeoOmniModel } from '../src/providers/models.ts';

const require = createRequire(import.meta.url);
const proxyModule = require('../backend/src/routes/proxy.js');
const config = require('../backend/src/config.js');

test('Skylee Omni family is recognized without adding models to the catalog', () => {
  const { isApishuVeoOmniModel } = proxyModule._testOnly;

  assert.equal(isApishuVeoOmniModel('omni-flash'), true);
  assert.equal(isApishuVeoOmniModel('omni-flash-components'), true);
  assert.equal(isApishuVeoOmniModel('omni-flash-edit'), true);
  assert.equal(isApishuVeoOmniModel('some-other-video-model'), false);
});

test('frontend derives Omni behavior from the selected real model name', () => {
  assert.equal(isApishuVeoOmniModel('omni-flash'), true);
  assert.equal(isApishuVeoOmniModel('omni-flash-components'), true);
  assert.equal(isApishuVeoOmniModel('omni-flash-edit'), true);
  assert.equal(apishuVeoOmniMode('omni-flash'), 'flash');
  assert.equal(apishuVeoOmniMode('omni-flash-components'), 'components');
  assert.equal(apishuVeoOmniMode('omni-flash-edit'), 'edit');
});

test('Skylee Omni Components sends the documented JSON fields and real model name', async () => {
  const payload = await proxyModule._testOnly.buildApishuVeoOmniPayload({
    model: 'omni-flash-components',
    prompt: '让角色穿着参考服装行走',
    resolution: '4k',
    aspect_ratio: '9:16',
    duration: 8,
    images: [
      'https://cdn.example.com/character.png',
      'https://cdn.example.com/garment.png',
    ],
  });

  assert.deepEqual(payload, {
    model: 'omni-flash-components',
    prompt: '让角色穿着参考服装行走',
    resolution: '4k',
    aspect_ratio: '9:16',
    seconds: 8,
    image_urls: [
      'https://cdn.example.com/character.png',
      'https://cdn.example.com/garment.png',
    ],
  });
});

test('Skylee Omni Flash supports text-to-video and one public image', async () => {
  const textPayload = await proxyModule._testOnly.buildApishuVeoOmniPayload({
    model: 'omni-flash',
    prompt: '云海中的雪山',
    resolution: '720p',
    aspect_ratio: '16:9',
    duration: 6,
  });
  assert.equal('image_urls' in textPayload, false);

  const imagePayload = await proxyModule._testOnly.buildApishuVeoOmniPayload({
    model: 'omni-flash',
    prompt: '让人物缓慢转身',
    images: ['https://cdn.example.com/person.jpg', 'https://cdn.example.com/ignored.jpg'],
  });
  assert.deepEqual(imagePayload.image_urls, ['https://cdn.example.com/person.jpg']);
});

test('Skylee Omni Edit sends exactly one public video URL', async () => {
  const payload = await proxyModule._testOnly.buildApishuVeoOmniPayload({
    model: 'omni-flash-edit',
    prompt: '改为雨夜城市',
    resolution: '1080p',
    duration: 10,
    videos: ['https://cdn.example.com/source.mp4', 'https://cdn.example.com/ignored.mp4'],
  });

  assert.deepEqual(payload.video_urls, ['https://cdn.example.com/source.mp4']);
  assert.equal('image_urls' in payload, false);
});

test('Skylee Omni uploads inline images before placing them in image_urls', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        data: {
          upload_url: 'https://storage.example.com/upload-token',
          public_url: 'https://cdn.example.com/uploaded-reference.png',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('', { status: 200 });
  }) as typeof fetch;

  try {
    const payload = await proxyModule._testOnly.buildApishuVeoOmniPayload({
      settings: { zhenzhenBaseUrl: 'https://api.skylee9.cloudns.ch/v1' },
      apiKey: 'test-key',
      model: 'omni-flash-components',
      prompt: '测试公开素材上传',
      images: ['data:image/png;base64,aGVsbG8='],
    });

    assert.deepEqual(payload.image_urls, ['https://cdn.example.com/uploaded-reference.png']);
    assert.equal(calls[0].url, 'https://api.skylee9.cloudns.ch/v1/media/uploads/presign');
    assert.equal(calls[1].url, 'https://storage.example.com/upload-token');
    assert.equal(calls[1].init?.method, 'PUT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Skylee Omni Edit falls back to direct media upload for local videos', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/media/uploads/presign')) {
      return new Response(JSON.stringify({ error: { message: 'video presign unsupported' } }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).endsWith('/v1/media/uploads')) {
      return new Response(JSON.stringify({
        data: { public_url: 'https://cdn.example.com/uploaded-source.mp4' },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${String(url)}`);
  }) as typeof fetch;

  try {
    const payload = await proxyModule._testOnly.buildApishuVeoOmniPayload({
      settings: { zhenzhenBaseUrl: 'https://api.skylee9.cloudns.ch/v1' },
      apiKey: 'test-key',
      model: 'omni-flash-edit',
      prompt: '测试视频上传',
      videos: ['data:video/mp4;base64,aGVsbG8='],
    });

    assert.deepEqual(payload.video_urls, ['https://cdn.example.com/uploaded-source.mp4']);
    const direct = calls.find((call) => call.url.endsWith('/v1/media/uploads'));
    assert.ok(direct);
    assert.equal(direct.init?.method, 'POST');
    assert.ok(direct.init?.body instanceof FormData);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Skylee Omni validates mode-specific required media', async () => {
  await assert.rejects(
    proxyModule._testOnly.buildApishuVeoOmniPayload({
      model: 'omni-flash-components',
      prompt: 'missing image',
    }),
    /至少需要 1 张参考图/,
  );
  await assert.rejects(
    proxyModule._testOnly.buildApishuVeoOmniPayload({
      model: 'omni-flash-edit',
      prompt: 'missing video',
    }),
    /需要 1 个源视频/,
  );
});

test('Skylee Omni completed tasks can download authenticated content fallback', async () => {
  const originalFetch = globalThis.fetch;
  let seenAuthorization = '';
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    seenAuthorization = String((init?.headers as Record<string, string>)?.Authorization || '');
    return new Response(Buffer.from('fake-mp4'), {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' },
    });
  }) as typeof fetch;

  let localUrl = '';
  try {
    localUrl = await proxyModule._testOnly.saveAuthenticatedVideoContent(
      { zhenzhenBaseUrl: 'https://api.skylee9.cloudns.ch/v1' },
      'secret-key',
      'task_example',
    );
    assert.match(localUrl, /^\/files\/output\/vid_/);
    assert.equal(seenAuthorization, 'Bearer secret-key');
    assert.equal(existsSync(path.join(config.OUTPUT_DIR, path.basename(localUrl))), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (localUrl) {
      const file = path.join(config.OUTPUT_DIR, path.basename(localUrl));
      if (existsSync(file)) unlinkSync(file);
    }
  }
});
