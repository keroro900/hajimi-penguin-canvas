const PLAN_ACTION_TYPES = new Set([
  'preview_node',
  'add_node',
  'update_node',
  'connect_edge',
  'focus_viewport',
  'run_node',
  'note',
  'phase',
  'ask_user',
]);

const IMAGE_MODEL_REGISTRY = {
  'gpt-image-2': {
    apiModels: ['gpt-image-2-all', 'gpt-image-2', 'gpt-image-2-2K', 'gpt-image-2-4K', 'gpt-image-2-fal'],
    aspectRatios: ['Auto', '1:1', '16:9', '4:3', '4:5', '3:2', '2:3', '3:4', '5:4', '9:16', '21:9', '1:4', '4:1', '1:8', '8:1'],
    sizes: ['1K', '2K', '4K'],
    qualities: ['auto', 'low', 'medium', 'high', 'standard'],
    defaultApiModel: 'gpt-image-2-all',
    defaultAspectRatio: '1:1',
    defaultSize: '2K',
    maxReferenceImages: 9,
  },
  'nano-banana-2': {
    apiModels: ['gemini-3.1-flash-image', 'nano-banana-2-fal'],
    aspectRatios: ['Auto', '1:1', '16:9', '4:3', '4:5', '3:2', '2:3', '3:4', '5:4', '9:16', '21:9', '1:4', '4:1', '1:8', '8:1'],
    sizes: ['1K', '2K', '4K'],
    qualities: ['auto', 'low', 'medium', 'high', 'standard'],
    defaultApiModel: 'gemini-3.1-flash-image',
    defaultAspectRatio: '1:1',
    defaultSize: '2K',
    maxReferenceImages: 5,
  },
  'nano-banana-pro': {
    apiModels: ['nano-banana-pro', 'gemini-3-pro-image-preview', 'nano-banana-pro-2k', 'nano-banana-pro-4k', 'nano-banana-pro-fal'],
    aspectRatios: ['Auto', '1:1', '16:9', '4:3', '4:5', '3:2', '2:3', '3:4', '5:4', '9:16', '21:9'],
    sizes: ['1K', '2K', '4K'],
    qualities: ['auto', 'low', 'medium', 'high', 'standard'],
    defaultApiModel: 'nano-banana-pro',
    defaultAspectRatio: '1:1',
    defaultSize: '2K',
    maxReferenceImages: 5,
  },
  'grok-image': {
    apiModels: ['grok-4.2-image'],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    sizes: [''],
    qualities: ['auto', 'low', 'medium', 'high', 'standard'],
    defaultApiModel: 'grok-4.2-image',
    defaultAspectRatio: '1:1',
    defaultSize: '',
    maxReferenceImages: 4,
  },
  midjourney: {
    apiModels: ['midjourney'],
    aspectRatios: ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '9:16'],
    sizes: [''],
    qualities: ['auto', 'low', 'medium', 'high', 'standard'],
    defaultApiModel: 'midjourney',
    defaultAspectRatio: '1:1',
    defaultSize: '',
    maxReferenceImages: 4,
  },
};

const VIDEO_MODEL_REGISTRY = {
  'grok-video-3': {
    apiModels: ['grok-video-3', 'grok-1.5-video-6s', 'grok-1.5-video-10s', 'grok-1.5-video-15s', 'grok-imagine-video-1.5', 'grok-video-fal'],
    aspectRatios: ['2:3', '3:2', '16:9', '9:16', '1:1', 'auto'],
    durations: [6, 10, 15, 30],
    resolutions: ['480P', '720P', '480p', '720p'],
    defaultApiModel: 'grok-video-3',
    defaultAspectRatio: '16:9',
    defaultDuration: 15,
    defaultResolution: '720P',
    maxReferenceImages: 7,
  },
  'veo3.1': {
    apiModels: ['veo-omni-flash', 'veo-omni-flash-video-edit', 'veo-omni-10s', 'veo3', 'veo3-fast', 'veo3-pro', 'veo3-fast-frames', 'veo3-pro-frames', 'veo3.1', 'veo3.1-fast', 'veo3.1-pro', 'veo3.1-components', 'veo3.1-4k', 'veo3.1-pro-4k', 'veo3.1-components-4k', 'veo3.1-lite', 'veo3.1-fal'],
    aspectRatios: ['16:9', '9:16'],
    durations: [8, 10],
    resolutions: ['720p', '1080p', '4k', ''],
    defaultApiModel: 'veo-omni-flash',
    defaultAspectRatio: '16:9',
    defaultDuration: 10,
    defaultResolution: '',
    maxReferenceImages: 3,
  },
  'sora-2': {
    apiModels: ['sora-2', 'sora-2-zhenzhen'],
    aspectRatios: ['16:9', '9:16', 'auto'],
    durations: [4, 8, 12, 15, 16, 20],
    resolutions: ['720p', 'auto', ''],
    defaultApiModel: 'sora-2',
    defaultAspectRatio: '16:9',
    defaultDuration: 15,
    defaultResolution: '',
    maxReferenceImages: 1,
  },
  'seedance-2.0': {
    apiModels: ['doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128', 'doubao-seedance-2.0-mini'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21', 'adaptive'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    resolutions: ['480p', '720p', 'native1080p', 'native4K', '1080p', '2k', '4k'],
    defaultApiModel: 'doubao-seedance-2-0-fast-260128',
    defaultAspectRatio: '16:9',
    defaultDuration: 5,
    defaultResolution: '480p',
    maxReferenceImages: 3,
  },
};

function compactText(value, max = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function nodeTitle(node) {
  const data = node?.data || {};
  return compactText(data.label || data.title || data.name || data.prompt || data.text || node?.id || 'node', 80);
}

function nodeResultUrls(node) {
  const data = node?.data || {};
  const urls = [];
  for (const key of ['imageUrl', 'videoUrl', 'url', 'outputUrl']) {
    if (typeof data[key] === 'string' && data[key].trim()) urls.push(data[key]);
  }
  for (const key of ['imageUrls', 'videoUrls', 'images', 'videos']) {
    if (Array.isArray(data[key])) {
      data[key].forEach((url) => {
        if (typeof url === 'string' && url.trim()) urls.push(url);
      });
    }
  }
  return [...new Set(urls)];
}

function createCanvasSnapshot(canvasId, canvas) {
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas?.edges) ? canvas.edges : [];
  const nodeTypes = nodes.reduce((acc, node) => {
    const type = String(node?.type || 'unknown');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const bounds = nodes.reduce((acc, node) => {
    const x = Number(node?.position?.x || 0);
    const y = Number(node?.position?.y || 0);
    return {
      minX: Math.min(acc.minX, x),
      minY: Math.min(acc.minY, y),
      maxX: Math.max(acc.maxX, x),
      maxY: Math.max(acc.maxY, y),
    };
  }, { minX: 0, minY: 0, maxX: 0, maxY: 0 });

  return {
    canvasId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    viewport: canvas?.viewport || { x: 0, y: 0, zoom: 1 },
    nextNodeSerialId: canvas?.nextNodeSerialId || 1,
    nodeTypes,
    bounds,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position || { x: 0, y: 0 },
      title: nodeTitle(node),
      hasPrompt: Boolean(node?.data?.prompt || node?.data?.text),
      hasModel: Boolean(node?.data?.model || node?.data?.apiModel),
      resultUrls: nodeResultUrls(node),
      sourceNodeId: node?.data?.sourceNodeId || '',
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || '',
      targetHandle: edge.targetHandle || '',
    })),
  };
}

function normalizePlanId(value) {
  const raw = String(value || '').trim();
  if (/^[a-zA-Z0-9_-]{3,96}$/.test(raw)) return raw;
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasPosition(value) {
  return Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y));
}

function cleanPosition(value, fallback = { x: 0, y: 0 }) {
  if (!hasPosition(value)) return fallback;
  return { x: Number(value.x), y: Number(value.y) };
}

function matchRegistry(registry, model, apiModel) {
  const modelKey = String(model || '').trim();
  const apiKey = String(apiModel || '').trim();
  if (registry[modelKey]) return { model: modelKey, def: registry[modelKey] };
  for (const [id, def] of Object.entries(registry)) {
    if (def.apiModels.includes(apiKey) || def.apiModels.includes(modelKey)) return { model: id, def };
  }
  return null;
}

function normalizeEnum(value, allowed, fallback) {
  const raw = String(value ?? '').trim();
  if (allowed.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  const matched = allowed.find((item) => String(item).toLowerCase() === lower);
  return matched ?? fallback;
}

function normalizeNumberEnum(value, allowed, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && allowed.includes(num)) return num;
  const stringMatched = allowed.find((item) => String(item) === String(value));
  return stringMatched ?? fallback;
}

function lockImageNodeData(data, warnings, pathLabel) {
  const next = isPlainObject(data) ? { ...data } : {};
  const match = matchRegistry(IMAGE_MODEL_REGISTRY, next.model, next.apiModel) || {
    model: 'gpt-image-2',
    def: IMAGE_MODEL_REGISTRY['gpt-image-2'],
  };
  if (next.model !== match.model) warnings.push(`${pathLabel}.model 已按画布模型注册表修正为 ${match.model}`);
  next.model = match.model;
  const apiModel = normalizeEnum(next.apiModel, match.def.apiModels, match.def.defaultApiModel);
  if (next.apiModel !== apiModel) warnings.push(`${pathLabel}.apiModel 已按 ${match.model} 修正为 ${apiModel}`);
  next.apiModel = apiModel;
  const aspectRatio = normalizeEnum(next.aspectRatio || next.aspect_ratio, match.def.aspectRatios, match.def.defaultAspectRatio);
  if (next.aspectRatio !== aspectRatio) warnings.push(`${pathLabel}.aspectRatio 已修正为 ${aspectRatio}`);
  next.aspectRatio = aspectRatio;
  const sizeValue = next.size || next.sizeLevel || next.image_size || match.def.defaultSize;
  const size = normalizeEnum(sizeValue, match.def.sizes, match.def.defaultSize);
  if (match.def.defaultSize || size) {
    if (next.size !== size) warnings.push(`${pathLabel}.size 已修正为 ${size || 'auto'}`);
    next.size = size;
    next.sizeLevel = size || next.sizeLevel;
  }
  next.quality = normalizeEnum(next.quality, match.def.qualities, 'auto');
  const refs = Array.isArray(next.referenceImages) ? next.referenceImages : Array.isArray(next.images) ? next.images : [];
  next.referenceImages = refs.filter((item) => typeof item === 'string' && item.trim()).slice(0, match.def.maxReferenceImages);
  if (typeof next.status !== 'string' || !next.status.trim()) next.status = 'idle';
  return next;
}

function lockVideoNodeData(data, nodeType, warnings, pathLabel) {
  const next = isPlainObject(data) ? { ...data } : {};
  const defaultModel = nodeType === 'seedance' ? 'seedance-2.0' : 'grok-video-3';
  const match = matchRegistry(VIDEO_MODEL_REGISTRY, next.model, next.apiModel) || {
    model: defaultModel,
    def: VIDEO_MODEL_REGISTRY[defaultModel],
  };
  const apiModel = normalizeEnum(next.apiModel, match.def.apiModels, match.def.defaultApiModel);
  if (next.mainId !== match.model) warnings.push(`${pathLabel}.mainId 已按画布视频模型注册表修正为 ${match.model}`);
  next.mainId = match.model;
  if (next.model !== apiModel) warnings.push(`${pathLabel}.model 已按画布视频节点真实模型字段修正为 ${apiModel}`);
  next.model = apiModel;
  if (next.apiModel !== apiModel) warnings.push(`${pathLabel}.apiModel 已按 ${match.model} 修正为 ${apiModel}`);
  next.apiModel = apiModel;
  const aspectRatio = normalizeEnum(next.aspectRatio || next.ratio || next.aspect_ratio, match.def.aspectRatios, match.def.defaultAspectRatio);
  if (next.aspectRatio !== aspectRatio) warnings.push(`${pathLabel}.aspectRatio 已修正为 ${aspectRatio}`);
  next.aspectRatio = aspectRatio;
  next.ratio = aspectRatio;
  next.duration = normalizeNumberEnum(next.duration, match.def.durations, match.def.defaultDuration);
  next.resolution = normalizeEnum(next.resolution, match.def.resolutions, match.def.defaultResolution);
  const refs = Array.isArray(next.referenceImages) ? next.referenceImages : Array.isArray(next.images) ? next.images : [];
  next.referenceImages = refs.filter((item) => typeof item === 'string' && item.trim()).slice(0, match.def.maxReferenceImages);
  if (!Array.isArray(next.referenceVideos)) next.referenceVideos = Array.isArray(next.videos) ? next.videos : [];
  if (typeof next.status !== 'string' || !next.status.trim()) next.status = 'idle';
  return next;
}

function lockNodeDataToRegistry(node, warnings, pathLabel) {
  const next = { ...node, data: isPlainObject(node.data) ? { ...node.data } : {} };
  if (next.type === 'image') next.data = lockImageNodeData(next.data, warnings, pathLabel);
  if (next.type === 'video' || next.type === 'seedance') next.data = lockVideoNodeData(next.data, next.type, warnings, pathLabel);
  if (next.type === 'text') {
    if (typeof next.data.prompt !== 'string' && typeof next.data.text === 'string') next.data.prompt = next.data.text;
    if (typeof next.data.text !== 'string' && typeof next.data.prompt === 'string') next.data.text = next.data.prompt;
  }
  return next;
}

function inferLane(node) {
  const text = `${node?.id || ''} ${node?.type || ''} ${node?.data?.label || ''} ${node?.data?.title || ''} ${node?.data?.variantLane || ''}`.toLowerCase();
  if (/source|reference|素材|参考|upload/.test(text)) return 'source';
  if (/analysis|intent|brief|分析|意图|规划/.test(text)) return 'analysis';
  if (/review|score|verify|复核|评分|验证|对比/.test(text)) return 'review';
  if (node?.type === 'image' || node?.type === 'video' || node?.type === 'seedance' || /variant|变体|生成/.test(text)) return 'variant';
  return 'note';
}

function layoutCanvasPlan(plan, beforeSnapshot, options = {}) {
  const body = isPlainObject(plan) ? { ...plan } : {};
  const nodes = Array.isArray(body.nodes) ? body.nodes.map((node) => ({ ...node, data: isPlainObject(node?.data) ? { ...node.data } : {} })) : [];
  if (!nodes.length) return body;
  const force = body.autoLayout === true || options.autoLayout === true;
  const shouldLayout = force || nodes.some((node) => !hasPosition(node.position));
  if (!shouldLayout) return { ...body, nodes };

  const bounds = beforeSnapshot?.bounds || {};
  const startX = Math.max(Number(bounds.maxX || 0) + 280, 120);
  const startY = Math.max(Number(bounds.minY || 0), 80);
  const laneOrder = ['source', 'analysis', 'variant', 'review', 'note'];
  const laneX = {
    source: startX,
    analysis: startX + 320,
    variant: startX + 680,
    review: startX + 1040,
    note: startX + 1360,
  };
  const laneCounts = {};
  const laidOut = nodes.map((node) => {
    if (!force && hasPosition(node.position)) return node;
    const lane = inferLane(node);
    const count = laneCounts[lane] || 0;
    laneCounts[lane] = count + 1;
    return {
      ...node,
      position: {
        x: laneX[lane] ?? laneX.note,
        y: startY + count * 230,
      },
    };
  });
  const populatedLanes = laneOrder.filter((lane) => laneCounts[lane] > 0);
  const minLane = populatedLanes[0] || 'source';
  const focusViewport = body.focusViewport || {
    x: Math.max(0, (laneX[minLane] || startX) - 120),
    y: Math.max(0, startY - 80),
    zoom: 0.82,
  };
  return { ...body, nodes: laidOut, focusViewport };
}

function normalizeCanvasPlan(plan, options = {}) {
  const errors = [];
  const warnings = [];
  const body = isPlainObject(plan) ? { ...plan } : {};
  const beforeSnapshot = options.beforeSnapshot || null;
  const existingIds = new Set((Array.isArray(beforeSnapshot?.nodes) ? beforeSnapshot.nodes : [])
    .map((node) => String(node?.id || '').trim())
    .filter(Boolean));
  const existingTypes = new Map((Array.isArray(beforeSnapshot?.nodes) ? beforeSnapshot.nodes : [])
    .map((node) => [String(node?.id || '').trim(), String(node?.type || '').trim()]));
  const laidOut = layoutCanvasPlan(body, beforeSnapshot, { autoLayout: options.autoLayout });
  const ids = new Set();
  const nodes = Array.isArray(laidOut.nodes) ? laidOut.nodes.map((node, index) => {
    const next = lockNodeDataToRegistry({
      id: String(node?.id || '').trim(),
      type: String(node?.type || 'text').trim(),
      position: cleanPosition(node?.position, { x: 0, y: index * 220 }),
      data: isPlainObject(node?.data) ? node.data : {},
    }, warnings, `nodes[${index}].data`);
    if (!next.id) errors.push(`nodes[${index}].id is required`);
    if (!/^[a-zA-Z0-9:_-]{2,120}$/.test(next.id)) errors.push(`nodes[${index}].id must be stable ascii id`);
    if (ids.has(next.id)) errors.push(`duplicate node id: ${next.id}`);
    ids.add(next.id);
    if (!next.type) errors.push(`nodes[${index}].type is required`);
    if (!hasPosition(next.position)) errors.push(`nodes[${index}].position must include numeric x/y`);
    if (['image', 'video', 'seedance'].includes(next.type)) {
      if (!String(next.data.prompt || next.data.text || '').trim()) errors.push(`${next.id} requires data.prompt`);
      if (!String(next.data.model || '').trim()) errors.push(`${next.id} requires data.model`);
      if (!String(next.data.apiModel || '').trim()) errors.push(`${next.id} requires data.apiModel`);
    }
    return next;
  }) : [];

  const updates = Array.isArray(laidOut.updates) ? laidOut.updates.map((update, index) => {
    const nodeId = String(update?.nodeId || update?.id || '').trim();
    if (!nodeId) errors.push(`updates[${index}].nodeId is required`);
    return {
      ...update,
      nodeId,
      position: update?.position ? cleanPosition(update.position) : undefined,
      data: isPlainObject(update?.data) ? update.data : {},
    };
  }) : [];

  const edges = Array.isArray(laidOut.edges) ? laidOut.edges.map((edge, index) => {
    const source = String(edge?.source || '').trim();
    const target = String(edge?.target || '').trim();
    if (!source || !target) errors.push(`edges[${index}] requires source and target`);
    if (source && !ids.has(source) && !existingIds.has(source)) errors.push(`edges[${index}].source not found: ${source}`);
    if (target && !ids.has(target) && !existingIds.has(target)) errors.push(`edges[${index}].target not found: ${target}`);
    return {
      id: edge?.id,
      source,
      target,
      sourceHandle: edge?.sourceHandle,
      targetHandle: edge?.targetHandle,
    };
  }) : [];

  const runNodeIds = Array.isArray(laidOut.runNodeIds) ? [...new Set(laidOut.runNodeIds.map((id) => String(id || '').trim()).filter(Boolean))] : [];
  runNodeIds.forEach((id) => {
    if (!nodes.some((node) => node.id === id) && !existingIds.has(id)) {
      errors.push(`runNodeIds contains missing node: ${id}`);
    }
  });

  const focusViewport = laidOut.focusViewport && isPlainObject(laidOut.focusViewport)
    ? {
      x: Number(laidOut.focusViewport.x || 0),
      y: Number(laidOut.focusViewport.y || 0),
      zoom: Number(laidOut.focusViewport.zoom || 1),
    }
    : undefined;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    plan: {
      ...laidOut,
      nodes,
      updates,
      edges,
      runNodeIds,
      ...(focusViewport ? { focusViewport } : {}),
    },
  };
}

function createPlanDiff(canvas, plan) {
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const body = isPlainObject(plan) ? plan : {};
  const addNodes = (Array.isArray(body.nodes) ? body.nodes : []).filter((node) => !nodeIds.has(node.id));
  const updateNodes = (Array.isArray(body.updates) ? body.updates : []).filter((update) => update.nodeId || update.id);
  const edges = Array.isArray(body.edges) ? body.edges : [];
  const runNodeIds = Array.isArray(body.runNodeIds) ? body.runNodeIds : [];
  return {
    summary: `新增 ${addNodes.length} 节点 / 更新 ${updateNodes.length} 节点 / 连接 ${edges.length} 条线 / 运行 ${runNodeIds.length} 个节点`,
    addNodes: addNodes.map((node) => ({ id: node.id, type: node.type, label: nodeTitle(node) })),
    updateNodes: updateNodes.map((node) => ({ id: node.nodeId || node.id, label: compactText(node.data?.label || node.data?.prompt || node.nodeId || node.id, 80) })),
    edges: edges.map((edge) => ({ source: edge.source, target: edge.target, id: edge.id || '' })),
    runNodeIds,
    focusViewport: body.focusViewport || null,
  };
}

function scoreNodeQuality(node) {
  const data = node?.data || {};
  const checks = [
    { id: 'title', ok: Boolean(data.label || data.title || data.name), weight: 15, label: '标题' },
    { id: 'prompt', ok: Boolean(data.prompt || data.text), weight: ['image', 'video', 'seedance', 'text'].includes(String(node?.type)) ? 25 : 10, label: '内容/prompt' },
    { id: 'model', ok: !['image', 'video', 'seedance'].includes(String(node?.type)) || Boolean(data.model && data.apiModel), weight: 20, label: '模型参数' },
    { id: 'lineage', ok: Boolean(data.sourceNodeId || data.sourceNodeIds || data.referenceImages?.length || data.sourceUrls?.length), weight: 20, label: '来源 lineage' },
    { id: 'result', ok: !['image', 'video', 'seedance'].includes(String(node?.type)) || nodeResultUrls(node).length > 0 || ['idle', 'pending', 'running'].includes(String(data.status || 'idle')), weight: 20, label: '结果/状态' },
  ];
  const score = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D', checks };
}

function verificationTextOfNode(node) {
  const data = node?.data || {};
  return `${data.label || ''}\n${data.title || ''}\n${data.text || ''}\n${data.prompt || ''}\n${data.outputText || ''}`;
}

function runSkillVerificationChecks(canvas, plan) {
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
  const body = isPlainObject(plan) ? plan : {};
  const verificationItems = [
    ...(Array.isArray(body.verification) ? body.verification : []),
    ...(Array.isArray(body.skillVerification) ? body.skillVerification : []),
    ...(Array.isArray(body.canvasPlanPreference?.verification) ? body.canvasPlanPreference.verification : []),
  ];
  const checks = [];
  const wants = (pattern) => verificationItems.some((item) => pattern.test(`${item.id || ''} ${item.label || ''} ${item.hint || ''}`));

  if (wants(/variant-quality|变体|差异/i)) {
    const lanes = new Set(nodes.map((node) => String(node?.data?.variantLane || '').trim()).filter(Boolean));
    const generated = nodes.filter((node) => ['image', 'video', 'seedance'].includes(String(node.type)));
    checks.push({
      id: 'skill:variant-quality',
      label: '变体必须有差异',
      ok: lanes.size >= 3 || generated.length >= 3,
      severity: 'warning',
      detail: `variantLane=${lanes.size}, generationNodes=${generated.length}`,
    });
  }
  if (wants(/review-score|复核|评分/i)) {
    const review = nodes.find((node) => /review|score|复核|评分|对比/i.test(verificationTextOfNode(node)));
    const text = verificationTextOfNode(review || {});
    checks.push({
      id: 'skill:review-score',
      label: '结果必须可复核',
      ok: /商业|commercial/i.test(text) && /童装|child/i.test(text) && /印花|print/i.test(text) && /建议|next|下一步/i.test(text),
      severity: 'warning',
      detail: review ? `reviewNode=${review.id}` : '未找到复核节点',
    });
  }
  return checks;
}

function cleanAction(action) {
  const type = String(action?.type || '').trim();
  if (!PLAN_ACTION_TYPES.has(type)) return null;
  return {
    type,
    payload: action?.payload && typeof action.payload === 'object' ? action.payload : {},
  };
}

function canvasPlanToActions(plan, options = {}) {
  const body = plan && typeof plan === 'object' ? plan : {};
  const mode = options.mode || body.mode || 'commit';
  if (Array.isArray(body.actions) && body.actions.length) {
    return body.actions.map(cleanAction).filter(Boolean);
  }

  const actions = [];
  actions.push({
    type: 'phase',
    payload: {
      phase: 'plan',
      label: body.title || '画布计划',
      detail: body.summary || body.goal || '准备按计划控制画布。',
    },
  });

  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  nodes.forEach((node) => {
    const payload = {
      id: node.id,
      type: node.type || 'text',
      position: node.position || { x: 0, y: 0 },
      data: node.data || {},
    };
    actions.push(mode === 'preview'
      ? { type: 'preview_node', payload }
      : { type: 'add_node', payload });
  });

  const updates = Array.isArray(body.updates) ? body.updates : [];
  updates.forEach((update) => {
    actions.push({
      type: 'update_node',
      payload: {
        nodeId: update.nodeId || update.id,
        position: update.position,
        data: update.data || {},
      },
    });
  });

  const edges = Array.isArray(body.edges) ? body.edges : [];
  edges.forEach((edge) => {
    actions.push({
      type: 'connect_edge',
      payload: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      },
    });
  });

  const runNodeIds = [
    ...(Array.isArray(body.runNodeIds) ? body.runNodeIds : []),
    ...(Array.isArray(body.generationCalls) ? body.generationCalls.map((item) => item.nodeId || item.id) : []),
  ].filter(Boolean);
  [...new Set(runNodeIds)].forEach((nodeId) => {
    if (mode === 'preview') {
      actions.push({
        type: 'phase',
        payload: {
          phase: 'model-preview',
          label: '预演模型运行',
          detail: `预演模式下不会运行 ${nodeId}`,
          nodeId,
        },
      });
    } else {
      actions.push({ type: 'run_node', payload: { nodeId } });
    }
  });

  if (body.focusViewport) {
    actions.push({ type: 'focus_viewport', payload: body.focusViewport });
  }

  actions.push({
    type: 'phase',
    payload: {
      phase: 'verify',
      label: '回读验证',
      detail: '检查节点、连线、模型参数、结果 URL 和视口。',
    },
  });

  return actions.map(cleanAction).filter(Boolean);
}

function verifyCanvasPlan(canvas, plan, beforeSnapshot) {
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas?.edges) ? canvas.edges : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const checks = [];
  const body = plan && typeof plan === 'object' ? plan : {};

  const expectedNodes = [
    ...(Array.isArray(body.nodes) ? body.nodes.map((node) => node.id).filter(Boolean) : []),
    ...(Array.isArray(body.updates) ? body.updates.map((node) => node.nodeId || node.id).filter(Boolean) : []),
  ];
  expectedNodes.forEach((id) => {
    const node = nodeById.get(id);
    checks.push({
      id: `node:${id}`,
      label: `节点存在 ${id}`,
      ok: Boolean(node),
      severity: 'error',
      detail: node ? nodeTitle(node) : '未找到计划节点',
    });
    if (node && ['image', 'video', 'seedance'].includes(String(node.type))) {
      checks.push({
        id: `node-data:${id}`,
        label: `生成节点参数完整 ${id}`,
        ok: Boolean(node.data?.prompt || node.data?.text) && Boolean(node.data?.model || node.data?.apiModel),
        severity: 'warning',
        detail: '检查 prompt/text 与 model/apiModel',
      });
    }
  });

  const quality = expectedNodes
    .map((id) => nodeById.get(id))
    .filter(Boolean)
    .map((node) => ({
      nodeId: node.id,
      type: node.type,
      title: nodeTitle(node),
      ...scoreNodeQuality(node),
    }));
  quality.forEach((item) => {
    checks.push({
      id: `quality:${item.nodeId}`,
      label: `节点质量 ${item.nodeId}`,
      ok: item.score >= 70,
      severity: 'warning',
      detail: `${item.grade} / ${item.score}`,
    });
  });

  const expectedEdges = Array.isArray(body.edges) ? body.edges : [];
  expectedEdges.forEach((edge, index) => {
    const found = edges.some((item) => (
      item.id === edge.id || (item.source === edge.source && item.target === edge.target)
    ));
    checks.push({
      id: `edge:${edge.id || index}`,
      label: `连线存在 ${edge.source || '?'} -> ${edge.target || '?'}`,
      ok: found,
      severity: 'error',
      detail: found ? '已连接' : '未找到计划连线',
    });
  });

  const runNodeIds = [
    ...(Array.isArray(body.runNodeIds) ? body.runNodeIds : []),
    ...(Array.isArray(body.generationCalls) ? body.generationCalls.map((item) => item.nodeId || item.id) : []),
  ].filter(Boolean);
  [...new Set(runNodeIds)].forEach((id) => {
    const node = nodeById.get(id);
    checks.push({
      id: `run:${id}`,
      label: `节点可运行 ${id}`,
      ok: Boolean(node),
      severity: 'warning',
      detail: node ? `type=${node.type}, results=${nodeResultUrls(node).length}` : '未找到节点',
    });
  });

  if (beforeSnapshot) {
    checks.push({
      id: 'node-count',
      label: '节点数量未减少',
      ok: nodes.length >= Number(beforeSnapshot.nodeCount || 0),
      severity: 'warning',
      detail: `${beforeSnapshot.nodeCount || 0} -> ${nodes.length}`,
    });
  }

  checks.push(...runSkillVerificationChecks(canvas, body));

  const failed = checks.filter((item) => !item.ok);
  return {
    ok: failed.filter((item) => item.severity === 'error').length === 0,
    checkedAt: Date.now(),
    checkCount: checks.length,
    failureCount: failed.length,
    checks,
    quality,
  };
}

module.exports = {
  PLAN_ACTION_TYPES,
  IMAGE_MODEL_REGISTRY,
  VIDEO_MODEL_REGISTRY,
  createCanvasSnapshot,
  normalizePlanId,
  normalizeCanvasPlan,
  layoutCanvasPlan,
  createPlanDiff,
  scoreNodeQuality,
  canvasPlanToActions,
  verifyCanvasPlan,
};
