/**
 * Issue #747 item 9 — desktop invoice rows rendered `123.40 EUR` and ISO
 * dates (`2026-09-24`) where mobile and the KPI tiles show `123,40 €` /
 * `24 sept`. #535 (locale-aware formatters, 16 sites) landed before this and
 * covered most of the app, but the desktop `/invoices` row markup still
 * built its own literal " EUR" suffix off `fmt()` (2-decimal string, no
 * currency/locale) and printed `invoice_date`/`due_date` as the raw ISO
 * strings straight from Postgres.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'src', 'routes', '(app)', 'invoices', '+page.svelte');
const source = readFileSync(FILE, 'utf8');

function desktopRowMarkup(): string {
	const start = source.indexOf("<div class=\"hidden md:block p-6\">");
	expect(start, 'desktop-only wrapper not found').toBeGreaterThan(-1);
	const rowAt = source.indexOf('grid-cols-[auto_minmax(0,1fr)_95px_100px_110px_32px]', start);
	expect(rowAt, 'desktop row grid not found').toBeGreaterThan(-1);
	const end = source.indexOf('{#if expanded}', rowAt);
	return source.slice(rowAt, end);
}

describe('issue #747 — desktop /invoices rows use the shared locale-aware formatters', () => {
	const row = desktopRowMarkup();

	it('formats the invoice date through fmtDateShort, not the raw ISO string', () => {
		expect(row).not.toMatch(/\{inv\.invoice_date\s*\?\?/);
		expect(row).toMatch(/fmtDateShort\(inv\.invoice_date, \locale.current\)/);
	});

	it('formats the due date through fmtDateShort, not the raw ISO string', () => {
		expect(row).not.toMatch(/\{inv\.due_date\s*\?\?/);
		expect(row).toMatch(/fmtDateShort\(inv\.due_date, \locale.current\)/);
	});

	it('formats the total through fmtEur (locale symbol/decimal), not a literal " EUR" suffix', () => {
		expect(row).not.toMatch(/>\s*EUR\s*</);
		expect(row).toMatch(/fmtEur\(inv\.total_amount \?\? 0, \locale.current\)/);
	});
});
