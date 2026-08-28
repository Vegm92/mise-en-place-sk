import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { localeKeyTables, keyReferences, lookupKeys, missingKeyRefs } from '../scripts/i18n-keys.mjs';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const tables = localeKeyTables(readFileSync(path.join(SRC, 'lib/i18n-messages.ts'), 'utf8'));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.svelte')) out.push(full);
  }
  return out;
}

describe('localeKeyTables (keys read back off the real locale tables)', () => {
  it('reads one table per locale straight from src/lib/i18n-messages.ts', () => {
    expect([...tables.keys()].sort()).toEqual(['en', 'es']);
    expect(tables.get('es')!.size).toBeGreaterThan(1000);
    expect(tables.get('es')!.has('export.title')).toBe(true);
    expect(tables.get('en')!.has('export.title')).toBe(true);
  });

  it('ignores everything that is not a locale table', () => {
    const tiny = localeKeyTables(
      `export const other = { es: { 'nope.key': 'x' } };\n` +
        `export const translations = { es: { 'a.b': 'A' }, en: { 'a.b': 'A' } } satisfies X;`,
    );
    expect([...tables.keys()].sort()).toEqual(['en', 'es']);
    expect(tiny.get('es')!.has('nope.key')).toBe(false);
    expect(tiny.get('es')!.has('a.b')).toBe(true);
  });
});

describe('keyReferences (literal $t keys only)', () => {
  it('collects the key from every literal translator call', () => {
    const src = [
      `{$t('a.one')}`,
      `{$ti('b.two', { n: 1 })}`,
      `{$tp('c.three', 2)}`,
      `{$tiv('d.four', {})}`,
      `<span title={$t("e.five")}></span>`,
    ].join('\n');
    expect(keyReferences(src).map((r) => `${r.fn}:${r.key}`)).toEqual([
      't:a.one',
      'ti:b.two',
      'tp:c.three',
      'tiv:d.four',
      't:e.five',
    ]);
  });

  it('skips dynamic keys instead of reporting them', () => {
    const src = [
      `{$t(someVar)}`,
      '{$t(`chart.range.${r}`)}',
      `{$t('admin.rev.leak.' + leak.key)}`,
      `{$ti(switchable ? 'billing.switchTo' : 'billing.choose', { name })}`,
      `{$t(form.errorKey)}`,
      `{$tcat('Bebidas')}`,
    ].join('\n');
    expect(keyReferences(src)).toEqual([]);
  });

  it('reports the source offset so a violation can be given a line', () => {
    const src = `line one\n{$t('a.b')}`;
    expect(keyReferences(src)[0]!.index).toBeGreaterThan(8);
  });
});

describe('lookupKeys (what a call actually looks up)', () => {
  it('looks up the key itself for t / ti / tiv', () => {
    for (const fn of ['t', 'ti', 'tiv']) {
      expect(lookupKeys({ fn, key: 'a.b', index: 0 })).toEqual(['a.b']);
    }
  });

  it('looks up the plural forms for tp', () => {
    expect(lookupKeys({ fn: 'tp', key: 'misc.invoice', index: 0 })).toEqual([
      'misc.invoice.one',
      'misc.invoice.other',
    ]);
  });
});

describe('missingKeyRefs (the check that would have caught issue #661)', () => {
  const fixture = new Map([
    ['es', new Set(['a.b', 'p.one', 'p.other'])],
    ['en', new Set(['a.b', 'p.one', 'p.other'])],
  ]);

  it('flags a $t key that no locale table carries', () => {
    const found = missingKeyRefs(keyReferences(`{$t('export.status')}`), fixture);
    expect(found.map((m) => `${m.locale}:${m.key}`)).toEqual(['es:export.status', 'en:export.status']);
  });

  it('flags a key that only one locale carries', () => {
    const lopsided = new Map([['es', new Set(['x.y'])], ['en', new Set<string>()]]);
    const found = missingKeyRefs(keyReferences(`{$t('x.y')}`), lopsided);
    expect(found.map((m) => `${m.locale}:${m.key}`)).toEqual(['en:x.y']);
  });

  it('passes a key both locales carry', () => {
    expect(missingKeyRefs(keyReferences(`{$t('a.b')}`), fixture)).toEqual([]);
  });

  it('passes a plural family with both forms and flags one without', () => {
    expect(missingKeyRefs(keyReferences(`{$tp('p', 2)}`), fixture)).toEqual([]);
    const found = missingKeyRefs(keyReferences(`{$tp('q', 2)}`), fixture);
    expect([...new Set(found.map((m) => m.key))].sort()).toEqual(['q.one', 'q.other']);
    expect([...new Set(found.map((m) => m.locale))].sort()).toEqual(['en', 'es']);
  });

  it('never flags a dynamic key', () => {
    const src = '{$t(someVar)}\n{$t(`a.${b}`)}\n{$t(\'z.\' + w)}';
    expect(missingKeyRefs(keyReferences(src), fixture)).toEqual([]);
  });
});

describe('every literal $t key in src resolves in both locales', () => {
  it('has no unresolvable translation key anywhere under src/', () => {
    const unresolved: string[] = [];
    for (const file of walk(SRC).sort()) {
      const src = readFileSync(file, 'utf8');
      for (const miss of missingKeyRefs(keyReferences(src), tables)) {
        const line = src.slice(0, miss.ref.index).split('\n').length;
        unresolved.push(`${path.relative(ROOT, file)}:${line} [${miss.locale}] ${miss.key}`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});
