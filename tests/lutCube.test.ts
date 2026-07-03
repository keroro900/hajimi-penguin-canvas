import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyCubeLutToRgba,
  createCubeLutText,
  parseCubeLut,
  sampleCubeLut,
} = require('../backend/src/utils/lutCube.js');

test('parseCubeLut reads a 2x2x2 identity cube with title and domain', () => {
  const lut = parseCubeLut(`
TITLE "Identity"
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`);

  assert.equal(lut.title, 'Identity');
  assert.equal(lut.size, 2);
  assert.deepEqual(lut.domainMin, [0, 0, 0]);
  assert.deepEqual(lut.domainMax, [1, 1, 1]);
  assert.deepEqual(sampleCubeLut(lut, 0.25, 0.5, 0.75).map((v: number) => Number(v.toFixed(6))), [
    0.25,
    0.5,
    0.75,
  ]);
});

test('parseCubeLut honors non-default domains before sampling', () => {
  const lut = parseCubeLut(`
LUT_3D_SIZE 2
DOMAIN_MIN 0.2 0.2 0.2
DOMAIN_MAX 0.8 0.8 0.8
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`);

  assert.deepEqual(sampleCubeLut(lut, 0.5, 0.2, 0.8).map((v: number) => Number(v.toFixed(6))), [
    0.5,
    0,
    1,
  ]);
});

test('applyCubeLutToRgba blends the LUT output without changing alpha', () => {
  const invert = parseCubeLut(createCubeLutText('Invert', 2, (r: number, g: number, b: number) => [1 - r, 1 - g, 1 - b]));
  const pixels = Buffer.from([
    64, 128, 192, 77,
    255, 0, 32, 128,
  ]);

  const full = applyCubeLutToRgba(Buffer.from(pixels), invert, 1);
  const half = applyCubeLutToRgba(Buffer.from(pixels), invert, 0.5);

  assert.deepEqual([...full], [
    191, 127, 63, 77,
    0, 255, 223, 128,
  ]);
  assert.deepEqual([...half], [
    128, 128, 128, 77,
    128, 128, 128, 128,
  ]);
});

test('parseCubeLut rejects unsupported or incomplete cube files', () => {
  assert.throws(() => parseCubeLut('LUT_1D_SIZE 2\n0 0 0\n1 1 1'), /只支持 3D LUT|LUT_3D_SIZE/);
  assert.throws(() => parseCubeLut('LUT_3D_SIZE 2\n0 0 0'), /数量不匹配/);
  assert.throws(() => parseCubeLut('LUT_3D_SIZE 1\n0 0 0'), /范围/);
});
