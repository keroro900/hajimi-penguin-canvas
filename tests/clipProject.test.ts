import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyClipTimelineEdits,
  buildClipDraftFromTimeline,
  buildClipDraftFromMaterials,
  clipProjectDuration,
  computeClipFrameThumbnails,
  computeClipTimelineLayout,
  computeClipTimelineRulerTicks,
  clampClipPlayheadTime,
  compactClipTimelineVisuals,
  createClipGenerationVisual,
  createQuickClipCleanupPatch,
  createQuickClipTemplatePatch,
  inspectClipProjectBeforeExport,
  isClipGenerationVisual,
  resolveClipTimelineInsertTiming,
  interpolateClipVisualKeyframes,
  duplicateClipTimelineMaterial,
  fitClipTimelineZoom,
  deriveClipTimelineTracks,
  duplicateClipTimelineVisual,
  mergeProbedClipVisualDurations,
  reconcileProbedClipAudioDurations,
  reconcileClipVisualSourceDurations,
  previewClipTimelineDragTiming,
  resolveClipSpeedDuration,
  resolveClipVisualKeyframes,
  reorderClipTimelineVisualByDropX,
  removeClipTimelineMaterial,
  removeClipTimelineVisual,
  reorderClipTimelineVisual,
  resolveClipTimelinePlayback,
  resolveClipRatioPreset,
  resizeClipTimelineVisualTiming,
  sanitizeClipStudioLayout,
  sanitizeClipExportSettings,
  stepClipPlayheadByFrames,
  splitClipTimelineMaterialAtTime,
  splitLinkedClipTimelineAtTime,
  splitClipTimelineVisualAtTime,
  trimClipTimelineVisualSide,
  splitClipTimelineVisual,
  updateClipTimelineMaterialTiming,
} from '../src/utils/clipProject.ts';

test('clip generation visuals keep timeline timing and block export until completed', () => {
  const clip = createClipGenerationVisual({
    nodeType: 'video',
    label: '视频生成 - 玄上之音',
    start: 8,
    duration: 5,
    model: 'doubao-seedance-2-0-260128',
    prompt: 'floating cars above a misty street',
    params: {
      ratio: '16:9',
      resolution: '720p',
      generate_audio: true,
      seed: -1,
    },
    refs: [
      { id: 'pending_clip', kind: 'clip', label: 'pending_clip' },
      { id: 'cover', kind: 'image', url: '/files/input/ref.jpg', label: 'ref.jpg' },
    ],
  });

  assert.equal(clip.kind, 'video');
  assert.equal(clip.start, 8);
  assert.equal(clip.duration, 5);
  assert.equal(clip.generation?.status, 'draft');
  assert.equal(clip.generation?.model, 'doubao-seedance-2-0-260128');
  assert.equal(clip.generation?.refs?.length, 2);
  assert.equal(isClipGenerationVisual(clip), true);

  const report = inspectClipProjectBeforeExport({
    visuals: [clip],
    audios: [],
    texts: [],
    duration: 13,
  });
  assert.equal(report.status, 'warning');
  assert.ok(report.items.some((item) => item.code === 'pending-generation'));
});

test('clip generation visuals use neutral defaults until the canvas node applies a model registry choice', () => {
  const imageClip = createClipGenerationVisual({ nodeType: 'image' });
  const videoClip = createClipGenerationVisual({ nodeType: 'video' });

  assert.equal(imageClip.label, '图像生成 - 待配置');
  assert.equal(videoClip.label, '视频生成 - 待配置');
  assert.equal(imageClip.generation?.model, 'image');
  assert.equal(videoClip.generation?.model, 'video');
});

test('completed clip generation visuals export through the existing timeline draft builder', () => {
  const clip = createClipGenerationVisual({
    nodeType: 'image',
    label: '图像生成 - Comfy',
    start: 4,
    duration: 3,
    model: 'nano-banana-2',
    prompt: 'cinematic key visual',
    params: {
      aspect_ratio: '1:1',
      image_size: '2K',
    },
  });
  const completed = {
    ...clip,
    generation: {
      ...clip.generation!,
      status: 'success' as const,
      outputUrl: '/files/output/generated.png',
    },
  };

  const project = buildClipDraftFromTimeline({
    visuals: [completed],
    audios: [],
    texts: [],
  }, {
    width: 1280,
    height: 720,
    fps: 30,
    imageDuration: 3,
  });

  const visualTrack = project.tracks.find((track) => track.kind === 'visual');
  assert.deepEqual(visualTrack?.clips.map((item) => ({
    kind: item.kind,
    sourceUrl: item.sourceUrl,
    start: item.start,
    duration: item.duration,
  })), [
    {
      kind: 'image',
      sourceUrl: '/files/output/generated.png',
      start: 4,
      duration: 3,
    },
  ]);
});

test('clip timeline edits preserve basic color adjustments through draft export', () => {
  const [visual] = applyClipTimelineEdits([
    { id: 'clip-a', kind: 'video', url: '/files/input/a.mp4', duration: 4 },
  ], {
    filters: {
      'clip-a': {
        filter: 'warm',
        intensity: 80,
        hue: 24,
        saturation: 135,
        brightness: 118,
        contrast: 92,
      },
    },
  });

  assert.equal(visual.hue, 24);
  assert.equal(visual.saturation, 135);
  assert.equal(visual.brightness, 118);
  assert.equal(visual.contrast, 92);

  const project = buildClipDraftFromTimeline({
    visuals: [visual],
    audios: [],
    texts: [],
  }, {
    width: 1280,
    height: 720,
    fps: 30,
    imageDuration: 3,
  });

  const clip = project.tracks.find((track) => track.kind === 'visual')?.clips[0];
  assert.equal(clip?.hue, 24);
  assert.equal(clip?.saturation, 135);
  assert.equal(clip?.brightness, 118);
  assert.equal(clip?.contrast, 92);
});

test('resolveClipTimelineInsertTiming places new clips at the requested playhead and lane', () => {
  const insert = resolveClipTimelineInsertTiming([
    { id: 'a', kind: 'image', url: '/a.png', start: 0, duration: 2, lane: 0 },
  ], {
    requestedStart: 4.23456,
    duration: 3,
    lane: 2,
    fallbackStart: 9,
  });

  assert.deepEqual(insert, { start: 4.235, lane: 2 });
});

test('resolveClipTimelineInsertTiming finds the next free lane when insertion overlaps', () => {
  const insert = resolveClipTimelineInsertTiming([
    { id: 'a', kind: 'video', url: '/a.mp4', start: 2, duration: 5, lane: 0 },
    { id: 'b', kind: 'image', url: '/b.png', start: 1, duration: 2, lane: 1 },
    { id: 'c', kind: 'image', url: '/c.png', start: 8, duration: 2, lane: 1 },
  ], {
    requestedStart: 3,
    duration: 3,
    lane: 0,
    avoidOverlap: true,
  });

  assert.deepEqual(insert, { start: 3, lane: 1 });
});

test('buildClipDraftFromMaterials creates sequential visual clips and one audio bed', () => {
  const project = buildClipDraftFromMaterials({
    images: [
      { url: '/files/input/a.png', label: 'a' },
      { url: '/files/input/b.png', label: 'b' },
    ],
    videos: [
      { url: '/files/output/c.mp4', label: 'c', duration: 4.2 },
    ],
    audios: [
      { url: '/files/input/song.mp3', label: 'song' },
    ],
    texts: [
      { text: '第一幕' },
      { text: '第二幕' },
    ],
  }, {
    width: 1080,
    height: 1920,
    fps: 30,
    imageDuration: 2,
  });

  const visualTrack = project.tracks.find((track) => track.kind === 'visual');
  const audioTrack = project.tracks.find((track) => track.kind === 'audio');
  const textTrack = project.tracks.find((track) => track.kind === 'text');

  assert.equal(project.width, 1080);
  assert.equal(project.height, 1920);
  assert.equal(project.fps, 30);
  assert.equal(visualTrack?.clips.length, 3);
  assert.deepEqual(
    visualTrack?.clips.map((clip) => [clip.kind, clip.start, clip.duration, clip.sourceUrl]),
    [
      ['image', 0, 2, '/files/input/a.png'],
      ['image', 2, 2, '/files/input/b.png'],
      ['video', 4, 4.2, '/files/output/c.mp4'],
    ],
  );
  assert.equal(audioTrack?.clips[0]?.sourceUrl, '/files/input/song.mp3');
  assert.equal(audioTrack?.clips[0]?.duration, 8.2);
  assert.deepEqual(
    textTrack?.clips.map((clip) => [clip.text, clip.start, clip.duration]),
    [
      ['第一幕', 0, 4.1],
      ['第二幕', 4.1, 4.1],
    ],
  );
  assert.equal(clipProjectDuration(project), 8.2);
});

test('createQuickClipTemplatePatch builds fast-edit preset updates for visuals and text', () => {
  const patch = createQuickClipTemplatePatch({
    templateId: 'social-clean',
    visuals: [
      { id: 'a', kind: 'image', url: '/files/input/a.png', duration: 2 },
      { id: 'b', kind: 'video', url: '/files/input/b.mp4', duration: 4 },
    ],
    texts: [
      { id: 'title', text: '标题' },
    ],
    existingFilters: {
      b: { filter: 'bw', intensity: 10 },
      stale: { filter: 'warm', intensity: 20 },
    },
    existingTextEdits: [
      { id: 'old', text: '旧字幕', color: '#111111' },
    ],
  });

  assert.equal(patch.clipRatio, '9:16');
  assert.equal(patch.clipResolution, '1080p');
  assert.equal(patch.clipFps, 30);
  assert.deepEqual(Object.keys(patch.clipVisualFilters || {}).sort(), ['a', 'b', 'stale']);
  assert.equal(patch.clipVisualFilters?.a.filter, 'color-clean-bright');
  assert.equal(patch.clipVisualFilters?.a.transition, 'fade');
  assert.equal(patch.clipVisualFilters?.b.fit, 'cover');
  assert.deepEqual(patch.clipTextEdits?.map((item) => [item.id, item.fontSize, item.color, item.x, item.y]), [
    ['title', 44, '#ffffff', 50, 86],
  ]);
});

test('createQuickClipCleanupPatch fits audio and text clips into project duration', () => {
  const patch = createQuickClipCleanupPatch({
    duration: 12,
    audios: [
      { id: 'music', url: '/files/input/music.mp3', start: 9, duration: 20, volume: 0.8 },
      { id: 'sfx', url: '/files/input/sfx.mp3', start: -2, duration: 1 },
    ],
    texts: [
      { id: 'a', text: '第一句', color: '#ffcc00' },
      { id: 'b', text: '第二句', start: 99, duration: 20 },
      { id: 'c', text: '第三句' },
    ],
  });

  assert.deepEqual(patch.clipAudioEdits?.map((item) => [item.id, item.start, item.duration, item.fadeIn, item.fadeOut, item.volume]), [
    ['music', 0, 12, 0.4, 0.6, 0.8],
    ['sfx', 0, 1, 0.2, 0.2, 1],
  ]);
  assert.deepEqual(patch.clipTextEdits?.map((item) => [item.id, item.start, item.duration, item.x, item.y, item.color]), [
    ['a', 0, 4, 50, 88, '#ffcc00'],
    ['b', 4, 4, 50, 88, '#ffffff'],
    ['c', 8, 4, 50, 88, '#ffffff'],
  ]);
});

test('inspectClipProjectBeforeExport reports timeline gaps cover and overflow risks', () => {
  const report = inspectClipProjectBeforeExport({
    visuals: [
      { id: 'a', kind: 'image', url: '/files/input/a.png', start: 0, duration: 2 },
      { id: 'b', kind: 'image', url: '/files/input/b.png', start: 5, duration: 2, fit: 'contain' },
    ],
    audios: [
      { id: 'music', url: '/files/input/music.mp3', start: 1, duration: 10 },
    ],
    texts: [
      { id: 'caption', text: '字幕', start: 6.8, duration: 3, x: 50, y: 101 },
    ],
    duration: 7,
    coverUrl: '',
  });

  assert.equal(report.status, 'warning');
  assert.deepEqual(report.items.map((item) => item.code), [
    'timeline-gap',
    'missing-cover',
    'audio-overflow',
    'text-overflow',
    'text-position',
    'contain-fit',
  ]);
});

test('inspectClipProjectBeforeExport passes clean compact projects', () => {
  const report = inspectClipProjectBeforeExport({
    visuals: [
      { id: 'a', kind: 'image', url: '/files/input/a.png', duration: 2, fit: 'cover' },
      { id: 'b', kind: 'video', url: '/files/input/b.mp4', duration: 3, fit: 'cover' },
    ],
    audios: [
      { id: 'music', url: '/files/input/music.mp3', start: 0, duration: 5 },
    ],
    texts: [
      { id: 'caption', text: '字幕', start: 1, duration: 2, x: 50, y: 88 },
    ],
    duration: 5,
    coverUrl: '/files/output/cover.jpg',
  });

  assert.equal(report.status, 'ok');
  assert.deepEqual(report.items, []);
});

test('sanitizeClipExportSettings clamps unsupported export values', () => {
  assert.deepEqual(sanitizeClipExportSettings({
    width: 99999,
    height: 1,
    fps: 240,
    imageDuration: -5,
    background: 'not-a-color',
  }), {
    width: 3840,
    height: 240,
    fps: 60,
    imageDuration: 3,
    background: '#000000',
  });
});

test('buildClipDraftFromTimeline preserves edited visual order and skips disabled items', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [
      { id: 'video-a', kind: 'video', url: '/files/output/a.mp4', label: 'a', duration: 5 },
      { id: 'image-b', kind: 'image', url: '/files/input/b.png', label: 'b', duration: 1.5 },
      { id: 'image-c', kind: 'image', url: '/files/input/c.png', label: 'c', disabled: true },
    ],
    audios: [
      { url: '/files/input/song.mp3', label: 'song' },
    ],
  }, {
    imageDuration: 3,
  });

  const visualTrack = project.tracks.find((track) => track.kind === 'visual');
  const audioTrack = project.tracks.find((track) => track.kind === 'audio');

  assert.deepEqual(
    visualTrack?.clips.map((clip) => [clip.id, clip.kind, clip.start, clip.duration, clip.sourceUrl]),
    [
      ['video-a', 'video', 0, 5, '/files/output/a.mp4'],
      ['image-b', 'image', 5, 1.5, '/files/input/b.png'],
    ],
  );
  assert.equal(audioTrack?.clips[0]?.duration, 6.5);
  assert.equal(clipProjectDuration(project), 6.5);
});

test('buildClipDraftFromTimeline preserves visual filter settings', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [
      { id: 'video-a', kind: 'video', url: '/files/output/a.mp4', duration: 5, trimStart: 1.25, filter: 'cinematic', intensity: 72 },
      { id: 'image-b', kind: 'image', url: '/files/input/b.png', duration: 2, filter: 'bw', intensity: 48 },
    ],
  }, {
    imageDuration: 3,
  });

  const visualTrack = project.tracks.find((track) => track.kind === 'visual');
  assert.deepEqual(
    visualTrack?.clips.map((clip) => [clip.id, clip.trimStart, clip.filter, clip.intensity]),
    [
      ['video-a', 1.25, 'cinematic', 72],
      ['image-b', undefined, 'bw', 48],
    ],
  );
});

test('buildClipDraftFromTimeline carries visual transform settings from items and lookup overrides', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [
      { id: 'video-a', kind: 'video', url: '/files/output/a.mp4', duration: 5, transform: { scale: 1.25, x: 10, y: 20, rotation: 12, opacity: 0.7 } },
      { id: 'image-b', kind: 'image', url: '/files/input/b.png', duration: 2 },
    ],
  }, {
    imageDuration: 3,
  }, {
    visualTransforms: {
      'image-b': { scale: 0.8, x: 70, y: 15, rotation: -18, opacity: 0.45 },
    },
  });

  const visualTrack = project.tracks.find((track) => track.kind === 'visual');

  assert.deepEqual(
    visualTrack?.clips.map((clip) => [clip.id, (clip as any).transform]),
    [
      ['video-a', { scale: 1.25, x: 10, y: 20, rotation: 12, opacity: 0.7 }],
      ['image-b', { scale: 0.8, x: 70, y: 15, rotation: -18, opacity: 0.45 }],
    ],
  );
});

test('buildClipDraftFromTimeline preserves visual transform keyframes', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [
      {
        id: 'hero',
        kind: 'image',
        url: '/files/hero.png',
        duration: 4,
        keyframes: [
          { time: 4, scale: 140, x: 24, y: -8, rotation: 4, opacity: 85 },
          { time: 0, scale: 100, x: 0, y: 0, rotation: 0, opacity: 100 },
        ],
      },
    ],
  }, { imageDuration: 3 });

  const clip = project.tracks[0]?.clips[0];
  assert.deepEqual(clip.keyframes, [
    { time: 0, scale: 100, x: 0, y: 0, rotation: 0, opacity: 100 },
    { time: 4, scale: 140, x: 24, y: -8, rotation: 4, opacity: 85 },
  ]);
});

test('applyClipTimelineEdits applies saved order and appends new visual items', () => {
  const visuals = applyClipTimelineEdits([
    { id: 'image-a', kind: 'image', url: '/files/input/a.png', label: 'a' },
    { id: 'video-b', kind: 'video', url: '/files/output/b.mp4', label: 'b' },
    { id: 'image-c', kind: 'image', url: '/files/input/c.png', label: 'c' },
  ], {
    order: ['image-c', 'image-a', 'missing-id'],
    disabledIds: ['image-a'],
    durations: {
      'image-c': 4.25,
      'video-b': 9,
    },
    starts: {
      'image-c': 1.5,
    },
    removedIds: ['video-b'],
  });

  assert.deepEqual(
    visuals.map((item) => [item.id, item.kind, item.disabled, item.duration, item.start]),
    [
      ['image-c', 'image', false, 4.25, 1.5],
      ['image-a', 'image', true, undefined, undefined],
    ],
  );
});

test('applyClipTimelineEdits applies saved visual filter presets', () => {
  const visuals = applyClipTimelineEdits([
    { id: 'video-a', kind: 'video', url: '/files/input/a.mp4', label: 'a' },
  ], {
    filters: {
      'video-a': { filter: 'warm', intensity: 65 },
    },
  });

  assert.deepEqual(
    visuals.map((item) => [item.id, item.filter, item.intensity]),
    [['video-a', 'warm', 65]],
  );
});

test('applyClipTimelineEdits accepts CSSgram open-source filter presets', () => {
  const visuals = applyClipTimelineEdits([
    { id: 'video-a', kind: 'video', url: '/files/input/a.mp4', label: 'a' },
    { id: 'image-b', kind: 'image', url: '/files/input/b.png', label: 'b' },
  ], {
    filters: {
      'video-a': { filter: 'cssgram-clarendon', intensity: 88 },
      'image-b': { filter: 'cssgram-moon', intensity: 52 },
    },
  });

  assert.deepEqual(
    visuals.map((item) => [item.id, item.filter, item.intensity]),
    [
      ['video-a', 'cssgram-clarendon', 88],
      ['image-b', 'cssgram-moon', 52],
    ],
  );
});

test('applyClipTimelineEdits accepts FFmpeg video effect presets', () => {
  const visuals = applyClipTimelineEdits([
    { id: 'video-a', kind: 'video', url: '/files/input/a.mp4', label: 'a' },
    { id: 'video-b', kind: 'video', url: '/files/input/b.mp4', label: 'b' },
  ], {
    filters: {
      'video-a': { filter: 'ffmpeg-sharpen', intensity: 80 },
      'video-b': { filter: 'ffmpeg-film-grain', intensity: 45 },
    },
  });

  assert.deepEqual(
    visuals.map((item) => [item.id, item.filter, item.intensity]),
    [
      ['video-a', 'ffmpeg-sharpen', 80],
      ['video-b', 'ffmpeg-film-grain', 45],
    ],
  );
});

test('applyClipTimelineEdits accepts common editor color style presets', () => {
  const visuals = applyClipTimelineEdits([
    { id: 'video-a', kind: 'video', url: '/files/input/a.mp4', label: 'a' },
    { id: 'video-b', kind: 'video', url: '/files/input/b.mp4', label: 'b' },
  ], {
    filters: {
      'video-a': { filter: 'color-teal-orange', intensity: 78 },
      'video-b': { filter: 'color-japanese-clean', intensity: 62 },
    },
  });

  assert.deepEqual(
    visuals.map((item) => [item.id, item.filter, item.intensity]),
    [
      ['video-a', 'color-teal-orange', 78],
      ['video-b', 'color-japanese-clean', 62],
    ],
  );
});

test('applyClipTimelineEdits accepts expanded CapCut-style presets and video speed', () => {
  const visuals = applyClipTimelineEdits([
    { id: 'video-a', kind: 'video', url: '/files/input/a.mp4', label: 'a' },
    { id: 'video-b', kind: 'video', url: '/files/input/b.mp4', label: 'b' },
  ], {
    filters: {
      'video-a': { filter: 'color-clean-bright', intensity: 66, speed: 2, fadeIn: 0.4, fadeOut: 0.8 },
      'video-b': { filter: 'ffmpeg-vhs', intensity: 72, speed: 0.5, fadeIn: 0.25, fadeOut: 0.5 },
    },
  });

  assert.deepEqual(
    visuals.map((item) => [item.id, item.filter, item.intensity, item.speed, item.fadeIn, item.fadeOut]),
    [
      ['video-a', 'color-clean-bright', 66, 2, 0.4, 0.8],
      ['video-b', 'ffmpeg-vhs', 72, 0.5, 0.25, 0.5],
    ],
  );
});

test('applyClipTimelineEdits accepts clip LUT settings', () => {
  const lutText = 'TITLE "Mini"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
  const visuals = applyClipTimelineEdits([
    { id: 'video-a', kind: 'video', url: '/files/input/a.mp4', label: 'a' },
  ], {
    filters: {
      'video-a': {
        filter: 'none',
        intensity: 65,
        lutPresetId: 'cinematic-teal-orange',
        lutName: '电影青橙',
        lutText,
        lutAmount: 0.45,
      },
    },
  });

  assert.equal(visuals[0].lutPresetId, 'cinematic-teal-orange');
  assert.equal(visuals[0].lutName, '电影青橙');
  assert.equal(visuals[0].lutText, lutText.trim());
  assert.equal(visuals[0].lutAmount, 0.45);
});

test('applyClipTimelineEdits accepts visual transition presets', () => {
  const visuals = applyClipTimelineEdits([
    { id: 'image-a', kind: 'image', url: '/files/input/a.png', label: 'a' },
    { id: 'image-b', kind: 'image', url: '/files/input/b.png', label: 'b' },
  ], {
    filters: {
      'image-a': { transition: 'fade', transitionDuration: 0.6, fit: 'cover' },
      'image-b': { transition: 'slideleft', transitionDuration: 0.8 },
    },
  });

  assert.deepEqual(
    visuals.map((item) => [item.id, item.transition, item.transitionDuration, item.fit]),
    [
      ['image-a', 'fade', 0.6, 'cover'],
      ['image-b', 'slideleft', 0.8, undefined],
    ],
  );
});

test('mergeProbedClipVisualDurations stores real video durations by visual id', () => {
  const result = mergeProbedClipVisualDurations({
    visuals: [
      { id: 'image-a', kind: 'image', url: '/a.png', duration: 3 },
      { id: 'video-b', kind: 'video', url: '/b.mp4' },
      { id: 'video-c', kind: 'video', url: '/c.mp4', duration: 8 },
    ],
    currentDurations: {
      'image-a': 3,
      'video-c': 8,
    },
    probes: [
      { url: '/b.mp4', duration: 15.23456 },
      { url: '/c.mp4', duration: 8.01 },
      { url: '/missing.mp4', duration: 20 },
    ],
  });

  assert.deepEqual(result.changed, true);
  assert.deepEqual(result.durations, {
    'image-a': 3,
    'video-b': 15.235,
    'video-c': 8,
  });
});

test('reconcileProbedClipAudioDurations fills missing duration from trimmed source span and speed', () => {
  const result = reconcileProbedClipAudioDurations({
    audios: [{ id: 'audio', url: ' /song.mp3 ', trimStart: 2, speed: 2 }],
    probes: [{ url: '/song.mp3', duration: 10 }],
  });

  assert.equal(result.items[0]?.duration, 4);
  assert.equal(result.changed, true);
});

test('reconcileProbedClipAudioDurations preserves intentional trims and clamps only overruns', () => {
  const result = reconcileProbedClipAudioDurations({
    audios: [
      { id: 'short', url: '/song.mp3', duration: 2.5, trimStart: 2, speed: 2 },
      { id: 'long', url: '/song.mp3', duration: 8, trimStart: 2, speed: 2 },
    ],
    probes: [{ url: '/song.mp3', duration: 10 }],
  });

  assert.deepEqual(result.items.map((item) => item.duration), [2.5, 4]);
  assert.equal(result.changed, true);
});

test('reconcileProbedClipAudioDurations preserves a 10 second timeline trim at 2x with ample source', () => {
  const result = reconcileProbedClipAudioDurations({
    audios: [{ id: 'trimmed', url: '/long.mp3', duration: 10, trimStart: 5, speed: 2 }],
    probes: [{ url: '/long.mp3', duration: 60 }],
  });

  assert.equal(result.items[0]?.duration, 10);
  assert.equal(result.changed, false);
});

test('reconcileProbedClipAudioDurations preserves audio with missing or invalid probes', () => {
  const audios = [
    { id: 'missing', url: '/missing.mp3', duration: 3 },
    { id: 'invalid', url: '/invalid.mp3', duration: 5 },
  ];
  const result = reconcileProbedClipAudioDurations({
    audios,
    probes: [{ url: '/invalid.mp3', duration: Number.NaN }],
  });

  assert.deepEqual(result.items, audios);
  assert.equal(result.items[0], audios[0]);
  assert.equal(result.items[1], audios[1]);
  assert.equal(result.changed, false);
});

test('reconcileProbedClipAudioDurations rounds to milliseconds and detects actual corrections', () => {
  const corrected = reconcileProbedClipAudioDurations({
    audios: [{ id: 'audio', url: '/song.mp3', duration: 4.0004 }],
    probes: [{ url: '/song.mp3', duration: 10.0004 }],
  });
  const unchanged = reconcileProbedClipAudioDurations({
    audios: [{ id: 'audio', url: '/song.mp3', duration: 4 }],
    probes: [{ url: '/song.mp3', duration: 10.0004 }],
  });

  assert.equal(corrected.items[0]?.duration, 4);
  assert.equal(corrected.changed, true);
  assert.equal(unchanged.items[0]?.duration, 4);
  assert.equal(unchanged.changed, false);
});

test('reconcileProbedClipAudioDurations clamps exhausted spans and sanitizes playback speed', () => {
  const result = reconcileProbedClipAudioDurations({
    audios: [
      { id: 'exhausted', url: '/song.mp3', duration: 3, trimStart: 12, speed: Number.NaN },
      { id: 'fast', url: '/song.mp3', speed: 99 },
      { id: 'slow', url: '/song.mp3', speed: 0.1 },
    ],
    probes: [{ url: '/song.mp3', duration: 10 }],
  });

  assert.deepEqual(result.items.map((item) => item.duration), [0, 2.5, 40]);
  assert.equal(result.changed, true);
});

test('buildClipDraftFromTimeline omits exhausted audio and carries sanitized audio speed', () => {
  const exhausted = reconcileProbedClipAudioDurations({
    audios: [{ id: 'exhausted', url: '/song.mp3', duration: 3, trimStart: 10, speed: 2 }],
    probes: [{ url: '/song.mp3', duration: 10 }],
  });
  const project = buildClipDraftFromTimeline({
    visuals: [{ id: 'image', kind: 'image', url: '/image.png', duration: 5 }],
    audios: [
      ...exhausted.items,
      { id: 'fast', url: '/fast.mp3', duration: 2, speed: 9 },
      { id: 'fallback', url: '/fallback.mp3', speed: 0.1 },
    ],
  });
  const audioClips = project.tracks.find((track) => track.kind === 'audio')?.clips || [];

  assert.equal(exhausted.items[0]?.duration, 0);
  assert.deepEqual(audioClips.map((clip) => [clip.id, clip.duration, clip.speed]), [
    ['fast', 2, 4],
    ['fallback', 5, 0.25],
  ]);
});

test('buildClipDraftFromTimeline omits explicit positive audio below 0.1 without extending the project', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [{ id: 'image', kind: 'image', url: '/image.png', duration: 2 }],
    audios: [
      { id: 'too-short', url: '/short.mp3', start: 10, duration: 0.05 },
      { id: 'minimum', url: '/minimum.mp3', duration: 0.1 },
      { id: 'fallback', url: '/fallback.mp3' },
    ],
  }, { imageDuration: 2 });
  const audioClips = project.tracks.find((track) => track.kind === 'audio')?.clips || [];

  assert.deepEqual(audioClips.map((clip) => [clip.id, clip.duration]), [
    ['minimum', 0.1],
    ['fallback', 2],
  ]);
  assert.equal(clipProjectDuration(project), 2);
});

test('reconcileClipVisualSourceDurations leaves images unchanged', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'image-a', kind: 'image', url: ' /a.png ', duration: 21.2 }],
    currentDurations: { 'image-a': 21.2 },
    currentSourceMetadata: { 'image-a': { url: '/a.png', duration: 2 } },
    probes: [{ url: '/a.png', duration: 1 }],
  });

  assert.deepEqual(result, {
    durations: { 'image-a': 21.2 },
    sourceMetadata: { 'image-a': { url: '/a.png', duration: 2 } },
    invalidIds: [],
    durationsChanged: false,
    sourceMetadataChanged: false,
  });
});

test('reconcileClipVisualSourceDurations uses current, visual, then source duration precedence', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [
      { id: 'current', kind: 'video', url: '/same.mp4', duration: 7 },
      { id: 'visual', kind: 'video', url: '/same.mp4', duration: 6 },
      { id: 'source', kind: 'video', url: '/same.mp4' },
    ],
    currentDurations: { current: 5 },
    probes: [{ url: '/same.mp4', duration: 10 }],
  });

  assert.deepEqual(result.durations, { current: 5, visual: 6, source: 10 });
});

test('reconcileClipVisualSourceDurations fills a missing video duration from its source', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'video-a', kind: 'video', url: '/a.mp4' }],
    probes: [{ url: '/a.mp4', duration: 15.0704 }],
  });

  assert.equal(result.durations['video-a'], 15.07);
  assert.equal(result.durationsChanged, true);
});

test('reconcileClipVisualSourceDurations clamps stale 21.2 seconds to 15.07 seconds', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'video-a', kind: 'video', url: '/a.mp4', duration: 21.2 }],
    currentDurations: { 'video-a': 21.2 },
    probes: [{ url: '/a.mp4', duration: 15.07 }],
  });

  assert.equal(result.durations['video-a'], 15.07);
});

test('reconcileClipVisualSourceDurations writes millisecond-normalized current durations', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'v', kind: 'video', url: '/v.mp4' }],
    currentDurations: { v: 10.0004 },
    probes: [{ url: '/v.mp4', duration: 10 }],
  });

  assert.equal(result.durations.v, 10);
  assert.equal(result.durationsChanged, true);
});

test('reconcileClipVisualSourceDurations writes normalized values for over-cap raw durations', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'v', kind: 'video', url: '/v.mp4' }],
    currentDurations: { v: 90_000 },
    probes: [{ url: '/v.mp4', duration: 90_000 }],
  });

  assert.equal(result.durations.v, 86_400);
  assert.equal(result.durationsChanged, true);
});

test('reconcileClipVisualSourceDurations preserves an intentional shorter trim', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'video-a', kind: 'video', url: '/a.mp4', duration: 8 }],
    currentDurations: { 'video-a': 7.5 },
    probes: [{ url: '/a.mp4', duration: 15.07 }],
  });

  assert.equal(result.durations['video-a'], 7.5);
  assert.equal(result.durationsChanged, false);
});

test('reconcileClipVisualSourceDurations applies trim and speed to the source maximum', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'video-a', kind: 'video', url: '/a.mp4', trimStart: 2.01, speed: 2 }],
    currentDurations: { 'video-a': 8 },
    probes: [{ url: '/a.mp4', duration: 15.07 }],
  });

  assert.equal(result.durations['video-a'], 6.53);
});

test('reconcileClipVisualSourceDurations reconciles duplicate URL clips independently', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [
      { id: 'first', kind: 'video', url: '/same.mp4', trimStart: 0 },
      { id: 'second', kind: 'video', url: '/same.mp4', trimStart: 5, speed: 2 },
    ],
    currentDurations: { first: 20, second: 4 },
    probes: [{ url: '/same.mp4', duration: 10 }],
  });

  assert.deepEqual(result.durations, { first: 10, second: 2.5 });
  assert.deepEqual(result.sourceMetadata, {
    first: { url: '/same.mp4', duration: 10 },
    second: { url: '/same.mp4', duration: 10 },
  });
});

test('reconcileClipVisualSourceDurations ignores stale metadata after same-ID URL replacement and reopen', () => {
  const currentSourceMetadata = { clip: { url: ' /old.mp4 ', duration: 4 } };
  const reopened = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'clip', kind: 'video', url: '/new.mp4', duration: 21.2 }],
    currentDurations: { clip: 21.2 },
    currentSourceMetadata,
  });
  const replaced = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'clip', kind: 'video', url: ' /new.mp4 ', duration: 21.2 }],
    currentDurations: { clip: 21.2 },
    currentSourceMetadata,
    probes: [{ url: '/new.mp4', duration: 6 }],
  });

  assert.deepEqual(reopened.sourceMetadata, currentSourceMetadata);
  assert.equal(reopened.durations.clip, 21.2);
  assert.deepEqual(reopened.invalidIds, []);
  assert.deepEqual(replaced.sourceMetadata.clip, { url: ' /new.mp4 ', duration: 6 });
  assert.equal(replaced.durations.clip, 6);
});

test('reconcileClipVisualSourceDurations preserves state for invalid and partial probes', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [
      { id: 'known', kind: 'video', url: '/known.mp4' },
      { id: 'unknown', kind: 'video', url: '/unknown.mp4' },
    ],
    currentDurations: { known: 4, unknown: 7 },
    currentSourceMetadata: { known: { url: '/known.mp4', duration: 5 } },
    probes: [
      { url: '/known.mp4', duration: Number.NaN },
      { url: '/unknown.mp4' },
    ],
  });

  assert.deepEqual(result.durations, { known: 4, unknown: 7 });
  assert.deepEqual(result.sourceMetadata, { known: { url: '/known.mp4', duration: 5 } });
  assert.equal(result.sourceMetadataChanged, false);
});

test('reconcileClipVisualSourceDurations recomputes invalid IDs from persisted metadata without probes', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'tiny', kind: 'video', url: ' /tiny.mp4 ', trimStart: 0.06 }],
    currentDurations: { tiny: 2 },
    currentSourceMetadata: { tiny: { url: '/tiny.mp4', duration: 0.15 } },
  });

  assert.deepEqual(result.invalidIds, ['tiny']);
  assert.equal(result.durations.tiny, 2);
});

test('reconcileClipVisualSourceDurations keeps source maxima from 0.1 through 0.25 exact', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [
      { id: 'low', kind: 'video', url: '/low.mp4' },
      { id: 'high', kind: 'video', url: '/high.mp4' },
    ],
    probes: [
      { url: '/low.mp4', duration: 0.1 },
      { url: '/high.mp4', duration: 0.25 },
    ],
  });

  assert.deepEqual(result.durations, { low: 0.1, high: 0.25 });
  assert.deepEqual(result.invalidIds, []);
});

test('reconcileClipVisualSourceDurations marks source maxima below 0.1 invalid without inventing duration', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'tiny', kind: 'video', url: '/tiny.mp4', trimStart: 0.02 }],
    probes: [{ url: '/tiny.mp4', duration: 0.119 }],
  });

  assert.deepEqual(result.invalidIds, ['tiny']);
  assert.equal('tiny' in result.durations, false);
});

test('reconcileClipVisualSourceDurations clamps an overrun below 0.04 seconds', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'clip', kind: 'video', url: '/clip.mp4' }],
    currentDurations: { clip: 10.03 },
    currentSourceMetadata: { clip: { url: '/clip.mp4', duration: 10 } },
    probes: [{ url: '/clip.mp4', duration: 9.999 }],
  });

  assert.equal(result.durations.clip, 9.999);
  assert.equal(result.durationsChanged, true);
});

test('reconcileClipVisualSourceDurations suppresses metadata writes within 0.04 seconds', () => {
  const result = reconcileClipVisualSourceDurations({
    visuals: [{ id: 'clip', kind: 'video', url: ' /clip.mp4 ' }],
    currentDurations: { clip: 5 },
    currentSourceMetadata: { clip: { url: '/clip.mp4', duration: 1 } },
    probes: [{ url: '/clip.mp4', duration: 1.04 }],
  });

  assert.deepEqual(result.sourceMetadata.clip, { url: '/clip.mp4', duration: 1 });
  assert.equal(result.sourceMetadataChanged, false);
});

test('resolveClipSpeedDuration preserves inferred source span without source metadata', () => {
  assert.equal(resolveClipSpeedDuration({ timelineDuration: 5, oldSpeed: 2, newSpeed: 4 }), 2.5);
  assert.equal(resolveClipSpeedDuration({ timelineDuration: 0.1, oldSpeed: 1, newSpeed: 4 }), 0.025);
});

test('resolveClipSpeedDuration clamps preserved span to available source metadata', () => {
  assert.equal(resolveClipSpeedDuration({
    timelineDuration: 5,
    oldSpeed: 2,
    newSpeed: 1,
    trimStart: 3,
    sourceDuration: 8,
  }), 5);
  assert.equal(resolveClipSpeedDuration({
    timelineDuration: 1,
    oldSpeed: 1,
    newSpeed: 4,
    sourceDuration: 0.6,
  }), 0.15);
  assert.equal(resolveClipSpeedDuration({
    timelineDuration: 0.1,
    oldSpeed: 1,
    newSpeed: 4,
    sourceDuration: 0.6,
  }), 0.025);
});

test('deriveClipTimelineTracks only returns rows for imported material types', () => {
  assert.deepEqual(
    deriveClipTimelineTracks({
      visuals: [
        { id: 'image-a', kind: 'image', url: '/a.png' },
        { id: 'video-b', kind: 'video', url: '/b.mp4' },
      ],
      audioCount: 1,
      textCount: 0,
      coverUrl: '',
      trackHeights: {
        visual: 118,
      },
    }).map((track) => [track.id, track.label, track.height]),
    [
      ['visual', '画面轨', 118],
      ['cover', '封面', 44],
      ['audio', '音频轨', 44],
    ],
  );

  assert.deepEqual(
    deriveClipTimelineTracks({
      visuals: [],
      audioCount: 0,
      textCount: 2,
      coverUrl: '',
    }).map((track) => [track.id, track.label]),
    [['text', '文本轨']],
  );
});

test('sanitizeClipStudioLayout clamps resizable editor panes', () => {
  assert.deepEqual(sanitizeClipStudioLayout({
    leftWidth: 100,
    rightWidth: 999,
    topHeight: 120,
  }), {
    leftWidth: 300,
    rightWidth: 620,
    topHeight: 180,
  });

  const minimumPersistedLayout = sanitizeClipStudioLayout({
    leftWidth: 430,
    rightWidth: 410,
    topHeight: 180,
  });
  assert.deepEqual(minimumPersistedLayout, {
    leftWidth: 430,
    rightWidth: 410,
    topHeight: 180,
  });
  assert.deepEqual(sanitizeClipStudioLayout(minimumPersistedLayout), minimumPersistedLayout);

  assert.deepEqual(sanitizeClipStudioLayout({
    leftWidth: 430,
    rightWidth: 410,
    topHeight: 999,
  }), {
    leftWidth: 430,
    rightWidth: 410,
    topHeight: 720,
  });
});

test('removeClipTimelineVisual drops the matching visual id', () => {
  const visuals = removeClipTimelineVisual([
    { id: 'a', kind: 'image', url: '/a.png' },
    { id: 'b', kind: 'video', url: '/b.mp4' },
  ], 'a');

  assert.deepEqual(visuals.map((item) => item.id), ['b']);
});

test('splitClipTimelineVisual splits image duration at the midpoint', () => {
  const visuals = splitClipTimelineVisual([
    { id: 'image-a', kind: 'image', url: '/a.png', duration: 5 },
    { id: 'video-b', kind: 'video', url: '/b.mp4', duration: 8 },
  ], 'image-a');

  assert.deepEqual(
    visuals.map((item) => [item.id, item.kind, item.duration]),
    [
      ['image-a-a', 'image', 2.5],
      ['image-a-b', 'image', 2.5],
      ['video-b', 'video', 8],
    ],
  );
  assert.equal(Object.hasOwn(visuals[1], 'trimStart'), false);
});

test('computeClipTimelineLayout positions visual clips by cumulative duration', () => {
  const layout = computeClipTimelineLayout([
    { id: 'a', kind: 'image', url: '/a.png', duration: 2 },
    { id: 'b', kind: 'image', url: '/b.png', duration: 3 },
    { id: 'c', kind: 'video', url: '/c.mp4', duration: 4, disabled: true },
    { id: 'd', kind: 'video', url: '/d.mp4', duration: 5 },
  ], {
    fallbackDuration: 1,
    pixelsPerSecond: 20,
    gapPixels: 6,
  });

  assert.deepEqual(
    layout.items.map((item) => [item.id, item.start, item.duration, item.left, item.width]),
    [
      ['a', 0, 2, 0, 40],
      ['b', 2, 3, 46, 60],
      ['c', 5, 4, 112, 80],
      ['d', 9, 5, 198, 100],
    ],
  );
  assert.equal(layout.duration, 14);
  assert.equal(layout.width, 298);
});

test('computeClipTimelineLayout respects explicit clip starts for moved timeline clips', () => {
  const layout = computeClipTimelineLayout([
    { id: 'a', kind: 'image', url: '/a.png', duration: 2, start: 4 },
    { id: 'b', kind: 'video', url: '/b.mp4', duration: 3, start: 0.5 },
  ], {
    fallbackDuration: 1,
    pixelsPerSecond: 10,
  });

  assert.deepEqual(
    layout.items.map((item) => [item.id, item.start, item.left, item.width]),
    [
      ['a', 4, 40, 20],
      ['b', 0.5, 5, 30],
    ],
  );
  assert.equal(layout.duration, 6);
  assert.equal(layout.width, 60);
});

test('buildClipDraftFromTimeline keeps explicit clip starts when clips were moved', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [
      { id: 'image-a', kind: 'image', url: '/a.png', duration: 2, start: 4 },
      { id: 'video-b', kind: 'video', url: '/b.mp4', duration: 3, start: 0.5 },
    ],
  }, { imageDuration: 2 });

  const visualTrack = project.tracks.find((track) => track.kind === 'visual');
  assert.deepEqual(
    visualTrack?.clips.map((clip) => [clip.id, clip.start, clip.duration]),
    [
      ['image-a', 4, 2],
      ['video-b', 0.5, 3],
    ],
  );
  assert.equal(clipProjectDuration(project), 6);
});

test('resolveClipTimelinePlayback maps global playhead to the active visual local time', () => {
  const state = resolveClipTimelinePlayback([
    { id: 'image-a', kind: 'image', url: '/a.png', duration: 3 },
    { id: 'video-b', kind: 'video', url: '/b.mp4', duration: 15 },
    { id: 'image-c', kind: 'image', url: '/c.png', duration: 2 },
  ], 7.25, { fallbackDuration: 3 });

  assert.deepEqual(state && {
    id: state.item.id,
    start: state.start,
    duration: state.duration,
    localTime: state.localTime,
  }, {
    id: 'video-b',
    start: 3,
    duration: 15,
    localTime: 4.25,
  });

  const endState = resolveClipTimelinePlayback([
    { id: 'image-a', kind: 'image', url: '/a.png', duration: 3 },
  ], 99, { fallbackDuration: 3 });
  assert.equal(endState, null);
});

test('resolveClipTimelinePlayback uses half-open clip intervals at shared boundaries', () => {
  assert.equal(resolveClipTimelinePlayback([
    { id: 'only', kind: 'video', url: '/only.mp4', duration: 4 },
  ], 4), null);

  const adjacent = resolveClipTimelinePlayback([
    { id: 'first', kind: 'video', url: '/first.mp4', duration: 4, start: 0 },
    { id: 'second', kind: 'video', url: '/second.mp4', duration: 3, start: 4 },
  ], 4);

  assert.equal(adjacent?.item.id, 'second');
  assert.equal(adjacent?.localTime, 0);
});

test('resolveClipTimelinePlayback uses explicit starts instead of array order', () => {
  const state = resolveClipTimelinePlayback([
    { id: 'late', kind: 'image', url: '/late.png', duration: 2, start: 4 },
    { id: 'early', kind: 'video', url: '/early.mp4', duration: 3, start: 0.5 },
  ], 1.25, { fallbackDuration: 3 });

  assert.equal(state?.item.id, 'early');
  assert.equal(state?.localTime, 0.75);
  assert.equal(resolveClipTimelinePlayback([
    { id: 'late', kind: 'image', url: '/late.png', duration: 2, start: 4 },
    { id: 'early', kind: 'video', url: '/early.mp4', duration: 3, start: 0.5 },
  ], 3.75, { fallbackDuration: 3 }), null);
});

test('resolveClipTimelinePlayback skips hidden visual clips', () => {
  assert.equal(resolveClipTimelinePlayback([
    { id: 'hidden', kind: 'image', url: '/hidden.png', duration: 3, disabled: true },
  ], 0.5, { fallbackDuration: 3 }), null);

  const state = resolveClipTimelinePlayback([
    { id: 'hidden', kind: 'image', url: '/hidden.png', duration: 3, disabled: true },
    { id: 'visible', kind: 'image', url: '/visible.png', duration: 3, start: 3 },
  ], 3.5, { fallbackDuration: 3 });

  assert.equal(state?.item.id, 'visible');
});

test('reorderClipTimelineVisual moves a dragged visual before the target id', () => {
  const reordered = reorderClipTimelineVisual([
    { id: 'a', kind: 'image', url: '/a.png' },
    { id: 'b', kind: 'image', url: '/b.png' },
    { id: 'c', kind: 'video', url: '/c.mp4' },
  ], 'c', 'a');

  assert.deepEqual(reordered.map((item) => item.id), ['c', 'a', 'b']);
});

test('reorderClipTimelineVisualByDropX moves a clip by timeline drop position', () => {
  const visuals = [
    { id: 'a', kind: 'image' as const, url: '/a.png', duration: 2 },
    { id: 'b', kind: 'image' as const, url: '/b.png', duration: 2 },
    { id: 'c', kind: 'video' as const, url: '/c.mp4', duration: 2 },
  ];

  assert.deepEqual(
    reorderClipTimelineVisualByDropX(visuals, 'c', 10, { pixelsPerSecond: 20 }).map((item) => item.id),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(
    reorderClipTimelineVisualByDropX(visuals, 'a', 999, { pixelsPerSecond: 20 }).map((item) => item.id),
    ['b', 'c', 'a'],
  );
});

test('compactClipTimelineVisuals clears explicit starts while preserving order', () => {
  const visuals = compactClipTimelineVisuals([
    { id: 'a', kind: 'image', url: '/a.png', start: 2, duration: 3 },
    { id: 'b', kind: 'video', url: '/b.mp4', start: 9, duration: 4 },
  ]);

  assert.deepEqual(
    visuals.map((item) => [item.id, item.start, item.duration]),
    [
      ['a', undefined, 3],
      ['b', undefined, 4],
    ],
  );
});

test('clampClipPlayheadTime maps timeline pixels into project duration', () => {
  assert.equal(clampClipPlayheadTime(-20, 20, 8), 0);
  assert.equal(clampClipPlayheadTime(56, 20, 8), 2.8);
  assert.equal(clampClipPlayheadTime(999, 20, 8), 8);
});

test('resolveClipRatioPreset maps editor ratio presets to render sizes', () => {
  assert.deepEqual(resolveClipRatioPreset('16:9', '480p'), { width: 853, height: 480 });
  assert.deepEqual(resolveClipRatioPreset('3:4', '720p'), { width: 720, height: 960 });
  assert.deepEqual(resolveClipRatioPreset('4:5', '720p'), { width: 720, height: 900 });
  assert.deepEqual(resolveClipRatioPreset('21:9', '1080p'), { width: 2520, height: 1080 });
  assert.deepEqual(resolveClipRatioPreset('2.35:1', '1080p'), { width: 2538, height: 1080 });
  assert.deepEqual(resolveClipRatioPreset('9:16', '1440p'), { width: 1440, height: 2560 });
  assert.deepEqual(resolveClipRatioPreset('1:1', '2160p'), { width: 2160, height: 2160 });
  assert.deepEqual(resolveClipRatioPreset('5.8寸', '720p'), { width: 720, height: 1560 });
  assert.deepEqual(resolveClipRatioPreset('adapt', '1080p', { width: 1024, height: 768 }), { width: 1024, height: 768 });
});

test('computeClipFrameThumbnails creates repeated frame slots across a visual clip', () => {
  const frames = computeClipFrameThumbnails({
    id: 'image-a',
    kind: 'image',
    url: '/a.png',
    duration: 4,
    start: 10,
    left: 120,
    width: 160,
  }, { frameWidth: 40 });

  assert.deepEqual(
    frames.map((frame) => [frame.index, frame.left, frame.width, frame.time, frame.sourceUrl]),
    [
      [0, 0, 40, 10, '/a.png'],
      [1, 40, 40, 11, '/a.png'],
      [2, 80, 40, 12, '/a.png'],
      [3, 120, 40, 13, '/a.png'],
    ],
  );
});

test('computeClipTimelineRulerTicks creates major seconds and visible frame ticks', () => {
  const ticks = computeClipTimelineRulerTicks({
    duration: 2,
    fps: 24,
    pixelsPerSecond: 96,
  });

  assert.deepEqual(
    ticks.filter((tick) => tick.kind === 'major').map((tick) => [tick.time, tick.left, tick.label]),
    [
      [0, 0, '0:00'],
      [1, 96, '0:01'],
      [2, 192, '0:02'],
    ],
  );
  assert.deepEqual(
    ticks.filter((tick) => tick.kind === 'frame').slice(0, 4).map((tick) => [tick.time, tick.left, tick.label]),
    [
      [0.25, 24, '06f'],
      [0.5, 48, '12f'],
      [0.75, 72, '18f'],
      [1.25, 120, '06f'],
    ],
  );
});

test('splitClipTimelineVisualAtTime splits a selected visual at the playhead', () => {
  const visuals = splitClipTimelineVisualAtTime([
    { id: 'a', kind: 'image', url: '/a.png', duration: 3 },
    { id: 'b', kind: 'video', url: '/b.mp4', duration: 5 },
  ], 'b', 5);

  assert.deepEqual(
    visuals.map((item) => [item.id, item.duration, item.trimStart]),
    [
      ['a', 3, undefined],
      ['b-left', 2, undefined],
      ['b-right', 3, 2],
    ],
  );
});

test('splitClipTimelineVisualAtTime advances video trimStart in source time', () => {
  const visuals = splitClipTimelineVisualAtTime([
    { id: 'video', kind: 'video', url: '/video.mp4', duration: 4, trimStart: 3, speed: 2 },
  ], 'video', 1);

  assert.deepEqual(
    visuals.map((item) => [item.id, item.duration, item.trimStart]),
    [
      ['video-left', 1, 3],
      ['video-right', 3, 5],
    ],
  );

  const images = splitClipTimelineVisualAtTime([
    { id: 'image', kind: 'image', url: '/image.png', duration: 4, trimStart: 3, speed: 2 },
  ], 'image', 1);
  assert.deepEqual(images.map((item) => item.trimStart), [3, 3]);
  assert.equal(Object.hasOwn(images[1], 'trimStart'), true);

  const imagesWithoutTrim = splitClipTimelineVisualAtTime([
    { id: 'plain-image', kind: 'image', url: '/plain.png', duration: 4, speed: 2 },
  ], 'plain-image', 1);
  assert.equal(Object.hasOwn(imagesWithoutTrim[0], 'trimStart'), false);
  assert.equal(Object.hasOwn(imagesWithoutTrim[1], 'trimStart'), false);
});

test('trimClipTimelineVisualSide keeps the requested side around the playhead', () => {
  const visuals = [
    { id: 'a', kind: 'image' as const, url: '/a.png', duration: 3 },
    { id: 'b', kind: 'video' as const, url: '/b.mp4', duration: 5, trimStart: 1 },
  ];

  assert.deepEqual(
    trimClipTimelineVisualSide(visuals, 'b', 4, 'right').map((item) => [item.id, item.duration, item.trimStart]),
    [
      ['a', 3, undefined],
      ['b-right', 4, 2],
    ],
  );
  assert.deepEqual(
    trimClipTimelineVisualSide(visuals, 'b', 6, 'left').map((item) => [item.id, item.duration, item.trimStart]),
    [
      ['a', 3, undefined],
      ['b-left', 3, 1],
    ],
  );
});

test('trimClipTimelineVisualSide applies speed only when trimming the left edge', () => {
  const visual = { id: 'video', kind: 'video' as const, url: '/video.mp4', duration: 5, trimStart: 1, speed: 2 };

  assert.deepEqual(
    trimClipTimelineVisualSide([visual], 'video', 2, 'right').map((item) => [item.duration, item.trimStart]),
    [[3, 5]],
  );
  assert.deepEqual(
    trimClipTimelineVisualSide([visual], 'video', 2, 'left').map((item) => [item.duration, item.trimStart]),
    [[2, 1]],
  );
});

test('trimClipTimelineVisualSide preserves image trimStart object shape', () => {
  const plainImage = { id: 'image', kind: 'image' as const, url: '/image.png', duration: 4 };
  const left = trimClipTimelineVisualSide([plainImage], 'image', 1, 'left')[0];
  const right = trimClipTimelineVisualSide([plainImage], 'image', 1, 'right')[0];

  assert.equal(Object.hasOwn(left, 'trimStart'), false);
  assert.equal(Object.hasOwn(right, 'trimStart'), false);

  const existing = trimClipTimelineVisualSide([
    { ...plainImage, trimStart: 3 },
  ], 'image', 1, 'right')[0];
  assert.equal(Object.hasOwn(existing, 'trimStart'), true);
  assert.equal(existing.trimStart, 3);
});

test('resizeClipTimelineVisualTiming trims clip edges and keeps a minimum duration', () => {
  assert.deepEqual(resizeClipTimelineVisualTiming({
    start: 4,
    duration: 8,
    deltaSeconds: 2.5,
    edge: 'left',
  }), {
    start: 6.5,
    duration: 5.5,
  });

  assert.deepEqual(resizeClipTimelineVisualTiming({
    start: 4,
    duration: 8,
    deltaSeconds: 3,
    edge: 'right',
  }), {
    start: 4,
    duration: 11,
  });

  assert.deepEqual(resizeClipTimelineVisualTiming({
    start: 4,
    duration: 8,
    deltaSeconds: 99,
    edge: 'left',
    minDuration: 0.5,
  }), {
    start: 11.5,
    duration: 0.5,
  });
});

test('stepClipPlayheadByFrames moves by exact frame increments within project bounds', () => {
  assert.equal(stepClipPlayheadByFrames(1, 1, 25, 10), 1.04);
  assert.equal(stepClipPlayheadByFrames(1, -5, 25, 10), 0.8);
  assert.equal(stepClipPlayheadByFrames(0.02, -2, 30, 10), 0);
  assert.equal(stepClipPlayheadByFrames(9.99, 5, 30, 10), 10);
});

test('fitClipTimelineZoom computes a zoom value that fits the full timeline in view', () => {
  assert.equal(fitClipTimelineZoom({ duration: 20, viewportWidth: 720 }), 22);
  assert.equal(fitClipTimelineZoom({ duration: 3, viewportWidth: 720 }), 100);
  assert.equal(fitClipTimelineZoom({ duration: 180, viewportWidth: 480 }), 10);
});

test('previewClipTimelineDragTiming returns live move and trim timing for pointer drags', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'move',
    clipStart: 4,
    clipDuration: 8,
    deltaSeconds: 1.37,
    rawStart: 2.44,
    snap: true,
  }), {
    start: 2.4,
    duration: 8,
    trimStartDelta: 0,
  });

  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-left',
    clipStart: 4,
    clipDuration: 8,
    deltaSeconds: 2.37,
    rawStart: 0,
    snap: true,
  }), {
    start: 6.4,
    duration: 5.6,
    trimStartDelta: 2.4,
  });

  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-right',
    clipStart: 4,
    clipDuration: 8,
    deltaSeconds: -9,
    rawStart: 0,
    snap: false,
  }), {
    start: 4,
    duration: 0.25,
    trimStartDelta: 0,
  });
});

test('previewClipTimelineDragTiming reports left trimStartDelta in source time', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-left',
    clipStart: 4,
    clipDuration: 8,
    deltaSeconds: 2.37,
    rawStart: 0,
    speed: 2,
    snap: true,
  }), {
    start: 6.4,
    duration: 5.6,
    trimStartDelta: 4.8,
  });

  assert.equal(previewClipTimelineDragTiming({
    mode: 'trim-right',
    clipStart: 4,
    clipDuration: 8,
    deltaSeconds: -2,
    rawStart: 0,
    speed: 2,
  }).trimStartDelta, 0);
});

test('previewClipTimelineDragTiming limits left extension to source headroom', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-left',
    clipStart: 4,
    clipDuration: 3,
    deltaSeconds: -1,
    rawStart: 0,
    speed: 2,
    trimStart: 0.1,
  }), {
    start: 3.95,
    duration: 3.05,
    trimStartDelta: -0.1,
  });
});

test('previewClipTimelineDragTiming allows left extension when trimStart is omitted', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-left',
    clipStart: 4,
    clipDuration: 3,
    deltaSeconds: -1,
    rawStart: 0,
  }), {
    start: 3,
    duration: 4,
    trimStartDelta: -1,
  });
});

test('previewClipTimelineDragTiming blocks left extension at explicit zero source trim', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-left',
    clipStart: 4,
    clipDuration: 3,
    deltaSeconds: -1,
    rawStart: 0,
    speed: 2,
    trimStart: 0,
  }), {
    start: 4,
    duration: 3,
    trimStartDelta: 0,
  });
});

test('previewClipTimelineDragTiming clears an unreachable snap after source clamping', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-left',
    clipStart: 4,
    clipDuration: 3,
    deltaSeconds: -0.1,
    rawStart: 0,
    speed: 2,
    trimStart: 0.1,
    snap: true,
    snapTargets: [{ time: 3.9, kind: 'playhead', label: '播放头' }],
    snapThresholdSeconds: 0.2,
  }), {
    start: 3.95,
    duration: 3.05,
    trimStartDelta: -0.1,
  });
});

test('previewClipTimelineDragTiming snaps moves to playhead and neighboring clip edges', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'move',
    clipStart: 5,
    clipDuration: 2,
    deltaSeconds: -0.04,
    rawStart: 3.96,
    snap: true,
    snapTargets: [
      { time: 0, kind: 'zero' },
      { time: 4, kind: 'clip-end', label: '片段结束' },
      { time: 8, kind: 'clip-start', label: '片段开始' },
    ],
  }), {
    start: 4,
    duration: 2,
    trimStartDelta: 0,
    snapTarget: { time: 4, kind: 'clip-end', label: '片段结束' },
    snapEdgeTime: 4,
  });

  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-right',
    clipStart: 2,
    clipDuration: 2.83,
    deltaSeconds: 0.13,
    rawStart: 0,
    snap: true,
    snapTargets: [{ time: 5, kind: 'playhead', label: '播放头' }],
  }), {
    start: 2,
    duration: 3,
    trimStartDelta: 0,
    snapTarget: { time: 5, kind: 'playhead', label: '播放头' },
    snapEdgeTime: 5,
  });
});

test('previewClipTimelineDragTiming reports the active snapped edge for move and trim drags', () => {
  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'move',
    clipStart: 2,
    clipDuration: 3,
    deltaSeconds: 0,
    rawStart: 1.96,
    snap: true,
    snapTargets: [{ time: 5, kind: 'audio-start', label: '旁白' }],
  }), {
    start: 2,
    duration: 3,
    trimStartDelta: 0,
    snapTarget: { time: 5, kind: 'audio-start', label: '旁白' },
    snapEdgeTime: 5,
  });

  assert.deepEqual(previewClipTimelineDragTiming({
    mode: 'trim-left',
    clipStart: 4,
    clipDuration: 3,
    deltaSeconds: -0.14,
    rawStart: 0,
    speed: 2,
    trimStart: 0.2,
    snap: true,
    snapTargets: [{ time: 3.9, kind: 'text-end', label: '字幕' }],
    snapThresholdSeconds: 0.2,
  }), {
    start: 3.9,
    duration: 3.1,
    trimStartDelta: -0.2,
    snapTarget: { time: 3.9, kind: 'text-end', label: '字幕' },
    snapEdgeTime: 3.9,
  });
});

test('resolveClipVisualKeyframes sanitizes and sorts transform keyframes', () => {
  assert.deepEqual(resolveClipVisualKeyframes([
    { time: 3.333, scale: 420, x: 10, y: 20, rotation: 400, opacity: -5 },
    { time: -2, scale: 80, x: -12.345, y: 4.321, rotation: -12, opacity: 55 },
  ], 3), [
    { time: 0, scale: 80, x: -12.35, y: 4.32, rotation: -12, opacity: 55 },
    { time: 3, scale: 400, x: 10, y: 20, rotation: 360, opacity: 0 },
  ]);
});

test('interpolateClipVisualKeyframes blends transforms at the current local time', () => {
  const keyframes = resolveClipVisualKeyframes([
    { time: 0, scale: 100, x: 0, y: 20, rotation: 0, opacity: 100 },
    { time: 2, scale: 200, x: 100, y: 60, rotation: 90, opacity: 20 },
  ], 2);

  assert.deepEqual(interpolateClipVisualKeyframes(keyframes, 1, { scale: 75, x: 5, y: 6, rotation: 7, opacity: 8 }), {
    scale: 150,
    x: 50,
    y: 40,
    rotation: 45,
    opacity: 60,
  });
  assert.deepEqual(interpolateClipVisualKeyframes([], 1.5, { scale: 120, x: 12, y: 34, rotation: -10, opacity: 88 }), {
    scale: 120,
    x: 12,
    y: 34,
    rotation: -10,
    opacity: 88,
  });
});

test('duplicateClipTimelineVisual inserts a copy after the selected visual', () => {
  const visuals = duplicateClipTimelineVisual([
    { id: 'a', kind: 'image', url: '/a.png', duration: 2 },
    { id: 'b', kind: 'video', url: '/b.mp4', duration: 4 },
  ], 'a');

  assert.deepEqual(visuals.map((item) => [item.id, item.url, item.duration]), [
    ['a', '/a.png', 2],
    ['a-copy-1', '/a.png', 2],
    ['b', '/b.mp4', 4],
  ]);
});

test('buildClipDraftFromTimeline creates one clip for each audio bed', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [
      { id: 'image-a', kind: 'image', url: '/files/input/a.png', duration: 2 },
      { id: 'image-b', kind: 'image', url: '/files/input/b.png', duration: 3 },
    ],
    audios: [
      { url: '/files/input/a.mp3', label: 'music' },
      { url: '/files/input/b.mp3', label: 'effect' },
    ],
  }, { imageDuration: 2 });

  const audioTrack = project.tracks.find((track) => track.kind === 'audio');
  assert.deepEqual(
    audioTrack?.clips.map((clip) => [clip.id, clip.sourceUrl, clip.start, clip.duration]),
    [
      ['audio-0', '/files/input/a.mp3', 0, 5],
      ['audio-1', '/files/input/b.mp3', 0, 5],
    ],
  );
});

test('buildClipDraftFromTimeline preserves editable audio and text clip timing', () => {
  const project = buildClipDraftFromTimeline({
    visuals: [
      { id: 'image-a', kind: 'image', url: '/files/input/a.png', duration: 6, fadeIn: 0.5, fadeOut: 0.75 },
    ],
    audios: [
      { id: 'voice', url: '/files/input/voice.mp3', label: 'voice', start: 1.5, duration: 2.5, trimStart: 0.75, volume: 0.65, fadeIn: 0.2, fadeOut: 0.4 },
    ],
    texts: [
      { id: 'title', text: '标题字幕', start: 2, duration: 3, fontSize: 56, color: '#ffcc00', x: 35, y: 72 },
    ],
  }, { imageDuration: 6 });

  const audioClip = project.tracks.find((track) => track.kind === 'audio')?.clips[0];
  const textClip = project.tracks.find((track) => track.kind === 'text')?.clips[0];
  const visualClip = project.tracks.find((track) => track.kind === 'visual')?.clips[0];

  assert.deepEqual(
    [visualClip?.id, visualClip?.fadeIn, visualClip?.fadeOut],
    ['image-a', 0.5, 0.75],
  );
  assert.deepEqual(
    [audioClip?.id, audioClip?.start, audioClip?.duration, audioClip?.trimStart, audioClip?.volume, audioClip?.fadeIn, audioClip?.fadeOut],
    ['voice', 1.5, 2.5, 0.75, 0.65, 0.2, 0.4],
  );
  assert.deepEqual(
    [textClip?.id, textClip?.text, textClip?.start, textClip?.duration, textClip?.fontSize, textClip?.color, textClip?.x, textClip?.y],
    ['title', '标题字幕', 2, 3, 56, '#ffcc00', 35, 72],
  );
});

test('updateClipTimelineMaterialTiming moves an audio clip without changing duration', () => {
  const clips = updateClipTimelineMaterialTiming([
    { id: 'voice', url: '/files/input/voice.mp3', start: 0, duration: 5, volume: 0.8 },
    { id: 'music', url: '/files/input/music.mp3', start: 2, duration: 8, volume: 0.4 },
  ], 'music', { start: 4.25 });

  assert.deepEqual(clips.map((clip) => [clip.id, clip.start, clip.duration, clip.volume]), [
    ['voice', 0, 5, 0.8],
    ['music', 4.25, 8, 0.4],
  ]);
});

test('updateClipTimelineMaterialTiming trims text clips and keeps a minimum duration', () => {
  const clips = updateClipTimelineMaterialTiming([
    { id: 'subtitle', text: '开场字幕', start: 1, duration: 3 },
  ], 'subtitle', { start: 2.5, duration: 0.01 });

  assert.deepEqual(clips.map((clip) => [clip.id, clip.start, clip.duration, clip.text]), [
    ['subtitle', 2.5, 0.25, '开场字幕'],
  ]);
});

test('removeClipTimelineMaterial drops only the selected audio or text clip', () => {
  const clips = removeClipTimelineMaterial([
    { id: 'voice', url: '/files/input/voice.mp3', start: 0, duration: 5 },
    { id: 'subtitle', text: '字幕', start: 1, duration: 3 },
  ], 'voice');

  assert.deepEqual(clips.map((clip) => [clip.id, clip.url, clip.text]), [
    ['subtitle', undefined, '字幕'],
  ]);
});

test('duplicateClipTimelineMaterial places a copy after the original timing range', () => {
  const clips = duplicateClipTimelineMaterial([
    { id: 'subtitle', text: '字幕', start: 2, duration: 3, fontSize: 48, color: '#ffcc00' },
  ], 'subtitle');

  assert.deepEqual(clips.map((clip) => [clip.id, clip.start, clip.duration, clip.fontSize, clip.color]), [
    ['subtitle', 2, 3, 48, '#ffcc00'],
    ['subtitle-copy-1', 5, 3, 48, '#ffcc00'],
  ]);
});

test('splitClipTimelineMaterialAtTime splits audio clips at the playhead', () => {
  const clips = splitClipTimelineMaterialAtTime([
    { id: 'music', url: '/files/input/music.mp3', start: 1, duration: 6, trimStart: 0.5, speed: 2, volume: 0.6 },
  ], 'music', 4);

  assert.deepEqual(clips.map((clip) => [clip.id, clip.start, clip.duration, clip.trimStart, clip.volume]), [
    ['music-left', 1, 3, 0.5, 0.6],
    ['music-right', 4, 3, 6.5, 0.6],
  ]);
});

test('splitClipTimelineVisual advances a video midpoint in source time', () => {
  const visuals = splitClipTimelineVisual([
    { id: 'video-a', kind: 'video', url: '/a.mp4', duration: 2, trimStart: 3, speed: 2 },
  ], 'video-a');

  assert.deepEqual(visuals.map((item) => [item.id, item.duration, item.trimStart]), [
    ['video-a-a', 1, 3],
    ['video-a-b', 1, 5],
  ]);
});

test('splitLinkedClipTimelineAtTime splits overlapping audio and text with a visual clip', () => {
  const result = splitLinkedClipTimelineAtTime({
    visuals: [
      { id: 'visual-a', kind: 'video', url: '/files/input/a.mp4', duration: 8 },
      { id: 'visual-b', kind: 'image', url: '/files/input/b.png', duration: 3 },
    ],
    audios: [
      { id: 'music', url: '/files/input/music.mp3', start: 1, duration: 8, volume: 0.6 },
      { id: 'effect', url: '/files/input/effect.mp3', start: 9.5, duration: 1 },
    ],
    texts: [
      { id: 'caption', text: '字幕', start: 2, duration: 6 },
    ],
    visualId: 'visual-a',
    playheadTime: 4,
  });

  assert.deepEqual(result.visuals.map((clip) => [clip.id, clip.duration]), [
    ['visual-a-left', 4],
    ['visual-a-right', 4],
    ['visual-b', 3],
  ]);
  assert.deepEqual(result.audios.map((clip) => [clip.id, clip.start, clip.duration, clip.volume]), [
    ['music-left', 1, 3, 0.6],
    ['music-right', 4, 5, 0.6],
    ['effect', 9.5, 1, undefined],
  ]);
  assert.deepEqual(result.texts.map((clip) => [clip.id, clip.start, clip.duration, clip.text]), [
    ['caption-left', 2, 2, '字幕'],
    ['caption-right', 4, 4, '字幕'],
  ]);
});

test('splitLinkedClipTimelineAtTime advances linked source offsets at non-1x speed', () => {
  const result = splitLinkedClipTimelineAtTime({
    visuals: [
      { id: 'visual', kind: 'video', url: '/video.mp4', duration: 6, trimStart: 1, speed: 2 },
    ],
    audios: [
      { id: 'audio', url: '/audio.mp3', start: 0.5, duration: 5, trimStart: 0.25, speed: 2 },
    ],
    visualId: 'visual',
    playheadTime: 2,
  });

  assert.deepEqual(result.visuals.map((clip) => [clip.id, clip.duration, clip.trimStart]), [
    ['visual-left', 2, 1],
    ['visual-right', 4, 5],
  ]);
  assert.deepEqual(result.audios.map((clip) => [clip.id, clip.start, clip.duration, clip.trimStart]), [
    ['audio-left', 0.5, 1.5, 0.25],
    ['audio-right', 2, 3.5, 3.25],
  ]);
});
