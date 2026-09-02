import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
	fmt, truncate, fmtSize, str, fmtEur, fmtEurCompact, fmtEurSigned, formatYoyPct, semColor,
	fmtDate, fmtDateShort, fmtMonthShort, toIntlLocale,
} from '../src/lib/formatters';

describe('fmt', () => {
  it('formats a number to 2 decimal places', () => {
    expect(fmt(1.5)).toBe('1.50');
    expect(fmt(1234.567)).toBe('1234.57');
  });
  it('handles null and undefined', () => {
    expect(fmt(null)).toBe('0.00');
    expect(fmt(undefined)).toBe('0.00');
  });
  it('handles zero', () => {
    expect(fmt(0)).toBe('0.00');
  });
});

describe('truncate', () => {
  it('returns string unchanged when within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });
  it('truncates and appends ellipsis when over limit', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });
  it('handles exact-length strings', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('fmtSize', () => {
  it('formats bytes', () => {
    expect(fmtSize(512)).toBe('512 B');
  });
  it('formats kilobytes', () => {
    expect(fmtSize(2048)).toBe('2.0 KB');
  });
  it('formats megabytes', () => {
    expect(fmtSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
  it('boundary: exactly 1024 bytes is 1.0 KB', () => {
    expect(fmtSize(1024)).toBe('1.0 KB');
  });
});

describe('str', () => {
  it('converts number to string', () => {
    expect(str(42)).toBe('42');
  });
  it('returns empty string for null', () => {
    expect(str(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(str(undefined)).toBe('');
  });
  it('passes strings through', () => {
    expect(str('hello')).toBe('hello');
  });
  it('converts objects', () => {
    expect(str(true)).toBe('true');
  });
});

describe('fmtEur', () => {
  it('formats with 2 decimal places and EUR suffix', () => {
    const result = fmtEur(1234.56);
    expect(result).toContain('€');
    expect(result).toContain('1');
    expect(result).toContain('234');
  });
  it('handles zero', () => {
    expect(fmtEur(0)).toContain('€');
  });
  it('handles negative numbers', () => {
    expect(fmtEur(-50)).toContain('€');
  });
  it('always shows 2 decimal places (es-ES: comma decimal, nbsp before symbol)', () => {
    const result = fmtEur(10);
    expect(result).toMatch(/,00 €$/);
  });
  it('defaults to es locale when none is given', () => {
    expect(fmtEur(10)).toBe(fmtEur(10, 'es'));
  });
  it('switching to en changes separators and symbol placement', () => {
    const es = fmtEur(1234.56, 'es');
    const en = fmtEur(1234.56, 'en');
    expect(es).not.toBe(en);
    expect(es.includes(',56')).toBe(true);
    expect(en.includes('.56')).toBe(true);
    expect(en.startsWith('€')).toBe(true);
    expect(es.trim().endsWith('€')).toBe(true);
  });
  it('en locale puts the symbol before the amount, no space', () => {
    expect(fmtEur(10, 'en')).toBe('€10.00');
  });
  it('matches Intl.NumberFormat currency style directly', () => {
    expect(fmtEur(1234.56, 'es')).toBe(new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(1234.56));
    expect(fmtEur(1234.56, 'en')).toBe(new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(1234.56));
  });
});

describe('fmtEurCompact', () => {
  it('rounds up correctly', () => {
    const result = fmtEurCompact(1234.7);
    expect(result).toContain('1235');
    expect(result).toContain('€');
  });
  it('rounds down correctly', () => {
    const result = fmtEurCompact(1234.2);
    expect(result).toContain('1234');
    expect(result).toContain('€');
  });
  it('appends EUR suffix', () => {
    expect(fmtEurCompact(100)).toContain('€');
  });
  it('handles zero', () => {
    expect(fmtEurCompact(0)).toContain('€');
  });
  it('es locale: no decimals, nbsp before symbol', () => {
    const result = fmtEurCompact(1234.7, 'es');
    expect(result).toBe(new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(1235));
    expect(result).not.toContain(',');
    expect(result.trim().endsWith('€')).toBe(true);
  });
  it('en locale: no decimals, symbol before amount', () => {
    const result = fmtEurCompact(1234.7, 'en');
    expect(result).toBe(new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(1235));
    expect(result.startsWith('€')).toBe(true);
  });
});

describe('fmtEurSigned', () => {
  it('prefixes a plus sign for positive amounts', () => {
    expect(fmtEurSigned(120)).toMatch(/^\+/);
  });
  it('prefixes a minus sign for negative amounts', () => {
    expect(fmtEurSigned(-120)).toMatch(/^−/);
  });
  it('shows no sign for zero', () => {
    const result = fmtEurSigned(0);
    expect(result.startsWith('+')).toBe(false);
    expect(result.startsWith('−')).toBe(false);
  });
  it('follows the locale for the underlying amount too', () => {
    const es = fmtEurSigned(1234, 'es');
    const en = fmtEurSigned(1234, 'en');
    expect(es).toBe('+' + fmtEurCompact(1234, 'es'));
    expect(en).toBe('+' + fmtEurCompact(1234, 'en'));
    expect(es).not.toBe(en);
  });
});

describe('formatYoyPct', () => {
  it('formats a positive change with a leading plus, Spanish decimal comma by default', () => {
    expect(formatYoyPct(12.5)).toBe('+12,5 %');
  });

  it('follows the locale for the decimal separator', () => {
    expect(formatYoyPct(12.5, 'es')).toBe('+12,5 %');
    expect(formatYoyPct(12.5, 'en')).toBe('+12.5 %');
  });

  it('prefixes a negative change with a sign', () => {
    expect(formatYoyPct(-20, 'es')).toMatch(/^-20/);
  });

  it('shows no sign for zero (signDisplay: exceptZero)', () => {
    expect(formatYoyPct(0, 'es')).toBe('0 %');
  });

  it('formats null as an em dash', () => {
    expect(formatYoyPct(null)).toBe('—');
  });

  it('formats a non-finite value as an em dash', () => {
    expect(formatYoyPct(Infinity)).toBe('—');
    expect(formatYoyPct(NaN)).toBe('—');
  });
});

describe('toIntlLocale', () => {
  it('maps es to es-ES', () => {
    expect(toIntlLocale('es')).toBe('es-ES');
  });
  it('maps en to en-GB', () => {
    expect(toIntlLocale('en')).toBe('en-GB');
  });
});

describe('fmtDate / fmtDateShort / fmtMonthShort', () => {
  it('fmtDate returns an em dash for null', () => {
    expect(fmtDate(null)).toBe('—');
  });
  it('fmtDate differs between es and en', () => {
    const es = fmtDate('2026-03-15', 'es');
    const en = fmtDate('2026-03-15', 'en');
    expect(es).not.toBe(en);
  });
  it('fmtDate defaults to es', () => {
    expect(fmtDate('2026-03-15')).toBe(fmtDate('2026-03-15', 'es'));
  });
  it('fmtDateShort returns an em dash for null', () => {
    expect(fmtDateShort(null)).toBe('—');
  });
  it('fmtDateShort differs between es and en', () => {
    const es = fmtDateShort('2026-03-15', 'es');
    const en = fmtDateShort('2026-03-15', 'en');
    expect(es).not.toBe(en);
  });
  it('fmtMonthShort formats a year-month key and follows locale', () => {
    const es = fmtMonthShort('2026-03', 'es');
    const en = fmtMonthShort('2026-03', 'en');
    expect(es.toLowerCase()).toContain('mar');
    expect(en.toLowerCase()).toContain('mar');
  });
});

describe('semColor', () => {
  it('returns pos color below 80', () => {
    expect(semColor(0)).toBe('var(--mep-pos)');
    expect(semColor(79)).toBe('var(--mep-pos)');
  });
  it('returns warn color at 80', () => {
    expect(semColor(80)).toBe('var(--mep-warn)');
    expect(semColor(100)).toBe('var(--mep-warn)');
  });
  it('returns neg color above 100', () => {
    expect(semColor(101)).toBe('var(--mep-neg)');
    expect(semColor(200)).toBe('var(--mep-neg)');
  });
  it('boundary: exactly 80 is warn', () => {
    expect(semColor(80)).toBe('var(--mep-warn)');
  });
  it('boundary: exactly 100 is warn', () => {
    expect(semColor(100)).toBe('var(--mep-warn)');
  });
});

describe('no hardcoded es-ES locale outside formatters.ts', () => {
  const SRC_ROOT = join(__dirname, '..', 'src');
  const ALLOWED_FILE = join(SRC_ROOT, 'lib', 'formatters.ts');

  function walk(dir: string): string[] {
    const entries = readdirSync(dir);
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        files.push(...walk(full));
      } else if (/\.(ts|svelte)$/.test(entry)) {
        files.push(full);
      }
    }
    return files;
  }

  it('formatters.ts is the only place that names es-ES', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (file === ALLOWED_FILE) continue;
      const content = readFileSync(file, 'utf-8');
      if (content.includes('es-ES')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('formatters.ts itself still derives the es-ES locale, so the app keeps working', () => {
    const content = readFileSync(ALLOWED_FILE, 'utf-8');
    expect(content).toContain('es-ES');
  });
});
