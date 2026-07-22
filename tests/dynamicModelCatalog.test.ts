import test from 'node:test';
import assert from 'node:assert/strict';
import { modelsForKind, effectiveModelId } from '../src/providers/modelCatalog.ts';
import {
  decodeLlmModelChoice,
  imageModelDefFor,
  llmModelChoicesFromSettings,
  resolveConfiguredLlmChoice,
} from '../src/providers/models.ts';
import * as canvasPlan from '../backend/src/utils/canvasPlan.js';

const settings: any = {
  zhenzhenModelCatalog: {
    all: ['image-real', 'video-real', 'audio-real', 'chat-real', 'mystery-real'],
    imageModels: ['image-real'],
    videoModels: ['video-real'],
    audioModels: ['audio-real'],
    chatModels: ['chat-real'],
    unknownModels: ['mystery-real'],
    manualModels: ['manual-real'],
    typeOverrides: { 'manual-real': 'audio', 'mystery-real': 'video' },
  },
};

test('dynamic model catalog includes unknown models until the user classifies them', () => {
  assert.deepEqual(modelsForKind(settings, 'image'), ['image-real']);
  assert.deepEqual(modelsForKind(settings, 'video'), ['video-real', 'mystery-real']);
  assert.deepEqual(modelsForKind(settings, 'audio'), ['audio-real', 'manual-real']);
  assert.deepEqual(modelsForKind(settings, 'chat'), ['chat-real']);
});

test('saved real model ids pass through even while the catalog refreshes', () => {
  assert.equal(effectiveModelId('upstream-exact-model', ['another-model']), 'upstream-exact-model');
  assert.equal(effectiveModelId('', ['first-live-model']), 'first-live-model');
});

test('LLM model choices keep common and independent catalogs as separate request sources', () => {
  const dualSettings: any = {
    zhenzhenModelCatalog: {
      all: ['common-chat', 'shared-chat'],
      imageModels: [], videoModels: [], audioModels: [],
      chatModels: ['common-chat', 'shared-chat'], unknownModels: [],
    },
    llmModelCatalog: {
      all: ['direct-chat', 'shared-chat'],
      imageModels: [], videoModels: [], audioModels: [],
      chatModels: ['direct-chat', 'shared-chat'], unknownModels: [],
    },
  };

  const choices = llmModelChoicesFromSettings(dualSettings);
  assert.deepEqual(choices.map((choice) => [choice.model, choice.source]), [
    ['direct-chat', 'llm-direct'],
    ['shared-chat', 'llm-direct'],
    ['common-chat', 'zhenzhen'],
    ['shared-chat', 'zhenzhen'],
  ]);
  assert.deepEqual(decodeLlmModelChoice(choices[2].value), { model: 'common-chat', source: 'zhenzhen' });
  assert.deepEqual(resolveConfiguredLlmChoice('shared-chat', 'zhenzhen', dualSettings), {
    model: 'shared-chat', source: 'zhenzhen', value: 'zhenzhen::shared-chat',
  });
});

test('dynamic Gemini image models use Gemini ratio and resolution parameters', () => {
  const byName = imageModelDefFor('gemini-3.1-flash-image-preview');
  const byProtocol = imageModelDefFor('custom-image-model', 'gemini-generate-content');

  assert.equal(byName.paramKind, 'banana-ratio');
  assert.equal(byProtocol.paramKind, 'banana-ratio');
  assert.deepEqual(byName.sizes, ['1K', '2K', '4K']);
});

test('canvas planning does not expose a built-in model registry', () => {
  assert.equal('IMAGE_MODEL_REGISTRY' in canvasPlan, false);
  assert.equal('VIDEO_MODEL_REGISTRY' in canvasPlan, false);
});
