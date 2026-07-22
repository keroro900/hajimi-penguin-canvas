import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function listen(app) {
  return await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('settings preserve user editable base URLs instead of forcing defaults', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-api-settings-url-'));
  const previousPackaged = process.env.T8PC_PACKAGED;
  const previousUserData = process.env.T8PC_USER_DATA;
  process.env.T8PC_PACKAGED = '1';
  process.env.T8PC_USER_DATA = tmp;
  try {
    const configPath = require.resolve('../backend/src/config.js');
    const settingsPath = require.resolve('../backend/src/routes/settings.js');
    delete require.cache[settingsPath];
    delete require.cache[configPath];
    const settings = require('../backend/src/routes/settings.js');

    const custom = {
      ...settings.loadSettings({ persistMigrations: false }),
      zhenzhenBaseUrl: 'https://api.user.example',
      llmBaseUrl: 'https://llm.user.example/v1',
    };
    settings.saveSettings(custom);

    const loaded = settings.loadSettings({ persistMigrations: false });

    assert.equal(loaded.zhenzhenBaseUrl, 'https://api.user.example');
    assert.equal(loaded.llmBaseUrl, 'https://llm.user.example/v1');
  } finally {
    if (previousPackaged === undefined) delete process.env.T8PC_PACKAGED;
    else process.env.T8PC_PACKAGED = previousPackaged;
    if (previousUserData === undefined) delete process.env.T8PC_USER_DATA;
    else process.env.T8PC_USER_DATA = previousUserData;
  }
});

test('settings model fetch can use a classified key with the common service base URL', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-classified-models-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const seen = [];
  const express = require('express');
  const upstream = express();
  upstream.get('/v1/models', (req, res) => {
    seen.push({
      path: req.path,
      authorization: req.get('authorization') || '',
    });
    res.json({
      data: [
        { id: 'veo-3.1', object: 'model' },
        { id: 'gpt-image-1', object: 'model' },
      ],
    });
  });
  const upstreamServer = await listen(upstream);
  t.after(() => upstreamServer.close());
  const upstreamBase = `http://127.0.0.1:${upstreamServer.address().port}/v1`;

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_LOCAL_SAVE_DIR: config.DEFAULT_LOCAL_SAVE_DIR,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    DEFAULT_THEME_TEMPLATE_DIR: config.DEFAULT_THEME_TEMPLATE_DIR,
  };
  t.after(() => Object.assign(config, oldConfig));
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(tmpDir, 'save');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(tmpDir, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(tmpDir, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(tmpDir, 'themes');

  const settingsPath = require.resolve('../backend/src/routes/settings.js');
  delete require.cache[settingsPath];
  const settingsRouter = require('../backend/src/routes/settings.js');
  settingsRouter.saveSettings({
    ...settingsRouter.loadSettings({ persistMigrations: false }),
    zhenzhenBaseUrl: upstreamBase,
    zhenzhenApiKey: '',
    veoApiKey: 'classified-veo-secret',
  });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/settings', settingsRouter);
  const server = await listen(app);
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const fetched = await fetch(`${base}/api/settings/zhenzhen-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKeyField: 'veoApiKey',
      timeoutMs: 3000,
    }),
  }).then((res) => res.json());

  assert.equal(fetched.success, true);
  assert.equal(fetched.data.ok, true);
  assert.deepEqual(fetched.data.all, ['veo-3.1', 'gpt-image-1']);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, '/v1/models');
  assert.equal(seen[0].authorization, 'Bearer classified-veo-secret');
});

test('settings model fetch can use the LLM key with the LLM base URL', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-llm-models-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const seen = [];
  const express = require('express');
  const upstream = express();
  upstream.get('/v1/models', (req, res) => {
    const authorization = req.get('authorization') || '';
    seen.push({
      path: req.path,
      authorization,
    });
    res.json({
      data: authorization === 'Bearer common-secret'
        ? [{ id: 'common-chat', object: 'model' }]
        : [
            { id: 'custom-chat-a', object: 'model' },
            { id: 'custom-chat-b', object: 'model' },
          ],
    });
  });
  const upstreamServer = await listen(upstream);
  t.after(() => upstreamServer.close());
  const llmBase = `http://127.0.0.1:${upstreamServer.address().port}/v1`;

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_LOCAL_SAVE_DIR: config.DEFAULT_LOCAL_SAVE_DIR,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    DEFAULT_THEME_TEMPLATE_DIR: config.DEFAULT_THEME_TEMPLATE_DIR,
  };
  t.after(() => Object.assign(config, oldConfig));
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(tmpDir, 'save');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(tmpDir, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(tmpDir, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(tmpDir, 'themes');

  const settingsPath = require.resolve('../backend/src/routes/settings.js');
  delete require.cache[settingsPath];
  const settingsRouter = require('../backend/src/routes/settings.js');
  settingsRouter.saveSettings({
    ...settingsRouter.loadSettings({ persistMigrations: false }),
    zhenzhenBaseUrl: llmBase,
    zhenzhenApiKey: 'common-secret',
    llmBaseUrl: llmBase,
    llmApiKey: 'llm-secret',
  });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/settings', settingsRouter);
  const server = await listen(app);
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/api/settings/zhenzhen-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKeyField: 'zhenzhenApiKey', timeoutMs: 3000 }),
  });
  const fetched = await fetch(`${base}/api/settings/zhenzhen-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKeyField: 'llmApiKey',
      timeoutMs: 3000,
    }),
  }).then((res) => res.json());

  assert.equal(fetched.success, true);
  assert.equal(fetched.data.ok, true);
  assert.deepEqual(fetched.data.all, ['custom-chat-a', 'custom-chat-b']);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].authorization, 'Bearer common-secret');
  assert.equal(seen[1].path, '/v1/models');
  assert.equal(seen[1].authorization, 'Bearer llm-secret');

  const stored = settingsRouter.loadSettings({ persistMigrations: false });
  assert.deepEqual(stored.zhenzhenModelCatalog.all, ['common-chat']);
  assert.deepEqual(stored.llmModelCatalog.chatModels, ['custom-chat-a', 'custom-chat-b']);
});
