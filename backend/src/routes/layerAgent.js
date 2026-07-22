const express = require('express');

const router = express.Router();

const VALID_MODES = new Set(['lite', 'standard', 'pro']);
const VALID_LAYER_TYPES = new Set(['background', 'product', 'person', 'text', 'logo', 'effect', 'prop', 'shadow', 'unknown']);

function normalizeMode(mode) {
  const value = String(mode || 'standard').trim().toLowerCase();
  return VALID_MODES.has(value) ? value : 'standard';
}

function normalizeRequestedLayers(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item, index, arr) => VALID_LAYER_TYPES.has(item) && arr.indexOf(item) === index);
}

function estimateCost(mode, requestedLayers) {
  const base = mode === 'lite' ? 0.18 : mode === 'pro' ? 1.4 : 0.8;
  const extra = Math.max(0, requestedLayers.length - 3) * 0.18;
  return Number((base + extra).toFixed(2));
}

function buildLayerStack({ sourceImageUrl, mode = 'standard', requestedLayers = [], prompt = '' }) {
  const createdAt = new Date().toISOString();
  const stamp = Date.now();
  const wanted = requestedLayers.length > 0 ? requestedLayers : ['background', 'product', 'text', 'effect'];
  const has = (type) => wanted.includes(type);
  const layers = [];

  layers.push({
    id: `background-${stamp}`,
    name: '修补背景',
    type: 'background',
    imageUrl: sourceImageUrl,
    visible: true,
    locked: true,
    opacity: 100,
    editable: false,
    confidence: 0.96,
  });

  if (has('product') || has('person') || has('prop')) {
    const type = has('person') ? 'person' : has('prop') ? 'prop' : 'product';
    layers.push({
      id: `${type}-${stamp}`,
      name: type === 'person' ? '人物主体' : type === 'prop' ? '道具主体' : '主品层',
      type,
      bbox: [0.18, 0.16, 0.66, 0.72],
      visible: true,
      opacity: 100,
      feather: mode === 'lite' ? 4 : 2,
      editable: true,
      confidence: mode === 'lite' ? 0.82 : 0.91,
    });
  }

  if (has('text') || /文字|标题|copy|text/i.test(prompt)) {
    layers.push({
      id: `text-${stamp}`,
      name: '文字层',
      type: 'text',
      bbox: [0.12, 0.08, 0.76, 0.2],
      visible: true,
      opacity: 96,
      feather: 0,
      editable: true,
      confidence: 0.78,
      text: { content: '待识别文字', color: '#f8fafc', fontGuess: 'Auto' },
    });
  }

  if (has('logo')) {
    layers.push({
      id: `logo-${stamp}`,
      name: 'Logo/标识',
      type: 'logo',
      bbox: [0.68, 0.08, 0.18, 0.12],
      visible: true,
      opacity: 100,
      feather: 1,
      editable: true,
      confidence: 0.72,
    });
  }

  if (has('effect') || mode !== 'lite') {
    layers.push({
      id: `effect-${stamp}`,
      name: '光效/装饰',
      type: 'effect',
      bbox: [0.05, 0.05, 0.9, 0.9],
      visible: true,
      opacity: 72,
      feather: 8,
      blendMode: 'screen',
      editable: true,
      confidence: 0.7,
    });
  }

  return {
    id: `layer-stack-${stamp}`,
    sourceImageUrl,
    repairedBackgroundUrl: sourceImageUrl,
    previewUrl: sourceImageUrl,
    layers,
    meta: {
      provider: 'layer-agent-protocol-preview',
      mode,
      costEstimateCny: estimateCost(mode, wanted),
      createdAt,
      pendingProvider: true,
    },
  };
}

router.post('/decompose', async (req, res) => {
  try {
    const sourceImageUrl = String(req.body?.sourceImageUrl || req.body?.imageUrl || '').trim();
    if (!sourceImageUrl) {
      return res.status(400).json({ success: false, error: '请提供 sourceImageUrl' });
    }
    const mode = normalizeMode(req.body?.mode);
    const requestedLayers = normalizeRequestedLayers(req.body?.requestedLayers);
    const prompt = String(req.body?.prompt || '').trim();
    const stack = buildLayerStack({ sourceImageUrl, mode, requestedLayers, prompt });
    return res.json({ success: true, data: { stack } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || '图片分层失败' });
  }
});

module.exports = router;
module.exports.buildLayerStack = buildLayerStack;
module.exports.normalizeRequestedLayers = normalizeRequestedLayers;
