/**
 * Issue #490 — `locals.restaurantId!` throws an opaque 500 on API routes that
 * never run the (app) layout guard.
 *
 * `resolveTenantGate` is the single choke point hooks.server.ts consults once
 * membership is resolved: every route nested under the `(app)` route group is
 * gated the same way, whether it is a page or a `+server.ts` endpoint, so a
 * new endpoint gets the guard for free just by living under `(app)`. These
 * tests walk the real route tree (not a hand-maintained list) so the coverage
 * cannot go stale the way the issue's own line numbers already had.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTenantGate } from '../src/lib/server/tenant-gate';

const ROUTES_DIR = path.join(process.cwd(), 'src', 'routes');

function walkRouteIds(dir: string, prefix = ''): string[] {
	const ids: string[] = [];
	let hasServerFile = false;

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			ids.push(...walkRouteIds(path.join(dir, entry.name), `${prefix}/${entry.name}`));
		} else if (/^\+(page\.server|server)\.ts$/.test(entry.name)) {
			hasServerFile = true;
		}
	}

	if (hasServerFile) ids.push(prefix === '' ? '/' : prefix);
	return ids;
}

const allRouteIds = walkRouteIds(ROUTES_DIR);
const appApiRouteIds = allRouteIds.filter((id) => id.startsWith('/(app)/api/'));
const appNonApiRouteIds = allRouteIds.filter(
	(id) => id.startsWith('/(app)') && !id.startsWith('/(app)/api'),
);
const outsideAppRouteIds = allRouteIds.filter((id) => !id.startsWith('/(app)'));

describe('resolveTenantGate', () => {
	it('allows anything outside the (app) route group', () => {
		expect(resolveTenantGate(null)).toBe('allow');
		expect(resolveTenantGate('/')).toBe('allow');
		expect(resolveTenantGate('/onboarding')).toBe('allow');
		expect(resolveTenantGate('/pending')).toBe('allow');
		expect(resolveTenantGate('/login')).toBe('allow');
		expect(resolveTenantGate('/(admin)/admin')).toBe('allow');
		expect(resolveTenantGate('/api/user/delete')).toBe('allow');
		expect(resolveTenantGate('/api/health')).toBe('allow');
		expect(resolveTenantGate('/api/whatsapp/webhook')).toBe('allow');
	});

	it('denies every real (app)/api/* endpoint with deny-api', () => {
		expect(appApiRouteIds.length).toBeGreaterThanOrEqual(9);
		expect(appApiRouteIds).toEqual(
			expect.arrayContaining([
				'/(app)/api/trend',
				'/(app)/api/notifications',
				'/(app)/api/stock-levels',
				'/(app)/api/unit-conversions',
			]),
		);
		for (const routeId of appApiRouteIds) {
			expect(resolveTenantGate(routeId), routeId).toBe('deny-api');
		}
	});

	it('redirects every other real (app) route (pages and non-api +server.ts) to onboarding', () => {
		expect(appNonApiRouteIds.length).toBeGreaterThan(10);
		expect(appNonApiRouteIds).toEqual(
			expect.arrayContaining([
				'/(app)',
				'/(app)/invoices/export/download',
				'/(app)/invoice/[id]/file',
				'/(app)/reports/[type]/csv',
			]),
		);
		for (const routeId of appNonApiRouteIds) {
			expect(resolveTenantGate(routeId), routeId).toBe('redirect-onboarding');
		}
	});

	it('leaves every route outside (app) untouched', () => {
		expect(outsideAppRouteIds.length).toBeGreaterThan(10);
		for (const routeId of outsideAppRouteIds) {
			expect(resolveTenantGate(routeId), routeId).toBe('allow');
		}
	});
});

describe('the tenant gate is wired into hooks.server.ts', () => {
	const hooks = fs.readFileSync(path.join(process.cwd(), 'src', 'hooks.server.ts'), 'utf8');

	it('imports resolveTenantGate and calls it from event.route.id, not a pathname prefix', () => {
		expect(hooks).toContain("from '$lib/server/tenant-gate'");
		expect(hooks).toContain('resolveTenantGate(');
		expect(hooks).toContain('enforceTenant(event.route.id, event.locals.restaurantId)');
	});

	it('translates deny-api to a 409 JSON response and redirect-onboarding to a 303 to /onboarding', () => {
		expect(hooks).toContain("status: 409");
		expect(hooks).toContain("redirect(303, '/onboarding')");
	});

	it('runs the tenant gate after the pending-approval gate, so an unapproved user is still sent to /pending first', () => {
		const accessGateIndex = hooks.indexOf('enforceAccessDecision(decision)');
		const tenantGateIndex = hooks.indexOf('enforceTenant(event.route.id');
		expect(accessGateIndex).toBeGreaterThan(-1);
		expect(tenantGateIndex).toBeGreaterThan(-1);
		expect(tenantGateIndex).toBeGreaterThan(accessGateIndex);
	});

	it('only runs the tenant gate for authenticated users', () => {
		const userBlockStart = hooks.indexOf('if (user) {\n\t\tconst decision = resolveAccess(');
		const tenantGateIndex = hooks.indexOf('enforceTenant(event.route.id');
		expect(userBlockStart).toBeGreaterThan(-1);
		expect(tenantGateIndex).toBeGreaterThan(userBlockStart);
	});
});
