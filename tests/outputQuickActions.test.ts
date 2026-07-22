import test from 'node:test';
import assert from 'node:assert/strict';

const loadQuickActions = async () => import('../src/utils/outputQuickActions.ts');

test('image surface exposes save, edit, grid, layer agent, image-to-video, clip and director actions', async () => {
  const { buildOutputQuickActions } = await loadQuickActions();

  const actions = buildOutputQuickActions({
    surface: 'image',
    url: '/api/resources/file/a.png',
    hasImageEditor: true,
    hasGridEditor: true,
    hasLayerAgent: true,
    hasImageToVideo: true,
    hasClipStudio: true,
    hasDirector: false,
  });

  assert.deepEqual(actions.map((action) => action.id), [
    'save-resource',
    'image-edit',
    'grid-edit',
    'layer-agent',
    'image-to-video',
    'clip-studio',
    'director',
  ]);
  assert.equal(actions.find((action) => action.id === 'save-resource')?.enabled, true);
  assert.equal(actions.find((action) => action.id === 'image-edit')?.label, '图像编辑');
  assert.equal(actions.find((action) => action.id === 'layer-agent')?.label, 'AI分层');
  assert.equal(actions.find((action) => action.id === 'director')?.enabled, false);
  assert.equal(actions.find((action) => action.id === 'director')?.disabledReason, '导演台入口暂未接入');
});

test('video surface exposes resource, clip and director actions with disabled reasons', async () => {
  const { buildOutputQuickActions } = await loadQuickActions();

  const actions = buildOutputQuickActions({
    surface: 'video',
    url: '/api/resources/file/b.mp4',
    hasClipStudio: true,
    hasDirector: false,
  });

  assert.deepEqual(actions.map((action) => [action.id, action.enabled, action.disabledReason || '']), [
    ['save-resource', true, ''],
    ['clip-studio', true, ''],
    ['director', false, '导演台入口暂未接入'],
  ]);
});

test('text and audio surfaces keep unsupported next-step actions disabled', async () => {
  const { buildOutputQuickActions } = await loadQuickActions();

  assert.deepEqual(
    buildOutputQuickActions({ surface: 'text', text: 'hello' }).map((action) => [action.id, action.enabled, action.disabledReason || '']),
    [
      ['save-resource', false, '文本资源库入口暂未接入'],
      ['image-edit', false, '需要图像素材'],
      ['grid-edit', false, '需要图像素材'],
      ['layer-agent', false, '需要图像素材'],
      ['image-to-video', false, '需要图像素材'],
      ['clip-studio', false, '需要图像或视频素材'],
      ['director', false, '导演台入口暂未接入'],
    ],
  );
  assert.deepEqual(
    buildOutputQuickActions({ surface: 'audio', url: '/api/resources/file/c.wav' }).map((action) => [action.id, action.enabled, action.disabledReason || '']),
    [
      ['save-resource', true, ''],
      ['clip-studio', false, '剪辑台暂不支持音频直送'],
      ['director', false, '导演台入口暂未接入'],
    ],
  );
});
