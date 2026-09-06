import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveAccess, isPendingAllowedPath, isAlwaysReadablePath, PENDING_PATH } from '../src/lib/server/access-gate';

const ROOT = path.resolve(__dirname, '..');

const pending = { isAdmin: false, approved: false, accessOpen: false };

describe('isPendingAllowedPath', () => {
	it('allows the waiting room, logout and the legal pages', () => {
		expect(isPendingAllowedPath(PENDING_PATH)).toBe(true);
		expect(isPendingAllowedPath('/logout')).toBe(true);
		expect(isPendingAllowedPath('/privacy')).toBe(true);
		expect(isPendingAllowedPath('/terms')).toBe(true);
		expect(isPendingAllowedPath('/api/health')).toBe(true);
		expect(isPendingAllowedPath('/auth/callback/google')).toBe(true);
		expect(isPendingAllowedPath('/waitlist')).toBe(true);
	});

	it('allows the public digest/alert share view (issue #329)', () => {
		expect(isPendingAllowedPath('/s/abc123')).toBe(true);
		expect(isPendingAllowedPath('/s/abc123/og.png')).toBe(true);
	});

	it('rejects the app itself', () => {
		expect(isPendingAllowedPath('/')).toBe(false);
		expect(isPendingAllowedPath('/dashboard')).toBe(false);
		expect(isPendingAllowedPath('/onboarding')).toBe(false);
		expect(isPendingAllowedPath('/api/chat')).toBe(false);
	});
});

describe('resolveAccess', () => {
	it('sends an unapproved user to the waiting room', () => {
		expect(resolveAccess({ ...pending, path: '/' })).toBe('redirect-pending');
		expect(resolveAccess({ ...pending, path: '/dashboard' })).toBe('redirect-pending');
		expect(resolveAccess({ ...pending, path: '/onboarding' })).toBe('redirect-pending');
	});

	it('answers 403 rather than redirecting on api routes', () => {
		expect(resolveAccess({ ...pending, path: '/api/chat' })).toBe('deny-api');
		expect(resolveAccess({ ...pending, path: '/api/trend' })).toBe('deny-api');
	});

	it('lets an unapproved user reach the waiting room and log out', () => {
		expect(resolveAccess({ ...pending, path: PENDING_PATH })).toBe('allow');
		expect(resolveAccess({ ...pending, path: '/logout' })).toBe('allow');
		expect(resolveAccess({ ...pending, path: '/api/health' })).toBe('allow');
	});

	it('never blocks an admin', () => {
		expect(resolveAccess({ ...pending, isAdmin: true, path: '/dashboard' })).toBe('allow');
		expect(resolveAccess({ ...pending, isAdmin: true, path: '/api/chat' })).toBe('allow');
		expect(resolveAccess({ ...pending, isAdmin: true, path: '/admin' })).toBe('allow');
	});

	it('never blocks an approved user', () => {
		expect(resolveAccess({ ...pending, approved: true, path: '/dashboard' })).toBe('allow');
		expect(resolveAccess({ ...pending, approved: true, path: '/api/chat' })).toBe('allow');
	});

	it('lets everyone through once access is open', () => {
		expect(resolveAccess({ ...pending, accessOpen: true, path: '/dashboard' })).toBe('allow');
		expect(resolveAccess({ ...pending, accessOpen: true, path: '/api/chat' })).toBe('allow');
	});
});

/**
 * isAlwaysReadablePath is the single list of paths any visitor may reach
 * whatever their session or plan says: the marketing surface, the legal
 * pages that must be readable without an account, and the machine
 * endpoints. Both gates that need it — isPendingAllowedPath here and
 * hooks.server.ts's isPublicPath — build on it instead of each keeping a
 * copy.
 *
 * They kept copies until the flight-test QA pass, and the copies drifted:
 * /cookies, /refunds and /legal were added to the route policy but to
 * neither allowlist, so three pages the law requires be readable without an
 * account redirected to /login. This block pins the shared list, and pins
 * that hooks.server.ts reads it rather than restating it.
 */
describe('isAlwaysReadablePath — the one list both gates share', () => {
	const ALWAYS_READABLE = [
		'/privacy', '/terms', '/cookies', '/refunds', '/legal', '/cookie-consent',
		'/robots.txt', '/sitemap.xml', '/api/health',
		'/auth/callback/google', '/waitlist', '/l/menu-del-dia', '/s/abc123',
	];

	for (const path of ALWAYS_READABLE) {
		it(`${path} is readable with no session, and by a pending account`, () => {
			expect(isAlwaysReadablePath(path)).toBe(true);
			expect(isPendingAllowedPath(path)).toBe(true);
		});
	}

	it('does not swallow the authenticated app', () => {
		for (const path of ['/', '/dashboard', '/settings', '/api/chat', '/admin']) {
			expect(isAlwaysReadablePath(path)).toBe(false);
		}
	});

	it('hooks.server.ts delegates to it instead of restating the list', () => {
		const hooks = readFileSync(path.join(ROOT, 'src/hooks.server.ts'), 'utf8');
		const fn = hooks.slice(hooks.indexOf('function isPublicPath'));
		const body = fn.slice(0, fn.indexOf('}'));
		expect(body).toContain('isAlwaysReadablePath(path)');
		for (const p of ['/privacy', '/terms', '/cookies', '/refunds', '/legal']) {
			expect(body, `${p} restated in hooks.server.ts`).not.toContain(`'${p}'`);
		}
	});
});
