export type LayerItemType =
  | 'background'
  | 'product'
  | 'person'
  | 'text'
  | 'logo'
  | 'effect'
  | 'prop'
  | 'shadow'
  | 'unknown';

export type LayerBlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | string;

export interface LayerAgentTextInfo {
  content?: string;
  color?: string;
  fontGuess?: string;
}

export interface LayerAgentItem {
  id: string;
  name: string;
  type: LayerItemType;
  imageUrl?: string;
  bbox?: [number, number, number, number];
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  feather?: number;
  blendMode?: LayerBlendMode;
  editable?: boolean;
  confidence?: number;
  text?: LayerAgentTextInfo;
}

export interface LayerStack {
  id: string;
  sourceImageUrl: string;
  repairedBackgroundUrl?: string;
  previewUrl?: string;
  layers: LayerAgentItem[];
  meta?: {
    provider?: string;
    mode?: string;
    costEstimateCny?: number;
    createdAt?: string;
    pendingProvider?: boolean;
    [key: string]: unknown;
  };
}

export interface LayerAgentDecomposeRequest {
  sourceImageUrl: string;
  mode?: 'lite' | 'standard' | 'pro' | string;
  requestedLayers?: LayerItemType[];
  prompt?: string;
}

export interface LayerAgentDecomposeResult {
  stack: LayerStack;
}
