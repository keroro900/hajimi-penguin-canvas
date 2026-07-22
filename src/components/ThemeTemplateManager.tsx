import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Music2,
  Palette,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  BUILT_IN_THEME_TEMPLATES,
  DEFAULT_THEME_TEMPLATE_ID,
  getTemplateMode,
  resolveThemeTemplate,
  rhHiddenThemeMusicUrl,
  rhThemeMusicUrl,
} from '../theme/defaultTemplates';
import { getThemeContrastWarnings } from '../theme/validateTheme';
import type {
  LegacyThemeStyle,
  ThemeMode,
  ThemeMusic,
  ThemeMusicPreset,
  ThemeTemplate,
  ThemeTokens,
  ThemeVisuals,
} from '../theme/types';
import { useThemeStore } from '../stores/theme';

interface ThemeTemplateManagerProps {
  open: boolean;
  onClose: () => void;
}

const COLOR_FIELDS: Array<[keyof ThemeTokens, string]> = [
  ['appBg', '应用背景'],
  ['canvasBg', '画布背景'],
  ['panelBg', '面板'],
  ['panelBgElevated', '浮层'],
  ['panelBgMuted', '弱背景'],
  ['nodeBg', '节点'],
  ['nodeHeaderBg', '节点标题'],
  ['textMain', '主文字'],
  ['textMuted', '次文字'],
  ['textDim', '弱文字'],
  ['border', '边框'],
  ['borderStrong', '强边框'],
  ['accent', '主色'],
  ['accentHover', '主色悬停'],
  ['accentText', '主按钮文字'],
  ['secondary', '副色'],
  ['warning', '警告'],
  ['danger', '危险'],
  ['success', '成功'],
  ['gridDot', '网格点'],
  ['edge', '连线'],
  ['edgeSelected', '选中连线'],
  ['portText', '文本端口'],
  ['portImage', '图片端口'],
  ['portVideo', '视频端口'],
  ['portAudio', '音频端口'],
];

const TEXT_FIELDS: Array<[keyof ThemeTokens, string]> = [
  ['shadowPanel', '面板阴影'],
  ['shadowButton', '按钮阴影'],
  ['shadowStrong', '强阴影'],
  ['radiusPanel', '面板圆角'],
  ['radiusButton', '按钮圆角'],
  ['radiusNode', '节点圆角'],
  ['fontFamily', '正文字体'],
  ['displayFont', '标题字体'],
];

const VISUAL_STYLE_OPTIONS = [
  { value: 'plain', label: '基础语义' },
  { value: 'tech', label: '科技视觉' },
  { value: 'pixel', label: '像素糖果' },
  { value: 'rh', label: 'RH 工作台' },
  { value: 'soft', label: '柔和浮雕' },
  { value: 'wabi', label: '侘寂' },
  { value: 'vapor', label: '蒸汽波' },
  { value: 'utility', label: '实用主义' },
  { value: 'skeuo', label: '拟物化' },
  { value: 'retro', label: '复古 OS' },
  { value: 'ink', label: '水墨意境' },
  { value: 'tap-studio', label: '黑底流光' },
] as const;

const VISUAL_INTENSITY_OPTIONS = [
  { value: 'subtle', label: '轻量' },
  { value: 'medium', label: '标准' },
  { value: 'strong', label: '强识别' },
] as const;

const MUSIC_PRESET_OPTIONS: Array<{ value: ThemeMusicPreset; label: string }> = [
  { value: 'tech-pulse', label: '科技脉冲' },
  { value: 'pixel-pop', label: '像素弹跳' },
  { value: 'rh-pulse', label: 'RH 脉冲' },
  { value: 'soft-pulse', label: '柔和漂流' },
  { value: 'wabi-drift', label: '远山磬' },
  { value: 'vapor-drift', label: '日落漂流' },
  { value: 'utility-pulse', label: '网格脉冲' },
  { value: 'skeuo-hum', label: '录音棚低鸣' },
  { value: 'retro-chime', label: '开机提示音' },
  { value: 'ink-drift', label: '山岚流墨' },
  { value: 'tap-flow', label: '黑底流光' },
];

const MAX_THEME_AUDIO_SIZE = 20 * 1024 * 1024;

function fallbackVisuals(legacyStyle: LegacyThemeStyle): ThemeVisuals {
  return {
    style: legacyStyle === 'tech' ? 'tech' : 'pixel',
    intensity: 'medium',
    iconPack: 'default',
    canvasPattern: legacyStyle === 'tech' ? 'circuit' : 'dots',
    nodeFrame: legacyStyle === 'tech' ? 'glass' : 'sticker',
    headerMark: '',
  };
}

function visualDefaultsFor(style: ThemeVisuals['style'], legacyStyle: LegacyThemeStyle, prev?: ThemeVisuals): ThemeVisuals {
  if (style === 'rh') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'hub',
      nodeFrame: 'hub-card',
      headerMark: prev?.headerMark || 'RH',
    };
  }
  if (style === 'soft') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'soft-dots',
      nodeFrame: 'soft-card',
      headerMark: prev?.headerMark || 'SOFT',
    };
  }
  if (style === 'wabi') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'wabi-paper',
      nodeFrame: 'wabi-card',
      headerMark: prev?.headerMark || '侘',
    };
  }
  if (style === 'vapor') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'vapor-grid',
      nodeFrame: 'vapor-card',
      headerMark: prev?.headerMark || 'VAPOR',
    };
  }
  if (style === 'utility') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'utility-grid',
      nodeFrame: 'utility-card',
      headerMark: prev?.headerMark || 'UTILITY',
    };
  }
  if (style === 'skeuo') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'skeuo-wood',
      nodeFrame: 'skeuo-panel',
      headerMark: prev?.headerMark || 'SKEUO',
    };
  }
  if (style === 'retro') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'retro-desktop',
      nodeFrame: 'retro-window',
      headerMark: prev?.headerMark || 'RETRO',
    };
  }
  if (style === 'ink') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'ink-paper',
      nodeFrame: 'ink-scroll',
      headerMark: prev?.headerMark || '墨',
    };
  }
  if (style === 'tap-studio') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'tap-void',
      nodeFrame: 'tap-glass',
      headerMark: prev?.headerMark || 'FLOW',
    };
  }
  if (style === 'tech') {
    return {
      ...fallbackVisuals(legacyStyle),
      ...(prev || {}),
      style,
      iconPack: 'default',
      canvasPattern: 'circuit',
      nodeFrame: 'glass',
    };
  }
  return {
    ...fallbackVisuals(legacyStyle),
    ...(prev || {}),
    style,
    iconPack: 'default',
    canvasPattern: style === 'plain' ? 'none' : 'dots',
    nodeFrame: style === 'plain' ? 'plain' : 'sticker',
  };
}

function fallbackMusic(legacyStyle: LegacyThemeStyle, visuals?: ThemeVisuals): ThemeMusic {
  const visualStyle = visuals?.style;
  if (visualStyle === 'rh') {
    return {
      title: '潮鸣',
      preset: 'rh-pulse',
      source: 'url',
      url: rhThemeMusicUrl,
      hiddenTitle: '沙耶之歌',
      hiddenUrl: rhHiddenThemeMusicUrl,
      hiddenVolume: 0.2,
      volume: 0.16,
      bpm: 104,
      copyrightNote: 'RH 风格默认音乐；隐藏模式会自动切换隐藏主题音乐。',
    };
  }
  if (visualStyle === 'soft') {
    return {
      title: 'Soft Drift',
      preset: 'soft-pulse',
      source: 'synth',
      volume: 0.14,
      bpm: 92,
      copyrightNote: '原创柔和合成循环；可替换为已授权音频 URL。',
    };
  }
  if (visualStyle === 'wabi') {
    return {
      title: '远山磬',
      preset: 'wabi-drift',
      source: 'synth',
      volume: 0.1,
      bpm: 60,
      copyrightNote: '原创水墨晕染式合成循环；可替换为已授权音频 URL。',
    };
  }
  if (visualStyle === 'vapor') {
    return {
      title: 'Sunset Drift',
      preset: 'vapor-drift',
      source: 'synth',
      volume: 0.14,
      bpm: 84,
      copyrightNote: '原创蒸汽波日落合成循环；可替换为已授权音频 URL。',
    };
  }
  if (visualStyle === 'utility') {
    return {
      title: 'Grid Pulse',
      preset: 'utility-pulse',
      source: 'synth',
      volume: 0.12,
      bpm: 108,
      copyrightNote: '原创工程化合成循环；可替换为已授权音频 URL。',
    };
  }
  if (visualStyle === 'skeuo') {
    return {
      title: 'Studio Hum',
      preset: 'skeuo-hum',
      source: 'synth',
      volume: 0.1,
      bpm: 96,
      copyrightNote: '原创录音棚低频氛围合成循环；可替换为已授权音频 URL。',
    };
  }
  if (visualStyle === 'retro') {
    return {
      title: 'Boot Chime',
      preset: 'retro-chime',
      source: 'synth',
      volume: 0.12,
      bpm: 90,
      copyrightNote: '原创 90 年代开机 POST 蜂鸣合成循环；可替换为已授权音频 URL。',
    };
  }
  if (visualStyle === 'ink') {
    return {
      title: 'Mountain Mist',
      preset: 'ink-drift',
      source: 'synth',
      volume: 0.11,
      bpm: 72,
      copyrightNote: '原创古琴泛音式合成循环，气韵悠远；可替换为已授权音频 URL。',
    };
  }
  if (visualStyle === 'tap-studio') {
    return {
      title: 'Void Flow',
      preset: 'tap-flow',
      source: 'synth',
      volume: 0.13,
      bpm: 118,
      copyrightNote: '原创黑底玻璃创作台氛围循环；可替换为已授权音频 URL。',
    };
  }
  if (legacyStyle === 'tech' || visualStyle === 'tech') {
    return {
      title: 'Neon Circuit Pulse',
      preset: 'tech-pulse',
      source: 'synth',
      volume: 0.16,
      bpm: 112,
      copyrightNote: '原创合成循环。',
    };
  }
  return {
    title: 'Candy Bit Bounce',
    preset: 'pixel-pop',
    source: 'synth',
    volume: 0.15,
    bpm: 128,
    copyrightNote: '原创 8-bit 风格循环。',
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function cleanId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function makeCustomCopy(template: ThemeTemplate): ThemeTemplate {
  const id = cleanId(`${template.id}-custom-${Date.now().toString(36)}`);
  return {
    ...deepClone(template),
    id,
    name: `${template.name} 副本`,
    builtIn: false,
    author: template.author || '内置',
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取音频失败'));
    reader.readAsDataURL(file);
  });
}

function downloadJson(template: ThemeTemplate) {
  const blob = new Blob([JSON.stringify({ ...template, builtIn: false }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${template.id || 't8-theme'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function makePreviewStyle(tokens: ThemeTokens): CSSProperties {
  return {
    '--t8-bg-app': tokens.appBg,
    '--t8-bg-canvas': tokens.canvasBg,
    '--t8-bg-panel': tokens.panelBg,
    '--t8-bg-panel-elevated': tokens.panelBgElevated,
    '--t8-bg-panel-muted': tokens.panelBgMuted,
    '--t8-bg-node': tokens.nodeBg,
    '--t8-bg-node-header': tokens.nodeHeaderBg,
    '--t8-text-main': tokens.textMain,
    '--t8-text-muted': tokens.textMuted,
    '--t8-text-dim': tokens.textDim,
    '--t8-border': tokens.border,
    '--t8-border-strong': tokens.borderStrong,
    '--t8-accent': tokens.accent,
    '--t8-accent-hover': tokens.accentHover,
    '--t8-accent-text': tokens.accentText,
    '--t8-secondary': tokens.secondary,
    '--t8-warning': tokens.warning,
    '--t8-danger': tokens.danger,
    '--t8-success': tokens.success,
    '--t8-grid-dot': tokens.gridDot,
    '--t8-edge': tokens.edge,
    '--t8-edge-selected': tokens.edgeSelected,
    '--t8-port-text': tokens.portText,
    '--t8-port-image': tokens.portImage,
    '--t8-port-video': tokens.portVideo,
    '--t8-port-audio': tokens.portAudio,
    '--t8-shadow-panel': tokens.shadowPanel,
    '--t8-shadow-button': tokens.shadowButton,
    '--t8-shadow-strong': tokens.shadowStrong,
    '--t8-radius-panel': tokens.radiusPanel,
    '--t8-radius-button': tokens.radiusButton,
    '--t8-radius-node': tokens.radiusNode,
    '--t8-font-family': tokens.fontFamily,
    '--t8-display-font': tokens.displayFont,
  } as CSSProperties;
}

export default function ThemeTemplateManager({ open, onClose }: ThemeTemplateManagerProps) {
  const {
    theme,
    appearancePreference,
    templateId,
    customTemplates,
    templatesPath,
    templatesError,
    setTemplate,
    setTheme,
    setAppearancePreference,
    loadCustomTemplates,
    importTemplate,
    saveCustomTemplate,
    deleteCustomTemplate,
  } = useThemeStore();
  const allTemplates = useMemo(() => [...BUILT_IN_THEME_TEMPLATES, ...customTemplates], [customTemplates]);
  const activeTemplate = resolveThemeTemplate(templateId, customTemplates);
  const [mode, setMode] = useState<ThemeMode>(theme);
  const [selectedId, setSelectedId] = useState(activeTemplate.id);
  const [editor, setEditor] = useState<ThemeTemplate>(() => deepClone(activeTemplate));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    loadCustomTemplates();
  }, [open, loadCustomTemplates]);

  useEffect(() => {
    if (!open) return;
    const tpl = allTemplates.find((item) => item.id === selectedId);
    if (!tpl) return;
    setEditor(deepClone(tpl));
    setMode(theme);
  }, [open, selectedId, allTemplates, theme]);

  if (!open) return null;

  const selectedBuiltIn = !!editor.builtIn || BUILT_IN_THEME_TEMPLATES.some((tpl) => tpl.id === editor.id);
  const tokens = getTemplateMode(editor, mode).tokens;
  const visuals = editor.visuals || fallbackVisuals(editor.legacyStyle);
  const music = editor.music || fallbackMusic(editor.legacyStyle, visuals);
  const warnings = getThemeContrastWarnings(editor, mode);
  const currentModeActive = activeTemplate.id === editor.id && theme === mode;

  const setToken = (key: keyof ThemeTokens, value: string) => {
    setEditor((prev) => ({
      ...prev,
      modes: {
        ...prev.modes,
        [mode]: {
          tokens: {
            ...prev.modes[mode].tokens,
            [key]: value,
          },
        },
      },
    }));
  };

  const setVisual = <K extends keyof ThemeVisuals>(key: K, value: ThemeVisuals[K]) => {
    setEditor((prev) => ({
      ...prev,
      visuals: {
        ...fallbackVisuals(prev.legacyStyle),
        ...(prev.visuals || {}),
        [key]: value,
      },
    }));
  };

  const setMusic = (patch: Partial<ThemeMusic>) => {
    setEditor((prev) => {
      const baseVisuals = prev.visuals || fallbackVisuals(prev.legacyStyle);
      return {
        ...prev,
        music: {
          ...fallbackMusic(prev.legacyStyle, baseVisuals),
          ...(prev.music || {}),
          ...patch,
        },
      };
    });
  };

  const handleApply = () => {
    setTemplate(editor.id, mode);
    setTheme(mode);
    setMessage('已应用主题');
    window.setTimeout(() => setMessage(''), 1200);
  };

  const handleDuplicate = () => {
    const copy = makeCustomCopy(editor);
    setEditor(copy);
    setSelectedId(copy.id);
    setMessage('已复制为自定义模板，保存后生效');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const withVisuals = { ...editor, visuals: editor.visuals || fallbackVisuals(editor.legacyStyle) };
      const withDefaults = { ...withVisuals, music: editor.music || fallbackMusic(editor.legacyStyle, withVisuals.visuals) };
      const payload = selectedBuiltIn ? makeCustomCopy(withDefaults) : { ...withDefaults, builtIn: false };
      const saved = await saveCustomTemplate(payload);
      setSelectedId(saved.id);
      setEditor(deepClone(saved));
      setMessage('主题已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedBuiltIn) return;
    if (!window.confirm(`删除自定义主题「${editor.name}」？`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteCustomTemplate(editor.id);
      setSelectedId(activeTemplate.id === editor.id ? DEFAULT_THEME_TEMPLATE_ID : activeTemplate.id);
      setMessage('主题已删除');
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const raw = JSON.parse(await file.text());
      const saved = await importTemplate(raw);
      setSelectedId(saved.id);
      setEditor(deepClone(saved));
      setMessage('主题已导入并应用');
    } catch (e: any) {
      setError(e?.message || '导入失败');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMusicFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setMessage('');
    if (!file.type.startsWith('audio/')) {
      setError('请选择音频文件');
      if (musicFileInputRef.current) musicFileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_THEME_AUDIO_SIZE) {
      setError('音频文件请控制在 20MB 以内');
      if (musicFileInputRef.current) musicFileInputRef.current.value = '';
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setMusic({
        title: file.name.replace(/\.[^.]+$/, '') || music.title,
        source: 'upload',
        url: dataUrl,
        copyrightNote: `用户上传音频：${file.name}`,
      });
      setMessage('音乐已上传，保存模板后生效');
      window.setTimeout(() => setMessage(''), 1800);
    } catch (e: any) {
      setError(e?.message || '读取音频失败');
    } finally {
      if (musicFileInputRef.current) musicFileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-modal-mask"
      style={{ zIndex: 10000 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[min(1120px,94vw)] h-[min(760px,92vh)] t8-panel overflow-hidden flex flex-col">
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--t8-border)' }}>
          <Palette size={18} />
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold">主题模板</div>
            <div className="text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>
              {templatesPath || 'D:\\hajimi\\theme-templates'}
            </div>
          </div>
          {message && (
            <span className="t8-chip px-2 py-1 text-[11px]">
              <Check size={12} /> {message}
            </span>
          )}
          <button className="t8-btn px-2 py-2" onClick={onClose} title="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[250px_1fr_310px]">
          <aside className="border-r p-3 overflow-y-auto" style={{ borderColor: 'var(--t8-border)' }}>
            <div className="text-[11px] font-bold mb-2" style={{ color: 'var(--t8-text-muted)' }}>内置模板</div>
            {BUILT_IN_THEME_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                className={`w-full text-left px-3 py-2 mb-2 t8-card ${selectedId === tpl.id ? 'ring-2' : ''}`}
                style={{ borderColor: selectedId === tpl.id ? 'var(--t8-border-strong)' : undefined }}
                onClick={() => setSelectedId(tpl.id)}
              >
                <div className="text-sm font-bold">{tpl.name}</div>
                <div className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--t8-text-muted)' }}>{tpl.description}</div>
              </button>
            ))}
            <div className="text-[11px] font-bold mt-4 mb-2" style={{ color: 'var(--t8-text-muted)' }}>自定义模板</div>
            {customTemplates.length === 0 && (
              <div className="text-[11px] px-3 py-2 rounded" style={{ color: 'var(--t8-text-dim)', background: 'var(--t8-bg-panel-muted)' }}>
                暂无自定义模板
              </div>
            )}
            {customTemplates.map((tpl) => (
              <button
                key={tpl.id}
                className={`w-full text-left px-3 py-2 mb-2 t8-card ${selectedId === tpl.id ? 'ring-2' : ''}`}
                style={{ borderColor: selectedId === tpl.id ? 'var(--t8-border-strong)' : undefined }}
                onClick={() => setSelectedId(tpl.id)}
              >
                <div className="text-sm font-bold">{tpl.name}</div>
                <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--t8-text-muted)' }}>{tpl.id}</div>
              </button>
            ))}
          </aside>

          <main className="p-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold">
                模板名称
                <input
                  className="t8-input mt-1 w-full px-3 py-2 text-sm"
                  value={editor.name}
                  onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label className="text-xs font-bold">
                兼容风格
                <select
                  className="t8-select mt-1 w-full px-3 py-2 text-sm"
                  value={editor.legacyStyle}
                  onChange={(e) => {
                    const legacyStyle = e.target.value === 'tech' ? 'tech' : 'pixel';
                    setEditor((prev) => ({
                      ...prev,
                      legacyStyle,
                      music: prev.music || fallbackMusic(legacyStyle, prev.visuals),
                    }));
                  }}
                >
                  <option value="tech">科技风组件兼容</option>
                  <option value="pixel">像素风组件兼容</option>
                </select>
              </label>
              <label className="text-xs font-bold">
                视觉语言
                <select
                  className="t8-select mt-1 w-full px-3 py-2 text-sm"
                  value={visuals.style}
                  onChange={(e) => {
                    const style = e.target.value as ThemeVisuals['style'];
                    setEditor((prev) => {
                      const nextVisuals = visualDefaultsFor(style, prev.legacyStyle, prev.visuals);
                      return {
                        ...prev,
                        visuals: nextVisuals,
                        music: fallbackMusic(prev.legacyStyle, nextVisuals),
                      };
                    });
                  }}
                >
                  {VISUAL_STYLE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold">
                装饰强度
                <select
                  className="t8-select mt-1 w-full px-3 py-2 text-sm"
                  value={visuals.intensity || 'medium'}
                  onChange={(e) => setVisual('intensity', e.target.value as ThemeVisuals['intensity'])}
                >
                  {VISUAL_INTENSITY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold col-span-2">
                描述
                <input
                  className="t8-input mt-1 w-full px-3 py-2 text-sm"
                  value={editor.description || ''}
                  onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
            </div>

            <div className="mt-4 t8-card p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold">
                <Music2 size={14} />
                默认音乐主题
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold">
                  音乐名称
                  <input
                    className="t8-input mt-1 w-full px-3 py-2 text-sm"
                    value={music.title}
                    onChange={(e) => setMusic({ title: e.target.value })}
                  />
                </label>
                <label className="text-xs font-bold">
                  音乐预设
                  <select
                    className="t8-select mt-1 w-full px-3 py-2 text-sm"
                    value={music.preset}
                    onChange={(e) => setMusic({ preset: e.target.value as ThemeMusicPreset })}
                  >
                    {MUSIC_PRESET_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold">
                  播放来源
                  <select
                    className="t8-select mt-1 w-full px-3 py-2 text-sm"
                    value={music.source || 'synth'}
                    onChange={(e) => {
                      const source = e.target.value as ThemeMusic['source'];
                      setMusic({ source: source === 'url' || source === 'upload' ? source : 'synth' });
                    }}
                  >
                    <option value="synth">内置合成循环</option>
                    <option value="url">授权音频 URL</option>
                    <option value="upload">上传音乐</option>
                  </select>
                </label>
                <label className="text-xs font-bold">
                  音量
                  <input
                    className="mt-2 w-full"
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={music.volume ?? 0.16}
                    onChange={(e) => setMusic({ volume: Number(e.target.value) })}
                  />
                </label>
                {music.source === 'url' && (
                  <label className="text-xs font-bold col-span-2">
                    授权音频 URL
                    <input
                      className="t8-input mt-1 w-full px-3 py-2 text-sm"
                      value={music.url || ''}
                      onChange={(e) => setMusic({ url: e.target.value })}
                      placeholder="https://..."
                    />
                  </label>
                )}
                <div className="text-xs font-bold col-span-2">
                  上传音乐
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="t8-btn px-3 py-2 text-xs"
                      onClick={() => musicFileInputRef.current?.click()}
                    >
                      <Upload size={13} /> 选择音频
                    </button>
                    {music.source === 'upload' && music.url && (
                      <span className="t8-chip px-2 py-1 text-[11px]">已上传：{music.title}</span>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>
                      支持 mp3 / wav / ogg / m4a，20MB 内
                    </span>
                  </div>
                </div>
                <label className="text-xs font-bold col-span-2">
                  版权备注
                  <input
                    className="t8-input mt-1 w-full px-3 py-2 text-sm"
                    value={music.copyrightNote || ''}
                    onChange={(e) => setMusic({ copyrightNote: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              {(['light', 'dark'] as ThemeMode[]).map((m) => (
                <button
                  key={m}
                  className={`t8-btn px-3 py-1.5 text-xs ${mode === m ? 't8-btn-primary' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {m === 'light' ? '白天模式' : '黑夜模式'}
                </button>
              ))}
              <button
                className={`t8-btn px-3 py-1.5 text-xs ${appearancePreference === 'system' ? 't8-btn-primary' : ''}`}
                title="跟随操作系统的深浅色设置"
                onClick={() => {
                  setAppearancePreference('system');
                  setTemplate(editor.id);
                  setMessage('已切换为跟随系统外观');
                  window.setTimeout(() => setMessage(''), 1200);
                }}
              >
                跟随系统
              </button>
              {currentModeActive && <span className="t8-chip px-2 py-1 text-[11px]">当前应用中</span>}
            </div>

            {warnings.length > 0 && (
              <div className="mt-4 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--t8-warning)', background: 'var(--t8-bg-panel-muted)' }}>
                <div className="font-bold flex items-center gap-1 mb-1"><AlertTriangle size={13} /> 可读性提醒</div>
                {warnings.map((w) => <div key={w} style={{ color: 'var(--t8-text-muted)' }}>{w}</div>)}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              {COLOR_FIELDS.map(([key, label]) => (
                <label key={key} className="text-[11px] font-bold">
                  {label}
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={String(tokens[key]).startsWith('#') ? String(tokens[key]) : '#000000'}
                      onChange={(e) => setToken(key, e.target.value)}
                      className="w-9 h-9 rounded overflow-hidden border"
                      style={{ borderColor: 'var(--t8-border)' }}
                    />
                    <input
                      className="t8-input flex-1 px-2 py-2 text-xs font-mono"
                      value={String(tokens[key])}
                      onChange={(e) => setToken(key, e.target.value)}
                    />
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {TEXT_FIELDS.map(([key, label]) => (
                <label key={key} className="text-[11px] font-bold">
                  {label}
                  <input
                    className="t8-input mt-1 w-full px-2 py-2 text-xs font-mono"
                    value={String(tokens[key])}
                    onChange={(e) => setToken(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </main>

          <aside className="border-l p-4 overflow-y-auto" style={{ borderColor: 'var(--t8-border)' }}>
            <div className="text-xs font-bold mb-3">预览</div>
            <div
              className="t8-theme-preview t8-card p-3"
              data-theme-style={editor.legacyStyle}
              data-theme-mode={mode}
              data-theme-visual={visuals.style}
              data-theme-intensity={visuals.intensity || 'medium'}
              data-theme-node-frame={visuals.nodeFrame || 'plain'}
              style={{ ...makePreviewStyle(tokens), background: tokens.canvasBg }}
            >
              <div className="t8-panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm">{editor.name}</span>
                  <span className="t8-chip px-2 py-1 text-[10px]">{mode === 'light' ? '白天' : '黑夜'}</span>
                </div>
                <div className="mt-3 t8-node overflow-hidden">
                  <div className="t8-node-header px-3 py-2 text-xs font-bold">示例节点</div>
                  <div className="p-3 space-y-2">
                    <input className="t8-input w-full px-2 py-2 text-xs" placeholder="输入框文字" />
                    <div className="flex gap-2">
                      <button className="t8-btn t8-btn-primary px-3 py-1.5 text-xs">运行</button>
                      <button className="t8-btn px-3 py-1.5 text-xs">取消</button>
                    </div>
                    <div className="flex gap-2">
                      {[
                        ['image', tokens.portImage],
                        ['video', tokens.portVideo],
                        ['audio', tokens.portAudio],
                      ].map(([label, color]) => (
                        <span key={label} className="t8-chip px-2 py-1 text-[10px]" style={{ background: color as string }}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
            {templatesError && <div className="mt-3 text-xs text-amber-400">{templatesError}</div>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="t8-btn t8-btn-primary px-3 py-2 text-xs" onClick={handleApply}>
                <Check size={14} /> 应用
              </button>
              <button className="t8-btn px-3 py-2 text-xs" onClick={handleDuplicate}>
                <Copy size={14} /> 复制
              </button>
              <button className="t8-btn px-3 py-2 text-xs" onClick={handleSave} disabled={saving}>
                <Save size={14} /> 保存
              </button>
              <button className="t8-btn px-3 py-2 text-xs" onClick={() => downloadJson({ ...editor, visuals, music })}>
                <Download size={14} /> 导出
              </button>
              <button className="t8-btn px-3 py-2 text-xs" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> 导入
              </button>
              <button
                className="t8-btn px-3 py-2 text-xs"
                onClick={handleDelete}
                disabled={selectedBuiltIn || saving}
                title={selectedBuiltIn ? '内置模板不可删除' : '删除自定义模板'}
              >
                <Trash2 size={14} /> 删除
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
            <input
              ref={musicFileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a"
              className="hidden"
              onChange={(e) => handleMusicFile(e.target.files?.[0])}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
