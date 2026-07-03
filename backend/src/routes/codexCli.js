'use strict';

const express = require('express');
const path = require('path');
const config = require('../config');
const { runLocalHooks } = require('../extensions/runtimeHooks');
const {
  CODEX_DISABLED_MESSAGE,
  adaptProjectSkillForSidebar,
  createProjectSkill,
  deleteProjectSkill,
  importProjectSkillArchive,
  listCodexSkills,
  listProjectSkillFiles,
  probeCodexStatus,
  projectSkillRootsForWorkspace,
  readProjectSkillFile,
  resolveProjectSkillWorkspaceDir,
  sendSse,
  startCodexLogin,
  updateProjectSkill,
  validateProjectSkill,
  writeProjectSkillFile,
} = require('../utils/codexCliRunner');
const {
  deleteGlobalCodexSessionRecord,
  forkGlobalCodexSessionThread,
  getGlobalCodexSessionStatus,
  injectGlobalCodexSessionItems,
  listGlobalCodexSessionRecords,
  listGlobalCodexSessionThreadTurns,
  openGlobalCodexSession,
  probeCodexSdkStatus,
  readGlobalCodexSessionThread,
  respondToCodexServerRequest,
  rollbackGlobalCodexSessionThread,
  runGlobalCodexSessionMessage,
  steerGlobalCodexSessionTurn,
  stopGlobalCodexSession,
  validateCodexSessionPermission,
} = require('../utils/codexSdkManager');

const router = express.Router();
const researchCache = new Map();
const RESEARCH_CACHE_TTL_MS = 30 * 60 * 1000;

function beginSse(res) {
  if (res.headersSent) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function startSseHeartbeat(res, meta = {}) {
  const timer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(timer);
      return;
    }
    sendSse(res, 'heartbeat', {
      ...meta,
      ts: Date.now(),
      session: getGlobalCodexSessionStatus(),
    });
  }, 15000);
  timer.unref?.();
  return () => clearInterval(timer);
}

function cleanHookData(result = {}) {
  const data = result.data && typeof result.data === 'object' ? { ...result.data } : { ...result };
  delete data.handled;
  delete data.config;
  delete data.action;
  delete data.statusCode;
  return data;
}

function artifactPatch(artifact = {}) {
  const kind = artifact.kind;
  const urls = Array.isArray(artifact.urls) ? artifact.urls : (artifact.url ? [artifact.url] : []);
  if (kind === 'image') return { imageUrl: urls[0] || '', imageUrls: urls };
  if (kind === 'video') return { videoUrl: urls[0] || '', videoUrls: urls };
  if (kind === 'audio') return { audioUrl: urls[0] || '', audioUrls: urls };
  if (kind === 'model3d') return { modelUrl: urls[0] || '', modelUrls: urls };
  return {};
}

function resultWithArtifacts(result = {}) {
  const out = { ...result };
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  for (const artifact of artifacts) Object.assign(out, artifactPatch(artifact));
  return out;
}

function normalizeResearchQuery(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function researchCacheKey(payload = {}) {
  return [
    normalizeResearchQuery(payload.query || payload.prompt).toLowerCase(),
    String(payload.skillName || '').trim().toLowerCase(),
    String(payload.directionId || '').trim().toLowerCase(),
    String(payload.mode || payload.researchMode || 'quick').trim().toLowerCase(),
  ].join('|');
}

function extractResearchKeywords(query, skillName = '') {
  const text = `${query} ${skillName}`
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(/\s+/).filter((word) => word.length >= 2);
  const seen = new Set();
  return words.filter((word) => {
    const key = word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function buildResearchSummary(payload = {}, referenceImages = [], cached = false) {
  const query = normalizeResearchQuery(payload.query || payload.prompt || '画布创作任务');
  const skillName = String(payload.skillName || '').trim();
  const directionId = String(payload.directionId || '').trim();
  const mode = String(payload.mode || payload.researchMode || 'quick').trim() || 'quick';
  const keywords = extractResearchKeywords(query, skillName);
  const sources = [
    ...referenceImages.slice(0, 6).map((item) => ({
      title: item.title,
      url: item.sourceUrl || item.url,
      type: 'reference-image',
    })),
    {
      title: `Google: ${query}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      type: 'search',
    },
  ];
  return {
    cacheKey: researchCacheKey({ ...payload, query, mode }),
    cached,
    query,
    skillName,
    directionId,
    mode,
    keywords,
    sources,
    promptStructure: [
      '目标对象 / 商品或画布任务',
      '参考素材与不可改变约束',
      '视觉关键词与差异化变量',
      '模型参数：比例、尺寸、质量、时长',
      '输出节点、连线和回读验证',
    ],
    createdAt: Date.now(),
  };
}

async function searchCommonsReferenceImages(query, limit = 8) {
  const q = normalizeResearchQuery(query);
  if (!q) return [];
  const max = Math.min(Math.max(Number(limit) || 8, 1), 12);
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrsearch', q);
  url.searchParams.set('gsrlimit', String(max));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const response = await fetch(url, { headers: { 'User-Agent': 'T8-Hakimi-Canvas/1.0' } });
  if (!response.ok) throw new Error(`参考图搜索失败：HTTP ${response.status}`);
  const data = await response.json();
  const pages = Object.values(data?.query?.pages || {});
  return pages
    .map((page) => {
      const info = page?.imageinfo?.[0] || {};
      const meta = info.extmetadata || {};
      const imageUrl = String(info.thumburl || info.url || '').trim();
      if (!imageUrl) return null;
      return {
        id: `commons:${page.pageid || imageUrl}`,
        title: String(page.title || '').replace(/^File:/, '') || 'Wikimedia Commons image',
        url: imageUrl,
        thumbUrl: String(info.thumburl || imageUrl),
        sourceUrl: String(info.descriptionurl || imageUrl),
        license: String(meta.LicenseShortName?.value || meta.UsageTerms?.value || 'Wikimedia Commons'),
        author: String(meta.Artist?.value || '').replace(/<[^>]+>/g, '').slice(0, 120),
      };
    })
    .filter(Boolean);
}

router.get('/status', async (req, res) => {
  try {
    const hookResult = await runLocalHooks('codexCli.status', { req, handled: false });
    if (hookResult?.handled) {
      return res.json({ success: true, data: cleanHookData(hookResult) });
    }
    const data = await probeCodexSdkStatus({
      executablePath: req.query.executablePath,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_status_failed',
      error: error?.message || String(error),
    });
  }
});

router.get('/research/reference-images', async (req, res) => {
  try {
    const query = normalizeResearchQuery(req.query.q || req.query.query || '');
    if (!query) return res.json({ success: true, data: { query, images: [] } });
    const images = await searchCommonsReferenceImages(query, req.query.limit || 8);
    return res.json({ success: true, data: { query, images } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_reference_image_search_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/research/summary', async (req, res) => {
  try {
    const body = req.body || {};
    const query = normalizeResearchQuery(body.query || body.prompt || '');
    const key = researchCacheKey({ ...body, query });
    const cached = researchCache.get(key);
    if (cached && Date.now() - cached.createdAt < RESEARCH_CACHE_TTL_MS) {
      return res.json({ success: true, data: { ...cached, cached: true } });
    }
    const images = await searchCommonsReferenceImages(query, body.limit || 6).catch(() => []);
    const summary = buildResearchSummary({ ...body, query }, images, false);
    researchCache.set(key, summary);
    return res.json({ success: true, data: summary });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_research_summary_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/login/start', async (req, res) => {
  try {
    const body = req.body || {};
    const hookResult = await runLocalHooks('codexCli.loginStart', { req, body, handled: false });
    if (hookResult?.handled) {
      return res.json({ success: true, data: cleanHookData(hookResult) });
    }
    const data = startCodexLogin({
      executablePath: body.executablePath,
      deviceAuth: Boolean(body.deviceAuth),
    });
    return res.status(data.started ? 200 : 500).json({
      success: data.started,
      data,
      error: data.started ? undefined : data.message,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_login_start_failed',
      error: error?.message || String(error),
    });
  }
});

router.get('/skills', async (req, res) => {
  try {
    const requestedWorkspaceDir = path.resolve(String(req.query.workspaceDir || config.BASE_DIR));
    const workspaceDir = resolveProjectSkillWorkspaceDir(requestedWorkspaceDir);
    const skills = listCodexSkills({
      workspaceDir,
      roots: projectSkillRootsForWorkspace(requestedWorkspaceDir),
    }).filter((skill) => skill.scope === 'project');
    return res.json({
      success: true,
      data: {
        workspaceDir,
        skills,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_skills_failed',
      error: error?.message || String(error),
    });
  }
});

router.get('/skills/project/:name/files', async (req, res) => {
  try {
    const workspaceDir = resolveProjectSkillWorkspaceDir(req.query.workspaceDir || config.BASE_DIR, req.params.name);
    const data = listProjectSkillFiles({
      workspaceDir,
      name: req.params.name,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        ...data,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_files_failed',
      error: error?.message || String(error),
    });
  }
});

router.get('/skills/project/:name/file', async (req, res) => {
  try {
    const workspaceDir = resolveProjectSkillWorkspaceDir(req.query.workspaceDir || config.BASE_DIR, req.params.name);
    const data = readProjectSkillFile({
      workspaceDir,
      name: req.params.name,
      filePath: req.query.path || 'SKILL.md',
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        ...data,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_file_read_failed',
      error: error?.message || String(error),
    });
  }
});

router.get('/skills/project/:name/validate', async (req, res) => {
  try {
    const workspaceDir = resolveProjectSkillWorkspaceDir(req.query.workspaceDir || config.BASE_DIR, req.params.name);
    const data = validateProjectSkill({
      workspaceDir,
      name: req.params.name,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        ...data,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_validate_failed',
      error: error?.message || String(error),
    });
  }
});

router.put('/skills/project/:name/file', async (req, res) => {
  try {
    const body = req.body || {};
    const workspaceDir = resolveProjectSkillWorkspaceDir(body.workspaceDir || config.BASE_DIR, req.params.name);
    const data = writeProjectSkillFile({
      workspaceDir,
      name: req.params.name,
      filePath: body.path || body.filePath || 'SKILL.md',
      content: body.content || '',
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        ...data,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_file_write_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/skills/project', async (req, res) => {
  try {
    const body = req.body || {};
    const workspaceDir = resolveProjectSkillWorkspaceDir(body.workspaceDir || config.BASE_DIR);
    const skill = createProjectSkill({
      ...body,
      workspaceDir,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        skill,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/skills/project/import-archive', async (req, res) => {
  try {
    const body = req.body || {};
    const workspaceDir = resolveProjectSkillWorkspaceDir(body.workspaceDir || config.BASE_DIR, body.name || '');
    const skill = importProjectSkillArchive({
      ...body,
      workspaceDir,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        skill,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_archive_import_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/skills/project/:name/adapt-sidebar', async (req, res) => {
  try {
    const body = req.body || {};
    const workspaceDir = resolveProjectSkillWorkspaceDir(body.workspaceDir || config.BASE_DIR, req.params.name);
    const skill = adaptProjectSkillForSidebar({
      workspaceDir,
      name: req.params.name,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        skill,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_sidebar_adapt_failed',
      error: error?.message || String(error),
    });
  }
});

router.put('/skills/project/:name', async (req, res) => {
  try {
    const body = req.body || {};
    const workspaceDir = resolveProjectSkillWorkspaceDir(body.workspaceDir || config.BASE_DIR, req.params.name);
    const skill = updateProjectSkill({
      ...body,
      oldName: req.params.name,
      workspaceDir,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        skill,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_update_failed',
      error: error?.message || String(error),
    });
  }
});

router.delete('/skills/project/:name', async (req, res) => {
  try {
    const body = req.body || {};
    const workspaceDir = resolveProjectSkillWorkspaceDir(body.workspaceDir || req.query.workspaceDir || config.BASE_DIR, req.params.name);
    const result = deleteProjectSkill({
      workspaceDir,
      name: req.params.name,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir,
        ...result,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_delete_failed',
      error: error?.message || String(error),
    });
  }
});

router.get('/sessions/global', async (req, res) => {
  const data = getGlobalCodexSessionStatus();
  const cliStatus = await probeCodexSdkStatus({
    executablePath: req.query.executablePath,
  }).catch((error) => ({
    available: false,
    message: error?.message || 'Codex CLI 状态检查失败',
  }));
  return res.json({
    success: true,
    data: {
      ...data,
      cliStatus,
    },
  });
});

router.post('/sessions/global/open', async (req, res) => {
  try {
    const body = req.body || {};
    const data = openGlobalCodexSession(body);
    const cliStatus = await probeCodexSdkStatus({
      executablePath: body.executablePath,
    }).catch((error) => ({
      available: false,
      message: error?.message || 'Codex CLI 状态检查失败',
    }));
    return res.json({
      success: true,
      data: {
        ...data,
        cliStatus,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_open_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/sessions/global/stop', async (_req, res) => {
  try {
    const data = await stopGlobalCodexSession();
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_session_stop_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/sessions/global/answer', async (req, res) => {
  try {
    const data = respondToCodexServerRequest(req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_answer_failed',
      error: error?.message || String(error),
      data: {
        expired: Boolean(error?.expired),
        session: getGlobalCodexSessionStatus(),
      },
    });
  }
});

router.post('/sessions/global/rollback', async (req, res) => {
  try {
    const data = await rollbackGlobalCodexSessionThread(req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_rollback_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.get('/sessions/global/records', async (req, res) => {
  try {
    const data = listGlobalCodexSessionRecords(req.query || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_records_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.delete('/sessions/global/records/:recordId', async (req, res) => {
  try {
    const data = deleteGlobalCodexSessionRecord({
      ...(req.query || {}),
      recordId: req.params.recordId,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_record_delete_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.post('/sessions/global/fork', async (req, res) => {
  try {
    const data = await forkGlobalCodexSessionThread(req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_fork_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.get('/sessions/global/thread', async (req, res) => {
  try {
    const data = await readGlobalCodexSessionThread({
      ...req.query,
      includeTurns: req.query.includeTurns !== 'false',
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_thread_read_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.get('/sessions/global/turns', async (req, res) => {
  try {
    const data = await listGlobalCodexSessionThreadTurns(req.query || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_turns_read_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.post('/sessions/global/inject', async (req, res) => {
  try {
    validateCodexSessionPermission(req.body || {});
    const data = await injectGlobalCodexSessionItems(req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_inject_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.post('/sessions/global/steer', async (req, res) => {
  try {
    validateCodexSessionPermission(req.body || {});
    const data = await steerGlobalCodexSessionTurn(req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'codex_cli_session_steer_failed',
      error: error?.message || String(error),
      data: getGlobalCodexSessionStatus(),
    });
  }
});

router.post('/sessions/global/message/stream', async (req, res) => {
  const body = req.body || {};
  const mode = String(body.mode || 'chat');
  const turnId = String(body.turnId || `global-${Date.now()}`);
  const meta = {
    mode,
    turnId,
    sessionId: 'global-codex',
    command: String(body.command || body.preset || mode),
  };
  const abortController = new AbortController();
  let stopHeartbeat = null;
  const abortStream = () => {
    if (!res.writableEnded && !abortController.signal.aborted) {
      abortController.abort();
    }
  };
  res.on('close', abortStream);
  req.on('aborted', abortStream);
  req.on('close', () => {
    if (req.aborted) abortStream();
  });
  try {
    validateCodexSessionPermission(body);
    const current = getGlobalCodexSessionStatus();
    if ((current.status === 'running' || current.status === 'stopping') && body.restart !== true) {
      return res.status(409).json({
        success: false,
        code: 'codex_cli_session_busy',
        error: 'codex_cli_session_busy: Codex 全局会话正在运行，请先停止当前任务。',
        data: current,
      });
    }
    if ((current.status === 'running' || current.status === 'stopping') && body.restart === true) {
      await stopGlobalCodexSession();
    }

    beginSse(res);
    stopHeartbeat = startSseHeartbeat(res, meta);
    sendSse(res, 'turn.started', {
      ...meta,
      message: 'Codex 全局侧边栏任务已开始',
      session: getGlobalCodexSessionStatus(),
      progress: 1,
    });

    const result = await runGlobalCodexSessionMessage({ ...body, turnId }, {
      handlers: {
        signal: abortController.signal,
        onDelta(delta, event) {
          sendSse(res, 'message.delta', {
            ...meta,
            delta,
            text: delta,
            rawType: event?.type,
            session: getGlobalCodexSessionStatus(),
          });
        },
        onProgress(message, event) {
          sendSse(res, 'tool.progress', {
            ...meta,
            message,
            rawType: event?.type,
            progress: typeof event?.progress === 'number' ? event.progress : undefined,
            session: getGlobalCodexSessionStatus(),
          });
        },
        onReasoning(delta, event) {
          sendSse(res, 'reasoning.delta', {
            ...meta,
            delta,
            text: delta,
            rawType: event?.type,
            session: getGlobalCodexSessionStatus(),
          });
        },
        onToolCall(message, event) {
          sendSse(res, 'tool.call', {
            ...meta,
            message,
            rawType: event?.type,
            toolName: event?.item?.name || event?.name || '',
            session: getGlobalCodexSessionStatus(),
          });
        },
        onApproval(request) {
          sendSse(res, request?.type === 'ask_user' ? 'ask_user' : 'approval.requested', {
            ...meta,
            ...request,
            session: getGlobalCodexSessionStatus(),
          });
        },
        onProcessStart() {
          sendSse(res, 'session.updated', {
            ...meta,
            message: 'Codex SDK 执行器已启动',
            session: getGlobalCodexSessionStatus(),
          });
        },
      },
    });

    const finalResult = resultWithArtifacts(result);
    for (const artifact of result.artifacts || []) {
      sendSse(res, 'artifact.completed', {
        ...meta,
        artifact,
        result: artifactPatch(artifact),
        session: getGlobalCodexSessionStatus(),
        progress: 100,
      });
    }
    sendSse(res, 'turn.completed', {
      ...meta,
      message: 'Codex 全局侧边栏任务完成',
      result: finalResult,
      session: getGlobalCodexSessionStatus(),
      progress: 100,
    });
    sendSse(res, 'done', {
      ...meta,
      done: true,
      result: finalResult,
      session: getGlobalCodexSessionStatus(),
    });
    stopHeartbeat?.();
    res.end();
    return undefined;
  } catch (error) {
    const message = error?.message || CODEX_DISABLED_MESSAGE;
    const statusCode = error?.statusCode || (error?.code === 'codex_cli_session_busy' ? 409 : 500);
    const errorArtifacts = Array.isArray(error?.artifacts) ? error.artifacts : [];
    if (abortController.signal.aborted && res.writableEnded) return undefined;
    if (!res.headersSent) {
      stopHeartbeat?.();
      return res.status(statusCode).json({
        success: false,
        code: error?.code || 'codex_cli_session_stream_failed',
        error: message,
        data: getGlobalCodexSessionStatus(),
      });
    }
    for (const artifact of errorArtifacts) {
      sendSse(res, 'artifact.completed', {
        ...meta,
        artifact,
        result: artifactPatch(artifact),
        session: getGlobalCodexSessionStatus(),
        progress: 100,
      });
    }
    sendSse(res, 'turn.failed', {
      ...meta,
      error: message,
      message,
      session: getGlobalCodexSessionStatus(),
      progress: 100,
    });
    sendSse(res, 'done', {
      ...meta,
      done: true,
      error: message,
      result: {
        status: 'error',
        message,
        text: error?.partialText || '',
        reply: error?.partialText || '',
        artifacts: errorArtifacts,
        workspace: error?.workspace,
        executable: error?.executable,
        elapsedMs: error?.elapsedMs,
        ...resultWithArtifacts({ artifacts: errorArtifacts }),
      },
      session: getGlobalCodexSessionStatus(),
    });
    stopHeartbeat?.();
    if (!res.writableEnded) res.end();
    return undefined;
  }
});

router.post('/agent/stream', async (req, res) => {
  const body = req.body || {};
  const mode = String(body.mode || 'chat');
  const turnId = String(body.turnId || '');
  const abortController = new AbortController();
  const meta = {
    mode,
    turnId,
    command: String(body.command || body.preset || mode),
  };
  let stopHeartbeat = null;
  const abortStream = () => {
    if (!res.writableEnded && !abortController.signal.aborted) {
      abortController.abort();
    }
  };
  res.on('close', abortStream);
  req.on('aborted', abortStream);
  req.on('close', () => {
    if (req.aborted) abortStream();
  });
  try {
    const hookResult = await runLocalHooks('codexCli.agentStream', {
      req,
      res,
      body,
      handled: false,
    });
    if (hookResult?.handled) return undefined;

    beginSse(res);
    stopHeartbeat = startSseHeartbeat(res, meta);
    sendSse(res, 'turn.started', {
      ...meta,
      message: 'Codex SDK 创作任务已开始',
      progress: 1,
    });
    sendSse(res, 'tool.progress', {
      ...meta,
      message: body.workspaceDir ? '正在使用已设置的 Codex SDK 工作区...' : '正在打开 Codex SDK 工作区...',
      progress: 5,
    });

    const result = await runGlobalCodexSessionMessage({
      ...body,
      command: body.command || 'codex-agent-stream',
      recordId: body.recordId || body.sessionId || body.nodeId || 'codex-agent-stream',
    }, {
      handlers: {
        signal: abortController.signal,
        onDelta(delta, event) {
          sendSse(res, 'message.delta', {
            ...meta,
            delta,
            text: delta,
            rawType: event?.type,
          });
        },
        onProgress(message, event) {
          sendSse(res, 'tool.progress', {
            ...meta,
            message,
            rawType: event?.type,
            progress: typeof event?.progress === 'number' ? event.progress : undefined,
          });
        },
        onReasoning(delta, event) {
          sendSse(res, 'reasoning.delta', {
            ...meta,
            delta,
            text: delta,
            rawType: event?.type,
          });
        },
        onToolCall(message, event) {
          sendSse(res, 'tool.call', {
            ...meta,
            message,
            rawType: event?.type,
            toolName: event?.item?.name || event?.name || '',
          });
        },
        onApproval(request) {
          sendSse(res, request?.type === 'ask_user' ? 'ask_user' : 'approval.requested', {
            ...meta,
            ...request,
          });
        },
      },
    });

    const finalResult = resultWithArtifacts(result);
    for (const artifact of result.artifacts || []) {
      sendSse(res, 'artifact.completed', {
        ...meta,
        artifact,
        result: artifactPatch(artifact),
        progress: 100,
      });
    }
    sendSse(res, 'turn.completed', {
      ...meta,
      message: 'Codex SDK 创作任务完成',
      result: finalResult,
      progress: 100,
    });
    sendSse(res, 'done', {
      ...meta,
      done: true,
      result: finalResult,
    });
    stopHeartbeat?.();
    res.end();
    return undefined;
  } catch (error) {
    const message = error?.message || CODEX_DISABLED_MESSAGE;
    const errorArtifacts = Array.isArray(error?.artifacts) ? error.artifacts : [];
    if (abortController.signal.aborted && res.writableEnded) return undefined;
    if (!res.headersSent) {
      stopHeartbeat?.();
      return res.status(500).json({
        success: false,
        code: 'codex_cli_agent_stream_failed',
        error: message,
      });
    }
    for (const artifact of errorArtifacts) {
      sendSse(res, 'artifact.completed', {
        ...meta,
        artifact,
        result: artifactPatch(artifact),
        progress: 100,
      });
    }
    sendSse(res, 'artifact.failed', {
      ...meta,
      error: message,
      message,
      progress: 100,
    });
    sendSse(res, 'turn.failed', {
      ...meta,
      error: message,
      message,
      progress: 100,
    });
    sendSse(res, 'done', {
      ...meta,
      done: true,
      error: message,
      result: {
        status: 'error',
        message,
        text: error?.partialText || '',
        reply: error?.partialText || '',
        artifacts: errorArtifacts,
        workspace: error?.workspace,
        executable: error?.executable,
        elapsedMs: error?.elapsedMs,
        ...resultWithArtifacts({ artifacts: errorArtifacts }),
      },
    });
    stopHeartbeat?.();
    if (!res.writableEnded) res.end();
    return undefined;
  }
});

module.exports = router;
