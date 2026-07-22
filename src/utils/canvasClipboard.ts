import { getGroupMemberIds, type GroupMembershipNode } from './groupMembership.ts';

export interface ClipboardPosition {
  x: number;
  y: number;
}

export interface ClipboardPositionNode {
  id?: string;
  type?: string;
  data?: Record<string, unknown> | null;
  position?: Partial<ClipboardPosition>;
  width?: number | null;
  height?: number | null;
  measured?: {
    width?: number | null;
    height?: number | null;
  } | null;
}

export interface SanitizeClipboardNodeDataOptions {
  preserveMediaSnapshots?: boolean;
}

export interface ClipboardNodeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

const finiteNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const TRANSIENT_CLIPBOARD_DATA_KEYS = [
  'status',
  'taskId',
  'requestId',
  'responseUrl',
  'statusUrl',
  'progress',
  'error',
  'isRunning',
  'isPolling',
  'pollingTimer',
  'pollCount',
  'pollStartedAt',
  'lastPollAt',
  'imageTaskIds',
  'pendingTaskIds',
  'videoTaskIds',
  'audioTaskIds',
  'asyncTasks',
  'runningTasks',
  'currentTask',
  'currentRunId',
  'runId',
  'abortController',
  'abortSignal',
];

const MEDIA_SNAPSHOT_CLIPBOARD_NODE_TYPES = new Set([
  'output',
  'video-output',
  'upload',
  'model-3d-upload',
  'material-set',
  'apparel-pack-output',
]);

const GENERATED_RESULT_CLIPBOARD_DATA_KEYS = [
  'imageUrl',
  'imageUrls',
  'generatedImages',
  'remoteImageUrls',
  'imageResultSlots',
  'videoUrl',
  'videoUrls',
  'remoteVideoUrls',
  'videoResultSlots',
  'audioUrl',
  'audioUrl_1',
  'audioUrls',
  'tracks',
  'audioResultSlots',
  'urls',
  'resultUrl',
  'resultUrls',
  'resultVersions',
  'modelUrl',
  'modelUrls',
  'directModelUrl',
  'directModelUrls',
  'outputText',
  'reply',
  'textSegments',
  'segments',
  'texts',
  'directOutputSingleSnapshot',
  'directOutputText',
  'directTextSegments',
  'directImageUrl',
  'directImageUrls',
  'directVideoUrl',
  'directVideoUrls',
  'directAudioUrl',
  'directAudioUrls',
  'lastPrompt',
  'usedI2I',
  'remoteUrls',
  'directorOutputItems',
  'directorOutputRefreshNonce',
  'output',
  'job',
  'thumbnailUrl',
  'randomRouteActiveHandles',
  'randomRouteLastRunAt',
  'randomRouteLastOrder',
  'randomRouteLastOkCount',
  'randomRouteLastFailCount',
];

const NODE_SPECIFIC_RESULT_CLIPBOARD_DATA_KEYS: Record<string, readonly string[]> = {
  relay: ['prompt', 'text'],
  loop: ['prompt', 'text', 'outputs', 'progress'],
  'random-route': [
    'prompt',
    'text',
    'randomRouteActiveHandles',
    'randomRouteLastRunAt',
    'randomRouteLastOrder',
    'randomRouteLastOkCount',
    'randomRouteLastFailCount',
  ],
  'text-split': ['segmentsOverride', 'segmentsOverrideSig'],
  'video-edit': ['output', 'job'],
  'director-storyboard': ['shotResults'],
  'aggregate-parser': ['aggregateParserResult', 'aggregateParserMedia'],
  'batch-processor': ['batchProcessorResults', 'batchProcessorProgress'],
  'layer-agent': ['layerStack', 'selectedLayerId'],
  'panorama-3d': [
    'panoramaGeneratedUrl',
    'panoramaGeneratedHistory',
    'panoramaControlSnapshotUrl',
    'panoramaSceneSnapshot',
    'panoramaStoryboardPromptSnapshotText',
  ],
};

const MODEL_3D_PREVIEW_REFERENCE_KEYS = [
  'modelUrl',
  'modelUrls',
  'directModelUrl',
  'directModelUrls',
] as const;

const cloneClipboardData = (data: unknown): Record<string, any> => {
  if (!data || typeof data !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return { ...(data as Record<string, any>) };
  }
};

const normalizeCopiedImageResultSlots = (slots: unknown) => {
  if (!Array.isArray(slots)) return undefined;
  const successSlots = slots
    .map((slot, index) => {
      const record = slot && typeof slot === 'object' ? slot as Record<string, any> : {};
      const url = String(record.url || '').trim();
      if (!url) return null;
      return {
        status: 'success',
        url,
        index: Number.isFinite(Number(record.index)) ? Number(record.index) : index,
      };
    })
    .filter((slot): slot is { status: 'success'; url: string; index: number } => !!slot);
  return successSlots.length > 0 ? successSlots : undefined;
};

const pickClipboardDataKeys = (data: Record<string, any>, keys: readonly string[]) => {
  const picked: Record<string, any> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) picked[key] = data[key];
  }
  return picked;
};

export function sanitizeClipboardNodeData(
  data: unknown,
  nodeType?: string,
  options: SanitizeClipboardNodeDataOptions = {},
): Record<string, any> {
  const next = cloneClipboardData(data);
  for (const key of TRANSIENT_CLIPBOARD_DATA_KEYS) delete next[key];

  const preserveMediaSnapshots = options.preserveMediaSnapshots !== false;
  const shouldClearResultFields = Boolean(
    nodeType && (!preserveMediaSnapshots || !MEDIA_SNAPSHOT_CLIPBOARD_NODE_TYPES.has(nodeType)),
  );
  if (shouldClearResultFields) {
    const preservedReferenceFields = nodeType === 'model-3d-preview'
      ? pickClipboardDataKeys(next, MODEL_3D_PREVIEW_REFERENCE_KEYS)
      : {};
    for (const key of GENERATED_RESULT_CLIPBOARD_DATA_KEYS) delete next[key];
    for (const key of NODE_SPECIFIC_RESULT_CLIPBOARD_DATA_KEYS[nodeType as string] || []) delete next[key];
    Object.assign(next, preservedReferenceFields);
  } else {
    const imageResultSlots = normalizeCopiedImageResultSlots((data as Record<string, any> | null | undefined)?.imageResultSlots);
    if (imageResultSlots) {
      next.imageResultSlots = imageResultSlots;
    } else {
      delete next.imageResultSlots;
    }
  }

  next.status = 'idle';
  return next;
}

const readNodeSize = (node: ClipboardPositionNode) => ({
  width: finiteNumber(node.width, finiteNumber(node.measured?.width, finiteNumber(node.data?.width, 0))),
  height: finiteNumber(node.height, finiteNumber(node.measured?.height, finiteNumber(node.data?.height, 0))),
});

const rectForClipboardNode = (node: ClipboardPositionNode) => {
  const x = finiteNumber(node.position?.x, 0);
  const y = finiteNumber(node.position?.y, 0);
  const size = readNodeSize(node);
  return { x, y, width: size.width, height: size.height };
};

export function getClipboardNodeBounds(nodes: ClipboardPositionNode[]): ClipboardNodeBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  nodes.forEach((node) => {
    const rect = rectForClipboardNode(node);
    const { x, y } = rect;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + rect.width);
    maxY = Math.max(maxY, y + rect.height);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2,
  };
}

export function positionClipboardNodesAtAnchor<T extends ClipboardPositionNode>(
  nodes: T[],
  anchor: ClipboardPosition,
): T[] {
  const bounds = getClipboardNodeBounds(nodes);
  const dx = anchor.x - bounds.minX;
  const dy = anchor.y - bounds.minY;
  return offsetClipboardNodes(nodes, { x: dx, y: dy });
}

export function offsetClipboardNodes<T extends ClipboardPositionNode>(
  nodes: T[],
  offset: ClipboardPosition,
): T[] {
  return nodes.map((node) => ({
    ...node,
    position: {
      x: finiteNumber(node.position?.x, 0) + offset.x,
      y: finiteNumber(node.position?.y, 0) + offset.y,
    },
  }));
}

export function getClipboardGroupMemberIds(
  groupNode: ClipboardPositionNode,
  sourceNodes: ClipboardPositionNode[],
): string[] {
  if (!groupNode.id || groupNode.type !== 'groupBox') return [];
  const eligibleNodes = sourceNodes.filter((node): node is ClipboardPositionNode & { id: string } => Boolean(node.id));
  return getGroupMemberIds(
    groupNode as GroupMembershipNode,
    eligibleNodes as GroupMembershipNode[],
  );
}

export function expandClipboardNodesForGroups<T extends ClipboardPositionNode>(
  selectedNodes: T[],
  allNodes: T[],
): T[] {
  const selectedIds = new Set(selectedNodes.map((node) => node.id).filter((id): id is string => typeof id === 'string' && !!id));
  selectedNodes
    .filter((node) => node.type === 'groupBox')
    .forEach((groupNode) => {
      getClipboardGroupMemberIds(groupNode, allNodes).forEach((memberId) => selectedIds.add(memberId));
    });
  return allNodes.filter((node) => node.id && selectedIds.has(node.id));
}

export function remapPastedGroupMemberIds<T extends ClipboardPositionNode>(
  pastedNodes: T[],
  _idMap: Map<string, string>,
): T[] {
  return pastedNodes.map((node) => {
    if (node.type !== 'groupBox') return node;
    const memberIds = getClipboardGroupMemberIds(node, pastedNodes);
    return {
      ...node,
      data: {
        ...(node.data || {}),
        memberIds,
      },
    };
  });
}
