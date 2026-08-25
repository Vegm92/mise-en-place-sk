/**
 * Fail-closed guards for the entitlement route policy.
 *
 * ROUTE_POLICY is declared `satisfies Record<RouteId, RoutePolicy>`, so adding a
 * route without classifying it is already a type error in `pnpm check`. These
 * tests cover what the type cannot:
 *
 *   1. the generated RouteId union going stale, by walking src/routes directly;
 *   2. the hook being dropped from the handle sequence, which would leave every
 *      policy correct and unenforced;
 *   3. a gated page route redirecting to a slug that has no message in one of
 *      the two locales.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROUTE_POLICY, UPGRADE_SLUG, type RoutePolicy } from '../src/lib/server/entitlements';
import { translations } from '../src/lib/i18n';

const ROUTES_DIR = path.join(process.cwd(), 'src', 'routes');

const SERVER_FILES = /^\+(page\.server|server)\.ts$/;

function walkRouteIds(dir: string, prefix = ''): string[] {
	const ids: string[] = [];
	let hasServerFile = false;

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			ids.push(...walkRouteIds(path.join(dir, entry.name), `${prefix}/${entry.name}`));
		} else if (SERVER_FILES.test(entry.name)) {
			hasServerFile = true;
		}
	}

	if (hasServerFile) ids.push(prefix === '' ? '/' : prefix);
	return ids;
}

const routeIds = walkRouteIds(ROUTES_DIR).sort();

describe('every server route declares an entitlement policy', () => {
	it('finds the routes to check', () => {
		expect(routeIds.length).toBeGreaterThan(20);
		expect(routeIds).toContain('/(app)/api/stock-levels');
	});

	it.each(routeIds)('%s is classified', (routeId) => {
		const policy = (ROUTE_POLICY as Record<string, RoutePolicy | undefined>)[routeId];

		expect(
			policy,
			`${routeId} has no ROUTE_POLICY entry — classify it as 'open' or give it a feature/access policy`,
		).toBeDefined();
	});
});

describe('the gate is wired into the handle sequence', () => {
	const hooks = fs.readFileSync(path.join(process.cwd(), 'src', 'hooks.server.ts'), 'utf8');

	it('registers entitlementHandle', () => {
		const handleLine = hooks.split('\n').find((line) => /^export const handle\b\s*:/.test(line));

		expect(handleLine, 'no `export const handle:` found in hooks.server.ts').toBeDefined();
		expect(handleLine).toContain('sequence(');
		expect(handleLine).toContain('entitlementHandle');
	});

	it('reads the policy from event.route.id rather than a pathname prefix', () => {
		const gate = fs.readFileSync(
			path.join(process.cwd(), 'src', 'lib', 'server', 'entitlements.ts'),
			'utf8'
		);

		expect(gate).toContain('policyFor(event.route.id)');
	});
});

describe('every page-route upgrade slug has copy in both locales', () => {
	const pageSlugs = Object.entries(ROUTE_POLICY)
		.filter(([routeId, policy]) => policy !== 'open' && !routeId.includes('/api/'))
		.flatMap(([, policy]) => {
			const p = policy as Exclude<RoutePolicy, 'open'>;
			const slugs: string[] = [];
			if (p.feature) slugs.push(UPGRADE_SLUG[p.feature]);
			if (p.access) slugs.push('trial', 'inactive');
			return slugs;
		});

	it('has at least one gated page route to check', () => {
		expect(pageSlugs.length).toBeGreaterThan(0);
	});

	it.each([...new Set(pageSlugs)])('billing.upgrade.%s exists in es and en', (slug) => {
		const key = `billing.upgrade.${slug}`;
		const es = translations.es as Record<string, string>;
		const en = translations.en as Record<string, string>;

		expect(es[key], `${key} missing from es`).toBeTruthy();
		expect(en[key], `${key} missing from en`).toBeTruthy();
	});
});
