import MODEL_PROTOCOL_REGISTRY_JSON from '../../shared/modelProtocolRegistry.json' with { type: 'json' };

export type AdvancedProviderModelKind = 'image' | 'video' | 'chat' | 'llm';

export interface ProviderRegistryDisplay {
  modelHint?: string;
  seedanceOpenReminderModels?: string[];
  imageModelPlaceholder?: string;
  videoModelPlaceholder?: string;
}

export interface AdvancedProviderRegistryEntry {
  imageModels?: string[];
  videoModels?: string[];
  chatModels?: string[];
  defaults?: Record<string, string>;
  display?: ProviderRegistryDisplay;
}

export interface ModelRegistryDefaultService {
  imageModelOverrides?: Array<Record<string, string>>;
  videoModelOverrides?: Array<Record<string, string>>;
  imageProtocolOptions?: Array<Record<string, string>>;
  openaiCompatibleImageProtocolOptions?: Array<Record<string, string>>;
  imageRequestProtocols?: Record<string, any>;
  imageAliases?: Record<string, string>;
  gptImage2VariantSizes?: Record<string, string>;
  apishuSeedanceModels?: Record<string, string>;
}

export interface ModelProtocolRegistry {
  advancedProviders: Record<string, AdvancedProviderRegistryEntry>;
  defaultService: ModelRegistryDefaultService;
}

export const MODEL_PROTOCOL_REGISTRY = MODEL_PROTOCOL_REGISTRY_JSON as ModelProtocolRegistry;

export const MODEL_REGISTRY_DEFAULT_SERVICE = MODEL_PROTOCOL_REGISTRY.defaultService || {};

export function advancedProviderRegistry(protocol: string): AdvancedProviderRegistryEntry | null {
  return MODEL_PROTOCOL_REGISTRY.advancedProviders?.[String(protocol || '').trim()] || null;
}

export function registryModelsForProtocol(protocol: string, kind: AdvancedProviderModelKind): string[] {
  const entry = advancedProviderRegistry(protocol);
  const field = kind === 'llm' || kind === 'chat' ? 'chatModels' : `${kind}Models`;
  const values = entry?.[field as keyof AdvancedProviderRegistryEntry];
  return Array.isArray(values) ? [...values] : [];
}

export function registryDefault(protocol: string, key: string, fallback = ''): string {
  const value = advancedProviderRegistry(protocol)?.defaults?.[key];
  return String(value || fallback || '').trim();
}

export function registryDefaultModel(protocol: string, kind: AdvancedProviderModelKind, fallback = ''): string {
  const key = kind === 'llm' || kind === 'chat' ? 'chatModel' : `${kind}Model`;
  return registryDefault(protocol, key, fallback);
}

export function registryDisplay(protocol: string): ProviderRegistryDisplay {
  return advancedProviderRegistry(protocol)?.display || {};
}

