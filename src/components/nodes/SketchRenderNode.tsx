import { memo, useCallback, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileCode2, Image as ImageIcon, Play, ShieldCheck } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { renderGenClawSketch } from '../../services/genclaw';
import { extractSketchCode } from '../../genclaw/sketchCode';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import SmartImage from '../SmartImage';

const COLOR = '#fb923c';

const SketchRenderNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const upstream = useUpstreamMaterials(id);
  const d = (data as any) || {};
  const [busy, setBusy] = useState(false);

  const upstreamCode = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const code = typeof d.sketchCode === 'string' && d.sketchCode.trim()
    ? d.sketchCode
    : upstreamCode;
  const width = Number(d.renderWidth || 1024);
  const height = Number(d.renderHeight || 1024);

  const renderSketch = useCallback(async () => {
    const source = String(code || '').trim();
    if (!source) {
      update({ status: 'error', error: '请粘贴 SVG/HTML 草图代码，或连接一个文本节点' });
      return;
    }
    setBusy(true);
    update({ status: 'generating', error: '' });
    try {
      const sketch = extractSketchCode(source);
      const result = await renderGenClawSketch({
        code: sketch.code,
        kind: sketch.kind,
        width,
        height,
        title: 'sketch-render',
      });
      update({
        sketchCode: sketch.code,
        sketchKind: sketch.kind,
        sketchImageUrl: result.imageUrl,
        imageUrl: result.imageUrl,
        imageUrls: [result.imageUrl],
        outputText: sketch.code,
        status: 'success',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '草图渲染失败' });
    } finally {
      setBusy(false);
    }
  }, [code, height, update, width]);

  useRunTrigger(id, renderSketch, 'sketch-renderer');

  return (
    <div
      className={`t8-node relative w-[520px] transition-all ${selected ? 'is-selected' : ''}`}
      data-sketch-renderer-root
    >
      <Handle type="target" position={Position.Left} className="!border-0" style={{ background: PORT_COLOR.text }} />
      <Handle id="image" type="source" position={Position.Right} className="!border-0" style={{ background: PORT_COLOR.image, top: 150 }} />
      <Handle id="text" type="source" position={Position.Right} className="!border-0" style={{ background: PORT_COLOR.text, top: 190 }} />

      <div className="t8-node-header flex items-center gap-2 rounded-t-[inherit] px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-current/10" style={{ color: COLOR }}>
          <FileCode2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black leading-tight">代码草图渲染器</div>
          <div className="text-[10px] leading-tight opacity-70">{d.imageUrl ? '已输出图像素材' : 'SVG / HTML 内联 SVG'}</div>
        </div>
        <ShieldCheck size={15} className="opacity-70" />
      </div>

      <div className="space-y-3 p-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-bold opacity-70">宽</span>
            <input
              type="number"
              value={width}
              onChange={(event) => update({ renderWidth: Number(event.target.value) || 1024 })}
              className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold opacity-70">高</span>
            <input
              type="number"
              value={height}
              onChange={(event) => update({ renderHeight: Number(event.target.value) || 1024 })}
              className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
            />
          </label>
        </div>

        <textarea
          value={code}
          spellCheck={false}
          placeholder="<svg ...>...</svg>"
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => update({ sketchCode: event.target.value })}
          className="t8-input nodrag nowheel h-44 w-full resize-none px-2 py-2 font-mono text-[11px] leading-relaxed"
        />

        <button
          type="button"
          className="t8-btn t8-btn-primary min-h-9 w-full px-3 text-[11px]"
          onClick={renderSketch}
          disabled={busy}
        >
          <Play size={14} />
          {busy ? '渲染中...' : '渲染草图'}
        </button>

        {d.error && (
          <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
            {d.error}
          </div>
        )}

        {d.imageUrl ? (
          <div className="overflow-hidden rounded-lg border border-current/15 bg-black/20">
            <SmartImage src={d.imageUrl} alt="草图渲染" className="h-56 w-full object-contain" />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-current/25 text-[11px] opacity-60">
            <ImageIcon size={14} className="mr-1" />
            渲染结果会显示在这里
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(SketchRenderNode);
