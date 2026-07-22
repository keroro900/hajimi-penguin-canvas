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

function lockImageNodeData(data, warnings, pathLabel) {
  const next = isPlainObject(data) ? { ...data } : {};
  const exactModel = String(next.apiModel || next.model || '').trim();
  next.model = exactModel;
  next.apiModel = exactModel;
  next.aspectRatio = String(next.aspectRatio || next.aspect_ratio || '1:1');
  next.sizeLevel = String(next.sizeLevel || next.image_size || next.size || '');
  const refs = Array.isArray(next.referenceImages) ? next.referenceImages : Array.isArray(next.images) ? next.images : [];
  next.referenceImages = refs.filter((item) => typeof item === 'string' && item.trim());
  if (typeof next.status !== 'string' || !next.status.trim()) next.status = 'idle';
  return next;
}

function lockVideoNodeData(data, nodeType, warnings, pathLabel) {
  const next = isPlainObject(data) ? { ...data } : {};
  void nodeType;
  void warnings;
  void pathLabel;
  const apiModel = String(next.apiModel || next.model || '').trim();
  next.mainId = '';
  next.model = apiModel;
  next.apiModel = apiModel;
  const aspectRatio = String(next.aspectRatio || next.ratio || next.aspect_ratio || '16:9');
  next.aspectRatio = aspectRatio;
  next.ratio = aspectRatio;
  const refs = Array.isArray(next.referenceImages) ? next.referenceImages : Array.isArray(next.images) ? next.images : [];
  next.referenceImages = refs.filter((item) => typeof item === 'string' && item.trim());
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
  const layoutIntent = isPlainObject(body.layoutIntent) ? body.layoutIntent : {};
  const direction = layoutIntent.direction === 'top-to-bottom' ? 'top-to-bottom' : 'left-to-right';
  const columnGap = Math.min(800, Math.max(240, Number(layoutIntent.columnGap || 360)));
  const rowGap = Math.min(600, Math.max(180, Number(layoutIntent.rowGap || 240)));
  const startX = Math.max(Number(bounds.maxX || 0) + columnGap, 120);
  const startY = Math.max(Number(bounds.minY || 0), 80);
  const laneOrder = ['source', 'analysis', 'variant', 'review', 'note'];
  const laneX = {
    source: startX,
    analysis: startX + columnGap,
    variant: startX + columnGap * 2,
    review: startX + columnGap * 3,
    note: startX + columnGap * 4,
  };
  const laneCounts = {};
  const laidOut = nodes.map((node) => {
    if (!force && hasPosition(node.position)) return node;
    const lane = inferLane(node);
    const count = laneCounts[lane] || 0;
    laneCounts[lane] = count + 1;
    const laneIndex = Math.max(0, laneOrder.indexOf(lane));
    return {
      ...node,
      position: direction === 'top-to-bottom'
        ? { x: startX + count * columnGap, y: startY + laneIndex * rowGap }
        : { x: laneX[lane] ?? laneX.note, y: startY + count * rowGap },
    };
  });
  const populatedLanes = laneOrder.filter((lane) => laneCounts[lane] > 0);
  const minLane = populatedLanes[0] || 'source';
  const focusViewport = body.focusViewport || {
    x: Math.max(0, (laneX[minLane] || startX) - 120),
    y: Math.max(0, startY - 80),
    zoom: 0.82,
  };
  return {
    ...body,
    nodes: laidOut,
    focusViewport,
    layoutResolved: { direction, columnGap, rowGap, startX, startY },
  };
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
    const nodeType = existingTypes.get(nodeId) || String(update?.type || '').trim();
    const rawData = isPlainObject(update?.data) ? update.data : {};
    const lockedData = nodeType
      ? lockNodeDataToRegistry({ type: nodeType, data: rawData }, warnings, `updates[${index}].data`).data
      : rawData;
    return {
      ...update,
      nodeId,
      position: update?.position ? cleanPosition(update.position) : undefined,
      data: lockedData,
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
    const resultUrls = nodeResultUrls(node);
    const status = String(node?.data?.status || node?.data?.runStatus || '').trim().toLowerCase();
    const pending = ['idle', 'queued', 'running', 'pending', 'processing', 'generating'].includes(status);
    const failed = ['error', 'failed', 'cancelled', 'canceled'].includes(status);
    const claimsComplete = ['success', 'completed', 'complete', 'done'].includes(status);
    checks.push({
      id: `run:${id}`,
      label: `节点可运行 ${id}`,
      ok: Boolean(node),
      severity: 'warning',
      detail: node ? `type=${node.type}, results=${nodeResultUrls(node).length}` : '未找到节点',
    });
    checks.push({
      id: `result:${id}`,
      label: `节点真实结果 ${id}`,
      ok: Boolean(node) && (resultUrls.length > 0 || pending),
      pending: Boolean(node) && pending && resultUrls.length === 0,
      severity: failed || claimsComplete ? 'error' : 'warning',
      detail: !node
        ? '未找到节点'
        : resultUrls.length
          ? `已回读 ${resultUrls.length} 个结果 URL`
          : failed
            ? String(node.data?.error || '节点运行失败')
            : claimsComplete
              ? '节点声称完成，但没有 imageUrl/videoUrl/outputUrl'
              : `status=${status || 'unknown'}，等待节点结果回写`,
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

function shouldAutoRepairNodeResult(result, options = {}) {
  if (options.alreadyRetried === true) return { repair: false, reason: 'retry-limit' };
  const node = result?.node && typeof result.node === 'object' ? result.node : {};
  const nodeType = String(node.type || options.nodeType || '').trim();
  if (!['image', 'video', 'seedance'].includes(nodeType)) return { repair: false, reason: 'unsupported-node-type' };
  const errorText = String(result?.error || node?.data?.error || '').trim();
  if (/cancel|canceled|cancelled|用户取消|主动停止|unauthorized|forbidden|余额|额度|付费|cost/i.test(errorText)) {
    return { repair: false, reason: 'user-or-permission-stop' };
  }
  const urls = nodeResultUrls(node);
  if (result?.ok === true && urls.length === 0) {
    return { repair: true, reason: 'completed-without-result-url' };
  }
  if (result?.ok !== true && /(unsupported|invalid|parameter|aspect|ratio|size|duration|resolution|model|timeout|timed out|network|fetch|429|5\d\d|无结果|参数|比例|尺寸|时长|分辨率|模型|超时|网络)/i.test(errorText)) {
    return { repair: true, reason: 'recoverable-generation-error' };
  }
  return { repair: false, reason: result?.ok === true ? 'result-ready' : 'non-recoverable-error' };
}

module.exports = {
  PLAN_ACTION_TYPES,
  createCanvasSnapshot,
  normalizePlanId,
  normalizeCanvasPlan,
  layoutCanvasPlan,
  createPlanDiff,
  scoreNodeQuality,
  canvasPlanToActions,
  verifyCanvasPlan,
  shouldAutoRepairNodeResult,
};
