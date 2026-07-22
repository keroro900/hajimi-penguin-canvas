import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import postcss, { type Declaration, type Root, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

export interface CssDocument {
  file: string;
  root: Root;
}

export interface CssViolation {
  file: string;
  line: number | undefined;
  selector: string;
  reason: string;
}

export function localCssImportSpecifier(params: string): string | undefined {
  const match = params.match(/^\s*(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)|"([^"]+)"|'([^']+)')/i);
  const specifier = match?.slice(1).find(Boolean);
  if (!specifier || /^(?:[a-z][a-z\d+.-]*:|\/\/|data:)/i.test(specifier)) return undefined;
  return specifier;
}

export function loadLocalCssImportGraph(entryFile: string, projectRoot: string): CssDocument[] {
  const documents: CssDocument[] = [];
  const visited = new Set<string>();

  function visit(file: string): void {
    const absolute = resolve(file);
    const key = absolute.toLowerCase();
    if (visited.has(key)) return;
    visited.add(key);

    const displayFile = relative(projectRoot, absolute).replaceAll('\\', '/');
    const root = postcss.parse(readFileSync(absolute, 'utf8'), { from: displayFile });
    documents.push({ file: displayFile, root });
    root.walkAtRules('import', (atRule) => {
      const specifier = localCssImportSpecifier(atRule.params);
      if (!specifier) return;
      visit(isAbsolute(specifier) ? specifier : resolve(dirname(absolute), specifier));
    });
  }

  visit(resolve(projectRoot, entryFile));
  return documents;
}

export function selectorHasInteractionState(selector: string): boolean {
  let matched = false;
  selectorParser((root) => {
    root.walkClasses((classNode) => {
      if (classNode.value !== 't8-node-dragging' && classNode.value !== 't8-viewport-moving') return;
      for (let parent = classNode.parent; parent; parent = parent.parent) {
        if (parent.type === 'pseudo' && parent.value.toLowerCase() === ':not') return;
      }
      matched = true;
    });
  }).processSync(selector);
  return matched;
}

type Surface = 'shell' | 'pseudo' | 'background' | 'pattern';

function classifySelector(selector: string): Surface | undefined {
  let surface: Surface | undefined;
  selectorParser((root) => {
    const selectorNode = root.nodes[0];
    if (!selectorNode) return;

    const isUnderNot = (node: { parent?: any }): boolean => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.type === 'pseudo' && String(parent.value).toLowerCase() === ':not') return true;
      }
      return false;
    };
    const positiveClasses: Array<{ value: string; parent?: any }> = [];
    selectorNode.walkClasses((classNode) => {
      if (!isUnderNot(classNode)) positiveClasses.push(classNode);
    });
    if (positiveClasses.some(({ value }) => value === 'react-flow__node' || /editor/i.test(value))) return;
    if (positiveClasses.some(({ value }) => value === 'react-flow__background-pattern')) {
      surface = 'pattern';
      return;
    }

    let compoundStart = 0;
    selectorNode.nodes.forEach((node, index) => {
      if (node.type === 'combinator') compoundStart = index + 1;
    });
    const subjectClasses = positiveClasses.filter((classNode) => {
      let topLevel: any = classNode;
      while (topLevel.parent && topLevel.parent !== selectorNode) topLevel = topLevel.parent;
      return selectorNode.nodes.indexOf(topLevel) >= compoundStart;
    });
    if (subjectClasses.some(({ value }) => value === 'react-flow__background')) {
      surface = 'background';
      return;
    }
    if (!subjectClasses.some(({ value }) => value === 't8-canvas-shell')) return;

    const decorationPseudo = selectorNode.nodes.slice(compoundStart).some((node) =>
      node.type === 'pseudo'
      && (node.value.toLowerCase() === '::before' || node.value.toLowerCase() === '::after'));
    surface = decorationPseudo ? 'pseudo' : 'shell';
  }).processSync(selector);
  return surface;
}

interface NormalizedDeclaration {
  prop: string;
  value: string;
  node: Declaration;
  order: number;
  important: boolean;
}

function finalDeclarations(rule: Rule): Map<string, NormalizedDeclaration> {
  const declarations = new Map<string, NormalizedDeclaration>();
  let order = 0;
  for (const node of rule.nodes) {
    if (node.type !== 'decl') continue;
    const prop = node.prop.toLowerCase();
    const existing = declarations.get(prop);
    if (existing?.important && !node.important) {
      order++;
      continue;
    }
    declarations.set(prop, {
      prop,
      value: node.value.toLowerCase().replace(/\s*!important\s*$/, '').trim(),
      node,
      order: order++,
      important: node.important === true,
    });
  }
  return declarations;
}

export function finalDeclarationValues(rule: Rule): Map<string, string> {
  return new Map([...finalDeclarations(rule)].map(([prop, declaration]) => [prop, declaration.value]));
}

function isZero(value: string | undefined): boolean {
  return value !== undefined && /^0(?:\.0+)?$/.test(value);
}

function isNone(value: string | undefined): boolean {
  return value === undefined || value === 'none' || value === 'transparent';
}

function hasImageFunction(value: string): boolean {
  return /\b(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient)\s*\(/i.test(value);
}

function laterDeclaration(
  declarations: Map<string, NormalizedDeclaration>,
  properties: string[],
): NormalizedDeclaration | undefined {
  return properties.map((prop) => declarations.get(prop))
    .filter((declaration): declaration is NormalizedDeclaration => declaration !== undefined)
    .sort((left, right) => Number(right.important) - Number(left.important) || right.order - left.order)[0];
}

function backgroundImagePaint(declarations: Map<string, NormalizedDeclaration>): boolean {
  const image = laterDeclaration(declarations, ['background', 'background-image']);
  if (!image) return false;
  return image.prop === 'background-image' ? image.value !== 'none' : hasImageFunction(image.value);
}

function paintedMask(declarations: Map<string, NormalizedDeclaration>): boolean {
  return [
    ['mask', 'mask-image'],
    ['-webkit-mask', '-webkit-mask-image'],
  ].some((properties) => {
    const mask = laterDeclaration(declarations, properties);
    return mask !== undefined && mask.value !== 'none';
  });
}

function backgroundPaint(declarations: Map<string, NormalizedDeclaration>): boolean {
  const color = laterDeclaration(declarations, ['background', 'background-color']);
  return (color !== undefined && !isNone(color.value)) || backgroundImagePaint(declarations);
}

function imagePaintReason(declarations: Map<string, NormalizedDeclaration>): string | undefined {
  const backgroundImage = laterDeclaration(declarations, ['background', 'background-image']);
  if (backgroundImagePaint(declarations)) return `${backgroundImage?.prop ?? 'background-image'} image paint`;
  if (paintedMask(declarations)) return 'mask paint';
  return undefined;
}

function classifyRule(rule: Rule, surface: Surface, interactionOnly: boolean): string | undefined {
  const declarations = finalDeclarations(rule);
  const imageReason = imagePaintReason(declarations);
  const interactionSafelyHidden = declarations.get('display')?.value === 'none'
    || declarations.get('visibility')?.value === 'hidden'
    || isZero(declarations.get('opacity')?.value);
  if (interactionOnly && surface !== 'shell' && interactionSafelyHidden) return undefined;

  if (surface === 'shell' || surface === 'background') {
    if (imageReason) return imageReason;
    if (interactionOnly && surface === 'background') {
      const display = declarations.get('display')?.value;
      const visibility = declarations.get('visibility')?.value;
      const opacity = declarations.get('opacity')?.value;
      if (display !== undefined && display !== 'none') return 'interaction shows background layer';
      if (visibility !== undefined && visibility !== 'hidden') return 'interaction shows background layer';
      if (opacity !== undefined && !isZero(opacity)) return 'interaction shows background layer';
    }
    return undefined;
  }

  if (surface === 'pattern') {
    if (imageReason) return imageReason;
    for (const prop of ['fill', 'stroke']) {
      const value = declarations.get(prop)?.value;
      if (value !== undefined && !isNone(value)) return `${prop} paint`;
    }
    if (backgroundPaint(declarations)) return 'background paint';
    if (interactionOnly) {
      const display = declarations.get('display')?.value;
      const visibility = declarations.get('visibility')?.value;
      const opacity = declarations.get('opacity')?.value;
      if ((display !== undefined && display !== 'none')
          || (visibility !== undefined && visibility !== 'hidden')
          || (opacity !== undefined && !isZero(opacity))) return 'interaction shows pattern layer';
    }
    return undefined;
  }

  const display = declarations.get('display')?.value;
  const visibility = declarations.get('visibility')?.value;
  const opacity = declarations.get('opacity')?.value;
  const content = declarations.get('content')?.value;
  const safelyDisabled = display === 'none'
    || visibility === 'hidden'
    || isZero(opacity)
    || content === 'none'
    || content === 'normal';
  if (safelyDisabled) return undefined;

  const hasActiveContent = content !== undefined && content !== 'none' && content !== 'normal';
  if (!hasActiveContent) return undefined;
  if (imageReason) return `active pseudo ${imageReason}`;
  if (backgroundPaint(declarations)) return 'active pseudo background paint';
  return undefined;
}

export function auditCanvasCss(
  documents: CssDocument[],
  options: { interactionOnly?: boolean } = {},
): CssViolation[] {
  const violations: CssViolation[] = [];
  for (const document of documents) {
    document.root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (options.interactionOnly && !selectorHasInteractionState(selector)) continue;
        const surface = classifySelector(selector);
        if (!surface) continue;
        const reason = classifyRule(rule, surface, options.interactionOnly === true);
        if (!reason) continue;
        violations.push({
          file: document.file,
          line: rule.source?.start?.line,
          selector: selector.replace(/\s+/g, ' ').trim(),
          reason,
        });
      }
    });
  }
  return violations;
}

export function formatViolations(violations: CssViolation[]): string {
  return violations.map(({ file, line, selector, reason }) =>
    `${file}:${line ?? '?'} ${selector} (${reason})`).join('\n');
}
