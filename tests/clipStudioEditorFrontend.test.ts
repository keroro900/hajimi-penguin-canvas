import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/nodes/ClipStudioEditor.tsx', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');
const lutPresets = readFileSync(new URL('../src/utils/lutPresets.ts', import.meta.url), 'utf8');

test('clip studio preview player hides browser native controls and uses editor transport controls', () => {
  const previewVideoTags = source.match(/<video[^>]*ref=\{previewVideoRef\}[^>]*>/g) || [];
  assert.ok(previewVideoTags.length >= 1);
  assert.equal(previewVideoTags.every((tag) => !/\scontrols(\s|>|=)/.test(tag)), true);
  assert.match(source, /title="拖动播放器进度"/);
  assert.match(source, /onChange=\{\(event\) => seekPlayhead\(Number\(event\.target\.value\)\)\}/);
});

test('clip studio timeline exposes a prominent draggable playhead and frame ticks', () => {
  assert.match(source, /data-clip-playhead-handle/);
  assert.match(source, /title="拖动时间线播放头"/);
  assert.match(source, /data-clip-ruler-tick/);
  assert.match(source, /computeClipTimelineRulerTicks/);
});

test('clip studio timeline keeps playhead time out of the thumbnail strip', () => {
  assert.match(source, /data-clip-playhead-time-badge/);
  assert.doesNotMatch(source, /data-clip-playhead-handle[\s\S]{0,900}formatSeconds\(playheadTime,\s*fps\)/);
  assert.doesNotMatch(source, /absolute bottom-4 right-4[\s\S]{0,220}t8-clip-export-summary/);
});

test('clip studio portal participates in global app theme css variables', () => {
  assert.match(source, /t8-clip-studio-editor/);
  assert.match(source, /t8-app-shell/);
  assert.match(source, /var\(--t8-bg-app/);
  assert.match(source, /var\(--t8-text-main/);
  assert.match(source, /t8-clip-panel/);
  assert.match(source, /t8-clip-ruler/);
  assert.match(source, /t8-clip-playhead-line/);
  assert.match(globalCss, /\.t8-clip-studio-editor/);
  assert.match(globalCss, /--t8-clip-panel:\s*color-mix\(in srgb,\s*var\(--t8-bg-panel/);
  assert.match(globalCss, /\.t8-clip-playhead-time-badge/);
  assert.match(globalCss, /\.t8-clip-timeline-scroll/);
});

test('clip studio exposes RunningHub-style material source shelves', () => {
  for (const label of ['导入', '画布素材', '历史记录', '我的资产']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /MediaSource = 'import' \| 'canvas' \| 'history' \| 'assets'/);
  assert.match(source, /t8-clip-media-card/);
  assert.match(source, /t8-clip-media-chip/);
  assert.match(source, /t8-clip-media-empty/);
  assert.match(globalCss, /\.t8-clip-media-card/);
  assert.match(globalCss, /\.t8-clip-compact-chip\.is-active/);
});

test('clip studio left material library scrolls when canvas assets overflow', () => {
  assert.match(source, /data-clip-media-pane/);
  assert.match(source, /data-clip-media-library-scroll/);
  assert.match(source, /data-clip-media-grid/);
  assert.match(source, /className="t8-clip-media-library-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1"/);
  assert.match(source, /className="grid auto-rows-\[96px\] grid-cols-2 gap-1\.5"/);
  assert.match(globalCss, /\.t8-clip-media-library-scroll/);
  assert.match(globalCss, /\.t8-clip-media-library-scroll\s*\{[\s\S]{0,160}scrollbar-gutter:\s*stable/);
});

test('clip studio moves color LUT and motion editing into left editing pages', () => {
  assert.match(source, /type MediaTab = 'media' \| 'sound' \| 'text' \| 'color' \| 'motion' \| 'settings'/);
  assert.match(source, /\['color', SlidersHorizontal, '调色'\]/);
  assert.match(source, /\['motion', Film, '动效'\]/);
  assert.match(source, /data-clip-left-color-editor/);
  assert.match(source, /data-clip-left-motion-editor/);
  assert.match(source, /renderSelectedVisualColorPanel\('left'\)/);
  assert.match(source, /renderSelectedVisualMotionPanel\('left'\)/);
  assert.match(source, /data-clip-open-color-page/);
  assert.match(source, /data-clip-open-motion-page/);
  assert.doesNotMatch(source, /renderVisualParamSectionNav/);
});

test('clip studio exposes AI generation clips by reusing existing generation services and model registry', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  const adapterSource = readFileSync(new URL('../src/utils/clipGenerationAdapters.ts', import.meta.url), 'utf8');
  assert.match(source, /onCreateGenerationClip/);
  assert.match(source, /onRunGenerationClip/);
  assert.match(source, /data-clip-generation-panel/);
  assert.match(source, /from '\.\.\/\.\.\/utils\/clipGenerationAdapters'/);
  assert.match(source, /renderClipGenerationControl/);
  assert.match(source, /selectedGenerationControls\.map/);
  assert.match(source, /apiModelOptions/);
  assert.match(source, /视频生成/);
  assert.match(source, /图像生成/);
  assert.match(source, /引用素材/);
  assert.match(source, /运行/);
  assert.match(source, /data-clip-generation-status/);
  assert.match(source, /generationStatusLabel/);
  assert.match(globalCss, /\.t8-clip-visual\.is-generation/);
  assert.match(globalCss, /@keyframes t8-clip-generation-scan/);
  assert.match(nodeSource, /from '\.\.\/\.\.\/services\/generation'/);
  assert.match(nodeSource, /submitSeedance/);
  assert.match(nodeSource, /querySeedance/);
  assert.match(nodeSource, /submitVideo/);
  assert.match(nodeSource, /queryVideo/);
  assert.match(nodeSource, /submitVideoFal/);
  assert.match(nodeSource, /queryVideoFal/);
  assert.match(nodeSource, /generateImage/);
  assert.match(nodeSource, /from '\.\.\/\.\.\/utils\/clipGenerationAdapters'/);
  assert.match(adapterSource, /IMAGE_MODELS/);
  assert.match(adapterSource, /VIDEO_MODELS/);
  assert.match(adapterSource, /sidebarParameterGroups/);
  assert.match(adapterSource, /VIDEO_FAL_REGISTRY/);
  assert.match(adapterSource, /FAL_REGISTRY/);
  assert.match(nodeSource, /useApiKeysStore/);
  assert.match(nodeSource, /zhenzhenImageModelOverrides/);
  assert.match(nodeSource, /zhenzhenVideoModelOverrides/);
  assert.match(adapterSource, /withUpstreamModelOption/);
  assert.match(adapterSource, /resolveSeedanceVideoOverride/);
  assert.doesNotMatch(nodeSource, /fetch\('\/api\/proxy\/seedance\/submit'/);
  assert.doesNotMatch(nodeSource, /fetch\('\/api\/proxy\/image'/);
  assert.doesNotMatch(nodeSource, /doubao-seedance-2-0-260128'/);
  assert.doesNotMatch(nodeSource, /视频生成 - 玄上之音|图像生成 - Comfy/);
});

test('clip studio generation track uses canvas node model groups and compact shared controls', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  const adapterSource = readFileSync(new URL('../src/utils/clipGenerationAdapters.ts', import.meta.url), 'utf8');
  assert.match(adapterSource, /export function resolveClipVideoGenerationChoice/);
  assert.match(adapterSource, /modelDef\.sidebarParameterGroups/);
  assert.match(adapterSource, /mainId/);
  assert.match(adapterSource, /apiModel/);
  assert.match(source, /selectedGenerationModelGroups\.map/);
  assert.match(source, /onChange=\{\(event\) => applyClipGenerationModelGroup/);
  assert.match(source, /onChange=\{\(event\) => applyClipGenerationApiModel/);
  assert.match(source, /data-clip-generation-control/);
  assert.match(source, /showWhenApiModel/);
  assert.doesNotMatch(source, /selectedGeneration\.nodeType === 'image' \? \(\s*<>[\s\S]{0,2600}selectedGeneration\.nodeType === 'image'/);
  assert.match(nodeSource, /resolveClipVideoGenerationChoice/);
  assert.match(nodeSource, /buildClipVideoGenerationRequest/);
  assert.match(nodeSource, /buildClipImageGenerationRequest/);
});

test('clip studio draft parameter pane reuses the selected generation model controls', () => {
  assert.match(source, /selectedVisualGenerationChoice/);
  assert.match(source, /selectedVisualGenerationParams/);
  assert.match(source, /selectedVisualGenerationControls/);
  assert.match(source, /normalizeClipGenerationParams\(selectedVisualGenerationChoice,\s*selectedVisualGeneration\?\.params\)/);
  assert.match(source, /visibleClipGenerationControls\(selectedVisualGenerationChoice\.sidebarParameterGroups,\s*selectedVisualGenerationChoice\.apiModel\)/);
  assert.match(source, /renderClipGenerationControl\(selectedVisualGenerationChoice,\s*selectedVisualGenerationControls,\s*selectedVisualGenerationParams,\s*selectedVisual\.id \|\| ''/);
  assert.match(source, /applySelectedVisualGenerationModelGroup/);
  assert.match(source, /applySelectedVisualGenerationApiModel/);
  assert.doesNotMatch(source, /selectedVisual\.generation\.params\.aspect_ratio/);
  assert.doesNotMatch(source, /selectedVisual\.generation\.params\.image_size/);
  assert.doesNotMatch(source, /selectedVisual\.generation\.params\.ratio/);
  assert.doesNotMatch(source, /selectedVisual\.generation\.params\.generate_audio/);
});

test('clip studio generation drafts expose the same LUT controls as normal visual clips', () => {
  assert.match(source, /renderSelectedVisualColorPanel/);
  assert.match(source, /data-clip-visual-color-panel/);
  assert.match(source, /tab === 'color'[\s\S]{0,220}selectedVisual \? renderSelectedVisualColorPanel\('left'\)/);
  assert.match(source, /selectedKind === 'visual' && selectedVisual\?\.generation[\s\S]*data-clip-open-color-page/);
  assert.match(source, /视频 LUT/);
  assert.match(source, /LUT_PRESETS\.map/);
  assert.match(source, /lutAmount/);
});

test('clip studio generation refs reuse canvas material preview and typed uploads', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  const adapterSource = readFileSync(new URL('../src/utils/clipGenerationAdapters.ts', import.meta.url), 'utf8');
  const materialPreviewSource = readFileSync(new URL('../src/components/nodes/MaterialPreviewSection.tsx', import.meta.url), 'utf8');
  assert.match(adapterSource, /export function clipGenerationReferenceSupport/);
  assert.match(adapterSource, /SEEDANCE_REFERENCE_LIMITS/);
  assert.match(adapterSource, /groups: \['image', 'video', 'audio'\]/);
  assert.match(source, /import MaterialPreviewSection from '\.\/MaterialPreviewSection'/);
  assert.match(source, /data-clip-generation-ref-input/);
  assert.match(source, /accept=\{selectedGenerationReferenceAccept\}/);
  assert.match(source, /onUploadGenerationRefs\(selectedGenerationVisual\.id \|\| '',\s*event\.currentTarget\.files/);
  assert.match(source, /generationRefMaterialsByKind/);
  assert.match(source, /MaterialPreviewSection[\s\S]{0,900}dataRole="clip-generation-refs"/);
  assert.match(source, /uploadActions=\{selectedGenerationUploadActions\}/);
  assert.match(source, /groups=\{selectedGenerationReferenceSupport\.groups\}/);
  assert.match(materialPreviewSource, /uploadActions\?: Partial<Record<'image' \| 'video' \| 'audio', UploadAction>>/);
  assert.match(materialPreviewSource, /const uploadActionForGroup = \(group: 'text' \| 'image' \| 'video' \| 'audio'\) =>/);
  assert.match(materialPreviewSource, /uploadActions\?\.\[group as 'image' \| 'video' \| 'audio'\]/);
  assert.match(nodeSource, /const uploadGenerationRefs = useCallback/);
  assert.match(nodeSource, /uploadClipAsset\(file\)/);
  assert.match(nodeSource, /source: 'upload'/);
  assert.match(nodeSource, /role: inferred === 'audio' \? 'audio' : 'reference'/);
});

test('clip studio generation refs are capped by the selected canvas model capability', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  const adapterSource = readFileSync(new URL('../src/utils/clipGenerationAdapters.ts', import.meta.url), 'utf8');
  assert.match(adapterSource, /maxImages: choice\.modelDef\.supportsReference \? choice\.modelDef\.maxReferenceImages : 0/);
  assert.match(adapterSource, /maxImages: choice\.modelDef\.supportImages \? choice\.modelDef\.maxRefImages : 0/);
  assert.match(adapterSource, /choice\.modelDef\.kind === 'seedance'/);
  assert.match(adapterSource, /maxVideos: SEEDANCE_REFERENCE_LIMITS\.videos/);
  assert.match(adapterSource, /maxAudios: SEEDANCE_REFERENCE_LIMITS\.audios/);
  assert.match(source, /clipGenerationReferenceSupport\(selectedGenerationChoice\)/);
  assert.match(source, /clipGenerationRefLimitForKind\(selectedGenerationReferenceSupport,\s*material\.kind\)/);
  assert.match(source, /refs\.filter\(\(ref\) => ref\.kind === material\.kind\)\.length >= limit/);
  assert.match(nodeSource, /clipGenerationRefsForRequest\(generation\.refs \|\| \[\],\s*choice\)/);
  assert.match(nodeSource, /imageRefs,\s*videoRefs,\s*audioRefs/);
});

test('clip studio opens generation settings only from clicked unfinished generation clips', () => {
  assert.match(source, /const \[generationPanelClipId,\s*setGenerationPanelClipId\] = useState\(''\)/);
  assert.match(source, /from '\.\/shared\/useOutsideClose'/);
  assert.match(source, /const generationPanelRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /useOutsideClose\(\{\s*enabled: Boolean\(open && generationPanelClipId\)/);
  assert.match(source, /onOutside: \(\) => setGenerationPanelClipId\(''\)/);
  assert.match(source, /ignoreSelector: 'input, textarea, select, \[contenteditable="true"\]'/);
  assert.match(source, /ref=\{generationPanelRef\}/);
  assert.match(source, /timelineVisuals\.find\(\(item\) => item\.id === generationPanelClipId && item\.generation && item\.generation\.status !== 'success'\)/);
  assert.match(source, /if \(!panelVisual\?\.generation \|\| panelVisual\.generation\.status === 'success'\) \{\s*setGenerationPanelClipId\(''\);/);
  assert.doesNotMatch(source, /onClick=\{\(event\) => \{[\s\S]{0,260}if \(item\.generation && item\.generation\.status !== 'success'\) \{\s*setGenerationPanelClipId\(item\.id \|\| ''\);/);
  assert.match(source, /data-clip-generation-inline-settings[\s\S]{0,420}setGenerationPanelClipId\(item\.id \|\| ''\)/);
  assert.doesNotMatch(source, /else \{\s*setGenerationPanelClipId\(''\);/);
  assert.doesNotMatch(source, /const selectedGenerationVisual = selectedTimelineVisual/);
});

test('clip studio generation popover avoids covering the active track and viewport edges', () => {
  assert.match(source, /const \[timelineScrollVersion,\s*setTimelineScrollVersion\] = useState\(0\)/);
  assert.match(source, /onTimelineScroll/);
  assert.match(source, /generationPanelSpaceBelow/);
  assert.match(source, /generationPanelSpaceAbove/);
  assert.match(source, /generationPanelShouldOpenUp/);
  assert.match(source, /data-clip-generation-panel-direction=\{generationPanelDirection\}/);
  assert.match(source, /data-clip-generation-panel-mode="quick"/);
  assert.match(source, /className="t8-clip-modal t8-clip-generation-popover/);
  assert.match(source, /generationPanelDirection === 'up' \? -8 : 8/);
});

test('clip studio anchors generation settings beneath the selected timeline track', () => {
  assert.match(source, /const selectedGenerationTimelineItem = timelineLayout\.items\.find\(\(item\) => item\.id === selectedGenerationVisual\?\.id\)/);
  assert.match(source, /const generationPanelAnchorLaneIndex = visibleVisualLanes\.indexOf/);
  assert.match(source, /const generationPanelAnchorStyle: CSSProperties \| undefined/);
  assert.match(source, /data-clip-generation-panel-anchor="track"/);
  assert.match(source, /style=\{generationPanelAnchorStyle\}/);
  assert.match(source, /selectedGenerationVisual\?\.id && selectedGeneration && generationPanelAnchorStyle/);
  assert.doesNotMatch(source, /left-1\/2 top-\[42%\]/);
});

test('clip studio generation settings panel stays compact on the timeline', () => {
  assert.match(source, /const generationPanelWidth = Math\.min\(360,\s*Math\.max\(280/);
  assert.match(source, /data-clip-generation-panel-mode="quick"/);
  assert.match(source, /const generationPanelDirection = generationPanelShouldOpenUp \? 'up' : 'down'/);
  assert.match(source, /data-clip-generation-panel-direction=\{generationPanelDirection\}/);
  assert.match(source, /className="t8-clip-modal t8-clip-generation-popover absolute z-50 rounded-md border p-2/);
  assert.match(source, /data-clip-generation-prompt/);
  assert.match(source, /min-h-14 resize-y/);
  assert.match(source, /data-clip-generation-refs/);
  assert.match(source, /max-h-12/);
  assert.match(source, /grid-cols-2 gap-1\.5 text-\[10px\] lg:grid-cols-3/);
  assert.doesNotMatch(source, /generationPanelWidth = Math\.min\(760/);
  assert.doesNotMatch(source, /generationPanelWidth = Math\.min\(560/);
  assert.doesNotMatch(source, /generationPanelWidth = Math\.min\(440/);
  assert.doesNotMatch(source, /h-28 resize-none p-3/);
  assert.doesNotMatch(source, /min-h-12 flex-wrap gap-1\.5/);
  assert.doesNotMatch(source, /overflow:\s*'auto'/);
  assert.doesNotMatch(source, /maxHeight:\s*Math\.max\(180,\s*Math\.min\(300/);
});

test('clip studio visual actions require explicit selection and generation starts on the first visual track', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /const selectedTimelineVisual = timelineVisuals\.find\(\(item\) => item\.id === selectedId\)/);
  assert.match(source, /const selectedVisual = selectedTimelineVisual;/);
  assert.match(source, /const previewFallbackVisual = timelineVisuals\.find\(\(item\) => !item\.disabled\) \|\| timelineVisuals\[0\]/);
  assert.match(source, /selectedTimelineVisual \? 'visual' : 'none'/);
  assert.match(source, /selectedTimelineVisual\?\.id === item\.id \? 'is-selected/);
  assert.doesNotMatch(source, /setSelectedId\(selectedVisual\.id \|\| ''\);/);
  assert.doesNotMatch(source, /const selectedVisual = selectedTimelineVisual \|\|/);
  assert.match(source, /onCreateGenerationClip\('image',\s*\{ start: playheadTime,\s*lane: selectedTimelineVisual \? Math\.max/);
  assert.match(source, /onCreateGenerationClip\('video',\s*\{ start: playheadTime,\s*lane: selectedTimelineVisual \? Math\.max/);
  assert.match(source, /selectedTimelineVisual \? Math\.max\(0,\s*Math\.round\(Number\(selectedTimelineVisual\.lane \|\| 0\)\)\) : 0/);
  assert.match(nodeSource, /avoidOverlap:\s*false/);
});

test('clip studio keeps clicked timeline clip selected for delete even when tracks overlap', () => {
  assert.match(source, /const seekPlayhead = \(nextTime: number,\s*options: \{ selectPlayback\?: boolean \} = \{\}\) =>/);
  assert.match(source, /if \(options\.selectPlayback !== false && nextState\?\.item\.id\) setSelectedId\(nextState\.item\.id\)/);
  assert.match(source, /seekPlayhead\(item\.start,\s*\{ selectPlayback: false \}\);\s*setSelectedId\(item\.id \|\| ''\);/);
  assert.doesNotMatch(source, /if \(item\.generation && item\.generation\.status !== 'success'\) \{\s*setGenerationPanelClipId\(item\.id \|\| ''\);/);
  assert.match(source, /data-clip-generation-inline-settings[\s\S]{0,420}setGenerationPanelClipId\(item\.id \|\| ''\)/);
  assert.match(source, /removeSelectedClip\(\)/);
  assert.doesNotMatch(source, /setSelectedId\(item\.id \|\| ''\);\s*if \(item\.generation[\s\S]{0,180}seekPlayhead\(item\.start\);/);
});

test('clip studio generation prompt is stable for Chinese IME composition', () => {
  assert.match(source, /const \[generationPromptDraft,\s*setGenerationPromptDraft\] = useState\(''\)/);
  assert.match(source, /const \[generationPromptComposing,\s*setGenerationPromptComposing\] = useState\(false\)/);
  assert.match(source, /if \(generationPromptComposing\) return;/);
  assert.match(source, /onCompositionStart=\{\(\) => setGenerationPromptComposing\(true\)\}/);
  assert.match(source, /onCompositionEnd=\{\(event\) => \{/);
  assert.match(source, /commitGenerationPromptDraft\(event\.currentTarget\.value\)/);
  assert.match(source, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test('clip studio finalizes generated clips into normal timeline materials', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(nodeSource, /const shouldFinalize = patchValue\.status === 'success'/);
  assert.match(nodeSource, /generation:\s*shouldFinalize \? undefined :/);
  assert.match(nodeSource, /label:\s*shouldFinalize \? fileNameFromUrl/);
  assert.match(nodeSource, /updateGenerationClip\(visualId,\s*\{ status: 'success', outputUrl, error: '' \},\s*\{ url: outputUrl, kind: 'image' \}\)/);
  assert.match(nodeSource, /updateGenerationClip\(visualId,\s*\{ status: 'success', outputUrl, error: '' \},\s*\{ url: outputUrl, kind: 'video' \}\)/);
});

test('clip studio inserts timeline material and generation clips from the playhead or drop point', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /onCreateGenerationClip\('image',\s*\{ start: playheadTime/);
  assert.match(source, /onCreateGenerationClip\('video',\s*\{ start: playheadTime/);
  assert.match(source, /draggable=\{Boolean\(item\.url\)\}/);
  assert.match(source, /const dropStart = Math\.max\(0,\s*\(event\.clientX - rect\.left\) \/ pixelsPerSecond\)/);
  assert.match(source, /const dropLane = resolveVisualLaneFromClientY\(event\.clientY\)/);
  assert.match(source, /onImportMaterial\(\{[\s\S]{0,520}\},\s*\{ start: dropStart,\s*lane: dropLane \}\)/);
  assert.doesNotMatch(source, /if \(!material \|\| material\.origin === 'import'\) return/);
  assert.match(nodeSource, /resolveClipTimelineInsertTiming/);
  assert.match(nodeSource, /avoidOverlap:\s*true/);
});

test('clip studio speed changes resize video timeline duration from source span', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(nodeSource, /const speedPatchProvided = patchValue\.speed != null/);
  assert.match(nodeSource, /const currentSpeed = Number\(currentVisual\?\.speed \|\| 1\)/);
  assert.match(nodeSource, /const sourceSpan = Math\.max\(0\.25,\s*Number\(currentVisual\?\.duration \|\| imageDuration\) \* currentSpeed\)/);
  assert.match(nodeSource, /const nextDuration = speedPatchProvided[\s\S]{0,180}sourceSpan \/ nextSpeed/);
  assert.match(nodeSource, /clipVisualDurations:\s*speedPatchProvided[\s\S]{0,220}\[visualId\]: nextDuration/);
});


test('clip studio sound and text tabs expose editable clip entry points', () => {
  assert.match(source, /SoundSource = 'canvas-audio' \| 'upload'/);
  assert.match(source, /画布音频/);
  assert.match(source, /上传音效/);
  assert.match(source, /新建文本/);
  assert.match(source, /默认文本/);
  assert.match(source, /onCreateTextClip/);
  assert.match(source, /onUpdateAudioTiming/);
  assert.match(source, /onUpdateTextTiming/);
});

test('clip studio settings and parameter panel cover fps and type-aware controls', () => {
  assert.match(source, /clipFps/);
  assert.match(source, /快速成片模板/);
  assert.match(source, /QUICK_CLIP_TEMPLATES\.map/);
  assert.match(source, /onApplyQuickTemplate\(template\.id\)/);
  assert.match(source, /平台预设/);
  assert.match(source, /抖音竖版/);
  assert.match(source, /小红书/);
  assert.match(source, /电影宽屏/);
  assert.match(source, /帧率/);
  assert.match(source, /混合模式/);
  assert.match(source, /音量/);
  assert.match(source, /淡入/);
  assert.match(source, /字号/);
  assert.match(source, /文字颜色/);
});

test('clip studio surfaces export preflight inspection before rendering', () => {
  assert.match(source, /inspectClipProjectBeforeExport/);
  assert.match(source, /exportInspection/);
  assert.match(source, /导出检查/);
  assert.match(source, /检查通过/);
  assert.match(source, /导出检查有需要注意的项目/);
});

test('clip studio node persists cover metadata with the export result', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(nodeSource, /createQuickClipTemplatePatch/);
  assert.match(nodeSource, /createQuickClipCleanupPatch/);
  assert.match(nodeSource, /applyQuickTemplate/);
  assert.match(nodeSource, /cleanupTimelineMedia/);
  assert.match(nodeSource, /renderClipProject\(project,\s*\{/);
  assert.match(nodeSource, /mode:\s*coverSource === 'local' && coverUrl \? 'local' : 'frame'/);
  assert.match(nodeSource, /const nextCoverUrl = result\.coverUrl \|\| \(coverSource === 'local' \? coverUrl : ''\) \|\| ''/);
  assert.match(nodeSource, /coverUrl:\s*nextCoverUrl/);
  assert.match(nodeSource, /coverTime/);
  assert.match(nodeSource, /imageUrls:\s*nextCoverUrl \? \[nextCoverUrl\] : \[\]/);
  assert.match(nodeSource, /封面已随本次导出保存/);
});

test('clip studio frame cover avoids saving video urls as image covers', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /const frameCoverPreviewUrl = selectedVisual\?\.kind === 'video' \? selectedVisual\.url : selectedVisual\?\.kind === 'image' \? selectedVisual\.url : ''/);
  assert.match(source, /const frameCoverSaveUrl = selectedVisual\?\.kind === 'image' \? selectedVisual\.url : ''/);
  assert.match(source, /clipCoverUrl:\s*coverTab === 'local' \? currentCoverPreview : frameCoverSaveUrl/);
  assert.match(source, /localTime=\{Math\.max\(0,\s*coverDraftTime - \(selectedLayoutItem\?\.start \|\| 0\)\)\}/);
  assert.match(source, /data-clip-frame-cover-pending/);
  assert.match(nodeSource, /const displayCoverUrl = coverSource === 'frame' && !isLikelyImageUrl\(coverUrl\) \? '' : coverUrl/);
  assert.match(nodeSource, /clipCoverUrl:\s*nextCoverUrl/);
});

test('clip studio can persist probed audio durations and save exports to resource library', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(nodeSource, /mergeProbedClipAudioDurations/);
  assert.match(nodeSource, /clipAudioEdits:\s*mergedAudioDurations\.items/);
  assert.match(nodeSource, /saveRenderToResourceLibrary/);
  assert.match(nodeSource, /addResourceItem\(\{\s*kind:\s*'video'/);
  assert.match(nodeSource, /保存成片到资源库/);
  assert.match(nodeSource, /window\.dispatchEvent\(new CustomEvent\('penguin:resources-changed'\)\)/);
});

test('clip studio preview overlays active text clips on the player', () => {
  assert.match(source, /activePreviewTextClips/);
  assert.match(source, /t8-clip-preview-text-overlay/);
  assert.match(source, /playheadTime >= start && playheadTime <= start \+ itemDuration/);
});

test('clip studio does not preview hidden visual clips after toggling visibility off', () => {
  assert.match(source, /const selectedVisibleVisual = selectedVisual && !selectedVisual\.disabled \? selectedVisual : undefined/);
  assert.match(source, /const previewIdleVisual = selectedVisibleVisual \|\| previewFallbackVisual/);
  assert.match(source, /const playbackVisibleState = playbackState\?\.item && !playbackState\.item\.disabled \? playbackState : undefined/);
  assert.match(source, /const hasVisiblePreviewMedia = Boolean\(previewVisual\?\.url\)/);
  assert.match(source, /playbackVisibleState\?\.item \|\| \(playing \? undefined : previewIdleVisual\)/);
  assert.match(source, /className=\{`relative h-full w-full \$\{hasVisiblePreviewMedia \? 'outline outline-1 outline-dashed outline-white\/80' : ''\}`\}/);
  assert.doesNotMatch(source, /playbackState\?\.item \|\| \(playing \? undefined : selectedVisual\)/);
  assert.doesNotMatch(source, /const previewVisual = outputUrl \? selectedVisibleVisual/);
  assert.doesNotMatch(source, /src=\{outputUrl\}[\s\S]{0,220}ref=\{previewVideoRef\}/);
});

test('clip studio draft parameter pane uses themed global css classes', () => {
  assert.match(source, /t8-clip-param-pane space-y-3 overflow-auto/);
  assert.match(source, /t8-clip-param-card/);
  assert.match(source, /t8-clip-param-label/);
  assert.match(source, /t8-clip-param-preview/);
  assert.match(source, /t8-clip-param-range/);
  assert.match(source, /t8-clip-param-action/);
  assert.match(source, /t8-clip-param-empty/);
  assert.match(globalCss, /\.t8-clip-param-pane/);
  assert.match(globalCss, /\.t8-clip-param-card/);
  assert.match(globalCss, /\.t8-clip-param-preview/);
  assert.match(globalCss, /\.t8-clip-param-action/);
  assert.doesNotMatch(source, /草稿参数[\s\S]{0,3600}border-\[#333\] bg-\[#202020\]/);
});

test('clip studio export result explains destination and offers save-as download', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(nodeSource, /downloadRenderToFile/);
  assert.match(nodeSource, /showSaveFilePicker/);
  assert.match(nodeSource, /另存为/);
  assert.match(nodeSource, /服务器临时输出链接/);
  assert.match(nodeSource, /默认会进入浏览器下载目录，或用“另存为”指定位置。/);
  assert.match(nodeSource, /download={`t8-clip-\$\{Date\.now\(\)\}\.mp4`}/);
});

test('clip studio timeline tools operate on selected audio and text clips', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /onRemoveAudio/);
  assert.match(source, /onDuplicateAudio/);
  assert.match(source, /onSplitAudioAtTime/);
  assert.match(source, /onRemoveText/);
  assert.match(source, /onDuplicateText/);
  assert.match(source, /onSplitTextAtTime/);
  assert.match(source, /splitSelectedAtPlayhead/);
  assert.match(source, /duplicateSelectedClip/);
  assert.match(source, /一键整理时间线/);
  assert.match(source, /一键整理音频和字幕/);
  assert.match(source, /onCompactTimeline/);
  assert.match(source, /onCleanupTimelineMedia/);
  assert.match(source, /removeSelectedClip/);
  assert.match(source, /删除所选片段/);
  assert.match(source, /linkMode[\s\S]{0,160}onSplitLinkedAtTime\(selectedVisualId,\s*playheadTime\)/);
  assert.match(nodeSource, /splitLinkedClipTimelineAtTime/);
  assert.match(nodeSource, /clipAudioEdits:\s*next\.audios \|\| \[\]/);
  assert.match(nodeSource, /clipTextEdits:\s*next\.texts \|\| \[\]/);
});

test('clip studio trim drags preserve source offsets for media clips', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /trimStart:\s*Number\(item\.trimStart \|\| 0\)/);
  assert.match(source, /current\.trimStart \+ \(next\.trimStartDelta \|\| 0\)/);
  assert.match(source, /onUpdateAudioTiming\(current\.id,\s*next\.start,\s*next\.duration,\s*trimStart\)/);
  assert.match(source, /onUpdateVisualTiming\(current\.id,\s*next\.start,\s*next\.duration,\s*trimStart\)/);
  assert.match(nodeSource, /updateAudioTiming = useCallback\(\(clipId: string,\s*start: number,\s*duration: number,\s*trimStart\?: number\)/);
  assert.match(nodeSource, /return \{ \.\.\.item,\s*trimStart:/);
});

test('clip studio text clips expose position controls and preview positioning', () => {
  assert.match(source, /文本位置/);
  assert.match(source, /onUpdateTextSettings\(selectedTextId,\s*\{\s*x:/);
  assert.match(source, /onUpdateTextSettings\(selectedTextId,\s*\{\s*y:/);
  assert.match(source, /left:\s*`\$\{Number\(item\.x/);
  assert.match(source, /top:\s*`\$\{Number\(item\.y/);
});

test('clip studio visual clips expose filter controls and preview filter styling', () => {
  assert.match(source, /视觉滤镜/);
  assert.match(source, /调色预设/);
  assert.match(source, /青橙电影/);
  assert.match(source, /日系清新/);
  assert.match(source, /开源滤镜/);
  assert.match(source, /CSSgram/);
  assert.match(source, /视频效果/);
  assert.match(source, /FFmpeg/);
  assert.match(source, /扫描线/);
  assert.match(source, /素描/);
  assert.match(source, /清透明亮/);
  assert.match(source, /VHS 录像带/);
  assert.match(source, /变速/);
  assert.match(source, /转场/);
  assert.match(source, /淡入淡出/);
  assert.match(source, /到下一片段/);
  assert.match(source, /叠化/);
  assert.match(source, /画面适配/);
  assert.match(source, /适应画布/);
  assert.match(source, /填充裁剪/);
  assert.match(source, /拉伸填满/);
  assert.match(source, /playbackRate/);
  assert.match(source, /重置滤镜/);
  assert.match(source, /CLIP_FILTER_GROUPS\.map/);
  assert.match(source, /CLIP_FILTER_PRESETS\.filter/);
  assert.match(source, /<optgroup/);
  assert.match(source, /onUpdateVisualFilter/);
  assert.match(source, /clipCssFilter/);
  assert.match(source, /filter:\s*clipCssFilter\(previewVisual/);
  assert.match(source, /filter:\s*clipCssFilter\(selectedVisual/);
});

test('clip studio visual clips expose LUT preset, import, and strength controls', () => {
  assert.match(source, /LUT_PRESETS/);
  assert.match(source, /getLutPreset/);
  assert.match(source, /视频 LUT/);
  assert.match(lutPresets, /电影青橙/);
  assert.match(source, /LUT_PRESETS\.map/);
  assert.match(source, /lutPresetId/);
  assert.match(source, /lutText/);
  assert.match(source, /lutAmount/);
  assert.match(source, /accept="\.cube"/);
  assert.match(source, /导入 \.cube/);
  assert.match(source, /清除 LUT/);
  assert.match(source, /onUpdateVisualFilter/);
});

test('clip studio text clips expose quick caption style presets', () => {
  assert.match(source, /字幕样式/);
  assert.match(source, /标题/);
  assert.match(source, /字幕/);
  assert.match(source, /角标/);
  assert.match(source, /片尾/);
  assert.match(source, /fontSize: preset\.fontSize/);
  assert.match(source, /color: preset\.color/);
});

test('clip studio captures delete shortcuts inside editor to delete selected timeline clips', () => {
  assert.match(source, /handleEditorKeyDown/);
  assert.match(source, /handleNativeEditorKeyDown/);
  assert.match(source, /event\.key === 'Delete' \|\| event\.key === 'Backspace'/);
  assert.match(source, /removeSelectedClip\(\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /document\.addEventListener\('keydown', handleNativeEditorKeyDown, true\)/);
  assert.match(source, /document\.removeEventListener\('keydown', handleNativeEditorKeyDown, true\)/);
  assert.match(source, /onKeyDown=\{handleEditorKeyDown\}/);
  assert.match(source, /data-clip-studio-editor-shell/);
  assert.match(source, /tabIndex=\{-1\}/);
});

test('clip studio exposes undo and redo controls backed by editor history callbacks', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /onUndoEdit/);
  assert.match(source, /onRedoEdit/);
  assert.match(source, /canUndoEdit/);
  assert.match(source, /canRedoEdit/);
  assert.match(source, /const key = event\.key\.toLowerCase\(\)/);
  assert.match(source, /key === 'z'/);
  assert.match(source, /key === 'y'/);
  assert.match(source, /onUndoEdit\(\)/);
  assert.match(source, /onRedoEdit\(\)/);
  assert.match(source, /title="撤销"/);
  assert.match(source, /title="重做"/);
  assert.match(nodeSource, /clipHistoryPastRef/);
  assert.match(nodeSource, /clipHistoryFutureRef/);
  assert.match(nodeSource, /commitClipPatch/);
  assert.match(nodeSource, /undoClipEdit/);
  assert.match(nodeSource, /redoClipEdit/);
});

test('clip studio exposes editing keyboard shortcuts with tactile command feedback', () => {
  assert.match(source, /commandFeedback/);
  assert.match(source, /showCommandFeedback/);
  assert.match(source, /runEditorShortcut/);
  assert.match(source, /key === ' '/);
  assert.match(source, /key === 'arrowleft'/);
  assert.match(source, /key === 'arrowright'/);
  assert.match(source, /event\.shiftKey \? -Math\.max\(1,\s*fps\) : -1/);
  assert.match(source, /event\.shiftKey \? Math\.max\(1,\s*fps\) : 1/);
  assert.match(source, /key === 'b'/);
  assert.match(source, /key === 'd'/);
  assert.match(source, /key === 'f'/);
  assert.match(source, /key === '=' \|\| key === '\+'/);
  assert.match(source, /key === '-'/);
  assert.match(source, /data-clip-command-feedback/);
  assert.match(source, /t8-clip-command-feedback/);
});

test('clip studio keeps timeline interactions visible with follow and drag affordances', () => {
  assert.match(source, /playheadFollowRef/);
  assert.match(source, /if \(!open \|\| timelineScrubActive \|\| dragState\?\.active\) return undefined/);
  assert.match(source, /timelineScrollRef\.current/);
  assert.match(source, /const leftGuard = el\.scrollLeft \+ 96/);
  assert.match(source, /const rightGuard = el\.scrollLeft \+ el\.clientWidth - 128/);
  assert.match(source, /\.scrollTo\(\{/);
  assert.match(source, /behavior:\s*playing \|\| timelineScrubActiveRef\.current \? 'auto' : 'smooth'/);
  assert.match(source, /data-clip-snap-ghost/);
  assert.match(source, /data-clip-drag-time-label/);
  assert.match(source, /formatSeconds\(liveDragTiming\.start,\s*fps\)/);
  assert.match(source, /timelineScrubActive[\s\S]{0,120}'border-emerald-200 bg-emerald-300 text-black/);
  assert.match(source, /t8-clip-track-row is-hoverable/);
  assert.match(source, /t8-clip-material-chip/);
  assert.match(source, /selectedVisual\?\.id === item\.id \? 'is-selected/);
  assert.match(source, /live \? 'is-dragging/);
  assert.match(globalCss, /\.t8-clip-playhead \[data-clip-playhead-handle\]:hover[\s\S]{0,180}scale\(1\.12\)/);
  assert.match(globalCss, /\.t8-clip-track-row\.is-hoverable:hover/);
  assert.match(globalCss, /\.t8-clip-material-chip:hover/);
  assert.match(globalCss, /\.t8-clip-visual\.is-selected,\s*\n\.t8-clip-visual\.is-dragging/);
  assert.match(globalCss, /\.t8-clip-visual\.is-dragging\s*\{[\s\S]{0,120}transform:\s*translateY\(-1px\) scale\(1\.01\)/);
});

test('clip studio exposes guidance and tactile feedback for everyday editing paths', () => {
  assert.match(source, /showShortcutHelp/);
  assert.match(source, /快捷键帮助/);
  assert.match(source, /Space/);
  assert.match(source, /Delete/);
  assert.match(source, /Ctrl\/Cmd \+ Z/);
  assert.match(source, /isDragOverImport/);
  assert.match(source, /data-clip-import-dropzone/);
  assert.match(source, /onDragEnter/);
  assert.match(source, /onDragLeave/);
  assert.match(source, /onDrop/);
  assert.match(source, /已加入 \$\{list\.length\} 个素材/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /data-clip-cover-modal-backdrop/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /t8-clip-audio/);
  assert.match(source, /t8-clip-text/);
  assert.match(source, /aria-pressed=\{snapMode\}/);
  assert.match(source, /aria-pressed=\{linkMode\}/);
  assert.match(globalCss, /\.t8-clip-import-dropzone\.is-dragover/);
  assert.match(globalCss, /\.t8-clip-audio\.is-selected,\s*\n\.t8-clip-text\.is-selected/);
});

test('clip studio keeps all hooks before the closed-state return', () => {
  const closedReturnIndex = source.indexOf('if (!open) return null;');
  assert.notEqual(closedReturnIndex, -1);
  assert.equal(source.slice(closedReturnIndex).includes('useEffect('), false);
  assert.equal(source.slice(closedReturnIndex).includes('useMemo('), false);
  assert.equal(source.slice(closedReturnIndex).includes('useState('), false);
  assert.equal(source.slice(closedReturnIndex).includes('useRef('), false);
});

test('clip studio includes tactile motion classes for editor interactions', () => {
  assert.match(source, /t8-clip-motion-pop/);
  assert.match(source, /t8-clip-preview-stage/);
  assert.match(globalCss, /@keyframes t8-clip-editor-enter/);
  assert.match(globalCss, /@keyframes t8-clip-tab-settle/);
  assert.match(globalCss, /\.t8-clip-button:active/);
  assert.match(globalCss, /\.t8-clip-tab\.is-active/);
  assert.match(globalCss, /\.t8-clip-preview-stage/);
});

test('clip studio keeps heavy previews light while scrolling the timeline', () => {
  assert.match(source, /loading="lazy"/);
  assert.match(source, /preload="metadata"/);
  assert.match(source, /memo\(TimelineVideoFrame\)/);
  assert.match(globalCss, /content-visibility:\s*auto/);
});

test('clip studio player exposes aspect ratio size scale and fullscreen controls', () => {
  assert.match(source, /previewFit/);
  assert.match(source, /previewScale/);
  assert.match(source, /data-clip-preview-fit=\{previewFit\}/);
  assert.match(source, /requestPreviewFullscreen/);
  assert.match(source, /requestFullscreen/);
  assert.match(source, /CLIP_RESOLUTION_PRESETS\.map/);
  assert.match(source, /clipRatioMode/);
  assert.match(source, /onPatchSettings\(\{ clipRatio: event\.target\.value,\s*clipRatioMode: 'manual' \}\)/);
  assert.match(source, /onPatchSettings\(\{ clipResolution: event\.target\.value \}\)/);
  assert.match(source, /预览大小/);
  assert.match(source, /全屏播放/);
  assert.match(globalCss, /\.t8-clip-preview-controls/);
  assert.match(globalCss, /\.t8-clip-preview-stage\[data-clip-preview-fit="cover"\]/);
});

test('clip studio preview keeps ratio controlled by export settings and not by layout size', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(nodeSource, /const previewRatioMode = typeof d\.clipRatioMode === 'string' \? d\.clipRatioMode : 'auto'/);
  assert.match(nodeSource, /const activeClipRatio = previewRatioMode === 'manual' \? ratio : auto/);
  assert.match(nodeSource, /probeLocalClipAspect/);
  assert.match(nodeSource, /ratioFromMediaSize/);
  assert.match(source, /aspectRatio:\s*`\$\{exportSettings\.width\}\/\$\{exportSettings\.height\}`/);
  assert.match(source, /'--clip-aspect-ratio': `\$\{exportSettings\.width \/ Math\.max\(1, exportSettings\.height\)\}`/);
  assert.match(globalCss, /\.t8-clip-preview-stage\s*\{[\s\S]{0,260}aspect-ratio:\s*var\(--clip-aspect-ratio\);/);
  assert.doesNotMatch(source, /width:\s*previewStageWidth/);
  assert.doesNotMatch(source, /height:\s*previewStageHeight/);
});

test('clip studio keeps dense controls compact themed and clipped inside panes', () => {
  assert.match(source, /const editorButton = 't8-clip-button nodrag inline-flex h-7/);
  assert.match(source, /const iconButton = 't8-clip-icon-button nodrag inline-flex h-6 w-6/);
  assert.match(source, /const fieldClass = 't8-clip-field nodrag h-7/);
  assert.match(source, /t8-clip-source-tabs grid grid-cols-2/);
  assert.match(source, /t8-clip-media-filter-grid flex items-center gap-1\.5/);
  assert.match(source, /t8-clip-settings-pane space-y-2 overflow-auto/);
  assert.match(source, /t8-clip-settings-card/);
  assert.match(source, /t8-clip-preset-button/);
  assert.match(source, /t8-clip-color-field/);
  assert.match(source, /t8-clip-player-header[\s\S]{0,120}flex h-8/);
  assert.match(source, /t8-clip-compact-chip/);
  assert.match(source, /t8-clip-export-summary/);
  assert.match(source, /maxWidth:\s*'100%'/);
  assert.match(source, /maxHeight:\s*'100%'/);
  assert.match(globalCss, /\.t8-clip-button\s*\{[\s\S]{0,160}min-height:\s*1\.75rem/);
  assert.match(globalCss, /\.t8-clip-source-tabs > button/);
  assert.match(globalCss, /\.t8-clip-settings-pane/);
  assert.match(globalCss, /\.t8-clip-preset-button/);
  assert.match(globalCss, /\.t8-clip-preview-stage/);
  assert.match(globalCss, /--clip-preview-available-height:\s*min\(68vh,\s*560px\)/);
  assert.match(globalCss, /\.t8-clip-player-header/);
  assert.match(globalCss, /\.t8-clip-panel \*/);
});

test('clip studio exposes obvious resize grips for layout panes and timeline header', () => {
  assert.match(source, /data-clip-layout-resize="left"/);
  assert.match(source, /data-clip-layout-resize="right"/);
  assert.match(source, /data-clip-layout-resize="timeline-divider"/);
  assert.match(source, /data-clip-layout-resize="timeline-header"/);
  assert.match(source, /startResize\('timeline', event\)/);
  assert.match(source, /t8-clip-resize-grip/);
  assert.match(source, /t8-clip-timeline-header-resize/);
  assert.match(globalCss, /\.t8-clip-resize-grip/);
  assert.match(globalCss, /\.t8-clip-timeline-header-resize/);
});

test('clip studio timeline exposes editor-like track visibility and alignment controls', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /trackVisibility/);
  assert.match(source, /toggleTrackVisibility/);
  assert.match(source, /data-clip-track-visibility/);
  assert.match(source, /onSetVisualLaneVisibility/);
  assert.match(source, /toggleTrackVisibility\(`visual-\$\{lane\}`,\s*lane\)/);
  assert.match(source, /data-clip-visual-visibility-toggle/);
  assert.match(nodeSource, /const setVisualLaneVisibility = useCallback/);
  assert.match(nodeSource, /const laneVisualIds = timelineVisuals[\s\S]{0,260}visualLaneForItem\(item,\s*visualLanes\) === lane/);
  assert.match(nodeSource, /clipDisabledVisualIds: Array\.from\(nextIds\)/);
  assert.match(source, /data-clip-track-align-line/);
  assert.match(source, /t8-clip-track-label-button/);
  assert.match(source, /snapMode[\s\S]{0,240}data-clip-track-align-line/);
  assert.match(source, /buildClipSnapTargets/);
  assert.match(source, /kind:\s*'zero'/);
  assert.match(source, /kind:\s*'playhead'/);
  assert.match(source, /kind:\s*'clip-start'/);
  assert.match(source, /kind:\s*'clip-end'/);
  assert.match(source, /kind:\s*'audio-start'/);
  assert.match(source, /kind:\s*'audio-end'/);
  assert.match(source, /kind:\s*'text-start'/);
  assert.match(source, /kind:\s*'text-end'/);
  assert.match(source, /snapTargetLeft/);
  assert.match(source, /liveDragTiming\?\.snapEdgeTime\s*!=\s*null/);
  assert.match(source, /const next = previewClipTimelineDragTiming\(\{[\s\S]*snapTargets:\s*buildClipSnapTargets\(current\.id\)/);
  assert.match(source, /snapTargets:\s*clipSnapTargets/);
  assert.match(globalCss, /\.t8-clip-track-label-button/);
  assert.match(globalCss, /\.t8-clip-track-align-line/);
});

test('clip studio left color page surfaces a complete color/LUT editor', () => {
  assert.match(source, /data-clip-left-color-editor/);
  assert.match(source, /t8-clip-left-editor min-h-0 flex-1 overflow-auto/);
  assert.doesNotMatch(source, /data-clip-param-section-nav/);
  assert.doesNotMatch(source, /scrollParamSectionIntoView/);
  assert.match(source, /data-clip-param-section=\{placement === 'inspector' \? 'color' : undefined\}/);
  assert.match(source, /调色 \/ LUT/);
  assert.match(source, /data-clip-color-preview/);
  assert.match(source, /data-clip-color-lut-controls/);
  assert.match(source, /导入 \.cube/);
  assert.match(source, /LUT 预设/);
});

test('clip studio inspector groups generation color LUT and motion controls into clear sections', () => {
  assert.match(source, /data-clip-param-section="generation"/);
  assert.match(source, /data-clip-generation-section="model"/);
  assert.match(source, /data-clip-generation-section="refs"/);
  assert.match(source, /data-clip-generation-section="params"/);
  assert.match(source, /data-clip-open-color-page/);
  assert.match(source, /data-clip-open-motion-page/);
  assert.match(source, /素材后期/);
  assert.doesNotMatch(source, /renderVisualParamSectionNav/);
});

test('clip studio parameter pane keeps selected clip context and quick actions visible', () => {
  assert.match(source, /renderSelectionSummaryCard/);
  assert.match(source, /data-clip-selection-summary/);
  assert.match(source, /data-clip-selection-summary-kind/);
  assert.match(source, /data-clip-selection-summary-time/);
  assert.match(source, /data-clip-selection-quick-actions/);
  assert.match(source, /定位播放头/);
  assert.match(source, /复制片段/);
  assert.match(source, /分割片段/);
  assert.match(source, /删除片段/);
  assert.match(source, /selectedVisual\?\.disabled \? '隐藏' : '显示'/);
  assert.match(globalCss, /\.t8-clip-selection-summary/);
  assert.match(globalCss, /\.t8-clip-selection-quick-actions/);
});

test('clip studio timeline clip chips expose compact status badges for editing state', () => {
  assert.match(source, /data-clip-visual-status-badges/);
  assert.match(source, /data-clip-visual-badge="hidden"/);
  assert.match(source, /data-clip-visual-badge="speed"/);
  assert.match(source, /data-clip-visual-badge="lut"/);
  assert.match(source, /data-clip-visual-badge="transition"/);
  assert.match(source, /data-clip-visual-badge="keyframes"/);
  assert.match(source, /Number\(item\.speed \|\| 1\)\.toFixed\(2\)/);
  assert.match(globalCss, /\.t8-clip-visual-status-badges/);
  assert.match(globalCss, /\.t8-clip-visual-badge/);
});

test('clip studio drag feedback names the target lane and top bottom insert intent', () => {
  assert.match(source, /data-clip-lane-drop-hint/);
  assert.match(source, /dropHintTextForVisualLane/);
  assert.match(source, /释放到新顶层轨道/);
  assert.match(source, /释放到新底部轨道/);
  assert.match(source, /释放到视频轨/);
  assert.match(source, /visualLaneInsertion === 'top'/);
  assert.match(source, /visualLaneInsertion === 'bottom'/);
  assert.match(globalCss, /\.t8-clip-lane-drop-hint/);
});

test('clip studio inspector titles and draft refs stay aligned with the selected generation clip', () => {
  assert.match(source, /data-clip-inspector-title/);
  assert.match(source, /data-clip-inspector-subtitle/);
  assert.match(source, /const inspectorTitle =/);
  assert.match(source, /const inspectorSubtitle =/);
  assert.match(source, /selectedVisualGenerationRefMaterialsByKind/);
  assert.match(source, /selectedVisualGenerationUploadActions/);
  assert.match(source, /data-clip-generation-draft-refs/);
  assert.match(source, /data-clip-generation-draft-ref-input/);
  assert.match(source, /MaterialPreviewSection[\s\S]{0,900}dataRole="clip-generation-draft-refs"/);
  assert.match(source, /onUploadGenerationRefs\(selectedVisual\.id \|\| '',\s*event\.currentTarget\.files,\s*selectedVisualGenerationRefUploadKind/);
});

test('clip studio exposes visual transform keyframes in params preview and timeline', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /onUpdateVisualKeyframes/);
  assert.match(source, /addVisualKeyframeAtPlayhead/);
  assert.match(source, /关键帧动画/);
  assert.match(source, /data-clip-keyframe-marker/);
  assert.match(source, /clipVisualKeyframes/);
  assert.match(nodeSource, /clipVisualKeyframes/);
  assert.match(nodeSource, /updateVisualKeyframes/);
  assert.match(nodeSource, /visualKeyframes/);
  assert.match(nodeSource, /buildClipDraftFromTimeline\([\s\S]{0,260}visualTransforms[\s\S]{0,260}visualKeyframes/);
});

test('clip studio timeline supports context actions and copy to another visual lane', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /clipContextMenu/);
  assert.match(source, /openClipContextMenu/);
  assert.match(source, /duplicateVisualToLane/);
  assert.match(source, /复制到上方轨道/);
  assert.match(source, /复制到下方轨道/);
  assert.match(source, /data-clip-context-menu/);
  assert.match(source, /data-clip-context-menu-action/);
  assert.match(source, /onPointerDown=\{\(event\) => \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(nodeSource, /const laneOffset = laneDelta < 0 && currentLane <= 0 \? 1 : 0/);
  assert.match(source, /onContextMenu=\{\(event\) => openClipContextMenu\(event,\s*item\)\}/);
  assert.match(globalCss, /\.t8-clip-context-menu/);
});

test('clip studio supports alt-drag copying clips across lanes and time', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /copyMode: boolean/);
  assert.match(source, /event\.altKey/);
  assert.match(source, /onDuplicateVisualByDrag/);
  assert.match(source, /resolveVisualLaneFromClientY/);
  assert.match(source, /data-clip-copy-ghost/);
  assert.match(source, /拖动复制/);
  assert.match(nodeSource, /const duplicateVisualByDrag = useCallback/);
  assert.match(nodeSource, /clipVisualStarts:\s*\{\s*\.\.\.visualStarts,\s*\[copyId\]:/);
  assert.match(nodeSource, /clipVisualLanes:\s*\{\s*\.\.\.nextLanes,\s*\[copyId\]: targetLane/);
});

test('clip studio dragging visual generation clips can move them between visual lanes', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /startY: number/);
  assert.match(source, /currentY: number/);
  assert.match(source, /Math\.abs\(event\.clientY - current\.startY\) >= 4/);
  assert.match(source, /currentY: event\.clientY/);
  assert.match(source, /const itemLane = live && dragState \? resolveVisualLaneFromClientY\(dragState\.currentY\) :/);
  assert.match(source, /onUpdateVisualStart:\s*\(visualId: string,\s*start: number,\s*lane\?: number\) => void/);
  assert.match(source, /onUpdateVisualStart\(current\.id,\s*next\.start,\s*resolveVisualLaneFromClientY\(event\.clientY\)\)/);
  assert.match(nodeSource, /const updateVisualStart = useCallback\(\(visualId: string,\s*value: number,\s*lane\?: number\) =>/);
  assert.match(nodeSource, /const nextVisualLanes = lane == null \? visualLanes : resolveVisualLanePatchForDrop\(timelineVisuals,\s*visualLanes,\s*visualId,\s*lane\)/);
  assert.match(nodeSource, /clipVisualLanes: nextVisualLanes/);
  assert.match(nodeSource, /visualLanes\[item\.id\] != null \? visualLanes\[item\.id\] : item\.lane/);
  assert.doesNotMatch(nodeSource, /item\.lane \?\? \(item\.id \? visualLanes\[item\.id\]/);
});

test('clip studio visual lanes create temporary top and bottom insert lanes while dragging', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  const projectSource = readFileSync(new URL('../src/utils/clipProject.ts', import.meta.url), 'utf8');
  assert.match(projectSource, /export const CLIP_MAX_VISUAL_LANE = 24/);
  assert.match(source, /CLIP_MAX_VISUAL_LANE/);
  assert.match(source, /const maxOccupiedVisualLane = useMemo/);
  assert.match(source, /Math\.min\(CLIP_MAX_VISUAL_LANE \+ 1,\s*maxOccupiedVisualLane \+ 1\)/);
  assert.doesNotMatch(source, /maxOccupiedVisualLane \+ 2/);
  assert.match(source, /const visualLaneInsertion =/);
  assert.match(source, /data-clip-visual-insert-lane/);
  assert.match(source, /clientY <= rect\.top \+ VISUAL_LANE_INSERT_ENTER_PX/);
  assert.match(source, /clientY >= rect\.bottom - VISUAL_LANE_INSERT_ENTER_PX/);
  assert.match(source, /return -1;/);
  assert.match(source, /visualRenderLanes/);
  assert.match(source, /style=\{\{ height: visualTrackTotalHeight \}\}/);
  assert.match(source, /const dropLane = resolveVisualLaneFromClientY\(event\.clientY\)/);
  assert.match(nodeSource, /CLIP_MAX_VISUAL_LANE/);
  assert.match(nodeSource, /lane < 0/);
  assert.match(nodeSource, /clipVisualLanes: nextVisualLanes/);
  assert.doesNotMatch(nodeSource, /Math\.min\(5,\s*(currentLane|Math\.round\(Number\(lane|Math\.max\(0, Number\(item\.lane)/);
});

test('clip studio visual lane insert intent uses hysteresis to avoid jitter while dragging', () => {
  assert.match(source, /const VISUAL_LANE_INSERT_ENTER_PX = 18/);
  assert.match(source, /const VISUAL_LANE_INSERT_EXIT_PX = 34/);
  assert.match(source, /const \[visualLaneInsertIntent,\s*setVisualLaneInsertIntent\] = useState<'top' \| 'bottom' \| null>\(null\)/);
  assert.match(source, /resolveVisualLaneInsertIntent\(/);
  assert.match(source, /previous:\s*visualLaneInsertIntent/);
  assert.match(source, /setVisualLaneInsertIntent\(nextIntent\)/);
  assert.match(source, /if \(event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)\) return/);
  assert.match(source, /if \(previous === 'top' && clientY <= rect\.top \+ VISUAL_LANE_INSERT_EXIT_PX\) return 'top'/);
  assert.match(source, /if \(previous === 'bottom' && clientY >= rect\.bottom - VISUAL_LANE_INSERT_EXIT_PX\) return 'bottom'/);
  assert.match(source, /if \(insertIntent === 'top'\) return -1/);
  assert.match(source, /if \(insertIntent === 'bottom'\) return Math\.min\(CLIP_MAX_VISUAL_LANE, maxOccupiedVisualLane \+ 1\)/);
});

test('clip studio exposes fps dragging and clear trim handles for clip duration edits', () => {
  assert.match(source, /data-clip-fps-slider/);
  assert.match(source, /onPatchSettings\(\{ clipFps: Number\(event\.target\.value\) \}\)/);
  assert.match(source, /data-clip-trim-handle="left"/);
  assert.match(source, /data-clip-trim-handle="right"/);
  assert.match(source, /t8-clip-trim-handle/);
  assert.match(source, /title="拖动调整片段长度"/);
  assert.match(globalCss, /\.t8-clip-trim-handle/);
});

test('clip studio timeline keeps controls inside clips instead of adding detached reorder rows', () => {
  assert.doesNotMatch(source, /controls-\$\{item\.id \|\| index\}/);
  assert.doesNotMatch(source, /timelineVisuals\.map\(\(item,\s*index\)[\s\S]{0,500}onMoveVisual/);
  assert.match(source, /data-clip-audio-status-badges/);
  assert.match(source, /data-clip-text-status-badges/);
  assert.match(globalCss, /\.t8-clip-audio-status-badges/);
  assert.match(globalCss, /\.t8-clip-text-status-badges/);
});

test('clip studio supports multi-select and batch timeline actions', () => {
  assert.match(source, /const \[selectedIds,\s*setSelectedIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(source, /const selectedClipIds = useMemo\(\(\) => new Set\(selectedIds/);
  assert.match(source, /selectClip\(item\.id \|\| '',\s*event\)/);
  assert.match(source, /event\.shiftKey \|\| event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /const removeSelectedClips = \(\) =>/);
  assert.match(source, /const duplicateSelectedClips = \(\) =>/);
  assert.match(source, /data-clip-bulk-selection-bar/);
  assert.match(source, /已选择 \{selectedClipCount\} 个片段/);
  assert.match(source, /selectedClipIds\.has\(item\.id \|\| ''\)/);
  assert.match(globalCss, /\.t8-clip-bulk-selection-bar/);
});

test('clip studio previews drag overlap and blocks drops on locked tracks', () => {
  assert.match(source, /const dragConflictPreview =/);
  assert.match(source, /data-clip-drag-conflict-preview/);
  assert.match(source, /data-clip-drop-preview-mode=\{dragConflictPreview\.mode\}/);
  assert.match(source, /dragConflictPreview\.mode === 'locked'/);
  assert.match(source, /targetVisualTrackLocked/);
  assert.match(source, /showCommandFeedback\('轨道已锁定'\)/);
  assert.match(source, /visualItemsOverlap/);
  assert.match(globalCss, /\.t8-clip-drag-conflict-preview/);
});

test('clip studio visual tracks expose lock solo and collapse controls', () => {
  assert.match(source, /const \[trackLocks,\s*setTrackLocks\] = useState<Record<string,\s*boolean>>\(\{\}\)/);
  assert.match(source, /const \[trackSolo,\s*setTrackSolo\] = useState\(''\)/);
  assert.match(source, /const \[trackCollapsed,\s*setTrackCollapsed\] = useState<Record<string,\s*boolean>>\(\{\}\)/);
  assert.match(source, /toggleTrackLock/);
  assert.match(source, /toggleTrackSolo/);
  assert.match(source, /toggleTrackCollapsed/);
  assert.match(source, /data-clip-track-lock=\{trackKey\}/);
  assert.match(source, /data-clip-track-solo=\{trackKey\}/);
  assert.match(source, /data-clip-track-collapse=\{trackKey\}/);
  assert.match(source, /visualTrackTotalHeight/);
  assert.match(source, /is-collapsed/);
  assert.match(globalCss, /\.t8-clip-track-label-row\.is-locked/);
  assert.match(globalCss, /\.t8-clip-track-label-row\.is-solo/);
  assert.match(globalCss, /\.t8-clip-track-row\.is-collapsed/);
});

test('clip studio exposes a compact AI generation queue bar', () => {
  assert.match(source, /const \[generationStatusFilter,\s*setGenerationStatusFilter\] = useState<'all' \| 'unfinished' \| 'draft' \| 'running' \| 'error' \| 'success'>\('all'\)/);
  assert.match(source, /const generationTrackItems = useMemo\(\(\) => timelineLayout\.items\.filter\(\(item\) => item\.generation\)/);
  assert.match(source, /const generationQueueSummary = useMemo/);
  assert.match(source, /const runPendingGenerationClips = async \(\) =>/);
  assert.match(source, /const retryErroredGenerationClips = async \(\) =>/);
  assert.match(source, /data-clip-generation-queue-bar/);
  assert.match(source, /data-clip-generation-batch-run/);
  assert.match(source, /data-clip-generation-batch-retry/);
  assert.match(source, /data-clip-generation-filter=\{filter\.id\}/);
  assert.match(source, /setGenerationPanelClipId\(firstBlockedGeneration\.id \|\| ''\)/);
  assert.match(globalCss, /\.t8-clip-generation-queue-bar/);
});

test('clip studio generation queue chips jump to the first matching problem clip', () => {
  assert.match(source, /const focusGenerationQueueItem = \(kind: 'missingPrompt' \| 'runnable' \| 'error' \| 'unfinished'\) =>/);
  assert.match(source, /const target = generationTrackItems\.find\(\(item\) =>/);
  assert.match(source, /selectClip\(target\.id\)/);
  assert.match(source, /seekPlayhead\(Math\.max\(0, Number\(target\.start \|\| 0\)\), \{ selectPlayback: false \}\)/);
  assert.match(source, /setGenerationPanelClipId\(target\.id\)/);
  assert.match(source, /timelineScrollRef\.current\?\.scrollTo/);
  assert.match(source, /data-clip-generation-queue-jump="missingPrompt"/);
  assert.match(source, /data-clip-generation-queue-jump="runnable"/);
  assert.match(source, /data-clip-generation-queue-jump="error"/);
});

test('clip studio generation clips expose inline run retry and settings actions', () => {
  assert.match(source, /const generationMatchesStatusFilter =/);
  assert.match(source, /is-generation-filtered-out/);
  assert.match(source, /data-clip-generation-inline-actions/);
  assert.match(source, /data-clip-generation-inline-run/);
  assert.match(source, /void onRunGenerationClip\(item\.id \|\| ''\)/);
  assert.match(source, /data-clip-generation-inline-settings/);
  assert.match(source, /setGenerationPanelClipId\(item\.id \|\| ''\)/);
  assert.match(globalCss, /\.t8-clip-generation-inline-actions/);
  assert.match(globalCss, /\.t8-clip-visual\.is-generation-filtered-out/);
});

test('clip studio AI generation clips accept dragged materials as references', () => {
  assert.match(source, /const \[generationRefDropTargetId,\s*setGenerationRefDropTargetId\] = useState\(''\)/);
  assert.match(source, /const generationReferenceSupportFor = \(generation: ClipGenerationState \| undefined\)/);
  assert.match(source, /const handleGenerationRefDrop = \(event: ReactDragEvent<HTMLElement>, visualId: string, generation: ClipGenerationState \| undefined\)/);
  assert.match(source, /event\.dataTransfer\.getData\('application\/x-t8-clip-material'\)/);
  assert.match(source, /addGenerationMaterialRefForVisual\(visualId, generation, generationReferenceSupportFor\(generation\), material\)/);
  assert.match(source, /data-clip-generation-ref-drop-target=\{generationRefDropTargetId === item\.id/);
  assert.match(source, /is-generation-ref-drop-target/);
  assert.match(globalCss, /\.t8-clip-visual\.is-generation-ref-drop-target/);
});

test('clip studio AI generation track surfaces draft blockers and smart timeline references', () => {
  assert.match(source, /missingPrompt: 0/);
  assert.match(source, /runnable: 0/);
  assert.match(source, /summary\.missingPrompt \+= 1/);
  assert.match(source, /summary\.runnable \+= 1/);
  assert.match(source, /缺提示词 \{generationQueueSummary\.missingPrompt\}/);
  assert.match(source, /可生成 \{generationQueueSummary\.runnable\}/);
  assert.match(source, /const selectedGenerationRefSuggestions = useMemo/);
  assert.match(source, /const selectedVisualGenerationRefSuggestions = useMemo/);
  assert.match(source, /data-clip-generation-smart-ref/);
  assert.match(source, /引用上一段/);
  assert.match(globalCss, /\.t8-clip-generation-smart-ref/);
});

test('clip studio completed images can be turned into video generation drafts', () => {
  const nodeSource = readFileSync(new URL('../src/components/nodes/ClipStudioNode.tsx', import.meta.url), 'utf8');
  assert.match(source, /type ClipGenerationInsertDraft = Partial<ClipTimelineInsertTiming> &/);
  assert.match(source, /const createVideoGenerationFromVisual = \(visual: ClipTimelineVisualMaterial\) =>/);
  assert.match(source, /onCreateGenerationClip\('video',\s*\{/);
  assert.match(source, /refs:\s*\[\{\s*id: visual\.id \|\| `visual-ref-\$\{Date\.now\(\)\}`/);
  assert.match(source, /role: 'first_frame'/);
  assert.match(source, /sourceClipId: visual\.id/);
  assert.match(source, /data-clip-generation-to-video/);
  assert.match(nodeSource, /type ClipGenerationInsertDraft = Partial<ClipTimelineInsertTiming> &/);
  assert.match(nodeSource, /prompt: insertAt\?\.prompt/);
  assert.match(nodeSource, /refs: insertAt\?\.refs/);
  assert.match(nodeSource, /params:\s*\{\s*\.\.\.defaultClipGenerationParams\(choice\),\s*\.\.\.\(insertAt\?\.params \|\| \{\}\)/);
});

test('clip studio video generation drafts prioritize same-lane previous clip continuity refs', () => {
  assert.match(source, /role\?: ClipGenerationRef\['role'\]/);
  assert.match(source, /const sameLanePrevious = candidates/);
  assert.match(source, /Math\.round\(Number\(item\.lane \|\| 0\)\) === Math\.round\(Number\(target\.lane \|\| 0\)\)/);
  assert.match(source, /addSuggestion\(\s*'引用同轨上一段'/);
  assert.match(source, /const defaultRole = generation\.nodeType === 'video' \? 'last_frame' : 'reference'/);
  assert.match(source, /role: role \|\| defaultRole/);
  assert.match(source, /data-clip-generation-smart-ref=\{suggestion\.label\}/);
});
