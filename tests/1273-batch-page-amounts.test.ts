import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseAmount } from '../src/lib/money';

const page = readFileSync('src/routes/(app)/batch/[id]/+page.svelte', 'utf8');

describe('batch review page amounts (issue #1273)', () => {
	it('parses Spanish amounts through the shared parser, never parseFloat', () => {
		expect(page).not.toMatch(/parseFloat\(/);
		expect(page).toMatch(/parseAmount\(/);
	});

	it('the shared parser reads Spanish decimals and thousands', () => {
		expect(parseAmount('1,50')).toBe(1.5);
		expect(parseAmount('1.234')).toBe(1234);
		expect(parseAmount('1.234,56')).toBe(1234.56);
	});
});
