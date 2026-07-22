import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveVideoDisplaySize } from '../src/utils/videoDisplayAspect.ts';

const root = path.resolve('src/components/nodes');

function read(name: string) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

test('seedance node has smart card shell and classic switch', () => {
  const source = read('SeedanceNode.tsx');
  assert.match(source, /SmartNodeShell/);
  assert.match(source, /SmartNodeComposer/);
  assert.match(source, /useSmartNodePanelToggle/);
  assert.match(source, /uiVariant/);
  assert.match(source, /切回卡片版节点|切换到经典版节点/);
  assert.match(source, /modelOptions\.map/);
  assert.match(source, /value=\{defaultProviderModel\}/);
});

test('seedance smart card exposes the same corner resize controls as media cards', () => {
  const source = read('SeedanceNode.tsx');
  const smartCardBlock = source.slice(
    source.indexOf('if (useSmartCardSeedanceNode)'),
    source.indexOf('{smartComposerOpen && ('),
  );

  assert.match(source, /import ResizableCorners from '\.\/ResizableCorners';/);
  assert.match(smartCardBlock, /<ResizableCorners[\s\S]*selected=\{selected\}/);
  assert.match(smartCardBlock, /onResize=/);
  assert.match(smartCardBlock, /onResizeEnd=/);
  assert.match(smartCardBlock, /update\(\{[\s\S]*smartCardWidth:[\s\S]*smartCardHeight:/);
});

test('smart media resize controls sit above clipped preview cards and avoid repeated geometry work', () => {
  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx']) {
    const source = read(file);
    assert.match(source, /<\/div>\s*<ResizableCorners[\s\S]*selected=\{selected\}/, file);
  }

  for (const file of ['VideoNode.tsx', 'SeedanceNode.tsx']) {
    const source = read(file);
    const resizeBlock = source.slice(source.indexOf('<ResizableCorners'), source.indexOf('onResizeEnd='));
    assert.doesNotMatch(resizeBlock, /sync\w+NodeGeometry\(\)/, file);
  }
});

test('seedance card variant switch commits before geometry synchronization', () => {
  const source = read('SeedanceNode.tsx');
  const switchBlock = source.slice(
    source.indexOf("const switchSeedanceNodeVariant = (variant: 'smart-card' | 'classic') => {"),
    source.indexOf('if (useSmartCardSeedanceNode)'),
  );

  assert.match(source, /import \{ flushSync \} from 'react-dom';/);
  assert.match(switchBlock, /flushSync\(\(\) => \{[\s\S]*update\(\{ uiVariant: variant \}\);[\s\S]*\}\);/);
  assert.ok(
    switchBlock.indexOf('flushSync') < switchBlock.indexOf('syncSeedanceNodeGeometry()'),
    'Seedance must commit uiVariant before recalculating node geometry',
  );
});

test('audio node has smart card shell and classic switch', () => {
  const source = read('AudioNode.tsx');
  assert.match(source, /SmartNodeShell/);
  assert.match(source, /SmartNodeComposer/);
  assert.match(source, /useSmartNodePanelToggle/);
  assert.match(source, /uiVariant/);
  assert.match(source, /切回卡片版节点|切换到经典版节点/);
  assert.match(source, /ResizableCorners/);
  assert.match(source, /t8-smart-audio-card/);
  assert.match(source, /t8-smart-audio-waveform/);
  assert.match(source, /t8-smart-audio-actions/);
  assert.match(source, /t8-smart-audio-form-grid/);
  assert.match(source, /smartActiveTrackIndex/);
});

test('image smart card result keeps node drag and panel click after generation', () => {
  const source = read('ImageNode.tsx');
  const smartCardBlock = source.slice(
    source.indexOf('if (useSmartCardImageNode)'),
    source.indexOf('{smartComposerOpen && ('),
  );

  assert.match(source, /const smartImageUrls = useMemo/);
  assert.match(source, /const imageResultSlots = useMemo/);
  assert.match(source, /resolveMediaResultSlots\(d\?\.imageResultSlots, smartImageUrls, MAX_IMAGE_OUTPUT_COUNT\)/);
  assert.match(smartCardBlock, /imageResultSlots\.map\(\(slot, index\) =>/);
  assert.match(smartCardBlock, /<SmartImage[\s\S]*data-drag-source[\s\S]*draggable=\{false\}/);
  assert.match(smartCardBlock, /<SmartImage[\s\S]*onMouseDown=\{\(e\) => handleSmartImageMouseDown\(e, url\)\}/);
  assert.match(smartCardBlock, /download=\{mediaDownloadFileName\('image', url, index\)\}/);
  assert.match(source, /const handleSmartImageMouseDown[\s\S]*beginMaterialDrag/);
  assert.doesNotMatch(smartCardBlock, /onClick=\{\(e\) => handleSmartImageClick\(e, imageUrl\)\}/);
  assert.doesNotMatch(source, /const handleSmartImageClick/);
  assert.match(smartCardBlock, /aria-label="预览大图"[\s\S]*setSmartPreviewOpen\(true\)/);
  assert.match(source, /onClick:\s*smartPanelToggle\.onClick/);
});

test('image smart card parameter composer renders above canvas nodes through a portal', () => {
  const image = read('ImageNode.tsx');
  const composer = read('shared/SmartNodeComposer.tsx');
  const css = fs.readFileSync(path.resolve('src/styles/theme-core.css'), 'utf8');
  const portalBlock = css.slice(
    css.indexOf('.t8-smart-node-composer--portal'),
    css.indexOf('.t8-smart-rh-node'),
  );
  const zIndexMatch = portalBlock.match(/z-index:\s*(\d+)/);

  assert.match(composer, /createPortal/);
  assert.match(composer, /portal\?: boolean/);
  assert.match(composer, /anchorRef\?: RefObject<HTMLElement>/);
  assert.match(composer, /document\.body/);
  assert.match(image, /<SmartNodeComposer[\s\S]*portal[\s\S]*anchorRef=\{smartNodeRef\}/);
  assert.match(css, /\.t8-smart-node-composer--portal/);
  assert.ok(zIndexMatch, 'expected smart node composer portal z-index');
  const zIndex = Number(zIndexMatch?.[1] || '0');
  assert.ok(zIndex >= 10000, `expected composer portal to stay above canvas nodes, got ${zIndex}`);
  assert.ok(zIndex < 10050, `expected composer portal to stay below global app overlays, got ${zIndex}`);
  assert.match(css, /position:\s*fixed/);
});

test('image smart card regeneration does not flash the parameter composer', () => {
  const image = read('ImageNode.tsx');
  const composer = read('shared/SmartNodeComposer.tsx');
  const handleGenerateBlock = image.slice(
    image.indexOf('const handleGenerate = async () => {'),
    image.indexOf('try {', image.indexOf('const handleGenerate = async () => {')),
  );
  const toggleBlock = image.slice(
    image.indexOf('const smartPanelToggle = useSmartNodePanelToggle({'),
    image.indexOf('});', image.indexOf('const smartPanelToggle = useSmartNodePanelToggle({')) + 3,
  );

  assert.match(handleGenerateBlock, /setSmartComposerOpenLocal\(false\)/);
  assert.match(handleGenerateBlock, /smartPanelToggle\.suppressClickRef\.current\s*=\s*true/);
  assert.match(toggleBlock, /disabled:\s*!useSmartCardImageNode\s*\|\|\s*status === 'generating'/);
  assert.match(composer, /onPointerDown/);
  assert.match(composer, /onPointerUp/);
  assert.match(composer, /onClick/);
}
);

test('image regeneration isolates new async tasks from stale card outputs', () => {
  const image = read('ImageNode.tsx');
  const handleGeneratePrelude = image.slice(
    image.indexOf('const handleGenerate = async () => {'),
    image.indexOf('try {', image.indexOf('const handleGenerate = async () => {')),
  );
  const resumeBlock = image.slice(
    image.indexOf('const resumePersistedImageTasks = async () => {'),
    image.indexOf('const mergedUrls', image.indexOf('const resumePersistedImageTasks = async () => {')),
  );

  assert.match(handleGeneratePrelude, /imageUrl:\s*''/);
  assert.match(handleGeneratePrelude, /imageUrls:\s*\[\]/);
  assert.match(handleGeneratePrelude, /taskId:\s*''/);
  assert.doesNotMatch(resumeBlock, /baseUrls\s*=\s*\[\.\.\.smartImageUrls\]/);
  assert.match(resumeBlock, /baseUrls:\s*string\[\]\s*=\s*\[\]/);
});

test('image edit modal stays above smart card parameter composer portals', () => {
  const coreCss = fs.readFileSync(path.resolve('src/styles/theme-core.css'), 'utf8');
  const appCss = fs.readFileSync(path.resolve('src/styles/index.css'), 'utf8');
  const composerBlock = coreCss.slice(
    coreCss.indexOf('.t8-smart-node-composer--portal'),
    coreCss.indexOf('.t8-smart-rh-node'),
  );
  const overlayBlock = appCss.slice(
    appCss.indexOf('.img-edit-overlay'),
    appCss.indexOf('@keyframes img-edit-fade-in'),
  );
  const composerZ = Number(composerBlock.match(/z-index:\s*(\d+)/)?.[1] || '0');
  const overlayZ = Number(overlayBlock.match(/z-index:\s*(\d+)/)?.[1] || '0');

  assert.ok(composerZ > 0, `expected smart composer portal z-index, got ${composerZ}`);
  assert.ok(overlayZ > 0, `expected image edit overlay z-index, got ${overlayZ}`);
  assert.ok(
    overlayZ > composerZ,
    `expected image edit overlay (${overlayZ}) to stay above smart composer portal (${composerZ})`,
  );
});

test('smart card parameter composers use top-level portals for media and provider nodes', () => {
  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx', 'AudioNode.tsx']) {
    const source = read(file);
    assert.match(source, /<SmartNodeComposer[\s\S]*portal[\s\S]*anchorRef=\{smartNodeRef\}/, file);
  }
});

test('smart card composers expose draggable numbered removable material previews', () => {
  const image = read('ImageNode.tsx');
  const video = read('VideoNode.tsx');
  const seedance = read('SeedanceNode.tsx');
  const audio = read('AudioNode.tsx');
  const thumbnail = read('MaterialThumbnail.tsx');

  assert.match(thumbnail, /const sequenceLabel = material\.kind === 'image'[\s\S]*`图\$\{index \+ 1\}`/);
  assert.match(thumbnail, /material\.kind === 'video'[\s\S]*`视\$\{index \+ 1\}`/);
  assert.match(thumbnail, /material\.kind === 'audio'[\s\S]*`音\$\{index \+ 1\}`/);
  assert.match(thumbnail, /aria-label=\{sequenceLabel\}/);
  assert.match(thumbnail, /\{sequenceLabel\}/);

  for (const source of [image, video, seedance, audio]) {
    const composerBlock = source.slice(
      source.indexOf('{smartComposerOpen && ('),
      source.indexOf('<MentionPromptInput', source.indexOf('{smartComposerOpen && (')),
    );
    assert.match(composerBlock, /<MaterialPreviewSection/);
    assert.match(composerBlock, /onReorder=\{setMaterialOrder\}/);
    assert.match(composerBlock, /onRemoveLocal=\{/);
    assert.match(composerBlock, /onExcludeUpstream=\{handleExcludeUpstreamMaterial\}/);
    assert.match(composerBlock, /density="compact"/);
    assert.doesNotMatch(composerBlock, /t8-smart-ref-thumb/);
  }
});

test('upstream material X disconnects the upstream edge instead of only hiding the item', () => {
  const section = read('MaterialPreviewSection.tsx');
  const helper = read('shared/upstreamMaterialConnections.ts');

  assert.match(section, /断开.*上游.*连线/);
  assert.doesNotMatch(section, /不会断开连线/);
  assert.match(helper, /useDisconnectUpstreamMaterial/);
  assert.match(helper, /setEdges/);
  assert.match(helper, /edge\.source === sourceNodeId && edge\.target === targetNodeId/);
  assert.match(helper, /pruneMaterialOrderForDisconnectedSource/);
  assert.match(helper, /pruneMaterialIdsForDisconnectedSource/);

  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx', 'AudioNode.tsx', 'LLMNode.tsx']) {
    const source = read(file);
    assert.match(source, /useDisconnectUpstreamMaterial\(id\)/, file);
    assert.match(source, /disconnectUpstreamMaterial\(/, file);
  }
});

test('compact material preview keeps card composers to a single media rail', () => {
  const section = read('MaterialPreviewSection.tsx');

  assert.match(section, /density\?: 'default' \| 'compact'/);
  assert.match(section, /const isCompact = density === 'compact'/);
  assert.match(section, /t8-material-preview-section--compact/);
  assert.match(section, /t8-material-preview-rail/);
  assert.match(section, /compactAccessory\?: ReactNode/);
  assert.match(section, /t8-material-preview-rail-accessory/);
  assert.match(section, /data-density=\{density\}/);
  assert.match(section, /size=\{isCompact \? 36 : 56\}/);
  assert.match(section, /\{isCompact \? \(/);
  const compactBranch = section.slice(
    section.indexOf('{isCompact ? ('),
    section.indexOf(') : (', section.indexOf('{isCompact ? (')),
  );
  assert.match(compactBranch, /allItems\.map/);
  assert.doesNotMatch(compactBranch, /t8-material-preview-group-label/);
});

test('image smart composer uses condensed model and prompt rows', () => {
  const image = read('ImageNode.tsx');
  const css = fs.readFileSync(path.resolve('src/styles/theme-core.css'), 'utf8');
  const composerBlock = image.slice(
    image.indexOf('{smartComposerOpen && ('),
    image.indexOf('<div className="t8-smart-composer-row t8-smart-composer-row--params', image.indexOf('{smartComposerOpen && (')),
  );

  assert.match(composerBlock, /t8-smart-image-model-row/);
  assert.match(composerBlock, /t8-smart-prompt-shell--compact/);
  assert.match(composerBlock, /compactAccessory=\{/);
  assert.doesNotMatch(composerBlock, /<div className="t8-smart-ref-strip">/);
  assert.match(css, /\.t8-smart-image-model-row/);
  assert.match(css, /\.t8-smart-prompt-shell--compact/);
  assert.match(css, /\.t8-material-preview-rail-accessory/);
  assert.match(css, /flex-wrap:\s*nowrap/);
});

test('smart composer variant switch buttons do not cancel their own click activation', () => {
  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx', 'AudioNode.tsx', 'MaterialSetNode.tsx', 'UploadNode.tsx']) {
    const source = read(file);
    const buttonMatches = source.matchAll(/<button[\s\S]*?<\/button>/g);
    const switchButtons = [...buttonMatches]
      .map((match) => match[0])
      .filter((block) => block.includes('切换到经典版节点') || block.includes('切回卡片版节点'));

    assert.ok(switchButtons.length > 0, `expected ${file} to expose smart/classic switch buttons`);

    for (const block of switchButtons) {
      const pointerDownMatch = block.match(/onPointerDown=\{[\s\S]*?\}/);
      if (!pointerDownMatch) continue;
      assert.doesNotMatch(
        pointerDownMatch[0],
        /preventDefault\(/,
        `${file} should not preventDefault on pointer down because the switch action is bound to click`,
      );
    }
  }
});

test('audio smart card request uses the same ordered audio material list as the preview', () => {
  const audio = read('AudioNode.tsx');

  assert.match(audio, /const orderedReferenceAudios = useOrderedMaterials/);
  assert.match(audio, /audios=\{orderedReferenceAudios\}/);
  assert.match(audio, /const audioUrl = orderedReferenceAudios\[0\]\?\.url \|\| '';/);
  assert.doesNotMatch(audio, /const audioUrl = orderedAudios\[0\]\?\.url \|\| localRefAudio \|\| '';/);
});

test('image and output nodes accept multi-image outputs', () => {
  const image = read('ImageNode.tsx');
  const output = read('OutputNode.tsx');
  const smartCardBlock = image.slice(
    image.indexOf('if (useSmartCardImageNode)'),
    image.indexOf('{smartComposerOpen && ('),
  );

  assert.match(output, /collected\.images\.map\(\(u, i\) =>/);
  assert.match(output, /图像 \(\{collected\.images\.length\}\)/);
  assert.match(image, /imageUrls:\s*urls,/);
  assert.match(smartCardBlock, /imageResultSlots\.length > 1/);
  assert.match(smartCardBlock, /t8-smart-result-surface--grid/);
});

test('image and output nodes share zoomable saveable media preview', () => {
  const shared = fs.readFileSync(path.resolve('src/components/nodes/shared/SmartMediaPreviewModal.tsx'), 'utf8');
  const image = read('ImageNode.tsx');
  const output = read('OutputNode.tsx');

  assert.match(shared, /onWheel=\{handleWheel\}/);
  assert.match(shared, /setZoom/);
  assert.doesNotMatch(shared, /import SmartImage/);
  assert.doesNotMatch(shared, /<SmartImage/);
  assert.match(shared, /<img[\s\S]*src=\{safeUrl\}/);
  assert.match(shared, /fitSize/);
  assert.match(shared, /zoomAtClientPoint/);
  assert.match(shared, /wheelZoomRef/);
  assert.match(shared, /wheelRafRef/);
  assert.match(shared, /Math\.exp\(-event\.deltaY \* 0\.002\)/);
  assert.match(shared, /imagePointX/);
  assert.match(shared, /scrollLeft = imagePointX \* nextZoom \+ nextImageOffsetX - offsetX/);
  assert.match(shared, /handlePanPointerDown/);
  assert.match(shared, /handlePanPointerMove/);
  assert.match(shared, /scrollLeft = pan.startScrollLeft - dx/);
  assert.match(shared, /<Download/);
  assert.match(shared, /<ZoomIn/);
  assert.match(shared, /<ZoomOut/);
  assert.match(shared, /t8-smart-media-preview__stage/);
  assert.match(shared, /overflow:\s*'auto'|t8-smart-media-preview__viewport/);
  const css = fs.readFileSync(path.resolve('src/styles/theme-core.css'), 'utf8');
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /t8-smart-media-preview__viewport::-webkit-scrollbar/);
  assert.match(css, /cursor:\s*grab/);
  assert.match(css, /cursor:\s*grabbing/);
  assert.match(css, /will-change:\s*width,\s*height/);
  assert.match(css, /user-select:\s*none/);

  assert.match(image, /SmartMediaPreviewModal/);
  assert.match(output, /SmartMediaPreviewModal/);
  assert.doesNotMatch(image, /t8-smart-result-preview-backdrop/);
  assert.doesNotMatch(output, /t8-output-image-preview-backdrop/);

  assert.match(image, /aria-label="下载生成图像"/);
  assert.match(image, /aria-label="保存到素材库"/);
  assert.match(image, /handleResultQuickAction\('save-resource', url\)/);
});

test('smart media cards expose shared regeneration animation state', () => {
  const image = read('ImageNode.tsx');
  const video = read('VideoNode.tsx');
  const seedance = read('SeedanceNode.tsx');
  const audio = read('AudioNode.tsx');

  for (const source of [image, video, seedance, audio]) {
    assert.match(source, /isSmartRegenerating/);
    assert.match(source, /t8-smart-node-card--regenerating/);
  }

  assert.doesNotMatch(video, /status:\s*'submitting',\s*error:\s*null,\s*videoUrl:\s*null/);
  assert.doesNotMatch(seedance, /status:\s*'submitting',\s*error:\s*null,\s*videoUrl:\s*null/);
  assert.doesNotMatch(audio, /status:\s*'submitting',\s*error:\s*null,\s*tracks:\s*\[\],\s*audioUrl:\s*undefined/);
});

test('upload smart card exposes per-item preview and delete controls', () => {
  const upload = read('UploadNode.tsx');
  const css = fs.readFileSync(path.resolve('src/styles/theme-core.css'), 'utf8');

  assert.match(upload, /t8-smart-upload-tile-actions/);
  assert.match(upload, /aria-label=\{`预览素材 \$\{i \+ 1\}`\}/);
  assert.match(upload, /aria-label=\{`删除素材 \$\{i \+ 1\}`\}/);
  assert.match(upload, /setPreviewIndex\(i\)/);
  assert.match(upload, /handleRemoveUploadItem\(i\)/);
  assert.match(css, /\.t8-smart-upload-tile-actions/);
  assert.match(css, /\.t8-smart-upload-tile:hover \.t8-smart-upload-tile-actions/);
  assert.match(css, /bottom:\s*32px/);
  assert.doesNotMatch(css, /\.t8-smart-node-card--selected \.t8-smart-upload-tile-actions/);
});

test('upload image preview uses shared zoomable media modal', () => {
  const upload = read('UploadNode.tsx');

  assert.match(upload, /SmartMediaPreviewModal/);
  assert.match(upload, /open=\{Boolean\(previewItem && previewItem\.kind === 'image'\)\}/);
  assert.match(upload, /url=\{previewItem\?\.kind === 'image' \? previewItem\.url : ''\}/);
  assert.match(upload, /onClose=\{\(\) => setPreviewIndex\(null\)\}/);
  assert.match(upload, /previewItem && previewItem\.kind !== 'image' && createPortal/);
});

test('smart video card surfaces reference thumbnails before generation', () => {
  const video = read('VideoNode.tsx');
  const smartPreviewBlock = video.slice(
    video.indexOf('<div className="t8-smart-node-preview t8-smart-video-preview">'),
    video.indexOf('<div className="t8-smart-video-badge">'),
  );
  const smartComposerBlock = video.slice(
    video.indexOf('<SmartNodeComposer'),
    video.indexOf('<div className="t8-smart-composer-row">'),
  );

  assert.match(video, /orderedReferenceVideos/);
  assert.match(video, /orderedReferenceImages/);
  assert.match(smartComposerBlock, /t8-smart-ref-strip/);
  assert.match(smartComposerBlock, /<MaterialPreviewSection/);
  assert.match(smartComposerBlock, /images=\{orderedReferenceImages\}/);
  assert.match(smartComposerBlock, /videos=\{orderedReferenceVideos\}/);
  assert.match(smartComposerBlock, /onRemoveLocal=\{handleRemoveLocalMaterial\}/);
  assert.doesNotMatch(smartComposerBlock, /t8-smart-ref-thumb/);
  assert.doesNotMatch(smartComposerBlock, /LoopingVideo src=\{primarySmartReferenceVideo\}/);
  assert.doesNotMatch(smartComposerBlock, /SmartImage src=\{primarySmartReferenceImage\}/);
  assert.doesNotMatch(smartPreviewBlock, /primarySmartReferenceVideo/);
  assert.doesNotMatch(smartPreviewBlock, /primarySmartReferenceImage/);
  assert.match(video, /源视频/);
  assert.match(video, /参考图/);
});

test('Veo Omni edit video nodes accept and show video references', () => {
  const video = read('VideoNode.tsx');

  assert.match(video, /isApishuVeoOmniEdit \? \['text', 'image', 'video'\]/);
  assert.match(video, /isApishuVeoOmniEdit \? \['image', 'video', 'text'\]/);
  assert.match(video, /collectConnectedVideoNodeMaterials/);
  assert.match(video, /\.\.\.fallbackVideoUrls/);
  assert.match(video, /payload\.video_url = videoUrls\[0\]/);
  assert.match(video, /payload\.videos = videoUrls\.slice\(0,\s*1\)/);
  assert.match(video, /veo-omni-flash-video-edit 需要 1 个源视频/);
});

test('video and seedance nodes resume persisted polling with saved protocol model', () => {
  const video = read('VideoNode.tsx');
  const seedance = read('SeedanceNode.tsx');

  for (const source of [video, seedance]) {
    assert.match(source, /protocolModel/);
    assert.match(source, /status === 'polling'/);
    assert.match(source, /startPolling\(taskId\)/);
    assert.match(source, /protocolModel: r\.effectiveModel \|\| r\.requestedModel \|\| effective/);
  }
});

test('smart video preview follows the generated video metadata aspect ratio', () => {
  const video = read('VideoNode.tsx');
  assert.match(video, /videoNaturalRatio/);
  assert.match(video, /currentTarget\.videoWidth/);
  assert.match(video, /currentTarget\.videoHeight/);
  assert.match(video, /setVideoNaturalRatio/);
  assert.match(video, /object-contain/);
});

test('video node opens the shared media preview modal at the video natural ratio', () => {
  const video = read('VideoNode.tsx');
  const shared = fs.readFileSync(path.resolve('src/components/nodes/shared/SmartMediaPreviewModal.tsx'), 'utf8');
  assert.match(video, /import SmartMediaPreviewModal/);
  assert.match(video, /<SmartMediaPreviewModal[\s\S]*kind="video"/);
  assert.match(video, /aria-label="预览视频"/);
  assert.match(shared, /kind\?: 'image' \| 'video'/);
  assert.match(shared, /kind === 'video'/);
  assert.match(shared, /videoWidth/);
  assert.match(shared, /object-contain|t8-smart-media-preview__video/);
});

test('video and SD2 cards use rotation-aware ffprobe display dimensions', () => {
  assert.deepEqual(resolveVideoDisplaySize(1232, 1648, 90), { width: 1648, height: 1232, ratio: '1648:1232' });
  const video = read('VideoNode.tsx');
  const seedance = read('SeedanceNode.tsx');
  for (const source of [video, seedance]) {
    assert.match(source, /probeVideo/);
    assert.match(source, /resolveVideoDisplaySize/);
    assert.match(source, /rotation/);
    assert.match(source, /kind="video"/);
    assert.match(source, /aria-label="预览视频"/);
  }
});

test('card mode generated media nodes own outputs without auto output nodes', () => {
  const canvas = fs.readFileSync(path.resolve('src/components/Canvas.tsx'), 'utf8');

  assert.match(canvas, /CARD_MODE_OWNS_OUTPUT_TYPES/);
  assert.match(
    canvas,
    /new Set\(\['image', 'video', 'seedance', 'audio'\]\)/,
  );
  assert.match(canvas, /CARD_MODE_OWNS_OUTPUT_TYPES\.has\(t\) && d\?\.uiVariant !== 'classic'/);
  assert.match(canvas, /target\?\.type === 'output' && target\.id\.startsWith\('output-auto-'\)/);
});

test('card mode generated media nodes still auto-save outputs to disk', () => {
  const canvas = fs.readFileSync(path.resolve('src/components/Canvas.tsx'), 'utf8');

  assert.match(canvas, /import \{ saveAssetToDisk \} from '\.\.\/services\/api';/);
  assert.match(canvas, /cardModeSavedOutputUrlsRef/);
  assert.match(canvas, /CARD_MODE_OWNS_OUTPUT_TYPES\.has\(t\) && d\?\.uiVariant !== 'classic'/);
  assert.match(canvas, /saveAssetToDisk\(url\)\.catch/);
});

test('image node shows pending result slots while batch images finish independently', () => {
  const image = read('ImageNode.tsx');
  const css = fs.readFileSync(path.resolve('src/styles/theme-core.css'), 'utf8');

  assert.match(image, /MediaTaskSlot/);
  assert.match(image, /createPendingMediaSlots/);
  assert.match(image, /markMediaSlotSuccess/);
  assert.match(image, /markMediaSlotFailed/);
  assert.match(image, /imageResultSlots:\s*createPendingMediaSlots\(expectedImageOutputCount\)/);
  assert.match(image, /setCoreImageSlotSuccess\(requestIndex,\s*syncResult\.urls\)/);
  assert.match(image, /setCoreImageSlotSuccess\(requestIndex,\s*submit\.urls\)/);
  assert.match(image, /setCoreImageSlotSuccess\(task\.requestIndex,\s*q\.urls \|\| \[\]\)/);
  assert.match(image, /setImageSlotFailed\(requestIndex,/);
  assert.match(image, /t8-smart-result-placeholder--\$\{slot\.status\}/);
  assert.match(image, /const slotErrorText = String\(slot\.error \|\| ''\)\.trim\(\)/);
  assert.match(image, /slotErrorText && <span className="t8-smart-result-placeholder-error"/);
  assert.match(image, /slotTaskText && <span className="t8-smart-result-placeholder-task"/);
  assert.match(css, /\.t8-smart-result-placeholder/);
  assert.match(css, /\.t8-smart-result-placeholder-error/);
  assert.match(css, /\.t8-smart-result-placeholder-task/);
  assert.match(css, /\.t8-smart-result-placeholder--pending/);
  assert.match(css, /\.t8-smart-result-placeholder--running/);
  assert.match(css, /\.t8-smart-result-placeholder--failed/);
  assert.match(css, /\.t8-smart-result-placeholder--cancelled/);
});

test('image node resumes persisted async image tasks and reconciles finished urls', () => {
  const image = read('ImageNode.tsx');

  assert.match(image, /const resumeImageTaskKeyRef = useRef/);
  assert.match(image, /const reconcilePersistedImageUrls = \(\) =>/);
  assert.match(image, /const resumePersistedImageTasks = async/);
  assert.match(image, /String\(d\?\.taskId \|\| ''\)\.split\(','\)/);
  assert.match(image, /await Promise\.allSettled\(activeTaskIndexes\.map/);
  assert.match(image, /queryImageStatus\(taskId,\s*effectiveApiModel\)/);
  assert.match(image, /status === 'generating' && smartImageUrls\.length > 0/);
  assert.match(image, /status === 'generating' && taskId/);
  assert.match(image, /status === 'generating' && !taskId && smartImageUrls\.length === 0/);
  assert.match(image, /上次生成已中断，请重新生成/);
});

test('NodeActionBar broadcasts cancellation to selected long-running media nodes', () => {
  const actionBar = fs.readFileSync(path.resolve('src/components/NodeActionBar.tsx'), 'utf8');
  const image = read('ImageNode.tsx');
  const video = read('VideoNode.tsx');
  const seedance = read('SeedanceNode.tsx');
  const audio = read('AudioNode.tsx');

  assert.match(actionBar, /const onStop[\s\S]*cancelNodes\(selectedExecutableNode\.selectedIds\)/);
  for (const source of [image, video, seedance, audio]) {
    assert.match(source, /useRunBusStore/);
    assert.match(source, /cancelSeq/);
    assert.match(source, /cancelTargets/);
    assert.match(source, /runCancelTargets\.includes\(id\)/);
    assert.match(source, /handleStop\(\)/);
  }
  assert.match(image, /imageRunSeqRef/);
  assert.match(image, /throwIfImageRunCancelled/);
  assert.match(image, /DOMException\('已停止生成', 'AbortError'\)/);
});

test('NodeActionBar stops every selected running node in one action', () => {
  const actionBar = fs.readFileSync(path.resolve('src/components/NodeActionBar.tsx'), 'utf8');

  assert.match(actionBar, /selectedIds:\s*string\[\]/);
  assert.match(actionBar, /const cancelNodes = useRunBusStore\(\(s\) => s\.cancelNodes\)/);
  assert.match(actionBar, /cancelNodes\(selectedExecutableNode\.selectedIds\)/);
  assert.match(actionBar, /s\.runningIds\.some\(\(runningId\) => selectedNodeIds\.includes\(runningId\)\)/);
});

test('NodeActionBar starts every selected executable node in one action', () => {
  const actionBar = fs.readFileSync(path.resolve('src/components/NodeActionBar.tsx'), 'utf8');

  assert.match(actionBar, /const triggerRunMany = useRunBusStore\(\(s\) => s\.triggerRunMany\)/);
  assert.match(actionBar, /triggerRunMany\(selectedExecutableNode\.selectedIds,\s*'batch'\)/);
});

test('NodeActionBar releases button focus after mouse actions to prevent Enter retriggers', () => {
  const actionBar = fs.readFileSync(path.resolve('src/components/NodeActionBar.tsx'), 'utf8');
  const runBlock = actionBar.slice(actionBar.indexOf('const onRun ='), actionBar.indexOf('const onStop ='));
  const stopBlock = actionBar.slice(actionBar.indexOf('const onStop ='), actionBar.indexOf('const onClose ='));
  const closeBlock = actionBar.slice(actionBar.indexOf('const onClose ='), actionBar.indexOf('const runColor'));

  assert.match(runBlock, /e\.currentTarget\.blur\(\)/);
  assert.match(stopBlock, /e\.currentTarget\.blur\(\)/);
  assert.match(closeBlock, /e\.currentTarget\.blur\(\)/);
  assert.match(actionBar, /const blockEnterActivation/);
  assert.match(actionBar, /if \(event\.key === 'Enter'\) event\.preventDefault\(\)/);
  assert.equal((actionBar.match(/onKeyDown=\{blockEnterActivation\}/g) || []).length, 3);
});

test('image prompt Enter is reserved for line breaks instead of generation', () => {
  const image = read('ImageNode.tsx');
  const smartComposerBlock = image.slice(
    image.indexOf('<SmartNodeComposer'),
    image.indexOf('</SmartNodeComposer>') + '</SmartNodeComposer>'.length,
  );

  assert.doesNotMatch(smartComposerBlock, /onSubmit=/);
});
