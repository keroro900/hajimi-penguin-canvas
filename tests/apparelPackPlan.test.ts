import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPAREL_PACK_MODE_OPTIONS,
  APPAREL_PACK_NODE_TYPE,
  APPAREL_PACK_PRESETS,
  MAX_APPAREL_PACK_SHOTS,
  buildApparelPackPlan,
} from '../src/utils/apparelPackPlan.ts';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function imageNodes(plan: ReturnType<typeof buildApparelPackPlan>) {
  return plan.nodes.filter((node) => node.type === 'image');
}

function nodeById(plan: ReturnType<typeof buildApparelPackPlan>, id: string) {
  const node = plan.nodes.find((item) => item.id === id);
  assert.ok(node, `missing node ${id}`);
  return node as any;
}

function imageData(plan: ReturnType<typeof buildApparelPackPlan>, id: string) {
  const node = nodeById(plan, id);
  assert.equal(node.type, 'image');
  return node.data as any;
}

test('apparel pack exposes three mode options for the node panels', () => {
  assert.equal(APPAREL_PACK_NODE_TYPE, 'apparel-pack');
  assert.deepEqual(APPAREL_PACK_MODE_OPTIONS.map((item) => item.id), [
    'suite',
    'garment-reference',
    'inspiration',
  ]);
});

test('apparel pack exposes beginner presets with prompt copy', () => {
  assert.equal(MAX_APPAREL_PACK_SHOTS, 12);
  assert.ok(APPAREL_PACK_PRESETS.garmentTypes.find((item) => item.id === 'dress')?.prompt.includes('dress'));
  assert.ok(APPAREL_PACK_PRESETS.audiences.find((item) => item.id === 'kidswear')?.prompt.includes('child-safe'));
  assert.ok(APPAREL_PACK_PRESETS.channels.find((item) => item.id === 'temu')?.prompt.includes('TEMU'));
  assert.ok(APPAREL_PACK_PRESETS.suiteScenes.find((item) => item.id === 'flatlay')?.prompt.includes('flat lay'));
  assert.ok(APPAREL_PACK_PRESETS.suiteScenes.length >= MAX_APPAREL_PACK_SHOTS);
});

test('suite mode builds a five-shot model-and-garment package with anchor ordering', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-suite',
    mode: 'suite',
    position: { x: 100, y: 200 },
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/model.png'],
      garment: ['/files/input/front.png', '/files/input/back.png'],
      style: ['/files/input/style.png'],
    },
    suite: {
      shotCount: 5,
      lockLevel: 'authorized-identity-pose',
      modelConsistency: 'strict',
      garmentConsistency: 'strict',
      outputRatio: '3:4',
      sizeLevel: '4K',
    },
    autoRun: true,
  });

  assert.equal(plan.summary.mode, 'suite');
  assert.equal(imageNodes(plan).length, 5);
  assert.deepEqual(plan.runNodeIds.slice(0, 2), [
    'pack-suite-brief',
    'pack-suite-model-front',
  ]);
  assert.deepEqual((plan as any).runStages, [
    ['pack-suite-brief'],
    ['pack-suite-model-front'],
    ['pack-suite-model-back', 'pack-suite-model-half', 'pack-suite-flatlay', 'pack-suite-hanger'],
  ]);

  const front = imageData(plan, 'pack-suite-model-front');
  assert.equal(front.lineageRole, 'model-front-anchor');
  assert.equal(front.anchorPolicy.model, 'reference-model');
  assert.equal(front.anchorPolicy.garment, 'source-garment');
  assert.deepEqual(front.referenceImages, [
    '/files/input/model.png',
    '/files/input/front.png',
    '/files/input/back.png',
    '/files/input/style.png',
  ]);
  assert.match(front.prompt, /preserve the authorized model identity/i);
  assert.match(front.prompt, /exact garment fidelity/i);

  const back = imageData(plan, 'pack-suite-model-back');
  assert.equal(back.lineageRole, 'model-back-derived');
  assert.deepEqual(back.sourceNodeIds, ['pack-node', 'pack-suite-model-front']);
  assert.ok(back.referenceImages.includes('/files/input/model.png'));
  assert.match(back.prompt, /same model/i);
  assert.match(back.prompt, /back view/i);

  const hanger = imageData(plan, 'pack-suite-hanger');
  assert.equal(hanger.aspectRatio, '3:4');
  assert.equal(hanger.size, '4K');
  assert.match(hanger.prompt, /hanger|hanging/i);
  assert.ok(!plan.nodes.some((node) => node.id === 'pack-suite-detail'));
});

test('suite mode includes flatlay and hanger product shots with prompt-agent metadata', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-product',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/model.png'],
      garment: ['/files/input/front.png'],
    },
    suite: {
      shotCount: 6,
      outputRatio: '4:5',
      sizeLevel: '4K',
    },
    autoRun: true,
  });

  assert.equal(plan.summary.imageCount, 6);
  assert.deepEqual(imageNodes(plan).map((node) => node.id), [
    'pack-product-model-front',
    'pack-product-model-back',
    'pack-product-model-half',
    'pack-product-flatlay',
    'pack-product-hanger',
    'pack-product-detail',
  ]);
  assert.deepEqual(plan.runStages, [
    ['pack-product-brief'],
    ['pack-product-model-front'],
    ['pack-product-model-back', 'pack-product-model-half', 'pack-product-flatlay', 'pack-product-hanger'],
    ['pack-product-detail'],
  ]);

  const hanger = imageData(plan, 'pack-product-hanger');
  assert.equal(hanger.lineageRole, 'hanger-product-derived');
  assert.equal(hanger.anchorPolicy.layout, 'hanger');
  assert.match(hanger.prompt, /hanger|hanging/i);

  const promptAgent = nodeById(plan, 'pack-product-brief');
  assert.equal(promptAgent.type, 'llm');
  assert.equal(promptAgent.data.agentRole, 'apparel-pack-prompt-agent');
  assert.match(String(promptAgent.data.systemPrompt), /internal prompt agent/i);
  assert.match(String(promptAgent.data.prompt), /systemPrompt/i);
  assert.match(String(promptAgent.data.prompt), /userPrompt/i);

  for (const node of imageNodes(plan)) {
    const data = node.data as any;
    assert.ok(data.promptAgent, `${node.id} missing promptAgent`);
    assert.equal(data.promptAgent.name, 'apparel-pack-prompt-agent');
    assert.ok(String(data.promptAgent.systemPrompt).includes('Prompt skeleton'));
    assert.ok(String(data.promptAgent.userPrompt).includes(data.lineageRole));
    assert.ok(String(data.prompt).includes('Garment truth'));
    assert.ok(String(data.prompt).includes('Negative constraints'));
  }
});

test('suite mode supports twelve gpt-image-2 shots, preset prompts, and quality tuning QA', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-presets',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/model.png'],
      garment: ['/files/input/dress.png'],
      style: ['/files/input/store-style.png'],
    },
    suite: {
      shotCount: 12,
      garmentPresetId: 'dress',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      customPrompt: 'preserve the small bow on the waist and the exact floral print spacing',
      outputRatio: '4:5',
      sizeLevel: '4K',
    },
    qualityQa: {
      enabled: true,
      passThreshold: 'strict',
    },
    autoRun: true,
  });

  assert.equal(plan.summary.imageCount, 12);
  assert.equal(imageNodes(plan).length, 12);
  assert.ok(plan.nodes.some((node) => node.id === 'pack-presets-model-lifestyle'));
  assert.ok(plan.nodes.some((node) => node.id === 'pack-presets-fabric-macro'));
  assert.ok(plan.nodes.some((node) => node.id === 'pack-presets-label-detail'));

  for (const node of imageNodes(plan)) {
    const data = node.data as any;
    assert.equal(data.model, 'gpt-image-2');
    assert.equal(data.apiModel, 'gpt-image-2');
    assert.match(String(data.prompt), /TEMU/i);
    assert.match(String(data.prompt), /kidswear|child-safe/i);
    assert.match(String(data.prompt), /small bow on the waist/i);
  }

  const front = imageData(plan, 'pack-presets-model-front');
  assert.match(front.prompt, /dress/i);
  assert.match(front.promptAgent.userPrompt, /Preset prompt context/i);

  const qa = nodeById(plan, 'pack-presets-quality-qa');
  assert.equal(qa.type, 'llm');
  assert.equal(qa.data.agentRole, 'apparel-pack-quality-agent');
  assert.match(String(qa.data.prompt), /garment fidelity/i);
  assert.match(String(qa.data.prompt), /prompt patch/i);
  assert.match(String(qa.data.prompt), /strict/i);

  const qaEdges = plan.edges.filter((edge) => edge.target === 'pack-presets-quality-qa');
  assert.equal(qaEdges.length, 12);
  assert.deepEqual(plan.runStages.at(-1), ['pack-presets-quality-qa']);
  assert.equal(plan.runNodeIds.at(-1), 'pack-presets-quality-qa');
});

test('garment-reference mode creates model and flatlay anchors before derived shots', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-garment',
    mode: 'garment-reference',
    position: { x: 20, y: 30 },
    sourceNodeId: 'pack-node',
    references: {
      garment: ['/files/input/garment-front.png', '/files/input/garment-detail.png'],
    },
    garmentReference: {
      audience: 'women',
      garmentType: 'dress',
      modelPolicy: 'generic',
      includeFlatlay: true,
      includeDetail: true,
      outputRatio: '3:4',
      sizeLevel: '2K',
    },
    autoRun: true,
  });

  assert.equal(plan.summary.mode, 'garment-reference');
  assert.deepEqual(plan.runNodeIds, [
    'pack-garment-brief',
    'pack-garment-model-front',
    'pack-garment-flatlay-anchor',
    'pack-garment-model-back',
    'pack-garment-detail',
  ]);
  assert.deepEqual((plan as any).runStages, [
    ['pack-garment-brief'],
    ['pack-garment-model-front', 'pack-garment-flatlay-anchor'],
    ['pack-garment-model-back', 'pack-garment-detail'],
  ]);

  const front = imageData(plan, 'pack-garment-model-front');
  assert.equal(front.lineageRole, 'model-front-anchor');
  assert.equal(front.anchorPolicy.model, 'generated-generic');
  assert.deepEqual(front.referenceImages, ['/files/input/garment-front.png', '/files/input/garment-detail.png']);
  assert.match(front.prompt, /generic fashion model/i);
  assert.match(front.prompt, /dress/i);

  const flatlay = imageData(plan, 'pack-garment-flatlay-anchor');
  assert.equal(flatlay.lineageRole, 'flatlay-anchor');
  assert.match(flatlay.prompt, /flat lay/i);

  const back = imageData(plan, 'pack-garment-model-back');
  assert.deepEqual(back.sourceNodeIds, ['pack-node', 'pack-garment-model-front']);
  assert.match(back.prompt, /same .*model styling/i);

  const detail = imageData(plan, 'pack-garment-detail');
  assert.deepEqual(detail.sourceNodeIds, ['pack-node', 'pack-garment-flatlay-anchor']);
  assert.match(detail.prompt, /fabric|trim|print/i);
});

test('garment-reference mode honors shot count and disabled flatlay/detail options', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-trimmed',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garment: ['/files/input/garment.png'],
    },
    garmentReference: {
      garmentType: 'hoodie',
      shotCount: 3,
      includeFlatlay: false,
      includeDetail: true,
    },
    autoRun: true,
  });

  assert.deepEqual(imageNodes(plan).map((node) => node.id), [
    'pack-trimmed-model-front',
    'pack-trimmed-model-back',
    'pack-trimmed-detail',
  ]);
  assert.deepEqual(plan.runStages, [
    ['pack-trimmed-brief'],
    ['pack-trimmed-model-front'],
    ['pack-trimmed-model-back', 'pack-trimmed-detail'],
  ]);
  assert.ok(!plan.nodes.some((node) => node.id === 'pack-trimmed-flatlay-anchor'));

  const detail = imageData(plan, 'pack-trimmed-detail');
  assert.deepEqual(detail.sourceNodeIds, ['pack-node', 'pack-trimmed-model-front']);
  assert.equal(detail.anchorPolicy.garment, 'source-garment-and-front-anchor');
  assert.doesNotMatch(detail.prompt, /flatlay anchor/i);
});

test('inspiration mode starts with an LLM brief and constrains generated anchors through the brief', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-inspire',
    mode: 'inspiration',
    position: { x: 0, y: 0 },
    sourceNodeId: 'pack-node',
    inspiration: {
      direction: 'summer girls floral dress for marketplace listing',
      audience: 'kidswear',
      channel: 'TEMU',
      planningStrength: 'balanced',
      shotCount: 4,
      outputRatio: '3:4',
      sizeLevel: '2K',
    },
    autoRun: false,
  });

  assert.equal(plan.summary.mode, 'inspiration');
  assert.deepEqual(plan.runNodeIds, []);
  assert.deepEqual((plan as any).runStages, []);

  const brief = nodeById(plan, 'pack-inspire-llm-brief');
  assert.equal(brief.type, 'llm');
  assert.match(String(brief.data.systemPrompt), /structured apparel generation brief/i);
  assert.match(String(brief.data.prompt), /garmentTruth/i);
  assert.match(String(brief.data.prompt), /TEMU/);

  const front = imageData(plan, 'pack-inspire-model-front');
  assert.equal(front.lineageRole, 'model-front-anchor');
  assert.equal(front.anchorPolicy.brief, 'llm-structured-brief');
  assert.deepEqual(front.sourceNodeIds, ['pack-node', 'pack-inspire-llm-brief']);
  assert.match(front.prompt, /follow the structured apparel brief/i);
  assert.match(front.prompt, /kidswear/i);

  const flatlay = imageData(plan, 'pack-inspire-flatlay');
  assert.deepEqual(flatlay.sourceNodeIds, ['pack-node', 'pack-inspire-llm-brief', 'pack-inspire-model-front']);
});

test('apparel pack node is registered, executable, and uses global smart node styles', () => {
  const registry = read('../src/config/nodeRegistry.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const nodeSource = read('../src/components/nodes/ApparelPackNode.tsx');
  const placement = read('../src/utils/nodePlacement.ts');
  const types = read('../src/types/canvas.ts');

  assert.match(types, /'apparel-pack'/);
  assert.match(registry, /type:\s*'apparel-pack'/);
  assert.match(registry, /label:\s*'服装封包生成'/);
  assert.match(registry, /category:\s*'toolbox'/);
  assert.match(canvas, /const ApparelPackNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/ApparelPackNode'\), 'ApparelPackNode'\);/);
  assert.match(canvas, /'apparel-pack': ApparelPackNode/);
  assert.match(canvas, /'apparel-pack'/);
  assert.match(placement, /'apparel-pack':\s*\{\s*w:\s*420,\s*h:\s*520\s*\}/);

  assert.match(nodeSource, /APPAREL_PACK_MODE_OPTIONS/);
  assert.match(nodeSource, /APPAREL_PACK_PRESETS/);
  assert.match(nodeSource, /MAX_APPAREL_PACK_SHOTS/);
  assert.match(nodeSource, /buildApparelPackPlan/);
  assert.match(nodeSource, /runApparelPackStages\(plan\.runStages\)/);
  assert.doesNotMatch(nodeSource, /triggerRunMany\(plan\.runNodeIds,\s*'batch'\)/);
  assert.match(nodeSource, /expansionPackId/);
  assert.match(nodeSource, /renderSuitePanel/);
  assert.match(nodeSource, /renderGarmentReferencePanel/);
  assert.match(nodeSource, /renderInspirationPanel/);
  assert.match(nodeSource, /PresetField/);
  assert.match(nodeSource, /apparelPackGarmentPresetId/);
  assert.match(nodeSource, /apparelPackAudiencePresetId/);
  assert.match(nodeSource, /apparelPackChannelPresetId/);
  assert.match(nodeSource, /apparelPackGarmentTypeCustom/);
  assert.match(nodeSource, /apparelPackCustomPrompt/);
  assert.match(nodeSource, /apparelPackEnableQualityQa/);
  assert.match(nodeSource, /apparelPackQualityThreshold/);
  assert.match(nodeSource, /type="number"/);
  assert.doesNotMatch(nodeSource, /\[3,\s*4,\s*5\]/);
  assert.match(nodeSource, /useMaterialDropTarget/);
  assert.match(nodeSource, /uploadRoleFiles/);
  assert.match(nodeSource, /RoleImageBucket/);
  assert.match(nodeSource, /上游图片池/);
  assert.match(nodeSource, /data-drag-source/);
  assert.match(nodeSource, /accept="image\/\*"/);
  assert.match(nodeSource, /t8-smart-node-card/);
  assert.match(nodeSource, /t8-smart-node-card__header/);
  assert.match(nodeSource, /t8-smart-node-icon/);
  assert.match(nodeSource, /t8-smart-node-title/);
  assert.match(nodeSource, /t8-smart-node-body/);
  assert.match(nodeSource, /t8-btn t8-btn-primary/);
  assert.match(nodeSource, /t8-select/);
  assert.match(nodeSource, /t8-input/);
});

test('all generated image nodes carry runnable model params and inspectable lineage', () => {
  const modes = [
    buildApparelPackPlan({
      packId: 'check-suite',
      mode: 'suite',
      sourceNodeId: 'pack-node',
      references: { model: ['/m.png'], garment: ['/g.png'] },
    }),
    buildApparelPackPlan({
      packId: 'check-garment',
      mode: 'garment-reference',
      sourceNodeId: 'pack-node',
      references: { garment: ['/g.png'] },
    }),
    buildApparelPackPlan({
      packId: 'check-inspire',
      mode: 'inspiration',
      sourceNodeId: 'pack-node',
      inspiration: { direction: 'marketplace dress', audience: 'kidswear', channel: 'TEMU' },
    }),
  ];

  for (const plan of modes) {
    for (const node of imageNodes(plan)) {
      const data = node.data as any;
      assert.equal(data.model, 'gpt-image-2');
      assert.equal(data.apiModel, 'gpt-image-2');
      assert.ok(data.prompt.trim(), `${node.id} missing prompt`);
      assert.ok(data.aspectRatio, `${node.id} missing aspect ratio`);
      assert.ok(data.sizeLevel, `${node.id} missing size level`);
      assert.ok(data.lineageRole, `${node.id} missing lineage role`);
      assert.ok(data.anchorPolicy && typeof data.anchorPolicy === 'object', `${node.id} missing anchor policy`);
      assert.ok(Array.isArray(data.referenceImages), `${node.id} missing reference images array`);
      assert.ok(Array.isArray(data.sourceUrls), `${node.id} missing source urls array`);
      assert.ok(Array.isArray(data.sourceNodeIds), `${node.id} missing source node ids array`);
      assert.ok(data.sourceNodeIds.includes('pack-node'), `${node.id} missing pack source node id`);
    }
  }
});
