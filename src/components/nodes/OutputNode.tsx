import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Handle,
  Position,
  useNodeConnections,
  useNodesData,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeProps,
  type Node,
} from '@xyflow/react';
import { Box, MonitorPlay, Type as TypeIcon, Image as ImageIcon, Video as VideoIcon, Music, Download, Pencil, Check, Edit3, GitCompare, Trash2, Save, Grid2X2, Clapperboard, Layers } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useThemeStore } from '../../stores/theme';
import { logBus } from '../../stores/logs';
import { PORT_COLOR } from '../../config/portTypes';
import { resolveThemeTemplate } from '../../theme/defaultTemplates';
import ImageEditModal, { type ImageEditProduceMeta } from './ImageEditModal';
import ImageCompareModal from '../ImageCompareModal';
import CollectionSplitButton from '../CollectionSplitButton';
import LoopingVideo from '../LoopingVideo';
import MediaMetadataBadge from '../MediaMetadataBadge';
import SmartImage from '../SmartImage';
import SmartMediaPreviewModal from './shared/SmartMediaPreviewModal';
import { useMaterialDropTarget } from '../../hooks/useMaterialDropTarget';
import { useDragMaterialStore, type MaterialPayload } from '../../stores/dragMaterial';
import ResizableCorners from './ResizableCorners';
import SmartNodeComposer from './shared/SmartNodeComposer';
import SmartNodeShell from './shared/SmartNodeShell';
import { useNodeGeometrySync } from './shared/useNodeGeometrySync';
import { useSmartNodePanelToggle } from './shared/useSmartNodePanelToggle';
import { useOutsideClose } from './shared/useOutsideClose';
import { smartNodeComposerActions, useIsSmartNodeComposerOpen } from '../../stores/smartNodeComposer';
import { addResourceItem, saveAssetToDisk, type ResourceMediaKind } from '../../services/api';
import { generateImage } from '../../services/generation';
import { useApiKeysStore } from '../../stores/apiKeys';
import { effectiveModelId, modelsForKind } from '../../providers/modelCatalog';
import {
  createOutputMediaRemovalData,
  createOutputDataFromItem,
  fileNameFromUrl,
  isMaterialUrlHidden,
  mediaDownloadFileName,
  type MediaItem,
  type MediaKind,
} from '../../utils/mediaCollection';
import {
  extractImagesFromData,
  extractInputCandidatesFromData,
  isImageLikeUrl,
  type ImageCompareCandidate,
} from '../../utils/imageCompare';
import { collectMaterialSetBucketsFromData, valueOfMaterialSetItem } from '../../utils/materialSet';
import {
  buildOutputQuickActions,
  type OutputQuickAction,
  type OutputQuickActionId,
  type OutputQuickActionSurface,
} from '../../utils/outputQuickActions';
import {
  CREATIVE_TARGET_NODE_TYPE,
  buildAnnotationEditRequest,
  buildAnnotationEditResultPlacement,
} from '../../utils/canvasCreativeWorkflow';
// v1.2.10.5: 节点落点防重叠 —— 双击编辑产出 N 节点 3 列宫格整组避让
import { placeBatchNodes, defaultSizeOf, type Rect as PlacementRect } from '../../utils/nodePlacement';
import { downloadMediaUrl } from '../../utils/downloadMedia';

type OutputProduceMeta = ImageEditProduceMeta | { type: 'rh-capability'; label?: string };

/**
 * OutputNode - 通用输出素材节点 (中继展示型)
 *
 * 设计:
 *   1. 输入: 接收上游任意 文本/图像/视频/音频/3D模型 连入 (target handle, 左侧)
 *   2. 自动遍历上游节点的 data, 抽取所有可识别的:
 *      - 文本: prompt / reply / text / outputText
 *      - 图像: imageUrl / imageUrls[] / urls[] / generatedImages[]
 *      - 视频: videoUrl
 *      - 音频: audioUrl
 *   3. 分区显示, 图像/视频按原始宽高比 (object-contain + maxHeight) 不强制裁剪
 *   4. 文本双击进入可编辑状态, 编辑保存到 data.outputText (覆盖上游 live 文本)
 *      置空 outputText 时再次显示上游原文
 *   5. 输出: 收集到的 文本/图像/视频/音频/3D模型 同时透传到本节点自身 data 的
 *      prompt / imageUrl / imageUrls / urls / videoUrl / audioUrl / modelUrl 字段上,
 *      下游节点能像读上游一样读到 (source handle, 右侧, any)
 *
 * 渲染联动机制(重要):
 *   - 上游订阅: useNodeConnections + useNodesData (xyflow 官方 hook)
 *   - 下游透传: useEffect 监听 collected + displayText 变化,
 *     写不同字段避免踩 outputText (后者是「用户编辑覆盖」标记),
 *     同时手式比较 cur/next, 一致时不调 update 以免产生循环。
 */

const isVideoUrl = (u: string) => /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(u);
const isAudioUrl = (u: string) => /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u);
const isModel3DUrl = (u: string) => /\.(glb|gltf|obj|fbx|stl|usdz|zip)(\?|$)/i.test(u) || /^data:model\//i.test(u);

const NODE_INPUT_LABELS: Record<string, string> = {
  upload: '上传图',
  output: '上游输出图',
  image: '上游生成图',
  'frame-pair': '抽帧图',
  resize: '尺寸调整图',
  combine: '合成图',
  'grid-crop': '宫格切图',
  'grid-editor': '宫格拼图',
  'remove-bg': '抠图结果',
  upscale: '放大结果',
  relay: '中继图',
};

interface Collected {
  texts: string[];
  images: string[];
  videos: string[];
  audios: string[];
  models: string[];
}

const OutputNode = ({ id, data, selected, dragging }: NodeProps) => {
  const apiSettings = useApiKeysStore((state) => state.settings);
  const imageModels = useMemo(() => modelsForKind(apiSettings, 'image'), [apiSettings]);
  const annotationImageModel = effectiveModelId((data as any)?.apiModel || (data as any)?.model, imageModels);
  const update = useUpdateNodeData(id);
  const { theme, templateId, customTemplates } = useThemeStore();
  const isDark = theme === 'dark';
  const d = (data as any) || {};
  const rf = useReactFlow();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const smartComposerOpenLocal = useIsSmartNodeComposerOpen(id);
  const setSmartComposerOpenLocal = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) smartNodeComposerActions.open(id);
      else smartNodeComposerActions.close(id);
    },
    [id],
  );
  const [smartCardDragging, setSmartCardDragging] = useState(false);
  const smartNodeRef = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const syncOutputNodeGeometry = useNodeGeometrySync(id, updateNodeInternals);
  const imageClickTimerRef = useRef<number | null>(null);
  const imagePointerRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const activeTemplate = useMemo(
    () => resolveThemeTemplate(templateId, customTemplates),
    [templateId, customTemplates],
  );
  const previewTitle = previewUrl ? fileNameFromUrl(previewUrl) || previewUrl.split('/').pop() || '输出图片' : '';

  // 节点尺寸持久化在 data: 默认 (320, 高度由内容撑开 — smartCardHeight 仅在手动拖角后写入)
  // 拖角后由 ResizableCorners onResize/onResizeEnd 同步具体 px — 保证节点始终有具体尺寸 → wrapper measured 准确
  // → keepAspectRatio 生效 (同比例缩放) + handleBounds 准确 (连线稳定)
  const smartCardWidth = Math.max(260, Number(d?.smartCardWidth) || 320);
  const smartCardHeight = Number(d?.smartCardHeight) > 0 ? Math.max(160, Number(d?.smartCardHeight)) : undefined;

  useEffect(() => {
    return () => {
      if (imageClickTimerRef.current !== null) {
        window.clearTimeout(imageClickTimerRef.current);
      }
    };
  }, []);

  // 订阅连入本节点 target handle 的连接变化
  const connections = useNodeConnections({ id, handleType: 'target' });
  const upstreamIds = useMemo(
    () => Array.from(new Set(connections.map((c) => c.source))),
    [connections]
  );
  // 订阅上游节点的 data, 任何上游 data 变化都会触发重渲染
  const upstreamNodes = useNodesData(upstreamIds);

  // v1.2.9.5: 检测上游是否含 LoopNode —— 用于「直接接 LoopNode 的 OutputNode」空状态下显示友好提示,
  //         代替误导性的「连入上游...」占位 (循环器不产出素材 → OutputNode 本身也不应表现得像「坏掉」)。
  const upstreamHasLoop = useMemo(() => {
    const list = Array.isArray(upstreamNodes) ? upstreamNodes : [];
    return list.some((n: any) => n?.type === 'loop');
  }, [upstreamNodes]);

  // v1.2.8.4: 收集每个上游 source 上被连接的 sourceHandle 集合,
  //           供 FramePair 等多端口节点按 handle 区分输出 (与 useUpstreamMaterials 对齐)
  const handleMap = useMemo(() => {
    const m = new Map<string, Set<string | null>>();
    for (const c of connections) {
      let set = m.get(c.source);
      if (!set) { set = new Set<string | null>(); m.set(c.source, set); }
      set.add((c as any).sourceHandle ?? null);
    }
    return m;
  }, [connections]);

  // 细粒度字段签名: 防止 xyflow useNodesData 返回引用稳定导致 useMemo 漏重算;
  // 纯字符串变化 React 可靠跟踪，上游任何一个被迫关心的字段变动均会重算 collected。
  const upstreamSig = useMemo(() => {
    const list = Array.isArray(upstreamNodes) ? upstreamNodes : [];
    return list
      .map((n: any) => {
        const ud = n?.data || {};
        const arr1 = Array.isArray(ud.imageUrls) ? ud.imageUrls.join(',') : '';
        const arr2 = Array.isArray(ud.urls) ? ud.urls.join(',') : '';
        const arr3 = Array.isArray(ud.generatedImages) ? ud.generatedImages.join(',') : '';
        const arr4 = Array.isArray(ud.consumedTexts) ? ud.consumedTexts.join('\u241F') : '';
        const arr5 = Array.isArray(ud.textSegments) ? ud.textSegments.join('\u241F') : '';
        const arr6 = Array.isArray(ud.segments) ? ud.segments.join('\u241F') : '';
        const arr7 = Array.isArray(ud.texts) ? ud.texts.join('\u241F') : '';
        const arrModel1 = Array.isArray(ud.modelUrls) ? ud.modelUrls.join(',') : '';
        const arrModel2 = Array.isArray(ud.directModelUrls) ? ud.directModelUrls.join(',') : '';
        const arr8 = Array.isArray(ud.materialSetItems)
          ? JSON.stringify(ud.materialSetItems.map((item: any) => [item?.kind, item?.url, item?.text, item?.name]))
          : '';
        return [
          n?.id || '',
          n?.type || '',
          ud.materialSetKind || '',
          ud.outputText || '',
          ud.reply || '',
          ud.prompt || '',
          ud.text || '',
          ud.imageUrl || '',
          ud.videoUrl || '',
          ud.audioUrl || '',
          ud.audioUrl_1 || '', // Suno 双轨副轨; 漏写会导致只显示第 1 首
          ud.modelUrl || '',
          ud.directModelUrl || '',
          ud.firstFrameUrl || '', // v1.2.8.4: FramePair 双端口字段
          ud.lastFrameUrl || '',
          ud.__loopAccumulate ? `LA:${ud.__loopAccumulate}` : '', // v1.2.9.1: 循环累积标记 — 进入/退出循环时需重算 collected
          arr1,
          arr2,
          arr3,
          arr4,
          arr5,
          arr6,
          arr7,
          arrModel1,
          arrModel2,
          arr8,
        ].join('§');
      })
      .join('|');
  }, [upstreamNodes]);

  const collected = useMemo<Collected>(() => {
    const out: Collected = { texts: [], images: [], videos: [], audios: [], models: [] };

    // 「被 LLM 消化」文本跳过集: 与 useUpstreamMaterials 保持一致。
    // 场景: TextNode 同时连 LLM 和 OutputNode 时, 避免 原始 prompt + LLM reply 同现 2 条。
    const skipTextSet = new Set<string>();
    {
      const list0 = Array.isArray(upstreamNodes) ? upstreamNodes : [];
      for (const n of list0) {
        const ud: any = n?.data || {};
        const hasReply = typeof ud.reply === 'string' && ud.reply.trim().length > 0;
        if (!hasReply) continue;
        if (Array.isArray(ud.consumedTexts)) {
          for (const t of ud.consumedTexts) {
            if (typeof t === 'string') {
              const s = t.trim();
              if (s) skipTextSet.add(s);
            }
          }
        }
      }
    }

    const pushUnique = (arr: string[], v: any) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      if (arr.indexOf(s) === -1) arr.push(s);
    };
    const pushUniqueText = (arr: string[], v: any) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      if (skipTextSet.has(s)) return; // 已被 LLM 消化
      if (arr.indexOf(s) === -1) arr.push(s);
    };
    const pushTextSegment = (arr: string[], v: any) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      if (skipTextSet.has(s)) return;
      arr.push(s);
    };
    const pushClassifiedUrl = (value: any) => {
      if (typeof value !== 'string') return;
      const url = value.trim();
      if (!url) return;
      if (isModel3DUrl(url)) pushUnique(out.models, url);
      else if (isVideoUrl(url)) pushUnique(out.videos, url);
      else if (isAudioUrl(url)) pushUnique(out.audios, url);
      else pushUnique(out.images, url);
    };

    const directSnapshotOnly = d.directOutputSingleSnapshot === true;
    const directOnlyOutput = directSnapshotOnly;
    if (!directOnlyOutput) {
      const list = Array.isArray(upstreamNodes) ? upstreamNodes : [];
      for (const n of list) {
        const ud: any = n?.data || {};
        const sid = (n as any)?.id || '';
        const handles = handleMap.get(sid) || new Set<string | null>([null]);

        // 显式素材集: 按内部顺序透传；跳过旧字段读取，避免素材集同步字段造成重复。
        if ((n as any)?.type === 'material-set' && Array.isArray(ud.materialSetItems)) {
          const buckets = collectMaterialSetBucketsFromData(ud);
          buckets.text.forEach((item) => pushTextSegment(out.texts, valueOfMaterialSetItem(item)));
          buckets.image.forEach((item) => pushUnique(out.images, item.url));
          buckets.video.forEach((item) => pushUnique(out.videos, item.url));
          buckets.audio.forEach((item) => pushUnique(out.audios, item.url));
          continue;
        }

      // === v1.2.9.0: 循环累积模式 —— 上游节点被 LoopNode 标记 __loopAccumulate 时,
      //             跳过该上游的 fresh 字段收集 (让本节点 direct*Urls / directOutputText 的累积值独占显示)。
      //             这样跨轮产物不会被生成节点「本轮覆盖」的 fresh 担换, 循环结束后标记被 LoopNode 清除, 恢复正常透传。
        if (ud.__loopAccumulate) continue;

      // 文本: textSegments/texts 数组优先, 避免文本分割节点再把 joined prompt 当成第 N+1 项
        const textArrayFields = ['textSegments', 'segments', 'texts'];
        const textArrayField = textArrayFields.find((f) => Array.isArray(ud[f]) && ud[f].length > 0);
        if (textArrayField) {
          ud[textArrayField].forEach((item: any) => pushTextSegment(out.texts, item));
        } else {
          pushUniqueText(out.texts, ud.outputText);
          pushUniqueText(out.texts, ud.reply);
          pushUniqueText(out.texts, ud.prompt);
          pushUniqueText(out.texts, ud.text);
        }

      // === v1.2.8.4: FramePair 双端口语义 ===
      // 节点同时具备 firstFrameUrl + lastFrameUrl 字段时按 sourceHandle 过滤,
      //   - 'first' 端口 → 只输出首帧
      //   - 'last'  端口 → 只输出尾帧
      //   - null/默认  → 同时输出两帧 (autoOutput / 手动接默认 handle 的兼容)
      // 跳过通用 imageUrl/imageUrls 分支, 避免历史残留字段把双图都捞过来。
        const isFramePair =
          Object.prototype.hasOwnProperty.call(ud, 'firstFrameUrl') &&
          Object.prototype.hasOwnProperty.call(ud, 'lastFrameUrl');
        if (isFramePair) {
          const wantFirst = handles.has('first') || (handles.has(null) && !handles.has('last'));
          const wantLast = handles.has('last') || (handles.has(null) && !handles.has('first'));
          if (wantFirst) pushUnique(out.images, ud.firstFrameUrl);
          if (wantLast) pushUnique(out.images, ud.lastFrameUrl);
          // 视频/音频 此节点不会有, 跳过
          continue;
        }

      // 图像 - 单
        pushUnique(out.images, ud.imageUrl);
        // 图像 - 多
        const arrFields = ['imageUrls', 'urls', 'generatedImages'];
        for (const f of arrFields) {
          const v = ud[f];
          if (Array.isArray(v)) v.forEach((u) => (f === 'urls' ? pushClassifiedUrl(u) : pushUnique(out.images, u)));
        }

      // 3D 模型
        pushUnique(out.models, ud.modelUrl);
        pushUnique(out.models, ud.directModelUrl);
        if (Array.isArray(ud.modelUrls)) ud.modelUrls.forEach((u: any) => pushUnique(out.models, u));
        if (Array.isArray(ud.directModelUrls)) ud.directModelUrls.forEach((u: any) => pushUnique(out.models, u));

      // 视频
        pushUnique(out.videos, ud.videoUrl);

      // === v1.2.9.14: Suno 双端口语义 (与 FramePair 同模式) ===
      // AudioNode (Suno) 同时具备 audioUrl + audioUrl_1 字段时按 sourceHandle 过滤,
      //   - 'audio-0' → 主轨、 'audio-1' → 副轨、 null/默认 → 两轨
      // 跳过下面的通用 audioUrl/audioUrl_1 分支，避免重复加入。
        const isSuno =
          Object.prototype.hasOwnProperty.call(ud, 'audioUrl') &&
          Object.prototype.hasOwnProperty.call(ud, 'audioUrl_1');
        if (isSuno) {
          const wantA0 = handles.has('audio-0') || (handles.has(null) && !handles.has('audio-1'));
          const wantA1 = handles.has('audio-1') || (handles.has(null) && !handles.has('audio-0'));
          if (wantA0) pushUnique(out.audios, ud.audioUrl);
          if (wantA1) pushUnique(out.audios, ud.audioUrl_1);
          continue;
        }

        // 音频 (audioUrl 主轨, audioUrl_1 副轨——AudioNode/SunoNode 双输出口)
        pushUnique(out.audios, ud.audioUrl);
        pushUnique(out.audios, ud.audioUrl_1);
      }
    }

    // 独立模式 (双击编辑生成的产物 OutputNode):
    //   节点本身携带 directImageUrl/directImageUrls, 未连任何上游也能独立展示。
    //   这些产物不会被 pickKind/pickIndex 过滤干预, 在下面独立补补。
    //   v1.5: 新增 directVideoUrl / directAudioUrl / outputText 以支持跨节点拖拽投放。
    if (typeof d.directImageUrl === 'string' && d.directImageUrl) {
      pushUnique(out.images, d.directImageUrl);
    }
    if (Array.isArray(d.directImageUrls)) {
      d.directImageUrls.forEach((u: any) => pushUnique(out.images, u));
    }
    if (typeof d.directVideoUrl === 'string' && d.directVideoUrl) {
      pushUnique(out.videos, d.directVideoUrl);
    }
    // v1.2.8.3: 多产物数组 (LoopNode 串联 / 并联跨轮累积)
    if (Array.isArray(d.directVideoUrls)) {
      d.directVideoUrls.forEach((u: any) => pushUnique(out.videos, u));
    }
    if (typeof d.directAudioUrl === 'string' && d.directAudioUrl) {
      pushUnique(out.audios, d.directAudioUrl);
    }
    if (Array.isArray(d.directAudioUrls)) {
      d.directAudioUrls.forEach((u: any) => pushUnique(out.audios, u));
    }
    if (typeof d.directModelUrl === 'string' && d.directModelUrl) {
      pushUnique(out.models, d.directModelUrl);
    }
    if (Array.isArray(d.directModelUrls)) {
      d.directModelUrls.forEach((u: any) => pushUnique(out.models, u));
    }
    // v1.2.8.5: 循环器跨轮累积的文本联接作为独立一项加入 (已含 —— 分隔符)
    if (typeof d.directOutputText === 'string' && d.directOutputText) {
      pushUniqueText(out.texts, d.directOutputText);
    }
    if (Array.isArray(d.directTextSegments)) {
      d.directTextSegments.forEach((t: any) => pushUniqueText(out.texts, t));
    }

    // 兜底: 一些节点把视频/音频塞在 imageUrl, 通过扩展名识别再纠正
    out.images = out.images.filter((u) => {
      if (isModel3DUrl(u)) {
        if (out.models.indexOf(u) === -1) out.models.push(u);
        return false;
      }
      if (isVideoUrl(u)) {
        if (out.videos.indexOf(u) === -1) out.videos.push(u);
        return false;
      }
      if (isAudioUrl(u)) {
        if (out.audios.indexOf(u) === -1) out.audios.push(u);
        return false;
      }
      return true;
    });

    // === pickKind / pickIndex 过滤 ===
    // Canvas 自动创建多个 OutputNode 映射上游多项输出时,
    // 会在 data 里标记 pickKind ('text'/'image'/'video'/'audio') + pickIndex,
    // 则本节点只保留对应 kind 的第 pickIndex 项, 避免多图场景下
    // 所有 OutputNode 都重复显示全部输出。
    // 手动连连的 OutputNode 不带 pickKind => 保留原语义 (显示上游全部).
    //
    // v1.2.9.10: 累积模式短路 ——
    //   场景: LoopNode 跑完后下游 OutputNode 的 directImageUrls/directVideoUrls/directAudioUrls
    //         里累积了 N 张, 但 Canvas autoOutput 早在第一轮就把它升级为 pickKind='image', pickIndex=0,
    //         finally 清除 __loopAccumulate 后 collected.images 顺序变成 [fresh_lastRound, direct_r1, direct_r2 dedup],
    //         pickIndex=0 把全集砍成 [fresh_lastRound] → 用户只看到最后一轮 (典型 ImageNode/VideoNode/AudioNode 覆盖症状)。
    //   修复: 若 OutputNode 自身已有 direct*Urls / directOutputText 累积多项,
    //         说明它是 LoopNode 累积模式的 OutputNode, 跳过 pickKind 切割, 全量展示 fresh+direct 去重结果。
    //         注意: 输出素材持久化会给每个自动 OutputNode 写入单项 direct* 快照。
    //         单项快照仍必须保留 pickKind/pickIndex, 否则宫格剪裁等多产物会退回“每个输出节点显示整组”。
    //         与 FramePair 行为对齐 (FramePair 走 autoOutput 专属路径不带 pickKind, 不受此 BUG 影响)。
    const directTextSegments = Array.isArray(d.directTextSegments) ? d.directTextSegments : [];
    const directOutputTextSegments =
      typeof d.directOutputText === 'string' && d.directOutputText.trim()
        ? d.directOutputText.split('\n\n').map((item: string) => item.trim()).filter(Boolean)
        : [];
    const hasAnyDirectAccumulated =
      (Array.isArray(d.directImageUrls) && d.directImageUrls.length > 1) ||
      (Array.isArray(d.directVideoUrls) && d.directVideoUrls.length > 1) ||
      (Array.isArray(d.directAudioUrls) && d.directAudioUrls.length > 1) ||
      (Array.isArray(d.directModelUrls) && d.directModelUrls.length > 1) ||
      directTextSegments.length > 1 ||
      directOutputTextSegments.length > 1;
    const pickKind: string | undefined = (hasAnyDirectAccumulated || directSnapshotOnly) ? undefined : d.pickKind;
    const pickIndex: number | undefined =
      typeof d.pickIndex === 'number' ? d.pickIndex : undefined;
    if (pickKind && typeof pickIndex === 'number') {
      if (pickKind === 'text') {
        out.texts = out.texts[pickIndex] ? [out.texts[pickIndex]] : [];
        out.images = [];
        out.videos = [];
        out.audios = [];
        out.models = [];
      } else if (pickKind === 'image') {
        out.images = out.images[pickIndex] ? [out.images[pickIndex]] : [];
        out.videos = [];
        out.audios = [];
        out.models = [];
        // 图像项模式下还保留文本 (提示词) 以便下游可读
      } else if (pickKind === 'video') {
        const pairedText = out.texts[pickIndex] || (out.texts.length === 1 ? out.texts[0] : '');
        out.videos = out.videos[pickIndex] ? [out.videos[pickIndex]] : [];
        out.texts = pairedText ? [pairedText] : [];
        out.images = [];
        out.audios = [];
        out.models = [];
      } else if (pickKind === 'audio') {
        out.audios = out.audios[pickIndex] ? [out.audios[pickIndex]] : [];
        out.images = [];
        out.videos = [];
        out.models = [];
      } else if (pickKind === 'model3d') {
        out.models = out.models[pickIndex] ? [out.models[pickIndex]] : [];
        out.images = [];
        out.videos = [];
        out.audios = [];
      }
    }

    out.images = out.images.filter((u) => !isMaterialUrlHidden(d, 'image', u));
    out.videos = out.videos.filter((u) => !isMaterialUrlHidden(d, 'video', u));
    out.audios = out.audios.filter((u) => !isMaterialUrlHidden(d, 'audio', u));
    out.models = out.models.filter((u) => !isMaterialUrlHidden(d, 'model3d', u));

    return out;
  }, [upstreamNodes, upstreamSig, handleMap, d.pickKind, d.pickIndex, d.directOutputSingleSnapshot, d.directImageUrl, d.directImageUrls, d.directVideoUrl, d.directVideoUrls, d.directAudioUrl, d.directAudioUrls, d.directModelUrl, d.directModelUrls, d.modelUrl, d.modelUrls, d.directOutputText, d.directTextSegments, d.hiddenMaterialUrls]);

  // 文本编辑
  const overrideText: string = typeof d.outputText === 'string' ? d.outputText : '';
  const liveText = collected.texts.join('\n\n──────\n\n');
  const displayText = overrideText !== '' ? overrideText : liveText;
  const mediaPromptByUrl = useMemo(() => {
    const map = new Map<string, { prompt: string; negative: string }>();
    const clean = (value: any) => (typeof value === 'string' ? value.trim() : '');
    const readPrompt = (ud: any) => clean(ud?.lastPrompt) || clean(ud?.prompt) || clean(ud?.outputText) || clean(ud?.text) || clean(ud?.reply);
    const readNegative = (ud: any) => clean(ud?.negativePrompt) || clean(ud?.negative) || clean(ud?.providerParams?.negativePrompt) || clean(ud?.providerParams?.negative);
    const add = (value: any, prompt: string, negative: string) => {
      const url = clean(value);
      if (!url || map.has(url)) return;
      map.set(url, { prompt, negative });
    };
    const addArray = (values: any, prompt: string, negative: string) => {
      if (Array.isArray(values)) values.forEach((url) => add(url, prompt, negative));
    };

    const list = Array.isArray(upstreamNodes) ? upstreamNodes : [];
    for (const node of list) {
      const ud: any = (node as any)?.data || {};
      const prompt = readPrompt(ud);
      const negative = readNegative(ud);
      if (!prompt) continue;
      add(ud.imageUrl, prompt, negative);
      addArray(ud.imageUrls, prompt, negative);
      addArray(ud.urls, prompt, negative);
      addArray(ud.generatedImages, prompt, negative);
      add(ud.firstFrameUrl, prompt, negative);
      add(ud.lastFrameUrl, prompt, negative);
      add(ud.videoUrl, prompt, negative);
      addArray(ud.videoUrls, prompt, negative);
      add(ud.audioUrl, prompt, negative);
      add(ud.audioUrl_1, prompt, negative);
      addArray(ud.audioUrls, prompt, negative);
      add(ud.modelUrl, prompt, negative);
      add(ud.directModelUrl, prompt, negative);
      addArray(ud.modelUrls, prompt, negative);
      addArray(ud.directModelUrls, prompt, negative);
    }

    const ownPrompt = clean(d.lastPrompt) || clean(d.prompt) || clean(d.directOutputText) || displayText.trim();
    const ownNegative = readNegative(d);
    if (ownPrompt) {
      add(d.directImageUrl, ownPrompt, ownNegative);
      addArray(d.directImageUrls, ownPrompt, ownNegative);
      add(d.directVideoUrl, ownPrompt, ownNegative);
      addArray(d.directVideoUrls, ownPrompt, ownNegative);
      add(d.directAudioUrl, ownPrompt, ownNegative);
      addArray(d.directAudioUrls, ownPrompt, ownNegative);
      add(d.directModelUrl, ownPrompt, ownNegative);
      addArray(d.directModelUrls, ownPrompt, ownNegative);
      add(d.modelUrl, ownPrompt, ownNegative);
      addArray(d.modelUrls, ownPrompt, ownNegative);
    }
    return map;
  }, [d.directAudioUrl, d.directAudioUrls, d.directImageUrl, d.directImageUrls, d.directModelUrl, d.directModelUrls, d.directOutputText, d.directVideoUrl, d.directVideoUrls, d.lastPrompt, d.modelUrl, d.modelUrls, d.negative, d.negativePrompt, d.prompt, d.providerParams, displayText, upstreamNodes, upstreamSig]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const enterEdit = () => {
    setDraft(displayText);
    setEditing(true);
    setTimeout(() => taRef.current?.focus(), 30);
  };
  const saveEdit = () => {
    update({ outputText: draft });
    setEditing(false);
  };
  const cancelEdit = () => {
    setEditing(false);
  };
  const restoreLive = () => {
    update({ outputText: '' });
    setEditing(false);
  };

  const isEdited = overrideText !== '' && overrideText !== liveText;
  const HANDLE = PORT_COLOR.any;
  const accent = '#5eead4'; // teal-300, 与 nodeRegistry color: 'teal' 对齐
  const effectiveAccent = accent;
  const effectiveHandle = HANDLE;

  const total = collected.texts.length + collected.images.length + collected.videos.length + collected.audios.length + collected.models.length;
  const mediaTotal = collected.images.length + collected.videos.length + collected.audios.length + collected.models.length;
  const showTextSection = mediaTotal === 0 && (collected.texts.length > 0 || isEdited);
  const isSingleMediaCard = mediaTotal === 1 && !showTextSection;
  const smartComposerOpen = smartComposerOpenLocal && !smartCardDragging && !dragging;
  const smartOutputCardState = total === 0 ? 'empty' : 'result';
  const smartComposerWidth = Math.max(smartCardWidth, 520);

  // === 双击图片 → 裁剪/宫格弹窗 ===
  // 仅针对 collected.images 中的单张图生效; 产物“不”修改本节点, 而是
  // 以 directImageUrl 独立模式创建 N 个新 OutputNode (沉淀在本节点的右下区),
  // 取 id 前缀 'output-auto-edit-' 以与源 output-auto-* 区分 (不受重排接管).
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [compareState, setCompareState] = useState<{
    resultUrl: string;
    candidates: ImageCompareCandidate[];
  } | null>(null);

  const buildCompareCandidates = (resultUrl: string): ImageCompareCandidate[] => {
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>([resultUrl]);
    const out: ImageCompareCandidate[] = [];

    const push = (url: any, label: string, sourceNodeId?: string, sourceType?: string) => {
      if (typeof url !== 'string') return;
      const s = url.trim();
      if (!s || !isImageLikeUrl(s) || seen.has(s)) return;
      seen.add(s);
      out.push({ url: s, label, sourceNodeId, sourceType });
    };

    const directSourceIds = Array.from(new Set(connections.map((c) => c.source)));
    for (const sourceId of directSourceIds) {
      const sourceNode = nodeMap.get(sourceId);
      if (!sourceNode) continue;
      const sourceType = String(sourceNode.type || '');
      out.push(...extractInputCandidatesFromData(sourceNode.data, sourceId, sourceType, seen));

      const incoming = edges.filter((e) => e.target === sourceId);
      for (const edge of incoming as any[]) {
        const inputNode = nodeMap.get(edge.source);
        if (!inputNode) continue;
        const inputType = String(inputNode.type || '');
        const labelBase = NODE_INPUT_LABELS[inputType] || '上游输入图';
        const imgs = extractImagesFromData(inputNode.data, edge.sourceHandle ?? null);
        imgs.forEach((u, i) => {
          const label = inputType === 'frame-pair'
            ? (edge.sourceHandle === 'last' ? '尾帧' : edge.sourceHandle === 'first' ? '首帧' : `抽帧图 ${i + 1}`)
            : `${labelBase} ${i + 1}`;
          push(u, label, inputNode.id, inputType);
        });
        out.push(...extractInputCandidatesFromData(inputNode.data, inputNode.id, inputType, seen));
      }
    }

    collected.images.forEach((u, i) => {
      push(u, `当前输出 ${i + 1}`, id, 'output');
    });

    return out;
  };

  const openImageCompare = (resultUrl: string) => {
    setCompareState({
      resultUrl,
      candidates: buildCompareCandidates(resultUrl),
    });
  };

  const handleRemoveOutputMaterial = (kind: MediaKind, url: string) => {
    update(createOutputMediaRemovalData(d, kind, url));
    if (editingUrl === url) setEditingUrl(null);
    if (compareState?.resultUrl === url) setCompareState(null);
  };

  const splitOutputCollection = (kind: MediaKind, urls: string[]) => {
    if (!urls || urls.length <= 1) return;
    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 320;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 360;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const ts = Date.now();
    const COLS = 3;
    const targetType = kind === 'model3d' ? 'model-3d-preview' : 'output';
    const targetSize = defaultSizeOf(targetType);
    const COL_W = targetType === 'model-3d-preview' ? targetSize.w + 40 : 350;
    const ROW_H = Math.max(300, myH);
    const _sz = targetSize;
    const items: MediaItem[] = urls.map((url) => ({ kind, url }));
    const _desired: PlacementRect[] = items.map((_, i) => ({
      x: baseX + (i % COLS) * COL_W,
      y: baseY + Math.floor(i / COLS) * ROW_H,
      w: _sz.w,
      h: _sz.h,
    }));
    const _off = placeBatchNodes(_desired, rf.getNodes(), { source: `placement:split-output:${id}` });
    const newNodes: Node[] = items.map((item, i) => ({
      id: `${targetType}-split-${id}-${ts}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      type: targetType,
      position: {
        x: baseX + (i % COLS) * COL_W + _off.dx,
        y: baseY + Math.floor(i / COLS) * ROW_H + _off.dy,
      },
      data: createOutputDataFromItem(item),
      selected: false,
    } as Node));
    rf.addNodes(newNodes);
  };

  const placeQuickActionNode = (type: string, url: string, dataPatch: Record<string, any>) => {
    if (!url) return;
    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 320;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 360;
    const targetSize = defaultSizeOf(type);
    const desired: PlacementRect[] = [{
      x: (me?.position?.x ?? 0) + myW + 80,
      y: (me?.position?.y ?? 0) + Math.min(220, Math.max(0, myH - targetSize.h)),
      w: targetSize.w,
      h: targetSize.h,
    }];
    const off = placeBatchNodes(desired, rf.getNodes(), { source: `placement:quick-action:${id}:${type}` });
    rf.addNodes({
      id: `${type}-quick-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      position: { x: desired[0].x + off.dx, y: desired[0].y + off.dy },
      data: dataPatch,
      selected: false,
    } as Node);
  };

  const handleQuickAction = async (
    actionId: OutputQuickActionId,
    surface: OutputQuickActionSurface,
    url: string,
  ) => {
    if (!url) return;
    if (actionId === 'save-resource') {
      if (surface !== 'image' && surface !== 'video' && surface !== 'audio') return;
      const result = await addResourceItem({
        kind: surface as ResourceMediaKind,
        url,
        title: fileNameFromUrl(url) || `${surface}素材`,
        sourceNodeId: id,
      });
      if (result.success) {
        window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
        logBus.success((result as any).duplicate ? '资源库已有该素材' : '已保存到资源库', '输出快捷动作');
      } else {
        logBus.warn(result.error || '保存到资源库失败', '输出快捷动作');
      }
      return;
    }
    if (actionId === 'image-edit') {
      setEditingUrl(url);
      return;
    }
    if (actionId === 'grid-edit') {
      placeQuickActionNode('grid-editor', url, {
        gridEditorLocalItems: [{
          id: `quick-image-${Date.now()}`,
          url,
          title: fileNameFromUrl(url),
          origin: 'local',
        }],
      });
      return;
    }
    if (actionId === 'layer-agent') {
      placeQuickActionNode('layer-agent', url, {
        sourceImageUrl: url,
        imageUrl: url,
        status: 'idle',
        error: '',
      });
      return;
    }
    if (actionId === 'image-to-video') {
      placeQuickActionNode('video', url, {
        localRefImages: [url],
        prompt: displayText || '',
        soraMode: 'image_to_video',
        gkfMode: 'image_to_video',
      });
      return;
    }
    if (actionId === 'clip-studio') {
      placeQuickActionNode('clip-studio', url, {
        clipLocalVisuals: [{
          id: `quick-visual-${Date.now()}`,
          kind: surface === 'video' ? 'video' : 'image',
          url,
          label: fileNameFromUrl(url),
        }],
      });
    }
  };

  const renderQuickActions = (
    surface: OutputQuickActionSurface,
    url: string,
    className = '',
    iconOnly = false,
  ) => {
    const actions = buildOutputQuickActions({
      surface,
      url,
      hasImageEditor: true,
      hasGridEditor: true,
      hasLayerAgent: true,
      hasImageToVideo: true,
      hasClipStudio: true,
      hasDirector: false,
    });
    const visible = iconOnly
      ? actions.filter((action) => action.enabled && action.id !== 'image-edit')
      : actions.filter((action) => action.enabled || action.disabledReason);
    if (visible.length === 0) return null;
    const iconOf = (actionId: OutputQuickActionId) => {
      if (actionId === 'save-resource') return <Save size={13} />;
      if (actionId === 'image-edit') return <Edit3 size={13} />;
      if (actionId === 'grid-edit') return <Grid2X2 size={13} />;
      if (actionId === 'layer-agent') return <Layers size={13} />;
      if (actionId === 'image-to-video') return <VideoIcon size={13} />;
      if (actionId === 'clip-studio') return <Clapperboard size={13} />;
      return <MonitorPlay size={13} />;
    };
    return (
      <div className={`nodrag nopan t8-output-quick-actions ${iconOnly ? 't8-output-quick-actions--icons' : ''} ${className}`}>
        {visible.map((action: OutputQuickAction) => (
          <button
            key={action.id}
            type="button"
            disabled={!action.enabled}
            className={iconOnly ? 't8-output-quick-action-icon' : 't8-output-quick-action'}
            data-disabled={!action.enabled ? 'true' : undefined}
            title={action.disabledReason || action.label}
            aria-label={action.label}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!action.enabled) return;
              void handleQuickAction(action.id, surface, url);
            }}
          >
            {iconOnly ? iconOf(action.id) : action.label}
          </button>
        ))}
      </div>
    );
  };

  const runAnnotationEditProduce = async (
    cleanUrls: string[],
    meta: Extract<ImageEditProduceMeta, { type: 'annotation-edit' }>,
  ) => {
    const logSource = `annotation-edit-output:${id}`;
    if (cleanUrls.length < 2) {
      const error = new Error('标注改图需要同时包含干净原图和标注图');
      logBus.warn(error.message, logSource);
      throw error;
    }
    try {
      if (!annotationImageModel) throw new Error('请先拉取或手动填写图片模型');
      logBus.info('正在按标注说明生成改图结果', logSource);
      const request = buildAnnotationEditRequest({
        sourceNodeId: id,
        sourceImageUrl: cleanUrls[0],
        annotatedImageUrl: cleanUrls[1],
        instruction: meta.instruction,
        annotationTextCount: meta.annotationTextCount,
        annotationShapeCount: meta.annotationShapeCount,
        providerId: 'default-image',
        providerModel: annotationImageModel,
      });
      const result = await generateImage({
        model: annotationImageModel,
        apiModel: annotationImageModel,
        prompt: request.prompt,
        images: request.images,
        n: 1,
      });
      const resultUrls = (Array.isArray(result.urls) ? result.urls : []).map((url) => String(url || '').trim()).filter(Boolean);
      if (resultUrls.length === 0) throw new Error('标注改图完成但没有返回图片');
      const sourceNode = rf.getNode(id) || ({
        id,
        type: 'output',
        position: { x: 0, y: 0 },
        data: d,
      } as Node);
      const targetNode = rf.getNodes().find((node) => node.id !== id && node.selected && node.type === CREATIVE_TARGET_NODE_TYPE) || null;
      const placement = buildAnnotationEditResultPlacement({
        sourceNode,
        targetNode,
        targetMode: 'replace',
        resultUrls,
        request,
      });
      rf.setNodes((prev) => {
        const patched = prev.map((node) => {
          if (placement.targetPatch && targetNode && node.id === targetNode.id) {
            return { ...node, data: { ...(node.data as any), ...placement.targetPatch }, selected: true };
          }
          return placement.outputNode ? { ...node, selected: false } : node;
        });
        return placement.outputNode ? [...patched, placement.outputNode] : patched;
      });
      logBus.success(targetNode ? '标注改图结果已填入生成目标框' : '标注改图结果已创建到右侧', logSource);
    } catch (error: any) {
      logBus.error(error?.message || '标注改图失败', logSource);
      throw error;
    }
  };

  const handleProduce = (urls: string[], _meta?: OutputProduceMeta): void | Promise<void> => {
    const cleanUrls = (Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean);
    const rhMeta = _meta?.type === 'rh-capability' ? _meta : null;
    const isRhCapabilityOutput = Boolean(rhMeta);
    const logSource = `rh-image-output:${id}`;
    if (_meta?.type === 'annotation-edit') {
      return runAnnotationEditProduce(cleanUrls, _meta);
    }
    if (cleanUrls.length === 0) {
      if (isRhCapabilityOutput) logBus.warn(`${rhMeta?.label || 'RH 图像能力'}完成但没有可创建的图像 URL`, logSource);
      return;
    }
    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 320;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 360;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const COLS = 3;
    const COL_W = 350;
    const ROW_H = Math.max(360, myH); // 以本节点高度为下限避免重叠
    const ts = Date.now();
    // v1.2.10.5: 整组防重叠 —— 先算期望 3 列宫格, 再求公共偏移
    const _sz = defaultSizeOf('output');
    if (isRhCapabilityOutput) {
      logBus.info(`${rhMeta?.label || 'RH 图像能力'}准备创建 ${cleanUrls.length} 个输出素材节点`, logSource);
    }
    const _desired: PlacementRect[] = cleanUrls.map((_, i) => ({
      x: baseX + (i % COLS) * COL_W,
      y: baseY + Math.floor(i / COLS) * ROW_H,
      w: _sz.w, h: _sz.h,
    }));
    const _off = placeBatchNodes(_desired, rf.getNodes(), { source: `placement:produce:${id}` });
    const newNodes: Node[] = cleanUrls.map((u, i) => {
      const newId = `output-auto-edit-${id}-${ts}-${i}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      return {
        id: newId,
        type: 'output',
        position: {
          x: baseX + (i % COLS) * COL_W + _off.dx,
          y: baseY + Math.floor(i / COLS) * ROW_H + _off.dy,
        },
        data: {
          directImageUrl: u,
          // 便于下游节点从 data 读取 (与现有 effect 透传不冲突)
          imageUrl: u,
        },
        selected: isRhCapabilityOutput,
      } as Node;
    });
    if (isRhCapabilityOutput) {
      rf.setNodes((prev) => [...prev.map((node) => ({ ...node, selected: false })), ...newNodes]);
      const first = newNodes[0];
      if (first) {
        window.setTimeout(() => {
          try {
            rf.setCenter(first.position.x + _sz.w / 2, first.position.y + _sz.h / 2, {
              zoom: Math.max(0.7, Math.min(1.2, rf.getZoom())),
              duration: 320,
            });
          } catch {
            /* 视野定位失败不影响节点创建 */
          }
        }, 0);
      }
      logBus.success(`${rhMeta?.label || 'RH 图像能力'}已创建 ${newNodes.length} 个输出素材节点`, logSource);
    } else {
      rf.addNodes(newNodes);
    }
  };

  // === 跨节点拖拽: source (从 collected.* 拖出) ===
  // 独立函数避开 hooks-in-loop 限制
  const startDrag = useDragMaterialStore((s) => s.start);
  const beginMaterialDrag = (e: React.MouseEvent, payload: MaterialPayload) => {
    if (e.button !== 0) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(payload, e.clientX, e.clientY);
  };

  const openImagePreview = (url: string) => {
    setPreviewUrl(url);
  };

  const handleOutputImageClick = (e: React.MouseEvent, url: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey) return;
    if (imagePointerRef.current?.moved) {
      imagePointerRef.current = null;
      return;
    }
    e.stopPropagation();
    if (imageClickTimerRef.current !== null) {
      window.clearTimeout(imageClickTimerRef.current);
    }
    imageClickTimerRef.current = window.setTimeout(() => {
      imageClickTimerRef.current = null;
      openImagePreview(url);
    }, 180);
  };

  const handleOutputImageDoubleClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (imageClickTimerRef.current !== null) {
      window.clearTimeout(imageClickTimerRef.current);
      imageClickTimerRef.current = null;
    }
    setEditingUrl(url);
  };

  const handleOutputImageMouseDown = (e: React.MouseEvent, url: string) => {
    imagePointerRef.current = { x: e.clientX, y: e.clientY, moved: false };
    beginMaterialDrag(e, { kind: 'image', url, sourceNodeId: id, previewUrl: url });
  };

  const handleOutputImageMouseMove = (e: React.MouseEvent) => {
    const pointer = imagePointerRef.current;
    if (!pointer || pointer.moved) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 6) {
      pointer.moved = true;
    }
  };

  // === 跨节点拖拽: target (接收后以 direct* 独立模式补充, 不依赖上游) ===
  const handleDrop = (payload: MaterialPayload) => {
    if (payload.kind === 'image' && payload.url) {
      const cur: string[] = Array.isArray(d.directImageUrls) ? d.directImageUrls : [];
      if (!d.directImageUrl) {
        update({ directImageUrl: payload.url });
      } else if (cur.indexOf(payload.url) === -1) {
        update({ directImageUrls: [...cur, payload.url] });
      }
    } else if (payload.kind === 'video' && payload.url) {
      update({ directVideoUrl: payload.url });
    } else if (payload.kind === 'audio' && payload.url) {
      update({ directAudioUrl: payload.url });
    } else if (payload.kind === 'text' && typeof payload.text === 'string') {
      update({ outputText: payload.text });
    }
  };
  const { dropProps, isAccepting } = useMaterialDropTarget({
    id,
    accepts: ['image', 'video', 'audio', 'text'],
    onDrop: handleDrop,
  });

  // Composer open state is session-only; release it when the node unmounts.
  useEffect(() => () => smartNodeComposerActions.close(id), [id]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(syncOutputNodeGeometry);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [id, smartCardHeight, smartCardWidth, smartComposerOpen, syncOutputNodeGeometry]);

  // Kept alongside the composer-owned dismissal: ignores portalled floating editors.
  useOutsideClose({
    enabled: smartComposerOpenLocal,
    refs: smartNodeRef,
    onOutside: () => setSmartComposerOpenLocal(false),
  });

  const smartPanelToggle = useSmartNodePanelToggle({
    open: smartComposerOpenLocal,
    dragging,
    onToggle: setSmartComposerOpenLocal,
    onDragChange: setSmartCardDragging,
    onDragClose: () => setSmartComposerOpenLocal(false),
    ignoreSelector: '.nodrag, .react-flow__resize-control, input, textarea, select, button, [contenteditable="true"], [data-drag-source]',
  });

  // === v1.2.9.8: 彻底删除「OutputNode useEffect 自动累积 fresh」机制 (v1.2.9.2/4/7 抩废)
  //   原因: FramePair 等节点每轮多次 update + StrictMode 双调 + 二级链路 OutputNode → OutputNode
  //         + finally 清除 __loopAccumulate 后残留一次 fresh 被重复 push, 跨 useEffect / setNodes 的 race 无法仅由前端隔离。
  //   新机制: 累积完全由 LoopNode 在每轮 awaitNode 后调 functional setNodes 一次性写入 direct*Urls。
  //   OutputNode 仅保留: 上游 __loopAccumulate truthy 时 collected useMemo 跳过 fresh (避免中间闪烁干扰 OUT 展示)。

  // === 下游透传: 将 collected + displayText 写到自身 data 供下游节点读取 ===
  // 仅在生成的输出实际变化时调用 update, 避免 setNode 风暴.
  // 不踩 outputText (保留 「用户编辑覆盖」 语义), 文本透传到 prompt/text/reply.
  //
  // ⚡ 过滤规则 (需求 #3):
  //   - 若 collected 同时含有非文本素材 (图/视/音任一), 下游只需要非文本部分,
  //     清空 prompt/text/reply (避免下游生成节点误将上下文提示词一起当参考文本)
  //   - 若只有文本 (纯文本输出), 仍将文本透传到 prompt/text/reply
  useEffect(() => {
    const hasNonText =
      collected.images.length > 0 ||
      collected.videos.length > 0 ||
      collected.audios.length > 0 ||
      collected.models.length > 0;
    const passText = hasNonText ? '' : (displayText || '');
    const next: any = {
      prompt: passText,
      text: passText,
      reply: passText,
      imageUrl: collected.images[0] || '',
      imageUrls: collected.images.slice(),
      urls: collected.images.slice(),
      videoUrl: collected.videos[0] || '',
      audioUrl: collected.audios[0] || '',
      audioUrl_1: collected.audios[1] || '', // 透传 Suno 双轨副轨避免串联丢失
      modelUrl: collected.models[0] || '',
      modelUrls: collected.models.slice(),
      textSegments: hasNonText ? [] : collected.texts.slice(),
      segments: hasNonText ? [] : collected.texts.slice(),
    };
    const cur: any = {
      prompt: d.prompt || '',
      text: d.text || '',
      reply: d.reply || '',
      imageUrl: d.imageUrl || '',
      imageUrls: Array.isArray(d.imageUrls) ? d.imageUrls : [],
      urls: Array.isArray(d.urls) ? d.urls : [],
      videoUrl: d.videoUrl || '',
      audioUrl: d.audioUrl || '',
      audioUrl_1: d.audioUrl_1 || '',
      modelUrl: d.modelUrl || '',
      modelUrls: Array.isArray(d.modelUrls) ? d.modelUrls : [],
      textSegments: Array.isArray(d.textSegments) ? d.textSegments : [],
      segments: Array.isArray(d.segments) ? d.segments : [],
    };
    const changed =
      cur.prompt !== next.prompt ||
      cur.text !== next.text ||
      cur.reply !== next.reply ||
      cur.imageUrl !== next.imageUrl ||
      cur.videoUrl !== next.videoUrl ||
      cur.audioUrl !== next.audioUrl ||
      cur.audioUrl_1 !== next.audioUrl_1 ||
      cur.modelUrl !== next.modelUrl ||
      JSON.stringify(cur.imageUrls) !== JSON.stringify(next.imageUrls) ||
      JSON.stringify(cur.urls) !== JSON.stringify(next.urls) ||
      JSON.stringify(cur.modelUrls) !== JSON.stringify(next.modelUrls) ||
      JSON.stringify(cur.textSegments) !== JSON.stringify(next.textSegments) ||
      JSON.stringify(cur.segments) !== JSON.stringify(next.segments);
    if (changed) update(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayText, collected]);

  // === v1.2.10.2: 自动保存到本地路径 ===
  // 设计要点:
  //   1. OutputNode 是所有可执行节点输出的统一收口 → 在这里调一次保存实现全局能力
  //   2. 防重复保存: ref Set 记录本节点生命周期内已请求过的 url(纯前端去重, 后端还会再一道同名跳过防护)
  //   3. 静默失败: saveAssetToDisk 不抛错, 避免干扰主生成链路
  //   4. 远端 http(s) URL 也照位部 —— 后端会 fetch 拉取后保存, 不依赖前端报三方
  const savedUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const all: string[] = [
      ...collected.images,
      ...collected.videos,
      ...collected.audios,
      ...collected.models,
    ].filter(Boolean);
    if (all.length === 0) return;
    const fresh = all.filter((u) => !savedUrlsRef.current.has(u));
    if (fresh.length === 0) return;
    fresh.forEach((u) => savedUrlsRef.current.add(u));
    // 不 await: 并发发送, 静默失败
    fresh.forEach((u) => {
      saveAssetToDisk(u).catch(() => {/* 静默 */});
    });
  }, [collected]);

  const hasEditableImages = collected.images.length > 0;

  return (
    <SmartNodeShell
      rootRef={smartNodeRef}
      data-canvas-node-root={true}
      className={`t8-output-node relative flex flex-col ${selected ? 'is-selected' : ''}`}
      style={{ width: smartCardWidth, height: smartCardHeight, minWidth: 260 }}
      accessibleLabel="输出节点"
      smartState={smartOutputCardState}
      onKeyboardActivate={() => setSmartComposerOpenLocal(true)}
      rootProps={{
        ...dropProps,
        onPointerDown: smartPanelToggle.onPointerDown,
        onPointerMove: smartPanelToggle.onPointerMove,
        onPointerUp: smartPanelToggle.onPointerUp,
        onClick: smartPanelToggle.onClick,
        onPointerCancel: smartPanelToggle.onPointerCancel,
      }}
    >
      {/* 四角同比例缩放 (仅选中时出现) — 主题色 teal-300 */}
      <ResizableCorners
        selected={selected}
        minWidth={260}
        minHeight={160}
        accent={effectiveAccent}
        onResize={(_e, p) => update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) })}
        onResizeEnd={(_e, p) => {
          update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
          syncOutputNodeGeometry();
        }}
      />
      {/* target handle (左侧) - 上游任意类型可连入 */}
      <Handle
        type="target"
        position={Position.Left}
        className="t8-smart-node-port !border-0"
        style={{ top: '50%', background: effectiveHandle }}
        title="文本 / 图像 / 视频 / 音频 / 3D模型 任意类型可连入"
      />
      {/* source handle (右侧) - 作为中继节点可继续向下游透传 (any) */}
      <Handle
        type="source"
        position={Position.Right}
        className="t8-smart-node-port !border-0"
        style={{ top: '50%', background: effectiveHandle }}
        title="透传 文本 / 图像 / 视频 / 音频 / 3D模型 到下游"
      />

      {/* 内层裁切容器: 圆角 + 越界裁切, 不影响外层 handle */}
      {/* 高度逻辑: root 默认 height=auto 时 内层也 auto 跟随内容自然高;
          root 拖角后有具体 px 时, 内层 flex-1 撑满剩余 + min-h-0 允许内容 overflow */}
      <div
        className={`t8-node t8-smart-node-card t8-output-card ${selected ? 't8-smart-node-card--selected' : ''} ${
          isAccepting ? 't8-smart-node-card--accepting' : ''
        } ${isSingleMediaCard ? 't8-output-card--single-media' : ''} ${smartCardHeight ? 'flex-1 min-h-0' : ''}`}
        style={{
          ['--t8-output-accent' as any]: effectiveAccent,
          overflow: isSingleMediaCard ? 'hidden' : 'auto',
          width: '100%',
        }}
      >

      {/* 头部 */}
      <div
        className="t8-output-header"
      >
        <div
          className="t8-output-header__icon"
        >
          <MonitorPlay size={13} />
        </div>
        <div className="t8-output-header__title">
          输出素材
        </div>
        <span className="t8-output-header__count">
          {total} 项
        </span>
      </div>

      {/* body */}
      <div className="t8-output-body">
        {total === 0 && (
          <div
            className={`rounded flex items-center justify-center text-[11px] py-3 px-2 text-center ${
              isDark ? 'text-white/40' : 'text-zinc-400'
            }`}
          >
            {upstreamHasLoop
              ? '循环器不输出素材 · 请在「循环器 → EXEC 节点 → OutputNode」链路中查看累积结果'
              : '连入上游 文本 / 图像 / 视频 / 音频 / 3D模型 节点'}
          </div>
        )}

        {/* 文本区(只读预览 — 点击卡片打开输出节点属性编辑) */}
        {showTextSection && (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 text-[10px] ${isDark ? 'text-white/50' : 'text-zinc-500'}`}>
              <TypeIcon size={11} />
              <span className="flex-1">文本{isEdited ? ' · 已编辑' : ''}</span>
            </div>
            <div
              onWheelCapture={(e) => e.stopPropagation()}
              className={`nowheel whitespace-pre-wrap break-words text-[12px] leading-relaxed rounded px-2 py-1.5 cursor-pointer ${
                isDark ? 'bg-white/5 text-white/85' : 'bg-black/5 text-zinc-800'
              }`}
              style={{ maxHeight: 96, overflow: 'auto' }}
              title="点击打开输出节点属性编辑文本"
            >
              {displayText || <span className="opacity-50">(空)</span>}
            </div>
          </div>
        )}

        {/* 图像区 */}
        {collected.images.length > 0 && (
          <div className="t8-output-section group/output-images">
            <div className="t8-output-section-label">
              <ImageIcon size={11} />
              <span className="flex-1">图像 ({collected.images.length})</span>
              <CollectionSplitButton
                count={collected.images.length}
                kindLabel="图像"
                onSplit={() => splitOutputCollection('image', collected.images)}
                className="opacity-100 transition sm:opacity-0 sm:group-hover/output-images:opacity-100 sm:focus-within:opacity-100"
              />
            </div>
            {/* 单张：全宽大图预览；多张：2 列原比例预览，操作按钮放在图片上方，避免遮挡下载。 */}
            <div
              className={
                collected.images.length >= 2
                  ? 'grid grid-cols-2 gap-1.5'
                  : 'space-y-1'
              }
            >
              {collected.images.map((u, i) => {
                const iconSize = collected.images.length >= 2 ? 10 : 14;
                return (
                <div key={i} className="t8-output-media-card group group/output-image-card">
                  <div
                    className={
                      collected.images.length >= 2
                        ? 't8-output-image-action-stack t8-output-image-action-stack--compact t8-output-image-action-stack--above z-10 mb-1 flex flex-row justify-end gap-1 opacity-100'
                        : 't8-output-image-action-stack t8-output-media-tools t8-output-media-tools--outside absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-100 transition group-hover/output-image-card:opacity-100'
                    }
                  >
                      <button
                        type="button"
                        className="nodrag nopan t8-btn t8-mini-icon-button t8-material-action-button p-0 shadow-md transition"
                        title="编辑图像"
                        aria-label="编辑图像"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingUrl(u);
                        }}
                      >
                        <Edit3 size={iconSize} />
                      </button>
                      <button
                        type="button"
                        className="nodrag nopan t8-btn t8-mini-icon-button t8-image-compare-button t8-material-action-button p-0 shadow-md transition"
                        title="对比输入图与结果图"
                        aria-label="对比输入图与结果图"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openImageCompare(u);
                        }}
                      >
                        <GitCompare size={iconSize} />
                      </button>
                      {renderQuickActions('image', u, '', true)}
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={mediaDownloadFileName('image', u, i)}
                        className="nodrag nopan t8-btn t8-mini-icon-button t8-material-action-button p-0 shadow-md transition"
                        title="下载图像"
                        aria-label="下载图像"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void downloadMediaUrl('image', u, i);
                        }}
                      >
                        <Download size={iconSize} />
                      </a>
                      <button
                        type="button"
                        className="nodrag nopan t8-btn t8-mini-icon-button t8-material-delete-button t8-material-action-button p-0 shadow-md transition"
                        title={`删除素材 ${i + 1}`}
                        aria-label={`删除素材 ${i + 1}`}
                        style={{ color: 'var(--t8-danger, #ef4444)' }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRemoveOutputMaterial('image', u);
                        }}
                      >
                        <Trash2 size={iconSize} />
                      </button>
                  </div>
                  <div className="t8-output-media-frame">
                    <SmartImage
                      src={u}
                      alt={`图像 ${i + 1}`}
                      className={`t8-output-media t8-output-image-media${collected.images.length >= 2 ? ' t8-output-image-media--grid' : ''} w-full rounded block cursor-zoom-in`}
                      thumbSize={collected.images.length >= 2 ? 420 : 720}
                      style={{
                        objectFit: 'contain',
                      }}
                      data-drag-source
                      data-drag-kind="image"
                      data-drag-url={u}
                      data-drag-preview={u}
                      data-drag-node-id={id}
                      data-resource-title={u.split('/').pop()}
                      data-prompt-template-kind="image"
                      data-prompt-template-category="image-reference-edit"
                      data-prompt-template-prompt={mediaPromptByUrl.get(u)?.prompt || displayText}
                      data-prompt-template-negative={mediaPromptByUrl.get(u)?.negative || ''}
                      onMouseDown={(e) => handleOutputImageMouseDown(e, u)}
                      onMouseMove={handleOutputImageMouseMove}
                      onClick={(e) => handleOutputImageClick(e, u)}
                      onDoubleClick={(e) => handleOutputImageDoubleClick(e, u)}
                      title="单击预览大图，双击编辑。Ctrl+拖拽可送到其他节点"
                    />
                  </div>
                  <div className="t8-output-media-meta">
                    <span className="truncate flex-1" title={u}>{u.split('/').pop()}</span>
                    <MediaMetadataBadge kind="image" url={u} className="t8-output-media-dimensions" />
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 视频区 */}
        {collected.videos.length > 0 && (
          <div className="t8-output-section group/output-videos">
            <div className="t8-output-section-label">
              <VideoIcon size={11} />
              <span className="flex-1">视频 ({collected.videos.length})</span>
              <CollectionSplitButton
                count={collected.videos.length}
                kindLabel="视频"
                onSplit={() => splitOutputCollection('video', collected.videos)}
                className="opacity-100 transition sm:opacity-0 sm:group-hover/output-videos:opacity-100 sm:focus-within:opacity-100"
              />
            </div>
            {collected.videos.map((u, i) => (
              <div key={i} className="t8-output-media-card">
                <div className="t8-output-media-frame">
                  <div className="t8-output-media-tools absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-100 transition">
                    {renderQuickActions('video', u, '', true)}
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={mediaDownloadFileName('video', u, i)}
                      className="nodrag nopan t8-btn t8-mini-icon-button t8-material-action-button p-0 shadow-md transition"
                      title="下载视频"
                      aria-label="下载视频"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void downloadMediaUrl('video', u, i);
                      }}
                    >
                      <Download size={13} />
                    </a>
                    <button
                      type="button"
                      className="nodrag nopan t8-btn t8-mini-icon-button t8-material-delete-button t8-material-action-button p-0 shadow-md transition"
                      title={`删除素材 ${i + 1}`}
                      aria-label={`删除素材 ${i + 1}`}
                      style={{ color: 'var(--t8-danger, #ef4444)' }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveOutputMaterial('video', u);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <LoopingVideo
                    src={u}
                    controls
                    className="t8-output-media w-full rounded block"
                    style={{ objectFit: 'contain' }}
                    data-drag-source
                    data-drag-kind="video"
                    data-drag-url={u}
                    data-drag-preview={u}
                    data-drag-node-id={id}
                    data-resource-title={u.split('/').pop()}
                    data-prompt-template-kind="video"
                    data-prompt-template-category="video-image-to-video"
                    data-prompt-template-prompt={mediaPromptByUrl.get(u)?.prompt || displayText}
                    data-prompt-template-negative={mediaPromptByUrl.get(u)?.negative || ''}
                    onMouseDown={(e) =>
                      beginMaterialDrag(e, { kind: 'video', url: u, sourceNodeId: id, previewUrl: u })
                    }
                  />
                </div>
                <div className="t8-output-media-meta">
                  <span className="truncate flex-1" title={u}>{u.split('/').pop()}</span>
                  <MediaMetadataBadge kind="video" url={u} className="t8-output-media-dimensions" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 音频区 */}
        {collected.audios.length > 0 && (
          <div className="t8-output-section group/output-audios">
            <div className="t8-output-section-label">
              <Music size={11} />
              <span className="flex-1">音频 ({collected.audios.length})</span>
              <CollectionSplitButton
                count={collected.audios.length}
                kindLabel="音频"
                onSplit={() => splitOutputCollection('audio', collected.audios)}
                className="opacity-100 transition sm:opacity-0 sm:group-hover/output-audios:opacity-100 sm:focus-within:opacity-100"
              />
            </div>
            {collected.audios.map((u, i) => (
              <div key={i} className="t8-output-media-card t8-output-media-card--audio">
                <div className="t8-output-audio-surface">
                  <div className="t8-output-audio-icon">
                    <Music size={18} />
                  </div>
                  <audio
                    src={u}
                    controls
                    className="t8-output-audio-player"
                    data-drag-source
                    data-drag-kind="audio"
                    data-drag-url={u}
                    data-drag-node-id={id}
                    data-resource-title={u.split('/').pop()}
                    data-prompt-template-kind="video"
                    data-prompt-template-category="video-music-audio"
                    data-prompt-template-prompt={mediaPromptByUrl.get(u)?.prompt || displayText}
                    data-prompt-template-negative={mediaPromptByUrl.get(u)?.negative || ''}
                    onMouseDown={(e) =>
                      beginMaterialDrag(e, { kind: 'audio', url: u, sourceNodeId: id })
                    }
                  />
                  <div className="t8-output-media-tools t8-output-audio-tools">
                    {renderQuickActions('audio', u, '', true)}
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={mediaDownloadFileName('audio', u, i)}
                      className="nodrag nopan t8-btn t8-mini-icon-button t8-material-action-button p-0 shadow-md transition"
                      title="下载音频"
                      aria-label="下载音频"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void downloadMediaUrl('audio', u, i);
                      }}
                    >
                      <Download size={13} />
                    </a>
                    <button
                      type="button"
                      className="nodrag nopan t8-btn t8-mini-icon-button t8-material-delete-button t8-material-action-button p-0 shadow-md transition"
                      title={`删除素材 ${i + 1}`}
                      aria-label={`删除素材 ${i + 1}`}
                      style={{ color: 'var(--t8-danger, #ef4444)' }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveOutputMaterial('audio', u);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="t8-output-media-meta">
                  <span className="truncate flex-1" title={u}>{u.split('/').pop()}</span>
                  <MediaMetadataBadge kind="audio" url={u} className="t8-output-media-dimensions" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3D 模型区 */}
        {collected.models.length > 0 && (
          <div className="group/output-models space-y-1">
            <div className={`flex items-center gap-1.5 text-[10px] ${isDark ? 'text-white/50' : 'text-zinc-500'}`}>
              <Box size={11} />
              <span className="flex-1">3D模型 ({collected.models.length})</span>
              <CollectionSplitButton
                count={collected.models.length}
                kindLabel="3D模型"
                onSplit={() => splitOutputCollection('model3d', collected.models)}
                className="opacity-100 transition sm:opacity-0 sm:group-hover/output-models:opacity-100 sm:focus-within:opacity-100"
              />
            </div>
            <div className="space-y-1.5">
              {collected.models.map((u, i) => (
                <div
                  key={i}
                  className={`rounded border px-2 py-2 ${
                    isDark ? 'border-white/10 bg-white/[0.04]' : 'border-black/10 bg-black/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded"
                      style={{ color: PORT_COLOR.model3d, background: `${PORT_COLOR.model3d}22`, boxShadow: `inset 0 0 0 1px ${PORT_COLOR.model3d}66` }}
                    >
                      <Box size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[11px] font-semibold ${isDark ? 'text-white/80' : 'text-zinc-800'}`} title={u}>
                        {fileNameFromUrl(u) || `3D模型 ${i + 1}`}
                      </div>
                      <div className={`truncate text-[10px] ${isDark ? 'text-white/40' : 'text-zinc-500'}`} title={u}>
                        连接到 3D模型预览节点查看 · {u}
                      </div>
                    </div>
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={mediaDownloadFileName('model3d', u, i)}
                      className={`nodrag nopan inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${
                        isDark ? 'hover:bg-white/10 text-white/60' : 'hover:bg-black/10 text-zinc-600'
                      }`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void downloadMediaUrl('model3d', u, i);
                      }}
                    >
                      <Download size={10} /> 下载
                    </a>
                    <button
                      type="button"
                      className={`nodrag nopan inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] ${
                        isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
                      }`}
                      title={`删除素材 ${i + 1}`}
                      aria-label={`删除素材 ${i + 1}`}
                      style={{ color: 'var(--t8-danger, #ef4444)' }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveOutputMaterial('model3d', u);
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {smartComposerOpen && (
        <SmartNodeComposer
          portal
          anchorRef={smartNodeRef}
          style={{ width: smartComposerWidth }}
          onMouseDown={(e) => e.stopPropagation()}
          onRequestClose={() => setSmartComposerOpenLocal(false)}
          ariaLabel="输出节点属性"
        >
          {/* 文本区 */}
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 text-[10px] ${isDark ? 'text-white/50' : 'text-zinc-500'}`}>
              <TypeIcon size={11} />
              <span className="flex-1">文本{isEdited ? ' · 已编辑' : ''}</span>
              {!editing && (
                <button
                  onClick={enterEdit}
                  className={`p-0.5 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}
                  title="双击文本或点此编辑"
                >
                  <Pencil size={10} />
                </button>
              )}
              {isEdited && !editing && (
                <button
                  onClick={restoreLive}
                  className={`text-[10px] px-1 rounded ${isDark ? 'hover:bg-white/10 text-white/60' : 'hover:bg-black/10 text-zinc-600'}`}
                  title="恢复为上游 live 文本"
                >
                  恢复
                </button>
              )}
            </div>
            {!editing ? (
              <div
                onDoubleClick={enterEdit}
                onWheelCapture={(e) => e.stopPropagation()}
                className={`nowheel whitespace-pre-wrap break-words text-[12px] leading-relaxed rounded px-2 py-1.5 cursor-text ${
                  isDark ? 'bg-white/5 text-white/85' : 'bg-black/5 text-zinc-800'
                }`}
                style={{ maxHeight: 200, overflow: 'auto' }}
                title="双击编辑"
              >
                {displayText || <span className="opacity-50">(空)</span>}
              </div>
            ) : (
              <div className="space-y-1">
                <textarea
                  ref={taRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  rows={6}
                  className={`w-full rounded px-2 py-1.5 text-[12px] outline-none nodrag nowheel ${
                    isDark
                      ? 'bg-black/40 text-white border border-teal-400/40'
                      : 'bg-white text-zinc-900 border border-teal-500/50'
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      cancelEdit();
                    }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.stopPropagation();
                      saveEdit();
                    }
                  }}
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={cancelEdit}
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      isDark ? 'bg-white/5 hover:bg-white/10 text-white/70' : 'bg-black/5 hover:bg-black/10 text-zinc-700'
                    }`}
                  >
                    取消
                  </button>
                  <button
                    onClick={saveEdit}
                    className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1 text-zinc-900"
                    style={{ background: effectiveAccent }}
                  >
                    <Check size={10} /> 保存
                  </button>
                </div>
                <div className={`text-[10px] ${isDark ? 'text-white/30' : 'text-zinc-400'}`}>
                  Ctrl+Enter 保存 / Esc 取消
                </div>
              </div>
            )}
          </div>

          {/* 素材统计 */}
          <div className="t8-smart-result-info" style={{ marginTop: 10 }}>
            <div className="t8-smart-result-info__row">
              <span>素材统计</span>
              <strong>{`文本 ${collected.texts.length} · 图像 ${collected.images.length} · 视频 ${collected.videos.length} · 音频 ${collected.audios.length} · 3D模型 ${collected.models.length}`}</strong>
            </div>
          </div>
        </SmartNodeComposer>
      )}

      <SmartMediaPreviewModal
        open={Boolean(previewUrl)}
        url={previewUrl}
        title={previewTitle}
        onClose={() => setPreviewUrl(null)}
        onSaveResource={() => previewUrl ? handleQuickAction('save-resource', 'image', previewUrl) : undefined}
      />
      {editingUrl && (
        <ImageEditModal
          srcUrl={editingUrl}
          onClose={() => setEditingUrl(null)}
          onProduce={handleProduce}
        />
      )}
      {compareState && (
        <ImageCompareModal
          resultUrl={compareState.resultUrl}
          inputCandidates={compareState.candidates}
          onClose={() => setCompareState(null)}
        />
      )}
    </SmartNodeShell>
  );
};

export default memo(OutputNode);
