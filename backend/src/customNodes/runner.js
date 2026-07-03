'use strict';

const path = require('path');
const { fork } = require('child_process');

const WORKER_PATH = path.join(__dirname, 'worker.cjs');

function createIsolatedCustomNodeRunner(options = {}) {
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 10000, 250), 60000);

  async function call(plugin, method, payload = {}) {
    if (!plugin || plugin.status !== 'valid' || !plugin.manifest) {
      return { ok: false, code: 'invalid_plugin', error: 'Plugin is not valid' };
    }
    if (!plugin.backendEntryAbs) {
      return { ok: false, code: 'missing_backend_entry', error: 'Plugin backend entry is missing' };
    }

    const backendEntry = path.relative(plugin.pluginDir, plugin.backendEntryAbs);
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      let receivedResult = false;
      const child = fork(WORKER_PATH, [], {
        cwd: plugin.pluginDir,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        windowsHide: true,
        env: {
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        resolve({ ok: false, code: 'plugin_timeout', error: `Plugin timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      function settle(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }

      child.on('message', (message) => {
        if (settled || message?.id !== id) return;
        receivedResult = true;
        clearTimeout(timer);
        const result = message.ok
          ? { ok: true, data: message.data }
          : { ok: false, code: message.code || 'plugin_runtime_error', error: message.error || 'Plugin failed' };
        const exitWait = setTimeout(() => {
          child.kill('SIGTERM');
          settle(result);
        }, 500);
        child.once('exit', () => {
          clearTimeout(exitWait);
          settle(result);
        });
      });

      child.on('error', (error) => {
        settle({ ok: false, code: 'plugin_process_error', error: error?.message || String(error) });
      });

      child.on('exit', (code, signal) => {
        if (receivedResult) return;
        if (settled) return;
        settle({ ok: false, code: 'plugin_process_exit', error: `Plugin process exited (${code ?? signal ?? 'unknown'})` });
      });

      child.send({
        id,
        pluginId: plugin.id,
        pluginDir: plugin.pluginDir,
        backendEntry,
        method,
        payload,
        permissions: plugin.manifest.permissions,
        dataDir: path.join(plugin.pluginDir, 'data'),
      });
    });
  }

  return { call };
}

module.exports = {
  createIsolatedCustomNodeRunner,
};
