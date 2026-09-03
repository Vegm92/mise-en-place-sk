/**
 * IVA/REC badges on the review footer (PR #700, reworked onto `taxBands`).
 *
 * The batch review footer summarised the breakdown as one "IVA <total>" figure
 * plus a band count, so an invoice carrying recargo de equivalencia read exactly
 * like a plain multi-rate one — the reviewer had to open the tax panel to find
 * out. The footer now renders a badge per kind present. It stays quiet on a
 * pure-IVA invoice, where the footer's own "IVA" label already says it, and
 * only speaks up once REC is in play; then both badges render so the split is
 * legible at a glance.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE = read('src/routes/(app)/batch/[id]/+page.svelte');
const ES_MESSAGES = read('src/lib/messages/es.ts');
const EN_MESSAGES = read('src/lib/messages/en.ts');

const footer = () => {
	const at = PAGE.indexOf('rev-foot-totals');
	expect(at, 'expected the review footer totals block').toBeGreaterThan(-1);
	return PAGE.slice(at);
};

describe('review footer tax-kind badges (PR #700)', () => {
	it('derives the kinds present from the editable taxBands rows', () => {
		expect(PAGE).toMatch(
			/const bandKinds = \$derived\(\['iva', 'rec'\]\.filter\(k => taxBands\.some\(b => b\.type === k\)\)\)/
		);
	});

	it('stays quiet on a pure-IVA invoice and speaks up once REC is present', () => {
		expect(PAGE).toMatch(/const showBandKinds = \$derived\(bandKinds\.includes\('rec'\)\)/);
		expect(footer()).toMatch(/\{#if showBandKinds\}/);
	});

	it('renders one badge per kind, REC set apart from IVA', () => {
		const foot = footer();
		expect(foot).toMatch(/\{#each bandKinds as kind\}/);
		expect(foot).toMatch(/kind === 'rec' \? 'badge-pending' : 'badge-exported'/);
		expect(foot).toMatch(/kind === 'rec' \? t\('review\.taxRec'\) : t\('review\.taxIva'\)/);
	});

	it('spells out the surcharge on hover rather than leaving REC unexplained', () => {
		expect(footer()).toMatch(
			/title=\{kind === 'rec' \? t\('review\.taxRecFull'\) : t\('review\.taxIva'\)\}/
		);
	});

	it('keeps the band count badge, which counts rates rather than kinds', () => {
		expect(footer()).toMatch(/\{#if taxBands\.length > 1\}<span class="badge badge-neutral">/);
	});

	it('uses labels defined in both locales', () => {
		for (const block of [ES_MESSAGES, EN_MESSAGES]) {
			expect(block).toMatch(/'review\.taxIva':\s*'[^']+'/);
			expect(block).toMatch(/'review\.taxRec':\s*'[^']+'/);
			expect(block).toMatch(/'review\.taxRecFull':\s*'[^']+'/);
		}
	});
});
