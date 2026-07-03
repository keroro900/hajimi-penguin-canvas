import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge, Node } from '@xyflow/react';

import { runPreflight } from '../src/utils/runPreflight.ts';

function node(id: string, type: string, data: Record<string, any> = {}): Node {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

test('runPreflight reports empty canvas', () => {
  const issues = runPreflight([], []);

  assert.deepEqual(issues.map((issue) => issue.code), ['EMPTY_CANVAS']);
  assert.equal(issues[0].severity, 'error');
});

test('runPreflight reports unknown node types', () => {
  const issues = runPreflight([node('mystery-1', 'mystery')], []);

  assert.equal(issues.some((issue) => issue.code === 'UNKNOWN_NODE_TYPE' && issue.nodeId === 'mystery-1'), true);
});

test('runPreflight reports cycle dependencies', () => {
  const issues = runPreflight(
    [node('a', 'text'), node('b', 'image')],
    [edge('a-b', 'a', 'b'), edge('b-a', 'b', 'a')],
  );

  assert.equal(issues.some((issue) => issue.code === 'CYCLE_DEPENDENCY' && issue.nodeId === 'a'), true);
  assert.equal(issues.some((issue) => issue.code === 'CYCLE_DEPENDENCY' && issue.nodeId === 'b'), true);
});

test('runPreflight reports missing required upstream input for input-only executable nodes', () => {
  const issues = runPreflight([node('upscale-1', 'upscale')], []);

  assert.deepEqual(
    issues.filter((issue) => issue.code === 'MISSING_REQUIRED_INPUT').map((issue) => issue.nodeId),
    ['upscale-1'],
  );
});

test('runPreflight does not require upstream input when node has standalone output capability', () => {
  const issues = runPreflight([node('idea-1', 'idea')], []);

  assert.equal(issues.some((issue) => issue.code === 'MISSING_REQUIRED_INPUT'), false);
});

test('runPreflight reports selected external provider that is not ready', () => {
  const issues = runPreflight(
    [node('image-1', 'image', { providerSource: 'modelscope', providerId: 'modelscope' })],
    [],
    {
      providers: [
        { id: 'modelscope', label: 'ModelScope', protocol: 'modelscope', enabled: true, hasApiKey: false },
      ],
    },
  );

  assert.equal(issues.some((issue) => issue.code === 'PROVIDER_NOT_READY' && issue.nodeId === 'image-1'), true);
});

test('runPreflight accepts connected valid workflow with ready provider', () => {
  const issues = runPreflight(
    [
      node('prompt-1', 'idea'),
      node('image-1', 'image', { providerSource: 'modelscope', providerId: 'modelscope' }),
      node('out-1', 'output'),
    ],
    [edge('p-i', 'prompt-1', 'image-1'), edge('i-o', 'image-1', 'out-1')],
    {
      providers: [
        { id: 'modelscope', label: 'ModelScope', protocol: 'modelscope', enabled: true, hasApiKey: true },
      ],
    },
  );

  assert.deepEqual(issues, []);
});
