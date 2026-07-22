import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');

test('packaged storage stays under Electron userData while legacy drive remains migration-only', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-user-data-'));
  const configPath = path.resolve('backend/src/config.js');
  const script = `const c=require(${JSON.stringify(configPath)}); process.stdout.write(JSON.stringify({root:c.DEFAULT_LOCAL_SAVE_DIR,resources:c.DEFAULT_RESOURCE_LIBRARY_DIR,legacy:c.LEGACY_WINDOWS_DEFAULT_ROOT}))`;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, T8PC_PACKAGED: '1', T8PC_USER_DATA: userData, HAJIMI_DEFAULT_ROOT: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  const packaged = JSON.parse(result.stdout);
  assert.equal(packaged.root, path.join(userData, 'hajimi'));
  assert.equal(packaged.resources, path.join(userData, 'hajimi', 'resources'));
  assert.equal(packaged.legacy, 'D:\\zhenzhen');
  assert.equal(config.DEFAULT_LOCAL_SAVE_DIR, path.join(os.homedir(), 'hajimi'));
});
