import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listEdgeInsertCandidates,
  planEdgeSplice,
} from '../src/components/edges/edgeInsertCandidates.ts';

test('image edges only offer nodes that can consume AND re-emit image', () => {
  const types = listEdgeInsertCandidates('image').map((cand) => cand.type);

  // image-in → image-out nodes qualify
  assert.ok(types.includes('image'), 'core image node should splice into image edges');
  assert.ok(types.includes('resize'), 'image utility should splice into image edges');
  assert.ok(types.includes('upscale'), 'upscale should splice into image edges');
  assert.ok(types.includes('relay'), 'relay (any/any) should splice into any edge');

  // video node outputs video, which cannot feed an image edge
  assert.ok(!types.includes('video'), 'video node cannot re-emit image');
  // text node outputs text, which cannot feed an image edge
  assert.ok(!types.includes('text'), 'text node cannot re-emit image');
  // frame-extractor consumes video and emits image — wrong direction
  assert.ok(!types.includes('frame-extractor'), 'frame-extractor cannot consume image');
  // source-only nodes have no inputs
  assert.ok(!types.includes('upload'), 'upload has no inputs');
  // sink-only nodes have no outputs
  assert.ok(!types.includes('video-output'), 'video-output has no outputs');
  assert.ok(!types.includes('batch-processor'), 'batch-processor has no outputs');
});

test('video edges offer video-through nodes but not image-only utilities', () => {
  const types = listEdgeInsertCandidates('video').map((cand) => cand.type);

  assert.ok(types.includes('video'), 'video node should splice into video edges');
  assert.ok(types.includes('seedance'), 'seedance should splice into video edges');
  assert.ok(types.includes('video-edit'), 'video-edit should splice into video edges');
  assert.ok(types.includes('topaz-video-upscale'), 'topaz video upscale should splice into video edges');

  assert.ok(!types.includes('resize'), 'image-only utility cannot splice into video edges');
  assert.ok(!types.includes('image'), 'image node cannot re-emit video');
});

test('text edges offer text-through nodes', () => {
  const types = listEdgeInsertCandidates('text').map((cand) => cand.type);

  assert.ok(types.includes('text'), 'text node should splice into text edges');
  assert.ok(types.includes('llm'), 'llm should splice into text edges');
  assert.ok(types.includes('text-split'), 'text-split should splice into text edges');

  assert.ok(!types.includes('resize'), 'image utility cannot splice into text edges');
});

test('every candidate reports concrete matched input/output port types', () => {
  for (const portType of ['text', 'image', 'video', 'audio'] as const) {
    const candidates = listEdgeInsertCandidates(portType);
    assert.ok(candidates.length > 0, `expected candidates for ${portType}`);
    for (const cand of candidates) {
      assert.ok(cand.matchedInput, `${cand.type} missing matchedInput`);
      assert.ok(cand.matchedOutput, `${cand.type} missing matchedOutput`);
      // matched output is either the carried type itself or the any passthrough
      assert.ok(
        cand.matchedOutput === portType || cand.matchedOutput === 'any',
        `${cand.type} matched ${cand.matchedOutput}, cannot feed a ${portType} edge`,
      );
    }
  }
});

test('splice plan replaces one edge with two edges sharing the original handles and data', () => {
  const plan = planEdgeSplice(
    {
      id: 'e-a-b',
      source: 'node-a',
      target: 'node-b',
      sourceHandle: 'out-main',
      targetHandle: 'in-main',
      data: { portType: 'image', label: 'kept' },
    },
    'node-new',
    'image',
  );

  // upstream edge: original source (with its handle) → new node (default handle)
  assert.equal(plan.upstream.source, 'node-a');
  assert.equal(plan.upstream.sourceHandle, 'out-main');
  assert.equal(plan.upstream.target, 'node-new');
  assert.equal(plan.upstream.targetHandle, null);
  assert.deepEqual(plan.upstream.data, { portType: 'image', label: 'kept' });

  // downstream edge: new node (default handle) → original target (with its handle)
  assert.equal(plan.downstream.source, 'node-new');
  assert.equal(plan.downstream.sourceHandle, null);
  assert.equal(plan.downstream.target, 'node-b');
  assert.equal(plan.downstream.targetHandle, 'in-main');
  assert.deepEqual(plan.downstream.data, { portType: 'image', label: 'kept' });

  // the two edges own independent data copies
  (plan.upstream.data as Record<string, unknown>).label = 'mutated';
  assert.equal(plan.downstream.data.label, 'kept');
});

test('splice plan falls back to null handles and stamps the resolved portType', () => {
  const plan = planEdgeSplice(
    { id: 'e-1', source: 'a', target: 'b' },
    'n',
    'video',
  );

  assert.equal(plan.upstream.sourceHandle, null);
  assert.equal(plan.downstream.targetHandle, null);
  assert.equal(plan.upstream.data.portType, 'video');
  assert.equal(plan.downstream.data.portType, 'video');
});
