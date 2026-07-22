import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getContainingGroupIds,
  getGroupMemberIds,
  isNodeCenterInsideGroup,
  resolveNodeSize,
} from '../src/utils/groupMembership.ts';

test('group membership uses inclusive center geometry in canvas order', () => {
  const group = {
    id: 'group-a',
    type: 'groupBox',
    position: { x: 100, y: 100 },
    data: { width: 400, height: 300, memberIds: ['stale-outside'] },
  } as any;
  const nodes = [
    group,
    { id: 'inside', type: 'image', position: { x: 120, y: 130 }, measured: { width: 100, height: 80 } },
    { id: 'boundary', type: 'video', position: { x: 450, y: 360 }, measured: { width: 100, height: 80 } },
    { id: 'stale-outside', type: 'text', position: { x: 800, y: 800 }, measured: { width: 100, height: 80 } },
    { id: 'nested-group', type: 'groupBox', position: { x: 200, y: 200 }, data: { width: 100, height: 100 } },
    { id: 'bulk-phantom', type: 'text', position: { x: 200, y: 200 }, measured: { width: 20, height: 20 } },
  ] as any[];

  assert.deepEqual(getGroupMemberIds(group, nodes), ['inside', 'boundary']);
  assert.equal(isNodeCenterInsideGroup(group, nodes[1]), true);
  assert.equal(isNodeCenterInsideGroup(group, nodes[3]), false);
});

test('size resolution prefers measured dimensions and uses stable fallbacks', () => {
  assert.deepEqual(
    resolveNodeSize({ id: 'n', type: 'image', measured: { width: 240, height: 160 }, width: 200, height: 100 } as any),
    { width: 240, height: 160 },
  );
  assert.deepEqual(resolveNodeSize({ id: 'n', type: 'image', width: 210, height: 110 } as any), {
    width: 210,
    height: 110,
  });
  assert.deepEqual(resolveNodeSize({ id: 'n', type: 'image' } as any), { width: 200, height: 100 });
  assert.deepEqual(resolveNodeSize({ id: 'g', type: 'groupBox', data: { width: 500, height: 320 } } as any), {
    width: 500,
    height: 320,
  });
});

test('containing groups are derived from geometry only', () => {
  const target = { id: 'target', type: 'image', position: { x: 150, y: 150 }, measured: { width: 100, height: 100 } } as any;
  const nodes = [
    { id: 'group-a', type: 'groupBox', position: { x: 0, y: 0 }, data: { width: 400, height: 400 } },
    { id: 'group-b', type: 'groupBox', position: { x: 100, y: 100 }, data: { width: 300, height: 300 } },
    { id: 'group-stale', type: 'groupBox', position: { x: 900, y: 900 }, data: { width: 100, height: 100, memberIds: ['target'] } },
    target,
  ] as any[];

  assert.deepEqual(getContainingGroupIds(target, nodes), ['group-a', 'group-b']);
});
