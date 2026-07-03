import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import {
  ArrowDownUp,
  Download,
  FileText,
  FileUp,
  Images,
  ListPlus,
  Music,
  PackageOpen,
  Pin,
  Plus,
  RefreshCcw,
  RotateCcw,
  Shuffle,
  SortAsc,
  Trash2,
  Upload as UploadIcon,
  Video,
} from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useThemeStore } from '../../stores/theme';
import { PORT_COLOR } from '../../config/portTypes';
import { useUpstreamMaterials, type Material, type MaterialKind } from './useUpstreamMaterials';
import CollectionSplitButton from '../CollectionSplitButton';
import SmartImage from '../SmartImage';
import {
  createUploadDataFromItem,
  fileNameFromUrl,
  type MediaItem,
} from '../../utils/mediaCollection';
import ResizableCorners from './ResizableCorners';
import SmartNodeComposer from './shared/SmartNodeComposer';
import SmartNodeShell from './shared/SmartNodeShell';
import { useNodeGeometrySync } from './shared/useNodeGeometrySync';
import { useOutsideClose } from './shared/useOutsideClose';
import { useSmartNodePanelToggle } from './shared/useSmartNodePanelToggle';
import {
  isMaterialSetKind,
  createMaterialSetBackup,
  materialSetItemFromMedia,
  materialSetItemFromText,
  materialSetItemsToData,
  normalizeMaterialSetItems,
  parseMaterialSetBackup,
  valueOfMaterialSetItem,
  type MaterialSetItem,
  type MaterialSetKind,
} from '../../utils/materialSet';
import { defaultSizeOf, placeBatchNodes, type Rect as PlacementRect } from '../../utils/nodePlacement';

const KIND_LABEL: Record<MaterialSetKind, string> = {
  text: '文本',
  image: '图像',
  video: '视频',
  audio: '音频',
};

const KIND_ACCEPT: Record<Exclude<MaterialSetKind, 'text'>, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

type MaterialSetNodeVariant = 'smart-card' | 'classic';

function inferFileKind(file: File): Exclude<MaterialSetKind, 'text'> | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

function materialFromSetItem(item: MaterialSetItem, nodeId: string): Material {
  const value = valueOfMaterialSetItem(item);
  return {
    id: item.id,
    kind: item.kind as MaterialKind,
    url: value,
    sourceNodeId: nodeId,
    origin: 'local',
    label: item.name || (item.kind === 'text' ? value.slice(0, 24) : fileNameFromUrl(value)),
  };
}

function materialSetItemFromUpstream(m: Material): MaterialSetItem {
  return {
    id: `ms-${m.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: m.kind,
    ...(m.kind === 'text' ? { text: m.url } : { url: m.url }),
    name: m.label || (m.kind === 'text' ? m.url.slice(0, 24) : fileNameFromUrl(m.url)),
  };
}

function arrayMoveLocal<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const MaterialSetNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const themeMode = useThemeStore((state) => state.theme);
  const themeStyle = useThemeStore((state) => state.style);
  const smartRootRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [textDraft, setTextDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [smartPanelOpen, setSmartPanelOpen] = useState(false);
  const [smartDragging, setSmartDragging] = useState(false);
  const [sortDrag, setSortDrag] = useState<{ activeId: string; overId: string | null; moved: boolean } | null>(null);
  const sortDragRef = useRef<{ activeId: string; overId: string | null; moved: boolean } | null>(null);
  const sortStartRef = useRef<{ x: number; y: number; itemId: string; pointerId: number } | null>(null);
  const sortWindowCleanupRef = useRef<(() => void) | null>(null);
  const lastAutoCollectSignatureRef = useRef('');

  const d = (data as any) || {};
  const kind: MaterialSetKind | null = isMaterialSetKind(d.materialSetKind) ? d.materialSetKind : null;
  const materialSetNodeVariant: MaterialSetNodeVariant =
    d.uiVariant === 'classic' || d.materialSetNodeVariant === 'classic' ? 'classic' : 'smart-card';
  const useSmartCardMaterialSetNode = materialSetNodeVariant !== 'classic';
  const smartCardWidth = Math.max(220, Number(d.smartMaterialSetWidth) || 260);
  const smartCardHeight = Math.max(150, Number(d.smartMaterialSetHeight) || 210);
  const syncMaterialSetGeometry = useNodeGeometrySync(id, updateNodeInternals);
  const items = useMemo(
    () => (kind ? normalizeMaterialSetItems(d.materialSetItems, kind) : []),
    [d.materialSetItems, kind],
  );
  const materials = useMemo(() => items.map((item) => materialFromSetItem(item, id)), [items, id]);

  const upstream = useUpstreamMaterials(id);
  const upstreamCandidate = useMemo(() => {
    const buckets: Record<MaterialSetKind, Material[]> = {
      text: upstream.texts,
      image: upstream.images,
      video: upstream.videos,
      audio: upstream.audios,
    };
    if (kind) return { kind, list: buckets[kind] };
    const nonEmpty = (Object.keys(buckets) as MaterialSetKind[]).filter((k) => buckets[k].length > 0);
    return nonEmpty.length === 1 ? { kind: nonEmpty[0], list: buckets[nonEmpty[0]] } : null;
  }, [kind, upstream]);

  const commitItems = (nextKind: MaterialSetKind, nextItems: MaterialSetItem[]) => {
    update(materialSetItemsToData(nextKind, nextItems));
  };

  const switchKind = (nextKind: MaterialSetKind) => {
    if (nextKind === kind) return;
    if (items.length > 0 && !window.confirm('切换素材集类型会清空当前素材，确定继续？')) return;
    commitItems(nextKind, []);
  };

  const clearAll = () => {
    if (items.length > 0 && !window.confirm('清空当前素材集？')) return;
    lastAutoCollectSignatureRef.current = '';
    if (kind) commitItems(kind, []);
    else update({ materialSetKind: null, materialSetItems: [] });
  };

  const setSortDragState = (next: typeof sortDrag) => {
    sortDragRef.current = next;
    setSortDrag(next);
  };

  const cleanupSortWindowListeners = () => {
    sortWindowCleanupRef.current?.();
    sortWindowCleanupRef.current = null;
  };

  const findSortOverId = (clientX: number, clientY: number): string | null => {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (!(el instanceof HTMLElement)) continue;
      const thumb = el.closest(`[data-material-set-node="${id}"][data-material-set-thumb-id]`) as HTMLElement | null;
      if (thumb) return thumb.dataset.materialSetThumbId || null;
    }
    return null;
  };

  const beginSortDrag = (event: PointerEvent<HTMLDivElement>, itemId: string) => {
    if (!kind || items.length <= 1) return;
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cleanupSortWindowListeners();
    sortStartRef.current = { x: event.clientX, y: event.clientY, itemId, pointerId: event.pointerId };
    setSortDragState({ activeId: itemId, overId: itemId, moved: false });
    const onWindowMove = (nativeEvent: globalThis.PointerEvent) => {
      const current = sortDragRef.current;
      const start = sortStartRef.current;
      if (!current || !start) return;
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      const moved = current.moved || Math.hypot(nativeEvent.clientX - start.x, nativeEvent.clientY - start.y) >= 3;
      const overId = findSortOverId(nativeEvent.clientX, nativeEvent.clientY) || current.overId;
      if (moved !== current.moved || overId !== current.overId) {
        setSortDragState({ ...current, moved, overId });
      }
    };
    const onWindowUp = (nativeEvent: globalThis.PointerEvent) => {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      finishSortDrag();
    };
    window.addEventListener('pointermove', onWindowMove, true);
    window.addEventListener('pointerup', onWindowUp, true);
    window.addEventListener('pointercancel', onWindowUp, true);
    sortWindowCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWindowMove, true);
      window.removeEventListener('pointerup', onWindowUp, true);
      window.removeEventListener('pointercancel', onWindowUp, true);
    };
  };

  const moveSortDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = sortDragRef.current;
    const start = sortStartRef.current;
    if (!current || !start) return;
    event.preventDefault();
    event.stopPropagation();
    const moved = current.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 3;
    const overId = findSortOverId(event.clientX, event.clientY) || current.overId;
    if (moved !== current.moved || overId !== current.overId) {
      setSortDragState({ ...current, moved, overId });
    }
  };

  const endSortDrag = (event: PointerEvent<HTMLDivElement>) => {
    const start = sortStartRef.current;
    if (start) event.currentTarget.releasePointerCapture?.(start.pointerId);
    event.preventDefault();
    event.stopPropagation();
    finishSortDrag();
  };

  const finishSortDrag = () => {
    const current = sortDragRef.current;
    if (!current) return;
    cleanupSortWindowListeners();
    if (kind && current.moved && current.overId && current.activeId !== current.overId) {
      const oldIndex = items.findIndex((item) => item.id === current.activeId);
      const newIndex = items.findIndex((item) => item.id === current.overId);
      if (oldIndex >= 0 && newIndex >= 0) commitItems(kind, arrayMoveLocal(items, oldIndex, newIndex));
    }
    sortStartRef.current = null;
    setSortDragState(null);
  };

  const cancelSortDrag = () => {
    cleanupSortWindowListeners();
    sortStartRef.current = null;
    setSortDragState(null);
  };

  const removeItem = (itemId: string) => {
    if (!kind) return;
    commitItems(kind, items.filter((item) => item.id !== itemId));
  };

  const reorderItems = (mode: 'reverse' | 'name' | 'random') => {
    if (!kind || items.length <= 1) return;
    let next = items.slice();
    if (mode === 'reverse') {
      next = next.reverse();
    } else if (mode === 'name') {
      next = next.sort((a, b) => {
        const av = a.name || valueOfMaterialSetItem(a);
        const bv = b.name || valueOfMaterialSetItem(b);
        return av.localeCompare(bv, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
      });
    } else {
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    commitItems(kind, next);
  };

  const exportJson = () => {
    if (!kind || items.length === 0) return;
    const backup = createMaterialSetBackup(kind, items, `${KIND_LABEL[kind]}素材集`);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `t8-material-set-${kind}-${Date.now()}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 800);
  };

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = parseMaterialSetBackup(JSON.parse(String(reader.result || '{}')));
        if (!backup) throw new Error('不是有效的素材集 JSON');
        if (items.length > 0 && !window.confirm('导入素材集会覆盖当前内容，确定继续？')) return;
        commitItems(backup.materialSetKind, backup.materialSetItems);
        setError(null);
      } catch (err: any) {
        setError(err?.message || '素材集 JSON 导入失败');
      }
    };
    reader.onerror = () => setError('素材集 JSON 读取失败');
    reader.readAsText(file, 'utf-8');
  };

  const addText = () => {
    const lines = textDraft
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const newItems = lines.map(materialSetItemFromText).filter(Boolean) as MaterialSetItem[];
    if (newItems.length === 0) return;
    commitItems('text', [...(kind === 'text' ? items : []), ...newItems]);
    setTextDraft('');
  };

  const uploadSingleFile = async (file: File, fileKind: Exclude<MaterialSetKind, 'text'>): Promise<MaterialSetItem> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || `上传失败 HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success || !json.data?.url) throw new Error(json.error || '上传失败:未返回 URL');
    return materialSetItemFromMedia(fileKind, {
      url: json.data.url,
      name: file.name,
      size: file.size,
      mime: file.type,
    });
  };

  const prepareFiles = async (rawFiles: File[]) => {
    const files = rawFiles.filter(Boolean);
    if (files.length === 0) return;
    const inferred = (kind && kind !== 'text' ? kind : files.map(inferFileKind).find(Boolean)) || null;
    if (!inferred) {
      setError('只能加入图像 / 视频 / 音频文件');
      return;
    }
    const accepted = files.filter((file) => inferFileKind(file) === inferred);
    if (accepted.length === 0) {
      setError(`文件类型不匹配：当前素材集是${KIND_LABEL[inferred]}`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded: MaterialSetItem[] = [];
      for (const file of accepted) uploaded.push(await uploadSingleFile(file, inferred));
      commitItems(inferred, [...(kind === inferred ? items : []), ...uploaded]);
      if (accepted.length !== files.length) setError(`已加入 ${accepted.length} 项，跳过 ${files.length - accepted.length} 个非同类型文件`);
    } catch (err: any) {
      setError(err?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    void prepareFiles(files);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    void prepareFiles(Array.from(e.dataTransfer?.files || []));
  };

  const collectUpstreamMaterials = useCallback((showEmptyError = true) => {
    if (!upstreamCandidate || upstreamCandidate.list.length === 0) {
      if (showEmptyError) setError('没有可收集的同类型上游素材');
      return false;
    }
    const nextKind = upstreamCandidate.kind;
    const existing = kind === nextKind ? items : [];
    const seen = new Set(existing.map((item) => `${item.kind}:${valueOfMaterialSetItem(item)}`));
    const appended = upstreamCandidate.list
      .filter((m) => {
        const key = `${m.kind}:${m.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(materialSetItemFromUpstream);
    if (appended.length === 0) {
      if (showEmptyError) setError('上游素材已在素材集中');
      return false;
    }
    commitItems(nextKind, [...existing, ...appended]);
    setError(null);
    return true;
  }, [items, kind, upstreamCandidate]);

  const collectUpstream = () => {
    collectUpstreamMaterials(true);
  };

  const autoCollectSignature = useMemo(() => {
    if (!upstreamCandidate || upstreamCandidate.list.length === 0) return '';
    return `${upstreamCandidate.kind}:${upstreamCandidate.list.map((m) => `${m.sourceNodeId || 'source'}:${m.kind}:${m.url}`).join('|')}`;
  }, [upstreamCandidate]);

  // 素材集会在连线后自动收集同类型上游素材；手动按钮保留给用户重新同步或补收。
  useEffect(() => {
    if (!autoCollectSignature || lastAutoCollectSignatureRef.current === autoCollectSignature) return;
    lastAutoCollectSignatureRef.current = autoCollectSignature;
    collectUpstreamMaterials(false);
  }, [autoCollectSignature, collectUpstreamMaterials]);

  const splitMaterialSet = () => {
    if (!kind || items.length <= 1) return;
    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 320;
    const myH = (me as any)?.measured?.height || (me as any)?.height || 280;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const type = kind === 'text' ? 'text' : 'upload';
    const sz = defaultSizeOf(type);
    const COLS = 3;
    const COL_W = kind === 'text' ? 320 : 300;
    const ROW_H = Math.max(kind === 'text' ? 220 : 260, myH / 2);
    const desired: PlacementRect[] = items.map((_, index) => ({
      x: baseX + (index % COLS) * COL_W,
      y: baseY + Math.floor(index / COLS) * ROW_H,
      w: sz.w,
      h: sz.h,
    }));
    const off = placeBatchNodes(desired, rf.getNodes(), { source: `placement:split-material-set:${id}` });
    const stamp = Date.now();
    const newNodes: Node[] = items.map((item, index) => {
      const value = valueOfMaterialSetItem(item);
      const dataPatch =
        kind === 'text'
          ? { prompt: value }
          : createUploadDataFromItem({
              kind: kind as Exclude<MaterialSetKind, 'text'>,
              url: value,
              name: item.name || fileNameFromUrl(value),
              size: item.size,
              mime: item.mime,
            } as MediaItem);
      return {
        id: `${type}-split-set-${stamp}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        position: { x: desired[index].x + off.dx, y: desired[index].y + off.dy },
        data: dataPatch,
        selected: false,
      } as Node;
    });
    rf.addNodes(newNodes);
  };

  const accent = kind ? PORT_COLOR[kind] : PORT_COLOR.any;
  const targetTitle = '可接入文本 / 图像 / 视频 / 音频，上游同类型可收集到素材集';
  const sourceTitle = kind ? `输出${KIND_LABEL[kind]}素材集` : '请先加入素材';
  const smartPanelToggle = useSmartNodePanelToggle({
    open: smartPanelOpen,
    dragging: smartDragging,
    onToggle: (nextOpen) => {
      setSmartPanelOpen(nextOpen);
      syncMaterialSetGeometry();
    },
    onDragChange: setSmartDragging,
    onDragClose: () => {
      setSmartPanelOpen(false);
      syncMaterialSetGeometry();
    },
    disabled: !useSmartCardMaterialSetNode,
  });

  const switchMaterialSetVariant = useCallback((nextVariant: MaterialSetNodeVariant) => {
    setSmartPanelOpen(false);
    smartPanelToggle.clearPointer();
    smartPanelToggle.handledClickRef.current = false;
    smartPanelToggle.suppressClickRef.current = true;
    flushSync(() => {
      update({ uiVariant: nextVariant, materialSetNodeVariant: nextVariant });
    });
    syncMaterialSetGeometry();
  }, [smartPanelToggle, syncMaterialSetGeometry, update]);

  useOutsideClose({
    enabled: useSmartCardMaterialSetNode && smartPanelOpen,
    refs: [smartRootRef, composerRef],
    onOutside: () => {
      setSmartPanelOpen(false);
      syncMaterialSetGeometry();
    },
  });

  useEffect(() => {
    if (!useSmartCardMaterialSetNode) return;
    syncMaterialSetGeometry();
  }, [items.length, kind, smartCardHeight, smartCardWidth, smartPanelOpen, syncMaterialSetGeometry, useSmartCardMaterialSetNode]);

  const kindIcon = kind === 'video' ? Video : kind === 'audio' ? Music : kind === 'text' ? FileText : Images;
  const KindIcon = kindIcon;
  const summary = kind ? `${KIND_LABEL[kind]} · ${items.length} 项` : '连入素材后自动收集';

  const renderClassicNode = () => (
    <div
      className={`t8-node t8-material-set-classic relative transition-colors ${selected ? 't8-material-set-classic--selected' : ''}`}
      style={{ width: 320, minHeight: 220, '--t8-material-set-accent': accent } as any}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!border-0"
        style={{ background: accent, width: 11, height: 11 }}
        title={targetTitle}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!border-0"
        style={{ background: accent, width: 11, height: 11 }}
        title={sourceTitle}
      />

      <div className="t8-material-set-classic__header t8-node-header">
        <div className="t8-material-set-classic__icon">
          <Images size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="t8-material-set-classic__title">素材集</div>
          <div className="t8-material-set-classic__subtitle">
            {kind ? `${KIND_LABEL[kind]} · ${items.length} 项` : '选择类型或收集上游素材'}
          </div>
        </div>
        {kind && (
          <CollectionSplitButton
            count={items.length}
            kindLabel={KIND_LABEL[kind]}
            onSplit={splitMaterialSet}
            confirmThreshold={8}
          />
        )}
        <button
          type="button"
          className="nodrag nopan t8-btn t8-material-set-classic__icon-btn"
          title="清空素材集"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            clearAll();
          }}
        >
          <RotateCcw size={13} />
        </button>
        <button
          type="button"
          className="nodrag nopan t8-btn t8-smart-classic-switch"
          title="切回卡片版节点"
          aria-label="切回卡片版节点"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            switchMaterialSetVariant('smart-card');
          }}
        >
          <RefreshCcw size={13} />
        </button>
      </div>

      <div className="t8-material-set-classic__body" onMouseDown={(e) => e.stopPropagation()}>
        <div className="t8-material-set-classic__kind-grid">
          {(['image', 'video', 'audio', 'text'] as MaterialSetKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`nodrag nopan t8-btn t8-material-set-classic__kind ${kind === k ? 'is-active' : ''}`}
              style={{ '--t8-material-set-kind-accent': PORT_COLOR[k] } as any}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                switchKind(k);
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={kind && kind !== 'text' ? KIND_ACCEPT[kind] : 'image/*,video/*,audio/*'}
          onChange={handleFileChange}
        />
        <input
          ref={jsonInputRef}
          type="file"
          className="hidden"
          accept="application/json,.json"
          onChange={importJson}
        />

        {kind !== 'text' && (
          <div
            className={`nodrag nopan t8-material-set-classic__drop ${dragActive ? 'is-active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <UploadIcon size={13} style={{ color: accent }} />
            {uploading ? '上传中...' : kind ? `添加${KIND_LABEL[kind]}文件` : '拖入或选择同类型素材'}
          </div>
        )}

        {kind === 'text' && (
          <div className="space-y-1">
            <textarea
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              rows={3}
              placeholder="每行作为一条文本素材..."
              className="nodrag nowheel t8-textarea t8-material-set-classic__textarea"
            />
            <button type="button" className="t8-btn h-8 w-full gap-1.5 text-[12px]" onClick={addText}>
              <Plus size={13} /> 添加文本
            </button>
          </div>
        )}

        {upstreamCandidate && upstreamCandidate.list.length > 0 && (
          <button
            type="button"
            className="t8-btn h-8 w-full gap-1.5 text-[12px]"
            onClick={collectUpstream}
            title="把连入素材按当前上游顺序收集到素材集"
          >
            <ListPlus size={13} />
            收集上游 {KIND_LABEL[upstreamCandidate.kind]} ({upstreamCandidate.list.length})
          </button>
        )}

          <div className="t8-material-set-classic__tool-stack">
          <div className="t8-material-set-classic__action-grid">
            <button
              type="button"
              className="nodrag nopan t8-btn t8-material-set-classic__action"
              disabled={!kind || items.length <= 1}
              onClick={() => reorderItems('reverse')}
              title="反转当前素材顺序"
            >
              <ArrowDownUp size={12} className="mx-auto" />
            </button>
            <button
              type="button"
              className="nodrag nopan t8-btn t8-material-set-classic__action"
              disabled={!kind || items.length <= 1}
              onClick={() => reorderItems('name')}
              title="按文件名 / 文本名排序"
            >
              <SortAsc size={12} className="mx-auto" />
            </button>
            <button
              type="button"
              className="nodrag nopan t8-btn t8-material-set-classic__action"
              disabled={!kind || items.length <= 1}
              onClick={() => reorderItems('random')}
              title="随机打乱顺序"
            >
              <Shuffle size={12} className="mx-auto" />
            </button>
          </div>
          <div className="t8-material-set-classic__action-grid t8-material-set-classic__action-grid--two">
            <button
              type="button"
              className="nodrag nopan t8-btn t8-material-set-classic__action"
              onClick={() => jsonInputRef.current?.click()}
              title="导入 t8-material-set 素材集 JSON"
            >
              <FileUp size={13} />
              <span>导入素材集</span>
            </button>
            <button
              type="button"
              className="nodrag nopan t8-btn t8-material-set-classic__action"
              disabled={!kind || items.length === 0}
              onClick={exportJson}
              title="导出 t8-material-set 素材集 JSON"
            >
              <Download size={13} />
              <span>导出素材集</span>
            </button>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="t8-material-set-classic__grid nowheel">
            {materials.map((material, index) => {
              const isActive = sortDrag?.activeId === material.id;
              const isOver = !!sortDrag?.moved && sortDrag.overId === material.id && !isActive;
              return (
                <div
                  key={material.id}
                  data-material-set-node={id}
                  data-material-set-thumb-id={material.id}
                  className={`nodrag nopan t8-material-set-classic__thumb ${isActive ? 'is-active' : ''} ${isOver ? 'is-over' : ''}`}
                  title={material.label || material.url}
                  onPointerDownCapture={(event) => beginSortDrag(event, material.id)}
                  onPointerMoveCapture={moveSortDrag}
                  onPointerUpCapture={endSortDrag}
                  onPointerCancelCapture={cancelSortDrag}
                  onDragStart={(event) => event.preventDefault()}
                >
                  {material.kind === 'image' ? (
                    <SmartImage
                      src={material.url}
                      alt={material.label || ''}
                      draggable={false}
                      thumbSize={220}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
                    />
                  ) : material.kind === 'video' ? (
                    <div className="flex h-full w-full items-center justify-center bg-black">
                      <Video size={20} color="#cbd5e1" />
                    </div>
                  ) : material.kind === 'audio' ? (
                    <div className="t8-material-set-classic__thumb-fallback">
                      <Music size={20} />
                    </div>
                  ) : (
                    <div className="t8-material-set-classic__thumb-text">
                      <FileText size={9} className="mr-0.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-4 break-all">{material.label || material.url}</span>
                    </div>
                  )}
                  <div className="t8-material-set-classic__thumb-index">
                    {index + 1}
                  </div>
                  <div className="t8-material-set-classic__thumb-pin">
                    <Pin size={8} />
                  </div>
                  <button
                    type="button"
                    className="nodrag nopan absolute bottom-0 right-0 flex h-[14px] w-[14px] items-center justify-center border-0 bg-red-500 p-0 text-white"
                    title="移除本地素材"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeItem(material.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="t8-material-set-classic__empty">
            <PackageOpen size={14} />
            暂无素材
          </div>
        )}

        {error && (
          <div className="t8-smart-node-error t8-material-set-classic__error">
            <span className="min-w-0 flex-1 break-all">{error}</span>
            <button type="button" className="nodrag nopan" onClick={() => setError(null)}>
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Card normal state stays summary-first; dense collection management belongs in the composer.
  const renderSmartCover = () => {
    if (!kind || items.length === 0) {
      return (
        <div
          className={`t8-smart-material-set-empty ${dragActive ? 't8-smart-material-set-empty--accepting' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <PackageOpen size={22} />
          <strong>{uploading ? '上传中' : dragActive ? '松开加入' : '待收集'}</strong>
        </div>
      );
    }

    if (kind === 'image') {
      const imageItems = materials.slice(0, 4);
      return (
        <div className={`t8-smart-material-set-cover t8-smart-material-set-cover--image t8-smart-material-set-cover--count-${Math.min(imageItems.length, 4)}`}>
          {imageItems.map((material, index) => (
            <SmartImage
              key={`${material.id}-${index}`}
              src={material.url}
              alt={material.label || `图像 ${index + 1}`}
              thumbSize={360}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ))}
          {items.length > 4 && <span className="t8-smart-material-set-more">+{items.length - 4}</span>}
        </div>
      );
    }

    if (kind === 'text') {
      return (
        <div className="t8-smart-material-set-cover t8-smart-material-set-cover--text">
          {items.slice(0, 4).map((item, index) => (
            <div key={item.id} className="t8-smart-material-set-text-line">
              <span>{index + 1}</span>
              <p>{valueOfMaterialSetItem(item)}</p>
            </div>
          ))}
        </div>
      );
    }

    if (kind === 'video') {
      return (
        <div className="t8-smart-material-set-cover t8-smart-material-set-cover--media">
          <Video size={34} />
          <strong>{items.length} 个视频</strong>
          <span>{items[0]?.name || fileNameFromUrl(valueOfMaterialSetItem(items[0]))}</span>
        </div>
      );
    }

    return (
      <div className="t8-smart-material-set-cover t8-smart-material-set-cover--media t8-smart-material-set-cover--audio">
        <Music size={34} />
        <strong>{items.length} 段音频</strong>
        <span>{items[0]?.name || fileNameFromUrl(valueOfMaterialSetItem(items[0]))}</span>
      </div>
    );
  };

  // Material set management lives in the external composer so the canvas card stays clean.
  const renderSmartComposer = () => {
    if (!smartPanelOpen) return null;
    return (
      <SmartNodeComposer
        className="t8-smart-material-set-composer"
        style={{ left: smartCardWidth + 12, top: 0 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div ref={composerRef}>
          <div className="t8-smart-material-set-composer__header">
            <div>
              <div className="t8-smart-node-title">素材集配置</div>
              <div className="t8-smart-node-subtitle">{summary}</div>
            </div>
            {kind && (
              <CollectionSplitButton
                count={items.length}
                kindLabel={KIND_LABEL[kind]}
                onSplit={splitMaterialSet}
                confirmThreshold={8}
              />
            )}
          </div>

          <div className="t8-smart-material-set-toolbar">
            {(['image', 'video', 'audio', 'text'] as MaterialSetKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`t8-chip ${kind === k ? 't8-chip--active' : ''}`}
                style={kind === k ? { borderColor: PORT_COLOR[k], color: PORT_COLOR[k] } : undefined}
                onClick={() => switchKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={kind && kind !== 'text' ? KIND_ACCEPT[kind] : 'image/*,video/*,audio/*'}
            onChange={handleFileChange}
          />
          <input
            ref={jsonInputRef}
            type="file"
            className="hidden"
            accept="application/json,.json"
            onChange={importJson}
          />

          <div className="t8-smart-material-set-composer__section">
            {kind !== 'text' && (
              <button
                type="button"
                className="t8-btn t8-smart-material-set-add"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <UploadIcon size={13} />
                {uploading ? '上传中...' : kind ? `添加${KIND_LABEL[kind]}文件` : '添加素材'}
              </button>
            )}

            {kind === 'text' && (
              <div className="space-y-1.5">
                <textarea
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  rows={4}
                  placeholder="每行作为一条文本素材..."
                  className="nodrag nowheel t8-textarea w-full resize-none text-xs"
                />
                <button type="button" className="t8-btn h-8 w-full gap-1.5 text-[12px]" onClick={addText}>
                  <Plus size={13} /> 添加文本
                </button>
              </div>
            )}

            {upstreamCandidate && upstreamCandidate.list.length > 0 && (
              <button
                type="button"
                className="t8-btn h-8 w-full gap-1.5 text-[12px]"
                onClick={collectUpstream}
                title="把连入素材按当前上游顺序收集到素材集"
              >
                <ListPlus size={13} />
                收集上游 {KIND_LABEL[upstreamCandidate.kind]} ({upstreamCandidate.list.length})
              </button>
            )}
          </div>

          <div className="t8-smart-material-set-composer__section">
            <div className="t8-smart-material-set-action-grid">
              <button type="button" className="t8-btn" disabled={!kind || items.length <= 1} onClick={() => reorderItems('reverse')} title="反转当前素材顺序">
                <ArrowDownUp size={12} /> 反转
              </button>
              <button type="button" className="t8-btn" disabled={!kind || items.length <= 1} onClick={() => reorderItems('name')} title="按文件名 / 文本名排序">
                <SortAsc size={12} /> 名称
              </button>
              <button type="button" className="t8-btn" disabled={!kind || items.length <= 1} onClick={() => reorderItems('random')} title="随机打乱顺序">
                <Shuffle size={12} /> 随机
              </button>
            </div>
            <div className="t8-smart-material-set-action-grid t8-smart-material-set-action-grid--two">
              <button type="button" className="t8-btn" onClick={() => jsonInputRef.current?.click()}>
                <FileUp size={13} /> 导入
              </button>
              <button type="button" className="t8-btn" disabled={!kind || items.length === 0} onClick={exportJson}>
                <Download size={13} /> 导出
              </button>
            </div>
          </div>

          <div className="t8-smart-material-set-composer__section">
            {items.length > 0 ? (
              <div className="t8-smart-material-set-grid nowheel">
                {materials.map((material, index) => {
                  const isActive = sortDrag?.activeId === material.id;
                  const isOver = !!sortDrag?.moved && sortDrag.overId === material.id && !isActive;
                  return (
                    <div
                      key={material.id}
                      data-material-set-node={id}
                      data-material-set-thumb-id={material.id}
                      className={`nodrag nopan t8-smart-material-set-thumb ${isActive ? 'is-active' : ''} ${isOver ? 'is-over' : ''}`}
                      title={material.label || material.url}
                      onPointerDownCapture={(event) => beginSortDrag(event, material.id)}
                      onPointerMoveCapture={moveSortDrag}
                      onPointerUpCapture={endSortDrag}
                      onPointerCancelCapture={cancelSortDrag}
                      onDragStart={(event) => event.preventDefault()}
                    >
                      {material.kind === 'image' ? (
                        <SmartImage
                          src={material.url}
                          alt={material.label || ''}
                          draggable={false}
                          thumbSize={220}
                          className="h-full w-full object-cover"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        />
                      ) : material.kind === 'video' ? (
                        <div className="t8-smart-material-set-thumb__fallback"><Video size={20} /></div>
                      ) : material.kind === 'audio' ? (
                        <div className="t8-smart-material-set-thumb__fallback"><Music size={20} /></div>
                      ) : (
                        <div className="t8-smart-material-set-thumb__text">
                          <FileText size={9} />
                          <span>{material.label || material.url}</span>
                        </div>
                      )}
                      <span className="t8-smart-material-set-thumb__index">{index + 1}</span>
                      <button
                        type="button"
                        className="nodrag nopan t8-smart-material-set-thumb__remove"
                        title="移除本地素材"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeItem(material.id);
                        }}
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="t8-smart-material-set-composer__empty">
                <PackageOpen size={14} />
                暂无素材
              </div>
            )}
          </div>

          <div className="t8-smart-material-set-composer__footer">
            <span className="t8-smart-material-set-composer__hint">
              {kind ? `${KIND_LABEL[kind]} · ${items.length}项` : '等待素材'}
            </span>
            <div className="t8-smart-material-set-footer-actions">
              <button
                type="button"
                className="t8-smart-material-set-icon-action"
                onClick={clearAll}
                title="清空素材集"
                aria-label="清空素材集"
              >
                <RotateCcw size={12} />
              </button>
              <button
                type="button"
                className="t8-smart-material-set-icon-action"
                onClick={() => switchMaterialSetVariant('classic')}
                title="切换到经典版节点"
                aria-label="切换到经典版节点"
              >
                <RefreshCcw size={12} />
              </button>
            </div>
          </div>

          {error && (
            <div className="t8-smart-node-error">
              <span className="min-w-0 flex-1 break-all">{error}</span>
              <button type="button" className="nodrag nopan" onClick={() => setError(null)}>
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      </SmartNodeComposer>
    );
  };

  const renderSmartCard = () => (
    <SmartNodeShell
      rootRef={smartRootRef}
      className="t8-smart-material-set-node"
      style={{ width: smartCardWidth }}
      rootProps={{
        onPointerDown: smartPanelToggle.onPointerDown,
        onPointerMove: smartPanelToggle.onPointerMove,
        onPointerUp: smartPanelToggle.onPointerUp,
        onPointerCancel: smartPanelToggle.onPointerCancel,
        onClick: smartPanelToggle.onClick,
      }}
      composer={renderSmartComposer()}
    >
      <div
        className={`t8-node t8-smart-node-card t8-smart-material-set-card transition-all ${selected ? 't8-smart-node-card--selected' : ''} ${
          dragActive ? 't8-smart-node-card--accepting' : ''
        } ${smartPanelOpen ? 't8-smart-material-set-card--open' : ''}`}
        style={{ height: smartCardHeight }}
      >
        <ResizableCorners
          selected={selected}
          minWidth={240}
          minHeight={150}
          maxWidth={620}
          maxHeight={560}
          accent={accent}
          keepAspectRatio={false}
          onResize={(_e, p) => {
            update({ smartMaterialSetWidth: Math.round(p.width), smartMaterialSetHeight: Math.round(p.height) });
            syncMaterialSetGeometry();
          }}
          onResizeEnd={(_e, p) => {
            update({ smartMaterialSetWidth: Math.round(p.width), smartMaterialSetHeight: Math.round(p.height) });
            syncMaterialSetGeometry();
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: accent }}
          title={targetTitle}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: accent }}
          title={sourceTitle}
        />

        <div className="t8-smart-material-set-head">
          <div className="t8-smart-node-icon" style={{ color: accent }}>
            <KindIcon size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="t8-smart-node-title t8-smart-material-set-title">素材集</div>
            <div className="t8-smart-node-subtitle">{summary}</div>
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
              switchMaterialSetVariant('classic');
            }}
          >
            <RefreshCcw size={13} />
          </button>
        </div>

        <div className="t8-smart-node-body">
          {renderSmartCover()}
        </div>

        <div className="t8-smart-material-set-foot">
          <span>{kind ? KIND_LABEL[kind] : '自动'}</span>
          <span>{items.length ? `${items.length}` : '0'}</span>
        </div>
      </div>
    </SmartNodeShell>
  );

  if (!useSmartCardMaterialSetNode) return renderClassicNode();
  return renderSmartCard();
};

export default memo(MaterialSetNode);
