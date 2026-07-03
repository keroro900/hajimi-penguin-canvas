import { memo, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { ImagePlus, Images, Loader2, PackageOpen, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { useRunBusStore } from '../../stores/runBus';
import { uploadFile } from '../../services/generation';
import { useMaterialDropTarget } from '../../hooks/useMaterialDropTarget';
import type { MaterialPayload } from '../../stores/dragMaterial';
import {
  APPAREL_PACK_MODE_OPTIONS,
  APPAREL_PACK_PRESETS,
  MAX_APPAREL_PACK_SHOTS,
  buildApparelPackPlan,
  type ApparelPackMode,
  type ApparelPackPresetItem,
} from '../../utils/apparelPackPlan';
import { defaultSizeOf, placeBatchNodes, type Rect as PlacementRect } from '../../utils/nodePlacement';
import SmartImage from '../SmartImage';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';

type SelectOption = {
  value: string;
  label: string;
};

const MODE_LABEL: Record<ApparelPackMode, string> = {
  suite: '套图生成',
  'garment-reference': '服装参考生成',
  inspiration: '灵感模式',
};

const RATIO_OPTIONS: SelectOption[] = [
  { value: '3:4', label: '3:4 电商竖图' },
  { value: '4:5', label: '4:5 平台图' },
  { value: '1:1', label: '1:1 方图' },
  { value: '9:16', label: '9:16 竖屏' },
];

const SIZE_OPTIONS: SelectOption[] = [
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const MODEL_POLICY_OPTIONS: SelectOption[] = [
  { value: 'generic', label: '泛化模特' },
  { value: 'no-face', label: '不露脸' },
  { value: 'body-crop', label: '身体局部' },
];

type RoleKey = 'model' | 'garment' | 'style';

const ROLE_META: Record<RoleKey, { label: string; field: string; empty: string }> = {
  model: { label: '模特参考', field: 'apparelPackModelRefs', empty: '拖入/上传模特图' },
  garment: { label: '服装参考', field: 'apparelPackGarmentRefs', empty: '拖入/上传服装图' },
  style: { label: '风格参考', field: 'apparelPackStyleRefs', empty: '拖入/上传风格图' },
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>{children}</label>;
}

function TinyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] leading-snug" style={{ color: 'var(--t8-text-dim)' }}>{children}</div>;
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <select className="t8-select nodrag w-full px-2 py-1.5 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}

function PresetField({
  label,
  value,
  options,
  customValue,
  customPlaceholder,
  onChange,
  onCustomChange,
}: {
  label: string;
  value: string;
  options: ApparelPackPresetItem[];
  customValue: string;
  customPlaceholder?: string;
  onChange: (value: string) => void;
  onCustomChange: (value: string) => void;
}) {
  const selectedPreset = options.find((item) => item.id === value) || options[0];
  return (
    <div className="min-w-0 space-y-1">
      <SelectField
        label={label}
        value={selectedPreset.id}
        options={options.map((item) => ({ value: item.id, label: item.label }))}
        onChange={onChange}
      />
      {selectedPreset.id === 'custom' && (
        <input
          className="t8-input nodrag w-full px-2 py-1.5 text-xs"
          value={customValue}
          placeholder={customPlaceholder}
          onChange={(event) => onCustomChange(event.target.value)}
        />
      )}
      <TinyHint>{selectedPreset.prompt}</TinyHint>
    </div>
  );
}

function ShotCountField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="min-w-0">
      <FieldLabel>出图数量</FieldLabel>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="t8-btn h-8 w-8 justify-center px-0 text-sm"
          onClick={() => onChange(Math.max(1, value - 1))}
          title="减少出图数量"
        >
          -
        </button>
        <input
          className="t8-input nodrag nowheel h-8 min-w-0 flex-1 px-2 text-center text-xs"
          type="number"
          min={1}
          max={MAX_APPAREL_PACK_SHOTS}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 1)}
        />
        <button
          type="button"
          className="t8-btn h-8 w-8 justify-center px-0 text-sm"
          onClick={() => onChange(Math.min(MAX_APPAREL_PACK_SHOTS, value + 1))}
          title="增加出图数量"
        >
          +
        </button>
      </div>
      <TinyHint>最多 {MAX_APPAREL_PACK_SHOTS} 张，会自动补平铺/挂拍/细节/场景图。</TinyHint>
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input
        className="t8-input nodrag w-full px-2 py-1.5 text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function splitUrls(value: unknown): string[] {
  return String(value || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeUnique(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function refsToText(urls: string[]): string {
  return mergeUnique(urls).join('\n');
}

function removeRef(urls: string[], url: string): string[] {
  return urls.filter((item) => item !== url);
}

const APPAREL_PACK_RUN_TIMEOUT_MS = 60 * 60 * 1000;

function waitForApparelRunDone(nodeId: string, runStartTs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      off();
      window.clearTimeout(timer);
      resolve(ok);
    };
    const off = useRunBusStore.subscribe((state) => {
      if (state.lastDone && state.lastDone.id === nodeId && state.lastDone.ts >= runStartTs) {
        finish(state.lastDone.ok);
      }
    });
    const timer = window.setTimeout(() => finish(false), APPAREL_PACK_RUN_TIMEOUT_MS);
  });
}

async function runApparelPackStages(runStages: string[][]): Promise<void> {
  const stages = runStages
    .map((stage) => stage.filter(Boolean))
    .filter((stage) => stage.length > 0);
  const total = stages.flat().length;
  if (total === 0) return;

  const { triggerRunMany, setBatchProgress, cancelAll } = useRunBusStore.getState();
  let completed = 0;
  setBatchProgress(total, completed);
  try {
    for (const stage of stages) {
      const runStartTs = Date.now();
      const waits = stage.map((nodeId) => waitForApparelRunDone(nodeId, runStartTs));
      triggerRunMany(stage, 'batch');
      const results = await Promise.all(waits);
      completed += stage.length;
      setBatchProgress(total, completed);
      const failedIndex = results.findIndex((ok) => !ok);
      if (failedIndex >= 0) {
        throw new Error(`阶段生成失败：${stage[failedIndex]}`);
      }
    }
  } finally {
    cancelAll();
  }
}

function planNodeToReactNode(node: any): Node {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data || {},
    selected: true,
  } as Node;
}

function planEdgeToReactEdge(edge: any): Edge {
  return {
    id: edge.id || `edge-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    data: edge.data,
    style: edge.data?.portType === 'image'
      ? { stroke: '#fcd34d', strokeWidth: 2 }
      : { stroke: '#71717a', strokeWidth: 2 },
  } as Edge;
}

function defaultGroupBox(plan: ReturnType<typeof buildApparelPackPlan>, id: string): Node {
  const rects = plan.nodes.map((node) => {
    const size = defaultSizeOf(node.type);
    return { x: node.position.x, y: node.position.y, w: size.w, h: size.h };
  });
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
  return {
    id,
    type: 'groupBox',
    position: { x: minX - 36, y: minY - 58 },
    data: {
      name: `服装封包 · ${MODE_LABEL[plan.summary.mode]}`,
      color: '#14b8a6',
      memberIds: plan.nodes.map((node) => node.id),
      width: maxX - minX + 72,
      height: maxY - minY + 96,
      prompt: plan.goal,
      text: plan.goal,
    },
    zIndex: -1000,
    selected: false,
  } as Node;
}

function RoleImageBucket({
  role,
  urls,
  upstreamImages,
  active,
  uploading,
  onActivate,
  onUpload,
  onAdd,
  onRemove,
}: {
  role: RoleKey;
  urls: string[];
  upstreamImages: Material[];
  active: boolean;
  uploading: boolean;
  onActivate: () => void;
  onUpload: (files: File[]) => void;
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const meta = ROLE_META[role];
  const unusedUpstream = upstreamImages.filter((item) => !urls.includes(item.url)).slice(0, 6);
  return (
    <div
      className={`rounded-md border p-2 ${active ? 'ring-1' : ''}`}
      style={{
        borderColor: active ? 'var(--t8-accent, #14b8a6)' : 'var(--t8-border)',
        background: active ? 'color-mix(in srgb, var(--t8-accent, #14b8a6) 10%, transparent)' : 'var(--t8-bg-panel-muted)',
        ['--tw-ring-color' as any]: 'var(--t8-accent, #14b8a6)',
      }}
      onClick={onActivate}
      onDragOver={(event) => {
        event.preventDefault();
        onActivate();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'));
        if (files.length) onUpload(files);
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <FieldLabel>{meta.label}</FieldLabel>
        <button
          type="button"
          className="t8-btn px-2 py-1 text-[10px]"
          onClick={(event) => {
            event.stopPropagation();
            onActivate();
            inputRef.current?.click();
          }}
        >
          <ImagePlus size={12} />
          {uploading ? '上传中' : '上传'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            if (files.length) onUpload(files);
          }}
        />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {urls.map((url, index) => (
          <div
            key={`${role}-${url}-${index}`}
            className="group relative aspect-square overflow-hidden rounded border"
            style={{ borderColor: 'var(--t8-border)' }}
            data-drag-source
            data-drag-kind="image"
            data-drag-url={url}
            data-drag-preview={url}
            data-drag-node-id={`apparel-pack-${role}`}
            title={url}
          >
            <SmartImage src={url} alt={`${meta.label}${index + 1}`} className="h-full w-full object-cover" thumbSize={160} draggable={false} />
            <button
              type="button"
              className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(url);
              }}
              title="移除"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {urls.length === 0 && (
          <button
            type="button"
            className="aspect-square rounded border border-dashed px-1 text-[10px] leading-tight"
            style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-dim)' }}
            onClick={(event) => {
              event.stopPropagation();
              onActivate();
              inputRef.current?.click();
            }}
          >
            {meta.empty}
          </button>
        )}
      </div>
      {unusedUpstream.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>上游图片池</div>
          <div className="flex flex-wrap gap-1.5">
            {unusedUpstream.map((item) => (
              <button
                key={`${role}-pool-${item.id}`}
                type="button"
                className="h-9 w-9 overflow-hidden rounded border"
                style={{ borderColor: 'var(--t8-border)' }}
                title={`加入${meta.label}: ${item.label || item.url}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAdd(item.url);
                }}
              >
                <SmartImage src={item.url} alt={item.label || ''} className="h-full w-full object-cover" thumbSize={120} draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApparelPackNode({ id, data, selected }: NodeProps) {
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const upstream = useUpstreamMaterials(id);
  const [busy, setBusy] = useState(false);
  const [uploadingRole, setUploadingRole] = useState<RoleKey | null>(null);
  const [activeRole, setActiveRole] = useState<RoleKey>('garment');
  const [localError, setLocalError] = useState('');
  const d = (data || {}) as any;

  const mode: ApparelPackMode = ['suite', 'garment-reference', 'inspiration'].includes(d.apparelPackMode)
    ? d.apparelPackMode
    : 'suite';
  const allUpstreamImages = upstream.images.map((item) => item.url);
  const manualModelRefs = splitUrls(d.apparelPackModelRefs);
  const manualGarmentRefs = splitUrls(d.apparelPackGarmentRefs);
  const manualStyleRefs = splitUrls(d.apparelPackStyleRefs);
  const autoModelRefs = mode === 'suite' && manualModelRefs.length === 0
    ? allUpstreamImages.slice(0, 1)
    : [];
  const autoGarmentRefs = manualGarmentRefs.length === 0
    ? (mode === 'suite' && allUpstreamImages.length > 1 ? allUpstreamImages.slice(1) : allUpstreamImages)
    : [];
  const modelRefs = mergeUnique(manualModelRefs, autoModelRefs);
  const garmentRefs = mergeUnique(
    manualGarmentRefs,
    autoGarmentRefs,
  );
  const styleRefs = manualStyleRefs;

  const outputRatio = String(d.apparelPackOutputRatio || '3:4');
  const sizeLevel = String(d.apparelPackSizeLevel || '2K');
  const shotCount = Math.max(1, Math.min(MAX_APPAREL_PACK_SHOTS, Math.floor(Number(d.apparelPackShotCount || 6))));
  const garmentPresetId = String(d.apparelPackGarmentPresetId || 'garment');
  const audiencePresetId = String(d.apparelPackAudiencePresetId || 'women');
  const channelPresetId = String(d.apparelPackChannelPresetId || 'marketplace');
  const garmentTypeCustom = String(d.apparelPackGarmentTypeCustom || d.apparelPackGarmentType || '');
  const audienceCustom = String(d.apparelPackAudienceCustom || d.apparelPackAudience || '');
  const channelCustom = String(d.apparelPackChannelCustom || d.apparelPackChannel || '');
  const customPrompt = String(d.apparelPackCustomPrompt || '');
  const enableQualityQa = d.apparelPackEnableQualityQa !== false;
  const qualityThreshold = String(d.apparelPackQualityThreshold || 'normal');
  const modeSummary = `${MODE_LABEL[mode]} · 上游图 ${allUpstreamImages.length} · 服装 ${garmentRefs.length}`;
  const status = String(d.status || 'idle');
  const running = status === 'running' || busy;

  const updateRoleRefs = (role: RoleKey, urls: string[]) => {
    update({ [ROLE_META[role].field]: refsToText(urls) });
  };

  const addRoleRef = (role: RoleKey, url: string) => {
    const current = role === 'model' ? manualModelRefs : role === 'garment' ? manualGarmentRefs : manualStyleRefs;
    updateRoleRefs(role, mergeUnique(current, [url]));
  };

  const removeRoleRef = (role: RoleKey, url: string) => {
    const current = role === 'model' ? manualModelRefs : role === 'garment' ? manualGarmentRefs : manualStyleRefs;
    updateRoleRefs(role, removeRef(current, url));
  };

  const uploadRoleFiles = async (role: RoleKey, files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setLocalError('');
    setUploadingRole(role);
    try {
      const uploaded: string[] = [];
      for (const file of imageFiles) {
        const result = await uploadFile(file);
        uploaded.push(result.url);
      }
      const current = role === 'model' ? manualModelRefs : role === 'garment' ? manualGarmentRefs : manualStyleRefs;
      updateRoleRefs(role, mergeUnique(current, uploaded));
    } catch (error: any) {
      setLocalError(error?.message || '素材上传失败');
    } finally {
      setUploadingRole(null);
    }
  };

  const handleMaterialDrop = (payload: MaterialPayload) => {
    if (payload.kind !== 'image' || !payload.url) return;
    addRoleRef(activeRole, payload.url);
  };

  const { dropProps, isAccepting } = useMaterialDropTarget({
    id,
    accepts: ['image'],
    onDrop: handleMaterialDrop,
    allowSelf: true,
  });

  const basePlanInput = useMemo(() => ({
    packId: `apparel-${id}`,
    mode,
    position: {
      x: (rf.getNode(id)?.position.x || 0) + 520,
      y: rf.getNode(id)?.position.y || 0,
    },
    sourceNodeId: id,
    references: {
      model: modelRefs,
      garment: garmentRefs,
      style: styleRefs,
    },
    suite: {
      shotCount,
      lockLevel: String(d.apparelPackLockLevel || 'pose') as any,
      modelConsistency: String(d.apparelPackModelConsistency || 'strict') as any,
      garmentConsistency: String(d.apparelPackGarmentConsistency || 'strict') as any,
      garmentPresetId,
      audiencePresetId,
      channelPresetId,
      customGarmentType: garmentTypeCustom,
      customAudience: audienceCustom,
      customChannel: channelCustom,
      customPrompt,
      outputRatio,
      sizeLevel,
    },
    garmentReference: {
      audience: audienceCustom || 'women',
      garmentType: garmentTypeCustom || 'garment',
      garmentPresetId,
      audiencePresetId,
      channelPresetId,
      customGarmentType: garmentTypeCustom,
      customAudience: audienceCustom,
      customChannel: channelCustom,
      customPrompt,
      modelPolicy: String(d.apparelPackModelPolicy || 'generic') as any,
      shotCount,
      includeFlatlay: d.apparelPackIncludeFlatlay !== false,
      includeDetail: d.apparelPackIncludeDetail !== false,
      outputRatio,
      sizeLevel,
    },
    inspiration: {
      direction: String(d.apparelPackDirection || ''),
      audience: audienceCustom || 'marketplace customer',
      channel: channelCustom || 'e-commerce',
      garmentPresetId,
      audiencePresetId,
      channelPresetId,
      customGarmentType: garmentTypeCustom,
      customAudience: audienceCustom,
      customChannel: channelCustom,
      customPrompt,
      planningStrength: String(d.apparelPackPlanningStrength || 'balanced') as any,
      shotCount,
      outputRatio,
      sizeLevel,
    },
    qualityQa: {
      enabled: enableQualityQa,
      passThreshold: qualityThreshold as any,
      customPrompt: String(d.apparelPackQualityPrompt || ''),
    },
  }), [
    d.apparelPackDirection,
    d.apparelPackGarmentConsistency,
    d.apparelPackIncludeDetail,
    d.apparelPackIncludeFlatlay,
    d.apparelPackLockLevel,
    d.apparelPackModelConsistency,
    d.apparelPackModelPolicy,
    d.apparelPackPlanningStrength,
    d.apparelPackQualityPrompt,
    audienceCustom,
    audiencePresetId,
    channelCustom,
    channelPresetId,
    customPrompt,
    enableQualityQa,
    garmentPresetId,
    garmentTypeCustom,
    garmentRefs,
    id,
    mode,
    modelRefs,
    outputRatio,
    qualityThreshold,
    rf,
    shotCount,
    sizeLevel,
    styleRefs,
  ]);

  const previewPlan = useMemo(() => buildApparelPackPlan({ ...basePlanInput, autoRun: false }), [basePlanInput]);

  const renderPresetBasics = () => (
    <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
      <div className="grid grid-cols-2 gap-2">
        <PresetField
          label="品类预设"
          value={garmentPresetId}
          options={APPAREL_PACK_PRESETS.garmentTypes}
          customValue={garmentTypeCustom}
          customPlaceholder="例如：女童碎花背心裙"
          onChange={(value) => update({ apparelPackGarmentPresetId: value })}
          onCustomChange={(value) => update({ apparelPackGarmentTypeCustom: value, apparelPackGarmentType: value })}
        />
        <PresetField
          label="人群预设"
          value={audiencePresetId}
          options={APPAREL_PACK_PRESETS.audiences}
          customValue={audienceCustom}
          customPlaceholder="例如：3-6 岁女童"
          onChange={(value) => update({ apparelPackAudiencePresetId: value })}
          onCustomChange={(value) => update({ apparelPackAudienceCustom: value, apparelPackAudience: value })}
        />
        <PresetField
          label="平台预设"
          value={channelPresetId}
          options={APPAREL_PACK_PRESETS.channels}
          customValue={channelCustom}
          customPlaceholder="例如：TEMU 欧美站"
          onChange={(value) => update({ apparelPackChannelPresetId: value })}
          onCustomChange={(value) => update({ apparelPackChannelCustom: value, apparelPackChannel: value })}
        />
        <ShotCountField value={shotCount} onChange={(value) => update({ apparelPackShotCount: value })} />
      </div>
      <label className="mt-2 block">
        <FieldLabel>补充要求</FieldLabel>
        <textarea
          className="t8-textarea nodrag nowheel min-h-[54px] w-full px-2 py-1.5 text-xs"
          value={customPrompt}
          placeholder="例如：腰部蝴蝶结不能变，印花间距和颜色要和参考图一致"
          onChange={(event) => update({ apparelPackCustomPrompt: event.target.value })}
        />
      </label>
    </div>
  );

  const applyPlan = async (runAfterExpand: boolean) => {
    setLocalError('');
    update({ status: 'running', error: '' });
    setBusy(true);
    try {
      if (mode !== 'inspiration' && garmentRefs.length === 0) {
        throw new Error('请连接或填写至少一张服装参考图');
      }
      if (mode === 'suite' && modelRefs.length === 0) {
        throw new Error('套图生成需要模特参考图。可以连接一张模特图作为第 1 张上游图。');
      }
      const expansionPackId = `apparel-${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const plan = buildApparelPackPlan({ ...basePlanInput, packId: expansionPackId, autoRun: runAfterExpand });
      const existing = rf.getNodes();
      const desiredRects: PlacementRect[] = plan.nodes.map((node) => {
        const size = defaultSizeOf(node.type);
        return { x: node.position.x, y: node.position.y, w: size.w, h: size.h };
      });
      const offset = placeBatchNodes(desiredRects, existing, { source: `apparel-pack:${id}` });
      const nodes = plan.nodes.map((node) => planNodeToReactNode({
        ...node,
        position: {
          x: node.position.x + offset.dx,
          y: node.position.y + offset.dy,
        },
      }));
      const shiftedPlan = {
        ...plan,
        nodes: nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data })),
      } as ReturnType<typeof buildApparelPackPlan>;
      const group = defaultGroupBox(shiftedPlan, `${plan.summary.mode}-group-${id}-${Date.now()}`);
      const edges = plan.edges.map(planEdgeToReactEdge);
      rf.addNodes([group, ...nodes]);
      rf.setEdges((current) => {
        const existingIds = new Set(current.map((edge) => edge.id));
        return [...current, ...edges.filter((edge) => !existingIds.has(edge.id))];
      });
      update({
        status: runAfterExpand ? 'running' : 'success',
        error: '',
        apparelPackLastPlanSummary: plan.summary,
        apparelPackLastRunNodeIds: plan.runNodeIds,
      });
      if (runAfterExpand && plan.runNodeIds.length > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        await runApparelPackStages(plan.runStages);
        update({
          status: 'success',
          error: '',
          apparelPackLastPlanSummary: plan.summary,
          apparelPackLastRunNodeIds: plan.runNodeIds,
        });
      }
    } catch (error: any) {
      const message = error?.message || '服装封包展开失败';
      setLocalError(message);
      update({ status: 'error', error: message });
    } finally {
      setBusy(false);
    }
  };

  const renderSuitePanel = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="锁定级别"
          value={String(d.apparelPackLockLevel || 'pose')}
          options={[
            { value: 'pose', label: '姿势/镜头' },
            { value: 'pose-background', label: '姿势+背景' },
            { value: 'authorized-identity-pose', label: '授权身份+姿势' },
            { value: 'free-commercial', label: '商业重写' },
          ]}
          onChange={(value) => update({ apparelPackLockLevel: value })}
        />
        <SelectField
          label="模特一致"
          value={String(d.apparelPackModelConsistency || 'strict')}
          options={[{ value: 'strict', label: '严格' }, { value: 'normal', label: '普通' }]}
          onChange={(value) => update({ apparelPackModelConsistency: value })}
        />
        <SelectField
          label="服装一致"
          value={String(d.apparelPackGarmentConsistency || 'strict')}
          options={[{ value: 'strict', label: '严格' }, { value: 'normal', label: '普通' }]}
          onChange={(value) => update({ apparelPackGarmentConsistency: value })}
        />
      </div>
      <TinyHint>默认把第 1 张上游图当模特参考，其余当服装参考；数量增加后会自动追加侧身、生活场景、面料、领标和颜色质感图。</TinyHint>
    </div>
  );

  const renderGarmentReferencePanel = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="模特策略" value={String(d.apparelPackModelPolicy || 'generic')} options={MODEL_POLICY_OPTIONS} onChange={(value) => update({ apparelPackModelPolicy: value })} />
        <div className="rounded-md border px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-dim)' }}>
          自动补图：模特/平铺/挂拍/细节
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-main)' }}>
          <input className="nodrag" type="checkbox" checked={d.apparelPackIncludeFlatlay !== false} onChange={(event) => update({ apparelPackIncludeFlatlay: event.target.checked })} />
          平铺锚点
        </label>
        <label className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-main)' }}>
          <input className="nodrag" type="checkbox" checked={d.apparelPackIncludeDetail !== false} onChange={(event) => update({ apparelPackIncludeDetail: event.target.checked })} />
          细节图
        </label>
      </div>
      <TinyHint>先生成正面模特和平铺锚点，再用锚点派生背面与细节，避免同款漂移。</TinyHint>
    </div>
  );

  const renderInspirationPanel = () => (
    <div className="space-y-2">
      <label>
        <FieldLabel>灵感方向</FieldLabel>
        <textarea
          className="t8-textarea nodrag nowheel min-h-[64px] w-full px-2 py-1.5 text-xs"
          value={String(d.apparelPackDirection || '')}
          placeholder="夏季女童碎花连衣裙，适合 TEMU 商品套图"
          onChange={(event) => update({ apparelPackDirection: event.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="规划强度"
          value={String(d.apparelPackPlanningStrength || 'balanced')}
          options={[
            { value: 'light', label: '轻规划' },
            { value: 'balanced', label: '平衡' },
            { value: 'strict', label: '强约束' },
          ]}
          onChange={(value) => update({ apparelPackPlanningStrength: value })}
        />
        <div className="rounded-md border px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-dim)' }}>
          先规划 brief，再生成套图
        </div>
      </div>
      <TinyHint>灵感模式会先创建 LLM 规划节点，后续图像节点引用结构化 brief。</TinyHint>
    </div>
  );

  const error = localError || String(d.error || '');
  const modePanel = mode === 'suite'
    ? renderSuitePanel()
    : mode === 'garment-reference'
      ? renderGarmentReferencePanel()
      : renderInspirationPanel();

  return (
    <div
      {...dropProps}
      className={`t8-node t8-smart-node-card overflow-hidden transition-all ${selected ? 't8-smart-node-card--selected' : ''}`}
      style={{
        width: 420,
        boxShadow: isAccepting ? '0 0 0 2px var(--t8-accent, #14b8a6)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="t8-smart-node-port !border-0" />
      <Handle type="source" position={Position.Right} className="t8-smart-node-port !border-0" />

      <div className="t8-smart-node-card__header">
        <div className="t8-smart-node-icon">
          <PackageOpen size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="t8-smart-node-title">服装封包生成</div>
          <div className="t8-smart-node-subtitle">{modeSummary}</div>
        </div>
        <div className="t8-smart-node-status rounded border">
          {status === 'success' ? '已展开' : status === 'error' ? '异常' : running ? '运行中' : '待展开'}
        </div>
      </div>

      <div className="t8-smart-node-body">
        <div className="nodrag nowheel space-y-3 p-3" onMouseDown={(event) => event.stopPropagation()}>
          <div className="grid grid-cols-3 gap-1">
            {APPAREL_PACK_MODE_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`t8-btn min-w-0 justify-center px-2 py-1.5 text-[11px] ${mode === item.id ? 't8-btn-primary' : ''}`}
                title={item.description}
                onClick={() => update({ apparelPackMode: item.id })}
              >
                {item.id === 'inspiration' ? <WandSparkles size={12} /> : <Images size={12} />}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SelectField label="比例" value={outputRatio} options={RATIO_OPTIONS} onChange={(value) => update({ apparelPackOutputRatio: value })} />
            <SelectField label="尺寸" value={sizeLevel} options={SIZE_OPTIONS} onChange={(value) => update({ apparelPackSizeLevel: value })} />
          </div>

          {renderPresetBasics()}

          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            {modePanel}
          </div>

          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <label className="flex items-center justify-between gap-3 text-[11px]" style={{ color: 'var(--t8-text-main)' }}>
              <span>
                <span className="block font-bold">测试生图质量并调优提示词</span>
                <span style={{ color: 'var(--t8-text-dim)' }}>生成后追加 QA agent，输出评分和重试 prompt patch</span>
              </span>
              <input
                className="nodrag"
                type="checkbox"
                checked={enableQualityQa}
                onChange={(event) => update({ apparelPackEnableQualityQa: event.target.checked })}
              />
            </label>
            {enableQualityQa && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <SelectField
                  label="质检标准"
                  value={qualityThreshold}
                  options={APPAREL_PACK_PRESETS.qualityThresholds.map((item) => ({ value: item.id, label: item.label }))}
                  onChange={(value) => update({ apparelPackQualityThreshold: value })}
                />
                <TextField
                  label="重点检查"
                  value={String(d.apparelPackQualityPrompt || '')}
                  placeholder="例如：重点看印花和模特一致"
                  onChange={(value) => update({ apparelPackQualityPrompt: value })}
                />
              </div>
            )}
          </div>

          <details className="rounded-md border p-2" open style={{ borderColor: isAccepting ? 'var(--t8-accent, #14b8a6)' : 'var(--t8-border)' }}>
            <summary className="cursor-pointer text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>素材角色</summary>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(ROLE_META) as RoleKey[]).map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={`t8-btn justify-center px-2 py-1 text-[10px] ${activeRole === role ? 't8-btn-primary' : ''}`}
                    onClick={() => setActiveRole(role)}
                  >
                    {ROLE_META[role].label}
                  </button>
                ))}
              </div>
              <TinyHint>Ctrl/⌘ 拖图片到节点会加入当前角色；也可以直接拖本地图片到角色槽上传。</TinyHint>
              <RoleImageBucket
                role="model"
                urls={manualModelRefs}
                upstreamImages={upstream.images}
                active={activeRole === 'model'}
                uploading={uploadingRole === 'model'}
                onActivate={() => setActiveRole('model')}
                onUpload={(files) => void uploadRoleFiles('model', files)}
                onAdd={(url) => addRoleRef('model', url)}
                onRemove={(url) => removeRoleRef('model', url)}
              />
              <RoleImageBucket
                role="garment"
                urls={manualGarmentRefs}
                upstreamImages={upstream.images}
                active={activeRole === 'garment'}
                uploading={uploadingRole === 'garment'}
                onActivate={() => setActiveRole('garment')}
                onUpload={(files) => void uploadRoleFiles('garment', files)}
                onAdd={(url) => addRoleRef('garment', url)}
                onRemove={(url) => removeRoleRef('garment', url)}
              />
              <RoleImageBucket
                role="style"
                urls={manualStyleRefs}
                upstreamImages={upstream.images}
                active={activeRole === 'style'}
                uploading={uploadingRole === 'style'}
                onActivate={() => setActiveRole('style')}
                onUpload={(files) => void uploadRoleFiles('style', files)}
                onAdd={(url) => addRoleRef('style', url)}
                onRemove={(url) => removeRoleRef('style', url)}
              />
              <details className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
                <summary className="cursor-pointer text-[10px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>高级 URL</summary>
                <div className="mt-2 space-y-2">
                  <label>
                    <FieldLabel>模特参考 URL</FieldLabel>
                    <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackModelRefs || '')} onChange={(event) => update({ apparelPackModelRefs: event.target.value })} />
                  </label>
                  <label>
                    <FieldLabel>服装参考 URL</FieldLabel>
                    <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackGarmentRefs || '')} onChange={(event) => update({ apparelPackGarmentRefs: event.target.value })} />
                  </label>
                  <label>
                    <FieldLabel>风格参考 URL</FieldLabel>
                    <textarea className="t8-textarea nodrag nowheel min-h-[38px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackStyleRefs || '')} onChange={(event) => update({ apparelPackStyleRefs: event.target.value })} />
                  </label>
                </div>
              </details>
            </div>
          </details>

          <div className="grid grid-cols-2 gap-2 rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <div>
              <FieldLabel>将创建</FieldLabel>
              <div className="text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>
                {previewPlan.summary.imageCount} 图 · {previewPlan.nodes.length} 节点
              </div>
            </div>
            <div>
              <FieldLabel>锚点</FieldLabel>
              <div className="text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>
                {previewPlan.summary.anchorCount} 个一致性锚点
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="t8-btn w-full justify-center px-3 py-2 text-sm" disabled={running} onClick={() => void applyPlan(false)}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <PackageOpen size={14} />}
              展开流程
            </button>
            <button type="button" className="t8-btn t8-btn-primary w-full justify-center px-3 py-2 text-sm" disabled={running} onClick={() => void applyPlan(true)}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              展开并生成
            </button>
          </div>

          {error && (
            <div className="rounded-md border px-2 py-1.5 text-[11px]" style={{ borderColor: '#ef444466', color: 'var(--t8-danger, #ef4444)' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ApparelPackNode);
