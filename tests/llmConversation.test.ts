import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildLlmConversationMessages } from '../src/utils/llmConversation.ts';

const require = createRequire(import.meta.url);
const proxyRouter = require('../backend/src/routes/proxy.js');

test('LLM conversation sends connected media once instead of replaying historical attachments', () => {
  const messages = buildLlmConversationMessages({
    systemPrompt: 'system',
    history: [
      {
        role: 'user',
        text: 'first turn',
        images: ['data:image/png;base64,old-image'],
        videos: ['data:video/mp4;base64,old-video'],
      },
      { role: 'assistant', text: 'first answer' },
    ],
    userText: 'follow up',
    userImages: ['data:image/png;base64,current-image'],
    userVideos: ['data:video/mp4;base64,current-video'],
  });

  assert.deepEqual(messages[0], { role: 'system', content: 'system' });
  assert.deepEqual(messages[1], { role: 'user', content: 'first turn' });
  assert.deepEqual(messages[2], { role: 'assistant', content: 'first answer' });
  assert.deepEqual(messages[3], {
    role: 'user',
    content: [
      { type: 'text', text: 'follow up' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,current-image' } },
      { type: 'video_url', video_url: { url: 'data:video/mp4;base64,current-video' } },
    ],
  });
  assert.equal(JSON.stringify(messages).includes('old-image'), false);
  assert.equal(JSON.stringify(messages).includes('old-video'), false);
});

test('LLM request source resolves the matching base URL and API key', () => {
  const settings = {
    zhenzhenBaseUrl: 'https://common.example/v1',
    zhenzhenApiKey: 'common-key',
    llmBaseUrl: 'https://llm.example/v1',
    llmApiKey: 'llm-key',
  };

  assert.deepEqual(proxyRouter._testOnly.resolveLlmCredentials(settings, 'zhenzhen'), {
    source: 'zhenzhen', baseUrl: 'https://common.example/v1', apiKey: 'common-key',
  });
  assert.deepEqual(proxyRouter._testOnly.resolveLlmCredentials(settings, 'llm-direct'), {
    source: 'llm-direct', baseUrl: 'https://llm.example/v1', apiKey: 'llm-key',
  });
});
