import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge, Node } from '@xyflow/react';

import { createGroupExecutionPlan } from '../src/utils/groupExecutionPlan.ts';

function node(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

test('group execution plan runs independent executable nodes in the same stage', () => {
  const plan = createGroupExecutionPlan({
    nodes: [node('image-a', 'image'), node('image-b', 'image'), node('note', 'text')],
    edges: [],
    memberIds: ['image-a', 'image-b', 'note'],
  });

  assert.deepEqual(plan.stages.map((stage) => stage.map((item) => item.id)), [['image-a', 'image-b']]);
  assert.deepEqual(plan.skipped.map((item) => [item.id, item.reason]), [['note', 'not-executable']]);
});

test('group execution plan orders connected chains and ignores outside edges', () => {
  const plan = createGroupExecutionPlan({
    nodes: [node('upload', 'upload'), node('llm', 'llm'), node('image', 'image'), node('video', 'video'), node('outside', 'image')],
    edges: [
      edge('upload-llm', 'upload', 'llm'),
      edge('llm-image', 'llm', 'image'),
      edge('image-video', 'image', 'video'),
      edge('outside-video', 'outside', 'video'),
    ],
    memberIds: ['upload', 'llm', 'image', 'video'],
  });

  assert.deepEqual(plan.stages.map((stage) => stage.map((item) => item.id)), [['llm'], ['image'], ['video']]);
  assert.deepEqual(plan.skipped.map((item) => [item.id, item.reason]), [['upload', 'not-executable']]);
});

