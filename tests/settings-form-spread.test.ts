import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('src/routes/(app)/settings/+page.svelte', 'utf8');

describe('settings page remote form instances', () => {
	it('never spreads a bare remote form object (one <form> per instance)', () => {
		expect(src).not.toMatch(/<form \{\.\.\.saveName\}/);
	});

	it('gives the desktop and mobile forms distinct saveName.for() keys', () => {
		const spreads = [...src.matchAll(/<form \{\.\.\.saveName\.for\("([^"]+)"\)\}/g)].map((m) => m[1]);
		expect(spreads.sort()).toEqual(['d', 'm']);
	});

	it('reads field issues and result from the same instance the section renders', () => {
		expect(src).not.toMatch(/saveName\.(fields|result)/);
		expect(src).toMatch(/saveName\.for\(idp\)\.fields\.name\.issues\(\)/);
	});
});
