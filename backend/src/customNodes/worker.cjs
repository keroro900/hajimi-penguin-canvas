'use strict';

const path = require('path');

function resolveInside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Plugin entry escaped plugin directory');
  }
  return resolved;
}

async function handle(message) {
  const id = message?.id;
  try {
    const pluginDir = String(message?.pluginDir || '');
    const backendEntry = String(message?.backendEntry || '');
    const method = String(message?.method || '');
    if (!pluginDir || !backendEntry || !method) {
      throw new Error('Missing plugin call parameters');
    }
    const entry = resolveInside(pluginDir, backendEntry);
    const plugin = require(entry);
    const handler = plugin?.[method];
    if (typeof handler !== 'function') {
      throw new Error(`Plugin method "${method}" is not exported`);
    }
    const data = await handler({
      ...(message.payload && typeof message.payload === 'object' ? message.payload : {}),
      context: {
        pluginId: message.pluginId,
        permissions: Array.isArray(message.permissions) ? message.permissions : [],
        dataDir: message.dataDir,
      },
    });
    process.send?.({ id, ok: true, data });
  } catch (error) {
    process.send?.({
      id,
      ok: false,
      code: 'plugin_runtime_error',
      error: error?.message || String(error),
    });
  }
}

process.on('message', (message) => {
  handle(message).finally(() => {
    setImmediate(() => process.exit(0));
  });
});
