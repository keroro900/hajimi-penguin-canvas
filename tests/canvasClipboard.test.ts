import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  expandClipboardNodesForGroups,
  offsetClipboardNodes,
  positionClipboardNodesAtAnchor,
  remapPastedGroupMemberIds,
  sanitizeClipboardNodeData,
} from '../src/utils/canvasClipboard.ts';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('positionClipboardNodesAtAnchor aligns the copied group top-left to the pointer anchor', () => {
  const sourceNodes = [
    { id: 'a', position: { x: 100, y: 200 }, measured: { width: 200, height: 120 } },
    { id: 'b', position: { x: 420, y: 260 }, width: 240, height: 160 },
  ];

  const positioned = positionClipboardNodesAtAnchor(sourceNodes, { x: 1000, y: 800 });

  assert.deepEqual(
    positioned.map((node) => node.position),
    [
      { x: 1000, y: 800 },
      { x: 1320, y: 860 },
    ],
  );
  assert.equal(positioned[0].id, 'a');
  assert.equal(positioned[1].id, 'b');
});

test('positionClipboardNodesAtAnchor keeps relative spacing when nodes are not measured yet', () => {
  const sourceNodes = [
    { id: 'a', position: { x: -50, y: 120 } },
    { id: 'b', position: { x: 250, y: 420 } },
  ];

  const positioned = positionClipboardNodesAtAnchor(sourceNodes, { x: 600, y: 300 });

  assert.deepEqual(
    positioned.map((node) => node.position),
    [
      { x: 600, y: 300 },
      { x: 900, y: 600 },
    ],
  );
});

test('offsetClipboardNodes preserves the old quick-duplicate offset behavior', () => {
  const sourceNodes = [
    { id: 'a', position: { x: 12, y: 24 } },
    { id: 'b', position: { x: -30, y: 10 } },
  ];

  const positioned = offsetClipboardNodes(sourceNodes, { x: 40, y: 40 });

  assert.deepEqual(
    positioned.map((node) => node.position),
    [
      { x: 52, y: 64 },
      { x: 10, y: 50 },
    ],
  );
});

test('expandClipboardNodesForGroups copies the group box together with its members', () => {
  const allNodes = [
    {
      id: 'group-a',
      type: 'groupBox',
      position: { x: 40, y: 40 },
      data: { memberIds: ['node-a'], width: 500, height: 320 },
    },
    { id: 'node-a', type: 'text', position: { x: 120, y: 140 }, measured: { width: 120, height: 80 } },
    { id: 'node-b', type: 'image', position: { x: 380, y: 240 }, measured: { width: 140, height: 100 } },
    { id: 'outside', type: 'text', position: { x: 900, y: 900 }, measured: { width: 120, height: 80 } },
  ];

  const expanded = expandClipboardNodesForGroups([allNodes[0]], allNodes);

  assert.deepEqual(expanded.map((node) => node.id), ['group-a', 'node-a', 'node-b']);
});

test('expandClipboardNodesForGroups ignores stale cached member ids outside group geometry', () => {
  const allNodes = [
    {
      id: 'group-a',
      type: 'groupBox',
      position: { x: 0, y: 0 },
      data: { memberIds: ['outside'], width: 300, height: 200 },
    },
    { id: 'inside', type: 'image', position: { x: 80, y: 60 }, measured: { width: 100, height: 80 } },
    { id: 'outside', type: 'text', position: { x: 700, y: 700 }, measured: { width: 100, height: 80 } },
  ];

  const expanded = expandClipboardNodesForGroups([allNodes[0]], allNodes);

  assert.deepEqual(expanded.map((node) => node.id), ['group-a', 'inside']);
});

test('remapPastedGroupMemberIds points pasted groups at pasted members', () => {
  const pastedNodes = [
    {
      id: 'group-new',
      type: 'groupBox',
      position: { x: 0, y: 0 },
      data: { memberIds: ['node-a', 'node-b', 'outside'] },
    },
    { id: 'node-new-a', type: 'text', position: { x: 80, y: 120 }, data: {} },
    { id: 'node-new-b', type: 'image', position: { x: 240, y: 180 }, data: {} },
  ];
  const idMap = new Map([
    ['group-a', 'group-new'],
    ['node-a', 'node-new-a'],
    ['node-b', 'node-new-b'],
  ]);

  const remapped = remapPastedGroupMemberIds(pastedNodes, idMap);

  assert.deepEqual(remapped[0].data?.memberIds, ['node-new-a', 'node-new-b']);
});

test('remapPastedGroupMemberIds recomputes membership from pasted geometry', () => {
  const pastedNodes = [
    {
      id: 'group-new',
      type: 'groupBox',
      position: { x: 100, y: 100 },
      data: { memberIds: ['stale-old'], width: 400, height: 300 },
    },
    { id: 'inside-new', type: 'image', position: { x: 160, y: 160 }, measured: { width: 100, height: 80 }, data: {} },
    { id: 'outside-new', type: 'text', position: { x: 900, y: 900 }, measured: { width: 100, height: 80 }, data: {} },
  ];

  const remapped = remapPastedGroupMemberIds(pastedNodes, new Map([['stale-old', 'outside-new']]));

  assert.deepEqual(remapped[0].data?.memberIds, ['inside-new']);
});

test('sanitizeClipboardNodeData resets generated node results when copying configuration', () => {
  const sanitized = sanitizeClipboardNodeData({
    prompt: 'make five images',
    status: 'running',
    progress: '3/5',
    error: 'one task failed',
    taskId: 'task-123',
    isRunning: true,
    isPolling: true,
    imageUrl: 'https://cdn.example.com/ready.png',
    imageUrls: ['https://cdn.example.com/ready.png'],
    videoUrl: 'https://cdn.example.com/ready.mp4',
    videoUrls: ['https://cdn.example.com/ready.mp4'],
    audioUrl: 'https://cdn.example.com/ready.mp3',
    audioUrls: ['https://cdn.example.com/ready.mp3'],
    urls: ['https://cdn.example.com/ready.png'],
    outputText: 'finished text',
    directVideoUrl: 'https://cdn.example.com/ready.mp4',
    imageResultSlots: [
      { status: 'success', url: 'https://cdn.example.com/ready.png', index: 0 },
      { status: 'pending', index: 1 },
      { status: 'failed', error: 'bad gateway', index: 2 },
    ],
  }, 'image');

  assert.equal(sanitized.status, 'idle');
  assert.equal(sanitized.prompt, 'make five images');
  assert.equal('imageUrl' in sanitized, false);
  assert.equal('imageUrls' in sanitized, false);
  assert.equal('videoUrl' in sanitized, false);
  assert.equal('videoUrls' in sanitized, false);
  assert.equal('audioUrl' in sanitized, false);
  assert.equal('audioUrls' in sanitized, false);
  assert.equal('urls' in sanitized, false);
  assert.equal('outputText' in sanitized, false);
  assert.equal('directVideoUrl' in sanitized, false);
  assert.equal('imageResultSlots' in sanitized, false);
  assert.equal('progress' in sanitized, false);
  assert.equal('error' in sanitized, false);
  assert.equal('taskId' in sanitized, false);
  assert.equal('isRunning' in sanitized, false);
  assert.equal('isPolling' in sanitized, false);
});

test('sanitizeClipboardNodeData keeps explicit output node media snapshots copyable', () => {
  const sanitized = sanitizeClipboardNodeData({
    status: 'success',
    directVideoUrl: 'https://cdn.example.com/ready.mp4',
    directVideoUrls: ['https://cdn.example.com/ready.mp4'],
    videoUrl: 'https://cdn.example.com/ready.mp4',
    videoUrls: ['https://cdn.example.com/ready.mp4'],
    outputText: 'caption',
  }, 'output');

  assert.equal(sanitized.status, 'idle');
  assert.equal(sanitized.directVideoUrl, 'https://cdn.example.com/ready.mp4');
  assert.deepEqual(sanitized.directVideoUrls, ['https://cdn.example.com/ready.mp4']);
  assert.equal(sanitized.videoUrl, 'https://cdn.example.com/ready.mp4');
  assert.deepEqual(sanitized.videoUrls, ['https://cdn.example.com/ready.mp4']);
  assert.equal(sanitized.outputText, 'caption');
});

test('sanitizeClipboardNodeData clears cached results from process and routing nodes', () => {
  const relay = sanitizeClipboardNodeData({
    prompt: 'cached upstream text',
    imageUrl: 'https://cdn.example.com/relay.png',
    videoUrl: 'https://cdn.example.com/relay.mp4',
    audioUrl: 'https://cdn.example.com/relay.mp3',
    randomRouteLastOrder: ['node-a'],
  }, 'relay');

  assert.equal(relay.status, 'idle');
  assert.equal('prompt' in relay, false);
  assert.equal('imageUrl' in relay, false);
  assert.equal('videoUrl' in relay, false);
  assert.equal('audioUrl' in relay, false);
  assert.equal('randomRouteLastOrder' in relay, false);

  const videoEdit = sanitizeClipboardNodeData({
    clips: [{ id: 'clip-1', url: 'https://cdn.example.com/source.mp4' }],
    videoUrl: 'https://cdn.example.com/rendered.mp4',
    output: { videoUrl: 'https://cdn.example.com/rendered.mp4' },
    job: { id: 'job-1', status: 'done' },
  }, 'video-edit');

  assert.deepEqual(videoEdit.clips, [{ id: 'clip-1', url: 'https://cdn.example.com/source.mp4' }]);
  assert.equal('videoUrl' in videoEdit, false);
  assert.equal('output' in videoEdit, false);
  assert.equal('job' in videoEdit, false);
});

test('sanitizeClipboardNodeData clears generated media from any non-snapshot node type', () => {
  const sanitized = sanitizeClipboardNodeData({
    gridEditorRows: 3,
    gridEditorCols: 3,
    imageUrl: 'https://cdn.example.com/grid.png',
    imageUrls: ['https://cdn.example.com/grid.png'],
    outputText: 'old grid output',
  }, 'grid-editor');

  assert.equal(sanitized.gridEditorRows, 3);
  assert.equal(sanitized.gridEditorCols, 3);
  assert.equal('imageUrl' in sanitized, false);
  assert.equal('imageUrls' in sanitized, false);
  assert.equal('outputText' in sanitized, false);
});

test('sanitizeClipboardNodeData preserves source media nodes but clears generated previews', () => {
  const upload = sanitizeClipboardNodeData({
    status: 'success',
    imageUrl: 'https://cdn.example.com/source.png',
    videoUrl: 'https://cdn.example.com/source.mp4',
    audioUrl: 'https://cdn.example.com/source.mp3',
    modelUrl: 'https://cdn.example.com/source.glb',
  }, 'upload');

  assert.equal(upload.status, 'idle');
  assert.equal(upload.imageUrl, 'https://cdn.example.com/source.png');
  assert.equal(upload.videoUrl, 'https://cdn.example.com/source.mp4');
  assert.equal(upload.audioUrl, 'https://cdn.example.com/source.mp3');
  assert.equal(upload.modelUrl, 'https://cdn.example.com/source.glb');

  const preview = sanitizeClipboardNodeData({
    status: 'success',
    modelUrl: 'https://cdn.example.com/source.glb',
    modelUrls: ['https://cdn.example.com/source.glb'],
    imageUrl: 'data:image/png;base64,old-preview',
    imageUrls: ['data:image/png;base64,old-preview'],
    urls: ['data:image/png;base64,old-preview'],
    outputText: '3D 模型快照',
  }, 'model-3d-preview');

  assert.equal(preview.status, 'idle');
  assert.equal(preview.modelUrl, 'https://cdn.example.com/source.glb');
  assert.deepEqual(preview.modelUrls, ['https://cdn.example.com/source.glb']);
  assert.equal('imageUrl' in preview, false);
  assert.equal('imageUrls' in preview, false);
  assert.equal('urls' in preview, false);
  assert.equal('outputText' in preview, false);
});

test('canvas paste sanitizes clipboard data with the source node type', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /sanitizeClipboardNodeData\(n\.data,\s*n\.type\)/);
});

test('loop parallel clones sanitize downstream node data before running copies', () => {
  const loopNode = read('../src/components/nodes/LoopNode.tsx');

  assert.match(loopNode, /sanitizeClipboardNodeData/);
  assert.match(loopNode, /sanitizeClipboardNodeData\(n\.data,\s*n\.type as string,\s*\{\s*preserveMediaSnapshots:\s*false\s*\}\)/);
  assert.match(loopNode, /__loopClone:\s*id/);
});

test('temporary alt-drag placeholders are ignored by output side effects', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /startsWith\('_alt-ph-'\)/);
  assert.match(canvas, /if \(!CARD_MODE_OWNS_OUTPUT_TYPES\.has\(t\) \|\| d\?\.uiVariant === 'classic' \|\| isAltDragPlaceholderNode\(node\)\) continue;/);
  assert.match(canvas, /if \(!t \|\| SKIP_TYPES\.has\(t\) \|\| isAltDragPlaceholderNode\(n\)\) continue;/);
});
