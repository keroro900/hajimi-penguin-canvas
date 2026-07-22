import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectNodeMaterialBundle,
  getGroupMaterialRouteIndex,
  materialBundleToCompatibilityData,
  resolveGroupOutputBundle,
  resolveConnectedGroupInputBundle,
  resolveVirtualInputBundleForMember,
  getVirtualMaterialSourceIds,
  validateMaterialConnection,
  validateMaterialConnections,
} from '../src/utils/groupMaterialRouting.ts';
import { getNodeInputs, getNodeOutputs } from '../src/config/portTypes.ts';

const group = (id: string, x: number, y: number, width = 500, height = 320) => ({
  id,
  type: 'groupBox',
  position: { x, y },
  data: { width, height },
});

test('route index discovers static entry members without using current result data', () => {
  const nodes = [
    group('group-a', 0, 0),
    { id: 'entry', type: 'image', position: { x: 40, y: 80 }, measured: { width: 160, height: 100 }, data: {} },
    { id: 'middle', type: 'video', position: { x: 280, y: 80 }, measured: { width: 160, height: 100 }, data: {} },
    { id: 'outside', type: 'text', position: { x: 700, y: 80 }, measured: { width: 160, height: 100 }, data: {} },
  ] as any[];
  const edges = [
    { id: 'internal', source: 'entry', target: 'middle', data: { portType: 'image' } },
    { id: 'external', source: 'outside', target: 'entry', data: { portType: 'text' } },
  ] as any[];

  const index = getGroupMaterialRouteIndex(nodes, edges);

  assert.deepEqual(index.memberIdsByGroup.get('group-a'), ['entry', 'middle']);
  assert.deepEqual(index.entryMemberIdsByGroup.get('group-a'), ['entry']);
  assert.deepEqual(index.virtualGroupIdsByMember.get('entry'), ['group-a']);
  assert.equal(index.virtualGroupIdsByMember.has('middle'), false);
});

test('control-only internal edges do not remove entry status and overlapping groups stay independent', () => {
  const nodes = [
    group('group-a', 0, 0, 500, 400),
    group('group-b', 200, 0, 500, 400),
    { id: 'left', type: 'image', position: { x: 80, y: 100 }, measured: { width: 100, height: 100 }, data: {} },
    { id: 'shared', type: 'video', position: { x: 280, y: 100 }, measured: { width: 100, height: 100 }, data: {} },
  ] as any[];
  const edges = [{ id: 'control', source: 'left', target: 'shared', data: { portType: 'config' } }] as any[];

  const index = getGroupMaterialRouteIndex(nodes, edges);

  assert.deepEqual(index.entryMemberIdsByGroup.get('group-a'), ['left', 'shared']);
  assert.deepEqual(index.entryMemberIdsByGroup.get('group-b'), ['shared']);
  assert.deepEqual(index.virtualGroupIdsByMember.get('shared'), ['group-a', 'group-b']);
});

test('groupBox accepts and produces any material', () => {
  const node = { id: 'group-a', type: 'groupBox', data: {} } as any;
  assert.deepEqual(getNodeInputs(node), ['any']);
  assert.deepEqual(getNodeOutputs(node), ['any']);
});

test('canonical bundle extracts all kinds and preserves intentional material-set slots', () => {
  const node = {
    id: 'set-a',
    type: 'material-set',
    data: {
      materialSetKind: 'image',
      materialSetItems: [
        { id: 'slot-1', kind: 'image', url: ' same.png ', name: 'A' },
        { id: 'slot-2', kind: 'image', url: 'same.png', name: 'B' },
      ],
      outputText: 'hello',
      videoUrls: ['clip.mp4'],
      audioUrls: ['sound.mp3'],
    },
  } as any;

  const bundle = collectNodeMaterialBundle(node);

  assert.deepEqual(bundle.images.map((item) => item.value), ['same.png', 'same.png']);
  assert.deepEqual(bundle.images.map((item) => item.sourceField), ['material-set:image:0', 'material-set:image:1']);
  assert.deepEqual(bundle.texts.map((item) => item.value), ['hello']);
  assert.deepEqual(bundle.videos.map((item) => item.value), ['clip.mp4']);
  assert.deepEqual(bundle.audios.map((item) => item.value), ['sound.mp3']);
});

test('group output merges pass-through before members and recurses without flattened duplicates', () => {
  const nodes = [
    group('group-a', 0, 0, 500, 320),
    { id: 'upload-a', type: 'upload', position: { x: 80, y: 80 }, measured: { width: 120, height: 100 }, data: { uploadType: 'image', imageUrl: 'local.png' } },
    group('group-b', 700, 0, 500, 320),
    { id: 'result-b', type: 'video', position: { x: 800, y: 80 }, measured: { width: 160, height: 100 }, data: { imageUrl: 'local.png', videoUrl: 'result.mp4' } },
    { id: 'external', type: 'upload', position: { x: -400, y: 0 }, data: { uploadType: 'image', imageUrl: 'input.png' } },
  ] as any[];
  const edges = [
    { id: 'input-a', source: 'external', target: 'group-a', targetHandle: 'group-in', data: { portType: 'image' } },
    { id: 'a-to-b', source: 'group-a', sourceHandle: 'group-out', target: 'group-b', targetHandle: 'group-in', data: { portType: 'any' } },
  ] as any[];

  const bundle = resolveGroupOutputBundle('group-b', nodes, edges);

  assert.deepEqual(bundle.images.map((item) => item.value), ['input.png', 'local.png']);
  assert.deepEqual(bundle.videos.map((item) => item.value), ['result.mp4']);
  assert.deepEqual(bundle.images[0].sourceGroupPath, ['group-a', 'group-b']);
  assert.deepEqual(bundle.images[1].sourceGroupPath, ['group-a', 'group-b']);

  assert.deepEqual(materialBundleToCompatibilityData(bundle), {
    prompt: '',
    text: '',
    reply: '',
    imageUrl: 'input.png',
    imageUrls: ['input.png', 'local.png'],
    urls: ['input.png', 'local.png'],
    videoUrl: 'result.mp4',
    videoUrls: ['result.mp4'],
    audioUrl: '',
    audioUrls: [],
  });
});

test('ordinary nodes receive live group output directly without compatibility-data mirroring', () => {
  const nodes = [
    group('group-a', 0, 0, 500, 400),
    { id: 'image-a', type: 'upload', position: { x: 80, y: 80 }, measured: { width: 120, height: 100 }, data: { imageUrl: 'a.png' } },
    { id: 'image-b', type: 'upload', position: { x: 240, y: 80 }, measured: { width: 120, height: 100 }, data: { imageUrl: 'b.png' } },
    { id: 'video-a', type: 'upload', position: { x: 80, y: 220 }, measured: { width: 120, height: 100 }, data: { videoUrl: 'clip.mp4' } },
    { id: 'consumer', type: 'seedance', position: { x: 700, y: 80 }, measured: { width: 180, height: 120 }, data: {} },
  ] as any[];
  const edges = [
    { id: 'group-consumer', source: 'group-a', sourceHandle: 'group-out', target: 'consumer', data: { portType: 'any' } },
  ] as any[];

  const bundle = resolveConnectedGroupInputBundle('consumer', nodes, edges);

  assert.deepEqual(bundle.images.map((item) => item.value), ['a.png', 'b.png']);
  assert.deepEqual(bundle.videos.map((item) => item.value), ['clip.mp4']);
  assert.deepEqual(getVirtualMaterialSourceIds('consumer', nodes, edges), ['group-a', 'image-a', 'image-b', 'video-a']);
});

test('group input routes retain edge order and port filtering', () => {
  const nodes = [
    group('group-a', 0, 0),
    { id: 'entry', type: 'video', position: { x: 100, y: 100 }, measured: { width: 160, height: 100 }, data: {} },
    { id: 'mixed', type: 'output', position: { x: -500, y: 0 }, data: { prompt: 'ignore text', imageUrl: 'keep.png', videoUrl: 'ignore.mp4' } },
  ] as any[];
  const edges = [{ id: 'image-only', source: 'mixed', target: 'group-a', data: { portType: 'image' } }] as any[];

  const index = getGroupMaterialRouteIndex(nodes, edges);
  const route = index.groupInputRoutesByGroup.get('group-a')?.[0];

  assert.equal(route?.originEdgeId, 'image-only');
  assert.deepEqual(route?.allowedKinds, ['image']);
});

test('virtual input reaches entry members only and respects consumer capabilities', () => {
  const nodes = [
    group('group-a', 0, 0),
    { id: 'entry', type: 'image', position: { x: 80, y: 100 }, measured: { width: 160, height: 100 }, data: {} },
    { id: 'downstream', type: 'video', position: { x: 300, y: 100 }, measured: { width: 160, height: 100 }, data: {} },
    { id: 'source', type: 'output', position: { x: -500, y: 0 }, data: { prompt: 'text', imageUrl: 'image.png', videoUrl: 'video.mp4' } },
  ] as any[];
  const edges = [
    { id: 'group-input', source: 'source', target: 'group-a', targetHandle: 'group-in', data: { portType: 'any' } },
    { id: 'internal', source: 'entry', target: 'downstream', data: { portType: 'image' } },
  ] as any[];

  const entryBundle = resolveVirtualInputBundleForMember('entry', nodes, edges);
  const downstreamBundle = resolveVirtualInputBundleForMember('downstream', nodes, edges);

  assert.deepEqual(entryBundle.texts.map((item) => item.value), ['text']);
  assert.deepEqual(entryBundle.images.map((item) => item.value), ['image.png']);
  assert.deepEqual(entryBundle.videos, []);
  assert.deepEqual(downstreamBundle, { texts: [], images: [], videos: [], audios: [] });
  assert.deepEqual(getVirtualMaterialSourceIds('entry', nodes, edges), ['source']);
});

test('virtual source subscriptions include recursive source-group members and inputs', () => {
  const nodes = [
    group('group-a', 0, 0),
    { id: 'member-a', type: 'image', position: { x: 80, y: 100 }, measured: { width: 120, height: 100 }, data: { imageUrl: 'a.png' } },
    group('group-b', 700, 0),
    { id: 'entry-b', type: 'video', position: { x: 800, y: 100 }, measured: { width: 120, height: 100 }, data: {} },
    { id: 'external', type: 'upload', position: { x: -400, y: 0 }, data: { uploadType: 'image', imageUrl: 'input.png' } },
  ] as any[];
  const edges = [
    { id: 'external-a', source: 'external', target: 'group-a', data: { portType: 'image' } },
    { id: 'a-b', source: 'group-a', target: 'group-b', data: { portType: 'any' } },
  ] as any[];

  assert.deepEqual(getVirtualMaterialSourceIds('entry-b', nodes, edges), ['group-a', 'external', 'member-a']);
});

test('connection validation rejects group self and own-member feedback', () => {
  const nodes = [
    group('group-a', 0, 0),
    { id: 'member', type: 'image', position: { x: 100, y: 100 }, measured: { width: 120, height: 100 }, data: {} },
    { id: 'outside', type: 'image', position: { x: 700, y: 100 }, measured: { width: 120, height: 100 }, data: {} },
  ] as any[];

  assert.equal(validateMaterialConnection(nodes, [], { id: 'self', source: 'group-a', target: 'group-a' } as any).valid, false);
  assert.equal(validateMaterialConnection(nodes, [], { id: 'member-in', source: 'member', target: 'group-a' } as any).valid, false);
  assert.equal(validateMaterialConnection(nodes, [], { id: 'group-member', source: 'group-a', target: 'member' } as any).valid, false);
  assert.equal(validateMaterialConnection(nodes, [], { id: 'safe', source: 'outside', target: 'group-a' } as any).valid, true);
});

test('split group vertices reject recursive group cycles including empty pass-through groups', () => {
  const nodes = [group('group-a', 0, 0), group('group-b', 700, 0)] as any[];
  const edges = [{ id: 'a-b', source: 'group-a', target: 'group-b', data: { portType: 'any' } }] as any[];

  const result = validateMaterialConnection(
    nodes,
    edges,
    { id: 'b-a', source: 'group-b', target: 'group-a', data: { portType: 'any' } } as any,
  );

  assert.equal(result.valid, false);
  assert.equal(result.reason, 'cycle');
});

test('reconnect validation removes the replaced edge before checking the new path', () => {
  const nodes = [
    { id: 'a', type: 'image', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', type: 'image', position: { x: 300, y: 0 }, data: {} },
    { id: 'c', type: 'image', position: { x: 600, y: 0 }, data: {} },
  ] as any[];
  const edges = [
    { id: 'replace-me', source: 'a', target: 'b', data: { portType: 'image' } },
    { id: 'b-c', source: 'b', target: 'c', data: { portType: 'image' } },
  ] as any[];

  const result = validateMaterialConnection(
    nodes,
    edges,
    { id: 'replace-me', source: 'c', target: 'a', data: { portType: 'image' } } as any,
    'replace-me',
  );

  assert.equal(result.valid, true);
});

test('batch validation accepts safe siblings and skips only cyclic candidates in order', () => {
  const nodes = [group('group-a', 0, 0), group('group-b', 700, 0), group('group-c', 1400, 0)] as any[];
  const candidates = [
    { id: 'a-b', source: 'group-a', target: 'group-b', data: { portType: 'any' } },
    { id: 'b-a', source: 'group-b', target: 'group-a', data: { portType: 'any' } },
    { id: 'b-c', source: 'group-b', target: 'group-c', data: { portType: 'any' } },
  ] as any[];

  const result = validateMaterialConnections(nodes, [], candidates);

  assert.deepEqual(result.accepted.map((edge) => edge.id), ['a-b', 'b-c']);
  assert.deepEqual(result.rejected.map((item) => [item.edge.id, item.reason]), [['b-a', 'cycle']]);
});
