import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const REMOVED_NODE_TYPES = [
  'runninghub',
  'runninghub-wallet',
  'rh-config',
  'rh-tools',
  'rh-toolbox',
  'rh-toolbox-maker',
  'vibex',
  'fal-toolbox',
  'fal-toolbox-maker',
  'grok-oauth-agent',
  'codex-cli-agent',
  'codex-image-conjure',
  'genclaw',
  'artist-style-master',
  'anime-tag-master',
  'comfyui-store',
  'comfyui-app-maker',
];

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('removed sidebar node families have no registry, canvas, or placement entry', () => {
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const types = read('../src/types/canvas.ts');
  const placement = read('../src/utils/nodePlacement.ts');
  const actionBar = read('../src/components/NodeActionBar.tsx');

  for (const type of REMOVED_NODE_TYPES) {
    assert.doesNotMatch(registry, new RegExp(`type:\\s*'${type}'`));
    assert.doesNotMatch(ports, new RegExp(`'${type}'\\s*:`));
    assert.doesNotMatch(types, new RegExp(`'${type}'`));
    assert.doesNotMatch(placement, new RegExp(`'${type}'\\s*:`));
    assert.doesNotMatch(canvas, new RegExp(`'${type}'\\s*:`));
    assert.doesNotMatch(actionBar, new RegExp(`'${type}'`));
  }

  for (const label of ['RH', 'FAL工具箱', 'GROK OAuth', 'CODEX CLI', '灵感之源', 'ComfyUI']) {
    assert.doesNotMatch(registry, new RegExp(`label:\\s*'${label}'`));
  }
});

test('removed node-specific React components no longer exist', () => {
  for (const name of [
    'RunningHubNode.tsx',
    'RhConfigNode.tsx',
    'RHToolsNode.tsx',
    'RHToolboxNode.tsx',
    'FalToolboxNode.tsx',
    'VibeXNode.tsx',
    'GrokOAuthAgentNode.tsx',
    'CodexCliAgentNode.tsx',
    'CodexImageConjureNode.tsx',
    'GenClawNode.tsx',
    'ArtistStyleMasterNode.tsx',
    'AnimeTagMasterNode.tsx',
    'ComfyUIStoreNode.tsx',
    'ComfyUIAppMakerNode.tsx',
  ]) {
    assert.equal(existsSync(new URL(`../src/components/nodes/${name}`, import.meta.url)), false, name);
  }
});

test('removed RunningHub runtime and settings surfaces no longer exist', () => {
  const apiSettings = read('../src/components/ApiSettings.tsx');
  const settingsStore = read('../src/stores/apiKeys.ts');
  const settingsRoute = read('../backend/src/routes/settings.js');
  const backendConfig = read('../backend/src/config.js');
  const serviceApi = read('../src/services/api.ts');
  const generation = read('../src/services/generation.ts');
  const proxy = read('../backend/src/routes/proxy.js');
  const packageJson = read('../package.json');
  const postBuild = read('../electron/_post_build.cjs');

  for (const source of [apiSettings, settingsStore, settingsRoute]) {
    assert.doesNotMatch(source, /rhApiKey|rhBaseUrl|RunningHub API Key/);
  }
  assert.doesNotMatch(generation, /submitRh|queryRh|cancelRh|fetchRhAppInfo|uploadRhAsset/);
  assert.doesNotMatch(proxy, /\/runninghub\/(?:submit|query|cancel|upload-asset|app-info)/);
  assert.doesNotMatch(settingsRoute, /rh-toolbox|rh-tool-categories|rh-tool-apps|rh-tools\/import|RH_TOOLBOX_/i);
  assert.doesNotMatch(backendConfig, /RH_TOOL_CATEGORIES_FILE|RH_TOOL_APPS_FILE|RH_TOOLBOX_MANIFEST_FILE/);
  assert.doesNotMatch(serviceApi, /RHToolCategory|RHToolsBackup|getRHTools|rh-tool-categories|rh-tool-apps/);
  assert.doesNotMatch(packageJson, /rh-toolbox:check|check-rh-toolbox-release/);
  assert.doesNotMatch(postBuild, /checkNoRhToolboxMaker|checkRhToolboxReleaseManifest|RH toolbox release manifest/);

  for (const path of [
    '../src/components/RhImageCapabilityButton.tsx',
    '../src/components/RhImageCapabilityRail.tsx',
    '../src/services/rhToolbox.ts',
    '../src/services/rhToolboxCapabilities.ts',
    '../src/utils/rhToolbox.ts',
    '../src/utils/rhToolboxCapabilities.ts',
    '../src/data/rhToolboxManifest.ts',
    '../scripts/check-rh-toolbox-release.cjs',
    '../scripts/sync-rh-toolbox-manifest.cjs',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, path);
  }
});
