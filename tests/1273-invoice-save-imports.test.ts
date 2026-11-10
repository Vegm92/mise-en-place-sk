import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('invoice-save.ts stays a thin validate → dedup → persist orchestrator (issue #1273)', () => {
	it('imports fewer than 15 distinct modules', () => {
		const source = readFileSync('src/lib/server/invoice-save.ts', 'utf8');
		const specifiers = new Set([...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]));
		expect(specifiers.size).toBeLessThan(15);
	});
});
