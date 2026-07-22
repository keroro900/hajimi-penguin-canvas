import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const openaiCompatible = require('../backend/src/providers/openaiCompatible.js');

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('OpenAI compatible chat posts to chat/completions and normalizes assistant text', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'custom-openai',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1/',
    apiKey: 'sk-secret',
    chatModels: ['gpt-4o-mini'],
  };

  const result = await openaiCompatible.generateChat(provider, {
    prompt: 'hello',
    temperature: 0.25,
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({
        choices: [
          { message: { content: 'world' } },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'llm');
  assert.equal(result.text, 'world');
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-secret');
  assert.equal(calls[0].body.model, 'gpt-4o-mini');
  assert.deepEqual(calls[0].body.messages, [{ role: 'user', content: 'hello' }]);
  assert.equal(calls[0].body.temperature, 0.25);
});

test('OpenAI compatible chat preserves remote video_url multimodal parts', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'custom-openai',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    chatModels: ['gpt-4o-mini'],
  };

  const result = await openaiCompatible.generateChat(provider, {
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'describe motion' },
        { type: 'video_url', video_url: { url: 'https://cdn.example.com/clip.mp4' } },
      ],
    }],
    llmVideoMode: 'compressed-base64',
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ choices: [{ message: { content: 'moving' } }] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'moving');
  assert.equal(calls[0].body.messages[0].content[1].type, 'video_url');
  assert.equal(calls[0].body.messages[0].content[1].video_url.url, 'https://cdn.example.com/clip.mp4');
});

test('OpenAI compatible image generation normalizes url and b64_json results', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'custom-openai',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    imageModels: ['gpt-image-1'],
  };

  const result = await openaiCompatible.generateImage(provider, {
    prompt: 'a tiny penguin',
    size: '1024x1024',
    n: 2,
    aspect_ratio: '9:16',
    image_size: '4K',
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({
        data: [
          { url: 'https://cdn.example.com/penguin.png' },
          { url: 'cdn.example.com/penguin-2.png' },
          { b64_json: 'QUJD', mime_type: 'image/png' },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'image');
  assert.deepEqual(result.imageUrls, [
    'https://cdn.example.com/penguin.png',
    'https://cdn.example.com/penguin-2.png',
    'data:image/png;base64,QUJD',
  ]);
  assert.equal(calls[0].url, 'https://api.example.com/v1/images/generations');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-secret');
  assert.equal(calls[0].body.model, 'gpt-image-1');
  assert.equal(calls[0].body.prompt, 'a tiny penguin');
  assert.equal(calls[0].body.size, '1024x1024');
  assert.equal(calls[0].body.n, 2);
  assert.equal(calls[0].body.aspect_ratio, '9:16');
  assert.equal(calls[0].body.image_size, '4K');
});

test('OpenAI compatible image generation can mirror the default gpt-size request body', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'custom-zhenzhen-compatible',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    imageModels: ['gpt-image-2-all'],
  };

  const result = await openaiCompatible.generateImage(provider, {
    prompt: 'a tiny penguin',
    model: 'gpt-image-2-all',
    paramKind: 'gpt-size',
    size: '1536x1024',
    aspect_ratio: '3:2',
    image_size: '2K',
    n: 2,
    quality: 'high',
    images: ['data:image/png;base64,AAA'],
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ data: [{ url: 'https://cdn.example.com/generated.png' }] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.example.com/v1/images/generations');
  assert.deepEqual(calls[0].body, {
    model: 'gpt-image-2-all',
    prompt: 'a tiny penguin',
    n: 2,
    quality: 'high',
    size: '1536x1024',
    resolution: '2k',
    image_size: '2K',
    images: ['data:image/png;base64,AAA'],
    image: 'data:image/png;base64,AAA',
    image_urls: ['data:image/png;base64,AAA'],
  });
});

test('OpenAI compatible image generation uses chat completions for reference images only', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'new-api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    imageModels: ['gemini-3-pro-image-preview'],
    defaults: {
      imageProtocol: 'openai-chat',
    },
  };

  const result = await openaiCompatible.generateImage(provider, {
    prompt: 'a tiny penguin',
    model: 'gemini-3-pro-image-preview',
    aspect_ratio: '1:1',
    images: ['data:image/png;base64,QUJD'],
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'ok' },
                { type: 'image_url', image_url: { url: 'https://cdn.example.com/generated.png' } },
              ],
            },
          },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ['https://cdn.example.com/generated.png']);
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(calls[0].body.model, 'gemini-3-pro-image-preview');
  assert.equal(calls[0].body.messages[0].role, 'user');
  assert.equal(calls[0].body.messages[0].content[0].type, 'text');
  assert.equal(calls[0].body.messages[0].content[1].type, 'image_url');
});

test('OpenAI compatible generation endpoints add v1 for root base urls', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'new-api-root',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com',
    apiKey: 'sk-secret',
    imageModels: ['gemini-3-pro-image-preview'],
    videoModels: ['video-model'],
    defaults: {
      imageProtocol: 'openai-chat',
    },
  };

  const image = await openaiCompatible.generateImage(provider, {
    prompt: 'a tiny penguin',
    model: 'gemini-3-pro-image-preview',
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ data: [{ url: 'https://cdn.example.com/generated.png' }] });
    },
  });

  const video = await openaiCompatible.generateVideo(provider, {
    prompt: 'a tiny video',
    model: 'video-model',
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ data: { video_url: 'https://cdn.example.com/generated.mp4' } });
    },
  });

  assert.equal(image.ok, true);
  assert.equal(video.ok, true);
  assert.equal(calls[0].url, 'https://api.example.com/v1/images/generations');
  assert.equal(calls[1].url, 'https://api.example.com/v1/videos/generations');
});

test('OpenAI compatible video generation posts to video endpoint and normalizes returned media urls', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'custom-openai',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    videoModels: ['video-model'],
  };

  const result = await openaiCompatible.generateVideo(provider, {
    prompt: 'a quick pass',
    model: 'video-model',
    aspect_ratio: '16:9',
    duration: 6,
    resolution: '720p',
    images: ['data:image/png;base64,AAA'],
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({
        data: {
          video_url: 'https://cdn.example.com/video.mp4',
          task_id: 'vid-1',
        },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'video');
  assert.deepEqual(result.videoUrls, ['https://cdn.example.com/video.mp4']);
  assert.equal(result.taskId, 'vid-1');
  assert.equal(calls[0].url, 'https://api.example.com/v1/videos/generations');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-secret');
  assert.equal(calls[0].body.model, 'video-model');
  assert.equal(calls[0].body.prompt, 'a quick pass');
  assert.equal(calls[0].body.aspect_ratio, '16:9');
  assert.equal(calls[0].body.duration, 6);
  assert.deepEqual(calls[0].body.images, ['data:image/png;base64,AAA']);
});

test('OpenAI compatible video generation can mirror the default Veo JSON request', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'custom-zhenzhen-video',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    videoModels: ['veo3.1'],
  };

  const result = await openaiCompatible.generateVideo(provider, {
    prompt: 'a quick pass',
    model: 'veo3.1',
    providerKind: 'veo',
    aspect_ratio: '9:16',
    seed: 123,
    enhance_prompt: true,
    enable_upsample: true,
    images: ['data:image/png;base64,AAA'],
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({
        data: {
          video_url: 'https://cdn.example.com/video.mp4',
          task_id: 'vid-1',
        },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.example.com/v2/videos/generations');
  assert.deepEqual(calls[0].body, {
    prompt: 'a quick pass',
    model: 'veo3.1',
    enhance_prompt: true,
    aspect_ratio: '9:16',
    seed: 123,
    enable_upsample: true,
    images: ['data:image/png;base64,AAA'],
  });
});

test('OpenAI compatible video generation polls task responses until nested result url is ready', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'task-video-api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    videoModels: ['task-video-model'],
  };

  const result = await openaiCompatible.generateVideo(provider, {
    prompt: 'a task based video',
    model: 'task-video-model',
    aspect_ratio: '16:9',
    duration: 15,
    images: ['data:image/png;base64,AAA'],
  }, {
    fetchImpl: async (url: string, init: any = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
      if (String(url).endsWith('/videos/generations')) {
        return jsonResponse({
          id: 'task-1',
          task_id: 'task-1',
          object: 'video',
          status: 'processing',
          progress: 0,
        });
      }
      return jsonResponse({
        code: 'success',
        data: {
          task_id: 'task-1',
          status: 'SUCCESS',
          progress: '100%',
          result_url: '',
          result: {
            video_url: 'https://cdn.example.com/task-video.mp4',
            resultUrls: ['https://cdn.example.com/task-video-alt.mp4'],
          },
        },
      });
    },
    sleepImpl: async () => undefined,
    maxPolls: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.taskId, 'task-1');
  assert.deepEqual(result.videoUrls, [
    'https://cdn.example.com/task-video.mp4',
    'https://cdn.example.com/task-video-alt.mp4',
  ]);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    'POST https://api.example.com/v1/videos/generations',
    'GET https://api.example.com/v1/videos/generations/task-1',
  ]);
  assert.deepEqual(calls[0].body.images, ['data:image/png;base64,AAA']);
});

test('OpenAI compatible video generation falls back to singular video endpoint for task APIs', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'singular-task-video-api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    videoModels: ['task-video-model'],
  };

  const result = await openaiCompatible.generateVideo(provider, {
    prompt: 'a singular endpoint video',
    model: 'task-video-model',
    ratio: '9:16',
    seconds: 12,
    referenceImages: ['https://cdn.example.com/ref.png'],
  }, {
    fetchImpl: async (url: string, init: any = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
      if (String(url).endsWith('/videos/generations')) {
        return jsonResponse({ code: 'not_found', message: 'not found' }, 404);
      }
      if (String(url).endsWith('/video/generations')) {
        return jsonResponse({ task_id: 'task-singular', status: 'SUBMITTED' });
      }
      return jsonResponse({
        code: 'success',
        data: {
          status: 'IN_PROGRESS',
          result: {},
        },
      });
    },
    sleepImpl: async () => undefined,
    maxPolls: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'timeout');
  assert.equal(result.taskId, 'task-singular');
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    'POST https://api.example.com/v1/videos/generations',
    'POST https://api.example.com/v1/video/generations',
    'GET https://api.example.com/v1/video/generations/task-singular',
  ]);
  assert.equal(calls[1].body.size, '9:16');
  assert.equal(calls[1].body.seconds, 12);
  assert.deepEqual(calls[1].body.reference_images, ['https://cdn.example.com/ref.png']);
});

test('backend protocol aliases choose known endpoints without user endpoint input', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'gemini-api',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'gemini-secret',
    chatModels: ['gemini-2.5-flash'],
    imageModels: ['gemini-2.5-flash-image'],
  };

  const chat = await openaiCompatible.generateChat(provider, {
    prompt: 'hello',
    model: 'gemini-2.5-flash',
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'world' }] } }] });
    },
  });

  const image = await openaiCompatible.generateImage(provider, {
    prompt: 'penguin',
    model: 'gemini-2.5-flash-image',
  }, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] });
    },
  });

  assert.equal(chat.ok, true);
  assert.equal(chat.text, 'world');
  assert.equal(image.ok, true);
  assert.deepEqual(image.imageUrls, ['data:image/png;base64,QUJD']);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'gemini-secret');
  assert.equal(calls[0].body.contents[0].parts[0].text, 'hello');
  assert.equal(calls[1].body.contents[0].parts[0].text, 'penguin');
});

test('Gemini provider connection test uses Google API key query protocol', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'gemini-api',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'gemini-secret',
  };

  const result = await openaiCompatible.testProvider(provider, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init });
      return jsonResponse({ models: [] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?key=gemini-secret');
  assert.equal(calls[0].init.headers.Accept, 'application/json');
  assert.equal('Authorization' in calls[0].init.headers, false);
});

test('OpenAI compatible model fetch groups upstream models for node usage', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'openai-api',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-secret',
  };

  const result = await openaiCompatible.fetchModels(provider, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init });
      return jsonResponse({
        data: [
          { id: 'gpt-4o-mini' },
          { id: 'gpt-image-1' },
          { id: 'sora-2' },
          { id: 'suno-v5' },
          { id: 'vendor-new-model' },
          { id: 'gpt-4o-mini' },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.total, 5);
  assert.deepEqual(result.chatModels, ['gpt-4o-mini']);
  assert.deepEqual(result.imageModels, ['gpt-image-1']);
  assert.deepEqual(result.videoModels, ['sora-2']);
  assert.deepEqual(result.audioModels, ['suno-v5']);
  assert.deepEqual(result.unknownModels, ['vendor-new-model']);
  assert.deepEqual(result.all, ['gpt-4o-mini', 'gpt-image-1', 'sora-2', 'suno-v5', 'vendor-new-model']);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-secret');
});

test('OpenAI compatible model fetch accepts root base urls and image endpoint metadata', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'new-api-root',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com',
    apiKey: 'sk-secret',
  };

  const result = await openaiCompatible.fetchModels(provider, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init });
      return jsonResponse({
        data: [
          { id: 'gpt-4o-mini', supported_endpoint_types: ['openai'] },
          { id: 'creative-pro', supported_endpoint_types: ['image-generation'] },
          { id: 'clip-maker', supported_endpoint_types: ['video-generation'] },
          { id: 'voice-maker', supported_endpoint_types: ['audio-generation'] },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.example.com/v1/models');
  assert.deepEqual(result.chatModels, ['gpt-4o-mini']);
  assert.deepEqual(result.imageModels, ['creative-pro']);
  assert.deepEqual(result.videoModels, ['clip-maker']);
  assert.deepEqual(result.audioModels, ['voice-maker']);
});

test('OpenAI compatible image generation requires a fetched or explicitly selected model', async () => {
  let called = false;
  const result = await openaiCompatible.generateImage({
    id: 'empty-catalog',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
    imageModels: [],
  }, { prompt: 'test' }, {
    fetchImpl: async () => {
      called = true;
      return jsonResponse({ data: [] });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_model');
  assert.equal(called, false);
});

test('OpenAI compatible model fetch does not treat html as a parsed model list', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'new-api-root',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret',
  };

  const result = await openaiCompatible.fetchModels(provider, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init });
      if (url === 'https://api.example.com/v1/models') {
        return {
          ok: true,
          status: 200,
          async text() {
            return '<!doctype html><html></html>';
          },
        };
      }
      return jsonResponse({ data: [{ id: 'gpt-image-2' }] });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((call) => call.url), [
    'https://api.example.com/v1/models',
  ]);
  assert.deepEqual(result.imageModels, []);
  assert.deepEqual(result.all, []);
});

test('Gemini model fetch strips models prefix and uses API key query protocol', async () => {
  const calls: any[] = [];
  const provider = {
    id: 'gemini-api',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'gemini-secret',
  };

  const result = await openaiCompatible.fetchModels(provider, {
    fetchImpl: async (url: string, init: any) => {
      calls.push({ url, init });
      return jsonResponse({
        models: [
          { name: 'models/gemini-2.5-flash' },
          { name: 'models/gemini-2.5-flash-image' },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.chatModels, ['gemini-2.5-flash']);
  assert.deepEqual(result.imageModels, ['gemini-2.5-flash-image']);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?key=gemini-secret');
  assert.equal('Authorization' in calls[0].init.headers, false);
});
