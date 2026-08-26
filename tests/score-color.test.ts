import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getScoreColor } from '../src/lib/status';

describe('getScoreColor', () => {
	it('returns pos color for high scores (>= 70)', () => {
		expect(getScoreColor(70)).toBe('var(--mep-pos)');
		expect(getScoreColor(100)).toBe('var(--mep-pos)');
	});
	it('returns warn color for medium scores (40-69)', () => {
		expect(getScoreColor(40)).toBe('var(--mep-warn)');
		expect(getScoreColor(69)).toBe('var(--mep-warn)');
	});
	it('returns neg color for low scores (< 40)', () => {
		expect(getScoreColor(0)).toBe('var(--mep-neg)');
		expect(getScoreColor(39)).toBe('var(--mep-neg)');
	});
	it('boundary: 39 is neg, 40 is warn', () => {
		expect(getScoreColor(39)).toBe('var(--mep-neg)');
		expect(getScoreColor(40)).toBe('var(--mep-warn)');
	});
	it('boundary: 69 is warn, 70 is pos', () => {
		expect(getScoreColor(69)).toBe('var(--mep-warn)');
		expect(getScoreColor(70)).toBe('var(--mep-pos)');
	});
});

describe('reliability score color duplication (issue #605)', () => {
	const pageSource = readFileSync(
		'src/routes/(app)/suppliers/[id]/+page.svelte',
		'utf8',
	);
	const desktopSource = readFileSync(
		'src/lib/components/desktop/DesktopSupplierDetail.svelte',
		'utf8',
	);

	it('does not hardcode the drifted score hex values in +page.svelte', () => {
		expect(pageSource).not.toContain('3A8C5C');
		expect(pageSource).not.toContain('C8843A');
	});
	it('does not hardcode the drifted score hex values in DesktopSupplierDetail.svelte', () => {
		expect(desktopSource).not.toContain('3A8C5C');
		expect(desktopSource).not.toContain('C8843A');
	});
});
