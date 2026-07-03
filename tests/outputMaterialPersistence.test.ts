import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('toolbar exposes output material persistence as a default-off canvas setting', () => {
  const toolbar = read('../src/components/CanvasToolbar.tsx');
  const canvas = read('../src/components/Canvas.tsx');
  const persistence = read('../src/utils/outputMaterialPersistence.ts');

  assert.match(persistence, /OUTPUT_MATERIAL_PERSISTENCE_STORAGE_KEY/);
  assert.match(persistence, /readOutputMaterialPersistenceSetting[\s\S]*return false/);
  assert.match(persistence, /writeOutputMaterialPersistenceSetting/);

  assert.match(toolbar, /outputMaterialPersistenceEnabled:\s*boolean/);
  assert.match(toolbar, /onToggleOutputMaterialPersistence:\s*\(\)\s*=>\s*void/);
  assert.match(toolbar, /输出素材持久化/);
  assert.match(toolbar, /aria-pressed=\{outputMaterialPersistenceEnabled\}/);

  assert.match(canvas, /readOutputMaterialPersistenceSetting/);
  assert.match(canvas, /writeOutputMaterialPersistenceSetting/);
  assert.match(canvas, /outputMaterialPersistenceEnabled=\{outputMaterialPersistenceEnabled\}/);
  assert.match(canvas, /onToggleOutputMaterialPersistence=\{toggleOutputMaterialPersistence\}/);
});

test('auto output persistence snapshots generated items without changing the default cleanup path', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const persistence = read('../src/utils/outputMaterialPersistence.ts');

  assert.match(persistence, /buildPersistentOutputSnapshotData/);
  assert.match(persistence, /directImageUrl/);
  assert.match(persistence, /directVideoUrl/);
  assert.match(persistence, /directAudioUrl/);
  assert.match(persistence, /directOutputText/);
  assert.match(persistence, /shouldPreserveAutoOutputMaterialNode/);

  assert.match(canvas, /buildPersistentOutputSnapshotData\(item\)/);
  assert.match(canvas, /const outputDataForItem = \(item:/);
  assert.match(canvas, /return outputMaterialPersistenceEnabled\s*\?\s*\{\s*\.\.\.base,\s*\.\.\.buildPersistentOutputSnapshotData\(item\)\s*\}/);
  assert.match(canvas, /shouldPreserveAutoOutputMaterialNode\(nodeById\.get\(o\.id\),\s*outputMaterialPersistenceEnabled\)/);
  assert.match(canvas, /\}, \[nodes, edges, loaded, assignActiveNodeSerials, registerPlacementShelfNodes, outputMaterialPersistenceEnabled\]\)/);
});

test('new auto output nodes carry an immediate direct snapshot before edges subscribe', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /const buildImmediateOutputSnapshotData = \(item:/);
  assert.match(canvas, /directOutputSingleSnapshot:\s*true/);
  assert.match(canvas, /directImageUrl:\s*value/);
  assert.match(canvas, /directVideoUrl:\s*value/);
  assert.match(canvas, /directAudioUrl:\s*value/);
  assert.match(canvas, /directOutputText:\s*value/);
  assert.match(
    canvas,
    /return outputMaterialPersistenceEnabled\s*\?\s*\{\s*\.\.\.base,\s*\.\.\.buildPersistentOutputSnapshotData\(item\)\s*\}\s*:\s*\{\s*\.\.\.base,\s*\.\.\.buildImmediateOutputSnapshotData\(item\)\s*\}/,
  );
});

test('persisted single auto-output snapshots still honor pickKind filtering', () => {
  const outputNode = read('../src/components/nodes/OutputNode.tsx');

  assert.match(outputNode, /hasAnyDirectAccumulated/);
  assert.doesNotMatch(
    outputNode,
    /Array\.isArray\(d\.directImageUrls\)\s*&&\s*d\.directImageUrls\.length\s*>\s*0/,
  );
  assert.match(
    outputNode,
    /Array\.isArray\(d\.directImageUrls\)\s*&&\s*d\.directImageUrls\.length\s*>\s*1/,
  );
  assert.match(outputNode, /const pickKind:\s*string \| undefined = \(hasAnyDirectAccumulated \|\| directSnapshotOnly\) \? undefined : d\.pickKind/);
});
