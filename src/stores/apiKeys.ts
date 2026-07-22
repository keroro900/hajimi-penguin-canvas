import { create } from 'zustand';
import type { ApiSettings } from '../types/canvas';
import * as api from '../services/api';

// 默认服务 Base URL 留空，用户在 API 设置中填写自己的 OpenAI 兼容地址。
export const DEFAULT_ZHENZHEN_BASE = '';
export const HAKIMI_MCP_DEFAULT_BACKEND_URL = 'http://127.0.0.1:18766';

interface ApiKeysState {
  settings: ApiSettings;
  loading: boolean;
  error: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  save: (patch: Partial<ApiSettings>) => Promise<void>;
}

const DEFAULT: ApiSettings = {
  zhenzhenApiKey: '',
  zhenzhenBaseUrl: DEFAULT_ZHENZHEN_BASE,
  llmApiKey: '',
  llmBaseUrl: DEFAULT_ZHENZHEN_BASE,
  // 分类独立 Key（留空时 fallback 到 zhenzhenApiKey）
  gptImageApiKey: '',
  nanoBananaApiKey: '',
  mjApiKey: '',
  veoApiKey: '',
  soraApiKey: '',
  grokApiKey: '',
  seedanceApiKey: '',
  sunoApiKey: '',
  zhenzhenImageModelOverrides: {},
  zhenzhenVideoModelOverrides: {},
  zhenzhenLlmModelOverrides: {},
  zhenzhenModelCatalog: {
    all: [], imageModels: [], videoModels: [], audioModels: [], chatModels: [], unknownModels: [],
    manualModels: [], typeOverrides: {},
  },
  llmModelCatalog: {
    all: [], imageModels: [], videoModels: [], audioModels: [], chatModels: [], unknownModels: [],
    manualModels: [], typeOverrides: {},
  },
  zhenzhenImageModelProtocols: {},
  zhenzhenVideoModelProtocols: {},
  // 路径默认值由后端按平台计算并通过 /api/settings 返回，前端不硬编码 D 盘。
  fileSavePath: '',
  canvasAutoSavePath: '',
  resourceLibraryPath: '',
  themeTemplatePath: '',
  eagleApiBase: '',
  hakimiMcpBackendUrl: HAKIMI_MCP_DEFAULT_BACKEND_URL,
  advancedProviders: [],
  advancedProviderSummary: {
    enabledCount: 0,
    configuredKeyCount: 0,
    comfyuiConfigured: false,
    jimengConfigured: false,
  },
  cloudUploadTargets: [],
  cloudUploadSummary: {
    totalCount: 0,
    enabledCount: 0,
    configuredCount: 0,
    supportedUploadCount: 0,
    defaultTargetId: '',
    defaultLabel: '',
  },
  taskCompletionSound: { mode: 'default', url: '' },
  preferences: { theme: 'dark', language: 'zh-CN' },
};

export const useApiKeysStore = create<ApiKeysState>((set) => ({
  settings: DEFAULT,
  loading: false,
  error: null,
  loaded: false,

  async load() {
    set({ loading: true, error: null });
    try {
      const data = await api.getSettings();
      set({
        settings: { ...DEFAULT, ...data },
        loading: false,
        loaded: true,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '加载设置失败' });
    }
  },

  async save(patch) {
    set({ loading: true, error: null });
    try {
      await api.updateSettings(patch);
      // 重新拉取(后端会返回脱敏后的 Key)
      const data = await api.getSettings();
      set({
        settings: { ...DEFAULT, ...data },
        loading: false,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '保存失败' });
    }
  },
}));
