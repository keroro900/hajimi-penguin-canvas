import type { ApiSettings, DynamicModelCatalog } from '../types/canvas';

export type DynamicModelKind = 'image' | 'video' | 'audio' | 'chat' | 'unknown';

const FIELD_BY_KIND: Record<Exclude<DynamicModelKind, 'unknown'>, keyof NonNullable<ApiSettings['zhenzhenModelCatalog']>> = {
  image: 'imageModels',
  video: 'videoModels',
  audio: 'audioModels',
  chat: 'chatModels',
};

function uniqueModels(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const model = String(value || '').trim();
    if (model && !out.includes(model)) out.push(model);
  }
  return out;
}

export function modelsForCatalogKind(
  catalog: DynamicModelCatalog | null | undefined,
  kind: Exclude<DynamicModelKind, 'unknown'>,
): string[] {
  if (!catalog) return [];
  const overrides = catalog.typeOverrides || {};
  const all = uniqueModels([...(catalog.all || []), ...(catalog.manualModels || [])]);
  const automatic = new Set<string>([
    ...((catalog[FIELD_BY_KIND[kind]] as string[] | undefined) || []),
    ...(catalog.unknownModels || []),
  ]);
  return all.filter((model) => {
    const override = overrides[model];
    if (override) return override === kind || override === 'unknown';
    return automatic.has(model);
  });
}

export function modelsForKind(settings: ApiSettings, kind: Exclude<DynamicModelKind, 'unknown'>): string[] {
  return modelsForCatalogKind(settings.zhenzhenModelCatalog, kind);
}

export function effectiveModelId(savedModel: unknown, models: string[]): string {
  const saved = String(savedModel || '').trim();
  if (saved) return saved;
  return models[0] || '';
}

export function modelSelectOptions(models: string[]) {
  return uniqueModels(models).map((model) => ({ value: model, label: model }));
}
