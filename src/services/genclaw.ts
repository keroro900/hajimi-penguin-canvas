import type { GenClawRenderRequest, GenClawRenderResult } from '../genclaw/types.ts';

export async function renderGenClawSketch(req: GenClawRenderRequest): Promise<GenClawRenderResult> {
  const response = await fetch('/api/genclaw/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data.data as GenClawRenderResult;
}

