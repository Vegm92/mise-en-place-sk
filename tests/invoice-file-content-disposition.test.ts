/**
 * /invoice/[id]/file — issue #504.
 *
 * The Content-Disposition filename was interpolated straight from the
 * storage key's basename with no quoting/escaping/ASCII restriction. Not
 * reachable today (the key is a server-generated storage key with a random
 * suffix), but a defence-in-depth fix: a literal quote in a filename would
 * truncate the header, CR/LF would split it into extra header lines, and
 * non-ASCII would be sent raw. These drive the real route handler against a
 * DB-backed invoice fixture whose source_file basename carries each of
 * those characters, with the storage driver stubbed so no real file read is
 * needed. Skipped without DATABASE_URL.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

vi.mock('$lib/server/storage', () => ({
	getStorage: () => ({ read: async () => Buffer.from('%PDF-1.4 stub') }),
}));

let rid = '';

async function insertInvoice(sourceFile: string): Promise<number> {
	const [row] = await testSql`
		INSERT INTO invoices (restaurant_id, source_file) VALUES (${rid}, ${sourceFile}) RETURNING id
	`;
	return row!.id;
}

async function runGet(id: number) {
	const { GET } = await import('../src/routes/(app)/invoice/[id]/file/+server');
	return GET({
		params: { id: String(id) },
		locals: { restaurantId: rid },
	} as never) as Promise<Response>;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('invfile504')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('/invoice/[id]/file — issue #504 Content-Disposition escaping', () => {
	it('escapes a double quote in the filename and adds an RFC 5987 fallback', async () => {
		const id = await insertInvoice('ns/inv"quoted.pdf');
		const res = await runGet(id);
		const header = res.headers.get('Content-Disposition')!;

		expect(header.split('\n')).toHaveLength(1);
		expect(header).toContain('inline; filename="invquoted.pdf"');
		expect(header).toContain("filename*=UTF-8''inv%22quoted.pdf");
	});

	it('ASCII-folds a non-ASCII filename and carries the exact bytes in filename*', async () => {
		const id = await insertInvoice('ns/albarán.pdf');
		const res = await runGet(id);
		const header = res.headers.get('Content-Disposition')!;

		expect(header.split('\n')).toHaveLength(1);
		expect(header).toContain('inline; filename="albar_n.pdf"');
		expect(header).toContain("filename*=UTF-8''albar%C3%A1n.pdf");
	});

	it('never splits the header across lines when the basename carries CR/LF', async () => {
		const id = await insertInvoice('ns/evil\r\nX-Injected: 1.pdf');
		const res = await runGet(id);
		const header = res.headers.get('Content-Disposition')!;

		expect(header).not.toMatch(/[\r\n]/);
		expect(header).toContain('inline; filename="evil__X-Injected: 1.pdf"');
		expect(header).toContain("filename*=UTF-8''evil%0D%0AX-Injected%3A%201.pdf");
	});

	it('leaves a plain ASCII filename byte-identical in both forms', async () => {
		const id = await insertInvoice('ns/factura-2026.pdf');
		const res = await runGet(id);
		const header = res.headers.get('Content-Disposition')!;

		expect(header).toBe(`inline; filename="factura-2026.pdf"; filename*=UTF-8''factura-2026.pdf`);
	});
});
