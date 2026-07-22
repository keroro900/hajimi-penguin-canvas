import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';
import { loadLocalCssImportGraph } from './helpers/themeCssAudit.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z\d]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { BUILT_IN_THEME_TEMPLATES, TAP_STUDIO_TEMPLATE_ID } = await import('../src/theme/defaultTemplates.ts');

const typesSource = readFileSync(new URL('../src/theme/types.ts', import.meta.url), 'utf8');
const themeManagerSource = readFileSync(new URL('../src/components/ThemeTemplateManager.tsx', import.meta.url), 'utf8');
const themeMusicSource = readFileSync(new URL('../src/components/ThemeMusicToggle.tsx', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
const tapStudioCss = readFileSync(new URL('../src/styles/theme-tap-studio.css', import.meta.url), 'utf8');
const tapStudioRoot = postcss.parse(tapStudioCss, { from: 'src/styles/theme-tap-studio.css' });
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const activeCssFiles = loadLocalCssImportGraph('src/styles/index.css', projectRoot).map(({ file }) => file);

function parseSource(source: string, file: string, kind: ts.ScriptKind): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
}

const typesAst = parseSource(typesSource, 'src/theme/types.ts', ts.ScriptKind.TS);
const managerAst = parseSource(themeManagerSource, 'src/components/ThemeTemplateManager.tsx', ts.ScriptKind.TSX);
const musicAst = parseSource(themeMusicSource, 'src/components/ThemeMusicToggle.tsx', ts.ScriptKind.TSX);

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
}

function objectHasStrings(object: ts.ObjectLiteralExpression, expected: Record<string, string>): boolean {
  const actual = new Map<string, string>();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (name && ts.isStringLiteral(property.initializer)) actual.set(name, property.initializer.text);
  }
  return Object.entries(expected).every(([name, value]) => actual.get(name) === value);
}

function sourceHasObject(source: ts.SourceFile, expected: Record<string, string>): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node) && objectHasStrings(node, expected)) found = true;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function stringTypeLiterals(node: ts.Node): Set<string> {
  const values = new Set<string>();
  function visit(current: ts.Node): void {
    if (ts.isLiteralTypeNode(current) && ts.isStringLiteral(current.literal)) values.add(current.literal.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return values;
}

function declaredTypeLiterals(typeName: string, property?: string): Set<string> {
  for (const statement of typesAst.statements) {
    if (!property && ts.isTypeAliasDeclaration(statement) && statement.name.text === typeName) return stringTypeLiterals(statement.type);
    if (property && ts.isInterfaceDeclaration(statement) && statement.name.text === typeName) {
      const member = statement.members.find((candidate): candidate is ts.PropertySignature =>
        ts.isPropertySignature(candidate) && candidate.name !== undefined && propertyName(candidate.name) === property);
      if (member?.type) return stringTypeLiterals(member.type);
    }
  }
  return new Set();
}

function variableObject(source: ts.SourceFile, variableName: string): ts.ObjectLiteralExpression | undefined {
  let result: ts.ObjectLiteralExpression | undefined;
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === variableName
        && node.initializer
        && ts.isObjectLiteralExpression(node.initializer)) result = node.initializer;
    if (!result) ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function objectProperty(object: ts.ObjectLiteralExpression | undefined, name: string): ts.Expression | undefined {
  const property = object?.properties.find((candidate): candidate is ts.PropertyAssignment =>
    ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === name);
  return property?.initializer;
}

function declarationsForExactSelector(selector: string): Map<string, string> {
  const matchingRules: import('postcss').Rule[] = [];
  tapStudioRoot.walkRules((rule) => {
    if (rule.selectors.some((candidate) => candidate.trim() === selector)) matchingRules.push(rule);
  });
  assert.equal(matchingRules.length, 1, `expected one exact rule for ${selector}`);
  const declarations = new Map<string, string>();
  for (const declaration of matchingRules[0].nodes) {
    if (declaration.type !== 'decl') continue;
    declarations.set(declaration.prop.toLowerCase(), declaration.value.toLowerCase().replace(/\s*!important\s*$/, '').trim());
  }
  return declarations;
}

test('Tap Studio theme is registered across frontend theme surfaces', () => {
  assert.ok(declaredTypeLiterals('ThemeVisualStyle').has('tap-studio'));
  assert.ok(declaredTypeLiterals('ThemeVisuals', 'canvasPattern').has('tap-void'));
  assert.ok(declaredTypeLiterals('ThemeVisuals', 'nodeFrame').has('tap-glass'));
  assert.ok(declaredTypeLiterals('ThemeMusicPreset').has('tap-flow'));

  const template = BUILT_IN_THEME_TEMPLATES.find(({ id }) => id === TAP_STUDIO_TEMPLATE_ID);
  assert.ok(template, 'Tap Studio should be a built-in theme template');
  assert.equal(template.visuals.style, 'tap-studio');
  assert.equal(template.visuals.canvasPattern, 'none');
  assert.equal(template.visuals.nodeFrame, 'tap-glass');
  assert.equal(template.music.preset, 'tap-flow');

  assert.equal(sourceHasObject(managerAst, { value: 'tap-studio' }), true);
  assert.equal(sourceHasObject(managerAst, { canvasPattern: 'tap-void', nodeFrame: 'tap-glass' }), true);
  assert.equal(sourceHasObject(managerAst, { preset: 'tap-flow' }), true);

  const presetNotes = objectProperty(variableObject(musicAst, 'PRESET_NOTES'), 'tap-flow');
  const presetSeconds = objectProperty(variableObject(musicAst, 'PRESET_LOOP_SECONDS'), 'tap-flow');
  assert.ok(presetNotes && ts.isArrayLiteralExpression(presetNotes) && presetNotes.elements.length > 0);
  assert.ok(presetSeconds && ts.isNumericLiteral(presetSeconds));
  assert.ok(activeCssFiles.includes('src/styles/theme-tap-studio.css'));
});

test('Tap Studio theme covers node-heavy work surfaces', () => {
  assert.match(tapStudioCss, /--tap-node-inner/);
  assert.match(tapStudioCss, /\.t8-smart-node-card/);
  assert.match(tapStudioCss, /\.t8-node-serial-badge/);
  assert.match(tapStudioCss, /\.t8-output-card/);
  assert.match(tapStudioCss, /\.t8-output-media-card/);
  assert.match(tapStudioCss, /\.t8-material-set-classic/);
  assert.match(tapStudioCss, /\.t8-material-preview-section/);
  assert.match(tapStudioCss, /\.t8-smart-segment__item\[data-active="true"\]/);
  assert.match(tapStudioCss, /\.react-flow__resize-control\.handle\.t8-resize-handle/);
});

test('Tap Studio theme polishes the topbar brand and connection chips', () => {
  assert.match(tapStudioCss, /--tap-topbar-brand-glow/);
  assert.match(tapStudioCss, /\.t8-topbar\s+>\s+div:first-child/);
  assert.match(tapStudioCss, /\.t8-topbar h1::before/);
  assert.match(tapStudioCss, /\.t8-topbar-status-chip\[class\*="text-\[10px\]"\]/);
  assert.match(tapStudioCss, /\.t8-topbar-status-chip::before/);
  assert.match(tapStudioCss, /\.t8-topbar-status-chip svg/);
  assert.match(tapStudioCss, /\.t8-topbar-status-chip\[class\*="text-emerald"\]::before/);
});

test('Tap Studio theme keeps canvas zoom controls visible', () => {
  const prefix = 'html[data-theme-visual="tap-studio"] .t8-canvas-shell';
  const rail = declarationsForExactSelector(`${prefix} .t8-control-rail`);
  assert.equal(rail.get('position'), 'absolute');
  assert.equal(rail.get('z-index'), '80');
  assert.equal(rail.get('pointer-events'), 'none');

  const controls = declarationsForExactSelector(`${prefix} .t8-control-rail .react-flow__controls`);
  assert.equal(controls.get('z-index'), '80');
  assert.equal(controls.get('display'), 'inline-flex');
  assert.equal(controls.get('pointer-events'), 'auto');

  const button = declarationsForExactSelector(`${prefix} .t8-control-rail .react-flow__controls-button`);
  assert.equal(button.get('width'), '34px');
  assert.equal(button.get('height'), '34px');
  assert.equal(button.get('min-width'), '34px');
  assert.equal(button.get('min-height'), '34px');
});

test('Tap Studio canvas language uses pure canvas color without decorative grids', () => {
  assert.match(tapStudioCss, /--tap-canvas-solid/);
  assert.doesNotMatch(tapStudioCss, /--tap-canvas-grid/);
  const forbiddenCanvasSelectors = new Set([
    'html[data-theme-visual="tap-studio"] .t8-canvas-shell',
    'html[data-theme-visual="tap-studio"] .t8-canvas-shell::before',
    'html[data-theme-visual="tap-studio"] .t8-canvas-shell::after',
  ]);
  const themeCanvasRules: string[] = [];
  tapStudioRoot.walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (forbiddenCanvasSelectors.has(selector.trim())) themeCanvasRules.push(selector.trim());
    }
  });
  assert.deepEqual(themeCanvasRules, [], 'Tap Studio should rely on the global solid-canvas contract');
  assert.doesNotMatch(tapStudioCss, /\.react-flow__background-pattern\s+circle/);
});

test('Tap Studio canvas exposes a theme-only empty prompt starter', () => {
  assert.match(canvasSource, /visualStyle\s*===\s*'tap-studio'\s*&&\s*nodes\.length\s*===\s*0/);
  assert.match(canvasSource, /t8-tap-empty-starter/);
  assert.match(canvasSource, /data-canvas-floating-ui="tap-empty-starter"/);
  assert.match(canvasSource, /双击/);
  assert.match(canvasSource, /查看模板/);
});
