import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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
      rhBaseUrl: 'https://rh.user.example',
    };
    settings.saveSettings(custom);

    const loaded = settings.loadSettings({ persistMigrations: false });

    assert.equal(loaded.zhenzhenBaseUrl, 'https://api.user.example');
    assert.equal(loaded.llmBaseUrl, 'https://llm.user.example/v1');
    assert.equal(loaded.rhBaseUrl, 'https://rh.user.example');
  } finally {
    if (previousPackaged === undefined) delete process.env.T8PC_PACKAGED;
    else process.env.T8PC_PACKAGED = previousPackaged;
    if (previousUserData === undefined) delete process.env.T8PC_USER_DATA;
    else process.env.T8PC_USER_DATA = previousUserData;
  }
});
