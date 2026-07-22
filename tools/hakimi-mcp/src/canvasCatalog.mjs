import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..', '..', '..');

function readProjectFile(relPath) {
  return readFileSync(resolve(ROOT_DIR, relPath), 'utf8');
}

function parseArrayLiteral(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseNodePorts(source) {
  const ports = {};
  const regex = /^\s*['"]?([a-z0-9-]+)['"]?:\s*\{\s*inputs:\s*\[([^\]]*)\],\s*outputs:\s*\[([^\]]*)\]/gmi;
  for (const match of source.matchAll(regex)) {
    ports[match[1]] = {
      inputs: parseArrayLiteral(match[2]),
      outputs: parseArrayLiteral(match[3]),
    };
  }
  return ports;
}

function readProp(body, prop) {
  const match = new RegExp(`${prop}:\\s*'([^']*)'`).exec(body);
  return match?.[1] || '';
}

function parseNodeRegistry(source) {
  const nodes = [];
  const regex = /\{\s*type:\s*'([^']+)'([\s\S]*?)\}/g;
  for (const match of source.matchAll(regex)) {
    const body = match[2] || '';
    const type = match[1];
    if (!type || nodes.some((node) => node.type === type)) continue;
    nodes.push({
      type,
      label: readProp(body, 'label') || type,
      category: readProp(body, 'category') || 'unknown',
      description: readProp(body, 'description'),
      icon: readProp(body, 'icon'),
      color: readProp(body, 'color'),
      hidden: /hidden:\s*true/.test(body),
    });
  }
  return nodes;
}

const RUNNABLE_NODE_TYPES = new Set([
  'image', 'video', 'seedance', 'llm', 'audio', 'batch-processor', 'loop',
  'apparel-pack', 'apparel-pack-output', 'topaz-image-upscale', 'topaz-video-upscale',
]);

const EDITABLE_FIELDS_BY_TYPE = {
  text: ['prompt', 'text', 'label'],
  image: ['prompt', 'model', 'apiModel', 'aspectRatio', 'size', 'sizeLevel', 'quality', 'referenceImages'],
  video: ['prompt', 'mainId', 'model', 'apiModel', 'ratio', 'aspectRatio', 'duration', 'resolution', 'referenceImages', 'referenceVideos'],
  seedance: ['prompt', 'mainId', 'model', 'apiModel', 'ratio', 'aspectRatio', 'duration', 'resolution', 'referenceImages', 'referenceVideos'],
  upload: ['label', 'uploadType', 'imageUrl', 'videoUrl', 'filename'],
  'clip-studio': ['project', 'timeline', 'tracks', 'clips', 'captions', 'audio', 'exportSettings'],
};

function nodeCapabilities(type, ports) {
  const capabilities = ['node.read', 'node.update', 'node.move'];
  if ((ports?.inputs || []).length || (ports?.outputs || []).length) capabilities.push('node.connect');
  if (RUNNABLE_NODE_TYPES.has(type) || ['image', 'video', 'audio'].some((kind) => (ports?.outputs || []).includes(kind))) {
    capabilities.push('node.run', 'node.result.read');
  }
  if (type === 'image') capabilities.push('generation.image.configure');
  if (type === 'video' || type === 'seedance') capabilities.push('generation.video.configure');
  if (type === 'clip-studio') capabilities.push('timeline.read', 'timeline.patch', 'preview.render', 'export.video');
  return capabilities;
}

export function buildHakimiCanvasCatalog(options = {}) {
  const nodeRegistrySource = options.nodeRegistrySource ?? readProjectFile('src/config/nodeRegistry.ts');
  const portTypesSource = options.portTypesSource ?? readProjectFile('src/config/portTypes.ts');
  const ports = parseNodePorts(portTypesSource);
  const registryNodes = parseNodeRegistry(nodeRegistrySource);
  const byType = new Map(registryNodes.map((node) => [node.type, node]));
  const nodes = Object.keys(ports)
    .sort((a, b) => a.localeCompare(b))
    .map((type) => ({
      type,
      label: byType.get(type)?.label || type,
      category: byType.get(type)?.category || 'unknown',
      description: byType.get(type)?.description || '',
      icon: byType.get(type)?.icon || '',
      color: byType.get(type)?.color || '',
      hidden: Boolean(byType.get(type)?.hidden),
      ports: ports[type],
      capabilities: nodeCapabilities(type, ports[type]),
      editableFields: EDITABLE_FIELDS_BY_TYPE[type] || ['label'],
      requiredInputs: ports[type]?.inputs || [],
      resultOutputs: ports[type]?.outputs || [],
    }));

  return {
    name: '哈基米画布',
    version: 1,
    nodeCount: nodes.length,
    nodes,
    ports,
    agentNodeDataRules: {
      text: 'Visible/editable text must be written to data.prompt. data.text is accepted as a fallback but agents should set both data.prompt and data.text.',
      image: 'Use type=image for a generator or generated image node. To display an image, set data.imageUrl and preferably data.imageUrls. Prompt-only image nodes render as generator/config cards.',
      upload: 'Use type=upload with data.uploadType="image" and data.imageUrl for imported or generated bitmap result cards that should visibly show an image.',
      resultLineage: 'Generated result nodes should keep sourcePrintNodeId, sourcePromptNodeId or sourceGenerationNodeId, model, sizeLevel, prompt, and referenceImages when available.',
    },
    routeGroups: [
      '/api/canvas',
      '/api/settings',
      '/api/proxy',
      '/api/proxy/external',
      '/api/files',
      '/api/image',
      '/api/resources',
      '/api/themes',
      '/api/eagle',
      '/api/figma',
      '/api/grok-oauth',
      '/api/codex-cli',
      '/api/ai-watermark',
      '/api/cloud-uploads',
      '/api/parsehub',
      '/api/topaz',
      '/api/clip',
      '/api/anime-tags',
    ],
  };
}
