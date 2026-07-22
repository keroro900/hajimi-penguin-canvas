import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('local canvas image previews use cached backend thumbnails', () => {
  const smartImage = read('../src/components/SmartImage.tsx');
  const mediaPreview = read('../src/utils/mediaPreview.ts');
  const filesRoute = read('../backend/src/routes/files.js');

  assert.match(smartImage, /previewImageUrl\(src,\s*thumbSize\)/);
  assert.match(smartImage, /loading = 'lazy'/);
  assert.match(smartImage, /decoding = 'async'/);
  assert.match(smartImage, /data-full-src=\{src\}/);
  assert.match(smartImage, /IntersectionObserver/);
  assert.match(smartImage, /rootMargin:\s*'720px 720px'/);
  assert.match(smartImage, /setFallback\(true\)/);

  assert.match(mediaPreview, /\/api\/files\/thumbnail\?size=\$\{safeSize\}&url=/);
  assert.match(mediaPreview, /LOCAL_FILE_PREFIX_RE/);

  assert.match(filesRoute, /router\.get\('\/thumbnail'/);
  assert.match(filesRoute, /sharp\(sourcePath/);
  assert.match(filesRoute, /thumbnailInflight/);
  assert.match(filesRoute, /MAX_THUMBNAIL_JOBS/);
  assert.match(filesRoute, /Cache-Control', 'public, max-age=31536000, immutable'/);
  assert.match(filesRoute, /THUMBNAILS_DIR/);
});

test('local file uploads do not enforce a hard file-size cap', () => {
  const config = read('../backend/src/config.js');
  const filesRoute = read('../backend/src/routes/files.js');

  assert.match(config, /MAX_FILE_SIZE:\s*0/);
  assert.doesNotMatch(filesRoute, /limits:\s*\{\s*fileSize:\s*config\.MAX_FILE_SIZE\s*\}/);
  assert.match(filesRoute, /const uploadSingleFile = upload\.single\('file'\)/);
  assert.match(filesRoute, /err instanceof multer\.MulterError/);
  assert.doesNotMatch(filesRoute, /err\.code === 'LIMIT_FILE_SIZE'/);
  assert.doesNotMatch(filesRoute, /code:\s*'file_too_large'/);
  assert.doesNotMatch(filesRoute, /formatUploadLimit\(config\.MAX_FILE_SIZE\)/);
});

test('initial canvas boot keeps heavy nodes behind lazy boundaries', () => {
  const index = read('../index.html');
  const app = read('../src/App.tsx');
  const canvas = read('../src/components/Canvas.tsx');
  const css = read('../src/styles/index.css');
  const runTrigger = read('../src/hooks/useRunTrigger.ts');

  assert.ok(existsSync(new URL('../public/infinite-canvas-loading.png', import.meta.url)));
  assert.match(index, /<div class="t8-boot-screen"/);
  assert.match(index, /src="\/infinite-canvas-loading\.png"/);
  assert.match(index, /t8-boot-progress-fill/);
  assert.match(index, /t8-boot-progress-spark/);
  assert.match(index, /prefers-reduced-motion/);
  assert.match(app, /const Canvas = lazy\(\(\) => import\('\.\/components\/Canvas'\)\)/);
  assert.match(app, /function InfiniteCanvasBootLoading/);
  assert.match(app, /src="\/infinite-canvas-loading\.png"/);
  assert.match(app, /<Suspense fallback=\{<InfiniteCanvasBootLoading \/>}/);
  assert.match(app, /<AppRail/);
  assert.match(app, /<ShellPanel panel=\{activePanel\}/);
  assert.match(app, /setActivePanel\(\(panel\)\s*=>\s*\(panel === null \? lastOpenPanelRef\.current : null\)\)/);
  assert.match(canvas, /function lazyCanvasNode/);
  assert.match(canvas, /const Panorama3DNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/Panorama3DNode'\)/);
  assert.match(canvas, /const ImageNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/ImageNode'\)/);
  assert.doesNotMatch(canvas, /import ImageNode from '\.\/nodes\/ImageNode'/);

  assert.match(canvas, /data-canvas-surface-load=\{heavyCanvasSurface \? 'heavy' : 'normal'\}/);
  assert.match(canvas, /onlyRenderVisibleElements=\{canvasPerformance\.renderVisibleElementsOnly\}/);
  assert.match(runTrigger, /useRunBusStore/);
  assert.match(css, /Large graph rendering guard/);
  assert.match(
    css,
    /\.t8-canvas-shell\[data-canvas-surface-load="heavy"\] \.react-flow__node:not\(\.selected\):not\(:focus-within\) :where\(iframe, canvas\) \{[\s\S]*content-visibility:\s*auto;[\s\S]*contain-intrinsic-size:\s*320px 260px;/,
  );
  assert.match(
    css,
    /\.t8-canvas-shell\[data-canvas-surface-load="heavy"\]\.t8-viewport-moving \.react-flow__node:not\(\.selected\):not\(:focus-within\) > div:first-child,[\s\S]*\.t8-canvas-shell\[data-canvas-surface-load="heavy"\]\.t8-node-dragging \.react-flow__node:not\(\.selected\):not\(:focus-within\) > div:first-child \{[\s\S]*box-shadow:\s*none !important;[\s\S]*filter:\s*none !important;[\s\S]*backdrop-filter:\s*none !important;/,
  );
  assert.match(css, /Large graph interaction chrome trim/);
  assert.match(
    css,
    /\.t8-canvas-shell\[data-canvas-surface-load="heavy"\]\.t8-viewport-moving \.react-flow__node:not\(\.selected\):not\(:focus-within\) :where\(\.react-flow__handle, \.react-flow__resize-control, \[data-node-action-bar\], \[data-floating-node-action\]\),[\s\S]*\.t8-canvas-shell\[data-canvas-surface-load="heavy"\]\.t8-node-dragging \.react-flow__node:not\(\.selected\):not\(:focus-within\) :where\(\.react-flow__handle, \.react-flow__resize-control, \[data-node-action-bar\], \[data-floating-node-action\]\) \{[\s\S]*opacity:\s*0 !important;[\s\S]*pointer-events:\s*none !important;/,
  );
  assert.match(
    css,
    /\.t8-canvas-shell\[data-canvas-surface-load="heavy"\]\.t8-viewport-moving \.react-flow__node:not\(\.selected\):not\(:focus-within\) \*,[\s\S]*\.t8-canvas-shell\[data-canvas-surface-load="heavy"\]\.t8-node-dragging \.react-flow__node:not\(\.selected\):not\(:focus-within\) \* \{[\s\S]*transition-duration:\s*0s !important;/,
  );
});

test('canvas video previews defer real video sources until near the viewport', () => {
  const loopingVideo = read('../src/components/LoopingVideo.tsx');
  const videoPlayback = read('../src/utils/videoPlayback.ts');

  assert.match(videoPlayback, /preload:\s*'metadata'/);
  assert.match(loopingVideo, /IntersectionObserver/);
  assert.match(loopingVideo, /rootMargin:\s*'720px 720px'/);
  assert.match(loopingVideo, /preload === undefined \? props : \{ \.\.\.props, preload \}/);
  assert.match(loopingVideo, /data-full-src=\{src\}/);
  assert.match(loopingVideo, /src=\{shouldLoad \? src : undefined\}/);
  assert.match(loopingVideo, /matches\('\.t8-viewport-moving, \.t8-node-dragging'\)/);
  assert.match(loopingVideo, /pause\(\)/);
  assert.match(loopingVideo, /data-video-load-state=\{shouldLoad \? 'loaded' : 'deferred'\}/);
});

test('high-traffic node previews render through SmartImage', () => {
  const expectedSmartImageNodes = [
    '../src/components/nodes/MaterialThumbnail.tsx',
    '../src/components/nodes/OutputNode.tsx',
    '../src/components/nodes/UploadNode.tsx',
    '../src/components/nodes/ImageNode.tsx',
    '../src/components/nodes/GridEditorNode.tsx',
    '../src/components/nodes/Panorama3DNode.tsx',
    '../src/components/nodes/LoopNode.tsx',
    '../src/components/nodes/MaterialSetNode.tsx',
    '../src/components/nodes/VideoNode.tsx',
    '../src/components/nodes/SeedanceNode.tsx',
    '../src/components/nodes/LLMNode.tsx',
  ];

  for (const file of expectedSmartImageNodes) {
    const source = read(file);
    assert.match(source, /import SmartImage from '\.\.\/SmartImage'/, `${file} imports SmartImage`);
    assert.match(source, /<SmartImage[\s\S]*thumbSize=/, `${file} uses bounded preview size`);
  }
});

test('autosave avoids full-canvas serialization during high-frequency movement', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /if \(isDraggingRef\.current\) return;\s*const normalized = normalizeCanvasNodeSerials/);
  assert.match(canvas, /const snapshot = JSON\.stringify\(\{ nodes: persistNodes, edges: persistEdges, creativeDesk, nextNodeSerialId, farmCanvas \}\);/);
  assert.match(canvas, /const pendingSave = \{\s*nodes: persistNodes,\s*edges: persistEdges,\s*creativeDesk,\s*farmCanvas,\s*snapshot,\s*nextNodeSerialId,\s*\};\s*pendingSaveByCanvasRef\.current\.set\(canvasIdForSave, pendingSave\)/);
  assert.match(canvas, /if \(snapshot === previousSnapshot\) \{[\s\S]{0,260}return;\s*\}/);
  assert.match(canvas, /lastSavedByCanvasRef\.current\.set\(canvasIdForSave, snapshot\)/);
});

test('large canvas pan and wheel movement shed nonessential render work', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const css = read('../src/styles/index.css');

  assert.doesNotMatch(canvas, /const canvasInteractionBusy = viewportMoving \|\| nodeDragging/);
  assert.match(canvas, /const canvasPerformance = useMemo\(/);
  assert.match(canvas, /getCanvasPerformanceProfile\(\{\s*zoom: currentCanvasZoom,\s*nodeCount: nodes\.length,\s*edgeCount: edges\.length,\s*viewportMoving,\s*nodeDragging,/);
  assert.match(canvas, /onlyRenderVisibleElements=\{canvasPerformance\.renderVisibleElementsOnly\}/);
  assert.doesNotMatch(canvas, /import\s*\{[\s\S]*?\b(?:Background|BackgroundVariant)\b[\s\S]*?\}\s*from ['"]@xyflow\/react['"]/);
  assert.doesNotMatch(canvas, /<Background(?:\s|\/|>)/);
  assert.doesNotMatch(canvas, /canvasPerformance\.hideBackground/);
  assert.doesNotMatch(canvas, /\bMiniMap,\s*\r?\n/);
  assert.doesNotMatch(canvas, /<MiniMap/);

  assert.doesNotMatch(css, /\.react-flow__minimap/);
  assert.match(css, /\.t8-canvas-shell\.t8-viewport-moving \.react-flow__node:not\(\.selected\) > div/);
  assert.doesNotMatch(css, /\.t8-canvas-shell\.t8-viewport-moving :where\(video, iframe\)/);
  assert.doesNotMatch(css, /\.t8-canvas-shell\.t8-node-dragging :where\(video, iframe\)/);
  assert.match(css, /box-shadow: none !important/);
  assert.match(css, /filter: none !important/);
}
);

test('media generation polling throttles repeated progress writes', () => {
  const image = read('../src/components/nodes/ImageNode.tsx');
  const video = read('../src/components/nodes/VideoNode.tsx');
  const seedance = read('../src/components/nodes/SeedanceNode.tsx');
  const audio = read('../src/components/nodes/AudioNode.tsx');

  for (const source of [image, video, seedance, audio]) {
    assert.match(source, /useThrottledNodeUpdate/);
    assert.match(source, /flushProgressUpdate/);
  }
});
