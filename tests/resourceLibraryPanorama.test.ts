import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

test('resource library supports panorama kind with indoor and outdoor categories', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-resource-panorama-'));
  const inputDir = path.join(tmpDir, 'input');
  const resourcesDir = path.join(tmpDir, 'resources');
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, 'room-pano.png'), ONE_PIXEL_PNG);

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    INPUT_DIR: config.INPUT_DIR,
    OUTPUT_DIR: config.OUTPUT_DIR,
  };
  t.after(() => Object.assign(config, oldConfig));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = resourcesDir;
  config.INPUT_DIR = inputDir;
  config.OUTPUT_DIR = path.join(tmpDir, 'output');

  const express = require('express');
  const resourcesRouter = require('../backend/src/routes/resources.js');
  const app = express();
  app.use('/api/resources', resourcesRouter);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const categories = await fetch(`${base}/api/resources/categories?kind=panorama`).then((res) => res.json());
  assert.equal(categories.success, true);
  assert.deepEqual(
    categories.data.map((cat: any) => cat.name).slice(0, 3),
    ['未分类', '室内', '室外'],
  );
  const indoor = categories.data.find((cat: any) => cat.name === '室内');
  assert.ok(indoor?.id);

  const added = await fetch(`${base}/api/resources/items/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: '/files/input/room-pano.png',
      kind: 'panorama',
      categoryId: indoor.id,
      title: '室内展厅全景',
      tags: ['3D全景'],
    }),
  }).then((res) => res.json());

  assert.equal(added.success, true);
  assert.equal(added.data.kind, 'panorama');
  assert.equal(added.data.categoryId, indoor.id);
  assert.match(added.data.fileUrl, /^\/api\/resources\/file\//);
  assert.match(added.data.thumbUrl, /^\/api\/resources\/thumb\//);

  const db = JSON.parse(fs.readFileSync(path.join(resourcesDir, 'resource_library.json'), 'utf-8'));
  const stored = db.items.find((item: any) => item.id === added.data.id);
  assert.match(stored.fileRel, /^panorama\//);
  assert.equal(fs.existsSync(path.join(resourcesDir, stored.fileRel)), true);

  const listed = await fetch(`${base}/api/resources/items?kind=panorama&categoryId=${encodeURIComponent(indoor.id)}`)
    .then((res) => res.json());
  assert.equal(listed.success, true);
  assert.equal(listed.data.length, 1);
  assert.equal(listed.data[0].title, '室内展厅全景');
});

test('panorama resource kind is wired through frontend save, drawer, and insert paths', () => {
  const api = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
  const drawer = readFileSync(new URL('../src/components/ResourceLibraryDrawer.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const panorama = readFileSync(new URL('../src/components/nodes/Panorama3DNode.tsx', import.meta.url), 'utf8');
  const sendMaterials = readFileSync(new URL('../src/utils/sendMaterials.ts', import.meta.url), 'utf8');

  assert.match(api, /ResourceKind = 'image' \| 'video' \| 'audio' \| 'panorama'/);
  assert.match(api, /ResourceAddKind = ResourceMediaKind \| 'panorama'/);
  assert.match(drawer, /panorama:\s*\{\s*label:\s*'全景'/);
  assert.match(drawer, /item\.kind === 'panorama' \? 'image'/);
  assert.match(drawer, /item\.kind === 'image' \|\| item\.kind === 'panorama'/);
  assert.match(app, /item\.kind === 'panorama' \? 'image' : item\.kind/);
  assert.match(sendMaterials, /item\.kind === 'panorama' \? 'image'/);
  assert.match(panorama, /getResourceCategories\('panorama'\)/);
  assert.match(panorama, /kind:\s*'panorama'/);
});
