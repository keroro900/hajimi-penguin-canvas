import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { FileText, ImagePlus, Images, LayoutDashboard, Loader2, PackageOpen, RotateCcw, SlidersHorizontal, Sparkles, Trash2, WandSparkles, X } from 'lucide-react';
import { useRunBusStore } from '../../stores/runBus';
import { uploadFile } from '../../services/generation';
import { useMaterialDropTarget } from '../../hooks/useMaterialDropTarget';
import type { MaterialPayload } from '../../stores/dragMaterial';
import {
  IMAGE_MODELS,
  configuredLlmModelLabel,
  llmModelOptionsFromSettings,
  parseModelList,
  resolveConfiguredLlmModel,
  withUpstreamModelOption,
} from '../../providers/models';
import { effectiveModelId, modelSelectOptions, modelsForKind } from '../../providers/modelCatalog';
import { useApiKeysStore } from '../../stores/apiKeys';
import {
  APPAREL_PACK_MODE_OPTIONS,
  APPAREL_PACK_PRESETS,
  MAX_APPAREL_PACK_SHOTS,
  buildApparelPackSkillProfileAgentPrompt,
  buildApparelPackPlan,
  collectApparelPackPromptSteps,
  compileApparelPackSkillProfile,
  parseApparelPackSkillProfileAgentJson,
  type ApparelPackSkillProfile,
  type ApparelPackSkillSource,
  type ApparelPackImageQuality,
  type ApparelPackImageSubmitMode,
  type ApparelPackMode,
  type ApparelPackPromptOverrides,
  type ApparelPackPromptStep,
  type ApparelPackPresetItem,
} from '../../utils/apparelPackPlan';
import { getCodexCliSkills, streamCodexCliAgent, type CodexSkill } from '../../services/codexCli';
import { defaultSizeOf, placeBatchNodes, type Rect as PlacementRect } from '../../utils/nodePlacement';
import SmartImage from '../SmartImage';
import { SmartNodeFloatingPanel, SmartNodeModalPage } from './shared/SmartNodeModalLayer';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';

type SelectOption = {
  value: string;
  label: string;
};

type EditablePromptField = 'systemPrompt' | 'userPrompt';

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
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const MODEL_POLICY_OPTIONS: SelectOption[] = [
  { value: 'generic', label: '泛化模特' },
  { value: 'no-face', label: '不露脸' },
  { value: 'body-crop', label: '身体局部' },
];


type RoleKey = 'model' | 'garmentFront' | 'garmentBack' | 'garmentLeft' | 'garmentRight' | 'garmentDetail' | 'style';

const ROLE_META: Record<RoleKey, { label: string; field: string; empty: string }> = {
  model: { label: '模特参考', field: 'apparelPackModelRefs', empty: '拖入/上传模特图' },
  garmentFront: { label: '正面参考', field: 'apparelPackGarmentFrontRefs', empty: '拖入服装正面' },
  garmentBack: { label: '背面参考', field: 'apparelPackGarmentBackRefs', empty: '拖入服装背面' },
  garmentLeft: { label: '左侧参考', field: 'apparelPackGarmentLeftRefs', empty: '拖入左侧/侧面' },
  garmentRight: { label: '右侧参考', field: 'apparelPackGarmentRightRefs', empty: '拖入右侧/侧面' },
  garmentDetail: { label: '细节参考', field: 'apparelPackGarmentDetailRefs', empty: '拖入面料/辅料细节' },
  style: { label: '风格参考', field: 'apparelPackStyleRefs', empty: '拖入/上传风格图' },
};

const GARMENT_DIRECTION_ROLES: RoleKey[] = ['garmentFront', 'garmentBack', 'garmentLeft', 'garmentRight', 'garmentDetail'];

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
  showHint = true,
  onChange,
  onCustomChange,
}: {
  label: string;
  value: string;
  options: ApparelPackPresetItem[];
  customValue: string;
  customPlaceholder?: string;
  showHint?: boolean;
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
      {showHint && <TinyHint>{selectedPreset.prompt}</TinyHint>}
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

function splitGarmentDirectionRefs(urls: string[]): {
  front: string[];
  back: string[];
  left: string[];
  right: string[];
  detail: string[];
} {
  const clean = mergeUnique(urls);
  if (clean.length >= 4) {
    return {
      front: clean.slice(0, 2),
      back: clean.slice(2, 4),
      left: [],
      right: [],
      detail: clean.slice(4),
    };
  }
  if (clean.length === 3) {
    return {
      front: clean.slice(0, 2),
      back: clean.slice(2),
      left: [],
      right: [],
      detail: [],
    };
  }
  return {
    front: clean,
    back: [],
    left: [],
    right: [],
    detail: [],
  };
}

function removeRef(urls: string[], url: string): string[] {
  return urls.filter((item) => item !== url);
}

function normalizePromptOverrides(value: unknown): ApparelPackPromptOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ApparelPackPromptOverrides;
}

function normalizeSkillNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

function normalizeSkillProfile(value: unknown): ApparelPackSkillProfile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const profile = value as ApparelPackSkillProfile;
  return profile.version === 'apparel-skill-profile-v1' ? profile : undefined;
}

function codexSkillToProfileSource(skill: CodexSkill): ApparelPackSkillSource {
  return {
    name: skill.name,
    label: skill.name,
    description: skill.description,
    body: skill.body,
    scope: skill.scope,
    directions: skill.directions,
    questions: skill.questions,
    templates: skill.templates,
    verification: skill.verification,
  };
}

function isUsefulWorkbenchSkill(skill: CodexSkill): boolean {
  const text = `${skill.name} ${skill.description} ${skill.category || ''}`.toLowerCase();
  return skill.scope === 'project' || /apparel|fashion|model|tryon|prompt|visual|qa|consistency|ecommerce|children|kids|服装|童装|提示词|质检/.test(text);
}

function SkillAgentPanel({
  compact = false,
  skills,
  selectedSkillNames,
  skillsLoading,
  skillsError,
  userPrompt,
  profile,
  draft,
  draftRaw,
  draftStatus,
  draftError,
  onToggleSkill,
  onPromptChange,
  onCompile,
  onDraft,
  onApplyDraft,
  onClear,
  onReload,
}: {
  compact?: boolean;
  skills: CodexSkill[];
  selectedSkillNames: string[];
  skillsLoading: boolean;
  skillsError: string;
  userPrompt: string;
  profile?: ApparelPackSkillProfile;
  draft?: ApparelPackSkillProfile;
  draftRaw: string;
  draftStatus: string;
  draftError: string;
  onToggleSkill: (skillName: string) => void;
  onPromptChange: (value: string) => void;
  onCompile: () => void;
  onDraft: () => void;
  onApplyDraft: () => void;
  onClear: () => void;
  onReload: () => void;
}) {
  const selectedSet = new Set(selectedSkillNames);
  const selectedSkills = skills.filter((skill) => selectedSet.has(skill.name));
  const tracePreview = profile?.trace.slice(0, compact ? 3 : 10) || [];
  const draftTracePreview = draft?.trace.slice(0, compact ? 2 : 6) || [];
  const draftBusy = draftStatus === 'running';
  const draftStatusLabel = draftBusy
    ? '生成中'
    : draftStatus === 'success'
      ? '已生成'
      : draftStatus === 'applied'
        ? '已应用'
        : draftStatus === 'error'
          ? '失败'
          : '未生成';
  const showDraftPanel = !compact || Boolean(draft) || draftBusy || Boolean(draftError);
  return (
    <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>Skills + Agent 工作台</div>
          <div className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>用户提示词优先 → 手动配置 → Skill profile → 默认预设</div>
        </div>
        <button type="button" className="t8-btn shrink-0 px-2 py-1 text-[10px]" onClick={onReload}>
          {skillsLoading ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
          刷新
        </button>
      </div>
      <div className="grid gap-2">
        <label>
          <FieldLabel>用户补充提示词</FieldLabel>
          <textarea
            className="t8-textarea nodrag nowheel min-h-[54px] w-full px-2 py-1.5 text-[11px]"
            value={userPrompt}
            placeholder="例如：导入童装生图 skill 后，按睡衣场景、欧美白人可爱模特、iPhone 日常感自动规划全部步骤。"
            onChange={(event) => onPromptChange(event.target.value)}
          />
        </label>
        <div className="rounded border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <FieldLabel>可用 Skills</FieldLabel>
            <span className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>{selectedSkillNames.length} / {skills.length}</span>
          </div>
          <div className={`grid gap-1 ${compact ? 'max-h-[96px]' : 'max-h-[190px]'} overflow-y-auto pr-1`}>
            {skills.map((skill) => {
              const active = selectedSet.has(skill.name);
              return (
                <label
                  key={skill.name}
                  className="flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 text-[10px]"
                  style={{
                    borderColor: active ? 'var(--t8-accent, #14b8a6)' : 'var(--t8-border)',
                    color: 'var(--t8-text-main)',
                    background: active ? 'color-mix(in srgb, var(--t8-accent, #14b8a6) 10%, transparent)' : 'transparent',
                  }}
                >
                  <input className="nodrag mt-0.5" type="checkbox" checked={active} onChange={() => onToggleSkill(skill.name)} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{skill.name}</span>
                    {!compact && <span className="line-clamp-2 opacity-70">{skill.description}</span>}
                  </span>
                </label>
              );
            })}
            {!skillsLoading && skills.length === 0 && (
              <div className="rounded border border-dashed px-2 py-2 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-dim)' }}>
                未发现可用 Skill；可以先在 Codex Agent 的项目 Skill 库导入。
              </div>
            )}
          </div>
          {skillsError && <div className="mt-1 text-[10px]" style={{ color: 'var(--t8-danger, #ef4444)' }}>{skillsError}</div>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="t8-btn t8-btn-primary justify-center px-3 py-2 text-[11px]" onClick={onCompile}>
            <WandSparkles size={12} />
            分析并应用
          </button>
          <button type="button" className="t8-btn justify-center px-3 py-2 text-[11px]" disabled={draftBusy} onClick={onDraft}>
            {draftBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            LLM 草案
          </button>
          <button type="button" className="t8-btn justify-center px-3 py-2 text-[11px]" onClick={onClear}>
            <RotateCcw size={12} />
            清空
          </button>
        </div>
      </div>
      {showDraftPanel && (
        <div className="mt-2 rounded border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <FieldLabel>Profile 草案</FieldLabel>
            <span
              className="rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: draftStatus === 'error' ? '#ef444466' : 'var(--t8-border)', color: draftStatus === 'error' ? 'var(--t8-danger, #ef4444)' : 'var(--t8-text-dim)' }}
            >
              {draftStatusLabel}
            </span>
          </div>
          {draft ? (
            <div className="space-y-2">
              <div className="rounded border p-2 text-[10px] leading-relaxed" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)', background: 'var(--t8-bg-panel-muted)' }}>
                <b style={{ color: 'var(--t8-text-main)' }}>{draft.title}</b>
                <div className={compact ? 'line-clamp-3 whitespace-pre-line' : 'mt-1 whitespace-pre-line'}>{draft.readableSummary}</div>
                {!compact && draftTracePreview.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {draftTracePreview.map((item) => (
                      <span key={`draft-${item.field}-${item.value}-${item.sourceName}`} className="rounded border px-1.5 py-0.5" style={{ borderColor: 'var(--t8-border)' }}>
                        {item.field}: {item.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="t8-btn t8-btn-primary w-full justify-center px-3 py-2 text-[11px]" onClick={onApplyDraft}>
                <WandSparkles size={12} />
                应用草案
              </button>
            </div>
          ) : (
            <TinyHint>点击“LLM 草案”后，会先生成可读 profile，不会自动改节点配置。</TinyHint>
          )}
          {draftError && (
            <div className="mt-1 rounded border px-2 py-1 text-[10px]" style={{ borderColor: '#ef444466', color: 'var(--t8-danger, #ef4444)' }}>
              {draftError}
            </div>
          )}
          {!compact && draftRaw && (
            <details className="mt-2 rounded border p-2" style={{ borderColor: 'var(--t8-border)' }}>
              <summary className="cursor-pointer text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>LLM 原始输出</summary>
              <textarea className="t8-textarea nodrag nowheel mt-2 min-h-[160px] w-full px-2 py-1.5 font-mono text-[10px]" value={draftRaw} readOnly />
            </details>
          )}
        </div>
      )}
      {profile ? (
        <div className="mt-2 space-y-2">
          <div className="rounded border p-2 text-[10px] leading-relaxed" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)', background: 'var(--t8-bg-panel)' }}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <b style={{ color: 'var(--t8-text-main)' }}>{profile.title}</b>
              <span className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--t8-border)' }}>{profile.version}</span>
            </div>
            <div className={compact ? 'line-clamp-4 whitespace-pre-line' : 'whitespace-pre-line'}>{profile.readableSummary}</div>
          </div>
          {!compact && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border p-2" style={{ borderColor: 'var(--t8-border)' }}>
                  <FieldLabel>已应用 Skills</FieldLabel>
                  <div className="mt-1 space-y-1">
                    {profile.sourceSkills.map((skill) => (
                      <div key={skill.name} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                        <b style={{ color: 'var(--t8-text-main)' }}>{skill.name}</b> · {skill.role}
                      </div>
                    ))}
                    {profile.sourceSkills.length === 0 && <TinyHint>未选择 Skill，使用默认 profile。</TinyHint>}
                  </div>
                </div>
                <div className="rounded border p-2" style={{ borderColor: 'var(--t8-border)' }}>
                  <FieldLabel>自动预设</FieldLabel>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(profile.presets).map(([field, preset]) => (
                      <span key={field} className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                        {preset.label}: <b style={{ color: 'var(--t8-text-main)' }}>{preset.value}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded border p-2" style={{ borderColor: 'var(--t8-border)' }}>
                <FieldLabel>全流程步骤</FieldLabel>
                <div className="mt-1 grid gap-1">
                  {profile.steps.map((step, index) => (
                    <div key={step.id} className="rounded border px-2 py-1.5 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                      <b style={{ color: 'var(--t8-text-main)' }}>{String(index + 1).padStart(2, '0')} {step.label}</b>
                      <div className="mt-0.5 line-clamp-2">{step.goal}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border p-2" style={{ borderColor: 'var(--t8-border)' }}>
                  <FieldLabel>来源追溯</FieldLabel>
                  <div className="mt-1 space-y-1">
                    {tracePreview.map((item) => (
                      <div key={`${item.field}-${item.value}-${item.sourceName}`} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                        <b style={{ color: 'var(--t8-text-main)' }}>{item.field}</b> = {item.value}
                        <div>{item.sourceType} · {item.sourceName}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded border p-2" style={{ borderColor: 'var(--t8-border)' }}>
                  <FieldLabel>冲突与覆盖</FieldLabel>
                  <div className="mt-1 space-y-1">
                    {profile.conflicts.map((item) => (
                      <div key={`${item.field}-${item.chosen}`} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                        <b style={{ color: 'var(--t8-text-main)' }}>{item.field}</b> → {item.chosen}
                        <div>{item.reason}</div>
                      </div>
                    ))}
                    {profile.conflicts.length === 0 && <TinyHint>暂无冲突；当前 profile 可直接执行。</TinyHint>}
                  </div>
                </div>
              </div>
              <details className="rounded border p-2" style={{ borderColor: 'var(--t8-border)' }}>
                <summary className="cursor-pointer text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>Profile JSON</summary>
                <textarea className="t8-textarea nodrag nowheel mt-2 min-h-[220px] w-full px-2 py-1.5 font-mono text-[10px]" value={profile.json} readOnly />
              </details>
            </>
          )}
        </div>
      ) : (
        <TinyHint>{selectedSkills.length ? '选择 Skill 后点击“分析并应用”，会生成可读 profile 和 JSON 合同。' : '可以先选择一个或多个 Skill，再让内嵌 agent 规划剩余步骤。'}</TinyHint>
      )}
    </div>
  );
}

function PromptDiffPanel({
  step,
  compact = false,
}: {
  step: ApparelPackPromptStep;
  compact?: boolean;
}) {
  const diff = step.translationDiff;
  const missing = diff.missingKeywords.length ? diff.missingKeywords.join('、') : '无缺失';
  const covered = diff.keywordPairs.filter((item) => item.status === 'covered');
  return (
    <div
      className="rounded-md border p-2 text-[10px] leading-relaxed"
      style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)', color: 'var(--t8-text-muted)' }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ color: 'var(--t8-text-main)' }}>翻译diff</span>
        <span
          className="rounded border px-1.5 py-0.5"
          style={{
            borderColor: diff.coverageScore >= 80 ? 'color-mix(in srgb, var(--t8-success, #22c55e) 45%, var(--t8-border))' : 'var(--t8-border)',
            color: diff.coverageScore >= 80 ? 'var(--t8-success, #22c55e)' : 'var(--t8-text-muted)',
          }}
        >
          {diff.coverageScore}%
        </span>
      </div>
      <div>{diff.summary}</div>
      {!compact && (
        <>
          <div className="mt-1">缺失关键词：{missing}</div>
          <div className="mt-1 line-clamp-2">
            已覆盖：{covered.length ? covered.map((item) => `${item.zh}/${item.en}`).join('、') : '暂无'}
          </div>
        </>
      )}
    </div>
  );
}

function BilingualPromptPreview({ step }: { step: ApparelPackPromptStep }) {
  return (
    <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <FieldLabel>中英对照</FieldLabel>
        <span className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>中文只作意图校验，英文用于执行</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="min-w-0 rounded border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
          <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>中文意图</div>
          <div className="line-clamp-5 text-[10px] leading-relaxed" style={{ color: 'var(--t8-text-main)' }}>
            {step.defaultUserPromptZh || step.userPromptZh || '暂无中文预设'}
          </div>
        </div>
        <div className="min-w-0 rounded border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
          <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>英文执行</div>
          <div className="line-clamp-5 text-[10px] leading-relaxed" style={{ color: 'var(--t8-text-main)' }}>
            {step.defaultUserPromptEn || step.userPromptEn || step.userPrompt}
          </div>
        </div>
      </div>
    </div>
  );
}

function QualityGateSummary({ gate }: { gate: any }) {
  if (!gate || typeof gate !== 'object') return null;
  const mustPass = Array.isArray(gate.mustPass) ? gate.mustPass.slice(0, 5) : [];
  const retryPatchTemplate = gate.retryPatchTemplate || {};
  const finalPromptPatch = String(retryPatchTemplate.finalPromptPatch || '');
  return (
    <div className="rounded border p-1.5 text-[9px] leading-snug" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ color: 'var(--t8-text-main)' }}>质量门槛</span>
        <span className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-dim)' }}>
          {String(gate.kind || gate.role || 'gate')}
        </span>
      </div>
      {mustPass.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mustPass.map((item: string) => (
            <span key={item} className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
              {item}
            </span>
          ))}
        </div>
      )}
      {finalPromptPatch && (
        <div className="mt-1 line-clamp-2" style={{ color: 'var(--t8-text-dim)' }} title={finalPromptPatch}>
          重试补丁：{finalPromptPatch}
        </div>
      )}
    </div>
  );
}

function PromptPanel({
  steps,
  onChange,
  onReset,
  onClose,
}: {
  steps: ApparelPackPromptStep[];
  onChange: (key: string, field: EditablePromptField, value: string) => void;
  onReset: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="nodrag nowheel absolute left-full top-0 z-50 ml-3 w-[560px] overflow-hidden rounded-lg border shadow-2xl"
      style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--t8-border)' }}>
        <div className="min-w-0">
          <div className="text-sm font-bold" style={{ color: 'var(--t8-text-main)' }}>提示词预设</div>
          <div className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>每一步系统提示词 / 用户提示词 / 中英对照</div>
        </div>
        <button type="button" className="t8-btn h-8 w-8 justify-center px-0" onClick={onClose} title="关闭提示词面板">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
        {steps.map((step, index) => (
          <details key={`${step.key}-${step.nodeId}`} className="rounded-md border p-2" open={index < 2} style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            <summary className="cursor-pointer text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>
              {String(index + 1).padStart(2, '0')} {step.label}
            </summary>
            <div className="mt-2 space-y-2">
              <label className="block">
                <FieldLabel>系统提示词</FieldLabel>
                <textarea
                  className="t8-textarea nodrag nowheel min-h-[86px] w-full px-2 py-1.5 text-[11px]"
                  value={step.systemPrompt}
                  onChange={(event) => onChange(step.key, 'systemPrompt', event.target.value)}
                />
              </label>
              <label className="block">
                <FieldLabel>用户提示词</FieldLabel>
                <textarea
                  className="t8-textarea nodrag nowheel min-h-[112px] w-full px-2 py-1.5 text-[11px]"
                  value={step.userPrompt}
                  onChange={(event) => onChange(step.key, 'userPrompt', event.target.value)}
                />
              </label>
              <BilingualPromptPreview step={step} />
              <PromptDiffPanel step={step} compact />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>{step.key}</span>
                <button type="button" className="t8-btn px-2 py-1 text-[10px]" onClick={() => onReset(step.key)}>
                  <RotateCcw size={11} />
                  重置预设
                </button>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function ImageParamPanel({
  model,
  modelDef,
  apiModel,
  apiModelOptions,
  outputRatio,
  sizeLevel,
  imageQuality,
  imageSubmitMode,
  llmModel,
  llmApiModel,
  llmModelOptions,
  onModelChange,
  onApiModelChange,
  onLlmModelChange,
  onLlmApiModelChange,
  onUpdate,
  onClose,
}: {
  model: string;
  modelDef: (typeof IMAGE_MODELS)[number];
  apiModel: string;
  apiModelOptions: SelectOption[];
  outputRatio: string;
  sizeLevel: string;
  imageQuality: 'auto' | 'low' | 'medium' | 'high';
  imageSubmitMode: 'async' | 'sync';
  llmModel: string;
  llmApiModel: string;
  llmModelOptions: SelectOption[];
  onModelChange: (value: string) => void;
  onApiModelChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onLlmApiModelChange: (value: string) => void;
  onUpdate: (patch: Record<string, any>) => void;
  onClose: () => void;
}) {
  const ratioOptions = modelDef.aspectRatios.map((value) => ({
    value,
    label: RATIO_OPTIONS.find((item) => item.value === value)?.label || value,
  }));
  const sizeOptions = modelDef.sizes.map((value) => ({
    value,
    label: SIZE_OPTIONS.find((item) => item.value === value)?.label || value,
  }));
  return (
    <SmartNodeFloatingPanel
      open
      title="生成参数"
      subtitle="生图参数和 LLM 定稿模型分开配置"
      width={540}
      nested
      onClose={onClose}
    >
      <div className="space-y-3 p-3">
        <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>生图模型</FieldLabel>
            <span className="truncate text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>{apiModel}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <SelectField
              label="模型"
              value={apiModel}
              options={apiModelOptions}
              onChange={onModelChange}
            />
            <SelectField
              label="提交方式"
              value={imageSubmitMode}
              options={[
                { value: 'async', label: '异步' },
                { value: 'sync', label: '同步' },
              ]}
              onChange={(value) => onUpdate({ apparelPackImageSubmitMode: value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
          <SelectField
            label="比例"
            value={outputRatio}
            options={ratioOptions}
            onChange={(value) => onUpdate({ apparelPackOutputRatio: value })}
          />
          {modelDef.sizes.length > 0 && (
            <SelectField
              label="尺寸"
              value={sizeLevel}
              options={sizeOptions}
              onChange={(value) => onUpdate({ apparelPackSizeLevel: value })}
            />
          )}
          {modelDef.paramKind === 'gpt-size' && (
            <SelectField
              label="质量"
              value={imageQuality}
              options={[
                { value: 'auto', label: '自动' },
                { value: 'low', label: '低' },
                { value: 'medium', label: '中' },
                { value: 'high', label: '高' },
              ]}
              onChange={(value) => onUpdate({ apparelPackImageQuality: value })}
            />
          )}
        </div>
        <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <FieldLabel>LLM模型</FieldLabel>
            <span className="truncate text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>首图定稿 / 提示词 agent / QA</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="模型"
              value={llmModel}
              options={llmModelOptions}
              onChange={onLlmModelChange}
            />
            <SelectField
              label="实际调用"
              value={llmApiModel}
              options={llmModelOptions}
              onChange={onLlmApiModelChange}
            />
          </div>
        </div>
        <TinyHint>默认推荐 GPT Image 2、4K、质量自动；LLM 模型用于首图定稿、提示词生成和质量调优。</TinyHint>
      </div>
    </SmartNodeFloatingPanel>
  );
}

function ApparelPackWorkbench({
  modeLabel,
  modelLabel,
  modelSummary,
  modelRefs,
  garmentRefs,
  styleRefs,
  flowPlan,
  promptSteps,
  enableQualityQa,
  qualityThreshold,
  qualityPrompt,
  skillPanel,
  lastPlanSummary,
  lastRunNodeIds,
  workbenchControlPanel,
  workbenchMaterialPanel,
  onPromptChange,
  onPromptReset,
  onUpdate,
  onOpenParams,
  onClose,
}: {
  modeLabel: string;
  modelLabel: string;
  modelSummary: string;
  modelRefs: string[];
  garmentRefs: string[];
  styleRefs: string[];
  flowPlan: ReturnType<typeof buildApparelPackPlan>;
  promptSteps: ApparelPackPromptStep[];
  enableQualityQa: boolean;
  qualityThreshold: string;
  qualityPrompt: string;
  skillPanel: React.ReactNode;
  lastPlanSummary: any;
  lastRunNodeIds: string[];
  workbenchControlPanel: React.ReactNode;
  workbenchMaterialPanel: React.ReactNode;
  onPromptChange: (key: string, field: EditablePromptField, value: string) => void;
  onPromptReset: (key: string) => void;
  onUpdate: (patch: Record<string, any>) => void;
  onOpenParams: () => void;
  onClose: () => void;
}) {
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [activePromptKey, setActivePromptKey] = useState(promptSteps[0]?.key || '');
  const nodeLabelById = new Map(flowPlan.nodes.map((node) => [
    node.id,
    String((node.data as any)?.label || (node.data as any)?.lineageRole || (node.data as any)?.agentRole || node.type),
  ]));
  const workbenchImageNodes = flowPlan.nodes.filter((node) => node.type === 'image');
  const activePromptStep = promptSteps.find((step) => step.key === activePromptKey) || promptSteps[0];
  const previewUrlFor = (node: any) => {
    const data = node.data || {};
    return String(
      data.imageUrl
      || data.url
      || data.resultUrl
      || data.outputUrl
      || data.generatedUrl
      || data.generatedImageUrl
      || data.referenceImages?.[0]
      || data.sourceUrls?.[0]
      || '',
    );
  };
  const openPromptEditor = (step: ApparelPackPromptStep) => {
    setActivePromptKey(step.key);
    setPromptEditorOpen(true);
  };
  return (
    <SmartNodeModalPage
      open
      title="服装封包工作台"
      subtitle={`${modeLabel} · ${modelSummary}`}
      icon={<LayoutDashboard size={16} />}
      size="workbench"
      onClose={onClose}
      actions={(
        <>
          <button type="button" className="t8-btn px-2 py-1 text-[11px]" onClick={onOpenParams} title="打开生图参数">
            <SlidersHorizontal size={12} />
            生图参数
          </button>
        </>
      )}
    >
      <>
      <div className="grid h-full grid-cols-[280px_minmax(520px,1fr)_340px] gap-3 overflow-hidden p-3">
        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            <FieldLabel>项目设置</FieldLabel>
            <div className="mt-2 space-y-1.5 text-[11px]" style={{ color: 'var(--t8-text-main)' }}>
              <div className="flex justify-between gap-2"><span style={{ color: 'var(--t8-text-dim)' }}>模式</span><b>{modeLabel}</b></div>
              <div className="flex justify-between gap-2"><span style={{ color: 'var(--t8-text-dim)' }}>模型</span><b>{modelLabel}</b></div>
              <div className="flex justify-between gap-2"><span style={{ color: 'var(--t8-text-dim)' }}>生成</span><b>{flowPlan.summary.imageCount} 图</b></div>
              <div className="flex justify-between gap-2"><span style={{ color: 'var(--t8-text-dim)' }}>锚点</span><b>{flowPlan.summary.anchorCount}</b></div>
            </div>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <div className="mb-2 text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>工作台设置</div>
            {workbenchControlPanel}
          </div>
          {skillPanel}
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <FieldLabel>素材角色</FieldLabel>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
              <div className="rounded border px-1 py-1" style={{ borderColor: 'var(--t8-border)' }}>模特 {modelRefs.length}</div>
              <div className="rounded border px-1 py-1" style={{ borderColor: 'var(--t8-border)' }}>服装 {garmentRefs.length}</div>
              <div className="rounded border px-1 py-1" style={{ borderColor: 'var(--t8-border)' }}>风格 {styleRefs.length}</div>
            </div>
            <TinyHint>没有打开工作台时也会按这些预设自动展开。首图定稿后，背面、平铺、挂拍和细节会沿用锚点。</TinyHint>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <div className="mb-2 text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>工作台素材</div>
            {workbenchMaterialPanel}
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <FieldLabel>执行摘要</FieldLabel>
            <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--t8-text-muted)' }}>
              首图先由小 agent 定稿服装真值、模特外观、动作、镜头、背景元素；后续节点只改一个变量，减少服装和模特漂移。
            </div>
          </div>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <div className="rounded-md border p-3" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>全流程 · 生成过程</div>
                <div className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>按阶段运行，前一阶段作为后一阶段锚点</div>
              </div>
              <span className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                {flowPlan.runStages.length} 阶段
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
              {flowPlan.runStages.map((stage, index) => (
                <div key={`stage-${index}`} className="min-h-[72px] rounded border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel)' }}>
                  <div className="mb-1 flex items-center justify-between gap-1 text-[10px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>
                    <span>阶段 {index + 1}</span>
                    <span>{stage.length}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {stage.map((nodeId) => (
                      <span key={nodeId} className="truncate rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-main)' }}>
                        {nodeLabelById.get(nodeId) || nodeId}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border p-3" style={{ borderColor: 'var(--t8-border)' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>图片结果</div>
                <div className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>未生成时显示参考图或占位，生成后用于检查套图一致性</div>
              </div>
              <span className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                {workbenchImageNodes.length} 张
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
              {workbenchImageNodes.map((node, index) => {
                const data = (node.data || {}) as any;
                const previewUrl = previewUrlFor(node);
                const gate = data.apparelPackQualityGate;
                return (
                  <div key={node.id} className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
                    <div className="relative aspect-[3/4] overflow-hidden" style={{ background: 'var(--t8-bg-panel)' }}>
                      {previewUrl ? (
                        <SmartImage src={previewUrl} alt={data.label || data.lineageRole || node.id} className="h-full w-full object-cover" thumbSize={360} draggable={false} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px]" style={{ color: 'var(--t8-text-dim)' }}>
                          待生成
                        </div>
                      )}
                      <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="truncate text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>{data.label || data.lineageRole || node.id}</div>
                      <div className="truncate text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>{data.lineageRole || data.promptKey || 'image'}</div>
                      <QualityGateSummary gate={gate} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>提示词配置</div>
                <div className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>侧面只看摘要，详细内容进弹窗调整</div>
              </div>
              {activePromptStep && (
                <button type="button" className="t8-btn px-2 py-1 text-[10px]" onClick={() => openPromptEditor(activePromptStep)}>
                  <FileText size={11} />
                  调整提示词
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {promptSteps.map((step, index) => (
                <button
                  key={`${step.key}-${step.nodeId}`}
                  type="button"
                  className={`w-full rounded-md border p-2 text-left ${activePromptStep?.key === step.key ? 't8-btn-primary' : ''}`}
                  style={{ borderColor: 'var(--t8-border)' }}
                  onClick={() => openPromptEditor(step)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-bold">{String(index + 1).padStart(2, '0')} {step.label}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded border px-1 py-0.5 text-[9px] opacity-80" style={{ borderColor: 'var(--t8-border)' }}>中英对照</span>
                      <span className="rounded border px-1 py-0.5 text-[9px] opacity-80" style={{ borderColor: 'var(--t8-border)' }}>翻译diff {step.translationDiff.coverageScore}%</span>
                      <span className="text-[10px] opacity-70">
                        {step.systemPrompt !== step.defaultSystemPrompt || step.userPrompt !== step.defaultUserPrompt ? '已改' : '预设'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-75">
                    {step.defaultUserPromptZh || step.userPromptZh || step.userPrompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            <div className="text-[12px] font-bold" style={{ color: 'var(--t8-text-main)' }}>调优</div>
            <label className="mt-2 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--t8-text-main)' }}>
              <span>生成后质检</span>
              <input className="nodrag" type="checkbox" checked={enableQualityQa} onChange={(event) => onUpdate({ apparelPackEnableQualityQa: event.target.checked })} />
            </label>
            <div className="mt-2 space-y-2">
              <SelectField
                label="质检标准"
                value={qualityThreshold}
                options={APPAREL_PACK_PRESETS.qualityThresholds.map((item) => ({ value: item.id, label: item.label }))}
                onChange={(value) => onUpdate({ apparelPackQualityThreshold: value })}
              />
              <label>
                <FieldLabel>重点检查</FieldLabel>
                <textarea
                  className="t8-textarea nodrag nowheel min-h-[80px] w-full px-2 py-1.5 text-[11px]"
                  value={qualityPrompt}
                  placeholder="例如：重点检查印花、上下装完整、模特一致、背景是否呼应服装元素"
                  onChange={(event) => onUpdate({ apparelPackQualityPrompt: event.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <FieldLabel>上次展开</FieldLabel>
            <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--t8-text-muted)' }}>
              {lastPlanSummary
                ? `${lastPlanSummary.imageCount || 0} 图，${lastRunNodeIds.length} 个运行节点`
                : '暂无记录'}
            </div>
          </div>
          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
            <FieldLabel>调参顺序</FieldLabel>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>
              <li>先调首图系统/用户提示词。</li>
              <li>首图稳定后再调派生图。</li>
              <li>服装错误优先加强服装真值。</li>
              <li>人体错误先降低动作复杂度。</li>
            </ol>
          </div>
        </div>
      </div>
      {promptEditorOpen && activePromptStep && (
        <SmartNodeFloatingPanel
          open
          title="调整提示词"
          subtitle={activePromptStep.label}
          width={960}
          nested
          onClose={() => setPromptEditorOpen(false)}
          actions={(
            <button type="button" className="t8-btn px-2 py-1 text-[10px]" onClick={() => onPromptReset(activePromptStep.key)}>
              <RotateCcw size={11} />
              重置
            </button>
          )}
        >
          <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-dim)' }}>
                <span className="truncate">{activePromptStep.key}</span>
                <span>编辑英文执行提示词；中文用于确认意图没有丢。</span>
              </div>
              <label className="block min-w-0">
                <FieldLabel>英文系统提示词</FieldLabel>
                <textarea
                  className="t8-textarea nodrag nowheel min-h-[190px] w-full px-3 py-2 text-[11px]"
                  value={activePromptStep.systemPrompt}
                  onChange={(event) => onPromptChange(activePromptStep.key, 'systemPrompt', event.target.value)}
                />
              </label>
              <label className="block min-w-0">
                <FieldLabel>英文用户提示词</FieldLabel>
                <textarea
                  className="t8-textarea nodrag nowheel min-h-[250px] w-full px-3 py-2 text-[11px]"
                  value={activePromptStep.userPrompt}
                  onChange={(event) => onPromptChange(activePromptStep.key, 'userPrompt', event.target.value)}
                />
              </label>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <FieldLabel>中英对照</FieldLabel>
                  <span className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>预设中文 / 当前英文</span>
                </div>
                <label className="block">
                  <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>中文系统意图</div>
                  <textarea
                    className="t8-textarea nodrag nowheel min-h-[110px] w-full px-2 py-1.5 text-[10px]"
                    value={activePromptStep.defaultSystemPromptZh || activePromptStep.systemPromptZh}
                    readOnly
                  />
                </label>
                <label className="mt-2 block">
                  <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>中文用户意图</div>
                  <textarea
                    className="t8-textarea nodrag nowheel min-h-[170px] w-full px-2 py-1.5 text-[10px]"
                    value={activePromptStep.defaultUserPromptZh || activePromptStep.userPromptZh}
                    readOnly
                  />
                </label>
              </div>
              <PromptDiffPanel step={activePromptStep} />
              <div className="rounded-md border p-2 text-[10px] leading-relaxed" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
                <b style={{ color: 'var(--t8-text-main)' }}>调优建议：</b>
                先看中文意图是否完整，再改英文执行词。若 diff 缺少“服装/模特/背景/镜头”等关键词，优先把对应英文约束补回用户提示词。
              </div>
            </div>
          </div>
        </SmartNodeFloatingPanel>
      )}
      </>
    </SmartNodeModalPage>
  );
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
  active,
  uploading,
  onActivate,
  onUpload,
  onRemove,
}: {
  role: RoleKey;
  urls: string[];
  active: boolean;
  uploading: boolean;
  onActivate: () => void;
  onUpload: (files: File[]) => void;
  onRemove: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const meta = ROLE_META[role];
  return (
    <div
      className={`rounded-md border p-2 transition ${active ? 'ring-1' : ''}`}
      style={{
        borderColor: active ? 'var(--t8-accent, #14b8a6)' : 'var(--t8-border)',
        background: active ? 'color-mix(in srgb, var(--t8-accent, #14b8a6) 10%, transparent)' : 'var(--t8-bg-panel-muted)',
        ['--tw-ring-color' as any]: 'var(--t8-accent, #14b8a6)',
      }}
      onClick={onActivate}
      onMouseEnter={onActivate}
      onPointerEnter={onActivate}
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
        <div className="min-w-0">
          <FieldLabel>{meta.label}</FieldLabel>
          {urls.length > 0 && <div className="text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>{urls.length} 张</div>}
        </div>
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
    </div>
  );
}

function UpstreamImagePool({
  upstreamImages,
  assignedUrls,
  activeRole,
  onActivateRole,
  onAdd,
}: {
  upstreamImages: Material[];
  assignedUrls: string[];
  activeRole: RoleKey;
  onActivateRole: (role: RoleKey) => void;
  onAdd: (role: RoleKey, url: string) => void;
}) {
  const activeMeta = ROLE_META[activeRole];
  const assigned = new Set(assignedUrls);
  const unassigned = upstreamImages.filter((item) => !assigned.has(item.url));
  const visible = (unassigned.length ? unassigned : upstreamImages).slice(0, 12);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <FieldLabel>上游图片池</FieldLabel>
        <div className="truncate text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>当前加入：{activeMeta.label}</div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {visible.map((item, index) => (
          <button
            key={`apparel-upstream-${item.id}-${index}`}
            type="button"
            className="group relative aspect-square overflow-hidden rounded border"
            style={{ borderColor: assigned.has(item.url) ? 'var(--t8-accent, #14b8a6)' : 'var(--t8-border)' }}
            title={`加入${activeMeta.label}: ${item.label || item.url}`}
            data-drag-source
            data-drag-kind="image"
            data-drag-url={item.url}
            data-drag-preview={item.url}
            data-drag-node-id="apparel-pack-upstream"
            onMouseEnter={() => onActivateRole(activeRole)}
            onClick={(event) => {
              event.stopPropagation();
              onAdd(activeRole, item.url);
            }}
          >
            <SmartImage src={item.url} alt={item.label || ''} className="h-full w-full object-cover" thumbSize={120} draggable={false} />
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
              +{activeMeta.label.replace('参考', '')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ApparelPackNode({ id, data, selected }: NodeProps) {
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const upstream = useUpstreamMaterials(id);
  const [busy, setBusy] = useState(false);
  const [uploadingRole, setUploadingRole] = useState<RoleKey | null>(null);
  const [activeRole, setActiveRole] = useState<RoleKey>('garmentFront');
  const activeRoleRef = useRef<RoleKey>('garmentFront');
  const [localError, setLocalError] = useState('');
  const [showPromptPanel, setShowPromptPanel] = useState(false);
  const [showParamPanel, setShowParamPanel] = useState(false);
  const [showWorkbench, setShowWorkbench] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<CodexSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState('');
  const d = (data || {}) as any;

  const loadSkillList = async () => {
    setSkillsLoading(true);
    setSkillsError('');
    try {
      const result = await getCodexCliSkills({});
      const nextSkills = (result.skills || [])
        .filter((skill) => skill?.name && isUsefulWorkbenchSkill(skill))
        .sort((a, b) => {
          if (a.scope !== b.scope) return a.scope === 'project' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      setAvailableSkills(nextSkills);
    } catch (error: any) {
      setSkillsError(error?.message || '读取 Skill 列表失败');
    } finally {
      setSkillsLoading(false);
    }
  };

  useEffect(() => {
    void loadSkillList();
  }, []);

  const mode: ApparelPackMode = ['suite', 'garment-reference', 'inspiration'].includes(d.apparelPackMode)
    ? d.apparelPackMode
    : 'suite';
  const allUpstreamImages = upstream.images.map((item) => item.url);
  const manualModelRefs = splitUrls(d.apparelPackModelRefs);
  const manualGarmentRefs = splitUrls(d.apparelPackGarmentRefs);
  const manualGarmentFrontRefs = splitUrls(d.apparelPackGarmentFrontRefs);
  const manualGarmentBackRefs = splitUrls(d.apparelPackGarmentBackRefs);
  const manualGarmentLeftRefs = splitUrls(d.apparelPackGarmentLeftRefs);
  const manualGarmentRightRefs = splitUrls(d.apparelPackGarmentRightRefs);
  const manualGarmentDetailRefs = splitUrls(d.apparelPackGarmentDetailRefs);
  const manualStyleRefs = splitUrls(d.apparelPackStyleRefs);
  const hasManualDirectionalGarmentRefs = [
    manualGarmentFrontRefs,
    manualGarmentBackRefs,
    manualGarmentLeftRefs,
    manualGarmentRightRefs,
    manualGarmentDetailRefs,
  ].some((items) => items.length > 0);
  const autoModelRefs = mode === 'suite' && manualModelRefs.length === 0
    ? allUpstreamImages.slice(0, 1)
    : [];
  const autoGarmentRefs = manualGarmentRefs.length === 0 && !hasManualDirectionalGarmentRefs
    ? (mode === 'suite' && allUpstreamImages.length > 1 ? allUpstreamImages.slice(1) : allUpstreamImages)
    : [];
  const legacyGarmentSplit = !hasManualDirectionalGarmentRefs ? splitGarmentDirectionRefs(manualGarmentRefs) : splitGarmentDirectionRefs([]);
  const autoGarmentSplit = splitGarmentDirectionRefs(autoGarmentRefs);
  const modelRefs = mergeUnique(manualModelRefs, autoModelRefs);
  const garmentFrontRefs = mergeUnique(manualGarmentFrontRefs, legacyGarmentSplit.front, autoGarmentSplit.front);
  const garmentBackRefs = mergeUnique(manualGarmentBackRefs, legacyGarmentSplit.back, autoGarmentSplit.back);
  const garmentLeftRefs = mergeUnique(manualGarmentLeftRefs, legacyGarmentSplit.left, autoGarmentSplit.left);
  const garmentRightRefs = mergeUnique(manualGarmentRightRefs, legacyGarmentSplit.right, autoGarmentSplit.right);
  const garmentDetailRefs = mergeUnique(manualGarmentDetailRefs, legacyGarmentSplit.detail, autoGarmentSplit.detail);
  const garmentRefs = mergeUnique(garmentFrontRefs, garmentBackRefs, garmentLeftRefs, garmentRightRefs, garmentDetailRefs, manualGarmentRefs, autoGarmentRefs);
  const styleRefs = manualStyleRefs;
  const manualRefsByRole: Record<RoleKey, string[]> = {
    model: manualModelRefs,
    garmentFront: manualGarmentFrontRefs,
    garmentBack: manualGarmentBackRefs,
    garmentLeft: manualGarmentLeftRefs,
    garmentRight: manualGarmentRightRefs,
    garmentDetail: manualGarmentDetailRefs,
    style: manualStyleRefs,
  };
  const displayRefsByRole: Record<RoleKey, string[]> = {
    model: modelRefs,
    garmentFront: garmentFrontRefs,
    garmentBack: garmentBackRefs,
    garmentLeft: garmentLeftRefs,
    garmentRight: garmentRightRefs,
    garmentDetail: garmentDetailRefs,
    style: styleRefs,
  };

  const apiSettings = useApiKeysStore((state) => state.settings);
  const apparelImageModels = useMemo(() => modelsForKind(apiSettings, 'image'), [apiSettings]);
  const imageModel = effectiveModelId(d.apparelPackImageApiModel || d.apparelPackImageModelId, apparelImageModels);
  const imageModelDef = IMAGE_MODELS[0];
  const llmModelOptions = useMemo(() => llmModelOptionsFromSettings(apiSettings), [apiSettings]);
  const savedLlmModel = typeof d.apparelPackLlmModel === 'string' ? d.apparelPackLlmModel : '';
  const llmModel = resolveConfiguredLlmModel(savedLlmModel, apiSettings);
  const llmModelLabel = configuredLlmModelLabel(llmModel, apiSettings);
  const savedLlmApiModel = typeof d.apparelPackLlmApiModel === 'string' ? d.apparelPackLlmApiModel : '';
  const llmApiModel = llmModelOptions.some((option) => option.value === savedLlmApiModel) ? savedLlmApiModel : llmModel;
  const imageApiModel = imageModel;
  const imageApiModelOptions = modelSelectOptions(
    imageModel && !apparelImageModels.includes(imageModel) ? [imageModel, ...apparelImageModels] : apparelImageModels,
  );
  const outputRatio = String(d.apparelPackOutputRatio || '3:4');
  const sizeLevel = String(d.apparelPackSizeLevel || '4K');
  const imageQuality: ApparelPackImageQuality = (['auto', 'low', 'medium', 'high'].includes(String(d.apparelPackImageQuality || ''))
    ? String(d.apparelPackImageQuality)
    : 'auto') as ApparelPackImageQuality;
  const imageSubmitMode: ApparelPackImageSubmitMode = d.apparelPackImageSubmitMode === 'sync' ? 'sync' : 'async';
  const imageQualityLabel = imageQuality === 'auto' ? '质量自动' : `质量${{ low: '低', medium: '中', high: '高' }[imageQuality]}`;
  const modelParamSummary = `${imageModelDef.tabLabel} · ${imageApiModel} · ${outputRatio} · ${sizeLevel} · ${imageQualityLabel}`;
  const llmModelSummary = `LLM ${llmModelLabel || '未配置'}`;
  const generationParamSummary = `${modelParamSummary} · ${llmModelSummary}`;
  const shotCount = Math.max(1, Math.min(MAX_APPAREL_PACK_SHOTS, Math.floor(Number(d.apparelPackShotCount || 6))));
  const garmentPresetId = String(d.apparelPackGarmentPresetId || 'garment');
  const audiencePresetId = String(d.apparelPackAudiencePresetId || 'women');
  const channelPresetId = String(d.apparelPackChannelPresetId || 'marketplace');
  const useCasePresetId = String(d.apparelPackUseCasePresetId || 'auto');
  const modelLookPresetId = String(d.apparelPackModelLookPresetId || 'auto');
  const posePresetId = String(d.apparelPackPosePresetId || 'garment-led');
  const cameraPresetId = String(d.apparelPackCameraPresetId || 'iphone-natural');
  const realismPresetId = String(d.apparelPackRealismPresetId || 'daily-real');
  const garmentTypeCustom = String(d.apparelPackGarmentTypeCustom || d.apparelPackGarmentType || '');
  const audienceCustom = String(d.apparelPackAudienceCustom || d.apparelPackAudience || '');
  const channelCustom = String(d.apparelPackChannelCustom || d.apparelPackChannel || '');
  const useCaseCustom = String(d.apparelPackUseCaseCustom || d.apparelPackUseCase || '');
  const modelLookCustom = String(d.apparelPackModelLookCustom || '');
  const poseCustom = String(d.apparelPackPoseCustom || '');
  const cameraCustom = String(d.apparelPackCameraCustom || '');
  const realismCustom = String(d.apparelPackRealismCustom || '');
  const customPrompt = String(d.apparelPackCustomPrompt || '');
  const promptOverrides = useMemo(() => normalizePromptOverrides(d.apparelPackPromptOverrides), [d.apparelPackPromptOverrides]);
  const enableQualityQa = d.apparelPackEnableQualityQa !== false;
  const qualityThreshold = String(d.apparelPackQualityThreshold || 'normal');
  const selectedSkillNames = normalizeSkillNames(d.apparelPackSelectedSkillNames);
  const selectedProfileSkills = availableSkills.filter((skill) => selectedSkillNames.includes(skill.name));
  const skillUserPrompt = String(d.apparelPackSkillUserPrompt || '');
  const skillProfile = normalizeSkillProfile(d.apparelPackSkillProfile);
  const skillProfileDraft = normalizeSkillProfile(d.apparelPackSkillProfileDraft);
  const skillProfileDraftRaw = String(d.apparelPackSkillProfileDraftRaw || '');
  const skillProfileDraftStatus = String(d.apparelPackSkillProfileDraftStatus || 'idle');
  const skillProfileDraftError = String(d.apparelPackSkillProfileDraftError || '');
  const modeSummary = `${MODE_LABEL[mode]} · 上游图 ${allUpstreamImages.length} · 服装 ${garmentRefs.length}`;
  const status = String(d.status || 'idle');
  const running = status === 'running' || busy;

  const toggleSkillName = (skillName: string) => {
    const next = selectedSkillNames.includes(skillName)
      ? selectedSkillNames.filter((name) => name !== skillName)
      : [...selectedSkillNames, skillName];
    update({ apparelPackSelectedSkillNames: next });
  };

  const buildSkillProfileInput = () => ({
      mode,
      userPrompt: skillUserPrompt || customPrompt || String(d.apparelPackDirection || ''),
      currentConfig: {
        garmentPresetId,
        audiencePresetId,
        channelPresetId,
        useCasePresetId,
        modelLookPresetId,
        posePresetId,
        cameraPresetId,
        realismPresetId,
        qualityThreshold,
      },
      skills: selectedProfileSkills.map(codexSkillToProfileSource),
  });

  const applySkillProfile = (profile: ApparelPackSkillProfile, extraPatch: Record<string, any> = {}) => {
    update({
      apparelPackSkillProfile: profile,
      apparelPackSkillProfileJson: profile.json,
      apparelPackSkillProfileDirty: false,
      apparelPackGarmentPresetId: profile.presets.garmentPresetId?.value || garmentPresetId,
      apparelPackAudiencePresetId: profile.presets.audiencePresetId?.value || audiencePresetId,
      apparelPackChannelPresetId: profile.presets.channelPresetId?.value || channelPresetId,
      apparelPackUseCasePresetId: profile.presets.useCasePresetId?.value || useCasePresetId,
      apparelPackModelLookPresetId: profile.presets.modelLookPresetId?.value || modelLookPresetId,
      apparelPackPosePresetId: profile.presets.posePresetId?.value || posePresetId,
      apparelPackCameraPresetId: profile.presets.cameraPresetId?.value || cameraPresetId,
      apparelPackRealismPresetId: profile.presets.realismPresetId?.value || realismPresetId,
      apparelPackQualityThreshold: profile.presets.qualityThreshold?.value || qualityThreshold,
      apparelPackEnableQualityQa: true,
      ...extraPatch,
    });
  };

  const compileAndApplySkillProfile = () => {
    const profile = compileApparelPackSkillProfile(buildSkillProfileInput());
    applySkillProfile(profile);
  };

  const requestLlmSkillProfileDraft = async () => {
    const input = buildSkillProfileInput();
    const fallbackProfile = compileApparelPackSkillProfile(input);
    const prompt = buildApparelPackSkillProfileAgentPrompt(input, fallbackProfile);
    let raw = '';
    update({
      apparelPackSkillProfileDraftStatus: 'running',
      apparelPackSkillProfileDraftError: '',
      apparelPackSkillProfileDraftRaw: '',
    });
    try {
      const result = await streamCodexCliAgent(
        {
          nodeId: id,
          mode: 'apparel-pack-skill-profile-draft',
          preset: 'apparelPackSkillProfileDraft',
          profile: 'apparel-skill-profile-v1',
          prompt: prompt.userPrompt,
          systemPrompt: prompt.systemPrompt,
          referenceTexts: [`Profile compiler system rules:\n${prompt.systemPrompt}`],
          selectedSkillNames,
          model: llmApiModel || llmModel,
          includePlanTool: false,
          webSearch: false,
        },
        {
          onDelta: (delta) => {
            raw += delta;
          },
        },
      );
      const text = String(result.text || result.reply || raw || '').trim();
      const draft = parseApparelPackSkillProfileAgentJson(text, fallbackProfile);
      if (!draft) throw new Error('LLM 草案不是有效的 apparel-skill-profile-v1 JSON');
      update({
        apparelPackSkillProfileDraft: draft,
        apparelPackSkillProfileDraftRaw: text || draft.json,
        apparelPackSkillProfileDraftStatus: 'success',
        apparelPackSkillProfileDraftError: '',
      });
    } catch (error: any) {
      update({
        apparelPackSkillProfileDraftRaw: raw,
        apparelPackSkillProfileDraftStatus: 'error',
        apparelPackSkillProfileDraftError: error?.message || 'LLM 草案生成失败',
      });
    }
  };

  const applyLlmSkillProfileDraft = () => {
    if (!skillProfileDraft) {
      update({
        apparelPackSkillProfileDraftStatus: 'error',
        apparelPackSkillProfileDraftError: '没有可应用的 Profile 草案',
      });
      return;
    }
    applySkillProfile(skillProfileDraft, {
      apparelPackSkillProfileDraftStatus: 'applied',
      apparelPackSkillProfileDraftError: '',
    });
  };

  const clearSkillProfile = () => {
    update({
      apparelPackSkillProfile: undefined,
      apparelPackSkillProfileJson: '',
      apparelPackSkillProfileDirty: false,
      apparelPackSkillProfileDraft: undefined,
      apparelPackSkillProfileDraftRaw: '',
      apparelPackSkillProfileDraftStatus: 'idle',
      apparelPackSkillProfileDraftError: '',
    });
  };

  const switchApparelImageModel = (nextModelId: string) => {
    update({
      apparelPackImageModelId: nextModelId,
      apparelPackImageApiModel: nextModelId,
    });
  };

  const switchApparelImageApiModel = (nextApiModel: string) => {
    update({
      apparelPackImageModelId: nextApiModel,
      apparelPackImageApiModel: nextApiModel,
    });
  };

  const switchApparelLlmModel = (nextModel: string) => {
    update({
      apparelPackLlmModel: nextModel,
      apparelPackLlmApiModel: nextModel,
    });
  };

  const switchApparelLlmApiModel = (nextApiModel: string) => {
    update({ apparelPackLlmApiModel: nextApiModel });
  };

  const activateRole = (role: RoleKey) => {
    activeRoleRef.current = role;
    setActiveRole(role);
  };

  const updateRoleRefs = (role: RoleKey, urls: string[]) => {
    update({ [ROLE_META[role].field]: refsToText(urls) });
  };

  const addRoleRef = (role: RoleKey, url: string) => {
    const current = displayRefsByRole[role] || manualRefsByRole[role] || [];
    updateRoleRefs(role, mergeUnique(current, [url]));
  };

  const removeRoleRef = (role: RoleKey, url: string) => {
    const current = displayRefsByRole[role] || manualRefsByRole[role] || [];
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
      const current = displayRefsByRole[role] || manualRefsByRole[role] || [];
      updateRoleRefs(role, mergeUnique(current, uploaded));
    } catch (error: any) {
      setLocalError(error?.message || '素材上传失败');
    } finally {
      setUploadingRole(null);
    }
  };

  const handleMaterialDrop = (payload: MaterialPayload) => {
    if (payload.kind !== 'image' || !payload.url) return;
    addRoleRef(activeRoleRef.current, payload.url);
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
      garmentFront: garmentFrontRefs,
      garmentBack: garmentBackRefs,
      garmentLeft: garmentLeftRefs,
      garmentRight: garmentRightRefs,
      garmentDetail: garmentDetailRefs,
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
      useCasePresetId,
      modelLookPresetId,
      posePresetId,
      cameraPresetId,
      realismPresetId,
      customGarmentType: garmentTypeCustom,
      customAudience: audienceCustom,
      customChannel: channelCustom,
      customUseCase: useCaseCustom,
      customModelLook: modelLookCustom,
      customPose: poseCustom,
      customCamera: cameraCustom,
      customRealism: realismCustom,
      customPrompt,
      imageModelId: imageModel,
      imageApiModel,
      llmModel,
      llmApiModel,
      imageQuality,
      imageSubmitMode,
      outputRatio,
      sizeLevel,
    },
    garmentReference: {
      audience: audienceCustom || 'women',
      garmentType: garmentTypeCustom || 'garment',
      garmentPresetId,
      audiencePresetId,
      channelPresetId,
      useCasePresetId,
      modelLookPresetId,
      posePresetId,
      cameraPresetId,
      realismPresetId,
      customGarmentType: garmentTypeCustom,
      customAudience: audienceCustom,
      customChannel: channelCustom,
      customUseCase: useCaseCustom,
      customModelLook: modelLookCustom,
      customPose: poseCustom,
      customCamera: cameraCustom,
      customRealism: realismCustom,
      customPrompt,
      imageModelId: imageModel,
      imageApiModel,
      llmModel,
      llmApiModel,
      imageQuality,
      imageSubmitMode,
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
      useCasePresetId,
      modelLookPresetId,
      posePresetId,
      cameraPresetId,
      realismPresetId,
      customGarmentType: garmentTypeCustom,
      customAudience: audienceCustom,
      customChannel: channelCustom,
      customUseCase: useCaseCustom,
      customModelLook: modelLookCustom,
      customPose: poseCustom,
      customCamera: cameraCustom,
      customRealism: realismCustom,
      customPrompt,
      imageModelId: imageModel,
      imageApiModel,
      llmModel,
      llmApiModel,
      imageQuality,
      imageSubmitMode,
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
    promptOverrides,
    skillProfile,
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
    cameraCustom,
    cameraPresetId,
    customPrompt,
    enableQualityQa,
    garmentPresetId,
    garmentTypeCustom,
    garmentBackRefs,
    garmentDetailRefs,
    garmentFrontRefs,
    garmentLeftRefs,
    garmentRightRefs,
    garmentRefs,
    id,
    imageApiModel,
    imageModel,
    imageQuality,
    imageSubmitMode,
    llmApiModel,
    llmModel,
    mode,
    modelLookCustom,
    modelLookPresetId,
    modelRefs,
    outputRatio,
    poseCustom,
    posePresetId,
    promptOverrides,
    qualityThreshold,
    realismCustom,
    realismPresetId,
    rf,
    shotCount,
    skillProfile,
    sizeLevel,
    styleRefs,
    useCaseCustom,
    useCasePresetId,
  ]);

  const previewPlan = useMemo(() => buildApparelPackPlan({ ...basePlanInput, autoRun: false }), [basePlanInput]);
  const flowPreviewPlan = useMemo(() => buildApparelPackPlan({ ...basePlanInput, autoRun: true }), [basePlanInput]);
  const promptSteps = useMemo(() => collectApparelPackPromptSteps(previewPlan), [previewPlan]);

  const updatePromptOverride = (key: string, field: 'systemPrompt' | 'userPrompt', value: string) => {
    const next: ApparelPackPromptOverrides = {
      ...promptOverrides,
      [key]: {
        ...(promptOverrides[key] || {}),
        [field]: value,
      },
    };
    const clean = next[key];
    if (!String(clean?.systemPrompt || '').trim() && !String(clean?.userPrompt || '').trim() && !String(clean?.finalPrompt || '').trim()) {
      delete next[key];
    }
    update({ apparelPackPromptOverrides: next });
  };

  const resetPromptOverride = (key: string) => {
    const next: ApparelPackPromptOverrides = { ...promptOverrides };
    delete next[key];
    update({ apparelPackPromptOverrides: next });
  };

  const renderPresetBasics = () => (
    <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
      <div className="grid grid-cols-2 gap-2">
        <PresetField
          label="品类预设"
          value={garmentPresetId}
          options={APPAREL_PACK_PRESETS.garmentTypes}
          customValue={garmentTypeCustom}
          customPlaceholder="例如：女童碎花背心裙"
          showHint={false}
          onChange={(value) => update({ apparelPackGarmentPresetId: value })}
          onCustomChange={(value) => update({ apparelPackGarmentTypeCustom: value, apparelPackGarmentType: value })}
        />
        <PresetField
          label="人群预设"
          value={audiencePresetId}
          options={APPAREL_PACK_PRESETS.audiences}
          customValue={audienceCustom}
          customPlaceholder="例如：3-6 岁女童"
          showHint={false}
          onChange={(value) => update({ apparelPackAudiencePresetId: value })}
          onCustomChange={(value) => update({ apparelPackAudienceCustom: value, apparelPackAudience: value })}
        />
        <PresetField
          label="平台预设"
          value={channelPresetId}
          options={APPAREL_PACK_PRESETS.channels}
          customValue={channelCustom}
          customPlaceholder="例如：TEMU 欧美站"
          showHint={false}
          onChange={(value) => update({ apparelPackChannelPresetId: value })}
          onCustomChange={(value) => update({ apparelPackChannelCustom: value, apparelPackChannel: value })}
        />
        <PresetField
          label="场景预设"
          value={useCasePresetId}
          options={APPAREL_PACK_PRESETS.useCases}
          customValue={useCaseCustom}
          customPlaceholder="例如：海边度假 / 户外露营"
          showHint={false}
          onChange={(value) => update({ apparelPackUseCasePresetId: value })}
          onCustomChange={(value) => update({ apparelPackUseCaseCustom: value, apparelPackUseCase: value })}
        />
        <ShotCountField value={shotCount} onChange={(value) => update({ apparelPackShotCount: value })} />
      </div>
      <details className="mt-2 rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
        <summary className="cursor-pointer text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>风格与镜头</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PresetField
            label="模特外观"
            value={modelLookPresetId}
            options={APPAREL_PACK_PRESETS.modelLooks}
            customValue={modelLookCustom}
            customPlaceholder="例如：欧美白人可爱，棕发，笑容自然"
            showHint={false}
            onChange={(value) => update({ apparelPackModelLookPresetId: value })}
            onCustomChange={(value) => update({ apparelPackModelLookCustom: value })}
          />
          <PresetField
            label="动作风格"
            value={posePresetId}
            options={APPAREL_PACK_PRESETS.poseStyles}
            customValue={poseCustom}
            customPlaceholder="例如：坐在床边自然伸展"
            showHint={false}
            onChange={(value) => update({ apparelPackPosePresetId: value })}
            onCustomChange={(value) => update({ apparelPackPoseCustom: value })}
          />
          <PresetField
            label="镜头质感"
            value={cameraPresetId}
            options={APPAREL_PACK_PRESETS.cameraStyles}
            customValue={cameraCustom}
            customPlaceholder="例如：iPhone 近距离日常照"
            showHint={false}
            onChange={(value) => update({ apparelPackCameraPresetId: value })}
            onCustomChange={(value) => update({ apparelPackCameraCustom: value })}
          />
          <PresetField
            label="真实感"
            value={realismPresetId}
            options={APPAREL_PACK_PRESETS.realismStyles}
            customValue={realismCustom}
            customPlaceholder="例如：温暖卧室日常实拍"
            showHint={false}
            onChange={(value) => update({ apparelPackRealismPresetId: value })}
            onCustomChange={(value) => update({ apparelPackRealismCustom: value })}
          />
        </div>
        <TinyHint>首图先定稿外观/动作/镜头/真实感，后续图只沿用锚点派生。</TinyHint>
      </details>
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

  const applyPlan = async (runAfterExpand: boolean, runScope: 'full' | 'anchors' = 'full') => {
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
      const plan = buildApparelPackPlan({ ...basePlanInput, packId: expansionPackId, autoRun: runAfterExpand, runScope });
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
        apparelPackLastPlanSummary: { ...plan.summary, runScope },
        apparelPackLastRunNodeIds: plan.runNodeIds,
      });
      if (runAfterExpand && plan.runNodeIds.length > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        await runApparelPackStages(plan.runStages);
        update({
          status: 'success',
          error: '',
          apparelPackLastPlanSummary: { ...plan.summary, runScope },
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
      <TinyHint>默认第 1 张上游图当模特参考；后续服装图会按正面/背面自动拆分，也可以在素材角色里手动调整。</TinyHint>
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
  const roleCounts: Record<RoleKey, number> = {
    model: manualModelRefs.length,
    garmentFront: garmentFrontRefs.length,
    garmentBack: garmentBackRefs.length,
    garmentLeft: garmentLeftRefs.length,
    garmentRight: garmentRightRefs.length,
    garmentDetail: garmentDetailRefs.length,
    style: manualStyleRefs.length,
  };

  const renderModeTabs = () => (
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
  );

  const renderParamSummary = () => (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
      <div className="min-w-0">
        <FieldLabel>生图参数</FieldLabel>
        <div className="truncate text-[11px] font-semibold" style={{ color: 'var(--t8-text-main)' }}>{generationParamSummary}</div>
      </div>
      <button type="button" className="t8-btn shrink-0 px-2 py-1 text-[11px]" onClick={() => setShowParamPanel(true)}>
        <SlidersHorizontal size={12} />
        调整
      </button>
    </div>
  );

  const renderQualityPanel = () => (
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
  );

  const renderMaterialPanel = () => (
    <details className="rounded-md border p-2" open style={{ borderColor: isAccepting ? 'var(--t8-accent, #14b8a6)' : 'var(--t8-border)' }}>
      <summary className="cursor-pointer text-[11px] font-bold" style={{ color: 'var(--t8-text-main)' }}>素材角色</summary>
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(ROLE_META) as RoleKey[]).map((role) => (
            <button
              key={role}
              type="button"
              className={`t8-btn justify-center px-2 py-1 text-[10px] ${activeRole === role ? 't8-btn-primary' : ''}`}
              onMouseEnter={() => activateRole(role)}
              onClick={() => activateRole(role)}
            >
              {ROLE_META[role].label}
              {roleCounts[role] > 0 && <span className="ml-1 opacity-70">{roleCounts[role]}</span>}
            </button>
          ))}
        </div>
        <TinyHint>首图模特和平铺图只吃服装正面；背面、侧面、细节在后续步骤按方向槽追加。</TinyHint>
        <UpstreamImagePool
          upstreamImages={upstream.images}
          assignedUrls={mergeUnique(...Object.values(displayRefsByRole))}
          activeRole={activeRole}
          onActivateRole={activateRole}
          onAdd={addRoleRef}
        />
        <div className="grid grid-cols-2 gap-2">
          {GARMENT_DIRECTION_ROLES.map((role) => (
            <RoleImageBucket
              key={role}
              role={role}
              urls={displayRefsByRole[role] || []}
              active={activeRole === role}
              uploading={uploadingRole === role}
              onActivate={() => activateRole(role)}
              onUpload={(files) => void uploadRoleFiles(role, files)}
              onRemove={(url) => removeRoleRef(role, url)}
            />
          ))}
        </div>
        <details className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
          <summary className="cursor-pointer text-[10px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>模特/风格辅助参考</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['model', 'style'] as RoleKey[]).map((role) => (
              <RoleImageBucket
                key={role}
                role={role}
                urls={displayRefsByRole[role] || []}
                active={activeRole === role}
                uploading={uploadingRole === role}
                onActivate={() => activateRole(role)}
                onUpload={(files) => void uploadRoleFiles(role, files)}
                onRemove={(url) => removeRoleRef(role, url)}
              />
            ))}
          </div>
        </details>
        <details className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)' }}>
          <summary className="cursor-pointer text-[10px] font-bold" style={{ color: 'var(--t8-text-muted)' }}>高级 URL</summary>
          <div className="mt-2 space-y-2">
            <label>
              <FieldLabel>模特参考 URL</FieldLabel>
              <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackModelRefs || '')} onChange={(event) => update({ apparelPackModelRefs: event.target.value })} />
            </label>
            <label>
              <FieldLabel>旧版服装参考 URL（自动按 1/2 正面，3/4 背面拆）</FieldLabel>
              <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackGarmentRefs || '')} onChange={(event) => update({ apparelPackGarmentRefs: event.target.value })} />
            </label>
            <label>
              <FieldLabel>服装正面 URL</FieldLabel>
              <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackGarmentFrontRefs || '')} onChange={(event) => update({ apparelPackGarmentFrontRefs: event.target.value })} />
            </label>
            <label>
              <FieldLabel>服装背面 URL</FieldLabel>
              <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackGarmentBackRefs || '')} onChange={(event) => update({ apparelPackGarmentBackRefs: event.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <FieldLabel>左侧 URL</FieldLabel>
                <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackGarmentLeftRefs || '')} onChange={(event) => update({ apparelPackGarmentLeftRefs: event.target.value })} />
              </label>
              <label>
                <FieldLabel>右侧 URL</FieldLabel>
                <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackGarmentRightRefs || '')} onChange={(event) => update({ apparelPackGarmentRightRefs: event.target.value })} />
              </label>
            </div>
            <label>
              <FieldLabel>细节 URL</FieldLabel>
              <textarea className="t8-textarea nodrag nowheel min-h-[42px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackGarmentDetailRefs || '')} onChange={(event) => update({ apparelPackGarmentDetailRefs: event.target.value })} />
            </label>
            <label>
              <FieldLabel>风格参考 URL</FieldLabel>
              <textarea className="t8-textarea nodrag nowheel min-h-[38px] w-full px-2 py-1.5 text-xs" value={String(d.apparelPackStyleRefs || '')} onChange={(event) => update({ apparelPackStyleRefs: event.target.value })} />
            </label>
          </div>
        </details>
      </div>
    </details>
  );

  const renderSkillAgentPanel = (compact = false) => (
    <SkillAgentPanel
      compact={compact}
      skills={availableSkills}
      selectedSkillNames={selectedSkillNames}
      skillsLoading={skillsLoading}
      skillsError={skillsError}
      userPrompt={skillUserPrompt}
      profile={skillProfile}
      draft={skillProfileDraft}
      draftRaw={skillProfileDraftRaw}
      draftStatus={skillProfileDraftStatus}
      draftError={skillProfileDraftError}
      onToggleSkill={toggleSkillName}
      onPromptChange={(value) => update({ apparelPackSkillUserPrompt: value, apparelPackSkillProfileDirty: true })}
      onCompile={compileAndApplySkillProfile}
      onDraft={() => void requestLlmSkillProfileDraft()}
      onApplyDraft={applyLlmSkillProfileDraft}
      onClear={clearSkillProfile}
      onReload={() => void loadSkillList()}
    />
  );

  const workbenchControlPanel = (
    <div className="space-y-3">
      {renderModeTabs()}
      {renderParamSummary()}
      {renderPresetBasics()}
      <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
        {modePanel}
      </div>
      {renderQualityPanel()}
    </div>
  );

  const workbenchMaterialPanel = renderMaterialPanel();

  return (
    <div
      {...dropProps}
      className={`t8-node t8-smart-node-card relative overflow-visible transition-all ${selected ? 'is-selected t8-smart-node-card--selected' : ''}`}
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
        <button
          type="button"
          className={`t8-btn h-8 w-8 justify-center px-0 ${showParamPanel ? 't8-btn-primary' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setShowParamPanel((value) => !value);
          }}
          title="生图参数"
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          type="button"
          className={`t8-btn h-8 w-8 justify-center px-0 ${showWorkbench ? 't8-btn-primary' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setShowWorkbench((value) => !value);
          }}
          title="工作台"
        >
          <LayoutDashboard size={14} />
        </button>
        <button
          type="button"
          className={`t8-btn h-8 w-8 justify-center px-0 ${showPromptPanel ? 't8-btn-primary' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setShowPromptPanel((value) => !value);
          }}
          title="提示词预设"
        >
          <FileText size={14} />
        </button>
        <div className="t8-smart-node-status rounded border">
          {status === 'success' ? '已展开' : status === 'error' ? '异常' : running ? '运行中' : '待展开'}
        </div>
      </div>

      <div className="t8-smart-node-body">
        <div className="nodrag nowheel max-h-[560px] space-y-3 overflow-y-auto p-3" onMouseDown={(event) => event.stopPropagation()}>
          {renderModeTabs()}

          {renderParamSummary()}

          {renderPresetBasics()}

          <div className="rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-panel-muted)' }}>
            {modePanel}
          </div>

          {renderQualityPanel()}

          {renderSkillAgentPanel(true)}

          {renderMaterialPanel()}

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

          <div className="grid grid-cols-3 gap-2">
            <button type="button" className="t8-btn w-full justify-center px-3 py-2 text-sm" disabled={running} onClick={() => void applyPlan(false)}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <PackageOpen size={14} />}
              展开流程
            </button>
            <button type="button" className="t8-btn t8-btn-primary w-full justify-center px-3 py-2 text-sm" disabled={running} onClick={() => void applyPlan(true, 'anchors')} title="首图验收：只生成正面模特、平铺、挂拍和锚点 QA">
              {running ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
              先生成锚点
            </button>
            <button type="button" className="t8-btn w-full justify-center px-3 py-2 text-sm" disabled={running} onClick={() => void applyPlan(true)} title="锚点确认后再生成完整包">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              生成完整包
            </button>
          </div>
          <TinyHint>建议先做首图验收：正面模特、平铺、挂拍通过后，再生成背面、细节和场景图。</TinyHint>

          {error && (
            <div className="rounded-md border px-2 py-1.5 text-[11px]" style={{ borderColor: '#ef444466', color: 'var(--t8-danger, #ef4444)' }}>
              {error}
            </div>
          )}
        </div>
      </div>
      {showPromptPanel && (
        <PromptPanel
          steps={promptSteps}
          onChange={updatePromptOverride}
          onReset={resetPromptOverride}
          onClose={() => setShowPromptPanel(false)}
        />
      )}
      {showParamPanel && (
        <ImageParamPanel
          model={imageModel}
          modelDef={imageModelDef}
          apiModel={imageApiModel}
          apiModelOptions={imageApiModelOptions}
          outputRatio={outputRatio}
          sizeLevel={sizeLevel}
          imageQuality={imageQuality}
          imageSubmitMode={imageSubmitMode}
          llmModel={llmModel}
          llmApiModel={llmApiModel}
          llmModelOptions={llmModelOptions}
          onModelChange={switchApparelImageModel}
          onApiModelChange={switchApparelImageApiModel}
          onLlmModelChange={switchApparelLlmModel}
          onLlmApiModelChange={switchApparelLlmApiModel}
          onUpdate={update}
          onClose={() => setShowParamPanel(false)}
        />
      )}
      {showWorkbench && (
        <ApparelPackWorkbench
          modeLabel={MODE_LABEL[mode]}
          modelLabel={imageModelDef.label}
          modelSummary={generationParamSummary}
          modelRefs={modelRefs}
          garmentRefs={garmentRefs}
          styleRefs={styleRefs}
          flowPlan={flowPreviewPlan}
          promptSteps={promptSteps}
          enableQualityQa={enableQualityQa}
          qualityThreshold={qualityThreshold}
          qualityPrompt={String(d.apparelPackQualityPrompt || '')}
          skillPanel={renderSkillAgentPanel(false)}
          lastPlanSummary={d.apparelPackLastPlanSummary}
          lastRunNodeIds={Array.isArray(d.apparelPackLastRunNodeIds) ? d.apparelPackLastRunNodeIds : []}
          workbenchControlPanel={workbenchControlPanel}
          workbenchMaterialPanel={workbenchMaterialPanel}
          onPromptChange={updatePromptOverride}
          onPromptReset={resetPromptOverride}
          onUpdate={update}
          onOpenParams={() => setShowParamPanel(true)}
          onClose={() => setShowWorkbench(false)}
        />
      )}
    </div>
  );
}

export default memo(ApparelPackNode);
