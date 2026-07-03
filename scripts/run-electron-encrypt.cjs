'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const electronCli = path.join(root, 'node_modules', 'electron', 'cli.js');

if (!fs.existsSync(electronCli)) {
  console.error(`[encrypt] Electron CLI not found: ${electronCli}`);
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const launcher = path.join(os.tmpdir(), `t8-electron-encrypt-${process.pid}.cjs`);
fs.writeFileSync(launcher, `
const path = require('path');
const root = ${JSON.stringify(root)};
const encrypt = require(path.join(root, 'electron', 'encrypt.cjs'));
Promise.resolve(encrypt.main())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[encrypt] FAILED:', error && error.stack ? error.stack : error);
    process.exit(1);
  });
`, 'utf8');

const result = spawnSync(process.execPath, [electronCli, launcher], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: false,
});

try { fs.rmSync(launcher, { force: true }); } catch (_) {}

if (result.error) {
  console.error(`[encrypt] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
