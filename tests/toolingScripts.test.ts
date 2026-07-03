import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('package exposes merge-friendly verification scripts without requiring missing eslint binary', () => {
  const pkg = JSON.parse(read('../package.json'));

  assert.equal(pkg.scripts.test, 'node scripts/run-tests.cjs');
  assert.equal(pkg.scripts.verify, 'npm run type-check && npm run test && npm run public:check');
  assert.equal(pkg.scripts.lint, 'npm run type-check && npm run public:check');
  assert.doesNotMatch(pkg.scripts.lint, /\beslint\b/);
});

test('run-tests script collects node:test TypeScript files and forwards selected arguments', () => {
  const scriptPath = new URL('../scripts/run-tests.cjs', import.meta.url);
  assert.equal(existsSync(scriptPath), true);
  const source = read('../scripts/run-tests.cjs');

  assert.match(source, /readdirSync\(testsDir/);
  assert.match(source, /\.test\.ts/);
  assert.match(source, /spawnSync\(process\.execPath/);
  assert.match(source, /'--test'/);
  assert.match(source, /process\.argv\.slice\(2\)/);
});

test('public clean check tolerates exported source archives without git metadata', () => {
  const source = read('../scripts/check-public-clean.cjs');

  assert.match(source, /function hasGitMetadata/);
  assert.match(source, /public-check] no git metadata/);
  assert.match(source, /scanDeniedPathPresence/);
});
