'use strict';

const { planRelease } = require('./release-state.cjs');

function requireMethod(adapter, name) {
  if (!adapter || typeof adapter[name] !== 'function') throw new Error(`release adapter method is unavailable: ${name}`);
  return adapter[name].bind(adapter);
}

async function executeReleaseMode({ mode, desired, remote, record, adapter }) {
  const plan = planRelease({ mode, desired, remote, record });
  const nextRecord = {
    ...(record || {}),
    repo: desired.repo,
    tag: desired.tag,
    targetSha: desired.targetSha,
  };

  if (mode === 'dry-run' || mode === 'status') return { plan, record: nextRecord };

  for (const action of plan.actions) {
    if (action.type === 'push-main') await requireMethod(adapter, 'pushMain')(action);
    else if (action.type === 'create-tag') await requireMethod(adapter, 'createTag')(action);
    else if (action.type === 'create-draft') {
      const created = await requireMethod(adapter, 'createDraft')({ desired });
      if (!Number.isSafeInteger(Number(created?.releaseId)) || Number(created.releaseId) <= 0) throw new Error('draft adapter did not return a valid release database identity');
      nextRecord.releaseId = Number(created.releaseId);
    } else if (action.type === 'upload-asset') await requireMethod(adapter, 'uploadAsset')(action);
    else if (action.type === 'download-verify-assets') {
      const downloadAndHash = requireMethod(adapter, 'downloadAndHash');
      for (const asset of action.assets) {
        const actual = await downloadAndHash(asset, { releaseId: action.releaseId });
        if (actual?.size !== asset.size || actual?.sha256 !== asset.sha256) throw new Error(`downloaded release asset hash mismatch: ${asset.name}`);
      }
      nextRecord.releaseId = action.releaseId;
      nextRecord.draftVerified = true;
      nextRecord.draftVerifiedAt = new Date().toISOString();
    } else if (action.type === 'publish-release') {
      await requireMethod(adapter, 'publishRelease')(action);
      nextRecord.published = true;
    } else if (action.type === 'verify-public') {
      await requireMethod(adapter, 'verifyPublic')(action);
      nextRecord.publicVerified = true;
      nextRecord.publicVerificationFailed = false;
    } else if (action.type === 'withdraw-release') {
      await requireMethod(adapter, 'withdrawRelease')(action);
      nextRecord.withdrawn = true;
    } else throw new Error(`unsupported release action: ${action.type}`);
  }

  return { plan, record: nextRecord };
}

module.exports = { executeReleaseMode };
