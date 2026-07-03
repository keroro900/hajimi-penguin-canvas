import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeUpstreamMaterialBuckets } from '../src/utils/upstreamMaterialBuckets.ts';

const text = (id: string, url: string, sourceNodeId = 'group-a') => ({
  id,
  kind: 'text',
  url,
  sourceNodeId,
  origin: 'upstream',
  label: url,
});

const image = (id: string, url: string, sourceNodeId = 'image-a', mentionKey?: string) => ({
  id,
  kind: 'image',
  url,
  sourceNodeId,
  origin: 'upstream',
  label: url,
  mentionKey,
});

test('group output text field echoes are shown once in downstream image nodes', () => {
  const buckets = dedupeUpstreamMaterialBuckets({
    texts: [
      text('group-a::text-field:group-a:reply', '你在干嘛呢?'),
      text('group-a::text-field:group-a:prompt', '你在干嘛呢?'),
      text('group-a::text-field:group-a:text', '你在干嘛呢?'),
      text('text-b::text-field:text-b:prompt', '你在干嘛呢?', 'text-b'),
    ],
    images: [],
    videos: [],
    audios: [],
  });

  assert.deepEqual(
    buckets.texts.map((item) => item.id),
    ['group-a::text-field:group-a:reply', 'text-b::text-field:text-b:prompt'],
  );
});

test('manual ordered text entries keep duplicate content when they are not field echoes', () => {
  const buckets = dedupeUpstreamMaterialBuckets({
    texts: [
      text('material-set-a::material-set:material-set-a:text:0', '重复强调', 'material-set-a'),
      text('material-set-a::material-set:material-set-a:text:1', '重复强调', 'material-set-a'),
    ],
    images: [],
    videos: [],
    audios: [],
  });

  assert.deepEqual(
    buckets.texts.map((item) => item.id),
    [
      'material-set-a::material-set:material-set-a:text:0',
      'material-set-a::material-set:material-set-a:text:1',
    ],
  );
});

test('single image echoed through scalar and array fields is shown once downstream', () => {
  const buckets = dedupeUpstreamMaterialBuckets({
    texts: [],
    images: [
      image('image-a::imageUrl', '/files/input/ref-a.png', 'image-a', 'image:image-a:imageUrl'),
      image('image-a::imageUrls:0', '/files/input/ref-a.png', 'image-a', 'image:image-a:imageUrls:0'),
      image('image-a::imageUrls:1', '/files/input/ref-b.png', 'image-a', 'image:image-a:imageUrls:1'),
    ],
    videos: [],
    audios: [],
  });

  assert.deepEqual(
    buckets.images.map((item) => item.id),
    ['image-a::imageUrl', 'image-a::imageUrls:1'],
  );
  assert.equal((buckets.images[0] as any).mentionKey, 'image:image-a:imageUrl');
});

test('same scalar field from different upstream nodes keeps both media items', () => {
  const buckets = dedupeUpstreamMaterialBuckets({
    texts: [],
    images: [
      image('image-a::imageUrl', '/files/input/a.png', 'image-a', 'image:image-a:imageUrl'),
      image('image-b::imageUrl', '/files/input/b.png', 'image-b', 'image:image-b:imageUrl'),
    ],
    videos: [],
    audios: [],
  });

  assert.deepEqual(
    buckets.images.map((item) => item.id),
    ['image-a::imageUrl', 'image-b::imageUrl'],
  );
});
