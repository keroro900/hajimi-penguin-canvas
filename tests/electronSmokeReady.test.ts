import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('smoke readiness only writes the exact marker inside the requested user-data directory', () => {
  const smokeReady = require('../electron/smoke-ready.cjs');
  const userData = mkdtempSync(join(tmpdir(), 't8-smoke-ready-'));
  const marker = join(userData, 'ready.json');

  assert.deepEqual(
    smokeReady.resolveSmokeReadyRequest([
      'JIMI AI.exe',
      `--user-data-dir=${userData}`,
      `--t8-smoke-ready=${marker}`,
    ]),
    { userData, marker },
  );
  assert.equal(smokeReady.writeSmokeReadyMarker({
    argv: ['JIMI AI.exe', `--user-data-dir=${userData}`, `--t8-smoke-ready=${marker}`],
    version: '2.4.1',
  }), true);
  assert.deepEqual(JSON.parse(readFileSync(marker, 'utf8')), { version: '2.4.1' });
});

test('smoke readiness rejects traversal, relative paths, and duplicate control arguments', () => {
  const smokeReady = require('../electron/smoke-ready.cjs');
  const userData = mkdtempSync(join(tmpdir(), 't8-smoke-ready-reject-'));
  const outside = join(tmpdir(), 'ready.json');
  const validMarker = join(userData, 'ready.json');

  for (const argv of [
    ['JIMI AI.exe', '--user-data-dir=relative', '--t8-smoke-ready=relative/ready.json'],
    ['JIMI AI.exe', `--user-data-dir=${userData}`, `--t8-smoke-ready=${outside}`],
    ['JIMI AI.exe', `--user-data-dir=${userData}`, `--user-data-dir=${userData}`, `--t8-smoke-ready=${validMarker}`],
    ['JIMI AI.exe', `--user-data-dir=${userData}`, `--t8-smoke-ready=${validMarker}`, `--t8-smoke-ready=${validMarker}`],
  ]) {
    assert.equal(smokeReady.resolveSmokeReadyRequest(argv), null);
    assert.equal(smokeReady.writeSmokeReadyMarker({ argv, version: '2.4.1' }), false);
  }
});
