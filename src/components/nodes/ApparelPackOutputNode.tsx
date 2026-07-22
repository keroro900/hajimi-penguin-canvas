import { memo, useEffect, useMemo } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { CheckCircle2, Clock3, Download, ExternalLink, Image as ImageIcon, PackageOpen } from 'lucide-react';
import SmartImage from '../SmartImage';
import { downloadMediaUrl } from '../../utils/downloadMedia';
import { mediaDownloadFileName } from '../../utils/mediaCollection';
import { useUpdateNodeData } from './useUpdateNodeData';

type OutputScene = {
  id: string;
  index: number;
  label: string;
  role: string;
  sourceNodeId: string;
  description: string;
  promptSummary?: string;
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = String(value || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function collectImageUrls(data: any): string[] {
  const out: string[] = [];
  const push = (value: any) => {
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  };
  const pushMany = (value: any) => {
    if (!Array.isArray(value)) return;
    value.forEach(push);
  };
  push(data?.imageUrl);
  push(data?.directImageUrl);
  push(data?.resultUrl);
  pushMany(data?.imageUrls);
  pushMany(data?.directImageUrls);
  pushMany(data?.resultUrls);
  pushMany(data?.generatedImages);
  pushMany(data?.urls);
  return unique(out);
}

function statusLabel(data: any, hasImage: boolean): { label: string; tone: 'done' | 'running' | 'error' | 'idle' } {
  const status = String(data?.status || data?.taskStatus || '').toLowerCase();
  if (hasImage) return { label: '完成', tone: 'done' };
  if (status === 'error' || status === 'failed') return { label: '异常', tone: 'error' };
  if (status === 'running' || status === 'generating' || status === 'queued') return { label: '生成中', tone: 'running' };
  return { label: '待生成', tone: 'idle' };
}

function openUrl(url?: string) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function ApparelPackOutputNode({ id, data, selected }: NodeProps) {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const manifest = d.apparelPackOutput || {};
  const scenes: OutputScene[] = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const imageNodeIds: string[] = Array.isArray(manifest.imageNodeIds) ? manifest.imageNodeIds : scenes.map((item) => item.sourceNodeId);
  const qaNodeId = String(manifest.qaNodeId || '');

  const connections = useNodeConnections({ id, handleType: 'target' });
  const upstreamIds = useMemo(
    () => Array.from(new Set([...connections.map((item) => item.source), ...imageNodeIds, qaNodeId].filter(Boolean))),
    [connections, imageNodeIds, qaNodeId],
  );
  const upstreamNodes = useNodesData(upstreamIds);

  const upstreamById = useMemo(() => {
    const map = new Map<string, any>();
    const list = Array.isArray(upstreamNodes) ? upstreamNodes : [];
    for (const node of list) map.set(String((node as any)?.id || ''), node);
    return map;
  }, [upstreamNodes]);

  const sceneRows = useMemo(() => scenes.map((scene) => {
    const node = upstreamById.get(scene.sourceNodeId);
    const nodeData = (node as any)?.data || {};
    const urls = collectImageUrls(nodeData);
    const url = urls[0] || '';
    return {
      ...scene,
      url,
      status: statusLabel(nodeData, Boolean(url)),
    };
  }), [scenes, upstreamById]);

  const imageUrls = useMemo(() => unique(sceneRows.map((item) => item.url).filter(Boolean)), [sceneRows]);
  const doneCount = sceneRows.filter((item) => item.url).length;
  const firstUrl = imageUrls[0] || '';
  const qaText = useMemo(() => {
    const qa = qaNodeId ? upstreamById.get(qaNodeId) : null;
    const qaData = (qa as any)?.data || {};
    return String(qaData.reply || qaData.outputText || qaData.text || '').trim();
  }, [qaNodeId, upstreamById]);
  const syncSig = imageUrls.join('|');
  const currentSyncSig = String(d.apparelPackOutputSyncedSig || '');

  useEffect(() => {
    if (syncSig === currentSyncSig) return;
    update({
      status: imageUrls.length > 0 && imageUrls.length >= sceneRows.length ? 'success' : 'idle',
      imageUrl: imageUrls[0] || '',
      imageUrls,
      materialSetKind: 'image',
      materialSetItems: imageUrls.map((url, index) => ({
        id: `${id}-image-${index + 1}`,
        kind: 'image',
        url,
        name: mediaDownloadFileName('image', url, index),
      })),
      apparelPackOutputSyncedSig: syncSig,
    });
  }, [currentSyncSig, id, imageUrls, sceneRows.length, syncSig, update]);

  const downloadAll = () => {
    imageUrls.forEach((url, index) => {
      void downloadMediaUrl('image', url, index);
    });
  };

  return (
    <div
      className={`t8-node t8-smart-node-card overflow-hidden transition-all ${selected ? 'is-selected t8-smart-node-card--selected' : ''}`}
      style={{ width: 420 }}
    >
      <Handle type="target" position={Position.Left} className="t8-smart-node-port !border-0" />
      <Handle type="source" position={Position.Right} className="t8-smart-node-port !border-0" />

      <div className="t8-smart-node-card__header">
        <div className="t8-smart-node-icon">
          <PackageOpen size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="t8-smart-node-title">服装封包输出</div>
          <div className="t8-smart-node-subtitle">{manifest.title || '模特图 / 平铺图 / 细节图'}</div>
        </div>
        <div className="t8-smart-node-status rounded border">
          {doneCount}/{sceneRows.length || imageNodeIds.length}张
        </div>
      </div>

      <div className="t8-smart-node-body">
        <div className="nodrag nowheel space-y-3 p-3" onMouseDown={(event) => event.stopPropagation()}>
          <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            <button
              type="button"
              className="block aspect-[16/9] w-full overflow-hidden"
              disabled={!firstUrl}
              onClick={() => openUrl(firstUrl)}
              title={firstUrl ? '预览首张输出图' : '等待上游生成图像'}
            >
              {firstUrl ? (
                <SmartImage src={firstUrl} alt="服装封包输出预览" className="h-full w-full object-cover" thumbSize={420} draggable={false} />
              ) : (
                <div className="flex h-full w-full items-center justify-center gap-2 text-xs" style={{ color: 'var(--t8-text-dim)' }}>
                  <ImageIcon size={16} />
                  等待生成结果
                </div>
              )}
            </button>
            <div className="flex flex-wrap items-center gap-1.5 border-t px-2 py-2" style={{ borderColor: 'var(--t8-border)' }}>
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: 'var(--t8-bg-panel)', color: 'var(--t8-text-muted)' }}>压缩包</span>
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: 'var(--t8-bg-panel)', color: 'var(--t8-text-muted)' }}>{sceneRows.length || imageNodeIds.length}张</span>
              {qaText && <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: 'var(--t8-bg-panel)', color: 'var(--t8-text-muted)' }}>含质检</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 p-2">
              <button type="button" className="t8-btn justify-center px-3 py-2 text-xs" disabled={!firstUrl} onClick={() => openUrl(firstUrl)}>
                <ExternalLink size={13} />
                预览
              </button>
              <button type="button" className="t8-btn t8-btn-primary justify-center px-3 py-2 text-xs" disabled={imageUrls.length === 0} onClick={downloadAll}>
                <Download size={13} />
                下载包
              </button>
            </div>
          </div>

          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {sceneRows.map((scene, index) => (
              <div key={scene.id || scene.sourceNodeId} className="grid grid-cols-[72px,1fr] gap-2 rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}>
                <button
                  type="button"
                  className="aspect-square overflow-hidden rounded border"
                  style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}
                  disabled={!scene.url}
                  onClick={() => openUrl(scene.url)}
                  data-drag-source={scene.url ? true : undefined}
                  data-drag-kind="image"
                  data-drag-url={scene.url || undefined}
                  data-drag-preview={scene.url || undefined}
                  data-drag-node-id={scene.sourceNodeId}
                >
                  {scene.url ? (
                    <SmartImage src={scene.url} alt={scene.label} className="h-full w-full object-cover" thumbSize={160} draggable={false} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ color: 'var(--t8-text-dim)' }}>
                      <Clock3 size={15} />
                    </div>
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>
                      {String(index + 1).padStart(2, '0')} {scene.label}
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: scene.status.tone === 'done'
                          ? 'color-mix(in srgb, #22c55e 18%, transparent)'
                          : scene.status.tone === 'error'
                            ? 'color-mix(in srgb, #ef4444 16%, transparent)'
                            : 'var(--t8-bg-panel-muted)',
                        color: scene.status.tone === 'done'
                          ? '#16a34a'
                          : scene.status.tone === 'error'
                            ? 'var(--t8-danger, #ef4444)'
                            : 'var(--t8-text-dim)',
                      }}
                    >
                      {scene.status.tone === 'done' && <CheckCircle2 size={10} className="mr-1 inline" />}
                      {scene.status.label}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-3 text-[11px] leading-snug" style={{ color: 'var(--t8-text-dim)' }}>
                    {scene.description}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button type="button" className="t8-btn justify-center px-2 py-1 text-[10px]" disabled={!scene.url} onClick={() => openUrl(scene.url)}>
                      <ExternalLink size={11} />
                      预览
                    </button>
                    <a
                      className={`t8-btn justify-center px-2 py-1 text-[10px] ${scene.url ? '' : 'pointer-events-none opacity-50'}`}
                      href={scene.url || undefined}
                      download={scene.url ? mediaDownloadFileName('image', scene.url, index) : undefined}
                    >
                      <Download size={11} />
                      打开
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {qaText && (
            <details className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
              <summary className="cursor-pointer text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>质检摘要</summary>
              <div className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug" style={{ color: 'var(--t8-text-dim)' }}>
                {qaText}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ApparelPackOutputNode);
