'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawn } = require('child_process');
const config = require('../config');

const CODEX_DISABLED_MESSAGE = 'Codex CLI 不可用：请确认已安装并登录 Codex CLI，或在节点高级设置中填写可执行文件路径。';
const CODEX_WINDOWS_APPS_MESSAGE = '检测到 WindowsApps Codex 入口不可直接 spawn，请清空节点里的 Codex 路径，让 T8 自动使用 npm 的 codex.cmd，或填写 C:\\Users\\<用户名>\\AppData\\Roaming\\npm\\codex.cmd。';
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)(?:[?#].*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv)(?:[?#].*)?$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|flac|aac|opus)(?:[?#].*)?$/i;
const MODEL3D_EXT_RE = /\.(glb|gltf|obj|stl|fbx|usdz|zip)(?:[?#].*)?$/i;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeSegment(value, fallback = 'item') {
  const text = String(value || '').trim();
  const cleaned = text
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function codexWorkspaceRoot() {
  return path.join(config.DATA_DIR, 'codex-workspaces');
}

function outputCodexDir() {
  return path.join(config.OUTPUT_DIR, 'codex');
}

function assertInside(baseDir, filePath) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(filePath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('素材路径不在允许目录内');
  }
  return resolved;
}

function createCodexWorkspace(options = {}) {
  const nodeId = safeSegment(options.nodeId || 'codex-node');
  const sessionId = safeSegment(options.sessionId || `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  const explicitDir = String(options.workspaceDir || '').trim();
  const dir = explicitDir ? path.resolve(explicitDir) : path.join(codexWorkspaceRoot(), nodeId, sessionId);
  const inputDir = path.join(dir, 'inputs');
  const outputDir = path.join(dir, 'outputs');
  ensureDir(inputDir);
  ensureDir(outputDir);
  return { dir, inputDir, outputDir, nodeId, sessionId };
}

function defaultCodexExecutable() {
  return process.env.T8_CODEX_CLI_PATH || process.env.CODEX_CLI_PATH || 'codex';
}

function pathEnvValue(env = process.env) {
  return String(env.PATH || env.Path || env.path || '');
}

function pathEnvKey(env = process.env) {
  if (Object.prototype.hasOwnProperty.call(env, 'PATH')) return 'PATH';
  if (Object.prototype.hasOwnProperty.call(env, 'Path')) return 'Path';
  if (Object.prototype.hasOwnProperty.call(env, 'path')) return 'path';
  return 'PATH';
}

function uniquePush(list, value) {
  const text = String(value || '').trim();
  if (!text || list.includes(text)) return;
  list.push(text);
}

function buildCodexProcessEnv(options = {}) {
  const baseEnv = options.baseEnv || process.env;
  const env = { ...baseEnv, ...(options.env || {}) };
  const platform = options.platform || process.platform;

  if (platform === 'win32') {
    const fallbackHome = String(options.homedir || os.homedir() || env.USERPROFILE || env.HOME || '').trim();
    const userProfile = String(env.USERPROFILE || fallbackHome).trim();
    if (userProfile) {
      env.USERPROFILE = userProfile;
      if (!String(env.HOME || '').trim()) env.HOME = userProfile;
      if (!String(env.APPDATA || '').trim()) env.APPDATA = path.join(userProfile, 'AppData', 'Roaming');
      if (!String(env.LOCALAPPDATA || '').trim()) env.LOCALAPPDATA = path.join(userProfile, 'AppData', 'Local');
    }

    const pathKey = pathEnvKey(env);
    const nextPath = [];
    if (env.APPDATA) uniquePush(nextPath, path.join(env.APPDATA, 'npm'));
    if (env.USERPROFILE) uniquePush(nextPath, path.join(env.USERPROFILE, 'AppData', 'Roaming', 'npm'));
    pathEnvValue(env).split(path.delimiter).forEach((dir) => uniquePush(nextPath, dir));
    env[pathKey] = nextPath.join(path.delimiter);
    if (pathKey !== 'PATH') env.PATH = env[pathKey];
  }

  return env;
}

function isWindowsAppsPath(value) {
  return /[\\/]WindowsApps[\\/]/i.test(String(value || ''));
}

function hasPathSeparator(value) {
  return /[\\/]/.test(String(value || ''));
}

function winNeedsShell(command) {
  return /\.(cmd|bat)$/i.test(String(command || ''));
}

function codexCandidateScore(file) {
  const text = String(file || '');
  const ext = path.extname(text).toLowerCase();
  let score = 0;
  if (isWindowsAppsPath(text)) score += 80;
  if (ext === '.cmd') score += 0;
  else if (ext === '.exe') score += 4;
  else if (ext === '.bat') score += 8;
  else if (ext === '.ps1') score += 70;
  else score += 50;
  if (/[\\/]npm[\\/]codex\.cmd$/i.test(text)) score -= 10;
  return score;
}

function findCodexCandidates(command, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const raw = String(command || 'codex').trim() || 'codex';
  const candidates = [];
  if (hasPathSeparator(raw)) {
    uniquePush(candidates, raw);
    if (platform === 'win32' && !path.extname(raw)) {
      ['.cmd', '.exe', '.bat'].forEach((ext) => uniquePush(candidates, `${raw}${ext}`));
    }
    return candidates.filter((file) => fs.existsSync(file));
  }

  const dirs = [];
  if (platform === 'win32') {
    const appData = String(env.APPDATA || '').trim();
    const userProfile = String(env.USERPROFILE || '').trim();
    if (appData) uniquePush(dirs, path.join(appData, 'npm'));
    if (userProfile) uniquePush(dirs, path.join(userProfile, 'AppData', 'Roaming', 'npm'));
  }
  pathEnvValue(env).split(path.delimiter).forEach((dir) => uniquePush(dirs, dir));

  const names = platform === 'win32'
    ? [`${raw}.cmd`, `${raw}.exe`, `${raw}.bat`, raw, `${raw}.ps1`]
    : [raw];
  for (const dir of dirs) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) uniquePush(candidates, file);
    }
  }
  return candidates.sort((a, b) => codexCandidateScore(a) - codexCandidateScore(b));
}

function resolveCodexExecutable(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const requested = String(options.executablePath || defaultCodexExecutable()).trim() || 'codex';
  const candidates = findCodexCandidates(requested, { env, platform });
  const command = candidates[0] || requested;
  return {
    requested,
    command,
    executable: command,
    shell: platform === 'win32' && winNeedsShell(command),
    resolved: candidates.length > 0,
    fromWindowsApps: isWindowsAppsPath(command),
    candidates,
  };
}

function spawnCodexProcess(args, options = {}) {
  const env = buildCodexProcessEnv(options);
  const resolved = resolveCodexExecutable({
    executablePath: options.executablePath,
    env,
    platform: options.platform,
  });
  const child = spawn(resolved.command, args, {
    cwd: options.cwd || config.BASE_DIR,
    shell: resolved.shell,
    windowsHide: true,
    detached: Boolean(options.detached),
    stdio: options.stdio || ['pipe', 'pipe', 'pipe'],
    env,
  });
  child.__codexResolved = resolved;
  return child;
}

function runCodexCommand(args, options = {}) {
  return new Promise((resolve) => {
    let child;
    const startedAt = Date.now();
    const done = (patch) => {
      if (!child || !child.__codexDone) {
        if (child) child.__codexDone = true;
        resolve({
          code: null,
          stdout: '',
          stderr: '',
          elapsedMs: Date.now() - startedAt,
          ...(patch || {}),
        });
      }
    };
    try {
      child = spawnCodexProcess(args, options);
    } catch (error) {
      const resolved = resolveCodexExecutable({
        executablePath: options.executablePath,
        env: buildCodexProcessEnv(options),
        platform: options.platform,
      });
      done({
        code: null,
        error,
        executable: resolved.executable,
        resolved,
        message: error?.message || String(error),
      });
      return;
    }
    if (child.stdin) child.stdin.end();
    const resolved = child.__codexResolved;
    let stdout = '';
    let stderr = '';
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      done({
        code: null,
        stdout,
        stderr,
        executable: resolved.executable,
        resolved,
        message: 'Codex CLI 命令超时',
      });
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      done({
        code: null,
        stdout,
        stderr,
        error,
        executable: resolved.executable,
        resolved,
        message: error?.message || String(error),
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({
        code,
        stdout,
        stderr,
        executable: resolved.executable,
        resolved,
        elapsedMs: Date.now() - startedAt,
      });
    });
  });
}

function codexUnavailableMessage(result, fallback = '') {
  const message = String(fallback || result?.message || result?.stderr || result?.stdout || '').trim();
  const configMessage = codexConfigErrorMessage(message);
  if (configMessage) return configMessage;
  const windowsApps = result?.resolved?.fromWindowsApps || isWindowsAppsPath(result?.executable) || /WindowsApps|spawn EPERM/i.test(message);
  const detail = windowsApps ? CODEX_WINDOWS_APPS_MESSAGE : message;
  return `${CODEX_DISABLED_MESSAGE} ${detail || ''}`.trim();
}

function codexConfigErrorMessage(message = '') {
  const text = String(message || '');
  if (!/Error loading configuration|unknown variant/i.test(text)) return '';
  if (/service_tier|expected `fast` or `flex`|expected 'fast' or 'flex'|unknown variant `default`|unknown variant 'default'/i.test(text)) {
    const file = text.match(/[A-Z]:\\[^\r\n:]+config\.toml/i)?.[0] || '~/.codex/config.toml';
    return `${CODEX_DISABLED_MESSAGE} Codex 配置文件 ${file} 里 service_tier 不能是 "default"；Codex CLI 0.130.0 只接受 "fast" 或 "flex"，也可以删除这一行使用默认行为。`;
  }
  return `${CODEX_DISABLED_MESSAGE} Codex 配置文件读取失败：${text}`;
}

function parseCodexFeatureList(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 3) return null;
      const enabledText = parts[parts.length - 1];
      const name = parts[0];
      const stage = parts.slice(1, -1).join(' ');
      if (!/^[a-z0-9_/-]+$/i.test(name)) return null;
      return {
        name,
        stage,
        enabled: /^true$/i.test(enabledText),
      };
    })
    .filter(Boolean);
}

async function listCodexFeatures(options = {}) {
  const result = await runCodexCommand(['features', 'list'], {
    executablePath: options.executablePath,
    env: options.env,
    platform: options.platform,
    timeoutMs: options.timeoutMs || 12000,
  });
  if (result.code !== 0) return [];
  return parseCodexFeatureList(result.stdout);
}

function buildCodexLoginStartInvocation(options = {}) {
  const resolved = resolveCodexExecutable(options);
  const args = options.deviceAuth ? ['login', '--device-auth'] : ['login'];
  return {
    ...resolved,
    args,
    commandText: formatCodexCommandForDisplay(resolved.executable, args),
  };
}

function quoteCmdArg(value) {
  const text = String(value || '');
  return `"${text.replace(/"/g, '""')}"`;
}

function formatCodexCommandForDisplay(executable, args = []) {
  const exe = String(executable || 'codex').trim() || 'codex';
  const renderedExe = /\s/.test(exe) ? quoteCmdArg(exe) : exe;
  return [renderedExe, ...args.map((arg) => {
    const text = String(arg || '');
    return /\s/.test(text) ? quoteCmdArg(text) : text;
  })].join(' ');
}

function escapeCmdEchoText(value) {
  return String(value || '').replace(/([&<>|^])/g, '^$1').replace(/%/g, '%%');
}

function writeCodexLoginCmdScript(invocation) {
  const dir = path.join(config.DATA_DIR, 'codex-login');
  ensureDir(dir);
  const filePath = path.join(dir, 'open-codex-login.cmd');
  const commandLine = formatCodexCommandForDisplay(invocation.executable || invocation.command || 'codex', invocation.args);
  const content = [
    '@echo off',
    'chcp 65001 > nul',
    'title T8 Codex CLI 登录',
    'echo.',
    'echo T8 Codex CLI 登录流程',
    'echo ------------------------------------------------------------',
    'echo 1. 如果浏览器打开 OpenAI/Codex 授权页，请在浏览器完成登录。',
    'echo 2. 如果终端显示验证码或确认链接，请按终端提示完成授权。',
    'echo 3. 登录完成后回到画布，点击 Codex 节点里的“刷新”。',
    'echo.',
    `echo 即将执行: ${escapeCmdEchoText(commandLine)}`,
    'echo.',
    commandLine,
    'set T8_CODEX_LOGIN_EXIT=%ERRORLEVEL%',
    'echo.',
    'if "%T8_CODEX_LOGIN_EXIT%"=="0" (',
    '  echo Codex 登录命令已结束。请回到画布点击“刷新”。',
    ') else (',
    '  echo Codex 登录命令返回错误码 %T8_CODEX_LOGIN_EXIT%。',
    '  echo 如果这里没有打开浏览器，请复制节点里的 codex login 命令，在普通 CMD 或 PowerShell 中手动运行。',
    ')',
    'echo.',
    'pause',
    '',
  ].join('\r\n');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function startCodexLoginInVisibleTerminal(invocation, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') return null;
  const scriptPath = writeCodexLoginCmdScript(invocation);
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `start "" ${quoteCmdArg(scriptPath)}`], {
    cwd: config.BASE_DIR,
    windowsHide: false,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return {
    started: true,
    mode: 'visible-terminal',
    executable: invocation.executable,
    command: invocation.commandText,
    scriptPath,
    message: '已打开可见的 Codex 登录窗口；请在新窗口或浏览器完成登录，完成后回到节点点击刷新。',
  };
}

function startCodexLogin(options = {}) {
  const invocation = buildCodexLoginStartInvocation(options);
  try {
    const visible = startCodexLoginInVisibleTerminal(invocation, options);
    if (visible) return visible;
    const child = spawnCodexProcess(invocation.args, {
      executablePath: options.executablePath,
      cwd: config.BASE_DIR,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return {
      started: true,
      executable: child.__codexResolved?.executable || invocation.executable,
      command: invocation.commandText,
      mode: 'background',
      message: '已打开 Codex CLI 登录流程；完成浏览器登录后回到节点点刷新。若没有任何窗口，请复制 codex login 命令到终端手动运行。',
    };
  } catch (error) {
    return {
      started: false,
      executable: invocation.executable,
      command: invocation.commandText,
      message: `${CODEX_DISABLED_MESSAGE} ${error?.message || error}`,
    };
  }
}

function normalizeAvailableFeatureNames(value) {
  const names = new Set();
  if (!Array.isArray(value)) return names;
  for (const item of value) {
    if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'enabled') && item.enabled !== true) {
      continue;
    }
    const name = typeof item === 'string' ? item : item?.name;
    const text = String(name || '').trim();
    if (text) names.add(text);
  }
  return names;
}

function resolveCanvasFileUrlToPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const clean = text.split('?')[0].split('#')[0];
  const mounts = [
    { prefix: '/files/input/', dir: config.INPUT_DIR },
    { prefix: '/input/', dir: config.INPUT_DIR },
    { prefix: '/files/output/', dir: config.OUTPUT_DIR },
    { prefix: '/output/', dir: config.OUTPUT_DIR },
  ];
  const mount = mounts.find((item) => clean.startsWith(item.prefix));
  if (!mount) return '';
  const rel = decodeURIComponent(clean.slice(mount.prefix.length));
  const resolved = assertInside(mount.dir, path.join(mount.dir, rel));
  return fs.existsSync(resolved) ? resolved : '';
}

function writeDataImageToWorkspace(value, workspace) {
  const text = String(value || '').trim();
  const match = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/i.exec(text);
  if (!match) return '';
  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  ensureDir(workspace.inputDir);
  const filePath = path.join(workspace.inputDir, `reference-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`);
  fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
  return filePath;
}

function resolveCodexInputImages(images, workspace) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(images) ? images : []) {
    const text = String(raw || '').trim();
    if (!text) continue;
    let resolved = resolveCanvasFileUrlToPath(text);
    if (!resolved && /^data:image\//i.test(text)) resolved = writeDataImageToWorkspace(text, workspace);
    if (!resolved && /^[a-z]+:\/\//i.test(text)) resolved = text;
    if (!resolved && fs.existsSync(text)) resolved = path.resolve(text);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

function parseCodexJsonLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { type: 'raw', text };
  }
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((item) => !isReasoningContent(item))
      .map((item) => contentText(item))
      .filter(Boolean)
      .join('');
  }
  if (content && typeof content === 'object') {
    if (isReasoningContent(content)) return '';
    return content.text || content.delta || content.output_text || content.content || '';
  }
  return '';
}

function reasoningContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => reasoningContentText(item))
      .filter(Boolean)
      .join('');
  }
  if (content && typeof content === 'object') {
    return content.text || content.delta || content.summary_text || content.reasoning_text || content.content || '';
  }
  return '';
}

function isReasoningContent(value) {
  if (!value || typeof value !== 'object') return false;
  const type = String(value.type || value.kind || '').toLowerCase();
  const role = String(value.role || '').toLowerCase();
  return role === 'reasoning' || /reasoning|thought|thinking|scratchpad/.test(type);
}

function extractReasoningDelta(event) {
  if (!event || typeof event !== 'object') return '';
  const candidate = event.item || event.message || event;
  if (!isReasoningContent(candidate) && !isReasoningContent(event) && !isReasoningContent(event.delta)) return '';
  const text = reasoningContentText(
    candidate.summary ||
    candidate.content ||
    candidate.text ||
    event.summary ||
    event.delta ||
    event.text ||
    '',
  );
  return String(text || '').trim();
}

function extractToolProgress(event) {
  if (!event || typeof event !== 'object') return '';
  const item = event.item || event.tool || event;
  const type = String(item.type || event.type || '').toLowerCase();
  const name = String(item.name || item.tool_name || item.server_tool_name || item.function?.name || '').trim();
  if (!name) return '';
  if (/tool|function|mcp/.test(type)) return `调用工具：${name}`;
  return '';
}

function isCodexInfrastructureNoiseLine(line) {
  const text = String(line || '').trim();
  if (!text) return true;
  if (/^SUCCESS:\s+The process with PID \d+(?: \(child process of PID \d+\))? has been terminated\.$/i.test(text)) return true;
  if (/^ERROR:\s+The process "?\d+"? not found\.$/i.test(text)) return true;
  if (/\bWARN\b\s+codex_core/i.test(text)) return true;
  if (/\bWARN\b\s+codex_mcp::rmcp_client: failed to initialize MCP client during shutdown/i.test(text)) return true;
  if (/\bWARN\b\s+codex_rollout::recorder: failed to send rollout shutdown command/i.test(text)) return true;
  if (/failed to shutdown thread persistence: thread-store internal error/i.test(text)) return true;
  if (/^Reading prompt from stdin/i.test(text)) return true;
  return false;
}

function isCodexInfrastructureNoise(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every(isCodexInfrastructureNoiseLine);
}

function extractTextDelta(event) {
  if (!event || typeof event !== 'object') return '';
  if (isReasoningContent(event) || isReasoningContent(event.item) || isReasoningContent(event.message)) return '';
  if (typeof event.delta === 'string') return event.delta;
  if (typeof event.text_delta === 'string') return event.text_delta;
  if (typeof event.output_text_delta === 'string') return event.output_text_delta;
  if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') return event.delta;
  if (event.type === 'message.delta' && typeof event.text === 'string') return event.text;
  if (event.type === 'raw' && typeof event.text === 'string') {
    return isCodexInfrastructureNoise(event.text) ? '' : event.text + '\n';
  }
  const choice = event.choices && event.choices[0];
  if (choice?.delta?.content) return String(choice.delta.content);
  if (choice?.text) return String(choice.text);
  if (event.item && (event.item.role === 'assistant' || event.item.type === 'agent_message' || event.item.type === 'message')) {
    return contentText(event.item.content || event.item.message || event.item.text);
  }
  if (event.message && event.message.role === 'assistant') {
    return contentText(event.message.content || event.message.text);
  }
  return '';
}

function shouldForwardCodexStderr(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  return lines.some((line) => !isCodexInfrastructureNoiseLine(line));
}

function shouldForwardCodexProgress(message, event = {}) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (/^(thread|turn|item)\.(started|completed)$/i.test(text)) return false;
  if (/^Reading prompt from stdin/i.test(text)) return false;
  if (event?.type === 'feature.skipped' && event?.feature === 'plan_tool') return false;
  return true;
}

function kindFromUrl(url) {
  const text = String(url || '');
  if (IMAGE_EXT_RE.test(text) || /^data:image\//i.test(text)) return 'image';
  if (VIDEO_EXT_RE.test(text) || /^data:video\//i.test(text)) return 'video';
  if (AUDIO_EXT_RE.test(text) || /^data:audio\//i.test(text)) return 'audio';
  if (MODEL3D_EXT_RE.test(text)) return 'model3d';
  return '';
}

function cleanArtifactCandidateUrl(value) {
  return String(value || '')
    .trim()
    .replace(/^<(.+)>$/s, '$1')
    .replace(/^['"](.+)['"]$/s, '$1')
    .replace(/[.,;，。；]+$/g, '')
    .trim();
}

function extractArtifactsFromText(text) {
  const seen = new Set();
  const out = [];
  const source = String(text || '');
  const candidates = [];
  const mdRe = /!\[[^\]]*]\(\s*(?:<([^>]+)>|([^)\s]+))\s*\)|\[[^\]]+]\(\s*(?:<([^>]+)>|([^)\s]+))\s*\)/g;
  let match;
  while ((match = mdRe.exec(source))) candidates.push(match[1] || match[2] || match[3] || match[4]);
  const looseRe = /https?:\/\/[^\s"'<>),，。；]+|\/files\/(?:input|output)\/[^\s"'<>),，。；]+|[A-Za-z]:[\\/][^\s"'<>),，。；]+|\.{1,2}\/[^\s"'<>),，。；]+/g;
  while ((match = looseRe.exec(source))) candidates.push(match[0]);
  const relativePathRe = /(?:[\w.-]+[\\/])+(?:[\w .()[\]-]+)\.(?:png|jpe?g|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v|mkv|mp3|wav|ogg|m4a|flac|aac|opus|glb|gltf|obj|stl|fbx|usdz|zip)(?:[?#][^\s"'<>),，。；]+)?/gi;
  while ((match = relativePathRe.exec(source))) {
    const before = source[match.index - 1] || '';
    if (before === '/' || before === '\\' || before === ':') continue;
    candidates.push(match[0]);
  }

  for (const candidate of candidates) {
    const url = cleanArtifactCandidateUrl(candidate);
    const kind = kindFromUrl(url);
    if (!kind) continue;
    const key = `${kind}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `codex-artifact-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}`,
      kind,
      url,
      urls: [url],
      title: path.basename(url.split(/[?#]/)[0]) || `${kind} artifact`,
      status: 'completed',
      progress: 100,
    });
  }
  return out;
}

function normalizeArtifactUrl(filePathOrUrl, baseDir = '', cache) {
  const text = String(filePathOrUrl || '').trim();
  if (!text) return '';
  if (text.startsWith('/files/')) return text;
  if (/^https?:\/\//i.test(text) || /^data:/i.test(text)) return text;
  const abs = path.isAbsolute(text) ? text : path.resolve(baseDir || process.cwd(), text);
  if (!fs.existsSync(abs)) return text;
  if (cache?.has(abs)) return cache.get(abs);
  ensureDir(outputCodexDir());
  const suffix = crypto.randomBytes(4).toString('hex');
  const ext = path.extname(abs) || '.bin';
  const filename = `codex_${Date.now()}_${suffix}${ext}`;
  const target = path.join(outputCodexDir(), filename);
  fs.copyFileSync(abs, target);
  const url = `/files/output/codex/${filename}`;
  if (cache) cache.set(abs, url);
  return url;
}

function extractArtifactsFromWorkspace(workspace, cache, options = {}) {
  const dirs = [workspace?.outputDir, workspace?.dir].filter(Boolean);
  const out = [];
  const seen = new Set();
  const createdAfterMs = Number(options.createdAfterMs || 0);
  const visit = (dir, depth = 0) => {
    if (!dir || depth > 3 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.agents', '.codex'].includes(entry.name)) visit(full, depth + 1);
        continue;
      }
      const kind = kindFromUrl(full);
      if (!kind) continue;
      const stat = fs.statSync(full);
      if (createdAfterMs > 0 && stat.mtimeMs + 1000 < createdAfterMs) continue;
      const url = normalizeArtifactUrl(full, '', cache);
      const key = `${kind}:${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `codex-file-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}`,
        kind,
        url,
        urls: [url],
        title: entry.name,
        status: 'completed',
        progress: 100,
      });
    }
  };
  dirs.forEach((dir) => visit(dir, 0));
  return out;
}

function dedupeArtifacts(artifacts) {
  const seen = new Set();
  const out = [];
  for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
    const key = `${artifact.kind || ''}:${artifact.url || (artifact.urls || []).join('|') || artifact.text || artifact.title || ''}`;
    if (seen.has(key)) {
      const existingIndex = out.findIndex((item) => {
        const existingKey = `${item.kind || ''}:${item.url || (item.urls || []).join('|') || item.text || item.title || ''}`;
        return existingKey === key;
      });
      if (existingIndex >= 0) out.splice(existingIndex, 1);
    }
    seen.add(key);
    out.push(artifact);
  }
  return out;
}

function collectCodexRunArtifacts(fullText, workspace, startedAt) {
  const artifactUrlCache = new Map();
  const artifactsByText = extractArtifactsFromText(fullText).map((item) => ({
    ...item,
    url: normalizeArtifactUrl(item.url, workspace.dir, artifactUrlCache),
    urls: (item.urls || []).map((url) => normalizeArtifactUrl(url, workspace.dir, artifactUrlCache)),
  }));
  const artifactsByWorkspace = extractArtifactsFromWorkspace(workspace, artifactUrlCache, { createdAfterMs: startedAt });
  return artifactsByText.length
    ? dedupeArtifacts(artifactsByText)
    : dedupeArtifacts(artifactsByWorkspace);
}

function parseFrontmatter(raw) {
  const text = String(raw || '');
  const data = {};
  if (!text.startsWith('---')) return data;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return data;
  const body = text.slice(3, end).split(/\r?\n/);
  for (const line of body) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*["']?(.+?)["']?\s*$/);
    if (m) data[m[1]] = m[2];
  }
  return data;
}

function skillSummaryFromMarkdown(raw) {
  const text = String(raw || '');
  const front = parseFrontmatter(text);
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstParagraph = text
    .replace(/^---[\s\S]*?\n---/, '')
    .split(/\r?\n\r?\n/)
    .map((part) => part.replace(/^#+\s*/gm, '').trim())
    .find(Boolean);
  return {
    name: front.name || heading || '',
    description: front.description || firstParagraph || '',
    category: front.category || '',
  };
}

function skillBodyFromMarkdown(raw) {
  let text = String(raw || '').replace(/^---[\s\S]*?\n---/, '').trimStart();
  text = text.replace(/^#\s+.+(?:\r?\n)+/, '').trimStart();
  return text.trim();
}

function cleanMarkdownInline(value) {
  return String(value || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

function normalizeSkillDirection(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const label = cleanMarkdownInline(raw.label || raw.title || raw.name);
  if (!label) return null;
  const id = safeSegment(raw.id || raw.key || label, `direction-${index + 1}`).toLowerCase();
  const hint = cleanMarkdownInline(raw.hint || raw.description || raw.text || '');
  return {
    id,
    label: label.slice(0, 24),
    hint: hint.slice(0, 90),
  };
}

function normalizeSkillQuestion(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const label = cleanMarkdownInline(raw.label || raw.question || raw.title || raw.name);
  if (!label) return null;
  const id = safeSegment(raw.id || raw.key || label, `question-${index + 1}`).toLowerCase();
  const options = Array.isArray(raw.options)
    ? raw.options.map((item) => cleanMarkdownInline(item)).filter(Boolean).slice(0, 6)
    : [];
  const recommended = cleanMarkdownInline(raw.recommended || raw.default || '');
  return {
    id,
    label: label.slice(0, 80),
    options,
    recommended: recommended.slice(0, 40),
  };
}

function normalizeSkillCanvasTemplate(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const label = cleanMarkdownInline(raw.label || raw.title || raw.name);
  if (!label) return null;
  const id = safeSegment(raw.id || raw.key || label, `template-${index + 1}`).toLowerCase();
  const flow = cleanMarkdownInline(raw.flow || raw.template || raw.description || raw.text || '');
  return {
    id,
    label: label.slice(0, 60),
    flow: flow.slice(0, 180),
  };
}

function normalizeSkillVerificationItem(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const label = cleanMarkdownInline(raw.label || raw.title || raw.name);
  if (!label) return null;
  const id = safeSegment(raw.id || raw.key || label, `verification-${index + 1}`).toLowerCase();
  const hint = cleanMarkdownInline(raw.hint || raw.description || raw.text || '');
  return {
    id,
    label: label.slice(0, 80),
    hint: hint.slice(0, 140),
  };
}

function sectionTitleMatches(title, kind) {
  const text = String(title || '').trim();
  if (kind === 'directions') return /^(sidebar\s+directions?|侧栏方向|技能方向)$/i.test(text);
  if (kind === 'questions') return /^(sidebar\s+questions?|侧栏问题|可问问题|ask\s+questions?)$/i.test(text);
  if (kind === 'templates') return /^(sidebar\s+canvas\s+templates?|sidebar\s+templates?|画布模板|侧栏画布模板)$/i.test(text);
  if (kind === 'verification') return /^(sidebar\s+verification|sidebar\s+verification\s+items?|验证项|侧栏验证)$/i.test(text);
  return false;
}

function parseSkillSection(raw, kind, normalizeItem, limit = 8) {
  const text = String(raw || '');
  const lines = text.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const title = heading[2].trim();
      if (sectionTitleMatches(title, kind)) {
        inSection = true;
        continue;
      }
      if (inSection && heading[1].length <= 2) break;
    }
    if (!inSection) continue;
    const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (!bullet) continue;
    const parts = bullet[1].split('|').map((part) => cleanMarkdownInline(part));
    if (parts.length >= 2) {
      let item = null;
      if (kind === 'directions') {
        item = normalizeItem({ id: parts[0], label: parts[1], hint: parts.slice(2).join(' | ') }, out.length);
      } else if (kind === 'questions') {
        const options = parts[2]
          ? parts[2].split(/\s*\/\s*|\s*,\s*|\s*，\s*/).map((part) => cleanMarkdownInline(part)).filter(Boolean)
          : [];
        item = normalizeItem({ id: parts[0], label: parts[1], options, recommended: parts[3] || '' }, out.length);
      } else if (kind === 'templates') {
        item = normalizeItem({ id: parts[0], label: parts[1], flow: parts.slice(2).join(' | ') }, out.length);
      } else if (kind === 'verification') {
        item = normalizeItem({ id: parts[0], label: parts[1], hint: parts.slice(2).join(' | ') }, out.length);
      }
      if (item) out.push(item);
      continue;
    }
    const colon = /^([^:：]+)[:：]\s*(.+)$/.exec(cleanMarkdownInline(bullet[1]));
    const item = colon
      ? normalizeItem({ label: colon[1], hint: colon[2], text: colon[2], flow: colon[2] }, out.length)
      : normalizeItem({ label: bullet[1] }, out.length);
    if (item) out.push(item);
  }
  return out.slice(0, limit);
}

function parseSkillDirections(raw) {
  return parseSkillSection(raw, 'directions', normalizeSkillDirection, 8);
}

function parseSkillQuestions(raw) {
  return parseSkillSection(raw, 'questions', normalizeSkillQuestion, 8);
}

function parseSkillCanvasTemplates(raw) {
  return parseSkillSection(raw, 'templates', normalizeSkillCanvasTemplate, 8);
}

function parseSkillVerification(raw) {
  return parseSkillSection(raw, 'verification', normalizeSkillVerificationItem, 12);
}

function collectPluginSkillRoots(codexHome) {
  const bases = [
    path.join(codexHome, 'plugins', 'cache'),
    path.join(codexHome, '.tmp', 'plugins'),
  ];
  const roots = [];
  const visit = (dir, depth = 0) => {
    if (!dir || depth > 7 || !fs.existsSync(dir)) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (['node_modules', '.git', 'tmp', 'temp'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'skills') {
        uniquePush(roots, full);
        continue;
      }
      visit(full, depth + 1);
    }
  };
  bases.forEach((base) => visit(base, 0));
  return roots;
}

function defaultSkillRoots(workspaceDir, env = process.env) {
  const roots = [];
  const home = String(env.USERPROFILE || env.HOME || os.homedir()).trim() || os.homedir();
  const envHome = String(env.CODEX_HOME || path.join(home, '.codex')).trim();
  uniquePush(roots, path.join(envHome, 'skills'));
  uniquePush(roots, path.join(envHome, 'skills', '.system'));
  for (const root of collectPluginSkillRoots(envHome)) uniquePush(roots, root);
  uniquePush(roots, path.join(home, '.agents', 'skills'));
  uniquePush(roots, path.join(config.BASE_DIR, 'skills'));
  uniquePush(roots, path.join(config.BASE_DIR, '.agents', 'skills'));
  if (workspaceDir) uniquePush(roots, path.join(workspaceDir, '.agents', 'skills'));
  return roots;
}

function isProjectSkillRoot(root, workspaceDir) {
  const resolved = path.resolve(root);
  const workspaceRoot = workspaceDir ? path.resolve(workspaceDir) : '';
  const bundledRoot = path.resolve(config.BASE_DIR, 'skills');
  const localAgentRoot = path.resolve(config.BASE_DIR, '.agents', 'skills');
  return Boolean(
    (workspaceRoot && (resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep))) ||
    resolved === bundledRoot ||
    resolved.startsWith(bundledRoot + path.sep) ||
    resolved === localAgentRoot ||
    resolved.startsWith(localAgentRoot + path.sep),
  );
}

function listCodexSkills(options = {}) {
  const workspaceDir = options.workspaceDir || '';
  const env = options.env || process.env;
  const roots = Array.isArray(options.roots) && options.roots.length > 0
    ? [...options.roots, ...(workspaceDir ? [path.join(workspaceDir, '.agents', 'skills')] : [])]
    : defaultSkillRoots(workspaceDir, env);
  const out = [];
  const seen = new Set();

  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    const scope = isProjectSkillRoot(root, workspaceDir) ? 'project' : 'global';
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(root, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const raw = fs.readFileSync(skillPath, 'utf8');
      const front = parseFrontmatter(raw);
      const summary = skillSummaryFromMarkdown(raw);
      const name = safeSegment(front.name || entry.name, entry.name);
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({
        id: `${scope}:${name}`,
        name,
        description: String(summary.description || '').replace(/\s+/g, ' ').slice(0, 240),
        category: String(summary.category || '').trim(),
        directions: parseSkillDirections(raw),
        questions: parseSkillQuestions(raw),
        templates: parseSkillCanvasTemplates(raw),
        verification: parseSkillVerification(raw),
        body: scope === 'project' ? skillBodyFromMarkdown(raw) : undefined,
        scope,
        path: skillPath,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function projectSkillDir(workspaceDir, name) {
  const workspaceRoot = path.resolve(workspaceDir || '');
  const safeName = safeSegment(name, 'creator-skill');
  const dir = path.resolve(path.join(workspaceRoot, '.agents', 'skills', safeName));
  if (!workspaceRoot || !dir.startsWith(workspaceRoot)) throw new Error('Skill 路径越界');
  return { workspaceRoot, safeName, dir, skillPath: path.join(dir, 'SKILL.md') };
}

function createProjectSkill(options = {}) {
  const workspaceDir = path.resolve(options.workspaceDir || createCodexWorkspace(options).dir);
  const rawName = String(options.name || '').trim();
  const name = safeSegment(rawName, 'creator-skill');
  const title = String(options.title || rawName || name).trim();
  const description = String(options.description || '创作者自定义 Codex Skill。').trim();
  const category = String(options.category || '未分类').trim() || '未分类';
  const body = String(options.body || '').trim();
  const { dir, skillPath } = projectSkillDir(workspaceDir, name);
  ensureDir(dir);
  const content = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    `category: ${category}`,
    '---',
    '',
    `# ${title}`,
    '',
    body || [
      '## 用途',
      description,
      '',
      '## 工作方式',
      '- 先理解创作目标、平台、受众和参考素材。',
      '- 输出可直接复制到图像/视频模型的提示词。',
      '- 给出 2-4 个风格变体和明确的二次修改建议。',
    ].join('\n'),
    '',
  ].join('\n');
  fs.writeFileSync(skillPath, content, 'utf8');
  return {
    id: `project:${name}`,
    name,
    title,
    description,
    category,
    directions: parseSkillDirections(content),
    questions: parseSkillQuestions(content),
    templates: parseSkillCanvasTemplates(content),
    verification: parseSkillVerification(content),
    body: body || [
      '## 用途',
      description,
      '',
      '## 工作方式',
      '- 先理解创作目标、平台、受众和参考素材。',
      '- 输出可直接复制到图像/视频模型的提示词。',
      '- 给出 2-4 个风格变体和明确的二次修改建议。',
    ].join('\n'),
    scope: 'project',
    path: skillPath,
  };
}

function updateProjectSkill(options = {}) {
  const workspaceDir = path.resolve(options.workspaceDir || '');
  const oldName = safeSegment(options.oldName || options.name, 'creator-skill');
  const nextName = safeSegment(options.name || oldName, oldName);
  const oldSkill = projectSkillDir(workspaceDir, oldName);
  const nextSkill = projectSkillDir(workspaceDir, nextName);
  if (!fs.existsSync(oldSkill.skillPath)) throw new Error(`项目 Skill 不存在：${oldName}`);
  if (oldName !== nextName && fs.existsSync(nextSkill.dir)) throw new Error(`项目 Skill 已存在：${nextName}`);
  const skill = createProjectSkill({
    ...options,
    workspaceDir,
    name: nextName,
  });
  if (oldName !== nextName && fs.existsSync(oldSkill.dir)) {
    fs.rmSync(oldSkill.dir, { recursive: true, force: true });
  }
  return skill;
}

function parseZipEntries(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const entries = [];
  let offset = 0;
  while (offset + 30 <= data.length) {
    const signature = data.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const flags = data.readUInt16LE(offset + 6);
    const method = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const fileNameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (flags & 0x08) throw new Error('暂不支持带 data descriptor 的 zip Skill 包');
    if (nameEnd > data.length || dataEnd > data.length) throw new Error('zip Skill 包结构不完整');
    const rawName = data.slice(nameStart, nameEnd).toString('utf8').replace(/\\/g, '/');
    const payload = data.slice(dataStart, dataEnd);
    let content;
    if (method === 0) {
      content = payload;
    } else if (method === 8) {
      content = zlib.inflateRawSync(payload);
    } else {
      throw new Error(`暂不支持 zip 压缩方式：${method}`);
    }
    entries.push({ path: rawName, content });
    offset = dataEnd;
  }
  return entries;
}

function normalizeArchiveEntries(entries) {
  const files = entries
    .map((entry) => ({
      path: normalizeSkillFilePath(entry.path),
      content: entry.content,
    }))
    .filter((entry) => entry.path && !entry.path.endsWith('/'));
  if (files.some((entry) => entry.path === 'SKILL.md')) return files;
  const roots = new Set(files.map((entry) => entry.path.split('/')[0]).filter(Boolean));
  if (roots.size === 1) {
    const [root] = [...roots];
    const stripped = files.map((entry) => ({
      ...entry,
      path: entry.path.startsWith(`${root}/`) ? entry.path.slice(root.length + 1) : entry.path,
    }));
    if (stripped.some((entry) => entry.path === 'SKILL.md')) return stripped;
  }
  return files;
}

function skillNameFromArchive(filename, skillContent, fallback = 'imported-skill') {
  const front = parseFrontmatter(String(skillContent || ''));
  const fileBase = String(filename || '').replace(/\.[^.]+$/, '');
  return safeSegment(front.name || fileBase || fallback, fallback);
}

function importProjectSkillArchive(options = {}) {
  const workspaceDir = path.resolve(options.workspaceDir || createCodexWorkspace(options).dir);
  const archiveBuffer = Buffer.isBuffer(options.archive)
    ? options.archive
    : Buffer.from(String(options.archiveBase64 || ''), 'base64');
  if (!archiveBuffer.length) throw new Error('Skill zip 内容为空');
  const entries = normalizeArchiveEntries(parseZipEntries(archiveBuffer));
  const skillEntry = entries.find((entry) => entry.path === 'SKILL.md');
  if (!skillEntry) throw new Error('Skill zip 必须包含 SKILL.md');
  const name = safeSegment(options.name || skillNameFromArchive(options.filename, skillEntry.content), 'imported-skill');
  const { dir, skillPath } = projectSkillDir(workspaceDir, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  for (const entry of entries) {
    const destination = assertInside(dir, path.join(dir, entry.path));
    ensureDir(path.dirname(destination));
    fs.writeFileSync(destination, entry.content);
  }
  const raw = fs.readFileSync(skillPath, 'utf8');
  const front = parseFrontmatter(raw);
  const summary = skillSummaryFromMarkdown(raw);
  return {
    id: `project:${name}`,
    name,
    title: String(front.title || summary.title || name),
    description: String(summary.description || front.description || '').replace(/\s+/g, ' ').slice(0, 240),
    category: String(summary.category || front.category || 'imported').trim(),
    directions: parseSkillDirections(raw),
    questions: parseSkillQuestions(raw),
    templates: parseSkillCanvasTemplates(raw),
    verification: parseSkillVerification(raw),
    body: skillBodyFromMarkdown(raw),
    scope: 'project',
    path: skillPath,
  };
}

function hasSkillSection(raw, title) {
  return new RegExp(`^##\\s+${title}\\s*$`, 'im').test(String(raw || ''));
}

function sidebarAdaptationLines(raw) {
  const text = String(raw || '');
  const lower = text.toLowerCase();
  const isApparel = /apparel|clothing|garment|fashion|print|童装|服装|印花|版型/.test(lower);
  const isVideo = /video|storyboard|motion|shot|视频|分镜|镜头/.test(lower);
  const isImage = /image|visual|prompt|生图|图像|提示词/.test(lower);
  const directions = isApparel
    ? [
      '- `source-analysis` | 素材分析 | 先识别印花、服装、受众和限制。',
      '- `variant-plan` | 变体规划 | 拆出版型、配色、位置和画面变量。',
      '- `review` | 复核优化 | 检查可售性、工艺和视觉一致性。',
    ]
    : isVideo
      ? [
        '- `storyboard` | 分镜规划 | 整理关键帧、镜头和节奏。',
        '- `motion` | 运动设计 | 定义运镜、动作和时长。',
        '- `verify-video` | 视频复核 | 检查视频节点参数、结果和 lineage。',
      ]
      : isImage
        ? [
          '- `prompt-node` | 生图节点 | 把提示词和参考图写入 image 节点。',
          '- `variant-nodes` | 变体节点 | 一版一变量，方便比较和重跑。',
          '- `quality-check` | 结果质检 | 核对图片 URL、模型和提示词来源。',
        ]
        : [
          '- `plan` | 按技能规划 | 根据当前 skill 拆解任务。',
          '- `execute` | 按技能执行 | 把动作落到当前画布。',
          '- `review` | 按技能复盘 | 检查结果并给出下一步。',
        ];
  return [
    '',
    '<!-- T8 Sidebar Adaptation: generated by Codex sidebar. Edit freely. -->',
    !hasSkillSection(text, 'Sidebar Directions') ? ['## Sidebar Directions', '', ...directions].join('\n') : '',
    !hasSkillSection(text, 'Sidebar Questions') ? [
      '## Sidebar Questions',
      '',
      '- `goal` | 这次最重要的目标是什么？ | 商业好卖 / 品牌感 / 快速出图 / 用户自定 | 用户自定',
      '- `count` | 需要几个变体？ | 2 个 / 4 个 / 6 个 / 先问用户 | 4 个',
      '- `run-now` | 是否直接触发生成？ | 先规划 / 直接生成 / 生成前确认 | 生成前确认',
    ].join('\n') : '',
    !hasSkillSection(text, 'Sidebar Canvas Templates') ? [
      '## Sidebar Canvas Templates',
      '',
      '- `canvas-workflow` | 标准画布流程 | reference assets -> planning note -> image/video nodes -> run_node -> verification',
      '- `variant-grid` | 变体对比流程 | source material -> variant nodes -> result comparison -> review note',
    ].join('\n') : '',
    !hasSkillSection(text, 'Sidebar Verification') ? [
      '## Sidebar Verification',
      '',
      '- `node-content` | 节点必须带内容 | 检查 prompt/model/apiModel/referenceImages/sourceUrls。',
      '- `lineage` | 来源关系必须保留 | 检查连线、引用素材和结果回写。',
      '- `viewport` | 结果必须可见 | 执行后 focus_viewport 到新流程区域。',
    ].join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

function skillObjectFromRaw(raw, name, skillPath) {
  const front = parseFrontmatter(raw);
  const summary = skillSummaryFromMarkdown(raw);
  return {
    id: `project:${name}`,
    name,
    title: String(front.title || summary.title || name),
    description: String(summary.description || front.description || '').replace(/\s+/g, ' ').slice(0, 240),
    category: String(summary.category || front.category || '').trim(),
    directions: parseSkillDirections(raw),
    questions: parseSkillQuestions(raw),
    templates: parseSkillCanvasTemplates(raw),
    verification: parseSkillVerification(raw),
    body: skillBodyFromMarkdown(raw),
    scope: 'project',
    path: skillPath,
  };
}

function adaptProjectSkillForSidebar(options = {}) {
  const workspaceDir = path.resolve(options.workspaceDir || '');
  const { safeName, absolutePath } = resolveProjectSkillFile(workspaceDir, options.name, 'SKILL.md');
  if (!fs.existsSync(absolutePath)) throw new Error(`项目 Skill 不存在：${safeName}`);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const appendix = sidebarAdaptationLines(raw);
  const nextRaw = appendix ? `${raw.trimEnd()}\n\n${appendix}\n` : raw;
  fs.writeFileSync(absolutePath, nextRaw, 'utf8');
  return skillObjectFromRaw(nextRaw, safeName, absolutePath);
}

function validateProjectSkill(options = {}) {
  const workspaceDir = path.resolve(options.workspaceDir || '');
  const { safeName, absolutePath } = resolveProjectSkillFile(workspaceDir, options.name, 'SKILL.md');
  if (!fs.existsSync(absolutePath)) throw new Error(`项目 Skill 不存在：${safeName}`);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const requiredSections = [
    'Sidebar Directions',
    'Sidebar Questions',
    'Sidebar Canvas Templates',
    'Sidebar Verification',
  ];
  const parsed = {
    directions: parseSkillDirections(raw),
    questions: parseSkillQuestions(raw),
    templates: parseSkillCanvasTemplates(raw),
    verification: parseSkillVerification(raw),
  };
  const missingSections = requiredSections.filter((section) => !hasSkillSection(raw, section));
  const parseWarnings = [];
  if (!parsed.directions.length) parseWarnings.push('没有解析到 Sidebar Directions，侧栏只能使用兜底方向。');
  if (!parsed.templates.length) parseWarnings.push('没有解析到 Sidebar Canvas Templates，任务预演会使用通用画布结构。');
  if (parsed.questions.some((item) => !Array.isArray(item.options) || item.options.length < 2)) {
    parseWarnings.push('部分 Sidebar Questions 缺少 2 个以上选项，Ask 卡片可能只能显示默认选项。');
  }
  if (parsed.templates.some((item) => !String(item.flow || '').trim())) {
    parseWarnings.push('部分 Sidebar Canvas Templates 缺少 flow，Codex 只能读取标题。');
  }
  return {
    name: safeName,
    path: absolutePath,
    ok: missingSections.length === 0 && parseWarnings.length === 0,
    requiredSections,
    missingSections,
    parseWarnings,
    parsed,
  };
}

function deleteProjectSkill(options = {}) {
  const workspaceDir = path.resolve(options.workspaceDir || '');
  const name = safeSegment(options.name, 'creator-skill');
  const { dir, safeName } = projectSkillDir(workspaceDir, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return {
    deleted: true,
    name: safeName,
    workspaceDir,
  };
}

function projectSkillBaseDir(workspaceDir = config.BASE_DIR) {
  const root = path.resolve(workspaceDir || config.BASE_DIR);
  return path.join(root, '.agents', 'skills');
}

function isInsideOrEqual(baseDir, targetPath) {
  const base = path.resolve(baseDir || '');
  const target = path.resolve(targetPath || '');
  return Boolean(base && target && (target === base || target.startsWith(base + path.sep)));
}

function projectSkillLegacyBaseDir(workspaceDir = config.BASE_DIR) {
  const root = path.resolve(workspaceDir || config.BASE_DIR);
  return path.join(root, 'skills');
}

function projectSkillRootSet(workspaceDir = config.BASE_DIR) {
  const root = path.resolve(workspaceDir || config.BASE_DIR);
  return [projectSkillLegacyBaseDir(root), projectSkillBaseDir(root)];
}

function projectSkillExistsInWorkspace(workspaceDir, name) {
  const safeName = safeSegment(name, 'skill');
  return projectSkillRootSet(workspaceDir).some((root) => fs.existsSync(path.join(root, safeName, 'SKILL.md')));
}

function workspaceHasProjectSkills(workspaceDir) {
  return projectSkillRootSet(workspaceDir).some((root) => {
    if (!fs.existsSync(root)) return false;
    try {
      return fs.readdirSync(root, { withFileTypes: true }).some((entry) => (
        entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md'))
      ));
    } catch {
      return false;
    }
  });
}

function isManagedCodexWorkspace(workspaceDir) {
  return isInsideOrEqual(codexWorkspaceRoot(), workspaceDir);
}

function resolveProjectSkillWorkspaceDir(workspaceDir = config.BASE_DIR, skillName = '') {
  const requested = path.resolve(workspaceDir || config.BASE_DIR);
  const appWorkspace = path.resolve(config.BASE_DIR);
  const name = String(skillName || '').trim();
  if (name) {
    if (projectSkillExistsInWorkspace(requested, name)) return requested;
    if (projectSkillExistsInWorkspace(appWorkspace, name)) return appWorkspace;
  }
  if (isManagedCodexWorkspace(requested)) return appWorkspace;
  if (workspaceHasProjectSkills(requested)) return requested;
  return appWorkspace;
}

function projectSkillRootsForWorkspace(workspaceDir = config.BASE_DIR) {
  const requested = path.resolve(workspaceDir || config.BASE_DIR);
  const skillWorkspace = resolveProjectSkillWorkspaceDir(requested);
  const roots = [];
  for (const root of projectSkillRootSet(skillWorkspace)) uniquePush(roots, root);
  if (requested !== skillWorkspace) {
    for (const root of projectSkillRootSet(requested)) uniquePush(roots, root);
  }
  return roots;
}

function resolveProjectSkillDir(workspaceDir, name) {
  const workspaceRoot = path.resolve(workspaceDir || config.BASE_DIR);
  const baseDir = projectSkillBaseDir(workspaceRoot);
  const legacyBaseDir = projectSkillLegacyBaseDir(workspaceRoot);
  const safeName = safeSegment(name, 'skill');
  const writableDir = assertInside(baseDir, path.join(baseDir, safeName));
  const legacyDir = assertInside(legacyBaseDir, path.join(legacyBaseDir, safeName));
  const dir = fs.existsSync(writableDir) || !fs.existsSync(legacyDir) ? writableDir : legacyDir;
  return { baseDir, safeName, dir };
}

function normalizeSkillFilePath(filePath) {
  const clean = String(filePath || 'SKILL.md')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim() || 'SKILL.md';
  if (clean.split('/').some((part) => part === '..')) throw new Error('Skill 文件路径越界');
  return clean;
}

function resolveProjectSkillFile(workspaceDir, name, filePath = 'SKILL.md') {
  const { dir, safeName } = resolveProjectSkillDir(workspaceDir, name);
  const relativePath = normalizeSkillFilePath(filePath);
  const absolutePath = assertInside(dir, path.join(dir, relativePath));
  return { dir, safeName, relativePath, absolutePath };
}

function listProjectSkillFiles(options = {}) {
  const { dir, safeName } = resolveProjectSkillDir(options.workspaceDir || config.BASE_DIR, options.name);
  if (!fs.existsSync(dir)) throw new Error(`项目 Skill 不存在：${safeName}`);
  const skip = new Set(['.git', 'node_modules', '.DS_Store']);
  const visit = (currentDir, relative = '') => {
    const children = fs.readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => !skip.has(entry.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        if (a.name === 'SKILL.md') return -1;
        if (b.name === 'SKILL.md') return 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) => {
        const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          return {
            path: nextRelative,
            name: entry.name,
            type: 'dir',
            children: visit(full, nextRelative),
          };
        }
        return {
          path: nextRelative,
          name: entry.name,
          type: 'file',
        };
      });
    return children;
  };
  return {
    name: safeName,
    baseDir: dir,
    files: visit(dir),
  };
}

function readProjectSkillFile(options = {}) {
  const { relativePath, absolutePath } = resolveProjectSkillFile(
    options.workspaceDir || config.BASE_DIR,
    options.name,
    options.filePath || options.path || 'SKILL.md',
  );
  if (!fs.existsSync(absolutePath)) throw new Error(`Skill 文件不存在：${relativePath}`);
  return {
    path: relativePath,
    content: fs.readFileSync(absolutePath, 'utf8'),
  };
}

function writeProjectSkillFile(options = {}) {
  const { relativePath, absolutePath } = resolveProjectSkillFile(
    options.workspaceDir || config.BASE_DIR,
    options.name,
    options.filePath || options.path || 'SKILL.md',
  );
  const ext = path.extname(relativePath).toLowerCase();
  const allowed = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.py']);
  if (!allowed.has(ext)) throw new Error('该 Skill 文件类型暂不允许在线编辑');
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, String(options.content || ''), 'utf8');
  return {
    path: relativePath,
    saved: true,
    bytes: Buffer.byteLength(String(options.content || ''), 'utf8'),
  };
}

function makeCreatorPrompt(body = {}) {
  const prompt = String(body.prompt || body.text || '').trim();
  const preset = String(body.preset || '').trim();
  const selectedSkillNames = Array.isArray(body.selectedSkillNames)
    ? body.selectedSkillNames.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const selectedSkillText = selectedSkillNames.join(' ');
  const canvasControlMode = /^canvas-/i.test(String(body.mode || ''))
    || String(body.command || '') === 'global-codex-sidebar'
    || Boolean(body.canvasId);
  const imageGenerationIntent = body.llmOnly === true
    ? false
    : canvasControlMode
      ? false
      : body.imageGeneration === true
      || /(^|[\s$:/_-])(imagegen|imagen|image-generation|image_generation|generate-image|图片生成|图像生成)([\s$:/_-]|$)/i.test(selectedSkillText)
      || body.mode === 'image';
  const instructions = [];
  instructions.push('你是画布中的 Codex 创作者 Agent，优先服务图像、视频、文案、分镜、提示词和创作质检。');
  instructions.push('除非用户明确要求写代码，否则输出面向创作交付：清晰的提示词、分镜、改稿建议、可执行步骤和素材使用说明。');
  if (selectedSkillNames.length > 0) {
    instructions.push(`请优先调用这些 Skill：${selectedSkillNames.map((name) => `$${name}`).join(' ')}。`);
  }
  if (canvasControlMode) {
    instructions.push([
      '画布控制模式：你正在被 T8/Hakimi 全局侧边栏调用，目标是控制当前画布，而不是在 Codex CLI 沙箱里直接产出图片。',
      `当前画布 ID：${body.canvasId || '未提供'}`,
      '- 必须优先使用 Hakimi MCP 工具读取/更新画布。复杂流程推荐 hakimi_canvas_snapshot -> hakimi_canvas_diff_plan -> hakimi_canvas_apply_plan -> hakimi_canvas_verify_plan；小步修补可用 hakimi_agent_run_actions。',
      '- 不要使用 Codex CLI 的 image_generation / imagen / imagegen；图像生成必须通过画布 image 节点和画布模型选择完成。',
      '- 生图流程必须创建或更新 type: "image" 节点，并写入 data.prompt、data.model、data.apiModel、data.aspectRatio、data.sizeLevel、data.referenceImages、data.label、data.status。',
      '- 如果用户要求直接真实生成，先写好 image 节点参数，再用 run_node action 触发该节点自己的生成逻辑；不要把提示词藏在空 text 节点里。',
      '- CanvasPlan 建议包含 nodes、updates、edges、runNodeIds、focusViewport；批量提交前先用 hakimi_canvas_diff_plan 预演差异，提交后必须回读验证节点、连线、模型参数、结果 URL 和视口。',
      '- 使用 phase/ask_user/preview_node/add_node/update_node/connect_edge/focus_viewport/run_node 让用户实时看见计划、选择、落点和执行。',
    ].join('\n'));
  }
  if (preset) instructions.push(`当前创作预设：${preset}。`);
  if (Array.isArray(body.referenceTexts) && body.referenceTexts.length > 0) {
    instructions.push(`上游文本素材：\n${body.referenceTexts.join('\n\n')}`);
  }
  const images = Array.isArray(body.images)
    ? body.images.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (images.length > 0) {
    const imageList = images
      .slice(0, 8)
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n');
    instructions.push([
      `参考图使用约束：已随命令附加 ${images.length} 张参考图，它们是本轮图像/改图任务的主要视觉依据。`,
      imageList ? `参考图列表：\n${imageList}` : '',
      '- 生成或改图时必须优先继承参考图的主体身份、构图关系、服装/发型/色彩/材质/光影等关键线索。',
      '- 除非用户明确要求彻底重绘风格，不要脱离参考图另起炉灶，不要生成与参考图无关的新角色或新画面。',
      '- 如果参考图读取失败，必须明确说明读取失败并退回可执行提示词，不要假装已经使用参考图。',
    ].filter(Boolean).join('\n'));
  }
  if (Array.isArray(body.videos) && body.videos.length > 0) {
    instructions.push(`已连接 ${body.videos.length} 个视频素材；如果不能直接读取视频，请先基于文件名和用户描述生成分镜/改稿方案。`);
  }
  if (Array.isArray(body.audios) && body.audios.length > 0) {
    instructions.push(`已连接 ${body.audios.length} 个音频素材；如果不能直接读取音频，请先基于文件名和用户描述生成声音/配音方案。`);
  }
  const presetHint = `${preset} ${body.mode || ''} ${body.command || ''}`;
  if (imageGenerationIntent || (/图像|image|商品图|product/i.test(presetHint) && body.llmOnly !== true)) {
    instructions.push('图像生成模式：如果当前 Codex CLI 提供 image_generation 工具，必须直接生成图片文件，并在最终回复中给出 Markdown 图片链接或本地文件路径；不要只输出提示词文本。只有在工具确实不可用时，才明确说明工具不可用并退回输出可投喂 Midjourney / Seedream / GPT Image 的完整提示词。');
  }
  instructions.push('如果生成了图片、视频、音频或文件，请在最终回复中用 Markdown 链接列出产物路径，方便画布自动收集。');
  instructions.push(`用户任务：\n${prompt || '请根据上游素材给出创作方案。'}`);
  return instructions.join('\n\n');
}

function sendSse(res, event, payload = {}) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, event, ...payload })}\n\n`);
}

async function probeCodexStatus(options = {}) {
  const version = await runCodexCommand(['--version'], {
    executablePath: options.executablePath,
    env: options.env,
    platform: options.platform,
    timeoutMs: options.timeoutMs || 15000,
  });
  if (version.code !== 0) {
    return {
      available: false,
      executable: version.executable || String(options.executablePath || defaultCodexExecutable()).trim() || 'codex',
      resolved: version.resolved,
      message: codexUnavailableMessage(version),
    };
  }

  const login = await runCodexCommand(['login', 'status'], {
    executablePath: options.executablePath,
    env: options.env,
    platform: options.platform,
    timeoutMs: options.timeoutMs || 15000,
  });
  const loginText = (login.stdout || login.stderr || '').trim();
  if (login.code !== 0) {
    return {
      available: false,
      executable: version.executable,
      resolved: version.resolved,
      version: version.stdout.trim(),
      authStatus: loginText,
      message: loginText || 'Codex CLI 已安装，但还没有登录。请点击“打开登录”或在终端运行 codex login。',
    };
  }

  const features = await listCodexFeatures({
    executablePath: options.executablePath,
    env: options.env,
    platform: options.platform,
    timeoutMs: 12000,
  }).catch(() => []);

  return {
    available: true,
    executable: version.executable,
    resolved: version.resolved,
    version: version.stdout.trim(),
    authStatus: loginText || 'Logged in',
    features,
    featureNames: features.map((feature) => feature.name),
    message: loginText ? `Codex CLI 可用：${loginText}` : 'Codex CLI 可用',
  };
}

module.exports = {
  CODEX_DISABLED_MESSAGE,
  CODEX_WINDOWS_APPS_MESSAGE,
  codexUnavailableMessageForTests: codexUnavailableMessage,
  codexConfigErrorMessageForTests: codexConfigErrorMessage,
  parseCodexFeatureListForTests: parseCodexFeatureList,
  parseCodexJsonLine,
  extractTextDelta,
  extractReasoningDeltaForTests: extractReasoningDelta,
  extractToolProgressForTests: extractToolProgress,
  shouldForwardCodexStderrForTests: shouldForwardCodexStderr,
  shouldForwardCodexProgressForTests: shouldForwardCodexProgress,
  extractArtifactsFromText,
  extractArtifactsFromWorkspaceForTests: extractArtifactsFromWorkspace,
  normalizeArtifactUrlForTests: normalizeArtifactUrl,
  resolveCodexInputImagesForTests: resolveCodexInputImages,
  resolveCodexExecutable,
  buildCodexProcessEnv,
  buildCodexProcessEnvForTests: buildCodexProcessEnv,
  buildCodexLoginStartInvocation,
  startCodexLogin,
  listCodexSkills,
  parseSkillDirectionsForTests: parseSkillDirections,
  parseSkillQuestionsForTests: parseSkillQuestions,
  parseSkillCanvasTemplatesForTests: parseSkillCanvasTemplates,
  parseSkillVerificationForTests: parseSkillVerification,
  createProjectSkill,
  importProjectSkillArchive,
  adaptProjectSkillForSidebar,
  validateProjectSkill,
  updateProjectSkill,
  deleteProjectSkill,
  projectSkillBaseDir,
  projectSkillRootsForWorkspace,
  resolveProjectSkillWorkspaceDir,
  listProjectSkillFiles,
  readProjectSkillFile,
  writeProjectSkillFile,
  createCodexWorkspace,
  listCodexFeatures,
  makeCreatorPrompt,
  probeCodexStatus,
  sendSse,
};
