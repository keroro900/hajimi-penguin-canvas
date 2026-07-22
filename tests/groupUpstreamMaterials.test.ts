import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/nodes/useUpstreamMaterials.ts', import.meta.url), 'utf8');

test('useUpstreamMaterials subscribes to virtual route sources without changing its public API', () => {
  assert.match(source, /useStore/);
  assert.match(source, /getGroupMaterialRouteIndex/);
  assert.match(source, /getVirtualMaterialSourceIds/);
  assert.match(source, /resolveVirtualInputBundleForMember/);
  assert.match(source, /resolveConnectedGroupInputBundle/);
  assert.match(source, /useNodesData\(virtualSourceIds\)/);
  assert.match(source, /export function useUpstreamMaterials\(nodeId: string\): UpstreamMaterials/);
});

test('direct group connections are not collected again through compatibility fields', () => {
  assert.match(source, /if \(n\.type === 'groupBox'\) continue;/);
});

test('virtual materials retain routing provenance when mapped to existing Material values', () => {
  assert.match(source, /originEdgeId/);
  assert.match(source, /sourceHandle/);
  assert.match(source, /sourceGroupPath/);
});

test('image outputs expose one primary url per successful result slot', () => {
  assert.match(source, /successfulMediaSlotUrls\(ud\.imageResultSlots\)/);
  assert.match(source, /imageResultSlots:\$\{index\}/);
});
