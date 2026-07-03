import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const expectedNodeTypes = Array.from(read('../src/config/portTypes.ts').matchAll(/^\s*['"]?([a-z0-9-]+)['"]?:\s*\{\s*inputs:/gmi))
  .map((match) => match[1])
  .filter((type) => !['inputs'].includes(type))
  .sort((a, b) => a.localeCompare(b));

test('Hakimi MCP catalog exposes every canvas node type with ports', async () => {
  const { buildHakimiCanvasCatalog } = await import('../tools/hakimi-mcp/src/canvasCatalog.mjs');

  const catalog = buildHakimiCanvasCatalog({
    nodeRegistrySource: read('../src/config/nodeRegistry.ts'),
    portTypesSource: read('../src/config/portTypes.ts'),
  });

  const catalogTypes = catalog.nodes.map((node: any) => node.type).sort((a: string, b: string) => a.localeCompare(b));
  assert.deepEqual(catalogTypes, expectedNodeTypes);
  assert.equal(catalog.name, '哈基米画布');
  assert.ok(catalog.nodes.length > 40);
  assert.deepEqual(catalog.ports.image, { inputs: ['text', 'image'], outputs: ['image'] });
  assert.deepEqual(catalog.ports.video.outputs, ['video']);
  assert.equal(catalog.nodes.find((node: any) => node.type === 'codex-cli-agent').category, 'codex');
  assert.match(catalog.agentNodeDataRules.image, /imageUrl/);
  assert.match(catalog.agentNodeDataRules.upload, /uploadType/);
  assert.match(catalog.agentNodeDataRules.text, /prompt/);
});

test('Hakimi MCP backend request validates local API access only', async () => {
  const { backendBaseUrl, normalizeBackendRequest } = await import('../tools/hakimi-mcp/src/backendClient.mjs');

  assert.equal(backendBaseUrl({}), 'http://127.0.0.1:18766');
  assert.deepEqual(
    normalizeBackendRequest({ method: 'get', path: '/api/canvas?x=1' }),
    { method: 'GET', path: '/api/canvas?x=1', body: undefined },
  );
  assert.deepEqual(
    normalizeBackendRequest({ method: 'post', path: 'api/files/upload-base64', body: { ok: true } }),
    { method: 'POST', path: '/api/files/upload-base64', body: { ok: true } },
  );
  assert.throws(() => normalizeBackendRequest({ method: 'CONNECT', path: '/api/canvas' }), /Unsupported method/);
  assert.throws(() => normalizeBackendRequest({ method: 'GET', path: '/files/output/a.png' }), /Only \/api paths/);
  assert.throws(() => normalizeBackendRequest({ method: 'GET', path: 'https://example.com/api/canvas' }), /Only relative paths/);
});

test('Hakimi MCP tool manifest includes semantic tools and full backend bridge', async () => {
  const { HAKIMI_MCP_TOOLS } = await import('../tools/hakimi-mcp/src/tools.mjs');
  const names = HAKIMI_MCP_TOOLS.map((tool: any) => tool.name);

  assert.deepEqual(names, [
    'hakimi_get_capabilities',
    'hakimi_backend_request',
    'hakimi_canvas_list',
    'hakimi_canvas_get',
    'hakimi_canvas_save',
    'hakimi_canvas_add_node',
    'hakimi_canvas_update_node',
    'hakimi_canvas_connect',
    'hakimi_canvas_import_asset',
    'hakimi_agent_run_actions',
    'hakimi_canvas_snapshot',
    'hakimi_canvas_apply_plan',
    'hakimi_canvas_diff_plan',
    'hakimi_canvas_verify_plan',
    'hakimi_canvas_generate_image',
    'hakimi_canvas_generate_video',
    'hakimi_canvas_run_codex_agent',
  ]);
  assert.equal(HAKIMI_MCP_TOOLS.every((tool: any) => tool.title?.startsWith('Hakimi')), true);
  assert.match(HAKIMI_MCP_TOOLS.find((tool: any) => tool.name === 'hakimi_backend_request').description, /any existing Hakimi backend API/);
  const toolsSource = read('../tools/hakimi-mcp/src/tools.mjs');
  assert.match(toolsSource, /function normalizeCanvasNodeData/);
  assert.match(toolsSource, /nodeType === 'image'/);
  assert.match(toolsSource, /imageUrls/);
  assert.match(toolsSource, /nodeType === 'text'/);
});

test('Hakimi MCP package and root script expose stdio server', () => {
  const rootPackage = JSON.parse(read('../package.json'));
  const mcpPackage = JSON.parse(read('../tools/hakimi-mcp/package.json'));
  const server = read('../tools/hakimi-mcp/src/server.mjs');

  assert.equal(mcpPackage.name, 'hakimi-mcp');
  assert.equal(mcpPackage.bin['hakimi-mcp'], './src/server.mjs');
  assert.equal(rootPackage.scripts['hakimi:mcp'], 'node tools/hakimi-mcp/src/server.mjs');
  assert.match(server, /new McpServer/);
  assert.match(server, /StdioServerTransport/);
  assert.match(server, /HAKIMI_MCP_TOOLS/);
});

test('backend exposes Hakimi as streamable HTTP MCP for packaged Codex SDK', () => {
  const server = read('../backend/src/server.js');
  const route = read('../backend/src/routes/hakimiMcp.js');
  const sdkManager = read('../backend/src/utils/codexSdkManager.js');

  assert.match(server, /const hakimiMcpRouter = require\('\.\/routes\/hakimiMcp'\)/);
  assert.match(server, /app\.use\('\/api\/hakimi-mcp', hakimiMcpRouter\)/);
  assert.match(route, /StreamableHTTPServerTransport/);
  assert.match(route, /new McpServer/);
  assert.match(route, /hakimi_canvas_diff_plan/);
  assert.match(route, /hakimi_canvas_apply_plan/);
  assert.match(route, /transport\.handleRequest\(req,\s*res,\s*req\.body\)/);
  assert.match(sdkManager, /\/api\/hakimi-mcp/);
  assert.match(sdkManager, /mcp_servers:\s*\{[\s\S]*hakimi_http/);
});

test('frontend topbar shows one Codex connectivity chip backed by Codex CLI status', () => {
  const app = read('../src/App.tsx');
  const api = read('../src/services/api.ts');
  const codexService = read('../src/services/codexCli.ts');

  assert.match(api, /checkHakimiMcpStatus/);
  assert.match(api, /\/hakimi-mcp\/status/);
  assert.doesNotMatch(api, /127\.0\.0\.1:18767\/status/);
  assert.match(codexService, /getCodexCliStatus/);
  assert.match(app, /getCodexCliStatus/);
  assert.match(app, /status\.available/);
  assert.match(app, /codexStatusDetail/);
  assert.match(app, /title=\{codexStatusDetail\}/);
  assert.doesNotMatch(app, /canvasStatus/);
  assert.doesNotMatch(app, /hakimiMcpStatus/);
  assert.match(app, /codexStatus/);
  assert.match(app, /Codex已连接/);
  assert.match(app, /Codex未连接/);
  assert.doesNotMatch(app, /画布已连接/);
  assert.doesNotMatch(app, /画布未连接/);
  assert.doesNotMatch(app, /MCP已连接/);
  assert.doesNotMatch(app, /MCP未启动/);
});

test('canvas auto-syncs external Hakimi/Codex updates while avoiding local overwrite', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /CANVAS_EXTERNAL_SYNC_INTERVAL_MS/);
  assert.match(canvas, /api\.listCanvases\(\)/);
  assert.match(canvas, /externalUpdatedAt/);
  assert.match(canvas, /pendingSaveByCanvasRef\.current\.has\(activeId\)/);
  assert.match(canvas, /saveTimersByCanvasRef\.current\.has\(activeId\)/);
  assert.match(canvas, /api\.getCanvasData\(activeId\)/);
  assert.match(canvas, /setNodes\(fixedNs\)/);
  assert.match(canvas, /setEdges\(data\.edges \|\| \[\]\)/);
});

test('canvas receives Hakimi/Codex updates through a realtime event stream', () => {
  const canvasRoute = read('../backend/src/routes/canvas.js');
  const api = read('../src/services/api.ts');
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvasRoute, /router\.get\('\/events'/);
  assert.match(canvasRoute, /text\/event-stream/);
  assert.match(canvasRoute, /broadcastCanvasEvent/);
  assert.match(canvasRoute, /'canvas:updated'/);
  assert.match(api, /createCanvasEventSource/);
  assert.match(api, /new EventSource\(`\$\{BASE\}\/canvas\/events`\)/);
  assert.match(canvas, /createCanvasEventSource/);
  assert.match(canvas, /canvas:updated/);
  assert.match(canvas, /syncExternalCanvasUpdate/);
});

test('Hakimi MCP stays documented for Codex config', () => {
  const doc = read('../tools/hakimi-mcp/README.md');
  const rootReadme = read('../README.md');

  assert.match(doc, /哈基米 MCP/);
  assert.match(doc, /hakimi:mcp/);
  assert.match(doc, /mcp_servers/);
  assert.match(doc, /hakimi_backend_request/);
  assert.match(doc, /HAKIMI_BACKEND_URL/);
  assert.match(doc, /ssh -L 18766:127\.0\.0\.1:18766/);
  assert.match(doc, /系统设置/);
  assert.match(rootReadme, /哈基米 MCP/);
  assert.match(rootReadme, /npm run hakimi:mcp/);
});

test('Hakimi image skills document displayable result node rules', () => {
  const canvasSkill = read('../skills/hakimi-canvas-control/SKILL.md');
  const imageSkill = read('../skills/hakimi-image-workflow/SKILL.md');
  const apparelSkill = read('../skills/hakimi-apparel-design/SKILL.md');

  assert.match(canvasSkill, /data\.prompt/);
  assert.match(imageSkill, /type:\s*"image"/);
  assert.match(imageSkill, /imageUrl/);
  assert.match(imageSkill, /generation config|生成配置/i);
  assert.match(apparelSkill, /prompt.*image node|图像节点.*prompt/i);
  assert.match(apparelSkill, /Generated apparel mockups.*type:\s*"image"/i);
});

test('Hakimi MCP backend URL is configurable from system settings and used by Codex SDK', () => {
  const types = read('../src/types/canvas.ts');
  const store = read('../src/stores/apiKeys.ts');
  const settingsRoute = read('../backend/src/routes/settings.js');
  const apiSettings = read('../src/components/ApiSettings.tsx');
  const sdkManager = read('../backend/src/utils/codexSdkManager.js');
  const backendClient = read('../tools/hakimi-mcp/src/backendClient.mjs');

  assert.match(types, /hakimiMcpBackendUrl\?:\s*string/);
  assert.match(store, /HAKIMI_MCP_DEFAULT_BACKEND_URL\s*=\s*'http:\/\/127\.0\.0\.1:18766'/);
  assert.match(store, /hakimiMcpBackendUrl:\s*HAKIMI_MCP_DEFAULT_BACKEND_URL/);
  assert.match(settingsRoute, /hakimiMcpBackendUrl:\s*'http:\/\/127\.0\.0\.1:18766'/);
  assert.match(settingsRoute, /hakimiMcpBackendUrl:\s*normalizeBaseUrl\(settings\.hakimiMcpBackendUrl/);
  assert.match(apiSettings, /Hakimi MCP 后端地址/);
  assert.match(apiSettings, /服务器后端地址/);
  assert.match(apiSettings, /HAKIMI_BACKEND_URL/);
  assert.match(apiSettings, /ssh -L 18766:127\.0\.0\.1:18766/);
  assert.match(sdkManager, /loadSettings[\s\S]*hakimiMcpBackendUrl/);
  assert.match(sdkManager, /HAKIMI_BACKEND_URL:\s*resolveHakimiMcpBackendUrl\(\)/);
  assert.match(backendClient, /env\.HAKIMI_BACKEND_URL \|\| env\.T8_BACKEND_URL/);
});

