#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const version = pkg.version;
const configuredRepo = `${pkg.build.publish[0].owner}/${pkg.build.publish[0].repo}`;
const repo = process.env.T8_RELEASE_REPO || '';
const tag = process.env.T8_RELEASE_TAG || `v${version}`;
const assetNames = [`${pkg.build.productName}-Setup-${version}.exe`, `${pkg.build.productName}-Setup-${version}.exe.blockmap`, 'latest.yml'];

function fail(message) { throw new Error(message); }
function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) fail(`${command} ${args.join(' ')} failed (${result.status}): ${String(result.stderr || '').trim()}`);
  return result;
}
function gh(args, options) { return run('gh', args, options); }
function git(args, options) { return run('git', args, options); }

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!['--state', '--expect'].includes(key) || !argv[index + 1] || argv[index + 1].startsWith('--') || values[key]) fail('supported options: --state <path> --expect <draft|public>');
    values[key] = argv[index + 1];
  }
  if (!values['--state'] || !['draft', 'public'].includes(values['--expect'])) fail('--state and --expect draft|public are required');
  return { state: path.resolve(values['--state']), expect: values['--expect'] };
}

function digest(file) {
  const data = fs.readFileSync(file);
  return { size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}

function remoteRef(ref) {
  const result = git(['ls-remote', 'origin', ref, `${ref}^{}`]);
  const rows = String(result.stdout).trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/));
  return rows.find((row) => row[1] === `${ref}^{}`)?.[0] || rows.find((row) => row[1] === ref)?.[0] || null;
}

function main(argv = process.argv.slice(2)) {
  const { state: statePath, expect } = parseArgs(argv);
  if (repo !== configuredRepo) fail(`T8_RELEASE_REPO must equal ${configuredRepo}`);
  if (tag !== `v${version}`) fail(`T8_RELEASE_TAG must equal v${version}`);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const targetSha = String(state.releaseRecord?.targetSha || '').trim();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(targetSha)) fail('sealed release target SHA is missing from state');
  if (remoteRef('refs/heads/main') !== targetSha) fail('remote main does not match sealed source');
  if (remoteRef(`refs/tags/${tag}`) !== targetSha) fail('remote tag does not match sealed source');

  const releaseResult = gh(['api', `repos/${repo}/releases/tags/${tag}`]);
  const release = JSON.parse(String(releaseResult.stdout));
  if (Boolean(release.draft) !== (expect === 'draft')) fail(`release visibility mismatch: expected ${expect}`);
  if (Number(release.id) !== Number(state.releaseRecord?.releaseId)) fail('release database identity mismatch');
  if (release.tag_name !== tag || release.name !== `哈基米画布 ${tag}` || !String(release.body || '').includes(`<!-- t8-release:${tag} -->`)) fail('release metadata identity mismatch');
  const names = (release.assets || []).map((asset) => asset.name).sort();
  assertExactAssets(names, [...assetNames].sort());

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-public-verify-'));
  try {
    for (const name of assetNames) {
      gh(['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', temp]);
      const downloaded = path.join(temp, name);
      const local = path.join(ROOT, 'dist_electron', name);
      if (!fs.existsSync(downloaded) || !fs.existsSync(local)) fail(`missing release asset: ${name}`);
      const actual = digest(downloaded);
      const expectedIdentity = digest(local);
      if (actual.size !== expectedIdentity.size || actual.sha256 !== expectedIdentity.sha256) fail(`release asset hash mismatch: ${name}`);
    }
    const latest = fs.readFileSync(path.join(temp, 'latest.yml'), 'utf8');
    if (!new RegExp(`version:\\s*${version.replaceAll('.', '\\.')}`).test(latest) || !latest.includes(assetNames[0])) fail('downloaded latest.yml identity mismatch');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }

  process.stdout.write(`${JSON.stringify({ repo, tag, targetSha, releaseId: Number(release.id), visibility: expect, assets: assetNames }, null, 2)}\n`);
  return 0;
}

function assertExactAssets(actual, expected) {
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) fail(`missing release asset or unexpected release asset: expected ${expected.join(', ')}`);
}

module.exports = { main, parseArgs, assertExactAssets };

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { process.stderr.write(`[verify-release] ${error.message}\n`); process.exitCode = 1; }
}
