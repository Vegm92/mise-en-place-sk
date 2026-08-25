/**
 * The invoice status vocabulary is one closed set (issue #520).
 *
 * `tests/status.test.ts` passed while three disagreeing `InvoiceStatus` unions
 * coexisted, because it only asserted the values `lib/status.ts` happened to
 * declare — never the values the database actually holds. Under it:
 *
 *   - `invoices.status` is written 'pending' | 'accepted' | 'rejected' | 'paid',
 *     but `lib/status.ts` declared 'pending' | 'confirmed' | 'exported' |
 *     'overdue' | 'paid'. A row marked `accepted` or `rejected` therefore had
 *     no i18n key and rendered the raw English word in a Spanish-first UI;
 *   - the invoice list offered a status=overdue filter that compiled to
 *     `WHERE status = 'overdue'` — a value nothing ever writes, so the filter
 *     was guaranteed to return nothing;
 *   - the invoice detail timeline branched on 'confirmed' | 'exported', which
 *     no code path can produce, so the "confirmed" step never appeared.
 *
 * These assert over the vocabulary itself rather than over a hand-written list:
 * every status the database can hold has a badge and a key in both locales,
 * every status the UI offers is one the query layer can answer, and no source
 * file compares `invoices.status` against a word outside the set.
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
	STORED_INVOICE_STATUSES,
	DERIVED_INVOICE_STATUSES,
	DISPLAY_INVOICE_STATUSES,
	badgeClass,
	statusKey,
	isStoredInvoiceStatus,
	isDisplayInvoiceStatus,
} from '../src/lib/status';
import { invoiceStatusFilter } from '../src/lib/server/invoice-status';
import { translations } from '../src/lib/i18n';

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
 * Every word this file compares against, or writes into, `invoices.status`.
 * Matching is deliberately narrow — a wide window picks up column aliases in
 * the same statement (`open_count`, `has_overdue`) and turns the test into
 * noise.
 */
function statusLiteralsIn(src: string): Set<string> {
	const found = new Set<string>();
	const add = (s: string | undefined) => { if (s) found.add(s); };

	for (const m of src.matchAll(/\b(?:eq|ne)\(invoices\.status,\s*'([a-z_]+)'/g)) add(m[1]);
	for (const m of src.matchAll(/inArray\(invoices\.status,\s*\[([^\]]*)\]/g)) {
		for (const lit of m[1].matchAll(LITERAL)) add(lit[1]);
	}
	for (const m of src.matchAll(/invoices\.status\}\s*(?:=|<>|!=)\s*'([a-z_]+)'/g)) add(m[1]);
	for (const m of src.matchAll(/update\(invoices\)[\s\S]{0,300}?\.set\(\{[\s\S]{0,250}?status:\s*'([a-z_]+)'/g)) add(m[1]);
	for (const m of src.matchAll(/insert\(invoices\)[\s\S]{0,600}?status:\s*'([a-z_]+)'/g)) add(m[1]);

	for (const m of src.matchAll(/`([^`]*\bfrom\s+invoices\b[^`]*)`/gi)) {
		for (const lit of m[1].matchAll(/\bstatus\s*=\s*'([a-z_]+)'/g)) add(lit[1]);
		for (const inClause of m[1].matchAll(/\bstatus\s+in\s*\(([^)]*)\)/gi)) {
			for (const lit of inClause[1].matchAll(LITERAL)) add(lit[1]);
		}
	}

	return found;
}

describe('the stored vocabulary is what the transition module writes', () => {
	const src = read('src/lib/server/invoice-status.ts');

	it('declares no union of its own', () => {
		expect(src, 'invoice-status.ts must reuse InvoiceStatus from $lib/status, not redeclare it')
			.not.toMatch(/export type InvoiceStatus\s*=\s*'/);
	});

	it.each([...src.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1]))(
		"writes status '%s', which is in the stored vocabulary",
		(status) => {
			expect(isStoredInvoiceStatus(status)).toBe(true);
		}
	);

	it('writes every stored status somewhere, so the set has no dead members', () => {
		const written = new Set([...src.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1]));
		for (const status of STORED_INVOICE_STATUSES) expect([...written]).toContain(status);
	});
});

describe('every displayable status renders', () => {
	it.each(DISPLAY_INVOICE_STATUSES)('%s has a badge class defined in app.css', (status) => {
		const cls = badgeClass(status);
		expect(cls).not.toBe('badge badge-neutral');

		const modifier = cls.split(' ').at(-1)!;
		expect(read('src/app.css'), `.${modifier} is not declared in app.css`).toContain(`.${modifier}`);
	});

	it.each(DISPLAY_INVOICE_STATUSES)('%s has an i18n key in both locales', (status) => {
		const key = statusKey(status);

		expect(key, `statusKey('${status}') fell through to the raw value`).toBe(`status.${status}`);
		expect(es[key], `${key} missing from es`).toBeTruthy();
		expect(en[key], `${key} missing from en`).toBeTruthy();
	});

	it('falls back to a neutral badge rather than a green one for an unknown status', () => {
		expect(badgeClass('something-new')).toBe('badge badge-neutral');
		expect(statusKey('something-new')).toBe('something-new');
		expect(isDisplayInvoiceStatus('something-new')).toBe(false);
	});
});

describe('derived statuses are display-only', () => {
	it.each(DERIVED_INVOICE_STATUSES)('%s is never stored', (status) => {
		expect(isStoredInvoiceStatus(status)).toBe(false);
	});

	it('overdue compiles to a due-date predicate, not an equality on a value nothing writes', () => {
		const sql = sqlText(invoiceStatusFilter('overdue'));

		expect(sql).toContain('due_date');
		expect(sql).not.toMatch(/status"?\s*=\s*\$\d+\s*$/);
	});

	it.each(STORED_INVOICE_STATUSES)('%s still compiles to a plain status equality', (status) => {
		expect(sqlText(invoiceStatusFilter(status))).toMatch(/"status"\s*=/);
	});

	it('answers an empty filter with no predicate at all', () => {
		expect(invoiceStatusFilter('')).toBeUndefined();
	});

	it('refuses a status outside the vocabulary instead of querying for it', () => {
		expect(sqlText(invoiceStatusFilter('confirmed'))).toBe('false');
	});
});

describe('the UI never offers a status the query layer cannot answer', () => {
	const optionValues = [
		...read('src/routes/(app)/invoices/+page.svelte').matchAll(
			/id="inv-status"[\s\S]*?<\/select>/g
		),
	].flatMap((block) => [...block[0].matchAll(/<option value="([a-z_]+)"/g)].map((m) => m[1]));

	it('finds the status filter options to check', () => {
		expect(optionValues.length).toBeGreaterThan(0);
	});

	it.each(optionValues)('the %s option is a displayable status', (value) => {
		expect(isDisplayInvoiceStatus(value)).toBe(true);
	});

	it.each(optionValues)('the %s option produces a real predicate', (value) => {
		expect(sqlText(invoiceStatusFilter(value))).not.toBe('false');
	});
});

describe('no source file compares invoices.status against a foreign word', () => {
	const offenders = SOURCE_FILES.flatMap((file) =>
		[...statusLiteralsIn(fs.readFileSync(file, 'utf8'))]
			.filter((s) => !isStoredInvoiceStatus(s))
			.map((s) => `${path.relative(ROOT, file)} → '${s}'`)
	);

	it('finds files referencing invoices.status at all', () => {
		const referencing = SOURCE_FILES.filter((f) => statusLiteralsIn(fs.readFileSync(f, 'utf8')).size > 0);
		expect(referencing.length).toBeGreaterThan(0);
	});

	it('has no reference outside the stored vocabulary', () => {
		expect(offenders).toEqual([]);
	});
});
