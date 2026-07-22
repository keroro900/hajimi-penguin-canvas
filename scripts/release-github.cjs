#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { executeReleaseMode } = require('./lib/release-operations.cjs');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const MODES = new Set(['status', 'dry-run', 'prepare-draft', 'verify-draft', 'publish', 'verify-public', 'contain']);
const version = pkg.version;
const configuredRepo = `${pkg.build.publish[0].owner}/${pkg.build.publish[0].repo}`;
const repo = process.env.T8_RELEASE_REPO || '';
const tag = process.env.T8_RELEASE_TAG || `v${version}`;
const approval = `release-${version}`;
const assetNames = [`${pkg.build.productName}-Setup-${version}.exe`, `${pkg.build.productName}-Setup-${version}.exe.blockmap`, 'latest.yml'];
const notesFile = path.join(ROOT, 'release-notes', `${tag}.md`);
const RELEASE_SOURCE_GATE_MODES = new Set(['prepare-draft', 'publish']);

function fail(message) { throw new Error(message); }

function run(command, args, { allowFailure = false, encoding = 'utf8' } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) fail(`${command} ${args.join(' ')} failed (${result.status}): ${String(result.stderr || '').trim()}`);
  return result;
}

function git(args, options) { return run('git', args, options); }
function gh(args, options) { return run('gh', args, options); }

function parseArgs(argv) {
  const mode = argv[0];
  if (!MODES.has(mode)) fail(`mode must be one of: ${[...MODES].join(', ')}`);
  let state;
  for (let index = 1; index < argv.length; index += 2) {
    if (argv[index] !== '--state' || !argv[index + 1] || argv[index + 1].startsWith('--')) fail('only --state <path> is supported');
    if (state) fail('duplicate --state');
    state = path.resolve(argv[index + 1]);
  }
  if (!state) fail('--state is required');
  return { mode, state };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJsonAtomic(file, value) {
  const parent = path.dirname(file);
  if (!fs.existsSync(parent)) fail('release state parent does not exist');
  const temp = path.join(parent, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function fileIdentity(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail(`invalid release asset: ${path.basename(file)}`);
  const content = fs.readFileSync(file);
  return { name: path.basename(file), path: file, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
}

function assertCleanTree() {
  const status = String(git(['status', '--porcelain', '--untracked-files=all']).stdout || '').trim();
  if (status) fail('release source tree is dirty; commit and review the exact source before remote release mutation');
}

function writeScanManifest(file, paths) {
  writeJsonAtomic(file, { entries: paths.map((relativePath) => ({ relativePath, type: 'file' })) });
}

function runReleaseSecretGate(statePath, desired) {
  const evidenceRoot = path.dirname(statePath);
  const toolRoot = path.join(evidenceRoot, 'tools');
  const scanner = path.join(toolRoot, 'secret-scan.cjs');
  const rules = path.join(toolRoot, 'secret-rules.json');
  const allowlist = path.join(ROOT, 'scripts', 'release-secret-allowlist.json');
  for (const required of [scanner, rules, allowlist]) {
    if (!fs.existsSync(required)) fail(`release secret gate dependency is missing: ${required}`);
  }

  const tracked = String(git(['ls-files', '-z']).stdout || '').split('\0').filter(Boolean);
  if (!tracked.length) fail('release secret gate found no tracked source files');
  const sourceManifest = path.join(evidenceRoot, 'tracked-source-manifest.json');
  const sourceReport = path.join(evidenceRoot, 'secret-release-source.json');
  writeScanManifest(sourceManifest, tracked);
  run(process.execPath, [scanner, 'scan-manifest', '--root', ROOT, '--manifest', sourceManifest, '--rules', rules, '--allowlist', allowlist, '--output', sourceReport]);

  const assetsRoot = path.join(ROOT, 'dist_electron');
  const assetManifest = path.join(evidenceRoot, 'release-assets-manifest.json');
  const assetReport = path.join(evidenceRoot, 'secret-release-assets.json');
  writeScanManifest(assetManifest, desired.assets.map((asset) => asset.name));
  run(process.execPath, [scanner, 'scan-manifest', '--root', assetsRoot, '--manifest', assetManifest, '--rules', rules, '--allowlist', allowlist, '--output', assetReport]);
}

function desiredRelease(state) {
  if (repo !== configuredRepo) fail(`T8_RELEASE_REPO must equal ${configuredRepo}`);
  if (tag !== `v${version}`) fail(`T8_RELEASE_TAG must equal v${version}`);
  if (!fs.existsSync(notesFile)) fail(`missing release notes: ${path.relative(ROOT, notesFile)}`);
  const body = fs.readFileSync(notesFile, 'utf8');
  const bodyMarker = `<!-- t8-release:${tag} -->`;
  if (!body.includes(bodyMarker)) fail('release notes identity marker is missing');
  const targetSha = String(git(['rev-parse', 'HEAD']).stdout).trim();
  const integrationBase = String(state.integrationBase || '').trim();
  const assets = assetNames.map((name) => fileIdentity(path.join(ROOT, 'dist_electron', name)));
  return { repo, tag, targetSha, integrationBase, title: `哈基米画布 ${tag}`, bodyMarker, notesFile, assets };
}

function resolveRemoteRef(ref) {
  const text = String(git(['ls-remote', 'origin', ref, `${ref}^{}`], { allowFailure: true }).stdout || '');
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/));
  return rows.find((row) => row[1] === `${ref}^{}`)?.[0] || rows.find((row) => row[1] === ref)?.[0] || null;
}

function releaseJson() {
  const result = gh(['api', `repos/${repo}/releases/tags/${tag}`], { allowFailure: true });
  if (result.status !== 0) {
    if (/HTTP 404|Not Found/i.test(String(result.stderr || ''))) return null;
    fail(`unable to read release: ${String(result.stderr || '').trim()}`);
  }
  return JSON.parse(String(result.stdout));
}

function downloadAsset(name, directory) {
  gh(['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', directory]);
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) fail(`downloaded release asset is missing: ${name}`);
  return fileIdentity(file);
}

function readRemoteState(desired, { hashAssets = true } = {}) {
  const mainSha = resolveRemoteRef('refs/heads/main');
  const tagSha = resolveRemoteRef(`refs/tags/${tag}`);
  const raw = releaseJson();
  let release = null;
  if (raw) {
    const expectedNames = new Set(desired.assets.map((asset) => asset.name));
    const remoteNames = (raw.assets || []).map((asset) => asset.name);
    if (new Set(remoteNames).size !== remoteNames.length) fail('duplicate remote release asset name');
    const temp = hashAssets && remoteNames.length ? fs.mkdtempSync(path.join(os.tmpdir(), 't8-release-read-')) : null;
    try {
      const assets = remoteNames.map((name) => {
        if (!expectedNames.has(name)) return { name, size: -1, sha256: '' };
        if (!hashAssets) return { name, size: Number((raw.assets || []).find((asset) => asset.name === name)?.size || 0), sha256: '' };
        const identity = downloadAsset(name, temp);
        return { name, size: identity.size, sha256: identity.sha256 };
      });
      release = { id: Number(raw.id), tagName: raw.tag_name, targetSha: tagSha, title: raw.name, body: raw.body || '', isDraft: Boolean(raw.draft), assets };
    } finally { if (temp) fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return { mainSha, tagSha, release, competingPublished: Boolean(release && !release.isDraft && release.tagName !== desired.tag) };
}

function assertApproval(mode) {
  if (mode === 'status' || mode === 'dry-run' || mode === 'verify-draft' || mode === 'verify-public') return;
  if (process.env.T8_RELEASE_APPROVAL !== approval) fail(`T8_RELEASE_APPROVAL must equal ${approval}`);
}

function createAdapter(desired) {
  return {
    async pushMain(action) {
      const current = resolveRemoteRef('refs/heads/main');
      if (current !== action.from) fail('remote main changed immediately before push');
      git(['push', 'origin', `${action.to}:refs/heads/main`]);
    },
    async createTag(action) {
      const remoteTag = resolveRemoteRef(`refs/tags/${action.tag}`);
      if (remoteTag && remoteTag !== action.targetSha) fail('remote tag target mismatch');
      const local = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${action.tag}^{}`], { allowFailure: true });
      if (local.status === 0 && String(local.stdout).trim() !== action.targetSha) fail('local tag target mismatch; retarget is forbidden');
      if (local.status !== 0) git(['tag', action.tag, action.targetSha]);
      git(['push', 'origin', `refs/tags/${action.tag}:refs/tags/${action.tag}`]);
    },
    async createDraft() {
      gh(['release', 'create', desired.tag, '--repo', desired.repo, '--target', desired.targetSha, '--draft', '--title', desired.title, '--notes-file', desired.notesFile]);
      const created = releaseJson();
      return { releaseId: Number(created?.id) };
    },
    async uploadAsset(action) {
      const local = desired.assets.find((asset) => asset.name === action.asset.name);
      if (!local || local.size !== action.asset.size || local.sha256 !== action.asset.sha256) fail('local release asset identity changed before upload');
      gh(['release', 'upload', desired.tag, local.path, '--repo', desired.repo]);
    },
    async downloadAndHash(asset) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-release-verify-'));
      try { const identity = downloadAsset(asset.name, temp); return { size: identity.size, sha256: identity.sha256 }; }
      finally { fs.rmSync(temp, { recursive: true, force: true }); }
    },
    async publishRelease() {
      const current = readRemoteState(desired);
      if (current.mainSha !== desired.targetSha || current.tagSha !== desired.targetSha) fail('source identity changed immediately before publish');
      gh(['release', 'edit', desired.tag, '--repo', desired.repo, '--draft=false', '--latest']);
    },
    async verifyPublic() {
      run(process.execPath, [path.join(ROOT, 'scripts', 'verify-github-release.cjs'), '--state', activeStatePath, '--expect', 'public']);
    },
    async withdrawRelease(action) {
      gh(['api', '--method', 'PATCH', `repos/${desired.repo}/releases/${action.releaseId}`, '-f', 'draft=true', '-f', 'make_latest=false']);
    },
  };
}

let activeStatePath = '';

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  activeStatePath = parsed.state;
  assertApproval(parsed.mode);
  const state = readJson(parsed.state);
  if (RELEASE_SOURCE_GATE_MODES.has(parsed.mode)) assertCleanTree();
  const desired = desiredRelease(state);
  if (RELEASE_SOURCE_GATE_MODES.has(parsed.mode)) runReleaseSecretGate(parsed.state, desired);
  const remote = readRemoteState(desired, { hashAssets: parsed.mode !== 'status' });
  const record = state.releaseRecord || null;
  try {
    const result = await executeReleaseMode({ mode: parsed.mode, desired, remote, record, adapter: createAdapter(desired) });
    if (parsed.mode !== 'status' && parsed.mode !== 'dry-run') writeJsonAtomic(parsed.state, { ...state, releaseRecord: result.record });
    process.stdout.write(`${JSON.stringify({ mode: parsed.mode, desired: { ...desired, notesFile: undefined, assets: desired.assets.map(({ path: _path, ...asset }) => asset) }, remote, plan: result.plan }, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (parsed.mode === 'verify-public') writeJsonAtomic(parsed.state, { ...state, releaseRecord: { ...(record || {}), repo: desired.repo, tag: desired.tag, targetSha: desired.targetSha, publicVerificationFailed: true } });
    throw error;
  }
}

module.exports = { main, parseArgs, readRemoteState, desiredRelease, createAdapter };

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`[release] ${error.message}\n`); process.exitCode = 1; });
