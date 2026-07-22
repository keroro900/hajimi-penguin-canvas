import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('encrypted Electron loader only falls back to app require for bare packages', () => {
  const loader = read('../electron/loader.cjs');
  assert.match(loader, /function canFallbackToLoaderRequire/);
  assert.match(loader, /!text\.startsWith\('\.'\)/);
  assert.match(loader, /!path\.isAbsolute\(text\)/);
  assert.match(loader, /if \(!canFallbackToLoaderRequire\(id\)\) throw e;/);
  assert.match(loader, /if \(!canFallbackToLoaderRequire\(request\)\) throw e;/);
  assert.match(loader, /const value = require\(id\)/);
  assert.match(loader, /return value;/);
  assert.match(loader, /return require\.resolve\(request, options\)/);
});

test('clean installs include Three.js typings for Panorama3D type-check', () => {
  const packageJson = JSON.parse(read('../package.json'));
  const lock = read('../package-lock.json');
  const panorama = read('../src/components/nodes/Panorama3DNode.tsx');

  assert.equal(packageJson.devDependencies['@types/three'], '^0.184.1');
  assert.match(lock, /"node_modules\/@types\/three"/);
  assert.doesNotMatch(lock, /registry\.npmmirror\.com/);
  assert.match(panorama, /type ThreeModule = typeof import\('three'\)/);
});

test('dir packaging verification ignores stale release metadata unless update artifacts are required', () => {
  const postBuild = read('../electron/_post_build.cjs');
  assert.match(postBuild, /const strict = process\.env\.T8_REQUIRE_UPDATE_ARTIFACTS === '1'/);
  assert.match(postBuild, /const hasInstaller = fs\.existsSync\(installer\)/);
  assert.match(postBuild, /const hasBlockmap = fs\.existsSync\(blockmap\)/);
  assert.match(postBuild, /!strict && !hasInstaller && !hasBlockmap/);
  assert.match(postBuild, /skipping installer\/latest\.yml checks for dir build/);
});

test('backend bytecode is compiled in the same Electron mode that loads it', () => {
  const packageJson = JSON.parse(read('../package.json'));
  const encryptScript = read('../electron/encrypt.cjs');
  const runnerScript = read('../scripts/run-electron-encrypt.cjs');

  assert.equal(packageJson.scripts.encrypt, 'node scripts/run-electron-encrypt.cjs');
  assert.match(runnerScript, /delete env\.ELECTRON_RUN_AS_NODE/);
  assert.match(encryptScript, /bytenode\.compileCode\(source\)/);
  assert.doesNotMatch(encryptScript, /bytenode\.compileElectronCode/);
});

test('backend bytecode encryption cleans stale output with Windows-safe retries', () => {
  const packageJson = JSON.parse(read('../package.json'));
  const encryptScript = read('../electron/encrypt.cjs');
  const backendResource = packageJson.build.extraResources.find((item: any) => item.to === 'backend-enc');

  assert.equal(backendResource.from, 'build/backend-enc-desktop');
  assert.match(encryptScript, /build['"], ['"]backend-enc-desktop/);
  assert.match(encryptScript, /function removeDirWithRetry/);
  assert.match(encryptScript, /ENOTEMPTY|EBUSY|EPERM/);
  assert.match(encryptScript, /fs\.rmSync\(target,\s*\{\s*recursive:\s*true,\s*force:\s*true/);
  assert.match(encryptScript, /fs\.renameSync\(target,\s*staleTarget\)/);
  assert.match(encryptScript, /stale-backend-enc/);
  assert.doesNotMatch(encryptScript, /attempt\s*>=\s*retries\)\s*throw error/);
  assert.match(encryptScript, /backend-enc cleanup locked/);
  assert.doesNotMatch(encryptScript, /in-place overwrite/);
  assert.match(encryptScript, /Atomics\.wait/);
  assert.match(encryptScript, /removeDirWithRetry\(OUT_DIR\)/);
});

test('Electron release build and remote mutations require explicit per-version approval', () => {
  const distRelease = read('../scripts/dist-release.cjs');
  const githubRelease = read('../scripts/release-github.cjs');

  assert.match(distRelease, /const releaseApproval = `release-\$\{pkg\.version\}`/);
  assert.match(distRelease, /function assertReleaseApproval\(\)/);
  assert.match(distRelease, /process\.env\.T8_RELEASE_APPROVAL === releaseApproval/);
  assert.match(distRelease, /refusing to run Electron release without explicit approval/);
  assert.match(distRelease, /only after the user explicitly asks to publish/);
  assert.doesNotMatch(distRelease, /release', '(?:create|upload|edit)'/);
  assert.match(distRelease, /refusing to build release artifacts from a dirty Git tree/);

  assert.match(githubRelease, /const approval = `release-\$\{version\}`/);
  assert.match(githubRelease, /function assertApproval\(mode\)/);
  assert.match(githubRelease, /process\.env\.T8_RELEASE_APPROVAL !== approval/);
  assert.match(githubRelease, /mode === 'status'[\s\S]*mode === 'dry-run'/);
  assert.doesNotMatch(githubRelease, /--clobber/);
});

test('project test runner emits TAP for machine-readable release evidence', () => {
  const runTests = read('../scripts/run-tests.cjs');
  assert.match(runTests, /--test-reporter=tap/);
});

test('Electron release keeps one packaged ffmpeg runtime and excludes installer duplicate', () => {
  const packageJson = JSON.parse(read('../package.json'));
  const files = packageJson.build.files;
  const resources = packageJson.build.extraResources.map((item: any) => `${item.from}->${item.to}`);
  const ffmpegResource = packageJson.build.extraResources.find((item: any) => item.to === 'tools/ffmpeg');
  const llmMedia = read('../backend/src/providers/llmMedia.js');

  assert.equal(packageJson.build.compression, 'normal');
  assert.ok(files.includes('!node_modules/@ffmpeg-installer/**/*'));
  assert.ok(resources.includes('tools/ffmpeg-runtime->tools/ffmpeg'));
  assert.deepEqual(ffmpegResource.filter, ['ffmpeg.exe', 'ffprobe.exe', 'ffmpeg', 'ffprobe', 'README.md']);
  assert.match(llmMedia, /resRoot && path\.join\(resRoot, 'tools', 'ffmpeg', binary\)/);
  assert.match(llmMedia, /optional dev fallback only/);
});

test('Electron packaging verifies encrypted local extension hook points', () => {
  const postBuild = read('../electron/_post_build.cjs');
  const encrypt = read('../electron/encrypt.cjs');
  const config = read('../backend/src/config.js');

  assert.match(postBuild, /extensions['"], ['"]runtimeHooks\.t8c/);
  assert.match(postBuild, /routes['"], ['"]figma\.t8c/);
  assert.match(postBuild, /routes['"], ['"]grokOAuth\.t8c/);
  assert.match(postBuild, /routes['"], ['"]codexCli\.t8c/);
  assert.match(postBuild, /routes['"], ['"]hakimiMcp\.t8c/);
  assert.match(postBuild, /utils['"], ['"]codexCliRunner\.t8c/);
  assert.match(postBuild, /utils['"], ['"]figmaBridge\.t8c/);
  assert.match(postBuild, /utils['"], ['"]hakimiCanvasCli\.t8c/);
  assert.match(postBuild, /checkFigmaBridgeRuntime/);
  assert.match(postBuild, /tools['"], ['"]figma-bridge/);
  assert.match(encrypt, /const LOCAL_PRIVATE_BACKEND_DIRS = \[/);
  assert.match(encrypt, /path\.join\(LOCAL_PRIVATE_SRC, 'extensions', 'backend'\)/);
  assert.match(encrypt, /path\.join\(LOCAL_PRIVATE_SRC, 'recharge', 'backend'\)/);
  assert.doesNotMatch(encrypt, /walk\(LOCAL_PRIVATE_SRC\)/);
  const packageJson = JSON.parse(read('../package.json'));
  const resources = packageJson.build.extraResources.map((item: any) => `${item.from}->${item.to}`);
  assert.ok(resources.includes('tools/figma-bridge->tools/figma-bridge'));
  assert.ok(resources.includes('skills->skills'));
  assert.ok(resources.includes('.agents/skills->.agents/skills'));
  assert.match(config, /function seedPackagedCodexSkills\(\)/);
  assert.match(config, /copyMissingDirectory/);
  assert.match(config, /RESOURCES_ROOT/);
  const localHook = new URL('../local-private/extensions/build/post-build.cjs', import.meta.url);
  if (existsSync(localHook)) {
    const localPostBuild = read('../local-private/extensions/build/post-build.cjs');
    assert.match(localPostBuild, /zhenzhenGroups\.t8c/);
    assert.match(localPostBuild, /private New API group source must be encrypted/);
    assert.match(localPostBuild, /backend-enc['"], ['"]local-private/);
  }
});

test('Electron desktop package bundles the Hakimi Canvas CLI', () => {
  const packageJson = JSON.parse(read('../package.json'));
  const postBuild = read('../electron/_post_build.cjs');
  const resources = packageJson.build.extraResources.map((item: any) => `${item.from}->${item.to}`);
  const cliResource = packageJson.build.extraResources.find((item: any) => item.to === 'tools/hakimi-canvas-cli');

  assert.equal(packageJson.scripts['hakimi:canvas'], 'node tools/hakimi-canvas-cli/hakimi-canvas.mjs');
  assert.ok(resources.includes('tools/hakimi-canvas-cli->tools/hakimi-canvas-cli'));
  assert.deepEqual(cliResource.filter, ['hakimi-canvas.mjs', 'README.md']);
  assert.match(postBuild, /function checkHakimiCanvasCliRuntime/);
  assert.match(postBuild, /tools['"], ['"]hakimi-canvas-cli/);
  assert.match(postBuild, /hakimi-canvas\.mjs/);
  assert.match(postBuild, /README\.md/);
  assert.match(postBuild, /checkHakimiCanvasCliRuntime\(\)/);
});
