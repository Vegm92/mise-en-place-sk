/**
 * Issue #735: `duplicate` always named the copy "$name (copia)" with
 * onConflictDoNothing, so duplicating the same sheet a second time always
 * 409'd on a name the user never typed. Fix: suffix until free — "(copia)",
 * "(copia 2)", "(copia 3)" … bounded by a small retry count, 409 only when
 * that genuinely runs out.
 *
 * DB-backed: the db singleton is swapped for the real test client so the
 * unique-index retries run against real Postgres. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { actions } from '../src/routes/(app)/recipes/[id]/+page.server';

type ActionResult =
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'fail'; status: number; data: { error?: string } };

async function runDuplicate(recipeId: number, rid: string): Promise<ActionResult> {
	const event = {
		params: { id: String(recipeId) },
		locals: { restaurantId: rid },
		request: { formData: async () => new FormData() },
	} as never;
	try {
		const value = await (actions.duplicate as (e: never) => Promise<unknown>)(event);
		const v = value as { status: number; data: { error?: string } };
		return { kind: 'fail', status: v.status, data: v.data };
	} catch (thrown) {
		if (isRedirect(thrown)) return { kind: 'redirect', status: thrown.status, location: thrown.location };
		throw thrown;
	}
}

async function newRecipe(rid: string, name: string) {
	const [row] = await testSql`
		INSERT INTO recipes (restaurant_id, name, name_key, kind, status, portions)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)}, 'plato', 'draft', '4')
		RETURNING id
	`;
	return Number(row.id);
}

async function recipeName(id: number) {
	const [row] = await testSql`SELECT name FROM recipes WHERE id = ${id}`;
	return (row as { name: string }).name;
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('735-duplicate-suffix')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('duplicate — repeated duplication finds a free "(copia N)" suffix (#735)', () => {
	it('duplicating the same sheet 3 times yields three distinct "(copia)"/"(copia 2)"/"(copia 3)" recipes', async () => {
		const sourceName = `Escandallo repetible ${Date.now()}`;
		const sourceId = await newRecipe(rid, sourceName);

		const results: ActionResult[] = [];
		for (let i = 0; i < 3; i++) results.push(await runDuplicate(sourceId, rid));

		const ids: number[] = [];
		for (const r of results) {
			expect(r.kind).toBe('redirect');
			if (r.kind !== 'redirect') continue;
			const match = /\/recipes\/(\d+)$/.exec(r.location);
			expect(match).not.toBeNull();
			ids.push(Number(match![1]));
		}
		expect(new Set(ids).size).toBe(3);

		const names = await Promise.all(ids.map((id) => recipeName(id)));
		expect(names.sort()).toEqual([
			`${sourceName} (copia)`,
			`${sourceName} (copia 2)`,
			`${sourceName} (copia 3)`,
		].sort());
	});

	it('still 409s once every bounded suffix attempt is exhausted', async () => {
		const sourceName = `Escandallo copado ${Date.now()}`;
		const sourceId = await newRecipe(rid, sourceName);
		for (let i = 1; i <= 9; i++) {
			const copyName = i === 1 ? `${sourceName} (copia)` : `${sourceName} (copia ${i})`;
			await newRecipe(rid, copyName);
		}

		const result = await runDuplicate(sourceId, rid);

		expect(result).toMatchObject({ kind: 'fail', status: 409, data: { error: 'rec.err.duplicate' } });
	});
});
