import { describe, it, expect } from 'vitest';
import { fmt, truncate, fmtSize, str, fmtEur, fmtEurCompact, semColor } from '../src/lib/formatters';

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
  it('always shows 2 decimal places', () => {
    const result = fmtEur(10);
    expect(result).toMatch(/,00 €$/);
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
