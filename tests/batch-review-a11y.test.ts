import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';

/**
 * Regression test for issue #537: 33 of 36 visible fields on /batch/[id]
 * (the batch review screen) had no accessible name — labels were rendered as
 * plain sibling text, never tied via <label for>/aria-label, so a screen
 * reader announced a wall of unlabelled "edit text" fields. This statically
 * scans the compiled Svelte AST (no component-render infra available in this
 * suite) and asserts every visible input/select/textarea resolves an
 * accessible name, every visible button does too, the line-item tables carry
 * th[scope], and the document-preview / extracted-data regions have an h2.
 */
const SOURCE_PATH = 'src/routes/(app)/batch/[id]/+page.svelte';
const source = readFileSync(SOURCE_PATH, 'utf8');
const ast = parse(source, { modern: true, filename: SOURCE_PATH });

type AstNode = Record<string, unknown> & { type?: string };

function walk(node: unknown, visit: (n: AstNode) => void): void {
  if (!node || typeof node !== 'object') return;
  const n = node as AstNode;
  if (typeof n.type === 'string') visit(n);
  for (const key of Object.keys(n)) {
    if (key === 'parent') continue;
    const value = n[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

function collectElements(name: string): AstNode[] {
  const out: AstNode[] = [];
  walk(ast.fragment, (n) => {
    if (n.type === 'RegularElement' && n.name === name) out.push(n);
  });
  return out;
}

function findAttr(el: AstNode, attrName: string): AstNode | undefined {
  const attrs = (el.attributes as AstNode[] | undefined) ?? [];
  return attrs.find((a) => a.type === 'Attribute' && a.name === attrName);
}

function rawAttrValue(a: AstNode | undefined): string | null {
  if (!a) return null;
  const value = a.value as unknown;
  if (value === true) return '';
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    const first = value[0] as AstNode;
    const last = value[value.length - 1] as AstNode;
    return source.slice(first.start as number, last.end as number);
  }
  if (value && typeof value === 'object') {
    const v = value as AstNode;
    return source.slice(v.start as number, v.end as number);
  }
  return null;
}

function lineOf(pos: number): number {
  return source.slice(0, pos).split('\n').length;
}

function hasNonEmptyAttr(el: AstNode, attrName: string): boolean {
  const a = findAttr(el, attrName);
  if (!a) return false;
  const raw = rawAttrValue(a);
  return raw !== null && raw.trim().length > 0;
}

function hasVisibleTextDescendant(el: AstNode): boolean {
  let found = false;
  walk(el, (n) => {
    if (found || n === el) return;
    if (n.type === 'Text' && typeof n.data === 'string' && n.data.trim().length > 0) found = true;
    if (n.type === 'ExpressionTag') found = true;
  });
  return found;
}

const labelForTargets = new Set<string>();
for (const label of collectElements('label')) {
  const raw = rawAttrValue(findAttr(label, 'for'));
  if (raw !== null) labelForTargets.add(raw);
}

describe('batch review screen accessible names (issue #537)', () => {
  it('gives every visible input/select/textarea an accessible name', () => {
    const failures: string[] = [];
    for (const name of ['input', 'select', 'textarea']) {
      for (const el of collectElements(name)) {
        const typeAttr = rawAttrValue(findAttr(el, 'type'));
        if (typeAttr === 'hidden') continue;
        const classAttr = rawAttrValue(findAttr(el, 'class')) ?? '';
        if (/(^|\s)hidden(\s|$)/.test(classAttr)) continue;

        const hasAriaLabel = hasNonEmptyAttr(el, 'aria-label');
        const hasAriaLabelledby = hasNonEmptyAttr(el, 'aria-labelledby');
        const idRaw = rawAttrValue(findAttr(el, 'id'));
        const hasMatchingLabel = idRaw !== null && labelForTargets.has(idRaw);

        if (!hasAriaLabel && !hasAriaLabelledby && !hasMatchingLabel) {
          const nameAttr = rawAttrValue(findAttr(el, 'name'));
          failures.push(`<${name}${nameAttr ? ` name="${nameAttr}"` : ''}> at line ${lineOf(el.start as number)}`);
        }
      }
    }
    expect(failures, `unlabelled fields:\n${failures.join('\n')}`).toEqual([]);
  });

  it('gives every visible button an accessible name', () => {
    const failures: string[] = [];
    for (const el of collectElements('button')) {
      const hasAriaLabel = hasNonEmptyAttr(el, 'aria-label');
      const hasTitle = hasNonEmptyAttr(el, 'title');
      const hasText = hasVisibleTextDescendant(el);
      if (!hasAriaLabel && !hasTitle && !hasText) {
        failures.push(`<button> at line ${lineOf(el.start as number)}`);
      }
    }
    expect(failures, `unnamed buttons:\n${failures.join('\n')}`).toEqual([]);
  });

  it('gives the line-item table headers scope', () => {
    const linesTableStart = source.indexOf('class="tbl rev-lines"');
    expect(linesTableStart, 'expected the rev-lines line-item table').toBeGreaterThan(-1);
    const theadEnd = source.indexOf('</thead>', linesTableStart);
    const thead = source.slice(linesTableStart, theadEnd);
    const thCount = (thead.match(/<th\b/g) ?? []).length;
    const scopedCount = (thead.match(/<th\b[^>]*\bscope=/g) ?? []).length;
    expect(scopedCount).toBe(thCount);
    expect(thCount).toBeGreaterThan(0);
  });

  it('row-indexes the aria-labels on the desktop line-item cells', () => {
    expect(source).toMatch(/aria-label=\{ti\('batch\.aria\.lineDesc',\s*\{\s*row:\s*i\s*\+\s*1\s*\}\)\}/);
    expect(source).toMatch(/aria-label=\{ti\('batch\.aria\.lineQty',\s*\{\s*row:\s*i\s*\+\s*1\s*\}\)\}/);
    expect(source).toMatch(/aria-label=\{ti\('batch\.aria\.lineUnit',\s*\{\s*row:\s*i\s*\+\s*1\s*\}\)\}/);
    expect(source).toMatch(/aria-label=\{ti\('batch\.aria\.lineUnitPrice',\s*\{\s*row:\s*i\s*\+\s*1\s*\}\)\}/);
    expect(source).toMatch(/aria-label=\{ti\('batch\.aria\.lineTotal',\s*\{\s*row:\s*i\s*\+\s*1\s*\}\)\}/);
  });

  it('adds an h2 for the document-preview region', () => {
    expect(source).toMatch(/<h2 class="sr-only">\{t\('a11y\.documentPreview'\)\}<\/h2>/);
  });

  it('adds an h2 for the extracted-data region', () => {
    expect(source).toMatch(/<h2 class="sr-only">\{t\('a11y\.extractedData'\)\}<\/h2>/);
  });

  it('ties the header fields to their visible labels via <label for>', () => {
    for (const [fieldId, labelKey] of [
      ['field-supplier-name', "t('field.supplier')"],
      ['field-invoice-number', "t('field.invoiceNum')"],
      ['field-invoice-date', "t('field.invoiceDate')"],
      ['field-due-date', "t('extract.due')"],
      ['field-total-amount', "t('tbl.total')"],
      ['field-notes', "t('extract.notesInternal')"],
    ]) {
      expect(source).toContain(`for="${fieldId}"`);
      expect(source).toContain(`id="${fieldId}"`);
      const labelIndex = source.indexOf(`for="${fieldId}"`);
      const labelBlockEnd = source.indexOf('</label>', labelIndex);
      expect(source.slice(labelIndex, labelBlockEnd)).toContain(labelKey);
    }
  });
});
