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
