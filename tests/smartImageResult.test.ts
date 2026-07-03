import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmartImageResultInfo } from '../src/utils/smartImageResult.ts';

test('smart image result info formats compact metadata rows', () => {
  const rows = buildSmartImageResultInfo({
    url: '/files/output/sample.png',
    width: 1344,
    height: 768,
    sourceLabel: '默认 · gpt-image-2',
    statusLabel: '已生成',
    prompt: 'cinematic portrait with soft light and detailed costume',
  });

  assert.deepEqual(rows, [
    { label: '尺寸', value: '1344×768' },
    { label: '比例', value: '1.75:1' },
    { label: '来源', value: '默认 · gpt-image-2' },
    { label: '状态', value: '已生成' },
    { label: '文件', value: 'sample.png' },
    { label: '提示词', value: 'cinematic portrait with soft light and detailed costume' },
  ]);
});

test('smart image result info omits empty values and clamps long prompt', () => {
  const rows = buildSmartImageResultInfo({
    url: '',
    width: 0,
    height: 0,
    sourceLabel: '',
    statusLabel: '生成中 50%',
    prompt: 'a'.repeat(180),
  });

  assert.deepEqual(rows, [
    { label: '状态', value: '生成中 50%' },
    { label: '提示词', value: `${'a'.repeat(117)}...` },
  ]);
});
