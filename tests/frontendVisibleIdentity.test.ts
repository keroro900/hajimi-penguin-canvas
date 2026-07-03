import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(path: string) {
  return readFileSync(resolve(__dirname, '..', path), 'utf8');
}

test('visible frontend surfaces do not expose personal branding or referral identifiers', () => {
  const visibleSources = [
    'index.html',
    'src/App.tsx',
    'src/components/Canvas.tsx',
    'src/components/ApiSettings.tsx',
    'src/components/nodes/ImageNode.tsx',
    'src/components/nodes/SeedanceNode.tsx',
    'src/components/nodes/VideoNode.tsx',
  ];
  const combined = visibleSources.map((path) => `\n/* ${path} */\n${read(path)}`).join('\n');

  const forbidden = [
    'Lovexy_0222',
    '385085361',
    'inviteCode=',
    'invite=T8STAR',
    'rh-v1121',
    '1819214514410942465',
    '1907375370302308353',
    'ai.t8star.org',
    '企鹅共创版',
    'T8老师',
    'T8公司',
    '关注 T8',
    '复制企鹅微信号',
    '加企鹅微信',
    '贞贞工坊',
    '贞贞的无限画布',
  ];

  for (const token of forbidden) {
    assert.ok(!combined.includes(token), `visible frontend still contains ${token}`);
  }
});
