import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

test('canvas pan audit records reproducible raw runs and meets interaction thresholds', () => {
  const audit = JSON.parse(readFileSync(resolve(root, 'codex-temp/canvas-pan-performance-audit.json'), 'utf8'));
  assert.ok(audit.baselineRuns.length >= 5);
  assert.ok(audit.postRuns.length >= 5);
  assert.equal(audit.scenario.path.length, 11);

  for (const [key, stored] of Object.entries(audit.medians.baseline) as Array<[string, number]>) {
    assert.equal(Number(median(audit.baselineRuns.map((run: Record<string, number>) => run[key])).toFixed(6)), stored);
  }
  for (const key of ['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration']) {
    assert.equal(Number(median(audit.postRuns.map((run: Record<string, number>) => run[key])).toFixed(6)), audit.medians.post[key]);
  }

  assert.ok(audit.deltasPct.taskImprovement >= audit.thresholds.minimumTaskImprovementPct);
  assert.ok(audit.deltasPct.scriptImprovement >= audit.thresholds.minimumScriptImprovementPct);
  assert.ok(audit.deltasPct.recalcStyleRegression <= audit.thresholds.maximumRecalcStyleRegressionPct);
  assert.ok(audit.renderAudit.cleanFixedZoomWarmupRenderFunctionInvocations <= audit.thresholds.maximumCleanFixedZoomRenderInvocations);
  assert.ok(audit.medians.post.renderFunctionInvocations < audit.renderAudit.pointerPathPoints);
  assert.equal(audit.visualAudit.idleVisibleHandleCount, 0);
  assert.equal(audit.visualAudit.leftSideOnly, true);
  assert.equal(audit.visualAudit.rightSideOnly, true);
  assert.equal(audit.visualAudit.hitTargetCssPx, 38);
  assert.equal(audit.visualAudit.phantomVisible, false);
  assert.equal(audit.passed, true);
});
