import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function escapeRegExp(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('package config enables GitHub release updates and local release scripts', () => {
  const pkg = JSON.parse(read('../package.json'));
  const publish = pkg.build.publish?.[0];

  assert.equal(pkg.version, '2.4.1');
  assert.ok(pkg.dependencies['electron-updater']);
  assert.ok(pkg.dependencies['electron-log']);
  assert.ok(pkg.build.files.includes('electron/smoke-ready.cjs'));
  assert.equal(publish.provider, 'github');
  assert.equal(publish.owner, 'keroro900');
  assert.equal(publish.repo, 'hajimi-penguin-canvas');
  assert.equal(publish.releaseType, 'release');
  assert.equal(pkg.build.win.artifactName, '${productName}-Setup-${version}.${ext}');
  assert.match(pkg.scripts['dist:release'], /scripts\/dist-release\.cjs|scripts\\dist-release\.cjs/);
  assert.match(pkg.scripts['release:verify'], /verify-github-release\.cjs/);
});

test('electron main process owns updater checks, downloads, and install IPC', () => {
  const pkg = JSON.parse(read('../package.json'));
  const main = read('../electron/main.cjs');
  const installerNsh = read('../electron/build-resources/installer.nsh');
  const nsis = pkg.build.nsis;

  assert.match(main, new RegExp(`const APP_VERSION = '${escapeRegExp(pkg.version)}'`));
  assert.equal(nsis.createDesktopShortcut, 'always');
  assert.equal(nsis.createStartMenuShortcut, true);
  assert.match(main, /require\('electron-updater'\)/);
  assert.match(main, /autoUpdater\.autoDownload\s*=\s*false/);
  assert.match(main, /autoUpdater\.autoInstallOnAppQuit\s*=\s*false/);
  assert.doesNotMatch(main, /setTimeout\([\s\S]{0,160}checkForUpdatesByUser/);
  assert.match(main, /initializeUpdaterStatus/);
  assert.match(main, /autoUpdater\.on\('download-progress'/);
  assert.match(main, /ipcMain\.handle\('t8pc:updater:status'/);
  assert.match(main, /ipcMain\.handle\('t8pc:updater:check'/);
  assert.match(main, /ipcMain\.handle\('t8pc:updater:download'/);
  assert.match(main, /ipcMain\.handle\('t8pc:updater:install'/);
  assert.match(main, /quitAndInstall\(false,\s*true\)/);
  assert.match(main, /打开安装向导/);
  assert.match(installerNsh, /!macro customInit/);
  assert.match(installerNsh, /SetSilent\s+normal/);
  assert.match(installerNsh, /!macro customInstall/);
  assert.match(installerNsh, /CreateShortCut "\$newStartMenuLink"/);
  assert.match(installerNsh, /CreateShortCut "\$DESKTOP\\\$\{SHORTCUT_NAME\}\.lnk"/);
});

test('preload and frontend expose a narrow updater surface', () => {
  const preload = read('../electron/preload.cjs');
  const types = read('../src/vite-env.d.ts');
  const rail = read('../src/components/shell/AppRail.tsx');
  const button = read('../src/components/AppUpdaterButton.tsx');

  assert.match(preload, /updater:\s*\{/);
  assert.match(preload, /ipcRenderer\.invoke\('t8pc:updater:check'\)/);
  assert.match(preload, /ipcRenderer\.on\('t8pc:updater-status'/);
  assert.match(types, /interface T8UpdaterStatus/);
  assert.match(types, /onStatus:\s*\(callback:/);
  // 无顶栏布局：更新按钮以 rail 图标按钮形态挂在应用轨道，下拉面板向右弹出
  assert.match(rail, /<AppUpdaterButton isPixel=\{isPixel\} isDark=\{isDark\} rail \/>/);
  assert.match(button, /left-full bottom-0 ml-2/);
  assert.match(button, /status\.status === 'available'/);
  assert.match(button, /status\.status === 'downloaded'/);
  assert.match(button, /desktopShellDetected/);
  assert.match(button, /isElectronUserAgent/);
  assert.match(button, /UPDATER_BRIDGE_MISSING_MESSAGE/);
  assert.match(button, /if \(!desktopShellDetected\) return null/);
  assert.doesNotMatch(button, /if \(!hasUpdater\) return null/);
  assert.match(button, /打开安装向导/);
});

test('release scripts split build, draft, publish, verification, and containment modes', () => {
  const postBuild = read('../electron/_post_build.cjs');
  const distRelease = read('../scripts/dist-release.cjs');
  const release = read('../scripts/release-github.cjs');
  const verify = read('../scripts/verify-github-release.cjs');
  const allowlist = JSON.parse(read('../scripts/release-secret-allowlist.json'));
  const notes = read('../release-notes/v2.4.1.md');

  assert.match(distRelease, /T8_REQUIRE_UPDATE_ARTIFACTS/);
  assert.match(distRelease, /git[\s\S]*status[\s\S]*--porcelain/);
  assert.doesNotMatch(distRelease, /run\([^\n]*release-github\.cjs/);
  assert.match(distRelease, /prepare-draft/);
  assert.match(postBuild, /T8_REQUIRE_UPDATE_ARTIFACTS/);
  assert.match(postBuild, /latest\.yml/);
  assert.match(postBuild, /\.blockmap/);
  assert.match(release, /status[\s\S]*dry-run[\s\S]*prepare-draft[\s\S]*verify-draft[\s\S]*publish[\s\S]*verify-public[\s\S]*contain/);
  assert.match(release, /executeReleaseMode/);
  assert.match(release, /--state/);
  assert.match(release, /release-secret-allowlist\.json/);
  assert.match(release, /secret-scan\.cjs/);
  assert.match(release, /scan-manifest/);
  assert.match(release, /git[\s\S]*status[\s\S]*--porcelain/);
  assert.doesNotMatch(release, /--clobber/);
  assert.match(release, /release', 'create'[\s\S]*--draft/);
  assert.match(verify, /release', 'download'/);
  assert.match(verify, /missing release asset/);
  assert.doesNotMatch(verify, /release', '(?:create|edit|upload|delete)'/);
  assert.ok(Array.isArray(allowlist.entries));
  const allowlistKeys = allowlist.entries.map((entry: { relativePath: string; ruleId: string; reason: string }) => {
    assert.match(entry.relativePath, /^app\.asar\/[A-Za-z0-9@._/-]+$/);
    assert.ok(['basic-auth', 'cookie-header', 'private-key-header', 'settings-credential'].includes(entry.ruleId));
    assert.ok(entry.reason.trim().length >= 20);
    return `${entry.relativePath}\0${entry.ruleId}`;
  });
  assert.equal(new Set(allowlistKeys).size, allowlistKeys.length);
  assert.deepEqual(allowlistKeys, [
    'app.asar/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/auth-extensions.js\0basic-auth',
    'app.asar/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/auth.js\0basic-auth',
    'app.asar/node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth-extensions.js\0basic-auth',
    'app.asar/node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.js\0basic-auth',
    'app.asar/node_modules/jose/dist/webapi/key/import.js\0private-key-header',
    'app.asar/node_modules/lucide-react/dist/umd/lucide-react.min.js\0cookie-header',
    'app.asar/node_modules/prop-types/lib/ReactPropTypesSecret.js\0settings-credential',
    'app.asar/node_modules/prop-types/prop-types.js\0settings-credential',
    'app.asar/node_modules/stats-gl/node_modules/three/src/animation/tracks/ColorKeyframeTrack.js\0basic-auth',
    'app.asar/node_modules/three/build/three.webgpu.js\0basic-auth',
    'app.asar/node_modules/three/build/three.webgpu.nodes.js\0basic-auth',
    'app.asar/node_modules/three/src/nodes/math/OperatorNode.js\0basic-auth',
  ]);
  assert.match(notes, /2\.3\.8/);
  assert.match(notes, /keroro900\/hajimi-penguin-canvas/);
});
