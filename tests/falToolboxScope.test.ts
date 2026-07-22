import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const proxy = fs.readFileSync(path.resolve('backend/src/routes/proxy.js'), 'utf8');

test('Fal toolbox media resolver receives settings instead of reading route scope', () => {
  assert.match(
    proxy,
    /async function resolveFalToolboxMediaPayload\(settings, payload, mediaFields, apiKey\)/,
  );
  assert.match(
    proxy,
    /resolveFalToolboxMediaPayload\(settings, payload, mediaFields, apiKey\)/,
  );
});
