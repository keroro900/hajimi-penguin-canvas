import type { GenClawNodeState, GenClawStep, GenClawStepId, GenClawStepStatus } from './types.ts';

export const GENCLAW_RECOMMENDED_STEPS: GenClawStep[] = [
  { id: 'brief', label: '构思', description: '把目标、构图、风格和限制整理成可执行 brief。' },
  { id: 'sketch', label: '生成草图', description: '产出白盒 SVG/HTML 草图代码，作为可检查中间层。' },
  { id: 'render', label: '渲染草图', description: '把草图代码转成可接下游生图的图像素材。' },
  { id: 'final-review', label: '成片并审稿', description: '用草图和参考素材生成最终图，并给出简短审稿意见。' },
];

export function createDefaultGenClawState(): GenClawNodeState {
  return {
    stepStatus: {
      brief: 'idle',
      sketch: 'idle',
      render: 'idle',
      'final-review': 'idle',
    },
  };
}

export function markGenClawStep(
  state: GenClawNodeState,
  stepId: GenClawStepId,
  status: GenClawStepStatus,
): GenClawNodeState {
  return {
    ...state,
    activeStep: status === 'running' ? stepId : state.activeStep === stepId ? undefined : state.activeStep,
    stepStatus: {
      ...createDefaultGenClawState().stepStatus,
      ...(state.stepStatus || {}),
      [stepId]: status,
    },
  };
}

export function getNextGenClawStep(state: GenClawNodeState): GenClawStep | null {
  const statuses = { ...createDefaultGenClawState().stepStatus, ...(state.stepStatus || {}) };
  return GENCLAW_RECOMMENDED_STEPS.find((step) => statuses[step.id] !== 'done') || null;
}

export function genClawStepStatusLabel(status: GenClawStepStatus): string {
  if (status === 'running') return '进行中';
  if (status === 'done') return '完成';
  if (status === 'error') return '出错';
  return '待执行';
}

