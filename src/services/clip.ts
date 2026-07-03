import type { ClipProject } from '../utils/clipProject';

export interface ClipProbeItem {
  url: string;
  duration: number;
  mime?: string;
  size?: number;
  error?: string;
}

export interface ClipRenderResult {
  filename: string;
  url: string;
  coverFilename?: string;
  coverUrl?: string;
  coverTime?: number;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface ClipRenderOptions {
  cover?: {
    mode?: 'frame' | 'local' | 'none';
    time?: number;
    url?: string;
  };
}

export interface ClipUploadResult {
  filename: string;
  url: string;
  size: number;
  mime?: string;
  originalName?: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.data as T;
}

export async function probeClipMedia(urls: string[]): Promise<ClipProbeItem[]> {
  const data = await postJson<{ items: ClipProbeItem[] }>('/api/clip/probe', { urls });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function renderClipProject(project: ClipProject, options: ClipRenderOptions = {}): Promise<ClipRenderResult> {
  return postJson<ClipRenderResult>('/api/clip/render', { project, ...options });
}

export async function uploadClipAsset(file: File): Promise<ClipUploadResult> {
  const fd = new FormData();
  fd.append('file', file, file.name || 'clip-asset');
  const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.data as ClipUploadResult;
}
