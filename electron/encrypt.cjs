// ============================================================================
// T8-penguin-canvas 打包前加密脚本 (encrypt.js)
//
// 流程:
//   1. 读取 backend/src/**/*.js (排除 node_modules)
//   2. 用 bytenode.compileCode(src) 生成 V8 字节码 (.jsc 缓冲)
//   3. 调用 loader.encryptBuffer 加 T8ENC1 magic + AES-256-CBC
//   4. 写入 build/backend-enc-desktop/<rel>.t8c
//   5. 重写所有相对路径 require:
//        ./config / ./routes/canvas 等 → 仍然是相对路径,运行时由 .t8c 后缀 hook 解析
//
// 使用方式:
//   node electron/encrypt.js
// 输出:
//   build/backend-enc-desktop/server.t8c
//   build/backend-enc-desktop/config.t8c
//   build/backend-enc-desktop/routes/canvas.t8c ...
//   build/backend-enc-desktop/utils/*.t8c
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const bytenode = require('bytenode');
const { encryptBuffer } = require('./loader.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKEND_SRC = path.resolve(__dirname, '..', 'backend', 'src');
const LOCAL_PRIVATE_SRC = path.resolve(__dirname, '..', 'local-private');
const OUT_DIR = path.resolve(PROJECT_ROOT, process.env.T8_ENCRYPT_OUT_DIR || path.join('build', 'backend-enc-desktop'));
const LOCAL_PRIVATE_BACKEND_DIRS = [
  path.join(LOCAL_PRIVATE_SRC, 'extensions', 'backend'),
  path.join(LOCAL_PRIVATE_SRC, 'recharge', 'backend'),
];
const EXCLUDED_BACKEND_FILES = new Set([
  // Local VibeX static adapter is intentionally not part of public/Electron
  // releases. The node uses the online VibeX page plus vibexBridge instead.
  'routes/vibex.js',
]);

function walk(dir, results = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full, results);
    } else if (full.endsWith('.js') || full.endsWith('.cjs')) {
      results.push(full);
    } else if (full.endsWith('.json')) {
      results.push(full); // settings/canvas 模板等
    }
  }
  return results;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeDirWithRetry(target, options = {}) {
  if (!fs.existsSync(target)) return;
  const retries = Math.max(1, Number(options.retries || 8));
  const retryableCodes = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM', 'EACCES']);
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 80 });
      if (!fs.existsSync(target)) return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code)) throw error;
    }
    sleepSync(80 * (attempt + 1));
  }
  if (!fs.existsSync(target)) return;

  const staleTarget = path.join(
    path.dirname(target),
    `stale-backend-enc-${process.pid}-${Date.now()}`,
  );
  try {
    fs.renameSync(target, staleTarget);
  } catch (error) {
    if (!retryableCodes.has(error?.code) && !retryableCodes.has(lastError?.code)) throw error;
    const message = [
      `[encrypt] backend-enc cleanup locked: ${target}`,
      'Close any running dev server, packaged app, terminal, or file browser that is reading build/backend-enc output, then retry.',
    ].join('\n');
    const wrapped = new Error(message);
    wrapped.cause = error;
    throw wrapped;
  }
  try {
    fs.rmSync(staleTarget, { recursive: true, force: true, maxRetries: 2, retryDelay: 80 });
  } catch {
    console.warn('[encrypt] stale backend-enc cleanup deferred:', staleTarget);
  }
}

// 把 require('./foo') / require('./foo.js') 重写为 require('./foo.t8c')
// 使内部模块在加密产物里仍能正确 resolve(.t8c hook 已注册到 require.extensions)
function rewriteRequires(src) {
  // 匹配 require('./xxx') 或 require("../xxx")  形式
  return src.replace(
    /require\((['"])(\.\.?\/[^'"]+)\1\)/g,
    (m, q, p) => {
      // 已有 .t8c / .json 后缀:不动
      if (/\.(t8c|json)$/.test(p)) return m;
      // 去掉 .js 后缀(若有)
      const stripped = p.replace(/\.(?:js|cjs)$/, '');
      return `require(${q}${stripped}.t8c${q})`;
    },
  );
}

async function compileBytecode(source) {
  return bytenode.compileCode(source);
}

async function encryptFile(srcAbs, sourceRoot = BACKEND_SRC, outRoot = OUT_DIR) {
  const rel = path.relative(sourceRoot, srcAbs).replace(/\\/g, '/');
  const dst = path.join(outRoot, rel.replace(/\.(?:js|cjs)$/, '.t8c'));
  ensureDir(path.dirname(dst));

  if (srcAbs.endsWith('.json')) {
    // JSON 直接复制(本项目 backend/src 暂未直接含 json,保留扩展性)
    fs.copyFileSync(srcAbs, path.join(outRoot, rel));
    console.log('[copy ]', rel);
    return;
  }

  let src = fs.readFileSync(srcAbs, 'utf-8');
  src = rewriteRequires(src);

  // 在普通 Electron 主进程中调用 compileCode,产物才能被打包后的主进程稳定加载。
  // compileAsModule 通过包装代码实现:外部传入 source 已经是 CommonJS 模块体,
  // 直接 wrap 成 Module 包装函数体后再编译,运行时 require() 才能正确 resolve
  // 注意: bytenode 内部 compileCode 不接受 compileAsModule 参数,
  //       但当 src 已经是 CommonJS 模块顶层代码时, V8 会以脚本模式编译,
  //       而 require/module/exports/__filename/__dirname 是 Node 在 require() 时
  //       动态注入的形参,因此字节码运行起来时这些标识会作为闭包参数自然可用。
  //       为保证与原 backend/src 行为一致,我们用 Module.wrap() 包裹后再编译。
  const Module = require('module');
  const wrapped = Module.wrap(src);
  const jsc = await compileBytecode(wrapped);

  const enc = encryptBuffer(jsc);
  fs.writeFileSync(dst, enc);
  console.log('[T8ENC]', rel, '→', path.relative(path.resolve(__dirname, '..'), dst));
}

function isExcludedBackendFile(srcAbs) {
  const rel = path.relative(BACKEND_SRC, srcAbs).replace(/\\/g, '/');
  return EXCLUDED_BACKEND_FILES.has(rel);
}

async function main() {
  removeDirWithRetry(OUT_DIR);
  ensureDir(OUT_DIR);

  const backendFiles = walk(BACKEND_SRC);
  const files = backendFiles.filter((file) => !isExcludedBackendFile(file));
  const skipped = backendFiles.length - files.length;
  console.log(`[encrypt] backend src files: ${files.length}${skipped ? ` (${skipped} release-excluded)` : ''}`);
  for (const f of backendFiles.filter(isExcludedBackendFile)) {
    console.log('[skip ]', path.relative(BACKEND_SRC, f).replace(/\\/g, '/'));
  }
  for (const f of files) {
    await encryptFile(f);
  }

  const localPrivateDisabled = process.env.T8_ENABLE_LOCAL_PRIVATE === '0'
    || process.env.T8_DISABLE_LOCAL_EXTENSIONS === '1';
  const localPrivateEntry = path.join(LOCAL_PRIVATE_SRC, 'extensions', 'backend', 'index.cjs');
  if (!localPrivateDisabled && fs.existsSync(localPrivateEntry)) {
    const localOut = path.join(OUT_DIR, 'local-private');
    const localFiles = LOCAL_PRIVATE_BACKEND_DIRS
      .filter((dir) => fs.existsSync(dir))
      .flatMap((dir) => walk(dir));
    console.log(`[encrypt] local private files: ${localFiles.length}`);
    for (const f of localFiles) {
      await encryptFile(f, LOCAL_PRIVATE_SRC, localOut);
    }
  } else {
    console.log('[encrypt] local private extensions: skipped');
  }
  console.log(`[encrypt] DONE → ${OUT_DIR}`);
}

if (require.main === module) {
  // 必须用 electron 运行本脚本 (npx electron electron/encrypt.js)
  // 使 bytenode 编译出的字节码与运行时 Electron 主进程 V8 模式一致。
  // 不要设置 ELECTRON_RUN_AS_NODE=1,该模式生成的部分 CommonJS 字节码
  // 在普通 Electron 主进程加载时会触发 V8 原生崩溃。
  // 检测: process.versions.electron 存在则表明是 Electron 进程
  if (!process.versions.electron) {
    console.warn('[encrypt] WARNING: 该脚本未在 Electron 下执行! V8 版本不匹配会导致打包后崩溃。');
    console.warn('[encrypt]   请改用: npx electron electron/encrypt.js');
  }
  if (process.env.ELECTRON_RUN_AS_NODE === '1') {
    console.error('[encrypt] FAILED: 不要使用 ELECTRON_RUN_AS_NODE=1 编译后端字节码,请改用普通 Electron 运行 electron/encrypt.cjs');
    process.exit(1);
  }
  function exitElectron(code) {
    process.exit(code);
  }
  main()
    .then(() => exitElectron(0))
    .catch((e) => {
      console.error('[encrypt] FAILED:', e && e.stack ? e.stack : e);
      exitElectron(1);
    });
}

module.exports = { main, encryptFile, rewriteRequires };
