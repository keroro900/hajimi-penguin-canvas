'use strict';

const crypto = require('node:crypto');

const MODES = new Set(['status', 'dry-run', 'prepare-draft', 'verify-draft', 'publish', 'verify-public', 'contain']);

function fail(message) {
  throw new Error(message);
}

function isSha(value) {
  return /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(String(value || ''));
}

function validateDesiredRelease(desired) {
  if (!desired || typeof desired !== 'object') fail('desired release is required');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(desired.repo || '')) fail('invalid repository identity');
  if (!/^v\d+\.\d+\.\d+$/.test(desired.tag || '')) fail('invalid release tag');
  if (!isSha(desired.targetSha) || !isSha(desired.integrationBase)) fail('invalid source SHA');
  if (typeof desired.title !== 'string' || !desired.title.trim()) fail('release title is required');
  if (typeof desired.bodyMarker !== 'string' || !/^<!-- t8-release:v\d+\.\d+\.\d+ -->$/.test(desired.bodyMarker)) fail('invalid release body marker');
  if (!Array.isArray(desired.assets) || desired.assets.length !== 3) fail('exactly three release assets are required');
  const names = new Set();
  for (const asset of desired.assets) {
    if (!asset || typeof asset.name !== 'string' || !asset.name || names.has(asset.name)) fail('invalid or duplicate release asset name');
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) fail(`invalid release asset identity: ${asset.name}`);
    names.add(asset.name);
  }
  return desired;
}

function sameAsset(expected, actual) {
  return expected.name === actual.name && expected.size === actual.size && expected.sha256 === actual.sha256;
}

function validateRecord(record, desired, release) {
  if (!record) return;
  if (record.targetSha && record.targetSha !== desired.targetSha) fail('local release record target identity mismatch');
  if (record.repo && record.repo !== desired.repo) fail('local release record repository identity mismatch');
  if (record.tag && record.tag !== desired.tag) fail('local release record tag identity mismatch');
  if (record.releaseId !== undefined && release && Number(record.releaseId) !== Number(release.id)) fail('local release record release identity mismatch');
}

function validateReleaseIdentity(release, desired) {
  if (!release || typeof release !== 'object') fail('release identity is missing');
  if (release.tagName !== desired.tag) fail('release tag identity mismatch');
  if (release.targetSha !== desired.targetSha) fail('release target identity mismatch');
  if (release.title !== desired.title) fail('release title identity mismatch');
  if (typeof release.body !== 'string' || !release.body.includes(desired.bodyMarker)) fail('release body marker identity mismatch');
  if (!Number.isSafeInteger(Number(release.id)) || Number(release.id) <= 0) fail('release database identity mismatch');
  if (!Array.isArray(release.assets)) fail('release asset inventory is missing');
  const expected = new Map(desired.assets.map((asset) => [asset.name, asset]));
  const seen = new Set();
  for (const actual of release.assets) {
    if (!actual || seen.has(actual.name)) fail('duplicate remote release asset');
    seen.add(actual.name);
    const wanted = expected.get(actual.name);
    if (!wanted) fail(`unexpected remote release asset: ${actual.name}`);
    if (!sameAsset(wanted, actual)) fail(`remote release asset hash identity mismatch: ${actual.name}`);
  }
  return desired.assets.filter((asset) => !seen.has(asset.name));
}

function assertSource(remote, desired) {
  if (!remote || typeof remote !== 'object') fail('remote state is required');
  if (remote.competingPublished) fail('competing published release exists');
  if (!isSha(remote.mainSha)) fail('remote main identity is missing');
  if (remote.mainSha !== desired.targetSha) {
    if (remote.mainSha !== desired.integrationBase) fail('remote main changed; non-fast-forward push is forbidden');
    return [{ type: 'push-main', from: desired.integrationBase, to: desired.targetSha }];
  }
  if (!remote.tagSha) return [{ type: 'create-tag', tag: desired.tag, targetSha: desired.targetSha }];
  if (remote.tagSha !== desired.targetSha) fail('tag target mismatch; retarget is forbidden');
  return [];
}

function planRelease({ mode, desired: inputDesired, remote, record }) {
  if (!MODES.has(mode)) fail(`unsupported release mode: ${mode}`);
  const desired = validateDesiredRelease(inputDesired);
  validateRecord(record, desired, remote?.release);

  if (mode === 'status') return { mode, actions: [], summary: { mainSha: remote?.mainSha || null, tagSha: remote?.tagSha || null, releaseId: remote?.release?.id || null } };

  const sourceActions = assertSource(remote, desired);
  if (sourceActions.length) {
    if (!['prepare-draft', 'dry-run'].includes(mode)) fail('source and tag must be sealed before this operation');
    return { mode, actions: sourceActions };
  }

  if (!remote.release) {
    if (!['prepare-draft', 'dry-run'].includes(mode)) fail('owned draft release is required');
    return { mode, actions: [{ type: 'create-draft' }] };
  }

  const missingAssets = validateReleaseIdentity(remote.release, desired);
  validateRecord(record, desired, remote.release);

  if (mode === 'prepare-draft' || mode === 'dry-run') {
    if (remote.release.isDraft !== true) fail('existing release is already public');
    return { mode, actions: missingAssets.map((asset) => ({ type: 'upload-asset', releaseId: Number(remote.release.id), asset })) };
  }
  if (missingAssets.length) fail('release draft asset set is incomplete');

  if (mode === 'verify-draft') {
    if (remote.release.isDraft !== true) fail('draft verification requires a draft release');
    return { mode, actions: [{ type: 'download-verify-assets', releaseId: Number(remote.release.id), assets: desired.assets }] };
  }
  if (mode === 'publish') {
    if (remote.release.isDraft !== true) fail('release is already public');
    if (record?.draftVerified !== true) fail('draft verification evidence is required before publish');
    return { mode, actions: [{ type: 'publish-release', releaseId: Number(remote.release.id) }] };
  }
  if (mode === 'verify-public') {
    if (remote.release.isDraft !== false) fail('public verification requires a published release');
    return { mode, actions: [{ type: 'verify-public', releaseId: Number(remote.release.id), assets: desired.assets }] };
  }
  if (mode === 'contain') {
    if (remote.release.isDraft !== false) fail('containment requires a published release');
    if (record?.publicVerificationFailed !== true) fail('containment requires recorded public verification failure');
    return { mode, actions: [{ type: 'withdraw-release', releaseId: Number(remote.release.id) }] };
  }
  fail(`unsupported release mode: ${mode}`);
}

function hashFile(file, fs = require('node:fs')) {
  const data = fs.readFileSync(file);
  return { size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}

module.exports = { MODES, planRelease, validateDesiredRelease, validateReleaseIdentity, hashFile };
