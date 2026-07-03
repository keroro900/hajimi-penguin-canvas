const { readdirSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const testsDir = path.join(rootDir, 'tests');
const requested = process.argv.slice(2);

const testFiles = requested.length > 0
  ? requested
  : readdirSync(testsDir)
      .filter((name) => name.endsWith('.test.ts'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => path.join('tests', name));

if (testFiles.length === 0) {
  console.error('[run-tests] No test files found.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(`[run-tests] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
