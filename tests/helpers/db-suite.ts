/**
 * The preamble every DB-backed suite repeats: swap the db singleton for the
 * test client.
 */
export async function testDbModule() {
	const { testDb } = await import('./test-db');
	const { forTenant } = await import('../../src/lib/server/tenant');
	return {
		db: testDb,
		forTenant,
		runAsSystem: (fn: () => unknown) => fn(),
		runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
	};
}
