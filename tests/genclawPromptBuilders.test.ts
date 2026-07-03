import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENCLAW_SYSTEM_PROMPT,
  GENCLAW_SKETCH_SYSTEM_PROMPT,
} from '../src/genclaw/config.ts';
import {
  buildGenClawBriefMessages,
  buildGenClawSketchMessages,
} from '../src/genclaw/promptBuilders.ts';

test('GenClaw brief messages include configured system prompt and reference count', () => {
  const messages = buildGenClawBriefMessages({
    systemPrompt: GENCLAW_SYSTEM_PROMPT,
    prompt: '透明雨衣企鹅角色海报',
    imageCount: 2,
  });

  assert.equal(messages[0].role, 'system');
  assert.match(String(messages[0].content), /白盒|GenClaw/i);
  assert.equal(messages[1].role, 'user');
  assert.match(String(messages[1].content), /透明雨衣企鹅角色海报/);
  assert.match(String(messages[1].content), /2 张参考图/);
});

test('GenClaw sketch messages require clean SVG output', () => {
  const messages = buildGenClawSketchMessages({
    systemPrompt: GENCLAW_SKETCH_SYSTEM_PROMPT,
    prompt: '中央角色和蓝色雨夜背景',
    briefText: '主题: 企鹅\n构图: 中央主体',
    width: 768,
    height: 1024,
  });

  assert.equal(messages[0].role, 'system');
  assert.match(String(messages[0].content), /SVG/);
  assert.match(String(messages[1].content), /768x1024/);
  assert.match(String(messages[1].content), /只输出|不要解释/);
});

