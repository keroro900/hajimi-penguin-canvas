import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '../services/api';
import {
  BUILT_IN_THEME_TEMPLATES,
  DEFAULT_THEME_TEMPLATE_ID,
  PIXEL_TEMPLATE_ID,
  TECH_TEMPLATE_ID,
  resolveThemeTemplate,
} from '../theme/defaultTemplates';
import type { LegacyThemeStyle, ThemeMode, ThemeTemplate } from '../theme/types';
import {
  nextTogglePreference,
  resolveMigratedPreference,
  resolveSystemTheme,
  type AppearancePreference,
} from '../theme/appearance';
import {
  DEFAULT_UI_FONT_PRESET,
  normalizeUiFontPresetId,
  sanitizeCustomUiFont,
  type UiFontPresetId,
} from '../utils/uiFont';

export type CanvasTheme = ThemeMode;
export type ThemeStyle = LegacyThemeStyle;

interface ThemeState {
  theme: CanvasTheme;
  appearancePreference: AppearancePreference;
  style: ThemeStyle;
  templateId: string;
  customTemplates: ThemeTemplate[];
  templatesLoaded: boolean;
  templatesPath: string;
  templatesError: string | null;
  uiFontPreset: UiFontPresetId;
  customUiFont: string;
  toggleTheme: () => void;
  setTheme: (theme: CanvasTheme) => void;
  setAppearancePreference: (preference: AppearancePreference) => void;
  toggleStyle: () => void;
  setStyle: (style: ThemeStyle) => void;
  setTemplate: (templateId: string, mode?: CanvasTheme) => void;
  setUiFontPreset: (preset: UiFontPresetId) => void;
  setCustomUiFont: (font: string) => void;
  resetUiFontPreference: () => void;
  loadCustomTemplates: () => Promise<void>;
  importTemplate: (template: ThemeTemplate) => Promise<ThemeTemplate>;
  saveCustomTemplate: (template: ThemeTemplate) => Promise<ThemeTemplate>;
  deleteCustomTemplate: (templateId: string) => Promise<void>;
}

function legacyTemplateId(style?: ThemeStyle) {
  return style === 'tech' ? TECH_TEMPLATE_ID : PIXEL_TEMPLATE_ID;
}

/** 读取操作系统当前深浅色偏好（无窗口环境时按浅色处理）。 */
function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 主题状态管理。
 * - theme: dark | light 明暗模式
 * - style: tech | pixel 旧组件兼容风格
 * - templateId: 当前模板 ID，新主题体系的主入口
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: resolveSystemTheme(systemPrefersDark()),
      appearancePreference: 'system',
      style: 'pixel',
      templateId: DEFAULT_THEME_TEMPLATE_ID,
      customTemplates: [],
      templatesLoaded: false,
      templatesPath: '',
      templatesError: null,
      uiFontPreset: DEFAULT_UI_FONT_PRESET,
      customUiFont: '',
      toggleTheme: () =>
        set((state) => {
          const next = nextTogglePreference(state.appearancePreference, state.theme);
          return {
            appearancePreference: next,
            theme: next === 'system' ? resolveSystemTheme(systemPrefersDark()) : next,
          };
        }),
      setTheme: (theme) => set({ theme, appearancePreference: theme }),
      setAppearancePreference: (preference) =>
        set({
          appearancePreference: preference,
          theme: preference === 'system' ? resolveSystemTheme(systemPrefersDark()) : preference,
        }),
      toggleStyle: () =>
        set((state) => {
          const nextId = state.style === 'tech' ? PIXEL_TEMPLATE_ID : TECH_TEMPLATE_ID;
          const tpl = resolveThemeTemplate(nextId, get().customTemplates);
          return {
            templateId: tpl.id,
            style: tpl.legacyStyle,
            theme: tpl.legacyStyle === 'pixel' ? 'light' : 'dark',
          };
        }),
      setStyle: (style) => {
        const tpl = resolveThemeTemplate(legacyTemplateId(style), get().customTemplates);
        set({ templateId: tpl.id, style: tpl.legacyStyle, theme: tpl.legacyStyle === 'pixel' ? 'light' : 'dark' });
      },
      setTemplate: (templateId, mode) => {
        const tpl = resolveThemeTemplate(templateId, get().customTemplates);
        set({ templateId: tpl.id, style: tpl.legacyStyle, ...(mode ? { theme: mode } : {}) });
      },
      setUiFontPreset: (preset) => set({ uiFontPreset: normalizeUiFontPresetId(preset) }),
      setCustomUiFont: (font) => set({ customUiFont: sanitizeCustomUiFont(font), uiFontPreset: 'custom' }),
      resetUiFontPreference: () => set({ uiFontPreset: DEFAULT_UI_FONT_PRESET, customUiFont: '' }),
      async loadCustomTemplates() {
        const res = await api.getThemeTemplates();
        if (!res.success) {
          set({ templatesLoaded: true, templatesError: res.error || '加载主题模板失败' });
          return;
        }
        const customTemplates = (res.data.templates || []).map((tpl) => ({ ...tpl, builtIn: false }));
        const current = resolveThemeTemplate(get().templateId, customTemplates);
        set({
          customTemplates,
          templatesLoaded: true,
          templatesPath: res.data.path || '',
          templatesError: null,
          templateId: current.id,
          style: current.legacyStyle,
        });
      },
      async importTemplate(template) {
        const res = await api.importThemeTemplate({ ...template, builtIn: false });
        if (!res.success) throw new Error(res.error || '导入主题失败');
        const saved = { ...res.data, builtIn: false };
        set((state) => ({
          customTemplates: [...state.customTemplates.filter((tpl) => tpl.id !== saved.id), saved],
          templateId: saved.id,
          style: saved.legacyStyle,
        }));
        return saved;
      },
      async saveCustomTemplate(template) {
        const res = await api.saveThemeTemplate({ ...template, builtIn: false });
        if (!res.success) throw new Error(res.error || '保存主题失败');
        const saved = { ...res.data, builtIn: false };
        set((state) => ({
          customTemplates: [...state.customTemplates.filter((tpl) => tpl.id !== saved.id), saved],
          templateId: saved.id,
          style: saved.legacyStyle,
        }));
        return saved;
      },
      async deleteCustomTemplate(templateId) {
        if (BUILT_IN_THEME_TEMPLATES.some((tpl) => tpl.id === templateId)) return;
        const res = await api.deleteThemeTemplate(templateId);
        if (!res.success) throw new Error(res.error || '删除主题失败');
        set((state) => {
          const customTemplates = state.customTemplates.filter((tpl) => tpl.id !== templateId);
          const currentDeleted = state.templateId === templateId;
          const fallback = resolveThemeTemplate(DEFAULT_THEME_TEMPLATE_ID, customTemplates);
          return {
            customTemplates,
            ...(currentDeleted ? { templateId: fallback.id, style: fallback.legacyStyle, theme: 'light' as CanvasTheme } : {}),
          };
        });
      },
    }),
    {
      name: 't8-canvas-theme',
      partialize: (state) => ({
        theme: state.theme,
        appearancePreference: state.appearancePreference,
        style: state.style,
        templateId: state.templateId,
        uiFontPreset: state.uiFontPreset,
        customUiFont: state.customUiFont,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<ThemeState>;
        const templateId = p.templateId || legacyTemplateId(p.style);
        const tpl = BUILT_IN_THEME_TEMPLATES.find((item) => item.id === templateId);
        // 老用户仅有 theme：迁移为与现状一致的显式偏好，升级后界面不突变。
        const appearancePreference = resolveMigratedPreference({
          appearancePreference: p.appearancePreference,
          theme: p.theme,
        });
        const migratedTheme = p.theme || ((tpl?.legacyStyle || p.style) === 'pixel' ? 'light' : 'dark');
        return {
          ...current,
          ...p,
          templateId,
          style: tpl?.legacyStyle || p.style || current.style,
          appearancePreference,
          theme: appearancePreference === 'system' ? resolveSystemTheme(systemPrefersDark()) : migratedTheme,
          uiFontPreset: normalizeUiFontPresetId(p.uiFontPreset),
          customUiFont: sanitizeCustomUiFont(p.customUiFont),
        };
      },
    }
  )
);

/**
 * 订阅操作系统深浅色变化：仅当 appearancePreference === 'system' 时实时更新
 * 解析后的 theme；显式偏好不受影响。返回取消订阅函数。
 * 在 App 根组件挂载时调用一次（effect cleanup 时退订）。
 */
export function startSystemThemeSync(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (event: MediaQueryListEvent) => {
    if (useThemeStore.getState().appearancePreference !== 'system') return;
    useThemeStore.setState({ theme: resolveSystemTheme(event.matches) });
  };
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }
  media.addListener(onChange);
  return () => media.removeListener(onChange);
}
