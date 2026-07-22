/**
 * JIMI AI 外观偏好模型（纯逻辑，无 DOM / store 依赖）。
 *
 * - appearancePreference: 用户持久化偏好 'system' | 'light' | 'dark'
 * - theme: 运行时解析结果 'light' | 'dark'，由现有主题管线消费
 *
 * 本文件必须保持可在纯 Node 环境中导入（测试直接 import）。
 */

export type AppearancePreference = 'system' | 'light' | 'dark';

export type ResolvedTheme = 'light' | 'dark';

export interface PersistedAppearanceLike {
  appearancePreference?: unknown;
  theme?: unknown;
}

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * 迁移持久化状态：
 * - 已含合法 appearancePreference → 原样保留（'system' / 显式值都继续生效）；
 * - 旧版仅有 theme → 迁移为与该 theme 一致的显式偏好，
 *   保证升级后用户看到的界面不发生突变；
 * - 完全缺失 → 'light'（与 store 的初始 theme 默认值一致）。
 */
export function resolveMigratedPreference(persisted: PersistedAppearanceLike): AppearancePreference {
  if (isAppearancePreference(persisted?.appearancePreference)) {
    return persisted.appearancePreference;
  }
  return persisted?.theme === 'dark' ? 'dark' : 'light';
}

/** 由操作系统 prefers-color-scheme 匹配结果解析运行时主题。 */
export function resolveSystemTheme(matchesDark: boolean): ResolvedTheme {
  return matchesDark ? 'dark' : 'light';
}

/**
 * 顶栏紧凑切换按钮的下一状态：
 * - 当前为 'system' → 切到「当前解析结果」的显式反色（显式化，脱离系统跟随）；
 * - 当前为显式 light/dark → 切到另一个显式值。
 */
export function nextTogglePreference(
  preference: AppearancePreference,
  resolvedTheme: ResolvedTheme,
): AppearancePreference {
  if (preference === 'system') {
    return resolvedTheme === 'dark' ? 'light' : 'dark';
  }
  return preference === 'dark' ? 'light' : 'dark';
}
