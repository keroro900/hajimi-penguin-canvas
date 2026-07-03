export type OutputQuickActionSurface = 'image' | 'video' | 'text' | 'audio';

export type OutputQuickActionId =
  | 'save-resource'
  | 'image-edit'
  | 'grid-edit'
  | 'image-to-video'
  | 'clip-studio'
  | 'director';

export interface OutputQuickAction {
  id: OutputQuickActionId;
  label: string;
  surface: OutputQuickActionSurface;
  enabled: boolean;
  disabledReason?: string;
}

export interface OutputQuickActionOptions {
  surface: OutputQuickActionSurface;
  url?: string;
  text?: string;
  hasImageEditor?: boolean;
  hasGridEditor?: boolean;
  hasImageToVideo?: boolean;
  hasClipStudio?: boolean;
  hasDirector?: boolean;
}

function action(
  id: OutputQuickActionId,
  label: string,
  options: OutputQuickActionOptions,
  enabled: boolean,
  disabledReason?: string,
): OutputQuickAction {
  return {
    id,
    label,
    surface: options.surface,
    enabled,
    disabledReason: enabled ? undefined : disabledReason,
  };
}

export function buildOutputQuickActions(options: OutputQuickActionOptions): OutputQuickAction[] {
  const hasUrl = typeof options.url === 'string' && options.url.trim().length > 0;
  const hasText = typeof options.text === 'string' && options.text.trim().length > 0;
  const hasImage = options.surface === 'image' && hasUrl;
  const hasVideo = options.surface === 'video' && hasUrl;
  const hasAudio = options.surface === 'audio' && hasUrl;
  const imageActionEnabled = (flag: boolean | undefined) => hasImage && flag !== false;
  const imageActionReason = (flag: boolean | undefined, unavailableReason: string, missingReason = '需要图像素材') =>
    hasImage && flag === false ? unavailableReason : missingReason;

  if (options.surface === 'video') {
    return [
      action('save-resource', '保存资源库', options, hasVideo, '需要视频素材'),
      action('clip-studio', '加入剪辑台', options, hasVideo && options.hasClipStudio !== false, '剪辑台入口暂不可用'),
      action('director', '加入导演台', options, hasVideo && options.hasDirector === true, '导演台入口暂未接入'),
    ];
  }

  if (options.surface === 'audio') {
    return [
      action('save-resource', '保存资源库', options, hasAudio, '需要音频素材'),
      action('clip-studio', '加入剪辑台', options, false, '剪辑台暂不支持音频直送'),
      action('director', '加入导演台', options, options.hasDirector === true, '导演台入口暂未接入'),
    ];
  }

  const resourceEnabled = options.surface === 'image' ? hasImage : hasText && false;
  const resourceReason = options.surface === 'text' ? '文本资源库入口暂未接入' : '需要图像素材';

  return [
    action('save-resource', '保存资源库', options, resourceEnabled, resourceReason),
    action('image-edit', '图像编辑', options, imageActionEnabled(options.hasImageEditor), imageActionReason(options.hasImageEditor, '图像编辑入口暂未接入')),
    action('grid-edit', '宫格编辑', options, imageActionEnabled(options.hasGridEditor), imageActionReason(options.hasGridEditor, '宫格编辑入口暂不可用')),
    action('image-to-video', '图生视频', options, imageActionEnabled(options.hasImageToVideo), imageActionReason(options.hasImageToVideo, '图生视频入口暂不可用')),
    action('clip-studio', '加入剪辑台', options, imageActionEnabled(options.hasClipStudio), imageActionReason(options.hasClipStudio, '剪辑台入口暂不可用', '需要图像或视频素材')),
    action('director', '加入导演台', options, hasImage && options.hasDirector === true, '导演台入口暂未接入'),
  ];
}
