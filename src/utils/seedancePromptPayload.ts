export type SeedancePromptRef = Record<string, any> & { url: string };

export interface SeedancePromptPayload {
  prompt: string;
  refImages: SeedancePromptRef[];
}

function normalizeSeedancePromptRefs(value: unknown): SeedancePromptRef[] {
  const refs = Array.isArray(value) ? value : [value];
  const out: SeedancePromptRef[] = [];
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue;
    const obj = ref as Record<string, any>;
    const url = typeof obj.url === 'string' ? obj.url.trim() : '';
    if (!url) continue;
    out.push({ ...obj, url });
  }
  return out;
}

function findBalancedJsonEnd(text: string, start: number): number {
  const opener = text[start];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : '';
  if (!closer) return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function parseInlineRefImagesBlock(text: string): SeedancePromptPayload | null {
  const marker = text.match(/\brefImages\b\s*[:=]\s*/i);
  if (!marker || marker.index == null) return null;
  const jsonStart = marker.index + marker[0].length;
  const firstJson = text.slice(jsonStart).search(/[\[{]/);
  if (firstJson < 0) return null;
  const start = jsonStart + firstJson;
  const end = findBalancedJsonEnd(text, start);
  if (end < 0) return null;
  try {
    const refImages = normalizeSeedancePromptRefs(JSON.parse(text.slice(start, end)));
    if (!refImages.length) return null;
    const prompt = `${text.slice(0, marker.index)}${text.slice(end)}`.trim();
    return { prompt, refImages };
  } catch {
    return null;
  }
}

export function extractSeedancePromptPayload(value: unknown): SeedancePromptPayload {
  const text = String(value || '').trim();
  if (!text) return { prompt: '', refImages: [] };
  if (/^[\[{]/.test(text)) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return { prompt: '', refImages: normalizeSeedancePromptRefs(parsed) };
      }
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, any>;
        const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
        const refImages = normalizeSeedancePromptRefs(obj.refImages ?? obj.reference_image_urls ?? obj.image_urls);
        if (prompt || refImages.length) return { prompt, refImages };
      }
    } catch {
      // Keep the original text as the prompt when JSON parsing fails.
    }
  }
  const inline = parseInlineRefImagesBlock(text);
  if (inline) return inline;
  return { prompt: text, refImages: [] };
}
