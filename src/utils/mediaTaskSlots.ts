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
