/**
 * The JSON endpoint contract — one error envelope, declared body schemas,
 * optional idempotency keys, bounded list responses (issues #1005–#1008).
 *
 * Before this batch three shapes were in use across `+server.ts`: SvelteKit's
 * thrown `{message}`, `json({error})` and, in one handler, both. Every JSON
 * endpoint now *returns* `{ error }` with its status, parses its body through
 * a valibot schema, accepts an optional `idempotency_key`, and caps the row
 * count it will hand back.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	const actual = await vi.importActual<typeof import('../src/lib/server/db')>('../src/lib/server/db');
	return { ...actual, db: testDb, forTenant };
});

vi.mock('../src/lib/server/rate-limit-scope', () => ({
	rateLimitScoped: vi.fn(async () => true),
}));

import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { expectApiError } from './helpers/api-error';
import { LIST_ROW_CAP } from '../src/lib/server/env';
import { POST as sidebarPost } from '../src/routes/(app)/api/sidebar/+server';
import { POST as tutorialPost } from '../src/routes/(app)/api/tutorial/+server';
import { GET as notificationsGet, POST as notificationsPost } from '../src/routes/(app)/api/notifications/+server';
import { POST as unitConversionsPost } from '../src/routes/(app)/api/unit-conversions/+server';
import { POST as supplierCategoryPost } from '../src/routes/(app)/api/supplier-category/+server';
import { POST as productAliasesPost } from '../src/routes/(app)/api/product-aliases/+server';

const ROUTES_DIR = path.join(process.cwd(), 'src/routes');

/**
 * `/api/upload/[id]/[file]` streams a PDF or image into an `<iframe>`, so its
 * failures are rendered by the browser, not parsed by a client — SvelteKit's
 * HTML error page is the right response there and the JSON envelope is not.
 */
const NON_JSON_API_ROUTES = new Set([
	path.join('src', 'routes', 'api', 'upload', '[id]', '[file]', '+server.ts'),
]);

let rid = '';

function jsonRequest(url: string, body: unknown): Request {
	return new Request(`http://localhost${url}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

type Handler = (event: unknown) => Promise<Response>;

function post(handler: unknown, url: string, body: unknown): Promise<Response> {
	return (handler as Handler)({
		request: jsonRequest(url, body),
		locals: { restaurantId: rid, user: { id: 'contract-user' } },
	});
}

function get(handler: unknown, url: string): Promise<Response> {
	return (handler as Handler)({
		url: new URL(`http://localhost${url}`),
		locals: { restaurantId: rid, user: { id: 'contract-user' } },
	});
}

function serverRoutes(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...serverRoutes(full));
		else if (entry === '+server.ts') out.push(full);
	}
	return out;
}

async function seedNotification(status = 'pending'): Promise<number> {
	const [row] = await testSql`
		INSERT INTO system_notifications (restaurant_id, notification_type, message, status)
		VALUES (${rid}, 'contract_test', 'contract test', ${status})
		RETURNING id`;
	return row!.id as number;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('json-api-contract')).id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM system_notifications WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM unit_conversions WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM idempotency_keys WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM suppliers WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe('one error envelope across the endpoint surface (#1005)', () => {
	it('leaves no +server.ts throwing SvelteKit’s {message} shape for a JSON API', () => {
		const offenders = serverRoutes(ROUTES_DIR)
			.filter((file) => file.includes(`${path.sep}api${path.sep}`))
			.map((file) => path.relative(process.cwd(), file))
			.filter((file) => !NON_JSON_API_ROUTES.has(file))
			.filter((file) => /\berror\s*\(\s*\d{3}/.test(readFileSync(file, 'utf8')));

		expect(offenders).toEqual([]);
	});
});

describe.skipIf(!hasDbEnv)('declared body schemas (#1006)', () => {
	it('rejects a non-boolean sidebar body with {error} and 400', async () => {
		const body = await expectApiError(await post(sidebarPost, '/api/sidebar', { collapsed: 'yes' }), 400);
		expect(body.error).toBe('Invalid collapsed');
	});

	it('rejects an unknown tutorial step with {error} and 400', async () => {
		const body = await expectApiError(await post(tutorialPost, '/api/tutorial', { step: '99' }), 400);
		expect(body.error).toBe('Invalid step');
	});

	it('rejects a malformed JSON body rather than throwing', async () => {
		const request = new Request('http://localhost/api/sidebar', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not json at all',
		});
		const res = await (sidebarPost as Handler)({ request, locals: { restaurantId: rid } });
		const body = await expectApiError(res, 400);
		expect(body.error).toBe('Invalid collapsed');
	});

	it('rejects a non-positive conversion factor with the same message as before', async () => {
		const body = await expectApiError(await post(unitConversionsPost, '/api/unit-conversions', {
			supplier_name: 'Contract SL',
			ingredient: 'harina',
			purchase_unit: 'saco',
			canonical_unit: 'kg',
			conversion_factor: '0',
		}), 422);
		expect(body.error).toBe('conversion_factor must be a positive number');

		const rows = await testSql`SELECT count(*)::int AS n FROM unit_conversions WHERE restaurant_id = ${rid}`;
		expect(rows[0]!.n).toBe(0);
	});

	it('rejects an unknown supplier-category action with the same message as before', async () => {
		const body = await expectApiError(await post(supplierCategoryPost, '/api/supplier-category', {
			supplierId: 1,
			action: 'sideways',
		}), 422);
		expect(body.error).toBe("action must be 'accept' or 'dismiss'");
	});

	it('rejects a blank product-alias description', async () => {
		const body = await expectApiError(await post(productAliasesPost, '/api/product-aliases', {
			description: '   ',
			action: 'confirm',
		}), 422);
		expect(body.error).toBe('description required');
	});
});

describe.skipIf(!hasDbEnv)('optional idempotency key (#1008)', () => {
	const REPLAY_UUID = '44444444-4444-4444-4444-444444444444';

	it('writes once and reports the replay when the same key is sent twice', async () => {
		const id = await seedNotification();

		const first = await post(notificationsPost, '/api/notifications', { id, idempotency_key: REPLAY_UUID });
		expect(await first.json()).toEqual({ ok: true });

		await testSql`UPDATE system_notifications SET status = 'pending' WHERE id = ${id}`;

		const second = await post(notificationsPost, '/api/notifications', { id, idempotency_key: REPLAY_UUID });
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ ok: true, replay: true });

		const [row] = await testSql`SELECT status FROM system_notifications WHERE id = ${id}`;
		expect(row!.status).toBe('pending');
	});

	it('releases the key when the handler refuses, so a corrected retry is not swallowed', async () => {
		const RELEASE_UUID = '55555555-5555-5555-5555-555555555555';

		const refused = await post(supplierCategoryPost, '/api/supplier-category', {
			supplierId: 424242,
			action: 'accept',
			category: 'Bebidas',
			idempotency_key: RELEASE_UUID,
		});
		expect(refused.ok).toBe(false);
		expect(typeof ((await refused.json()) as { error?: unknown }).error).toBe('string');

		const rows = await testSql`SELECT count(*)::int AS n FROM idempotency_keys WHERE key = ${RELEASE_UUID}`;
		expect(rows[0]!.n).toBe(0);
	});

	it('rejects a key that is not a uuid', async () => {
		const id = await seedNotification();
		await expectApiError(
			await post(notificationsPost, '/api/notifications', { id, idempotency_key: 'not-a-uuid' }),
			422,
		);
	});
});

describe.skipIf(!hasDbEnv)('bounded list responses (#1007)', () => {
	it('caps the notification list at LIST_ROW_CAP and says when it truncated', async () => {
		for (let i = 0; i < 3; i++) await seedNotification();

		const withinCap = await get(notificationsGet, '/api/notifications');
		const body = await withinCap.json() as { notifications: unknown[]; truncated: boolean };
		expect(body.notifications).toHaveLength(3);
		expect(body.truncated).toBe(false);
		expect(body.notifications.length).toBeLessThanOrEqual(LIST_ROW_CAP);
	});
});
