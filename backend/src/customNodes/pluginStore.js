'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { validateCustomNodePluginManifest } = require('./manifest');

const STATE_FILE_NAME = '.t8-custom-node-workshop.json';

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function resolveInside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    return '';
  }
  return resolved;
}

function loadState(stateFile) {
  const state = readJson(stateFile, {});
  return {
    enabledPlugins: state && typeof state.enabledPlugins === 'object' && !Array.isArray(state.enabledPlugins)
      ? state.enabledPlugins
      : {},
  };
}

function pluginSummaryFromDirectory(pluginRoot, directoryName, state, appVersion) {
  const pluginDir = path.join(pluginRoot, directoryName);
  const manifestPath = path.join(pluginDir, 'manifest.json');
  const raw = readJson(manifestPath, null);
  const validation = validateCustomNodePluginManifest(raw, { appVersion });
  if (!validation.ok) {
    return {
      id: '',
      directoryName,
      pluginDir,
      manifestPath,
      status: 'invalid',
      enabled: false,
      errors: validation.errors,
    };
  }

  const manifest = validation.manifest;
  const backendEntryAbs = resolveInside(pluginDir, manifest.backend.entry);
  const frontendEntryAbs = resolveInside(pluginDir, manifest.frontend.entry);
  if (!backendEntryAbs || !frontendEntryAbs) {
    return {
      id: manifest.id,
      directoryName,
      pluginDir,
      manifestPath,
      status: 'invalid',
      enabled: false,
      errors: ['entry paths must stay inside plugin directory'],
    };
  }

  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    directoryName,
    pluginDir,
    manifestPath,
    backendEntryAbs,
    frontendEntryAbs,
    status: 'valid',
    enabled: state.enabledPlugins?.[manifest.id] === manifest.version,
    manifest,
    errors: [],
  };
}

function createCustomNodePluginStore(options = {}) {
  const pluginRoot = path.resolve(String(options.pluginRoot || ''));
  const appVersion = String(options.appVersion || config.APP_VERSION || '0.0.0');
  const stateFile = path.join(pluginRoot, STATE_FILE_NAME);

  function ensureRoot() {
    if (!fs.existsSync(pluginRoot)) fs.mkdirSync(pluginRoot, { recursive: true });
  }

  async function listPlugins() {
    ensureRoot();
    const state = loadState(stateFile);
    return fs.readdirSync(pluginRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => pluginSummaryFromDirectory(pluginRoot, entry.name, state, appVersion))
      .sort((a, b) => String(a.id || a.directoryName).localeCompare(String(b.id || b.directoryName)));
  }

  async function getPlugin(id) {
    const plugins = await listPlugins();
    return plugins.find((plugin) => plugin.id === id) || {
      id,
      status: 'missing',
      enabled: false,
      errors: ['plugin not found'],
    };
  }

  async function setPluginEnabled(id, enabled) {
    ensureRoot();
    const plugin = await getPlugin(id);
    if (plugin.status !== 'valid') {
      return { ok: false, code: 'invalid_plugin', error: plugin.errors?.join('; ') || 'plugin is not valid' };
    }
    const state = loadState(stateFile);
    const enabledPlugins = { ...state.enabledPlugins };
    if (enabled) enabledPlugins[plugin.id] = plugin.version;
    else delete enabledPlugins[plugin.id];
    writeJson(stateFile, { enabledPlugins });
    return { ok: true, plugin: { ...plugin, enabled: !!enabled } };
  }

  return {
    pluginRoot,
    stateFile,
    listPlugins,
    getPlugin,
    setPluginEnabled,
  };
}

module.exports = {
  STATE_FILE_NAME,
  createCustomNodePluginStore,
};
