import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENCLAW_RECOMMENDED_STEPS,
  createDefaultGenClawState,
  getNextGenClawStep,
  markGenClawStep,
} from '../src/genclaw/pipeline.ts';

test('GenClaw recommended flow stays compact and ordered', () => {
  assert.deepEqual(
    GENCLAW_RECOMMENDED_STEPS.map((step) => step.id),
    ['brief', 'sketch', 'render', 'final-review'],
  );
  assert.equal(GENCLAW_RECOMMENDED_STEPS.length, 4);
});

test('GenClaw state advances through the recommended steps', () => {
  const state = createDefaultGenClawState();
  assert.equal(getNextGenClawStep(state)?.id, 'brief');

  const withBrief = markGenClawStep(state, 'brief', 'done');
  assert.equal(getNextGenClawStep(withBrief)?.id, 'sketch');

  const withSketch = markGenClawStep(withBrief, 'sketch', 'done');
  const withRender = markGenClawStep(withSketch, 'render', 'done');
  const done = markGenClawStep(withRender, 'final-review', 'done');
  assert.equal(getNextGenClawStep(done), null);
});

