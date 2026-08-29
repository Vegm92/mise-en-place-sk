import { describe, it, expect } from 'vitest';
import { resolveAccess, isPendingAllowedPath, PENDING_PATH } from '../src/lib/server/access-gate';

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
