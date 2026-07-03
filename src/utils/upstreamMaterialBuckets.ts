export interface UpstreamMaterialBucketItem {
  id: string;
  kind: string;
  url: string;
  sourceNodeId: string;
}

export interface UpstreamMaterialBucketShape {
  texts: UpstreamMaterialBucketItem[];
  images: UpstreamMaterialBucketItem[];
  videos: UpstreamMaterialBucketItem[];
  audios: UpstreamMaterialBucketItem[];
}

const TEXT_FIELD_MARKER = '::text-field:';
const PRESERVE_DUPLICATE_MEDIA_MARKERS = ['::material-set:', '::tracks:'];

function normalizedTextFieldEchoKey(item: UpstreamMaterialBucketItem): string {
  return `${item.sourceNodeId}::${String(item.url || '').trim()}`;
}

function normalizedMediaEchoKey(item: UpstreamMaterialBucketItem): string {
  return `${item.sourceNodeId}::${item.kind}::${String(item.url || '').trim()}`;
}

function shouldPreserveDuplicateMediaItem(item: UpstreamMaterialBucketItem): boolean {
  return PRESERVE_DUPLICATE_MEDIA_MARKERS.some((marker) => item.id.includes(marker));
}

function dedupeMediaItems<T extends UpstreamMaterialBucketItem>(items: T[]) {
  const seen = new Set<string>();
  let changed = false;
  const next = items.filter((item) => {
    if (shouldPreserveDuplicateMediaItem(item)) return true;
    const key = normalizedMediaEchoKey(item);
    if (!key.endsWith('::')) {
      if (seen.has(key)) {
        changed = true;
        return false;
      }
      seen.add(key);
    }
    return true;
  });
  return { items: next, changed };
}

export function dedupeUpstreamMaterialBuckets<T extends UpstreamMaterialBucketShape>(buckets: T): T {
  const seenTextFieldEchoes = new Set<string>();
  let changed = false;
  const texts = buckets.texts.filter((item) => {
    if (item.kind !== 'text' || !item.id.includes(TEXT_FIELD_MARKER)) return true;
    const key = normalizedTextFieldEchoKey(item);
    if (!key.endsWith('::')) {
      if (seenTextFieldEchoes.has(key)) {
        changed = true;
        return false;
      }
      seenTextFieldEchoes.add(key);
    }
    return true;
  });

  const images = dedupeMediaItems(buckets.images);
  const videos = dedupeMediaItems(buckets.videos);
  const audios = dedupeMediaItems(buckets.audios);
  changed = changed || images.changed || videos.changed || audios.changed;

  return changed
    ? ({ ...buckets, texts, images: images.items, videos: videos.items, audios: audios.items } as T)
    : buckets;
}
