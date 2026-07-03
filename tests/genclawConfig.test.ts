import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENCLAW_DEFAULT_IMAGE_MODEL,
  GENCLAW_DEFAULT_LLM_MODEL,
  GENCLAW_IMAGE_MODELS,
  GENCLAW_LLM_MODELS,
  GENCLAW_SYSTEM_PROMPT,
  resolveGenClawImageParams,
  resolveGenClawModelConfig,
} from '../src/genclaw/config.ts';
import { IMAGE_MODELS, LLM_MODELS } from '../src/providers/models.ts';

test('GenClaw reuses LLM and image node model registries', () => {
  assert.equal(GENCLAW_LLM_MODELS, LLM_MODELS);
  assert.ok(GENCLAW_LLM_MODELS.some((model) => model.id === GENCLAW_DEFAULT_LLM_MODEL));
  assert.ok(GENCLAW_IMAGE_MODELS.length >= 2);
  assert.deepEqual(
    GENCLAW_IMAGE_MODELS.map((model) => model.id),
    IMAGE_MODELS.filter((model) => model.paramKind !== 'mj').map((model) => model.id),
  );
  assert.ok(GENCLAW_IMAGE_MODELS.some((model) => model.id === GENCLAW_DEFAULT_IMAGE_MODEL));
});

test('GenClaw default system prompt keeps white-box SVG generation constraints', () => {
  assert.match(GENCLAW_SYSTEM_PROMPT, /GenClaw|白盒/i);
  assert.match(GENCLAW_SYSTEM_PROMPT, /SVG/);
  assert.match(GENCLAW_SYSTEM_PROMPT, /构图|草图|结构/);
});

test('GenClaw model config falls back when saved values are invalid', () => {
  const resolved = resolveGenClawModelConfig({
    genclawLlmModel: 'missing-llm',
    genclawImageModel: 'missing-image',
    genclawImageApiModel: 'missing-api-model',
    genclawSystemPrompt: '',
  });

  assert.equal(resolved.llmModel, GENCLAW_DEFAULT_LLM_MODEL);
  assert.equal(resolved.imageModel, GENCLAW_DEFAULT_IMAGE_MODEL);
  assert.equal(resolved.imageApiModel, resolved.imageModelDef.apiModel);
  assert.equal(resolved.systemPrompt, GENCLAW_SYSTEM_PROMPT);
});

test('GenClaw preserves image node concrete apiModel selection', () => {
  const imageModel = GENCLAW_IMAGE_MODELS.find((model) => model.apiModelOptions.length > 1);
  assert.ok(imageModel);
  const concreteModel = imageModel.apiModelOptions[1].value;

  const resolved = resolveGenClawModelConfig({
    genclawImageModel: imageModel.id,
    genclawImageApiModel: concreteModel,
  });

  assert.equal(resolved.imageModel, imageModel.id);
  assert.equal(resolved.imageModelDef, imageModel);
  assert.equal(resolved.imageApiModel, concreteModel);
});

test('GenClaw image params reuse image node parameter fields', () => {
  const imageModel = GENCLAW_IMAGE_MODELS.find((model) => (
    model.aspectRatios.includes('16:9') && model.sizes.includes('4K')
  ));
  assert.ok(imageModel);

  const params = resolveGenClawImageParams({
    genclawImageModel: imageModel.id,
    aspectRatio: '16:9',
    sizeLevel: '4K',
    imageCount: 12,
    imageQuality: 'high',
    providerParams: { seed: 42 },
  });

  assert.equal(params.aspectRatio, '16:9');
  assert.equal(params.sizeLevel, '4K');
  assert.equal(params.imageCount, 10);
  assert.equal(params.imageQuality, 'high');
  assert.deepEqual(params.providerParams, { seed: 42 });
  assert.match(params.renderSize, /^\d+x\d+$/);
});
