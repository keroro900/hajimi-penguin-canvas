'use strict';

const os = require('os');
const path = require('path');
const config = require('../config');

const CUSTOM_NODE_ALLOWED_PERMISSIONS = ['proxy', 'pluginData', 'readInputs', 'writeOutputs'];
const CUSTOM_NODE_ALLOWED_PERMISSION_SET = new Set(CUSTOM_NODE_ALLOWED_PERMISSIONS);
const DEFAULT_CUSTOM_NODE_AGENT_MODE = 'reviewed';
const SAFE_ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
const SAFE_NODE_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const NODE_CATEGORIES = new Set([
  'core',
  'rh',
  'fal',
  'grok',
  'codex',
  'inspiration',
  'comfyui',
  'special',
  'utility',
  'auxiliary',
  'toolbox',
  '3d',
  'input',
  'custom',
]);

function defaultCustomNodePluginRoot() {
  const configured = String(process.env.T8_CUSTOM_NODE_PLUGIN_ROOT || '').trim();
  if (configured) return path.resolve(configured);
  const home = os.homedir() || process.env.USERPROFILE || process.env.HOME || config.BASE_DIR;
  return path.resolve(home, 'hajimi', 'node-plugins');
}

function cleanPathText(value) {
  return String(value || '').trim().replace(/\0/g, '');
}

function normalizeCustomNodeWorkshopSettings(raw = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const root = cleanPathText(value.pluginRoot) || defaultCustomNodePluginRoot();
  const agentMode = value.agentMode === DEFAULT_CUSTOM_NODE_AGENT_MODE ? value.agentMode : DEFAULT_CUSTOM_NODE_AGENT_MODE;
  return {
    enabled: value.enabled === true,
    pluginRoot: path.resolve(root),
    agentMode,
  };
}

function isSafeRelativePath(value) {
  const text = cleanPathText(value).replace(/\\/g, '/');
  if (!text || text.startsWith('/') || /^[a-zA-Z]:\//.test(text)) return false;
  const normalized = path.posix.normalize(text);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') return false;
  return normalized === text || normalized.replace(/^\.\//, '') === text.replace(/^\.\//, '');
}

function normalizeStringList(value, limit = 16) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of value) {
    const text = String(raw || '').trim();
    if (!text || text.length > 64 || /[\x00-\x1f\x7f]/.test(text) || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function parseVersionParts(value) {
  return String(value || '')
    .trim()
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

function compareVersions(a, b) {
  const av = parseVersionParts(a);
  const bv = parseVersionParts(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (av[i] || 0) - (bv[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function validateCustomNodePluginManifest(raw, options = {}) {
  const errors = [];
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const id = String(source.id || '').trim();
  const version = String(source.version || '').trim();
  const appVersion = String(options.appVersion || config.APP_VERSION || '').trim();

  if (!SAFE_ID_RE.test(id)) errors.push('id must be a lowercase plugin id like demo-cat');
  if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) errors.push('version must be semver-like, for example 1.0.0');

  const frontendEntry = source.frontend && typeof source.frontend === 'object' ? source.frontend.entry : '';
  const backendEntry = source.backend && typeof source.backend === 'object' ? source.backend.entry : '';
  if (!isSafeRelativePath(frontendEntry)) errors.push('frontend.entry must be a safe relative path');
  if (!isSafeRelativePath(backendEntry)) errors.push('backend.entry must be a safe relative path');

  const permissions = normalizeStringList(source.permissions, 16);
  for (const permission of permissions) {
    if (!CUSTOM_NODE_ALLOWED_PERMISSION_SET.has(permission)) {
      errors.push(`permission "${permission}" is not allowed`);
    }
  }

  const compatibility = source.compatibility && typeof source.compatibility === 'object' ? source.compatibility : {};
  const minAppVersion = String(compatibility.minAppVersion || '').trim();
  if (minAppVersion && appVersion && compareVersions(appVersion, minAppVersion) < 0) {
    errors.push(`plugin requires app version >= ${minAppVersion}`);
  }

  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  if (rawNodes.length === 0) errors.push('nodes must contain at least one node');
  if (rawNodes.length > 32) errors.push('nodes must contain at most 32 nodes');

  const nodeIds = new Set();
  const nodes = [];
  for (const rawNode of rawNodes.slice(0, 32)) {
    const node = rawNode && typeof rawNode === 'object' && !Array.isArray(rawNode) ? rawNode : {};
    const nodeId = String(node.id || '').trim();
    if (!SAFE_NODE_ID_RE.test(nodeId)) {
      errors.push('node id must be lowercase alphanumeric with dashes');
      continue;
    }
    if (nodeIds.has(nodeId)) {
      errors.push(`duplicate node id "${nodeId}"`);
      continue;
    }
    nodeIds.add(nodeId);
    const label = String(node.label || nodeId).trim().slice(0, 80);
    const category = NODE_CATEGORIES.has(String(node.category || 'custom')) ? String(node.category || 'custom') : 'custom';
    const description = String(node.description || '').trim().slice(0, 240);
    const icon = String(node.icon || 'Plug').trim().slice(0, 64);
    const color = String(node.color || 'slate').trim().slice(0, 32);
    nodes.push({
      id: nodeId,
      type: `custom:${id}:${nodeId}`,
      label,
      category,
      description,
      icon,
      color,
      inputs: normalizeStringList(node.inputs, 16),
      outputs: normalizeStringList(node.outputs, 16),
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    manifest: {
      id,
      version,
      name: String(source.name || id).trim().slice(0, 100),
      nodes,
      frontend: { entry: cleanPathText(frontendEntry).replace(/\\/g, '/') },
      backend: { entry: cleanPathText(backendEntry).replace(/\\/g, '/') },
      permissions,
      compatibility: {
        minAppVersion,
      },
    },
  };
}

module.exports = {
  CUSTOM_NODE_ALLOWED_PERMISSIONS,
  DEFAULT_CUSTOM_NODE_AGENT_MODE,
  defaultCustomNodePluginRoot,
  normalizeCustomNodeWorkshopSettings,
  validateCustomNodePluginManifest,
  compareVersions,
};
