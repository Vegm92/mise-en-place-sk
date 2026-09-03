import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { nonReactiveTranslatorConsts, scanDirs } from '../scripts/check-reactive-i18n-const.mjs';

const ROOT = path.resolve(__dirname, '..');

// See the header comment in scripts/check-reactive-i18n-const.mjs for what
// this check does and does not cover — it is a pragmatic, AST-based scan for
// the exact shape from issue #534 (`const x = [...t(...)]`), not a full
// reactivity analysis.

describe('nonReactiveTranslatorConsts (issue #534 detector)', () => {
  it('flags a t(...) call captured in a plain top-level const', () => {
    const src = `
      const periods = [
        ['month', '30 d'],
        ['all', t('spend.period.allShort')],
      ];
    `;
    expect(nonReactiveTranslatorConsts(src).map((v) => v.name)).toEqual(['periods']);
  });

  it('flags a ti/tp/tiv/tcat call the same way', () => {
    for (const fn of ['ti', 'tp', 'tiv', 'tcat']) {
      const src = `const x = [${fn}('a.b', 1)];`;
      expect(nonReactiveTranslatorConsts(src).map((v) => v.name)).toEqual(['x']);
    }
  });

  it('does not flag a const wrapped in $derived(...)', () => {
    const src = `
      const periods = $derived([
        ['all', t('spend.period.allShort')],
      ]);
    `;
    expect(nonReactiveTranslatorConsts(src)).toEqual([]);
  });

  it('does not flag a const wrapped in a typed $derived<T>(...)', () => {
    const src = `
      const matrixCols = $derived<MatrixColumn[]>([
        { id: 'trial', name: t('billing.tier.trial.name') },
      ]);
    `;
    expect(nonReactiveTranslatorConsts(src)).toEqual([]);
  });

  it('does not flag a const wrapped in $derived.by(...)', () => {
    const src = `
      const upgradeMessage = $derived.by(() => {
        const text = t(key);
        return text;
      });
    `;
    expect(nonReactiveTranslatorConsts(src)).toEqual([]);
  });

  it('does not flag a t(...) call nested inside a function body', () => {
    const src = `
      async function sendMessage() {
        const text = cond ? t('a') : t('b');
        return text;
      }
    `;
    expect(nonReactiveTranslatorConsts(src)).toEqual([]);
  });

  it('does not flag a const with no translator call at all', () => {
    const src = `const periods = [['month', '30 d'], ['all', 'Todo']];`;
    expect(nonReactiveTranslatorConsts(src)).toEqual([]);
  });
});

describe('no non-reactive t(...) const in src/routes or src/lib/components (issue #534)', () => {
  it('has zero violations across the app routes and shared components', () => {
    const violations = scanDirs([
      path.join(ROOT, 'src/routes'),
      path.join(ROOT, 'src/lib/components')
    ]);
    const formatted = violations.map((v) => `${v.file}:${v.line} const ${v.name}`);
    expect(formatted).toEqual([]);
  });
});
