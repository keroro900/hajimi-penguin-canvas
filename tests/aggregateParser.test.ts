import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const parseHubBridge = require('../backend/src/utils/parseHubBridge.js');

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

test('aggregate parser node is registered in toolbox with media ports', () => {
  const registry = read('src/config/nodeRegistry.ts');
  const ports = read('src/config/portTypes.ts');
  const types = read('src/types/canvas.ts');
  const canvas = read('src/components/Canvas.tsx');
  const placement = read('src/utils/nodePlacement.ts');
  const actionBar = read('src/components/NodeActionBar.tsx');
  const loop = read('src/components/nodes/LoopNode.tsx');

  assert.match(registry, /type:\s*'aggregate-parser'[\s\S]*label:\s*'聚合解析'[\s\S]*category:\s*'toolbox'/);
  assert.match(ports, /'aggregate-parser':\s*\{\s*inputs:\s*\['text'\],\s*outputs:\s*\['text',\s*'image',\s*'video',\s*'audio'\]\s*\}/);
  assert.match(types, /\|\s*'aggregate-parser'/);
  assert.match(canvas, /import AggregateParserNode from '\.\/nodes\/AggregateParserNode'/);
  assert.match(canvas, /'aggregate-parser':\s*AggregateParserNode/);
  assert.match(canvas, /'aggregate-parser':\s*\{[\s\S]*aggregateParserAcceptedCompliance:\s*false/);
  assert.match(canvas, /'cinematic',\s*'video-motion',\s*'multi-angle-visual',\s*'portrait-master',\s*'pose-master',\s*'aggregate-parser'/);
  assert.match(actionBar, /'portrait-master',\s*'pose-master',\s*'aggregate-parser'/);
  assert.match(loop, /'aggregate-parser'/);
  assert.match(placement, /'aggregate-parser':\s*\{\s*w:\s*620,\s*h:\s*680\s*\}/);
});

test('aggregate parser frontend enforces compliance and friendly controls', () => {
  const source = read('src/components/nodes/AggregateParserNode.tsx');

  assert.match(source, /合规使用确认/);
  assert.match(source, /acceptedCompliance/);
  assert.match(source, /请先勾选合规确认/);
  assert.match(source, /getAggregateParserStatus/);
  assert.match(source, /resolveAggregateMedia/);
  assert.match(source, /ParseHub/);
  assert.match(source, /解析无水印地址/);
  assert.match(source, /代理 \/ Cookie/);
});

test('aggregate parser backend is mounted and packaged', () => {
  const server = read('backend/src/server.js');
  const route = read('backend/src/routes/parseHub.js');
  const postBuild = read('electron/_post_build.cjs');
  const pkg = JSON.parse(read('package.json'));
  const distRelease = read('scripts/dist-release.cjs');

  assert.match(server, /const parseHubRouter = require\('\.\/routes\/parseHub'\)/);
  assert.match(server, /app\.use\('\/api\/parsehub', parseHubRouter\)/);
  assert.match(route, /acceptedCompliance !== true/);
  assert.match(route, /runParseHubBridge/);
  assert.match(postBuild, /routes', 'parseHub\.t8c'/);
  assert.match(postBuild, /utils', 'parseHubBridge\.t8c'/);
  assert.match(postBuild, /tools', 'parsehub-bridge', 'parsehub_bridge\.py'/);
  assert.match(postBuild, /T8_REQUIRE_PARSEHUB_RUNTIME/);
  assert.match(distRelease, /T8_REQUIRE_PARSEHUB_RUNTIME/);
  const resources = pkg.build.extraResources.map((item: any) => `${item.from}->${item.to}`);
  assert.ok(resources.includes('tools/parsehub-bridge->tools/parsehub-bridge'));
  assert.ok(resources.includes('tools/parsehub-pythonlibs->tools/parsehub-pythonlibs'));
});

test('normalizeParseHubResult extracts remote and live-photo media links', () => {
  const result = parseHubBridge.normalizeParseHubResult({
    parsehubVersion: '2.0.24',
    pythonVersion: '3.12.9',
    parsed: {
      platform: 'douyin',
      platformName: '抖音',
      type: 'multimedia',
      title: 'demo title',
      content: 'demo content',
      raw_url: 'https://example.test/post/1',
      media: [
        { kind: 'video', url: 'https://cdn.example/video', ext: 'mp4', width: 720, height: 1280 },
        { kind: 'image', url: 'https://cdn.example/pic.jpg', ext: 'jpg', width: 1080, height: 1080 },
        { kind: 'image', url: 'https://cdn.example/live.jpg', ext: 'jpg', video_url: 'https://cdn.example/live.mp4', video_ext: 'mp4' },
      ],
    },
  });

  assert.equal(result.platformName, '抖音');
  assert.equal(result.media.length, 4);
  assert.deepEqual(result.media.map((item: any) => item.kind), ['video', 'image', 'image', 'video']);
  assert.match(result.outputText, /解析到的无水印\/原始媒体地址/);
  assert.match(result.outputText, /合规提醒/);
});

test('parsehub runtime paths include bridge and generated dependency slot', () => {
  assert.match(parseHubBridge.resolveBridgeScript(), /parsehub-bridge[\\/]parsehub_bridge\.py$/);
  const libPaths = parseHubBridge.resolvePythonLibPaths();
  assert.ok(libPaths.some((p: string) => /ParseHub[\\/]src$/.test(p) || /parsehub-pythonlibs$/.test(p)));
  assert.ok(parseHubBridge.resolvePythonCandidates().some((item: any) => /python/i.test(item.command)));
});
