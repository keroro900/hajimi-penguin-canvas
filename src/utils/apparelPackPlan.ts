export const APPAREL_PACK_NODE_TYPE = 'apparel-pack' as const;

export type ApparelPackMode = 'suite' | 'garment-reference' | 'inspiration';

export const APPAREL_PACK_MODE_OPTIONS: Array<{
  id: ApparelPackMode;
  label: string;
  description: string;
}> = [
  {
    id: 'suite',
    label: '套图生成',
    description: '参考模特图和服装图，生成同模特同服装的多张套图。',
  },
  {
    id: 'garment-reference',
    label: '服装参考生成',
    description: '只用服装参考生成模特图、平铺图和细节图。',
  },
  {
    id: 'inspiration',
    label: '灵感模式',
    description: '由 LLM 规划商品设定，再生成服装套图锚点。',
  },
];

export const MAX_APPAREL_PACK_SHOTS = 12;

export type ApparelPackPresetItem = {
  id: string;
  label: string;
  value: string;
  prompt: string;
};

export const APPAREL_PACK_PRESETS = {
  garmentTypes: [
    {
      id: 'garment',
      label: '通用服装',
      value: 'apparel product',
      prompt: 'generic apparel product; preserve silhouette, construction, fabric, color, trims, and print placement from references',
    },
    {
      id: 'dress',
      label: '连衣裙',
      value: 'dress',
      prompt: 'dress product truth; preserve neckline, waist shape, skirt volume, hem length, fabric drape, print scale, and trim details',
    },
    {
      id: 'tee',
      label: 'T 恤',
      value: 't-shirt',
      prompt: 't-shirt product truth; preserve collar rib, shoulder slope, sleeve opening, chest print placement, hem and fabric weight',
    },
    {
      id: 'hoodie',
      label: '卫衣',
      value: 'hoodie',
      prompt: 'hoodie product truth; preserve hood shape, drawcords, kangaroo pocket, cuffs, hem rib, fleece weight, and print placement',
    },
    {
      id: 'shirt',
      label: '衬衫',
      value: 'shirt',
      prompt: 'shirt product truth; preserve collar stand, button placket, sleeve cuffs, yoke, fabric texture, and clean pressed construction',
    },
    {
      id: 'pants',
      label: '裤装',
      value: 'pants',
      prompt: 'pants product truth; preserve rise, waistband, leg width, pocket placement, hem, seam line, fabric weight, and fit',
    },
    {
      id: 'skirt',
      label: '半裙',
      value: 'skirt',
      prompt: 'skirt product truth; preserve waist construction, skirt volume, pleats or panels, hem length, drape, and print continuity',
    },
    {
      id: 'jacket',
      label: '外套',
      value: 'jacket',
      prompt: 'jacket product truth; preserve collar, lapel or hood, zipper/button closure, pocket placement, cuff, hem and outerwear structure',
    },
    {
      id: 'custom',
      label: '自定义',
      value: 'custom apparel',
      prompt: 'use the user custom garment description as the primary product truth; do not invent unsupported garment construction',
    },
  ],
  audiences: [
    {
      id: 'women',
      label: '女装',
      value: 'women ecommerce customer',
      prompt: 'womenwear commercial model direction; natural proportions, elegant readable pose, product-led styling',
    },
    {
      id: 'men',
      label: '男装',
      value: 'men ecommerce customer',
      prompt: 'menswear commercial model direction; relaxed confident posture, clean fit readability, restrained styling',
    },
    {
      id: 'kidswear',
      label: '童装',
      value: 'kidswear marketplace customer',
      prompt: 'child-safe kidswear direction; age-appropriate styling, cheerful but simple pose, no mature styling, garment readability first',
    },
    {
      id: 'teen',
      label: '青少年',
      value: 'teen apparel customer',
      prompt: 'teen apparel direction; casual youthful styling, simple pose, avoid adultized styling, keep product and fit clear',
    },
    {
      id: 'plus-size',
      label: '大码',
      value: 'plus-size apparel customer',
      prompt: 'plus-size ecommerce direction; inclusive realistic body proportions, flattering but honest garment fit, no body distortion',
    },
    {
      id: 'custom',
      label: '自定义',
      value: 'custom audience',
      prompt: 'use the user custom audience and model policy; keep identity generic unless authorized references are supplied',
    },
  ],
  channels: [
    {
      id: 'marketplace',
      label: '通用电商',
      value: 'marketplace ecommerce',
      prompt: 'marketplace-ready ecommerce output; clean background, product-centered crop, high readability, minimal distractions',
    },
    {
      id: 'temu',
      label: 'TEMU',
      value: 'TEMU marketplace listing',
      prompt: 'TEMU listing style; bright clean marketplace image, clear product scale, simple background, strong thumbnail readability',
    },
    {
      id: 'shein',
      label: 'SHEIN',
      value: 'SHEIN fashion listing',
      prompt: 'SHEIN fashion listing style; clean trendy model image, clear fit, controlled styling, garment remains dominant',
    },
    {
      id: 'amazon',
      label: 'Amazon',
      value: 'Amazon ecommerce listing',
      prompt: 'Amazon ecommerce style; compliant clean product presentation, neutral background, accurate color and no fake text',
    },
    {
      id: 'tiktok-shop',
      label: 'TikTok Shop',
      value: 'TikTok Shop product content',
      prompt: 'TikTok Shop commerce style; lively but uncluttered visual, strong hook crop, product readable in vertical feed',
    },
    {
      id: 'brand-lookbook',
      label: '品牌画册',
      value: 'brand lookbook',
      prompt: 'brand lookbook style; refined fashion photography, stronger mood while preserving garment truth and ecommerce usability',
    },
    {
      id: 'custom',
      label: '自定义',
      value: 'custom sales channel',
      prompt: 'use the user custom channel requirements; keep platform constraints explicit and avoid unsupported text or labels',
    },
  ],
  suiteScenes: [
    { id: 'model-front', label: '正面模特', value: 'front model shot', prompt: 'front view ecommerce model image; full-body, garment centered, silhouette and fit immediately readable' },
    { id: 'model-back', label: '背面模特', value: 'back model shot', prompt: 'back view ecommerce model image; same model and garment, back construction and fabric behavior readable' },
    { id: 'model-half', label: '半身细节', value: 'half-body model detail', prompt: 'half-body model crop; neckline, chest area, sleeve, trims, print scale and fabric behavior visible' },
    { id: 'flatlay', label: '平铺图', value: 'flat lay product shot', prompt: 'flat lay product shot; top-down clean garment layout, silhouette and construction readable without a model' },
    { id: 'hanger', label: '挂拍图', value: 'hanger product shot', prompt: 'hanger product shot; front-facing hanging garment, natural drape, collar, sleeve, hem and print visible' },
    { id: 'detail', label: '商品细节', value: 'garment detail shot', prompt: 'close-up garment detail; fabric texture, seam, trim, print, collar or sleeve construction clearly shown' },
    { id: 'model-side', label: '侧身模特', value: 'side model shot', prompt: 'side or three-quarter model shot; same model and garment, side silhouette and fit volume readable' },
    { id: 'model-lifestyle', label: '场景模特', value: 'lifestyle model shot', prompt: 'commerce lifestyle model shot; same garment and model, simple contextual scene with product readability first' },
    { id: 'fabric-macro', label: '面料微距', value: 'fabric macro shot', prompt: 'fabric macro detail; weave, stitch, print edge, texture and material weight visible without changing the garment' },
    { id: 'label-detail', label: '领标/辅料', value: 'label and trim detail', prompt: 'label, collar, button, zipper, drawcord or trim detail; avoid fake text and preserve construction truth' },
    { id: 'size-reference', label: '尺码参考', value: 'size reference shot', prompt: 'size and fit reference shot; product scale, length, sleeve or hem proportion readable without graphic text overlays' },
    { id: 'color-texture', label: '颜色质感', value: 'color and texture shot', prompt: 'color and texture product shot; accurate colorway, material finish and print color fidelity under clean light' },
  ],
  qualityThresholds: [
    { id: 'quick', label: '快速', value: 'quick', prompt: 'quick QA; flag only obvious garment drift, anatomy errors, bad composition, and unusable outputs' },
    { id: 'normal', label: '标准', value: 'normal', prompt: 'normal QA; score garment fidelity, model consistency, composition, technical artifacts, and channel fit' },
    { id: 'strict', label: '严格', value: 'strict', prompt: 'strict QA; require strong product fidelity, stable model identity, clean anatomy, exact prompt adherence, and retry patches for any drift' },
  ],
} satisfies Record<string, readonly ApparelPackPresetItem[]>;

export type ApparelPackReferenceSet = {
  model?: string[];
  garment?: string[];
  style?: string[];
  existing?: string[];
};

export type ApparelPackSuiteConfig = {
  shotCount?: number;
  lockLevel?: 'pose' | 'pose-background' | 'authorized-identity-pose' | 'free-commercial';
  modelConsistency?: 'normal' | 'strict';
  garmentConsistency?: 'normal' | 'strict';
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customPrompt?: string;
  scenePresetIds?: string[];
  outputRatio?: string;
  sizeLevel?: string;
};

type ApparelPromptAgentSpec = {
  systemPrompt: string;
  userPrompt: string;
  finalPrompt: string;
};

export type ApparelPackGarmentReferenceConfig = {
  audience?: string;
  garmentType?: string;
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customPrompt?: string;
  modelPolicy?: 'generic' | 'no-face' | 'body-crop';
  shotCount?: number;
  includeFlatlay?: boolean;
  includeDetail?: boolean;
  outputRatio?: string;
  sizeLevel?: string;
};

export type ApparelPackInspirationConfig = {
  direction?: string;
  audience?: string;
  channel?: string;
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customPrompt?: string;
  planningStrength?: 'light' | 'balanced' | 'strict';
  shotCount?: number;
  outputRatio?: string;
  sizeLevel?: string;
};

export type ApparelPackQualityConfig = {
  enabled?: boolean;
  passThreshold?: 'quick' | 'normal' | 'strict';
  customPrompt?: string;
};

export type ApparelPackPlanInput = {
  packId: string;
  mode: ApparelPackMode;
  position?: { x: number; y: number };
  sourceNodeId?: string;
  references?: ApparelPackReferenceSet;
  suite?: ApparelPackSuiteConfig;
  garmentReference?: ApparelPackGarmentReferenceConfig;
  inspiration?: ApparelPackInspirationConfig;
  qualityQa?: ApparelPackQualityConfig;
  autoRun?: boolean;
};

export type ApparelPackPlanNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
};

export type ApparelPackPlanEdge = {
  id: string;
  source: string;
  target: string;
  data?: Record<string, any>;
};

export type ApparelPackPlan = {
  title: string;
  goal: string;
  summary: {
    mode: ApparelPackMode;
    imageCount: number;
    anchorCount: number;
  };
  nodes: ApparelPackPlanNode[];
  edges: ApparelPackPlanEdge[];
  runNodeIds: string[];
  runStages: string[][];
  focusViewport: { x: number; y: number; zoom: number };
};

const DEFAULT_POSITION = { x: 0, y: 0 };
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_API_MODEL = 'gpt-image-2';
const DEFAULT_RATIO = '3:4';
const DEFAULT_SIZE = '2K';
const PROMPT_AGENT_NAME = 'apparel-pack-prompt-agent';
const QUALITY_AGENT_NAME = 'apparel-pack-quality-agent';

export const DEFAULT_APPAREL_PACK_CONFIG = {
  suite: {
    shotCount: 6,
    lockLevel: 'pose' as const,
    modelConsistency: 'strict' as const,
    garmentConsistency: 'strict' as const,
    garmentPresetId: 'garment',
    audiencePresetId: 'women',
    channelPresetId: 'marketplace',
    customPrompt: '',
    outputRatio: DEFAULT_RATIO,
    sizeLevel: DEFAULT_SIZE,
  },
  garmentReference: {
    audience: 'women',
    garmentType: 'garment',
    garmentPresetId: 'garment',
    audiencePresetId: 'women',
    channelPresetId: 'marketplace',
    customPrompt: '',
    modelPolicy: 'generic' as const,
    shotCount: 4,
    includeFlatlay: true,
    includeDetail: true,
    outputRatio: DEFAULT_RATIO,
    sizeLevel: DEFAULT_SIZE,
  },
  inspiration: {
    direction: '',
    audience: 'marketplace customer',
    channel: 'e-commerce',
    garmentPresetId: 'garment',
    audiencePresetId: 'women',
    channelPresetId: 'marketplace',
    customPrompt: '',
    planningStrength: 'balanced' as const,
    shotCount: 4,
    outputRatio: DEFAULT_RATIO,
    sizeLevel: DEFAULT_SIZE,
  },
  qualityQa: {
    enabled: false,
    passThreshold: 'normal' as const,
    customPrompt: '',
  },
};

function cleanId(value: string): string {
  return String(value || 'apparel-pack')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'apparel-pack';
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function presetFrom(list: readonly ApparelPackPresetItem[], id: unknown, fallbackId: string): ApparelPackPresetItem {
  return list.find((item) => item.id === String(id || '')) || list.find((item) => item.id === fallbackId) || list[0];
}

function presetValue(preset: ApparelPackPresetItem, custom: unknown): string {
  const text = String(custom || '').trim();
  if (preset.id === 'custom' && text) return text;
  return text || preset.value;
}

function compactLines(values: Array<string | undefined>): string[] {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function resolvePresetContext(params: {
  garmentPresetId?: string;
  audiencePresetId?: string;
  channelPresetId?: string;
  customGarmentType?: string;
  customAudience?: string;
  customChannel?: string;
  customPrompt?: string;
  fallbackGarment?: string;
  fallbackAudience?: string;
  fallbackChannel?: string;
}) {
  const garmentPreset = presetFrom(APPAREL_PACK_PRESETS.garmentTypes, params.garmentPresetId, 'garment');
  const audiencePreset = presetFrom(APPAREL_PACK_PRESETS.audiences, params.audiencePresetId, 'women');
  const channelPreset = presetFrom(APPAREL_PACK_PRESETS.channels, params.channelPresetId, 'marketplace');
  const garmentType = String(params.customGarmentType || params.fallbackGarment || '').trim()
    || presetValue(garmentPreset, '');
  const audience = String(params.customAudience || params.fallbackAudience || '').trim()
    || presetValue(audiencePreset, '');
  const channel = String(params.customChannel || params.fallbackChannel || '').trim()
    || presetValue(channelPreset, '');
  const customPrompt = String(params.customPrompt || '').trim();
  const lines = compactLines([
    `Garment preset (${garmentPreset.label}): ${garmentPreset.prompt}`,
    `Audience preset (${audiencePreset.label}): ${audiencePreset.prompt}`,
    `Channel preset (${channelPreset.label}): ${channelPreset.prompt}`,
    customPrompt ? `User custom prompt: ${customPrompt}` : undefined,
  ]);
  return {
    garmentPreset,
    audiencePreset,
    channelPreset,
    garmentType,
    audience,
    channel,
    customPrompt,
    promptLines: lines,
    promptText: lines.join(' | '),
  };
}

function collectReferences(refs: ApparelPackReferenceSet | undefined, keys: Array<keyof ApparelPackReferenceSet>): string[] {
  return unique(keys.flatMap((key) => refs?.[key] || []));
}

function edge(source: string, target: string, portType = 'any'): ApparelPackPlanEdge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    data: { portType },
  };
}

function buildPromptAgentSpec(params: {
  mode: ApparelPackMode;
  role: string;
  scene: string;
  referencePolicy: string;
  garmentTruth: string;
  modelPolicy: string;
  composition: string;
  lighting: string;
  background: string;
  negatives: string;
  extra?: string[];
  ratio?: string;
  size?: string;
}): ApparelPromptAgentSpec {
  const systemPrompt = [
    'You are the internal prompt agent for an apparel ecommerce canvas workflow.',
    'Write compact, executable image prompts for product-faithful apparel generation.',
    'Prompt skeleton: output role, garment truth, reference constraints, model or product-display policy, composition/camera, lighting/material, background/channel fit, negative constraints.',
    'Keep garment and model consistency explicit. Do not invent logos, prints, labels, celebrity likeness, or unsupported construction.',
  ].join('\n');
  const userPrompt = [
    `Mode: ${params.mode}`,
    `Shot role: ${params.role}`,
    `Lineage role: ${params.role}`,
    `Scene: ${params.scene}`,
    `Reference policy: ${params.referencePolicy}`,
    `Garment truth: ${params.garmentTruth}`,
    `Model/product policy: ${params.modelPolicy}`,
    `Composition and camera: ${params.composition}`,
    `Lighting and material: ${params.lighting}`,
    `Background/channel fit: ${params.background}`,
    `Negative constraints: ${params.negatives}`,
    `Canvas params: aspect ratio ${params.ratio || DEFAULT_RATIO}, size ${params.size || DEFAULT_SIZE}`,
    ...(params.extra || []),
  ].join('\n');
  const finalPrompt = [
    `Shot role: ${params.role}.`,
    `Garment truth: ${params.garmentTruth}.`,
    `Reference constraints: ${params.referencePolicy}.`,
    `Model/product policy: ${params.modelPolicy}.`,
    `Composition and camera: ${params.composition}.`,
    `Lighting and material: ${params.lighting}.`,
    `Background/channel fit: ${params.background}.`,
    ...(params.extra || []).map((item) => `${item}.`),
    `Negative constraints: ${params.negatives}.`,
  ].join(' ');
  return { systemPrompt, userPrompt, finalPrompt };
}

function baseImageData(params: {
  prompt: string | ApparelPromptAgentSpec;
  refs: string[];
  sourceNodeIds: string[];
  sourceUrls?: string[];
  role: string;
  anchorPolicy: Record<string, string>;
  ratio?: string;
  size?: string;
}) {
  const size = params.size || DEFAULT_SIZE;
  const promptAgent = typeof params.prompt === 'string' ? undefined : {
    name: PROMPT_AGENT_NAME,
    systemPrompt: params.prompt.systemPrompt,
    userPrompt: params.prompt.userPrompt,
  };
  const prompt = typeof params.prompt === 'string' ? params.prompt : params.prompt.finalPrompt;
  return {
    model: DEFAULT_MODEL,
    apiModel: DEFAULT_API_MODEL,
    aspectRatio: params.ratio || DEFAULT_RATIO,
    size,
    sizeLevel: size,
    imageQuality: 'medium',
    status: 'idle',
    prompt,
    ...(promptAgent ? { promptAgent } : {}),
    referenceImages: unique(params.refs),
    sourceUrls: unique(params.sourceUrls || params.refs),
    sourceNodeIds: unique(params.sourceNodeIds),
    lineageRole: params.role,
    anchorPolicy: params.anchorPolicy,
    uiVariant: 'smart-card',
  };
}

function makeImageNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  data: Record<string, any>,
): ApparelPackPlanNode {
  return {
    id,
    type: 'image',
    position: { x: base.x + col * 430, y: base.y + row * 560 },
    data,
  };
}

function makeTextNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  text: string,
): ApparelPackPlanNode {
  return {
    id,
    type: 'text',
    position: { x: base.x + col * 430, y: base.y + row * 260 },
    data: { text, prompt: text, outputText: text },
  };
}

function makeLlmNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  data: Record<string, any>,
): ApparelPackPlanNode {
  return {
    id,
    type: 'llm',
    position: { x: base.x + col * 430, y: base.y + row * 320 },
    data,
  };
}

function makePromptAgentNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  text: string,
): ApparelPackPlanNode {
  return makeLlmNode(id, row, col, base, {
    agentRole: PROMPT_AGENT_NAME,
    systemPrompt: [
      'You are the internal prompt agent for apparel package generation.',
      'Return shot-specific systemPrompt/userPrompt/finalPrompt sections for each downstream image node.',
      'Preserve garment truth, model consistency, reference lineage, ecommerce channel fit, and negative constraints.',
    ].join(' '),
    prompt: [
      text,
      '',
      'For every downstream image node, return:',
      'systemPrompt: role and constraints for the image model',
      'userPrompt: shot role, references, anchors, scene, camera, lighting, background',
      'finalPrompt: compact executable prompt',
    ].join('\n'),
    text,
    outputText: text,
    status: 'idle',
  });
}

function makeQualityQaNode(
  id: string,
  row: number,
  col: number,
  base: { x: number; y: number },
  params: {
    mode: ApparelPackMode;
    imageIds: string[];
    references: string[];
    presetContext: ReturnType<typeof resolvePresetContext>;
    threshold?: string;
    customPrompt?: string;
  },
): ApparelPackPlanNode {
  const thresholdPreset = presetFrom(APPAREL_PACK_PRESETS.qualityThresholds, params.threshold, 'normal');
  const text = [
    '服装封包质量测试与提示词调优',
    `Mode: ${params.mode}`,
    `Generated image node ids: ${params.imageIds.join(', ')}`,
    `Reference images: ${params.references.join(', ') || 'none'}`,
    `Pass threshold: ${thresholdPreset.value}`,
    `Threshold prompt: ${thresholdPreset.prompt}`,
    `Preset prompt context: ${params.presetContext.promptText}`,
    params.customPrompt ? `User QA focus: ${params.customPrompt}` : '',
    '',
    'Read every generated result URL, node prompt, promptAgent metadata, referenceImages, sourceNodeIds and lineageRole before judging.',
    'Score each image from 1-10 for: garment fidelity, model consistency, anatomy/pose, composition/crop, technical artifacts, text/logo risk, and channel fit.',
    'Return: pass/fail/needs-retry, exact failed dimension, evidence, and a compact prompt patch for retry nodes.',
    'Prompt patch rules: preserve successful variables, only strengthen failed dimensions, keep gpt-image-2 compatible, do not add unsupported garment details.',
  ].filter(Boolean).join('\n');
  return makeLlmNode(id, row, col, base, {
    agentRole: QUALITY_AGENT_NAME,
    systemPrompt: [
      'You are the quality QA and prompt tuning agent for apparel ecommerce image generation.',
      'Be evidence-based. Inspect outputs, references, prompts, lineage and model params before scoring.',
      'Separate product fidelity, model consistency, anatomy, composition, artifacts, text risk and channel fit.',
      'Do not regenerate. Produce focused prompt patches and retry recommendations.',
    ].join(' '),
    prompt: text,
    text,
    outputText: text,
    status: 'idle',
    qaScope: 'apparel-pack-generated-images',
    passThreshold: thresholdPreset.value,
    inspectedNodeIds: params.imageIds,
    referenceImages: params.references,
  });
}

function clampShotCount(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return max;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function filterStages(stages: string[][], selectedIds: string[]): string[][] {
  const selected = new Set(selectedIds);
  return stages
    .map((stage) => stage.filter((id) => selected.has(id)))
    .filter((stage) => stage.length > 0);
}

function selectPlanImages(nodes: ApparelPackPlanNode[], selectedIds: string[]): ApparelPackPlanNode[] {
  const selected = new Set(selectedIds);
  return nodes.filter((node) => node.type !== 'image' || selected.has(node.id));
}

function buildSuitePlan(input: ApparelPackPlanInput, packId: string, base: { x: number; y: number }): ApparelPackPlan {
  const cfg = { ...DEFAULT_APPAREL_PACK_CONFIG.suite, ...input.suite };
  const qualityCfg = { ...DEFAULT_APPAREL_PACK_CONFIG.qualityQa, ...input.qualityQa };
  const presetContext = resolvePresetContext({
    garmentPresetId: cfg.garmentPresetId,
    audiencePresetId: cfg.audiencePresetId,
    channelPresetId: cfg.channelPresetId,
    customGarmentType: cfg.customGarmentType,
    customAudience: cfg.customAudience,
    customChannel: cfg.customChannel,
    customPrompt: cfg.customPrompt,
  });
  const refs = input.references || {};
  const allRefs = collectReferences(refs, ['model', 'garment', 'style']);
  const sourceNodeIds = unique([input.sourceNodeId]);
  const identityLine = cfg.lockLevel === 'authorized-identity-pose'
    ? 'Preserve the authorized model identity, face structure, body proportion, and commercial pose language.'
    : 'Use the reference model pose language without implying unauthorized celebrity or real-person imitation.';
  const garmentLine = `Keep exact garment fidelity for ${presetContext.garmentType}: silhouette, collar, sleeve, hem, seams, fabric weight, color, trims, and print placement.`;
  const negativeLine = 'no garment redesign, no new logos, no changed print, no fake label text, no distorted body, no extra limbs, no identity drift';
  const promptContextExtra = [
    `Preset prompt context: ${presetContext.promptText}`,
    `Target audience: ${presetContext.audience}`,
    `Sales channel: ${presetContext.channel}`,
  ];
  const sceneById = new Map(APPAREL_PACK_PRESETS.suiteScenes.map((scene) => [scene.id, scene]));
  const requestedScenes = unique(cfg.scenePresetIds || []);
  const orderedScenes = unique([
    'model-front',
    ...requestedScenes,
    ...APPAREL_PACK_PRESETS.suiteScenes.map((scene) => scene.id),
  ])
    .map((id) => sceneById.get(id))
    .filter(Boolean) as ApparelPackPresetItem[];
  const selectedScenes = orderedScenes.slice(0, clampShotCount(cfg.shotCount, 3, MAX_APPAREL_PACK_SHOTS));
  const selectedIds = new Set(selectedScenes.map((scene) => `${packId}-${scene.id}`));
  const frontId = `${packId}-model-front`;
  const flatlayId = `${packId}-flatlay`;
  const hangerId = `${packId}-hanger`;

  const sceneLayout: Record<string, { row: number; col: number }> = {
    'model-front': { row: 0, col: 1 },
    'model-back': { row: 0, col: 2 },
    'model-half': { row: 1, col: 1 },
    flatlay: { row: 1, col: 2 },
    hanger: { row: 1, col: 3 },
    detail: { row: 2, col: 1 },
    'model-side': { row: 2, col: 2 },
    'model-lifestyle': { row: 2, col: 3 },
    'fabric-macro': { row: 3, col: 1 },
    'label-detail': { row: 3, col: 2 },
    'size-reference': { row: 3, col: 3 },
    'color-texture': { row: 4, col: 1 },
  };

  const productAnchorIds = unique([
    input.sourceNodeId,
    selectedIds.has(flatlayId) ? flatlayId : undefined,
    selectedIds.has(hangerId) ? hangerId : undefined,
    frontId,
  ]);

  const sceneNode = (scene: ApparelPackPresetItem): ApparelPackPlanNode => {
    const id = `${packId}-${scene.id}`;
    const layout = sceneLayout[scene.id] || { row: 2 + Math.floor(selectedScenes.indexOf(scene) / 3), col: 1 + (selectedScenes.indexOf(scene) % 3) };
    const productRefs = allRefs;
    const sourceForFront = sourceNodeIds;
    const sourceFromFront = unique([input.sourceNodeId, frontId]);
    const sourceFromProduct = productAnchorIds;
    const common = {
      refs: productRefs,
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
    };
    if (scene.id === 'model-front') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'model-front-anchor',
        sourceNodeIds: sourceForFront,
        anchorPolicy: { model: 'reference-model', garment: 'source-garment', style: refs.style?.length ? 'style-reference' : 'clean-commerce' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'model-front-anchor',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use garment references as product truth and the model reference as the first model anchor',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: `${identityLine} ${presetContext.audiencePreset.prompt}`,
          composition: 'full-body front view, straight readable pose, garment centered and unobstructed',
          lighting: 'soft studio lighting, accurate textile color, visible fabric behavior',
          background: `${presetContext.channelPreset.prompt}; clean ecommerce studio background, product-first composition`,
          negatives: negativeLine,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'model-back') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'model-back-derived',
        sourceNodeIds: sourceFromFront,
        anchorPolicy: { model: 'front-anchor', garment: 'source-garment', view: 'back' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'model-back-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'derive from the front anchor while keeping the same garment references as product truth',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'same model identity, body proportion, crop, styling, and lighting family as the front anchor',
          composition: 'turn the body to show the garment back view clearly, full-body commercial crop',
          lighting: 'consistent studio lighting and fabric rendering from the front anchor',
          background: `same clean ecommerce background family as the front anchor; ${presetContext.channelPreset.prompt}`,
          negatives: negativeLine,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'model-half') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'model-half-detail-derived',
        sourceNodeIds: sourceFromFront,
        anchorPolicy: { model: 'front-anchor', garment: 'source-garment', crop: 'half-body' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'model-half-detail-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'derive model and garment from the front anchor and original garment references',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'same model as the front anchor, face and hands simple, no styling that blocks the garment',
          composition: 'half-body crop showing neckline, chest area, sleeve, trims, fabric behavior, and print scale',
          lighting: 'soft studio lighting with crisp textile texture',
          background: `clean ecommerce background, no distracting props; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no messy hands, no jewelry blocking product`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'flatlay') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'flatlay-derived',
        sourceNodeIds: sourceFromFront,
        anchorPolicy: { garment: 'source-garment', layout: 'flatlay', model: 'none' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'flatlay-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use source garment references and front model anchor only to preserve product identity, no model in output',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'no model, no body, product-only presentation',
          composition: 'top-down flat lay, garment neatly arranged, silhouette and construction readable',
          lighting: 'even soft light, accurate textile color and print clarity',
          background: `clean marketplace surface with minimal commerce props only if useful; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no hanger distortion, no body`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'hanger') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'hanger-product-derived',
        sourceNodeIds: sourceFromFront,
        anchorPolicy: { garment: 'source-garment', layout: 'hanger', model: 'none' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'hanger-product-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use source garment references as product truth; derive product consistency from the front anchor',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'no model, product displayed on a simple hanger or clean hanging setup',
          composition: 'front-facing hanging garment, natural drape, collar, sleeve, hem, seams and print visible',
          lighting: 'soft studio lighting, accurate fabric weight and folds',
          background: `clean ecommerce wall or neutral studio background; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no mannequin body, no distorted hanger, no changed silhouette`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    if (scene.id === 'detail') {
      return makeImageNode(id, layout.row, layout.col, base, baseImageData({
        ...common,
        role: 'garment-detail-derived',
        sourceNodeIds: sourceFromProduct,
        anchorPolicy: { garment: 'source-garment', detail: 'fabric-trim-print' },
        prompt: buildPromptAgentSpec({
          mode: 'suite',
          role: 'garment-detail-derived',
          scene: `${scene.value}; ${scene.prompt}`,
          referencePolicy: 'use flatlay and hanger/product anchors plus source garment references for exact material truth',
          garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
          modelPolicy: 'no model unless the crop naturally contains a tiny garment-on-body area; product detail is primary',
          composition: 'close-up of fabric texture, trim, seam, print detail, collar or sleeve construction',
          lighting: 'macro-friendly soft light with visible weave, stitch, and material texture',
          background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
          negatives: `${negativeLine}, no warped stitching, no fake labels, no unreadable texture`,
          ratio: cfg.outputRatio,
          size: cfg.sizeLevel,
          extra: promptContextExtra,
        }),
      }));
    }
    const modelScene = scene.id === 'model-side' || scene.id === 'model-lifestyle' || scene.id === 'size-reference';
    return makeImageNode(id, layout.row, layout.col, base, baseImageData({
      ...common,
      role: `${scene.id}-derived`,
      sourceNodeIds: modelScene ? sourceFromFront : sourceFromProduct,
      anchorPolicy: modelScene
        ? { model: 'front-anchor', garment: 'source-garment', scene: scene.id }
        : { garment: 'product-anchor', detail: scene.id, model: 'none' },
      prompt: buildPromptAgentSpec({
        mode: 'suite',
        role: `${scene.id}-derived`,
        scene: `${scene.value}; ${scene.prompt}`,
        referencePolicy: modelScene
          ? 'derive from the front model anchor and preserve the same model and garment; only change viewpoint or context'
          : 'derive from product anchors and source garment references; no model identity is needed',
        garmentTruth: `${garmentLine} ${presetContext.garmentPreset.prompt}`,
        modelPolicy: modelScene
          ? `same model identity, body proportion and styling as the front anchor; ${presetContext.audiencePreset.prompt}`
          : 'product-only detail or product-reference shot, no face and no body emphasis',
        composition: scene.prompt,
        lighting: modelScene
          ? 'lighting consistent with the front anchor, color and fabric rendering stable'
          : 'clean product lighting, macro or product-detail clarity, accurate material texture',
        background: `${presetContext.channelPreset.prompt}; keep the output commercially usable and uncluttered`,
        negatives: `${negativeLine}, no unsupported props, no inaccurate text overlay`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    }));
  };

  const imageNodesForScenes = selectedScenes.map(sceneNode);
  const selectedImageIds = imageNodesForScenes.map((node) => node.id);
  const qaEnabled = qualityCfg.enabled === true;
  const qaId = `${packId}-quality-qa`;
  const qaNode = qaEnabled
    ? makeQualityQaNode(qaId, 4, 2, base, {
      mode: 'suite',
      imageIds: selectedImageIds,
      references: allRefs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
    })
    : null;
  const nodes: ApparelPackPlanNode[] = [
    makePromptAgentNode(
      `${packId}-brief`,
      0,
      0,
      base,
      [
        '服装套图生成规划',
        `锁定级别: ${cfg.lockLevel}`,
        `模特一致性: ${cfg.modelConsistency}`,
        `服装一致性: ${cfg.garmentConsistency}`,
        `品类预设: ${presetContext.garmentPreset.label} / ${presetContext.garmentType}`,
        `人群预设: ${presetContext.audiencePreset.label} / ${presetContext.audience}`,
        `平台预设: ${presetContext.channelPreset.label} / ${presetContext.channel}`,
        `预设提示词: ${presetContext.promptText}`,
        '先生成正面锚点，再由正面锚点派生背面、半身、平铺和细节图。',
      ].join('\n'),
    ),
    ...imageNodesForScenes,
    ...(qaNode ? [qaNode] : []),
  ];
  const selected = new Set(selectedImageIds);
  const edges = [
    ...(input.sourceNodeId ? nodes.filter((node) => node.type === 'image').map((node) => edge(input.sourceNodeId!, node.id, 'any')) : []),
    edge(`${packId}-brief`, `${packId}-model-front`, 'text'),
    selected.has(`${packId}-model-back`) ? edge(`${packId}-model-front`, `${packId}-model-back`, 'image') : null,
    selected.has(`${packId}-model-half`) ? edge(`${packId}-model-front`, `${packId}-model-half`, 'image') : null,
    selected.has(`${packId}-flatlay`) ? edge(`${packId}-model-front`, `${packId}-flatlay`, 'image') : null,
    selected.has(`${packId}-hanger`) ? edge(`${packId}-model-front`, `${packId}-hanger`, 'image') : null,
    selected.has(`${packId}-detail`) && selected.has(`${packId}-flatlay`) ? edge(`${packId}-flatlay`, `${packId}-detail`, 'image') : null,
    selected.has(`${packId}-detail`) && selected.has(`${packId}-hanger`) ? edge(`${packId}-hanger`, `${packId}-detail`, 'image') : null,
    selected.has(`${packId}-model-side`) ? edge(`${packId}-model-front`, `${packId}-model-side`, 'image') : null,
    selected.has(`${packId}-model-lifestyle`) ? edge(`${packId}-model-front`, `${packId}-model-lifestyle`, 'image') : null,
    selected.has(`${packId}-fabric-macro`) ? edge(selected.has(`${packId}-flatlay`) ? `${packId}-flatlay` : `${packId}-model-front`, `${packId}-fabric-macro`, 'image') : null,
    selected.has(`${packId}-label-detail`) ? edge(selected.has(`${packId}-hanger`) ? `${packId}-hanger` : `${packId}-model-front`, `${packId}-label-detail`, 'image') : null,
    selected.has(`${packId}-size-reference`) ? edge(`${packId}-model-front`, `${packId}-size-reference`, 'image') : null,
    selected.has(`${packId}-color-texture`) ? edge(selected.has(`${packId}-flatlay`) ? `${packId}-flatlay` : `${packId}-model-front`, `${packId}-color-texture`, 'image') : null,
    ...(qaNode ? selectedImageIds.map((imageId) => edge(imageId, qaId, 'image')) : []),
  ].filter(Boolean) as ApparelPackPlanEdge[];
  const stageOrder = filterStages([
    [`${packId}-brief`],
    [`${packId}-model-front`],
    [`${packId}-model-back`, `${packId}-model-half`, `${packId}-flatlay`, `${packId}-hanger`, `${packId}-model-side`, `${packId}-model-lifestyle`],
    [`${packId}-detail`, `${packId}-fabric-macro`, `${packId}-label-detail`, `${packId}-size-reference`, `${packId}-color-texture`],
    ...(qaNode ? [[qaId]] : []),
  ], [`${packId}-brief`, ...selectedImageIds, ...(qaNode ? [qaId] : [])]);
  const runNodeIds = input.autoRun
    ? stageOrder.flat()
    : [];
  return {
    title: '服装套图封包',
    goal: 'Generate a consistent apparel listing package from model and garment references.',
    summary: {
      mode: 'suite',
      imageCount: selectedImageIds.length,
      anchorCount: 1 + (selected.has(`${packId}-flatlay`) ? 1 : 0),
    },
    nodes,
    edges,
    runNodeIds,
    runStages: input.autoRun ? stageOrder : [],
    focusViewport: { x: base.x - 120, y: base.y - 80, zoom: 0.75 },
  };
}

function buildGarmentReferencePlan(input: ApparelPackPlanInput, packId: string, base: { x: number; y: number }): ApparelPackPlan {
  const cfg = { ...DEFAULT_APPAREL_PACK_CONFIG.garmentReference, ...input.garmentReference };
  const qualityCfg = { ...DEFAULT_APPAREL_PACK_CONFIG.qualityQa, ...input.qualityQa };
  const presetContext = resolvePresetContext({
    garmentPresetId: cfg.garmentPresetId,
    audiencePresetId: cfg.audiencePresetId,
    channelPresetId: cfg.channelPresetId,
    customGarmentType: cfg.customGarmentType,
    customAudience: cfg.customAudience,
    customChannel: cfg.customChannel,
    customPrompt: cfg.customPrompt,
    fallbackGarment: cfg.garmentType,
    fallbackAudience: cfg.audience,
  });
  const refs = input.references || {};
  const garmentRefs = collectReferences(refs, ['garment', 'style']);
  const sourceNodeIds = unique([input.sourceNodeId]);
  const garmentType = presetContext.garmentType || cfg.garmentType || 'garment';
  const audience = presetContext.audience || cfg.audience || 'marketplace customer';
  const modelPhrase = cfg.modelPolicy === 'no-face'
    ? 'no-face fashion body crop'
    : cfg.modelPolicy === 'body-crop'
      ? 'body-crop fashion model'
      : 'generic fashion model';
  const garmentTruth = `Exact ${garmentType} fidelity: silhouette, collar, sleeve, hem, seams, fabric weight, color, trims, and print placement from the garment references. ${presetContext.garmentPreset.prompt}`;
  const negativeLine = 'no celebrity likeness, no new logos, no garment redesign, no changed print, no distorted body, no fake label text';
  const frontId = `${packId}-model-front`;
  const flatlayId = `${packId}-flatlay-anchor`;
  const backId = `${packId}-model-back`;
  const detailId = `${packId}-detail`;
  const hangerId = `${packId}-hanger`;
  const halfId = `${packId}-model-half`;
  const sideId = `${packId}-model-side`;
  const lifestyleId = `${packId}-model-lifestyle`;
  const fabricId = `${packId}-fabric-macro`;
  const colorId = `${packId}-color-texture`;
  const promptContextExtra = [
    `Preset prompt context: ${presetContext.promptText}`,
    `Target audience: ${audience}`,
    `Sales channel: ${presetContext.channel}`,
  ];
  const allNodes: ApparelPackPlanNode[] = [
    makePromptAgentNode(
      `${packId}-brief`,
      0,
      0,
      base,
      [
        '服装参考生成规划',
        `品类: ${garmentType}`,
        `人群: ${audience}`,
        `平台: ${presetContext.channel}`,
        `预设提示词: ${presetContext.promptText}`,
        `模特策略: ${cfg.modelPolicy}`,
        '先从服装图生成正面模特锚点和平铺锚点，再派生背面与细节图。',
      ].join('\n'),
    ),
    makeImageNode(frontId, 0, 1, base, baseImageData({
      role: 'model-front-anchor',
      refs: garmentRefs,
      sourceNodeIds,
      anchorPolicy: { model: 'generated-generic', garment: 'source-garment', style: refs.style?.length ? 'style-reference' : 'clean-commerce' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-front-anchor',
        scene: 'front-view garment-to-model ecommerce image',
        referencePolicy: 'use garment references as the only product truth and create a generic commercial model',
        garmentTruth,
        modelPolicy: `${modelPhrase} for ${audience}; safe generic identity, product readability first; ${presetContext.audiencePreset.prompt}`,
        composition: 'full-body front view, simple pose, garment centered and unobstructed',
        lighting: 'clean studio lighting, accurate textile color and fabric behavior',
        background: `simple ecommerce background; ${presetContext.channelPreset.prompt}`,
        negatives: negativeLine,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(flatlayId, 0, 2, base, baseImageData({
      role: 'flatlay-anchor',
      refs: garmentRefs,
      sourceNodeIds,
      anchorPolicy: { garment: 'source-garment', layout: 'flatlay', model: 'none' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'flatlay-anchor',
        scene: 'flat lay product anchor',
        referencePolicy: 'use garment references as exact product truth; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product-only flat lay',
        composition: 'top-down clean commerce composition, garment neatly arranged and fully readable',
        lighting: 'even soft light, accurate material and print scale',
        background: `neutral ecommerce surface; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no body, no hanger`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(backId, 1, 1, base, baseImageData({
      role: 'model-back-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, `${packId}-model-front`]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', view: 'back' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-back-derived',
        scene: 'back-view model image derived from front anchor',
        referencePolicy: 'use front model anchor for body/crop consistency and garment references for product truth',
        garmentTruth,
        modelPolicy: 'same generic model styling, body proportion, lighting, crop, and pose language as front anchor',
        composition: 'back view showing garment back construction and fabric behavior',
        lighting: 'consistent studio lighting from front anchor',
        background: `same ecommerce background family; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no identity drift, no anatomy errors`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(detailId, 1, 2, base, baseImageData({
      role: 'garment-detail-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, cfg.includeFlatlay === false ? frontId : flatlayId]),
      anchorPolicy: { garment: cfg.includeFlatlay === false ? 'source-garment-and-front-anchor' : 'flatlay-anchor', detail: 'fabric-trim-print' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'garment-detail-derived',
        scene: 'close-up product detail image',
        referencePolicy: cfg.includeFlatlay === false
          ? 'use source garment references and front model anchor as garment truth'
          : 'use flatlay anchor as garment truth',
        garmentTruth,
        modelPolicy: 'product detail only; no face or model identity emphasis',
        composition: 'close-up of fabric texture, trim, seam, collar, sleeve, hem, and print scale',
        lighting: 'macro-friendly soft light with visible stitching and textile texture',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no fabric change, no print drift, no warped stitching`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(hangerId, 1, 3, base, baseImageData({
      role: 'hanger-product-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, cfg.includeFlatlay === false ? frontId : flatlayId]),
      anchorPolicy: { garment: cfg.includeFlatlay === false ? 'source-garment-and-front-anchor' : 'flatlay-anchor', layout: 'hanger', model: 'none' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'hanger-product-derived',
        scene: 'hanger product image derived from garment reference',
        referencePolicy: 'use garment references and product anchors for exact product truth; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product displayed on a simple hanger or clean hanging setup',
        composition: 'front-facing hanging garment, natural drape, collar, sleeve, hem, seams and print visible',
        lighting: 'soft studio lighting, accurate fabric weight and folds',
        background: `clean ecommerce wall or neutral studio background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no mannequin body, no distorted hanger, no changed silhouette`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(halfId, 2, 1, base, baseImageData({
      role: 'model-half-detail-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, frontId]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', crop: 'half-body' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-half-detail-derived',
        scene: 'half-body model detail image',
        referencePolicy: 'use front model anchor for model consistency and garment references for product truth',
        garmentTruth,
        modelPolicy: `same generic model styling and body proportion as front anchor; ${presetContext.audiencePreset.prompt}`,
        composition: 'half-body crop showing neckline, sleeve, chest print, trims, fabric behavior, and fit',
        lighting: 'consistent soft studio lighting from front anchor',
        background: `clean ecommerce background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no jewelry blocking product, no messy hands`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(sideId, 2, 2, base, baseImageData({
      role: 'model-side-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, frontId]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', view: 'side' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-side-derived',
        scene: 'side or three-quarter model image',
        referencePolicy: 'derive from front model anchor; preserve garment and generic model consistency',
        garmentTruth,
        modelPolicy: `same generic model identity and styling as front anchor; ${presetContext.audiencePreset.prompt}`,
        composition: 'side or three-quarter view showing garment fit volume and side silhouette',
        lighting: 'consistent studio lighting and fabric rendering',
        background: `same ecommerce background family; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no identity drift, no anatomy errors`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(lifestyleId, 2, 3, base, baseImageData({
      role: 'model-lifestyle-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, frontId]),
      anchorPolicy: { model: 'front-anchor', garment: 'source-garment', context: 'commerce-lifestyle' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'model-lifestyle-derived',
        scene: 'commerce lifestyle model image',
        referencePolicy: 'derive from front model anchor; only change context while keeping garment and model stable',
        garmentTruth,
        modelPolicy: `same generic model identity, body proportion and garment; ${presetContext.audiencePreset.prompt}`,
        composition: 'simple lifestyle composition with garment dominant and readable',
        lighting: 'commercial lifestyle lighting with stable product color',
        background: `${presetContext.channelPreset.prompt}; uncluttered simple context scene`,
        negatives: `${negativeLine}, no crowded scene, no product blocked by props`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(fabricId, 3, 1, base, baseImageData({
      role: 'fabric-macro-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, cfg.includeFlatlay === false ? frontId : flatlayId]),
      anchorPolicy: { garment: cfg.includeFlatlay === false ? 'source-garment-and-front-anchor' : 'flatlay-anchor', detail: 'fabric-macro' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'fabric-macro-derived',
        scene: 'fabric macro detail image',
        referencePolicy: 'use garment references and product anchors for material truth',
        garmentTruth,
        modelPolicy: 'product detail only, no model',
        composition: 'macro fabric texture, weave, stitch, print edge, and material weight',
        lighting: 'macro-friendly soft light with clear texture and accurate color',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no material drift, no fake label text`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(colorId, 3, 2, base, baseImageData({
      role: 'color-texture-derived',
      refs: garmentRefs,
      sourceNodeIds: unique([input.sourceNodeId, cfg.includeFlatlay === false ? frontId : flatlayId]),
      anchorPolicy: { garment: cfg.includeFlatlay === false ? 'source-garment-and-front-anchor' : 'flatlay-anchor', detail: 'color-texture' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'garment-reference',
        role: 'color-texture-derived',
        scene: 'color and texture product image',
        referencePolicy: 'use garment references and product anchors for exact colorway and material truth',
        garmentTruth,
        modelPolicy: 'product-only color and texture presentation',
        composition: 'product crop showing accurate colorway, fabric finish, print color and scale',
        lighting: 'clean color-accurate lighting, no color cast',
        background: `neutral ecommerce surface; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no color shift, no over-saturated fabric`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
  ];
  const candidateImageIds = [
    frontId,
    ...(cfg.includeFlatlay === false ? [] : [flatlayId]),
    backId,
    ...(cfg.includeDetail === false ? [] : [detailId]),
    hangerId,
    halfId,
    sideId,
    lifestyleId,
    fabricId,
    colorId,
  ];
  const selectedImageIds = candidateImageIds.slice(0, clampShotCount(cfg.shotCount, 1, MAX_APPAREL_PACK_SHOTS));
  const selected = new Set(selectedImageIds);
  const qaEnabled = qualityCfg.enabled === true;
  const qaId = `${packId}-quality-qa`;
  const qaNode = qaEnabled
    ? makeQualityQaNode(qaId, 4, 1, base, {
      mode: 'garment-reference',
      imageIds: selectedImageIds,
      references: garmentRefs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
    })
    : null;
  const nodes = [
    ...selectPlanImages(allNodes, selectedImageIds),
    ...(qaNode ? [qaNode] : []),
  ];
  const edges = [
    ...(input.sourceNodeId ? nodes.filter((node) => node.type === 'image').map((node) => edge(input.sourceNodeId!, node.id, 'any')) : []),
    selected.has(frontId) ? edge(`${packId}-brief`, frontId, 'text') : null,
    selected.has(flatlayId) ? edge(`${packId}-brief`, flatlayId, 'text') : null,
    selected.has(backId) ? edge(frontId, backId, 'image') : null,
    selected.has(detailId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, detailId, 'image') : null,
    selected.has(hangerId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, hangerId, 'image') : null,
    selected.has(halfId) ? edge(frontId, halfId, 'image') : null,
    selected.has(sideId) ? edge(frontId, sideId, 'image') : null,
    selected.has(lifestyleId) ? edge(frontId, lifestyleId, 'image') : null,
    selected.has(fabricId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, fabricId, 'image') : null,
    selected.has(colorId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, colorId, 'image') : null,
    ...(qaNode ? selectedImageIds.map((imageId) => edge(imageId, qaId, 'image')) : []),
  ].filter(Boolean) as ApparelPackPlanEdge[];
  const stageOrder = filterStages([
    [`${packId}-brief`],
    [frontId, flatlayId],
    [backId, detailId, hangerId, halfId, sideId, lifestyleId],
    [fabricId, colorId],
    ...(qaNode ? [[qaId]] : []),
  ], [`${packId}-brief`, ...selectedImageIds, ...(qaNode ? [qaId] : [])]);
  const runNodeIds = input.autoRun ? stageOrder.flat() : [];
  return {
    title: '服装参考封包',
    goal: 'Generate a model and product image package from garment references only.',
    summary: {
      mode: 'garment-reference',
      imageCount: selectedImageIds.length,
      anchorCount: 1 + (selected.has(flatlayId) ? 1 : 0),
    },
    nodes,
    edges,
    runNodeIds,
    runStages: input.autoRun ? stageOrder : [],
    focusViewport: { x: base.x - 120, y: base.y - 80, zoom: 0.75 },
  };
}

function buildInspirationPlan(input: ApparelPackPlanInput, packId: string, base: { x: number; y: number }): ApparelPackPlan {
  const cfg = { ...DEFAULT_APPAREL_PACK_CONFIG.inspiration, ...input.inspiration };
  const qualityCfg = { ...DEFAULT_APPAREL_PACK_CONFIG.qualityQa, ...input.qualityQa };
  const presetContext = resolvePresetContext({
    garmentPresetId: cfg.garmentPresetId,
    audiencePresetId: cfg.audiencePresetId,
    channelPresetId: cfg.channelPresetId,
    customGarmentType: cfg.customGarmentType,
    customAudience: cfg.customAudience,
    customChannel: cfg.customChannel,
    customPrompt: cfg.customPrompt,
    fallbackAudience: cfg.audience,
    fallbackChannel: cfg.channel,
  });
  const sourceNodeIds = unique([input.sourceNodeId]);
  const refs = collectReferences(input.references, ['style', 'garment', 'model']);
  const direction = cfg.direction || 'commercial apparel listing concept';
  const garmentTruth = `Follow the structured apparel brief garmentTruth exactly: garment type, silhouette, colorway, fabric, trims, construction, print or placement, and platform constraints. ${presetContext.garmentPreset.prompt}`;
  const negativeLine = 'no random redesign, no changed colorway, no identity drift, no anatomy errors, no fake label text, no extra logo';
  const frontId = `${packId}-model-front`;
  const backId = `${packId}-model-back`;
  const flatlayId = `${packId}-flatlay`;
  const detailId = `${packId}-detail`;
  const hangerId = `${packId}-hanger`;
  const halfId = `${packId}-model-half`;
  const sideId = `${packId}-model-side`;
  const lifestyleId = `${packId}-model-lifestyle`;
  const fabricId = `${packId}-fabric-macro`;
  const colorId = `${packId}-color-texture`;
  const labelId = `${packId}-label-detail`;
  const promptContextExtra = [
    `Preset prompt context: ${presetContext.promptText}`,
    `Target audience: ${presetContext.audience}`,
    `Sales channel: ${presetContext.channel}`,
    direction,
  ];
  const allNodes: ApparelPackPlanNode[] = [
    makeLlmNode(`${packId}-llm-brief`, 0, 0, base, {
      systemPrompt: [
        'You are a structured apparel generation brief planner.',
        'Return concise JSON-like sections only; keep product facts inspectable.',
      ].join(' '),
      prompt: [
        `Direction: ${direction}`,
        `Garment preset: ${presetContext.garmentPreset.label} / ${presetContext.garmentType}`,
        `Audience: ${presetContext.audience}`,
        `Channel: ${presetContext.channel}`,
        `Preset prompt context: ${presetContext.promptText}`,
        `Planning strength: ${cfg.planningStrength}`,
        'Output required fields: garmentTruth, modelIdentity, shotList, consistencyRules, negativePrompt.',
        'Make every shot commercially usable and consistent with the same garment and model.',
      ].join('\n'),
      status: 'idle',
    }),
    makeImageNode(frontId, 0, 1, base, baseImageData({
      role: 'model-front-anchor',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'generated-generic', garment: 'brief-garment' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-front-anchor',
        scene: 'front-view ecommerce model anchor from structured brief',
        referencePolicy: 'follow the llm structured brief as the primary constraint and use optional references only as style/product constraints',
        garmentTruth,
        modelPolicy: `generic model for ${presetContext.audience}; keep one stable model identity for later derived shots; ${presetContext.audiencePreset.prompt}`,
        composition: `front view ecommerce model anchor for ${presetContext.channel}, product-readable pose`,
        lighting: 'clean commercial lighting suitable for all later derived shots',
        background: `${presetContext.channelPreset.prompt}; marketplace-ready background, not over-styled`,
        negatives: negativeLine,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(backId, 0, 2, base, baseImageData({
      role: 'model-back-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, `${packId}-model-front`]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-back-derived',
        scene: 'back-view model image from front anchor',
        referencePolicy: 'follow structured brief and front model anchor; derive only viewpoint',
        garmentTruth,
        modelPolicy: 'same generated model identity, body proportion, crop, lighting, and styling as front anchor',
        composition: 'back view showing garment back construction, same commercial crop',
        lighting: 'consistent lighting from front anchor',
        background: `same marketplace-ready background family; ${presetContext.channelPreset.prompt}`,
        negatives: negativeLine,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(flatlayId, 1, 1, base, baseImageData({
      role: 'flatlay-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, `${packId}-model-front`]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'front-anchor', layout: 'flatlay' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'flatlay-derived',
        scene: 'flat lay product image from brief and front anchor',
        referencePolicy: 'use structured brief and front anchor to preserve the same garment; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product-only flat lay',
        composition: 'top-down clean flat lay, silhouette, collar, sleeve, hem, print placement and trims readable',
        lighting: 'even soft light, accurate material and color',
        background: `neutral ecommerce surface; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no body`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(detailId, 1, 2, base, baseImageData({
      role: 'garment-detail-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, `${packId}-model-front`, `${packId}-flatlay`]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'fabric-trim-print' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'garment-detail-derived',
        scene: 'close-up product detail image',
        referencePolicy: 'use structured brief, front anchor and flatlay anchor as garment truth',
        garmentTruth,
        modelPolicy: 'product detail only',
        composition: 'close-up detail shot showing fabric, trim, seam, print scale, and construction',
        lighting: 'macro-friendly soft light, clear texture',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no material drift, no unreadable texture`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(hangerId, 1, 3, base, baseImageData({
      role: 'hanger-product-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', layout: 'hanger' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'hanger-product-derived',
        scene: 'hanger product image from structured brief and product anchors',
        referencePolicy: 'follow structured brief and product anchors; no model in output',
        garmentTruth,
        modelPolicy: 'no model, product displayed on a simple hanger or clean hanging setup',
        composition: 'front-facing hanging garment, natural drape, collar, sleeve, hem, seams and print readable',
        lighting: 'soft product lighting, accurate textile folds and color',
        background: `clean ecommerce wall or neutral studio background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no mannequin body, no changed silhouette`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(halfId, 2, 1, base, baseImageData({
      role: 'model-half-detail-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor', crop: 'half-body' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-half-detail-derived',
        scene: 'half-body model detail from structured brief',
        referencePolicy: 'follow structured brief and front anchor; only change crop',
        garmentTruth,
        modelPolicy: `same generated model identity and garment as front anchor; ${presetContext.audiencePreset.prompt}`,
        composition: 'half-body crop showing neckline, chest print, sleeve, trims and fabric behavior',
        lighting: 'consistent commercial lighting from front anchor',
        background: `same ecommerce background family; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no messy hands, no product-blocking accessories`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(sideId, 2, 2, base, baseImageData({
      role: 'model-side-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor', view: 'side' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-side-derived',
        scene: 'side model image from front anchor',
        referencePolicy: 'follow structured brief and front model anchor; derive only viewpoint',
        garmentTruth,
        modelPolicy: `same generated model identity and garment; ${presetContext.audiencePreset.prompt}`,
        composition: 'side or three-quarter view showing garment fit volume and side silhouette',
        lighting: 'consistent lighting from front anchor',
        background: `same marketplace-ready background family; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no identity drift, no anatomy errors`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(lifestyleId, 1, 3, base, baseImageData({
      role: 'model-lifestyle-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId]),
      anchorPolicy: { brief: 'llm-structured-brief', model: 'front-anchor', garment: 'front-anchor', context: 'commerce-lifestyle' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'model-lifestyle-derived',
        scene: 'commerce lifestyle model image',
        referencePolicy: 'follow structured brief and front anchor; only change context and pose energy',
        garmentTruth,
        modelPolicy: `same generated model identity and garment, safe commercial pose, product readability first; ${presetContext.audiencePreset.prompt}`,
        composition: 'marketplace lifestyle shot with the garment still clear and dominant',
        lighting: 'commercial lifestyle lighting consistent with front anchor color family',
        background: `${presetContext.channelPreset.prompt}; simple context scene, not crowded, channel fit for ecommerce`,
        negatives: `${negativeLine}, no crowded scene`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(fabricId, 3, 1, base, baseImageData({
      role: 'fabric-macro-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'fabric-macro' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'fabric-macro-derived',
        scene: 'fabric macro detail from structured brief',
        referencePolicy: 'follow structured brief and flatlay/product anchors as material truth',
        garmentTruth,
        modelPolicy: 'product detail only',
        composition: 'macro fabric texture, weave, stitching, print edge and material weight',
        lighting: 'macro-friendly soft light, accurate color and clear texture',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no material drift, no fake label text`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(colorId, 3, 2, base, baseImageData({
      role: 'color-texture-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, frontId, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'color-texture' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'color-texture-derived',
        scene: 'color and texture product shot from structured brief',
        referencePolicy: 'follow structured brief and product anchors for exact colorway and material truth',
        garmentTruth,
        modelPolicy: 'product-only color and texture presentation',
        composition: 'product crop showing accurate colorway, fabric finish, print color and scale',
        lighting: 'clean color-accurate lighting, no color cast',
        background: `neutral ecommerce surface; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no color shift, no over-saturated fabric`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
    makeImageNode(labelId, 3, 3, base, baseImageData({
      role: 'label-detail-derived',
      refs,
      sourceNodeIds: unique([...sourceNodeIds, `${packId}-llm-brief`, flatlayId]),
      anchorPolicy: { brief: 'llm-structured-brief', garment: 'flatlay-anchor', detail: 'label-trim' },
      ratio: cfg.outputRatio,
      size: cfg.sizeLevel,
      prompt: buildPromptAgentSpec({
        mode: 'inspiration',
        role: 'label-detail-derived',
        scene: 'label and trim detail from structured brief',
        referencePolicy: 'follow structured brief and product anchors; show construction detail without inventing readable text',
        garmentTruth,
        modelPolicy: 'product detail only',
        composition: 'collar, trim, button, zipper, drawcord, hem or label area detail; construction readable',
        lighting: 'clean close-up product lighting, accurate material texture',
        background: `minimal ecommerce detail background; ${presetContext.channelPreset.prompt}`,
        negatives: `${negativeLine}, no fake readable label text, no warped trim`,
        ratio: cfg.outputRatio,
        size: cfg.sizeLevel,
        extra: promptContextExtra,
      }),
    })),
  ];
  const selectedImageIds = [frontId, backId, flatlayId, detailId, lifestyleId, hangerId, halfId, sideId, fabricId, colorId, labelId]
    .slice(0, clampShotCount(cfg.shotCount, 3, MAX_APPAREL_PACK_SHOTS));
  const selected = new Set(selectedImageIds);
  const qaEnabled = qualityCfg.enabled === true;
  const qaId = `${packId}-quality-qa`;
  const qaNode = qaEnabled
    ? makeQualityQaNode(qaId, 4, 1, base, {
      mode: 'inspiration',
      imageIds: selectedImageIds,
      references: refs,
      presetContext,
      threshold: qualityCfg.passThreshold,
      customPrompt: qualityCfg.customPrompt,
    })
    : null;
  const nodes = [
    allNodes[0],
    ...selectPlanImages(allNodes.slice(1), selectedImageIds),
    ...(qaNode ? [qaNode] : []),
  ];
  const edges = [
    ...(input.sourceNodeId ? nodes.map((node) => edge(input.sourceNodeId!, node.id, 'any')) : []),
    edge(`${packId}-llm-brief`, `${packId}-model-front`, 'text'),
    selected.has(backId) ? edge(`${packId}-llm-brief`, backId, 'text') : null,
    selected.has(flatlayId) ? edge(`${packId}-llm-brief`, flatlayId, 'text') : null,
    selected.has(detailId) ? edge(`${packId}-llm-brief`, detailId, 'text') : null,
    selected.has(lifestyleId) ? edge(`${packId}-llm-brief`, lifestyleId, 'text') : null,
    selected.has(hangerId) ? edge(`${packId}-llm-brief`, hangerId, 'text') : null,
    selected.has(halfId) ? edge(`${packId}-llm-brief`, halfId, 'text') : null,
    selected.has(sideId) ? edge(`${packId}-llm-brief`, sideId, 'text') : null,
    selected.has(fabricId) ? edge(`${packId}-llm-brief`, fabricId, 'text') : null,
    selected.has(colorId) ? edge(`${packId}-llm-brief`, colorId, 'text') : null,
    selected.has(labelId) ? edge(`${packId}-llm-brief`, labelId, 'text') : null,
    selected.has(backId) ? edge(frontId, backId, 'image') : null,
    selected.has(flatlayId) ? edge(frontId, flatlayId, 'image') : null,
    selected.has(lifestyleId) ? edge(frontId, lifestyleId, 'image') : null,
    selected.has(hangerId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, hangerId, 'image') : null,
    selected.has(halfId) ? edge(frontId, halfId, 'image') : null,
    selected.has(sideId) ? edge(frontId, sideId, 'image') : null,
    selected.has(fabricId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, fabricId, 'image') : null,
    selected.has(colorId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, colorId, 'image') : null,
    selected.has(labelId) ? edge(selected.has(flatlayId) ? flatlayId : frontId, labelId, 'image') : null,
    selected.has(detailId) ? edge(flatlayId, detailId, 'image') : null,
    ...(qaNode ? selectedImageIds.map((imageId) => edge(imageId, qaId, 'image')) : []),
  ].filter(Boolean) as ApparelPackPlanEdge[];
  const stageOrder = filterStages([
    [`${packId}-llm-brief`],
    [frontId],
    [backId, flatlayId, lifestyleId, hangerId, halfId, sideId],
    [detailId, fabricId, colorId, labelId],
    ...(qaNode ? [[qaId]] : []),
  ], [`${packId}-llm-brief`, ...selectedImageIds, ...(qaNode ? [qaId] : [])]);
  return {
    title: '服装灵感封包',
    goal: 'Plan and generate a consistent apparel package from an LLM brief.',
    summary: {
      mode: 'inspiration',
      imageCount: selectedImageIds.length,
      anchorCount: 1 + (selected.has(flatlayId) ? 1 : 0),
    },
    nodes,
    edges,
    runNodeIds: input.autoRun ? stageOrder.flat() : [],
    runStages: input.autoRun ? stageOrder : [],
    focusViewport: { x: base.x - 120, y: base.y - 80, zoom: 0.75 },
  };
}

export function buildApparelPackPlan(input: ApparelPackPlanInput): ApparelPackPlan {
  const packId = cleanId(input.packId);
  const base = input.position || DEFAULT_POSITION;
  if (input.mode === 'suite') return buildSuitePlan(input, packId, base);
  if (input.mode === 'garment-reference') return buildGarmentReferencePlan(input, packId, base);
  return buildInspirationPlan(input, packId, base);
}
