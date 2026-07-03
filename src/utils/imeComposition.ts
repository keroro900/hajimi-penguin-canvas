export interface ImeAsciiLeakCandidate {
  start: number;
  end: number;
  data: string;
}

export interface StripLeadingImeAsciiLeakInput {
  beforeText: string;
  afterText: string;
  caret: number;
  candidate: ImeAsciiLeakCandidate | null;
}

export interface StripLeadingImeAsciiLeakResult {
  text: string;
  caretDelta: number;
  changed: boolean;
}

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

export function stripLeadingImeAsciiLeak({
  beforeText,
  afterText,
  caret,
  candidate,
}: StripLeadingImeAsciiLeakInput): StripLeadingImeAsciiLeakResult {
  const inferredCandidate = candidate || inferLeadingLeakCandidate(beforeText, afterText, caret);
  if (!inferredCandidate || !/^[A-Za-z]$/.test(inferredCandidate.data)) {
    return { text: afterText, caretDelta: 0, changed: false };
  }
  const start = Math.max(0, Math.min(afterText.length, inferredCandidate.start));
  const end = Math.max(start, Math.min(afterText.length, inferredCandidate.end));
  if (end - start !== 1 || afterText.slice(start, end) !== inferredCandidate.data) {
    return { text: afterText, caretDelta: 0, changed: false };
  }
  if (beforeText.slice(start, end) === inferredCandidate.data) {
    return { text: afterText, caretDelta: 0, changed: false };
  }
  const following = afterText.slice(end, Math.max(end + 1, caret));
  if (!CJK_RE.test(following)) {
    return { text: afterText, caretDelta: 0, changed: false };
  }
  return {
    text: `${afterText.slice(0, start)}${afterText.slice(end)}`,
    caretDelta: -1,
    changed: true,
  };
}

function inferLeadingLeakCandidate(
  beforeText: string,
  afterText: string,
  caret: number,
): ImeAsciiLeakCandidate | null {
  let prefix = 0;
  const maxPrefix = Math.min(beforeText.length, afterText.length);
  while (prefix < maxPrefix && beforeText[prefix] === afterText[prefix]) prefix += 1;

  let beforeSuffix = beforeText.length;
  let afterSuffix = afterText.length;
  while (
    beforeSuffix > prefix &&
    afterSuffix > prefix &&
    beforeText[beforeSuffix - 1] === afterText[afterSuffix - 1]
  ) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }

  const inserted = afterText.slice(prefix, afterSuffix);
  if (!/^[A-Za-z][\u3400-\u9fff\uf900-\ufaff]/.test(inserted)) return null;
  if (caret > 0 && prefix >= caret) return null;
  return { start: prefix, end: prefix + 1, data: inserted[0] };
}
