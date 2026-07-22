import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useHasAutoOutput } from './useHasAutoOutput';
import SmartImage from '../SmartImage';
import ResizableCorners from './ResizableCorners';
import SmartNodeComposer from './shared/SmartNodeComposer';
import SmartNodeShell from './shared/SmartNodeShell';
import { useNodeGeometrySync } from './shared/useNodeGeometrySync';
import { useOutsideClose } from './shared/useOutsideClose';
import { useSmartNodePanelToggle } from './shared/useSmartNodePanelToggle';
import { smartNodeComposerActions, useIsSmartNodeComposerOpen } from '../../stores/smartNodeComposer';

/**
 * ImageOpNode - 图像变换节点的通用外壳 (JIMI 空卡片 + 属性弹层 版)
 * 子节点(resize/upscale 等)只需提供:
 *   title / icon / colorHex / accent / settingsForm / runOp(imageUrl) → { imageUrl } | { urls }
 *
 * 布局约定:
 *   - 关闭态卡片: 短标题(图标 + 标题 + 副标题) + 结果图/空态图示 + 状态徽标 + 错误条
 *   - 属性弹层(Composer): 设置表单 + 运行按钮 + 错误详情
 *   - 运行入口: 弹层按钮与 NodeActionBar(runBus) 共用同一个 handleRun
 */
interface ImageOpNodeProps {
  id: string;
  data: any;
  selected?: boolean;
  className?: string;
  'data-canvas-node-root'?: boolean;
  dragging?: boolean;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  colorHex: string; // 边框/handle 主色 hex
  bgRgba: string;   // 标头方块底色
  shadowRgba: string;
  textHex: string;  // 标头方块文字色
  buttonClasses: string;
  /** 渲染配置区域 (仅出现在属性弹层中) */
  renderSettings: () => ReactNode;
  /** 执行变换,返回单图或多图 */
  runOp: (imageUrl: string) => Promise<{ imageUrl?: string; urls?: string[] }>;
  /** 可选：由节点自行订阅并传入的上游图像列表，避免预览和运行读取不同来源 */
  inputImages?: string[];
  /** 是否把所有上游图像逐张处理并合并输出，适合宫格剪裁批量拆分合集 */
  processAllInputs?: boolean;
  /** 是否需要多张输入(combine) */
  needsMulti?: boolean;
  /** 属性弹层的最小宽度(旧版卡片宽度语义迁移到弹层) */
  width?: number;
  /** 关闭态卡片的无障碍名称, 默认 `${title}节点` */
  accessibleLabel?: string;
  /** 属性弹层的无障碍名称, 默认 `${title}节点属性` */
  composerAriaLabel?: string;
  /** 空态提示语 */
  emptyHint?: string;
}

export function ImageOpFrame(props: ImageOpNodeProps) {
  const {
    id,
    data,
    selected,
    className,
    'data-canvas-node-root': canvasNodeRoot,
    dragging,
    title,
    subtitle,
    icon,
    colorHex,
    bgRgba,
    textHex,
    buttonClasses,
    renderSettings,
    runOp,
    inputImages,
    processAllInputs,
    needsMulti,
    width,
    accessibleLabel,
    composerAriaLabel,
    emptyHint,
  } = props;
  const update = useUpdateNodeData(id);
  const { getEdges, getNodes } = useReactFlow();
  const [error, setError] = useState<string | null>(null);
  const d = data as any;
  const status: 'idle' | 'running' | 'success' | 'error' = d?.status || 'idle';
  const outImg: string | undefined = d?.imageUrl;
  const outUrls: string[] = d?.urls || [];
  // 下游已连 OutputNode：隐藏节点内预览，避免占双份垂直空间 + 避免重复展示
  const hasAutoOutput = useHasAutoOutput(id);

  // === JIMI 智能卡片接线 (对齐 UploadNode) ===
  const smartComposerOpenLocal = useIsSmartNodeComposerOpen(id);
  const setSmartComposerOpenLocal = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) smartNodeComposerActions.open(id);
      else smartNodeComposerActions.close(id);
    },
    [id],
  );
  const [smartCardDragging, setSmartCardDragging] = useState(false);
  const smartNodeRef = useRef<HTMLDivElement | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const syncImageOpGeometry = useNodeGeometrySync(id, updateNodeInternals);
  const smartCardWidth = Math.max(220, Number(d?.smartCardWidth) || 260);
  const smartCardHeight = Math.max(160, Number(d?.smartCardHeight) || 220);
  const smartComposerOpen = smartComposerOpenLocal && !smartCardDragging && !dragging;
  const smartComposerWidth = Math.max(smartCardWidth, 420, width || 0);
  const hasResult = Boolean(outImg) || outUrls.length > 0;
  const smartImageOpCardState =
    status === 'running'
      ? 'running'
      : status === 'error' || error
        ? 'failed'
        : hasResult
          ? 'result'
          : 'empty';

  useEffect(() => {
    const raf = window.requestAnimationFrame(syncImageOpGeometry);
    return () => window.cancelAnimationFrame(raf);
  }, [selected, smartCardWidth, smartCardHeight, smartComposerOpen, syncImageOpGeometry]);

  // Composer open state is session-only; release it when the node unmounts.
  useEffect(() => () => smartNodeComposerActions.close(id), [id]);

  // Kept alongside the composer-owned dismissal: ignores portalled floating editors.
  useOutsideClose({
    enabled: smartComposerOpenLocal,
    refs: smartNodeRef,
    onOutside: () => setSmartComposerOpenLocal(false),
  });

  const smartPanelToggle = useSmartNodePanelToggle({
    open: smartComposerOpenLocal,
    dragging: !!dragging,
    onToggle: setSmartComposerOpenLocal,
    onDragChange: setSmartCardDragging,
    onDragClose: () => setSmartComposerOpenLocal(false),
    ignoreSelector:
      '.nodrag, .react-flow__resize-control, input, textarea, select, button, [contenteditable="true"], [data-drag-source]',
  });

  const collectUpstreamImages = (): string[] => {
    const edges = getEdges();
    const nodes = getNodes();
    const upstreamIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const urls: string[] = [];
    const pushImage = (u: any) => {
      if (typeof u !== 'string' || !u) return;
      if (/\.(mp4|webm|mov|m4v|mkv|mp3|wav|ogg|m4a|flac|aac)(\?.*)?$/i.test(u)) return;
      if (!urls.includes(u)) urls.push(u);
    };
    for (const uid of upstreamIds) {
      const n = nodes.find((x) => x.id === uid);
      const d = (n?.data as any) || {};
      pushImage(d.imageUrl);
      if (Array.isArray(d.imageUrls)) d.imageUrls.forEach(pushImage);
      if (Array.isArray(d.urls)) d.urls.forEach(pushImage);
      if (Array.isArray(d.generatedImages)) d.generatedImages.forEach(pushImage);
    }
    return urls;
  };

  const handleRun = async () => {
    setError(null);
    const imgs = inputImages && inputImages.length > 0 ? inputImages : collectUpstreamImages();
    if (imgs.length === 0) {
      setError('未连接上游图像节点');
      return;
    }
    update({ status: 'running', error: null });
    try {
      // 通用约定:子节点处理第一张图；需要批量拆分时逐张处理全部上游图像。
      // combine 节点会自己在 runOp 内 ignore 参数,直接用全部上游。
      const r = processAllInputs && !needsMulti
        ? await (async () => {
            const urls: string[] = [];
            for (const img of imgs) {
              const one = await runOp(img);
              if (one.imageUrl) urls.push(one.imageUrl);
              if (Array.isArray(one.urls)) urls.push(...one.urls);
            }
            return { imageUrl: urls[0], urls };
          })()
        : await runOp(needsMulti ? (imgs as any) : imgs[0]);
      const patch: any = { status: 'success' };
      if (r.imageUrl) patch.imageUrl = r.imageUrl;
      if (r.urls) {
        patch.urls = r.urls;
        patch.imageUrls = r.urls;
        if (!patch.imageUrl && r.urls[0]) patch.imageUrl = r.urls[0];
      }
      update(patch);
    } catch (e: any) {
      setError(e?.message || '处理失败');
      update({ status: 'error', error: e?.message });
    }
  };

  // 接入运行总线,供批量运行调起
  useRunTrigger(id, handleRun);

  return (
    <SmartNodeShell
      rootRef={smartNodeRef}
      data-canvas-node-root={canvasNodeRoot}
      className={`t8-smart-image-op-node relative overflow-visible ${className || ''}`}
      style={{ width: smartCardWidth }}
      accessibleLabel={accessibleLabel || `${title}节点`}
      smartState={smartImageOpCardState}
      onKeyboardActivate={() => setSmartComposerOpenLocal(true)}
      rootProps={{
        onPointerDown: smartPanelToggle.onPointerDown,
        onPointerMove: smartPanelToggle.onPointerMove,
        onPointerUp: smartPanelToggle.onPointerUp,
        onPointerCancel: smartPanelToggle.onPointerCancel,
        onClick: smartPanelToggle.onClick,
      }}
    >
      <div
        className={`t8-node t8-smart-node-card t8-smart-image-op-card transition-all ${selected ? 'is-selected t8-smart-node-card--selected' : ''}`}
        style={{ height: smartCardHeight }}
      >
        <ResizableCorners
          selected={selected}
          minWidth={220}
          minHeight={160}
          maxWidth={560}
          maxHeight={480}
          accent={colorHex}
          keepAspectRatio={false}
          onResize={(_e, p) => {
            update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
            syncImageOpGeometry();
          }}
          onResizeEnd={(_e, p) => {
            update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
            syncImageOpGeometry();
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: colorHex }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: colorHex }}
        />

        <div className="flex items-center gap-2 px-3 pt-2.5">
          <div
            className="t8-smart-node-icon"
            style={{ background: bgRgba, color: textHex, borderColor: colorHex }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="t8-smart-node-title">{title}</div>
            {subtitle && <div className="t8-smart-node-subtitle">{subtitle}</div>}
          </div>
          {status === 'running' && (
            <div className="t8-smart-node-status flex items-center gap-1" style={{ color: colorHex }}>
              <Loader2 size={11} className="animate-spin" />
              <span>处理中</span>
            </div>
          )}
        </div>

        <div className="t8-smart-node-body">
          <div className="t8-smart-node-preview t8-smart-image-op-preview m-2 mt-2">
            {outImg && !hasAutoOutput ? (
              <div className="t8-smart-result-surface">
                <SmartImage src={outImg} alt="结果" className="h-full w-full object-contain" thumbSize={720} />
              </div>
            ) : outUrls.length > 0 && !hasAutoOutput ? (
              <div className="t8-smart-result-surface t8-smart-result-surface--grid">
                {outUrls.map((u, i) => (
                  <SmartImage key={i} src={u} alt={`#${i}`} className="h-full w-full rounded object-cover" thumbSize={240} />
                ))}
              </div>
            ) : (
              <div className="t8-smart-node-empty">
                <div className="flex flex-col items-center gap-2 px-3 text-center">
                  <span
                    className="t8-smart-node-icon"
                    style={{ background: bgRgba, color: textHex, borderColor: colorHex }}
                  >
                    {icon}
                  </span>
                  <span className="text-[10px] leading-relaxed" style={{ color: 'var(--t8-text-muted)' }}>
                    {hasAutoOutput && hasResult
                      ? '结果已输出到下游节点'
                      : emptyHint || '点击卡片配置参数'}
                  </span>
                </div>
              </div>
            )}
          </div>
          {error && (
            <div className="t8-smart-node-error">
              <AlertCircle size={12} />
              <span>{error}</span>
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
          ariaLabel={composerAriaLabel || `${title}节点属性`}
        >
          <div className="grid gap-2 p-1" onMouseDown={(e) => e.stopPropagation()}>
            {renderSettings()}

            <button
              type="button"
              onClick={handleRun}
              disabled={status === 'running'}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium disabled:opacity-50 transition-colors ${buttonClasses}`}
            >
              {status === 'running' ? (
                <>
                  <Loader2 size={11} className="animate-spin" /> 处理中...
                </>
              ) : (
                <>
                  <Sparkles size={11} /> 运行
                </>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-1 text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                <span className="break-all">{error}</span>
              </div>
            )}
          </div>
        </SmartNodeComposer>
      )}
    </SmartNodeShell>
  );
}

export default memo(ImageOpFrame);
