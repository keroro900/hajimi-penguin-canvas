/**
 * NodeActionBar —— 选中可执行节点时的浮动操作栏
 *
 * 设计目标:
 *   选中任意「带生成/执行功能」的节点 (EXECUTABLE_NODE_TYPES) 时,
 *   在节点右上角外侧出现一条快捷操作栏: 执行 / 中止 / 取消选中
 *
 * 设计要点:
 *   - 0 节点侵入: 在 ReactFlow 内部统一渲染, 不需要改每个节点组件
 *   - 跟随 viewport 缩放/平移: 用 useViewport 拿到 (vx, vy, zoom) 计算屏幕坐标
 *   - 双主题适配: 科技风 (深色玻璃 + 圆角) / 像素风 (硬边 + 硬阴影)
 *   - 状态联动: 当前节点正在运行时, ▶ RUN 自动切换为 ■ STOP
 *   - 智能定位: 锚定节点右上角往上偏移, 让按钮组与节点保持 8px 间距
 */
import { useCallback, useMemo } from 'react';
import { useStore, useViewport, useReactFlow } from '@xyflow/react';
import { Play, Square, X } from 'lucide-react';
import { useThemeStore } from '../stores/theme';
import { useRunBusStore } from '../stores/runBus';
import { resolveThemeTemplate } from '../theme/defaultTemplates';

// 与 Canvas.tsx 一致 (需要保持同步; 后续可考虑抽到 config/constants)
const EXECUTABLE_NODE_TYPES = new Set<string>([
  'image', 'edit',
  'multi-angle-3d', 'panorama-720', 'penguin-portrait',
  'video', 'seedance', 'audio', 'llm',
  'resize', 'lut-color', 'upscale', 'grid-crop', 'grid-editor', 'remove-bg', 'combine', 'image-compare', 'drawing-board', 'layer-agent',
  'panorama-3d',
  'frame-extractor', 'frame-pair',
  'upload',
  // v1.2.8 循环器 / 从合集获取
  'loop', 'pick-from-set', 'random-route',
  // v1.4.6: 工具箱文本节点也可点击 RUN 直接外挂 OutputNode
  'cinematic', 'video-motion',
  'portrait-master', 'pose-master', 'aggregate-parser', 'batch-processor',
  'topaz-image-upscale', 'topaz-video-upscale',
  'remove-ai-watermark',
]);

const BAR_GAP_PX = 8; // 与节点顶部的世界坐标系间距

const ACTION_COLORS: Record<string, { run: string; stop: string; close: string }> = {
  tech: { run: '#22c55e', stop: '#f97316', close: '#ef4444' },
  pixel: { run: '#4ECDC4', stop: '#FF8F3D', close: '#FF4F6D' },
  rh: { run: '#9cff4d', stop: '#ff9f43', close: '#ff345f' },
};

type SelectedExecutableNodeSummary = {
  id: string;
  selectedIds: string[];
  x: number;
  y: number;
  width: number;
  status: string;
  runStatus: string;
  progress: string;
  isRunning: boolean;
  isPolling: boolean;
  busy: boolean;
  anyBusy: boolean;
};

function selectSelectedExecutableNode(state: any): SelectedExecutableNodeSummary | null {
  const nodes = Array.isArray(state?.nodes) ? state.nodes : [];
  const selected = nodes.filter((node: any) => (
    node?.selected && node?.type && EXECUTABLE_NODE_TYPES.has(node.type)
  ));
  if (selected.length === 0) return null;
  const node = selected[selected.length - 1];
  const data: any = node.data || {};
  const busyStatus = new Set(['generating', 'running', 'submitting', 'polling', 'streaming', 'loading']);
  return {
    id: node.id,
    selectedIds: selected.map((item: any) => item.id),
    x: Number(node.position?.x || 0),
    y: Number(node.position?.y || 0),
    width: Number((node as any).measured?.width || (node as any).width || 320),
    status: String(data.status || ''),
    runStatus: String(data.runStatus || ''),
    progress: String(data.progress || '').trim(),
    isRunning: Boolean(data.isRunning),
    isPolling: Boolean(data.isPolling),
    busy: Boolean(data.busy),
    anyBusy: selected.some((item: any) => {
      const itemData = item.data || {};
      const status = String(itemData.status || itemData.runStatus || '').toLowerCase();
      return busyStatus.has(status) || itemData.isRunning || itemData.isPolling || itemData.busy;
    }),
  };
}

function areSelectedExecutableNodesEqual(
  a: SelectedExecutableNodeSummary | null,
  b: SelectedExecutableNodeSummary | null,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.selectedIds.join(',') === b.selectedIds.join(',') &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.status === b.status &&
    a.runStatus === b.runStatus &&
    a.progress === b.progress &&
    a.isRunning === b.isRunning &&
    a.isPolling === b.isPolling &&
    a.busy === b.busy &&
    a.anyBusy === b.anyBusy
  );
}

const NodeActionBar = () => {
  const selectedExecutableNode = useStore(selectSelectedExecutableNode, areSelectedExecutableNodesEqual);
  const { x: vx, y: vy, zoom } = useViewport();
  const { setNodes } = useReactFlow();
  const { theme, style, templateId, customTemplates } = useThemeStore();
  const isDark = theme === 'dark';
  const activeTemplate = useMemo(
    () => resolveThemeTemplate(templateId, customTemplates),
    [templateId, customTemplates],
  );
  const visualStyle = activeTemplate.visuals?.style || style;
  const isPixel = visualStyle === 'pixel';
  const actionColors = ACTION_COLORS[visualStyle] || ACTION_COLORS.tech;

  const triggerRun = useRunBusStore((s) => s.triggerRun);
  const triggerRunMany = useRunBusStore((s) => s.triggerRunMany);
  const cancelNodes = useRunBusStore((s) => s.cancelNodes);
  const selectedNodeId = selectedExecutableNode?.id;
  const selectedNodeIds = selectedExecutableNode?.selectedIds || [];
  const selectedRunActive = useRunBusStore(
    useCallback(
      (s) =>
        selectedNodeIds.length > 0
          ? Boolean(s.currentRunId && selectedNodeIds.includes(s.currentRunId))
            || s.runningIds.some((runningId) => selectedNodeIds.includes(runningId))
          : false,
      [selectedNodeIds.join(',')],
    ),
  );

  if (!selectedExecutableNode) return null;

  // 节点宽高 (优先 measured.width, fallback 到 width / 320)
  const nodeW = selectedExecutableNode.width;

  // 节点屏幕坐标
  const nodeScreenX = selectedExecutableNode.x * zoom + vx;
  const nodeScreenY = selectedExecutableNode.y * zoom + vy;
  // ActionBar 锚定: 右对齐节点右边, 在节点上方 (BAR_GAP_PX * zoom)
  const rightX = nodeScreenX + nodeW * zoom;
  const topY = nodeScreenY - BAR_GAP_PX * zoom;

  const selectedStatus = String(
    selectedExecutableNode.status || selectedExecutableNode.runStatus || '',
  ).toLowerCase();
  const selectedProgressLabel = selectedExecutableNode.progress;
  const selectedNodeBusy =
    selectedStatus === 'generating' ||
    selectedStatus === 'running' ||
    selectedStatus === 'submitting' ||
    selectedStatus === 'polling' ||
    selectedStatus === 'streaming' ||
    selectedStatus === 'loading' ||
    selectedExecutableNode.isRunning ||
    selectedExecutableNode.isPolling ||
    selectedExecutableNode.busy;
  const isRunning = selectedRunActive || selectedNodeBusy || selectedExecutableNode.anyBusy;

  // === 主题派生样式 ===
  // 科技风: 深色玻璃面板 + 圆角  /  像素风: 硬边 + 硬阴影
  const barBg = isPixel
    ? '#FFFFFF'
    : 'var(--t8-actionbar-bg, rgba(28,28,32,0.92))';
  const barBorder = isPixel
    ? '2px solid #1A1410'
    : 'var(--t8-actionbar-border, 1px solid rgba(255,255,255,0.1))';
  const barRadius = isPixel ? 8 : 10;
  const barShadow = isPixel
    ? '3px 3px 0 #1A1410'
    : 'var(--t8-actionbar-shadow, 0 6px 24px rgba(0,0,0,0.4))';

  const onRun = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.blur();
    if (isRunning) return;
    if (selectedExecutableNode.selectedIds.length > 1) {
      triggerRunMany(selectedExecutableNode.selectedIds, 'batch');
      return;
    }
    triggerRun(selectedExecutableNode.id, 'single');
  };
  const onStop = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.blur();
    cancelNodes(selectedExecutableNode.selectedIds);
  };
  const onClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.blur();
    setNodes((nds) =>
      nds.map((n) => (selectedExecutableNode.selectedIds.includes(n.id) ? { ...n, selected: false } : n)),
    );
  };

  const blockEnterActivation = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter') event.preventDefault();
  };

  const runColor = actionColors.run;

  // 按钮通用样式生成器
  const mkBtn = (kind: 'run' | 'stop' | 'close'): React.CSSProperties => {
    const color =
      kind === 'run'
        ? runColor
        : kind === 'stop'
          ? actionColors.stop
          : actionColors.close;
    if (isPixel) {
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: kind === 'run' ? '4px 10px' : '4px 6px',
        height: 28,
        background: kind === 'run' ? color : '#FFFFFF',
        color: kind === 'run' ? '#FFFFFF' : color,
        border: `2px solid ${kind === 'run' ? '#1A1410' : color}`,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 700,
        boxShadow: `2px 2px 0 ${kind === 'run' ? '#1A1410' : color}`,
        userSelect: 'none' as const,
      };
    }
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: kind === 'run' ? '4px 10px' : '4px 6px',
      height: 26,
      background: kind === 'run'
        ? `${color}22`
        : isDark
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(0,0,0,0.04)',
      color,
      border: `1px solid ${color}66`,
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      transition: 'background 0.12s, border-color 0.12s',
      userSelect: 'none' as const,
    };
  };

  // hover 增强
  const onEnter = (e: React.MouseEvent, kind: 'run' | 'stop' | 'close') => {
    const color =
      kind === 'run' ? runColor : kind === 'stop' ? actionColors.stop : actionColors.close;
    if (isPixel) return;
    (e.currentTarget as HTMLElement).style.background = `${color}33`;
    (e.currentTarget as HTMLElement).style.borderColor = color;
  };
  const onLeave = (e: React.MouseEvent, kind: 'run' | 'stop' | 'close') => {
    const color =
      kind === 'run' ? runColor : kind === 'stop' ? actionColors.stop : actionColors.close;
    if (isPixel) return;
    (e.currentTarget as HTMLElement).style.background =
      kind === 'run'
        ? `${color}22`
        : isDark
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(0,0,0,0.04)';
    (e.currentTarget as HTMLElement).style.borderColor = `${color}66`;
  };

  return (
    <div
      // pointer-events: none 让外层不阻挡画布交互; 子按钮独立 enable
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div
        // 真正的浮动条
        data-node-action-bar
        data-theme-visual={visualStyle}
        className={`nodrag nopan t8-node-action-bar t8-node-action-bar--${visualStyle}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: rightX,
          top: topY,
          // 整体右对齐 + 向上脱离 (translate 不受 transform-origin 影响)
          transform: 'translate(-100%, -100%)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 6px',
          background: barBg,
          border: barBorder,
          borderRadius: barRadius,
          boxShadow: barShadow,
          backdropFilter: isPixel ? 'none' : 'blur(6px)',
          pointerEvents: 'all',
          whiteSpace: 'nowrap',
        }}
      >
        {/* 执行 / 中止 (互斥) */}
        {isRunning ? (
          <button
            type="button"
            onClick={onStop}
            onKeyDown={blockEnterActivation}
            onMouseEnter={(e) => onEnter(e, 'stop')}
            onMouseLeave={(e) => onLeave(e, 'stop')}
            title={`中止当前运行${selectedProgressLabel ? ` (${selectedProgressLabel})` : ''}`}
            style={mkBtn('stop')}
          >
            <Square size={12} fill="currentColor" />
            <span>STOP{selectedProgressLabel ? ` ${selectedProgressLabel}` : ''}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            onKeyDown={blockEnterActivation}
            onMouseEnter={(e) => onEnter(e, 'run')}
            onMouseLeave={(e) => onLeave(e, 'run')}
            title="执行此节点"
            style={mkBtn('run')}
          >
            <Play size={12} fill="currentColor" />
            <span>RUN</span>
          </button>
        )}

        {/* 取消选中 (关闭操作栏) */}
        <button
          type="button"
          onClick={onClose}
          onKeyDown={blockEnterActivation}
          onMouseEnter={(e) => onEnter(e, 'close')}
          onMouseLeave={(e) => onLeave(e, 'close')}
          title="取消选中 (隐藏操作栏)"
          style={mkBtn('close')}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

export default NodeActionBar;
