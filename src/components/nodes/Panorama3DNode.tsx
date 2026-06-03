import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Box,
  Download,
  Globe2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { uploadDataUrl } from '../../services/imageOps';
import {
  PANORAMA_RATIO_OPTIONS,
  clampPanoramaNumber,
  isLikelyPanoramaImage,
  panoramaRenderSize,
  resolvePanoramaRatio,
  type PanoramaRatioId,
} from '../../utils/panorama3d';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { useHasAutoOutput } from './useHasAutoOutput';

const COLOR = '#38bdf8';

type ThreeModule = typeof import('three');

interface PanoramaRuntime {
  three?: ThreeModule;
  loadPromise?: Promise<ThreeModule>;
  renderer?: any;
  scene?: any;
  camera?: any;
  sphere?: any;
  texture?: any;
  image?: HTMLImageElement;
  animationId?: number;
  loadToken: number;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  yaw: number;
  pitch: number;
}

function clampFov(value: unknown) {
  return clampPanoramaNumber(value, 35, 100, 75);
}

function clampPitch(value: unknown) {
  return clampPanoramaNumber(value, -85, 85, 0);
}

function cleanFileBase(value: string) {
  return (value.split('/').pop() || 'panorama').split('?')[0].replace(/\.[a-z0-9]{2,8}$/i, '') || 'panorama';
}

const Panorama3DNode = (p: NodeProps) => {
  const update = useUpdateNodeData(p.id);
  const upstream = useUpstreamMaterials(p.id);
  const hasAutoOutput = useHasAutoOutput(p.id);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PanoramaRuntime>({ loadToken: 0 });
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef({ yaw: 0, pitch: 0, fov: 75 });
  const d = (p.data as any) || {};

  const source = upstream.images[0];
  const sourceUrl = source?.url || d.panoramaSourceUrl || '';
  const outputUrl = typeof d.imageUrl === 'string' ? d.imageUrl : '';
  const ratioId: PanoramaRatioId = (d.panoramaRatio || 'wide') as PanoramaRatioId;
  const customW = clampPanoramaNumber(d.panoramaCustomW, 1, 999, 16);
  const customH = clampPanoramaNumber(d.panoramaCustomH, 1, 999, 9);
  const yaw = clampPanoramaNumber(d.panoramaYaw, -99999, 99999, 0);
  const pitch = clampPitch(d.panoramaPitch);
  const fov = clampFov(d.panoramaFov);
  const autoRotate = Boolean(d.panoramaAutoRotate);
  const ratio = useMemo(() => resolvePanoramaRatio(ratioId, customW, customH), [customH, customW, ratioId]);
  const renderSize = useMemo(() => panoramaRenderSize(ratio), [ratio]);
  const isLikely = useMemo(
    () => isLikelyPanoramaImage({ url: sourceUrl, label: source?.label, title: d.title, prompt: d.prompt }),
    [d.prompt, d.title, source?.label, sourceUrl],
  );

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const rt = runtimeRef.current;
    const THREE = rt.three;
    if (!canvas || !rt.renderer || !rt.scene || !rt.camera || !rt.sphere || !THREE || !rt.image?.naturalWidth) {
      return false;
    }
    const view = viewRef.current;
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    rt.renderer.setSize(width, height, false);
    rt.camera.fov = view.fov;
    rt.camera.aspect = width / Math.max(1, height);
    rt.camera.updateProjectionMatrix();
    const phi = THREE.MathUtils.degToRad(90 - view.pitch);
    const theta = THREE.MathUtils.degToRad(view.yaw);
    const target = new THREE.Vector3(
      500 * Math.sin(phi) * Math.cos(theta),
      500 * Math.cos(phi),
      500 * Math.sin(phi) * Math.sin(theta),
    );
    rt.camera.position.set(0, 0, 0);
    rt.camera.lookAt(target);
    rt.renderer.render(rt.scene, rt.camera);
    return true;
  }, []);

  const ensureRenderer = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rt = runtimeRef.current;
    if (!rt.three) {
      rt.loadPromise = rt.loadPromise || import('three');
      rt.three = await rt.loadPromise;
    }
    const THREE = rt.three;
    if (!rt.renderer) {
      rt.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
      rt.renderer.setPixelRatio(1);
      rt.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    if (!rt.scene) {
      rt.scene = new THREE.Scene();
      rt.camera = new THREE.PerspectiveCamera(viewRef.current.fov, 16 / 9, 1, 1200);
      const geometry = new THREE.SphereGeometry(500, 96, 64);
      geometry.scale(-1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      rt.sphere = new THREE.Mesh(geometry, material);
      rt.scene.add(rt.sphere);
    }
    return true;
  }, []);

  useEffect(() => {
    viewRef.current = { yaw, pitch, fov };
    drawFrame();
  }, [drawFrame, fov, pitch, yaw]);

  const disposeTexture = useCallback(() => {
    const rt = runtimeRef.current;
    rt.texture?.dispose?.();
    rt.texture = undefined;
    if (rt.sphere?.material) {
      rt.sphere.material.map = null;
      rt.sphere.material.needsUpdate = true;
    }
    rt.image = undefined;
  }, []);

  const applyTexture = useCallback((img: HTMLImageElement) => {
    const rt = runtimeRef.current;
    const THREE = rt.three;
    if (!THREE || !rt.sphere || !img.naturalWidth || !img.naturalHeight) return false;
    disposeTexture();
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    rt.texture = texture;
    rt.image = img;
    rt.sphere.material.map = texture;
    rt.sphere.material.needsUpdate = true;
    return true;
  }, [disposeTexture]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = renderSize.width;
    canvas.height = renderSize.height;
    drawFrame();
  }, [drawFrame, renderSize.height, renderSize.width]);

  useEffect(() => {
    if (!sourceUrl) {
      runtimeRef.current.loadToken += 1;
      disposeTexture();
      setStatus('idle');
      setError('');
      return;
    }
    const token = ++runtimeRef.current.loadToken;
    setStatus('loading');
    setError('');
    let cancelled = false;

    (async () => {
      try {
        const ready = await ensureRenderer();
        if (!ready || cancelled || token !== runtimeRef.current.loadToken) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (cancelled || token !== runtimeRef.current.loadToken) return;
          if (!applyTexture(img)) {
            setStatus('error');
            setError('全景贴图加载失败');
            return;
          }
          setStatus('ready');
          drawFrame();
        };
        img.onerror = () => {
          if (cancelled || token !== runtimeRef.current.loadToken) return;
          setStatus('error');
          setError('图片无法作为 3D 全景加载');
        };
        img.src = sourceUrl;
        if (img.complete && img.naturalWidth) img.onload?.(new Event('load'));
      } catch (e: any) {
        if (cancelled || token !== runtimeRef.current.loadToken) return;
        setStatus('error');
        setError(e?.message || 'Three.js 初始化失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyTexture, disposeTexture, drawFrame, ensureRenderer, sourceUrl]);

  useEffect(() => {
    const rt = runtimeRef.current;
    if (rt.animationId) cancelAnimationFrame(rt.animationId);
    rt.animationId = undefined;
    if (!autoRotate || status !== 'ready') {
      return;
    }
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (!dragRef.current) {
        viewRef.current = {
          ...viewRef.current,
          yaw: viewRef.current.yaw + 0.12,
        };
      }
      drawFrame();
      rt.animationId = requestAnimationFrame(tick);
    };
    rt.animationId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (rt.animationId) cancelAnimationFrame(rt.animationId);
      rt.animationId = undefined;
    };
  }, [autoRotate, drawFrame, status]);

  useEffect(() => () => {
    const rt = runtimeRef.current;
    if (rt.animationId) cancelAnimationFrame(rt.animationId);
    disposeTexture();
    rt.sphere?.geometry?.dispose?.();
    rt.sphere?.material?.dispose?.();
    rt.renderer?.dispose?.();
    runtimeRef.current = { loadToken: rt.loadToken + 1 };
  }, [disposeTexture]);

  const setView = (patch: Record<string, any>) => update(patch);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (status !== 'ready') return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
    };
    setIsDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    update({
      panoramaYaw: drag.yaw - dx * 0.18,
      panoramaPitch: clampPitch(drag.pitch + dy * 0.18),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (status !== 'ready') return;
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 0.92 : 1 / 0.92;
    update({ panoramaFov: clampFov(fov * factor) });
  };

  const resetView = () => update({ panoramaYaw: 0, panoramaPitch: 0, panoramaFov: 75 });

  const exportFrame = useCallback(async () => {
    if (status !== 'ready' || !canvasRef.current) {
      update({ panoramaError: '请先连接并加载全景图' });
      return;
    }
    update({ status: 'running', panoramaError: '' });
    try {
      if (!drawFrame()) throw new Error('当前画面不可导出');
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const imageUrl = await uploadDataUrl(dataUrl, `${cleanFileBase(sourceUrl)}-panorama-frame`);
      const view = viewRef.current;
      update({
        status: 'success',
        panoramaError: '',
        imageUrl,
        imageUrls: [imageUrl],
        urls: [imageUrl],
        panoramaSourceUrl: sourceUrl,
        panoramaYaw: view.yaw,
        panoramaPitch: view.pitch,
        panoramaFov: view.fov,
        panoramaSnapshot: {
          yaw: view.yaw,
          pitch: view.pitch,
          fov: view.fov,
          ratio: ratioId,
          customW,
          customH,
          width: canvasRef.current.width,
          height: canvasRef.current.height,
        },
      });
    } catch (e: any) {
      const msg = e?.message || '导出全景画面失败';
      update({ status: 'error', panoramaError: msg });
      setError(msg);
    }
  }, [customH, customW, drawFrame, fov, pitch, ratioId, sourceUrl, status, update, yaw]);

  useRunTrigger(p.id, exportFrame, 'image');

  const nodeStyle = {
    width: 760,
    borderColor: p.selected ? COLOR : undefined,
    boxShadow: p.selected ? `0 0 0 2px ${COLOR}, var(--t8-shadow-strong, 0 18px 36px rgba(0,0,0,.22))` : undefined,
  };

  const savedError = typeof d.panoramaError === 'string' ? d.panoramaError : '';
  const hasSource = Boolean(sourceUrl);

  return (
    <div className="t8-node relative transition-all" style={nodeStyle}>
      <Handle type="target" position={Position.Left} style={{ background: COLOR, border: 0 }} />
      <Handle type="source" position={Position.Right} style={{ background: COLOR, border: 0 }} />

      <div className="relative z-10">
        <div className="t8-node-header flex items-center gap-2 px-3 py-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--t8-accent) 18%, transparent)', color: 'var(--t8-accent)' }}
          >
            <Globe2 size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[var(--t8-text-main)]">3D全景</div>
            <div className="text-[10px] text-[var(--t8-text-muted)]">
              {hasSource ? `${PANORAMA_RATIO_OPTIONS.find((x) => x.id === ratioId)?.label || '16:9'} · FOV ${Math.round(fov)}°` : '连接 2:1 全景图'}
            </div>
          </div>
          {isLikely && (
            <span className="rounded-md border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">
              360
            </span>
          )}
        </div>

        <div className="p-3 space-y-3 nodrag" onMouseDown={(e) => e.stopPropagation()}>
          <div
            className={`relative overflow-hidden rounded-lg border border-[var(--t8-border)] bg-slate-950 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ aspectRatio: `${ratio.w} / ${ratio.h}`, minHeight: 260 }}
            onWheel={onWheel}
          >
            <canvas
              ref={canvasRef}
              className="block h-full w-full"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerLeave={endDrag}
            />
            {!hasSource && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 text-center text-xs text-slate-300">
                <Box size={24} className="text-sky-300" />
                <span>把全景图连接到左侧输入</span>
              </div>
            )}
            {status === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/70 text-xs font-bold text-slate-100">
                <Loader2 size={15} className="animate-spin" />
                加载中
              </div>
            )}
            {(status === 'error' || savedError) && (
              <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg border border-red-400/25 bg-red-950/80 px-2 py-1.5 text-xs text-red-100">
                <AlertCircle size={14} />
                <span className="min-w-0 truncate">{error || savedError}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-10 gap-1.5">
            {PANORAMA_RATIO_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => setView({ panoramaRatio: item.id })}
                className={`t8-btn px-1.5 py-1.5 text-[10px] ${ratioId === item.id ? 't8-btn-primary' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {ratioId === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold text-[var(--t8-text-muted)]">比例宽</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={customW}
                  onChange={(e) => update({ panoramaCustomW: clampPanoramaNumber(e.target.value, 1, 999, 16) })}
                  className="w-full rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] px-2 py-1 text-xs text-[var(--t8-text-main)] outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold text-[var(--t8-text-muted)]">比例高</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={customH}
                  onChange={(e) => update({ panoramaCustomH: clampPanoramaNumber(e.target.value, 1, 999, 9) })}
                  className="w-full rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] px-2 py-1 text-xs text-[var(--t8-text-main)] outline-none"
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-5 gap-2">
            <button type="button" className="t8-btn py-2 text-xs" onClick={() => update({ panoramaFov: clampFov(fov * 0.92) })} title="放大">
              <ZoomIn size={14} />
            </button>
            <button type="button" className="t8-btn py-2 text-xs" onClick={() => update({ panoramaFov: clampFov(fov / 0.92) })} title="缩小">
              <ZoomOut size={14} />
            </button>
            <button type="button" className="t8-btn py-2 text-xs" onClick={resetView} title="重置视角">
              <RotateCcw size={14} />
            </button>
            <button type="button" className={`t8-btn py-2 text-xs ${autoRotate ? 't8-btn-primary' : ''}`} onClick={() => update({ panoramaAutoRotate: !autoRotate })} title="自动旋转">
              {autoRotate ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button type="button" className="t8-btn t8-btn-primary py-2 text-xs" onClick={exportFrame} disabled={status !== 'ready'} title="导出当前画面">
              {d.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10px] text-[var(--t8-text-muted)]">
            <div className="rounded-md bg-[var(--t8-bg-panel-muted)] px-2 py-1">Yaw {Math.round(yaw)}°</div>
            <div className="rounded-md bg-[var(--t8-bg-panel-muted)] px-2 py-1">Pitch {Math.round(pitch)}°</div>
            <div className="rounded-md bg-[var(--t8-bg-panel-muted)] px-2 py-1">{renderSize.width}×{renderSize.height}</div>
          </div>

          {outputUrl && !hasAutoOutput && (
            <div className="rounded-lg border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] p-2">
              <img src={outputUrl} alt="导出画面" className="max-h-28 w-full rounded object-contain" draggable={false} loading="lazy" decoding="async" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(Panorama3DNode);
