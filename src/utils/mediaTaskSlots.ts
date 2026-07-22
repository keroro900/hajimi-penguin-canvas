export type MediaTaskSlotStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface MediaTaskSlot {
  index: number;
  status: MediaTaskSlotStatus;
  url?: string;
  urls?: string[];
  taskId?: string;
  error?: string;
}

export interface MediaTaskSlotSummary {
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  done: boolean;
  hasOutput: boolean;
  urls: string[];
}

const normalizeCount = (count: unknown, fallback = 1) => {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
};

const cleanError = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error || '任务失败');
};

const cleanUrls = (urls: unknown): string[] => (
  Array.isArray(urls)
    ? urls.map((url) => String(url || '').trim()).filter(Boolean)
    : [String(urls || '').trim()].filter(Boolean)
);

const MEDIA_TASK_SLOT_STATUSES = new Set<MediaTaskSlotStatus>([
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
]);

export function resolveMediaResultSlots(
  slots: unknown,
  fallbackUrls: unknown,
  maxCount = Number.POSITIVE_INFINITY,
): MediaTaskSlot[] {
  const limit = Number.isFinite(maxCount) ? Math.max(0, Math.floor(maxCount)) : Number.POSITIVE_INFINITY;
  const rawSlots = Array.isArray(slots) ? slots.slice(0, limit) : [];
  if (!rawSlots.length) {
    return cleanUrls(fallbackUrls).slice(0, limit).map((url, index) => ({
      index,
      status: 'success',
      url,
      urls: [url],
    }));
  }

  return rawSlots.map((rawSlot, slotIndex) => {
    const slot = rawSlot && typeof rawSlot === 'object' ? rawSlot as Partial<MediaTaskSlot> : {};
    const urls = cleanUrls(slot.urls);
    const url = cleanUrls(slot.url)[0] || urls[0];
    const rawStatus = String(slot.status || '').trim() as MediaTaskSlotStatus;
    const status = MEDIA_TASK_SLOT_STATUSES.has(rawStatus) ? rawStatus : (url ? 'success' : 'pending');
    const normalized: MediaTaskSlot = {
      index: Number.isFinite(Number(slot.index)) ? Number(slot.index) : slotIndex,
      status,
    };

    if (status === 'success' && url) {
      normalized.url = url;
      normalized.urls = urls.length ? urls : [url];
    }
    const taskId = String(slot.taskId || '').trim();
    if (taskId) normalized.taskId = taskId;
    if (status === 'failed' || status === 'cancelled') {
      normalized.error = String(slot.error || (status === 'cancelled' ? '已停止' : '生成失败'));
    }
    return normalized;
  });
}

export function successfulMediaSlotUrls(slots: unknown): string[] {
  if (!Array.isArray(slots)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const slot of slots) {
    if (!slot || typeof slot !== 'object' || slot.status !== 'success') continue;
    const url = cleanUrls(slot.url)[0];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function createPendingMediaSlots(count: unknown): MediaTaskSlot[] {
  return Array.from({ length: normalizeCount(count) }, (_, index) => ({ index, status: 'pending' as const }));
}

export function markMediaSlotRunning(slots: MediaTaskSlot[], index: number, taskId?: string): MediaTaskSlot[] {
  return updateMediaSlot(slots, index, (slot) => ({
    ...slot,
    status: 'running',
    taskId: taskId || slot.taskId,
    error: undefined,
  }));
}

export function markMediaSlotSuccess(slots: MediaTaskSlot[], index: number, urls: unknown): MediaTaskSlot[] {
  const nextUrls = cleanUrls(urls);
  return updateMediaSlot(slots, index, (slot) => ({
    ...slot,
    status: 'success',
    url: nextUrls[0],
    urls: nextUrls,
    error: undefined,
  }));
}

export function markMediaSlotFailed(slots: MediaTaskSlot[], index: number, error: unknown): MediaTaskSlot[] {
  return updateMediaSlot(slots, index, (slot) => ({
    ...slot,
    status: 'failed',
    error: cleanError(error),
  }));
}

export function markMediaSlotCancelled(slots: MediaTaskSlot[], index: number, reason = '已停止'): MediaTaskSlot[] {
  return updateMediaSlot(slots, index, (slot) => ({
    ...slot,
    status: 'cancelled',
    error: reason,
  }));
}

export function summarizeMediaSlots(slots: MediaTaskSlot[]): MediaTaskSlotSummary {
  const summary: MediaTaskSlotSummary = {
    total: slots.length,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    cancelled: 0,
    done: false,
    hasOutput: false,
    urls: [],
  };

  for (const slot of slots) {
    summary[slot.status] += 1;
    if (slot.status === 'success') {
      const primaryUrl = cleanUrls(slot.url)[0];
      if (primaryUrl) summary.urls.push(primaryUrl);
    }
  }

  summary.hasOutput = summary.urls.length > 0;
  summary.done = slots.length > 0 && summary.pending === 0 && summary.running === 0;
  return summary;
}

function updateMediaSlot(
  slots: MediaTaskSlot[],
  index: number,
  updater: (slot: MediaTaskSlot) => MediaTaskSlot,
): MediaTaskSlot[] {
  return slots.map((slot, slotIndex) => (
    slotIndex === index || slot.index === index
      ? updater({ ...slot, index: Number.isFinite(Number(slot.index)) ? slot.index : slotIndex })
      : { ...slot }
  ));
}
