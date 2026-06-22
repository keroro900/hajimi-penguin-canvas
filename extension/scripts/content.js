(() => {
  if (window.__t8WebImageContentLoaded) return;
  window.__t8WebImageContentLoaded = true;

  const MODAL_ID = 't8-web-image-reverse-modal';
  const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:18766';
  let activeRunId = 0;

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || '扩展后台未响应。'));
          return;
        }
        resolve(response || {});
      });
    });
  }

  async function getSettings() {
    const response = await sendRuntimeMessage({ action: 't8WebImage.getSettings' });
    return response.settings || { t8_backend_base: DEFAULT_BACKEND_BASE };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeImageUrls(data) {
    const payload = data?.data || data || {};
    const urls = Array.isArray(payload.imageUrls) ? payload.imageUrls : [];
    return urls
      .map((url) => String(url || '').trim())
      .filter(Boolean);
  }

  function absoluteBackendUrl(base, path) {
    const cleanBase = String(base || DEFAULT_BACKEND_BASE).replace(/\/+$/, '');
    if (/^https?:\/\//i.test(path)) return path;
    return `${cleanBase}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
      reader.readAsDataURL(blob);
    });
  }

  async function imageUrlForBackend(imageUrl) {
    const text = String(imageUrl || '').trim();
    if (/^(https?:\/\/|data:image\/)/i.test(text)) return text;
    const response = await fetch(text);
    if (!response.ok) throw new Error(`读取网页图片失败：HTTP ${response.status}`);
    const blob = await response.blob();
    if (!/^image\//i.test(blob.type || '')) throw new Error('当前右键对象不是可识别的图片。');
    return blobToDataUrl(blob);
  }

  function removeExistingModal() {
    document.getElementById(MODAL_ID)?.remove();
  }

  function createModal({ imageUrl, pageUrl, pageTitle }) {
    removeExistingModal();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <div class="t8-web-image-card">
        <div class="t8-web-image-head">
          <div>
            <div class="t8-web-image-eyebrow">T8 WEB IMAGE</div>
            <div class="t8-web-image-title">网页图片反推</div>
          </div>
          <button class="t8-web-image-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="t8-web-image-body">
          <img class="t8-web-image-source" src="${escapeHtml(imageUrl)}" alt="source image" />
          <div class="t8-web-image-status" data-role="status">准备反推提示词并生成图片...</div>
          <div class="t8-web-image-section">
            <div class="t8-web-image-label">生成提示词</div>
            <textarea class="t8-web-image-prompt" data-role="prompt" spellcheck="false" placeholder="等待 ModelScope 返回提示词..."></textarea>
          </div>
          <div class="t8-web-image-section">
            <div class="t8-web-image-label">生成图像</div>
            <div class="t8-web-image-results" data-role="results"></div>
          </div>
        </div>
        <div class="t8-web-image-actions">
          <button type="button" data-send-mode="prompt" disabled>发提示词</button>
          <button type="button" data-send-mode="image" disabled>发图片</button>
          <button type="button" data-send-mode="both" disabled>图+提示词</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);

    const state = {
      prompt: '',
      imageUrls: [],
      sourceImageUrl: imageUrl,
      pageUrl: pageUrl || location.href,
      pageTitle: pageTitle || document.title,
    };

    modal.querySelector('.t8-web-image-close')?.addEventListener('click', removeExistingModal);
    modal.querySelectorAll('[data-send-mode]').forEach((button) => {
      button.addEventListener('click', async () => {
        const mode = button.getAttribute('data-send-mode') || 'both';
        const response = await sendRuntimeMessage({
          action: 't8WebImage.sendToCanvas',
          payload: {
            mode,
            prompt: state.prompt,
            images: state.imageUrls,
            sourceImageUrl: state.sourceImageUrl,
            pageUrl: state.pageUrl,
            pageTitle: state.pageTitle,
            source: 'web-image-reverse',
            createdAt: Date.now(),
          },
        });
        setStatus(modal, response.ok ? '已发送到 T8 画布。' : `发送失败：${response.error || '未知错误'}`, !response.ok);
      });
    });

    return { modal, state };
  }

  function setStatus(modal, text, isError = false) {
    const status = modal.querySelector('[data-role="status"]');
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-error', !!isError);
  }

  function updateButtons(modal, state) {
    const hasPrompt = !!String(state.prompt || '').trim();
    const hasImages = Array.isArray(state.imageUrls) && state.imageUrls.length > 0;
    modal.querySelector('[data-send-mode="prompt"]').disabled = !hasPrompt;
    modal.querySelector('[data-send-mode="image"]').disabled = !hasImages;
    modal.querySelector('[data-send-mode="both"]').disabled = !(hasPrompt || hasImages);
  }

  function renderResults(modal, state, backendBase) {
    const promptEl = modal.querySelector('[data-role="prompt"]');
    if (promptEl) promptEl.value = state.prompt || '';
    const results = modal.querySelector('[data-role="results"]');
    if (!results) return;
    results.innerHTML = '';
    if (!state.imageUrls.length) {
      results.innerHTML = '<div class="t8-web-image-empty">还没有生成图像</div>';
      updateButtons(modal, state);
      return;
    }
    state.imageUrls.forEach((url) => {
      const item = document.createElement('a');
      item.href = absoluteBackendUrl(backendBase, url);
      item.target = '_blank';
      item.rel = 'noreferrer';
      item.className = 't8-web-image-result';
      item.innerHTML = `<img src="${escapeHtml(item.href)}" alt="generated image" />`;
      results.appendChild(item);
    });
    updateButtons(modal, state);
  }

  async function runReverseAndGenerate(modal, state, runId) {
    try {
      const settings = await getSettings().catch(() => ({ t8_backend_base: DEFAULT_BACKEND_BASE }));
      const backendBase = settings.t8_backend_base || DEFAULT_BACKEND_BASE;
      setStatus(modal, '正在调用 ModelScope 视觉模型反推提示词...');
      const response = await sendRuntimeMessage({
        action: 't8WebImage.reverseAndGenerate',
        backendBase,
        payload: {
          imageUrl: await imageUrlForBackend(state.sourceImageUrl),
          generateImage: true,
          providerId: 'modelscope',
          size: '1024x1024',
        },
      });
      const data = response.data || {};
      if (runId !== activeRunId) return;
      const payload = data.data || {};
      state.prompt = String(payload.prompt || '').trim();
      state.imageUrls = normalizeImageUrls(data);
      renderResults(modal, state, backendBase);
      if (!response.ok || !data.success) {
        setStatus(modal, response.error || data.error || '反推或生成失败；如果已返回提示词，可以先发送提示词。', true);
        updateButtons(modal, state);
        return;
      }
      setStatus(modal, state.imageUrls.length ? '提示词和图像已生成，可发送回画布。' : '提示词已生成，可发送回画布。');
    } catch (error) {
      if (runId !== activeRunId) return;
      setStatus(modal, error?.message || '反推失败，请确认 T8 后端已启动。', true);
      updateButtons(modal, state);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action !== 't8WebImage.showModal') return;
    const imageUrl = String(message.imageUrl || '').trim();
    if (!imageUrl) return;
    const runId = Date.now();
    activeRunId = runId;
    const { modal, state } = createModal({
      imageUrl,
      pageUrl: message.pageUrl,
      pageTitle: message.pageTitle,
    });
    updateButtons(modal, state);
    runReverseAndGenerate(modal, state, runId);
  });
})();
