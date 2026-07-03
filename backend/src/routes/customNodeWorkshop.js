'use strict';

const express = require('express');
const config = require('../config');
const settingsRouter = require('./settings');
const { normalizeCustomNodeWorkshopSettings } = require('../customNodes/manifest');
const { createCustomNodePluginStore } = require('../customNodes/pluginStore');
const { createIsolatedCustomNodeRunner } = require('../customNodes/runner');

const router = express.Router();
const ALLOWED_METHODS = new Set(['runNode', 'validate', 'health']);

function currentWorkshopSettings() {
  const settings = settingsRouter.loadSettings({ persistMigrations: false });
  return normalizeCustomNodeWorkshopSettings(settings.customNodeWorkshop);
}

function createStoreForSettings(workshop) {
  return createCustomNodePluginStore({
    pluginRoot: workshop.pluginRoot,
    appVersion: config.APP_VERSION,
  });
}

function publicPlugin(plugin) {
  return {
    id: plugin.id,
    version: plugin.version,
    name: plugin.name,
    directoryName: plugin.directoryName,
    status: plugin.status,
    enabled: plugin.enabled === true,
    manifest: plugin.manifest,
    errors: Array.isArray(plugin.errors) ? plugin.errors : [],
  };
}

function ensureEnabled(res) {
  const workshop = currentWorkshopSettings();
  if (!workshop.enabled) {
    res.status(403).json({
      success: false,
      code: 'custom_node_workshop_disabled',
      error: '自定义节点工坊未启用',
    });
    return null;
  }
  return workshop;
}

router.get('/status', (_req, res) => {
  const workshop = currentWorkshopSettings();
  res.json({
    success: true,
    data: {
      enabled: workshop.enabled,
      pluginRoot: workshop.pluginRoot,
      agentMode: workshop.agentMode,
    },
  });
});

router.get('/plugins', async (_req, res) => {
  const workshop = ensureEnabled(res);
  if (!workshop) return;
  try {
    const store = createStoreForSettings(workshop);
    const plugins = await store.listPlugins();
    res.json({
      success: true,
      data: {
        pluginRoot: store.pluginRoot,
        plugins: plugins.map(publicPlugin),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, code: 'custom_node_plugin_list_failed', error: error?.message || '插件列表读取失败' });
  }
});

router.post('/plugins/:id/enabled', async (req, res) => {
  const workshop = ensureEnabled(res);
  if (!workshop) return;
  try {
    const store = createStoreForSettings(workshop);
    const result = await store.setPluginEnabled(String(req.params.id || ''), req.body?.enabled === true);
    if (!result.ok) {
      return res.status(400).json({ success: false, code: result.code, error: result.error });
    }
    res.json({ success: true, data: { plugin: publicPlugin(result.plugin) } });
  } catch (error) {
    res.status(500).json({ success: false, code: 'custom_node_plugin_enable_failed', error: error?.message || '插件启用状态更新失败' });
  }
});

router.post('/plugins/:id/validate', async (req, res) => {
  const workshop = ensureEnabled(res);
  if (!workshop) return;
  try {
    const store = createStoreForSettings(workshop);
    const plugin = await store.getPlugin(String(req.params.id || ''));
    if (plugin.status === 'missing') {
      return res.status(404).json({ success: false, code: 'custom_node_plugin_not_found', error: '插件不存在' });
    }
    res.json({ success: true, data: { plugin: publicPlugin(plugin) } });
  } catch (error) {
    res.status(500).json({ success: false, code: 'custom_node_plugin_validate_failed', error: error?.message || '插件校验失败' });
  }
});

router.post('/plugins/:id/run', async (req, res) => {
  const workshop = ensureEnabled(res);
  if (!workshop) return;
  const method = String(req.body?.method || 'runNode').trim();
  if (!ALLOWED_METHODS.has(method)) {
    return res.status(400).json({ success: false, code: 'custom_node_method_not_allowed', error: '插件方法不在允许列表内' });
  }
  try {
    const store = createStoreForSettings(workshop);
    const plugin = await store.getPlugin(String(req.params.id || ''));
    if (plugin.status !== 'valid') {
      return res.status(404).json({ success: false, code: 'custom_node_plugin_not_found', error: '插件不存在或 manifest 无效' });
    }
    if (!plugin.enabled) {
      return res.status(403).json({ success: false, code: 'custom_node_plugin_disabled', error: '插件未启用' });
    }
    const runner = createIsolatedCustomNodeRunner({ timeoutMs: Number(req.body?.timeoutMs) || 10000 });
    const result = await runner.call(plugin, method, req.body?.payload || {});
    if (!result.ok) {
      return res.status(200).json({ success: true, data: result });
    }
    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, code: 'custom_node_plugin_run_failed', error: error?.message || '插件运行失败' });
  }
});

module.exports = router;
