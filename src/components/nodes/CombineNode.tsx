import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { AlertCircle, Loader2, Sparkles, Combine } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import { opCombine } from '../../services/imageOps';
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
 * CombineNode - 多图拼接(横向/纵向) — JIMI 空卡片 + 属性弹层 版
 * 需要至少 2 张上游图像
 *   - 关闭态卡片: 短标题 + 结果图/空态图示 + 状态徽标 + 错误条
 *   - 属性弹层: 方向选择 + 拼接按钮 + 错误详情
 */
const COLOR = '#fb923c';

const CombineNode = ({ id, data, selected, dragging }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const { getEdges, getNodes } = useReactFlow();
  const hasAutoOutput = useHasAutoOutput(id);
  const [error, setError] = useState<string | null>(null);
  const d = data as any;
  const direction: 'horizontal' | 'vertical' = d?.direction || 'horizontal';
  const status: 'idle' | 'running' | 'success' | 'error' = d?.status || 'idle';
  const outImg: string | undefined = d?.imageUrl;

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
  const syncCombineGeometry = useNodeGeometrySync(id, updateNodeInternals);
  const smartCardWidth = Math.max(220, Number(d?.smartCardWidth) || 260);
  const smartCardHeight = Math.max(160, Number(d?.smartCardHeight) || 220);
  const smartComposerOpen = smartComposerOpenLocal && !smartCardDragging && !dragging;
  const smartComposerWidth = Math.max(smartCardWidth, 320);
  const smartCombineCardState =
    status === 'running' ? 'running' : status === 'error' || error ? 'failed' : outImg ? 'result' : 'empty';

  useEffect(() => {
    const raf = window.requestAnimationFrame(syncCombineGeometry);
    return () => window.cancelAnimationFrame(raf);
  }, [selected, smartCardWidth, smartCardHeight, smartComposerOpen, syncCombineGeometry]);

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

  const collectUpstreamImages = useCallback((): string[] => {
    const edges = getEdges();
    const nodes = getNodes();
    const upstreamIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const urls: string[] = [];
    for (const uid of upstreamIds) {
      const n = nodes.find((x) => x.id === uid);
      const u = (n?.data as any)?.imageUrl;
      if (u && typeof u === 'string') urls.push(u);
      const us = (n?.data as any)?.urls;
      if (Array.isArray(us)) urls.push(...us.filter((x) => typeof x === 'string'));
    }
    return urls;
  }, [getEdges, getNodes, id]);

  const handleRun = async () => {
    setError(null);
    const imgs = collectUpstreamImages();
    if (imgs.length < 2) {
      setError('至少需要 2 张上游图像');
      return;
    }
    update({ status: 'running', error: null });
    try {
      const r = await opCombine(imgs, direction);
      update({ status: 'success', imageUrl: r.imageUrl });
    } catch (e: any) {
      setError(e?.message || '拼接失败');
      update({ status: 'error', error: e?.message });
    }
  };

  // 接入运行总线,供批量运行调起
  useRunTrigger(id, handleRun);

  return (
    <SmartNodeShell
      rootRef={smartNodeRef}
      data-canvas-node-root={true}
      className={`t8-smart-combine-node relative overflow-visible ${selected ? 'is-selected' : ''}`}
      style={{ width: smartCardWidth }}
      accessibleLabel="合并节点"
      smartState={smartCombineCardState}
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
        className={`t8-node t8-smart-node-card t8-smart-combine-card transition-all ${selected ? 't8-smart-node-card--selected' : ''}`}
        style={{ height: smartCardHeight }}
      >
        <ResizableCorners
          selected={selected}
          minWidth={220}
          minHeight={160}
          maxWidth={560}
          maxHeight={480}
          accent={COLOR}
          keepAspectRatio={false}
          onResize={(_e, p) => {
            update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
            syncCombineGeometry();
          }}
          onResizeEnd={(_e, p) => {
            update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
            syncCombineGeometry();
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: COLOR }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="t8-smart-node-port !border-0"
          style={{ top: '50%', background: COLOR }}
        />

        <div className="flex items-center gap-2 px-3 pt-2.5">
          <div
            className="t8-smart-node-icon"
            style={{ background: 'rgba(251,146,60,.2)', color: '#fed7aa', borderColor: COLOR }}
          >
            <Combine size={13} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="t8-smart-node-title">图像拼接</div>
            <div className="t8-smart-node-subtitle">{direction === 'horizontal' ? '横向' : '纵向'}</div>
          </div>
          {status === 'running' && (
            <div className="t8-smart-node-status flex items-center gap-1" style={{ color: COLOR }}>
              <Loader2 size={11} className="animate-spin" />
              <span>处理中</span>
            </div>
          )}
        </div>

        <div className="t8-smart-node-body">
          <div className="t8-smart-node-preview t8-smart-combine-preview m-2 mt-2">
            {outImg && !hasAutoOutput ? (
              <div className="t8-smart-result-surface">
                <SmartImage src={outImg} alt="结果" className="h-full w-full object-contain" thumbSize={720} />
              </div>
            ) : (
              <div className="t8-smart-node-empty">
                <div className="flex flex-col items-center gap-2 px-3 text-center">
                  <span
                    className="t8-smart-node-icon"
                    style={{ background: 'rgba(251,146,60,.2)', color: '#fed7aa', borderColor: COLOR }}
                  >
                    <Combine size={14} />
                  </span>
                  <span className="text-[10px] leading-relaxed" style={{ color: 'var(--t8-text-muted)' }}>
                    {hasAutoOutput && outImg ? '结果已输出到下游节点' : '连接 2 张以上图像后点击卡片'}
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
          ariaLabel="合并节点属性"
        >
          <div className="grid gap-2 p-1" onMouseDown={(e) => e.stopPropagation()}>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">方向</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['horizontal', 'vertical'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update({ direction: m })}
                    className={`py-1 rounded text-[11px] transition-colors ${
                      direction === m
                        ? 'bg-orange-500/30 text-orange-100 border border-orange-400/40'
                        : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {m === 'horizontal' ? '横向' : '纵向'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={status === 'running'}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium disabled:opacity-50 transition-colors bg-orange-500/20 hover:bg-orange-500/30 text-orange-200"
            >
              {status === 'running' ? (
                <>
                  <Loader2 size={11} className="animate-spin" /> 处理中...
                </>
              ) : (
                <>
                  <Sparkles size={11} /> 拼接
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
};

export default memo(CombineNode);
