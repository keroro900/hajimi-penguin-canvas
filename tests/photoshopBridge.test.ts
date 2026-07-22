import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function read(rel: string) {
  return readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

function exists(rel: string) {
  return existsSync(path.resolve(process.cwd(), rel));
}

test('Photoshop bridge backend route is mounted and packaged', () => {
  const server = read('backend/src/server.js');
  const route = read('backend/src/routes/photoshopBridge.js');
  const pkg = read('package.json');
  const postBuild = read('electron/_post_build.cjs');

  assert.match(server, /photoshopBridgeRouter\s*=\s*require\('\.\/routes\/photoshopBridge'\)/);
  assert.match(server, /app\.use\('\/api\/photoshop-bridge',\s*photoshopBridgeRouter\)/);
  assert.match(route, /router\.post\('\/send-to-photoshop'/);
  assert.match(route, /router\.get\('\/commands\/pending'/);
  assert.match(route, /router\.post\('\/messages\/:messageId\/complete'/);
  assert.match(route, /router\.post\('\/image'/);
  assert.match(route, /service:\s*'hakimi-photoshop-bridge'/);
  assert.match(pkg, /"from":\s*"tools\/photoshop-bridge"/);
  assert.match(postBuild, /photoshopBridge\.t8c/);
  assert.match(postBuild, /checkPhotoshopBridgeRuntime/);
});

test('Photoshop bridge plugin uses Hakimi branding and expected files', () => {
  const manifest = JSON.parse(read('tools/photoshop-bridge/plugin/manifest.json'));
  const html = read('tools/photoshop-bridge/plugin/index.html');
  const net = read('tools/photoshop-bridge/plugin/js/net.js');
  const app = read('tools/photoshop-bridge/plugin/js/app.js');
  const ps = read('tools/photoshop-bridge/plugin/js/ps.js');

  assert.equal(manifest.id, 'cn.hajimi.canvas.photoshop-bridge');
  assert.equal(manifest.name, 'Hakimi Photoshop Link');
  assert.match(html, /哈基米画布/);
  assert.match(net, /hakimi-photoshop-bridge/);
  assert.match(app, /哈基米画布/);
  assert.match(ps, /hajimi_/);
  assert.equal(exists('tools/photoshop-bridge/plugin/style.css'), true);
  assert.equal(exists('tools/photoshop-bridge/plugin/js/state.js'), true);
});

test('Canvas can import from and send to Photoshop bridge', () => {
  const canvas = read('src/components/Canvas.tsx');
  const modal = read('src/components/SendMaterialsModal.tsx');
  const api = read('src/services/api.ts');
  const util = read('src/utils/photoshopBridge.ts');

  assert.match(canvas, /PHOTOSHOP_MESSAGE_CONTRACT/);
  assert.match(canvas, /importPhotoshopPayload/);
  assert.match(canvas, /\/api\/photoshop-bridge\/pending\?limit=12/);
  assert.match(canvas, /handleSendMaterialsToPhotoshop/);
  assert.match(canvas, /onSendToPhotoshop=\{handleSendMaterialsToPhotoshop\}/);
  assert.match(modal, /PHOTOSHOP_PLUGIN_IMPORT_HINT/);
  assert.match(modal, /发送到 Photoshop/);
  assert.match(api, /sendToPhotoshop/);
  assert.match(util, /buildPhotoshopSendNodeSpecs/);
});
