import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { planRelease } = require('../scripts/lib/release-state.cjs');
const { executeReleaseMode } = require('../scripts/lib/release-operations.cjs');

const sha = (char: string) => char.repeat(40);
const hash = (char: string) => char.repeat(64);
const desired = {
  repo: 'keroro900/hajimi-penguin-canvas',
  tag: 'v2.4.0',
  targetSha: sha('b'),
  integrationBase: sha('a'),
  title: '哈基米画布 v2.4.0',
  bodyMarker: '<!-- t8-release:v2.4.0 -->',
  assets: [
    { name: 'JIMI AI-Setup-2.4.0.exe', size: 10, sha256: hash('1') },
    { name: 'JIMI AI-Setup-2.4.0.exe.blockmap', size: 20, sha256: hash('2') },
    { name: 'latest.yml', size: 30, sha256: hash('3') },
  ],
};

const remote = (patch: Record<string, unknown> = {}) => ({
  mainSha: desired.integrationBase,
  tagSha: null,
  release: null,
  competingPublished: false,
  ...patch,
});

test('source and tag plans are fast-forward-only and never force or retarget', () => {
  const push = planRelease({ mode: 'prepare-draft', desired, remote: remote(), record: null });
  assert.deepEqual(push.actions, [{ type: 'push-main', from: desired.integrationBase, to: desired.targetSha }]);

  const tag = planRelease({ mode: 'prepare-draft', desired, remote: remote({ mainSha: desired.targetSha }), record: { targetSha: desired.targetSha } });
  assert.deepEqual(tag.actions, [{ type: 'create-tag', tag: desired.tag, targetSha: desired.targetSha }]);
  assert.equal(JSON.stringify([push, tag]).includes('force'), false);
  assert.equal(JSON.stringify([push, tag]).includes('retarget'), false);

  assert.throws(() => planRelease({ mode: 'prepare-draft', desired, remote: remote({ mainSha: sha('c') }), record: null }), /non-fast-forward|remote main/i);
  assert.throws(() => planRelease({ mode: 'prepare-draft', desired, remote: remote({ mainSha: desired.targetSha, tagSha: sha('c') }), record: null }), /tag target mismatch/i);
});

test('draft planning resumes missing assets and rejects every identity or hash mismatch', () => {
  const baseRelease = {
    id: 42,
    tagName: desired.tag,
    targetSha: desired.targetSha,
    title: desired.title,
    body: desired.bodyMarker,
    isDraft: true,
    assets: [],
  };
  const sourceReady = remote({ mainSha: desired.targetSha, tagSha: desired.targetSha });
  assert.deepEqual(
    planRelease({ mode: 'prepare-draft', desired, remote: sourceReady, record: { targetSha: desired.targetSha } }).actions,
    [{ type: 'create-draft' }],
  );

  const oneAsset = { ...baseRelease, assets: [desired.assets[0]] };
  const resume = planRelease({ mode: 'prepare-draft', desired, remote: remote({ ...sourceReady, release: oneAsset }), record: { targetSha: desired.targetSha, releaseId: 42 } });
  assert.deepEqual(resume.actions, desired.assets.slice(1).map((asset) => ({ type: 'upload-asset', releaseId: 42, asset })));
  assert.equal(JSON.stringify(resume).includes('clobber'), false);

  const badCases = [
    { ...baseRelease, tagName: 'v9.9.9' },
    { ...baseRelease, targetSha: sha('c') },
    { ...baseRelease, title: 'wrong' },
    { ...baseRelease, body: 'missing marker' },
    { ...baseRelease, assets: [{ ...desired.assets[0], sha256: hash('f') }] },
  ];
  for (const release of badCases) {
    assert.throws(() => planRelease({ mode: 'prepare-draft', desired, remote: remote({ ...sourceReady, release }), record: { targetSha: desired.targetSha, releaseId: 42 } }), /identity|hash|marker|title|target|tag/i);
  }
  assert.throws(() => planRelease({ mode: 'prepare-draft', desired, remote: remote({ ...sourceReady, competingPublished: true }), record: {} }), /competing published/i);
});

test('draft verification, publish, public verification, and containment have disjoint actions', () => {
  const release = {
    id: 42,
    tagName: desired.tag,
    targetSha: desired.targetSha,
    title: desired.title,
    body: desired.bodyMarker,
    isDraft: true,
    assets: desired.assets,
  };
  const ready = remote({ mainSha: desired.targetSha, tagSha: desired.targetSha, release });

  const verify = planRelease({ mode: 'verify-draft', desired, remote: ready, record: { targetSha: desired.targetSha, releaseId: 42 } });
  assert.deepEqual(verify.actions, [{ type: 'download-verify-assets', releaseId: 42, assets: desired.assets }]);

  assert.throws(() => planRelease({ mode: 'publish', desired, remote: ready, record: { targetSha: desired.targetSha, releaseId: 42 } }), /draft verification/i);
  const publish = planRelease({ mode: 'publish', desired, remote: ready, record: { targetSha: desired.targetSha, releaseId: 42, draftVerified: true } });
  assert.deepEqual(publish.actions, [{ type: 'publish-release', releaseId: 42 }]);

  const publicRelease = { ...release, isDraft: false };
  const publicRemote = remote({ mainSha: desired.targetSha, tagSha: desired.targetSha, release: publicRelease });
  assert.deepEqual(planRelease({ mode: 'verify-public', desired, remote: publicRemote, record: { targetSha: desired.targetSha, releaseId: 42 } }).actions, [{ type: 'verify-public', releaseId: 42, assets: desired.assets }]);
  assert.deepEqual(planRelease({ mode: 'contain', desired, remote: publicRemote, record: { targetSha: desired.targetSha, releaseId: 42, publicVerificationFailed: true } }).actions, [{ type: 'withdraw-release', releaseId: 42 }]);
});

test('release command adapter keeps prepare, verify, publish, and contain mutations disjoint', async () => {
  const calls: string[] = [];
  const adapter = {
    pushMain: async () => calls.push('push-main'),
    createTag: async () => calls.push('create-tag'),
    createDraft: async () => { calls.push('create-draft'); return { releaseId: 42 }; },
    uploadAsset: async () => calls.push('upload-asset'),
    downloadAndHash: async (asset: any) => { calls.push('download-verify'); return { size: asset.size, sha256: asset.sha256 }; },
    publishRelease: async () => calls.push('publish-release'),
    verifyPublic: async () => calls.push('verify-public'),
    withdrawRelease: async () => calls.push('withdraw-release'),
  };
  const release = { id: 42, tagName: desired.tag, targetSha: desired.targetSha, title: desired.title, body: desired.bodyMarker, isDraft: true, assets: desired.assets };
  const ready = remote({ mainSha: desired.targetSha, tagSha: desired.targetSha, release });

  await executeReleaseMode({ mode: 'verify-draft', desired, remote: ready, record: { targetSha: desired.targetSha, releaseId: 42 }, adapter });
  assert.deepEqual(calls, ['download-verify', 'download-verify', 'download-verify']);
  calls.length = 0;

  await executeReleaseMode({ mode: 'publish', desired, remote: ready, record: { targetSha: desired.targetSha, releaseId: 42, draftVerified: true }, adapter });
  assert.deepEqual(calls, ['publish-release']);
  calls.length = 0;

  const publicRemote = remote({ mainSha: desired.targetSha, tagSha: desired.targetSha, release: { ...release, isDraft: false } });
  await executeReleaseMode({ mode: 'verify-public', desired, remote: publicRemote, record: { targetSha: desired.targetSha, releaseId: 42 }, adapter });
  assert.deepEqual(calls, ['verify-public']);
  calls.length = 0;

  await executeReleaseMode({ mode: 'contain', desired, remote: publicRemote, record: { targetSha: desired.targetSha, releaseId: 42, publicVerificationFailed: true }, adapter });
  assert.deepEqual(calls, ['withdraw-release']);
});

test('dry-run returns the exact plan without invoking a remote adapter', async () => {
  const result = await executeReleaseMode({
    mode: 'dry-run',
    desired,
    remote: remote(),
    record: null,
    adapter: new Proxy({}, { get() { throw new Error('adapter must not be read'); } }),
  });
  assert.deepEqual(result.plan.actions, [{ type: 'push-main', from: desired.integrationBase, to: desired.targetSha }]);
});
