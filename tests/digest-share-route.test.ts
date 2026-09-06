/**
 * /s/[token] route — load() and og.png — issue #329.
 *
 * The rate limiter is mocked (controllable per test) so the 429 path is
 * deterministic; everything else (token resolution, the anonymised payload
 * builder) runs against the real DB, so these assertions cover the actual
 * data the route hands to the page — not just what the template happens to
 * render. Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { isoWeek } from '../src/lib/server/weekly-digest';

const { rateLimitMock } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));

const describeDb = hasDbEnv ? describe : describe.skip;

const DISTINCTIVE_SUPPLIER = 'Distribuciones Jamás-Visible SA';
const DISTINCTIVE_INVOICE_NUMBER = 'FAC-2026-SECRETO-77';
const DISTINCTIVE_RESTAURANT_NAME = 'Restaurante Totalmente Confidencial';
const DISTINCTIVE_AMOUNT = '6421.09';

function requestEvent(token: string, ip = '203.0.113.50') {
	return {
		params: { token },
		url: new URL(`https://mise-place.com/s/${token}`),
		getClientAddress: () => ip,
	} as never;
}

describeDb('/s/[token] load() — public anonymised digest view (issue #329)', () => {
	let rid = '';
	let token = '';
	const week = isoWeek(new Date());

	beforeAll(async () => {
		if (!hasDbEnv) return;
		const restaurant = await createTestRestaurant('digest-share-route');
		rid = restaurant.id;
		await testSql`UPDATE restaurants SET name = ${DISTINCTIVE_RESTAURANT_NAME} WHERE id = ${rid}`;

		const [supplier] = await testSql`
			INSERT INTO suppliers (restaurant_id, name, category)
			VALUES (${rid}, ${DISTINCTIVE_SUPPLIER}, 'Bebidas') RETURNING id
		`;
		const [inv] = await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
			VALUES (${rid}, ${supplier!.id}, ${DISTINCTIVE_INVOICE_NUMBER}, CURRENT_DATE, ${DISTINCTIVE_AMOUNT}, 'paid')
			RETURNING id
		`;
		await testSql`
			INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, quantity, unit, unit_price)
			VALUES (${inv!.id}, ${rid}, 'Vino tinto reserva', 6, 'ud', 12.00)
		`;

		const { randomBytes } = await import('node:crypto');
		token = randomBytes(24).toString('base64url');
		await testSql`INSERT INTO digest_shares (restaurant_id, week, token) VALUES (${rid}, ${week}, ${token})`;
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		await cleanupTestRestaurant(rid);
		await closeDb();
	});

	beforeEach(() => {
		rateLimitMock.mockClear().mockResolvedValue(true);
	});

	it('renders for an anonymous visitor with no tenant leakage in the returned data', async () => {
		const { load } = await import('../src/routes/s/[token]/+page.server');
		const data = await load(requestEvent(token)) as Record<string, unknown>;

		expect(data.week).toBe(week);
		expect(typeof data.spendChangePct === 'number' || data.spendChangePct === null).toBe(true);

		const json = JSON.stringify(data);
		expect(json).not.toContain(DISTINCTIVE_SUPPLIER);
		expect(json).not.toContain(DISTINCTIVE_INVOICE_NUMBER);
		expect(json).not.toContain(DISTINCTIVE_RESTAURANT_NAME);
		expect(json).not.toContain('6421.09');
		expect(json).not.toContain('6421,09');
		expect(Object.keys(data)).not.toContain('restaurantId');
		expect(Object.keys(data)).not.toContain('restaurantName');
	});

	it('404s for an unknown token (enumeration)', async () => {
		const { load } = await import('../src/routes/s/[token]/+page.server');
		await expect(load(requestEvent('00000000000000000000000000000000'))).rejects.toMatchObject({ status: 404 });
	});

	it('404s for a revoked token', async () => {
		const { randomBytes } = await import('node:crypto');
		const revoked = randomBytes(24).toString('base64url');
		await testSql`INSERT INTO digest_shares (restaurant_id, week, token, revoked_at) VALUES (${rid}, ${week}, ${revoked}, now())`;

		const { load } = await import('../src/routes/s/[token]/+page.server');
		await expect(load(requestEvent(revoked))).rejects.toMatchObject({ status: 404 });
	});

	it('rate-limits per IP and answers 429 when exhausted', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		const { load } = await import('../src/routes/s/[token]/+page.server');
		await expect(load(requestEvent(token))).rejects.toMatchObject({ status: 429 });
		expect(rateLimitMock).toHaveBeenCalledWith(expect.stringContaining('203.0.113.50'), expect.any(Number));
	});

	it('og.png renders an SVG card carrying no supplier name or absolute amount', async () => {
		const { GET } = await import('../src/routes/s/[token]/og.png/+server');
		const response = await GET(requestEvent(token));
		expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
		const body = await response.text();
		expect(body).not.toContain(DISTINCTIVE_SUPPLIER);
		expect(body).not.toContain(DISTINCTIVE_INVOICE_NUMBER);
		expect(body).not.toContain(DISTINCTIVE_RESTAURANT_NAME);
		expect(body).not.toContain('6421');
	});

	it('og.png 404s for a revoked token', async () => {
		const { randomBytes } = await import('node:crypto');
		const revoked = randomBytes(24).toString('base64url');
		await testSql`INSERT INTO digest_shares (restaurant_id, week, token, revoked_at) VALUES (${rid}, ${week}, ${revoked}, now())`;

		const { GET } = await import('../src/routes/s/[token]/og.png/+server');
		await expect(GET(requestEvent(revoked))).rejects.toMatchObject({ status: 404 });
	});
});
