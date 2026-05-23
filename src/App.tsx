import { useEffect, useRef, useState } from 'react';
import { Moon, Settings, Sun, Wifi, WifiOff, Sparkles, Cpu, Cloud, ExternalLink, Copy, Check, Gift, Heart } from 'lucide-react';
import { useThemeStore } from './stores/theme';
import { useApiKeysStore } from './stores/apiKeys';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import ApiSettingsModal from './components/ApiSettings';
import ErrorBoundary from './components/ErrorBoundary';
import * as api from './services/api';
import type { NodeType } from './types/canvas';

/**
 * T8-penguin-canvas 应用根组件 (Phase 1)
 * 布局: [侧边栏(画布管理 + 节点列表)] [画布主体] + 头部状态栏
 */
function App() {
  const { theme, style, toggleTheme, toggleStyle } = useThemeStore();
  const { load: loadSettings } = useApiKeysStore();
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 「在线画布」推广浮层开关 + 容器 ref(用于点击外部关闭)
  const [cloudOpen, setCloudOpen] = useState(false);
  const [wxCopied, setWxCopied] = useState(false);
  const cloudWrapRef = useRef<HTMLDivElement>(null);
  // 画布接收节点添加的 ref(从 Sidebar -> Canvas)
  const addNodeRef = useRef<((type: NodeType) => void) | null>(null);

  // 「在线画布」浮层: 点击容器外部 / 按 ESC 自动关闭
  useEffect(() => {
    if (!cloudOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (!cloudWrapRef.current) return;
      if (!cloudWrapRef.current.contains(e.target as Node)) setCloudOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCloudOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [cloudOpen]);

  const handleCopyWx = async () => {
    try {
      await navigator.clipboard.writeText('Lovexy_0222');
      setWxCopied(true);
      window.setTimeout(() => setWxCopied(false), 1600);
    } catch {
      // 兼容: 不支持 clipboard API 时降级 prompt 让用户手动复制
      window.prompt('复制企鹅微信号:', 'Lovexy_0222');
    }
  };

  // 将主题状态注入 <html> 供 CSS 选择器使用
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme-style', style);
    root.setAttribute('data-theme-mode', theme);
    // 全局禁用拼写检查(节点提示词为中文/@变量语法,不需红色波浪线干扰)
    // spellcheck 属性 HTML 标准上是可继承的 → 根上设一次,所有后代 textarea/input 都生效
    root.setAttribute('spellcheck', 'false');
    document.body.setAttribute('spellcheck', 'false');
  }, [style, theme]);

  // 全局 MutationObserver: 为动态挂载的 textarea / input 自动设置 spellcheck=false
  // (Chromium 对 textarea 默认 spellcheck=true,不会从祖先继承 → 需逐个设置)
  useEffect(() => {
    const apply = (el: Element) => {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        el.setAttribute('spellcheck', 'false');
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
      }
    };
    // 初始扫描
    document.querySelectorAll('textarea, input').forEach(apply);
    // 增量监听
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          apply(el);
          el.querySelectorAll?.('textarea, input').forEach(apply);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // 启动探测后端
  useEffect(() => {
    const check = async () => {
      const ok = await api.checkBackendStatus();
      setBackendStatus(ok ? 'ok' : 'error');
    };
    check();
    const t = window.setInterval(check, 15_000);
    return () => window.clearInterval(t);
  }, []);

  // 预加载 settings
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';

  const handleAddNode = (type: NodeType) => {
    addNodeRef.current?.(type);
  };

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden ${
        isPixel
          ? isDark
            ? 'bg-[#1F1A14] text-[#F5EBD7]'
            : 'bg-[#FAF3E7] text-[#1A1410]'
          : isDark
            ? 'bg-zinc-950 text-white'
            : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      {/* 头部状态栏 */}
      <header
        className={`flex items-center justify-between px-4 py-2 border-b ${
          isPixel
            ? 'px-panel'
            : isDark
              ? 'bg-zinc-900 border-white/10'
              : 'bg-white border-black/10'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🐧</span>
          <h1 className={`text-sm font-semibold ${isPixel ? 'px-title' : ''}`}>贞贞的无限画布（企鹅共创版）</h1>
          <span
            className={
              isPixel
                ? 'px-chip px-chip--mint text-[10px]'
                : `text-[10px] px-1.5 py-0.5 rounded ${
                    isDark ? 'bg-white/10 text-white/60' : 'bg-black/5 text-zinc-500'
                  }`
            }
          >
            v1.1.0
          </span>
          {/* 后端状态 */}
          {isPixel ? (
            <span
              className={`px-chip ${
                backendStatus === 'ok'
                  ? 'px-chip--mint'
                  : backendStatus === 'error'
                    ? 'px-chip--pink'
                    : 'px-chip--yellow'
              }`}
            >
              {backendStatus === 'ok' ? <Wifi size={11} /> : <WifiOff size={11} />}
              {backendStatus === 'ok' && '后端已连接'}
              {backendStatus === 'error' && '后端未连接'}
              {backendStatus === 'checking' && '检测中...'}
            </span>
          ) : (
            <div
              className={`flex items-center gap-1.5 text-[11px] ${
                backendStatus === 'ok'
                  ? 'text-emerald-400'
                  : backendStatus === 'error'
                    ? 'text-red-400'
                    : 'text-yellow-400'
              }`}
            >
              {backendStatus === 'ok' ? <Wifi size={12} /> : <WifiOff size={12} />}
              {backendStatus === 'ok' && '后端已连接'}
              {backendStatus === 'error' && '后端未连接'}
              {backendStatus === 'checking' && '检测中...'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* 「在线画布」推广按钮: 与右侧主题/风格按钮同款外观, 点击展开浮层 */}
          <div ref={cloudWrapRef} className="relative">
            <button
              onClick={() => setCloudOpen((v) => !v)}
              className={
                isPixel
                  ? `px-btn px-btn--sm ${cloudOpen ? 'px-btn--mint' : 'px-btn--yellow'}`
                  : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
                      isDark
                        ? cloudOpen
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                        : cloudOpen
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                    }`
              }
              title="云端创作 · 企鹅画布(还送 10 鹅卵石)"
            >
              <Cloud size={14} />
              <span className="text-[11px]">在线画布</span>
            </button>

            {/* 推广浮层 */}
            {cloudOpen && (
              <div
                className={
                  isPixel
                    ? 'absolute right-0 top-full mt-2 z-[60] w-[320px] px-panel p-3 animate-[fadeIn_.18s_ease-out]'
                    : `absolute right-0 top-full mt-2 z-[60] w-[320px] rounded-xl p-3 border shadow-2xl backdrop-blur-md animate-[fadeIn_.18s_ease-out] ${
                        isDark
                          ? 'bg-zinc-900/95 border-emerald-400/20 shadow-emerald-500/10'
                          : 'bg-white/95 border-emerald-200 shadow-emerald-500/10'
                      }`
                }
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* 标题 */}
                <div className={`flex items-center gap-2 ${isPixel ? '' : isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  <Cloud size={16} className={isPixel ? '' : 'shrink-0'} />
                  <span className={`text-sm font-bold ${isPixel ? 'px-title' : ''}`}>云端创作 · 企鹅画布</span>
                </div>

                {/* 副标 + 鹅卵石提示 */}
                <div
                  className={`mt-2 text-[12px] leading-relaxed ${
                    isPixel ? '' : isDark ? 'text-white/80' : 'text-zinc-700'
                  }`}
                >
                  云端也能爽用<span className={isPixel ? 'font-bold' : `font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>企鹅画布</span>～
                  <span
                    className={
                      isPixel
                        ? 'inline-flex items-center gap-1 ml-1 px-chip px-chip--yellow'
                        : `inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'
                          }`
                    }
                  >
                    <Gift size={10} /> 还送 10 鹅卵石
                  </span>
                </div>

                {/* 主行动 CTA: 跳转链接(新窗口) */}
                <a
                  href="https://cloud.pebbling.cn/user/?invite=T8STAR"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCloudOpen(false)}
                  className={
                    isPixel
                      ? 'mt-3 px-btn px-btn--mint w-full justify-center'
                      : `mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold transition-all border ${
                          isDark
                            ? 'bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border-emerald-400/40 text-emerald-200 hover:from-emerald-500/30 hover:to-sky-500/30 hover:border-emerald-400/60 hover:shadow-[0_0_16px_rgba(16,185,129,0.35)]'
                            : 'bg-gradient-to-r from-emerald-500 to-sky-500 border-emerald-600 text-white hover:from-emerald-600 hover:to-sky-600 hover:shadow-lg'
                        }`
                  }
                >
                  <ExternalLink size={13} />
                  <span>立即开通（新窗口打开）</span>
                </a>

                {/* 微信号 + 一键复制 */}
                <div
                  className={`mt-3 rounded-lg p-2 ${
                    isPixel
                      ? 'border-2 border-black bg-[#FFFBF0]'
                      : isDark
                        ? 'bg-white/5 border border-white/10'
                        : 'bg-zinc-50 border border-zinc-200'
                  }`}
                >
                  <div className={`text-[10px] mb-1 ${isPixel ? '' : isDark ? 'text-white/50' : 'text-zinc-500'}`}>
                    加群 · 加企鹅微信
                  </div>
                  <div className="flex items-center gap-2">
                    <code
                      className={`flex-1 text-xs font-mono px-2 py-1 rounded ${
                        isPixel
                          ? 'bg-white border border-black'
                          : isDark
                            ? 'bg-zinc-800 text-emerald-300'
                            : 'bg-white text-emerald-700 border border-zinc-200'
                      }`}
                    >
                      Lovexy_0222
                    </code>
                    <button
                      onClick={handleCopyWx}
                      className={
                        isPixel
                          ? `px-btn px-btn--sm ${wxCopied ? 'px-btn--mint' : 'px-btn--ghost'}`
                          : `flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border ${
                              wxCopied
                                ? isDark
                                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                                  : 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                : isDark
                                  ? 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'
                                  : 'bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-50'
                            }`
                      }
                      title={wxCopied ? '已复制' : '一键复制微信号'}
                    >
                      {wxCopied ? <Check size={11} /> : <Copy size={11} />}
                      <span>{wxCopied ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </div>

                {/* 致谢 */}
                <div
                  className={`mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed ${
                    isPixel ? '' : isDark ? 'text-white/60' : 'text-zinc-500'
                  }`}
                >
                  <Heart
                    size={11}
                    className={`mt-0.5 shrink-0 ${
                      isPixel ? '' : isDark ? 'text-pink-400' : 'text-pink-500'
                    }`}
                  />
                  <span>
                    感谢企鹅在我制作本画布时候的帮助，大家多多支持！<span className="text-base">🐧</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 风格切换(tech ↔ pixel)——两边都带图标+文字,各自风格化 */}
          <button
            onClick={toggleStyle}
            className={
              isPixel
                ? 'px-btn px-btn--sm px-btn--pink'
                : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isDark
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                      : 'bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100'
                  }`
            }
            title={isPixel ? '切换到科技风(默认深色)' : '切换到像素风(默认浅色)'}
          >
            {isPixel ? <Cpu size={14} /> : <Sparkles size={14} />}
            <span className="text-[11px]">{isPixel ? '科技风' : '像素风'}</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
            }
            title="API 设置"
          >
            <Settings size={isPixel ? 14 : 16} />
          </button>
          <button
            onClick={toggleTheme}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
            }
            title={`切换到${isDark ? '浅色' : '深色'}主题`}
          >
            {isDark ? <Sun size={isPixel ? 14 : 16} /> : <Moon size={isPixel ? 14 : 16} />}
          </button>
        </div>
      </header>

      {/* 主体两栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar onAddNode={handleAddNode} />
        <ErrorBoundary fallbackTitle="画布渲染出错了，已被错误边界捕获">
          <Canvas onAddNodeRef={addNodeRef} />
        </ErrorBoundary>
      </div>

      {/* API 设置弹窗 */}
      <ApiSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
