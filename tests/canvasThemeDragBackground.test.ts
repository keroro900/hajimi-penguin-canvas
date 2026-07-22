import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { auditCanvasCss, formatViolations, loadLocalCssImportGraph, selectorHasInteractionState } from './helpers/themeCssAudit.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssDocuments = loadLocalCssImportGraph('src/styles/index.css', projectRoot);

test('canvas interactions cannot restore decorative canvas layers or dot patterns', () => {
  const violations = auditCanvasCss(cssDocuments, { interactionOnly: true });
  assert.deepEqual(violations, [], `interaction canvas artwork remains:\n${formatViolations(violations)}`);
});

test('drag audit matches exact state class tokens and permits safe disabling rules', () => {
  assert.equal(selectorHasInteractionState('.t8-canvas-shell.t8-node-dragging::before'), true);
  assert.equal(selectorHasInteractionState('.t8-canvas-shell.t8-viewport-moving .react-flow__background'), true);
  assert.equal(selectorHasInteractionState('.t8-canvas-shell.t8-node-dragging-extra::before'), false);
  assert.equal(selectorHasInteractionState('.t8-canvas-shell.not-t8-viewport-moving::before'), false);
  assert.equal(selectorHasInteractionState('.t8-canvas-shell:not(.t8-node-dragging)::before'), false);
  assert.equal(selectorHasInteractionState('.t8-canvas-shell.T8-node-dragging::before'), false);
  assert.equal(selectorHasInteractionState(String.raw`.t8-canvas-shell.t8-node\2d dragging::before`), true);
  assert.equal(selectorHasInteractionState('.t8-canvas-shell.t8-node-dragging:not(.disabled)::before'), true);

  const root = postcss.parse(`
    .t8-canvas-shell.t8-node-dragging::before {
      content: "";
      display: none;
      background-image: none;
    }
    .t8-canvas-shell.t8-viewport-moving .react-flow__background {
      visibility: hidden;
      opacity: 0;
      background: none;
    }
  `, { from: 'safe-drag.css' });
  assert.deepEqual(auditCanvasCss([{ file: 'safe-drag.css', root }], { interactionOnly: true }), []);

  const importantPaint = postcss.parse(`
    .t8-canvas-shell.t8-node-dragging { background-image: linear-gradient(#111, #222) !important; background: none; }
  `, { from: 'important-paint.css' });
  assert.equal(auditCanvasCss([{ file: 'important-paint.css', root: importantPaint }], { interactionOnly: true }).length, 1);

  const importantDisable = postcss.parse(`
    .t8-canvas-shell.t8-node-dragging { background: none !important; background-image: linear-gradient(#111, #222); }
  `, { from: 'important-disable.css' });
  assert.deepEqual(auditCanvasCss([{ file: 'important-disable.css', root: importantDisable }], { interactionOnly: true }), []);

  const escapedActivePaint = postcss.parse(String.raw`
    .t8-canvas-shell.t8-node\2d dragging::before { content: ""; background-image: linear-gradient(#111, #222); }
  `, { from: 'escaped-active-paint.css' });
  const escapedViolations = auditCanvasCss([{ file: 'escaped-active-paint.css', root: escapedActivePaint }], { interactionOnly: true });
  assert.equal(escapedViolations.length, 1);
  assert.equal(escapedViolations[0].reason, 'active pseudo background-image image paint');
});
