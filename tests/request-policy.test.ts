import { describe, it, expect, vi } from 'vitest';
import { isRedirect, type RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/server/locale', () => ({
	currentLocale: () => ({ locale: 'es', explicit: false }),
	rememberCurrentLocale: () => {},
}));

import {
	createAppHandle,
	applySecurityHeaders,
	REQUEST_POLICY_STEPS,
	type RequestPolicyDeps,
} from '../src/lib/server/request-policy';
import { PRIVATE_CACHE_CONTROL } from '../src/lib/server/response-cache';

type FakeUser = { id: string; email: string; name: string | null; image: string | null };

const APPROVED_USER: FakeUser = { id: 'u1', email: 'u1@example.com', name: null, image: null };

function makeEvent(opts: {
	path: string;
	routeId: string | null;
	user?: FakeUser | null;
}): RequestEvent {
	return {
		url: new URL(`https://app.test${opts.path}`),
		route: { id: opts.routeId },
		cookies: { get: () => undefined },
		request: { headers: new Headers() },
		getClientAddress: () => '203.0.113.1',
		locals: { auth: async () => (opts.user ? { user: opts.user } : null) },
	} as unknown as RequestEvent;
}

function makeDeps(overrides: Partial<RequestPolicyDeps> = {}): Partial<RequestPolicyDeps> {
	return {
		memberLocations: async () => [],
		readAccessStatus: async () => [],
		isAccessOpen: async () => false,
		checkRateLimit: async () => true,
		isBetaFeatureEnabled: async () => true,
		isAdminUser: () => false,
		runAsSystem: async (fn) => fn(),
		runWithTenantContext: async (_rid, fn) => fn(),
		observe: () => {},
		captureException: () => {},
		setSentryUser: () => {},
		setSentryTag: () => {},
		...overrides,
	};
}

async function run(event: RequestEvent, resolve: ReturnType<typeof vi.fn>, deps: Partial<RequestPolicyDeps> = {}) {
	const handle = createAppHandle(makeDeps(deps));
	return Promise.resolve(handle({ event, resolve } as never)).catch((e: unknown) => e);
}

describe('request policy order', () => {
	it('is documented as a named, ordered list', () => {
		expect(REQUEST_POLICY_STEPS).toEqual([
			'resolveRequestId',
			'applyLocale',
			'resolveSession',
			'enforceApiRateLimit',
			'applyLocalsForUser',
			'applySentryContext',
			'enforceAdminRedirect',
			'enforceUserAccess',
			'enforceAuth',
			'enforceFeatureFlag',
			'resolveWithContext',
			'applySecurityHeaders',
		]);
	});
});

describe('public path, unauthenticated', () => {
	it('resolves, stamps the request id, and applies security + private-cache headers', async () => {
		const event = makeEvent({ path: '/login', routeId: '/login' });
		const resolve = vi.fn(async () => new Response('ok'));
		const outcome = await run(event, resolve);

		expect(resolve).toHaveBeenCalled();
		const res = outcome as Response;
		expect(res.headers.get('X-Frame-Options')).toBe('DENY');
		expect(res.headers.get('X-Request-Id')).toBe(event.locals.requestId);
		expect(res.headers.get('Cache-Control')).toBe(PRIVATE_CACHE_CONTROL);
	});
});

describe('authenticated tenant user', () => {
	it('resolves under runWithTenantContext with the member restaurant', async () => {
		const event = makeEvent({ path: '/dashboard', routeId: '/(app)', user: APPROVED_USER });
		const resolve = vi.fn(async () => new Response('ok'));
		const tenantCalls: Array<string | null | undefined> = [];

		const outcome = await run(event, resolve, {
			memberLocations: async () => [{ restaurantId: 'rid-1', billingRestaurantId: 'rid-1', locked: false }],
			readAccessStatus: async () => [{ accessStatus: 'approved' }],
			runWithTenantContext: async (rid, fn) => { tenantCalls.push(rid); return fn(); },
		});

		expect(resolve).toHaveBeenCalled();
		expect(tenantCalls).toEqual(['rid-1']);
		expect((outcome as Response).status).toBe(200);
	});
});

describe('admin path', () => {
	it('redirects a non-admin to /', async () => {
		const event = makeEvent({ path: '/admin', routeId: '/(admin)/admin', user: APPROVED_USER });
		const resolve = vi.fn(async () => new Response('ok'));

		const outcome = await run(event, resolve, { isAdminUser: () => false });

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { status: number }).status).toBe(303);
		expect((outcome as { location: string }).location).toBe('/');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('lets an admin through and resolves under runAsSystem, not runWithTenantContext', async () => {
		const event = makeEvent({ path: '/admin', routeId: '/(admin)/admin', user: APPROVED_USER });
		const resolve = vi.fn(async () => new Response('ok'));
		const systemCalls: number[] = [];
		const tenantCalls: number[] = [];

		const outcome = await run(event, resolve, {
			isAdminUser: () => true,
			runAsSystem: async (fn) => { systemCalls.push(1); return fn(); },
			runWithTenantContext: async (_rid, fn) => { tenantCalls.push(1); return fn(); },
		});

		expect(resolve).toHaveBeenCalled();
		expect(systemCalls.length).toBe(1);
		expect(tenantCalls.length).toBe(0);
		expect((outcome as Response).status).toBe(200);
	});
});

describe('tenantless authenticated user', () => {
	it('redirects a page request to /onboarding', async () => {
		const event = makeEvent({ path: '/dashboard', routeId: '/(app)', user: APPROVED_USER });
		const resolve = vi.fn(async () => new Response('ok'));

		const outcome = await run(event, resolve, { readAccessStatus: async () => [{ accessStatus: 'approved' }] });

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe('/onboarding');
	});

	it('answers 409 for an api request', async () => {
		const event = makeEvent({ path: '/api/trend', routeId: '/(app)/api/trend', user: APPROVED_USER });
		const resolve = vi.fn(async () => new Response('ok'));

		const outcome = await run(event, resolve, { readAccessStatus: async () => [{ accessStatus: 'approved' }] });

		const res = outcome as Response;
		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toEqual({ error: 'No active restaurant' });
	});
});

describe('webhook / system path', () => {
	it('resolves under runAsSystem with no auth redirect for an anonymous request', async () => {
		const event = makeEvent({ path: '/api/stripe-webhook', routeId: '/api/stripe-webhook', user: null });
		const resolve = vi.fn(async () => new Response('ok'));
		const systemCalls: number[] = [];

		const outcome = await run(event, resolve, {
			runAsSystem: async (fn) => { systemCalls.push(1); return fn(); },
		});

		expect(resolve).toHaveBeenCalled();
		expect(systemCalls.length).toBe(1);
		expect((outcome as Response).status).toBe(200);
	});

	it('lets an anonymous Resend POST reach /api/email-ingest/webhook without the 401 wall or the api backstop (#1139)', async () => {
		const event = makeEvent({ path: '/api/email-ingest/webhook', routeId: '/api/email-ingest/webhook', user: null });
		const resolve = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
		const rateLimitKeys: string[] = [];

		const outcome = await run(event, resolve, {
			checkRateLimit: async (key) => { rateLimitKeys.push(key); return false; },
		});

		expect(resolve).toHaveBeenCalled();
		expect(rateLimitKeys).toEqual([]);
		expect((outcome as Response).status).toBe(200);
	});
});

describe('rate-limited api route', () => {
	it('answers 429 with Retry-After and security headers, before resolve runs', async () => {
		const event = makeEvent({ path: '/api/trend', routeId: '/(app)/api/trend', user: null });
		const resolve = vi.fn(async () => new Response('ok'));

		const outcome = await run(event, resolve, { checkRateLimit: async () => false });

		const res = outcome as Response;
		expect(res.status).toBe(429);
		expect(res.headers.get('Retry-After')).toBe('60');
		expect(res.headers.get('X-Frame-Options')).toBe('DENY');
		expect(resolve).not.toHaveBeenCalled();
	});
});

describe('feature-disabled route', () => {
	const tenantDeps: Partial<RequestPolicyDeps> = {
		readAccessStatus: async () => [{ accessStatus: 'approved' }],
		memberLocations: async () => [{ restaurantId: 'rid-1', billingRestaurantId: 'rid-1', locked: false }],
		isBetaFeatureEnabled: async () => false,
	};

	it('redirects a page route to /dashboard', async () => {
		const event = makeEvent({ path: '/recipes', routeId: '/(app)/recipes', user: APPROVED_USER });
		const resolve = vi.fn(async () => new Response('ok'));

		const outcome = await run(event, resolve, tenantDeps);

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe('/dashboard');
	});

	it('answers 404 JSON for an api route', async () => {
		const event = makeEvent({ path: '/api/stock-levels', routeId: '/(app)/api/stock-levels', user: APPROVED_USER });
		const resolve = vi.fn(async () => new Response('ok'));

		const outcome = await run(event, resolve, tenantDeps);

		const res = outcome as Response;
		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: 'feature_disabled' });
	});
});

describe('framed-upload paths', () => {
	it('allows same-origin framing only for upload and invoice-file responses', () => {
		const eventUpload = { route: { id: '/api/upload/[id]' }, locals: { requestId: 'r1' } } as unknown as RequestEvent;
		const resUpload = applySecurityHeaders('/api/upload/abc123', new Response('ok'), eventUpload);
		expect(resUpload.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');

		const eventFile = { route: { id: '/invoice/[id]/file' }, locals: { requestId: 'f1' } } as unknown as RequestEvent;
		const resFile = applySecurityHeaders('/invoice/inv_123/file', new Response('ok'), eventFile);
		expect(resFile.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
	});

	it('denies framing everywhere else', () => {
		const event = { route: { id: '/dashboard' }, locals: { requestId: 'r1' } } as unknown as RequestEvent;
		const res = applySecurityHeaders('/dashboard', new Response('ok'), event);
		expect(res.headers.get('X-Frame-Options')).toBe('DENY');
	});

	it('applies all mandatory non-CSP security headers on every response', () => {
		const event = { route: { id: '/dashboard' }, locals: { requestId: 'req_xyz987' } } as unknown as RequestEvent;
		const res = applySecurityHeaders('/dashboard', new Response('ok'), event);

		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
		expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
		expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
		expect(res.headers.get('X-Request-Id')).toBe('req_xyz987');
	});
});

describe('bypass path', () => {
	it('resolves directly, skipping the policy pipeline and the latency metric', async () => {
		const event = makeEvent({ path: '/_app/immutable/chunk.js', routeId: null });
		const resolve = vi.fn(async () => new Response('static'));
		const observeCalls: unknown[] = [];

		const outcome = await run(event, resolve, { observe: (...args) => { observeCalls.push(args); } });

		expect(resolve).toHaveBeenCalledWith(event);
		const res = outcome as Response;
		expect(res.headers.has('X-Frame-Options')).toBe(false);
		expect(observeCalls.length).toBe(0);
	});
});
