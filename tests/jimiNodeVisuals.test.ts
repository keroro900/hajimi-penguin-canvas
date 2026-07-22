import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import ts from 'typescript';
import { NODE_REGISTRY } from '../src/config/nodeRegistry.ts';
import { finalDeclarationValues } from './helpers/themeCssAudit.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

const SCOPE = 'html[data-theme-template="tech-default"]';
const jimiCssRoot = postcss.parse(readProjectFile('src/styles/jimi-foundation.css'), { from: 'src/styles/jimi-foundation.css' });

function cssRules(rootNode: postcss.Root, selector: (selector: string) => boolean): postcss.Rule[] {
  const matches: postcss.Rule[] = [];
  rootNode.walkRules((rule) => {
    if (rule.selectors.some((item) => selector(item.replace(/\s+/g, ' ').trim()))) matches.push(rule);
  });
  return matches;
}

function winningValues(rules: postcss.Rule[], prop: string): string[] {
  return rules.flatMap((rule) => {
    const value = finalDeclarationValues(rule).get(prop);
    return value === undefined ? [] : [value];
  });
}

function hasClass(selector: string, className: string): boolean {
  return new RegExp(`\\.${className}(?![\\w-])`).test(selector);
}

test('jimi-foundation.css remains valid postcss-parseable CSS after the node visual polish', () => {
  const css = readProjectFile('src/styles/jimi-foundation.css');
  assert.doesNotThrow(() => postcss.parse(css, { from: 'src/styles/jimi-foundation.css' }));
});

test('JIMI smart composer separates compact controls without increasing wrapper height', () => {
  const fieldSelector = `${SCOPE} .t8-smart-node-composer .t8-smart-field`;
  const selectSelector = `${fieldSelector} .t8-smart-select`;
  const promptSelector = `${SCOPE} .t8-smart-node-composer .t8-smart-prompt-shell`;
  const exact = (selector: string) => cssRules(jimiCssRoot, (candidate) => candidate === selector);
  const fieldRules = exact(fieldSelector);
  const selectRules = exact(selectSelector);
  const promptRules = exact(promptSelector);

  assert.deepEqual(fieldRules, [], 'smart field must not add a painted wrapper or extra geometry');
  assert.deepEqual(promptRules, [], 'prompt shell must not add a painted wrapper or extra geometry');
  assert.ok(winningValues(selectRules, 'border').includes('1px solid color-mix(in srgb, var(--t8-border-strong) 55%, var(--t8-border))'));
  assert.ok(winningValues(selectRules, 'background').includes('color-mix(in srgb, var(--t8-bg-panel-muted) 74%, var(--t8-bg-panel-elevated))'));
  assert.ok(winningValues(selectRules, 'box-shadow').includes('none'));

  const composerSelectors: string[] = [];
  const smartSelectRules = cssRules(jimiCssRoot, (selector) => hasClass(selector, 't8-smart-select'));
  jimiCssRoot.walkRules((rule) => {
    for (const selector of rule.selectors.map((item) => item.replace(/\s+/g, ' ').trim())) {
      if (hasClass(selector, 't8-smart-select')) composerSelectors.push(selector);
    }
  });
  assert.ok(composerSelectors.length > 0, 'expected smart composer visual selectors');
  for (const selector of composerSelectors) {
    assert.ok(selector.startsWith(SCOPE), `smart composer selector must be scoped: ${selector}`);
    assert.ok(selector.includes('.t8-smart-node-composer'), `smart composer selector must contain its composer ancestor: ${selector}`);
  }
  const allowedSelectProperties = new Set(['border', 'background', 'box-shadow']);
  for (const rule of smartSelectRules) {
    rule.walkDecls((declaration) => {
      assert.ok(
        allowedSelectProperties.has(declaration.prop),
        `${rule.selector} may only paint compact controls; unexpected ${declaration.prop}`,
      );
    });
  }

  const focusRules = exact(`${SCOPE} :focus-visible`);
  assert.ok(winningValues(focusRules, 'outline').includes('2px solid var(--t8-brand-accent, #5f8dff)'));
});

test('smart node ports get a clean cutout ring at rest under tech-default only', () => {
  const rules = cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE) && hasClass(selector, 't8-smart-node-port'));
  assert.ok(winningValues(rules, 'box-shadow').some((value) =>
    value.includes('0 0 0 2px var(--t8-bg-node')
    && value.includes('0 0 0 3.5px color-mix(in srgb, var(--t8-border-strong')
    && value.includes('60%, transparent)')), 'scoped smart port must use the cutout and outer ring');
  assert.deepEqual(winningValues(rules, 'opacity'), [], 'theme paint must not own handle visibility');
  const unscoped = cssRules(jimiCssRoot, (selector) => hasClass(selector, 't8-smart-node-port') && !selector.startsWith(SCOPE));
  assert.deepEqual(unscoped, [], `smart-port overrides must all be scoped; got ${unscoped.map((rule) => rule.selector).join('; ')}`);
});

test('handle hover and connecting states add an accent ring without changing geometry under tech-default', () => {
  const stateRules = cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE)
    && (/\.react-flow__handle:hover/.test(selector) || /\.react-flow__handle\.connectingto/.test(selector) || /\.react-flow__handle\.valid/.test(selector)));
  assert.ok(stateRules.some((rule) => rule.selectors.some((selector) => selector.includes(':hover'))));
  assert.ok(stateRules.some((rule) => rule.selectors.some((selector) => selector.includes('.connectingto'))));
  assert.ok(stateRules.some((rule) => rule.selectors.some((selector) => selector.includes('.valid'))));
  assert.ok(winningValues(stateRules, 'box-shadow').some((value) => value.includes('0 0 0 4px var(--t8-accent')));
  const left = cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE) && selector.includes('.react-flow__handle-left:hover'));
  const right = cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE) && selector.includes('.react-flow__handle-right:hover'));
  assert.deepEqual(winningValues(left, 'transform'), []);
  assert.deepEqual(winningValues(right, 'transform'), []);
  assert.equal(cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE)
    && selector.includes('.t8-smart-node-card:hover .react-flow__handle')).length, 0);
  assert.equal(cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE)
    && selector.includes('.t8-smart-node-shell:hover .react-flow__handle')).length, 0);
  assert.deepEqual(winningValues(stateRules, 'opacity'), [], 'theme interaction paint must not own handle visibility');
});

test('smart node cards unclip ports and regain their rounded silhouette under tech-default', () => {
  const exact = (className: string) => cssRules(jimiCssRoot, (selector) => selector === `${SCOPE} .${className}`);
  assert.ok(winningValues(exact('t8-smart-node-card'), 'overflow').includes('visible'));
  assert.deepEqual(winningValues(exact('t8-smart-node-card--regenerating'), 'overflow'), []);
  const coreRoot = postcss.parse(readProjectFile('src/styles/theme-core.css'));
  const regeneratingPseudo = cssRules(coreRoot, (selector) => selector.includes('.t8-smart-node-card--regenerating::'));
  assert.ok(regeneratingPseudo.length, 'regenerating paint should clip on its pseudo layers, not the handle owner');
  assert.ok(winningValues(exact('t8-smart-node-preview'), 'border-radius').some((value) =>
    /^calc\(var\(--t8-radius-node[^)]*\) - 1px\)$/.test(value)));
});

test('smart node cards keep hover geometry stable and use a softer selected glow', () => {
  const hoverTransforms: string[] = [];
  jimiCssRoot.walkRules((rule) => {
    if (!rule.selectors.some((selector) => /\.t8-smart-node-card:hover/.test(selector))) return;
    const transform = finalDeclarationValues(rule).get('transform');
    if (transform !== undefined) hoverTransforms.push(`${rule.source?.start?.line ?? '?'} ${transform}`);
  });
  assert.deepEqual(hoverTransforms, [], `smart-card hover must not transform node geometry:\n${hoverTransforms.join('\n')}`);
  // 选中态：硬性 3px 环换为柔和双层
  const selectedRules = cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE) && hasClass(selector, 't8-smart-node-card--selected'));
  assert.ok(winningValues(selectedRules, 'box-shadow').some((value) =>
    value.includes('0 0 0 1.5px color-mix(in srgb, var(--t8-accent') && value.includes('55%, transparent)')));
});

test('empty-state type glyph gets a soft tinted backdrop under tech-default', () => {
  const rules = cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE) && selector.endsWith('.t8-smart-node-empty > svg'));
  assert.ok(winningValues(rules, 'border-radius').includes('999px'));
  assert.ok(winningValues(rules, 'background').some((value) => value.includes('var(--t8-accent') && value.includes('10%, transparent)')));
  assert.ok(winningValues(rules, 'color').some((value) => value.includes('var(--t8-accent') && value.includes('65%, var(--t8-text-muted')));
});

test('serial badge is softened under tech-default without touching its layout tokens', () => {
  const badge = cssRules(jimiCssRoot, (selector) => selector === `${SCOPE} .t8-node-serial-badge`);
  assert.ok(winningValues(badge, 'border-color').includes('transparent'));
  assert.ok(winningValues(badge, 'color').some((value) => value.startsWith('var(--t8-text-dim')));
  const hover = cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE) && selector.endsWith('.react-flow__node:hover .t8-node-serial-badge'));
  assert.ok(winningValues(hover, 'color').some((value) => value.startsWith('var(--t8-text-muted')));
  const baseRoot = postcss.parse(readProjectFile('src/styles/index.css'));
  const serialRules = cssRules(baseRoot, (selector) => hasClass(selector, 't8-node-serial-badge'));
  assert.ok(winningValues(serialRules, '--t8-node-serial-offset-x').includes('9px'));
  assert.ok(winningValues(serialRules, '--t8-node-serial-offset-y').includes('-10px'));
});

test('data-smart-state drives a presence dot with running/failed/result variants', () => {
  const state = (name: string) => cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE)
    && selector.includes(`.t8-smart-node-shell[data-smart-state="${name}"]::after`));
  assert.ok(cssRules(jimiCssRoot, (selector) => selector.startsWith(SCOPE) && selector.includes('.t8-smart-node-shell[data-smart-state]::after')).length);
  assert.ok(winningValues(state('running'), 'background').some((value) => value.startsWith('var(--t8-accent')));
  assert.ok(winningValues(state('failed'), 'background').some((value) => value.startsWith('var(--t8-danger')));
  assert.ok(winningValues(state('result'), 'background').some((value) => value.startsWith('var(--t8-success')));
  assert.ok(winningValues(state('empty'), 'display').includes('none'));
  const keyframes: string[] = [];
  jimiCssRoot.walkAtRules('keyframes', (rule) => keyframes.push(rule.params));
  assert.ok(keyframes.includes('t8-jimi-node-status-pulse'));
  const reduced = state('running').filter((rule) => rule.parent?.type === 'atrule'
    && rule.parent.name === 'media' && rule.parent.params === '(prefers-reduced-motion: reduce)');
  assert.ok(winningValues(reduced, 'animation').includes('none'));
});

test('theme-core.css keeps the pinned smart node class names and port base styles', () => {
  const coreRoot = postcss.parse(readProjectFile('src/styles/theme-core.css'));
  for (const className of ['t8-smart-node-card', 't8-smart-node-card--selected', 't8-smart-node-card--accepting',
    't8-smart-node-card--regenerating', 't8-smart-node-port', 't8-smart-node-empty']) {
    assert.ok(cssRules(coreRoot, (selector) => selector === `.${className}`).length, `missing .${className}`);
  }
  const baseRoot = postcss.parse(readProjectFile('src/styles/index.css'));
  const hitArea = cssRules(coreRoot, (selector) => selector === '.react-flow__handle::before');
  assert.ok(winningValues(hitArea, 'width').includes('var(--t8-handle-hit-size)'));
  assert.ok(winningValues(hitArea, 'height').includes('var(--t8-handle-hit-size)'));
});

type ComponentMapping = { nodeType: string; componentName: string; file: string };

function sourceFile(path: string): ts.SourceFile {
  const file = resolve(root, path);
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
}

function registryTypes(): string[] {
  assert.ok(Array.isArray(NODE_REGISTRY), 'runtime NODE_REGISTRY export must be an array');
  return NODE_REGISTRY.map((entry, index) => {
    assert.ok(entry && typeof entry.type === 'string' && entry.type.length > 0, `runtime NODE_REGISTRY[${index}] must expose a non-empty type`);
    return entry.type;
  });
}

function registeredComponentMappings(): ComponentMapping[] {
  const canvasPath = 'src/components/Canvas.tsx';
  const canvas = sourceFile(canvasPath);
  const imports = new Map<string, string>();
  const nodeComponents = new Map<string, string>();
  for (const statement of canvas.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (ts.isCallExpression(declaration.initializer)
          && ts.isIdentifier(declaration.initializer.expression)
          && declaration.initializer.expression.text === 'lazyCanvasNode') {
        const loader = declaration.initializer.arguments[0];
        if ((ts.isArrowFunction(loader) || ts.isFunctionExpression(loader)) && ts.isCallExpression(loader.body)
            && loader.body.expression.kind === ts.SyntaxKind.ImportKeyword
            && ts.isStringLiteral(loader.body.arguments[0])) {
          imports.set(declaration.name.text, `${loader.body.arguments[0].text.replace(/^\.\//, 'src/components/').replace(/^src\/components\/nodes\//, 'src/components/nodes/')}.tsx`);
        }
      }
      if (declaration.name.text === 'SPECIFIC_NODES' && ts.isObjectLiteralExpression(declaration.initializer)) {
        for (const property of declaration.initializer.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.initializer)) continue;
          const type = propertyName(property.name);
          if (type) nodeComponents.set(type, property.initializer.text);
        }
      }
    }
  }
  return registryTypes().map((nodeType) => {
    const componentName = nodeComponents.get(nodeType);
    assert.ok(componentName, `NODE_REGISTRY type ${nodeType} has no SPECIFIC_NODES mapping in ${canvasPath}`);
    const file = imports.get(componentName);
    assert.ok(file, `${nodeType} maps to ${componentName}, but its lazyCanvasNode import could not be resolved`);
    return { nodeType, componentName, file };
  });
}

function componentFunction(source: ts.SourceFile, name: string): ts.FunctionLikeDeclaration {
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer
            && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) return declaration.initializer;
      }
    }
  }
  assert.fail(`could not find owning function component ${name} in ${source.fileName}`);
}

function jsxRoots(expression: ts.Expression): Array<ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment> {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) expression = expression.expression;
  if (ts.isConditionalExpression(expression)) return [...jsxRoots(expression.whenTrue), ...jsxRoots(expression.whenFalse)];
  if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression) || ts.isJsxFragment(expression)) return [expression];
  return [];
}

function topLevelReturnedRoots(source: ts.SourceFile, componentName: string): Array<ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment> {
  const owner = componentFunction(source, componentName);
  if (ts.isArrowFunction(owner) && !ts.isBlock(owner.body)) return jsxRoots(owner.body);
  const roots: Array<ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment> = [];
  const visit = (node: ts.Node): void => {
    if (node !== owner && ts.isFunctionLike(node)) return; // callbacks/helpers own their returns
    if (ts.isReturnStatement(node) && node.expression) roots.push(...jsxRoots(node.expression));
    ts.forEachChild(node, visit);
  };
  visit(owner);
  return roots;
}

function opening(rootNode: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment): ts.JsxOpeningLikeElement | undefined {
  return ts.isJsxElement(rootNode) ? rootNode.openingElement : ts.isJsxSelfClosingElement(rootNode) ? rootNode : undefined;
}

function jsxAttribute(tag: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return tag.attributes.properties.find((attribute): attribute is ts.JsxAttribute =>
    ts.isJsxAttribute(attribute) && attribute.name.text === name);
}

function staticClassTokens(attribute: ts.JsxAttribute | undefined): Set<string> {
  const tokens = new Set<string>();
  const add = (text: string) => text.split(/\s+/).filter(Boolean).forEach((token) => tokens.add(token));
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node.text);
    ts.forEachChild(node, visit);
  };
  if (attribute?.initializer) visit(attribute.initializer);
  return tokens;
}

function jsxStyleObject(tag: ts.JsxOpeningLikeElement): ts.ObjectLiteralExpression | undefined {
  const initializer = jsxAttribute(tag, 'style')?.initializer;
  const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined;
  return expression && ts.isObjectLiteralExpression(expression) ? expression : undefined;
}

function objectProperty(object: ts.ObjectLiteralExpression | undefined, name: string): ts.Expression | undefined {
  const property = object?.properties.find((item): item is ts.PropertyAssignment =>
    ts.isPropertyAssignment(item) && propertyName(item.name) === name);
  return property?.initializer;
}

function tagName(tag: ts.JsxOpeningLikeElement): string {
  return tag.tagName.getText(tag.getSourceFile());
}

function jsxElementsWithin(node: ts.Node): Array<ts.JsxElement | ts.JsxSelfClosingElement> {
  const result: Array<ts.JsxElement | ts.JsxSelfClosingElement> = [];
  const visit = (child: ts.Node): void => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) result.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return result;
}

function referencesNodeSelection(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(child) && child.text === 'selected') {
      found = true;
      return;
    }
    if (ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.expression)
        && child.expression.text === 'p' && child.name.text === 'selected') {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function containsExactClassToken(node: ts.Node, token: string): boolean {
  let found = false;
  const exact = new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`);
  const visit = (child: ts.Node): void => {
    if (found) return;
    if ((ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)
        || ts.isTemplateHead(child) || ts.isTemplateMiddle(child) || ts.isTemplateTail(child))
        && exact.test(child.text)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function exactSelectionPolarity(node: ts.Expression): 'selected' | 'unselected' | undefined {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (ts.isIdentifier(node) && node.text === 'selected') return 'selected';
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'p' && node.name.text === 'selected') return 'selected';
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = exactSelectionPolarity(node.operand);
    return operand === 'selected' ? 'unselected' : operand === 'unselected' ? 'selected' : undefined;
  }
  return undefined;
}

function hasSelectionDrivenClass(expression: ts.Expression | undefined, token: string): boolean {
  if (!expression) return false;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isConditionalExpression(node)) {
      const polarity = exactSelectionPolarity(node.condition);
      if ((polarity === 'selected' && containsExactClassToken(node.whenTrue, token))
          || (polarity === 'unselected' && containsExactClassToken(node.whenFalse, token))) {
        found = true;
        return;
      }
    }
    if (ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        && exactSelectionPolarity(node.left) === 'selected'
        && containsExactClassToken(node.right, token)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function selectionDependentStyleProperties(
  styleExpression: ts.Expression,
  source: ts.SourceFile = styleExpression.getSourceFile(),
  owner?: ts.FunctionLikeDeclaration,
): Array<{ name: string; expression: ts.Expression }> {
  const violations: Array<{ name: string; expression: ts.Expression }> = [];
  const initializers = new Map<string, ts.Expression>();
  const collect = (node: ts.Node, owningFunction?: ts.FunctionLikeDeclaration): void => {
    if (owningFunction && node !== owningFunction && ts.isFunctionLike(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) initializers.set(node.name.text, node.initializer);
    ts.forEachChild(node, (child) => collect(child, owningFunction));
  };
  if (owner) {
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement)) collect(statement);
    }
    collect(owner, owner);
  } else collect(source);
  const resolving = new Set<string>();
  const visit = (node: ts.Node, selectionGate = false): void => {
    if (ts.isIdentifier(node) && initializers.has(node.text) && !resolving.has(node.text)) {
      resolving.add(node.text);
      visit(initializers.get(node.text)!, selectionGate);
      resolving.delete(node.text);
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name)?.toLowerCase();
      if (name && ['boxshadow', 'border', 'bordercolor'].includes(name)) {
        if (selectionGate || referencesNodeSelection(node.initializer)) violations.push({ name, expression: node.initializer });
      }
    }
    if (ts.isConditionalExpression(node)) {
      const polarity = exactSelectionPolarity(node.condition);
      visit(node.condition, selectionGate);
      if (polarity === 'selected') {
        visit(node.whenTrue, true);
        visit(node.whenFalse, selectionGate);
      } else if (polarity === 'unselected') {
        visit(node.whenTrue, selectionGate);
        visit(node.whenFalse, true);
      } else {
        const gated = selectionGate || referencesNodeSelection(node.condition);
        visit(node.whenTrue, gated);
        visit(node.whenFalse, gated);
      }
      return;
    }
    if (ts.isBinaryExpression(node)
        && (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      const polarity = exactSelectionPolarity(node.left);
      const rightRunsWhenSelected = (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && polarity === 'selected')
        || (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && polarity === 'unselected');
      const unknownSelectionGate = polarity === undefined && referencesNodeSelection(node.left);
      visit(node.left, selectionGate);
      visit(node.right, selectionGate || rightRunsWhenSelected || unknownSelectionGate);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, selectionGate));
  };
  visit(styleExpression);
  return violations;
}

function fixtureExpression(text: string): ts.Expression {
  const source = ts.createSourceFile('fixture.tsx', `const fixture = ${text};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = source.statements[0] as ts.VariableStatement;
  return statement.declarationList.declarations[0].initializer!;
}

test('selection class AST check enforces selected polarity', () => {
  for (const expression of [
    "selected ? 'base is-selected' : 'base'",
    "p.selected ? 'is-selected' : ''",
    "!selected ? 'base' : 'base is-selected'",
    "!p.selected ? '' : 'is-selected'",
    "selected && 'is-selected'",
  ]) assert.equal(hasSelectionDrivenClass(fixtureExpression(expression), 'is-selected'), true, `should accept ${expression}`);
  for (const expression of [
    "selected ? 'base' : 'is-selected'",
    "p.selected ? '' : 'is-selected'",
    "!selected ? 'is-selected' : ''",
    "!p.selected && 'is-selected'",
    "selected || 'is-selected'",
    "'is-selected'",
  ]) assert.equal(hasSelectionDrivenClass(fixtureExpression(expression), 'is-selected'), false, `should reject ${expression}`);
});

test('root style AST check catches ancestor selection branches', () => {
  const direct = fixtureExpression("({ boxShadow: selected ? 'a' : 'b' })");
  const ancestor = fixtureExpression("selected ? { boxShadow: 'a', borderColor: '#fff' } : {}");
  const logical = fixtureExpression("p.selected && { border: '1px solid red' }");
  const safe = fixtureExpression("({ boxShadow: 'var(--t8-shadow-node)' })");
  assert.deepEqual(selectionDependentStyleProperties(direct).map(({ name }) => name), ['boxshadow']);
  assert.deepEqual(selectionDependentStyleProperties(ancestor).map(({ name }) => name), ['boxshadow', 'bordercolor']);
  assert.deepEqual(selectionDependentStyleProperties(logical).map(({ name }) => name), ['border']);
  assert.deepEqual(selectionDependentStyleProperties(safe), []);
  const resolvedSource = ts.createSourceFile('resolved.tsx', `
    const selectedStyle = { boxShadow: 'var(--bad)' };
    const baseStyle = { border: '1px solid var(--safe)' };
    const styleA = selected ? selectedStyle : baseStyle;
    const styleB = { ...baseStyle, ...(selected && selectedStyle) };
    const styleC = !selected ? baseStyle : selectedStyle;
    const styleD = selected || selectedStyle;
    const styleE = !selected || selectedStyle;
    const styleF = !selected && selectedStyle;
  `, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = resolvedSource.statements.flatMap((statement) => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []);
  const styleA = declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === 'styleA')!.initializer!;
  const styleB = declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === 'styleB')!.initializer!;
  const styleC = declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === 'styleC')!.initializer!;
  const styleD = declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === 'styleD')!.initializer!;
  const styleE = declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === 'styleE')!.initializer!;
  const styleF = declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === 'styleF')!.initializer!;
  assert.deepEqual(selectionDependentStyleProperties(styleA, resolvedSource).map(({ name }) => name), ['boxshadow']);
  assert.deepEqual(selectionDependentStyleProperties(styleB, resolvedSource).map(({ name }) => name), ['boxshadow']);
  assert.deepEqual(selectionDependentStyleProperties(styleC, resolvedSource).map(({ name }) => name), ['boxshadow']);
  assert.deepEqual(selectionDependentStyleProperties(styleD, resolvedSource), []);
  assert.deepEqual(selectionDependentStyleProperties(styleE, resolvedSource).map(({ name }) => name), ['boxshadow']);
  assert.deepEqual(selectionDependentStyleProperties(styleF, resolvedSource), []);

  const scopedSource = ts.createSourceFile('scoped.tsx', `
    const SELECTED_STYLE = { boxShadow: 'var(--bad)' };
    const BASE_STYLE = { border: '1px solid var(--module-base)' };
    function Fixture() {
      const BASE_STYLE = { borderColor: 'var(--local-base)' };
      const rootStyle = selected ? SELECTED_STYLE : BASE_STYLE;
      return <div style={rootStyle} />;
    }
  `, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scopedOwner = componentFunction(scopedSource, 'Fixture')!;
  const scopedRoot = topLevelReturnedRoots(scopedSource, 'Fixture')[0];
  assert.ok(scopedRoot && !ts.isJsxFragment(scopedRoot));
  const scopedStyle = jsxAttribute(opening(scopedRoot)!, 'style')!.initializer as ts.JsxExpression;
  assert.deepEqual(selectionDependentStyleProperties(scopedStyle.expression!, scopedSource, scopedOwner).map(({ name }) => name), ['boxshadow'],
    'module consts must resolve while component-local consts shadow same-named module declarations');
});

function rootAudit(source: ts.SourceFile, componentName: string): string[] {
  const violations: string[] = [];
  const roots = topLevelReturnedRoots(source, componentName);
  if (!roots.length) return [`${source.fileName}: ${componentName} has no top-level returned JSX root`];
  for (const rootNode of roots) {
    const tag = opening(rootNode);
    const line = source.getLineAndCharacterOfPosition(rootNode.getStart(source)).line + 1;
    if (!tag) {
      violations.push(`${source.fileName}:${line} ${componentName} returns a Fragment without an explicit canvas-node root`);
      continue;
    }
    const classAttribute = jsxAttribute(tag, 'className');
    const dataRoot = jsxAttribute(tag, 'data-canvas-node-root');
    const classText = classAttribute?.initializer?.getText(source) ?? '';
    const rootTokens = staticClassTokens(classAttribute);
    const dataText = dataRoot?.initializer?.getText(source) ?? '';
    if (!/(?:^|[^\w-])t8-(?:node|smart-node-card)(?:[^\w-]|$)/.test(classText)
        && !/^(?:\{true\}|["']true["'])$/.test(dataText)) {
      violations.push(`${source.fileName}:${line} ${componentName} root must carry t8-node/t8-smart-node-card or data-canvas-node-root=true (got ${classText || tag.tagName.getText(source)})`);
    }
    const classExpression = classAttribute?.initializer && ts.isJsxExpression(classAttribute.initializer)
      ? classAttribute.initializer.expression : undefined;
    if (!rootTokens.has('contents') && !hasSelectionDrivenClass(classExpression, 'is-selected')) {
      violations.push(`${source.fileName}:${line} ${componentName} <${tagName(tag)}> root must expose an is-selected class driven by selected/p.selected (got ${classText || '<no className>'})`);
    }
    if (rootTokens.has('contents')) {
      const paintedDescendants = jsxElementsWithin(rootNode).filter((node) => {
        const childTag = ts.isJsxElement(node) ? node.openingElement : node;
        const tokens = staticClassTokens(jsxAttribute(childTag, 'className'));
        return tokens.has('t8-node') || tokens.has('t8-smart-node-card');
      });
      for (const node of paintedDescendants) {
        const childTag = ts.isJsxElement(node) ? node.openingElement : node;
        const childClass = jsxAttribute(childTag, 'className')?.initializer;
        if (!(childClass && ts.isJsxExpression(childClass) && hasSelectionDrivenClass(childClass.expression, 'is-selected'))) {
          violations.push(`${source.fileName}:${line} ${componentName} display:contents painted descendant <${tagName(childTag)}> must own selected-driven is-selected`);
        }
      }
    }
    if (/\bring(?:-[^\s'"`}]+)*-[a-z]+-300\b/.test(classText)) {
      violations.push(`${source.fileName}:${line} ${componentName} root selection ring uses a fixed *-300 color: ${classText}`);
    }
    const styleAttribute = jsxAttribute(tag, 'style');
    const styleExpression = styleAttribute?.initializer && ts.isJsxExpression(styleAttribute.initializer) ? styleAttribute.initializer.expression : undefined;
    if (styleExpression) {
      for (const { name, expression } of selectionDependentStyleProperties(styleExpression, source, componentFunction(source, componentName))) {
        violations.push(`${source.fileName}:${line} ${componentName} <${tagName(tag)}> root ${name} must not depend on selected/p.selected: ${expression.getText(source)}`);
      }
    }
  }
  return violations;
}

function paintedClassNodes(source: ts.SourceFile, className: string): ts.JsxOpeningLikeElement[] {
  const result: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = ts.isJsxElement(node) ? node.openingElement : node;
      if (staticClassTokens(jsxAttribute(tag, 'className')).has(className)) result.push(tag);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

test('display:contents ownership wrappers delegate selection to painted node surfaces', () => {
  for (const [file, componentName] of [
    ['src/components/nodes/ClipStudioNode.tsx', 'ClipStudioNode'],
    ['src/components/nodes/Panorama3DNode.tsx', 'Panorama3DNode'],
  ] as const) {
    const source = sourceFile(file);
    const owner = topLevelReturnedRoots(source, componentName)[0];
    assert.ok(owner && ts.isJsxElement(owner), `${componentName} needs an ownership root`);
    const ownerTag = owner.openingElement;
    assert.ok(staticClassTokens(jsxAttribute(ownerTag, 'className')).has('contents'));
    const ownerClass = jsxAttribute(ownerTag, 'className')?.initializer;
    assert.ok(!(ownerClass && ts.isJsxExpression(ownerClass) && hasSelectionDrivenClass(ownerClass.expression, 'is-selected')),
      `${componentName} ownership wrapper must not own visual selection`);
    const painted = jsxElementsWithin(owner).filter((node) => {
      const tag = ts.isJsxElement(node) ? node.openingElement : node;
      return staticClassTokens(jsxAttribute(tag, 'className')).has('t8-node');
    });
    assert.ok(painted.length, `${componentName} needs an actual painted t8-node descendant`);
    for (const node of painted) {
      const tag = ts.isJsxElement(node) ? node.openingElement : node;
      const className = jsxAttribute(tag, 'className')?.initializer;
      assert.ok(className && ts.isJsxExpression(className) && hasSelectionDrivenClass(className.expression, 'is-selected'),
        `${componentName} painted t8-node must own is-selected`);
    }
  }
});

test('MaterialSet classic and smart painted roots own semantic selection', () => {
  const source = sourceFile('src/components/nodes/MaterialSetNode.tsx');
  for (const className of ['t8-material-set-classic', 't8-smart-material-set-card']) {
    const painted = paintedClassNodes(source, className);
    assert.equal(painted.length, 1, `expected one ${className} painted root`);
    const classAttr = jsxAttribute(painted[0], 'className')?.initializer;
    assert.ok(classAttr && ts.isJsxExpression(classAttr) && hasSelectionDrivenClass(classAttr.expression, 'is-selected'),
      `${className} must own selected-driven is-selected`);
  }
});

test('every NODE_REGISTRY component exposes auditable semantic canvas roots', () => {
  const excluded = new Set(['GroupBoxNode', 'BulkPhantomNode']);
  const uniqueComponents = new Map<string, ComponentMapping>();
  for (const mapping of registeredComponentMappings()) uniqueComponents.set(`${mapping.file}:${mapping.componentName}`, mapping);
  const violations = [...uniqueComponents.values()].flatMap(({ nodeType, componentName, file }) =>
    excluded.has(componentName) ? [] : rootAudit(sourceFile(file), componentName).map((message) => `[${nodeType}] ${message}`));
  assert.deepEqual(violations, [], `registered canvas-node root violations:\n${violations.join('\n')}`);
});

test('LayerAgent selection styling is audited only at its owning canvas root', () => {
  const source = sourceFile('src/components/nodes/LayerAgentNode.tsx');
  const violations = rootAudit(source, 'LayerAgentNode');
  assert.doesNotMatch(violations.join('\n'), /selectedLayerId|LayerRow/,
    'descendant row/layer selection is specialist inner UI and must remain allowed');
  assert.deepEqual(violations, [], `LayerAgent outer root must use the shared selection contract:\n${violations.join('\n')}`);
});

test('VideoEditNode keeps its exact root width and clipping with legacy handle utility tokens', () => {
  const source = sourceFile('src/components/nodes/VideoEditNode.tsx');
  const rootNode = topLevelReturnedRoots(source, 'VideoEditNode').find(ts.isJsxElement);
  assert.ok(rootNode, 'VideoEditNode must return a JSX element root');
  const rootClass = jsxAttribute(rootNode.openingElement, 'className')?.initializer?.getText(source) ?? '';
  const rootTokens = staticClassTokens(jsxAttribute(rootNode.openingElement, 'className'));
  for (const token of ['t8-node', 'min-w-[760px]', 'max-w-[760px]', 'overflow-hidden']) assert.ok(rootTokens.has(token), `VideoEdit root missing ${token}; got ${rootClass}`);
  const handles = rootNode.children.filter((child): child is ts.JsxSelfClosingElement =>
    ts.isJsxSelfClosingElement(child) && tagName(child) === 'Handle');
  assert.equal(handles.length, 2, 'VideoEditNode must have exactly two root handles');
  for (const handle of handles) {
    const tokens = staticClassTokens(jsxAttribute(handle, 'className'));
    assert.ok(tokens.has('!h-3') && tokens.has('!w-3'),
      `legacy utility tokens may remain because shared handle CSS demonstrably outranks them; got ${[...tokens].join(' ')}`);
  }
});

test('smart ImageNode preserves width/height geometry, two ports, and preview', () => {
  const source = sourceFile('src/components/nodes/ImageNode.tsx');
  const smartRoot = topLevelReturnedRoots(source, 'ImageNode').filter(ts.isJsxElement).find((node) => {
    const tag = node.openingElement;
    return tagName(tag) === 'SmartNodeShell' && staticClassTokens(jsxAttribute(tag, 'className')).has('t8-smart-image-node');
  });
  assert.ok(smartRoot, 'ImageNode smart variant must return SmartNodeShell with t8-smart-image-node');
  assert.equal(objectProperty(jsxStyleObject(smartRoot.openingElement), 'width')?.getText(source), 'smartCardWidth');
  const descendants = jsxElementsWithin(smartRoot);
  const card = descendants.filter(ts.isJsxElement).find((node) =>
    staticClassTokens(jsxAttribute(node.openingElement, 'className')).has('t8-smart-node-card'));
  assert.ok(card, 'ImageNode smart root must contain its t8-smart-node-card element');
  assert.equal(objectProperty(jsxStyleObject(card.openingElement), 'height')?.getText(source), 'smartCardHeight');
  const ports = jsxElementsWithin(card).filter((node): node is ts.JsxSelfClosingElement =>
    ts.isJsxSelfClosingElement(node) && tagName(node) === 'Handle'
    && staticClassTokens(jsxAttribute(node, 'className')).has('t8-smart-node-port'));
  assert.equal(ports.length, 2, 'smart ImageNode must expose exactly two t8-smart-node-port Handles');
  assert.ok(descendants.filter(ts.isJsxElement).some((node) =>
    staticClassTokens(jsxAttribute(node.openingElement, 'className')).has('t8-smart-node-preview')),
  'smart ImageNode must retain its preview surface');
});

function styleExpressionHasVisibleOverflow(expression: ts.Expression, initializers: Map<string, ts.Expression>): boolean {
  type OverflowState = 'absent' | 'visible' | 'other' | 'unknown';
  const states = (current: ts.Expression, seen = new Set<string>()): OverflowState[] => {
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
    if (ts.isIdentifier(current)) {
      if (seen.has(current.text) || !initializers.has(current.text)) return ['unknown'];
      const nextSeen = new Set(seen);
      nextSeen.add(current.text);
      return states(initializers.get(current.text)!, nextSeen);
    }
    if (ts.isConditionalExpression(current)) return [...states(current.whenTrue, new Set(seen)), ...states(current.whenFalse, new Set(seen))];
    if (!ts.isObjectLiteralExpression(current)) return ['unknown'];
    let effective: OverflowState[] = ['absent'];
    for (const property of current.properties) {
      if (ts.isPropertyAssignment(property) && propertyName(property.name) === 'overflow') {
        effective = [ts.isStringLiteral(property.initializer) && property.initializer.text === 'visible' ? 'visible' : 'other'];
      } else if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'overflow') {
        effective = ['unknown'];
      } else if (ts.isSpreadAssignment(property)) {
        const spreadStates = states(property.expression, new Set(seen));
        effective = effective.flatMap((prior) => spreadStates.map((spread) => spread === 'absent' ? prior : spread));
      }
    }
    return effective;
  };
  const effective = states(expression);
  return effective.length > 0 && effective.every((state) => state === 'visible');
}

test('style overflow resolver follows aliases and effective object-property order', () => {
  const source = ts.createSourceFile('overflow-fixture.tsx', `
    const base = { overflow: 'hidden' };
    const renamed = { ...base, overflow: 'visible' };
    const conditional = flag ? renamed : { overflow: 'visible' };
    const laterSpread = { overflow: 'visible', ...base };
    const laterOverride = { overflow: 'visible', overflow: 'hidden' };
  `, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers = new Map<string, ts.Expression>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) initializers.set(declaration.name.text, declaration.initializer);
    }
  }
  assert.equal(styleExpressionHasVisibleOverflow(initializers.get('renamed')!, initializers), true);
  assert.equal(styleExpressionHasVisibleOverflow(initializers.get('conditional')!, initializers), true);
  assert.equal(styleExpressionHasVisibleOverflow(fixtureExpression("({ overflow: 'visible' })"), new Map()), true);
  assert.equal(styleExpressionHasVisibleOverflow(initializers.get('laterSpread')!, initializers), false);
  assert.equal(styleExpressionHasVisibleOverflow(initializers.get('laterOverride')!, initializers), false);
});

test('GroupBox geometry remains overflow-visible with 14px handles and HEADER_H body math', () => {
  const source = sourceFile('src/components/nodes/GroupBoxNode.tsx');
  const headerDeclaration = source.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === 'HEADER_H');
  assert.equal(headerDeclaration?.initializer?.getText(source), '40', 'GroupBox HEADER_H must remain exactly 40');
  const rootNode = topLevelReturnedRoots(source, 'GroupBoxNode').find(ts.isJsxElement);
  assert.ok(rootNode, 'GroupBoxNode must return a JSX element root');
  const owner = componentFunction(source, 'GroupBoxNode');
  const groupInitializers = new Map<string, ts.Expression>();
  const collectGroupInitializers = (node: ts.Node): void => {
    if (node !== owner && ts.isFunctionLike(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) groupInitializers.set(node.name.text, node.initializer);
    ts.forEachChild(node, collectGroupInitializers);
  };
  collectGroupInitializers(owner);
  const rootStyleInitializer = jsxAttribute(rootNode.openingElement, 'style')?.initializer;
  const rootStyleExpression = rootStyleInitializer && ts.isJsxExpression(rootStyleInitializer) ? rootStyleInitializer.expression : undefined;
  assert.ok(rootStyleExpression && styleExpressionHasVisibleOverflow(rootStyleExpression, groupInitializers),
    `GroupBox root style must resolve to effective overflow: visible in every branch; got ${rootStyleExpression?.getText(source) ?? '<missing>'}`);
  const handles = rootNode.children.filter((child): child is ts.JsxSelfClosingElement =>
    ts.isJsxSelfClosingElement(child) && tagName(child) === 'Handle');
  assert.equal(handles.length, 2, 'GroupBox must have exactly two top-level Handle elements');
  const isFourteen = (expression: ts.Expression | undefined): boolean => {
    if (!expression) return false;
    while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    if (ts.isNumericLiteral(expression)) return expression.text === '14';
    return ts.isConditionalExpression(expression) && isFourteen(expression.whenTrue) && isFourteen(expression.whenFalse);
  };
  for (const handle of handles) {
    const style = jsxStyleObject(handle);
    for (const property of ['width', 'height', 'minWidth', 'minHeight']) {
      assert.ok(isFourteen(objectProperty(style, property)), `GroupBox ${jsxAttribute(handle, 'id')?.initializer?.getText(source)} ${property} must equal 14`);
    }
  }
  const descendants = jsxElementsWithin(rootNode);
  const header = descendants.filter(ts.isJsxElement).find((node) => /t8-group-box__header/.test(jsxAttribute(node.openingElement, 'className')?.initializer?.getText(source) ?? ''));
  assert.equal(objectProperty(header && jsxStyleObject(header.openingElement), 'height')?.getText(source), 'HEADER_H');
  const isBodyHeight = (expression: ts.Expression | undefined, seen = new Set<string>()): boolean => {
    if (!expression) return false;
    while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) expression = expression.expression;
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.MinusToken) {
      const left = expression.left;
      const right = expression.right;
      return ts.isIdentifier(left) && left.text === 'height' && ts.isIdentifier(right) && right.text === 'HEADER_H';
    }
    if (ts.isIdentifier(expression) && !seen.has(expression.text) && groupInitializers.has(expression.text)) {
      seen.add(expression.text);
      return isBodyHeight(groupInitializers.get(expression.text), seen);
    }
    return false;
  };
  assert.ok(descendants.some((node) => isBodyHeight(objectProperty(jsxStyleObject(ts.isJsxElement(node) ? node.openingElement : node), 'height'))),
    'GroupBox body height must subtract HEADER_H exactly once');
});
