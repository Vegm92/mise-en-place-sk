/**
 * The in-memory chainable query-builder stub shared by tests that mock
 * `$lib/server/db` away entirely (no Postgres, no `hasDbEnv` gate). Every
 * builder method returns the same object so any call chain resolves, and
 * the chain itself is a thenable so `await db.select()...` works without a
 * real driver.
 */
export function chainableQuery(rowsFor: () => unknown[] = () => []): () => Record<string, unknown> {
	return () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'leftJoin', 'where', 'limit', 'update', 'set', 'insert', 'values', 'onConflictDoUpdate', 'returning']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown) => Promise.resolve(rowsFor()).then(res);
		return p;
	};
}
