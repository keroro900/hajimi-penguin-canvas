import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getBuiltInPromptTemplates,
  getPromptTemplateText,
  PROMPT_TEMPLATE_LIBRARY_VERSION,
} from '../src/data/promptTemplateLibrary.ts';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('prompt template library includes merge-friendly 2.0 content update pack', () => {
  assert.match(PROMPT_TEMPLATE_LIBRARY_VERSION, /content-pack-v2/);

  const contentPack = getBuiltInPromptTemplates().filter((item) => item.tags.includes('内容更新2.0'));
  assert.equal(contentPack.length >= 30, true, 'content update pack should add at least 30 focused templates');

  const requiredTags = [
    '电商产品图',
    '角色一致性',
    '分镜脚本',
    '3D全景',
    '短视频运镜',
    '音频SFX',
    'LLM扩写',
  ];
  for (const tag of requiredTags) {
    assert.ok(contentPack.some((item) => item.tags.includes(tag)), `missing content pack tag: ${tag}`);
  }

  for (const item of contentPack.filter((entry) => entry.kind === 'video')) {
    const promptZh = getPromptTemplateText(item, 'zh');
    assert.match(promptZh, /Seedance 2\.0 视频提示词/);
    assert.match(promptZh, /主体与动作：/);
    assert.match(promptZh, /镜头执行：/);
    assert.match(promptZh, /稳定约束：/);
  }
});

test('workflow recipe guide documents reusable canvas content packs', () => {
  const guide = read('../docs/workflow-recipes.md');
  const recipeCount = (guide.match(/^## /gm) || []).length;

  assert.equal(recipeCount >= 8, true, 'workflow recipe guide should include at least 8 recipes');
  for (const phrase of ['图生视频', '角色一致性九宫格', '产品图精修', '短链解析到素材库', '全景转视频', 'ComfyUI', 'RunningHub', 'LLM 扩写']) {
    assert.match(guide, new RegExp(phrase));
  }
});

test('release metadata records merge-friendly content update scope', () => {
  const readme = read('../README.md');
  const release = read('../release-notes/v2.1.8.md');
  const features = read('../features.json');

  assert.match(readme, /合并友好的内容更新路线/);
  assert.match(readme, /画布食谱/);
  assert.match(release, /v2\.1\.8/);
  assert.match(release, /内容更新包/);
  assert.match(release, /不拆分 Canvas\.tsx/);
  assert.match(features, /mergeFriendlyContentUpdate/);
  assert.match(features, /content-pack-v2/);
});

test('active ComfyUI and FAL manifests expose merge-friendly content pack examples', () => {
  const comfyManifest = read('../src/data/comfyuiAppManifest.ts');
  const falManifest = read('../src/data/falToolboxManifest.ts');

  assert.match(comfyManifest, /id:\s*'content-recipes'/);
  assert.equal((comfyManifest.match(/['"]content-pack-v2['"]/g) || []).length >= 2, true);
  assert.match(comfyManifest, /缺模型|缺节点/);

  assert.equal((falManifest.match(/['"]content-pack-v2['"]/g) || []).length >= 3, true);
  assert.match(falManifest, /图生视频/);
  assert.match(falManifest, /产品图/);
  assert.match(falManifest, /音频/);
  assert.match(falManifest, /["']?enabled["']?\s*:\s*false/);

  const guide = read('../docs/comfyui-rh-fal-content-pack.md');
  for (const phrase of ['字段映射', '排除规则', '缺模型', '缺节点', 'RunningHub', 'FAL']) {
    assert.match(guide, new RegExp(phrase));
  }
});
