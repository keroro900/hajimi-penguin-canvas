import { mediaDownloadFileName, type MediaKind } from './mediaCollection';

export const DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS = 5 * 60 * 1000;

function triggerAnchorDownload(href: string, fileName: string, newTab = false) {
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noreferrer';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadMediaUrl(kind: MediaKind, url: string, index = 0, mime?: string): Promise<void> {
  const sourceUrl = String(url || '').trim();
  if (!sourceUrl) return;
  const fallbackName = mediaDownloadFileName(kind, sourceUrl, index, mime);
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const fileName = mediaDownloadFileName(kind, sourceUrl, index, mime || blob.type);
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, fileName);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS);
  } catch {
    triggerAnchorDownload(sourceUrl, fallbackName, true);
  }
}
