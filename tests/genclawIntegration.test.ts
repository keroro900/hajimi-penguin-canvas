import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('GenClaw nodes are registered as two compact reusable nodes', () => {
  const types = read('../src/types/canvas.ts');
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(types, /'genclaw'/);
  assert.match(types, /'sketch-renderer'/);
  assert.match(registry, /type:\s*'genclaw'[\s\S]*label:\s*'GenClaw 白盒生图'[\s\S]*category:\s*'codex'/);
  assert.match(registry, /type:\s*'sketch-renderer'[\s\S]*label:\s*'代码草图渲染器'[\s\S]*category:\s*'utility'/);
  assert.match(ports, /'genclaw':\s*\{\s*inputs:\s*\['text', 'image'\],\s*outputs:\s*\['image', 'text'\]/);
  assert.match(ports, /'sketch-renderer':\s*\{\s*inputs:\s*\['text'\],\s*outputs:\s*\['image', 'text'\]/);
  assert.match(canvas, /import\('\.\/nodes\/GenClawNode'\)/);
  assert.match(canvas, /import\('\.\/nodes\/SketchRenderNode'\)/);
  assert.match(canvas, /'genclaw': GenClawNode/);
  assert.match(canvas, /'sketch-renderer': SketchRenderNode/);
  assert.match(canvas, /'genclaw'[\s\S]*'sketch-renderer'/);
});

test('GenClaw backend render route is wired through server', () => {
  const server = read('../backend/src/server.js');
  const route = read('../backend/src/routes/genclaw.js');
  const util = read('../backend/src/utils/genclawSketch.js');

  assert.match(server, /genclawRouter/);
  assert.match(server, /app\.use\('\/api\/genclaw',\s*genclawRouter\)/);
  assert.match(route, /router\.post\('\/render'/);
  assert.match(route, /renderSketchToFiles/);
  assert.match(util, /sharp/);
  assert.match(util, /sanitizeSketchCode/);
});

test('GenClaw node uses decoupled model config and LLM-assisted stages', () => {
  const node = read('../src/components/nodes/GenClawNode.tsx');
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(node, /LLM_MODELS/);
  assert.match(node, /GENCLAW_IMAGE_MODELS/);
  assert.doesNotMatch(node, /GENCLAW_LLM_MODEL_OPTIONS|GENCLAW_IMAGE_MODEL_OPTIONS/);
  assert.match(node, /generateLlm/);
  assert.match(node, /<select[\s\S]*genclawLlmModel/);
  assert.match(node, /<select[\s\S]*genclawImageModel/);
  assert.match(node, /<select[\s\S]*genclawImageApiModel/);
  assert.match(node, /genclawSystemPrompt/);
  assert.match(canvas, /genclawLlmModel/);
  assert.match(canvas, /genclawImageModel/);
  assert.match(canvas, /genclawImageApiModel/);
  assert.match(canvas, /genclawSystemPrompt/);
});

test('GenClaw node reuses advanced provider source controls for LLM and image generation', () => {
  const node = read('../src/components/nodes/GenClawNode.tsx');

  assert.match(node, /advancedProvidersForNode/);
  assert.match(node, /resolveAdvancedProviderSelection/);
  assert.match(node, /advancedProviderModelOptions/);
  assert.match(node, /generateExternalLlm/);
  assert.match(node, /generateExternalImage/);
  assert.match(node, /genclawLlmProviderSource/);
  assert.match(node, /genclawLlmProviderId/);
  assert.match(node, /genclawLlmProviderModel/);
  assert.match(node, /genclawImageProviderSource/);
  assert.match(node, /genclawImageProviderId/);
  assert.match(node, /genclawImageProviderModel/);
  assert.match(node, /genclawProviderParams/);
  assert.match(node, /genclawImageProviderParams/);
  assert.match(node, /来源/);
  assert.match(node, /比例/);
  assert.match(node, /尺寸/);
  assert.match(node, /生成数量/);
  assert.match(node, /Quality/);
  assert.doesNotMatch(node, /genclawWidth/);
  assert.doesNotMatch(node, /genclawHeight/);
});

test('GenClaw canvas defaults use image-node parameter names instead of raw width height', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const defaultsBlock = canvas.match(/genclaw:\s*\{[\s\S]*?\r?\n  \},\r?\n  'sketch-renderer':/)?.[0] || '';

  assert.match(defaultsBlock, /genclawAspectRatio/);
  assert.match(defaultsBlock, /genclawSize/);
  assert.match(defaultsBlock, /genclawImageCount/);
  assert.match(defaultsBlock, /genclawImageQuality/);
  assert.match(defaultsBlock, /genclawProviderParams/);
  assert.match(defaultsBlock, /genclawImageProviderParams/);
  assert.doesNotMatch(defaultsBlock, /genclawWidth:\s*1024/);
  assert.doesNotMatch(defaultsBlock, /genclawHeight:\s*1024/);
});

test('GenClaw node exposes white-box SVG preview tabs and advanced settings', () => {
  const node = read('../src/components/nodes/GenClawNode.tsx');
  const panel = read('../src/components/nodes/SketchPreviewPanel.tsx');

  assert.match(node, /SketchPreviewPanel/);
  assert.match(node, /genclawPreviewTab/);
  assert.match(node, /SVG/);
  assert.match(node, /草图渲染/);
  assert.match(node, /最终图/);
  assert.match(node, /Brief/);
  assert.match(node, /genclawAdvancedOpen/);
  assert.match(node, /高级设置/);
  assert.match(panel, /buildGenClawSvgPreviewDocument/);
  assert.match(panel, /sandbox=""/);
  assert.match(panel, /srcDoc/);
});
