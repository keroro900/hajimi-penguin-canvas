import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

  assert.match(composer, /createPortal/);
  assert.match(composer, /portal\?: boolean/);
  assert.match(composer, /anchorRef\?: RefObject<HTMLElement>/);
  assert.match(composer, /document\.body/);
  assert.match(image, /<SmartNodeComposer[\s\S]*portal[\s\S]*anchorRef=\{smartNodeRef\}/);
  assert.match(css, /\.t8-smart-node-composer--portal/);
  assert.match(css, /z-index:\s*10080/);
  assert.match(css, /position:\s*fixed/);
});

test('smart card parameter composers use top-level portals for media and provider nodes', () => {
  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx', 'AudioNode.tsx', 'RunningHubNode.tsx', 'RHToolboxNode.tsx', 'FalToolboxNode.tsx']) {
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

  for (const file of ['ImageNode.tsx', 'VideoNode.tsx', 'SeedanceNode.tsx', 'AudioNode.tsx', 'LLMNode.tsx', 'RunningHubNode.tsx', 'RHToolboxNode.tsx', 'FalToolboxNode.tsx']) {
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
    assert.match(source, /protocolModel: r\.protocol \|\| r\.effectiveModel \|\| r\.requestedModel/);
  }
});

test('card mode generated media nodes own outputs without auto output nodes', () => {
  const canvas = fs.readFileSync(path.resolve('src/components/Canvas.tsx'), 'utf8');

  assert.match(canvas, /CARD_MODE_OWNS_OUTPUT_TYPES/);
  assert.match(
    canvas,
    /new Set\(\['image', 'video', 'seedance', 'audio', 'runninghub', 'runninghub-wallet', 'rh-toolbox', 'fal-toolbox'\]\)/,
  );
  assert.match(canvas, /CARD_MODE_OWNS_OUTPUT_TYPES\.has\(t\) && d\?\.uiVariant !== 'classic'/);
  assert.match(canvas, /target\?\.type === 'output' && target\.id\.startsWith\('output-auto-'\)/);
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
  assert.match(css, /\.t8-smart-result-placeholder/);
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
});

test('NodeActionBar stop broadcast cancels long-running media nodes', () => {
  const actionBar = fs.readFileSync(path.resolve('src/components/NodeActionBar.tsx'), 'utf8');
  const image = read('ImageNode.tsx');
  const video = read('VideoNode.tsx');
  const seedance = read('SeedanceNode.tsx');
  const audio = read('AudioNode.tsx');

  assert.match(actionBar, /const onStop[\s\S]*cancelAll\(\[selectedExe\.id\]\)/);
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
