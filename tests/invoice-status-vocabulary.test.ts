/**
 * The invoice review vocabulary is one closed set (issues #520, #746).
 *
 * Issue #746 replaced the payment lifecycle in the UI with review states:
 * `invoices.review_state` holds 'por_revisar' | 'revisado' | 'incidencia',
 * written by the canonical save path (invoice-save.ts) and by the
 * mark-reviewed transitions (invoice-status.ts). The legacy `invoices.status`
 * column ('pending' | 'accepted' | 'rejected' | 'paid') remains as data but
 * no longer drives the UI.
 *
 * These assert over the vocabulary itself rather than over a hand-written
 * list: every review state the database can hold has a badge and a key in
 * both locales, every state the UI offers is one the query layer can answer,
 * and no source file compares `invoices.reviewState` (or the legacy
 * `invoices.status`) against a word outside its set.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../src/lib/server/db', () => ({
	db: {},
	forTenant: () => ({ scope: () => ({}) }),
}));

import {
	REVIEW_STATES,
	STORED_INVOICE_STATUSES,
	INCIDENCE_KINDS,
	badgeClass,
	statusKey,
	isReviewState,
	isStoredInvoiceStatus,
	isIncidenceKind,
	incidenceKindBadgeClass,
	incidenceKindKey,
	incidenceKindHintKey,
} from '../src/lib/status';
import { invoiceReviewFilter } from '../src/lib/server/invoice-status';
import { translations } from '../src/lib/i18n-messages';

const ROOT = process.cwd();
const es = translations.es as Record<string, string>;
const en = translations.en as Record<string, string>;

const dialect = new PgDialect();
const sqlText = (q: unknown) => dialect.sqlToQuery(q as never).sql;

function read(rel: string): string {
	return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (/\.(ts|svelte)$/.test(entry.name)) out.push(full);
	}
	return out;
}

const SOURCE_FILES = [...walk(path.join(ROOT, 'src', 'lib')), ...walk(path.join(ROOT, 'src', 'routes'))];

const LITERAL = /'([a-z_]+)'/g;

/**
 * Every word a source file compares against, or writes into, the given
 * invoices column. Matching is deliberately narrow — a wide window picks up
 * column aliases in the same statement and turns the test into noise.
 */
function columnLiteralsIn(src: string, tsName: string, sqlName: string): Set<string> {
	const found = new Set<string>();
	const add = (s: string | undefined) => { if (s) found.add(s); };

	for (const m of src.matchAll(new RegExp(`\\b(?:eq|ne)\\(invoices\\.${tsName},\\s*'([a-z_]+)'`, 'g'))) add(m[1]);
	for (const m of src.matchAll(new RegExp(`inArray\\(invoices\\.${tsName},\\s*\\[([^\\]]*)\\]`, 'g'))) {
		for (const lit of m[1].matchAll(LITERAL)) add(lit[1]);
	}
	for (const m of src.matchAll(new RegExp(`invoices\\.${tsName}\\}\\s*(?:=|<>|!=)\\s*'([a-z_]+)'`, 'g'))) add(m[1]);
	for (const m of src.matchAll(new RegExp(`update\\(invoices\\)[\\s\\S]{0,300}?\\.set\\(\\{[\\s\\S]{0,250}?${tsName}:\\s*'([a-z_]+)'`, 'g'))) add(m[1]);
	for (const m of src.matchAll(new RegExp(`insert\\(invoices\\)[\\s\\S]{0,700}?${tsName}:\\s*'([a-z_]+)'`, 'g'))) add(m[1]);

	for (const m of src.matchAll(/`([^`]*\bfrom\s+invoices\b[^`]*)`/gi)) {
		for (const lit of m[1].matchAll(new RegExp(`\\b${sqlName}\\s*(?:=|<>|!=)\\s*'([a-z_]+)'`, 'g'))) add(lit[1]);
		for (const inClause of m[1].matchAll(new RegExp(`\\b${sqlName}\\s+in\\s*\\(([^)]*)\\)`, 'gi'))) {
			for (const lit of inClause[1].matchAll(LITERAL)) add(lit[1]);
		}
	}

	return found;
}

describe('the review vocabulary is what the transition module writes', () => {
	const src = read('src/lib/server/invoice-status.ts');

	it('declares no union of its own', () => {
		expect(src, 'invoice-status.ts must reuse ReviewState from $lib/status, not redeclare it')
			.not.toMatch(/export type ReviewState\s*=\s*'/);
	});

	it.each([...src.matchAll(/reviewState:\s*'([a-z_]+)'/g)].map((m) => m[1]))(
		"writes review state '%s', which is in the vocabulary",
		(state) => {
			expect(isReviewState(state)).toBe(true);
		}
	);

	it('the canonical save path writes only vocabulary states', () => {
		const save = read('src/lib/server/invoice-save.ts');
		for (const m of save.matchAll(/(?:reviewState:|return flagged \?)\s*'([a-z_]+)'\s*(?::\s*'([a-z_]+)')?/g)) {
			expect(isReviewState(m[1]!)).toBe(true);
			if (m[2]) expect(isReviewState(m[2])).toBe(true);
		}
	});
});

describe('every review state renders', () => {
	it.each(REVIEW_STATES)('%s has a badge class defined in app.css', (state) => {
		const cls = badgeClass(state);
		expect(cls).not.toBe('badge badge-neutral');

		const modifier = cls.split(' ').at(-1)!;
		expect(read('src/app.css'), `.${modifier} is not declared in app.css`).toContain(`.${modifier}`);
	});

	it.each(REVIEW_STATES)('%s has an i18n key in both locales', (state) => {
		const key = statusKey(state);

		expect(key, `statusKey('${state}') fell through to the raw value`).toBe(`inv.review.${state}`);
		expect(es[key], `${key} missing from es`).toBeTruthy();
		expect(en[key], `${key} missing from en`).toBeTruthy();
	});

	it('falls back to a neutral badge rather than a green one for an unknown state', () => {
		expect(badgeClass('something-new')).toBe('badge badge-neutral');
		expect(statusKey('something-new')).toBe('something-new');
		expect(isReviewState('something-new')).toBe(false);
	});
});

describe('the review filter answers exactly the vocabulary', () => {
	it.each(REVIEW_STATES)('%s compiles to a plain review_state equality', (state) => {
		expect(sqlText(invoiceReviewFilter(state))).toMatch(/"review_state"\s*=/);
	});

	it('answers an empty filter with no predicate at all', () => {
		expect(invoiceReviewFilter('')).toBeUndefined();
	});

	it('refuses a state outside the vocabulary instead of querying for it', () => {
		expect(sqlText(invoiceReviewFilter('pending'))).toBe('false');
		expect(sqlText(invoiceReviewFilter('paid'))).toBe('false');
	});
});

describe('the UI never offers a state the query layer cannot answer', () => {
	const optionValues = [
		...read('src/routes/(app)/invoices/+page.svelte').matchAll(
			/id="inv-status"[\s\S]*?<\/select>/g
		),
	].flatMap((block) => [...block[0].matchAll(/<option value="([a-z_]+)"/g)].map((m) => m[1]));

	it('finds the status filter options to check', () => {
		expect(optionValues.length).toBeGreaterThan(0);
	});

	it.each(optionValues)('the %s option is a review state', (value) => {
		expect(isReviewState(value)).toBe(true);
	});

	it.each(optionValues)('the %s option produces a real predicate', (value) => {
		expect(sqlText(invoiceReviewFilter(value))).not.toBe('false');
	});
});

describe('no source file compares an invoices state column against a foreign word', () => {
	const reviewOffenders = SOURCE_FILES.flatMap((file) =>
		[...columnLiteralsIn(fs.readFileSync(file, 'utf8'), 'reviewState', 'review_state')]
			.filter((s) => !isReviewState(s))
			.map((s) => `${path.relative(ROOT, file)} → '${s}'`)
	);

	const statusOffenders = SOURCE_FILES.flatMap((file) =>
		[...columnLiteralsIn(fs.readFileSync(file, 'utf8'), 'status', 'status')]
			.filter((s) => !isStoredInvoiceStatus(s))
			.map((s) => `${path.relative(ROOT, file)} → '${s}'`)
	);

	const incidenceKindOffenders = SOURCE_FILES.flatMap((file) =>
		[...columnLiteralsIn(fs.readFileSync(file, 'utf8'), 'incidenceKind', 'incidence_kind')]
			.filter((s) => !isIncidenceKind(s))
			.map((s) => `${path.relative(ROOT, file)} → '${s}'`)
	);

	it('finds files referencing review_state at all', () => {
		const referencing = SOURCE_FILES.filter(
			(f) => columnLiteralsIn(fs.readFileSync(f, 'utf8'), 'reviewState', 'review_state').size > 0
		);
		expect(referencing.length).toBeGreaterThan(0);
	});

	it('has no review_state reference outside the vocabulary', () => {
		expect(reviewOffenders).toEqual([]);
	});

	it('has no legacy status reference outside the stored vocabulary', () => {
		expect(STORED_INVOICE_STATUSES.length).toBeGreaterThan(0);
		expect(statusOffenders).toEqual([]);
	});

	it('has no incidence_kind reference outside the vocabulary', () => {
		expect(incidenceKindOffenders).toEqual([]);
	});
});

/**
 * Issue #879: an extraction/read problem ('lectura') is not the same as a
 * real problem with the document ('documento') — the review state alone
 * ('incidencia') cannot tell them apart, so `invoices.incidence_kind` is a
 * second, closed axis with the same guarantees as the review-state vocabulary
 * above: every kind has a badge class, an i18n key, and a hint key in both
 * locales, and an unknown kind falls back to neutral rather than rendering.
 */
describe('the incidence-kind vocabulary is a second, closed axis (issue #879)', () => {
	it.each(INCIDENCE_KINDS)('%s has a badge class defined in app.css', (kind) => {
		const cls = incidenceKindBadgeClass(kind);
		expect(cls).not.toBe('badge badge-neutral');

		const modifier = cls.split(' ').at(-1)!;
		expect(read('src/app.css'), `.${modifier} is not declared in app.css`).toContain(`.${modifier}`);
	});

	it.each(INCIDENCE_KINDS)('%s has a label and a hint key in both locales', (kind) => {
		const key = incidenceKindKey(kind);
		const hintKey = incidenceKindHintKey(kind);

		expect(key).toBe(`inv.review.kind.${kind}`);
		expect(hintKey).toBe(`inv.review.kind.${kind}.hint`);
		expect(es[key], `${key} missing from es`).toBeTruthy();
		expect(en[key], `${key} missing from en`).toBeTruthy();
		expect(es[hintKey], `${hintKey} missing from es`).toBeTruthy();
		expect(en[hintKey], `${hintKey} missing from en`).toBeTruthy();
	});

	it('falls back to a neutral badge and the raw value for an unknown kind', () => {
		expect(incidenceKindBadgeClass('something-new')).toBe('badge badge-neutral');
		expect(incidenceKindKey('something-new')).toBe('something-new');
		expect(isIncidenceKind('something-new')).toBe(false);
	});

	it('lectura and documento render with visually distinct badge classes', () => {
		expect(incidenceKindBadgeClass('lectura')).not.toBe(incidenceKindBadgeClass('documento'));
	});
});
