/**
 * Issue #390: export (api/user/export) and delete (api/user/delete) each
 * independently walked the same tenant-scoped data tree — export SELECTs,
 * delete DELETEs. Adding a table to the schema could update one path and
 * silently miss the other. `src/lib/server/tenant-data-map.ts` is now the
 * single ordered definition of "everything that belongs to this tenant"
 * (table + scope column + FK deletion strategy) that both handlers iterate.
 *
 * The real drift guard is schema-derived: every table in `schema.ts` that
 * carries a `restaurantId` column (the same signal `lint-invariants.mjs`'s
 * `tenant-scope`/`unscoped-tenant-query` gates use, minus `user_restaurants`,
 * which is keyed by user rather than by restaurant and is deleted on a
 * separate axis by the delete handler) must have an entry in the map. A
 * schema table with no map entry is exactly the bug #390 describes — added
 * to `schema.ts`, forgotten in export, forgotten in delete, or both.
 *
 * `missingFromTenantDataMap` is exercised with a synthetic extra name (the
 * cheapest, safest way to prove the checker actually rejects a table absent
 * from the map, without mutating the real map/schema mid-test) alongside the
 * real, currently-complete list.
 */
import { describe, it, expect } from 'vitest';
import { isTable, getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/lib/server/schema';
import {
	tenantDataMap, exportableEntries, explicitDeletionEntries, rootEntry, missingFromTenantDataMap,
} from '../src/lib/server/tenant-data-map';

const RESTAURANT_KEYED_BUT_NOT_TENANT_OWNED = new Set(['user_restaurants']);

function deriveTenantScopedTableNames(): string[] {
	const names: string[] = [];
	for (const value of Object.values(schema)) {
		if (!isTable(value)) continue;
		const columns = getTableColumns(value);
		if (!('restaurantId' in columns)) continue;
		const name = getTableName(value);
		if (RESTAURANT_KEYED_BUT_NOT_TENANT_OWNED.has(name)) continue;
		names.push(name);
	}
	return names;
}

describe('tenantDataMap (issue #390)', () => {
	it('has an entry for every restaurant-scoped table declared in schema.ts', () => {
		const schemaTables = deriveTenantScopedTableNames();
		expect(schemaTables.length).toBeGreaterThan(0);
		expect(missingFromTenantDataMap(schemaTables)).toEqual([]);
	});

	it('flags a table that is absent from the map — proving the drift guard actually rejects an unmapped table', () => {
		const schemaTables = deriveTenantScopedTableNames();
		const withAnUnmappedTable = [...schemaTables, 'a_newly_added_tenant_table'];
		expect(missingFromTenantDataMap(withAnUnmappedTable)).toEqual(['a_newly_added_tenant_table']);
	});

	it('has no duplicate table names', () => {
		const names = tenantDataMap.map((entry) => entry.tableName);
		expect(new Set(names).size).toBe(names.length);
	});

	it('has exactly one root entry, and it is restaurants', () => {
		const roots = tenantDataMap.filter((entry) => entry.deletion === 'root');
		expect(roots).toHaveLength(1);
		expect(roots[0].tableName).toBe('restaurants');
		expect(rootEntry().tableName).toBe('restaurants');
	});

	it('exports the same 11-table set the pre-#390 export handler produced, plus recipes/recipe_items (escandallos, Phase 0)', () => {
		expect(exportableEntries().map((entry) => entry.exportKey)).toEqual([
			'restaurants', 'suppliers', 'invoices', 'invoice_line_items', 'category_budgets',
			'unit_conversions', 'chat_sessions', 'chat_messages', 'extraction_corrections',
			'extraction_results', 'stock_levels', 'settings', 'recipes', 'recipe_items',
		]);
	});

	it('every exportable table also carries a wired deletion strategy, so nothing exported can outlive a delete', () => {
		for (const entry of exportableEntries()) {
			expect(['root', 'explicit', 'cascade-via-restaurants']).toContain(entry.deletion);
		}
	});

	it('the explicit-delete list matches the pre-#390 delete handler: only subscriptions, ahead of the restaurants root', () => {
		const explicit = explicitDeletionEntries();
		expect(explicit.map((entry) => entry.tableName)).toEqual(['subscriptions']);
	});

	it('every non-root, non-explicit entry is cascade-covered by a restaurants FK (verified against schema.ts)', () => {
		const cascadeEntries = tenantDataMap.filter((entry) => entry.deletion === 'cascade-via-restaurants');
		expect(cascadeEntries.length).toBeGreaterThan(0);
		for (const entry of cascadeEntries) {
			const foreignKeys = getTableConfig(entry.table).foreignKeys;
			const restaurantFk = foreignKeys.find((fk) => {
				const ref = fk.reference();
				return ref.columns.some((col) => col.name === 'restaurant_id')
					&& getTableName(ref.foreignTable) === 'restaurants';
			});
			expect(restaurantFk, `${entry.tableName} should FK restaurant_id -> restaurants`).toBeDefined();
			expect(restaurantFk?.onDelete).toBe('cascade');
		}
	});
});
