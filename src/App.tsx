import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, Wifi, WifiOff, Sparkles, Cloud, Library, Palette, Skull, Sailboat, Shield, Crown, Terminal } from 'lucide-react';
import { useThemeStore } from './stores/theme';
import { seedDragonBallRadarForShenronTest, useDragonBallRadarStore } from './stores/dragonBallRadar';
import { seedSaintSeiyaGoldClothsForHadesTest, useSaintSeiyaSanctuaryStore } from './stores/saintSeiyaSanctuary';
import { trackAchievementEvent } from './stores/achievements';
import { useApiKeysStore } from './stores/apiKeys';
import { useShortcutStore } from './stores/shortcuts';
import Sidebar from './components/Sidebar';
import type { AddNodeFn, InsertWorkflowFn } from './components/Canvas';
import AppUpdaterButton from './components/AppUpdaterButton';
import MaterialContextMenu from './components/MaterialContextMenu';
import ErrorBoundary from './components/ErrorBoundary';
import AchievementButton from './components/AchievementButton';
import AchievementCeremonyLayer from './components/AchievementCeremonyLayer';
import AchievementDrawer from './components/AchievementDrawer';
import AchievementToast from './components/AchievementToast';
import AchievementTracker from './components/AchievementTracker';
import CodexAgentSidebar from './components/CodexAgentSidebar';
import { RHToolsProvider } from './providers/RHToolsProvider';
import * as api from './services/api';
import { getCodexCliStatus } from './services/codexCli';
import type { NodeType } from './types/canvas';
import type { ResourceItem } from './services/api';
import { applyThemeTemplate } from './theme/applyTheme';
import { resolveThemeTemplate } from './theme/defaultTemplates';
import { materialSetItemsToData, type MaterialSetKind, type MaterialSetItem } from './utils/materialSet';
import { workflowManifestToFragment } from './utils/workflowResource';
import { matchesAnyShortcut } from './utils/keyboardShortcuts';
import { portraitResourceToNodeData } from './utils/portraitResource';
import { applyUiFontPreference } from './utils/uiFont';
import { LocalModalSlot, LocalTopbarSlot } from 'virtual:t8-local-extensions';

const Canvas = lazy(() => import('./components/Canvas'));
const ApiSettingsModal = lazy(() => import('./components/ApiSettings'));
const ResourceLibraryDrawer = lazy(() => import('./components/ResourceLibraryDrawer'));
const ThemeTemplateManager = lazy(() => import('./components/ThemeTemplateManager'));

// vite.config 注入的编译期常量（与 package.json 同步），勿硬编码 v1.x.x
declare const __APP_VERSION__: string;

function isShortcutTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 't8-sidebar-collapsed';

function readSidebarCollapsedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
}

function poseBackupToNodeData(value: unknown): Record<string, any> | null {
  const raw = value && typeof value === 'object' ? (value as Record<string, any>) : null;
  const backup = raw?.schema === 't8-pose-master-resource' ? raw.poseBackup : raw;
  if (!backup || typeof backup !== 'object' || (backup as any).schema !== 't8-pose-master') return null;
  const pose = backup as Record<string, any>;
  const people = Array.isArray(pose.people)
    ? pose.people
    : pose.hasPeople === false
      ? []
      : pose.points
        ? [pose.points]
        : [];
  const prompt = typeof pose.prompt === 'string' ? pose.prompt : '';
  return {
    kind: 'pose-master',
    posePoints: pose.points,
    posePointVersion: Number(pose.pointVersion) || 4,
    poseHasPeople: pose.hasPeople !== false,
    posePeople: people,
    poseActivePersonIndex: 0,
    poseHandControls: pose.handControls,
    posePresetId: typeof pose.presetId === 'string' ? pose.presetId : 'standing',
    poseViewId: typeof pose.viewId === 'string' ? pose.viewId : 'front',
    poseShotId: typeof pose.shotId === 'string' ? pose.shotId : 'full-body',
    poseIntensityId: typeof pose.intensityId === 'string' ? pose.intensityId : 'natural',
    poseLanguage: pose.language === 'zh' ? 'zh' : 'en',
    poseCustomText: typeof pose.custom === 'string' ? pose.custom : '',
    poseCanvasRatioId: typeof pose.canvasRatioId === 'string' ? pose.canvasRatioId : 'default',
    poseCanvasCustomWidth: Number(pose.canvasCustomWidth) || 620,
    poseCanvasCustomHeight: Number(pose.canvasCustomHeight) || 520,
    prompt,
    text: prompt,
    outputText: prompt,
    posePrompt: prompt,
    metadata: {
      schema: 't8-pose-master',
      resourceRestoredAt: Date.now(),
      sourceName: typeof pose.name === 'string' ? pose.name : '',
    },
  };
}

async function poseResourceToNodeData(item: ResourceItem): Promise<Record<string, any> | null> {
  if (item.kind !== 'pose' || !item.fileUrl) return null;
  const res = await fetch(item.fileUrl);
  if (!res.ok) throw new Error(`读取姿势资源失败: HTTP ${res.status}`);
  return poseBackupToNodeData(await res.json());
}

async function workflowResourceToFragment(item: ResourceItem) {
  if (item.kind !== 'workflow' || !item.fileUrl) return null;
  const res = await fetch(item.fileUrl);
  if (!res.ok) throw new Error(`读取工作流资源失败: HTTP ${res.status}`);
  return workflowManifestToFragment(await res.json());
}

const CANVAS_TUTORIALS = [
  {
    title: '基础功能教程第一弹1.2.3版',
    bilibili: 'https://www.bilibili.com/video/BV18sG76AE9Y/',
    youtube: 'https://www.youtube.com/watch?v=V8oCBhemmCQ',
  },
  {
    title: '教程第二弹（循环系统，RH超市等）',
    bilibili: 'https://www.bilibili.com/video/BV1CVGx6kEMV/',
    youtube: 'https://www.youtube.com/watch?v=hSpoXclezqw',
  },
  {
    title: '教程第三弹（节点回避算法，资产库，自定义主题等）',
    bilibili: 'https://www.bilibili.com/video/BV1qeVP6kEZi/',
    youtube: 'https://www.youtube.com/watch?v=oJUbD88kvnk',
  },
  {
    title: '教程第四弹（RH主题隐藏模式Red,素材集节点，导演节点三件套，多角度可视化，图像对比，高级版多宫格剪裁）',
    bilibili: 'https://www.bilibili.com/video/BV1gfGm6HERH/',
    youtube: 'https://www.youtube.com/watch?v=9Bn0BjsfwlE',
  },
  {
    title: '教程第五弹（人造人系统，灵魂画手控制系统，无限画布！火影忍者，EVA，幽游白书主题，设计师专属优化多画布及Eagle发送）',
    bilibili: 'https://www.bilibili.com/video/BV1KhVY6MEFP/',
    youtube: 'https://www.youtube.com/watch?v=_lmRmlPZ2y0',
  },
  {
    title: '教程第六弹（灌篮高手主题上线！新Red隐藏模式，姿势大师节点，全新交互及连线方式）',
    bilibili: 'https://www.bilibili.com/video/BV1RjVZ69En1/',
    youtube: 'https://www.youtube.com/watch?v=pSLqhcpmpn8',
  },
  {
    title: '教程第七弹（即梦CLI调用，Seedance2.0不卡人脸！支持modelscope免费版生成，OpenAI兼容调用，RH超市，画板功能再升级！宫格编辑！新增AI检测消除功能）',
    bilibili: 'https://www.bilibili.com/video/BV18eVz68ENs/',
    youtube: 'https://www.youtube.com/watch?v=PQ5rKtOZ-tM',
  },
  {
    title: '教程第八弹（本地Comfyui植入无限画布！超简单超好用！新增足球小将主题，视频解析功能，节点对齐，即梦CLI修复多参，免费版魔搭API Lora支持，素材黏贴新模式，APIKEY导入导出功能）',
    bilibili: 'https://www.bilibili.com/video/BV1ha7R6DES5/',
    youtube: 'https://www.youtube.com/watch?v=LViGXsMTFhs',
  },
  {
    title: '教程第九弹（新增3D全景功能及资产库，一键自动更新功能，输入框放大按钮，修复即梦CLI的多参问题，AI去水印节点功能升级，新增聚合解析功能，可获取17个平台无水印视频，优化启动速度，优化画布加载如慢加载，支持自定义快捷键设置）',
    bilibili: 'https://www.bilibili.com/video/BV1gSEA6GEDQ/',
    youtube: 'https://www.youtube.com/watch?v=-nmX9oB-MX',
  },
  {
    title: '教程第十弹（3D全景功能增强，Figma联动，支持阿里云Oss及腾讯云Cos，新增放置栏，修正新香蕉的模型映射，上传素材的上限从10M到20M，新增veo-omni模型，新增提示词模板系统及增强功能，comfyui支持remote模式，新增newapi分组令牌高级模式，LLM/VISIOIN节点支持流式删除，分类独立APIKEY支持删除功能，新增画布教程模块，支持上游文本联动生成节点@模式，即梦CLI模型补全，素材支持直接拖到浏览器外文件夹）',
    bilibili: 'https://www.bilibili.com/video/BV1N9Eg6QEHs/',
    youtube: 'https://www.youtube.com/watch?v=zIW7PbEWQAs',
  },
  {
    title: '教程第十一弹（新增圣斗士星矢双主题，加强本地comfyui节点和参数解析，修复不支持LIST的问题，新增画布内图片素材按鼠标左右键拖动到文件夹，新增Fal超市功能，新增grok agent节点，含创作台和简易版，新增3D素材上传和预览功能）',
    bilibili: 'https://www.bilibili.com/video/BV1gGEz6VEDA/',
    youtube: 'https://www.youtube.com/watch?v=oRT59Qf65KY',
  },
  {
    title: '教程第十二弹（grok agent的节点修复图生视频功能，新增视频延展及视频编辑功能，新增codex cli agent节点，简约模式和创作台模式，新增Codex生图工作台节点，新增自定义快捷圆盘，FAL超市新增10多个新模型，视频节点新增3个grok video 1.5模型，解锁成就系统所有隐藏模式的奖励影片，新增俄罗斯方块主题及小游戏）',
    bilibili: 'https://www.bilibili.com/video/BV1phJs6oE2g/',
    youtube: 'https://www.youtube.com/watch?v=BKV8YA-kKK4',
  },
  {
    title: '教程第十三弹（新增牧场物语主题及养成游戏，放置栏可收缩，修复侧边栏按钮常驻BUG，3D全景节点新增2:1尺寸，修复部分用户无法新增资源库分类，新增画板及图像编辑功能shift正圆，正方形及实心素材，抠图功能等，新增chrome插件支持任意网络图像反推生成并发送画布，新增跨画布完成通知，优化comfyui节点，新增自定义系统字体，支持agens apikey多模态模型免费使用，新增历史记录）',
    bilibili: 'https://www.bilibili.com/video/BV1tYjy6jEuG/',
    youtube: 'https://www.youtube.com/watch?v=AH24lGHA9E0',
  },
  {
    title: '教程第十四弹（新增VibeX联动发送功能及节点，增强chrome反推插件（需更新安装，支持vibex以及修复反推发送问题），修复ID连线方式，新增区域连线方式，新增目标框节点，重写画布底层大幅度优化节点太多卡顿问题，图像编辑模式画板新增标签改图功能，全局去掉字体模糊效果，批量素材节点完善扩图，高清放大，抠图等功能（需填写RH APIKEY））',
    bilibili: 'https://www.bilibili.com/video/BV1mj7h6CEYx/',
    youtube: 'https://www.youtube.com/watch?v=wCOoTtuxQPM',
  },
];

function InfiniteCanvasBootLoading() {
  return (
    <div className="t8-boot-screen" role="status" aria-label="正在打开画布工作台">
      <img className="t8-boot-art" src="/infinite-canvas-loading.png" alt="" aria-hidden="true" />
      <div className="t8-boot-progress-shell" aria-hidden="true">
        <span className="t8-boot-progress-label">正在启动...</span>
        <div className="t8-boot-progress-track">
          <span className="t8-boot-progress-fill" />
          <span className="t8-boot-progress-spark" />
        </div>
        <span className="t8-boot-progress-percent">Loading</span>
      </div>
    </div>
  );
}

/**
 * T8-penguin-canvas 应用根组件 (Phase 1)
 * 布局: [侧边栏(画布管理 + 节点列表)] [画布主体] + 头部状态栏
 */
function App() {
  const {
    theme,
    style,
    templateId,
    customTemplates,
    uiFontPreset,
    customUiFont,
    toggleTheme,
    loadCustomTemplates,
  } = useThemeStore();
  const { load: loadSettings } = useApiKeysStore();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const currentTemplate = useMemo(
    () => resolveThemeTemplate(templateId, customTemplates),
    [templateId, customTemplates],
  );
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [codexStatus, setCodexStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [codexStatusDetail, setCodexStatusDetail] = useState('正在检测 Codex CLI');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const [codexSidebarOpen, setCodexSidebarOpen] = useState(false);
  const [themeManagerOpen, setThemeManagerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  // 画布接收节点添加的 ref(从 Sidebar -> Canvas)
  const addNodeRef = useRef<AddNodeFn | null>(null);
  const insertWorkflowRef = useRef<InsertWorkflowFn | null>(null);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  useEffect(() => {
    if (!resourceOpen) return;

    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest('.t8-topbar') ||
        target.closest('.resource-library-drawer') ||
        target.closest('.codex-agent-sidebar') ||
        target.closest('[data-canvas-floating-ui]') ||
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__edge') ||
        target.closest('.react-flow__controls') ||
        target.closest('.react-flow__minimap') ||
        target.closest('.t8-control-rail')
      ) {
        return;
      }

      setResourceOpen(false);
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    };
  }, [resourceOpen]);

  // 将主题状态注入 <html> 供 CSS 选择器使用
  useEffect(() => {
    const root = document.documentElement;
    applyThemeTemplate(currentTemplate, theme);
    applyUiFontPreference(root, uiFontPreset, customUiFont);
    // 全局禁用拼写检查(节点提示词为中文/@变量语法,不需红色波浪线干扰)
    // spellcheck 属性 HTML 标准上是可继承的 → 根上设一次,所有后代 textarea/input 都生效
    root.setAttribute('spellcheck', 'false');
    document.body.setAttribute('spellcheck', 'false');
  }, [currentTemplate, customUiFont, theme, uiFontPreset]);

  // 全局 MutationObserver: 为动态挂载的 textarea / input 自动设置 spellcheck=false
  // (Chromium 对 textarea 默认 spellcheck=true,不会从祖先继承 → 需逐个设置)
  //
  // 同时：全局为所有 textarea / input / select 添加 `nodrag` + `nowheel` className
  // — xyflow v12 识别 `nodrag` 后不触发节点拖动，避免「框选文字时整个节点跟着鼠标走」
  // — `nowheel` 让 textarea 内部可独立滚轮滚动，不被 xyflow 接管为画布缩放
  // — 不覆盖节点原有 className(classList.add 只追加)，零侵入
  useEffect(() => {
    const apply = (el: Element) => {
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
        if (tag !== 'SELECT') {
          el.setAttribute('spellcheck', 'false');
          el.setAttribute('autocorrect', 'off');
          el.setAttribute('autocapitalize', 'off');
        }
        // xyflow noDragClassName / noWheelClassName 默认 'nodrag' / 'nowheel'
        // 加上后该元素上的 pointerdown 不会被 xyflow 当作节点拖拽启动
        el.classList.add('nodrag', 'nowheel');
      }
    };
    // 初始扫描
    document.querySelectorAll('textarea, input, select').forEach(apply);
    // 增量监听
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          apply(el);
          el.querySelectorAll?.('textarea, input, select').forEach(apply);
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

  useEffect(() => {
    const check = async () => {
      try {
        const status = await getCodexCliStatus();
        setCodexStatus(status.available ? 'ok' : 'error');
        setCodexStatusDetail(status.message || status.authStatus || status.version || (status.available ? 'Codex CLI 可用' : 'Codex CLI 不可用'));
      } catch {
        setCodexStatusDetail('Codex CLI 状态接口不可用，请确认后端已启动并加载 /api/codex-cli。');
        setCodexStatus('error');
      }
    };
    check();
    const t = window.setInterval(check, 15_000);
    return () => window.clearInterval(t);
  }, []);

  // 预加载 settings
  useEffect(() => {
    loadSettings();
    loadCustomTemplates();
  }, [loadSettings, loadCustomTemplates]);

  // 资源库快捷键：未选中任何节点时打开 / 关闭资源库。输入框内不拦截，避免打断提示词编辑。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matchesAnyShortcut(shortcuts['global.resource-library'], e)) return;
      if (e.repeat) return;
      if (isShortcutTypingTarget(e.target)) return;
      if (document.querySelector('.react-flow__node.selected')) return;
      e.preventDefault();
      setResourceOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  // 侧边栏快捷键：H 隐藏 / 恢复左侧栏。输入框内不拦截，避免影响 Prompt 和搜索。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matchesAnyShortcut(shortcuts['global.sidebar-toggle'], e)) return;
      if (e.repeat) return;
      if (isShortcutTypingTarget(e.target)) return;
      e.preventDefault();
      toggleSidebarCollapsed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts, toggleSidebarCollapsed]);

  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const isOp = currentTemplate.visuals?.style === 'op';
  const isRh = currentTemplate.visuals?.style === 'rh';
  const isNaruto = currentTemplate.visuals?.style === 'naruto';
  const isEva = currentTemplate.visuals?.style === 'eva';
  const isYyh = currentTemplate.visuals?.style === 'yyh';
  const isSlamdunk = currentTemplate.visuals?.style === 'slamdunk';
  const isSoccer = currentTemplate.visuals?.style === 'soccer-hero';
  const isDragonBall = currentTemplate.visuals?.style === 'dragon-ball';
  const isSaintSeiya = currentTemplate.visuals?.style === 'saint-seiya';
  const shenronUnlockedAt = useDragonBallRadarStore((state) => state.shenronUnlockedAt);
  const shenronModeActive = useDragonBallRadarStore((state) => state.shenronModeActive);
  const setShenronModeActive = useDragonBallRadarStore((state) => state.setShenronModeActive);
  const hadesUnlockedAt = useSaintSeiyaSanctuaryStore((state) => state.hadesUnlockedAt);
  const hadesModeActive = useSaintSeiyaSanctuaryStore((state) => state.hadesModeActive);
  const setHadesModeActive = useSaintSeiyaSanctuaryStore((state) => state.setHadesModeActive);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('t8DragonBalls') !== '6') return;
    seedDragonBallRadarForShenronTest(7);
    params.delete('t8DragonBalls');
    const query = params.toString();
    window.history.replaceState(null, document.title, `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('t8SaintSeiya') !== 'hades') return;
    seedSaintSeiyaGoldClothsForHadesTest();
    params.delete('t8SaintSeiya');
    const query = params.toString();
    window.history.replaceState(null, document.title, `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  const handleDragonBallModeSwitch = (active: boolean) => {
    setShenronModeActive(active);
    if (active && !shenronModeActive) {
      trackAchievementEvent({
        type: 'hidden_mode.enabled',
        theme: 'dragon-ball',
        kind: 'dragon-ball-shenron',
        mode: 'enabled',
      });
    }
  };

  const handleSaintSeiyaModeSwitch = (active: boolean) => {
    setHadesModeActive(active);
    if (active && !hadesModeActive) {
      trackAchievementEvent({
        type: 'hidden_mode.enabled',
        theme: 'saint-seiya',
        kind: 'saint-seiya-hades',
        mode: 'enabled',
      });
    }
  };

  const handleAddNode = (type: NodeType) => {
    addNodeRef.current?.(type);
  };

  const handleInsertResource = async (item: ResourceItem) => {
    const portraitData = portraitResourceToNodeData(item);
    if (portraitData) {
      addNodeRef.current?.('portrait-master', { data: portraitData });
      void api.updateResourceItem(item.id, { touch: true });
      return;
    }
    if (item.kind === 'pose') {
      const poseData = await poseResourceToNodeData(item);
      if (!poseData) throw new Error('姿势资源格式无效');
      addNodeRef.current?.('pose-master', { data: poseData });
      void api.updateResourceItem(item.id, { touch: true });
      return;
    }
    if (item.kind === 'workflow') {
      const fragment = await workflowResourceToFragment(item);
      if (!fragment) throw new Error('工作流资源格式无效');
      insertWorkflowRef.current?.(fragment, { title: item.title || '工作流' });
      void api.updateResourceItem(item.id, { touch: true });
      return;
    }
    if (item.kind === 'set' && item.materialSetKind && item.materialSetItems?.length) {
      addNodeRef.current?.('material-set', {
        data: materialSetItemsToData(
          item.materialSetKind as MaterialSetKind,
          item.materialSetItems as MaterialSetItem[],
        ),
      });
      return;
    }
    const mediaKind = item.kind === 'panorama' ? 'image' : item.kind;
    const data: Record<string, any> = {
      uploadType: mediaKind,
      fileName: item.title || item.originalName || '资源库素材',
      fileSize: item.size || 0,
      mime: item.mime || '',
    };
    if (mediaKind === 'image') {
      data.imageUrl = item.fileUrl;
    } else if (mediaKind === 'video') {
      data.videoUrl = item.fileUrl;
    } else if (mediaKind === 'audio') {
      data.audioUrl = item.fileUrl;
    }
    addNodeRef.current?.('upload', { data });
  };

  return (
    <RHToolsProvider>
    <AchievementTracker />
    <div
      className={`t8-app-shell h-screen flex flex-col overflow-hidden ${
        isPixel ? '' : isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
      } ${isOp ? 't8-app-shell--op' : ''} ${isRh ? 't8-app-shell--rh' : ''} ${isNaruto ? 't8-app-shell--naruto' : ''} ${isEva ? 't8-app-shell--eva' : ''} ${isYyh ? 't8-app-shell--yyh' : ''} ${isSlamdunk ? 't8-app-shell--slamdunk' : ''} ${isSoccer ? 't8-app-shell--soccer' : ''} ${isDragonBall ? 't8-app-shell--dragon-ball' : ''} ${isSaintSeiya ? 't8-app-shell--saint-seiya' : ''}`}
      style={{ background: 'var(--t8-bg-app)', color: 'var(--t8-text-main)' }}
    >
      {/* 头部状态栏 */}
      <header
        className={`t8-topbar flex items-center justify-between px-4 py-2 border-b ${
          isPixel
            ? 'px-panel'
            : isDark
              ? 'bg-zinc-900 border-white/10'
              : 'bg-white border-black/10'
        }`}
      >
        <div className="flex items-center gap-3">
          {isOp ? (
            <div className="t8-op-brand flex items-center gap-2">
              <span className="t8-op-brand__mark">
                <Skull size={16} />
              </span>
              <div className="min-w-0">
                <h1 className="t8-op-brand__title text-[14px] font-black leading-none">
                  ONE PIECE · 无限画布
                </h1>
                <div className="t8-op-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  GRAND LINE CANVAS
                </div>
              </div>
              <Sailboat className="t8-op-brand__ship" size={15} />
            </div>
          ) : isRh ? (
            <div className="t8-rh-brand flex items-center gap-2">
              <span className="t8-rh-brand__mark">
                <Cloud size={16} />
              </span>
              <div className="min-w-0">
                <h1 className="t8-rh-brand__title text-[14px] font-black leading-none">
                  RH · 无限画布
                </h1>
                <div className="t8-rh-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  RUNNINGHUB WORKSPACE
                </div>
              </div>
            </div>
          ) : isNaruto ? (
            <div className="t8-naruto-brand flex items-center gap-2">
              <span className="t8-naruto-brand__mark" aria-hidden="true">
                <span className="t8-naruto-brand__leaf" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-naruto-brand__title text-[14px] font-black leading-none">
                  火影 · 无限画布
                </h1>
                <div className="t8-naruto-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  SHINOBI CHAKRA CANVAS
                </div>
              </div>
            </div>
          ) : isEva ? (
            <div className="t8-eva-brand flex items-center gap-2">
              <span className="t8-eva-brand__mark" aria-hidden="true">
                <span className="t8-eva-brand__core" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-eva-brand__title text-[14px] font-black leading-none">
                  EVA · 无限画布
                </h1>
                <div className="t8-eva-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  NERV HQ - TOKYO-3 / MAGI SYSTEM ONLINE
                </div>
              </div>
              <span className="t8-eva-brand__sync" aria-hidden="true">SYSTEM STATUS: ONLINE</span>
            </div>
          ) : isYyh ? (
            <div className="t8-yyh-brand flex items-center gap-2">
              <span className="t8-yyh-brand__mark" aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0">
                <h1 className="t8-yyh-brand__title text-[14px] font-black leading-none">
                  幽游白书 · 无限画布
                </h1>
                <div className="t8-yyh-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  SPIRIT DETECTIVE CANVAS / REI MAP ONLINE
                </div>
              </div>
              <span className="t8-yyh-brand__status" aria-hidden="true">REI GUN READY</span>
            </div>
          ) : isSlamdunk ? (
            <div className="t8-slamdunk-brand flex items-center gap-2">
              <span className="t8-slamdunk-brand__mark" aria-hidden="true">
                <span className="t8-slamdunk-brand__ball" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-slamdunk-brand__title text-[14px] font-black leading-none">
                  灌篮高手 · 无限画布
                </h1>
                <div className="t8-slamdunk-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  FULL COURT CANVAS / BUZZER BEATER READY
                </div>
              </div>
              <span className="t8-slamdunk-brand__score" aria-hidden="true">10 : 08 AI</span>
            </div>
          ) : isSoccer ? (
            <div className="t8-soccer-brand flex items-center gap-2">
              <span className="t8-soccer-brand__mark" aria-hidden="true">
                <span className="t8-soccer-brand__jersey" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-soccer-brand__title text-[14px] font-black leading-none">
                  足球小将 · 无限画布
                </h1>
                <div className="t8-soccer-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  CAPTAIN TSUBASA CANVAS / GOLDEN GOAL READY
                </div>
              </div>
              <span className="t8-soccer-brand__score" aria-hidden="true">Japan 3:2 Brazil</span>
            </div>
          ) : isDragonBall ? (
            <div className="t8-dragonball-brand flex items-center gap-2">
              <span className="t8-dragonball-brand__mark" aria-hidden="true">
                <span className="t8-dragonball-brand__orb" />
              </span>
              <div className="min-w-0">
                <h1 className="t8-dragonball-brand__title text-[14px] font-black leading-none">
                  {shenronModeActive ? '神龙模式 · 无限画布' : '七龙珠 · 无限画布'}
                </h1>
                <div className="t8-dragonball-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  {shenronModeActive ? 'SHENRON MODE ONLINE / DRAGON RADAR LOCKED' : 'CAPSULE CORP CANVAS / DRAGON RADAR ONLINE'}
                </div>
              </div>
              <span className="t8-dragonball-brand__stars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </div>
          ) : isSaintSeiya ? (
            <div className="t8-saint-brand flex items-center gap-2">
              <span className="t8-saint-brand__mark" aria-hidden="true">
                {hadesModeActive ? <Crown size={16} /> : <Shield size={16} />}
              </span>
              <div className="min-w-0">
                <h1 className="t8-saint-brand__title text-[14px] font-black leading-none">
                  {hadesModeActive ? '冥界篇 · 无限画布' : '圣斗士 · 十二宫'}
                </h1>
                <div className="t8-saint-brand__sub text-[9px] font-bold tracking-wide leading-none mt-0.5">
                  {hadesModeActive ? 'HADES CHAPTER / ATHENA RESCUED' : 'SANCTUARY CANVAS / COSMO READY'}
                </div>
              </div>
              <span className="t8-saint-brand__zodiac" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          ) : isPixel ? (
            <>
              <h1 className="px-title text-[14px] font-bold tracking-wide leading-none">
                无限画布
              </h1>
            </>
          ) : (
            <h1 className="text-sm font-semibold">无限画布</h1>
          )}
          <span
            className={
              isPixel
                ? 'px-chip px-chip--mint text-[10px]'
                : `t8-topbar-status-chip text-[10px] px-1.5 py-0.5 rounded ${
                    isDark ? 'bg-white/10 text-white/60' : 'bg-black/5 text-zinc-500'
                  }`
            }
          >
            v{__APP_VERSION__}
          </span>
          {isPixel ? (
            <>
              <span className={`px-chip ${backendStatus === 'ok' ? 'px-chip--mint' : backendStatus === 'error' ? 'px-chip--pink' : 'px-chip--yellow'}`}>
                {backendStatus === 'ok' ? <Wifi size={11} /> : <WifiOff size={11} />}
                {backendStatus === 'ok' && '后端已连接'}
                {backendStatus === 'error' && '后端未连接'}
                {backendStatus === 'checking' && '后端检测中'}
              </span>
              <span
                className={`px-chip ${codexStatus === 'ok' ? 'px-chip--mint' : codexStatus === 'error' ? 'px-chip--pink' : 'px-chip--yellow'}`}
                title={codexStatusDetail}
              >
                {codexStatus === 'ok' ? <Terminal size={11} /> : <WifiOff size={11} />}
                {codexStatus === 'ok' && 'Codex已连接'}
                {codexStatus === 'error' && 'Codex未连接'}
                {codexStatus === 'checking' && 'Codex检测中'}
              </span>
            </>
          ) : (
            <>
              {[
                { status: backendStatus, ok: '后端已连接', error: '后端未连接', checking: '后端检测中', icon: 'wifi', detail: '' },
                { status: codexStatus, ok: 'Codex已连接', error: 'Codex未连接', checking: 'Codex检测中', icon: 'terminal', detail: codexStatusDetail },
              ].map((item) => (
                <div
                  key={item.ok}
                  title={item.detail}
                  className={`t8-topbar-status-chip flex items-center gap-1.5 text-[11px] ${
                    item.status === 'ok'
                      ? 'text-emerald-400'
                      : item.status === 'error'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}
                >
                  {item.status === 'ok'
                    ? item.icon === 'terminal' ? <Terminal size={12} /> : <Wifi size={12} />
                    : <WifiOff size={12} />}
                  {item.status === 'ok' && item.ok}
                  {item.status === 'error' && item.error}
                  {item.status === 'checking' && item.checking}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* 主题模板 */}
          <button
            onClick={() => setThemeManagerOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--sm px-btn--pink max-w-[150px]'
                : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isDark
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                      : 'bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100'
                  }`
            }
            title="主题模板"
          >
            <Palette size={14} />
            <span className="text-[11px] truncate">{currentTemplate.name}</span>
          </button>
          {isDragonBall && shenronUnlockedAt && (
            <div className="t8-dragonball-mode-switch" role="group" aria-label="七龙珠主题模式">
              <button
                type="button"
                className={`t8-dragonball-mode-switch__option ${!shenronModeActive ? 'is-active' : ''}`}
                aria-pressed={!shenronModeActive}
                onClick={() => handleDragonBallModeSwitch(false)}
                title="切回七龙珠普通模式"
              >
                七龙珠
              </button>
              <button
                type="button"
                className={`t8-dragonball-mode-switch__option ${shenronModeActive ? 'is-active' : ''}`}
                aria-pressed={shenronModeActive}
                onClick={() => handleDragonBallModeSwitch(true)}
                title="切换到神龙隐藏模式"
              >
                <Sparkles size={12} />
                神龙
              </button>
            </div>
          )}
          {isSaintSeiya && hadesUnlockedAt && (
            <div className="t8-saint-mode-switch" role="group" aria-label="圣斗士主题模式">
              <button
                type="button"
                className={`t8-saint-mode-switch__option ${!hadesModeActive ? 'is-active' : ''}`}
                aria-pressed={!hadesModeActive}
                onClick={() => handleSaintSeiyaModeSwitch(false)}
                title="切回十二宫模式"
              >
                十二宫
              </button>
              <button
                type="button"
                className={`t8-saint-mode-switch__option ${hadesModeActive ? 'is-active' : ''}`}
                aria-pressed={hadesModeActive}
                onClick={() => handleSaintSeiyaModeSwitch(true)}
                title="切换到冥界篇"
              >
                <Sparkles size={12} />
                冥界篇
              </button>
            </div>
          )}
          <LocalTopbarSlot isPixel={isPixel} isDark={isDark} />
          <AchievementButton isPixel={isPixel} isDark={isDark} />
          <button
            onClick={() => setCodexSidebarOpen((open) => !open)}
            className={
              isPixel
                ? 'px-btn px-btn--sm px-btn--mint'
                : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    codexSidebarOpen
                      ? isDark
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : isDark
                        ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        : 'bg-white border-black/10 text-zinc-700 hover:bg-black/5'
                  }`
            }
            title="Codex 侧边栏"
            aria-pressed={codexSidebarOpen}
          >
            <Terminal size={14} />
            <span className="text-[11px]">Codex</span>
          </button>
          <button
            onClick={() => setResourceOpen(true)}
            className={
              isPixel
                ? 'px-btn px-btn--sm px-btn--mint'
                : `flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isDark
                      ? 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/20'
                      : 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-100'
                  }`
            }
            title="资源库"
          >
            <Library size={14} />
            <span className="text-[11px]">资源库</span>
          </button>
          <AppUpdaterButton isPixel={isPixel} isDark={isDark} />
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
      <div
        className={`t8-main-layout flex-1 flex overflow-hidden relative${sidebarCollapsed ? ' t8-main-layout--sidebar-collapsed' : ''}`}
        data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
      >
        {!sidebarCollapsed && <Sidebar onAddNode={handleAddNode} />}
        <button
          type="button"
          className={`t8-sidebar-toggle t8-mini-icon-button${sidebarCollapsed ? ' is-collapsed' : ''}`}
          aria-label={sidebarCollapsed ? '显示侧边栏' : '隐藏侧边栏'}
          title={sidebarCollapsed ? '显示侧边栏 (H)' : '隐藏侧边栏 (H)'}
          aria-pressed={sidebarCollapsed}
          onClick={toggleSidebarCollapsed}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <ErrorBoundary fallbackTitle="画布渲染出错了，已被错误边界捕获">
          <Suspense fallback={<InfiniteCanvasBootLoading />}>
            <Canvas onAddNodeRef={addNodeRef} onInsertWorkflowRef={insertWorkflowRef} />
          </Suspense>
        </ErrorBoundary>
      </div>

      <CodexAgentSidebar open={codexSidebarOpen} onClose={() => setCodexSidebarOpen(false)} />

      {/* API 设置弹窗 */}
      <Suspense fallback={null}>
        {settingsOpen && <ApiSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
        <LocalModalSlot />
        {themeManagerOpen && (
          <ThemeTemplateManager open={themeManagerOpen} onClose={() => setThemeManagerOpen(false)} />
        )}
        {resourceOpen && (
          <ResourceLibraryDrawer
            open={resourceOpen}
            onClose={() => setResourceOpen(false)}
            onInsertMaterial={handleInsertResource}
          />
        )}
      </Suspense>
      <MaterialContextMenu />
      <AchievementDrawer />
      <AchievementCeremonyLayer />
      <AchievementToast />
    </div>
    </RHToolsProvider>
  );
}

export default App;
