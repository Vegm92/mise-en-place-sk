/**
 * safeRedirect — open-redirect guard used by the login/signup flows.
 *
 * The invariant: only same-origin, relative paths survive; anything that could
 * navigate the browser to another origin (absolute URLs, protocol-relative //,
 * backslash tricks) is rejected and replaced with the fallback. A regression
 * here is a phishing vector, so these are pure, fast, run-on-every-change checks.
 */
import { describe, it, expect } from 'vitest';
import { safeRedirect } from '../src/lib/server/safe-redirect';

describe('safeRedirect — allowed targets', () => {
	it('keeps a simple relative path', () => {
		expect(safeRedirect('/dashboard')).toBe('/dashboard');
	});

	it('keeps a path with query string and fragment', () => {
		expect(safeRedirect('/invoices?status=pending#top')).toBe('/invoices?status=pending#top');
	});

	it('keeps a deep nested path', () => {
		expect(safeRedirect('/batch/abc-123')).toBe('/batch/abc-123');
	});
});

describe('safeRedirect — rejected targets fall back', () => {
	it('rejects an absolute http URL', () => {
		expect(safeRedirect('http://evil.com')).toBe('/');
	});

	it('rejects an absolute https URL', () => {
		expect(safeRedirect('https://evil.com/path')).toBe('/');
	});

	it('rejects protocol-relative // URLs', () => {
		expect(safeRedirect('//evil.com')).toBe('/');
	});

	it('rejects backslash-escaped /\\ tricks', () => {
		expect(safeRedirect('/\\evil.com')).toBe('/');
	});

	it('rejects a path that does not start with /', () => {
		expect(safeRedirect('dashboard')).toBe('/');
	});

	it('rejects a javascript: scheme', () => {
		expect(safeRedirect('javascript:alert(1)')).toBe('/');
	});
});

describe('safeRedirect — empty / nullish input', () => {
	it('falls back on null', () => {
		expect(safeRedirect(null)).toBe('/');
	});

	it('falls back on undefined', () => {
		expect(safeRedirect(undefined)).toBe('/');
	});

	it('falls back on empty string', () => {
		expect(safeRedirect('')).toBe('/');
	});
});

describe('safeRedirect — custom fallback', () => {
	it('uses the provided fallback when the target is rejected', () => {
		expect(safeRedirect('https://evil.com', '/login')).toBe('/login');
	});

	it('ignores the fallback when the target is valid', () => {
		expect(safeRedirect('/settings', '/login')).toBe('/settings');
	});
});
