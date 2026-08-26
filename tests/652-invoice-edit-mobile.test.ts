import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE_PATH = path.resolve(
	__dirname,
	'../src/routes/(app)/invoice/[id]/edit/+page.svelte'
);
const PAGE = readFileSync(PAGE_PATH, 'utf8');
const STYLE = PAGE.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? '';
const MEDIA_START = STYLE.indexOf('@media (max-width: 767px)');
const MEDIA = MEDIA_START === -1 ? '' : STYLE.slice(MEDIA_START);

describe('invoice edit line items go card-per-line below md (issue #652)', () => {
	it('does not hardcode the desktop column grid as an inline style', () => {
		expect(PAGE).not.toMatch(/style="[^"]*grid-template-columns/);
	});

	it('keeps the desktop column grid in a scoped class', () => {
		expect(STYLE).toMatch(/\.li-grid[^{]*\{[^}]*2fr 1fr 1fr 1fr 1fr auto/);
	});

	it('defines a below-md card layout with grid areas', () => {
		expect(MEDIA).not.toBe('');
		expect(MEDIA).toMatch(/grid-template-areas/);
		expect(MEDIA).toMatch(/\.li-row[^{]*\{/);
	});

	it('hides the shared header label row below md and labels each card field', () => {
		expect(MEDIA).toMatch(/\.li-head[^{]*\{[^}]*display:\s*none/);
		expect(PAGE.match(/li-flabel/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
	});

	it('lets inputs shrink inside the card grid instead of clipping', () => {
		expect(STYLE).toMatch(/\.li-row[^{]*\.input[^{]*\{[^}]*min-width:\s*0/);
	});

	it('sets no inline font-size on any input field', () => {
		expect(PAGE).not.toMatch(/<input[^>]*style="[^"]*font-size/);
	});
});
