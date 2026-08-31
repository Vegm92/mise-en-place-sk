import { describe, it, expect } from 'vitest';
import { resolveTracesSampleRate } from '../src/lib/sentry-sample-rate';

describe('resolveTracesSampleRate', () => {
	it('always traces at 1.0 outside production, ignoring the env value', () => {
		expect(resolveTracesSampleRate(undefined, false)).toBe(1.0);
		expect(resolveTracesSampleRate('0.5', false)).toBe(1.0);
		expect(resolveTracesSampleRate('not-a-number', false)).toBe(1.0);
	});

	it('defaults to 0.1 in production when unset', () => {
		expect(resolveTracesSampleRate(undefined, true)).toBe(0.1);
		expect(resolveTracesSampleRate('', true)).toBe(0.1);
	});

	it('defaults to 0.1 in production for a whitespace-only value', () => {
		expect(resolveTracesSampleRate(' ', true)).toBe(0.1);
		expect(resolveTracesSampleRate('\t\n', true)).toBe(0.1);
	});

	it('uses the configured rate in production when it is a valid fraction', () => {
		expect(resolveTracesSampleRate('0.05', true)).toBe(0.05);
		expect(resolveTracesSampleRate('1', true)).toBe(1);
		expect(resolveTracesSampleRate('0', true)).toBe(0);
		expect(resolveTracesSampleRate(' 0.2 ', true)).toBe(0.2);
	});

	it('falls back to 0.1 in production for malformed or out-of-range values', () => {
		expect(resolveTracesSampleRate('not-a-number', true)).toBe(0.1);
		expect(resolveTracesSampleRate('-0.5', true)).toBe(0.1);
		expect(resolveTracesSampleRate('1.5', true)).toBe(0.1);
	});
});
