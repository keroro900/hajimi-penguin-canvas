import { useEffect, useMemo, useRef, useState } from 'react';
import * as Icons from 'lucide-react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderOpen,
  Loader2,
  PanelLeftClose,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { NODE_GROUPS } from '../../config/nodeRegistry';
import type { NodeMeta, NodeType } from '../../types/canvas';
import { useThemeStore } from '../../stores/theme';
import { useCanvasStore } from '../../stores/canvas';
import { resolveThemeTemplate } from '../../theme/defaultTemplates';
import type { ShellPanelKind } from './AppRail';

const COLOR_HEX: Record<string, string> = {
  sky: '#7dd3fc',
  amber: '#fcd34d',
  rose: '#fda4af',
  fuchsia: '#f0abfc',
  violet: '#c4b5fd',
  emerald: '#6ee7b7',
  cyan: '#67e8f9',
  indigo: '#a5b4fc',
  orange: '#fdba74',
  pink: '#f9a8d4',
  teal: '#5eead4',
  slate: '#cbd5e1',
};

interface ShellPanelProps {
  /** 当前展示的面板；null = 收起（仅显示 44px 轨道） */
  panel: ShellPanelKind | null;
  /** 收起面板（H 快捷键由 App 统一处理） */
  onCollapse: () => void;
  onAddNode: (type: NodeType) => void;
}

/**
 * JIMI AI 外壳面板（Slice 2）—— 停靠在应用轨道与画布之间的可折叠面板。
 * 「节点」视图：可搜索的节点分组列表；「画布」视图：画布切换器。
 * 复用原 Sidebar 的 .t8-sidebar-node / .t8-sidebar-canvas-row 等类名，
 * 保证各主题 CSS 继续生效。
 */
export default function ShellPanel({ panel, onCollapse, onAddNode }: ShellPanelProps) {
  const { theme, style, templateId, customTemplates } = useThemeStore();
  const currentTemplate = useMemo(
    () => resolveThemeTemplate(templateId, customTemplates),
    [templateId, customTemplates],
  );
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [keyword, setKeyword] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 画布管理
  const {
    canvases,
    activeId,
    loading: canvasLoading,
    completionNoticeCanvasIds,
    loadCanvases,
    createCanvas,
    deleteCanvas,
    renameCanvas,
    setActive,
  } = useCanvasStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const completionNoticeSet = useMemo(() => new Set(completionNoticeCanvasIds), [completionNoticeCanvasIds]);

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  // 面板打开时自动聚焦节点搜索框
  useEffect(() => {
    if (panel === 'nodes') {
      searchInputRef.current?.focus();
    }
  }, [panel]);

  const handleCreateCanvas = async () => {
    const name = `画布 ${canvases.length + 1}`;
    await createCanvas(name);
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const submitEdit = async () => {
    if (editingId && editingName.trim()) {
      await renameCanvas(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  const handleDeleteCanvas = async (id: string) => {
    await deleteCanvas(id);
    setConfirmDelete(null);
  };

  const toggle = (key: string) => setCollapsed((s) => ({ ...s, [key]: !s[key] }));

  const renderNode = (n: NodeMeta) => {
    const themedIcon = n.icon;
    const Icon = (Icons as any)[themedIcon] || Icons.Box;
    const colorHex = COLOR_HEX[n.color] || COLOR_HEX.slate;
    return (
      <button
        key={n.type}
        onClick={() => onAddNode(n.type)}
        title={n.description}
        className={`t8-sidebar-node w-full text-left flex items-center gap-2 px-2 py-1.5 transition-colors text-xs ${
          isPixel
            ? 'px-row'
            : `rounded-md ${
                isDark
                  ? 'hover:bg-white/10 text-zinc-200'
                  : 'hover:bg-black/5 text-zinc-800'
              }`
        }`}
      >
        <span
          className={`w-6 h-6 flex items-center justify-center flex-shrink-0 ${
            isPixel ? 'rounded-[6px] border-2' : 'rounded'
          }`}
          style={
            isPixel
              ? {
                  background: colorHex,
                  color: '#1A1410',
                  borderColor: '#1A1410',
                }
              : {
                  background: colorHex + '22',
                  color: colorHex,
                  boxShadow: `inset 0 0 0 1px ${colorHex}55`,
                }
          }
        >
          <Icon size={13} />
        </span>
        <span className="flex-1 min-w-0 truncate">{n.label}</span>
      </button>
    );
  };

  // 搜索过滤
  const filterNodes = (nodes: NodeMeta[]) => {
    if (!keyword.trim()) return nodes;
    const k = keyword.toLowerCase();
    return nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(k) ||
        n.type.toLowerCase().includes(k) ||
        n.description.toLowerCase().includes(k)
    );
  };

  if (!panel) return null;

  const panelTitle = panel === 'nodes' ? '节点' : '画布';

  return (
    <aside
      className={`t8-shell-panel h-full min-h-0 flex flex-col ${
        isPixel
          ? 'px-panel'
          : isDark
            ? 'bg-zinc-900'
            : 'bg-white'
      }`}
      aria-label={panelTitle}
    >
      {/* 面板头部：标题 → 收起 → 新建画布 */}
      <div
        className={`t8-shell-panel__header ${
          isPixel ? '' : isDark ? 'text-white/80' : 'text-zinc-800'
        }`}
      >
        <div className="t8-shell-panel__title flex min-w-0 flex-1 items-center gap-1.5">
          {panel === 'canvases' ? <FolderOpen size={12} /> : null}
          <span className="truncate">{panelTitle}</span>
          {panel === 'canvases' ? (
            <span className="opacity-60 ml-1">{canvases.length}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className={
            isPixel
              ? 'px-btn px-btn--icon px-btn--ghost'
              : `p-1 rounded-md ${
                  isDark
                    ? 'hover:bg-white/10 text-white/70 hover:text-white'
                    : 'hover:bg-black/10 text-zinc-700 hover:text-zinc-900'
                }`
          }
          title="收起面板 (H)"
          aria-label="收起面板"
        >
          <PanelLeftClose size={13} />
        </button>
        {panel === 'canvases' ? (
          <button
            type="button"
            onClick={handleCreateCanvas}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--mint'
                : `p-1 rounded-md ${
                    isDark
                      ? 'hover:bg-white/10 text-white/70 hover:text-white'
                      : 'hover:bg-black/10 text-zinc-700'
                  }`
            }
            title="新建画布"
            aria-label="新建画布"
          >
            <Plus size={13} />
          </button>
        ) : null}
      </div>

      {panel === 'nodes' ? (
        <>
          {/* 搜索框 */}
          <div
            className={`t8-sidebar-search-row p-2 border-b ${
              isPixel ? 'border-[#1A1410]/80' : isDark ? 'border-white/10' : 'border-black/10'
            }`}
          >
            <div
              className={`t8-sidebar-search-box flex items-center gap-2 px-2 py-1.5 ${
                isPixel
                  ? 'px-input rounded-[10px]'
                  : `rounded-md ${isDark ? 'bg-white/5' : 'bg-black/5'}`
              }`}
            >
              <Search size={14} className="opacity-60" />
              <input
                ref={searchInputRef}
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索节点..."
                className={`flex-1 bg-transparent outline-none text-xs ${
                  isPixel
                    ? ''
                    : isDark
                      ? 'text-white placeholder:text-white/30'
                      : 'text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
            </div>
          </div>

          {/* 节点分组列表 */}
          <div className="t8-shell-panel__palette flex-1 min-h-0 overflow-y-auto p-2 space-y-1 scrollbar-hide">
            {Object.entries(NODE_GROUPS).map(([key, group]) => {
              const visible = filterNodes(group.nodes);
              if (visible.length === 0) return null;
              const isCollapsed = collapsed[key];
              return (
                <div key={key} className="mb-1">
                  <button
                    onClick={() => toggle(key)}
                    className={`w-full flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                      isPixel
                        ? 'px-group-title'
                        : isDark
                          ? 'text-white/50 hover:text-white/80'
                          : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span className="flex-1 text-left">{group.label}</span>
                    <span className="opacity-60">{visible.length}</span>
                  </button>
                  {!isCollapsed && <div className="space-y-0.5 mt-0.5">{visible.map(renderNode)}</div>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="t8-shell-panel__canvas-list flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5 scrollbar-hide">
          {canvasLoading && (
            <div
              className={`flex items-center gap-2 px-2 py-2 text-[11px] ${
                isPixel ? '' : isDark ? 'text-white/40' : 'text-zinc-500'
              }`}
            >
              <Loader2 size={12} className="animate-spin" /> 加载中...
            </div>
          )}
          {!canvasLoading && canvases.length === 0 && (
            <div
              className={`text-center py-3 text-[11px] ${
                isPixel ? '' : isDark ? 'text-white/40' : 'text-zinc-500'
              }`}
            >
              <p>还没有画布</p>
              <button
                onClick={handleCreateCanvas}
                className={
                  isPixel
                    ? 'mt-1.5 px-btn px-btn--sm px-btn--mint'
                    : 'mt-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] hover:bg-emerald-500/30'
                }
              >
                + 新建第一个画布
              </button>
            </div>
          )}
          {canvases.map((c) => {
            const isActive = c.id === activeId;
            const isEditing = editingId === c.id;
            const needConfirm = confirmDelete === c.id;
            const hasCompletionNotice = !isActive && completionNoticeSet.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() => !isEditing && setActive(c.id)}
                data-canvas-completion-notice={hasCompletionNotice ? 'true' : undefined}
                className={`t8-sidebar-canvas-row group px-2 py-1 cursor-pointer text-[11px] transition-colors ${
                  isPixel
                    ? `px-row ${isActive ? 'is-active' : ''}`
                    : `rounded-md ${
                        isActive
                          ? isDark
                            ? 'bg-white/10 text-white'
                            : 'bg-black/10 text-zinc-900'
                          : isDark
                            ? 'text-white/70 hover:bg-white/5'
                            : 'text-zinc-700 hover:bg-black/5'
                      }`
                }`}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={submitEdit}
                    className={`w-full px-1.5 py-0.5 rounded text-[11px] outline-none border ${
                      isDark
                        ? 'bg-zinc-800 border-white/20 text-white'
                        : 'bg-white border-black/20'
                    }`}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="t8-sidebar-canvas-title flex min-w-0 items-center gap-1">
                        <span className="truncate font-medium">{c.name}</span>
                        {hasCompletionNotice && (
                          <span
                            className="t8-sidebar-canvas-update-dot"
                            role="img"
                            aria-label="这个画布有新生成完成，切换后自动清除"
                            title="这个画布有新生成完成，切换后自动清除"
                          />
                        )}
                      </div>
                      <div
                        className={`text-[10px] ${
                          isDark ? 'text-white/30' : 'text-zinc-400'
                        }`}
                      >
                        {c.nodeCount} 个节点
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                      {needConfirm ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCanvas(c.id);
                            }}
                            className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                            title="确认删除"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(null);
                            }}
                            className={`p-0.5 rounded ${
                              isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
                            }`}
                          >
                            <X size={11} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(c.id, c.name);
                            }}
                            className={`p-0.5 rounded ${
                              isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
                            }`}
                            title="重命名"
                          >
                            <Edit2 size={10} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(c.id);
                            }}
                            className={`p-0.5 rounded ${
                              isDark
                                ? 'hover:bg-red-500/20 text-red-400'
                                : 'hover:bg-red-100 text-red-600'
                            }`}
                            title="删除"
                          >
                            <Trash2 size={10} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
