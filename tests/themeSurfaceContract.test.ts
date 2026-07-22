import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

import type { ThemeMode, ThemeTemplate, ThemeTokens } from '../src/theme/types.ts';

// The application is bundled with extensionless TypeScript imports. Node's direct
// test runner needs the equivalent extension resolution when loading those files.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { applyThemeTemplate } = await import('../src/theme/applyTheme.ts');
const { BUILT_IN_THEME_TEMPLATES } = await import('../src/theme/defaultTemplates.ts');
const {
  FOUNDATION_CANVAS_BY_MODE,
  contrastRatio,
  normalizeSolidCanvasColor,
  parseOpaqueSolidColor,
  relativeLuminance,
} = await import('../src/theme/solidColor.ts');

const REQUIRED_SURFACE_TOKENS: Array<keyof ThemeTokens> = [
  'appBg',
  'canvasBg',
  'panelBg',
  'panelBgElevated',
  'panelBgMuted',
  'nodeBg',
  'nodeHeaderBg',
  'textMain',
  'textMuted',
  'textDim',
  'border',
  'borderStrong',
  'shadowPanel',
  'shadowButton',
  'shadowStrong',
];

const OPAQUE_SURFACE_TOKENS: Array<keyof ThemeTokens> = [
  'canvasBg',
  'nodeBg',
  'nodeHeaderBg',
  'panelBgElevated',
];

test('built-in themes expose the complete solid surface contract in both modes', () => {
  assert.deepEqual(
    BUILT_IN_THEME_TEMPLATES.map((template) => template.id).sort(),
    [
      'ink-default',
      'pixel-candy',
      'retro-default',
      'rh-style',
      'skeuo-default',
      'soft-default',
      'tap-studio',
      'tech-default',
      'utility-default',
      'vapor-default',
      'wabi-sabi',
    ],
  );

  for (const template of BUILT_IN_THEME_TEMPLATES) {
    assert.equal(
      template.visuals?.canvasPattern,
      'none',
      `${template.id} must disable decorative canvas patterns`,
    );

    for (const mode of ['light', 'dark'] as const) {
      const tokens = template.modes[mode].tokens;
      const label = `${template.id}/${mode}`;

      for (const key of REQUIRED_SURFACE_TOKENS) {
        assert.ok(tokens[key]?.trim(), `${label} must provide a non-empty ${key}`);
      }

      for (const key of OPAQUE_SURFACE_TOKENS) {
        assert.notEqual(
          parseOpaqueSolidColor(tokens[key]),
          null,
          `${label} ${key} must be an opaque solid color, got ${tokens[key]}`,
        );
      }

      const canvasLuminance = relativeLuminance(tokens.canvasBg);
      const nodeLuminance = relativeLuminance(tokens.nodeBg);
      const elevatedLuminance = relativeLuminance(tokens.panelBgElevated);
      const headerLuminance = relativeLuminance(tokens.nodeHeaderBg);
      const canvasNodeContrast = contrastRatio(tokens.canvasBg, tokens.nodeBg);
      const nodeCanvasDelta = nodeLuminance - canvasLuminance;
      const elevatedNodeDelta = elevatedLuminance - nodeLuminance;
      const headerNodeDelta = Math.abs(headerLuminance - nodeLuminance);
      const textHeaderContrast = contrastRatio(tokens.textMain, tokens.nodeHeaderBg);

      assert.ok(
        canvasNodeContrast >= 1.12,
        `${label} canvas/node contrast must be at least 1.12:1; observed ${canvasNodeContrast.toFixed(6)}:1`,
      );

      if (mode === 'light') {
        assert.ok(
          nodeCanvasDelta >= 0.06,
          `${label} node luminance must exceed canvas luminance by at least 0.06; observed ${nodeCanvasDelta.toFixed(6)}`,
        );
        assert.ok(
          elevatedNodeDelta >= 0,
          `${label} elevated surface must be at least as bright as the node; observed delta ${elevatedNodeDelta.toFixed(6)}`,
        );
      } else {
        assert.ok(
          nodeCanvasDelta >= 0.012,
          `${label} node luminance must exceed canvas luminance by at least 0.012; observed ${nodeCanvasDelta.toFixed(6)}`,
        );
        assert.ok(
          elevatedNodeDelta >= 0.008,
          `${label} elevated luminance must exceed node luminance by at least 0.008; observed ${elevatedNodeDelta.toFixed(6)}`,
        );
      }

      assert.ok(
        headerNodeDelta >= (mode === 'dark' ? 0.006 : 0.015),
        `${label} header luminance must visibly differ from node luminance; observed ${headerNodeDelta.toFixed(6)}`,
      );
      assert.ok(
        textHeaderContrast >= 4.5,
        `${label} text/header contrast must be at least 4.5:1; observed ${textHeaderContrast.toFixed(6)}:1`,
      );
    }
  }
});

test('all 11 built-in themes provide an opaque elevated shelf and modal surface in both modes', () => {
  const checked: string[] = [];
  for (const template of BUILT_IN_THEME_TEMPLATES) {
    for (const mode of ['light', 'dark'] as const) {
      const label = `${template.id}/${mode}`;
      checked.push(label);
      assert.notEqual(
        parseOpaqueSolidColor(template.modes[mode].tokens.panelBgElevated),
        null,
        `${label} panelBgElevated must keep shelf and modal bodies opaque`,
      );
    }
  }
  assert.equal(checked.length, 11 * 2);
  assert.equal(new Set(checked).size, 11 * 2);
});

test('JIMI default dark surfaces stay in a calm charcoal range', () => {
  const template = BUILT_IN_THEME_TEMPLATES.find(({ id }) => id === 'tech-default');
  assert.ok(template, 'tech-default must exist');

  const tokens = template.modes.dark.tokens;
  const nodeLuminance = relativeLuminance(tokens.nodeBg);
  const elevatedLuminance = relativeLuminance(tokens.panelBgElevated);

  assert.ok(
    nodeLuminance <= 0.03,
    `tech-default/dark node surface must not drift into mid-gray; observed ${nodeLuminance.toFixed(6)}`,
  );
  assert.ok(
    elevatedLuminance <= 0.045,
    `tech-default/dark elevated surface must not drift into mid-gray; observed ${elevatedLuminance.toFixed(6)}`,
  );
});

test('opaque solid color helpers accept only the supported CSS color forms', () => {
  assert.deepEqual(parseOpaqueSolidColor('#abc'), { r: 170, g: 187, b: 204 });
  assert.deepEqual(parseOpaqueSolidColor('#12aBcD'), { r: 18, g: 171, b: 205 });
  assert.deepEqual(parseOpaqueSolidColor('rgb(12, 34, 56)'), { r: 12, g: 34, b: 56 });
  assert.deepEqual(parseOpaqueSolidColor('rgb(12 34 56)'), { r: 12, g: 34, b: 56 });

  const invalidColors = [
    'linear-gradient(#000, #fff)',
    'url("paper.png")',
    'transparent',
    'white',
    'rgba(12, 34, 56, 1)',
    '#123456ff',
    'rgb(12 34 56 / 1)',
  ];

  for (const value of invalidColors) {
    assert.equal(parseOpaqueSolidColor(value), null, `${value} must be rejected`);
  }
});

test('solid canvas normalization preserves valid input and falls back for decorative or alpha colors', () => {
  assert.deepEqual(FOUNDATION_CANVAS_BY_MODE, { dark: '#121214', light: '#faf7f1' });

  const validColors = ['#abc', '#12aBcD', 'rgb(12, 34, 56)', 'rgb(12 34 56)'];
  for (const value of validColors) {
    assert.equal(normalizeSolidCanvasColor(value, '#010203'), value);
  }

  const invalidColors = [
    'linear-gradient(#000, #fff)',
    'url("paper.png")',
    'transparent',
    'white',
    'rgba(12, 34, 56, 1)',
    '#123456ff',
    'rgb(12 34 56 / 1)',
  ];
  for (const value of invalidColors) {
    assert.equal(normalizeSolidCanvasColor(value, '#010203'), '#010203');
  }
});

test('luminance and contrast helpers use the WCAG formulas', () => {
  assert.equal(relativeLuminance('#000'), 0);
  assert.equal(relativeLuminance('rgb(255 255 255)'), 1);
  assert.equal(contrastRatio('#000000', 'rgb(255, 255, 255)'), 21);
  assert.ok(Math.abs(relativeLuminance('#777') - 0.1844749945) < 1e-9);
  assert.throws(() => relativeLuminance('white'), TypeError);
  assert.throws(() => contrastRatio('#000', 'transparent'), TypeError);
});

function installDocumentRootStub() {
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const attributes = new Map<string, string>();
  const properties = new Map<string, string>();
  const style = {
    colorScheme: '',
    setProperty(name: string, value: string) {
      properties.set(name, value);
    },
  };
  const documentElement = {
    style,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement },
  });

  return {
    attributes,
    properties,
    restore() {
      if (originalDocumentDescriptor) {
        Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
      } else {
        delete (globalThis as { document?: Document }).document;
      }
    },
  };
}

function customTemplateWithCanvas(mode: ThemeMode, canvasBg: string): ThemeTemplate {
  const template = structuredClone(BUILT_IN_THEME_TEMPLATES[0]);
  template.id = `custom-${mode}`;
  template.builtIn = false;
  template.visuals = { ...template.visuals, canvasPattern: 'dots' };
  template.modes[mode].tokens.canvasBg = canvasBg;
  return template;
}

test('theme application preserves valid custom canvas colors without mutating the template', (t) => {
  const root = installDocumentRootStub();
  t.after(root.restore);
  const template = customTemplateWithCanvas('dark', 'rgb(12 34 56)');
  const snapshot = structuredClone(template);

  applyThemeTemplate(template, 'dark');

  assert.equal(root.properties.get('--t8-bg-canvas'), 'rgb(12 34 56)');
  assert.equal(root.attributes.get('data-theme-canvas-pattern'), 'none');
  assert.deepEqual(template, snapshot);
});

test('theme application replaces invalid custom canvas colors with mode foundations without mutation', (t) => {
  const root = installDocumentRootStub();
  t.after(root.restore);

  for (const mode of ['dark', 'light'] as const) {
    const template = customTemplateWithCanvas(mode, 'linear-gradient(#000, #fff)');
    const snapshot = structuredClone(template);

    applyThemeTemplate(template, mode);

    assert.equal(root.properties.get('--t8-bg-canvas'), FOUNDATION_CANVAS_BY_MODE[mode]);
    assert.equal(
      root.properties.get('--t8-bg-canvas'),
      mode === 'dark' ? '#121214' : '#faf7f1',
    );
    assert.equal(root.attributes.get('data-theme-canvas-pattern'), 'none');
    assert.deepEqual(template, snapshot);
  }
});
