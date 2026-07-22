import { getTemplateMode } from './defaultTemplates';
import { FOUNDATION_CANVAS_BY_MODE, normalizeSolidCanvasColor } from './solidColor';
import type { ThemeMode, ThemeTemplate, ThemeTokens } from './types';

const TOKEN_CSS_MAP: Record<keyof ThemeTokens, string> = {
  appBg: '--t8-bg-app',
  canvasBg: '--t8-bg-canvas',
  panelBg: '--t8-bg-panel',
  panelBgElevated: '--t8-bg-panel-elevated',
  panelBgMuted: '--t8-bg-panel-muted',
  nodeBg: '--t8-bg-node',
  nodeHeaderBg: '--t8-bg-node-header',
  textMain: '--t8-text-main',
  textMuted: '--t8-text-muted',
  textDim: '--t8-text-dim',
  border: '--t8-border',
  borderStrong: '--t8-border-strong',
  accent: '--t8-accent',
  accentHover: '--t8-accent-hover',
  accentText: '--t8-accent-text',
  secondary: '--t8-secondary',
  warning: '--t8-warning',
  danger: '--t8-danger',
  success: '--t8-success',
  shadowPanel: '--t8-shadow-panel',
  shadowButton: '--t8-shadow-button',
  shadowStrong: '--t8-shadow-strong',
  radiusPanel: '--t8-radius-panel',
  radiusButton: '--t8-radius-button',
  radiusNode: '--t8-radius-node',
  gridDot: '--t8-grid-dot',
  edge: '--t8-edge',
  edgeSelected: '--t8-edge-selected',
  selectionBg: '--t8-selection-bg',
  selectionBorder: '--t8-selection-border',
  portText: '--t8-port-text',
  portImage: '--t8-port-image',
  portVideo: '--t8-port-video',
  portAudio: '--t8-port-audio',
  fontFamily: '--t8-font-family',
  displayFont: '--t8-font-display',
};

function applyPixelCompatibility(root: HTMLElement, tokens: ThemeTokens, mode: ThemeMode) {
  root.style.setProperty('--px-bg', tokens.appBg);
  root.style.setProperty('--px-surface', tokens.panelBg);
  root.style.setProperty('--px-muted', tokens.panelBgMuted);
  root.style.setProperty('--px-overlay', mode === 'dark' ? 'rgba(0,0,0,0.72)' : 'rgba(43,27,16,0.42)');
  root.style.setProperty('--px-ink', tokens.textMain);
  root.style.setProperty('--px-ink-soft', tokens.textMuted);
  root.style.setProperty('--px-ink-dim', tokens.textDim);
  root.style.setProperty('--px-mint', tokens.accentHover);
  root.style.setProperty('--px-mint-deep', tokens.accent);
  root.style.setProperty('--px-pink', tokens.secondary);
  root.style.setProperty('--px-pink-deep', tokens.edgeSelected);
  root.style.setProperty('--px-yellow', tokens.warning);
  root.style.setProperty('--px-violet', tokens.portAudio);
  root.style.setProperty('--px-peach', '#f49a52');
  root.style.setProperty('--px-sky', tokens.portText);
  root.style.setProperty('--px-danger', tokens.danger);
  root.style.setProperty('--px-success', tokens.success);
  root.style.setProperty('--px-radius-card', tokens.radiusPanel);
  root.style.setProperty('--px-radius-pill', tokens.radiusButton);
  root.style.setProperty('--px-shadow-hard', tokens.shadowButton);
  root.style.setProperty('--px-shadow-hard-lg', tokens.shadowStrong);
  root.style.setProperty('--px-shadow-press', `1px 1px 0 ${tokens.textMain}`);
  root.style.setProperty('--px-font-display', tokens.fontFamily);
  root.style.setProperty('--px-font-pixel', tokens.displayFont);
}

export function applyThemeTemplate(template: ThemeTemplate, mode: ThemeMode) {
  const root = document.documentElement;
  const activeMode = getTemplateMode(template, mode);
  const tokens = activeMode.tokens;
  const canvasBg = normalizeSolidCanvasColor(tokens.canvasBg, FOUNDATION_CANVAS_BY_MODE[mode]);
  const visuals = template.visuals || {
    style: template.legacyStyle === 'tech' ? 'tech' : 'pixel',
    intensity: 'medium',
    iconPack: 'default',
    canvasPattern: template.legacyStyle === 'tech' ? 'circuit' : 'dots',
    nodeFrame: template.legacyStyle === 'tech' ? 'glass' : 'sticker',
  };

  root.setAttribute('data-theme-template', template.id);
  root.setAttribute('data-theme-style', template.legacyStyle);
  root.setAttribute('data-theme-mode', mode);
  root.setAttribute('data-theme-visual', visuals.style);
  root.setAttribute('data-theme-intensity', visuals.intensity || 'medium');
  root.setAttribute('data-theme-icon-pack', visuals.iconPack || 'default');
  root.setAttribute('data-theme-canvas-pattern', 'none');
  root.setAttribute('data-theme-node-frame', visuals.nodeFrame || 'plain');
  root.style.colorScheme = mode;

  (Object.keys(TOKEN_CSS_MAP) as Array<keyof ThemeTokens>).forEach((key) => {
    if (key === 'canvasBg') return;
    root.style.setProperty(TOKEN_CSS_MAP[key], tokens[key]);
  });
  root.style.setProperty('--t8-bg-canvas', canvasBg);
  root.style.setProperty(
    '--t8-shadow-node',
    tokens.shadowPanel || '0 8px 24px rgba(0, 0, 0, 0.18)',
  );
  root.style.setProperty('--t8-node-bg', 'var(--t8-bg-node)');
  root.style.setProperty('--t8-node-header-bg', 'var(--t8-bg-node-header)');
  root.style.setProperty('--t8-node-shadow', 'var(--t8-shadow-node)');
  root.style.setProperty('--t8-text', 'var(--t8-text-main)');

  if (template.legacyStyle === 'pixel') {
    applyPixelCompatibility(root, tokens, mode);
  }
}
