import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const proxySource = fs.readFileSync(path.join(here, '../backend/src/routes/proxy.js'), 'utf8');

function loadVideoUrlCollector() {
  const match = proxySource.match(
    /function looseObjectKey[\s\S]*?(?=\nfunction findLooseVideoUrl)/,
  );
  assert.ok(match, 'video URL collector helpers should exist');
  return Function(`${match[0]}\nreturn collectLooseVideoUrls;`)() as (
    value: unknown,
  ) => string[];
}

test('Seedance query can extract completed video URLs nested in arrays', () => {
  const collectLooseVideoUrls = loadVideoUrlCollector();

  assert.deepEqual(
    collectLooseVideoUrls({
      status: 'succeeded',
      data: [{ output: { video_url: 'https://cdn.example.com/result.mp4' } }],
    }),
    ['https://cdn.example.com/result.mp4'],
  );
});
