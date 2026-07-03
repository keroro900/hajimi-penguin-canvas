function textFromError(error) {
  if (!error) return '';
  const pieces = [
    error.message,
    error.stderr,
    error.output,
    typeof error === 'string' ? error : '',
  ];
  return pieces.filter(Boolean).map(String).join('\n');
}

function firstLine(text) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  return compact.slice(0, 500) || '剪辑导出失败';
}

function classified(code, message, hint) {
  return { code, message, hint };
}

function classifyClipError(error) {
  const text = textFromError(error);
  const lower = text.toLowerCase();
  const message = firstLine(text);

  if (
    /素材不存在|no such file or directory|enoent|cannot find the file|找不到/.test(lower)
  ) {
    return classified(
      'missing-media',
      message,
      '请确认剪辑台里的图片、视频或音频素材仍在本地可访问，必要时重新导入素材后再导出。',
    );
  }

  if (/超时|timeout|timed out|sigkill/.test(lower)) {
    return classified(
      'ffmpeg-timeout',
      message,
      '导出耗时超过限制。可先缩短项目时长、降低素材分辨率，或稍后重试。',
    );
  }

  if (
    /no such filter|filter not found|option not found|error initializing.*filter|invalid argument/.test(lower)
  ) {
    return classified(
      'unsupported-filter',
      message,
      '当前 ffmpeg 不支持某个滤镜或特效参数。请先关闭最近添加的滤镜、转场或文字特效后重试。',
    );
  }

  if (
    /unknown encoder|encoder .*not found|requested output format|error while opening encoder|libx264|aac/.test(lower)
  ) {
    return classified(
      'encoder-missing',
      message,
      '当前 ffmpeg 编码器不可用。请检查内置 ffmpeg 是否完整，或更换为支持 libx264/aac 的 ffmpeg。',
    );
  }

  if (
    /aout|audio|音频|stream specifier.*matches no streams|matches no streams|no such stream/.test(lower)
  ) {
    return classified(
      'audio-stream',
      message,
      '音频流生成失败。请检查音频素材是否可读；如果项目没有音频，可尝试添加静音轨或移除异常音频片段。',
    );
  }

  return classified(
    'unknown-render-error',
    message,
    '导出失败但未识别出具体原因。请检查素材格式、滤镜设置和 ffmpeg 输出日志。',
  );
}

module.exports = {
  classifyClipError,
};
