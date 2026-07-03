import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type Node, type Edge, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Box,
  Download,
  Edit3,
  Eye,
  FileImage,
  FileVideo,
  Info,
  Layers2,
  Music,
  Plus,
  RefreshCcw,
  Trash2,
  Upload as UploadIcon,
  X,
} from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useThemeStore } from '../../stores/theme';
import { trackAchievementEvent } from '../../stores/achievements';
import { useHiddenFeatureStore, isRhDuckUploadEnabled } from '../../stores/hiddenFeatures';
import { PORT_COLOR } from '../../config/portTypes';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useDragMaterialStore, type MaterialPayload } from '../../stores/dragMaterial';
import { logBus } from '../../stores/logs';
import ImageEditModal, { type ImageEditProduceMeta } from './ImageEditModal';
import ResizableCorners from './ResizableCorners';
import LoopingVideo from '../LoopingVideo';
import MediaMetadataBadge from '../MediaMetadataBadge';
import RhImageCapabilityRail from '../RhImageCapabilityRail';
import SmartImage from '../SmartImage';
import { readImageNaturalSize } from '../../utils/imageNaturalSize';
import { generateImage } from '../../services/generation';
import { decodeDuckFiles, type DuckDecodeFileItem } from '../../services/api';
import { resolveThemeTemplate } from '../../theme/defaultTemplates';
import {
  createEmptyUploadMediaData,
  createOutputDataFromItems,
  createUploadDataFromItem,
  createUploadDataFromItems,
  createUploadMediaRemovalData,
  formatMediaSize,
  getMediaItemsFromData,
  mediaDownloadFileName,
  sameMediaUrls,
  type MediaItem,
  type MediaKind,
} from '../../utils/mediaCollection';
import {
  AUDIO_UPLOAD_ACCEPT,
  UNSUPPORTED_M4A_UPLOAD_MESSAGE,
  isUnsupportedUploadAudioFile,
  validateUploadMediaFile,
} from '../../utils/uploadMediaValidation';
import {
  CREATIVE_TARGET_NODE_TYPE,
  buildAnnotationEditRequest,
  buildAnnotationEditResultPlacement,
} from '../../utils/canvasCreativeWorkflow';
// v1.2.10.5: 节点落点防重叠
import { placeSingleNode, placeBatchNodes, defaultSizeOf, type Rect as PlacementRect } from '../../utils/nodePlacement';
import { useNodeGeometrySync } from './shared/useNodeGeometrySync';
import { downloadMediaUrl } from '../../utils/downloadMedia';

type UploadProduceMeta = ImageEditProduceMeta | { type: 'rh-capability'; label?: string };

/**
 * UploadNode - 通用上传素材节点
 *
 * 设计(v2 重构: 占除了"先选类型"步骤):
 *   1. 节点创建后默认就是"点击/拖拽上传"状态, accept = image/video/audio 三合一
 *   2. 选中/拖入文件 → 按 MIME 自动识别 kind (图像/视频/音频)
 *   3. 上传完成:保存 url 到对应字段(imageUrl / videoUrl / audioUrl)
 *      同时按类型选择正确的端口颜色
 *   4. Handle 颜色随 uploadType 变化(image=黄/video=粉/audio=紫);
 *      未上传时 Handle 为中性 any 色
 *   5. 已上传后右上角可重置/换文件
 *
 * 与下游联动:
 *   - 上游 nothing(无 target Handle)
 *   - 输出 → 通过 data.imageUrl/videoUrl/audioUrl 暴露给下游
 */
type UploadKind = MediaKind;

const KIND_META: Record<
  UploadKind,
  {
    label: string;
    accept: string;
    icon: typeof FileImage;
    color: string;
    dataField: 'imageUrl' | 'videoUrl' | 'audioUrl' | 'modelUrl';
    port: 'image' | 'video' | 'audio' | 'model3d';
  }
> = {
  image: {
    label: '图像',
    accept: 'image/*,.svg,image/svg+xml',
    icon: FileImage,
    color: PORT_COLOR.image,
    dataField: 'imageUrl',
    port: 'image',
  },
  video: {
    label: '视频',
    accept: 'video/*',
    icon: FileVideo,
    color: PORT_COLOR.video,
    dataField: 'videoUrl',
    port: 'video',
  },
  audio: {
    label: '音频',
    accept: AUDIO_UPLOAD_ACCEPT,
    icon: Music,
    color: PORT_COLOR.audio,
    dataField: 'audioUrl',
    port: 'audio',
  },
  model3d: {
    label: '3D模型',
    accept: '.glb,.gltf,.obj,.fbx,.stl,.usdz,.zip,model/gltf-binary,model/gltf+json,model/vnd.usdz+zip,application/octet-stream,application/zip',
    icon: Box,
    color: PORT_COLOR.model3d,
    dataField: 'modelUrl',
    port: 'model3d',
  },
};

const MODEL_3D_EXT_RE = /\.(glb|gltf|obj|fbx|stl|usdz|zip)$/i;

/** 通过文件 MIME 推断上传类型(支持拖拽时自动选定类型) */
function inferKindFromFile(file: File): UploadKind | null {
  const name = file.name || '';
  if (MODEL_3D_EXT_RE.test(name)) return 'model3d';
  const m = file.type;
  if (/\.svg$/i.test(name)) return 'image';
  if (!m) return null;
  if (m.startsWith('model/')) return 'model3d';
  if (m === 'image/svg+xml') return 'image';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return null;
}

function autoOutputNodeTypeForMedia(kind: MediaKind): 'output' | 'model-3d-preview' {
  return kind === 'model3d' ? 'model-3d-preview' : 'output';
}

function uploadMediaTitle(item: MediaItem | undefined, fallback: string): string {
  return String(item?.name || item?.url?.split('/').pop() || fallback).trim();
}

function clampUploadRatio(value: unknown): number {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.max(0.28, Math.min(3.6, ratio));
}

function uploadCardHeightForRatio(width: number, ratio: number): number {
  return Math.max(160, Math.min(640, Math.round(width / clampUploadRatio(ratio))));
}

const UploadNode = ({ id, data, selected, type }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const { theme, style, templateId, customTemplates } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const activeTemplate = useMemo(
    () => resolveThemeTemplate(templateId, customTemplates),
    [templateId, customTemplates],
  );
  const isRhDomVisual =
    typeof document !== 'undefined' && document.documentElement.dataset.themeVisual === 'rh';
  const isRhVisual = activeTemplate.visuals?.style === 'rh' || isRhDomVisual;
  const isYyhDomVisual =
    typeof document !== 'undefined' && document.documentElement.dataset.themeVisual === 'yyh';
  const isYyhVisual = activeTemplate.visuals?.style === 'yyh' || isYyhDomVisual;
  const rhDuckUploadIds = useHiddenFeatureStore((s) => s.rhDuckUploadIds);
  const clearRhDuckUpload = useHiddenFeatureStore((s) => s.clearRhDuckUpload);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const syncUploadNodeGeometry = useNodeGeometrySync(id, updateNodeInternals);
  const rf = useReactFlow();

  const [error, setError] = useState<string | null>(null);
  const [rhCapabilityBusy, setRhCapabilityBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // 图像编辑弹窗 src URL（与 OutputNode 双击逻辑保持一致）
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  const d = data as any;
  const rhDuckStoredMode =
    d?.rhDuckHiddenUpload === false
      ? false
      : Boolean(d?.rhDuckHiddenUpload || d?.rhDuckMode || d?.rhDuckUploadMode);
  const rhDuckStoreMode = isRhDuckUploadEnabled(rhDuckUploadIds, id);
  const rhDuckPersistentMode = Boolean(isRhVisual && type === 'upload' && (rhDuckStoredMode || rhDuckStoreMode));
  const lockedUploadType: UploadKind | null =
    type === 'model-3d-upload' || d?.lockedUploadType === 'model3d'
      ? 'model3d'
      : rhDuckPersistentMode
        ? 'image'
        : null;
  const uploadType: UploadKind | null =
    lockedUploadType === 'image' ? 'image' : d?.uploadType ?? lockedUploadType;
  const meta = uploadType ? KIND_META[uploadType] : null;
  const mediaItems = uploadType ? getMediaItemsFromData(d, uploadType) : [];
  const url: string | undefined = mediaItems[0]?.url;
  const rhDuckMode = Boolean(
    isRhVisual &&
      uploadType === 'image' &&
      (rhDuckStoredMode || rhDuckStoreMode),
  );
  const yyhPortraitUploadMode = Boolean(isYyhVisual && d?.yyhPortraitHidden);

  // 节点本地尺寸 state: 默认 (260, 高度由内容撑开 — 上传后图/视频会撑高 root)
  // 拖角后由 ResizableCorners onResize 同步具体 px (保证 measured 准确 + keepAspectRatio 生效 + handleBounds 准确)
  const [size, setSize] = useState<{ w: number; h?: number }>({ w: 260 });
  const uploadNodeUiVariant: 'smart-card' | 'classic' = d?.uiVariant === 'classic' ? 'classic' : 'smart-card';
  const useSmartCardUploadNode = uploadNodeUiVariant === 'smart-card';
  const smartUploadWidth = Math.max(220, Number(d?.smartUploadWidth) || size.w || 260);
  const smartUploadRatio = clampUploadRatio(d?.smartUploadRatio || (uploadType === 'audio' ? 1.65 : uploadType === 'model3d' ? 1.45 : 1));
  const smartUploadHeight = Math.max(
    180,
    Number(d?.smartUploadHeight) || (mediaItems.length > 0 ? uploadCardHeightForRatio(smartUploadWidth, smartUploadRatio) : 210),
  );
  const switchUploadNodeVariant = (variant: 'smart-card' | 'classic') => {
    flushSync(() => update({ uiVariant: variant }));
    syncUploadNodeGeometry();
  };
  const syncUploadMediaRatio = (width: number, height: number) => {
    if (!useSmartCardUploadNode || mediaItems.length !== 1) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const nextRatio = Number(clampUploadRatio(width / height).toFixed(4));
    const nextHeight = uploadCardHeightForRatio(smartUploadWidth, nextRatio);
    if (Math.abs(nextRatio - smartUploadRatio) > 0.01 || Math.abs(nextHeight - smartUploadHeight) > 2) {
      update({ smartUploadRatio: nextRatio, smartUploadHeight: nextHeight });
      syncUploadNodeGeometry();
    }
  };

  // === 运行总线: 点击 RUN 后根据已上传素材生成下游 OutputNode ===
  // 设计要点:
  //   1. 只有 url 已就绪才会创建, 未上传会报错
  //   2. 防重复: 检查是否已存在 source=id, target.type='output' 且 data.directXxxUrl=当前 url 的下游
  //      若已存在则仅提示不重复创建
  //   3. 创建后节点 id 以 'output-auto-up-' 开头, 避开 'output-auto-' 网格重排接管
  const handleRun = async () => {
    setError(null);
    if (!uploadType || !meta || mediaItems.length === 0) {
      const msg = '请先上传素材';
      setError(msg);
      throw new Error(msg);
    }
    const edges = rf.getEdges();
    const nodes = rf.getNodes();

    const toDecodedMediaItem = (source: MediaItem, decoded?: DuckDecodeFileItem): MediaItem | null => {
      if (!decoded?.decoded || !decoded.url) return null;
      if (decoded.kind !== 'image' && decoded.kind !== 'video' && decoded.kind !== 'audio') return null;
      return {
        kind: decoded.kind,
        url: decoded.url,
        name: decoded.filename || source.name,
        size: decoded.size,
        mime: decoded.mime || source.mime,
      };
    };

    let outputGroups: Array<{ kind: MediaKind; items: MediaItem[] }> = [{ kind: uploadType, items: mediaItems }];
    let outputFromRhDuckDecode = false;
    if (rhDuckMode && uploadType === 'image') {
      try {
        const decoded = await decodeDuckFiles(mediaItems.map((item) => item.url));
        if (decoded.decodedCount > 0) {
          const decodedBySource = new Map(decoded.items.map((item) => [item.sourceUrl, item]));
          const grouped = new Map<MediaKind, MediaItem[]>();
          const push = (item: MediaItem) => {
            const list = grouped.get(item.kind) || [];
            list.push(item);
            grouped.set(item.kind, list);
          };
          mediaItems.forEach((item) => {
            const decodedItem = toDecodedMediaItem(item, decodedBySource.get(item.url));
            if (decodedItem) push(decodedItem);
          });
          const decodedGroups = Array.from(grouped.entries()).map(([kind, items]) => ({ kind, items }));
          if (decodedGroups.length > 0) {
            outputGroups = decodedGroups;
            outputFromRhDuckDecode = true;
          }
        }
      } catch (e) {
        console.warn('[UploadNode] RH duck decode failed, fallback to normal upload output', e);
      }
    }

    const groupsToCreate = outputGroups.filter(({ kind, items }) => {
      if (items.length === 0) return false;
      const targetType = autoOutputNodeTypeForMedia(kind);
      return !edges.some((e) => {
        if (e.source !== id) return false;
        const t = nodes.find((n) => n.id === e.target);
        if (!t || t.type !== targetType) return false;
        if (kind === 'model3d') return true;
        const td = (t.data as any) || {};
        return sameMediaUrls(getMediaItemsFromData(td, kind), items);
      });
    });
    if (groupsToCreate.length === 0) return;

    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 320;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const ts = Date.now();
    const firstNodeType = autoOutputNodeTypeForMedia(groupsToCreate[0]?.kind || 'image');
    const _sz = defaultSizeOf(firstNodeType);
    const _singlePos = groupsToCreate.length === 1
      ? placeSingleNode(baseX, baseY, firstNodeType, nodes, { source: `placement:upload-auto:${id}` })
      : null;
    const _desired: PlacementRect[] = groupsToCreate.map(({ kind }, i) => {
      const sz = defaultSizeOf(autoOutputNodeTypeForMedia(kind));
      return ({
      x: _singlePos?.x ?? baseX,
      y: _singlePos?.y ?? baseY + i * Math.max(280, _sz.h + 40),
      w: sz.w,
      h: sz.h,
    });
    });
    const _off = groupsToCreate.length === 1
      ? { dx: 0, dy: 0 }
      : placeBatchNodes(_desired, nodes, { source: `placement:upload-auto:${id}` });
    const newNodes: Node[] = groupsToCreate.map(({ kind, items }, i) => {
      const targetType = autoOutputNodeTypeForMedia(kind);
      const newId = `${targetType}-auto-up-${id}-${ts}-${kind}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      return {
        id: newId,
        type: targetType,
        position: {
          x: _desired[i].x + _off.dx,
          y: _desired[i].y + _off.dy,
        },
        data: {
          ...createOutputDataFromItems(kind, items),
          ...(outputFromRhDuckDecode ? { rhDuckDecoded: true, rhDuckSourceNodeId: id } : {}),
        },
        selected: false,
      } as Node;
    });
    const newEdges: Edge[] = newNodes.map((node) => ({
      id: `e-auto-up-${node.id}`,
      source: id,
      target: node.id,
      type: 'deletable',
      ...(outputFromRhDuckDecode
        ? { className: 'rh-duck-edge', data: { rhDuckEdge: true } }
        : {}),
    } as Edge));
    rf.addNodes(newNodes);
    rf.setEdges((eds) => [...eds, ...newEdges]);
    if (outputFromRhDuckDecode) {
      trackAchievementEvent({ type: 'hidden_mode.used', theme: 'rh', kind: 'rh-duck', mode: 'used', nodeType: 'upload' });
    }
  };

  // 接入运行总线, 供 NodeActionBar / 批量运行 调起
  useRunTrigger(id, handleRun);

  // === 跨节点拖拽: source (从已上传缩略图 Ctrl+拖出) ===
  const startDrag = useDragMaterialStore((s) => s.start);
  const beginMaterialDrag = (e: React.MouseEvent, payload: MaterialPayload) => {
    if (e.button !== 0) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(payload, e.clientX, e.clientY);
  };

  /** 重置:清空所有字段,回到默认拖拽上传状态 */
  const handleReset = () => {
    if (!rhDuckMode) clearRhDuckUpload(id);
    update({
      ...createEmptyUploadMediaData(),
      uploadType: rhDuckMode ? 'image' : lockedUploadType,
      lockedUploadType: lockedUploadType === 'model3d' ? 'model3d' : undefined,
      ...(rhDuckMode ? { rhDuckHiddenUpload: true } : {}),
    });
    setError(null);
  };

  const handleRemoveUploadItem = (index: number) => {
    if (!uploadType) return;
    const emptyUploadType = lockedUploadType ?? (rhDuckMode ? 'image' : null);
    update({
      ...createUploadMediaRemovalData(d, uploadType, index, emptyUploadType),
      lockedUploadType: lockedUploadType === 'model3d' ? 'model3d' : undefined,
      ...(rhDuckMode ? { rhDuckHiddenUpload: true } : {}),
    });
    setError(null);
    if (editingUrl === mediaItems[index]?.url) setEditingUrl(null);
  };

  const uploadSingleFile = async (file: File, kind: UploadKind): Promise<MediaItem> => {
    const validationError = validateUploadMediaFile(file, kind);
    if (validationError) throw new Error(validationError);

    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `上传失败 HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success || !json.data?.url) {
      throw new Error(json.error || '上传失败:未返回 URL');
    }
    return {
      kind,
      url: json.data.url,
      name: file.name,
      size: file.size,
      mime: file.type,
    };
  };

  /** 真正执行上传(在已确定 kind 后); 同类型多文件会追加到当前合集 */
  const uploadFiles = async (files: File[], kind: UploadKind, skipped = 0) => {
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded: MediaItem[] = [];
      for (const file of files) {
        uploaded.push(await uploadSingleFile(file, kind));
      }
      const base = uploadType === kind ? mediaItems : [];
      update({
        ...createUploadDataFromItems(kind, [...base, ...uploaded]),
        ...(rhDuckMode ? { rhDuckHiddenUpload: true } : {}),
      });
      if (skipped > 0) {
        setError(`已上传 ${uploaded.length} 个${KIND_META[kind].label}，跳过 ${skipped} 个非同类型文件`);
      }
    } catch (e: any) {
      setError(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const prepareFiles = (rawFiles: File[]) => {
    const files = rawFiles.filter(Boolean);
    if (files.length === 0) return;
    const uploadableFiles = files.filter((file) => !isUnsupportedUploadAudioFile(file));
    if (uploadableFiles.length === 0) {
      setError(UNSUPPORTED_M4A_UPLOAD_MESSAGE);
      return;
    }
    const inferred = lockedUploadType ?? uploadType ?? uploadableFiles.map(inferKindFromFile).find(Boolean) ?? null;
    if (!inferred) {
      setError('无法识别文件类型,请选择图像/视频/音频/3D模型');
      return;
    }
    const accepted = uploadableFiles.filter((file) => inferKindFromFile(file) === inferred);
    const skipped = files.length - accepted.length;
    if (accepted.length === 0) {
      const km = KIND_META[inferred];
      setError(`文件类型不匹配:期望 ${km.label}`);
      return;
    }
    void uploadFiles(accepted, inferred, skipped);
  };

  /** 文件选择:自动按 MIME 推断 kind 后上传 */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // 允许重复选同一文件
    prepareFiles(files);
  };

  /** 拖拽上传:若 kind 未选则按文件 MIME 自动推断 */
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    prepareFiles(Array.from(e.dataTransfer?.files || []));
  };

  const triggerPick = () => fileInputRef.current?.click();

  // === 双击 / 上方「Edit」 → 启动图像编辑弹窗（仅 image 类型生效） ===
  // 逻辑对齐 OutputNode：编辑产物以独立 OutputNode 外挂到右侧，
  // 不修改当前上传节点本身的 imageUrl。
  const imageSourceUrls = useMemo(
    () => mediaItems.filter((item) => item.kind === 'image' && item.url).map((item) => item.url),
    [mediaItems],
  );
  const canEditImage = imageSourceUrls.length > 0 && uploadType === 'image';
  const openEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (canEditImage) setEditingUrl(imageSourceUrls[0]);
  };
  const runAnnotationEditProduce = async (
    cleanUrls: string[],
    meta: Extract<ImageEditProduceMeta, { type: 'annotation-edit' }>,
  ) => {
    const logSource = `annotation-edit-upload:${id}`;
    if (cleanUrls.length < 2) {
      const error = new Error('标注改图需要同时包含干净原图和标注图');
      logBus.warn(error.message, logSource);
      throw error;
    }
    try {
      logBus.info('正在按标注说明生成改图结果', logSource);
      const request = buildAnnotationEditRequest({
        sourceNodeId: id,
        sourceImageUrl: cleanUrls[0],
        annotatedImageUrl: cleanUrls[1],
        instruction: meta.instruction,
        annotationTextCount: meta.annotationTextCount,
        annotationShapeCount: meta.annotationShapeCount,
        providerId: 'default-image',
        providerModel: 'gpt-image-2',
      });
      const result = await generateImage({
        model: 'gpt-image-2',
        apiModel: 'gpt-image-2',
        prompt: request.prompt,
        images: request.images,
        n: 1,
      });
      const resultUrls = (Array.isArray(result.urls) ? result.urls : []).map((url) => String(url || '').trim()).filter(Boolean);
      if (resultUrls.length === 0) throw new Error('标注改图完成但没有返回图片');
      const sourceNode = rf.getNode(id) || ({
        id,
        type: 'upload',
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

  const handleProduce = (urls: string[], _meta?: UploadProduceMeta): void | Promise<void> => {
    const cleanUrls = (Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean);
    const isRhCapabilityOutput = _meta?.type === 'rh-capability';
    const logSource = `rh-image-output:${id}`;
    if (_meta?.type === 'annotation-edit') {
      return runAnnotationEditProduce(cleanUrls, _meta);
    }
    if (cleanUrls.length === 0) {
      if (isRhCapabilityOutput) logBus.warn(`${_meta.label || 'RH 图像能力'}完成但没有可创建的图像 URL`, logSource);
      return;
    }
    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 260;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 360;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const COLS = 3;
    const COL_W = 350;
    const ROW_H = Math.max(360, myH);
    const ts = Date.now();
    // v1.2.10.5: 整组防重叠 —— 先算 3 列宫格, 再求公共偏移
    const _sz = defaultSizeOf('output');
    if (isRhCapabilityOutput) {
      logBus.info(`${_meta.label || 'RH 图像能力'}准备创建 ${cleanUrls.length} 个输出素材节点`, logSource);
    }
    const _desired: PlacementRect[] = cleanUrls.map((_, i) => ({
      x: baseX + (i % COLS) * COL_W,
      y: baseY + Math.floor(i / COLS) * ROW_H,
      w: _sz.w, h: _sz.h,
    }));
    const _off = placeBatchNodes(_desired, rf.getNodes(), { source: `placement:upload-produce:${id}` });
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
      logBus.success(`${_meta.label || 'RH 图像能力'}已创建 ${newNodes.length} 个输出素材节点`, logSource);
    } else {
      rf.addNodes(newNodes);
    }
  };

  const splitUploadCollection = () => {
    if (!uploadType || mediaItems.length <= 1) return;
    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 260;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 240;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const ts = Date.now();
    const COLS = 3;
    const COL_W = 300;
    const ROW_H = Math.max(240, myH);
    const _sz = defaultSizeOf('upload');
    const _desired: PlacementRect[] = mediaItems.map((_, i) => ({
      x: baseX + (i % COLS) * COL_W,
      y: baseY + Math.floor(i / COLS) * ROW_H,
      w: _sz.w,
      h: _sz.h,
    }));
    const _off = placeBatchNodes(_desired, rf.getNodes(), { source: `placement:split-upload:${id}` });
    const newNodes: Node[] = mediaItems.map((item, i) => ({
      id: `upload-split-${id}-${ts}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      type: item.kind === 'model3d' ? 'model-3d-upload' : 'upload',
      position: {
        x: baseX + (i % COLS) * COL_W + _off.dx,
        y: baseY + Math.floor(i / COLS) * ROW_H + _off.dy,
      },
      data: {
        ...createUploadDataFromItem(item),
        ...(item.kind === 'model3d' ? { lockedUploadType: 'model3d' } : {}),
      },
      selected: false,
    } as Node));
    rf.addNodes(newNodes);
  };

  // ==================== 渲染 ====================
  const handleColor = meta?.color || PORT_COLOR.any;
  const effectiveHandleColor = rhDuckMode ? '#ff345f' : yyhPortraitUploadMode ? '#ff4fd8' : handleColor;
  const headerLabel = lockedUploadType === 'model3d' ? '3D素材上传' : meta ? `上传${meta.label}` : '上传素材';
  const totalSize = mediaItems.reduce((sum, item) => sum + (item.size || 0), 0);
  const firstItem = mediaItems[0];
  const previewItem = previewIndex === null ? null : mediaItems[previewIndex] || null;
  const compactSummary = mediaItems.length > 0
    ? `${meta?.label || '素材'} ${mediaItems.length} 项${totalSize > 0 ? ` · ${formatMediaSize(totalSize)}` : ''}`
    : uploading
      ? '上传中'
      : '拖拽或点击上传';
  const infoRows = [
    { label: '类型', value: meta?.label || '自动识别' },
    { label: '数量', value: `${mediaItems.length || 0} 项` },
    totalSize > 0 ? { label: '大小', value: formatMediaSize(totalSize) } : null,
    firstItem ? { label: '文件', value: uploadMediaTitle(firstItem, headerLabel) } : null,
    firstItem?.mime ? { label: '格式', value: firstItem.mime } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  useEffect(() => {
    if (!useSmartCardUploadNode) return;
    syncUploadNodeGeometry();
  }, [smartUploadHeight, smartUploadWidth, useSmartCardUploadNode, syncUploadNodeGeometry]);

  useEffect(() => {
    if (!useSmartCardUploadNode || uploadType !== 'image' || !firstItem?.url || mediaItems.length !== 1) return;
    let cancelled = false;
    readImageNaturalSize(firstItem.url, 8000).then((naturalSize) => {
      if (cancelled || !naturalSize) return;
      const ratio = naturalSize.width / naturalSize.height;
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      const nextRatio = Number(clampUploadRatio(ratio).toFixed(4));
      const nextHeight = uploadCardHeightForRatio(smartUploadWidth, nextRatio);
      if (Math.abs(nextRatio - smartUploadRatio) > 0.01 || Math.abs(nextHeight - smartUploadHeight) > 2) {
        update({ smartUploadRatio: nextRatio, smartUploadHeight: nextHeight });
        syncUploadNodeGeometry();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    firstItem?.url,
    mediaItems.length,
    smartUploadHeight,
    smartUploadRatio,
    smartUploadWidth,
    syncUploadNodeGeometry,
    update,
    uploadType,
    useSmartCardUploadNode,
  ]);

  if (!useSmartCardUploadNode) {
    return (
      <div
        data-upload-node-id={id}
        data-rh-duck-mode={rhDuckMode ? 'true' : undefined}
        data-yyh-portrait-hidden-upload={yyhPortraitUploadMode ? 'true' : undefined}
        className={`t8-node t8-upload-node-classic relative transition-all ${selected ? 't8-image-node-classic--selected' : ''}`}
        style={{ width: 280 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Handle
          type="source"
          position={Position.Right}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: effectiveHandleColor }}
          title={meta ? `输出 ${meta.label}` : '请先选择类型'}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={meta ? meta.accept : 'image/*,.svg,image/svg+xml,video/*,audio/*,.glb,.gltf,.obj,.fbx,.stl,.usdz,.zip'}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="t8-image-node-classic__header t8-node-header">
          <div className="t8-smart-node-icon" style={{ color: effectiveHandleColor }}>
            {meta ? <meta.icon size={14} /> : <UploadIcon size={14} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="t8-smart-node-title">{headerLabel}</div>
            <div className="t8-smart-node-subtitle">{compactSummary}</div>
          </div>
          <button
            type="button"
            className="nodrag nopan t8-btn t8-smart-classic-switch"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              switchUploadNodeVariant('smart-card');
            }}
            title="切回卡片版节点"
            aria-label="切回卡片版节点"
          >
            <RefreshCcw size={13} />
          </button>
        </div>
        <div className="t8-upload-classic-body">
          {mediaItems.length === 0 ? (
            <button type="button" className="nodrag nopan t8-btn t8-upload-classic-pick" onClick={triggerPick}>
              <UploadIcon size={14} />
              {uploading ? '上传中...' : dragActive ? '松开以上传' : '选择素材'}
            </button>
          ) : (
            <div className="t8-upload-classic-preview">
              {uploadType === 'image' && firstItem ? (
                <SmartImage src={firstItem.url} alt={uploadMediaTitle(firstItem, '上传图片')} thumbSize={520} className="h-full w-full object-cover" />
              ) : uploadType === 'video' && firstItem ? (
                <LoopingVideo src={firstItem.url} controls className="h-full w-full object-cover" />
              ) : uploadType === 'audio' && firstItem ? (
                <audio src={firstItem.url} controls className="nodrag nopan w-full" />
              ) : (
                <div className="t8-smart-upload-model-surface">
                  <Box size={22} />
                  <span>{uploadMediaTitle(firstItem, '3D模型')}</span>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="t8-smart-node-error t8-upload-classic-error">
              <AlertCircle size={12} />
              <span>{error}</span>
            </div>
          )}
          <div className="nodrag nopan t8-upload-classic-actions">
            <button type="button" className="t8-btn t8-smart-result-action" onClick={triggerPick}>添加</button>
            {canEditImage && <button type="button" className="t8-btn t8-smart-result-action" onClick={openEdit}>编辑</button>}
            {mediaItems.length > 0 && <button type="button" className="t8-btn t8-smart-result-action" onClick={handleReset}>清空</button>}
          </div>
        </div>
        {editingUrl && (
          <ImageEditModal
            srcUrl={editingUrl}
            onClose={() => setEditingUrl(null)}
            onProduce={handleProduce}
          />
        )}
      </div>
    );
  }

  return (
    <div
      data-upload-node-id={id}
      data-rh-duck-mode={rhDuckMode ? 'true' : undefined}
      data-yyh-portrait-hidden-upload={yyhPortraitUploadMode ? 'true' : undefined}
      className="t8-smart-image-node relative overflow-visible"
      style={{ width: smartUploadWidth }}
    >
      <div
        className={`t8-node t8-smart-node-card t8-smart-upload-card transition-all ${selected ? 't8-smart-node-card--selected' : ''} ${
          dragActive ? 't8-smart-node-card--accepting' : ''
        } ${infoOpen ? 't8-smart-upload-card--info-open' : ''}`}
        style={{
          height: smartUploadHeight,
          minHeight: mediaItems.length > 0 ? 180 : 210,
        }}
      >
        <ResizableCorners
          selected={selected}
          minWidth={220}
          minHeight={180}
          maxWidth={720}
          maxHeight={720}
          accent={effectiveHandleColor}
          keepAspectRatio={false}
          onResize={(_e, p) => {
            const nextWidth = Math.round(p.width);
            const nextHeight = Math.round(p.height);
            setSize({ w: nextWidth, h: nextHeight });
            update({
              smartUploadWidth: nextWidth,
              smartUploadHeight: nextHeight,
              smartUploadRatio: Number((nextWidth / Math.max(1, nextHeight)).toFixed(4)),
            });
            syncUploadNodeGeometry();
          }}
          onResizeEnd={(_e, p) => {
            const nextWidth = Math.round(p.width);
            const nextHeight = Math.round(p.height);
            update({
              smartUploadWidth: nextWidth,
              smartUploadHeight: nextHeight,
              smartUploadRatio: Number((nextWidth / Math.max(1, nextHeight)).toFixed(4)),
            });
            syncUploadNodeGeometry();
          }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: effectiveHandleColor }}
          title={meta ? `输出 ${meta.label}` : '请先选择类型'}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept={meta ? meta.accept : `image/*,.svg,image/svg+xml,video/*,${AUDIO_UPLOAD_ACCEPT},.glb,.gltf,.obj,.fbx,.stl,.usdz,.zip`}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="t8-smart-node-body">
          <div
            className="t8-smart-node-preview t8-smart-upload-preview"
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {mediaItems.length === 0 ? (
              <>
                <div className="t8-smart-upload-empty">
                  <span className="t8-smart-upload-empty__icon" style={{ color: effectiveHandleColor }}>
                    <UploadIcon size={28} />
                  </span>
                  <div className="t8-smart-upload-empty__copy">
                    <strong>{uploading ? '上传中...' : dragActive ? '松开以上传' : headerLabel}</strong>
                    <span>
                      {lockedUploadType === 'model3d'
                        ? 'glb / gltf / obj / fbx / stl / usdz / zip'
                        : rhDuckMode
                          ? 'RED 模式已锁定图像'
                          : '图像 / 视频 / 音频 / 3D模型'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="nodrag nopan t8-smart-upload-empty__action"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      triggerPick();
                    }}
                  >
                    {lockedUploadType === 'model3d'
                      ? '选择模型'
                      : rhDuckMode
                        ? '上传图像'
                        : '选择素材'}
                  </button>
                </div>
                <button
                  type="button"
                  className="nodrag nopan t8-btn t8-smart-variant-toggle"
                  title="切换到经典版节点"
                  aria-label="切换到经典版节点"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    switchUploadNodeVariant('classic');
                  }}
                >
                  <RefreshCcw size={13} />
                </button>
              </>
            ) : uploadType === 'image' ? (
              <div className={mediaItems.length > 1 ? 't8-smart-upload-grid' : 't8-smart-result-surface'}>
                {mediaItems.map((item, i) => (
                  <div key={`${item.url}-${i}`} className="t8-smart-upload-tile">
                    <SmartImage
                      src={item.url}
                      alt={uploadMediaTitle(item, `图像 ${i + 1}`)}
                      className="h-full w-full object-cover"
                      thumbSize={mediaItems.length > 1 ? 360 : 720}
                      data-drag-source
                      data-drag-kind="image"
                      data-drag-url={item.url}
                      data-drag-preview={item.url}
                      data-drag-node-id={id}
                      data-resource-title={item.name}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onLoad={(e) => {
                        if (mediaItems.length !== 1) return;
                        const img = e.currentTarget;
                        syncUploadMediaRatio(img.naturalWidth, img.naturalHeight);
                      }}
                      onMouseDown={(e) =>
                        beginMaterialDrag(e, { kind: 'image', url: item.url, sourceNodeId: id, previewUrl: item.url })
                      }
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setPreviewIndex(i);
                      }}
                      title="双击预览 · Ctrl+拖拽可送到其他节点"
                    />
                    {mediaItems.length > 1 && <span className="t8-smart-upload-count">{i + 1}</span>}
                    <MediaMetadataBadge kind="image" url={item.url} className="t8-smart-upload-metadata" />
                  </div>
                ))}
              </div>
            ) : uploadType === 'video' ? (
              <div className={mediaItems.length > 1 ? 't8-smart-upload-grid' : 't8-smart-result-surface'}>
                {mediaItems.map((item, i) => (
                  <div key={`${item.url}-${i}`} className="t8-smart-upload-tile">
                    <LoopingVideo
                      src={item.url}
                      controls={mediaItems.length === 1}
                      className="h-full w-full object-cover"
                      data-drag-source
                      data-drag-kind="video"
                      data-drag-url={item.url}
                      data-drag-preview={item.url}
                      data-drag-node-id={id}
                      data-resource-title={item.name}
                      onLoadedMetadata={(e) => {
                        if (mediaItems.length !== 1) return;
                        const video = e.currentTarget;
                        syncUploadMediaRatio(video.videoWidth, video.videoHeight);
                      }}
                      onMouseDown={(e) =>
                        beginMaterialDrag(e, { kind: 'video', url: item.url, sourceNodeId: id, previewUrl: item.url })
                      }
                    />
                    {mediaItems.length > 1 && <span className="t8-smart-upload-count">{i + 1}</span>}
                    <MediaMetadataBadge kind="video" url={item.url} className="t8-smart-upload-metadata" />
                  </div>
                ))}
              </div>
            ) : uploadType === 'audio' ? (
              <div className="t8-smart-upload-audio-surface">
                <div className="t8-smart-audio-center">
                  <div className="t8-smart-audio-cover t8-smart-audio-cover--empty">
                    <Music size={22} />
                  </div>
                  <div className="t8-smart-audio-info">
                    <div className="t8-smart-audio-title">{uploadMediaTitle(firstItem, '上传音频')}</div>
                    <div className="t8-smart-audio-subtitle">{compactSummary}</div>
                  </div>
                </div>
                {firstItem && (
                  <audio
                    src={firstItem.url}
                    controls
                    className="t8-smart-audio-player nodrag nopan"
                    data-drag-source
                    data-drag-kind="audio"
                    data-drag-url={firstItem.url}
                    data-drag-node-id={id}
                    data-resource-title={firstItem.name}
                    onMouseDown={(e) =>
                      beginMaterialDrag(e, { kind: 'audio', url: firstItem.url, sourceNodeId: id })
                    }
                  />
                )}
                {mediaItems.map((item, i) => (
                  <MediaMetadataBadge key={`${item.url}-${i}`} kind="audio" url={item.url} className="t8-smart-upload-metadata" />
                ))}
              </div>
            ) : uploadType === 'model3d' ? (
              <div className="t8-smart-upload-model-surface">
                <div className="t8-smart-audio-cover t8-smart-audio-cover--empty">
                  <Box size={24} />
                </div>
                <div className="t8-smart-audio-info">
                  <div className="t8-smart-audio-title">{uploadMediaTitle(firstItem, '3D模型')}</div>
                  <div className="t8-smart-audio-subtitle">{compactSummary}</div>
                </div>
              </div>
            ) : null}

            {mediaItems.length > 0 && meta && (
              <div className="t8-smart-upload-badge">
                <meta.icon size={11} />
                <span>{compactSummary}</span>
              </div>
            )}

            {mediaItems.length > 0 && (
              <div
                className="nodrag nopan t8-smart-result-tools t8-smart-upload-tools"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="t8-smart-result-tool"
                  title="切换到经典版节点"
                  aria-label="切换到经典版节点"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    switchUploadNodeVariant('classic');
                  }}
                >
                  <RefreshCcw size={14} />
                </button>
                <button
                  type="button"
                  className="t8-smart-result-tool"
                  title="预览素材"
                  aria-label="预览素材"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewIndex(0);
                    setInfoOpen(false);
                  }}
                >
                  <Eye size={14} />
                </button>
                <button
                  type="button"
                  className="t8-smart-result-tool"
                  data-active={infoOpen ? 'true' : 'false'}
                  title="素材信息"
                  aria-label="素材信息"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setInfoOpen((open) => !open);
                  }}
                >
                  <Info size={14} />
                </button>
                {canEditImage && (
                  <button
                    type="button"
                    className="t8-smart-result-tool"
                    title="编辑图像"
                    aria-label="编辑图像"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openEdit(e);
                      setInfoOpen(false);
                    }}
                  >
                    <Edit3 size={14} />
                  </button>
                )}
                {mediaItems.length > 1 && (
                  <button
                    type="button"
                    className="t8-smart-result-tool"
                    title="拆成独立上传节点"
                    aria-label="拆成独立上传节点"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      splitUploadCollection();
                      setInfoOpen(false);
                    }}
                  >
                    <Layers2 size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="t8-smart-result-tool"
                  title="继续添加"
                  aria-label="继续添加"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerPick();
                  }}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="t8-smart-result-tool"
                  title="清空素材"
                  aria-label="清空素材"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleReset();
                    setInfoOpen(false);
                    setPreviewIndex(null);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            {infoOpen && (
              <div
                className="nodrag nopan t8-smart-result-popover t8-smart-result-popover--info"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="t8-smart-result-popover__title">素材信息</div>
                <div className="t8-smart-result-info">
                  {infoRows.map((row) => (
                    <div key={row.label} className="t8-smart-result-info__row">
                      <span>{row.label}</span>
                      <strong title={row.value}>{row.value}</strong>
                    </div>
                  ))}
                </div>
                {mediaItems.length > 0 && (
                  <div className="t8-smart-upload-info-actions">
                    {mediaItems.map((item, i) => (
                      <button
                        key={`${item.url}-${i}`}
                        type="button"
                        className="t8-smart-result-action group-hover/upload-image:opacity-100"
                        title={`删除素材 ${uploadMediaTitle(item, `素材 ${i + 1}`)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRemoveUploadItem(i);
                        }}
                      >
                        删除素材 {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="t8-smart-node-error">
                <AlertCircle size={12} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {(selected || rhCapabilityBusy) && canEditImage && (
        <RhImageCapabilityRail
          sourceUrls={imageSourceUrls}
          accent={effectiveHandleColor}
          isDark={isDark}
          isPixel={isPixel}
          onComplete={(result) => handleProduce(result.imageUrls, { type: 'rh-capability', label: result.tool.title })}
          onError={setError}
          onRunningChange={setRhCapabilityBusy}
        />
      )}

      {previewItem && createPortal(
        <div
          className="nodrag nopan t8-smart-result-preview-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="上传素材预览"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPreviewIndex(null);
          }}
        >
          <div
            className="t8-smart-result-preview"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="t8-smart-result-preview__bar">
              <div>
                <div className="t8-smart-result-preview__title">{uploadMediaTitle(previewItem, '上传素材')}</div>
                <div className="t8-smart-result-preview__meta">
                  {previewItem.kind} {previewItem.size ? `· ${formatMediaSize(previewItem.size)}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="t8-btn t8-smart-result-preview__close"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPreviewIndex(null);
                }}
                title="关闭预览"
                aria-label="关闭预览"
              >
                <X size={15} />
              </button>
            </div>
            <div className="t8-smart-result-preview__body">
              {previewItem.kind === 'image' ? (
                <SmartImage
                  src={previewItem.url}
                  alt="上传图片大图预览"
                  className="t8-smart-result-preview__image"
                  thumbSize={1400}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                />
              ) : previewItem.kind === 'video' ? (
                <LoopingVideo src={previewItem.url} controls className="t8-smart-result-preview__image" />
              ) : previewItem.kind === 'audio' ? (
                <audio src={previewItem.url} controls className="w-full max-w-xl" />
              ) : (
                <a
                  className="t8-btn"
                  href={previewItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={mediaDownloadFileName(previewItem.kind, previewItem.url, 0, previewItem.mime)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void downloadMediaUrl(previewItem.kind, previewItem.url, 0, previewItem.mime);
                  }}
                >
                  <Download size={14} /> 下载模型
                </a>
              )}
            </div>
            {infoRows.length > 0 && (
              <div className="t8-smart-result-preview__info">
                {infoRows.slice(0, 5).map((row) => (
                  <span key={row.label} title={row.value}>{row.label}: {row.value}</span>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {editingUrl && (
        <ImageEditModal
          srcUrl={editingUrl}
          onClose={() => setEditingUrl(null)}
          onProduce={handleProduce}
        />
      )}
    </div>
  );
};

export default memo(UploadNode);
