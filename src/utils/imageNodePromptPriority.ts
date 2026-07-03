export interface ImageNodePromptPriorityInput {
  upstreamPrompt?: string;
  localPrompt?: string;
  comfyPrompt?: string;
  isComfyExternal?: boolean;
}

function cleanPrompt(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveImageNodeFinalPrompt(input: ImageNodePromptPriorityInput): string {
  const localPrompt = cleanPrompt(input.localPrompt);
  const comfyPrompt = cleanPrompt(input.comfyPrompt);
  const upstreamPrompt = cleanPrompt(input.upstreamPrompt);
  const ownPrompt = input.isComfyExternal ? (comfyPrompt || localPrompt) : localPrompt;
  return (ownPrompt || upstreamPrompt).trim();
}
