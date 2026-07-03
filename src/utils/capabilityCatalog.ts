import type { CanvasTemplate } from '../config/canvasTemplates';

export type CapabilityCardCategoryId = 'image' | 'video' | 'prompt' | 'storyboard' | 'audio' | 'general';

export interface CapabilityCardCategory {
  id: CapabilityCardCategoryId;
  name: string;
  description: string;
  order: number;
}

export interface CapabilityCardDependencyBadge {
  id: string;
  label: string;
  available: boolean;
  required?: boolean;
}

export interface CapabilityCard {
  id: string;
  title: string;
  description: string;
  categoryId: CapabilityCardCategoryId;
  categoryName: string;
  tags: string[];
  sourceKind: 'canvas-template' | 'fal-manifest' | 'comfyui-manifest' | 'rh-manifest';
  source?: CanvasTemplate['source'] | {
    kind: 'fal-manifest' | 'comfyui-manifest' | 'rh-manifest';
    manifestId?: string;
  };
  dependencyIds: string[];
  dependencyBadges: CapabilityCardDependencyBadge[];
  enabled: boolean;
  disabledReason?: string;
  isFavorite?: boolean;
  recentRank?: number;
  order: number;
  searchText: string;
}

export interface CapabilityCardGroup {
  category: CapabilityCardCategory;
  cards: CapabilityCard[];
}

export interface CapabilityCardSortState {
  favoriteIds?: string[];
  recentIds?: string[];
}

export interface CapabilityCardFilter {
  query?: string;
  categoryId?: CapabilityCardCategoryId | 'all';
}

const CATEGORY_ORDER: CapabilityCardCategory[] = [
  { id: 'image', name: '图像', description: '图像生成、编辑和材质相关模板', order: 10 },
  { id: 'video', name: '视频', description: '视频生成、图生视频和运镜相关模板', order: 20 },
  { id: 'prompt', name: '提示词', description: 'LLM 扩写、提示词整理和文本驱动模板', order: 30 },
  { id: 'storyboard', name: '分镜', description: '多视角、分镜和角色展开模板', order: 40 },
  { id: 'audio', name: '音频', description: '音乐、语音和声音相关模板', order: 50 },
  { id: 'general', name: '通用', description: '未分类的能力卡片', order: 99 },
];

const CATEGORY_MAP = new Map(CATEGORY_ORDER.map((category) => [category.id, category]));

const KNOWN_DEPENDENCIES: Record<string, { label: string; categoryId?: CapabilityCardCategoryId }> = {
  text: { label: 'Text', categoryId: 'prompt' },
  image: { label: 'Image', categoryId: 'image' },
  video: { label: 'Video', categoryId: 'video' },
  audio: { label: 'Audio', categoryId: 'audio' },
  llm: { label: 'LLM', categoryId: 'prompt' },
  'multi-angle-3d': { label: 'Multi-angle 3D', categoryId: 'storyboard' },
  'storyboard-grid': { label: 'Storyboard Grid', categoryId: 'storyboard' },
};

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeCategoryId(value: unknown): CapabilityCardCategoryId {
  const raw = normalizeText(value).toLowerCase();
  if (raw === 'image' || raw === 'video' || raw === 'prompt' || raw === 'storyboard' || raw === 'audio') return raw;
  return 'general';
}

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const value = normalizeText(tag);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

function buildSearchText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function sortByCatalogOrder<T extends { order: number; title?: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.order - b.order || String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN'));
}

export function getCapabilityCardCategory(categoryId: CapabilityCardCategoryId | string | undefined): CapabilityCardCategory {
  return CATEGORY_MAP.get(normalizeCategoryId(categoryId)) || CATEGORY_MAP.get('general')!;
}

export function buildLocalTemplateCapabilityCards(
  templates: CanvasTemplate[],
  options: { availableDependencyIds?: string[] } = {},
): CapabilityCard[] {
  const checksAvailability = Array.isArray(options.availableDependencyIds);
  const available = new Set((options.availableDependencyIds || []).map((id) => normalizeText(id)));
  return (Array.isArray(templates) ? templates : []).map((template, index) => {
    const categoryId = normalizeCategoryId(template.category);
    const category = getCapabilityCardCategory(categoryId);
    const dependencyBadges = (template.dependencies || []).map((dependency) => ({
      id: dependency.id,
      label: dependency.label,
      available: checksAvailability ? available.has(dependency.id) : true,
      required: dependency.required !== false,
    }));
    const missingRequired = dependencyBadges.filter((badge) => badge.required !== false && !badge.available);
    const disabledReason = missingRequired.length
      ? `缺少依赖：${missingRequired.map((badge) => badge.label).join('、')}`
      : undefined;
    const searchText = buildSearchText([
      template.id,
      template.name,
      template.description,
      category.name,
      ...(template.tags || []),
      ...(template.dependencies || []).map((dependency) => dependency.label),
      template.source?.recipeTitle,
      template.source?.docPath,
    ]);
    return {
      id: `canvas-template:${template.id}`,
      title: template.name,
      description: template.description,
      categoryId,
      categoryName: category.name,
      tags: cleanTags(template.tags),
      sourceKind: 'canvas-template',
      source: template.source,
      dependencyIds: (template.dependencies || []).map((dependency) => dependency.id),
      dependencyBadges,
      enabled: missingRequired.length === 0,
      disabledReason,
      order: index,
      searchText,
    };
  });
}

export function filterCapabilityCards(cards: CapabilityCard[], filters: CapabilityCardFilter = {}): CapabilityCard[] {
  const query = normalizeText(filters.query).toLowerCase();
  const categoryId = filters.categoryId && filters.categoryId !== 'all' ? normalizeCategoryId(filters.categoryId) : undefined;
  return (Array.isArray(cards) ? cards : []).filter((card) => {
    if (categoryId && card.categoryId !== categoryId) return false;
    if (!query) return true;
    return card.searchText.includes(query);
  });
}

export function groupCapabilityCardsByCategory(cards: CapabilityCard[]): CapabilityCardGroup[] {
  const grouped = new Map<CapabilityCardCategoryId, CapabilityCard[]>();
  for (const card of cards || []) {
    const categoryId = normalizeCategoryId(card.categoryId);
    const list = grouped.get(categoryId) || [];
    list.push(card);
    grouped.set(categoryId, list);
  }
  return CATEGORY_ORDER
    .filter((category) => grouped.has(category.id))
    .map((category) => ({
      category,
      cards: sortByCatalogOrder(grouped.get(category.id) || []),
    }));
}

export function sortCapabilityCardsForLibrary(cards: CapabilityCard[], state: CapabilityCardSortState = {}): CapabilityCard[] {
  const favoriteIds = new Set((state.favoriteIds || []).map((id) => normalizeText(id)));
  const recentIndex = new Map((state.recentIds || []).map((id, index) => [normalizeText(id), index]));
  return (Array.isArray(cards) ? cards : [])
    .map((card) => ({
      ...card,
      isFavorite: favoriteIds.has(card.id),
      recentRank: recentIndex.has(card.id) ? recentIndex.get(card.id)! : undefined,
    }))
    .sort((a, b) => {
      const aFavorite = a.isFavorite ? 1 : 0;
      const bFavorite = b.isFavorite ? 1 : 0;
      if (aFavorite !== bFavorite) return bFavorite - aFavorite;
      const aRecent = a.recentRank == null ? Number.POSITIVE_INFINITY : a.recentRank;
      const bRecent = b.recentRank == null ? Number.POSITIVE_INFINITY : b.recentRank;
      if (aRecent !== bRecent) return aRecent - bRecent;
      const aEnabled = a.enabled ? 1 : 0;
      const bEnabled = b.enabled ? 1 : 0;
      if (aEnabled !== bEnabled) return bEnabled - aEnabled;
      const aCategoryOrder = getCapabilityCardCategory(a.categoryId).order;
      const bCategoryOrder = getCapabilityCardCategory(b.categoryId).order;
      if (aCategoryOrder !== bCategoryOrder) return aCategoryOrder - bCategoryOrder;
      return a.order - b.order || a.title.localeCompare(b.title, 'zh-Hans-CN');
    });
}

export function getCapabilityCardDisabledReason(card: CapabilityCard): string | undefined {
  return card.disabledReason;
}

export function getCapabilityCardDependencyBadges(card: CapabilityCard): CapabilityCardDependencyBadge[] {
  return card.dependencyBadges;
}

export function getCapabilityCatalogCategoryOrder(): CapabilityCardCategory[] {
  return CATEGORY_ORDER.slice();
}

export function inferDependencyLabel(id: string): string {
  return KNOWN_DEPENDENCIES[normalizeText(id)]?.label || normalizeText(id);
}
