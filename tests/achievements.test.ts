import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('achievement manifest gives every system theme time milestones and featured medals', () => {
  const manifest = JSON.parse(read('../shared/achievementManifest.json'));
  assert.equal(manifest.schema, 't8-achievement-manifest');
  assert.equal(manifest.themes.length, 11);
  assert.equal(manifest.timeMilestones.length, 5);
  for (const theme of manifest.themes) {
    assert.ok(theme.featured.length >= 3, `${theme.style} should have first-batch featured achievements`);
  }
  const dragonBall = manifest.themes.find((theme: any) => theme.style === 'dragon-ball');
  assert.ok(dragonBall.featured.some((item: any) => item.idSuffix === 'shenron-mode'));
  assert.equal(
    manifest.films.find((film: any) => film.id === 'film-dragon-ball-01').unlockAchievementId,
    'dragon-ball-shenron-mode',
  );
  const saintSeiya = manifest.themes.find((theme: any) => theme.style === 'saint-seiya');
  assert.ok(saintSeiya.featured.some((item: any) => item.idSuffix === 'athena-return'));
  assert.equal(
    manifest.films.find((film: any) => film.id === 'film-saint-seiya-01').unlockAchievementId,
    'saint-seiya-athena-return',
  );
  assert.equal(manifest.films.length, 5);
  assert.equal(manifest.films.every((film: any) => film.lockedText === '待解锁'), true);
  assert.equal(manifest.films.every((film: any) => film.unavailableText === '影片素材待提供'), true);

  const source = read('../src/data/achievementManifest.ts');
  assert.match(source, /buildAchievementDefinitions/);
  assert.match(source, /\$\{theme\.style\}-time-\$\{milestone\.key\}/);
  assert.match(source, /normalizeAchievementTheme/);
});

test('Saint Seiya theme is a full-canvas sanctuary skin, not only a floating panel', () => {
  const css = read('../src/styles/theme-saintseiya.css');
  const templates = read('../src/theme/defaultTemplates.ts');

  assert.match(css, /Full Sanctuary skin/);
  assert.match(css, /\.t8-app-shell/);
  assert.match(css, /\.t8-sidebar/);
  assert.match(css, /\.t8-canvas-shell/);
  assert.match(css, /react-flow__pane/);
  assert.match(css, /react-flow__minimap/);
  assert.match(css, /CLOTH BOX/);
  assert.match(css, /data-saint-mode="hades"/);
  assert.match(css, /ATHENA SANCTUARY/);
  assert.match(css, /t8-saint-hades-cutscene__hair/);
  assert.match(css, /t8-saint-hades-cutscene__robe/);
  assert.match(css, /saint-athena-aura/);
  assert.match(css, /data-saint-mode="hades"\]:not\(\[data-theme-mode="dark"\]\)[\s\S]*\.t8-toolbar-button/);
  assert.match(css, /data-saint-mode="hades"\]:not\(\[data-theme-mode="dark"\]\)[\s\S]*\.t8-saint-gold-track/);
  assert.match(read('../src/styles/index.css'), /data-theme-visual="saint-seiya"[\s\S]*t8-achievement-drawer__panel/);
  assert.match(read('../src/styles/index.css'), /t8-achievement-film-stage[\s\S]*t8-achievement-saint-cosmo/);
  assert.match(css, /-webkit-text-fill-color:\s*#211607/);
  assert.match(templates, /canvasBg:\s*'#10264a'/);
  assert.doesNotMatch(templates, /const saintSeiyaLight[\s\S]*canvasBg:\s*'#dfe8ee'/);
});

test('Saint Seiya sanctuary HUD avoids duplicate maps and runs battles automatically', () => {
  const css = read('../src/styles/theme-saintseiya.css');
  const component = read('../src/components/SaintSeiyaSanctuary.tsx');

  assert.match(css, /Sanctuary HUD v2/);
  assert.match(css, /\.t8-saint-sanctuary__map-layer\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /react-flow__minimap\s*\{[\s\S]*overflow:\s*hidden\s*!important/);
  assert.match(css, /react-flow__minimap svg\s*\{[\s\S]*margin-top:\s*0\s*!important/);
  assert.match(css, /\.t8-saint-sanctuary__minimap-ping-layer\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /MEIKAI RADAR/);
  assert.match(css, /data-saint-mode="hades"\] \.react-flow__minimap::after/);
  assert.match(css, /\.t8-saint-hades-minimap__gate/);
  assert.match(css, /\.t8-saint-hades-minimap__river/);
  assert.match(css, /\.t8-saint-hades-minimap__scanner/);
  assert.match(css, /\.t8-saint-hades-minimap__temples i/);
  assert.match(css, /@keyframes saint-hades-radar-sweep/);
  assert.match(css, /\.t8-saint-battle--dock\s*\{[\s\S]*right:\s*14px\s*!important/);
  assert.match(css, /\.t8-saint-battle--dock\s*\{[\s\S]*top:\s*98px\s*!important/);
  assert.match(css, /\.t8-saint-gold-track/);
  assert.match(css, /\.t8-saint-gold-card\.is-aries/);
  assert.match(css, /\.t8-saint-gold-card\.is-pisces/);
  assert.match(css, /\.t8-saint-battle__bars/);
  assert.match(css, /\.t8-saint-battle__line/);
  assert.match(css, /\.t8-saint-battle__log\s*\{[\s\S]*overscroll-behavior:\s*contain/);
  assert.match(css, /\.t8-saint-battle__log\s*\{[\s\S]*scrollbar-gutter:\s*stable/);
  assert.match(css, /\.t8-saint-battle__skill-fx/);
  assert.match(css, /\.t8-saint-battle__skill-fx\.is-meteor/);
  assert.match(css, /\.t8-saint-battle__skill-fx\.is-dragon/);
  assert.match(css, /\.t8-saint-battle__skill-fx\.is-aurora/);
  assert.match(css, /\.t8-saint-battle__skill-fx\.is-rose/);
  assert.match(css, /@keyframes saint-skill-fx-sweep/);
  assert.match(css, /\.t8-saint-cloth-unlock--gold/);
  assert.match(css, /data-gold-cloth="sagittarius"/);
  assert.match(css, /data-theme-mode="dark"/);
  assert.match(component, /saint-seiya-minimap-ping/);
  assert.match(component, /is-hades/);
  assert.match(component, /t8-saint-hades-minimap__gate/);
  assert.match(component, /t8-saint-hades-minimap__temples/);
  assert.match(component, /saint-seiya-battle-log/);
  assert.match(component, /自动战斗中/);
  assert.match(component, /battleHideRemaining/);
  assert.match(component, /battleLogRef/);
  assert.match(component, /visibleBattleEventCount/);
  assert.match(component, /battlePlaybackComplete/);
  assert.match(component, /battle\.report\.events/);
  assert.match(component, /log\.scrollTop\s*=\s*log\.scrollHeight/);
  assert.match(component, /onWheelCapture=\{stopBattleLogCanvasEvent\}/);
  assert.match(component, /onPointerDownCapture=\{stopBattleLogCanvasEvent\}/);
  assert.match(component, /SAINT_BATTLE_EVENT_REVEAL_MS\s*=\s*820/);
  assert.match(component, /playSaintBattleSound/);
  assert.match(component, /AudioContext/);
  assert.match(component, /t8-saint-battle__skill-fx/);
  assert.match(component, /t8-saint-gold-card/);
  assert.match(component, /t8-saint-cloth-unlock/);
  assert.match(component, /SAINT_GOLD_CLOTH_UI/);
  assert.match(component, /handleResolveBattle\('auto'\)/);
  assert.match(component, /goldTempleProgress/);
  assert.doesNotMatch(component, /data-canvas-floating-ui="saint-seiya-sanctuary-map"/);
  assert.doesNotMatch(component, />攻击<\/button>/);
  assert.doesNotMatch(component, /收起战报/);
});

test('achievement backend resolves packaged manifest from Electron resources', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-achievements-res-'));
  const sharedDir = path.join(tmpDir, 'shared');
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.copyFileSync(new URL('../shared/achievementManifest.json', import.meta.url), path.join(sharedDir, 'achievementManifest.json'));

  const storePath = require.resolve('../backend/src/achievements/store.js');
  const previousCache = require.cache[storePath];
  const previousResourceRoot = process.env.T8PC_RES;
  delete require.cache[storePath];
  process.env.T8PC_RES = tmpDir;

  t.after(() => {
    if (previousResourceRoot === undefined) {
      delete process.env.T8PC_RES;
    } else {
      process.env.T8PC_RES = previousResourceRoot;
    }
    delete require.cache[storePath];
    if (previousCache) require.cache[storePath] = previousCache;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const store = require('../backend/src/achievements/store.js');
  assert.equal(store.normalizeTheme('dragon-ball'), 'dragon-ball');
  assert.equal(store.normalizeTheme('saint-seiya'), 'saint-seiya');

  const source = read('../backend/src/achievements/store.js');
  assert.match(source, /loadAchievementManifest/);
  assert.match(source, /process\.env\.T8PC_RES/);
  assert.match(source, /shared', 'achievementManifest\.json'/);
});

test('achievement backend records active time, hidden mode, and film placeholders', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-achievements-'));
  const config = require('../backend/src/config.js');
  const oldFile = config.ACHIEVEMENTS_FILE;
  config.ACHIEVEMENTS_FILE = path.join(tmpDir, 'data', 'achievements.json');
  t.after(() => {
    config.ACHIEVEMENTS_FILE = oldFile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const express = require('express');
  const store = require('../backend/src/achievements/store.js');
  const achievementsRouter = require('../backend/src/routes/achievements.js');
  const app = express();
  app.use('/api/achievements', achievementsRouter);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const realNow = Date.now;
  let fakeNow = Date.parse('2026-06-04T00:00:00.000Z');
  Date.now = () => fakeNow;
  t.after(() => {
    Date.now = realNow;
  });

  for (let i = 0; i < 20; i += 1) {
    fakeNow += 30_000;
    const tick = await fetch(`${base}/api/achievements/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'theme.active_tick', theme: 'tech', amountSeconds: 30 }),
    }).then((res) => res.json());
    assert.equal(tick.success, true);
  }

  const beforeDuplicate = store.getProfile().profile.themeStats.tech.activeSeconds;
  const duplicateTick = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'theme.active_tick', theme: 'tech', amountSeconds: 30 }),
  }).then((res) => res.json());
  assert.equal(duplicateTick.success, true);
  assert.equal(store.getProfile().profile.themeStats.tech.activeSeconds, beforeDuplicate);
  fakeNow += 1000;

  const hiddenEnabled = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'hidden_mode.enabled', theme: 'rh', kind: 'rh-duck', mode: 'enabled', nodeType: 'upload' }),
  }).then((res) => res.json());
  assert.equal(hiddenEnabled.success, true);

  const hiddenUsed = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'hidden_mode.used', theme: 'rh', kind: 'rh-duck', mode: 'used', nodeType: 'upload' }),
  }).then((res) => res.json());
  assert.equal(hiddenUsed.success, true);

  const resourceSaved = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'resource.saved', theme: 'pixel', kind: 'image', category: 'image_uncategorized' }),
  }).then((res) => res.json());
  assert.equal(resourceSaved.success, true);

  const workflowSaved = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'workflow.saved', theme: 'op', kind: 'workflow', category: 'workflow' }),
  }).then((res) => res.json());
  assert.equal(workflowSaved.success, true);

  const dragonPano = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'panorama.generated', theme: 'dragon-ball', nodeType: 'panorama-3d' }),
  }).then((res) => res.json());
  assert.equal(dragonPano.success, true);

  const dragonCollected = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'dragon_ball.collected', theme: 'dragon-ball', kind: '4-star' }),
  }).then((res) => res.json());
  assert.equal(dragonCollected.success, true);

  const dragonSet = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'dragon_ball.set_completed', theme: 'dragon-ball', kind: 'seven-stars' }),
  }).then((res) => res.json());
  assert.equal(dragonSet.success, true);

  const dragonHidden = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'hidden_mode.enabled', theme: 'dragon-ball', kind: 'dragon-ball-shenron', mode: 'enabled' }),
  }).then((res) => res.json());
  assert.equal(dragonHidden.success, true);

  const saintBronze = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'saint_seiya.cloth_collected', theme: 'saint-seiya', kind: 'bronze' }),
  }).then((res) => res.json());
  assert.equal(saintBronze.success, true);

  const saintSilverWin = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'saint_seiya.battle_won', theme: 'saint-seiya', kind: 'silver' }),
  }).then((res) => res.json());
  assert.equal(saintSilverWin.success, true);

  const saintGoldCloth = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'saint_seiya.cloth_collected', theme: 'saint-seiya', kind: 'gold' }),
  }).then((res) => res.json());
  assert.equal(saintGoldCloth.success, true);

  const saintCosmo = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'saint_seiya.cosmo_burst', theme: 'saint-seiya', kind: 'cosmo' }),
  }).then((res) => res.json());
  assert.equal(saintCosmo.success, true);

  const saintGoldComplete = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'saint_seiya.gold_completed', theme: 'saint-seiya', kind: 'twelve-gold' }),
  }).then((res) => res.json());
  assert.equal(saintGoldComplete.success, true);

  const saintHidden = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'hidden_mode.enabled', theme: 'saint-seiya', kind: 'saint-seiya-hades', mode: 'enabled' }),
  }).then((res) => res.json());
  assert.equal(saintHidden.success, true);

  const saintHadesUsed = await fetch(`${base}/api/achievements/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'hidden_mode.used', theme: 'saint-seiya', kind: 'saint-seiya-hades', mode: 'used' }),
  }).then((res) => res.json());
  assert.equal(saintHadesUsed.success, true);

  const profile = await fetch(`${base}/api/achievements/profile`).then((res) => res.json());
  assert.equal(profile.success, true);
  assert.equal(profile.data.profile.themeStats.tech.activeSeconds, 600);
  assert.ok(profile.data.profile.unlockedAchievements['tech-time-10m']);
  assert.ok(profile.data.profile.unlockedAchievements['rh-duck-door']);
  assert.ok(profile.data.profile.unlockedAchievements['rh-duck-decoded']);
  assert.equal(profile.data.profile.themeStats.pixel.resourcesSaved, 1);
  assert.equal(profile.data.profile.themeStats.op.workflowsSaved, 1);
  assert.equal(profile.data.profile.themeStats['dragon-ball'].panoramasGenerated, 1);
  assert.equal(profile.data.profile.themeStats['dragon-ball'].dragonBallsCollected, 1);
  assert.equal(profile.data.profile.themeStats['dragon-ball'].dragonBallSetsCompleted, 1);
  assert.ok(profile.data.profile.unlockedAchievements['dragon-ball-shenron-pano']);
  assert.ok(profile.data.profile.unlockedAchievements['dragon-ball-radar-first']);
  assert.ok(profile.data.profile.unlockedAchievements['dragon-ball-seven-stars']);
  assert.ok(profile.data.profile.unlockedAchievements['dragon-ball-shenron-mode']);
  assert.equal(profile.data.profile.themeStats['saint-seiya'].saintSeiyaClothsCollected, 2);
  assert.equal(profile.data.profile.themeStats['saint-seiya'].saintSeiyaGoldClothsCollected, 1);
  assert.equal(profile.data.profile.themeStats['saint-seiya'].saintSeiyaSilverWins, 1);
  assert.equal(profile.data.profile.themeStats['saint-seiya'].saintSeiyaCosmoBursts, 1);
  assert.ok(profile.data.profile.unlockedAchievements['saint-seiya-bronze-awakening']);
  assert.ok(profile.data.profile.unlockedAchievements['saint-seiya-silver-trial']);
  assert.ok(profile.data.profile.unlockedAchievements['saint-seiya-gold-gate']);
  assert.ok(profile.data.profile.unlockedAchievements['saint-seiya-twelve-temples']);
  assert.ok(profile.data.profile.unlockedAchievements['saint-seiya-athena-return']);
  assert.ok(profile.data.profile.unlockedAchievements['saint-seiya-cosmo-burn']);
  assert.equal(profile.data.profile.unlockedFilms['film-rh-01'].hasMedia, false);
  assert.equal(profile.data.profile.unlockedFilms['film-rh-01'].status, 'awaiting-media');
  assert.equal(profile.data.profile.unlockedFilms['film-rh-01'].unavailableText, '影片素材待提供');
  assert.equal(profile.data.profile.unlockedFilms['film-dragon-ball-01'].status, 'awaiting-media');
  assert.equal(profile.data.profile.unlockedFilms['film-saint-seiya-01'].hasMedia, true);
  assert.equal(profile.data.profile.unlockedFilms['film-saint-seiya-01'].status, 'ready');
  assert.equal(profile.data.profile.unlockedFilms['film-saint-seiya-01'].mime, 'video/mp4');
  assert.match(profile.data.profile.unlockedFilms['film-saint-seiya-01'].mediaUrl, /\/api\/achievements\/films\/film-saint-seiya-01\/media/);
  const mediaRes = await fetch(`${base}${profile.data.profile.unlockedFilms['film-saint-seiya-01'].mediaUrl}`, {
    headers: { Range: 'bytes=0-31' },
  });
  assert.equal(mediaRes.status, 206);
  assert.match(mediaRes.headers.get('content-type') || '', /video\/mp4/);
  assert.match(Buffer.from(await mediaRes.arrayBuffer()).toString('latin1'), /ftyp/);
  assert.ok(profile.data.summary.dailyTasks.length > 0);
  assert.ok(profile.data.summary.weeklyPassport.completedThemeCount >= 3);
  assert.equal(profile.data.summary.creativeReview.topTheme.theme, 'tech');
  assert.equal(profile.data.summary.themeShowcases.pixel.hasShowcase, true);
  assert.equal(profile.data.summary.themeShowcases.pixel.topCategory, 'image_uncategorized');
});

test('achievement backend reports disabled tracking instead of silently losing hidden progress', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-achievements-disabled-'));
  const config = require('../backend/src/config.js');
  const oldFile = config.ACHIEVEMENTS_FILE;
  config.ACHIEVEMENTS_FILE = path.join(tmpDir, 'data', 'achievements.json');
  t.after(() => {
    config.ACHIEVEMENTS_FILE = oldFile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const store = require('../backend/src/achievements/store.js');
  const disabled = store.setPreferences({ enabled: false });
  assert.equal(disabled.profile.preferences.enabled, false);

  const ignored = store.recordEvent({
    type: 'hidden_mode.enabled',
    theme: 'rh',
    kind: 'rh-duck',
    mode: 'enabled',
    nodeType: 'upload',
  });
  assert.equal(ignored.ignored, true);
  assert.equal(ignored.ignoredReason, 'achievement-tracking-disabled');
  assert.equal(ignored.profile.themeStats.rh.hiddenModes['rh-duck'], undefined);

  store.setPreferences({ enabled: true });
  const recorded = store.recordEvent({
    type: 'hidden_mode.enabled',
    theme: 'rh',
    kind: 'rh-duck',
    mode: 'enabled',
    nodeType: 'upload',
  });
  assert.equal(recorded.ignored, false);
  assert.equal(recorded.profile.themeStats.rh.hiddenModes['rh-duck'].enabled, 1);
  assert.ok(recorded.profile.unlockedAchievements['rh-duck-door']);
});

test('achievement backend preserves cumulative time during schema migration and backup recovery', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-achievements-migrate-'));
  const config = require('../backend/src/config.js');
  const oldFile = config.ACHIEVEMENTS_FILE;
  config.ACHIEVEMENTS_FILE = path.join(tmpDir, 'data', 'achievements.json');
  t.after(() => {
    config.ACHIEVEMENTS_FILE = oldFile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const store = require('../backend/src/achievements/store.js');
  fs.mkdirSync(path.dirname(config.ACHIEVEMENTS_FILE), { recursive: true });
  fs.writeFileSync(config.ACHIEVEMENTS_FILE, JSON.stringify({
    schema: 't8-achievements',
    version: 1,
    profileId: 'local_migration',
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:20:00.000Z',
    themeStats: {
      tech: {
        activeSeconds: 0,
        dailySeconds: {
          '2026-06-04': 600,
          '2026-06-05': '60',
        },
      },
    },
    unlockedAchievements: {},
    preferences: { enabled: true, showToast: true, showTopBadge: true },
  }, null, 2));

  const migrated = store.getProfile();
  assert.equal(migrated.profile.themeStats.tech.activeSeconds, 660);
  assert.equal(migrated.summary.totalActiveSeconds, 660);
  assert.ok(migrated.profile.unlockedAchievements['tech-time-10m']);
  const persisted = JSON.parse(fs.readFileSync(config.ACHIEVEMENTS_FILE, 'utf8'));
  assert.equal(persisted.themeStats.tech.activeSeconds, 660);
  assert.equal(persisted.themeStats.tech.dailySeconds['2026-06-05'], 60);

  fs.writeFileSync(`${config.ACHIEVEMENTS_FILE}.bak`, JSON.stringify({
    schema: 't8-achievements',
    version: 1,
    profileId: 'local_backup',
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:05:00.000Z',
    themeStats: {
      pixel: {
        activeSeconds: 0,
        dailySeconds: {
          '2026-06-04': 300,
        },
      },
    },
    unlockedAchievements: {},
    preferences: { enabled: true, showToast: true, showTopBadge: true },
  }, null, 2));
  fs.writeFileSync(config.ACHIEVEMENTS_FILE, '{broken json', 'utf8');

  const recovered = store.getProfile();
  assert.equal(recovered.profile.profileId, 'local_backup');
  assert.equal(recovered.profile.themeStats.pixel.activeSeconds, 300);
  assert.equal(recovered.summary.totalActiveSeconds, 300);
  assert.ok(fs.readdirSync(path.dirname(config.ACHIEVEMENTS_FILE)).some((name) => name.startsWith('achievements.json.broken-')));
});

test('achievement frontend and server are wired without recording prompt content', () => {
  const app = read('../src/App.tsx');
  const tracker = read('../src/components/AchievementTracker.tsx');
  const canvas = read('../src/components/Canvas.tsx');
  const dragonRadar = read('../src/components/DragonBallRadar.tsx');
  const saintSanctuary = read('../src/components/SaintSeiyaSanctuary.tsx');
  const saintStore = read('../src/stores/saintSeiyaSanctuary.ts');
  const saintBattle = read('../src/utils/saintSeiyaBattle.ts');
  const nodeActionBar = read('../src/components/NodeActionBar.tsx');
  const materialContext = read('../src/components/MaterialContextMenu.tsx');
  const drawer = read('../src/components/AchievementDrawer.tsx');
  const toast = read('../src/components/AchievementToast.tsx');
  const ceremony = read('../src/components/AchievementCeremonyLayer.tsx');
  const achievementStore = read('../src/stores/achievements.ts');
  const upload = read('../src/components/nodes/UploadNode.tsx');
  const portrait = read('../src/components/nodes/PortraitMasterNode.tsx');
  const server = read('../backend/src/server.js');
  const store = read('../backend/src/achievements/store.js');
  const media = read('../backend/src/achievements/media.js');
  const api = read('../src/services/api.ts');

  assert.match(app, /AchievementTracker/);
  assert.match(app, /AchievementButton/);
  assert.match(app, /AchievementDrawer/);
  assert.match(app, /AchievementCeremonyLayer/);
  assert.match(app, /AchievementToast/);
  assert.match(canvas, /trackAchievementEvent\(\{\s*type:\s*'node\.created'/);
  assert.match(canvas, /trackAchievementEvent\(\{\s*type:\s*'node\.run_success'/);
  assert.match(canvas, /type:\s*'panorama\.generated'/);
  assert.match(canvas, /type:\s*'parsehub\.resolved'/);
  assert.match(canvas, /type:\s*'workflow\.saved'/);
  assert.match(canvas, /type:\s*'resource\.saved'/);
  assert.match(canvas, /rhDuckDecodedUnlocked/);
  assert.match(canvas, /yyhPortraitOutputUnlocked/);
  assert.match(canvas, /rhDuckDecoded[\s\S]*hidden_mode\.used[\s\S]*kind:\s*'rh-duck'[\s\S]*mode:\s*'used'/);
  assert.match(canvas, /yyhPortraitHidden[\s\S]*hidden_mode\.used[\s\S]*kind:\s*'yyh-portrait'[\s\S]*mode:\s*'used'/);
  assert.match(canvas, /DragonBallRadar/);
  assert.match(canvas, /SaintSeiyaSanctuary/);
  assert.match(dragonRadar, /dragon_ball\.collected/);
  assert.match(dragonRadar, /dragon_ball\.set_completed/);
  assert.match(dragonRadar, /kind:\s*'dragon-ball-shenron'/);
  assert.match(dragonRadar, /playDragonBallCollectSound/);
  assert.match(saintSanctuary, /saint_seiya\.cloth_collected/);
  assert.match(saintSanctuary, /saint_seiya\.gold_completed/);
  assert.match(saintSanctuary, /kind:\s*'saint-seiya-hades'/);
  assert.match(saintStore, /SAINT_SEIYA_SPAWN_INTERVAL_MS\s*=\s*60_000/);
  assert.match(saintStore, /SAINT_SEIYA_CHEST_VISIBLE_MS\s*=\s*10_000/);
  assert.match(saintStore, /SAINT_SEIYA_OPEN_MS\s*=\s*3_000/);
  assert.match(saintStore, /finalizeBattleReward/);
  const resolveBattleBody = saintStore.slice(
    saintStore.indexOf('resolveBattle('),
    saintStore.indexOf('finalizeBattleReward('),
  );
  const finalizeBattleBody = saintStore.slice(
    saintStore.indexOf('finalizeBattleReward('),
    saintStore.indexOf('clearBattle()'),
  );
  assert.match(resolveBattleBody, /rewardApplied:\s*false/);
  assert.doesNotMatch(resolveBattleBody, /totalExp:\s*nextTotalExp/);
  assert.doesNotMatch(resolveBattleBody, /collected:\s*nextCollected/);
  assert.match(finalizeBattleBody, /totalExp:\s*nextTotalExp/);
  assert.match(saintStore, /hadesAnimationUntil:\s*active \? Date\.now\(\) \+ SAINT_SEIYA_HADES_ANIMATION_MS/);
  assert.match(saintSanctuary, /battleRewardAppliedRef/);
  assert.match(saintSanctuary, /finalizeBattleReward\(\)/);
  assert.match(saintBattle, /rewardExpForRank/);
  assert.match(saintBattle, /hasAllGoldCloths/);
  assert.match(materialContext, /type:\s*'resource\.saved'/);
  assert.match(drawer, /今日创作任务/);
  assert.match(drawer, /周常创作护照/);
  assert.match(drawer, /本地创作回顾/);
  assert.match(drawer, /本主题代表作/);
  assert.match(drawer, /dailyTaskProgressText/);
  assert.match(drawer, /setActiveTheme/);
  assert.match(drawer, /返回主题列表/);
  assert.match(drawer, /隐藏任务/);
  assert.match(drawer, /奖励影片/);
  assert.match(drawer, /t8-achievement-film-stage/);
  assert.match(drawer, /openFilmStage/);
  assert.match(drawer, /achievementFilmMediaUrl/);
  assert.match(drawer, /hiddenModeHint/);
  assert.match(drawer, /本地成就统计已关闭/);
  assert.match(drawer, /开启并补记/);
  assert.match(drawer, /handleImportFile/);
  assert.match(drawer, /importData\(raw\)/);
  assert.match(tracker, /rhDuckUploadCount/);
  assert.match(tracker, /yyhPortraitCount/);
  assert.match(tracker, /shenronUnlockedAt/);
  assert.match(tracker, /dragon-ball-set-completed/);
  assert.match(tracker, /mode:\s*'enabled'/);
  assert.match(toast, /openDrawer\(item\.filmTitle \? 'films' : 'themes', item\.themeId\)/);
  assert.match(ceremony, /t8-hidden-ceremony/);
  assert.match(ceremony, /SHENRON MODE/);
  assert.match(ceremony, /HADES CHAPTER/);
  assert.match(achievementStore, /buildHiddenCeremony/);
  assert.match(achievementStore, /saint-seiya-hades/);
  assert.match(achievementStore, /ceremonies/);
  assert.match(api, /AchievementWeeklyPassport/);
  assert.match(api, /AchievementCreativeReview/);
  assert.match(nodeActionBar, /hidden_mode\.enabled[\s\S]*mode:\s*'enabled'/);
  assert.match(nodeActionBar, /rhDuckHiddenUpload:\s*enabled/);
  assert.match(nodeActionBar, /const enabled = !rhDuckMode/);
  assert.match(nodeActionBar, /clearRhDuckUpload\(selectedExe\.id\)/);
  assert.match(upload, /hidden_mode\.used[\s\S]*mode:\s*'used'/);
  assert.match(upload, /rhDuckHiddenUpload/);
  assert.match(upload, /const rhDuckPersistentMode[\s\S]*rhDuckStoredMode[\s\S]*rhDuckStoreMode/);
  assert.match(upload, /uploadType:\s*rhDuckMode\s*\?\s*'image'\s*:\s*lockedUploadType/);
  assert.match(upload, /RED 模式已锁定图像/);
  assert.match(portrait, /hidden_mode\.used[\s\S]*mode:\s*'used'/);
  assert.match(server, /achievementsRouter/);
  assert.match(server, /\/api\/achievements/);
  assert.match(api, /mediaUrl\?:\s*string/);
  assert.match(api, /recordAchievementEvent/);
  assert.match(api, /ignoredReason/);
  assert.match(media, /T8MEDIA1/);
  assert.match(media, /encryptAchievementMediaBuffer/);
  assert.match(media, /decryptAchievementMediaFile/);
  assert.match(media, /film-saint-seiya-01\.mp4\.t8media/);
  assert.match(store, /const event = \{/);
  assert.match(store, /ignoredReason:\s*'achievement-tracking-disabled'/);
  assert.match(store, /mediaStatusForFilm/);
  assert.match(store, /getFilmMediaAccess/);
  assert.match(store, /buildDailyTasks/);
  assert.match(store, /buildWeeklyPassport/);
  assert.match(store, /buildCreativeReview/);
  assert.match(store, /buildThemeShowcases/);
  assert.doesNotMatch(store, /prompt|shareUrl|url:/);
});
