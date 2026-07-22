import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPAREL_PACK_MODE_OPTIONS,
  APPAREL_PACK_NODE_TYPE,
  APPAREL_PACK_OUTPUT_NODE_TYPE,
  APPAREL_PACK_PRESETS,
  MAX_APPAREL_PACK_SHOTS,
  buildApparelPackPlan,
  buildApparelPackSkillProfileAgentPrompt,
  collectApparelPackPromptSteps,
  compileApparelPackSkillProfile,
  parseApparelPackSkillProfileAgentJson,
} from '../src/utils/apparelPackPlan.ts';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function imageNodes(plan: ReturnType<typeof buildApparelPackPlan>) {
  return plan.nodes.filter((node) => node.type === 'image');
}

function llmNodes(plan: ReturnType<typeof buildApparelPackPlan>) {
  return plan.nodes.filter((node) => node.type === 'llm');
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
  assert.ok(APPAREL_PACK_PRESETS.useCases.find((item) => item.id === 'sleepwear')?.prompt.includes('bedroom'));
  assert.ok(APPAREL_PACK_PRESETS.modelLooks.find((item) => item.id === 'euro-white-cute')?.prompt.includes('European'));
  assert.ok(APPAREL_PACK_PRESETS.poseStyles.find((item) => item.id === 'garment-led')?.prompt.includes('garment use'));
  assert.ok(APPAREL_PACK_PRESETS.cameraStyles.find((item) => item.id === 'iphone-natural')?.prompt.includes('iPhone'));
  assert.ok(APPAREL_PACK_PRESETS.realismStyles.find((item) => item.id === 'daily-real')?.prompt.includes('daily-life'));
  assert.ok(APPAREL_PACK_PRESETS.suiteScenes.find((item) => item.id === 'flatlay')?.prompt.includes('flat lay'));
  assert.ok(APPAREL_PACK_PRESETS.suiteScenes.length >= MAX_APPAREL_PACK_SHOTS);
  const sleepwear = APPAREL_PACK_PRESETS.useCases.find((item) => item.id === 'sleepwear') as any;
  assert.match(sleepwear.promptZh, /睡衣|家居/);
  assert.match(sleepwear.promptEn, /sleepwear|homewear/i);
  assert.equal(sleepwear.prompt, sleepwear.promptEn);
  const camera = APPAREL_PACK_PRESETS.cameraStyles.find((item) => item.id === 'iphone-natural') as any;
  assert.match(camera.promptZh, /iPhone|手机|日常/);
  assert.match(camera.promptEn, /iPhone|natural perspective/i);
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
    ['pack-suite-model-front', 'pack-suite-flatlay', 'pack-suite-hanger'],
    ['pack-suite-model-back', 'pack-suite-model-half'],
  ]);

  const front = imageData(plan, 'pack-suite-model-front');
  assert.equal(front.lineageRole, 'model-front-anchor');
  assert.equal(front.anchorPolicy.model, 'reference-model');
  assert.equal(front.anchorPolicy.garment, 'source-garment');
  assert.equal(front.anchorPolicy.brief, 'llm-finalized-anchor-brief');
  assert.deepEqual(front.sourceNodeIds, ['pack-node', 'pack-suite-brief']);
  assert.deepEqual(front.referenceImages, [
    '/files/input/front.png',
    '/files/input/back.png',
    '/files/input/model.png',
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
  assert.equal(hanger.lineageRole, 'hanger-product-anchor');
  assert.equal(hanger.anchorPolicy.brief, 'llm-finalized-anchor-brief');
  assert.equal(hanger.aspectRatio, '3:4');
  assert.equal(hanger.size, '4K');
  assert.match(hanger.prompt, /hanger|hanging/i);
  assert.deepEqual(hanger.sourceNodeIds, ['pack-node', 'pack-suite-brief']);
  assert.ok(!plan.nodes.some((node) => node.id === 'pack-suite-detail'));

  const flatlay = imageData(plan, 'pack-suite-flatlay');
  assert.equal(flatlay.lineageRole, 'flatlay-anchor');
  assert.equal(flatlay.anchorPolicy.brief, 'llm-finalized-anchor-brief');
  assert.deepEqual(flatlay.sourceNodeIds, ['pack-node', 'pack-suite-brief']);

  const anchorBriefEdges = plan.edges.filter((edge) => edge.source === 'pack-suite-brief').map((edge) => edge.target).sort();
  assert.deepEqual(anchorBriefEdges, [
    'pack-suite-flatlay',
    'pack-suite-hanger',
    'pack-suite-model-front',
  ]);
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
    ['pack-product-model-front', 'pack-product-flatlay', 'pack-product-hanger'],
    ['pack-product-model-back', 'pack-product-model-half'],
    ['pack-product-detail'],
  ]);

  const hanger = imageData(plan, 'pack-product-hanger');
  assert.equal(hanger.lineageRole, 'hanger-product-anchor');
  assert.equal(hanger.anchorPolicy.layout, 'hanger');
  assert.equal(hanger.anchorPolicy.brief, 'llm-finalized-anchor-brief');
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

test('apparel pack exposes editable prompt steps and applies user overrides', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-prompts',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/model.png'],
      garment: ['/files/input/front.png'],
    },
    suite: {
      shotCount: 3,
      customPrompt: 'keep the same pearl buttons and exact fabric texture',
    },
    promptOverrides: {
      brief: {
        systemPrompt: 'CUSTOM BRIEF SYSTEM: plan only apparel ecommerce steps.',
        userPrompt: 'CUSTOM BRIEF USER: make the shot list compact and inspectable.',
      },
      'model-front-anchor': {
        systemPrompt: 'CUSTOM FRONT SYSTEM: protect the garment truth above everything.',
        userPrompt: 'CUSTOM FRONT USER: front view, same model, same garment, no redesign.',
      },
    },
    autoRun: false,
  });

  const steps = collectApparelPackPromptSteps(plan);
  const briefStep = steps.find((item) => item.key === 'brief');
  const frontStep = steps.find((item) => item.key === 'model-front-anchor');
  assert.ok(briefStep, 'missing brief prompt step');
  assert.ok(frontStep, 'missing front prompt step');
  assert.match((frontStep as any).defaultUserPromptZh, /正面|服装|模特|镜头|背景/);
  assert.match((frontStep as any).defaultUserPromptEn, /Shot role: model-front-anchor/);
  assert.match((frontStep as any).translationDiff.zhText, /正面|服装/);
  assert.match((frontStep as any).translationDiff.enText, /Shot role: model-front-anchor/);
  assert.ok((frontStep as any).translationDiff.coverageScore >= 60, 'expected translated prompt diff coverage');
  assert.ok((frontStep as any).translationDiff.keywordPairs.some((item: any) => item.zh === '服装' && item.en === 'garment'));
  assert.equal(briefStep.systemPrompt, 'CUSTOM BRIEF SYSTEM: plan only apparel ecommerce steps.');
  assert.equal(briefStep.userPrompt, 'CUSTOM BRIEF USER: make the shot list compact and inspectable.');
  assert.equal(frontStep.systemPrompt, 'CUSTOM FRONT SYSTEM: protect the garment truth above everything.');
  assert.equal(frontStep.userPrompt, 'CUSTOM FRONT USER: front view, same model, same garment, no redesign.');
  assert.match(frontStep.defaultUserPrompt, /Shot role: model-front-anchor/);

  const front = imageData(plan, 'pack-prompts-model-front');
  assert.equal(front.promptAgent.systemPrompt, 'CUSTOM FRONT SYSTEM: protect the garment truth above everything.');
  assert.equal(front.promptAgent.userPrompt, 'CUSTOM FRONT USER: front view, same model, same garment, no redesign.');
  assert.match(front.prompt, /CUSTOM FRONT SYSTEM/);
  assert.match(front.prompt, /CUSTOM FRONT USER/);
  assert.equal(front.promptKey, 'model-front-anchor');

  const brief = nodeById(plan, 'pack-prompts-brief');
  assert.equal(brief.data.promptKey, 'brief');
  assert.equal(brief.data.systemPrompt, 'CUSTOM BRIEF SYSTEM: plan only apparel ecommerce steps.');
  assert.equal(brief.data.prompt, 'CUSTOM BRIEF USER: make the shot list compact and inspectable.');
});

test('apparel pack prompt engineering separates anchor finalization from derived shot changes', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-engineered',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/model.png'],
      garment: ['/files/input/front.png'],
    },
    suite: {
      shotCount: 6,
      garmentPresetId: 'dress',
      channelPresetId: 'temu',
      customPrompt: 'keep the pearl buttons, waist bow, and floral print spacing exactly consistent',
    },
    autoRun: false,
  });

  const front = imageData(plan, 'pack-engineered-model-front');
  assert.match(front.promptAgent.systemPrompt, /Reference hierarchy/i);
  assert.match(front.promptAgent.systemPrompt, /Reference image map/i);
  assert.match(front.promptAgent.systemPrompt, /Allowed-change boundary/i);
  assert.match(front.promptAgent.userPrompt, /Anchor finalization/i);
  assert.match(front.promptAgent.userPrompt, /Image 1/i);
  assert.match(front.promptAgent.userPrompt, /primary garment truth/i);
  assert.match(front.promptAgent.userPrompt, /Image 2/i);
  assert.match(front.promptAgent.userPrompt, /secondary garment/i);
  assert.match(front.prompt, /Immutable anchor lock/i);
  assert.match(front.prompt, /garmentTruthLock/i);
  assert.match(front.prompt, /Use Image 1 as the primary garment truth/i);
  assert.match(front.prompt, /Use Image 2 only for secondary construction/i);
  assert.match(front.prompt, /model or style reference must never override garmentTruthLock/i);

  const flatlay = imageData(plan, 'pack-engineered-flatlay');
  assert.match(flatlay.prompt, /product-only anchor/i);
  assert.match(flatlay.prompt, /no model/i);

  const back = imageData(plan, 'pack-engineered-model-back');
  assert.match(back.promptAgent.userPrompt, /Derived-shot rule/i);
  assert.match(back.prompt, /Generated anchor image becomes Image 1 for this derived shot/i);
  assert.match(back.prompt, /Allowed change: change only viewpoint to back view/i);
  assert.match(back.prompt, /Do not change garment silhouette, colorway, print placement, model identity, lighting family, or channel fit/i);
});

test('apparel skill profile compiles multiple skills, user intent, conflicts, and readable trace', () => {
  const profile = compileApparelPackSkillProfile({
    mode: 'garment-reference',
    userPrompt: '女童粉色睡衣套装，背景要有小猪佩奇主题道具，欧美白人可爱模特，iPhone 日常感',
    currentConfig: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
      modelLookPresetId: 'east-asian-cute',
      cameraPresetId: 'dslr-commerce',
      qualityThreshold: 'normal',
    },
    skills: [
      {
        name: 'childrenswear-model-tryon-workflow',
        description: 'kidswear model try-on, child-safe ecommerce model photos',
        body: 'Product fidelity has priority. Child model prompts must avoid cleft chin, butt chin, hand-on-hip and pageant stance. Flatlay prompts must require background contrast and only natural wrinkles.',
        verification: [{ id: 'child-safe', label: '儿童安全' }],
      },
      {
        name: 'visual-prompt-director',
        description: 'prompt architecture and model-aware prompt systems',
        body: 'Prompt skeleton: subject, reference constraints, camera, lighting, background, negative constraints.',
        verification: [{ id: 'visible-mechanics', label: '可见机制' }],
      },
      {
        name: 'visual-consistency-qa',
        description: 'visual consistency QA retry plan',
        body: 'Separate product fidelity, model consistency, composition, artifacts, channel fit. Create focused retry nodes only for failed dimensions.',
        verification: [{ id: 'focused-retry', label: '聚焦重试' }],
      },
    ],
  });

  assert.equal(profile.version, 'apparel-skill-profile-v1');
  assert.equal(profile.domain, 'skills-agent-apparel-workbench');
  assert.equal(profile.sourceSkills.length, 3);
  assert.ok(profile.readableSummary.includes('女童粉色睡衣套装'));
  assert.ok(profile.presets.audiencePresetId.value === 'kidswear');
  assert.ok(profile.presets.modelLookPresetId.value === 'euro-white-cute');
  assert.ok(profile.presets.cameraPresetId.value === 'iphone-natural');
  assert.ok(profile.presets.qualityThreshold.value === 'strict');
  assert.ok(profile.referenceSlots.some((slot) => slot.id === 'garmentFront' && slot.firstAnchorOnly));
  assert.ok(profile.steps.some((step) => step.id === 'anchor-brief' && step.sourceRefs.some((ref) => ref.skillName === 'visual-prompt-director')));
  assert.ok(profile.steps.some((step) => step.id === 'anchor-qa' && /focused retry/i.test(step.userPrompt)));
  assert.ok(profile.conflicts.some((item) => item.field === 'modelLookPresetId' && item.chosen === 'euro-white-cute'));
  assert.ok(profile.trace.some((item) => item.field === 'presets.modelLookPresetId' && item.sourceType === 'user'));
  assert.ok(profile.json.includes('"sourceSkills"'));
});

test('apparel skill profile injects prompt context and trace metadata into generated plan', () => {
  const skillProfile = compileApparelPackSkillProfile({
    mode: 'garment-reference',
    userPrompt: 'Peppa Pig pink sleepwear set, European white cute child model, iPhone daily realism',
    currentConfig: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
    },
    skills: [
      {
        name: 'childrenswear-model-tryon-workflow',
        description: 'child-safe kidswear try-on',
        body: 'Child model prompts must specify normal child chin and soft jawline. Flatlay and hanger wrinkle rule: remove obvious wrinkles; only natural fabric wrinkles.',
      },
      {
        name: 'visual-consistency-qa',
        description: 'visual consistency QA',
        body: 'QA must separate product fidelity, model consistency, composition, artifacts and channel fit. Focused retry patch.',
      },
    ],
  });
  const plan = buildApparelPackPlan({
    packId: 'pack-skill-profile',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garmentFront: ['/files/input/top-front.png', '/files/input/bottom-front.png'],
      garmentBack: ['/files/input/top-back.png', '/files/input/bottom-back.png'],
    } as any,
    garmentReference: {
      shotCount: 5,
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
    } as any,
    qualityQa: { enabled: true, passThreshold: 'strict' },
    skillProfile,
    autoRun: false,
  });

  const front = imageData(plan, 'pack-skill-profile-model-front');
  assert.equal(front.skillProfileId, skillProfile.id);
  assert.equal(front.skillProfileVersion, 'apparel-skill-profile-v1');
  assert.match(front.prompt, /Skill profile:/);
  assert.match(front.prompt, /childrenswear-model-tryon-workflow/);
  assert.match(front.prompt, /Peppa Pig pink sleepwear set/i);
  assert.match(front.prompt, /normal child chin|soft jawline/i);

  const qa = nodeById(plan, 'pack-skill-profile-anchor-quality-qa');
  assert.equal(qa.data.skillProfileId, skillProfile.id);
  assert.match(String(qa.data.prompt), /Skill profile:/);
  assert.match(String(qa.data.prompt), /focused retry/i);
});

test('apparel skill profile agent prompt and parser keep LLM profile drafts on the same JSON contract', () => {
  const fallback = compileApparelPackSkillProfile({
    mode: 'suite',
    userPrompt: '粉色女童睡衣套装，欧美白人可爱模特，iPhone 日常感',
    currentConfig: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
      qualityThreshold: 'strict',
    },
    skills: [
      {
        name: 'childrenswear-model-tryon-workflow',
        description: 'child-safe kidswear try-on',
        body: 'Use apparel-pack workflow, anchor-first, child-safe model, flatlay contrast, focused retry patch.',
      },
    ],
  });

  const prompt = buildApparelPackSkillProfileAgentPrompt({
    mode: 'suite',
    userPrompt: fallback.userIntent,
    currentConfig: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
    },
    skills: [
      {
        name: 'childrenswear-model-tryon-workflow',
        description: 'child-safe kidswear try-on',
        body: 'Anchor-first kidswear generation.',
      },
    ],
  }, fallback);

  assert.match(prompt.systemPrompt, /JSON only/i);
  assert.match(prompt.systemPrompt, /apparel-skill-profile-v1/);
  assert.match(prompt.userPrompt, /selectedSkills/);
  assert.match(prompt.userPrompt, /用户提示词优先/);
  assert.match(prompt.userPrompt, /childrenswear-model-tryon-workflow/);
  assert.match(prompt.userPrompt, /referenceSlots/);
  assert.match(prompt.userPrompt, /qualityGates/);

  const parsed = parseApparelPackSkillProfileAgentJson(`LLM draft:\n\`\`\`json\n${JSON.stringify({
    title: 'LLM 童装封包草案',
    readableSummary: 'LLM 重新规划后的可读摘要',
    presets: {
      ...fallback.presets,
      cameraPresetId: {
        label: '镜头',
        value: 'ccd-snapshot',
        sourceType: 'skill',
        sourceName: 'LLM 草案',
        reason: 'LLM 按用户想要更日常的快照感调整',
      },
    },
    steps: fallback.steps,
    trace: [
      ...fallback.trace,
      {
        field: 'presets.cameraPresetId',
        value: 'ccd-snapshot',
        sourceType: 'skill',
        sourceName: 'LLM 草案',
        reason: 'LLM 输出覆盖',
      },
    ],
  })}\n\`\`\``, fallback);

  assert.ok(parsed, 'expected parsed draft profile');
  assert.equal(parsed?.version, 'apparel-skill-profile-v1');
  assert.equal(parsed?.domain, 'skills-agent-apparel-workbench');
  assert.equal(parsed?.title, 'LLM 童装封包草案');
  assert.equal(parsed?.presets.cameraPresetId.value, 'ccd-snapshot');
  assert.equal(parsed?.sourceSkills[0].name, 'childrenswear-model-tryon-workflow');
  assert.ok(parsed?.json.includes('"LLM 童装封包草案"'));
});

test('brief and QA prompts expose structured contracts for prompt tuning', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-contract',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garment: ['/files/input/garment-front.png', '/files/input/garment-detail.png'],
    },
    garmentReference: {
      garmentType: 'hoodie',
      shotCount: 5,
      includeFlatlay: true,
      includeDetail: true,
    },
    qualityQa: {
      enabled: true,
      passThreshold: 'strict',
      customPrompt: 'retry if rib cuff, drawcord, or chest print drifts',
    },
    autoRun: true,
  });

  const brief = nodeById(plan, 'pack-contract-brief');
  assert.match(String(brief.data.systemPrompt), /garmentTruthLock/i);
  assert.match(String(brief.data.prompt), /anchorShotBriefs/i);
  assert.match(String(brief.data.prompt), /derivedShotRules/i);
  assert.match(String(brief.data.prompt), /front model, flat lay front, hanger front/i);

  const qa = nodeById(plan, 'pack-contract-quality-qa');
  assert.match(String(qa.data.systemPrompt), /retryPromptPatch/i);
  assert.match(String(qa.data.prompt), /retryPromptPatch/i);
  assert.match(String(qa.data.prompt), /keep/i);
  assert.match(String(qa.data.prompt), /strengthen/i);
  assert.match(String(qa.data.prompt), /remove/i);
  assert.match(String(qa.data.prompt), /do not rewrite successful variables/i);
});

test('apparel pack prompt engineering supports multi-piece outfits and scene routing', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-set',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garment: [
        '/files/input/top-front.png',
        '/files/input/bottom-front.png',
        '/files/input/top-back.png',
        '/files/input/bottom-back.png',
      ],
    },
    garmentReference: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      customGarmentType: 'girls pajama cami top and shorts set',
      customPrompt: 'sleepwear homewear set with Peppa Pig print; use a bright bedroom scene with a white rug and soft toy props; echo the Peppa Pig theme in background props',
      shotCount: 5,
      includeFlatlay: true,
      includeDetail: true,
      outputRatio: '3:4',
      sizeLevel: '1K',
      useCasePresetId: 'sleepwear',
      modelLookPresetId: 'euro-white-cute',
      posePresetId: 'garment-led',
      cameraPresetId: 'iphone-natural',
      realismPresetId: 'daily-real',
    } as any,
    autoRun: false,
  });

  const front = imageData(plan, 'pack-set-model-front');
  assert.match(front.promptAgent.systemPrompt, /garmentSetLock/i);
  assert.match(front.promptAgent.systemPrompt, /themeMotifLock/i);
  assert.match(front.promptAgent.systemPrompt, /modelAppearanceLock/i);
  assert.match(front.promptAgent.userPrompt, /Image 1:\s*top front/i);
  assert.match(front.promptAgent.userPrompt, /Image 2:\s*bottom front/i);
  assert.match(front.promptAgent.userPrompt, /Image 3:\s*top back/i);
  assert.match(front.promptAgent.userPrompt, /Image 4:\s*bottom back/i);
  assert.match(front.prompt, /wear the complete matching set/i);
  assert.match(front.prompt, /do not generate only shorts/i);
  assert.match(front.prompt, /Target audience: kidswear marketplace customer/i);
  assert.doesNotMatch(front.prompt, /Target audience: women/i);
  assert.match(front.prompt, /choose .*pose.*garment use/i);
  assert.match(front.prompt, /garment-context background elements/i);
  assert.match(front.prompt, /themeMotifLock/i);
  assert.match(front.prompt, /Peppa Pig/i);
  assert.match(front.prompt, /Peppa Pig.*background/i);
  assert.match(front.prompt, /modelAppearanceLock/i);
  assert.match(front.prompt, /European\/Caucasian white child model/i);
  assert.match(front.prompt, /soft round face|bright eyes|natural smile|warm brown hair/i);
  assert.match(front.prompt, /poseLock/i);
  assert.match(front.prompt, /garment use/i);
  assert.match(front.prompt, /cameraLookLock/i);
  assert.match(front.prompt, /iPhone/i);
  assert.match(front.prompt, /realismStyleLock/i);
  assert.match(front.prompt, /daily-life/i);
  assert.doesNotMatch(front.prompt, /simple pose/i);
  assert.match(front.prompt, /bright bedroom|white rug|soft toys|homewear/i);
  assert.doesNotMatch(front.prompt, /plain studio background/i);

  const flatlay = imageData(plan, 'pack-set-flatlay-anchor');
  assert.match(flatlay.prompt, /show all set pieces/i);
  assert.match(flatlay.prompt, /top and bottom/i);
  assert.match(flatlay.prompt, /front product set anchor/i);
});

test('apparel pack prompts harden first-shot model quality and product-only layout QA', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-quality-lessons',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garmentFront: ['/files/input/cami-front.png', '/files/input/shorts-front.png'],
      garmentBack: ['/files/input/cami-back.png', '/files/input/shorts-back.png'],
    } as any,
    garmentReference: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
      modelLookPresetId: 'euro-white-cute',
      posePresetId: 'garment-led',
      cameraPresetId: 'iphone-natural',
      realismPresetId: 'daily-real',
      customGarmentType: 'girls pink pajama camisole top and shorts set',
      customPrompt: 'Peppa Pig pink sleepwear set; background props should echo the Peppa Pig theme without overpowering the garment',
      shotCount: 5,
      includeFlatlay: true,
      includeDetail: true,
      outputRatio: '3:4',
      sizeLevel: '4K',
      imageQuality: 'auto',
    } as any,
    qualityQa: {
      enabled: true,
      passThreshold: 'strict',
    },
    autoRun: false,
  });

  const front = imageData(plan, 'pack-quality-lessons-model-front');
  assert.match(front.prompt, /normal child chin|natural child chin|avoid cleft chin|avoid butt chin|avoid protruding chin/i);
  assert.match(front.prompt, /no chin dimple|no vertical chin crease|no lower-face crease/i);
  assert.match(front.prompt, /age-appropriate body proportion|child-safe body proportion|head-to-body proportion/i);
  assert.match(front.prompt, /pose.*garment use|garment-led pose/i);
  assert.match(front.prompt, /avoid hand-on-hip|no hand-on-hip|no pageant stance|avoid pageant pose/i);
  assert.match(front.prompt, /cami|camisole/i);
  assert.match(front.prompt, /shorts/i);
  assert.match(front.prompt, /no long sleeves|no long pants|no dress|no romper|no skirt|do not turn.*long/i);
  assert.match(front.prompt, /Peppa Pig.*background|background.*Peppa Pig/i);

  const flatlay = imageData(plan, 'pack-quality-lessons-flatlay-anchor');
  assert.match(flatlay.prompt, /background.*contrast|contrast.*background/i);
  assert.match(flatlay.prompt, /must not match the garment color|avoid tone-on-tone/i);
  assert.match(flatlay.prompt, /no dominant white rug|no dominant cream|avoid white fur rug|avoid high-key white/i);
  assert.match(flatlay.prompt, /pale mint|light blue|sage|cool pastel/i);
  assert.match(flatlay.prompt, /remove obvious wrinkles|only natural fabric wrinkles/i);
  assert.match(flatlay.prompt, /breathing room|complete margins|no crop/i);
  assert.match(flatlay.prompt, /8-12%|negative space|not touch.*image edges|zoomed-out/i);
  assert.match(flatlay.prompt, /72-78%|75%|frame height|continuous background border/i);
  assert.match(flatlay.prompt, /visual focal point|product hero focal point/i);

  const hanger = imageData(plan, 'pack-quality-lessons-hanger');
  assert.match(hanger.prompt, /background.*contrast|contrast.*background/i);
  assert.match(hanger.prompt, /no dominant white wall|avoid high-key white|cool pastel wall/i);
  assert.match(hanger.prompt, /remove obvious wrinkles|only natural fabric wrinkles/i);
  assert.match(hanger.prompt, /natural drape/i);
  assert.match(hanger.prompt, /complete margins|no crop/i);
  assert.match(hanger.prompt, /8-12%|negative space|not touch.*image edges|zoomed-out/i);
  assert.match(hanger.prompt, /72-78%|75%|frame height|continuous background border/i);

  const qa = nodeById(plan, 'pack-quality-lessons-quality-qa');
  assert.match(String(qa.data.prompt), /flatlay background too close to garment color/i);
  assert.match(String(qa.data.prompt), /white rug|cream background|high-key white/i);
  assert.match(String(qa.data.prompt), /obvious wrinkles/i);
  assert.match(String(qa.data.prompt), /chin artifact|cleft chin|butt chin|chin dimple|vertical chin crease/i);
});

test('apparel pack emits structured anchor quality gates and focused retry patches', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-gated',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garmentFront: ['/files/input/cami-front.png', '/files/input/shorts-front.png'],
      garmentBack: ['/files/input/cami-back.png', '/files/input/shorts-back.png'],
    } as any,
    garmentReference: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
      modelLookPresetId: 'euro-white-cute',
      posePresetId: 'garment-led',
      cameraPresetId: 'iphone-natural',
      realismPresetId: 'daily-real',
      customGarmentType: 'girls pink pajama camisole top and shorts set',
      customPrompt: 'Peppa Pig pink sleepwear set; keep a cute daily bedroom feeling',
      shotCount: 5,
      includeFlatlay: true,
      includeDetail: true,
      outputRatio: '3:4',
      sizeLevel: '4K',
      imageQuality: 'auto',
    } as any,
    qualityQa: {
      enabled: true,
      passThreshold: 'strict',
    },
    autoRun: false,
  });

  const front = imageData(plan, 'pack-gated-model-front');
  const flatlay = imageData(plan, 'pack-gated-flatlay-anchor');
  const hanger = imageData(plan, 'pack-gated-hanger');
  const qa = nodeById(plan, 'pack-gated-quality-qa');

  assert.equal(front.apparelPackQualityGate.kind, 'model-anchor');
  assert.ok(front.apparelPackQualityGate.mustPass.includes('garmentSetComplete'));
  assert.ok(front.apparelPackQualityGate.mustPass.includes('modelFaceQuality'));
  assert.ok(front.apparelPackQualityGate.mustPass.includes('garmentLedPose'));
  assert.match(front.apparelPackQualityGate.failIf.join(' '), /butt chin|hand-on-hip|pageant stance|missing top or bottom/i);
  assert.match(front.apparelPackQualityGate.retryPatchTemplate.finalPromptPatch, /normal child chin|soft jawline|garment-led relaxed pose/i);
  assert.match(front.prompt, /Quality gate/i);

  for (const node of [flatlay, hanger]) {
    assert.equal(node.apparelPackQualityGate.kind, 'product-anchor');
    assert.ok(node.apparelPackQualityGate.mustPass.includes('contrastBackground'));
    assert.ok(node.apparelPackQualityGate.mustPass.includes('edgeMargin'));
    assert.ok(node.apparelPackQualityGate.mustPass.includes('wrinkleControl'));
    assert.ok(node.apparelPackQualityGate.mustPass.includes('productHeroFocalPoint'));
    assert.match(node.apparelPackQualityGate.failIf.join(' '), /tone-on-tone|white rug|cream background|touch image edge|obvious wrinkles/i);
    assert.match(node.apparelPackQualityGate.retryPatchTemplate.finalPromptPatch, /cool pastel contrast|72-78% frame height|8-12% negative space|remove obvious wrinkles/i);
    assert.match(node.prompt, /Quality gate/i);
  }

  assert.equal(qa.data.qualityGatePolicy.inspectMetadata, true);
  assert.equal(qa.data.qualityGatePolicy.stopDerivedShotsWhenAnchorFails, true);
  assert.match(String(qa.data.prompt), /apparelPackQualityGate/i);
  assert.match(String(qa.data.prompt), /stop derived shots|do not continue to derived shots/i);
});

test('apparel pack gates derived generation behind anchor QA and supports anchor-only run scope', () => {
  const commonInput = {
    packId: 'pack-anchor-run',
    mode: 'garment-reference' as const,
    sourceNodeId: 'pack-node',
    references: {
      garmentFront: ['/files/input/cami-front.png', '/files/input/shorts-front.png'],
      garmentBack: ['/files/input/cami-back.png', '/files/input/shorts-back.png'],
    } as any,
    garmentReference: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      useCasePresetId: 'sleepwear',
      modelLookPresetId: 'euro-white-cute',
      posePresetId: 'garment-led',
      shotCount: 6,
      includeFlatlay: true,
      includeDetail: true,
      outputRatio: '3:4',
      sizeLevel: '4K',
    } as any,
    qualityQa: {
      enabled: true,
      passThreshold: 'strict' as const,
    },
  };
  const full = buildApparelPackPlan({
    ...commonInput,
    autoRun: true,
  });
  assert.deepEqual(full.runStages.slice(0, 3), [
    ['pack-anchor-run-brief'],
    ['pack-anchor-run-model-front', 'pack-anchor-run-flatlay-anchor', 'pack-anchor-run-hanger'],
    ['pack-anchor-run-anchor-quality-qa'],
  ]);
  assert.ok(full.runNodeIds.indexOf('pack-anchor-run-anchor-quality-qa') < full.runNodeIds.indexOf('pack-anchor-run-model-back'));

  const anchorQa = nodeById(full, 'pack-anchor-run-anchor-quality-qa');
  assert.equal(anchorQa.type, 'llm');
  assert.equal(anchorQa.data.qualityGatePolicy.anchorOnly, true);
  assert.deepEqual(anchorQa.data.inspectedNodeIds, [
    'pack-anchor-run-model-front',
    'pack-anchor-run-flatlay-anchor',
    'pack-anchor-run-hanger',
  ]);
  assert.match(String(anchorQa.data.prompt), /anchor gate|首图|锚点/i);

  const anchorOnly = buildApparelPackPlan({
    ...commonInput,
    autoRun: true,
    runScope: 'anchors',
  } as any);
  assert.deepEqual(anchorOnly.runStages, [
    ['pack-anchor-run-brief'],
    ['pack-anchor-run-model-front', 'pack-anchor-run-flatlay-anchor', 'pack-anchor-run-hanger'],
    ['pack-anchor-run-anchor-quality-qa'],
  ]);
  assert.ok(!anchorOnly.runNodeIds.includes('pack-anchor-run-model-back'));
  assert.ok(!anchorOnly.runNodeIds.includes('pack-anchor-run-detail'));
  assert.ok(!anchorOnly.runNodeIds.includes('pack-anchor-run-quality-qa'));
});

test('childrenswear skill records apparel-pack prompt QA lessons', () => {
  const skill = read('../.agents/skills/childrenswear-model-tryon-workflow/SKILL.md');
  assert.match(skill, /apparel-pack/i);
  assert.match(skill, /apparelPackQualityGate|质量门槛/i);
  assert.match(skill, /anchor-first|front model, front flatlay, front hanger|首图|锚点/i);
  assert.match(skill, /平铺|flatlay/i);
  assert.match(skill, /挂拍|hanger/i);
  assert.match(skill, /remove obvious wrinkles|去明显褶皱/i);
  assert.match(skill, /only natural fabric wrinkles|只保留自然褶皱/i);
  assert.match(skill, /background.*contrast|背景.*对比/i);
  assert.match(skill, /white rug|白色地毯|cream background|奶油色背景|high-key white|高调白/i);
  assert.match(skill, /hand-on-hip|手叉腰|pageant stance|选美式站姿/i);
  assert.match(skill, /butt chin|cleft chin|屁股下巴|下巴伪影/i);
});

test('apparel pack routes front and back garment references by shot phase', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-oriented',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garmentFront: ['/files/input/top-front.png', '/files/input/bottom-front.png'],
      garmentBack: ['/files/input/top-back.png', '/files/input/bottom-back.png'],
      garmentLeft: ['/files/input/left-side.png'],
      garmentRight: ['/files/input/right-side.png'],
      garmentDetail: ['/files/input/label-detail.png'],
    } as any,
    garmentReference: {
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      channelPresetId: 'temu',
      shotCount: 8,
      includeFlatlay: true,
      includeDetail: true,
      outputRatio: '3:4',
      sizeLevel: '4K',
    } as any,
    autoRun: false,
  });

  const front = imageData(plan, 'pack-oriented-model-front');
  const flatlay = imageData(plan, 'pack-oriented-flatlay-anchor');
  const back = imageData(plan, 'pack-oriented-model-back');
  const side = imageData(plan, 'pack-oriented-model-side');
  const detail = imageData(plan, 'pack-oriented-detail');

  assert.deepEqual(front.referenceImages, ['/files/input/top-front.png', '/files/input/bottom-front.png']);
  assert.deepEqual(flatlay.referenceImages, ['/files/input/top-front.png', '/files/input/bottom-front.png']);
  assert.deepEqual(back.referenceImages, ['/files/input/top-back.png', '/files/input/bottom-back.png']);
  assert.deepEqual(side.referenceImages, ['/files/input/left-side.png', '/files/input/right-side.png']);
  assert.deepEqual(detail.referenceImages, ['/files/input/top-front.png', '/files/input/bottom-front.png', '/files/input/label-detail.png']);
  assert.doesNotMatch(front.prompt, /top-back|bottom-back/i);
  assert.match(back.prompt, /back-view garment references|back garment references/i);
  assert.match(side.prompt, /side garment references|left\/right/i);
});

test('legacy garment references are split into front and back slots before generation', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-legacy-oriented',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      garment: [
        '/files/input/top-front.png',
        '/files/input/bottom-front.png',
        '/files/input/top-back.png',
        '/files/input/bottom-back.png',
      ],
    },
    suite: {
      shotCount: 5,
      garmentPresetId: 'set',
      outputRatio: '3:4',
      sizeLevel: '4K',
    } as any,
    autoRun: false,
  });

  const front = imageData(plan, 'pack-legacy-oriented-model-front');
  const flatlay = imageData(plan, 'pack-legacy-oriented-flatlay');
  const back = imageData(plan, 'pack-legacy-oriented-model-back');

  assert.deepEqual(front.referenceImages, ['/files/input/top-front.png', '/files/input/bottom-front.png']);
  assert.deepEqual(flatlay.referenceImages, ['/files/input/top-front.png', '/files/input/bottom-front.png']);
  assert.deepEqual(back.referenceImages, ['/files/input/top-back.png', '/files/input/bottom-back.png']);
});

test('suite mode uses existing model and flatlay references as replacement anchors', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-suite-adapt',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/existing-model.png'],
      garment: ['/files/input/top-front.png', '/files/input/shorts-front.png'],
      style: ['/files/input/existing-flatlay.png'],
    },
    suite: {
      shotCount: 5,
      garmentPresetId: 'set',
      audiencePresetId: 'kidswear',
      useCasePresetId: 'sleepwear',
      modelLookPresetId: 'euro-white-cute',
      posePresetId: 'garment-led',
      cameraPresetId: 'ccd-snapshot',
      realismPresetId: 'daily-real',
      customPrompt: 'Peppa Pig homewear set; adapt props to Peppa Pig bedroom theme',
    } as any,
    autoRun: false,
  });

  const front = imageData(plan, 'pack-suite-adapt-model-front');
  assert.match(front.prompt, /suiteReferenceAdaptationLock/i);
  assert.match(front.prompt, /use existing model reference/i);
  assert.match(front.prompt, /replace the outfit/i);
  assert.match(front.prompt, /adapt props/i);
  assert.match(front.prompt, /Peppa Pig/i);
  assert.match(front.prompt, /CCD/i);

  const flatlay = imageData(plan, 'pack-suite-adapt-flatlay');
  assert.match(flatlay.prompt, /use existing flatlay.*layout/i);
  assert.match(flatlay.prompt, /replace.*garment/i);
  assert.match(flatlay.prompt, /adapt props/i);
});

test('apparel pack image model settings are applied to generated image nodes', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-image-settings',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/model.png'],
      garment: ['/files/input/top-front.png', '/files/input/shorts-front.png'],
    },
    suite: {
      shotCount: 4,
      outputRatio: '3:4',
      sizeLevel: '4K',
      imageModelId: 'gpt-image-2',
      imageApiModel: 'gpt-image-2',
      imageQuality: 'auto',
      imageSubmitMode: 'async',
    } as any,
    autoRun: false,
  });

  for (const node of imageNodes(plan)) {
    const data = node.data as any;
    assert.equal(data.model, 'gpt-image-2');
    assert.equal(data.apiModel, 'gpt-image-2');
    assert.equal(data.aspectRatio, '3:4');
    assert.equal(data.sizeLevel, '4K');
    assert.equal(data.imageQuality, 'auto');
    assert.equal(data.imageSubmitMode, 'async');
  }
});

test('apparel pack LLM model settings are applied to generated planning and QA nodes', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-llm-settings',
    mode: 'garment-reference',
    sourceNodeId: 'pack-node',
    references: {
      garment: ['/files/input/top-front.png', '/files/input/shorts-front.png'],
    },
    garmentReference: {
      shotCount: 4,
      llmModel: 'gpt-5',
      llmApiModel: 'gpt-5',
    } as any,
    qualityQa: {
      enabled: true,
      passThreshold: 'strict',
    },
    autoRun: false,
  });

  const nodes = llmNodes(plan);
  assert.ok(nodes.length >= 2, 'expected planning brief and QA LLM nodes');
  for (const node of nodes) {
    assert.equal((node.data as any).model, 'gpt-5');
    assert.equal((node.data as any).apiModel, 'gpt-5');
  }
});

test('apparel pack appends a dedicated output node with ordered manifest and image edges', () => {
  const plan = buildApparelPackPlan({
    packId: 'pack-output',
    mode: 'suite',
    sourceNodeId: 'pack-node',
    references: {
      model: ['/files/input/model.png'],
      garment: ['/files/input/front.png'],
    },
    suite: { shotCount: 4 },
    qualityQa: { enabled: true, passThreshold: 'normal' },
    autoRun: true,
  });

  assert.equal(APPAREL_PACK_OUTPUT_NODE_TYPE, 'apparel-pack-output');

  const output = nodeById(plan, 'pack-output-output');
  assert.equal(output.type, 'apparel-pack-output');
  assert.equal(output.data.label, '服装封包输出');
  assert.equal(output.data.apparelPackOutput.packId, 'pack-output');
  assert.equal(output.data.apparelPackOutput.mode, 'suite');
  assert.equal(output.data.apparelPackOutput.imageNodeIds.length, 4);
  assert.equal(output.data.apparelPackOutput.qaNodeId, 'pack-output-quality-qa');
  assert.deepEqual(output.data.apparelPackOutput.scenes.map((item: any) => item.sourceNodeId), [
    'pack-output-model-front',
    'pack-output-model-back',
    'pack-output-model-half',
    'pack-output-flatlay',
  ]);
  assert.deepEqual(output.data.apparelPackOutput.scenes.map((item: any) => item.label), [
    '正面模特',
    '背面模特',
    '半身细节',
    '平铺图',
  ]);

  const outputEdges = plan.edges.filter((edge) => edge.target === 'pack-output-output');
  assert.equal(outputEdges.length, 5);
  assert.ok(outputEdges.some((edge) => edge.source === 'pack-output-quality-qa' && edge.data?.portType === 'text'));
  for (const imageId of output.data.apparelPackOutput.imageNodeIds) {
    assert.ok(outputEdges.some((edge) => edge.source === imageId && edge.data?.portType === 'image'), `missing output edge from ${imageId}`);
  }

  assert.ok(!plan.runNodeIds.includes('pack-output-output'));
  assert.deepEqual(plan.runStages.at(-1), ['pack-output-quality-qa']);
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
    'pack-garment-hanger',
    'pack-garment-model-back',
    'pack-garment-detail',
  ]);
  assert.deepEqual((plan as any).runStages, [
    ['pack-garment-brief'],
    ['pack-garment-model-front', 'pack-garment-flatlay-anchor', 'pack-garment-hanger'],
    ['pack-garment-model-back', 'pack-garment-detail'],
  ]);

  const front = imageData(plan, 'pack-garment-model-front');
  assert.equal(front.lineageRole, 'model-front-anchor');
  assert.equal(front.anchorPolicy.model, 'generated-generic');
  assert.equal(front.anchorPolicy.brief, 'llm-finalized-anchor-brief');
  assert.deepEqual(front.sourceNodeIds, ['pack-node', 'pack-garment-brief']);
  assert.deepEqual(front.referenceImages, ['/files/input/garment-front.png', '/files/input/garment-detail.png']);
  assert.match(front.prompt, /generic fashion model/i);
  assert.match(front.prompt, /dress/i);

  const flatlay = imageData(plan, 'pack-garment-flatlay-anchor');
  assert.equal(flatlay.lineageRole, 'flatlay-anchor');
  assert.equal(flatlay.anchorPolicy.brief, 'llm-finalized-anchor-brief');
  assert.deepEqual(flatlay.sourceNodeIds, ['pack-node', 'pack-garment-brief']);
  assert.match(flatlay.prompt, /flat lay/i);

  const hanger = imageData(plan, 'pack-garment-hanger');
  assert.equal(hanger.lineageRole, 'hanger-product-anchor');
  assert.equal(hanger.anchorPolicy.brief, 'llm-finalized-anchor-brief');
  assert.deepEqual(hanger.sourceNodeIds, ['pack-node', 'pack-garment-brief']);

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
      shotCount: 4,
      includeFlatlay: false,
      includeDetail: true,
    },
    autoRun: true,
  });

  assert.deepEqual(imageNodes(plan).map((node) => node.id), [
    'pack-trimmed-model-front',
    'pack-trimmed-hanger',
    'pack-trimmed-model-back',
    'pack-trimmed-detail',
  ]);
  assert.deepEqual(plan.runStages, [
    ['pack-trimmed-brief'],
    ['pack-trimmed-model-front', 'pack-trimmed-hanger'],
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
      modelLookPresetId: 'euro-white-cute',
      posePresetId: 'garment-led',
      cameraPresetId: 'ccd-snapshot',
      realismPresetId: 'daily-real',
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
  assert.match(front.prompt, /European\/Caucasian white child model/i);
  assert.match(front.prompt, /poseLock/i);
  assert.match(front.prompt, /cameraLookLock/i);
  assert.match(front.prompt, /CCD/i);
  assert.match(front.prompt, /realismStyleLock/i);
  assert.match(front.prompt, /daily-life/i);

  const flatlay = imageData(plan, 'pack-inspire-flatlay');
  assert.deepEqual(flatlay.sourceNodeIds, ['pack-node', 'pack-inspire-llm-brief', 'pack-inspire-model-front']);
});

test('apparel pack node is registered, executable, and uses global smart node styles', () => {
  const registry = read('../src/config/nodeRegistry.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const nodeSource = read('../src/components/nodes/ApparelPackNode.tsx');
  const outputNodeSource = read('../src/components/nodes/ApparelPackOutputNode.tsx');
  const modalLayerSource = read('../src/components/nodes/shared/SmartNodeModalLayer.tsx');
  const placement = read('../src/utils/nodePlacement.ts');
  const ports = read('../src/config/portTypes.ts');
  const types = read('../src/types/canvas.ts');

  assert.match(types, /'apparel-pack'/);
  assert.match(types, /'apparel-pack-output'/);
  assert.match(registry, /type:\s*'apparel-pack'/);
  assert.match(registry, /label:\s*'服装封包生成'/);
  assert.match(registry, /category:\s*'toolbox'/);
  assert.match(registry, /type:\s*'apparel-pack-output'/);
  assert.match(registry, /hidden:\s*true/);
  assert.match(canvas, /const ApparelPackNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/ApparelPackNode'\), 'ApparelPackNode'\);/);
  assert.match(canvas, /const ApparelPackOutputNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/ApparelPackOutputNode'\), 'ApparelPackOutputNode'\);/);
  assert.match(canvas, /'apparel-pack': ApparelPackNode/);
  assert.match(canvas, /'apparel-pack-output': ApparelPackOutputNode/);
  assert.match(canvas, /'apparel-pack'/);
  assert.match(canvas, /'apparel-pack-output'/);
  assert.match(placement, /'apparel-pack':\s*\{\s*w:\s*420,\s*h:\s*460\s*\}/);
  assert.match(placement, /'apparel-pack-output':\s*\{\s*w:\s*420,\s*h:\s*560\s*\}/);
  assert.match(ports, /'apparel-pack-output':\s*\{\s*inputs:\s*\['image', 'text', 'any'\],\s*outputs:\s*\['image', 'any'\]\s*\}/);

  assert.match(nodeSource, /APPAREL_PACK_MODE_OPTIONS/);
  assert.match(nodeSource, /APPAREL_PACK_PRESETS/);
  assert.match(nodeSource, /IMAGE_MODELS/);
  assert.match(nodeSource, /llmModelOptionsFromSettings/);
  assert.match(nodeSource, /resolveConfiguredLlmModel/);
  assert.match(nodeSource, /MAX_APPAREL_PACK_SHOTS/);
  assert.match(nodeSource, /buildApparelPackPlan/);
  assert.match(nodeSource, /collectApparelPackPromptSteps/);
  assert.match(nodeSource, /runApparelPackStages\(plan\.runStages\)/);
  assert.doesNotMatch(nodeSource, /triggerRunMany\(plan\.runNodeIds,\s*'batch'\)/);
  assert.match(nodeSource, /先生成锚点|首图验收/);
  assert.match(nodeSource, /applyPlan\(true,\s*'anchors'\)/);
  assert.match(nodeSource, /expansionPackId/);
  assert.match(nodeSource, /renderSuitePanel/);
  assert.match(nodeSource, /renderGarmentReferencePanel/);
  assert.match(nodeSource, /renderInspirationPanel/);
  assert.match(nodeSource, /PresetField/);
  assert.match(nodeSource, /apparelPackGarmentPresetId/);
  assert.match(nodeSource, /apparelPackAudiencePresetId/);
  assert.match(nodeSource, /apparelPackChannelPresetId/);
  assert.match(nodeSource, /apparelPackUseCasePresetId/);
  assert.match(nodeSource, /apparelPackModelLookPresetId/);
  assert.match(nodeSource, /apparelPackPosePresetId/);
  assert.match(nodeSource, /apparelPackCameraPresetId/);
  assert.match(nodeSource, /apparelPackRealismPresetId/);
  assert.match(nodeSource, /apparelPackGarmentTypeCustom/);
  assert.match(nodeSource, /apparelPackCustomPrompt/);
  assert.match(nodeSource, /模特外观/);
  assert.match(nodeSource, /动作风格/);
  assert.match(nodeSource, /镜头质感/);
  assert.match(nodeSource, /真实感/);
  assert.match(nodeSource, /apparelPackEnableQualityQa/);
  assert.match(nodeSource, /apparelPackQualityThreshold/);
  assert.match(nodeSource, /apparelPackPromptOverrides/);
  assert.match(nodeSource, /提示词预设/);
  assert.match(nodeSource, /系统提示词/);
  assert.match(nodeSource, /用户提示词/);
  assert.match(nodeSource, /重置预设/);
  assert.match(nodeSource, /PromptPanel/);
  assert.match(nodeSource, /ImageParamPanel/);
  assert.match(nodeSource, /ApparelPackWorkbench/);
  assert.match(nodeSource, /compileApparelPackSkillProfile/);
  assert.match(nodeSource, /buildApparelPackSkillProfileAgentPrompt/);
  assert.match(nodeSource, /parseApparelPackSkillProfileAgentJson/);
  assert.match(nodeSource, /getCodexCliSkills/);
  assert.match(nodeSource, /streamCodexCliAgent/);
  assert.match(nodeSource, /apparelPackSelectedSkillNames/);
  assert.match(nodeSource, /apparelPackSkillUserPrompt/);
  assert.match(nodeSource, /apparelPackSkillProfile/);
  assert.match(nodeSource, /apparelPackSkillProfileDraft/);
  assert.match(nodeSource, /apparelPackSkillProfileDraftRaw/);
  assert.match(nodeSource, /apparelPackSkillProfileDraftStatus/);
  assert.match(nodeSource, /Skills \+ Agent 工作台/);
  assert.match(nodeSource, /分析并应用/);
  assert.match(nodeSource, /LLM 草案/);
  assert.match(nodeSource, /应用草案/);
  assert.match(nodeSource, /Profile 草案/);
  assert.match(nodeSource, /Profile JSON/);
  assert.match(nodeSource, /来源追溯/);
  assert.match(nodeSource, /冲突与覆盖/);
  assert.match(nodeSource, /用户提示词优先/);
  assert.match(nodeSource, /SmartNodeModalPage/);
  assert.match(nodeSource, /SmartNodeFloatingPanel/);
  assert.match(nodeSource, /showParamPanel/);
  assert.match(nodeSource, /showWorkbench/);
  assert.match(nodeSource, /生图参数/);
  assert.match(nodeSource, /生成参数/);
  assert.match(nodeSource, /生图模型/);
  assert.match(nodeSource, /LLM模型/);
  assert.match(nodeSource, /apparelPackLlmModel/);
  assert.match(nodeSource, /apparelPackLlmApiModel/);
  assert.match(nodeSource, /modelsForKind\(apiSettings,\s*'image'\)/);
  assert.match(nodeSource, /apparelPackImageModelId:\s*nextModelId/);
  assert.match(nodeSource, /apparelPackImageApiModel:\s*nextModelId/);
  assert.match(nodeSource, /modelSelectOptions/);
  assert.match(nodeSource, /工作台/);
  assert.match(nodeSource, /全流程/);
  assert.match(nodeSource, /生成过程/);
  assert.match(nodeSource, /图片结果/);
  assert.match(nodeSource, /提示词配置/);
  assert.match(nodeSource, /调整提示词/);
  assert.match(nodeSource, /正面参考/);
  assert.match(nodeSource, /背面参考/);
  assert.match(nodeSource, /左侧参考/);
  assert.match(nodeSource, /右侧参考/);
  assert.match(nodeSource, /细节参考/);
  assert.match(nodeSource, /apparelPackGarmentFrontRefs/);
  assert.match(nodeSource, /apparelPackGarmentBackRefs/);
  assert.match(nodeSource, /apparelPackGarmentLeftRefs/);
  assert.match(nodeSource, /apparelPackGarmentRightRefs/);
  assert.match(nodeSource, /apparelPackGarmentDetailRefs/);
  assert.match(nodeSource, /中英对照/);
  assert.match(nodeSource, /翻译diff/);
  assert.match(nodeSource, /translationDiff/);
  assert.match(nodeSource, /defaultUserPromptZh/);
  assert.match(nodeSource, /promptEditorOpen/);
  assert.match(nodeSource, /workbenchImageNodes/);
  assert.match(nodeSource, /调优/);
  assert.match(nodeSource, /工作台设置/);
  assert.match(nodeSource, /工作台素材/);
  assert.match(nodeSource, /workbenchControlPanel/);
  assert.match(nodeSource, /质量门槛/);
  assert.match(nodeSource, /apparelPackQualityGate/);
  assert.match(nodeSource, /mustPass/);
  assert.match(nodeSource, /retryPatchTemplate/);
  assert.doesNotMatch(nodeSource, /absolute left-full top-0 z-50 ml-3 w-\[920px\]/);
  assert.doesNotMatch(nodeSource, /absolute left-full top-12 z-50 ml-3 w-\[420px\]/);
  assert.match(nodeSource, /场景预设/);
  assert.ok((nodeSource.match(/showHint=\{false\}/g) || []).length >= 8, 'main preset helper text should stay hidden in the compact node panel');
  assert.match(nodeSource, /value:\s*'1K'/);
  assert.match(nodeSource, /type="number"/);
  assert.doesNotMatch(nodeSource, /\[3,\s*4,\s*5\]/);
  assert.match(nodeSource, /useMaterialDropTarget/);
  assert.match(nodeSource, /uploadRoleFiles/);
  assert.match(nodeSource, /RoleImageBucket/);
  assert.match(nodeSource, /GARMENT_DIRECTION_ROLES/);
  assert.match(nodeSource, /displayRefsByRole/);
  assert.match(nodeSource, /activeRoleRef/);
  assert.match(nodeSource, /activateRole/);
  assert.match(nodeSource, /首图模特和平铺图只吃服装正面/);
  assert.match(nodeSource, /模特\/风格辅助参考/);
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

  assert.match(outputNodeSource, /function ApparelPackOutputNode/);
  assert.match(outputNodeSource, /useNodeConnections/);
  assert.match(outputNodeSource, /useNodesData/);
  assert.match(outputNodeSource, /SmartImage/);
  assert.match(outputNodeSource, /服装封包输出/);
  assert.match(outputNodeSource, /压缩包/);
  assert.match(outputNodeSource, /预览/);
  assert.match(outputNodeSource, /下载包/);
  assert.match(outputNodeSource, /t8-smart-node-card/);

  assert.match(modalLayerSource, /createPortal/);
  assert.match(modalLayerSource, /function SmartNodeModalPage/);
  assert.match(modalLayerSource, /function SmartNodeFloatingPanel/);
  assert.match(modalLayerSource, /data-canvas-floating-ui/);
  assert.match(modalLayerSource, /aria-modal/);
  assert.match(modalLayerSource, /Escape/);
  assert.match(modalLayerSource, /nested/);
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
