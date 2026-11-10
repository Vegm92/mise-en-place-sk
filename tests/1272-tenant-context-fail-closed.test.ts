/**
 * RULE-149 (issue #1272): a tenant scope with no restaurant is a bug, not a
 * no-op. Before, `runWithTenantContext(null, fn)` ran `fn` with no scope at
 * all; with RLS live that silently returns nothing (or hides a missing
 * tenant), so it now throws and the caller must pick runAsSystem or no scope.
 */
import { describe, expect, it, vi } from 'vitest';
import { runWithTenantContext, TenantContextRequiredError } from '../src/lib/server/tenant-context';

describe('runWithTenantContext fails closed', () => {
	it.each([null, undefined, ''])('rejects %j without running the callback', async (rid) => {
		const fn = vi.fn(async () => 'ran');
		await expect(runWithTenantContext(rid, fn)).rejects.toBeInstanceOf(TenantContextRequiredError);
		expect(fn).not.toHaveBeenCalled();
	});
});
