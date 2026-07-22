import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const { BUILT_IN_THEME_TEMPLATES } = await import('../src/theme/defaultTemplates.ts');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const themeFiles = [
  'theme-pixel.css', 'theme-rh.css', 'theme-soft.css', 'theme-wabi.css', 'theme-vapor.css',
  'theme-utility.css', 'theme-skeuo.css', 'theme-retro.css', 'theme-ink.css', 'theme-tap-studio.css',
];

test('handle audit matrix is derived from exactly the 11 built-in templates', () => {
  assert.deepEqual(BUILT_IN_THEME_TEMPLATES.map(({ id }) => id).sort(), [
    'ink-default', 'pixel-candy', 'retro-default', 'rh-style', 'skeuo-default', 'soft-default',
    'tap-studio', 'tech-default', 'utility-default', 'vapor-default', 'wabi-sabi',
  ]);
  const fixture = read('src/components/HandleGeometryAuditFixture.tsx');
  assert.match(fixture, /BUILT_IN_THEME_TEMPLATES/);
  assert.doesNotMatch(fixture, /\[(?:\s*['"](?:ink-default|pixel-candy))/);
});

test('shared CSS exclusively owns visible handle and hit-target geometry', () => {
  const core = postcss.parse(read('src/styles/theme-core.css'));
  const values = new Map<string, string[]>();
  core.walkDecls((decl) => {
    const selector = decl.parent.type === 'rule' ? decl.parent.selector : '';
    if (!selector.includes('.react-flow__handle')) return;
    values.set(decl.prop, [...(values.get(decl.prop) ?? []), decl.value]);
  });
  assert.ok(values.get('--t8-handle-size')?.includes('14px'));
  assert.ok(values.get('--t8-handle-hit-size')?.includes('38px'));
  assert.ok(values.get('width')?.includes('var(--t8-handle-size)'));
  assert.ok(values.get('height')?.includes('var(--t8-handle-size)'));
  assert.ok(values.get('content')?.includes("''"));
  assert.ok(values.get('position')?.includes('absolute'));

  for (const name of themeFiles) {
    const css = postcss.parse(read(`src/styles/${name}`));
    const violations: string[] = [];
    css.walkRules((rule) => {
      if (!rule.selector.includes('.react-flow__handle')) return;
      rule.walkDecls(/^(?:width|height|min-width|min-height|left|right|top|bottom|transform)$/, (decl) => {
        violations.push(`${rule.selector} { ${decl.prop}: ${decl.value} }`);
      });
    });
    assert.deepEqual(violations, [], `${name} must preserve paint only:\n${violations.join('\n')}`);
  }
});

test('shared handle geometry outranks later single-class important utilities', () => {
  const core = postcss.parse(read('src/styles/theme-core.css'));
  const exactRule = (selector: string) => core.nodes.find((node): node is postcss.Rule =>
    node.type === 'rule' && node.selector === selector);
  const classSpecificity = (selector: string) => {
    let classes = 0;
    selectorParser().astSync(selector).walkClasses(() => { classes += 1; });
    return classes;
  };
  const baseSelector = '.t8-canvas-shell .react-flow__handle';
  const base = exactRule(baseSelector);
  assert.ok(base, 'base geometry must be canvas-scoped');
  for (const property of ['width', 'height', 'min-width', 'min-height']) {
    const declaration = base.nodes.find((node): node is postcss.Declaration =>
      node.type === 'decl' && node.prop === property);
    assert.equal(declaration?.value, 'var(--t8-handle-size)');
    assert.equal(declaration?.important, true);
  }
  assert.ok(classSpecificity(baseSelector) > classSpecificity('.\\!h-3'),
    'shared geometry must outrank a later Tailwind important utility class');

  const smartSelectors = [
    '.t8-canvas-shell .react-flow__handle.t8-smart-node-port',
    '.t8-canvas-shell .t8-smart-node-shell > .react-flow__handle',
  ];
  for (const selector of smartSelectors) {
    assert.ok(core.nodes.some((node) => node.type === 'rule' && node.selectors.includes(selector)),
      `missing smart geometry selector ${selector}`);
    assert.ok(classSpecificity(selector) > classSpecificity(baseSelector),
      `${selector} must outrank base geometry`);
  }
});

test('the final shared cascade unclips actual handle-owning painted roots', () => {
  const core = postcss.parse(read('src/styles/theme-core.css'));
  const smartOverflow: Array<{ value: string; important: boolean }> = [];
  core.walkRules((rule) => {
    if (!rule.selectors.some((selector) => /\.t8-smart-node-card(?![\w-])/.test(selector))) return;
    rule.walkDecls('overflow', (decl) => smartOverflow.push({ value: decl.value, important: decl.important }));
  });
  assert.deepEqual(smartOverflow.at(-1), { value: 'visible', important: true });

  const nestedOwnerRules = core.nodes.filter((node) => {
    if (node.type !== 'rule') return false;
    const ast = selectorParser().astSync(node.selector);
    return ast.nodes.some((selector) => {
      let hasNodeOwner = false;
      let hasHandleDescendant = false;
      let hasDescendantCombinator = false;
      selector.walkClasses((classNode) => {
        if (classNode.value === 't8-node') hasNodeOwner = true;
      });
      selector.walkPseudos((pseudo) => {
        if (pseudo.value !== ':has') return;
        pseudo.walkClasses((classNode) => {
          if (classNode.value === 'react-flow__handle') hasHandleDescendant = true;
        });
      });
      selector.walkCombinators((combinator) => {
        if (combinator.value.trim() === '') hasDescendantCombinator = true;
      });
      return hasNodeOwner && hasHandleDescendant && hasDescendantCombinator;
    });
  });
  assert.equal(nestedOwnerRules.length, 1, 'one final descendant-aware painted-owner rule must own the cascade');
  const nestedOverflow = nestedOwnerRules[0].nodes.filter((node) => node.type === 'decl' && node.prop === 'overflow');
  assert.deepEqual(nestedOverflow.map((decl) => ({ value: decl.value, important: decl.important })), [{ value: 'visible', important: true }]);
  assert.equal(core.nodes.at(-1), nestedOwnerRules[0], 'painted-owner overflow exemption must remain last in the shared cascade');

  const fixture = read('src/components/HandleGeometryAuditFixture.tsx');
  assert.match(fixture, /className="contents"[\s\S]*className="t8-node overflow-hidden"[\s\S]*<AuditPort/);
  assert.match(fixture, /data-audit-inner-clip[\s\S]*overflow-hidden/);
  for (const file of ['ClipStudioNode.tsx', 'VideoEditNode.tsx', 'BatchProcessorNode.tsx', 'ImageNode.tsx']) {
    const source = read(`src/components/nodes/${file}`);
    assert.match(source, /<Handle\b/, `${file} must remain a representative handle owner`);
    assert.match(source, /(?:overflow-hidden|t8-smart-node-card)/, `${file} must exercise a formerly clipping painted root`);
  }
});

test('regenerating smart decoration is intrinsically bounded while handle owners stay visible', () => {
  const core = postcss.parse(read('src/styles/theme-core.css'));
  const beforeRules = core.nodes.filter((node) => node.type === 'rule' && node.selector.includes('.t8-smart-node-card--regenerating::before'));
  assert.equal(beforeRules.length, 1);
  const values = new Map<string, string>();
  beforeRules[0].walkDecls((decl) => values.set(decl.prop, decl.value));
  assert.equal(values.get('inset'), '0');
  assert.equal(values.get('border-radius'), 'inherit');
  assert.equal(values.get('transform'), undefined);
  assert.equal(values.get('box-shadow'), undefined);
  assert.match(values.get('background-size') ?? '', /%/);
  assert.match(values.get('animation') ?? '', /t8-smart-regenerate-progress/);

  const keyframes = core.nodes.find((node) => node.type === 'atrule' && node.name === 'keyframes' && node.params === 't8-smart-regenerate-progress');
  assert.ok(keyframes && keyframes.type === 'atrule');
  const animatedProps = new Set<string>();
  keyframes.walkDecls((decl) => animatedProps.add(decl.prop));
  assert.ok(animatedProps.has('background-position'));
  assert.ok(!animatedProps.has('transform'));

  const fixture = read('src/components/HandleGeometryAuditFixture.tsx');
  assert.match(fixture, /t8-smart-node-card--regenerating/);
  assert.match(fixture, /t8-smart-node-preview overflow-hidden/);
});

test('shared smart headers inherit the visible owner top corners', () => {
  const core = postcss.parse(read('src/styles/theme-core.css'));
  const rules = core.nodes.filter((node) => node.type === 'rule' && node.selector.includes('.t8-smart-node-card__header'));
  const cornerValues = new Map<string, string>();
  for (const rule of rules) rule.walkDecls(/^(?:border-top-(?:left|right)-radius|border-start-(?:start|end)-radius)$/, (decl) => cornerValues.set(decl.prop, decl.value));
  assert.deepEqual(Object.fromEntries(cornerValues), {
    'border-start-start-radius': 'inherit',
    'border-start-end-radius': 'inherit',
    'border-top-left-radius': 'inherit',
    'border-top-right-radius': 'inherit',
  });

  const apparelOutput = read('src/components/nodes/ApparelPackOutputNode.tsx');
  assert.match(apparelOutput, /t8-smart-node-card overflow-hidden[\s\S]*<Handle[\s\S]*t8-smart-node-card__header/);
  const fixture = read('src/components/HandleGeometryAuditFixture.tsx');
  assert.match(fixture, /t8-smart-node-card--regenerating[\s\S]*t8-smart-node-card__header[\s\S]*t8-smart-node-preview/);
});

test('left and right handles use the exact outside placement formula', () => {
  const css = read('src/styles/theme-core.css').replace(/\s+/g, ' ');
  assert.match(css, /react-flow__handle-left[^}]*left:\s*calc\(var\(--t8-handle-hit-size\) \/ -2\)[^}]*transform:\s*translate\(-50%,\s*-50%\)/);
  assert.match(css, /react-flow__handle-right[^}]*right:\s*calc\(var\(--t8-handle-hit-size\) \/ -2\)[^}]*transform:\s*translate\(50%,\s*-50%\)/);
  assert.equal((38 / 2) - (14 / 2), 12, 'regular handles must leave a 12px visible gap');
  assert.equal((38 / 2) - (16 / 2), 11, 'smart handles must leave an 11px visible gap');
  assert.match(css, /react-flow__handle-left:not\(\.t8-group-box__handle\)/);
  assert.match(css, /react-flow__handle-right:not\(\.t8-group-box__handle\)/);
});

test('shared cascade reveals only the owned side and preserves explicit interaction states', () => {
  const core = postcss.parse(read('src/styles/theme-core.css'));
  const handleRules = core.nodes.filter((node) => node.type === 'rule'
    && node.selector.includes('.react-flow__handle'));
  const declarations = (rule: postcss.Rule) => Object.fromEntries(
    rule.nodes.filter((node): node is postcss.Declaration => node.type === 'decl')
      .map((decl) => [decl.prop, decl.value]),
  );
  const idle = handleRules.find((rule) => rule.selector === '.react-flow__handle:not(.t8-bulk-phantom-handle)');
  assert.ok(idle);
  assert.deepEqual({ opacity: declarations(idle).opacity, pointerEvents: declarations(idle)['pointer-events'] }, {
    opacity: '0', pointerEvents: 'none',
  });

  const revealRules = handleRules.filter((rule) => declarations(rule).opacity === '1'
    && declarations(rule)['pointer-events'] === 'auto');
  const selectors = revealRules.flatMap((rule) => rule.selectors);
  assert.ok(selectors.some((selector) => selector.includes('[data-t8-handle-side="left"]')
    && selector.includes('.react-flow__handle-left')));
  assert.ok(selectors.some((selector) => selector.includes('[data-t8-handle-side="right"]')
    && selector.includes('.react-flow__handle-right')));
  assert.ok(!selectors.some((selector) => selector.includes('[data-t8-handle-side="left"]')
    && selector.includes('.react-flow__handle-right')));
  assert.ok(!selectors.some((selector) => selector.includes('[data-t8-handle-side="right"]')
    && selector.includes('.react-flow__handle-left')));
  for (const contract of [
    '[data-t8-handle-side="both"]',
    '[data-t8-handle-mode="touch-transient"]',
    '[data-t8-handle-mode="touch-selected"]',
    '.connectingfrom',
    '.connectingto.valid',
    'body.shift-mode',
    'body.bulk-reconnecting',
  ]) assert.ok(selectors.some((selector) => selector.includes(contract)), `missing reveal contract ${contract}`);

  assert.ok(selectors.includes('.react-flow__handle:focus:not(.t8-bulk-phantom-handle)'),
    'programmatic focus must remain a defensive reveal fallback');
  assert.ok(handleRules.every((rule) => !rule.selector.includes('.react-flow__handle:focus-visible')),
    'non-focusable production handles must not claim a focus-visible indicator');
  const visibilityRules = handleRules.filter((rule) => {
    const values = declarations(rule);
    return values.opacity !== undefined || values['pointer-events'] !== undefined;
  });
  const phantom = visibilityRules.at(-1);
  assert.ok(phantom?.selector.includes('.t8-bulk-phantom-handle'), 'phantom override must be the final handle rule');
  assert.equal(declarations(phantom).opacity, '0');
  assert.equal(declarations(phantom)['pointer-events'], 'none');
  assert.ok(phantom.nodes.some((node) => node.type === 'decl' && node.prop === 'opacity' && node.important));
  assert.ok(selectors.every((selector) => selector.includes(':not(.t8-bulk-phantom-handle)')),
    'every reveal must explicitly exclude phantom handles');
});

test('handle pseudo-elements keep a concentric hit target and add a centered paint-only plus', () => {
  const core = postcss.parse(read('src/styles/theme-core.css'));
  const rule = (selector: string) => core.nodes.find((node): node is postcss.Rule =>
    node.type === 'rule' && node.selector === selector);
  const values = (selector: string) => {
    const result = new Map<string, string>();
    rule(selector)?.walkDecls((decl) => result.set(decl.prop, decl.value));
    return result;
  };
  const before = values('.react-flow__handle::before');
  assert.equal(before.get('width'), 'var(--t8-handle-hit-size)');
  assert.equal(before.get('height'), 'var(--t8-handle-hit-size)');
  assert.equal(before.get('top'), '50%');
  assert.equal(before.get('left'), '50%');
  assert.equal(before.get('background'), 'transparent');
  const after = values('.react-flow__handle::after');
  assert.equal(after.get('position'), 'absolute');
  assert.equal(after.get('top'), '50%');
  assert.equal(after.get('left'), '50%');
  assert.equal(after.get('pointer-events'), 'none');
  assert.match(after.get('background') ?? '', /currentColor/);
  assert.equal(after.get('transform'), 'translate(-50%, -50%)');
});

test('phantom routing handles are the sole 1px noninteractive exemption', () => {
  const canvas = read('src/components/Canvas.tsx');
  assert.equal((canvas.match(/t8-bulk-phantom-handle/g) ?? []).length, 2);
  const css = read('src/styles/theme-core.css');
  assert.match(css, /\.t8-bulk-phantom-handle[^}]*width:\s*1px[^}]*height:\s*1px[^}]*pointer-events:\s*none/s);
});

test('fixture and audit utility expose the query-gated deterministic browser contract', () => {
  const app = read('src/App.tsx');
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/HandleGeometryAuditFixture'\)\)/);
  assert.match(app, /ux-handle-audit/);
  const fixture = read('src/components/HandleGeometryAuditFixture.tsx');
  assert.match(fixture, /className="t8-canvas-shell t8-handle-audit-fixture"/);
  assert.match(fixture, /aria-label="overlap obstruction"/);
  assert.match(fixture, /function ObstructionAuditNode/);
  const overlapComponent = fixture.slice(fixture.indexOf('function OverlapAuditNode'), fixture.indexOf('function ObstructionAuditNode'));
  assert.doesNotMatch(overlapComponent, /overlap obstruction/);
  assert.match(fixture, /<ReactFlow\b/);
  assert.match(fixture, /<Handle\b/);
  assert.match(fixture, /nodes=\{AUDIT_NODES\}/);
  assert.match(fixture, /edges=\{AUDIT_EDGES\}/);
  assert.match(fixture, /useUpdateNodeInternals/);
  assert.doesNotMatch(fixture, /<(?:svg|path)\b/);
  for (const variant of ['regular', 'smart', 'groupBox', 'phantom', 'overlap']) assert.match(fixture, new RegExp(variant, 'i'));
  const audit = read('src/utils/handleGeometryAudit.ts');
  for (const field of ['templateId', 'mode', 'nodeId', 'edgeId', 'handleId', 'variant', 'state', 'expectedCenter', 'actualCenter', 'restCenter', 'stateCenterDelta', 'stateLayoutDelta', 'innerEdgeError', 'hitTargetRect', 'boundaryHits', 'svgOuterEdge', 'svgEndpoint', 'svgOuterEdgeDelta', 'svgCenterDistance', 'clipping', 'hitStackOwner', 'ownerOverflow', 'innerClipOverflow', 'regeneratingDecorationBounded', 'ownerTopLeftRadius', 'ownerTopRightRadius', 'headerTopLeftRadius', 'headerTopRightRadius', 'headerCornersMatch']) {
    assert.match(audit, new RegExp(`\\b${field}\\b`), `missing audit field ${field}`);
  }
  assert.match(audit, /elementsFromPoint/);
  assert.match(audit, /elementsFromPoint\([^)]*\)\[0\]/);
  assert.doesNotMatch(audit, /elementsFromPoint\([^;]+\.find\(/s);
  assert.match(audit, /getComputedStyle\([^,]+,\s*['"]::before['"]\)/);
  for (const state of ['valid', 'connecting', 'connectingto', 'connectingfrom']) assert.match(audit, new RegExp(`['"]${state}['"]`));
  assert.match(audit, /matches\(['"]:hover['"]\)/);
  assert.match(audit, /__t8RefreshHandleGeometry/);
  assert.match(audit, /__t8RunHandleGeometryAudit/);
  assert.match(audit, /__t8RunHandleGeometryHoverAudit/);
  assert.match(audit, /try\s*\{/);
  assert.match(audit, /finally\s*\{/);
  assert.match(audit, /getAttributeNames\(\)/);
  assert.match(audit, /className/);
});

test('focus fixture uses production canvas and smart composer action classes', () => {
  const fixture = read('src/components/HandleGeometryAuditFixture.tsx');
  assert.match(fixture, /className="t8-control-rail"[\s\S]*<button[\s\S]*className="t8-control-rail-help"/);
  assert.match(fixture, /className="t8-smart-node-composer"[\s\S]*<button[\s\S]*className="t8-btn t8-btn-primary t8-smart-run-btn"/);
  assert.match(fixture, /data-focus-audit="canvas-action"/);
  assert.match(fixture, /data-focus-audit="composer-action"/);
});

test('focus audit exposes real focus-visible measurement and restores document focus state', () => {
  const fixture = read('src/components/HandleGeometryAuditFixture.tsx');
  assert.match(fixture, /installFocusVisibleAudit/);
  const audit = read('src/utils/focusVisibleAudit.ts');
  for (const field of ['templateId', 'mode', 'controlId', 'focusObserved', 'focusVisibleObserved', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'boxShadow', 'indicatorVisible', 'clippingAncestors', 'indicatorClipped']) {
    assert.match(audit, new RegExp(`\\b${field}\\b`), `missing focus audit field ${field}`);
  }
  assert.match(audit, /matches\(['"]:focus['"]\)/);
  assert.match(audit, /matches\(['"]:focus-visible['"]\)/);
  assert.match(audit, /getAttributeNames\(\)/);
  assert.match(audit, /document\.activeElement/);
  assert.match(audit, /snapshot\.activeElement\s*===\s*document\.body/);
  assert.match(audit, /try\s*\{/);
  assert.match(audit, /finally\s*\{/);
  assert.match(audit, /__t8RunFocusVisibleAudit/);
});

test('browser artifact proves visible unclipped focus indicators across the full theme matrix', () => {
  const rows = JSON.parse(read('codex-temp/focus-visible-audit.json')) as Array<Record<string, any>>;
  const templateCount = BUILT_IN_THEME_TEMPLATES.length;
  const modes = ['dark', 'light'];
  const controls = ['canvas-action', 'composer-action'];
  assert.equal(rows.length, templateCount * modes.length * controls.length);
  assert.deepEqual([...new Set(rows.map((row) => row.templateId))].sort(), BUILT_IN_THEME_TEMPLATES.map(({ id }) => id).sort());
  assert.deepEqual([...new Set(rows.map((row) => row.mode))].sort(), modes);
  assert.deepEqual([...new Set(rows.map((row) => row.controlId))].sort(), controls);
  for (const controlId of controls) {
    assert.equal(rows.filter((row) => row.controlId === controlId).length, templateCount * modes.length);
  }
  for (const row of rows) {
    assert.equal(row.focusObserved, true, `${row.templateId}/${row.mode}/${row.controlId} did not match :focus`);
    assert.equal(row.focusVisibleObserved, true, `${row.templateId}/${row.mode}/${row.controlId} did not match :focus-visible`);
    assert.equal(row.indicatorVisible, true, `${row.templateId}/${row.mode}/${row.controlId} has no visible focus indicator`);
    assert.equal(row.indicatorClipped, false, `${row.templateId}/${row.mode}/${row.controlId} focus indicator is clipped`);
  }
});

test('browser artifact proves topmost hit ownership and honest SVG anchor semantics', () => {
  const rows = JSON.parse(read('codex-temp/handle-geometry-audit.json')) as Array<Record<string, any>>;
  const templates = new Set(rows.map((row) => row.templateId));
  const modes = new Set(rows.map((row) => row.mode));
  assert.equal(templates.size, 11);
  assert.deepEqual([...modes].sort(), ['dark', 'light']);
  const baseStates = ['rest', 'valid', 'connecting', 'connectingto', 'connectingfrom'];
  for (const state of baseStates) {
    assert.equal(rows.filter((row) => row.state === state).length, templates.size * modes.size * 5);
  }
  const hoverRows = rows.filter((row) => row.state === 'hover');
  assert.deepEqual([...new Set(hoverRows.map((row) => row.variant))].sort(), ['groupBox', 'overlap', 'regular', 'smart']);
  for (const variant of ['regular', 'smart', 'groupBox', 'overlap']) {
    assert.equal(hoverRows.filter((row) => row.variant === variant && row.hoverObserved).length, templates.size * modes.size);
  }
  const expectedRadius: Record<string, number> = { regular: 7, smart: 8, groupBox: 7, overlap: 7, phantom: 0.5 };
  for (const row of rows) {
    assert.ok('svgOuterEdge' in row && 'svgOuterEdgeDelta' in row && 'svgCenterDistance' in row);
    assert.ok(row.svgOuterEdgeDelta <= 0.5, `${row.templateId}/${row.mode}/${row.handleId}/${row.state} misses outer edge`);
    assert.ok(Math.abs(row.svgCenterDistance - expectedRadius[row.variant]) <= 0.5, `${row.templateId}/${row.mode}/${row.handleId}/${row.state} has dishonest center distance`);
    if (row.variant === 'phantom') continue;
    assert.equal(row.hitStackOwner, row.handleId, `${row.handleId} is not topmost at center`);
    assert.ok(row.boundaryHits.every((hit: { owner: string | null }) => hit.owner === row.handleId), `${row.handleId} is not topmost across its hit target`);
  }
  const smartRows = rows.filter((row) => row.variant === 'smart');
  assert.ok(smartRows.every((row) => row.ownerOverflow === 'visible'));
  assert.ok(smartRows.every((row) => row.innerClipOverflow === 'hidden'));
  assert.ok(smartRows.every((row) => row.regeneratingDecorationBounded === true));
  assert.ok(smartRows.every((row) => row.headerCornersMatch === true));
  assert.ok(smartRows.every((row) => row.headerTopLeftRadius === row.ownerTopLeftRadius));
  assert.ok(smartRows.every((row) => row.headerTopRightRadius === row.ownerTopRightRadius));
});

test('production canvas remeasures current handle bounds after theme geometry changes', () => {
  const canvas = read('src/components/Canvas.tsx');
  assert.match(canvas, /useUpdateNodeInternals/);
  assert.match(canvas, /const updateNodeInternals = useUpdateNodeInternals\(\)/);
  assert.match(canvas, /requestAnimationFrame\(\(\) =>\s*\{[^}]*updateNodeInternals\(nodesRef\.current\.map\(\(node\) => node\.id\)\)/s);
  assert.match(canvas, /cancelAnimationFrame\(/);
  assert.match(canvas, /\[theme, templateId, visualStyle, updateNodeInternals\]/);
});
