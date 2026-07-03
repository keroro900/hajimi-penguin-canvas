import test from 'node:test';
import assert from 'node:assert/strict';
import { topologicalBatches } from '../src/utils/topologicalSort.ts';

const executableTypes = new Set(['image', 'video', 'llm']);

const node = (id: string, type = 'image', x = 0) => ({
  id,
  type,
  position: { x, y: 0 },
  data: {},
});

const edge = (source: string, target: string) => ({
  id: `${source}-${target}`,
  source,
  target,
});

test('topologicalBatches runs independent workflow starts in the same wave and keeps chains serial', () => {
  const batches = topologicalBatches(
    [
      node('input-a', 'upload', 0),
      node('gen-a', 'image', 100),
      node('video-a', 'video', 200),
      node('input-b', 'upload', 300),
      node('gen-b', 'image', 400),
    ],
    [
      edge('input-a', 'gen-a'),
      edge('gen-a', 'video-a'),
      edge('input-b', 'gen-b'),
    ],
    executableTypes,
  );

  assert.deepEqual(batches, [['gen-a', 'gen-b'], ['video-a']]);
});

