import { Boxes, FolderOpen, Library, Moon, Palette, Settings, Sun, Terminal } from 'lucide-react';
import JimiLogo from '../brand/JimiLogo';
import AppUpdaterButton from '../AppUpdaterButton';
import { LocalTopbarSlot } from 'virtual:t8-local-extensions';

export type ShellPanelKind = 'nodes' | 'canvases';

/** 轨道底部状态点级别：ok=绿（已连接）/ checking=琥珀（降级/检测中）/ error=灰（未连接） */
export type RailStatusLevel = 'ok' | 'checking' | 'error';

interface AppRailProps {
  /** 当前打开的外壳面板；null = 仅显示 44px 轨道 */
  activePanel: ShellPanelKind | null;
  /** 点击顶部「节点 / 画布」入口；再次点击已激活项时由 App 折叠面板 */
  onSelectPanel: (panel: ShellPanelKind) => void;
  /** 打开资源库抽屉 */
  onOpenResource: () => void;
  /** 打开主题模板管理器 */
  onOpenThemeTemplates: () => void;
  /** 切换 Codex Agent 右侧抽屉 */
  onToggleAgent: () => void;
  agentOpen: boolean;
  /** 打开 API 设置弹窗 */
  onOpenSettings: () => void;
  /** 切换深 / 浅主题 */
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
  /** 主题按钮 title（由 App 计算，含「跟随系统」状态） */
  themeTitle: string;
  /** 像素风（透传给更新按钮与本地扩展插槽） */
  isPixel: boolean;
  /** 后端连接状态点级别 */
  backendStatus: RailStatusLevel;
  /** 后端状态点 tooltip（中文状态文案，由 App 计算） */
  backendStatusTitle: string;
  /** Codex CLI 状态点级别 */
  codexStatus: RailStatusLevel;
  /** Codex 状态点 tooltip（中文状态文案 + 详情，由 App 计算） */
  codexStatusTitle: string;
}

/**
 * JIMI AI 应用轨道（Slice 2）—— 44px 常驻左侧竖向导航。
 * 顶部：节点 / 画布 面板入口 + 资源库。
 * 底部（无顶栏布局下承接原顶栏入口）：主题模板 / 自动更新 / Agent / API 设置 /
 * 主题切换，最末为后端与 Codex CLI 的 8px 状态点（绿=已连接，琥珀=检测中，灰=未连接）。
 * 纯展示 + 回调组件，不直接读 store（由 App 接线）。
 */
export default function AppRail({
  activePanel,
  onSelectPanel,
  onOpenResource,
  onOpenThemeTemplates,
  onToggleAgent,
  agentOpen,
  onOpenSettings,
  onToggleTheme,
  theme,
  themeTitle,
  isPixel,
  backendStatus,
  backendStatusTitle,
  codexStatus,
  codexStatusTitle,
}: AppRailProps) {
  const isDark = theme === 'dark';

  return (
    <nav className="t8-app-rail" aria-label="应用导航">
      <div className="t8-app-rail__brand" title="JIMI AI">
        <JimiLogo variant="symbol" size={24} label="JIMI AI" />
      </div>

      <div className="t8-app-rail__section">
        <button
          type="button"
          className={`t8-mini-icon-button t8-app-rail__button${activePanel === 'nodes' ? ' is-active' : ''}`}
          aria-label="节点"
          title="节点 (H 切换面板)"
          aria-pressed={activePanel === 'nodes'}
          onClick={() => onSelectPanel('nodes')}
        >
          <Boxes size={16} />
        </button>
        <button
          type="button"
          className={`t8-mini-icon-button t8-app-rail__button${activePanel === 'canvases' ? ' is-active' : ''}`}
          aria-label="画布"
          title="画布 (H 切换面板)"
          aria-pressed={activePanel === 'canvases'}
          onClick={() => onSelectPanel('canvases')}
        >
          <FolderOpen size={16} />
        </button>
        <button
          type="button"
          className="t8-mini-icon-button t8-app-rail__button"
          aria-label="资源库"
          title="资源库"
          onClick={onOpenResource}
        >
          <Library size={16} />
        </button>
      </div>

      <div className="t8-app-rail__section t8-app-rail__section--bottom">
        <button
          type="button"
          className="t8-mini-icon-button t8-app-rail__button"
          aria-label="主题模板"
          title="主题模板"
          onClick={onOpenThemeTemplates}
        >
          <Palette size={16} />
        </button>
        <AppUpdaterButton isPixel={isPixel} isDark={isDark} rail />
        <button
          type="button"
          className={`t8-mini-icon-button t8-app-rail__button${agentOpen ? ' is-active' : ''}`}
          aria-label="Agent"
          title="Codex 侧边栏"
          aria-pressed={agentOpen}
          onClick={onToggleAgent}
        >
          <Terminal size={16} />
        </button>
        <button
          type="button"
          className="t8-mini-icon-button t8-app-rail__button"
          aria-label="API 设置"
          title="API 设置"
          onClick={onOpenSettings}
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          className="t8-mini-icon-button t8-app-rail__button"
          aria-label="主题切换"
          title={themeTitle}
          onClick={onToggleTheme}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {/* 本地扩展挂载点（默认渲染 null），保留在轨道底部区域 */}
        <LocalTopbarSlot isPixel={isPixel} isDark={isDark} />
        <div className="t8-app-rail__status" aria-label="连接状态">
          <span
            className={`t8-app-rail__status-dot t8-app-rail__status-dot--${backendStatus}`}
            title={backendStatusTitle}
            aria-label={backendStatusTitle}
          />
          <span
            className={`t8-app-rail__status-dot t8-app-rail__status-dot--${codexStatus}`}
            title={codexStatusTitle}
            aria-label={codexStatusTitle}
          />
        </div>
      </div>
    </nav>
  );
}
