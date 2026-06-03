import { memo, useCallback, useMemo, useState } from 'react';
import { Handle, Position, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  SearchCheck,
  ShieldAlert,
} from 'lucide-react';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { placeSingleNode } from '../../utils/nodePlacement';
import { getAggregateParserStatus, resolveAggregateMedia, type AggregateParserMedia, type AggregateParserMode, type AggregateParserResult, type AggregateParserStatus } from '../../services/parseHub';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';

const COLOR = '#f472b6';

const PLATFORM_HINTS = [
  '抖音',
  'TikTok',
  '小红书',
  'Bilibili',
  '微博',
  'YouTube',
  'X / Twitter',
  'Instagram',
  '快手',
  'Threads',
  'Facebook',
  '贴吧',
  '公众号',
];

const KIND_LABEL: Record<string, string> = {
  image: '图像',
  video: '视频',
  audio: '音频',
  file: '文件',
  text: '文本',
};

function shortText(value: string, max = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function asMode(value: unknown): AggregateParserMode {
  return value === 'download' ? 'download' : 'parse';
}

function mediaUrls(media: AggregateParserMedia[], kind: AggregateParserMedia['kind']) {
  return media.filter((item) => item.kind === kind).map((item) => item.url).filter(Boolean);
}

function copyText(text: string) {
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
  navigator.clipboard.writeText(text).catch(() => undefined);
}

function openUrl(url: string) {
  if (!url || typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

const AggregateParserNode = (p: NodeProps) => {
  const update = useUpdateNodeData(p.id);
  const rf = useReactFlow();
  const upstream = useUpstreamMaterials(p.id);
  const d = (p.data as any) || {};

  const [checking, setChecking] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AggregateParserStatus | null>(null);
  const [message, setMessage] = useState('');

  const inputText = typeof d.aggregateParserInput === 'string' ? d.aggregateParserInput : '';
  const proxy = typeof d.aggregateParserProxy === 'string' ? d.aggregateParserProxy : '';
  const cookie = typeof d.aggregateParserCookie === 'string' ? d.aggregateParserCookie : '';
  const mode = asMode(d.aggregateParserMode);
  const acceptedCompliance = Boolean(d.aggregateParserAcceptedCompliance);
  const preferUpstream = d.aggregateParserPreferUpstream !== false;
  const status = String(d.status || 'idle');
  const savedError = typeof d.error === 'string' ? d.error : '';
  const result = (d.aggregateParserResult || null) as AggregateParserResult | null;
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n').trim(), [upstream.texts]);
  const effectiveInput = preferUpstream && upstreamText ? upstreamText : inputText.trim();
  const isRunning = status === 'generating' || status === 'running';

  const upsertTextOutput = useCallback((text: string) => {
    const finalText = text.trim();
    if (!finalText) return;
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const downstreamOutputIds = new Set(
      edges
        .filter((edge) => edge.source === p.id)
        .map((edge) => nodes.find((node) => node.id === edge.target))
        .filter((node): node is Node => Boolean(node && node.type === 'output'))
        .map((node) => node.id),
    );
    if (downstreamOutputIds.size > 0) {
      rf.setNodes((nds) =>
        nds.map((node) => {
          if (!downstreamOutputIds.has(node.id)) return node;
          const nd = (node.data as any) || {};
          return {
            ...node,
            data: {
              ...nd,
              directOutputText: finalText,
              directTextSegments: [finalText],
              textSegments: [finalText],
            },
          };
        }),
      );
      return;
    }

    const me = rf.getNode(p.id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 620;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const pos = placeSingleNode(baseX, baseY, 'output', nodes, { source: `placement:aggregate-parser-output:${p.id}` });
    const ts = Date.now();
    const newId = `output-auto-aggregate-parser-${p.id}-${ts}-${Math.random().toString(36).slice(2, 6)}`;
    const newNode: Node = {
      id: newId,
      type: 'output',
      position: pos,
      data: {
        directOutputText: finalText,
        directTextSegments: [finalText],
        textSegments: [finalText],
      },
      selected: false,
    } as Node;
    const newEdge: Edge = {
      id: `e-auto-aggregate-parser-${newId}`,
      source: p.id,
      target: newId,
      type: 'deletable',
    } as Edge;
    rf.addNodes(newNode);
    rf.setEdges((eds) => [...eds, newEdge]);
  }, [p.id, rf]);

  const handleCheckRuntime = useCallback(async () => {
    setChecking(true);
    setMessage('');
    try {
      const data = await getAggregateParserStatus();
      setRuntimeStatus(data);
      setMessage(data.available ? 'ParseHub 运行时可用' : data.error || 'ParseHub 运行时不可用');
    } catch (err: any) {
      setRuntimeStatus({
        ok: false,
        available: false,
        error: err?.message || '运行时检查失败',
        platforms: [],
        supportedPlatforms: PLATFORM_HINTS,
      });
      setMessage(err?.message || '运行时检查失败');
    } finally {
      setChecking(false);
    }
  }, []);

  const handleRun = useCallback(async () => {
    if (!acceptedCompliance) {
      const msg = '请先勾选合规确认，再开始解析';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const input = effectiveInput.trim();
    if (!input) {
      const msg = '请粘贴短链、作品链接、分享码，或连接上游文本节点';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }

    update({ status: 'generating', error: '', aggregateParserLastRunAt: Date.now() });
    setMessage(mode === 'download' ? '正在解析并保存到本地输出目录...' : '正在解析媒体地址...');
    try {
      const data = await resolveAggregateMedia({
        input,
        mode,
        proxy: proxy.trim() || undefined,
        cookie: cookie.trim() || undefined,
        acceptedCompliance,
      });
      const imageUrls = mediaUrls(data.media || [], 'image');
      const videoUrls = mediaUrls(data.media || [], 'video');
      const audioUrls = mediaUrls(data.media || [], 'audio');
      const outputText = data.outputText || '';
      update({
        status: 'success',
        error: '',
        prompt: outputText,
        text: outputText,
        outputText,
        textSegments: outputText ? [outputText] : [],
        aggregateParserInput: input,
        aggregateParserResult: data,
        aggregateParserMedia: data.media || [],
        aggregateParserResolvedAt: Date.now(),
        imageUrl: imageUrls[0] || '',
        imageUrls,
        urls: imageUrls,
        videoUrl: videoUrls[0] || '',
        videoUrls,
        audioUrl: audioUrls[0] || '',
        audioUrls,
      });
      upsertTextOutput(outputText);
      setMessage(data.media?.length ? `解析完成：${data.media.length} 个媒体地址` : '解析完成：未发现可下载媒体，已输出文本结果');
    } catch (err: any) {
      const msg = err?.message || '解析失败';
      update({ status: 'error', error: msg });
      setMessage(msg);
      throw err;
    }
  }, [acceptedCompliance, cookie, effectiveInput, mode, proxy, update, upsertTextOutput]);

  useRunTrigger(p.id, handleRun);

  const allLinks = useMemo(() => (result?.media || []).map((item) => item.url).filter(Boolean), [result]);
  const runtimeAvailable = runtimeStatus?.available;

  return (
    <div
      className="t8-node relative transition-all"
      style={{
        width: 620,
        borderColor: p.selected ? COLOR : undefined,
        boxShadow: p.selected ? `0 0 0 2px ${COLOR}, var(--t8-shadow-strong, 0 18px 36px rgba(0,0,0,.22))` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: COLOR, border: 0 }} />
      <Handle type="source" position={Position.Right} style={{ background: COLOR, border: 0 }} />

      <div className="relative z-10">
        <div className="t8-node-header flex items-center gap-2 px-3 py-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--t8-accent) 18%, transparent)', color: 'var(--t8-accent)' }}
          >
            <Link2 size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[var(--t8-text-main)]">聚合解析</div>
            <div className="text-[10px] text-[var(--t8-text-muted)]">
              ParseHub · 短链 / 分享码 / 分享文案
            </div>
          </div>
          {status === 'success' && <CheckCircle2 size={16} className="text-emerald-300" />}
          {isRunning && <Loader2 size={16} className="animate-spin text-pink-300" />}
        </div>

        <div className="nodrag nowheel space-y-3 p-3" onMouseDown={(e) => e.stopPropagation()} onWheelCapture={(e) => e.stopPropagation()}>
          <div className="rounded-lg border border-amber-400/35 bg-amber-400/10 p-2 text-[11px] leading-relaxed text-[var(--t8-text-main)]">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-200">
              <ShieldAlert size={14} />
              合规使用确认
            </div>
            <div className="text-[var(--t8-text-muted)]">
              仅解析本人拥有版权、已获授权，或平台明确允许保存的公开内容；不得用于搬运、售卖、骚扰、绕过付费/DRM 或抓取私密内容。
            </div>
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] font-bold">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-pink-400"
                checked={acceptedCompliance}
                onChange={(e) => update({ aggregateParserAcceptedCompliance: e.target.checked })}
              />
              <span>我确认内容来源合法并承担使用责任</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold text-[var(--t8-text-main)]">短链 / 分享码</label>
              {upstreamText && (
                <label className="flex cursor-pointer items-center gap-1 text-[10px] text-[var(--t8-text-muted)]">
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-pink-400"
                    checked={preferUpstream}
                    onChange={(e) => update({ aggregateParserPreferUpstream: e.target.checked })}
                  />
                  优先使用上游文本
                </label>
              )}
            </div>
            <textarea
              className="t8-input nodrag nowheel h-24 w-full resize-none text-xs"
              value={inputText}
              placeholder="粘贴平台分享文案、短链或作品链接。例：复制抖音/小红书/B站/YouTube 分享文本后直接放这里。"
              onChange={(e) => update({ aggregateParserInput: e.target.value })}
            />
            {preferUpstream && upstreamText && (
              <div className="flex items-start gap-1 rounded-md border border-pink-300/20 bg-pink-300/10 px-2 py-1 text-[10px] text-[var(--t8-text-muted)]">
                <Info size={12} className="mt-0.5 shrink-0 text-pink-200" />
                <span>当前会使用上游文本：{shortText(upstreamText, 96)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px] font-bold text-[var(--t8-text-main)]">
              <span>解析模式</span>
              <select
                className="t8-select nodrag nowheel w-full text-xs"
                value={mode}
                onChange={(e) => update({ aggregateParserMode: asMode(e.target.value) })}
              >
                <option value="parse">只解析地址</option>
                <option value="download">保存到输出目录</option>
              </select>
            </label>
            <div className="space-y-1 text-[11px] font-bold text-[var(--t8-text-main)]">
              <span>运行时</span>
              <button
                type="button"
                className="t8-btn w-full min-h-9 text-xs"
                onClick={handleCheckRuntime}
                disabled={checking}
              >
                {checking ? <Loader2 size={14} className="animate-spin" /> : <SearchCheck size={14} />}
                {runtimeStatus ? (runtimeAvailable ? '可用' : '不可用') : '检查'}
              </button>
            </div>
          </div>

          <details className="rounded-lg border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] p-2">
            <summary className="cursor-pointer text-[11px] font-bold text-[var(--t8-text-main)]">可选：代理 / Cookie</summary>
            <div className="mt-2 space-y-2">
              <input
                className="t8-input nodrag nowheel w-full text-xs"
                value={proxy}
                placeholder="代理地址，例如 http://127.0.0.1:7890"
                onChange={(e) => update({ aggregateParserProxy: e.target.value })}
              />
              <textarea
                className="t8-input nodrag nowheel h-16 w-full resize-none text-xs"
                value={cookie}
                placeholder="Cookie 仅在确实需要登录态的平台使用；不会写入日志，请自行保护账号安全。"
                onChange={(e) => update({ aggregateParserCookie: e.target.value })}
              />
            </div>
          </details>

          <div className="flex flex-wrap gap-1">
            {PLATFORM_HINTS.map((name) => (
              <span key={name} className="rounded-md border border-pink-300/20 bg-pink-300/10 px-1.5 py-0.5 text-[10px] text-[var(--t8-text-muted)]">
                {name}
              </span>
            ))}
          </div>

          <button
            type="button"
            className="t8-btn t8-btn-primary w-full min-h-10 text-xs"
            onClick={() => { void handleRun().catch(() => undefined); }}
            disabled={isRunning}
          >
            {isRunning ? <Loader2 size={15} className="animate-spin" /> : mode === 'download' ? <Download size={15} /> : <Clipboard size={15} />}
            {mode === 'download' ? '解析并保存' : '解析无水印地址'}
          </button>

          {(message || savedError) && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[11px] leading-relaxed ${
                status === 'error'
                  ? 'border-red-400/35 bg-red-400/10 text-red-200'
                  : 'border-emerald-400/25 bg-emerald-400/10 text-[var(--t8-text-main)]'
              }`}
            >
              {status === 'error' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
              <span>{savedError || message}</span>
            </div>
          )}

          {runtimeStatus && (
            <div className="rounded-lg border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] p-2 text-[11px] text-[var(--t8-text-muted)]">
              {runtimeStatus.available ? (
                <span>ParseHub {runtimeStatus.parsehubVersion || 'unknown'} · Python {runtimeStatus.pythonVersion || 'unknown'} · 平台 {runtimeStatus.platforms?.length || '17+'}</span>
              ) : (
                <span>运行时不可用：{runtimeStatus.error || '未找到 parsehub 依赖'}</span>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-[var(--t8-text-main)]" title={result.title || result.contentPreview || '解析结果'}>
                    {result.title || result.contentPreview || '解析结果'}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--t8-text-muted)]">
                    {result.platformName || result.platform || '未知平台'} · {result.type || 'media'} · {result.mode === 'download' ? '已保存' : '远端地址'}
                  </div>
                </div>
                <button
                  type="button"
                  className="t8-btn min-h-8 px-2 text-[11px]"
                  onClick={() => copyText(result.outputText || '')}
                  title="复制解析摘要"
                >
                  <Copy size={13} />
                </button>
              </div>

              {result.contentPreview && (
                <div className="rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel)] px-2 py-1 text-[11px] leading-relaxed text-[var(--t8-text-muted)]">
                  {result.contentPreview}
                </div>
              )}

              {allLinks.length > 0 ? (
                <div className="space-y-1.5">
                  {result.media.map((item, index) => (
                    <div key={`${item.kind}-${item.url}-${index}`} className="flex items-center gap-2 rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel)] px-2 py-1.5">
                      <span className="shrink-0 rounded bg-pink-300/15 px-1.5 py-0.5 text-[10px] font-bold text-pink-200">
                        {KIND_LABEL[item.kind] || item.kind}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--t8-text-muted)]" title={item.url}>
                        {item.label ? `${item.label} · ` : ''}{item.url}
                      </span>
                      <button type="button" className="t8-btn min-h-7 px-2 text-[10px]" onClick={() => copyText(item.url)} title="复制地址">
                        <Copy size={12} />
                      </button>
                      {/^https?:/i.test(item.url) && (
                        <button type="button" className="t8-btn min-h-7 px-2 text-[10px]" onClick={() => openUrl(item.url)} title="打开地址">
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="t8-btn w-full min-h-8 text-[11px]" onClick={() => copyText(allLinks.join('\n'))}>
                    <Copy size={13} />
                    复制全部地址
                  </button>
                </div>
              ) : (
                <div className="rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel)] px-2 py-2 text-[11px] text-[var(--t8-text-muted)]">
                  没有解析到媒体文件。部分平台文章只返回正文，或需要 Cookie/代理才能访问。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(AggregateParserNode);
