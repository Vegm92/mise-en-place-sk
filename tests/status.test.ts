import { describe, it, expect } from 'vitest';
import { badgeClass, statusKey, confColor } from '../src/lib/status';

describe('badgeClass', () => {
  it('returns overdue class', () => {
    expect(badgeClass('overdue')).toBe('badge badge-overdue');
  });
  it('returns pending class', () => {
    expect(badgeClass('pending')).toBe('badge badge-pending');
  });
  it('returns confirmed class for paid', () => {
    expect(badgeClass('paid')).toBe('badge badge-confirmed');
  });
  it('returns confirmed class for accepted', () => {
    expect(badgeClass('accepted')).toBe('badge badge-confirmed');
  });
  it('returns rejected class for rejected', () => {
    expect(badgeClass('rejected')).toBe('badge badge-rejected');
  });
  it('falls back to a neutral class for unknown status', () => {
    expect(badgeClass('unknown')).toBe('badge badge-neutral');
  });
});

describe('statusKey', () => {
  it('maps pending', () => {
    expect(statusKey('pending')).toBe('status.pending');
  });
  it('maps accepted', () => {
    expect(statusKey('accepted')).toBe('status.accepted');
  });
  it('maps rejected', () => {
    expect(statusKey('rejected')).toBe('status.rejected');
  });
  it('maps overdue', () => {
    expect(statusKey('overdue')).toBe('status.overdue');
  });
  it('maps paid', () => {
    expect(statusKey('paid')).toBe('status.paid');
  });
  it('returns raw value for unknown status', () => {
    expect(statusKey('mystery')).toBe('mystery');
  });
});

describe('confColor', () => {
  it('returns transparent for null', () => {
    expect(confColor(null)).toBe('transparent');
  });
  it('returns transparent for undefined', () => {
    expect(confColor(undefined)).toBe('transparent');
  });
  it('returns pos color for high confidence (>= 0.85)', () => {
    expect(confColor(0.85)).toBe('var(--mep-pos)');
    expect(confColor(1.0)).toBe('var(--mep-pos)');
  });
  it('returns warn color for medium confidence (0.60 - 0.84)', () => {
    expect(confColor(0.6)).toBe('var(--mep-warn)');
    expect(confColor(0.84)).toBe('var(--mep-warn)');
  });
  it('returns neg color for low confidence (< 0.60)', () => {
    expect(confColor(0.0)).toBe('var(--mep-neg)');
    expect(confColor(0.59)).toBe('var(--mep-neg)');
  });
  it('boundary: exactly 0.85 is pos', () => {
    expect(confColor(0.85)).toBe('var(--mep-pos)');
  });
  it('boundary: exactly 0.60 is warn', () => {
    expect(confColor(0.6)).toBe('var(--mep-warn)');
  });
});
