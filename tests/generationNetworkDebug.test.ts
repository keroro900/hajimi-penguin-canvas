import test from 'node:test';
import assert from 'node:assert/strict';

import { generateImage, submitImageAsync } from '../src/services/generation.ts';

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        if (String(name || '').toLowerCase() === 'content-type') return 'application/json';
        return null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    },
  } as any;
}

test('generateImage enriches fetch failures with local runtime context', async () => {
  const oldFetch = globalThis.fetch;
  const oldWindow = (globalThis as any).window;
  let callIndex = 0;

  (globalThis as any).window = {
    location: {
      origin: 'http://127.0.0.1:11422',
      href: 'http://127.0.0.1:11422/',
    },
    t8pc: {
      getInfo: () => Promise.resolve({}),
    },
  };

  (globalThis as any).fetch = async (url: string) => {
    callIndex += 1;
    if (callIndex === 1) {
      throw new TypeError('fetch failed');
    }
    assert.equal(url, '/api/status');
    return jsonResponse({
      ok: true,
      service: 'hajimi-canvas-backend',
      port: 18766,
    });
  };

  try {
    await assert.rejects(
      () => generateImage({ model: 'gpt-image-2', prompt: 'draw a penguin' }),
      (error: any) => {
        assert.match(String(error?.message || ''), /核心图像生成 网络请求失败/);
        assert.match(String(error?.message || ''), /request=\/api\/proxy\/image/);
        assert.match(String(error?.message || ''), /origin=http:\/\/127\.0\.0\.1:11422/);
        assert.match(String(error?.message || ''), /page=http:\/\/127\.0\.0\.1:11422\//);
        assert.match(String(error?.message || ''), /electron=yes/);
        assert.match(String(error?.message || ''), /backendProbe=ok\(HTTP 200 service=hajimi-canvas-backend port=18766\)/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = oldFetch;
    if (oldWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = oldWindow;
    }
  }
});

test('submitImageAsync asks for async and sync fallback fields', async () => {
  const oldFetch = globalThis.fetch;
  let submittedBody: any = null;

  (globalThis as any).fetch = async (_url: string, init: any) => {
    submittedBody = JSON.parse(String(init?.body || '{}'));
    return jsonResponse({
      success: true,
      data: {
        sync: false,
        taskId: 'task_123',
        status: 'pending',
        progress: '0%',
      },
    });
  };

  try {
    await submitImageAsync({ model: 'gpt-image-2', prompt: 'draw a penguin' });
  } finally {
    globalThis.fetch = oldFetch;
  }

  assert.equal(submittedBody.async, true);
  assert.equal(submittedBody.forceAsync, true);
  assert.equal(submittedBody.sync_mode, false);
});
