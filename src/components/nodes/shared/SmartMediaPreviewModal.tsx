import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Download, RotateCcw, Save, X, ZoomIn, ZoomOut } from 'lucide-react';
import MediaMetadataBadge from '../../MediaMetadataBadge';
import { mediaDownloadFileName } from '../../../utils/mediaCollection';
import { downloadMediaUrl } from '../../../utils/downloadMedia';

export interface SmartMediaPreviewInfoRow {
  label: string;
  value: string;
}

interface SmartMediaPreviewModalProps {
  open: boolean;
  url: string | null | undefined;
  title?: string;
  kind?: 'image' | 'video';
  meta?: string;
  infoRows?: SmartMediaPreviewInfoRow[];
  onClose: () => void;
  onSaveResource?: () => void | Promise<void>;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

function fileNameFromUrl(url: string) {
  try {
    const clean = url.split('?')[0].split('#')[0];
    return decodeURIComponent(clean.split('/').filter(Boolean).pop() || '');
  } catch {
    return url.split('/').filter(Boolean).pop() || '';
  }
}

export default function SmartMediaPreviewModal({
  open,
  url,
  title,
  kind = 'image',
  meta,
  infoRows = [],
  onClose,
  onSaveResource,
}: SmartMediaPreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const wheelZoomRef = useRef<{
    nextZoom: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const wheelRafRef = useRef<number | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const safeUrl = String(url || '');
  const previewTitle = title || fileNameFromUrl(safeUrl) || (kind === 'video' ? '视频预览' : '图片预览');
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;
  const fitSize = useMemo(() => {
    if (!naturalSize || !viewportSize) return null;
    const availableWidth = Math.max(120, viewportSize.width - 36);
    const availableHeight = Math.max(120, viewportSize.height - 36);
    const ratio = Math.min(availableWidth / naturalSize.width, availableHeight / naturalSize.height, 1);
    return {
      width: Math.max(1, Math.round(naturalSize.width * ratio)),
      height: Math.max(1, Math.round(naturalSize.height * ratio)),
    };
  }, [naturalSize, viewportSize]);
  const displaySize = fitSize
    ? {
        width: Math.round(fitSize.width * zoom),
        height: Math.round(fitSize.height * zoom),
      }
    : null;
  const canvasStyle: CSSProperties = displaySize && viewportSize
    ? {
        width: Math.max(viewportSize.width, displaySize.width + 36),
        height: Math.max(viewportSize.height, displaySize.height + 36),
      }
    : {};
  const imageStyle: CSSProperties = displaySize
    ? {
        width: displaySize.width,
        height: displaySize.height,
        maxWidth: 'none',
        maxHeight: 'none',
      }
    : {
        maxWidth: '100%',
        maxHeight: '100%',
      };
  const stageStyle: CSSProperties = displaySize
    ? {
        width: displaySize.width,
        height: displaySize.height,
      }
    : {};
  const displayedMeta = useMemo(() => {
    if (meta) return meta;
    if (naturalSize) return `${naturalSize.width}×${naturalSize.height}`;
    return '滚轮缩放，拖动滚动条查看细节';
  }, [meta, naturalSize]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const zoomAtClientPoint = (nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current;
    const currentZoom = zoomRef.current;
    if (!viewport || nextZoom === currentZoom) return;
    if (!fitSize || !viewportSize || !displaySize) {
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const offsetX = typeof clientX === 'number' ? clientX - rect.left : viewport.clientWidth / 2;
    const offsetY = typeof clientY === 'number' ? clientY - rect.top : viewport.clientHeight / 2;
    const currentCanvasWidth = Math.max(viewportSize.width, displaySize.width + 36);
    const currentCanvasHeight = Math.max(viewportSize.height, displaySize.height + 36);
    const currentImageOffsetX = (currentCanvasWidth - displaySize.width) / 2;
    const currentImageOffsetY = (currentCanvasHeight - displaySize.height) / 2;
    const imagePointX = (viewport.scrollLeft + offsetX - currentImageOffsetX) / currentZoom;
    const imagePointY = (viewport.scrollTop + offsetY - currentImageOffsetY) / currentZoom;
    const nextDisplayWidth = Math.round(fitSize.width * nextZoom);
    const nextDisplayHeight = Math.round(fitSize.height * nextZoom);
    const nextCanvasWidth = Math.max(viewportSize.width, nextDisplayWidth + 36);
    const nextCanvasHeight = Math.max(viewportSize.height, nextDisplayHeight + 36);
    const nextImageOffsetX = (nextCanvasWidth - nextDisplayWidth) / 2;
    const nextImageOffsetY = (nextCanvasHeight - nextDisplayHeight) / 2;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = imagePointX * nextZoom + nextImageOffsetX - offsetX;
      viewport.scrollTop = imagePointY * nextZoom + nextImageOffsetY - offsetY;
    });
  };

  const resetZoom = () => {
    const viewport = viewportRef.current;
    zoomRef.current = 1;
    wheelZoomRef.current = null;
    if (wheelRafRef.current !== null) {
      window.cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
    }
    setZoom(1);
    window.requestAnimationFrame(() => {
      if (!viewport) return;
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  };

  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setNaturalSize(null);
    setViewportSize(null);
    setIsPanning(false);
    panRef.current = null;
    wheelZoomRef.current = null;
    if (wheelRafRef.current !== null) {
      window.cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
    }
  }, [open, safeUrl]);

  useEffect(() => () => {
    if (wheelRafRef.current !== null) {
      window.cancelAnimationFrame(wheelRafRef.current);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const readSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };
    readSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', readSize);
      return () => window.removeEventListener('resize', readSize);
    }
    const observer = new ResizeObserver(readSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomAtClientPoint(clampZoom(zoom + ZOOM_STEP));
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        zoomAtClientPoint(clampZoom(zoom - ZOOM_STEP));
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, zoom]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (kind !== 'image') {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const multiplier = Math.exp(-event.deltaY * 0.002);
    wheelZoomRef.current = {
      nextZoom: clampZoom((wheelZoomRef.current?.nextZoom ?? zoomRef.current) * multiplier),
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (wheelRafRef.current !== null) return;
    wheelRafRef.current = window.requestAnimationFrame(() => {
      wheelRafRef.current = null;
      const pending = wheelZoomRef.current;
      wheelZoomRef.current = null;
      if (!pending) return;
      zoomAtClientPoint(pending.nextZoom, pending.clientX, pending.clientY);
    });
  };

  const handlePanPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.stopPropagation();
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    viewport.scrollLeft = pan.startScrollLeft - dx;
    viewport.scrollTop = pan.startScrollTop - dy;
  };

  const handlePanPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    panRef.current = null;
    setIsPanning(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* capture may already be released */
    }
  };

  if (!open || !safeUrl || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="nodrag nopan t8-smart-media-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={previewTitle}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="t8-smart-media-preview"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="t8-smart-media-preview__bar">
          <div className="t8-smart-media-preview__heading">
            <div className="t8-smart-media-preview__title" title={previewTitle}>{previewTitle}</div>
            <div className="t8-smart-media-preview__meta">{displayedMeta}</div>
          </div>
          <div className="t8-smart-media-preview__tools">
            {kind === 'image' && <button
              type="button"
              className="t8-btn t8-smart-media-preview__tool"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                zoomAtClientPoint(clampZoom(zoom - ZOOM_STEP));
              }}
              disabled={!canZoomOut}
              title="缩小"
              aria-label="缩小"
            >
              <ZoomOut size={15} />
            </button>}
            {kind === 'image' && <span className="t8-smart-media-preview__zoom">{Math.round(zoom * 100)}%</span>}
            {kind === 'image' && <button
              type="button"
              className="t8-btn t8-smart-media-preview__tool"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                zoomAtClientPoint(clampZoom(zoom + ZOOM_STEP));
              }}
              disabled={!canZoomIn}
              title="放大"
              aria-label="放大"
            >
              <ZoomIn size={15} />
            </button>}
            {kind === 'image' && <button
              type="button"
              className="t8-btn t8-smart-media-preview__tool"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetZoom();
              }}
              title="适应窗口"
              aria-label="适应窗口"
            >
              <RotateCcw size={15} />
            </button>}
            {onSaveResource && (
              <button
                type="button"
                className="t8-btn t8-smart-media-preview__tool"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void onSaveResource();
                }}
                title="保存到素材库"
                aria-label="保存到素材库"
              >
                <Save size={15} />
              </button>
            )}
            {kind === 'image' ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={mediaDownloadFileName('image', safeUrl, 0)}
                className="t8-btn t8-smart-media-preview__tool"
                title="下载"
                aria-label="下载"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void downloadMediaUrl('image', safeUrl, 0);
                }}
              >
                <Download size={15} />
              </a>
            ) : (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={mediaDownloadFileName('video', safeUrl, 0)}
                className="t8-btn t8-smart-media-preview__tool"
                title="下载"
                aria-label="下载"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void downloadMediaUrl('video', safeUrl, 0);
                }}
              >
                <Download size={15} />
              </a>
            )}
            <button
              type="button"
              className="t8-btn t8-smart-media-preview__tool"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              title="关闭预览"
              aria-label="关闭预览"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <div
          ref={viewportRef}
          className="t8-smart-media-preview__viewport"
          data-panning={isPanning ? 'true' : 'false'}
          onWheel={handleWheel}
          onPointerDown={kind === 'image' ? handlePanPointerDown : undefined}
          onPointerMove={kind === 'image' ? handlePanPointerMove : undefined}
          onPointerUp={kind === 'image' ? handlePanPointerEnd : undefined}
          onPointerCancel={kind === 'image' ? handlePanPointerEnd : undefined}
        >
          {kind === 'image' && (
            <div className="t8-smart-media-preview__canvas" style={canvasStyle}>
              <div className="t8-smart-media-preview__stage" style={stageStyle}>
                <img
                  src={safeUrl}
                  alt={previewTitle}
                  className="t8-smart-media-preview__image"
                  draggable={false}
                  loading="eager"
                  decoding="async"
                  style={imageStyle}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                    }
                  }}
                  onDragStart={(e) => e.preventDefault()}
                />
              </div>
            </div>
          )}
          {kind === 'video' && (
            <div className="t8-smart-media-preview__video-stage">
              <video
                src={safeUrl}
                className="t8-smart-media-preview__video"
                controls
                autoPlay
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const videoWidth = event.currentTarget.videoWidth;
                  const videoHeight = event.currentTarget.videoHeight;
                  if (videoWidth > 0 && videoHeight > 0) {
                    setNaturalSize({ width: videoWidth, height: videoHeight });
                  }
                }}
              />
            </div>
          )}
        </div>
        <div className="t8-smart-media-preview__info">
          <span title={safeUrl}>{safeUrl}</span>
          <MediaMetadataBadge kind={kind} url={safeUrl} />
          {infoRows.slice(0, 5).map((row) => (
            <span key={row.label} title={row.value}>
              {row.label}: {row.value}
            </span>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
