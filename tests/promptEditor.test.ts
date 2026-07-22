import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getUnresolvedMentionCount,
  findMediaMentionQuery,
  insertMediaMention,
  materialMentionKey,
  resolveMediaMentions,
  type MediaMention,
} from '../src/components/nodes/mediaMentions.ts';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('prompt editor shortcut is registered globally', () => {
  const shortcuts = read('../src/utils/keyboardShortcuts.ts');

  assert.match(shortcuts, /id:\s*'editor\.expand-prompt'/);
  assert.match(shortcuts, /label:\s*'放大编辑提示词'/);
  assert.match(shortcuts, /defaults:\s*\[\{\s*key:\s*'Enter',\s*alt:\s*true\s*\}\]/);
});

test('shared prompt editor components expose modal and textarea affordances', () => {
  const modal = read('../src/components/PromptExpandModal.tsx');
  const textarea = read('../src/components/PromptTextarea.tsx');

  assert.match(modal, /data-canvas-floating-ui="prompt-expand-editor"/);
  assert.match(modal, /flex min-h-0 flex-1 flex-col p-4/);
  assert.match(modal, /Enter 换行/);
  assert.match(modal, /Esc 取消/);
  assert.doesNotMatch(modal, /event\.key === 'Enter'/);
  assert.match(modal, /readOnly \? '当前字段为只读，可查看或复制。'/);
  assert.match(modal, /editorKind\?:\s*PromptExpandEditorKind/);
  assert.match(modal, /格式化 JSON/);
  assert.match(modal, /校验 JSON/);
  assert.match(modal, /整理列表/);
  assert.match(modal, /const finishByBackdrop = \(\) => \{[\s\S]*if \(readOnly\) \{[\s\S]*onCancel\(\);[\s\S]*return;[\s\S]*onApply\(\);[\s\S]*\}/);
  assert.match(modal, /if \(event\.target === event\.currentTarget\) finishByBackdrop\(\)/);

  assert.match(textarea, /PromptExpandModal/);
  assert.match(textarea, /data-prompt-expand-trigger/);
  assert.match(textarea, /matchesAnyShortcut\(expandCombos,\s*event\.nativeEvent\)/);
  assert.match(textarea, /shortcuts\['editor\.expand-prompt'\]/);
  assert.match(textarea, /editorKind=\{editorKind\}/);
  assert.match(textarea, /composingRef/);
  assert.match(textarea, /isImeCompositionInput/);
  assert.match(textarea, /onBeforeInput=\{handleBeforeInput\}/);
  assert.match(textarea, /onCompositionEnd=\{handleCompositionEnd\}/);
});

test('mention prompt input keeps media mentions in expanded editor', () => {
  const mention = read('../src/components/nodes/MentionPromptInput.tsx');

  assert.match(mention, /title\?:\s*string/);
  assert.match(mention, /expandable\?:\s*boolean/);
  assert.match(mention, /PromptExpandModal/);
  assert.match(mention, /data-prompt-expand-trigger/);
  assert.match(mention, /matchesAnyShortcut\(expandShortcuts,\s*e\.nativeEvent\)/);
  assert.match(mention, /isImeCompositionInput/);
  assert.match(mention, /onBeforeInput=\{\(event\) =>/);
  assert.match(mention, /if \(isImeCompositionInput\(event\.nativeEvent\)\) composingRef\.current = true/);
  assert.match(mention, /const nativeEvent = event\?\.nativeEvent/);
  assert.match(mention, /Some Chromium IME paths leave the component in a composing state/);
  assert.match(mention, /if \(composingRef\.current\) \{[\s\S]*composingRef\.current = false;/);
  assert.match(mention, /const flushEditorToData = \(\) =>/);
  assert.match(mention, /onBlur=\{\(\) => \{\s*composingRef\.current = false;\s*flushEditorToData\(\)/);
  assert.match(mention, /const MENTION_PROMPT_POPOVER_Z_INDEX = 10140/);
  assert.match(mention, /zIndex:\s*MENTION_PROMPT_POPOVER_Z_INDEX/);
  assert.match(mention, /const fillLayout = fillHeight \|\| !expandable/);
  assert.match(mention, /height:\s*fillLayout \? '100%' : style\?\.height/);
  assert.match(mention, /minHeight:\s*fillLayout \? 0 : \(style\?\.minHeight \?\? 56\)/);
  assert.match(mention, /'display:inline-block'/);
  assert.match(mention, /'width:24px'/);
  assert.match(mention, /'height:24px'/);
  assert.match(mention, /'vertical-align:middle'/);
  assert.match(mention, /const content = document\.createElement\('span'\)/);
  assert.match(mention, /span\.replaceChildren\(content\)/);
  assert.match(mention, /expandable=\{false\}/);
  assert.match(mention, /setDraftMentions\(nextMentions\)/);
  assert.match(mention, /if \(e\.key === 'Tab' && activeMaterial\)/);
  assert.doesNotMatch(mention, /e\.key === 'Enter' \|\| e\.key === 'Tab'/);
});

test('mention prompt input does not clear saved prompt from a pristine empty editor dom', () => {
  const mention = read('../src/components/nodes/MentionPromptInput.tsx');

  assert.match(mention, /userEditedSinceFocusRef/);
  assert.match(mention, /hydrateEditorFromValue/);
  assert.match(mention, /protectPristineEmptyFlush/);
  assert.match(mention, /text\.length === 0[\s\S]*value \|\| ''[\s\S]*!userEditedSinceFocusRef\.current/);
  assert.match(mention, /if \(protectPristineEmptyFlush\(text\)\) \{[\s\S]*hydrateEditorFromValue\(caret\)/);
  assert.match(mention, /onFocus=\{\(\) => \{[\s\S]*userEditedSinceFocusRef\.current = false;[\s\S]*hydrateEditorFromValue/);
  assert.match(mention, /userEditedSinceFocusRef\.current = true;[\s\S]*onChange\(nextValue,\s*nextMentions\)/);
  assert.match(mention, /onBlur=\{\(\) => \{[\s\S]*flushEditorToData\(\);[\s\S]*userEditedSinceFocusRef\.current = false/);
});

test('smart node outside close ignores prompt portal floating editors', () => {
  const outsideClose = read('../src/components/nodes/shared/useOutsideClose.ts');
  const composer = read('../src/components/nodes/shared/SmartNodeComposer.tsx');
  const image = read('../src/components/nodes/ImageNode.tsx');
  const video = read('../src/components/nodes/VideoNode.tsx');
  const seedance = read('../src/components/nodes/SeedanceNode.tsx');
  const audio = read('../src/components/nodes/AudioNode.tsx');

  assert.match(outsideClose, /DEFAULT_IGNORE_SELECTOR\s*=\s*'\[data-canvas-floating-ui\]/);
  assert.match(outsideClose, /target instanceof HTMLElement && target\.closest\(ignoreSelector\)/);
  assert.match(composer, /target instanceof Element && target\.closest\('\[data-canvas-floating-ui\]'\)/);
  assert.match(image, /useOutsideClose\(\{/);
  assert.match(video, /useOutsideClose\(\{/);
  assert.match(seedance, /useOutsideClose\(\{/);
  assert.match(audio, /useOutsideClose\(\{/);
});

test('mention query ignores an existing media chip token before normal text', () => {
  const mentions: MediaMention[] = [
    {
      id: 'm-image',
      kind: 'image',
      materialKey: 'image:/files/input/monkey.png',
      url: '/files/input/monkey.png',
      token: '@image1',
      start: 0,
      end: '@image1'.length,
    },
  ];

  assert.equal(findMediaMentionQuery('@image1的女人在和', '@image1的女人在和'.length, mentions), null);
  assert.equal(findMediaMentionQuery('@猴 ', '@猴 '.length, []), null);
  assert.deepEqual(findMediaMentionQuery('@image1 @猴', '@image1 @猴'.length, mentions), {
    start: '@image1 '.length,
    end: '@image1 @猴'.length,
    query: '猴',
  });
});

test('mention query can start immediately after normal prompt text', () => {
  assert.deepEqual(findMediaMentionQuery('女人@', '女人@'.length, []), {
    start: '女人'.length,
    end: '女人@'.length,
    query: '',
  });
  assert.deepEqual(findMediaMentionQuery('女人@猴', '女人@猴'.length, []), {
    start: '女人'.length,
    end: '女人@猴'.length,
    query: '猴',
  });

  const material = {
    kind: 'image',
    url: '/files/input/monkey.png',
    label: '猴子',
  } as any;
  const result = insertMediaMention('女人@', [], material, [material], '女人'.length, '女人@'.length);
  assert.equal(result.text, '女人 @image1 ');
  assert.equal(result.caret, '女人 @image1 '.length);
  assert.equal(result.mentions.length, 1);
  assert.equal(result.mentions[0].start, '女人 '.length);
  assert.equal(result.mentions[0].end, '女人 @image1'.length);
});

test('media mentions follow the same source slot when upstream images are regenerated', () => {
  const firstMaterial = {
    id: 'image-node::imageUrls:0:image:/files/output/old.png',
    kind: 'image',
    url: '/files/output/old.png',
    sourceNodeId: 'image-node',
    origin: 'upstream',
    label: '图1',
    mentionKey: 'image:image-node:imageUrls:0',
  } as any;
  const nextMaterial = {
    ...firstMaterial,
    id: 'image-node::imageUrls:0:image:/files/output/new.png',
    url: '/files/output/new.png',
  };

  const inserted = insertMediaMention('参考@', [], firstMaterial, [firstMaterial], '参考'.length, '参考@'.length);

  assert.equal(materialMentionKey(firstMaterial), 'image:image-node:imageUrls:0');
  assert.equal(inserted.mentions[0].materialKey, 'image:image-node:imageUrls:0');
  assert.equal(getUnresolvedMentionCount(inserted.mentions, [nextMaterial]), 0);
  assert.equal(resolveMediaMentions(inserted.text, inserted.mentions, [nextMaterial]), '参考 @image1 ');
});

test('text node media mentions can read downstream generation node media', () => {
  const textNode = read('../src/components/nodes/TextNode.tsx');
  const materialsHook = read('../src/components/nodes/useUpstreamMaterials.ts');
  const mediaMentions = read('../src/components/nodes/mediaMentions.ts');

  assert.match(textNode, /useDownstreamMediaMaterials/);
  assert.match(textNode, /const downstreamMedia = useDownstreamMediaMaterials\(id\)/);
  assert.match(textNode, /uniqueMentionMaterials\(\[/);
  assert.match(textNode, /\.\.\.downstreamMedia/);

  assert.match(materialsHook, /export function useDownstreamMediaMaterials/);
  assert.match(materialsHook, /useEdges/);
  assert.match(materialsHook, /handleType:\s*'source'/);
  assert.match(materialsHook, /conns\.map\(\(c\) => c\.target\)/);
  assert.match(materialsHook, /siblingMediaSourceIds/);
  assert.match(materialsHook, /targets\.has\(edge\.target\) && edge\.source !== nodeId/);
  assert.match(materialsHook, /\[\.\.\.siblingList,\s*\.\.\.downstreamList\]/);
  assert.match(materialsHook, /collectMentionableMediaFromNodeData/);
  assert.match(materialsHook, /referenceImages/);
  assert.match(materialsHook, /localRefImages/);
  assert.match(materialsHook, /localRefVideos/);
  assert.match(materialsHook, /localRefAudios/);
  assert.match(materialsHook, /localRefAudio/);
  assert.match(materialsHook, /generatedImages/);
  assert.match(materialsHook, /tracks/);
  assert.match(materialsHook, /mentionKey/);
  assert.match(materialsHook, /\$\{field\}:\$\{index\}/);

  assert.match(mediaMentions, /function tokenMatchesMentionKind/);
  assert.match(mediaMentions, /tokenMatchesMentionKind\(mention\) && text\.slice\(mention\.start,\s*mention\.end\) === mention\.token/);
});

test('core generation nodes use expanded prompt editing', () => {
  const image = read('../src/components/nodes/ImageNode.tsx');
  const video = read('../src/components/nodes/VideoNode.tsx');
  const seedance = read('../src/components/nodes/SeedanceNode.tsx');
  const audio = read('../src/components/nodes/AudioNode.tsx');
  const llm = read('../src/components/nodes/LLMNode.tsx');
  const panorama = read('../src/components/nodes/Panorama3DNode.tsx');

  assert.match(image, /import PromptTextarea from '\.\.\/PromptTextarea'/);
  assert.match(image, /title="图像 Prompt"/);
  assert.match(image, /title="ComfyUI 正向 Prompt"/);
  assert.match(image, /title="ComfyUI 负向 Prompt"/);
  assert.match(image, /title="图像扩展模型 System Prompt"/);

  assert.match(video, /title="视频 Prompt"/);
  assert.match(seedance, /title="SD2\.0 Prompt"/);
  assert.match(audio, /title="音频歌词 \/ 提示词"/);
  assert.match(llm, /title="LLM 系统提示词"/);
  assert.match(llm, /title="LLM 用户输入"/);
  assert.match(panorama, /title="3D 全景提示词"/);
});

test('configuration JSON and list editors reuse expanded prompt editing', () => {
  const apiSettings = read('../src/components/ApiSettings.tsx');

  assert.match(apiSettings, /import PromptTextarea from '\.\/PromptTextarea'/);
  assert.match(apiSettings, /title="ComfyUI Workflow JSON"/);
  assert.match(apiSettings, /title="ComfyUI fields JSON"/);
  assert.match(apiSettings, /editorKind="json"/);
  assert.match(apiSettings, /editorKind="lines"/);
  assert.match(apiSettings, /title=\{`\$\{provider\.label \|\| protocolLabel\} 图像模型`\}/);

});
