import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react';
import { previewImageUrl } from '../utils/mediaPreview';

type SmartImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  thumbSize?: number;
};

export default function SmartImage({
  src,
  thumbSize = 360,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}: SmartImageProps) {
  const previewSrc = useMemo(() => previewImageUrl(src, thumbSize), [src, thumbSize]);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setFallback(false);
  }, [previewSrc]);

  const actualSrc = fallback ? src : previewSrc;

  return (
    <img
      {...props}
      src={actualSrc}
      data-full-src={src}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        if (!fallback && actualSrc !== src) {
          setFallback(true);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
