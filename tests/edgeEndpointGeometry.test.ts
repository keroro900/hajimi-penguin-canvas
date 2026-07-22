import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Position } from '@xyflow/react';
import {
  CARD_EDGE_HANDLE_OFFSET,
  attachEdgeEndpointToCard,
} from '../src/utils/edgeEndpointGeometry.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('outside left and right handles resolve their edge anchor back to the card border', () => {
  assert.equal(CARD_EDGE_HANDLE_OFFSET, 27);
  assert.equal(attachEdgeEndpointToCard(73, Position.Left), 100);
  assert.equal(attachEdgeEndpointToCard(327, Position.Right), 300);
});

test('top, bottom, and GroupBox endpoint geometry is not compensated', () => {
  assert.equal(attachEdgeEndpointToCard(100, Position.Top), 100);
  assert.equal(attachEdgeEndpointToCard(100, Position.Bottom), 100);
  assert.equal(attachEdgeEndpointToCard(81, Position.Left, 'groupBox'), 81);
  assert.equal(attachEdgeEndpointToCard(319, Position.Right, 'groupBox'), 319);
});

test('completed edges and connection previews share the card-attached endpoint helper', () => {
  const edge = readFileSync(resolve(root, 'src/components/edges/DeletableEdge.tsx'), 'utf8');
  const canvas = readFileSync(resolve(root, 'src/components/Canvas.tsx'), 'utf8');
  assert.match(edge, /attachEdgeEndpointToCard\(sourceX, sourcePosition, sourceNode\?\.type\)/);
  assert.match(edge, /attachEdgeEndpointToCard\(targetX, targetPosition, targetNode\?\.type\)/);
  assert.match(canvas, /attachEdgeEndpointToCard\(fromX, fromPosition, fromNode\.type\)/);
  assert.match(canvas, /toNode\s*&&\s*toHandle[\s\S]{0,180}attachEdgeEndpointToCard\(toX, toPosition, toNode\.type\)/);
});

test('the compensation includes half of the hit target and half of the largest visible handle', () => {
  const css = readFileSync(resolve(root, 'src/styles/theme-core.css'), 'utf8');
  const hitSize = css.match(/--t8-handle-hit-size:\s*(\d+)px/);
  const smartSize = css.match(/t8-smart-node-port[\s\S]{0,180}--t8-handle-size:\s*(\d+)px/);
  assert.ok(hitSize);
  assert.ok(smartSize);
  assert.equal(Number(hitSize[1]) / 2 + Number(smartSize[1]) / 2, CARD_EDGE_HANDLE_OFFSET);
});
