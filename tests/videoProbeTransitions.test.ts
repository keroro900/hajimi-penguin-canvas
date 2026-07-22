import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(rel: string) {
  return readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

test('video ops can prefer ffprobe json and fall back to ffmpeg stderr', () => {
  const media = read('backend/src/providers/llmMedia.js');
  const videoOps = read('backend/src/routes/videoOps.js');

  assert.match(media, /function resolveBundledFfprobe\(\)/);
  assert.match(media, /process\.env\.T8_FFPROBE_BIN/);
  assert.match(media, /resolveBundledFfprobe,/);
  assert.match(videoOps, /resolveBundledFfmpeg,\s*resolveBundledFfprobe/);
  assert.match(videoOps, /function runFfprobeJson/);
  assert.match(videoOps, /probeSource:\s*'ffprobe-json'/);
  assert.match(videoOps, /probeSource:\s*'ffmpeg-stderr'/);
  assert.match(videoOps, /falling back to ffmpeg stderr/);
});

test('video transition catalog and optional ffprobe sidecar are packaged', () => {
  const transitions = JSON.parse(read('shared/videoTransitions.json'));
  const pkg = read('package.json');
  const postBuild = read('electron/_post_build.cjs');

  assert.equal(transitions.version, 1);
  assert.ok(Array.isArray(transitions.transitions));
  assert.ok(transitions.transitions.some((item: any) => item.id === 'fade' && item.xfade === 'fade'));
  assert.ok(transitions.transitions.some((item: any) => item.id === 'circleopen'));
  assert.match(pkg, /"videoTransitions\.json"/);
  assert.match(pkg, /"ffprobe\.exe"/);
  assert.match(pkg, /"ffprobe"/);
  assert.match(postBuild, /videoTransitions\.json/);
  assert.match(postBuild, /ffprobe sidecar not bundled/);
});
