import { useEffect, useRef, useState, type VideoHTMLAttributes } from 'react';
import { mergeLoopingVideoProps } from '../utils/videoPlayback';

type LoopingVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  src?: string;
};

export default function LoopingVideo({ src, preload, ...props }: LoopingVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const eager = preload === 'auto';
  const [shouldLoad, setShouldLoad] = useState(() => eager || !src);

  useEffect(() => {
    setShouldLoad(eager || !src);
  }, [eager, src]);

  useEffect(() => {
    if (shouldLoad || !src) return;
    const el = videoRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '720px 720px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad, src]);

  useEffect(() => {
    const el = videoRef.current;
    const shell = el?.closest('.t8-canvas-shell');
    if (!el || !shell || typeof MutationObserver === 'undefined') return;
    const syncBusyPlayback = () => {
      if (shell.matches('.t8-viewport-moving, .t8-node-dragging')) {
        el.pause();
      }
    };
    syncBusyPlayback();
    const observer = new MutationObserver(syncBusyPlayback);
    observer.observe(shell, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [src]);

  const videoProps = preload === undefined ? props : { ...props, preload };
  const merged = mergeLoopingVideoProps(videoProps as Record<string, unknown>) as LoopingVideoProps;
  return (
    <video
      {...merged}
      ref={videoRef}
      src={shouldLoad ? src : undefined}
      data-full-src={src}
      data-video-load-state={shouldLoad ? 'loaded' : 'deferred'}
    />
  );
}
