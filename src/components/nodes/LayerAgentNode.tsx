import { memo, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  BoxSelect,
  Brush,
  Download,
  Eraser,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  Lock,
  MousePointer2,
  PanelRight,
  RefreshCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Type,
  Unlock,
  WandSparkles,
  X,
} from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import SmartImage from '../SmartImage';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { decomposeImageLayers } from '../../services/layerAgent';
import type { LayerAgentItem, LayerItemType, LayerStack } from '../../types/layerAgent';

const ACCENT = '#38bdf8';
const PANEL_STYLE: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(8,13,24,.96), rgba(8,13,24,.9))',
  border: '1px solid rgba(148,163,184,.22)',
  boxShadow: '0 18px 50px rgba(2,6,23,.42)',
};

const layerTypeLabel: Record<LayerItemType, string> = {
  background: '背景',
  product: '主品',
  person: '人物',
  text: '文字',
  logo: 'Logo',
  effect: '光效',
  prop: '道具',
  shadow: '阴影',
  unknown: '图层',
};

const layerTypeTone: Record<LayerItemType, string> = {
  background: 'from-slate-500/25 to-cyan-500/10 border-slate-400/20',
  product: 'from-amber-400/30 to-orange-500/10 border-amber-300/30',
  person: 'from-rose-400/30 to-pink-500/10 border-rose-300/30',
  text: 'from-sky-400/25 to-blue-500/10 border-sky-300/30',
  logo: 'from-violet-400/25 to-fuchsia-500/10 border-violet-300/30',
  effect: 'from-cyan-400/25 to-teal-500/10 border-cyan-300/30',
  prop: 'from-emerald-400/25 to-green-500/10 border-emerald-300/30',
  shadow: 'from-zinc-500/25 to-slate-800/20 border-zinc-400/25',
  unknown: 'from-slate-400/20 to-slate-600/10 border-slate-300/25',
};

const toLayerStack = (value: unknown): LayerStack | null => {
  if (!value || typeof value !== 'object') return null;
  const stack = value as LayerStack;
  if (!Array.isArray(stack.layers)) return null;
  return stack;
};

const normalizeLayer = (layer: LayerAgentItem, index: number): LayerAgentItem => ({
  ...layer,
  id: layer.id || `layer-${index + 1}`,
  name: layer.name || `${layerTypeLabel[layer.type || 'unknown']} ${index + 1}`,
  type: layer.type || 'unknown',
  visible: layer.visible !== false,
  locked: Boolean(layer.locked),
  opacity: Number.isFinite(Number(layer.opacity)) ? Math.max(0, Math.min(100, Number(layer.opacity))) : 100,
  feather: Number.isFinite(Number(layer.feather)) ? Math.max(0, Math.min(40, Number(layer.feather))) : 0,
  blendMode: layer.blendMode || 'normal',
  editable: layer.editable !== false,
});

const visibleLayerImageUrl = (layer: LayerAgentItem, panelSource: string) => {
  const imageUrl = String(layer.imageUrl || '').trim();
  if (!imageUrl) return '';
  if (layer.imageUrl === panelSource) return '';
  return imageUrl;
};

const buttonClass =
  'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/5 px-2 text-[11px] text-white/75 transition hover:bg-white/10 hover:text-white';

const iconButtonClass =
  'inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white';

const LayerAgentNode = (p: NodeProps) => {
  const data = (p.data || {}) as any;
  const updateNodeData = useUpdateNodeData(p.id);
  const upstream = useUpstreamMaterials(p.id);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'brush' | 'eraser' | 'text'>('select');

  const stack = useMemo(() => {
    const normalized = toLayerStack(data.layerStack);
    if (!normalized) return null;
    return {
      ...normalized,
      layers: normalized.layers.map(normalizeLayer),
    };
  }, [data.layerStack]);

  const sourceImage = String(data.sourceImageUrl || data.imageUrl || upstream.images[0]?.url || '').trim();
  const layers = stack?.layers ?? [];
  const visibleLayers = layers.filter((layer) => layer.visible !== false);
  const selectedLayerId = String(data.selectedLayerId || layers.find((layer) => layer.type !== 'background')?.id || layers[0]?.id || '');
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || layers[0] || null;
  const status = String(data.status || 'idle');
  const isBusy = status === 'running' || status === 'planning' || status === 'extracting' || status === 'repairing';

  const patchLayer = (layerId: string, patch: Partial<LayerAgentItem>) => {
    if (!stack) return;
    updateNodeData({
      layerStack: {
        ...stack,
        layers: stack.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)),
      },
    });
  };

  const ensurePreviewStack = async () => {
    const image = sourceImage || stack?.sourceImageUrl || '';
    if (!image) {
      updateNodeData({ status: 'error', error: '请先连接或拖入一张图片' });
      return;
    }
    updateNodeData({ status: 'planning', error: '' });
    try {
      const result = await decomposeImageLayers({
        sourceImageUrl: image,
        mode: data.layerAgentMode || data.mode || 'standard',
        requestedLayers: Array.isArray(data.requestedLayers) ? data.requestedLayers : undefined,
        prompt: data.prompt || '',
      });
      const nextStack = result.stack;
      updateNodeData({
        status: 'success',
        error: '',
        imageUrl: nextStack.previewUrl || nextStack.sourceImageUrl,
        sourceImageUrl: image,
        selectedLayerId: nextStack.layers.find((layer) => layer.type !== 'background')?.id || nextStack.layers[0]?.id || '',
        layerStack: nextStack,
      });
    } catch (err) {
      updateNodeData({
        status: 'error',
        error: err instanceof Error ? err.message : '图片分层失败',
      });
    }
  };

  useRunTrigger(p.id, ensurePreviewStack, 'layer-agent');

  const renderWorkspace = () => {
    if (!workspaceOpen) return null;
    const panelSource = stack?.repairedBackgroundUrl || stack?.sourceImageUrl || sourceImage;
    return createPortal(
      <div className="fixed inset-0 z-[10150] flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm nodrag nowheel">
        <div className="flex h-[min(880px,calc(100vh-40px))] w-[min(1280px,calc(100vw-40px))] overflow-hidden rounded-xl" style={PANEL_STYLE}>
          <section className="flex min-w-0 flex-1 flex-col border-r border-white/10">
            <header className="flex h-12 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-400/15 text-cyan-200">
                  <Layers size={16} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">AI 图片分层工作区</div>
                  <div className="text-[11px] text-white/45">左侧编辑当前层，右侧管理分层结构</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button className={buttonClass} onClick={() => void ensurePreviewStack()}>
                  <RefreshCcw size={12} />
                  重新预览
                </button>
                <button className={buttonClass}>
                  <Download size={12} />
                  导出
                </button>
                <button className={iconButtonClass} onClick={() => setWorkspaceOpen(false)} aria-label="关闭">
                  <X size={14} />
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-white/10 bg-white/[.025] py-3">
                {[
                  ['select', MousePointer2, '选择'],
                  ['brush', Brush, '画笔'],
                  ['eraser', Eraser, '擦除'],
                  ['text', Type, '文字'],
                ].map(([id, Icon, label]) => (
                  <button
                    key={id as string}
                    className={`${iconButtonClass} ${activeTool === id ? 'border-cyan-300/50 bg-cyan-400/20 text-cyan-100' : ''}`}
                    onClick={() => setActiveTool(id as any)}
                    title={label as string}
                  >
                    <Icon size={15} />
                  </button>
                ))}
              </aside>

              <main className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-10 items-center justify-between border-b border-white/10 px-3">
                  <div className="flex items-center gap-2 text-[11px] text-white/55">
                    <span className="rounded bg-white/5 px-2 py-1 text-white/75">{selectedLayer?.name || '未选择图层'}</span>
                    <span>{selectedLayer ? layerTypeLabel[selectedLayer.type] : '等待分层'}</span>
                    <span>工具：{activeTool === 'select' ? '选择' : activeTool === 'brush' ? '画笔' : activeTool === 'eraser' ? '擦除' : '文字'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className={buttonClass}>
                      <Scissors size={12} />
                      单层抠边
                    </button>
                    <button className={buttonClass}>
                      <WandSparkles size={12} />
                      修补背景
                    </button>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,.12),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(168,85,247,.10),transparent_30%)]">
                  <div className="flex min-h-0 items-center justify-center p-6">
                    <div className="relative aspect-square w-[min(72vh,72vw)] max-w-[720px] overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(45deg,rgba(255,255,255,.045)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,.045)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,.045)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,.045)_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] shadow-2xl">
                      {panelSource ? (
                        <SmartImage src={panelSource} alt="背景层" className="absolute inset-0 h-full w-full object-contain opacity-80" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/35">连接图片后开始分层</div>
                      )}
                      {visibleLayers.filter((layer) => layer.type !== 'background').map((layer, index) => (
                        <div
                          key={layer.id}
                          className={`absolute inset-5 rounded-lg border bg-gradient-to-br ${layerTypeTone[layer.type]} ${selectedLayerId === layer.id ? 'ring-2 ring-cyan-300/70' : ''}`}
                          style={{
                            opacity: (layer.opacity ?? 100) / 100,
                            mixBlendMode: (layer.blendMode || 'normal') as CSSProperties['mixBlendMode'],
                            transform: `translate(${index * 10}px, ${index * 8}px) scale(${1 - index * 0.035})`,
                          }}
                        >
                          {visibleLayerImageUrl(layer, panelSource) ? (
                            <SmartImage src={visibleLayerImageUrl(layer, panelSource)} alt={layer.name} className="h-full w-full rounded-lg object-contain" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-semibold text-white/65">{layer.name}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 border-t border-white/10 bg-black/15 p-3">
                    <InspectorMetric label="图层" value={`${layers.length || 0}`} />
                    <InspectorMetric label="可见" value={`${visibleLayers.length || 0}`} />
                    <InspectorMetric label="模式" value={stack?.meta?.mode || 'standard'} />
                    <InspectorMetric label="预估" value={stack?.meta?.costEstimateCny != null ? `¥${stack.meta.costEstimateCny}` : '待计算'} />
                  </div>
                </div>
              </main>
            </div>
          </section>

          <aside className="flex w-[360px] shrink-0 flex-col bg-white/[.035]">
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <PanelRight size={15} />
                图层
              </div>
              <button className={buttonClass}>
                <ImagePlus size={12} />
                新层
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {layers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 bg-white/[.03] p-4 text-center text-xs text-white/45">
                  点击“生成分层预览”后会在这里显示背景、主品、文字和装饰层。
                </div>
              ) : (
                layers.map((layer, index) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    index={index}
                    selected={selectedLayerId === layer.id}
                    onSelect={() => updateNodeData({ selectedLayerId: layer.id })}
                    onPatch={(patch) => patchLayer(layer.id, patch)}
                  />
                ))
              )}
            </div>

            <div className="border-t border-white/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/85">
                <SlidersHorizontal size={14} />
                当前层编辑
              </div>
              {selectedLayer ? (
                <div className="space-y-3">
                  <SliderControl
                    label="透明度"
                    value={selectedLayer.opacity ?? 100}
                    min={0}
                    max={100}
                    onChange={(value) => patchLayer(selectedLayer.id, { opacity: value })}
                  />
                  <SliderControl
                    label="羽化"
                    value={selectedLayer.feather ?? 0}
                    min={0}
                    max={40}
                    onChange={(value) => patchLayer(selectedLayer.id, { feather: value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(['normal', 'screen', 'multiply', 'overlay'] as const).map((mode) => (
                      <button
                        key={mode}
                        className={`${buttonClass} ${selectedLayer.blendMode === mode ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100' : ''}`}
                        onClick={() => patchLayer(selectedLayer.id, { blendMode: mode })}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded border border-white/10 bg-white/[.03] p-3 text-xs text-white/45">还没有可编辑图层</div>
              )}
            </div>
          </aside>
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div
      className={`t8-node relative w-[360px] overflow-hidden rounded-xl text-white ${p.selected ? 'is-selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: PORT_COLOR.image }} />
      <Handle type="source" position={Position.Right} style={{ background: PORT_COLOR.image }} />

      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-200">
            <Layers size={17} />
          </div>
          <div>
            <div className="text-sm font-bold">AI 图片分层</div>
            <div className="text-[10px] text-white/45">混合模式 Layer Agent</div>
          </div>
        </div>
        <div className={`rounded-full px-2 py-0.5 text-[10px] ${isBusy ? 'bg-cyan-400/15 text-cyan-100' : status === 'success' ? 'bg-emerald-400/15 text-emerald-100' : status === 'error' ? 'bg-rose-400/15 text-rose-100' : 'bg-white/8 text-white/55'}`}>
          {isBusy ? '处理中' : status === 'success' ? '已分层' : status === 'error' ? '需检查' : '待运行'}
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="relative h-40 overflow-hidden rounded-lg border border-white/10 bg-slate-950/70">
          {sourceImage || stack?.previewUrl ? (
            <SmartImage src={stack?.previewUrl || sourceImage} alt="分层预览" className="h-full w-full object-cover opacity-80" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-white/35">
              <BoxSelect size={22} />
              <span className="text-xs">连接图片后开始拆层</span>
            </div>
          )}
          {layers.slice(0, 4).map((layer, index) => (
            <div
              key={layer.id}
              className={`absolute rounded border bg-gradient-to-br ${layerTypeTone[layer.type]}`}
              style={{
                left: `${12 + index * 8}%`,
                top: `${14 + index * 7}%`,
                width: `${52 - index * 4}%`,
                height: `${52 - index * 3}%`,
                opacity: (layer.opacity ?? 100) / 100,
              }}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <InspectorMetric label="图层" value={`${layers.length || 0}`} compact />
          <InspectorMetric label="模式" value={stack?.meta?.mode || '标准'} compact />
          <InspectorMetric label="成本" value={stack?.meta?.costEstimateCny != null ? `¥${stack.meta.costEstimateCny}` : '预估'} compact />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {layers.slice(0, 5).map((layer) => (
            <button
              key={layer.id}
              className={`rounded border px-2 py-1 text-[10px] ${selectedLayerId === layer.id ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/[.04] text-white/55'}`}
              onClick={() => updateNodeData({ selectedLayerId: layer.id })}
            >
              {layer.name}
            </button>
          ))}
        </div>

        {data.error ? <div className="rounded border border-rose-400/25 bg-rose-400/10 px-2 py-1.5 text-[11px] text-rose-100">{String(data.error)}</div> : null}

        <div className="flex items-center gap-2">
          <button className={`${buttonClass} flex-1 border-cyan-300/30 bg-cyan-400/15 text-cyan-100`} onClick={() => void ensurePreviewStack()}>
            <Sparkles size={13} />
            生成分层预览
          </button>
          <button className={`${buttonClass} flex-1`} onClick={() => setWorkspaceOpen(true)}>
            <PanelRight size={13} />
            打开工作区
          </button>
        </div>
      </div>

      {renderWorkspace()}
    </div>
  );
};

function InspectorMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded border border-white/10 bg-white/[.04] ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
      <div className="text-[10px] text-white/38">{label}</div>
      <div className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-white/85`}>{value}</div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-cyan-300"
      />
    </label>
  );
}

function LayerRow({
  layer,
  index,
  selected,
  onSelect,
  onPatch,
}: {
  layer: LayerAgentItem;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<LayerAgentItem>) => void;
}) {
  return (
    <button
      type="button"
      className={`group flex w-full items-center gap-2 rounded-lg border p-2 text-left transition ${selected ? 'border-cyan-300/55 bg-cyan-400/12' : 'border-white/10 bg-white/[.035] hover:bg-white/[.06]'}`}
      onClick={onSelect}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border bg-gradient-to-br ${layerTypeTone[layer.type]}`}>
        {layer.imageUrl ? <SmartImage src={layer.imageUrl} alt={layer.name} className="h-full w-full object-cover" /> : <Layers size={15} className="text-white/65" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/35">{String(index + 1).padStart(2, '0')}</span>
          <span className="truncate text-xs font-semibold text-white/86">{layer.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/42">
          <span>{layerTypeLabel[layer.type]}</span>
          <span>{layer.confidence != null ? `${Math.round(layer.confidence * 100)}%` : '待识别'}</span>
          {layer.text?.content ? <span className="truncate">“{layer.text.content}”</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span
          role="button"
          tabIndex={0}
          className={iconButtonClass}
          onClick={(event) => {
            event.stopPropagation();
            onPatch({ visible: layer.visible === false });
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {layer.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
        </span>
        <span
          role="button"
          tabIndex={0}
          className={iconButtonClass}
          onClick={(event) => {
            event.stopPropagation();
            onPatch({ locked: !layer.locked });
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </span>
      </div>
    </button>
  );
}

export default memo(LayerAgentNode);
