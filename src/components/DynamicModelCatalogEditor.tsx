import { useMemo, useState } from 'react';
import { Download, Loader2, Plus, X } from 'lucide-react';
import { useApiKeysStore } from '../stores/apiKeys';
import { modelsForKind, type DynamicModelKind } from '../providers/modelCatalog';

type CatalogKind = Exclude<DynamicModelKind, 'unknown'>;
const KINDS: Array<{ value: CatalogKind; label: string }> = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'chat', label: '文本' },
];

export default function DynamicModelCatalogEditor({
  onClose,
  onRefresh,
  refreshStatus,
}: {
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  refreshStatus?: { loading?: boolean; ok?: boolean; message?: string };
}) {
  const { settings, save } = useApiKeysStore();
  const [kind, setKind] = useState<CatalogKind>('image');
  const [manualModel, setManualModel] = useState('');
  const catalog = settings.zhenzhenModelCatalog || {
    all: [], imageModels: [], videoModels: [], audioModels: [], chatModels: [], unknownModels: [],
    manualModels: [], typeOverrides: {},
  };
  const models = useMemo(() => modelsForKind(settings, kind), [settings, kind]);

  const saveCatalog = async (patch: Partial<typeof catalog>) => {
    await save({ zhenzhenModelCatalog: { ...catalog, ...patch } });
  };
  const setModelKind = (model: string, nextKind: DynamicModelKind) => {
    void saveCatalog({ typeOverrides: { ...(catalog.typeOverrides || {}), [model]: nextKind } });
  };
  const setModelProtocol = (model: string, protocol: string) => {
    if (kind === 'image') {
      void save({ zhenzhenImageModelProtocols: { ...(settings.zhenzhenImageModelProtocols || {}), [model]: protocol as any } });
    } else if (kind === 'video') {
      void save({ zhenzhenVideoModelProtocols: { ...(settings.zhenzhenVideoModelProtocols || {}), [model]: protocol as any } });
    }
  };
  const addManualModel = () => {
    const model = manualModel.trim();
    if (!model) return;
    const manualModels = Array.from(new Set([...(catalog.manualModels || []), model]));
    void saveCatalog({
      manualModels,
      typeOverrides: { ...(catalog.typeOverrides || {}), [model]: kind },
    });
    setManualModel('');
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 p-4">
      <div className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-white">渠道模型目录</div>
            <div className="mt-1 text-[11px] text-white/55">节点直接发送真实模型名称。拉取失败时使用最后成功缓存。</div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-white/60 hover:text-white" title="关闭" aria-label="关闭模型目录">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <button type="button" onClick={onRefresh} disabled={refreshStatus?.loading} className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-50">
            {refreshStatus?.loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            拉取模型
          </button>
          <span className={`min-w-0 truncate text-[11px] ${refreshStatus?.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
            {refreshStatus?.message || (catalog.fetchedAt ? `上次更新 ${catalog.fetchedAt}` : '尚未拉取模型')}
          </span>
        </div>

        <div className="grid grid-cols-4 border-b border-white/10 p-1" role="tablist" aria-label="模型类型">
          {KINDS.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={kind === item.value} onClick={() => setKind(item.value)} className={`px-3 py-2 text-xs font-bold ${kind === item.value ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex gap-2 border-b border-white/10 p-3">
            <input value={manualModel} onChange={(event) => setManualModel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addManualModel(); }} placeholder="手动输入真实模型名称" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/50" />
            <button type="button" onClick={addManualModel} className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-2 text-xs text-white">
              <Plus size={13} /> 添加
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {models.length ? models.map((model) => (
              <div key={model} className="grid grid-cols-[minmax(0,1fr)_120px_170px] items-center gap-3 border-b border-white/8 px-4 py-2.5">
                <span className="truncate font-mono text-xs text-white" title={model}>{model}</span>
                <select value={catalog.typeOverrides?.[model] || kind} onChange={(event) => setModelKind(model, event.target.value as DynamicModelKind)} className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white">
                  {KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  <option value="unknown">未分类</option>
                </select>
                {kind === 'image' ? (
                  <select value={settings.zhenzhenImageModelProtocols?.[model] || 'images'} onChange={(event) => setModelProtocol(model, event.target.value)} className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white">
                    <option value="images">Images API</option>
                    <option value="azure-gpt-image">Azure GPT Image · 标准</option>
                    <option value="images-generations">Images generations</option>
                    <option value="images-edits">Images edits</option>
                    <option value="openai-chat">OpenAI Chat</option>
                    <option value="gemini-generate-content">Gemini generateContent</option>
                    <option value="gemini-interactions">Gemini interactions</option>
                  </select>
                ) : kind === 'video' ? (
                  <select value={settings.zhenzhenVideoModelProtocols?.[model] || 'videos'} onChange={(event) => setModelProtocol(model, event.target.value)} className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white">
                    <option value="videos">Videos API</option>
                    <option value="seedance-v3">Seedance v3</option>
                  </select>
                ) : <span className="text-[10px] text-white/35">自动协议</span>}
              </div>
            )) : (
              <div className="p-8 text-center text-xs text-white/45">当前分类没有模型，请拉取或手动添加。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
