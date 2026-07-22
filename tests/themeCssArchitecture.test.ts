import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { auditCanvasCss, finalDeclarationValues, formatViolations, loadLocalCssImportGraph, localCssImportSpecifier } from './helpers/themeCssAudit.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssDocuments = loadLocalCssImportGraph('src/styles/index.css', projectRoot);
const activeThemeDocuments = cssDocuments.filter(({ file }) =>
  /src\/styles\/(?:theme-(?!core)[^/]+|jimi-foundation)\.css$/.test(file));

test('Canvas does not import or render ReactFlow Background artwork', () => {
  const file = resolve(projectRoot, 'src/components/Canvas.tsx');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const forbiddenImports: string[] = [];
  const backgroundElements: number[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)
        && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text === '@xyflow/react'
        && node.importClause?.namedBindings
        && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const binding of node.importClause.namedBindings.elements) {
        const importedName = binding.propertyName?.text ?? binding.name.text;
        if (importedName === 'Background' || importedName === 'BackgroundVariant') forbiddenImports.push(importedName);
      }
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        && ts.isIdentifier(node.tagName)
        && node.tagName.text === 'Background') backgroundElements.push(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    ts.forEachChild(node, visit);
  }
  visit(source);

  const violations = [
    ...forbiddenImports.map((name) => `@xyflow/react import ${name}`),
    ...backgroundElements.map((line) => `Background JSX at line ${line}`),
  ];
  assert.deepEqual(violations, [], `Canvas background component remains: ${violations.join('; ')}`);
});

test('the recursive active CSS graph parses and keeps canvas surfaces free of artwork', () => {
  assert.equal(localCssImportSpecifier(`'./theme.css' layer(theme) supports(display: grid)`), './theme.css');
  assert.equal(localCssImportSpecifier('url("./theme.css") supports(display: grid)'), './theme.css');
  assert.equal(localCssImportSpecifier('url(https://example.com/theme.css) layer(theme)'), undefined);
  assert.equal(localCssImportSpecifier('url(data:text/css,body{})'), undefined);
  const files = cssDocuments.map(({ file }) => file);
  assert.equal(new Set(files.map((file) => file.toLowerCase())).size, files.length, 'local imports should be included once');
  for (const required of ['src/styles/index.css', 'src/styles/theme-core.css', 'src/styles/jimi-foundation.css']) {
    assert.ok(files.includes(required), `${required} should be reachable from index.css`);
  }
  for (const document of cssDocuments) {
    assert.doesNotThrow(() => postcss.parse(document.root.toString(), { from: document.file }));
  }

  const violations = auditCanvasCss(cssDocuments);
  assert.deepEqual(violations, [], `canvas artwork remains:\n${formatViolations(violations)}`);
});

test('canvas audit ignores feature-local paint and harmless canvas declarations', () => {
  const root = postcss.parse(`
    .t8-canvas-shell .react-flow__node .editor-preview { background: linear-gradient(#111, #222); }
    .t8-canvas-shell { background-color: #111; }
    .t8-canvas-shell::before { content: ""; position: absolute; inset: 0; }
    .t8-canvas-shell::after { content: ""; background-image: url('/old.png'); background: none; }
    .react-flow__background { background-color: rgb(1 2 3); }
    .react-flow__background-pattern circle { cx: 2; pointer-events: none; fill: none; }
  `, { from: 'harmless.css' });
  assert.deepEqual(auditCanvasCss([{ file: 'harmless.css', root }]), []);
});

function normalizedSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim();
}

function subjectHasClass(selector: string, className: string): boolean {
  let matched = false;
  selectorParser((root) => {
    const selectorNode = root.nodes[0];
    if (!selectorNode) return;
    let subjectStart = 0;
    selectorNode.nodes.forEach((node, index) => {
      if (node.type === 'combinator') subjectStart = index + 1;
    });
    matched = selectorNode.nodes.slice(subjectStart)
      .some((node) => node.type === 'class' && node.value === className);
  }).processSync(selector);
  return matched;
}

function declarations(rule: postcss.Rule): Map<string, string> {
  return finalDeclarationValues(rule);
}

type HotSelectorFamily = 'node-shell' | 'handle' | 'control-rail-button' | 'placement-shelf' | 'composer-control' | 'run-action';

const ALLOWED_HOT_TRANSITION_PROPERTIES = new Set([
  'background-color', 'border-color', 'color', 'box-shadow', 'opacity', 'transform',
]);
const HOVER_GEOMETRY_PROPERTIES = new Set([
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'inset', 'inset-inline', 'inset-block', 'top', 'right', 'bottom', 'left',
  'flex', 'flex-basis', 'grid-template-columns', 'grid-template-rows', 'box-sizing',
]);

function subjectHasTag(selector: string, tags: Set<string>): boolean {
  let matched = false;
  selectorParser((root) => {
    const selectorNode = root.nodes[0];
    if (!selectorNode) return;
    let subjectStart = 0;
    selectorNode.nodes.forEach((node, index) => {
      if (node.type === 'combinator') subjectStart = index + 1;
    });
    matched = selectorNode.nodes.slice(subjectStart)
      .some((node) => node.type === 'tag' && tags.has(node.value.toLowerCase()));
  }).processSync(selector);
  return matched;
}

function hasDescendantAncestorClass(selector: string, className: string): boolean {
  let matched = false;
  selectorParser((root) => {
    const selectorNode = root.nodes[0];
    if (!selectorNode) return;
    let subjectStart = 0;
    selectorNode.nodes.forEach((node, index) => {
      if (node.type === 'combinator') subjectStart = index + 1;
    });
    matched = selectorNode.nodes.some((node, index) => {
      if (index >= subjectStart || node.type !== 'class' || node.value !== className) return false;
      return selectorNode.nodes.slice(index + 1, subjectStart)
        .filter((candidate) => candidate.type === 'combinator')
        .every((combinator) => combinator.value.trim() === '' || combinator.value.trim() === '>');
    });
  }).processSync(selector);
  return matched;
}

function subjectIsUniversal(selector: string): boolean {
  let matched = false;
  selectorParser((root) => {
    const selectorNode = root.nodes[0];
    if (!selectorNode) return;
    let subjectStart = 0;
    selectorNode.nodes.forEach((node, index) => {
      if (node.type === 'combinator') subjectStart = index + 1;
    });
    matched = selectorNode.nodes.slice(subjectStart).some((node) => node.type === 'universal');
  }).processSync(selector);
  return matched;
}

function hotSelectorFamilies(selector: string): Set<HotSelectorFamily> {
  const families = new Set<HotSelectorFamily>();
  if (['t8-node', 't8-smart-node-shell', 't8-smart-node-card', 'react-flow__node']
    .some((className) => subjectHasClass(selector, className))) families.add('node-shell');
  if (['react-flow__handle', 't8-smart-node-port', 't8-resize-handle']
    .some((className) => subjectHasClass(selector, className))) families.add('handle');
  if (['react-flow__controls-button', 't8-control-rail-help', 't8-control-rail-placement-shelf']
    .some((className) => subjectHasClass(selector, className))) families.add('control-rail-button');
  if (subjectHasClass(selector, 't8-placement-shelf')) families.add('placement-shelf');
  const isComposerControl = subjectHasTag(selector, new Set(['button', 'input', 'select', 'textarea']))
    || ['t8-input', 't8-select', 't8-textarea', 't8-smart-segment__item', 't8-smart-ref-btn']
      .some((className) => subjectHasClass(selector, className));
  if (isComposerControl && hasDescendantAncestorClass(selector, 't8-smart-node-composer')) {
    families.add('composer-control');
  }
  if (subjectHasClass(selector, 't8-smart-run-btn')
      || (subjectHasTag(selector, new Set(['button']))
        && hasDescendantAncestorClass(selector, 't8-node-action-bar'))) families.add('run-action');
  return families;
}

function transitionPropertyNames(value: string): string[] {
  if (/^none$/i.test(value.trim())) return [];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= value.length; index++) {
    const character = value[index];
    if (character === '(') depth++;
    else if (character === ')') depth--;
    else if ((character === ',' || index === value.length) && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  return parts.filter(Boolean).map((part) => part.split(/\s+/)[0].toLowerCase());
}

function highFrequencyInteractionViolations(documents: Array<{ file: string; root: postcss.Root }>): string[] {
  const violations: string[] = [];
  for (const document of documents) document.root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      const families = hotSelectorFamilies(selector);
      const familyLabel = families.size > 0 ? [...families].sort().join(',') : 'blanket';
      const location = `${document.file}:${rule.source?.start?.line ?? '?'} [${familyLabel}] ${normalizedSelector(selector)}`;
      for (const [prop, value] of declarations(rule)) {
        if (prop === 'will-change' && (families.size > 0 || subjectIsUniversal(selector))) {
          violations.push(`${location} blanket will-change: ${value}`);
        }
        if (families.size === 0) continue;
        if ((prop === 'transition' || prop === 'transition-property')) {
          for (const transitionProp of transitionPropertyNames(value)) {
            if (transitionProp === 'all' || !ALLOWED_HOT_TRANSITION_PROPERTIES.has(transitionProp)) {
              violations.push(`${location} transition ${transitionProp}: ${value}`);
            }
          }
        }
        if (/:hover\b/.test(selector) && HOVER_GEOMETRY_PROPERTIES.has(prop)) {
          violations.push(`${location} hover geometry ${prop}: ${value}`);
        }
      }
    }
  });
  return violations;
}

test('high-frequency interaction audit rejects broad motion without policing feature-local transitions', () => {
  const familySelectors = new Map<HotSelectorFamily, string>([
    ['node-shell', '.t8-node'],
    ['handle', '.react-flow__handle'],
    ['control-rail-button', '.t8-control-rail .react-flow__controls-button'],
    ['placement-shelf', '.t8-placement-shelf'],
    ['composer-control', '.t8-smart-node-composer textarea'],
    ['run-action', '.t8-smart-run-btn'],
  ]);
  const rejected = [...familySelectors.values()].flatMap((selector) => [
    `${selector} { transition: all 180ms ease; }`,
    `${selector}:hover { width: 42px; }`,
    `${selector} { will-change: transform; }`,
  ]).join('\n');
  const fixture = {
    file: 'fixture-interactions.css',
    root: postcss.parse(`
      ${rejected}
      * { will-change: transform; }
      .feature-local-preview { transition: width 180ms ease; }
      .feature-local-scrubber { will-change: transform; }
    `),
  };
  const violations = highFrequencyInteractionViolations([fixture]);
  assert.equal(violations.length, familySelectors.size * 3 + 1, violations.join('\n'));
  for (const family of familySelectors.keys()) {
    const familyViolations = violations.filter((violation) => violation.includes(`[${family}]`));
    assert.equal(familyViolations.length, 3, `${family}:\n${familyViolations.join('\n')}`);
    assert.ok(familyViolations.some((violation) => violation.includes('transition all')), family);
    assert.ok(familyViolations.some((violation) => violation.includes('hover geometry width')), family);
    assert.ok(familyViolations.some((violation) => violation.includes('will-change')), family);
  }
  assert.equal(violations.filter((violation) => violation.includes('[blanket]')).length, 1);
  assert.doesNotMatch(violations.join('\n'), /feature-local/);

  const themeScopedFixture = {
    file: 'fixture-theme-interactions.css',
    root: postcss.parse(`
      html[data-theme-visual="fixture"] .react-flow__handle { transition: all 180ms ease; }
      html[data-theme-visual="fixture"] .react-flow__handle:hover { width: 24px; }
      html[data-theme-visual="fixture"] * { will-change: transform; }
    `),
  };
  const themeViolations = highFrequencyInteractionViolations([themeScopedFixture]);
  assert.equal(themeViolations.length, 3, themeViolations.join('\n'));
  assert.ok(themeViolations.some((violation) => violation.includes('transition all')));
  assert.ok(themeViolations.some((violation) => violation.includes('hover geometry width')));
  assert.ok(themeViolations.some((violation) => violation.includes('blanket will-change')));

  const permittedFixture = {
    file: 'fixture-permitted-interactions.css',
    root: postcss.parse(`
      .t8-node { transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease; }
      .react-flow__handle { transition: opacity 140ms ease, transform 140ms ease, box-shadow 140ms ease; }
      .t8-control-rail .react-flow__controls-button { transition: background-color 140ms ease, color 120ms ease; }
      .t8-placement-shelf { transition: border-color 140ms ease, opacity 140ms ease; }
      .t8-smart-node-composer textarea { transition: background-color 140ms ease, border-color 140ms ease, color 120ms ease; }
      .t8-smart-run-btn { transition: background-color 140ms ease, color 120ms ease, transform 80ms ease; }
      .t8-smart-node-composer + button { transition: width 180ms ease; will-change: transform; }
      .feature:has(.t8-smart-node-composer) button { transition: width 180ms ease; }
      .t8-node-action-bar + button { transition: width 180ms ease; }
      .feature:has(.t8-node-action-bar) button { transition: width 180ms ease; }
      .feature-local-scrubber { will-change: transform; }
    `),
  };
  assert.deepEqual(highFrequencyInteractionViolations([permittedFixture]), []);
});

function canonicalHotSelector(selector: string): string {
  const unthemed = normalizedSelector(selector)
    .replace(/^html(?:\[data-theme[^\]]*\])+\s+/, '');
  if (unthemed === '.react-flow__controls-button') {
    return '.t8-canvas-shell .t8-control-rail .react-flow__controls-button';
  }
  return unthemed;
}

test('shared high-frequency selectors use explicit paint transitions and selector-level reduced-motion resets', () => {
  const interactionDocumentFiles = new Set([
    'src/styles/index.css',
    'src/styles/theme-core.css',
    ...activeThemeDocuments.map(({ file }) => file),
  ]);
  const interactionDocuments = cssDocuments.filter(({ file }) => interactionDocumentFiles.has(file));
  assert.deepEqual(
    activeThemeDocuments.filter(({ file }) => !interactionDocuments.some((document) => document.file === file)),
    [],
    'every active built-in theme must participate in the interaction audit',
  );
  const violations = highFrequencyInteractionViolations(interactionDocuments);
  assert.deepEqual(violations, [], `high-frequency interaction violations:\n${violations.join('\n')}`);

  const transitioningSelectors = new Set<string>();
  const unscopedReducedMotionSelectors = new Set<string>();
  for (const document of interactionDocuments) document.root.walkRules((rule) => {
    const paint = declarations(rule);
    const transition = paint.get('transition') ?? paint.get('transition-property');
    if (transition && transitionPropertyNames(transition).length > 0) {
      for (const selector of rule.selectors) {
        if (hotSelectorFamilies(selector).size > 0) transitioningSelectors.add(canonicalHotSelector(selector));
      }
    }
    const parent = rule.parent;
    if (parent?.type === 'atrule' && parent.name === 'media' && /prefers-reduced-motion\s*:\s*reduce/.test(parent.params)
        && paint.get('transition') === 'none') {
      for (const selector of rule.selectors) {
        const normalized = normalizedSelector(selector);
        if (!/html|\[data-theme/.test(normalized)) unscopedReducedMotionSelectors.add(normalized);
      }
    }
  });
  assert.ok(transitioningSelectors.size >= 6, `expected exact hot selectors, got ${[...transitioningSelectors].join(', ')}`);
  for (const selector of transitioningSelectors) {
    assert.ok(unscopedReducedMotionSelectors.has(selector), `missing shared reduced-motion reset for ${selector}`);
  }
});

type CascadeCandidate = {
  value: string;
  important: boolean;
  specificity: [number, number, number];
  order: number;
};

function selectorSpecificity(selector: string): [number, number, number] {
  const specificity: [number, number, number] = [0, 0, 0];
  selectorParser((root) => root.walk((node) => {
    if (node.type === 'id') specificity[0]++;
    else if (node.type === 'class' || node.type === 'attribute') specificity[1]++;
    else if (node.type === 'tag') specificity[2]++;
    else if (node.type === 'pseudo') {
      if (node.value.startsWith('::')) specificity[2]++;
      else specificity[1]++;
    }
  })).processSync(selector);
  return specificity;
}

function compareCascade(left: CascadeCandidate, right: CascadeCandidate): number {
  return Number(left.important) - Number(right.important)
    || left.specificity[0] - right.specificity[0]
    || left.specificity[1] - right.specificity[1]
    || left.specificity[2] - right.specificity[2]
    || left.order - right.order;
}

test('tech-default action buttons resolve to no transition under reduced motion', () => {
  const applicableSelectors = new Set([
    '.t8-node-action-bar button',
    'html[data-theme-template="tech-default"] .t8-node-action-bar button',
  ]);
  // index.css imports are direct and ordered; its own rules cascade after those imports.
  const cascadeDocuments = [...cssDocuments.slice(1), cssDocuments[0]];
  const candidates: CascadeCandidate[] = [];
  let order = 0;
  for (const document of cascadeDocuments) document.root.walkRules((rule) => {
    const mediaAncestors: postcss.AtRule[] = [];
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media') mediaAncestors.push(parent);
    }
    if (mediaAncestors.some((media) => !/prefers-reduced-motion\s*:\s*reduce/.test(media.params))) return;
    for (const selector of rule.selectors) {
      if (!applicableSelectors.has(normalizedSelector(selector))) continue;
      for (const node of rule.nodes) {
        if (node.type !== 'decl' || node.prop.toLowerCase() !== 'transition') continue;
        candidates.push({
          value: node.value.trim().toLowerCase(),
          important: node.important === true,
          specificity: selectorSpecificity(selector),
          order: order++,
        });
      }
    }
  });
  assert.ok(candidates.length > 1, 'expected normal and reduced-motion transition candidates');
  const effectiveTransition = candidates.sort(compareCascade).at(-1);
  assert.equal(effectiveTransition?.value, 'none');
});

function themeLocalPaintIsTranslucent(document: { root: postcss.Root }, value: string, seen = new Set<string>()): boolean {
  if (/gradient\s*\(|rgba?\s*\(|hsla?\s*\(|transparent|color-mix\s*\([^)]*transparent/i.test(value)) return true;
  const aliases = [...value.matchAll(/var\(\s*(--(?!t8-)[\w-]+)/gi)].map((match) => match[1]);
  for (const alias of aliases) {
    if (seen.has(alias)) continue;
    const nextSeen = new Set(seen);
    nextSeen.add(alias);
    const definitions: string[] = [];
    document.root.walkDecls(alias, (decl) => definitions.push(decl.value));
    if (definitions.some((definition) => themeLocalPaintIsTranslucent(document, definition, nextSeen))) return true;
  }
  return false;
}

function ruleLocations(rules: postcss.Rule[]): string {
  return rules.map((rule) => `${rule.source?.input.file ?? '<css>'}:${rule.source?.start?.line ?? '?'} ${rule.selector}`).join('\n');
}

const OUTER_NODE_PAINT = new Set([
  'box-shadow', 'filter', 'backdrop-filter', '-webkit-backdrop-filter',
]);

function isOuterNodePaintProperty(prop: string): boolean {
  return OUTER_NODE_PAINT.has(prop) || /^(?:background|border|outline)(?:-|$)/.test(prop);
}

type RegularNodeOuterSurface = 'shell' | 'pseudo';

function regularNodeOuterSurface(selector: string): RegularNodeOuterSurface | undefined {
  let surface: RegularNodeOuterSurface | undefined;
  selectorParser((root) => {
    const selectorNode = root.nodes[0];
    if (!selectorNode) return;
    const nodes = selectorNode.nodes;
    let compoundStart = 0;
    for (let index = nodes.length - 1; index >= 0; index--) {
      if (nodes[index].type !== 'combinator') continue;
      compoundStart = index + 1;
      break;
    }
    const subject = nodes.slice(compoundStart);
    const subjectClasses = subject.filter((node) => node.type === 'class').map((node) => node.value);
    const decoration = subject.some((node) => node.type === 'pseudo' && /::(?:before|after)/i.test(node.value));
    if (subjectClasses.includes('t8-node') || subjectClasses.includes('t8-smart-node-card')) {
      if (!decoration) surface = 'shell';
      return;
    }

    const childCombinator = nodes[compoundStart - 1];
    if (childCombinator?.type !== 'combinator' || childCombinator.value.trim() !== '>') return;
    const isFirstDiv = subject.some((node) => node.type === 'tag' && node.value.toLowerCase() === 'div')
      && subject.some((node) => node.type === 'pseudo' && node.value.toLowerCase() === ':first-child');
    if (!isFirstDiv) return;

    let ownerStart = 0;
    for (let index = compoundStart - 2; index >= 0; index--) {
      if (nodes[index].type !== 'combinator') continue;
      ownerStart = index + 1;
      break;
    }
    const owner = nodes.slice(ownerStart, compoundStart - 1);
    const positiveOwnerClasses: string[] = [];
    for (const node of owner) {
      if (node.type === 'class') positiveOwnerClasses.push(node.value);
    }
    if (!positiveOwnerClasses.includes('react-flow__node')) return;
    if (positiveOwnerClasses.some((name) => name.startsWith('react-flow__node-'))) return;
    surface = decoration ? 'pseudo' : 'shell';
  }).processSync(selector);
  return surface;
}

function themedOuterNodePaintViolations(documents: Array<{ file: string; root: postcss.Root }>): string[] {
  const violations: string[] = [];
  for (const document of documents) document.root.walkRules((rule) => {
    const surfaces = rule.selectors.map(regularNodeOuterSurface).filter(Boolean);
    if (surfaces.length === 0) return;
    for (const [prop, value] of declarations(rule)) {
      if (isOuterNodePaintProperty(prop) || (prop === 'content' && surfaces.includes('pseudo'))) {
        violations.push(`${document.file}:${rule.source?.start?.line ?? '?'} ${normalizedSelector(rule.selector)} ${prop}: ${value}`);
      }
    }
  });
  return violations;
}

test('theme outer-shell audit rejects first-child and shared-node double ownership', () => {
  const root = postcss.parse(`
    html[data-theme-visual="fixture"] .react-flow__node:not(.react-flow__node-groupBox) > div:first-child { background: var(--fixture); transform: translateY(-1px); }
    html[data-theme-visual="fixture"] .react-flow__node:not(.react-flow__node-groupBox):hover > div:first-child { filter: brightness(1.1); }
    html[data-theme-visual="fixture"] .react-flow__node.selected:not(.react-flow__node-groupBox) > div:first-child { outline: 1px solid; }
    html[data-theme-visual="fixture"] .react-flow__node:focus:not(.react-flow__node-groupBox) > div:first-child { box-shadow: var(--fixture); }
    html[data-theme-visual="fixture"] .react-flow__node:not(.react-flow__node-groupBox) > div:first-child::before { content: ""; background: var(--fixture); }
    html[data-theme-visual="fixture"] .t8-node { border: 1px solid var(--fixture); }
    html[data-theme-visual="fixture"] .t8-smart-node-card { box-shadow: var(--fixture); }
    html[data-theme-visual="fixture"] .react-flow__node.react-flow__node-groupBox > div:first-child { background: var(--allowed); }
    html[data-theme-visual="fixture"] .react-flow__node.react-flow__node-llm > div:first-child { background: var(--allowed-specialist); }
    html[data-theme-visual="fixture"] .t8-node::before { background: var(--allowed-decoration); }
    html[data-theme-visual="fixture"] .editor-preview { background: var(--allowed-inner); }
  `, { from: 'fixture-theme.css' });
  const violations = themedOuterNodePaintViolations([{ file: 'fixture-theme.css', root }]);
  assert.equal(violations.length, 8);
  assert.match(violations.join('\n'), /first-child.*background/);
  assert.match(violations.join('\n'), /:hover.*filter/);
  assert.match(violations.join('\n'), /\.selected.*outline/);
  assert.match(violations.join('\n'), /:focus.*box-shadow/);
  assert.match(violations.join('\n'), /::before.*content/);
  assert.match(violations.join('\n'), /\.t8-node.*border/);
  assert.match(violations.join('\n'), /\.t8-smart-node-card.*box-shadow/);
  assert.doesNotMatch(violations.join('\n'), /allowed/);
});

test('active themes do not repaint shared regular-node outer shells', () => {
  const violations = themedOuterNodePaintViolations(activeThemeDocuments);
  assert.deepEqual(violations, [], `theme CSS must set tokens instead of repainting regular node shells:\n${violations.join('\n')}`);
});

function replaceVarReferencesWithFallbacks(value: string): string {
  let result = '';
  for (let index = 0; index < value.length;) {
    const match = /^var\s*\(/i.exec(value.slice(index));
    if (!match) {
      result += value[index++];
      continue;
    }
    const contentStart = index + match[0].length;
    let depth = 1;
    let cursor = contentStart;
    for (; cursor < value.length && depth > 0; cursor++) {
      if (value[cursor] === '(') depth++;
      else if (value[cursor] === ')') depth--;
    }
    if (depth !== 0) return `${result} invalid-var-syntax`;
    const content = value.slice(contentStart, cursor - 1);
    let comma = -1;
    let innerDepth = 0;
    for (let offset = 0; offset < content.length; offset++) {
      if (content[offset] === '(') innerDepth++;
      else if (content[offset] === ')') innerDepth--;
      else if (content[offset] === ',' && innerDepth === 0) {
        comma = offset;
        break;
      }
    }
    if (comma >= 0) result += replaceVarReferencesWithFallbacks(content.slice(comma + 1));
    index = cursor;
  }
  return result;
}

function semanticThemeOverrideValue(prop: string, rawValue: string): boolean {
  const value = rawValue.trim();
  const normalizedProp = prop.toLowerCase();
  const safeEmptyPaint = (/^(?:background|background-color|border|border-color)$/.test(normalizedProp) && /^(?:none|transparent)$/i.test(value))
    || (normalizedProp === 'box-shadow' && /^none$/i.test(value))
    || (/^0(?:\.0+)?(?:px)?$/i.test(value) && /^(?:border|box-shadow)$/.test(normalizedProp))
    || (normalizedProp === 'border-radius' && /^-?\d*\.?\d+(?:px|rem|em|%)?(?:\s+-?\d*\.?\d+(?:px|rem|em|%)?){0,3}$/i.test(value));
  if (safeEmptyPaint) return true;
  const containsToken = /var\(--[\w-]+/i.test(value);
  const withoutVars = replaceVarReferencesWithFallbacks(value);
  const containsForbiddenSyntax = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|device-cmyk|url|(?:repeating-)?(?:linear|radial|conic)-gradient)\s*\(/i.test(withoutVars);
  const grammarKeywords = new Set([
    'color-mix', 'in', 'srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020',
    'xyz', 'xyz-d50', 'xyz-d65', 'shorter', 'longer', 'increasing', 'decreasing', 'hue',
    'transparent', 'currentcolor', 'none', 'calc', 'min', 'max', 'clamp',
    'solid', 'dashed', 'dotted', 'double', 'inset',
  ]);
  const identifiers = withoutVars
    .replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?(?:%|[a-z]+)?/gi, ' ')
    .match(/[a-z][a-z\d-]*/gi) ?? [];
  const containsBareIdentifier = identifiers.some((identifier) => !grammarKeywords.has(identifier.toLowerCase()));
  return containsToken && !containsForbiddenSyntax && !containsBareIdentifier;
}

test('theme override value classifier allows token-driven paint and rejects literal repaint', () => {
  for (const [prop, value] of [
    ['background', 'var(--utility-card-bg)'],
    ['border-radius', 'var(--tap-radius)'],
    ['box-shadow', 'var(--skeuo-raised-lg)'],
    ['background', 'color-mix(in srgb, var(--t8-accent) 12%, transparent)'],
    ['border', '1px solid var(--t8-border)'],
    ['box-shadow', 'inset 0 0 0 1px var(--t8-border)'],
    ['border-radius', 'calc(var(--tap-radius) - 2px)'],
    ['background', 'transparent'],
    ['box-shadow', 'none'],
    ['border-radius', '12px'],
  ]) assert.equal(semanticThemeOverrideValue(prop, value), true, `${prop}: ${value} should be token-driven/safe`);
  for (const [prop, value] of [
    ['background', '#ffffff'],
    ['background', 'rgb(1 2 3)'],
    ['border', '1px solid hsl(0 0% 10%)'],
    ['background', 'linear-gradient(#fff, #000)'],
    ['background', 'linear-gradient(var(--start), var(--end))'],
    ['box-shadow', '0 8px 24px rgba(0,0,0,.3)'],
    ['background', 'color-mix(in srgb, var(--surface) 80%, white)'],
    ['background', 'var(--surface, oklch(60% .1 220))'],
    ['color', 'var(--text, rebeccapurple)'],
    ['color', 'var(--text, navy)'],
    ['background', 'color-mix(in srgb, var(--surface) 80%, teal)'],
    ['border', '1px solid gold'],
    ['background', 'var(--surface, aliceblue)'],
    ['background', 'color-mix(in srgb, var(--surface), hwb(120 0% 0%))'],
    ['background', 'color-mix(in srgb, var(--surface), lab(50% 0 0))'],
    ['background', 'color-mix(in srgb, var(--surface), oklch(60% .1 220))'],
  ]) assert.equal(semanticThemeOverrideValue(prop, value), false, `${prop}: ${value} should be rejected as literal paint`);
});

test('theme-local surface aliases resolve recursively when checking opacity', () => {
  const root = postcss.parse(`:root { --surface-a: var(--surface-b); --surface-b: rgba(1,2,3,.8); --opaque-a: var(--opaque-b); --opaque-b: var(--t8-bg-node); }`);
  const document = { root };
  assert.equal(themeLocalPaintIsTranslucent(document, 'var(--surface-a)'), true);
  assert.equal(themeLocalPaintIsTranslucent(document, 'var(--opaque-a)'), false);
});

test('CSS declaration resolution honors !important cascade within a rule', () => {
  const firstImportant = postcss.parse('.surface { background: var(--safe) !important; background: #fff; }').first as postcss.Rule;
  const laterImportant = postcss.parse('.surface { background: var(--safe); background: #fff !important; }').first as postcss.Rule;
  assert.equal(declarations(firstImportant).get('background'), 'var(--safe)');
  assert.equal(declarations(laterImportant).get('background'), '#fff');
});

test('shared regular-node surfaces use opaque semantic backgrounds and semantic interaction states', () => {
  const required = new Map([
    ['t8-node', '--t8-bg-node'],
    ['t8-smart-node-card', '--t8-bg-node'],
    ['t8-node-header', '--t8-bg-node-header'],
  ]);
  for (const [className, token] of required) {
    const matches: postcss.Rule[] = [];
    for (const document of cssDocuments) document.root.walkRules((rule) => {
      if (rule.selectors.some((selector) => normalizedSelector(selector) === `.${className}`)) matches.push(rule);
    });
    assert.ok(matches.length, `missing shared .${className} rule`);
    const value = declarations(matches.at(-1)!).get('background') ?? declarations(matches.at(-1)!).get('background-color') ?? '';
    assert.match(value, new RegExp(`^var\\(${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[),]`),
      `.${className} must use opaque semantic ${token}; got ${JSON.stringify(value)} at\n${ruleLocations(matches)}`);
    assert.doesNotMatch(value, /gradient\s*\(|rgba?\s*\(|hsla?\s*\(|transparent|color-mix\s*\(/i,
      `.${className} background must remain opaque: ${value}`);
  }

  const interactionRules: postcss.Rule[] = [];
  for (const document of cssDocuments) document.root.walkRules((rule) => {
    if (rule.selectors.some((selector) =>
      /(?:\.t8-node|\.t8-smart-node-card)(?::hover|--selected|\[data-selected)/.test(normalizedSelector(selector)))) interactionRules.push(rule);
  });
  assert.ok(interactionRules.some((rule) => /hover/.test(rule.selector)), 'shared regular nodes need a semantic hover rule');
  assert.ok(interactionRules.some((rule) => /selected/.test(rule.selector)), 'shared regular nodes need a semantic selected rule');
  for (const rule of interactionRules) {
    const paint = declarations(rule);
    for (const prop of ['background', 'background-color', 'border', 'border-color', 'box-shadow']) {
      const value = paint.get(prop);
      if (value) assert.match(value, /var\(--t8-(?:bg|border|accent|shadow)/,
        `${rule.source?.input.file}:${rule.source?.start?.line} ${rule.selector} ${prop} must be semantic, got ${value}`);
    }
  }
});

test('active theme CSS cannot translucently repaint regular node bodies or headers', () => {
  const violations: string[] = [];
  for (const document of cssDocuments) document.root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (!['t8-node', 't8-smart-node-card', 't8-node-header', 't8-smart-node-card__header', 't8-output-header',
        't8-material-set-classic__header', 't8-smart-material-set-head'].some((name) => subjectHasClass(selector, name))) continue;
      if (/::(?:before|after)\b/i.test(selector)) continue;
      const paint = declarations(rule);
      for (const prop of ['background', 'background-color']) {
        const value = paint.get(prop);
        if (value && themeLocalPaintIsTranslucent(document, value)) {
          violations.push(`${document.file}:${rule.source?.start?.line ?? '?'} ${normalizedSelector(selector)} ${prop}: ${value}`);
        }
      }
    }
  });
  assert.deepEqual(violations, [], `regular node outer paint must be opaque and token-backed (inner editors/media are allowed):\n${violations.join('\n')}`);
});

test('shared node hover rules never mutate geometry', () => {
  const forbidden = new Set(['transform', 'width', 'height', 'padding', 'overflow', 'box-sizing']);
  const violations: string[] = [];
  for (const document of cssDocuments) document.root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => /\.(?:t8-node|t8-smart-node-card):hover/.test(selector))) return;
    for (const prop of declarations(rule).keys()) {
      if (forbidden.has(prop)) violations.push(`${document.file}:${rule.source?.start?.line ?? '?'} ${rule.selector} changes ${prop}`);
    }
  });
  assert.deepEqual(violations, [], `hover must be paint-only:\n${violations.join('\n')}`);
});

test('shared theme core is the only active CSS owner of handle box geometry', () => {
  const geometryProperties = new Set(['width', 'height', 'min-width', 'min-height', 'left', 'right', 'top', 'bottom', 'transform']);
  const violations: string[] = [];
  for (const document of cssDocuments) {
    if (document.file === 'src/styles/theme-core.css' || document.file === 'src/styles/index.css') continue;
    document.root.walkRules((rule) => {
      if (!rule.selector.includes('.react-flow__handle')) return;
      rule.walkDecls((decl) => {
        if (geometryProperties.has(decl.prop)) violations.push(`${document.file}: ${rule.selector} { ${decl.prop}: ${decl.value} }`);
      });
    });
  }
  assert.deepEqual(violations, [], `theme-local handle geometry remains:\n${violations.join('\n')}`);
});

test('theme-scoped node hover and ReactFlow first-child rules never mutate geometry', () => {
  const forbidden = new Set(['transform', 'width', 'height', 'padding', 'overflow', 'box-sizing']);
  const violations: string[] = [];
  for (const document of activeThemeDocuments) document.root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => {
      const text = normalizedSelector(selector);
      if (/::(?:before|after)\b/.test(text)) return false;
      return /\.react-flow__node:not\(\.react-flow__node-groupBox\):hover\s*>\s*div:first-child/.test(text)
        || (/:hover/.test(text) && (subjectHasClass(text, 't8-node') || subjectHasClass(text, 't8-smart-node-card')));
    })) return;
    for (const prop of declarations(rule).keys()) {
      if (forbidden.has(prop)) violations.push(`${document.file}:${rule.source?.start?.line ?? '?'} ${rule.selector} changes ${prop}`);
    }
  });
  assert.deepEqual(violations, [], `theme node hover must be paint-only:\n${violations.join('\n')}`);
});

test('shared floating surfaces consume the elevated surface contract and themes do not repaint them', () => {
  const targets = [
    '.t8-panel',
    '.t8-smart-node-composer',
    '.t8-context-menu',
    '.t8-control-rail .react-flow__controls',
    '.t8-canvas-toolbar',
  ];
  const contract = new Map([
    ['background', ['--t8-bg-panel-elevated']],
    ['border', ['--t8-border']],
    ['border-radius', ['--t8-radius-panel', '--t8-radius-button']],
    ['box-shadow', ['--t8-shadow-panel']],
  ]);
  const contractViolations: string[] = [];
  for (const target of targets) {
    const candidates: postcss.Rule[] = [];
    for (const document of cssDocuments) document.root.walkRules((rule) => {
      if (rule.selectors.some((selector) => {
        const text = normalizedSelector(selector);
        return target === '.t8-control-rail .react-flow__controls'
          ? text === target || text === `.t8-canvas-shell ${target}`
          : text === target;
      })) candidates.push(rule);
    });
    if (!candidates.length) {
      contractViolations.push(`missing exact shared selector ${target}`);
      continue;
    }
    for (const [prop, tokens] of contract) {
      const owner = candidates.find((rule) => tokens.some((token) => (declarations(rule).get(prop) ?? '').includes(token)));
      if (!owner) contractViolations.push(`${target} ${prop} must consume one of ${tokens.join(', ')}; found ${ruleLocations(candidates)}`);
    }
  }

  const themeRepaints: string[] = [];
  const canonicalThemeTokens = new Map<string, string[]>([
    ['background', ['--t8-bg-panel-elevated']],
    ['background-color', ['--t8-bg-panel-elevated']],
    ['border', ['--t8-border']],
    ['border-color', ['--t8-border']],
    ['border-radius', ['--t8-radius-panel', '--t8-radius-button']],
    ['box-shadow', ['--t8-shadow-panel']],
  ]);
  for (const document of cssDocuments.filter(({ file }) =>
    /src\/styles\/(?:theme-[^/]+|jimi-foundation)\.css$/.test(file))) {
    document.root.walkRules((rule) => {
      if (document.file === 'src/styles/theme-core.css' && !rule.selector.includes('data-theme-template="op-style"')) return;
      if (!rule.selectors.some((selector) => targets.some((target) => {
        const className = target.split(' ').at(-1)!.slice(1);
        return subjectHasClass(selector, className);
      }))) return;
      for (const [prop, value] of declarations(rule)) {
        const tokens = canonicalThemeTokens.get(prop);
        if (tokens && !tokens.some((token) => value.includes(`var(${token}`))) {
          themeRepaints.push(`${document.file}:${rule.source?.start?.line ?? '?'} ${rule.selector} ${prop}: ${value}`);
        }
      }
    });
  }
  assert.deepEqual([...contractViolations, ...themeRepaints], [],
    `floating-surface contract violations (theme files may set tokens, not repaint outer surfaces):\n${[...contractViolations, ...themeRepaints].join('\n')}`);
});

test('shared canvas layers use a strictly increasing semantic z-index scale', () => {
  const indexDocument = cssDocuments.find(({ file }) => file === 'src/styles/index.css');
  assert.ok(indexDocument, 'index.css must be present in the active CSS graph');
  const tokenNames = [
    '--t8-z-canvas-decor',
    '--t8-z-edge',
    '--t8-z-node',
    '--t8-z-node-ui',
    '--t8-z-canvas-chrome',
    '--t8-z-composer',
    '--t8-z-modal-backdrop',
    '--t8-z-modal-dialog',
    '--t8-z-system-overlay',
  ];
  const values = new Map<string, number>();
  indexDocument.root.walkRules(':root', (rule) => {
    for (const [prop, value] of declarations(rule)) {
      if (tokenNames.includes(prop) && /^\d+$/.test(value)) values.set(prop, Number(value));
    }
  });
  assert.deepEqual([...values.keys()], tokenNames, 'index.css :root must own the complete shared z-index scale in order');
  for (let index = 1; index < tokenNames.length; index++) {
    assert.ok(values.get(tokenNames[index - 1])! < values.get(tokenNames[index])!,
      `${tokenNames[index - 1]} must be lower than ${tokenNames[index]}`);
  }

  const mappings = new Map<string, string>([
    ['.t8-canvas-shell::before', '--t8-z-canvas-decor'],
    ['.t8-canvas-shell::after', '--t8-z-canvas-decor'],
    ['.t8-canvas-shell .react-flow__background', '--t8-z-canvas-decor'],
    ['.t8-canvas-shell .react-flow__edges', '--t8-z-edge'],
    ['.t8-canvas-shell .react-flow__nodes', '--t8-z-node'],
    ['.t8-canvas-shell .react-flow__node .react-flow__handle', '--t8-z-node-ui'],
    ['.t8-canvas-shell .react-flow__resize-control', '--t8-z-node-ui'],
    ['.t8-node-action-bar', '--t8-z-node-ui'],
    ['.t8-control-rail', '--t8-z-canvas-chrome'],
    ['.t8-placement-shelf', '--t8-z-canvas-chrome'],
    ['.t8-smart-node-composer--portal', '--t8-z-composer'],
    ['.t8-canvas-modal-backdrop', '--t8-z-modal-backdrop'],
    ['.t8-canvas-modal-dialog', '--t8-z-modal-dialog'],
    ['[data-t8-system-overlay]', '--t8-z-system-overlay'],
  ]);
  for (const [selector, token] of mappings) {
    const owners: postcss.Rule[] = [];
    for (const document of cssDocuments) document.root.walkRules((rule) => {
      if (rule.selectors.some((candidate) => normalizedSelector(candidate) === selector)
          && (declarations(rule).get('z-index') ?? '').includes(`var(${token})`)) owners.push(rule);
    });
    assert.ok(owners.length, `${selector} must map z-index to ${token}`);
  }

  const containerLayerViolations: string[] = [];
  for (const document of cssDocuments) document.root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => [
      '.t8-canvas-shell .react-flow__background',
      '.t8-canvas-shell .react-flow__edges',
      '.t8-canvas-shell .react-flow__nodes',
    ].includes(normalizedSelector(selector)))) return;
    const value = declarations(rule).get('z-index');
    if (value && !/var\(--t8-z-(?:canvas-decor|edge|node)\)/.test(value)) {
      containerLayerViolations.push(`${document.file}:${rule.source?.start?.line} ${rule.selector} z-index: ${value}`);
    }
  });
  assert.deepEqual(containerLayerViolations, [],
    `ReactFlow layer containers cannot retain numeric/conflicting z-index values:\n${containerLayerViolations.join('\n')}`);

  const forcedNodeLayers: string[] = [];
  for (const document of cssDocuments) document.root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => normalizedSelector(selector) === '.t8-canvas-shell .react-flow__node')) return;
    rule.walkDecls('z-index', (decl) => {
      if (decl.important) {
        forcedNodeLayers.push(`${document.file}:${decl.source?.start?.line} ${rule.selector} z-index: ${decl.value} !important`);
      }
    });
  });
  assert.deepEqual(forcedNodeLayers, [],
    `universal node rules must preserve intentional inline zIndex stacking:\n${forcedNodeLayers.join('\n')}`);
});

function themedShelfSurfaceViolations(documents: Array<{ file: string; root: postcss.Root }>): string[] {
  const violations: string[] = [];
  for (const document of documents) document.root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => subjectHasClass(selector, 't8-placement-shelf'))) return;
    const paint = declarations(rule);
    for (const prop of ['background', 'background-color']) {
      const value = paint.get(prop);
      if (!value) continue;
      if (themeLocalPaintIsTranslucent(document, value)) {
        violations.push(`${document.file}:${rule.source?.start?.line} ${rule.selector} theme translucent repaint: ${prop}: ${value}`);
      } else {
        violations.push(`${document.file}:${rule.source?.start?.line} ${rule.selector} theme repaint: ${prop}: ${value}`);
      }
    }
    for (const prop of ['z-index', 'opacity', 'backdrop-filter', '-webkit-backdrop-filter']) {
      const value = paint.get(prop);
      if (value) violations.push(`${document.file}:${rule.source?.start?.line} ${rule.selector} theme repaint: ${prop}: ${value}`);
    }
  });
  return violations;
}

test('theme-qualified shelf audit rejects paint, alpha, blur, and restacking', () => {
  const fixture = {
    file: 'fixture-theme.css',
    root: postcss.parse(`
      html[data-theme-visual="fixture"] .t8-placement-shelf {
        background: rgba(1, 2, 3, .8);
        opacity: .9;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 999;
      }
    `),
  };
  const violations = themedShelfSurfaceViolations([fixture]);
  assert.equal(violations.length, 5);
  for (const prop of ['background', 'opacity', 'backdrop-filter', '-webkit-backdrop-filter', 'z-index']) {
    assert.ok(violations.some((violation) => violation.includes(prop)), `fixture must reject ${prop}`);
  }
  assert.ok(violations.some((violation) => violation.includes('translucent repaint')));
});

test('shelf and modal surfaces are shared opaque paint and active themes cannot repaint or restack them', () => {
  const sharedTargets = new Map([
    ['.t8-placement-shelf', '--t8-z-canvas-chrome'],
    ['.t8-canvas-modal-dialog', '--t8-z-modal-dialog'],
    ['.t8-canvas-modal-dialog__body', undefined],
  ]);
  const violations: string[] = [];
  for (const [target, zToken] of sharedTargets) {
    const candidates: postcss.Rule[] = [];
    for (const document of cssDocuments) document.root.walkRules((rule) => {
      if (rule.selectors.some((selector) => normalizedSelector(selector) === target)) candidates.push(rule);
    });
    const owner = candidates.find((rule) => declarations(rule).get('background') === 'var(--t8-bg-panel-elevated)');
    if (!owner) violations.push(`${target} must use background: var(--t8-bg-panel-elevated)`);
    if (zToken && !candidates.some((rule) => (declarations(rule).get('z-index') ?? '').includes(`var(${zToken})`))) {
      violations.push(`${target} must use z-index: var(${zToken})`);
    }
    for (const rule of candidates) {
      const paint = declarations(rule);
      const background = paint.get('background') ?? paint.get('background-color') ?? '';
      if (/rgba?\s*\(|hsla?\s*\(|transparent|color-mix\s*\(|gradient\s*\(/i.test(background)) {
        violations.push(`${rule.source?.input.file}:${rule.source?.start?.line} ${target} translucent background: ${background}`);
      }
      for (const prop of ['opacity']) if (paint.has(prop)) violations.push(`${target} cannot set ${prop}`);
      for (const prop of ['backdrop-filter', '-webkit-backdrop-filter']) {
        const value = paint.get(prop);
        if (value && value !== 'none') violations.push(`${target} cannot blur its backdrop: ${value}`);
      }
    }
  }

  violations.push(...themedShelfSurfaceViolations(activeThemeDocuments));
  for (const document of activeThemeDocuments) document.root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => ['t8-canvas-modal-dialog', 't8-canvas-modal-dialog__body']
      .some((className) => subjectHasClass(selector, className)))) return;
    for (const prop of declarations(rule).keys()) {
      if (/^(?:background|background-color|z-index)$/.test(prop)) {
        violations.push(`${document.file}:${rule.source?.start?.line} ${rule.selector} theme repaint: ${prop}`);
      }
    }
  });
  assert.deepEqual(violations, [], `shelf/modal shared-surface violations:\n${violations.join('\n')}`);
});

test('node semantic compatibility aliases and node shadow mapping stay wired', () => {
  const applyTheme = readFileSync(resolve(projectRoot, 'src/theme/applyTheme.ts'), 'utf8');
  const applyThemeSource = ts.createSourceFile('src/theme/applyTheme.ts', applyTheme, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const shadowCalls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'setProperty'
        && ts.isPropertyAccessExpression(node.expression.expression)
        && ts.isIdentifier(node.expression.expression.expression)
        && node.expression.expression.expression.text === 'root'
        && node.expression.expression.name.text === 'style'
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
        && node.arguments[0].text === '--t8-shadow-node') shadowCalls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(applyThemeSource);
  assert.equal(shadowCalls.length, 1, 'applyTheme must define --t8-shadow-node in exactly one root.style.setProperty call');
  const shadowValue = shadowCalls[0]?.arguments[1];
  assert.ok(shadowValue && ts.isBinaryExpression(shadowValue)
      && (shadowValue.operatorToken.kind === ts.SyntaxKind.BarBarToken || shadowValue.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      && ts.isPropertyAccessExpression(shadowValue.left)
      && ts.isIdentifier(shadowValue.left.expression) && shadowValue.left.expression.text === 'tokens'
      && shadowValue.left.name.text === 'shadowPanel'
      && ts.isStringLiteral(shadowValue.right)
      && shadowValue.right.text === '0 8px 24px rgba(0, 0, 0, 0.18)',
  '--t8-shadow-node second argument must be tokens.shadowPanel || exact deterministic fallback in the same call');
  for (const [alias, canonical] of [
    ['--t8-node-bg', '--t8-bg-node'],
    ['--t8-node-header-bg', '--t8-bg-node-header'],
    ['--t8-node-shadow', '--t8-shadow-node'],
    ['--t8-text', '--t8-text-main'],
  ]) {
    assert.match(applyTheme, new RegExp(`setProperty\\(\\s*['"]${alias}['"]\\s*,\\s*['"]var\\(${canonical}\\)['"]`),
      `compatibility alias ${alias} must map to ${canonical}`);
  }
  const nodeRules: postcss.Rule[] = [];
  for (const document of cssDocuments) document.root.walkRules((rule) => {
    if (rule.selectors.some((selector) => normalizedSelector(selector) === '.t8-node')) nodeRules.push(rule);
  });
  assert.ok(nodeRules.some((rule) => (declarations(rule).get('box-shadow') ?? '').startsWith('var(--t8-shadow-node')),
    `.t8-node must consume --t8-shadow-node; found\n${ruleLocations(nodeRules)}`);
});
