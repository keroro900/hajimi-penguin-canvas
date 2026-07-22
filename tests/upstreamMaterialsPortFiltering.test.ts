import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('upstream material aggregation filters collected kinds by connection port type', () => {
  const hook = read('../src/components/nodes/useUpstreamMaterials.ts');

  assert.match(hook, /export function materialKindsForPortType/);
  assert.match(hook, /normalized === 'image'[\s\S]*new Set<MaterialKind>\(\['image'\]\)/);
  assert.match(hook, /normalized === 'video'[\s\S]*new Set<MaterialKind>\(\['video'\]\)/);
  assert.match(hook, /normalized === 'audio'[\s\S]*new Set<MaterialKind>\(\['audio'\]\)/);
  assert.match(hook, /normalized === 'text'[\s\S]*new Set<MaterialKind>\(\['text'\]\)/);
  assert.match(hook, /new Set<MaterialKind>\(\['text', 'image', 'video', 'audio'\]\)/);
  assert.match(hook, /const allowedKindsBySource = useMemo/);
  assert.match(hook, /edge\.target !== nodeId/);
  assert.match(hook, /allowText/);
  assert.match(hook, /allowImage/);
  assert.match(hook, /allowVideo/);
  assert.match(hook, /allowAudio/);
});
