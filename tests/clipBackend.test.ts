import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { createCubeLutText } = require('../backend/src/utils/lutCube.js');
const {
  createClipRenderPlan,
  normalizeClipProject,
} = require('../backend/src/providers/clipProject.js');
const {
  buildClipCoverArgs,
  normalizeClipCoverRequest,
} = require('../backend/src/providers/clipCover.js');

test('normalizeClipProject rejects projects without visual clips', () => {
  assert.throws(
    () => normalizeClipProject({ version: 1, tracks: [{ id: 'a', kind: 'audio', clips: [] }] }),
    /至少需要 1 个图片或视频片段/,
  );
});

test('normalizeClipCoverRequest clamps frame cover settings', () => {
  assert.deepEqual(normalizeClipCoverRequest({ mode: 'frame', time: 999, url: ' /files/output/cover.jpg ' }, 12), {
    mode: 'frame',
    time: 11.96,
    url: '/files/output/cover.jpg',
  });
  assert.deepEqual(normalizeClipCoverRequest({ mode: 'local', time: -5 }, 8), {
    mode: 'local',
    time: 0,
    url: '',
  });
});

test('buildClipCoverArgs extracts one jpg frame from the rendered video', () => {
  assert.deepEqual(buildClipCoverArgs('out.mp4', 'cover.jpg', { mode: 'frame', time: 2.25 }, 5), [
    '-y',
    '-hide_banner',
    '-ss',
    '2.25',
    '-i',
    'out.mp4',
    '-frames:v',
    '1',
    '-q:v',
    '2',
    'cover.jpg',
  ]);
});

test('createClipRenderPlan maps visual and audio clips to deterministic ffmpeg inputs', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 3, fit: 'contain' },
          { id: 'vid', kind: 'video', sourceUrl: '/files/input/b.mp4', start: 3, duration: 2, trimStart: 1, fit: 'cover' },
        ],
      },
      {
        id: 'audio',
        kind: 'audio',
        clips: [
          { id: 'aud', kind: 'audio', sourceUrl: '/files/input/c.mp3', start: 0, duration: 5, volume: 0.8 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.duration, 5);
  assert.equal(plan.visualClips.length, 2);
  assert.equal(plan.audioClips.length, 1);
  assert.equal(plan.visualClips[1].trimStart, 1);
  assert.deepEqual(plan.inputRefs.map((input) => [input.kind, input.url]), [
    ['image', '/files/input/a.png'],
    ['video', '/files/input/b.mp4'],
    ['audio', '/files/input/c.mp3'],
  ]);
  assert.match(plan.filterComplex, /concat=n=2:v=1:a=0/);
  assert.match(plan.filterComplex, /amix=inputs=2/);
});

test('createClipRenderPlan trims audio from the source offset when trimStart is set', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 3 },
        ],
      },
      {
        id: 'audio',
        kind: 'audio',
        clips: [
          { id: 'aud', kind: 'audio', sourceUrl: '/files/input/c.mp3', start: 2, duration: 4, trimStart: 1.5 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.match(plan.filterComplex, /\[1:a\]atrim=start=1\.5:end=5\.5,asetpts=PTS-STARTPTS,volume=1,adelay=2000\|2000\[a1\]/);
});

test('createClipRenderPlan applies visual filter presets before concat', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'vid', kind: 'video', sourceUrl: '/files/input/b.mp4', start: 0, duration: 2, filter: 'cinematic', intensity: 70 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.visualClips[0].filter, 'cinematic');
  assert.equal(plan.visualClips[0].intensity, 70);
  assert.match(plan.filterComplex, /eq=contrast=1\.14:brightness=0\.035:saturation=1\.21/);
  assert.match(plan.filterComplex, /curves=preset=medium_contrast/);
  assert.match(plan.filterComplex, /concat=n=1:v=1:a=0/);
});

test('createClipRenderPlan applies clip LUTs through ffmpeg lut3d', () => {
  const lutText = createCubeLutText('Invert', 2, (r, g, b) => [1 - r, 1 - g, 1 - b]);
  const written = [];
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          {
            id: 'vid',
            kind: 'video',
            sourceUrl: '/files/input/b.mp4',
            start: 0,
            duration: 2,
            lutPresetId: 'user-lut',
            lutName: 'My LUT',
            lutText,
            lutAmount: 0.5,
          },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project, {
    writeLutFile: (clip, index, text) => {
      written.push({ clip, index, text });
      return `C:/tmp/clip-${index}.cube`;
    },
  });

  assert.equal(plan.visualClips[0].lutName, 'My LUT');
  assert.equal(plan.visualClips[0].lutAmount, 0.5);
  assert.equal(written.length, 1);
  assert.match(written[0].text, /TITLE "My LUT"/);
  assert.match(written[0].text, /0\.500000 0\.500000 0\.500000/);
  assert.match(plan.filterComplex, /lut3d=file='C\\:\/tmp\/clip-0\.cube':interp=tetrahedral/);
  assert.match(plan.filterComplex, /lut3d=.*setsar=1/);
});

test('normalizeClipProject preserves and clamps visual transform fields', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 3, transform: { scale: 9, x: -20, y: 130, rotation: 540, opacity: 1.8 } },
        ],
      },
    ],
  });

  assert.deepEqual(project.tracks[0].clips[0].transform, {
    scale: 3,
    x: 0,
    y: 100,
    rotation: 180,
    opacity: 1,
  });
});

test('normalizeClipProject preserves and clamps visual transform keyframes', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          {
            id: 'img',
            kind: 'image',
            sourceUrl: '/files/input/a.png',
            start: 0,
            duration: 3,
            keyframes: [
              { time: 3.9, scale: 450, x: 20, y: 30, rotation: 540, opacity: -1 },
              { time: -1, scale: 80, x: -12.345, y: 4.321, rotation: -12, opacity: 55 },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(project.tracks[0].clips[0].keyframes, [
    { time: 0, scale: 80, x: -12.35, y: 4.32, rotation: -12, opacity: 55 },
    { time: 3, scale: 400, x: 20, y: 30, rotation: 360, opacity: 0 },
  ]);
});

test('createClipRenderPlan includes transform filters for scale position rotation and opacity', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 3, fit: 'contain', transform: { scale: 1.2, x: 10, y: 20, rotation: 15, opacity: 0.5 } },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.match(plan.filterComplex, /scale=.*pad=.*rotate=.*colorchannelmixer=aa=.*overlay=/);
  assert.match(plan.filterComplex, /rotate=0\.26/);
  assert.match(plan.filterComplex, /colorchannelmixer=aa=0\.5/);
});

test('createClipRenderPlan animates visual transforms from keyframes during export', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          {
            id: 'img',
            kind: 'image',
            sourceUrl: '/files/input/a.png',
            start: 0,
            duration: 4,
            keyframes: [
              { time: 0, scale: 100, x: 0, y: 0, rotation: 0, opacity: 100 },
              { time: 2, scale: 150, x: 50, y: 25, rotation: 45, opacity: 50 },
              { time: 4, scale: 200, x: 100, y: 50, rotation: 90, opacity: 0 },
            ],
          },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.match(plan.filterComplex, /scale=ceil\(iw\*\(if\(between\(t,0,2\),1\+\(1\.5-1\)\*\(\(t-0\)\/2\),if\(between\(t,2,4\),1\.5\+\(2-1\.5\)\*\(\(t-2\)\/2\),2\)\)\)\/2\)\*2/);
  assert.match(plan.filterComplex, /rotate=\(if\(between\(t,0,2\),0\+\(0\.79-0\)\*\(\(t-0\)\/2\),if\(between\(t,2,4\),0\.79\+\(1\.57-0\.79\)\*\(\(t-2\)\/2\),1\.57\)\)\)/);
  assert.match(plan.filterComplex, /colorchannelmixer=aa=\(if\(between\(t,0,2\),1\+\(0\.5-1\)\*\(\(t-0\)\/2\),if\(between\(t,2,4\),0\.5\+\(0-0\.5\)\*\(\(t-2\)\/2\),0\)\)\)/);
  assert.match(plan.filterComplex, /overlay=x=\(W-w\)\*\(if\(between\(t,0,2\),0\+\(0\.5-0\)\*\(\(t-0\)\/2\),if\(between\(t,2,4\),0\.5\+\(1-0\.5\)\*\(\(t-2\)\/2\),1\)\)\)/);
  assert.match(plan.filterComplex, /:y=\(H-h\)\*\(if\(between\(t,0,2\),0\+\(0\.25-0\)\*\(\(t-0\)\/2\),if\(between\(t,2,4\),0\.25\+\(0\.5-0\.25\)\*\(\(t-2\)\/2\),0\.5\)\)\)/);
});

test('createClipRenderPlan applies blend modes for visual clips', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 3, transform: { opacity: 0.8 }, blendMode: 'multiply' },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.match(plan.filterComplex, /blend=.*all_mode=multiply/);
});

test('createClipRenderPlan applies CSSgram open-source filter presets', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'vid', kind: 'video', sourceUrl: '/files/input/b.mp4', start: 0, duration: 2, filter: 'cssgram-clarendon', intensity: 80 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.visualClips[0].filter, 'cssgram-clarendon');
  assert.match(plan.filterComplex, /eq=contrast=1\.16:brightness=0:saturation=1\.28/);
  assert.match(plan.filterComplex, /colorbalance=bs=0\.032/);
});

test('createClipRenderPlan applies FFmpeg video effect presets', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'vid-a', kind: 'video', sourceUrl: '/files/input/a.mp4', start: 0, duration: 2, filter: 'ffmpeg-sharpen', intensity: 80 },
          { id: 'vid-b', kind: 'video', sourceUrl: '/files/input/b.mp4', start: 2, duration: 2, filter: 'ffmpeg-film-grain', intensity: 45 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.visualClips[0].filter, 'ffmpeg-sharpen');
  assert.equal(plan.visualClips[1].filter, 'ffmpeg-film-grain');
  assert.match(plan.filterComplex, /unsharp=5:5:1\.2:3:3:0\.4/);
  assert.match(plan.filterComplex, /noise=alls=9:allf=t/);
});

test('createClipRenderPlan applies common editor color style presets', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'vid-a', kind: 'video', sourceUrl: '/files/input/a.mp4', start: 0, duration: 2, filter: 'color-teal-orange', intensity: 75 },
          { id: 'vid-b', kind: 'video', sourceUrl: '/files/input/b.mp4', start: 2, duration: 2, filter: 'ffmpeg-sketch', intensity: 50 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.visualClips[0].filter, 'color-teal-orange');
  assert.equal(plan.visualClips[1].filter, 'ffmpeg-sketch');
  assert.match(plan.filterComplex, /colorbalance=rs=0\.075:gs=-0\.038:bs=-0\.112/);
  assert.match(plan.filterComplex, /edgedetect=low=0\.1:high=0\.4/);
});

test('createClipRenderPlan applies expanded editor presets and video speed', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'vid-a', kind: 'video', sourceUrl: '/files/input/a.mp4', start: 0, duration: 3, filter: 'color-clean-bright', intensity: 70, speed: 2 },
          { id: 'vid-b', kind: 'video', sourceUrl: '/files/input/b.mp4', start: 3, duration: 4, filter: 'ffmpeg-vhs', intensity: 50, speed: 0.5 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.visualClips[0].speed, 2);
  assert.equal(plan.visualClips[1].speed, 0.5);
  assert.match(plan.filterComplex, /curves=preset=lighter/);
  assert.match(plan.filterComplex, /noise=alls=6:allf=t/);
  assert.match(plan.filterComplex, /trim=duration=6,setpts=0\.5\*\(PTS-STARTPTS\)/);
  assert.match(plan.filterComplex, /trim=duration=2,setpts=2\*\(PTS-STARTPTS\)/);
});

test('createClipRenderPlan applies visual fade transitions', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'vid', kind: 'video', sourceUrl: '/files/input/a.mp4', start: 0, duration: 5, fadeIn: 0.5, fadeOut: 0.75 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.visualClips[0].fadeIn, 0.5);
  assert.equal(plan.visualClips[0].fadeOut, 0.75);
  assert.match(plan.filterComplex, /fade=t=in:st=0:d=0\.5/);
  assert.match(plan.filterComplex, /fade=t=out:st=4\.25:d=0\.75/);
});

test('createClipRenderPlan applies xfade between visual clips', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img-a', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 3, transition: 'fade', transitionDuration: 0.5 },
          { id: 'img-b', kind: 'image', sourceUrl: '/files/input/b.png', start: 3, duration: 3, transition: 'slideleft', transitionDuration: 0.75 },
          { id: 'img-c', kind: 'image', sourceUrl: '/files/input/c.png', start: 6, duration: 2 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.duration, 8);
  assert.match(plan.filterComplex, /\[v0\]\[v1\]xfade=transition=fade:duration=0\.5:offset=2\.5\[vx1\]/);
  assert.match(plan.filterComplex, /\[vx1\]\[v2\]xfade=transition=slideleft:duration=0\.75:offset=4\.75\[vout\]/);
});

test('createClipRenderPlan stretches image input duration for visual speed', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img-a', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 3, speed: 2 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.inputRefs[0].inputDuration, 6);
  assert.match(plan.filterComplex, /trim=duration=6,setpts=0\.5\*\(PTS-STARTPTS\)/);
});

test('createClipRenderPlan keeps audio fades in ffmpeg filters', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 6, fit: 'contain' },
        ],
      },
      {
        id: 'audio',
        kind: 'audio',
        clips: [
          { id: 'aud', kind: 'audio', sourceUrl: '/files/input/c.mp3', start: 1, duration: 5, volume: 0.5, fadeIn: 0.75, fadeOut: 1.25 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.match(plan.filterComplex, /volume=0\.5/);
  assert.match(plan.filterComplex, /afade=t=in:st=0:d=0\.75/);
  assert.match(plan.filterComplex, /afade=t=out:st=3\.75:d=1\.25/);
  assert.match(plan.filterComplex, /adelay=1000\|1000/);
});

test('createClipRenderPlan overlays text clips with drawtext timing', () => {
  const project = normalizeClipProject({
    version: 1,
    width: 1280,
    height: 720,
    fps: 24,
    background: '#111827',
    tracks: [
      {
        id: 'visual',
        kind: 'visual',
        clips: [
          { id: 'img', kind: 'image', sourceUrl: '/files/input/a.png', start: 0, duration: 6, fit: 'contain' },
        ],
      },
      {
        id: 'text',
        kind: 'text',
        clips: [
          { id: 'caption', kind: 'text', text: '标题: A/B', start: 1.5, duration: 2.5, fontSize: 58, color: '#ffcc00', x: 35, y: 72 },
        ],
      },
    ],
  });

  const plan = createClipRenderPlan(project);

  assert.equal(plan.textClips.length, 1);
  assert.match(plan.filterComplex, /drawtext=/);
  assert.match(plan.filterComplex, /fontcolor=0xffcc00/);
  assert.match(plan.filterComplex, /fontsize=58/);
  assert.match(plan.filterComplex, /x=\(w-text_w\)\*0\.35/);
  assert.match(plan.filterComplex, /y=\(h-text_h\)\*0\.72/);
  assert.match(plan.filterComplex, /enable='between\(t,1\.5,4\)'/);
  assert.match(plan.filterComplex, /text='标题\\: A\/B'/);
});
