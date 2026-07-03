import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOutputMediaRemovalData,
  createUploadDataFromItems,
  createUploadMediaRemovalData,
  createUploadReplacementData,
  mediaDownloadFileName,
} from '../src/utils/mediaCollection.ts';

test('createUploadReplacementData clears stale upload media fields when replacing kind', () => {
  const original = createUploadDataFromItems('image', [
    { kind: 'image', url: '/files/input/a.png', name: 'a.png', size: 100, mime: 'image/png' },
  ]);
  const replacement = createUploadReplacementData('video', [
    { kind: 'video', url: '/files/input/b.mp4', name: 'b.mp4', size: 200, mime: 'video/mp4' },
  ]);
  const merged = { ...original, ...replacement };

  assert.equal(merged.uploadType, 'video');
  assert.equal(merged.videoUrl, '/files/input/b.mp4');
  assert.deepEqual(merged.videoUrls, ['/files/input/b.mp4']);
  assert.equal(merged.imageUrl, undefined);
  assert.deepEqual(merged.imageUrls, []);
  assert.equal(merged.audioUrl, undefined);
  assert.deepEqual(merged.audioUrls, []);
  assert.equal(merged.fileName, 'b.mp4');
  assert.deepEqual(merged.fileNames, ['b.mp4']);
});

test('createUploadReplacementData preserves same-kind pasted collections', () => {
  const replacement = createUploadReplacementData('image', [
    { kind: 'image', url: '/files/input/a.png', name: 'a.png' },
    { kind: 'image', url: '/files/input/b.png', name: 'b.png' },
  ]);

  assert.equal(replacement.uploadType, 'image');
  assert.equal(replacement.imageUrl, '/files/input/a.png');
  assert.deepEqual(replacement.imageUrls, ['/files/input/a.png', '/files/input/b.png']);
  assert.deepEqual(replacement.fileNames, ['a.png', 'b.png']);
});

test('createUploadMediaRemovalData removes one uploaded material and preserves remaining metadata', () => {
  const original = createUploadDataFromItems('image', [
    { kind: 'image', url: '/files/input/a.png', name: 'a.png', size: 100, mime: 'image/png' },
    { kind: 'image', url: '/files/input/b.png', name: 'b.png', size: 200, mime: 'image/png' },
    { kind: 'image', url: '/files/input/c.png', name: 'c.png', size: 300, mime: 'image/png' },
  ]);

  const patch = createUploadMediaRemovalData(original, 'image', 1);

  assert.equal(patch.uploadType, 'image');
  assert.equal(patch.imageUrl, '/files/input/a.png');
  assert.deepEqual(patch.imageUrls, ['/files/input/a.png', '/files/input/c.png']);
  assert.deepEqual(patch.fileNames, ['a.png', 'c.png']);
  assert.deepEqual(patch.fileSizes, [100, 300]);
  assert.deepEqual(patch.mimes, ['image/png', 'image/png']);
});

test('createUploadMediaRemovalData clears stale fields after deleting the last material', () => {
  const original = createUploadDataFromItems('video', [
    { kind: 'video', url: '/files/input/a.mp4', name: 'a.mp4', size: 100, mime: 'video/mp4' },
  ]);

  const patch = createUploadMediaRemovalData(original, 'video', 0);

  assert.equal(patch.uploadType, null);
  assert.equal(patch.videoUrl, undefined);
  assert.deepEqual(patch.videoUrls, []);
  assert.equal(patch.fileName, '');
  assert.deepEqual(patch.fileNames, []);
});

test('createOutputMediaRemovalData removes output material fields and records hidden live URL', () => {
  const patch = createOutputMediaRemovalData(
    {
      imageUrl: '/files/output/a.png',
      imageUrls: ['/files/output/a.png', '/files/output/b.png'],
      urls: ['/files/output/a.png', '/files/output/b.png'],
      directImageUrl: '/files/output/a.png',
      directImageUrls: ['/files/output/a.png', '/files/output/b.png'],
      hiddenMaterialUrls: { image: ['/files/output/old.png'] },
    },
    'image',
    '/files/output/a.png',
  );

  assert.equal(patch.imageUrl, '/files/output/b.png');
  assert.deepEqual(patch.imageUrls, ['/files/output/b.png']);
  assert.deepEqual(patch.urls, ['/files/output/b.png']);
  assert.equal(patch.directImageUrl, '/files/output/b.png');
  assert.deepEqual(patch.directImageUrls, ['/files/output/b.png']);
  assert.deepEqual(patch.hiddenMaterialUrls.image, ['/files/output/old.png', '/files/output/a.png']);
});

test('mediaDownloadFileName preserves existing media file extensions', () => {
  const name = mediaDownloadFileName('image', '/files/output/final%20render.webp?token=abc', 0);

  assert.equal(name, 'final render.webp');
});

test('mediaDownloadFileName adds a media extension when URL basename has none', () => {
  assert.equal(
    mediaDownloadFileName('image', '/files/output/3485ad8a-59b5-48f6-889a-19455926e258', 0),
    '3485ad8a-59b5-48f6-889a-19455926e258.png',
  );
  assert.equal(mediaDownloadFileName('video', '/api/files/output/result', 1), 'result.mp4');
  assert.equal(mediaDownloadFileName('audio', '/api/files/output/result', 1), 'result.mp3');
  assert.equal(mediaDownloadFileName('model3d', '/api/files/output/result', 1), 'result.glb');
});

test('mediaDownloadFileName uses mime-specific extensions and safe fallback names', () => {
  assert.equal(mediaDownloadFileName('image', 'blob:http://localhost/123', 2, 'image/webp'), 't8-output-image-3.webp');
  assert.equal(mediaDownloadFileName('audio', '/api/files/output/name', 0, 'audio/wav'), 'name.wav');
  assert.equal(mediaDownloadFileName('image', '/api/files/output/a:b?c', 0), 'a_b.png');
});
