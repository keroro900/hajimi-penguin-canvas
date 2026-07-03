import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

test('LUT color node is registered as a visible image-to-image utility node', () => {
  const registry = read('src/config/nodeRegistry.ts');
  const ports = read('src/config/portTypes.ts');
  const types = read('src/types/canvas.ts');
  const canvas = read('src/components/Canvas.tsx');
  const actionBar = read('src/components/NodeActionBar.tsx');
  const node = read('src/components/nodes/LutColorNode.tsx');
  const service = read('src/services/imageOps.ts');
  const presets = read('src/utils/lutPresets.ts');
  const localPreview = read('src/utils/localLutPreview.ts');
  const gpuPreview = read('src/components/nodes/LutGpuPreview.tsx');

  assert.match(registry, /type:\s*'lut-color'[\s\S]*label:\s*'LUT调色'[\s\S]*category:\s*'utility'/);
  assert.match(ports, /'lut-color':\s*\{\s*inputs:\s*\['image'\],\s*outputs:\s*\['image'\]\s*\}/);
  assert.match(types, /\|\s*'lut-color'/);
  assert.match(canvas, /const LutColorNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/LutColorNode'\)/);
  assert.match(canvas, /'lut-color':\s*LutColorNode/);
  assert.match(canvas, /'lut-color':\s*\{[\s\S]*lutPresetId:\s*'cinematic-teal-orange'/);
  assert.match(actionBar, /'lut-color'/);
  assert.match(node, /LUT_PRESETS/);
  assert.match(node, /type="file"[\s\S]*accept="\.cube/);
  assert.match(node, /processAllInputs/);
  assert.match(node, /lut-preview-card/);
  assert.match(node, /lut-node-workspace/);
  assert.match(node, /lut-preset-library/);
  assert.match(node, /lut-preview-panel/);
  assert.match(node, /previewUrl/);
  assert.match(node, /LutGpuPreview/);
  assert.doesNotMatch(node, /renderLocalLutPreview/);
  assert.match(node, /gpuPreviewError/);
  assert.match(node, /const effectivePreviewUrl = previewUrl \|\| previewSource/);
  assert.match(node, /previewUrl=\{previewUrl\}/);
  assert.match(localPreview, /export async function renderLocalLutPreview/);
  assert.match(localPreview, /document\.createElement\('canvas'\)/);
  assert.match(localPreview, /canvas\.toDataURL\('image\/png'\)/);
  assert.doesNotMatch(localPreview, /toDataURL\('image\/webp'/);
  assert.match(localPreview, /parseCubeLut/);
  assert.match(localPreview, /sampleCubeLut/);
  assert.match(localPreview, /applyLocalHslAdjustments/);
  assert.match(localPreview, /applyLocalToneAdjustments/);
  assert.match(localPreview, /glfx\.js/);
  assert.match(node, /setTimeout\(/);
  assert.match(node, /90\)/);
  assert.match(node, /if \(openColorStudio\) \{[\s\S]{0,260}setPreviewBusy\(false\)/);
  assert.match(node, /\}, \[previewSource, activeText, amount, hslOptions, openColorStudio\]\)/);
  assert.match(node, /async function generatePreviewNow/);
  assert.match(node, /const freshUrl = await generatePreviewNow\(\)/);
  assert.match(node, /item = await ensureResultItem\(\)/);
  assert.doesNotMatch(node, /预览生成中/);
  assert.match(node, /更新中/);
  assert.match(node, /lut-preview-status/);
  assert.match(node, /data-lut-preset-card/);
  assert.match(node, /SmartMediaPreviewModal/);
  assert.match(node, /saveFileToDisk/);
  assert.match(node, /getLutLibrary/);
  assert.match(node, /loadLutTemplate/);
  assert.match(node, /lut-template-library/);
  assert.match(node, /用户 LUT/);
  assert.match(node, /刷新/);
  assert.match(node, /createUploadDataFromItems/);
  assert.match(node, /type:\s*'upload'/);
  assert.match(node, /type:\s*'output'/);
  assert.match(node, /directImageUrl/);
  assert.match(node, /createOutputDataFromItems\('image', \[item\]\)/);
  assert.match(node, /createUploadDataFromItems\('image', \[item\]\)/);
  assert.doesNotMatch(node, /sourceNodeId:\s*p\.id/);
  assert.doesNotMatch(node, /sourceLabel:\s*'LUT调色'/);
  assert.match(node, /保存本地/);
  assert.match(node, /输出节点/);
  assert.match(node, /上传节点/);
  assert.match(node, /LutColorStudioModal/);
  assert.match(node, /openColorStudio/);
  assert.match(node, /createPortal/);
  assert.match(node, /lut-color-studio-modal/);
  assert.match(node, /lut-color-studio-preview/);
  assert.match(node, /高级调色台/);
  assert.match(node, /targetAdjustActive/);
  assert.match(node, /data-lut-target-adjust/);
  assert.match(node, /sampleColorRangeFromImage/);
  assert.match(node, /rgbToHue/);
  assert.match(node, /rangeFromHue/);
  assert.match(node, /预设：/);
  assert.match(node, /默认值/);
  assert.match(node, /目标调整/);
  assert.doesNotMatch(node, /lut-color-studio-preview[\s\S]{0,3500}place-items-center rounded-md bg-black\/45[\s\S]{0,400}预览生成中/);
  assert.match(node, /alt="高级调色台实时预览"[\s\S]{0,240}loading="eager"/);
  assert.match(node, /<LutGpuPreview[\s\S]{0,900}imageUrl=\{previewSource\}/);
  assert.match(node, /lutText=\{activeText\}/);
  assert.match(node, /hslHue=\{values\.lutHue\}/);
  assert.match(node, /brightness=\{values\.lutBrightness\}/);
  assert.match(node, /curves=\{values\.lutCurves\}/);
  assert.doesNotMatch(node, /lut-color-studio-preview[\s\S]{0,1200}<SmartImage/);
  assert.match(gpuPreview, /canvasRef/);
  assert.match(gpuPreview, /getContext\('webgl2'/);
  assert.match(gpuPreview, /sampler2D u_image/);
  assert.match(gpuPreview, /sampler2D u_lut/);
  assert.match(gpuPreview, /uniform vec3 u_domainMin/);
  assert.match(gpuPreview, /uniform vec3 u_domainMax/);
  assert.match(gpuPreview, /DOMAIN_MIN/);
  assert.match(gpuPreview, /DOMAIN_MAX/);
  assert.match(gpuPreview, /gl\.uniform3f\(state\.uniforms\.domainMin/);
  assert.match(gpuPreview, /gl\.uniform3f\(state\.uniforms\.domainMax/);
  assert.match(gpuPreview, /vec3 c000 = texture2D\(u_lut/);
  assert.match(gpuPreview, /vec3 c111 = texture2D\(u_lut/);
  assert.match(gpuPreview, /\(gy0 \* size \+ rx0 \+ 0\.5\) \/ \(size \* size\)/);
  assert.match(gpuPreview, /\(bz0 \+ 0\.5\) \/ size/);
  assert.match(gpuPreview, /return mix\(c0, c1, fracv\.b\)/);
  assert.match(gpuPreview, /createTexture\(gl, gl\.TEXTURE0\)/);
  assert.match(gpuPreview, /createTexture\(gl, gl\.TEXTURE1, gl\.NEAREST\)/);
  assert.match(gpuPreview, /createTexture\(gl, gl\.TEXTURE2, gl\.NEAREST\)/);
  assert.match(gpuPreview, /new Float32Array\(\[-1, -1, -1, 1, 1, -1, 1, 1\]\)/);
  assert.match(gpuPreview, /function bindPreviewTextures/);
  assert.match(gpuPreview, /gl\.activeTexture\(gl\.TEXTURE0\)[\s\S]{0,120}state\.imageTexture/);
  assert.match(gpuPreview, /gl\.activeTexture\(gl\.TEXTURE1\)[\s\S]{0,120}state\.lutTexture/);
  assert.match(gpuPreview, /gl\.activeTexture\(gl\.TEXTURE2\)[\s\S]{0,120}state\.curveTexture/);
  assert.match(gpuPreview, /const stateRef = useRef<GpuState \| null>\(null\)/);
  assert.match(gpuPreview, /useEffect\(\(\) => \{[\s\S]*props\.imageUrl[\s\S]*\}, \[props\.imageUrl, props\.onFallback\]\)/);
  assert.match(gpuPreview, /useEffect\(\(\) => \{[\s\S]*applyPreviewProps\(state, props\)[\s\S]*props\.lutText/);
  assert.match(gpuPreview, /requestAnimationFrame/);
  assert.match(gpuPreview, /onFallback/);
  assert.match(node, /选择颜色范围/);
  assert.match(node, /data-lut-range/);
  assert.match(node, /色相/);
  assert.match(node, /饱和度/);
  assert.match(node, /明度/);
  assert.match(node, /type="number"[\s\S]{0,220}aria-label=\{`\$\{label\}数值`\}/);
  assert.match(node, /inputMode="numeric"/);
  assert.match(node, /onBlur=\{\(\) => update\(\{ \[keyName\]: clampSlider\(value, min, max, 0\) \}\)\}/);
  assert.match(node, /aria-label="曲线预设强度数值"/);
  assert.match(node, /着色/);
  assert.match(node, /lutHue/);
  assert.match(node, /lutSaturation/);
  assert.match(node, /lutLightness/);
  assert.match(node, /lutColorize/);
  assert.match(node, /lutRange/);
  assert.match(node, /lutEnabled/);
  assert.match(node, /lutAdjustEnabled/);
  assert.match(node, /亮度/);
  assert.match(node, /对比度/);
  assert.match(node, /曲线/);
  assert.match(node, /lutBrightness/);
  assert.match(node, /lutContrast/);
  assert.match(node, /lutCurve/);
  assert.match(node, /lutCurveAmount/);
  assert.match(node, /lutCurves/);
  assert.match(node, /curveChannel/);
  assert.match(node, /curveDragRef/);
  assert.match(node, /handleCurvePointerDown/);
  assert.match(node, /onPointerMove=\{handleCurvePointerMove\}/);
  assert.match(node, /onPointerUp=\{handleCurvePointerUp\}/);
  assert.match(node, /data-curve-point-index/);
  assert.match(node, /点击或拖动曲线点/);
  assert.match(node, /data-curve-channel=\{item\.id\}/);
  assert.match(node, /\{\s*id:\s*'rgb'[\s\S]*label:\s*'RGB'/);
  assert.match(node, /\{\s*id:\s*'r'[\s\S]*label:\s*'红'/);
  assert.match(node, /\{\s*id:\s*'g'[\s\S]*label:\s*'绿'/);
  assert.match(node, /\{\s*id:\s*'b'[\s\S]*label:\s*'蓝'/);
  assert.doesNotMatch(node, /renderSettings[\s\S]{0,9000}lut-color-studio grid/);
  assert.match(canvas, /lutHue:\s*0/);
  assert.match(canvas, /lutSaturation:\s*0/);
  assert.match(canvas, /lutLightness:\s*0/);
  assert.match(canvas, /lutColorize:\s*false/);
  assert.match(canvas, /lutRange:\s*'master'/);
  assert.match(canvas, /lutEnabled:\s*true/);
  assert.match(canvas, /lutAdjustEnabled:\s*true/);
  assert.match(canvas, /lutBrightness:\s*0/);
  assert.match(canvas, /lutContrast:\s*0/);
  assert.match(canvas, /lutCurve:\s*'linear'/);
  assert.match(canvas, /lutCurveAmount:\s*100/);
  assert.doesNotMatch(node, /T8 内置/);
  assert.match(service, /export const opLut/);
  assert.match(service, /lutEnabled/);
  assert.match(service, /adjustEnabled/);
  assert.match(service, /hslHue/);
  assert.match(service, /hslSaturation/);
  assert.match(service, /hslLightness/);
  assert.match(service, /hslRange/);
  assert.match(service, /hslColorize/);
  assert.match(service, /brightness/);
  assert.match(service, /contrast/);
  assert.match(service, /curve/);
  assert.match(service, /curveAmount/);
  assert.match(service, /curves/);
  assert.match(service, /export const getLutLibrary/);
  assert.match(service, /export const loadLutTemplate/);
  assert.match(presets, /cinematic-teal-orange/);
  assert.match(presets, /sourceName/);
  assert.match(presets, /YahiaAngelo\/Film-Luts/);
  assert.match(presets, /createPresetCubeText/);
});

test('image LUT library scans bundled open-source LUTs and the user LUT folder', async () => {
  const express = require('express');
  const config = require('../backend/src/config.js');
  const imageOpsRouter = require('../backend/src/routes/imageOps.js');
  const { createCubeLutText } = require('../backend/src/utils/lutCube.js');

  const root = mkdtempSync(join(tmpdir(), 't8-lut-library-'));
  const bundledDir = join(root, 'open-source');
  const userDir = join(root, 'user-luts');
  const oldBundled = config.BUNDLED_LUT_DIR;
  const oldUser = config.USER_LUT_DIR;
  config.BUNDLED_LUT_DIR = bundledDir;
  config.USER_LUT_DIR = userDir;

  try {
    mkdirSync(join(bundledDir, 'Film-Luts', 'Print'), { recursive: true });
    mkdirSync(userDir, { recursive: true });
    const cubeText = createCubeLutText('Library Test', 2, (r: number, g: number, b: number) => [r, g, b]);
    writeFileSync(join(bundledDir, 'Film-Luts', 'Print', 'kodak_2383.cube'), cubeText);
    writeFileSync(join(userDir, 'My_Custom-Look.cube'), cubeText);

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/image', imageOpsRouter);

    const listed = await fetchGetRoute(app, '/api/image/lut-library');
    assert.equal(listed.status, 200);
    assert.equal(listed.json.success, true);
    assert.equal(listed.json.data.userDir, userDir);
    const items = listed.json.data.items;
    assert.ok(items.some((item: any) => item.source === 'open-source' && item.sourceName === 'YahiaAngelo/Film-Luts'));
    const bundledItem = items.find((item: any) => item.source === 'open-source');
    const userItem = items.find((item: any) => item.source === 'user');
    assert.equal(userItem.name, 'My_Custom-Look');
    assert.equal(userItem.displayName, 'My_Custom-Look');
    assert.match(bundledItem.displayName, /柯达|Kodak/);
    assert.equal(bundledItem.fileName, 'kodak_2383.cube');

    const loaded = await fetchGetRoute(app, `/api/image/lut-library/${encodeURIComponent(bundledItem.id)}`);
    assert.equal(loaded.status, 200);
    assert.match(loaded.json.data.lutText, /LUT_3D_SIZE 2/);
  } finally {
    config.BUNDLED_LUT_DIR = oldBundled;
    config.USER_LUT_DIR = oldUser;
    rmSync(root, { recursive: true, force: true });
  }
});

test('image LUT route applies a cube LUT to a local image', async () => {
  const express = require('express');
  const sharp = require('sharp');
  const config = require('../backend/src/config.js');
  const imageOpsRouter = require('../backend/src/routes/imageOps.js');
  const { createCubeLutText } = require('../backend/src/utils/lutCube.js');

  const root = mkdtempSync(join(tmpdir(), 't8-lut-'));
  const inputDir = join(root, 'input');
  const outputDir = join(root, 'output');
  const oldInput = config.INPUT_DIR;
  const oldOutput = config.OUTPUT_DIR;
  config.INPUT_DIR = inputDir;
  config.OUTPUT_DIR = outputDir;

  try {
    await import('node:fs/promises').then((fs) => Promise.all([
      fs.mkdir(inputDir, { recursive: true }),
      fs.mkdir(outputDir, { recursive: true }),
    ]));
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 64, g: 128, b: 192, alpha: 1 },
      },
    }).png().toFile(join(inputDir, 'pixel.png'));

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/image', imageOpsRouter);

    const lutText = createCubeLutText('Invert', 2, (r: number, g: number, b: number) => [1 - r, 1 - g, 1 - b]);
    const response = await fetchRoute(app, '/api/image/lut', {
      imageUrl: '/files/input/pixel.png',
      lutText,
      amount: 1,
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.success, true);
    assert.match(response.json.data.imageUrl, /^\/files\/output\/op_/);
    const outputFile = join(outputDir, response.json.data.imageUrl.replace('/files/output/', ''));
    const raw = await sharp(outputFile).ensureAlpha().raw().toBuffer();
    assertPixelNear([...raw], [191, 127, 63, 255], 1);
  } finally {
    config.INPUT_DIR = oldInput;
    config.OUTPUT_DIR = oldOutput;
    rmSync(root, { recursive: true, force: true });
  }
});

test('image LUT route applies Photoshop-style hue and saturation adjustments after the LUT', async () => {
  const express = require('express');
  const sharp = require('sharp');
  const config = require('../backend/src/config.js');
  const imageOpsRouter = require('../backend/src/routes/imageOps.js');
  const { createCubeLutText } = require('../backend/src/utils/lutCube.js');

  const root = mkdtempSync(join(tmpdir(), 't8-lut-hsl-'));
  const inputDir = join(root, 'input');
  const outputDir = join(root, 'output');
  const oldInput = config.INPUT_DIR;
  const oldOutput = config.OUTPUT_DIR;
  config.INPUT_DIR = inputDir;
  config.OUTPUT_DIR = outputDir;

  try {
    await import('node:fs/promises').then((fs) => Promise.all([
      fs.mkdir(inputDir, { recursive: true }),
      fs.mkdir(outputDir, { recursive: true }),
    ]));
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toFile(join(inputDir, 'red.png'));

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/image', imageOpsRouter);

    const lutText = createCubeLutText('Identity', 2, (r: number, g: number, b: number) => [r, g, b]);
    const response = await fetchRoute(app, '/api/image/lut', {
      imageUrl: '/files/input/red.png',
      lutText,
      lutEnabled: false,
      adjustEnabled: true,
      amount: 1,
      hslHue: 120,
      hslSaturation: 0,
      hslLightness: 0,
      hslRange: 'master',
      hslColorize: false,
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.success, true);
    assert.equal(response.json.data.lutEnabled, false);
    assert.equal(response.json.data.adjustEnabled, true);
    assert.equal(response.json.data.hsl.hue, 120);
    assert.equal(response.json.data.hsl.range, 'master');
    const outputFile = join(outputDir, response.json.data.imageUrl.replace('/files/output/', ''));
    const raw = await sharp(outputFile).ensureAlpha().raw().toBuffer();
    assertPixelNear([...raw], [0, 255, 0, 255], 2);
  } finally {
    config.INPUT_DIR = oldInput;
    config.OUTPUT_DIR = oldOutput;
    rmSync(root, { recursive: true, force: true });
  }
});

test('image LUT route can run brightness, contrast, and curve adjustments without a LUT', async () => {
  const express = require('express');
  const sharp = require('sharp');
  const config = require('../backend/src/config.js');
  const imageOpsRouter = require('../backend/src/routes/imageOps.js');

  const root = mkdtempSync(join(tmpdir(), 't8-lut-tone-'));
  const inputDir = join(root, 'input');
  const outputDir = join(root, 'output');
  const oldInput = config.INPUT_DIR;
  const oldOutput = config.OUTPUT_DIR;
  config.INPUT_DIR = inputDir;
  config.OUTPUT_DIR = outputDir;

  try {
    await import('node:fs/promises').then((fs) => Promise.all([
      fs.mkdir(inputDir, { recursive: true }),
      fs.mkdir(outputDir, { recursive: true }),
    ]));
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 128, g: 128, b: 128, alpha: 1 },
      },
    }).png().toFile(join(inputDir, 'gray.png'));

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/image', imageOpsRouter);

    const response = await fetchRoute(app, '/api/image/lut', {
      imageUrl: '/files/input/gray.png',
      lutEnabled: false,
      adjustEnabled: true,
      brightness: 20,
      contrast: 25,
      curve: 'soft-contrast',
      curveAmount: 100,
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.success, true);
    assert.equal(response.json.data.lutEnabled, false);
    assert.equal(response.json.data.adjust.brightness, 20);
    assert.equal(response.json.data.adjust.contrast, 25);
    assert.equal(response.json.data.adjust.curve, 'soft-contrast');
    const outputFile = join(outputDir, response.json.data.imageUrl.replace('/files/output/', ''));
    const raw = await sharp(outputFile).ensureAlpha().raw().toBuffer();
    assert.ok(raw[0] > 128 && raw[1] > 128 && raw[2] > 128, `expected brighter gray, got ${[...raw]}`);
  } finally {
    config.INPUT_DIR = oldInput;
    config.OUTPUT_DIR = oldOutput;
    rmSync(root, { recursive: true, force: true });
  }
});

test('image LUT route applies independent RGB and per-channel curves', async () => {
  const express = require('express');
  const sharp = require('sharp');
  const config = require('../backend/src/config.js');
  const imageOpsRouter = require('../backend/src/routes/imageOps.js');

  const root = mkdtempSync(join(tmpdir(), 't8-lut-curves-'));
  const inputDir = join(root, 'input');
  const outputDir = join(root, 'output');
  const oldInput = config.INPUT_DIR;
  const oldOutput = config.OUTPUT_DIR;
  config.INPUT_DIR = inputDir;
  config.OUTPUT_DIR = outputDir;

  try {
    await import('node:fs/promises').then((fs) => Promise.all([
      fs.mkdir(inputDir, { recursive: true }),
      fs.mkdir(outputDir, { recursive: true }),
    ]));
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 96, g: 96, b: 96, alpha: 1 },
      },
    }).png().toFile(join(inputDir, 'neutral.png'));

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/image', imageOpsRouter);

    const response = await fetchRoute(app, '/api/image/lut', {
      imageUrl: '/files/input/neutral.png',
      lutEnabled: false,
      adjustEnabled: true,
      curves: {
        rgb: [[0, 0], [255, 255]],
        r: [[0, 0], [96, 180], [255, 255]],
        g: [[0, 0], [255, 255]],
        b: [[0, 0], [255, 255]],
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.success, true);
    assert.equal(response.json.data.adjust.curves.r.length, 3);
    const outputFile = join(outputDir, response.json.data.imageUrl.replace('/files/output/', ''));
    const raw = await sharp(outputFile).ensureAlpha().raw().toBuffer();
    assert.ok(raw[0] > 160, `expected red curve to raise red, got ${[...raw]}`);
    assertPixelNear([raw[1], raw[2], raw[3]], [96, 96, 255], 2);
  } finally {
    config.INPUT_DIR = oldInput;
    config.OUTPUT_DIR = oldOutput;
    rmSync(root, { recursive: true, force: true });
  }
});

function assertPixelNear(actual: number[], expected: number[], tolerance: number) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      `channel ${i}: expected ${expected[i]} +/- ${tolerance}, got ${actual[i]}`,
    );
  }
}

async function fetchRoute(app: any, path: string, body: any): Promise<{ status: number; json: any }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function fetchGetRoute(app: any, path: string): Promise<{ status: number; json: any }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, json: await response.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
