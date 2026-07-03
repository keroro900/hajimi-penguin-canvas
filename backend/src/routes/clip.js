const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('../config');
const { resolveMediaRef } = require('../providers/mediaResolver');
const { resolveBundledFfmpeg } = require('../providers/llmMedia');
const {
  createClipRenderPlan,
  normalizeClipProject,
} = require('../providers/clipProject');
const {
  buildClipCoverArgs,
  normalizeClipCoverRequest,
} = require('../providers/clipCover');
const { classifyClipError } = require('../providers/clipErrors');
const { mapWithConcurrency } = require('../providers/clipProbe');

const router = express.Router();

function safeOutputName(prefix = 'clip', ext = 'mp4') {
  const tag = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${Date.now()}_${tag}.${ext}`;
}

function resolveBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host || `127.0.0.1:${config.PORT}`;
  return `${proto}://${host}`;
}

async function resolveInputs(inputRefs, baseUrl) {
  const resolved = [];
  for (const input of inputRefs) {
    const media = await resolveMediaRef(input.url, { target: 'local-path', baseUrl });
    if (!media?.path || !fs.existsSync(media.path)) {
      throw new Error(`素材不存在：${String(input.url || '').slice(0, 120)}`);
    }
    resolved.push({ ...input, path: media.path, mime: media.mime });
  }
  return resolved;
}

function buildInputArgs(plan, resolvedInputs) {
  const args = [];
  plan.inputRefs.forEach((input, index) => {
    const file = resolvedInputs[index];
    if (!file?.path) throw new Error(`素材解析失败：${input.url}`);
    const clip = input.kind === 'audio'
      ? plan.audioClips.find((item) => item.id === input.clipId)
      : plan.visualClips.find((item) => item.id === input.clipId);
    if (input.kind === 'image') {
      args.push('-loop', '1', '-t', String(input.inputDuration || clip?.duration || 3), '-i', file.path);
      return;
    }
    if (input.kind === 'video' && clip?.trimStart) {
      args.push('-ss', String(clip.trimStart));
    }
    args.push('-i', file.path);
  });
  return args;
}

function runFfmpegRender(project, plan, resolvedInputs, outputPath) {
  const ffmpeg = resolveBundledFfmpeg();
  const args = [
    '-y',
    '-hide_banner',
    ...buildInputArgs(plan, resolvedInputs),
    '-filter_complex',
    plan.filterComplex,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-t',
    String(plan.duration),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    outputPath,
  ];
  const timeoutMs = Math.max(30_000, Math.min(30 * 60_000, Math.round(plan.duration * 20_000) + 60_000));
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`剪辑渲染超时(${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
        return;
      }
      reject(new Error(`剪辑渲染失败(${code}): ${stderr.trim().slice(-1200)}`));
    });
  });
}

function runFfmpegExtractCover(inputPath, outputPath, cover, duration) {
  const ffmpeg = resolveBundledFfmpeg();
  const args = buildClipCoverArgs(inputPath, outputPath, cover, duration);
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error('封面抽帧超时'));
    }, 60_000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
        return;
      }
      reject(new Error(`封面抽帧失败(${code}): ${stderr.trim().slice(-800)}`));
    });
  });
}

function cleanupDir(dirPath) {
  if (!dirPath) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {}
}

function parseDurationSeconds(stderr) {
  const match = String(stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000) / 1000;
}

function probeDuration(filePath) {
  const ffmpeg = resolveBundledFfmpeg();
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-i', filePath], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      resolve(0);
    }, 15_000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(0);
    });
    child.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(parseDurationSeconds(stderr));
    });
  });
}

router.post('/probe', async (req, res) => {
  try {
    const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const baseUrl = resolveBaseUrl(req);
    const probeUrls = urls
      .map((rawUrl) => String(rawUrl || '').trim())
      .filter(Boolean);
    const items = await mapWithConcurrency(probeUrls, 3, async (url) => {
      try {
        const media = await resolveMediaRef(url, { target: 'local-path', baseUrl });
        const stat = media?.path && fs.existsSync(media.path) ? fs.statSync(media.path) : null;
        return {
          url,
          duration: media?.path ? await probeDuration(media.path) : 0,
          mime: media?.mime || '',
          size: stat?.size || 0,
        };
      } catch (error) {
        const classified = classifyClipError(error);
        return {
          url,
          duration: 0,
          error: classified.message,
          code: classified.code,
          hint: classified.hint,
        };
      }
    });
    res.json({ success: true, data: { items } });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

router.post('/render', async (req, res) => {
  let lutTempDir = '';
  try {
    const project = normalizeClipProject(req.body?.project || req.body);
    if (!fs.existsSync(config.OUTPUT_DIR)) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
    lutTempDir = fs.mkdtempSync(path.join(config.OUTPUT_DIR, 'clip-lut-'));
    const plan = createClipRenderPlan(project, {
      writeLutFile: (_clip, index, lutText) => {
        const lutPath = path.join(lutTempDir, `clip_${index}.cube`);
        fs.writeFileSync(lutPath, lutText, 'utf8');
        return lutPath;
      },
    });
    const cover = normalizeClipCoverRequest(req.body?.cover, plan.duration);
    const resolvedInputs = await resolveInputs(plan.inputRefs, resolveBaseUrl(req));
    const filename = safeOutputName('clip', 'mp4');
    const outputPath = path.join(config.OUTPUT_DIR, filename);
    await runFfmpegRender(project, plan, resolvedInputs, outputPath);
    let coverFilename = '';
    let coverUrl = cover.mode === 'local' ? cover.url : '';
    if (cover.mode === 'frame') {
      coverFilename = safeOutputName('clip_cover', 'jpg');
      const coverPath = path.join(config.OUTPUT_DIR, coverFilename);
      await runFfmpegExtractCover(outputPath, coverPath, cover, plan.duration);
      coverUrl = `/files/output/${coverFilename}`;
    }
    const stat = fs.statSync(outputPath);
    res.json({
      success: true,
      data: {
        filename,
        url: `/files/output/${filename}`,
        coverFilename,
        coverUrl,
        coverTime: cover.time,
        size: stat.size,
        duration: plan.duration,
        width: project.width,
        height: project.height,
        fps: project.fps,
      },
    });
  } catch (error) {
    const classified = classifyClipError(error);
    res.status(400).json({
      success: false,
      error: classified.message,
      code: classified.code,
      hint: classified.hint,
      message: classified.message,
    });
  } finally {
    cleanupDir(lutTempDir);
  }
});

module.exports = router;
