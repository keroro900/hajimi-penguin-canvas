import type { LayerAgentDecomposeRequest, LayerAgentDecomposeResult } from '../types/layerAgent';

export async function decomposeImageLayers(req: LayerAgentDecomposeRequest): Promise<LayerAgentDecomposeResult> {
  const res = await fetch('/api/layer-agent/decompose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      // Keep the HTTP status when the backend returns non-JSON.
    }
    throw new Error(message);
  }
  const data = await res.json();
  return data.data || data;
}
