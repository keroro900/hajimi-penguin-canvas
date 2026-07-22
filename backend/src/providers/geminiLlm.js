function isGeminiLlmModel(model) {
  return String(model || '').toLowerCase().includes('gemini');
}

function parseDataUrl(value) {
  const match = String(value || '').trim().match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    data: match[2].replace(/\s+/g, ''),
  };
}

function mediaUrlFromPart(part) {
  if (!part || typeof part !== 'object') return '';
  return part.image_url?.url
    || part.video_url?.url
    || part.input_video?.url
    || '';
}

function mimeTypeForPart(part, url) {
  const explicit = part?.mime_type || part?.mimeType;
  if (explicit) return String(explicit);
  const value = String(url || '').split(/[?#]/)[0].toLowerCase();
  if (part?.type === 'video_url' || part?.type === 'input_video') {
    if (value.endsWith('.webm')) return 'video/webm';
    if (value.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4';
  }
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.webp')) return 'image/webp';
  if (value.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function messageContentToGeminiParts(content) {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) return [];

  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && typeof part.text === 'string' && part.text) {
      parts.push({ text: part.text });
      continue;
    }
    const url = mediaUrlFromPart(part);
    if (!url) continue;
    const dataUrl = parseDataUrl(url);
    if (dataUrl) {
      parts.push({ inlineData: dataUrl });
    } else {
      parts.push({
        fileData: {
          mimeType: mimeTypeForPart(part, url),
          fileUri: String(url),
        },
      });
    }
  }
  return parts;
}

function buildGeminiLlmPayload({ messages, temperature, maxTokens } = {}) {
  const systemParts = [];
  const contents = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    const parts = messageContentToGeminiParts(message?.content);
    if (!parts.length) continue;
    if (message?.role === 'system') {
      systemParts.push(...parts.filter((part) => typeof part.text === 'string'));
      continue;
    }
    contents.push({
      role: message?.role === 'assistant' || message?.role === 'model' ? 'model' : 'user',
      parts,
    });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens ?? 16384,
    },
  };
  if (systemParts.length) payload.systemInstruction = { parts: systemParts };
  return payload;
}

function normalizeGeminiLlmResponse(data, requestedModel) {
  const candidate = data?.candidates?.[0] || {};
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const imageUrls = [];
  let content = '';

  for (const part of parts) {
    if (typeof part?.text === 'string') content += part.text;
    const inlineData = part?.inlineData || part?.inline_data;
    if (inlineData?.data && String(inlineData.mimeType || inlineData.mime_type || '').startsWith('image/')) {
      imageUrls.push(`data:${inlineData.mimeType || inlineData.mime_type};base64,${inlineData.data}`);
    }
  }

  const finishReason = candidate?.finishReason || candidate?.finish_reason || '';
  return {
    content,
    imageUrls,
    raw: data,
    model: data?.modelVersion || requestedModel,
    finishReason,
    truncated: ['max_tokens', 'max_token', 'length'].includes(String(finishReason).toLowerCase()),
  };
}

module.exports = {
  buildGeminiLlmPayload,
  isGeminiLlmModel,
  normalizeGeminiLlmResponse,
};
