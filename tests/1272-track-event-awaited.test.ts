/**
 * SEC-011 (issue #1272): a floating trackEvent() keeps the request's
 * AsyncLocalStorage store after its scope releases the connection. Every call
 * must be awaited (events.ts owns the connection choice).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return sources(p);
		return /\.(ts|svelte)$/.test(name) ? [p] : [];
	});
}

describe('trackEvent call sites', () => {
	it('never leave the promise floating', () => {
		const floating = sources('src').flatMap((file) =>
			readFileSync(file, 'utf8').split('\n')
				.map((line, i) => ({ file, line: i + 1, text: line }))
				.filter(({ text }) => /\btrackEvent\(/.test(text) && !/await\s+trackEvent\(|function\s+trackEvent|import /.test(text))
				.map(({ file, line }) => `${file}:${line}`),
		);
		expect(floating).toEqual([]);
	});
});
