import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { AlertCircle, Loader2, Sparkles, Box, Globe, UserSquare2 } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import { generateImage } from '../../services/generation';
import { effectiveModelId, modelsForKind } from '../../providers/modelCatalog';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import SmartImage from '../SmartImage';
import PromptTextarea from '../PromptTextarea';

/**
 * PresetImageNode - 特殊图像节点(multi-angle-3d / panorama-720 / penguin-portrait)
 *
 * 通过 data.preset 区分:
 *   - 'multi-angle-3d' = 3D 多视角(自动循环 4 个视角生成 4 张)
 *   - 'panorama-720'   = 720° 全景(16:9 超宽,固定 prompt 模板)
 *   - 'penguin-portrait' = 企鹅肖像专用(固定风格)
 *
 * 复用 generateImage,把上游 prompt + 预设模板 拼接后调用
 */
const COLOR = '#818cf8';

interface PresetMeta {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  promptTemplate: (userPrompt: string) => string[];
  size?: string;
}

const PRESETS: Record<string, PresetMeta> = {
  'multi-angle-3d': {
    title: '多角度 3D',
    subtitle: '4 视角生成',
    icon: <Box size={13} />,
    promptTemplate: (p) => [
      `${p}, front view, isometric 3D rendering, clean white background, character sheet style`,
      `${p}, side view, isometric 3D rendering, clean white background, character sheet style`,
      `${p}, back view, isometric 3D rendering, clean white background, character sheet style`,
      `${p}, three-quarter view, isometric 3D rendering, clean white background, character sheet style`,
    ],
    size: '1024x1024',
  },
  'panorama-720': {
    title: '720 全景',
    subtitle: '16:9 超宽',
    icon: <Globe size={13} />,
    promptTemplate: (p) => [
      `${p}, 720 degree panoramic photo, ultra wide angle, equirectangular projection, immersive landscape`,
    ],
    size: '1792x1024',
  },
  'penguin-portrait': {
    title: '企鹅肖像',
    subtitle: '专用风格',
    icon: <UserSquare2 size={13} />,
    promptTemplate: (p) => [
      `cute penguin character portrait, ${p}, soft cartoon style, vibrant colors, expressive eyes, studio lighting, white background, masterpiece`,
    ],
    size: '1024x1024',
  },
};

const PresetImageNode = (p: NodeProps) => {
  const update = useUpdateNodeData(p.id);
  const { getEdges, getNodes } = useReactFlow();
  const d = p.data as any;
  const preset: string = d?.preset || 'multi-angle-3d';
  const meta = PRESETS[preset] || PRESETS['multi-angle-3d'];

  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const status: 'idle' | 'running' | 'success' | 'error' = d?.status || 'idle';
  const localPrompt: string = d?.localPrompt || '';
  const urls: string[] = d?.urls || [];
  const imageUrl: string | undefined = d?.imageUrl;
  const apiSettings = useApiKeysStore((state) => state.settings);
  const imageModels = useMemo(() => modelsForKind(apiSettings, 'image'), [apiSettings]);
  const model = effectiveModelId(d?.apiModel || d?.model, imageModels);
  const abortRef = useRef(false);

  useEffect(() => () => { abortRef.current = true; }, []);

  const collectUpstreamPrompt = useCallback((): string => {
    const edges = getEdges();
    const nodes = getNodes();
    const upstreamIds = edges.filter((e) => e.target === p.id).map((e) => e.source);
    const prompts: string[] = [];
    for (const uid of upstreamIds) {
      const n = nodes.find((x) => x.id === uid);
      const up = (n?.data as any)?.prompt;
      if (up) prompts.push(String(up));
    }
    return prompts.join(', ');
  }, [getEdges, getNodes, p.id]);

  const handleGenerate = async () => {
    setError(null);
    abortRef.current = false;

    const upstreamPrompt = collectUpstreamPrompt();
    const userPrompt = [upstreamPrompt, localPrompt].filter(Boolean).join(', ').trim();
    if (!userPrompt) {
      setError('请输入提示词或连接上游');
      return;
    }

    const prompts = meta.promptTemplate(userPrompt);
    const total = prompts.length;
    update({ status: 'running', error: null, urls: [], imageUrl: undefined });
    setProgress({ done: 0, total });

    if (!model) {
      setError('请先拉取或手动填写图片模型');
      update({ status: 'error' });
      return;
    }

    const out: string[] = [];
    try {
      for (let i = 0; i < prompts.length; i++) {
        if (abortRef.current) break;
        const r = await generateImage({
          model,
          apiModel: model,
          prompt: prompts[i],
          size: meta.size || '1024x1024',
        });
        const firstUrl = r.urls?.[0];
        if (firstUrl) out.push(firstUrl);
        setProgress({ done: i + 1, total });
        update({ urls: [...out] });
      }
      update({
        status: 'success',
        urls: out,
        imageUrl: out[0],
        prompt: userPrompt,
      });
    } catch (e: any) {
      setError(e?.message || '生成失败');
      update({ status: 'error', error: e?.message });
    } finally {
      setProgress(null);
    }
  };

  // 接入运行总线,供批量运行调起
  useRunTrigger(p.id, handleGenerate);

  return (
    <div
      className={`t8-node relative rounded-xl transition-all ${p.selected ? 'is-selected' : ''}`}
      style={{
        width: 280,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: COLOR, border: 0 }} />
      <Handle type="source" position={Position.Right} style={{ background: COLOR, border: 0 }} />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: 'rgba(129,140,248,.2)', color: '#c7d2fe', boxShadow: `inset 0 0 0 1px ${COLOR}` }}
        >
          {meta.icon}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{meta.title}</div>
          <div className="text-[10px] text-white/40">{meta.subtitle}</div>
        </div>
      </div>

      <div className="p-2.5 space-y-2" onMouseDown={(e) => e.stopPropagation()}>
        <PromptTextarea
          title={`${meta.title} 提示词`}
          value={localPrompt}
          onValueChange={(value) => update({ localPrompt: value })}
          placeholder="输入主题描述(可与上游 prompt 合并)..."
          rows={3}
          promptTemplateKind="image"
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 resize-none"
        />

        <select value={model} onChange={(event) => update({ model: event.target.value, apiModel: event.target.value })} className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white">
          {model && !imageModels.includes(model) && <option value={model}>{model}</option>}
          {imageModels.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>

        <button
          onClick={handleGenerate}
          disabled={status === 'running'}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium disabled:opacity-50 transition-colors bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100"
        >
          {status === 'running' ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              {progress ? ` 生成中 ${progress.done}/${progress.total}` : ' 生成中...'}
            </>
          ) : (
            <>
              <Sparkles size={11} /> 生成
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

      {urls.length > 1 && (
        <div className="border-t border-white/10 p-2 grid grid-cols-2 gap-1">
          {urls.map((u, i) => (
            <SmartImage key={i} src={u} alt={`#${i}`} className="w-full rounded object-cover" thumbSize={240} />
          ))}
        </div>
      )}
      {urls.length === 1 && imageUrl && (
        <div className="border-t border-white/10 p-2">
          <SmartImage src={imageUrl} alt="结果" className="w-full rounded object-contain" thumbSize={720} />
        </div>
      )}
    </div>
  );
};

export default memo(PresetImageNode);
