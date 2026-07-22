import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { generateLlm, generateLlmStream } from '../src/services/generation.ts';
import { buildLlmConversationMessages } from '../src/utils/llmConversation.ts';

const require = createRequire(import.meta.url);
const { normalizeLlmMessageMedia, resolveBundledFfmpeg } = require('../backend/src/providers/llmMedia.js');
const {
  buildGeminiLlmPayload,
  normalizeGeminiLlmResponse,
} = require('../backend/src/providers/geminiLlm.js');

const ROOT = path.resolve(process.cwd());

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

test('LLM node accepts video ports and builds video_url payloads', () => {
  const ports = read('src/config/portTypes.ts');
  const node = read('src/components/nodes/LLMNode.tsx');
  const generation = read('src/services/generation.ts');

  assert.match(ports, /llm:\s*\{\s*inputs:\s*\['text', 'image', 'video'\]/);
  assert.match(generation, /type:\s*'video_url'/);
  const messages = buildLlmConversationMessages({
    systemPrompt: '',
    history: [],
    userText: 'describe this video',
    userImages: [],
    userVideos: ['data:video/mp4;base64,dmlkZW8='],
  });
  assert.deepEqual(messages[0], {
    role: 'user',
    content: [
      { type: 'text', text: 'describe this video' },
      { type: 'video_url', video_url: { url: 'data:video/mp4;base64,dmlkZW8=' } },
    ],
  });
  assert.match(node, /groups=\{\['text', 'image', 'video'\]\}/);
  assert.match(node, /accepts:\s*\['image', 'video', 'text'\]/);
  assert.match(node, /完整视频 ·/);
  assert.match(node, /: 'native-base64';/);
  assert.doesNotMatch(node, /<option value="frames"/);
  assert.match(node, /userVideos\.length === 0/);
  assert.match(node, /llmVideoMode/);
});

test('LLM node uses a higher default output token budget for long replies', () => {
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/LLMNode.tsx');
  const proxy = read('backend/src/routes/proxy.js');

  assert.match(canvas, /maxTokens:\s*16384/);
  assert.match(node, /d\?\.maxTokens === 'number' \? d\.maxTokens : 16384/);
  assert.match(node, /Number\(e\.target\.value\) \|\| 16384/);
  assert.match(proxy, /max_tokens:\s*max_tokens \?\? 16384/);
});

test('LLM node uses configured common and independent chat models instead of hardcoded options', () => {
  const settingsType = read('src/types/canvas.ts');
  const settingsRoute = read('backend/src/routes/settings.js');
  const models = read('src/providers/models.ts');
  const node = read('src/components/nodes/LLMNode.tsx');

  assert.match(settingsType, /zhenzhenLlmModelOverrides\?:\s*Record<string,\s*string>/);
  assert.match(settingsRoute, /zhenzhenLlmModelOverrides:\s*\{\}/);
  assert.match(models, /export const DEFAULT_LLM_MODEL = ''/);
  assert.match(models, /resolveConfiguredLlmChoice/);
  assert.match(models, /llmModelChoicesFromSettings/);
  assert.match(node, /llmModelChoicesFromSettings\(apiSettings\)/);
  assert.match(node, /modelSource:\s*selectedModelSource/);
  assert.doesNotMatch(node, /LLM_MODELS\.map/);
  assert.doesNotMatch(node, /Gemini 3\.5 Flash|GPT-5|gpt-4o/);
});

test('streaming LLM responses expose token-length truncation instead of silently ending', async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  try {
    globalThis.fetch = async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"前半段"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"后半段"},"finish_reason":"length"}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ) as any;

    const chunks: string[] = [];
    const result = await generateLlmStream(
      { model: 'gemini-3.5-flash', messages: [{ role: 'user', content: '写长文' }], max_tokens: 4 },
      { onDelta: (chunk) => chunks.push(chunk) },
    );

    assert.equal(result.content, '前半段后半段');
    assert.deepEqual(chunks, ['前半段', '后半段']);
    assert.equal(result.finishReason, 'length');
    assert.equal(result.truncated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streaming LLM parser keeps final SSE data even without a trailing newline', async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  try {
    globalThis.fetch = async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"前半段"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"最后一段"},"finish_reason":"stop"}]}'));
          controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ) as any;

    const result = await generateLlmStream({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: '写长文' }],
    });

    assert.equal(result.content, '前半段最后一段');
    assert.equal(result.finishReason, 'stop');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LLM media normalizer converts local video references to absolute URLs in url mode', async () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'describe this video' },
        { type: 'video_url', video_url: { url: '/files/output/demo.mp4' } },
      ],
    },
  ];

  const normalized = await normalizeLlmMessageMedia(messages, {
    llmVideoMode: 'url',
  }, {
    baseUrl: 'http://127.0.0.1:19999',
  });

  assert.equal(
    normalized[0].content[1].video_url.url,
    'http://127.0.0.1:19999/files/output/demo.mp4',
  );
  assert.equal(messages[0].content[1].video_url.url, '/files/output/demo.mp4');
});

test('bundled ffmpeg runtime is discoverable for LLM video compression', () => {
  const ffmpegPath = resolveBundledFfmpeg();
  assert.match(String(ffmpegPath).replace(/\\/g, '/'), /tools\/ffmpeg-runtime\/ffmpeg(\.exe)?$/);
  assert.equal(fs.existsSync(ffmpegPath), true);
});

test('LLM media normalizer preserves Base64 video mode as native video_url', async () => {
  const ffmpegPath = resolveBundledFfmpeg();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-llm-video-test-'));
  const videoPath = path.join(dir, 'sample.mp4');
  try {
    const made = spawnSync(ffmpegPath, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=96x64:duration=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      videoPath,
    ], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr || made.stdout);
    assert.equal(fs.existsSync(videoPath), true);

    const normalized = await normalizeLlmMessageMedia([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this video' },
          { type: 'video_url', video_url: { url: videoPath } },
        ],
      },
    ], {
      llmVideoMode: 'compressed-base64',
      videoMaxWidth: 256,
      videoMaxHeight: 256,
      videoMaxBase64Mb: 16,
    });

    const content = normalized[0].content;
    assert.equal(content.some((part: any) => part.type === 'image_url'), false);
    assert.equal(content.some((part: any) => part.type === 'text' && /关键帧/.test(part.text)), false);
    assert.equal(content.some((part: any) => part.type === 'video_url' && /^data:video\/mp4;base64,/.test(part.video_url.url)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('non-streaming LLM requests can be aborted', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  try {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      receivedSignal = init?.signal;
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response(JSON.stringify({ success: true, data: { content: 'ok', raw: {}, model: 'test' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    controller.abort();
    const pending = generateLlm({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    }, { signal: controller.signal });

    await assert.rejects(pending, (error: any) => error?.name === 'AbortError');
    assert.equal(receivedSignal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('native complete-video mode downloads remote videos into Base64', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(Buffer.from('remote-complete-video'), {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' },
    });
    const normalized = await normalizeLlmMessageMedia([{
      role: 'user',
      content: [{
        type: 'video_url',
        video_url: { url: 'https://cdn.example.com/complete.mp4' },
      }],
    }], { llmVideoMode: 'native-base64' }, { requireVideoBase64: true });

    assert.match(normalized[0].content[0].video_url.url, /^data:video\/mp4;base64,/);
    assert.equal(
      Buffer.from(normalized[0].content[0].video_url.url.split(',')[1], 'base64').toString(),
      'remote-complete-video',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini native LLM payload sends the complete video as inlineData', () => {
  const videoBase64 = Buffer.from('complete-video-bytes').toString('base64');
  const payload = buildGeminiLlmPayload({
    messages: [
      { role: 'system', content: '只描述实际看到的内容' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '分析这段完整视频' },
          {
            type: 'video_url',
            video_url: { url: `data:video/mp4;base64,${videoBase64}` },
          },
        ],
      },
    ],
    temperature: 0.25,
    maxTokens: 2048,
  });

  assert.deepEqual(payload.systemInstruction, {
    parts: [{ text: '只描述实际看到的内容' }],
  });
  assert.deepEqual(payload.contents[0], {
    role: 'user',
    parts: [
      { text: '分析这段完整视频' },
      { inlineData: { mimeType: 'video/mp4', data: videoBase64 } },
    ],
  });
  assert.equal(payload.generationConfig.temperature, 0.25);
  assert.equal(payload.generationConfig.maxOutputTokens, 2048);
  assert.equal(JSON.stringify(payload).includes('data:video/mp4;base64,'), false);
  assert.equal(JSON.stringify(payload).includes('关键帧'), false);
});

test('Gemini native LLM response is normalized to the existing frontend contract', () => {
  const normalized = normalizeGeminiLlmResponse({
    modelVersion: 'gemini-3.5-flash',
    candidates: [{
      finishReason: 'MAX_TOKENS',
      content: {
        parts: [
          { text: '第一段' },
          { text: '第二段' },
          { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } },
        ],
      },
    }],
  }, 'gemini-3.5-flash');

  assert.equal(normalized.content, '第一段第二段');
  assert.deepEqual(normalized.imageUrls, ['data:image/png;base64,aGVsbG8=']);
  assert.equal(normalized.model, 'gemini-3.5-flash');
  assert.equal(normalized.finishReason, 'MAX_TOKENS');
  assert.equal(normalized.truncated, true);
});

test('Gemini video requests are routed through native generateContent', () => {
  const proxy = read('backend/src/routes/proxy.js');

  assert.match(proxy, /useNativeGeminiVideo\s*=\s*isGeminiLlmModel\(model\)\s*&&\s*inputHadVideos/);
  assert.match(proxy, /useNativeGeminiVideo\s*\?\s*gaiscGeminiEndpointUrl\(baseUrl, model\)/);
  assert.match(proxy, /buildGeminiLlmPayload\(\{[\s\S]*messages:\s*normalizedMessages/);
  assert.match(proxy, /useNativeGeminiVideo\s*\?\s*messages\s*:\s*await publicizeChatMessageMedia/);
  assert.match(proxy, /llmVideoMode:\s*'native-base64'/);
});

test('legacy keyframe mode is migrated to complete-video Base64', async () => {
  const ffmpegPath = resolveBundledFfmpeg();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-llm-video-frames-test-'));
  const videoPath = path.join(dir, 'sample.mp4');
  try {
    const made = spawnSync(ffmpegPath, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=96x64:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      videoPath,
    ], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr || made.stdout);
    assert.equal(fs.existsSync(videoPath), true);

    const normalized = await normalizeLlmMessageMedia([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this video' },
          { type: 'video_url', video_url: { url: videoPath } },
        ],
      },
    ], {
      llmVideoMode: 'frames',
      videoFrameCount: 4,
      videoMaxWidth: 256,
      videoMaxHeight: 256,
    });

    const content = normalized[0].content;
    assert.equal(content.some((part: any) => part.type === 'image_url'), false);
    assert.equal(content.some((part: any) => part.type === 'text' && /关键帧/.test(part.text)), false);
    assert.equal(content.some((part: any) => (
      part.type === 'video_url' && /^data:video\/mp4;base64,/.test(part.video_url.url)
    )), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
