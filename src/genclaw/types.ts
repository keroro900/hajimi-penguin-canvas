export type GenClawStepId = 'brief' | 'sketch' | 'render' | 'final-review';
export type GenClawStepStatus = 'idle' | 'running' | 'done' | 'error';
export type GenClawSketchKind = 'svg' | 'html';

export interface GenClawStep {
  id: GenClawStepId;
  label: string;
  description: string;
}

export interface GenClawBrief {
  subject: string;
  style: string;
  composition: string;
  palette: string;
  notes: string[];
}

export interface GenClawSketch {
  kind: GenClawSketchKind;
  code: string;
}

export interface GenClawNodeState {
  stepStatus: Record<GenClawStepId, GenClawStepStatus>;
  activeStep?: GenClawStepId;
}

export interface GenClawRenderRequest {
  code: string;
  kind?: GenClawSketchKind;
  width?: number;
  height?: number;
  title?: string;
}

export interface GenClawRenderResult {
  imageUrl: string;
  svgUrl?: string;
  width: number;
  height: number;
  mime: string;
  kind: GenClawSketchKind;
}

