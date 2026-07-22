import test from 'node:test';
import assert from 'node:assert/strict';
import {
  smartNodeComposerActions,
  useSmartNodeComposerStore,
} from '../src/stores/smartNodeComposer.ts';

const reset = () => useSmartNodeComposerStore.setState({ activeNodeId: null });

test('open activates a node composer and open on another node atomically replaces it', () => {
  reset();
  useSmartNodeComposerStore.getState().open('node-a');
  assert.equal(useSmartNodeComposerStore.getState().activeNodeId, 'node-a');

  useSmartNodeComposerStore.getState().open('node-b');
  assert.equal(useSmartNodeComposerStore.getState().activeNodeId, 'node-b');
  assert.notEqual(useSmartNodeComposerStore.getState().activeNodeId, 'node-a');
  reset();
});

test('close without an id closes any active composer', () => {
  reset();
  smartNodeComposerActions.open('node-a');
  assert.equal(smartNodeComposerActions.activeNodeId(), 'node-a');

  smartNodeComposerActions.close();
  assert.equal(smartNodeComposerActions.activeNodeId(), null);
});

test('close with an id only closes when that id is active', () => {
  reset();
  smartNodeComposerActions.open('node-a');

  smartNodeComposerActions.close('node-b');
  assert.equal(smartNodeComposerActions.activeNodeId(), 'node-a');

  smartNodeComposerActions.close('node-a');
  assert.equal(smartNodeComposerActions.activeNodeId(), null);
});

test('isOpen reflects the active node through the plain store API', () => {
  reset();
  assert.equal(smartNodeComposerActions.isOpen('node-a'), false);

  smartNodeComposerActions.open('node-a');
  assert.equal(smartNodeComposerActions.isOpen('node-a'), true);
  assert.equal(smartNodeComposerActions.isOpen('node-b'), false);

  // The selector hook reads the same underlying state.
  assert.equal(useSmartNodeComposerStore.getState().activeNodeId === 'node-a', true);

  smartNodeComposerActions.open('node-b');
  assert.equal(smartNodeComposerActions.isOpen('node-a'), false);
  assert.equal(smartNodeComposerActions.isOpen('node-b'), true);
  reset();
});

test('coordinator state is session-only and never persisted', () => {
  reset();
  const source = String(useSmartNodeComposerStore.persist ? 'has-persist' : 'no-persist');
  assert.equal(source, 'no-persist');
});
