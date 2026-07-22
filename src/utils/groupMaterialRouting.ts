import type { Edge, Node } from '@xyflow/react';
import { getNodeInputs, getNodeOutputs, isConnectionValid, type PortType } from '../config/portTypes.ts';
import { getContainingGroupIds, getGroupMemberIds, resolveNodeSize } from './groupMembership.ts';

export type GroupMaterialKind = 'text' | 'image' | 'video' | 'audio';

export interface GroupMaterialItem {
  id: string;
  kind: GroupMaterialKind;
  value: string;
  sourceNodeId: string;
  sourceGroupPath: string[];
  sourceField?: string;
  label?: string;
  order: number;
  origin: 'upstream' | 'local';
  mentionKey?: string;
  mentionToken?: string;
  rhNodeId?: string;
  sourceNodeSerialId?: number;
  originEdgeId?: string;
  sourceHandle?: string | null;
  portType?: GroupMaterialKind | 'any';
}

export interface GroupMaterialBundle {
  texts: GroupMaterialItem[];
  images: GroupMaterialItem[];
  videos: GroupMaterialItem[];
  audios: GroupMaterialItem[];
}

export interface GroupInputRouteDescriptor {
  sourceNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  originEdgeId: string;
  portType: GroupMaterialKind | 'any';
  allowedKinds: GroupMaterialKind[];
  edgeOrder: number;
}

export interface GroupMaterialRouteIndex {
  geometrySignature: string;
  topologySignature: string;
  memberIdsByGroup: Map<string, string[]>;
  containingGroupIdsByMember: Map<string, string[]>;
  entryMemberIdsByGroup: Map<string, string[]>;
  virtualGroupIdsByMember: Map<string, string[]>;
  groupInputRoutesByGroup: Map<string, GroupInputRouteDescriptor[]>;
}

export interface MaterialConnectionCandidate extends Partial<Edge> {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export type MaterialConnectionRejectionReason =
  | 'missing-node'
  | 'incompatible'
  | 'self'
  | 'member-feedback'
  | 'cycle';

export interface MaterialConnectionValidation {
  valid: boolean;
  reason?: MaterialConnectionRejectionReason;
}

export interface MaterialConnectionBatchValidation<T extends MaterialConnectionCandidate> {
  accepted: T[];
  rejected: Array<{ edge: T; reason: MaterialConnectionRejectionReason }>;
}

const MATERIAL_KINDS: GroupMaterialKind[] = ['text', 'image', 'video', 'audio'];
const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|svg)(\?|$)/i;
const ROUTE_INDEX_CACHE_LIMIT = 8;
const routeIndexCache = new Map<string, GroupMaterialRouteIndex>();

function emptyBundle(): GroupMaterialBundle {
  return { texts: [], images: [], videos: [], audios: [] };
}

function bucketFor(bundle: GroupMaterialBundle, kind: GroupMaterialKind): GroupMaterialItem[] {
  if (kind === 'text') return bundle.texts;
  if (kind === 'image') return bundle.images;
  if (kind === 'video') return bundle.videos;
  return bundle.audios;
}

function normalizePortType(value: unknown): GroupMaterialKind | 'any' | null {
  return value === 'text' || value === 'image' || value === 'video' || value === 'audio' || value === 'any'
    ? value
    : null;
}

export function materialKindsForGroupPort(portType: unknown): GroupMaterialKind[] {
  const normalized = normalizePortType(portType);
  return normalized && normalized !== 'any' ? [normalized] : [...MATERIAL_KINDS];
}

function materialCapabilities(types: PortType[]): Set<GroupMaterialKind> {
  if (types.includes('any')) return new Set(MATERIAL_KINDS);
  return new Set(types.filter((type): type is GroupMaterialKind => MATERIAL_KINDS.includes(type as GroupMaterialKind)));
}

function edgeCarriesMaterial(edge: Edge, source: Node | undefined, target: Node | undefined): boolean {
  const explicit = normalizePortType((edge.data as any)?.portType);
  if (explicit) return true;
  if ((edge.data as any)?.portType) return false;
  if (!source || !target) return false;
  const sourceKinds = materialCapabilities(getNodeOutputs(source));
  const targetKinds = materialCapabilities(getNodeInputs(target));
  return Array.from(sourceKinds).some((kind) => targetKinds.has(kind));
}

export function buildGroupGeometrySignature(nodes: Node[]): string {
  return nodes.map((node) => {
    const size = resolveNodeSize(node);
    return [node.id, node.type || '', node.position?.x || 0, node.position?.y || 0, size.width, size.height].join(':');
  }).join('|');
}

export function buildGroupTopologySignature(nodes: Node[], edges: Edge[]): string {
  const nodeTypes = nodes.map((node) => `${node.id}:${node.type || ''}`).join('|');
  const edgeTypes = edges.map((edge) => [
    edge.id,
    edge.source,
    edge.target,
    edge.sourceHandle || '',
    edge.targetHandle || '',
    (edge.data as any)?.portType || '',
  ].join(':')).join('|');
  return `${nodeTypes}::${edgeTypes}`;
}

export function getGroupMaterialRouteIndex(nodes: Node[], edges: Edge[]): GroupMaterialRouteIndex {
  const geometrySignature = buildGroupGeometrySignature(nodes);
  const topologySignature = buildGroupTopologySignature(nodes, edges);
  const cacheKey = `${geometrySignature}@@${topologySignature}`;
  const cached = routeIndexCache.get(cacheKey);
  if (cached) return cached;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groups = nodes.filter((node) => node.type === 'groupBox');
  const memberIdsByGroup = new Map<string, string[]>();
  const containingGroupIdsByMember = new Map<string, string[]>();
  const entryMemberIdsByGroup = new Map<string, string[]>();
  const virtualGroupIdsByMember = new Map<string, string[]>();
  const groupInputRoutesByGroup = new Map<string, GroupInputRouteDescriptor[]>();

  for (const group of groups) {
    const memberIds = getGroupMemberIds(group, nodes);
    memberIdsByGroup.set(group.id, memberIds);
    for (const memberId of memberIds) {
      const ids = containingGroupIdsByMember.get(memberId) || [];
      ids.push(group.id);
      containingGroupIdsByMember.set(memberId, ids);
    }

    const memberSet = new Set(memberIds);
    const hasInternalMaterialUpstream = new Set<string>();
    for (const edge of edges) {
      if (!memberSet.has(edge.source) || !memberSet.has(edge.target)) continue;
      if (edgeCarriesMaterial(edge, nodeById.get(edge.source), nodeById.get(edge.target))) {
        hasInternalMaterialUpstream.add(edge.target);
      }
    }
    const entryIds = memberIds.filter((id) => !hasInternalMaterialUpstream.has(id));
    entryMemberIdsByGroup.set(group.id, entryIds);
    for (const entryId of entryIds) {
      const groupIds = virtualGroupIdsByMember.get(entryId) || [];
      groupIds.push(group.id);
      virtualGroupIdsByMember.set(entryId, groupIds);
    }

    const routes = edges.flatMap((edge, edgeOrder) => {
      if (edge.target !== group.id) return [];
      const allowedKinds = materialKindsForGroupPort((edge.data as any)?.portType);
      return [{
        sourceNodeId: edge.source,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        originEdgeId: edge.id,
        portType: normalizePortType((edge.data as any)?.portType) || 'any',
        allowedKinds,
        edgeOrder,
      } satisfies GroupInputRouteDescriptor];
    });
    groupInputRoutesByGroup.set(group.id, routes);
  }

  const index: GroupMaterialRouteIndex = {
    geometrySignature,
    topologySignature,
    memberIdsByGroup,
    containingGroupIdsByMember,
    entryMemberIdsByGroup,
    virtualGroupIdsByMember,
    groupInputRoutesByGroup,
  };
  routeIndexCache.set(cacheKey, index);
  if (routeIndexCache.size > ROUTE_INDEX_CACHE_LIMIT) {
    routeIndexCache.delete(routeIndexCache.keys().next().value as string);
  }
  return index;
}

function classifyKind(kind: Exclude<GroupMaterialKind, 'text'>, value: string): Exclude<GroupMaterialKind, 'text'> {
  if (/^data:video\//i.test(value) || VIDEO_RE.test(value)) return 'video';
  if (/^data:audio\//i.test(value) || AUDIO_RE.test(value)) return 'audio';
  if (/^data:image\//i.test(value) || IMAGE_RE.test(value)) return 'image';
  return kind;
}

export function collectNodeMaterialBundle(node: Node): GroupMaterialBundle {
  const bundle = emptyBundle();
  const data: any = node.data || {};
  let order = 0;
  const seen = new Set<string>();
  const textMeta = {
    rhNodeId: typeof data.rhNodeId === 'string' ? data.rhNodeId.trim() || undefined : undefined,
    sourceNodeSerialId: Number.isFinite(Number(data.nodeSerialId)) ? Number(data.nodeSerialId) : undefined,
  };

  const push = (
    requestedKind: GroupMaterialKind,
    rawValue: unknown,
    sourceField: string,
    label?: string,
    preserveSlot = false,
  ) => {
    if (typeof rawValue !== 'string') return;
    const value = rawValue.trim();
    if (!value) return;
    const kind = requestedKind === 'text' ? 'text' : classifyKind(requestedKind, value);
    const key = preserveSlot ? `${kind}:${node.id}:${sourceField}` : `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    bucketFor(bundle, kind).push({
      id: `${node.id}::${sourceField}:${order}`,
      kind,
      value,
      sourceNodeId: node.id,
      sourceGroupPath: [],
      sourceField,
      label,
      order: order++,
      origin: sourceField.startsWith('local') || sourceField.startsWith('reference') || node.type === 'upload' ? 'local' : 'upstream',
      mentionKey: kind === 'text' ? undefined : `${kind}:${node.id}:${sourceField}`,
      ...textMeta,
    });
  };

  const pushArray = (kind: GroupMaterialKind, field: string, preserveSlots = false) => {
    if (!Array.isArray(data[field])) return;
    data[field].forEach((value: unknown, index: number) => push(kind, value, `${field}:${index}`, undefined, preserveSlots));
  };

  if (node.type === 'material-set' && Array.isArray(data.materialSetItems)) {
    data.materialSetItems.forEach((item: any, index: number) => {
      const kind = MATERIAL_KINDS.includes(item?.kind) ? item.kind as GroupMaterialKind : data.materialSetKind as GroupMaterialKind;
      if (!MATERIAL_KINDS.includes(kind)) return;
      push(kind, kind === 'text' ? item?.text ?? item?.value : item?.url ?? item?.value, `material-set:${kind}:${index}`, item?.name, true);
    });
  }

  const textArrayField = ['textSegments', 'segments', 'texts'].find((field) => Array.isArray(data[field]) && data[field].length > 0);
  if (textArrayField) {
    pushArray('text', textArrayField, true);
  } else {
    push('text', data.outputText, 'outputText');
    push('text', data.reply, 'reply');
    if (typeof data.promptResolved === 'string' && data.promptResolved.trim()) push('text', data.promptResolved, 'promptResolved');
    else push('text', data.prompt, 'prompt');
    push('text', data.text, 'text');
  }

  push('image', data.imageUrl, 'imageUrl');
  push('image', data.directImageUrl, 'directImageUrl');
  push('image', data.resultUrl, 'resultUrl');
  push('image', data.firstFrameUrl, 'firstFrameUrl');
  push('image', data.lastFrameUrl, 'lastFrameUrl');
  for (const field of ['imageUrls', 'urls', 'generatedImages', 'directImageUrls', 'resultUrls']) pushArray('image', field);
  for (const field of ['referenceImages', 'localRefImages', 'mjSrefImages', 'mjOrefImages']) pushArray('image', field);

  push('video', data.videoUrl, 'videoUrl');
  push('video', data.directVideoUrl, 'directVideoUrl');
  for (const field of ['videoUrls', 'directVideoUrls', 'referenceVideos', 'localRefVideos']) pushArray('video', field);

  push('audio', data.audioUrl, 'audioUrl');
  push('audio', data.audioUrl_1, 'audioUrl_1');
  push('audio', data.directAudioUrl, 'directAudioUrl');
  push('audio', data.localRefAudio, 'localRefAudio');
  for (const field of ['audioUrls', 'directAudioUrls', 'referenceAudios', 'localRefAudios']) pushArray('audio', field);

  return bundle;
}

export function filterMaterialBundle(bundle: GroupMaterialBundle, kinds: Iterable<GroupMaterialKind>): GroupMaterialBundle {
  const allowed = new Set(kinds);
  return {
    texts: allowed.has('text') ? bundle.texts : [],
    images: allowed.has('image') ? bundle.images : [],
    videos: allowed.has('video') ? bundle.videos : [],
    audios: allowed.has('audio') ? bundle.audios : [],
  };
}

export function mergeGroupMaterialBundles(...bundles: GroupMaterialBundle[]): GroupMaterialBundle {
  const merged = emptyBundle();
  const seen = new Set<string>();
  for (const bundle of bundles) {
    for (const kind of MATERIAL_KINDS) {
      for (const item of bucketFor(bundle, kind)) {
        const intentionalSlot = item.sourceField?.startsWith('material-set:');
        const key = intentionalSlot
          ? `${kind}:${item.sourceNodeId}:${item.sourceField}`
          : `${kind}:${item.value.trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bucketFor(merged, kind).push(item);
      }
    }
  }
  return merged;
}

function appendGroupPath(bundle: GroupMaterialBundle, groupId: string, route?: GroupInputRouteDescriptor): GroupMaterialBundle {
  const next = emptyBundle();
  for (const kind of MATERIAL_KINDS) {
    for (const item of bucketFor(bundle, kind)) {
      bucketFor(next, kind).push({
        ...item,
        sourceGroupPath: item.sourceGroupPath.includes(groupId)
          ? item.sourceGroupPath
          : [...item.sourceGroupPath, groupId],
        originEdgeId: route?.originEdgeId ?? item.originEdgeId,
        sourceHandle: route?.sourceHandle ?? item.sourceHandle,
        portType: route?.portType ?? item.portType,
      });
    }
  }
  return next;
}

export function resolveGroupOutputBundle(
  groupId: string,
  nodes: Node[],
  edges: Edge[],
  visitedGroups: Set<string> = new Set(),
): GroupMaterialBundle {
  if (visitedGroups.has(groupId)) return emptyBundle();
  const group = nodes.find((node) => node.id === groupId && node.type === 'groupBox');
  if (!group) return emptyBundle();

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const index = getGroupMaterialRouteIndex(nodes, edges);
  const inputBundle = resolveGroupInputBundle(groupId, nodes, edges, visitedGroups);

  const members = (index.memberIdsByGroup.get(groupId) || [])
    .map((id) => nodeById.get(id))
    .filter((node): node is Node => Boolean(node))
    .map((node) => appendGroupPath(collectNodeMaterialBundle(node), groupId));

  return mergeGroupMaterialBundles(inputBundle, ...members);
}

export function resolveGroupInputBundle(
  groupId: string,
  nodes: Node[],
  edges: Edge[],
  visitedGroups: Set<string> = new Set(),
): GroupMaterialBundle {
  if (visitedGroups.has(groupId)) return emptyBundle();
  const group = nodes.find((node) => node.id === groupId && node.type === 'groupBox');
  if (!group) return emptyBundle();
  const nextVisited = new Set(visitedGroups);
  nextVisited.add(groupId);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const index = getGroupMaterialRouteIndex(nodes, edges);
  const inputs: GroupMaterialBundle[] = [];
  for (const route of index.groupInputRoutesByGroup.get(groupId) || []) {
    const source = nodeById.get(route.sourceNodeId);
    if (!source) continue;
    const sourceBundle = source.type === 'groupBox'
      ? resolveGroupOutputBundle(source.id, nodes, edges, nextVisited)
      : collectNodeMaterialBundle(source);
    inputs.push(appendGroupPath(filterMaterialBundle(sourceBundle, route.allowedKinds), groupId, route));
  }
  return mergeGroupMaterialBundles(...inputs);
}

function collectGroupSourceIds(
  groupId: string,
  index: GroupMaterialRouteIndex,
  nodeById: Map<string, Node>,
  out: string[],
  seenNodes: Set<string>,
  visitedGroups: Set<string>,
) {
  if (visitedGroups.has(groupId)) return;
  visitedGroups.add(groupId);
  for (const route of index.groupInputRoutesByGroup.get(groupId) || []) {
    if (!seenNodes.has(route.sourceNodeId)) {
      seenNodes.add(route.sourceNodeId);
      out.push(route.sourceNodeId);
    }
    const source = nodeById.get(route.sourceNodeId);
    if (source?.type === 'groupBox') {
      collectGroupSourceIds(source.id, index, nodeById, out, seenNodes, visitedGroups);
    }
  }
  for (const memberId of index.memberIdsByGroup.get(groupId) || []) {
    if (seenNodes.has(memberId)) continue;
    seenNodes.add(memberId);
    out.push(memberId);
  }
}

export function getVirtualMaterialSourceIds(memberId: string, nodes: Node[], edges: Edge[]): string[] {
  const index = getGroupMaterialRouteIndex(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const out: string[] = [];
  const seenNodes = new Set<string>();
  for (const groupId of index.virtualGroupIdsByMember.get(memberId) || []) {
    for (const route of index.groupInputRoutesByGroup.get(groupId) || []) {
      if (!seenNodes.has(route.sourceNodeId)) {
        seenNodes.add(route.sourceNodeId);
        out.push(route.sourceNodeId);
      }
      const source = nodeById.get(route.sourceNodeId);
      if (source?.type === 'groupBox') {
        collectGroupSourceIds(source.id, index, nodeById, out, seenNodes, new Set());
      }
    }
  }
  for (const edge of edges) {
    if (edge.target !== memberId) continue;
    const source = nodeById.get(edge.source);
    if (source?.type !== 'groupBox') continue;
    if (!seenNodes.has(source.id)) {
      seenNodes.add(source.id);
      out.push(source.id);
    }
    collectGroupSourceIds(source.id, index, nodeById, out, seenNodes, new Set());
  }
  return out;
}

export function resolveConnectedGroupInputBundle(targetId: string, nodes: Node[], edges: Edge[]): GroupMaterialBundle {
  const target = nodes.find((node) => node.id === targetId);
  if (!target) return emptyBundle();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const consumerKinds = materialCapabilities(getNodeInputs(target));
  const bundles: GroupMaterialBundle[] = [];

  edges.forEach((edge, edgeOrder) => {
    if (edge.target !== targetId) return;
    const source = nodeById.get(edge.source);
    if (source?.type !== 'groupBox') return;
    const routeKinds = materialKindsForGroupPort((edge.data as any)?.portType)
      .filter((kind) => consumerKinds.has(kind));
    const route: GroupInputRouteDescriptor = {
      sourceNodeId: source.id,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      originEdgeId: edge.id,
      portType: normalizePortType((edge.data as any)?.portType) || 'any',
      allowedKinds: routeKinds,
      edgeOrder,
    };
    bundles.push(appendGroupPath(
      filterMaterialBundle(resolveGroupOutputBundle(source.id, nodes, edges), routeKinds),
      source.id,
      route,
    ));
  });

  return mergeGroupMaterialBundles(...bundles);
}

export function resolveVirtualInputBundleForMember(memberId: string, nodes: Node[], edges: Edge[]): GroupMaterialBundle {
  const target = nodes.find((node) => node.id === memberId);
  if (!target) return emptyBundle();
  const index = getGroupMaterialRouteIndex(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const consumerKinds = materialCapabilities(getNodeInputs(target));
  const bundles: GroupMaterialBundle[] = [];

  for (const groupId of index.virtualGroupIdsByMember.get(memberId) || []) {
    for (const route of index.groupInputRoutesByGroup.get(groupId) || []) {
      const source = nodeById.get(route.sourceNodeId);
      if (!source) continue;
      const allowedKinds = route.allowedKinds.filter((kind) => consumerKinds.has(kind));
      const sourceBundle = source.type === 'groupBox'
        ? resolveGroupOutputBundle(source.id, nodes, edges, new Set([groupId]))
        : collectNodeMaterialBundle(source);
      bundles.push(appendGroupPath(filterMaterialBundle(sourceBundle, allowedKinds), groupId, route));
    }
  }

  return mergeGroupMaterialBundles(...bundles);
}

export function materialBundleSignature(bundle: GroupMaterialBundle): string {
  return MATERIAL_KINDS.flatMap((kind) => bucketFor(bundle, kind).map((item) => [
    kind,
    item.value,
    item.sourceNodeId,
    item.sourceField || '',
    item.sourceGroupPath.join('>'),
  ].join(':'))).join('|');
}

export function materialBundleToCompatibilityData(bundle: GroupMaterialBundle): Record<string, unknown> {
  const texts = bundle.texts.map((item) => item.value);
  const images = bundle.images.map((item) => item.value);
  const videos = bundle.videos.map((item) => item.value);
  const audios = bundle.audios.map((item) => item.value);
  const text = texts.join('\n\n------\n\n');
  return {
    prompt: text,
    text,
    reply: text,
    imageUrl: images[0] || '',
    imageUrls: images,
    urls: images,
    videoUrl: videos[0] || '',
    videoUrls: videos,
    audioUrl: audios[0] || '',
    audioUrls: audios,
  };
}

export function getVirtualInputGroupIds(node: Node, nodes: Node[], edges: Edge[]): string[] {
  const index = getGroupMaterialRouteIndex(nodes, edges);
  return index.virtualGroupIdsByMember.get(node.id) || getContainingGroupIds(node, nodes).filter((groupId) =>
    (index.entryMemberIdsByGroup.get(groupId) || []).includes(node.id),
  );
}

function dependencyVertex(node: Node, side: 'source' | 'target'): string {
  if (node.type !== 'groupBox') return `node:${node.id}`;
  return side === 'source' ? `groupOut:${node.id}` : `groupIn:${node.id}`;
}

function addDependencyArc(adjacency: Map<string, Set<string>>, from: string, to: string) {
  const targets = adjacency.get(from) || new Set<string>();
  targets.add(to);
  adjacency.set(from, targets);
}

function canReach(adjacency: Map<string, Set<string>>, start: string, goal: string): boolean {
  if (start === goal) return true;
  const pending = [start];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) || []) {
      if (next === goal) return true;
      if (!visited.has(next)) pending.push(next);
    }
  }
  return false;
}

function buildExpandedDependencyGraph(nodes: Node[], edges: Edge[], excludedEdgeId?: string): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const index = getGroupMaterialRouteIndex(nodes, edges);

  for (const edge of edges) {
    if (edge.id === excludedEdgeId) continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target || !edgeCarriesMaterial(edge, source, target)) continue;
    addDependencyArc(adjacency, dependencyVertex(source, 'source'), dependencyVertex(target, 'target'));
  }

  for (const group of nodes.filter((node) => node.type === 'groupBox')) {
    const groupIn = `groupIn:${group.id}`;
    const groupOut = `groupOut:${group.id}`;
    addDependencyArc(adjacency, groupIn, groupOut);
    for (const entryId of index.entryMemberIdsByGroup.get(group.id) || []) {
      addDependencyArc(adjacency, groupIn, `node:${entryId}`);
    }
    for (const memberId of index.memberIdsByGroup.get(group.id) || []) {
      addDependencyArc(adjacency, `node:${memberId}`, groupOut);
    }
  }
  return adjacency;
}

function edgeFromCandidate(candidate: MaterialConnectionCandidate, fallbackId: string): Edge {
  return { ...candidate, id: candidate.id || fallbackId } as Edge;
}

export function validateMaterialConnection<T extends MaterialConnectionCandidate>(
  nodes: Node[],
  edges: Edge[],
  candidate: T,
  replacedEdgeId?: string,
): MaterialConnectionValidation {
  const source = nodes.find((node) => node.id === candidate.source);
  const target = nodes.find((node) => node.id === candidate.target);
  if (!source || !target) return { valid: false, reason: 'missing-node' };
  if (source.id === target.id) return { valid: false, reason: 'self' };
  if (!isConnectionValid(source, target)) return { valid: false, reason: 'incompatible' };

  const baseEdges = replacedEdgeId ? edges.filter((edge) => edge.id !== replacedEdgeId) : edges.slice();
  const baseIndex = getGroupMaterialRouteIndex(nodes, baseEdges);
  if (
    (target.type === 'groupBox' && (baseIndex.memberIdsByGroup.get(target.id) || []).includes(source.id)) ||
    (source.type === 'groupBox' && (baseIndex.memberIdsByGroup.get(source.id) || []).includes(target.id))
  ) {
    return { valid: false, reason: 'member-feedback' };
  }

  const candidateEdge = edgeFromCandidate(candidate, '__candidate__');
  const finalEdges = [...baseEdges, candidateEdge];
  const adjacency = buildExpandedDependencyGraph(nodes, finalEdges, candidateEdge.id);
  const sourceVertex = dependencyVertex(source, 'source');
  const targetVertex = dependencyVertex(target, 'target');
  if (canReach(adjacency, targetVertex, sourceVertex)) return { valid: false, reason: 'cycle' };
  return { valid: true };
}

export function validateMaterialConnections<T extends MaterialConnectionCandidate>(
  nodes: Node[],
  edges: Edge[],
  candidates: T[],
  replacedEdgeIds: Array<string | undefined> = [],
): MaterialConnectionBatchValidation<T> {
  const accepted: T[] = [];
  const rejected: Array<{ edge: T; reason: MaterialConnectionRejectionReason }> = [];
  let accumulated = edges.slice();
  candidates.forEach((candidate, index) => {
    const replacedEdgeId = replacedEdgeIds[index];
    const result = validateMaterialConnection(nodes, accumulated, candidate, replacedEdgeId);
    if (!result.valid) {
      rejected.push({ edge: candidate, reason: result.reason || 'cycle' });
      return;
    }
    if (replacedEdgeId) accumulated = accumulated.filter((edge) => edge.id !== replacedEdgeId);
    accumulated.push(edgeFromCandidate(candidate, `__candidate__${index}`));
    accepted.push(candidate);
  });
  return { accepted, rejected };
}
