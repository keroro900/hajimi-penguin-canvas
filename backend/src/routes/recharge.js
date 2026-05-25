/**
 * 算力充值系统
 * 从 gpt-image-2-web 的充值协议迁移而来:
 * - 本地只保存绑定账号与订单状态
 * - 支付链接、查单、转额度都走 VPS agent
 * - 付款后本地通过主动轮询确认,避免依赖公网回调
 */
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

const apiRouter = express.Router();
const payRouter = express.Router();

// Public repository default must stay empty. Private builds may inject values
// through environment variables; never commit AGENT_HMAC_KEY to GitHub.
const RECHARGE_DEFAULT_ENC = '';

const QUOTA_PER_POWER = 500000;
const POWER_TIERS = [20, 30, 50, 100, 200, 300, 500];
const processingOrders = new Set();
let rechargeConfigCache = null;
let deviceIdCache = null;

function nowText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeRechargeConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(
    ['AGENT_BASE_URL', 'AGENT_HMAC_KEY', 'WEBSITE_URL', 'DULUPAY_KEY']
      .map((key) => [key, String(cfg[key] || '').trim()])
      .filter(([, value]) => value)
  );
}

function loadPrivateRechargeConfig() {
  try {
    if (!fs.existsSync(config.RECHARGE_PRIVATE_FILE)) return {};
    return normalizeRechargeConfig(JSON.parse(fs.readFileSync(config.RECHARGE_PRIVATE_FILE, 'utf-8')));
  } catch (e) {
    console.warn('[recharge] load private config failed:', e?.message || e);
    return {};
  }
}

function loadRechargeConfig() {
  if (rechargeConfigCache) return rechargeConfigCache;
  const envOverrides = normalizeRechargeConfig({
    AGENT_BASE_URL: String(process.env.RECHARGE_AGENT_BASE_URL || '').trim(),
    AGENT_HMAC_KEY: String(process.env.RECHARGE_AGENT_HMAC_KEY || '').trim(),
    WEBSITE_URL: String(process.env.RECHARGE_WEBSITE_URL || '').trim(),
    DULUPAY_KEY: String(process.env.RECHARGE_DULUPAY_KEY || '').trim(),
  });
  const privateConfig = loadPrivateRechargeConfig();
  try {
    const magic = 'ZZENC1\n';
    if (!RECHARGE_DEFAULT_ENC.startsWith(magic)) {
      rechargeConfigCache = { ...privateConfig, ...envOverrides };
      return rechargeConfigCache;
    }
    const key = crypto.createHash('sha256').update('ZhenzhenAI-Studio-T8star-2026').digest();
    const payload = Buffer.from(RECHARGE_DEFAULT_ENC.slice(magic.length), 'base64');
    const decoded = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) decoded[i] = payload[i] ^ key[i % key.length];
    rechargeConfigCache = { ...normalizeRechargeConfig(JSON.parse(decoded.toString('utf-8'))), ...privateConfig, ...envOverrides };
  } catch (e) {
    console.warn('[recharge] load config failed:', e?.message || e);
    rechargeConfigCache = { ...privateConfig, ...envOverrides };
  }
  return rechargeConfigCache;
}

function ensureDataDir() {
  if (!fs.existsSync(config.DATA_DIR)) fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

function defaultStore() {
  return { binding: null, orders: [] };
}

function loadStore() {
  ensureDataDir();
  if (!fs.existsSync(config.RECHARGE_FILE)) return defaultStore();
  try {
    const data = JSON.parse(fs.readFileSync(config.RECHARGE_FILE, 'utf-8'));
    return {
      binding: data?.binding || null,
      orders: Array.isArray(data?.orders) ? data.orders : [],
    };
  } catch (e) {
    console.warn('[recharge] load store failed:', e?.message || e);
    return defaultStore();
  }
}

function saveStore(store) {
  ensureDataDir();
  const next = {
    binding: store?.binding || null,
    orders: Array.isArray(store?.orders) ? store.orders : [],
  };
  const tmp = `${config.RECHARGE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmp, config.RECHARGE_FILE);
}

function getPlans() {
  const testPlan = {
    id: 'test_1cny',
    power: 1,
    price: 1.0,
    quota: QUOTA_PER_POWER,
    name: '测试1CP-1.00CNY',
    test: true,
  };
  return [
    testPlan,
    ...POWER_TIERS.map((power) => {
      const price = Number((power * 1.35).toFixed(2));
      return {
        id: `cp_${power}`,
        power,
        price,
        quota: power * QUOTA_PER_POWER,
        name: `${power}CP-${price.toFixed(2)}CNY`,
      };
    }),
  ];
}

function genOrderId() {
  return `L${Date.now()}${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

function getDeviceId() {
  if (deviceIdCache) return deviceIdCache;
  ensureDataDir();
  try {
    if (fs.existsSync(config.RECHARGE_DEVICE_FILE)) {
      const existing = fs.readFileSync(config.RECHARGE_DEVICE_FILE, 'utf-8').trim();
      if (existing && existing.length <= 128) {
        deviceIdCache = existing;
        return deviceIdCache;
      }
    }
    const seed = `${Date.now()}-${process.cwd()}-${crypto.randomBytes(16).toString('hex')}`;
    const id = crypto.createHash('sha256').update(seed).digest('hex');
    fs.writeFileSync(config.RECHARGE_DEVICE_FILE, id, 'utf-8');
    deviceIdCache = id;
    return deviceIdCache;
  } catch (e) {
    console.warn('[recharge] device id failed:', e?.message || e);
    return 'unknown-device';
  }
}

async function agentCall(method, agentPath, body, timeout = 20000) {
  const cfg = loadRechargeConfig();
  const base = String(cfg.AGENT_BASE_URL || '').replace(/\/+$/, '');
  const key = String(cfg.AGENT_HMAC_KEY || '');
  if (!base || !key) return { success: false, message: 'agent not configured' };
  if (typeof fetch !== 'function') return { success: false, message: 'fetch is not available in this Node runtime' };

  const upper = method.toUpperCase();
  const bodyText = body == null ? '' : JSON.stringify(body);
  const bodyHash = crypto.createHash('sha256').update(bodyText).digest('hex');
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const signPayload = `${upper}\n${agentPath}\n${ts}\n${nonce}\n${bodyHash}`;
  const sign = crypto.createHmac('sha256', key).update(signPayload).digest('hex');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(`${base}${agentPath}`, {
      method: upper,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'T8-PenguinCanvas/1.0',
        'X-Device-Id': getDeviceId(),
        'X-Timestamp': ts,
        'X-Nonce': nonce,
        'X-Sign': sign,
      },
      body: upper === 'GET' ? undefined : bodyText,
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { success: false, message: `non-json response: ${text.slice(0, 200)}` };
    }
    if (!res.ok) {
      return { ...json, success: false, http_status: res.status, message: json?.message || `HTTP ${res.status}` };
    }
    return json;
  } catch (e) {
    return { success: false, message: e?.name === 'AbortError' ? 'agent call timeout' : `agent call error: ${e?.message || e}` };
  } finally {
    clearTimeout(timer);
  }
}

async function createPayUrl(order, plan, payType) {
  const payload = {
    order_id: order.order_id,
    amount: Number(plan.price),
    name: plan.name,
    pay_type: payType,
    website_user_id: Number(order.website_user_id),
    quota: Number(plan.quota),
  };
  const r = await agentCall('POST', '/agent/dulupay/create', payload, 20000);
  if (r?.success && r?.pay_url) return r.pay_url;
  console.warn('[recharge] create pay url failed:', r);
  return '';
}

async function queryDuluPay(orderId) {
  const r = await agentCall('POST', '/agent/dulupay/query', { order_id: orderId }, 20000);
  if (!r?.success) {
    console.warn('[recharge] query failed:', r);
    return { paid: false, trade_no: '', raw: { error: r?.message || 'query failed' } };
  }
  return { paid: !!r.paid, trade_no: r.trade_no || '', raw: r.data || r };
}

async function transferQuota(order) {
  const body = {
    target_id: Number(order.website_user_id),
    quota: Number(order.quota),
    amount: Number(order.amount),
    order_id: order.order_id,
  };
  const r = await agentCall('POST', '/agent/transfer-quota', body, 30000);
  console.log(`[recharge] transfer order=${order.order_id} user=${order.website_user_id} quota=${order.quota} -> ${JSON.stringify(r)}`);
  return r;
}

function makeDuluPaySign(params, key) {
  const pairs = Object.keys(params || {})
    .filter((k) => params[k] !== '' && params[k] != null && k !== 'sign' && k !== 'sign_type')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('md5').update(`${pairs}${key}`).digest('hex');
}

function orderPublic(order, extra = {}) {
  return {
    success: true,
    status: order.status,
    order_id: order.order_id,
    plan_name: order.plan_name,
    amount: order.amount,
    quota: order.quota,
    power: order.power,
    pay_time: order.pay_time || '',
    transfer_message: extra.transfer_message || order.transfer_message || '',
  };
}

function orderSummary(order) {
  return {
    order_id: order.order_id,
    website_user_id: order.website_user_id,
    plan_id: order.plan_id,
    plan_name: order.plan_name,
    power: order.power,
    amount: order.amount,
    quota: order.quota,
    pay_type: order.pay_type,
    status: order.status,
    create_time: order.create_time || '',
    pay_time: order.pay_time || '',
    transfer_message: order.transfer_message || '',
  };
}

function asyncRoute(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[recharge] route error:', e);
    res.status(500).json({ success: false, message: e?.message || String(e) });
  });
}

apiRouter.get('/binding', (_req, res) => {
  const store = loadStore();
  if (!store.binding) return res.json({ bound: false });
  res.json({ bound: true, website_user_id: store.binding.website_user_id, bind_time: store.binding.bind_time });
});

apiRouter.post('/binding', (req, res) => {
  const userId = Number(req.body?.website_user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: 'User ID must be a positive integer' });
  }
  const store = loadStore();
  store.binding = { website_user_id: userId, bind_time: nowText() };
  saveStore(store);
  res.json({ success: true, website_user_id: userId });
});

apiRouter.delete('/binding', (_req, res) => {
  const store = loadStore();
  store.binding = null;
  saveStore(store);
  res.json({ success: true });
});

apiRouter.get('/plans', (_req, res) => {
  res.json(getPlans());
});

apiRouter.get('/config', (_req, res) => {
  const cfg = loadRechargeConfig();
  res.json({
    website_url: cfg.WEBSITE_URL || 'https://ai.t8star.org',
    agent_base_url: cfg.AGENT_BASE_URL || '',
    configured: !!(cfg.AGENT_BASE_URL && cfg.AGENT_HMAC_KEY),
    device_id: `${getDeviceId().slice(0, 16)}...`,
  });
});

apiRouter.post('/order/create', asyncRoute(async (req, res) => {
  const planId = String(req.body?.plan_id || '');
  const payType = String(req.body?.pay_type || 'alipay');
  if (!['alipay', 'wxpay'].includes(payType)) {
    return res.status(400).json({ success: false, message: 'Pay type must be alipay or wxpay' });
  }
  const plan = getPlans().find((p) => p.id === planId);
  if (!plan) return res.status(400).json({ success: false, message: 'Invalid plan ID' });

  const store = loadStore();
  if (!store.binding) {
    return res.status(400).json({ success: false, message: 'Please bind Website User ID first' });
  }

  const order = {
    order_id: genOrderId(),
    website_user_id: store.binding.website_user_id,
    plan_id: plan.id,
    plan_name: plan.name,
    power: plan.power,
    amount: plan.price,
    quota: plan.quota,
    pay_type: payType,
    status: 'pending',
    trade_no: '',
    create_time: nowText(),
    pay_time: '',
    transfer_message: '',
  };
  const payUrl = await createPayUrl(order, plan, payType);
  if (!payUrl) {
    return res.status(502).json({ success: false, message: 'Failed to generate payment link' });
  }

  store.orders.unshift(order);
  saveStore(store);

  res.json({
    success: true,
    order_id: order.order_id,
    pay_url: payUrl,
    amount: plan.price,
    power: plan.power,
    quota: plan.quota,
    plan_name: plan.name,
    pay_type: payType,
  });
}));

apiRouter.get('/order/:orderId', (req, res) => {
  const store = loadStore();
  const order = store.orders.find((o) => o.order_id === req.params.orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, order: orderSummary(order) });
});

apiRouter.get('/order/:orderId/check', asyncRoute(async (req, res) => {
  const orderId = String(req.params.orderId || '');
  let store = loadStore();
  let order = store.orders.find((o) => o.order_id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  if (['success', 'transfer_failed', 'transferring'].includes(order.status)) {
    return res.json(orderPublic(order, {
      transfer_message: order.status === 'transferring' ? '正在处理中，请稍候' : order.transfer_message,
    }));
  }
  if (processingOrders.has(orderId)) {
    return res.json(orderPublic({ ...order, status: 'transferring' }, { transfer_message: '正在处理中，请稍候' }));
  }

  const query = await queryDuluPay(orderId);
  if (!query.paid) return res.json(orderPublic(order));

  // Atomic-ish claim inside the single Node process: reload and switch pending -> transferring synchronously.
  store = loadStore();
  order = store.orders.find((o) => o.order_id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.status !== 'pending') return res.json(orderPublic(order));
  order.status = 'transferring';
  order.trade_no = query.trade_no || '';
  saveStore(store);

  processingOrders.add(orderId);
  try {
    const transfer = await transferQuota(order);
    const ok = !!transfer?.success;
    const payTime = nowText();
    store = loadStore();
    order = store.orders.find((o) => o.order_id === orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.status = ok ? 'success' : 'transfer_failed';
    order.pay_time = payTime;
    order.transfer_message = transfer?.message || '';
    saveStore(store);
    res.json(orderPublic(order));
  } finally {
    processingOrders.delete(orderId);
  }
}));

apiRouter.post('/order/:orderId/retry', asyncRoute(async (req, res) => {
  const orderId = String(req.params.orderId || '');
  let store = loadStore();
  let order = store.orders.find((o) => o.order_id === orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.status !== 'transfer_failed') {
    return res.status(400).json({ success: false, message: `Only transfer_failed orders can retry (current: ${order.status})` });
  }
  if (processingOrders.has(orderId)) {
    return res.status(409).json({ success: false, message: 'Order is already processing' });
  }
  order.status = 'transferring';
  saveStore(store);

  processingOrders.add(orderId);
  try {
    const transfer = await transferQuota(order);
    const ok = !!transfer?.success;
    const payTime = nowText();
    store = loadStore();
    order = store.orders.find((o) => o.order_id === orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.status = ok ? 'success' : 'transfer_failed';
    order.pay_time = payTime;
    order.transfer_message = transfer?.message || '';
    saveStore(store);
    res.json(orderPublic(order));
  } finally {
    processingOrders.delete(orderId);
  }
}));

apiRouter.get('/orders', (req, res) => {
  const n = Number(req.query?.limit || 20);
  const limit = Number.isFinite(n) ? Math.max(1, Math.min(100, Math.floor(n))) : 20;
  const store = loadStore();
  res.json(store.orders.slice(0, limit).map(orderSummary));
});

async function processNotify(params, res) {
  const cfg = loadRechargeConfig();
  const notifyKey = String(cfg.DULUPAY_KEY || '');
  if (!notifyKey) {
    console.warn('[recharge] ignore notify: missing DULUPAY_KEY');
    return res.status(200).send('fail');
  }
  const sign = String(params?.sign || '');
  const expected = makeDuluPaySign(params || {}, notifyKey);
  if (!sign || sign !== expected) return res.status(200).send('fail');
  if (params.trade_status !== 'TRADE_SUCCESS') return res.status(200).send('success');

  const orderId = String(params.out_trade_no || '');
  let store = loadStore();
  let order = store.orders.find((o) => o.order_id === orderId);
  if (!order) return res.status(200).send('fail');
  if (['success', 'transferring', 'transfer_failed'].includes(order.status)) {
    return res.status(200).send('success');
  }
  order.status = 'transferring';
  order.trade_no = String(params.trade_no || '');
  saveStore(store);

  if (!processingOrders.has(orderId)) {
    processingOrders.add(orderId);
    try {
      const transfer = await transferQuota(order);
      store = loadStore();
      order = store.orders.find((o) => o.order_id === orderId);
      if (order) {
        order.status = transfer?.success ? 'success' : 'transfer_failed';
        order.pay_time = nowText();
        order.transfer_message = transfer?.message || '';
        saveStore(store);
      }
    } finally {
      processingOrders.delete(orderId);
    }
  }
  res.status(200).send('success');
}

payRouter.post('/notify', asyncRoute(async (req, res) => {
  await processNotify(req.body || {}, res);
}));

payRouter.get('/notify', asyncRoute(async (req, res) => {
  await processNotify(req.query || {}, res);
}));

payRouter.get('/return', (req, res) => {
  const orderId = String(req.query?.out_trade_no || '');
  res.redirect(`/?paid_order=${encodeURIComponent(orderId)}`);
});

module.exports = { apiRouter, payRouter };
