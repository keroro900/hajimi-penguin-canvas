import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');

test('default zhenzhen storage uses existing legacy drive or falls back to user home', () => {
  if (process.platform !== 'win32') {
    assert.equal(config.DEFAULT_LOCAL_SAVE_DIR, path.join(os.homedir(), 'zhenzhen'));
    return;
  }

  const legacyRootExists = fs.existsSync('D:\\');
  if (legacyRootExists) {
    assert.equal(config.DEFAULT_LOCAL_SAVE_DIR, 'D:\\zhenzhen');
  } else {
    assert.equal(config.DEFAULT_LOCAL_SAVE_DIR, path.join(os.homedir(), 'zhenzhen'));
    assert.equal(config.DEFAULT_RESOURCE_LIBRARY_DIR, path.join(os.homedir(), 'zhenzhen', 'resources'));
  }
});
