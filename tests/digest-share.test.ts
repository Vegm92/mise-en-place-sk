/**
 * digest_shares — the tokenised, anonymised public digest share (issue #329).
 *
 * SECURITY-SENSITIVE: this is the first surface where tenant-derived data
 * leaves the tenant boundary. The anonymisation assertions below are the
 * load-bearing part of this suite — a seeded tenant carries distinctive
 * supplier/invoice/amount/restaurant-name values, and every assertion checks
 * their absence from the actual returned payload (not the rendered template).
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { isoWeek } from '../src/lib/server/weekly-digest';
import { isoWeekRange, shiftIsoWeek } from '../src/lib/server/reports/shared';
import {
	generateShareToken, resolveShareToken, buildPublicDigestPayload, getOrCreateActiveShare,
} from '../src/lib/server/digest-share';

const describeDb = hasDbEnv ? describe : describe.skip;

const DISTINCTIVE_SUPPLIER = 'ACME Nunca-Debe-Aparecer Distribución SL';
const DISTINCTIVE_INVOICE_NUMBER = 'INV-SECRET-99881';
const DISTINCTIVE_AMOUNT = '8734.56';
const DISTINCTIVE_RESTAURANT_NAME = 'Cocina Ultra Secreta 9911';

describeDb('digest-share — anonymised public payload (issue #329, security)', () => {
	let rid = '';
	const week = isoWeek(new Date());
	const prevWeek = shiftIsoWeek(week, -1);
	const cur = isoWeekRange(week);
	const prev = isoWeekRange(prevWeek);

	beforeAll(async () => {
		if (!hasDbEnv) return;
		const restaurant = await createTestRestaurant('digest-share');
		rid = restaurant.id;
		await testSql`UPDATE restaurants SET name = ${DISTINCTIVE_RESTAURANT_NAME}, venue_type = 'menu_del_dia' WHERE id = ${rid}`;

		const [supplier] = await testSql`
			INSERT INTO suppliers (restaurant_id, name, category)
			VALUES (${rid}, ${DISTINCTIVE_SUPPLIER}, 'Carnes y Derivados') RETURNING id
		`;

		const [invCur] = await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
			VALUES (${rid}, ${supplier.id}, ${DISTINCTIVE_INVOICE_NUMBER}, ${cur.start}, ${DISTINCTIVE_AMOUNT}, 'paid')
			RETURNING id
		`;
		await testSql`
			INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, quantity, unit, unit_price)
			VALUES (${invCur.id}, ${rid}, 'Solomillo de ternera', 10, 'kg', 30.00)
		`;

		const [invPrev] = await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
			VALUES (${rid}, ${supplier.id}, 'PREV-1', ${prev.start}, 500.00, 'paid')
			RETURNING id
		`;
		await testSql`
			INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, quantity, unit, unit_price)
			VALUES (${invPrev.id}, ${rid}, 'Solomillo de ternera', 10, 'kg', 20.00)
		`;
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		await cleanupTestRestaurant(rid);
		await closeDb();
	});

	afterEach(async () => {
		if (!hasDbEnv) return;
		await testSql`DELETE FROM digest_shares WHERE restaurant_id = ${rid}`;
	});

	it('never includes the supplier name, invoice number, restaurant name, or any absolute amount', async () => {
		const payload = await buildPublicDigestPayload(rid, week);
		const json = JSON.stringify(payload);

		expect(json).not.toContain(DISTINCTIVE_SUPPLIER);
		expect(json).not.toContain(DISTINCTIVE_INVOICE_NUMBER);
		expect(json).not.toContain(DISTINCTIVE_RESTAURANT_NAME);
		expect(json).not.toContain('8734.56');
		expect(json).not.toContain('8734,56');
		expect(json).not.toContain('500.00');
		expect(json).not.toContain('500,00');
		expect(json).not.toContain('300.00');
		expect(json).not.toContain('200.00');

		expect(Object.keys(payload)).not.toContain('supplier');
		expect(Object.keys(payload)).not.toContain('supplierName');
		expect(Object.keys(payload)).not.toContain('invoiceNumber');
		expect(Object.keys(payload)).not.toContain('restaurantName');
		expect(Object.keys(payload)).not.toContain('spend');
		expect(Object.keys(payload)).not.toContain('amount');
	});

	it('carries only percentage deltas for spend and category movers, and each mover is category-level only', async () => {
		const payload = await buildPublicDigestPayload(rid, week);

		expect(typeof payload.spendChangePct).toBe('number');
		expect(payload.categoryMovers.length).toBeGreaterThan(0);
		for (const mover of payload.categoryMovers) {
			expect(typeof mover.category).toBe('string');
			expect(mover.category).not.toContain(DISTINCTIVE_SUPPLIER);
			expect(mover.deltaPct === null || typeof mover.deltaPct === 'number').toBe(true);
			expect(Object.keys(mover).sort()).toEqual(['category', 'deltaPct']);
		}
	});

	it('resolves a live token to the right tenant/week', async () => {
		const token = generateShareToken();
		await testSql`INSERT INTO digest_shares (restaurant_id, week, token) VALUES (${rid}, ${week}, ${token})`;

		expect(await resolveShareToken(token)).toEqual({ restaurantId: rid, week });
	});

	it('404s (resolves null) for an unknown token', async () => {
		expect(await resolveShareToken('this-token-was-never-issued-00000000000000000000')).toBeNull();
	});

	it('404s (resolves null) for a revoked token', async () => {
		const token = generateShareToken();
		await testSql`INSERT INTO digest_shares (restaurant_id, week, token) VALUES (${rid}, ${week}, ${token})`;
		expect(await resolveShareToken(token)).not.toBeNull();

		await testSql`UPDATE digest_shares SET revoked_at = now() WHERE token = ${token}`;
		expect(await resolveShareToken(token)).toBeNull();
	});

	it('two concurrent creates for the same (restaurant, week) resolve to exactly one active token (issue #329 follow-up)', async () => {
		const [first, second] = await Promise.all([
			getOrCreateActiveShare(rid, week),
			getOrCreateActiveShare(rid, week),
		]);

		expect(first.token).toBe(second.token);

		const rows = await testSql`
			SELECT token FROM digest_shares WHERE restaurant_id = ${rid} AND week = ${week} AND revoked_at IS NULL
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0]!.token).toBe(first.token);
	});

	it('a losing insert falls back to the winner\'s token via the partial-index conflict path (unit-level, not timing-dependent)', async () => {
		const winner = await getOrCreateActiveShare(rid, week);
		const loser = await getOrCreateActiveShare(rid, week);

		expect(loser.token).toBe(winner.token);
		const rows = await testSql`
			SELECT token FROM digest_shares WHERE restaurant_id = ${rid} AND week = ${week} AND revoked_at IS NULL
		`;
		expect(rows).toHaveLength(1);
	});

	it('a re-share after revoke gets a fresh token, not blocked by the partial unique index', async () => {
		const original = await getOrCreateActiveShare(rid, week);
		await testSql`UPDATE digest_shares SET revoked_at = now() WHERE token = ${original.token}`;

		const reshared = await getOrCreateActiveShare(rid, week);
		expect(reshared.token).not.toBe(original.token);

		const activeRows = await testSql`
			SELECT token FROM digest_shares WHERE restaurant_id = ${rid} AND week = ${week} AND revoked_at IS NULL
		`;
		expect(activeRows).toHaveLength(1);
		expect(activeRows[0]!.token).toBe(reshared.token);
	});
});

describe('generateShareToken — cryptographically random, unguessable (issue #329)', () => {
	it('produces at least 128 bits of URL-safe randomness', () => {
		const token = generateShareToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		const decoded = Buffer.from(token, 'base64url');
		expect(decoded.length * 8).toBeGreaterThanOrEqual(128);
	});

	it('does not repeat across a large sample (not sequential/nanoid-default)', () => {
		const tokens = new Set(Array.from({ length: 5000 }, () => generateShareToken()));
		expect(tokens.size).toBe(5000);
	});

	it('is not a simple counter or timestamp — consecutive tokens share no predictable prefix', () => {
		const a = generateShareToken();
		const b = generateShareToken();
		let sharedPrefix = 0;
		while (sharedPrefix < a.length && a[sharedPrefix] === b[sharedPrefix]) sharedPrefix++;
		expect(sharedPrefix).toBeLessThan(4);
	});
});
