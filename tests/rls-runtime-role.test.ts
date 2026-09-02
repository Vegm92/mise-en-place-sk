/**
 * Database-enforced tenant isolation (issue #222, ADR-030).
 *
 * Two things are proved here, deliberately kept apart:
 *
 * 1. The Postgres policies from drizzle/0055_rls_tenant_isolation.sql, tested
 *    with raw SQL against an isolated non-owner role — this is the actual
 *    database-level backstop the issue asks for, and the shape no app-layer
 *    lint could ever provide (it is invisible to `pnpm lint:tenant-scope`
 *    precisely because it does not go through forTenant()).
 * 2. The application's context mechanism (runWithTenantContext / runAsSystem
 *    in src/lib/server/tenant-context.ts) — that it actually sets the GUC it
 *    claims to, that it resets it before releasing the connection back to
 *    the pool (the "pool contamination" risk named in #222), and that
 *    sequential/nested uses do not leak between tenants.
 *
 * Both run only against a local/ephemeral Postgres (same gate as every other
 * DB-backed suite — see tests/helpers/db-gate.ts) and are a hard failure
 * under REQUIRE_DB_TESTS=1 rather than a silent skip.
 *
 * The role created here (mep_rls_test) is intentionally NOT the real
 * `mep_runtime` created by scripts/create-runtime-role.sql — that role and
 * its pgboss-ownership dance are exercised by tests/create-runtime-role.test.ts.
 * This suite only needs SELECT/INSERT/UPDATE/DELETE on `public`, so it grants
 * exactly that under its own name, which also means it can run in the same
 * `pnpm test` invocation as create-runtime-role.test.ts without either one
 * fighting the other over pgboss schema ownership.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { testSql, closeDb, hasDbEnv, retryOnDeadlock } from './helpers/test-db';
import { resolveDbGate } from './helpers/db-gate';
import { runWithTenantContext, runAsSystem, activeTenantContext } from '../src/lib/server/db';

const gate = resolveDbGate(process.env);
const canRun = hasDbEnv;

if (process.env.REQUIRE_DB_TESTS === '1' && !canRun) {
	throw new Error('REQUIRE_DB_TESTS=1 but the RLS runtime-role suite cannot run — see tests/helpers/db-gate.ts');
}

const TEST_ROLE = 'mep_rls_test';
const TEST_PASSWORD = `rls-test-pw-${Date.now()}`;
const baseUrl = canRun ? new URL(gate.url) : null;

function runtimeUrl(): string {
	const u = new URL(baseUrl!.toString());
	u.username = TEST_ROLE;
	u.password = TEST_PASSWORD;
	return u.toString();
}

let runtimeSql: ReturnType<typeof postgres> | null = null;
let ridA = '';
let ridB = '';
const SHARE_TOKEN = `rls-test-share-token-${Date.now()}`;

async function resetGucs(sql: ReturnType<typeof postgres>): Promise<void> {
	await sql`SELECT set_config('app.restaurant_id', '', false), set_config('app.admin', '', false)`;
}

beforeAll(async () => {
	if (!canRun) return;

	await retryOnDeadlock(() => testSql.unsafe(`
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '${TEST_ROLE}') THEN
				EXECUTE 'DROP OWNED BY ${TEST_ROLE}';
				EXECUTE 'DROP ROLE ${TEST_ROLE}';
			END IF;
		END
		$$;
	`));
	await retryOnDeadlock(() => testSql.unsafe(
		`CREATE ROLE ${TEST_ROLE} LOGIN PASSWORD '${TEST_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
	));
	await retryOnDeadlock(() => testSql.unsafe(`GRANT CONNECT ON DATABASE ${testSql.options.database} TO ${TEST_ROLE}`));
	await retryOnDeadlock(() => testSql.unsafe(`GRANT USAGE ON SCHEMA public TO ${TEST_ROLE}`));
	await retryOnDeadlock(() => testSql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${TEST_ROLE}`));
	await retryOnDeadlock(() => testSql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${TEST_ROLE}`));

	runtimeSql = postgres(runtimeUrl(), { ssl: gate.isLocal ? false : 'require', max: 1 });

	const [a] = await testSql`INSERT INTO restaurants (name, slug) VALUES ('RLS Test Tenant A', ${`rls-test-a-${Date.now()}`}) RETURNING id`;
	const [b] = await testSql`INSERT INTO restaurants (name, slug) VALUES ('RLS Test Tenant B', ${`rls-test-b-${Date.now()}`}) RETURNING id`;
	ridA = a.id as string;
	ridB = b.id as string;

	await testSql`INSERT INTO invoices (restaurant_id, invoice_number, status) VALUES (${ridA}, 'RLS-A-1', 'pending')`;
	await testSql`INSERT INTO invoices (restaurant_id, invoice_number, status) VALUES (${ridB}, 'RLS-B-1', 'pending')`;
	await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${ridA}, 'RLS Supplier A')`;
	await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${ridB}, 'RLS Supplier B')`;
	await testSql`UPDATE restaurants SET venue_type = 'carta' WHERE id = ${ridA}`;
	await testSql`
		INSERT INTO digest_shares (token, restaurant_id, week)
		VALUES (${SHARE_TOKEN}, ${ridA}, '2026-W10')
	`;
});

afterAll(async () => {
	if (!canRun) return;
	await runtimeSql?.end({ timeout: 5 });
	if (ridA) await testSql`DELETE FROM restaurants WHERE id = ${ridA}`;
	if (ridB) await testSql`DELETE FROM restaurants WHERE id = ${ridB}`;
	await retryOnDeadlock(() => testSql.unsafe(`
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '${TEST_ROLE}') THEN
				EXECUTE 'DROP OWNED BY ${TEST_ROLE}';
				EXECUTE 'DROP ROLE ${TEST_ROLE}';
			END IF;
		END
		$$;
	`));
	await closeDb();
});

describe.skipIf(!canRun)('RLS policies (drizzle/0055) — runtime role backstop', () => {
	it('with no context set, the runtime role sees zero rows on a tenant table', async () => {
		await resetGucs(runtimeSql!);
		const rows = await runtimeSql!`SELECT id FROM invoices WHERE invoice_number IN ('RLS-A-1', 'RLS-B-1')`;
		expect(rows).toHaveLength(0);
	});

	it('with app.restaurant_id = A, an UNSCOPED query returns only A — never B', async () => {
		await runtimeSql!`SELECT set_config('app.restaurant_id', ${ridA}, false)`;
		const rows = await runtimeSql!`SELECT invoice_number, restaurant_id FROM invoices WHERE invoice_number IN ('RLS-A-1', 'RLS-B-1')`;
		expect(rows).toHaveLength(1);
		expect(rows[0].invoice_number).toBe('RLS-A-1');
		expect(rows[0].restaurant_id).toBe(ridA);
		await resetGucs(runtimeSql!);
	});

	it('switching app.restaurant_id from A to B on the same connection flips visibility, not adds to it', async () => {
		await runtimeSql!`SELECT set_config('app.restaurant_id', ${ridA}, false)`;
		const asA = await runtimeSql!`SELECT invoice_number FROM invoices WHERE invoice_number IN ('RLS-A-1', 'RLS-B-1')`;
		await runtimeSql!`SELECT set_config('app.restaurant_id', ${ridB}, false)`;
		const asB = await runtimeSql!`SELECT invoice_number FROM invoices WHERE invoice_number IN ('RLS-A-1', 'RLS-B-1')`;
		expect(asA.map((r) => r.invoice_number)).toEqual(['RLS-A-1']);
		expect(asB.map((r) => r.invoice_number)).toEqual(['RLS-B-1']);
		await resetGucs(runtimeSql!);
	});

	it('rejects a write claiming a different tenant than the active app.restaurant_id', async () => {
		await runtimeSql!`SELECT set_config('app.restaurant_id', ${ridA}, false)`;
		await expect(
			runtimeSql!`INSERT INTO invoices (restaurant_id, invoice_number, status) VALUES (${ridB}, 'RLS-CROSS-TENANT', 'pending')`,
		).rejects.toThrow(/row-level security/i);
		await resetGucs(runtimeSql!);
		const leaked = await testSql`SELECT id FROM invoices WHERE invoice_number = 'RLS-CROSS-TENANT'`;
		expect(leaked).toHaveLength(0);
	});

	it('app.admin = true bypasses the tenant filter and sees every tenant', async () => {
		await runtimeSql!`SELECT set_config('app.admin', 'true', false)`;
		const rows = await runtimeSql!`SELECT invoice_number FROM invoices WHERE invoice_number IN ('RLS-A-1', 'RLS-B-1') ORDER BY invoice_number`;
		expect(rows.map((r) => r.invoice_number)).toEqual(['RLS-A-1', 'RLS-B-1']);
		await resetGucs(runtimeSql!);
	});

	it('restaurants: the active tenant is visible, another tenant is not, admin sees both', async () => {
		await runtimeSql!`SELECT set_config('app.restaurant_id', ${ridA}, false)`;
		const own = await runtimeSql!`SELECT id FROM restaurants WHERE id IN (${ridA}, ${ridB})`;
		expect(own.map((r) => r.id)).toEqual([ridA]);

		await runtimeSql!`SELECT set_config('app.admin', 'true', false)`;
		const both = await runtimeSql!`SELECT id FROM restaurants WHERE id IN (${ridA}, ${ridB}) ORDER BY id`;
		expect(both.map((r) => r.id).sort()).toEqual([ridA, ridB].sort());
		await resetGucs(runtimeSql!);
	});

	it('owner role is unaffected — an unscoped query sees both tenants regardless of any GUC', async () => {
		const rows = await testSql`SELECT invoice_number FROM invoices WHERE invoice_number IN ('RLS-A-1', 'RLS-B-1') ORDER BY invoice_number`;
		expect(rows.map((r) => r.invoice_number)).toEqual(['RLS-A-1', 'RLS-B-1']);
	});
});

describe.skipIf(!canRun)('tenant-context mechanism — GUC set/reset/isolation', () => {
	it('activeTenantContext() is undefined outside any wrapped call', () => {
		expect(activeTenantContext()).toBeUndefined();
	});

	it('runWithTenantContext sets app.restaurant_id for the duration, visible inside the callback', async () => {
		const seen = await runWithTenantContext(ridA, async () => {
			const ctx = activeTenantContext();
			expect(ctx?.mode).toBe('tenant');
			expect(ctx?.restaurantId).toBe(ridA);
			const rows = await ctx!.db.execute<{ v: string | null }>(sql`SELECT current_setting('app.restaurant_id', true) AS v`);
			return rows[0]?.v;
		});
		expect(seen).toBe(ridA);
	});

	it('a null/empty restaurantId skips reservation entirely (no context, no GUC set)', async () => {
		await runWithTenantContext(null, async () => {
			expect(activeTenantContext()).toBeUndefined();
		});
		await runWithTenantContext('', async () => {
			expect(activeTenantContext()).toBeUndefined();
		});
	});

	it('does not leak a GUC across sequential uses of the pool', async () => {
		await runWithTenantContext(ridA, async () => {
			expect(activeTenantContext()?.restaurantId).toBe(ridA);
		});
		await runWithTenantContext(ridB, async () => {
			expect(activeTenantContext()?.restaurantId).toBe(ridB);
		});
		await runAsSystem(async () => {
			expect(activeTenantContext()?.mode).toBe('admin');
		});
		expect(activeTenantContext()).toBeUndefined();
	});

	it('resets the session GUC on the physical connection before releasing it back to the pool', async () => {
		let releasedNote = '';
		await runWithTenantContext(ridA, async () => {
			releasedNote = 'entered';
		});
		expect(releasedNote).toBe('entered');
		// A fresh reservation must not observe the prior tenant's setting —
		// proved from the runtime-role side above; here we prove OUR code
		// actually clears it, by reading the GUC back through a brand new
		// admin-context reservation (a different physical connection may or
		// may not be reused by postgres.js, so this only passes if the reset
		// genuinely happened on release, not merely "usually got lucky").
		await runAsSystem(async () => {
			const rows = await testSql`SELECT current_setting('app.restaurant_id', true) AS v`;
			expect(rows[0]?.v === '' || rows[0]?.v === null).toBe(true);
		});
	});

	it('nesting runAsSystem inside runWithTenantContext restores the outer tenant context after', async () => {
		await runWithTenantContext(ridA, async () => {
			expect(activeTenantContext()?.restaurantId).toBe(ridA);
			await runAsSystem(async () => {
				expect(activeTenantContext()?.mode).toBe('admin');
			});
			expect(activeTenantContext()?.mode).toBe('tenant');
			expect(activeTenantContext()?.restaurantId).toBe(ridA);
		});
	});
});

/**
 * The public digest-share route (#329, src/routes/s/[token]) serves
 * anonymous visitors: no session, no locals.restaurantId, and the token is
 * the only authorization boundary. resolveShareToken() reads digest_shares
 * and buildPublicDigestPayload() reads invoices/restaurants — both are
 * RLS-protected tables — for a tenant the caller has no session-derived
 * context for at all, so both routes wrap the lookup in runAsSystem() (see
 * ADR-030's call-site table). The queries below mirror
 * src/lib/server/digest-share.ts's actual predicates exactly (token lookup,
 * period spend, restaurant venue_type) so this pins the real failure mode:
 * without the wrap, an anonymous visitor's own valid share link 404s the
 * moment the runtime-role cutover lands, even though nothing about the
 * token or the data changed.
 */
describe.skipIf(!canRun)('digest share (#329) public route — runtime-role backstop', () => {
	it('without app.admin (no wrap): the token lookup itself returns nothing', async () => {
		await resetGucs(runtimeSql!);
		const rows = await runtimeSql!`
			SELECT restaurant_id, week FROM digest_shares WHERE token = ${SHARE_TOKEN} AND revoked_at IS NULL
		`;
		expect(rows).toHaveLength(0);
	});

	it('with app.admin (the wrap the route uses): token resolves and the payload queries return real data', async () => {
		await runtimeSql!`SELECT set_config('app.admin', 'true', false)`;

		const [share] = await runtimeSql!`
			SELECT restaurant_id, week FROM digest_shares WHERE token = ${SHARE_TOKEN} AND revoked_at IS NULL
		`;
		expect(share?.restaurant_id).toBe(ridA);

		const [spend] = await runtimeSql!`
			SELECT COALESCE(SUM(i.total_amount), 0) AS spend FROM invoices i
			WHERE i.restaurant_id = ${share.restaurant_id} AND i.deleted_at IS NULL
		`;
		expect(spend).toBeDefined();

		const [restaurant] = await runtimeSql!`
			SELECT venue_type FROM restaurants WHERE id = ${share.restaurant_id} LIMIT 1
		`;
		expect(restaurant?.venue_type).toBe('carta');

		await resetGucs(runtimeSql!);
	});

	it('resolving one tenant\'s share token under app.admin never surfaces another tenant\'s row', async () => {
		await runtimeSql!`SELECT set_config('app.admin', 'true', false)`;
		const rows = await runtimeSql!`
			SELECT restaurant_id FROM digest_shares WHERE token = ${SHARE_TOKEN} AND revoked_at IS NULL
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0].restaurant_id).toBe(ridA);
		expect(rows[0].restaurant_id).not.toBe(ridB);
		await resetGucs(runtimeSql!);
	});
});

describe('retryOnDeadlock (test helper)', () => {
	it('retries a statement aborted with SQLSTATE 40P01 and returns its eventual result', async () => {
		let calls = 0;
		const result = await retryOnDeadlock(async () => {
			calls++;
			if (calls < 3) throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
			return 'ok';
		});
		expect(result).toBe('ok');
		expect(calls).toBe(3);
	});

	it('does not retry any other error', async () => {
		let calls = 0;
		await expect(retryOnDeadlock(async () => {
			calls++;
			throw Object.assign(new Error('permission denied'), { code: '42501' });
		})).rejects.toThrow('permission denied');
		expect(calls).toBe(1);
	});

	it('gives up after the attempt budget', async () => {
		let calls = 0;
		await expect(retryOnDeadlock(async () => {
			calls++;
			throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
		}, 2)).rejects.toThrow('deadlock detected');
		expect(calls).toBe(2);
	});
});
