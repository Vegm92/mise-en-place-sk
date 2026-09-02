/**
 * /invoices/export/download — issue #493.
 *
 * The handler had no rate limit and no row cap (it selected every matching
 * invoice with no LIMIT and built the whole workbook in memory), and it
 * coerced an invalid `supplier_id`/`date_from`/`date_to` into a silently
 * dropped filter (`parseInt('abc')` → NaN → a Postgres error surfaced as an
 * unhandled 500) instead of rejecting the request.
 *
 * DB-backed route-level tests against a real Postgres fixture: the response
 * body is a real .xlsx, parsed back with ExcelJS so the truncation marker
 * and row counts are asserted on the actual bytes, not a mocked call.
 * Skipped without DATABASE_URL.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { extractZip } from '../src/lib/server/zip-extract';
import { zipEntryName } from '../src/lib/server/invoice-export-zip';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

const { rateLimitMock } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

vi.mock('$lib/server/storage', () => ({
	getStorage: () => ({
		read: async (key: string) => {
			if (key.includes('missing')) throw new Error('not found');
			return Buffer.from(`stub-bytes:${key}`);
		},
	}),
}));

// Lets a single test lower EXPORT_ROW_CAP without inserting 10k fixture rows.
// A getter (not a fixed value) so the override applies through Vite's
// live-binding module interop without needing vi.resetModules() — which
// would also tear down and re-create the mocked db connection above.
const envOverride: { EXPORT_ROW_CAP?: number } = {};
vi.mock('$lib/server/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/env')>();
	return {
		...actual,
		get EXPORT_ROW_CAP() { return envOverride.EXPORT_ROW_CAP ?? actual.EXPORT_ROW_CAP; },
	};
});

let rid = '';
let supplierId = 0;

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('export493');
	rid = r.id;
	const [s] = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__export493_supplier__') RETURNING id
	`;
	supplierId = s.id;
});

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	delete envOverride.EXPORT_ROW_CAP;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM invoices WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

async function insertInvoices(n: number) {
	await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
		SELECT ${rid}, ${supplierId}, 'INV-493-' || g,
			('2026-01-01'::date + (g || ' days')::interval)::date,
			(10 + g)::numeric, 'pending'
		FROM generate_series(1, ${n}) AS g
	`;
}

async function insertInvoice(rest: {
	invoiceNumber?: string;
	taxBase?: string;
	totalAmount?: string;
	sourceFile?: string;
	restaurantId?: string;
}): Promise<number> {
	const targetRid = rest.restaurantId ?? rid;
	const [row] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, tax_base, total_amount, source_file, status)
		VALUES (
			${targetRid}, ${supplierId}, ${rest.invoiceNumber ?? null},
			${rest.taxBase ?? null}, ${rest.totalAmount ?? null}, ${rest.sourceFile ?? null}, 'pending'
		) RETURNING id
	`;
	return row.id;
}

async function runGet(qs: string) {
	const { GET } = await import('../src/routes/(app)/invoices/export/download/+server');
	return GET({
		url: new URL(`https://app.test/invoices/export/download${qs}`),
		locals: { restaurantId: rid },
	} as never) as Promise<Response>;
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
	try {
		const res = (await promise) as Response;
		return res.status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

async function parseSheet(res: Response) {
	const buf = Buffer.from(await res.arrayBuffer());
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
	const sheet = wb.getWorksheet('Albaranes');
	if (!sheet) throw new Error('Albaranes sheet missing');
	return sheet;
}

describe.skipIf(!hasDbEnv)('/invoices/export/download — issue #493', () => {
	it('exports every row unchanged when under the cap', async () => {
		await insertInvoices(3);
		const res = await runGet('');
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe(
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		);

		const sheet = await parseSheet(res);
		expect(sheet.rowCount).toBe(4); // header + 3 data rows, no marker
		expect(sheet.getRow(2).getCell(3).value).toBe('INV-493-3'); // desc(invoice_date) — day 3 first
	});

	it('rejects a non-numeric supplier_id with 400', async () => {
		expect(await statusOf(runGet('?supplier_id=abc'))).toBe(400);
	});

	it('rejects a zero supplier_id with 400 (parseInt(NaN) regression)', async () => {
		expect(await statusOf(runGet('?supplier_id=0'))).toBe(400);
	});

	it('rejects a negative supplier_id with 400', async () => {
		expect(await statusOf(runGet('?supplier_id=-5'))).toBe(400);
	});

	it('rejects a malformed date_from with 400', async () => {
		expect(await statusOf(runGet('?date_from=not-a-date'))).toBe(400);
	});

	it('rejects an out-of-range date_to with 400', async () => {
		expect(await statusOf(runGet('?date_to=2026-13-40'))).toBe(400);
	});

	it('accepts a valid supplier_id and ISO date range', async () => {
		await insertInvoices(2);
		expect(await statusOf(runGet(`?supplier_id=${supplierId}&date_from=2026-01-01&date_to=2026-12-31`))).toBe(200);
	});

	it('returns 429 when the rate limit is exceeded', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		expect(await statusOf(runGet(''))).toBe(429);
	});

	it('rate-limits on the restaurant id (export:<rid>)', async () => {
		await runGet('');
		expect(rateLimitMock).toHaveBeenCalledWith(`export:${rid}`, expect.any(Number));
	});

	it('caps rows at EXPORT_ROW_CAP and appends a truncation marker row', async () => {
		envOverride.EXPORT_ROW_CAP = 5;
		await insertInvoices(8);

		const res = await runGet('');
		expect(res.status).toBe(200);

		const sheet = await parseSheet(res);
		// header(1) + 5 capped data rows + 1 marker row = 7
		expect(sheet.rowCount).toBe(7);

		const marker = sheet.getRow(7).getCell(1).value as string;
		expect(marker).toContain('truncada');
		expect(marker).toContain('5');

		for (let r = 2; r <= 6; r++) {
			expect(sheet.getRow(r).getCell(1).value).not.toBeNull();
		}
	});

	it('does not add a marker row when the result is exactly at the cap', async () => {
		envOverride.EXPORT_ROW_CAP = 4;
		await insertInvoices(4);

		const res = await runGet('');
		const sheet = await parseSheet(res);
		expect(sheet.rowCount).toBe(5); // header + 4 data rows, no marker
	});
});

describe.skipIf(!hasDbEnv)('/invoices/export/download — issue #883 taxable base + selected download', () => {
	it('includes the tax_base column right before total_amount, header "Base imponible (€)"', async () => {
		await insertInvoice({ invoiceNumber: 'INV-883-1', taxBase: '82.50', totalAmount: '99.83' });

		const sheet = await parseSheet(await runGet(''));
		expect(sheet.getRow(1).getCell(6).value).toBe('Base imponible (€)');
		expect(sheet.getRow(1).getCell(7).value).toBe('Importe (€)');
		expect(sheet.getRow(2).getCell(6).value).toBeCloseTo(82.5);
		expect(sheet.getRow(2).getCell(7).value).toBeCloseTo(99.83);
	});

	it('leaves the tax_base cell null-safe when the invoice has no tax_base', async () => {
		await insertInvoice({ invoiceNumber: 'INV-883-2', totalAmount: '10.00' });

		const sheet = await parseSheet(await runGet(''));
		expect(sheet.getRow(2).getCell(6).value).toBeNull();
	});

	it('ids= returns only the selected invoices, replacing the status/supplier/date filters', async () => {
		const a = await insertInvoice({ invoiceNumber: 'INV-883-A' });
		await insertInvoice({ invoiceNumber: 'INV-883-B' });
		const c = await insertInvoice({ invoiceNumber: 'INV-883-C' });

		const sheet = await parseSheet(await runGet(`?ids=${a},${c}&status=incidencia`));
		expect(sheet.rowCount).toBe(3);
		const numbers = [sheet.getRow(2).getCell(3).value, sheet.getRow(3).getCell(3).value];
		expect(numbers.sort()).toEqual(['INV-883-A', 'INV-883-C']);
	});

	it('silently excludes an id belonging to another tenant (ADR-001)', async () => {
		const mine = await insertInvoice({ invoiceNumber: 'INV-883-MINE' });
		const other = await createTestRestaurant('export883-other');
		const [foreign] = await testSql`
			INSERT INTO invoices (restaurant_id, invoice_number, status) VALUES (${other.id}, 'INV-883-FOREIGN', 'pending') RETURNING id
		`;

		const sheet = await parseSheet(await runGet(`?ids=${mine},${foreign.id}`));
		expect(sheet.rowCount).toBe(2);
		expect(sheet.getRow(2).getCell(3).value).toBe('INV-883-MINE');

		await cleanupTestRestaurant(other.id);
	});

	it('rejects a non-numeric ids entry with 400', async () => {
		expect(await statusOf(runGet('?ids=1,abc'))).toBe(400);
	});

	it('treats an empty ids= as no id filter at all (falls back to the normal listing)', async () => {
		expect(await statusOf(runGet('?ids='))).toBe(200);
	});

	it('rejects more than 500 ids with 400', async () => {
		const many = Array.from({ length: 501 }, (_, i) => i + 1).join(',');
		expect(await statusOf(runGet(`?ids=${many}`))).toBe(400);
	});

	it('format=zip returns a zip containing facturas.xlsx and each invoice\'s source file, named via zipEntryName', async () => {
		const withFile = await insertInvoice({ invoiceNumber: 'INV-883-Z1', sourceFile: 'ns/inv-z1.pdf' });
		const noFile = await insertInvoice({ invoiceNumber: 'INV-883-Z2' });

		const res = await runGet(`?ids=${withFile},${noFile}&format=zip`);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('application/zip');
		expect(res.headers.get('Content-Disposition')).toContain('facturas.zip');

		const buf = Buffer.from(await res.arrayBuffer());
		const { files, errors } = await extractZip(buf);
		expect(errors).toEqual([]);
		const expectedName = zipEntryName(withFile, 'INV-883-Z1', 'ns/inv-z1.pdf');
		const names = files.map((f) => f.name).sort();
		expect(names).toEqual([expectedName, 'facturas.xlsx'].sort());

		const dataFile = files.find((f) => f.name === expectedName)!;
		expect(dataFile.buffer.toString()).toBe('stub-bytes:ns/inv-z1.pdf');
	});

	it('skips an invoice whose stored file cannot be read', async () => {
		const withMissingFile = await insertInvoice({ invoiceNumber: 'INV-883-Z3', sourceFile: 'ns/missing.pdf' });

		const res = await runGet(`?ids=${withMissingFile}&format=zip`);
		const { files } = await extractZip(Buffer.from(await res.arrayBuffer()));
		expect(files.map((f) => f.name)).toEqual(['facturas.xlsx']);
	});
});

describe('zipEntryName — issue #883 review fix', () => {
	it('keeps a plain invoice number as-is, prefixed by id', () => {
		expect(zipEntryName(7, 'INV-2026-001', 'ns/a.pdf')).toBe('7-INV-2026-001.pdf');
	});

	it('replaces a slash so the invoice number cannot escape into a nested path', () => {
		expect(zipEntryName(7, 'A/2026/123', 'ns/a.pdf')).toBe('7-A_2026_123.pdf');
	});

	it('gives two invoices sharing the same number distinct entry names', () => {
		const a = zipEntryName(1, 'DUP-1', 'ns/a.pdf');
		const b = zipEntryName(2, 'DUP-1', 'ns/b.pdf');
		expect(a).not.toBe(b);
		expect(a).toBe('1-DUP-1.pdf');
		expect(b).toBe('2-DUP-1.pdf');
	});

	it('falls back to just the id when the invoice number is empty or null', () => {
		expect(zipEntryName(9, '', 'ns/a.pdf')).toBe('9.pdf');
		expect(zipEntryName(9, null, 'ns/a.pdf')).toBe('9.pdf');
		expect(zipEntryName(9, undefined, 'ns/a.pdf')).toBe('9.pdf');
	});

	it('folds accented and unicode characters to underscores', () => {
		expect(zipEntryName(3, 'Factoría/Núm 42€', 'ns/a.pdf')).toBe('3-Factor_a_N_m_42.pdf');
	});

	it('collapses runs of unsafe characters and trims leading/trailing underscores', () => {
		expect(zipEntryName(4, '  //weird!!number//  ', 'ns/a.pdf')).toBe('4-weird_number.pdf');
	});

	it('caps the sanitized number length at 80 characters', () => {
		const long = 'A'.repeat(120);
		const name = zipEntryName(5, long, 'ns/a.pdf');
		expect(name).toBe(`5-${'A'.repeat(80)}.pdf`);
	});

	it('keeps the extension from the source file, including no-extension files', () => {
		expect(zipEntryName(6, 'X-1', 'ns/a.pdf')).toBe('6-X-1.pdf');
		expect(zipEntryName(6, 'X-1', 'ns/a')).toBe('6-X-1');
	});
});
