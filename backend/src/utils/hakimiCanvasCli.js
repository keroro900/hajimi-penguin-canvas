const fs = require('fs');
const path = require('path');
const config = require('../config');

function quoteCmd(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function resolveHakimiCanvasCliPath(options = {}) {
  const resourcesRoot = options.resourcesRoot || config.RESOURCES_ROOT;
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..', '..', '..');
  const candidates = [
    process.env.HAKIMI_CANVAS_CLI_PATH,
    resourcesRoot ? path.join(resourcesRoot, 'tools', 'hakimi-canvas-cli', 'hakimi-canvas.mjs') : '',
    path.join(projectRoot, 'tools', 'hakimi-canvas-cli', 'hakimi-canvas.mjs'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
}

function renderCmdLauncher({ cliPath, baseUrl }) {
  return [
    '@echo off',
    'setlocal',
    `set "HAKIMI_CANVAS_API=${baseUrl}"`,
    'if "%~1"=="" (',
    `  node ${quoteCmd(cliPath)} --help`,
    ') else (',
    `  node ${quoteCmd(cliPath)} %* --base-url ${quoteCmd(baseUrl)}`,
    ')',
  ].join('\r\n');
}

function renderPowerShellLauncher({ cliPath, baseUrl }) {
  return [
    '$ErrorActionPreference = "Stop"',
    `$Cli = ${quotePowerShell(cliPath)}`,
    `$BaseUrl = ${quotePowerShell(baseUrl)}`,
    '$env:HAKIMI_CANVAS_API = $BaseUrl',
    'if ($args.Count -eq 0) {',
    '  & node $Cli --help',
    '} else {',
    '  & node $Cli @args --base-url $BaseUrl',
    '}',
    'exit $LASTEXITCODE',
  ].join('\n');
}

function ensureHakimiCanvasCliLaunchers(options = {}) {
  const cliPath = options.cliPath || resolveHakimiCanvasCliPath(options);
  const baseUrl = String(options.baseUrl || `http://127.0.0.1:${config.PORT}`).replace(/\/+$/, '');
  const outputDir = options.outputDir || path.join(config.DATA_DIR, 'hakimi-canvas-cli');
  if (!fs.existsSync(cliPath)) {
    return {
      ok: false,
      cliPath,
      baseUrl,
      outputDir,
      message: 'Hakimi Canvas CLI not found',
    };
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const cmdPath = path.join(outputDir, 'hakimi-canvas.cmd');
  const ps1Path = path.join(outputDir, 'hakimi-canvas.ps1');
  fs.writeFileSync(cmdPath, renderCmdLauncher({ cliPath, baseUrl }), 'utf8');
  fs.writeFileSync(ps1Path, renderPowerShellLauncher({ cliPath, baseUrl }), 'utf8');
  return {
    ok: true,
    cliPath,
    baseUrl,
    outputDir,
    cmdPath,
    ps1Path,
  };
}

function startHakimiCanvasCliOnAppStart(logger = console, options = {}) {
  if (process.env.T8_HAKIMI_CANVAS_CLI_AUTOSTART === '0') {
    logger.log?.('   Hakimi Canvas CLI: 已禁用（T8_HAKIMI_CANVAS_CLI_AUTOSTART=0）');
    return { ok: false, disabled: true };
  }
  try {
    const result = ensureHakimiCanvasCliLaunchers(options);
    if (!result.ok) {
      logger.warn?.(`   Hakimi Canvas CLI: ${result.message} (${result.cliPath})`);
      return result;
    }
    logger.log?.(`   Hakimi Canvas CLI: 已就绪 ${result.cmdPath}`);
    logger.log?.(`   CLI 后端地址: ${result.baseUrl}`);
    return result;
  } catch (error) {
    logger.warn?.('   Hakimi Canvas CLI: 启动器生成失败', error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

module.exports = {
  ensureHakimiCanvasCliLaunchers,
  renderCmdLauncher,
  renderPowerShellLauncher,
  resolveHakimiCanvasCliPath,
  startHakimiCanvasCliOnAppStart,
};
