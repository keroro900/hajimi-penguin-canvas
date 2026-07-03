const DEFAULT_BACKEND_URL = 'http://127.0.0.1:18766';
const SAFE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function backendBaseUrl(env = process.env) {
  return String(env.HAKIMI_BACKEND_URL || env.T8_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

export function normalizeBackendRequest(input = {}) {
  const method = String(input.method || 'GET').trim().toUpperCase();
  if (!SAFE_METHODS.has(method)) throw new Error(`Unsupported method: ${method}`);

  const rawPath = String(input.path || '').trim();
  if (!rawPath) throw new Error('Missing backend API path');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawPath) || rawPath.startsWith('//')) {
    throw new Error('Only relative paths are allowed');
  }

  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (!path.startsWith('/api/')) throw new Error('Only /api paths may be called through Hakimi MCP');

  return {
    method,
    path,
    body: input.body,
  };
}

export async function callHakimiBackend(input = {}, options = {}) {
  const request = normalizeBackendRequest(input);
  const baseUrl = options.baseUrl || backendBaseUrl(options.env);
  const url = `${baseUrl}${request.path}`;
  const headers = { Accept: 'application/json' };
  const fetchOptions = { method: request.method, headers };

  if (request.body !== undefined && request.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(request.body);
  }

  const response = await fetch(url, fetchOptions);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error
      ? payload.error
      : `Hakimi backend request failed: HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return {
    ok: true,
    status: response.status,
    data: payload,
  };
}

export function jsonToolResult(value) {
  const text = JSON.stringify(value, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: value,
  };
}
