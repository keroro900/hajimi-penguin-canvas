import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function freshRequire(rel: string) {
  const id = require.resolve(rel);
  delete require.cache[id];
  return require(rel);
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function validManifest(overrides: Record<string, any> = {}) {
  return {
    id: 'demo-cat',
    version: '1.0.0',
    name: 'Demo Cat',
    nodes: [
      {
        id: 'cat',
        label: 'Cat Node',
        category: 'utility',
        description: 'Adds a custom cat node',
        icon: 'Box',
        color: 'sky',
        inputs: ['text'],
        outputs: ['image'],
      },
    ],
    frontend: { entry: 'frontend/index.js' },
    backend: { entry: 'backend/index.cjs' },
    permissions: ['proxy', 'pluginData', 'readInputs', 'writeOutputs'],
    compatibility: { minAppVersion: '2.3.0' },
    ...overrides,
  };
}

test('custom node workshop settings default to disabled with an external plugin root', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-custom-settings-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const config = require('../backend/src/config.js');
  const oldSettingsFile = config.SETTINGS_FILE;
  t.after(() => {
    config.SETTINGS_FILE = oldSettingsFile;
  });
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');

  const settingsRouter = freshRequire('../backend/src/routes/settings.js');
  const settings = settingsRouter.loadSettings({ persistMigrations: false });
  const workshop = settings.customNodeWorkshop;

  assert.equal(workshop.enabled, false);
  assert.equal(workshop.agentMode, 'reviewed');
  assert.equal(path.isAbsolute(workshop.pluginRoot), true);
  assert.equal(path.resolve(workshop.pluginRoot).startsWith(path.resolve(process.cwd()) + path.sep), false);
});

test('custom node manifests accept safe plugins and reject unsafe boundaries', () => {
  const {
    validateCustomNodePluginManifest,
    CUSTOM_NODE_ALLOWED_PERMISSIONS,
  } = require('../backend/src/customNodes/manifest.js');

  assert.deepEqual(CUSTOM_NODE_ALLOWED_PERMISSIONS, ['proxy', 'pluginData', 'readInputs', 'writeOutputs']);

  const valid = validateCustomNodePluginManifest(validManifest(), { appVersion: '2.3.7' });
  assert.equal(valid.ok, true);
  assert.equal(valid.manifest.nodes[0].type, 'custom:demo-cat:cat');
  assert.deepEqual(valid.manifest.permissions, ['proxy', 'pluginData', 'readInputs', 'writeOutputs']);

  const badPermission = validateCustomNodePluginManifest(validManifest({ permissions: ['shell'] }));
  assert.equal(badPermission.ok, false);
  assert.match(badPermission.errors.join('\n'), /permission/i);

  const badPath = validateCustomNodePluginManifest(validManifest({ backend: { entry: '../escape.cjs' } }));
  assert.equal(badPath.ok, false);
  assert.match(badPath.errors.join('\n'), /path/i);

  const duplicateNodes = validateCustomNodePluginManifest(validManifest({
    nodes: [
      validManifest().nodes[0],
      { ...validManifest().nodes[0], label: 'Duplicate' },
    ],
  }));
  assert.equal(duplicateNodes.ok, false);
  assert.match(duplicateNodes.errors.join('\n'), /duplicate/i);
});

test('custom node plugin store discovers plugins and persists enabled state outside plugin folders', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-custom-store-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  writeJson(path.join(tmpDir, 'demo-cat', 'manifest.json'), validManifest());
  writeJson(path.join(tmpDir, 'bad-plugin', 'manifest.json'), validManifest({ id: 'bad plugin' }));

  const { createCustomNodePluginStore } = require('../backend/src/customNodes/pluginStore.js');
  const store = createCustomNodePluginStore({ pluginRoot: tmpDir, appVersion: '2.3.7' });

  const initial = await store.listPlugins();
  assert.equal(initial.find((plugin: any) => plugin.id === 'demo-cat')?.enabled, false);
  assert.equal(initial.find((plugin: any) => plugin.directoryName === 'bad-plugin')?.status, 'invalid');

  const enabled = await store.setPluginEnabled('demo-cat', true);
  assert.equal(enabled.ok, true);

  const afterEnable = await store.listPlugins();
  assert.equal(afterEnable.find((plugin: any) => plugin.id === 'demo-cat')?.enabled, true);
  assert.equal(fs.existsSync(path.join(tmpDir, 'demo-cat', 'active.json')), false);
  assert.equal(fs.existsSync(path.join(tmpDir, '.t8-custom-node-workshop.json')), true);
});

test('isolated custom node runner returns plugin failures without crashing the host', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-custom-runner-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pluginDir = path.join(tmpDir, 'demo-cat');
  writeJson(path.join(pluginDir, 'manifest.json'), validManifest());
  fs.mkdirSync(path.join(pluginDir, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'backend', 'index.cjs'), `
exports.health = async () => ({ ok: true, service: 'demo-cat' });
exports.runNode = async (payload) => ({ ok: true, echo: payload.input });
exports.validate = async () => { throw new Error('validation exploded'); };
`, 'utf8');

  const { createCustomNodePluginStore } = require('../backend/src/customNodes/pluginStore.js');
  const { createIsolatedCustomNodeRunner } = require('../backend/src/customNodes/runner.js');
  const store = createCustomNodePluginStore({ pluginRoot: tmpDir, appVersion: '2.3.7' });
  const plugin = await store.getPlugin('demo-cat');
  assert.equal(plugin.status, 'valid');

  const runner = createIsolatedCustomNodeRunner({ timeoutMs: 1500 });
  const ok = await runner.call(plugin, 'runNode', { input: 'meow' });
  assert.deepEqual(ok, { ok: true, data: { ok: true, echo: 'meow' } });

  const failed = await runner.call(plugin, 'validate', {});
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'plugin_runtime_error');
  assert.match(failed.error, /validation exploded/);
});

test('custom node workshop API gates plugin operations behind the advanced switch', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-custom-api-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pluginDir = path.join(tmpDir, 'demo-cat');
  writeJson(path.join(pluginDir, 'manifest.json'), validManifest());
  fs.mkdirSync(path.join(pluginDir, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'backend', 'index.cjs'), `
exports.runNode = async (payload) => ({ ok: true, value: payload.input });
`, 'utf8');

  const config = require('../backend/src/config.js');
  const oldSettingsFile = config.SETTINGS_FILE;
  t.after(() => {
    config.SETTINGS_FILE = oldSettingsFile;
  });
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');

  const express = require('express');
  const settingsRouter = freshRequire('../backend/src/routes/settings.js');
  const workshopRouter = freshRequire('../backend/src/routes/customNodeWorkshop.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/settings', settingsRouter);
  app.use('/api/custom-node-workshop', workshopRouter);
  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(`${base}/api/custom-node-workshop/status`).then((res) => res.json());
  assert.equal(status.success, true);
  assert.equal(status.data.enabled, false);

  const disabledList = await fetch(`${base}/api/custom-node-workshop/plugins`);
  assert.equal(disabledList.status, 403);

  await fetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customNodeWorkshop: {
        enabled: true,
        pluginRoot: tmpDir,
        agentMode: 'reviewed',
      },
    }),
  }).then((res) => res.json());

  const plugins = await fetch(`${base}/api/custom-node-workshop/plugins`).then((res) => res.json());
  assert.equal(plugins.success, true);
  assert.equal(plugins.data.plugins.find((plugin: any) => plugin.id === 'demo-cat')?.enabled, false);

  const validate = await fetch(`${base}/api/custom-node-workshop/plugins/demo-cat/validate`, {
    method: 'POST',
  }).then((res) => res.json());
  assert.equal(validate.success, true);
  assert.equal(validate.data.plugin.status, 'valid');

  const enable = await fetch(`${base}/api/custom-node-workshop/plugins/demo-cat/enabled`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  }).then((res) => res.json());
  assert.equal(enable.success, true);
  assert.equal(enable.data.plugin.enabled, true);

  const run = await fetch(`${base}/api/custom-node-workshop/plugins/demo-cat/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'runNode', payload: { input: 'meow' } }),
  }).then((res) => res.json());
  assert.deepEqual(run, { success: true, data: { ok: true, value: 'meow' } });
});
