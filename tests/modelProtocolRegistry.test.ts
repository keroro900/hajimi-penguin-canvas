import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('shared model protocol registry is the single source for default provider models', () => {
  const registry = require('../shared/modelProtocolRegistry.json');
  const backendRegistry = require('../backend/src/providers/registry.js');
  const jimengCli = require('../backend/src/providers/jimengCli.js');

  assert.deepEqual(
    backendRegistry.DEFAULT_JIMENG_IMAGE_MODELS,
    registry.advancedProviders['jimeng-cli'].imageModels,
  );
  assert.deepEqual(
    backendRegistry.DEFAULT_JIMENG_VIDEO_MODELS,
    registry.advancedProviders['jimeng-cli'].videoModels,
  );
  assert.deepEqual(
    backendRegistry.DEFAULT_VOLCENGINE_VIDEO_MODELS,
    registry.advancedProviders.volcengine.videoModels,
  );
  assert.equal(
    registry.advancedProviders['jimeng-cli'].defaults.videoModel,
    'seedance2.0fast_vip',
  );
  assert.equal(jimengCli.DEFAULT_JIMENG_VIDEO_MODEL, registry.advancedProviders['jimeng-cli'].defaults.videoModel);
});

test('frontend advanced provider fallbacks are registry-driven instead of local model arrays', async () => {
  const registry = require('../shared/modelProtocolRegistry.json');
  const frontend = await import('../src/utils/advancedProviders.ts');

  assert.deepEqual(
    frontend.advancedProviderModelOptions({ id: 'jimeng-cli', protocol: 'jimeng-cli' } as any, 'image'),
    registry.advancedProviders['jimeng-cli'].imageModels,
  );
  assert.deepEqual(
    frontend.advancedProviderModelOptions({ id: 'jimeng-cli', protocol: 'jimeng-cli' } as any, 'video'),
    registry.advancedProviders['jimeng-cli'].videoModels,
  );
  assert.deepEqual(
    frontend.advancedProviderModelOptions({ id: 'volcengine', protocol: 'volcengine' } as any, 'video'),
    registry.advancedProviders.volcengine.videoModels,
  );
});

test('frontend model protocol registry wrapper exposes typed defaults and display metadata', async () => {
  const registry = require('../shared/modelProtocolRegistry.json');
  const frontend = await import('../src/utils/modelProtocolRegistry.ts');

  assert.deepEqual(
    frontend.registryModelsForProtocol('jimeng-cli', 'video'),
    registry.advancedProviders['jimeng-cli'].videoModels,
  );
  assert.equal(
    frontend.registryDefaultModel('jimeng-cli', 'video'),
    registry.advancedProviders['jimeng-cli'].defaults.videoModel,
  );
  assert.equal(
    frontend.registryDisplay('jimeng-cli').imageModelPlaceholder,
    registry.advancedProviders['jimeng-cli'].display.imageModelPlaceholder,
  );
  assert.equal(
    frontend.MODEL_REGISTRY_DEFAULT_SERVICE.gptImage2VariantSizes['gpt-image-2-4k'],
    '4K',
  );
});

test('ApiSettings model override rows and image protocol options come from the shared registry', () => {
  const registry = require('../shared/modelProtocolRegistry.json');
  const source = fs.readFileSync(new URL('../src/components/ApiSettings.tsx', import.meta.url), 'utf8');

  assert.match(source, /MODEL_PROTOCOL_REGISTRY/);
  assert.equal(registry.advancedProviders['jimeng-cli'].display.imageModelPlaceholder, '例如 seedream-4.7');
  assert.equal(registry.advancedProviders['jimeng-cli'].display.videoModelPlaceholder, '例如 seedance2.0fast_vip \/ seedance2.0');
  assert.match(registry.advancedProviders.volcengine.display.modelHint, /Seedance2\.0/);
  assert.match(source, /advancedProviderRegistryDisplay\('jimeng-cli'\)\.modelHint/);
  assert.match(source, /registryDisplay\.imageModelPlaceholder/);
  assert.match(source, /registryDisplay\.videoModelPlaceholder/);
  assert.match(source, /registryDisplay\.seedanceOpenReminderModels/);
  assert.match(source, /MODEL_REGISTRY_DEFAULT_SERVICE\.imageModelOverrides/);
  assert.match(source, /MODEL_REGISTRY_DEFAULT_SERVICE\.videoModelOverrides/);
  assert.match(source, /MODEL_REGISTRY_DEFAULT_SERVICE\.imageProtocolOptions/);
  assert.match(source, /MODEL_REGISTRY_DEFAULT_SERVICE\.openaiCompatibleImageProtocolOptions/);
  assert.doesNotMatch(source, /const IMAGE_MODEL_OVERRIDE_FIELDS = \[/);
  assert.doesNotMatch(source, /const VIDEO_MODEL_OVERRIDE_FIELDS = \[/);
  assert.doesNotMatch(source, /const IMAGE_MODEL_PROTOCOL_OPTIONS = \[/);
});

test('shared registry declares GPT image size request field strategies', () => {
  const registry = require('../shared/modelProtocolRegistry.json');
  const proxySource = fs.readFileSync(new URL('../backend/src/routes/proxy.js', import.meta.url), 'utf8');
  const gptSize = registry.defaultService.imageRequestProtocols['gpt-size'];

  assert.deepEqual(gptSize.generations.primary.fields, ['size', 'resolution', 'image_size']);
  assert.deepEqual(gptSize.generations.pixelOnly.fields, ['size']);
  assert.deepEqual(gptSize.generations.levelOnly.fields, ['resolution', 'image_size']);
  assert.deepEqual(gptSize.edits.primary.fields, ['size', 'aspectRatio', 'resolution', 'image_size']);
  assert.match(proxySource, /imageRequestProtocolConfig\('gpt-size', 'generations'\)/);
  assert.match(proxySource, /imageRequestProtocolConfig\('gpt-size', 'edits'\)/);
  assert.match(proxySource, /appendGptImageSizeFields/);
  assert.doesNotMatch(proxySource, /form\.append\('resolution', lvlLower\)/);
});

test('Seedance Apishu model mapping is registry-driven', () => {
  const registry = require('../shared/modelProtocolRegistry.json');
  const proxy = require('../backend/src/routes/proxy.js');
  const source = fs.readFileSync(new URL('../backend/src/routes/proxy.js', import.meta.url), 'utf8');

  assert.equal(
    proxy._testOnly.apishuSeedanceUpstreamModel('doubao-seedance-2-0-260128'),
    registry.defaultService.apishuSeedanceModels['doubao-seedance-2-0-260128'],
  );
  assert.equal(proxy._testOnly.apishuSeedanceUpstreamModel('video-standard-720p-fast'), 'video-standard-720p-fast');
  assert.match(source, /MODEL_PROTOCOL_REGISTRY/);
  assert.doesNotMatch(source, /new Map\(\[\s*\[\s*'doubao-seedance-2-0-260128'/);
});

test('packaged app includes the shared model protocol registry', () => {
  const pkg = require('../package.json');
  const shared = pkg.build.extraResources.find((item: any) => item.to === 'shared');

  assert.ok(shared);
  assert.ok(shared.filter.includes('modelProtocolRegistry.json'));
});
