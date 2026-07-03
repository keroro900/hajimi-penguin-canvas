import test from 'node:test';
import assert from 'node:assert/strict';

const loadCapabilityCatalog = async () => import('../src/utils/capabilityCatalog.ts');
const loadCanvasTemplates = async () => import('../src/config/canvasTemplates.ts');

test('canvas templates expose catalog metadata without changing build behavior', async () => {
  const { CANVAS_TEMPLATES } = await loadCanvasTemplates();

  assert.equal(CANVAS_TEMPLATES.length >= 5, true);
  assert.equal(CANVAS_TEMPLATES.every((template) => template.category), true);
  assert.equal(CANVAS_TEMPLATES.every((template) => Array.isArray(template.tags) && template.tags.length > 0), true);
  assert.equal(CANVAS_TEMPLATES.every((template) => template.source?.kind === 'canvas-template'), true);

  const imageToVideo = CANVAS_TEMPLATES.find((template) => template.id === 'tpl-image-to-video');
  assert.ok(imageToVideo);
  assert.deepEqual(imageToVideo!.dependencies?.map((dependency) => dependency.id), ['text', 'image', 'video']);

  const built = imageToVideo!.build();
  assert.deepEqual(built.nodes.map((node) => node.type), ['text', 'image', 'video']);
  assert.equal(built.edges.length, 2);
});

test('catalog normalizes local canvas templates into categorized searchable cards', async () => {
  const {
    buildLocalTemplateCapabilityCards,
    filterCapabilityCards,
    groupCapabilityCardsByCategory,
  } = await loadCapabilityCatalog();
  const { CANVAS_TEMPLATES } = await loadCanvasTemplates();

  const cards = buildLocalTemplateCapabilityCards(CANVAS_TEMPLATES);
  assert.equal(cards.length, CANVAS_TEMPLATES.length);

  const imageToVideo = cards.find((card) => card.id === 'canvas-template:tpl-image-to-video');
  assert.ok(imageToVideo);
  assert.equal(imageToVideo!.sourceKind, 'canvas-template');
  assert.equal(imageToVideo!.categoryId, 'video');
  assert.equal(imageToVideo!.enabled, true);
  assert.deepEqual(imageToVideo!.dependencyBadges.map((badge) => badge.label), ['Text', 'Image', 'Video']);

  const grouped = groupCapabilityCardsByCategory(cards);
  assert.deepEqual(grouped.map((group) => group.category.id), ['image', 'video', 'prompt', 'storyboard', 'audio']);
  assert.deepEqual(grouped.find((group) => group.category.id === 'video')?.cards.map((card) => card.id), ['canvas-template:tpl-image-to-video']);

  assert.deepEqual(
    filterCapabilityCards(cards, { query: '扩写' }).map((card) => card.id),
    ['canvas-template:tpl-llm-rewrite'],
  );
  assert.deepEqual(
    filterCapabilityCards(cards, { categoryId: 'audio', query: 'music' }).map((card) => card.id),
    ['canvas-template:tpl-suno'],
  );
});

test('catalog reports dependency badges and disabled reasons from available dependency ids', async () => {
  const { buildLocalTemplateCapabilityCards } = await loadCapabilityCatalog();
  const { CANVAS_TEMPLATES } = await loadCanvasTemplates();

  const cards = buildLocalTemplateCapabilityCards(CANVAS_TEMPLATES, {
    availableDependencyIds: ['text', 'image'],
  });

  const textToImage = cards.find((card) => card.id === 'canvas-template:tpl-text-to-image');
  assert.ok(textToImage);
  assert.equal(textToImage!.enabled, true);
  assert.equal(textToImage!.disabledReason, undefined);

  const imageToVideo = cards.find((card) => card.id === 'canvas-template:tpl-image-to-video');
  assert.ok(imageToVideo);
  assert.equal(imageToVideo!.enabled, false);
  assert.equal(imageToVideo!.disabledReason, '缺少依赖：Video');
  assert.deepEqual(
    imageToVideo!.dependencyBadges.map((badge) => [badge.id, badge.available]),
    [
      ['text', true],
      ['image', true],
      ['video', false],
    ],
  );
});

test('catalog sorting can prioritize favorites and recent cards before default order', async () => {
  const { buildLocalTemplateCapabilityCards, sortCapabilityCardsForLibrary } = await loadCapabilityCatalog();
  const { CANVAS_TEMPLATES } = await loadCanvasTemplates();
  const cards = buildLocalTemplateCapabilityCards(CANVAS_TEMPLATES);

  const sorted = sortCapabilityCardsForLibrary(cards, {
    favoriteIds: ['canvas-template:tpl-suno'],
    recentIds: ['canvas-template:tpl-storyboard', 'canvas-template:tpl-text-to-image'],
  });

  assert.deepEqual(sorted.slice(0, 3).map((card) => card.id), [
    'canvas-template:tpl-suno',
    'canvas-template:tpl-storyboard',
    'canvas-template:tpl-text-to-image',
  ]);
  assert.deepEqual(
    sorted.filter((card) => card.isFavorite).map((card) => card.id),
    ['canvas-template:tpl-suno'],
  );
  assert.deepEqual(
    sorted.filter((card) => card.recentRank != null).map((card) => [card.id, card.recentRank]),
    [
      ['canvas-template:tpl-storyboard', 0],
      ['canvas-template:tpl-text-to-image', 1],
    ],
  );
});
