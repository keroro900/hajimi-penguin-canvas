export const CODEX_MODEL_OPTIONS = [
  { value: 'default', label: '默认模型', hint: '跟随本机 Codex CLI / profile 配置' },
  { value: 'gpt-5.5', label: 'GPT-5.5（推荐）', hint: '官方推荐：复杂编码、电脑使用、知识工作和研究流程优先。' },
  { value: 'gpt-5.4', label: 'GPT-5.4', hint: '适合高质量创作规划、复杂推理和较长任务。' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini（快速）', hint: '官方建议用于更快、成本更低的轻量任务或子 Agent。' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark（预览）', hint: '研究预览模型，适合近实时迭代；通常需要 Pro 权限。' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex（旧版）', hint: 'Codex 旧模型；官方已提示 ChatGPT 登录下不推荐继续使用。' },
  { value: 'gpt-5.2', label: 'GPT-5.2（旧版）', hint: 'Codex 旧模型；保留给已有 API/脚本兼容。' },
  { value: 'custom', label: '自定义模型', hint: '手动填写任意 Codex CLI 支持的模型 ID' },
];

export type CodexModelMode = typeof CODEX_MODEL_OPTIONS[number]['value'];
