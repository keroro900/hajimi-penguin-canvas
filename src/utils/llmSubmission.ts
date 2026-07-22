type LlmSubmissionMediaCounts = {
  images: number;
  videos: number;
};

export function resolveLlmSubmissionText(
  upstreamText: string,
  localText: string,
  media: LlmSubmissionMediaCounts,
): string {
  const explicitText = String(upstreamText || localText || '').trim();
  if (explicitText) return explicitText;

  const hasImages = media.images > 0;
  const hasVideos = media.videos > 0;
  if (hasImages && hasVideos) return '请分析并解释所提供的图片和视频内容。';
  if (hasImages) return '请分析并解释所提供的图片内容。';
  if (hasVideos) return '请分析并解释所提供的视频内容。';
  return '';
}
