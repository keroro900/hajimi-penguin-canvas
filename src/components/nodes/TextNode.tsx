import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Hash, Type } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import ResizableCorners from './ResizableCorners';
import { getCornerResizeBehavior } from '../../utils/nodeResizeBehavior';
import { normalizeRhNodeId } from '../../utils/rhTextBinding';
import MentionPromptInput from './MentionPromptInput';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';
import { useDownstreamMediaMaterials, useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import { useThemeStore } from '../../stores/theme';
import SmartNodeShell from './shared/SmartNodeShell';
import { useNodeGeometrySync } from './shared/useNodeGeometrySync';

/**
 * 文本节点 - 提示词输入
 * 输出 data.prompt 给下游(图像/LLM 节点通过连接读取)
 *
 * v1.x: 固定宽 260 + textarea h-24
 * v2.x: 选中后可拖 4 角缩放 (ResizableCorners + xyflow NodeResizeControl);
 *       内部布局改为响应式 (width/height 100%), textarea 占所有剩余高度
 * v2.1: root 用本地 state 持有具体 px 尺寸 — 解决 width:'100%' + wrapper auto 形成百分比循环
 *       测量异常 (measured.width=0 → NodeResizeControl 算出 aspectRatio=0 → 只能纵向拉大) 的问题。
 *       同时 root 始终有具体 px → wrapper measured 准确 → handleBounds 准确, 连线稳定。
 */
function uniqueMentionMaterials(materials: Material[]): Material[] {
  const seen = new Set<string>();
  return materials.filter((material) => {
    const key = `${material.kind}:${material.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TextNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const updateNodeInternals = useUpdateNodeInternals();
  const smartRootRef = useRef<HTMLDivElement | null>(null);
  const d = data as any;
  const promptText = typeof d?.prompt === 'string' ? d.prompt : '';
  const legacyText = typeof d?.text === 'string' ? d.text : '';
  const text = promptText || legacyText;
  const promptMentions: MediaMention[] = Array.isArray(d?.promptMentions) ? d.promptMentions : [];
  const upstream = useUpstreamMaterials(id);
  const downstreamMedia = useDownstreamMediaMaterials(id);
  const mentionMaterials = useMemo(
    () => uniqueMentionMaterials([
      ...upstream.images,
      ...upstream.videos,
      ...upstream.audios,
      ...downstreamMedia,
      ...upstream.texts,
    ]),
    [upstream.images, upstream.videos, upstream.audios, downstreamMedia, upstream.texts],
  );
  const resolvedPrompt = useMemo(
    () => resolveMediaMentions(text, promptMentions, mentionMaterials),
    [text, promptMentions, mentionMaterials],
  );
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const rhNodeIdRaw = String((data as any)?.rhNodeId ?? '');
  const rhNodeId = normalizeRhNodeId(rhNodeIdRaw);
  const resizeBehavior = getCornerResizeBehavior('text');
  const smartCardWidth = Math.max(240, Number(d?.smartCardWidth) || 300);
  const smartCardHeight = Math.max(120, Number(d?.smartCardHeight) || 170);
  const syncSmartNodeGeometry = useNodeGeometrySync(id, updateNodeInternals);

  useEffect(() => {
    if (!promptMentions.length) {
      if (d?.promptResolved) update({ promptResolved: '' });
      return;
    }
    if (d?.promptResolved !== resolvedPrompt) update({ promptResolved: resolvedPrompt });
  }, [d?.promptResolved, promptMentions.length, resolvedPrompt, update]);

  const handleRhNodeIdChange = useCallback(
    (value: string) => {
      const digits = value.replace(/\D+/g, '');
      update({ rhNodeId: digits });
    },
    [update],
  );
  useLayoutEffect(() => {
    syncSmartNodeGeometry();
  }, [selected, smartCardWidth, smartCardHeight, syncSmartNodeGeometry]);

  return (
    <SmartNodeShell
      rootRef={smartRootRef}
      className="t8-smart-text-node relative overflow-visible"
      style={{ width: smartCardWidth }}
    >
      <div
        className={`t8-node t8-smart-node-card t8-smart-text-card transition-all ${selected ? 't8-smart-node-card--selected' : ''}`}
        style={{ height: smartCardHeight }}
      >
        <Handle type="target" position={Position.Left} className="t8-smart-node-port !border-0" style={{ top: '50%' }} />
        <Handle type="source" position={Position.Right} className="t8-smart-node-port !border-0" style={{ top: '50%' }} />
        <ResizableCorners
          selected={selected}
          minWidth={240}
          minHeight={120}
          maxWidth={620}
          maxHeight={420}
          accent="var(--t8-accent)"
          keepAspectRatio={resizeBehavior.keepAspectRatio}
          onResize={(_e, p) => {
            update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
            syncSmartNodeGeometry();
          }}
          onResizeEnd={(_e, p) => {
            update({ smartCardWidth: Math.round(p.width), smartCardHeight: Math.round(p.height) });
            syncSmartNodeGeometry();
          }}
        />

        <div className="t8-smart-text-toolbar">
          <div className="t8-smart-node-icon">
            <Type size={13} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="t8-smart-node-title">文本</div>
            <div className="t8-smart-node-subtitle">
              {resolvedPrompt.length} 字符{promptMentions.length ? ` · @${promptMentions.length}` : ''}
            </div>
          </div>
        </div>

        <div className="t8-smart-node-body t8-smart-text-body">
          <MentionPromptInput
            title="文本节点 Prompt"
            value={text}
            mentions={promptMentions}
            materials={mentionMaterials}
            onChange={(value, mentions) => update({
              prompt: value,
              text: value,
              promptMentions: mentions,
              promptResolved: resolveMediaMentions(value, mentions, mentionMaterials),
            })}
            placeholder="输入提示词..."
            promptTemplateKind="image"
            isDark={isDark}
            isPixel={isPixel}
            expandable
            fillHeight
            className="t8-textarea t8-smart-text-input nodrag nowheel"
          />
          <div className="t8-smart-text-footer">
            <span>{resolvedPrompt.length} 字符{promptMentions.length ? ` · @${promptMentions.length}` : ''}</span>
            <label
              className="ml-auto flex items-center gap-1 nodrag nowheel"
              title="可选：填 RH 应用 nodeInfoList 里的节点序号，下游 RH 节点会按这个 RH# 自动绑定文本参数"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Hash size={9} />
              <input
                value={rhNodeIdRaw}
                onChange={(e) => handleRhNodeIdChange(e.target.value)}
                placeholder="RH#"
                inputMode="numeric"
                aria-label="RH 节点序号"
                className="t8-input h-5 w-12 px-1 text-[10px]"
              />
              {rhNodeId && <span style={{ color: 'var(--t8-accent)' }}>#{rhNodeId}</span>}
            </label>
          </div>
        </div>
      </div>
    </SmartNodeShell>
  );
};

export default memo(TextNode);
