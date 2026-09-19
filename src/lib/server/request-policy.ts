import * as Sentry from '@sentry/sveltekit';
import { json, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { isAdminUser } from '$lib/server/admin';
import { db, runAsSystem, runWithTenantContext } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { isAccessOpen } from '$lib/server/app-flags';
import { isBetaFeatureEnabled, type BetaFeatureKey } from '$lib/server/feature-flags';
import { PENDING_PATH, isAlwaysReadablePath, resolveAccess, type AccessDecision } from '$lib/server/access-gate';
import { resolveTenantGate } from '$lib/server/tenant-gate';
import { memoizeEntitlements } from '$lib/server/billing';
import { memberLocations, type MemberLocation } from '$lib/server/locations';
import { eq } from 'drizzle-orm';
import { withTimeout } from '$lib/server/with-timeout';
import { applyPrivateCacheHeaders } from '$lib/server/response-cache';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { currentLocale, rememberCurrentLocale } from '$lib/server/locale';
import { requestedLocale } from '$lib/locale-url';
import { resolveRequestId } from '$lib/server/request-id';
import { createLogger } from '$lib/server/log';
import { METRIC_ROUTE_LATENCY, observe } from '$lib/server/metrics';

const log = createLogger('hooks');

const MEMBERSHIP_TIMEOUT_MS = parseInt(process.env.MEMBERSHIP_TIMEOUT_MS ?? '5000', 10);
const API_GLOBAL_RATE_LIMIT = parseInt(process.env.API_GLOBAL_RATE_LIMIT ?? '300', 10);
const API_RATE_LIMIT_EXEMPT = new Set(['/api/health', '/api/stripe-webhook', '/api/whatsapp/webhook', '/api/email-ingest/webhook']);
const SYSTEM_CONTEXT_PATHS = new Set(['/api/stripe-webhook', '/api/whatsapp/webhook']);

export const REQUEST_POLICY_STEPS = [
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
] as const;

export interface RequestPolicyDeps {
	memberLocations: (userId: string) => Promise<MemberLocation[]>;
	readAccessStatus: (userId: string) => Promise<Array<{ accessStatus: string }>>;
	isAccessOpen: () => Promise<boolean>;
	checkRateLimit: (key: string, max: number) => Promise<boolean>;
	isBetaFeatureEnabled: (key: BetaFeatureKey) => Promise<boolean>;
	isAdminUser: (user: App.Locals['user']) => boolean;
	runAsSystem: <T>(fn: () => Promise<T>) => Promise<T>;
	runWithTenantContext: <T>(restaurantId: string | null | undefined, fn: () => Promise<T>) => Promise<T>;
	observe: (name: string, value: number, label?: string | null) => void;
	captureException: (e: unknown, opts?: { tags?: Record<string, string> }) => void;
	setSentryUser: (id: string) => void;
	setSentryTag: (key: string, value: string) => void;
}

const defaultDeps: RequestPolicyDeps = {
	memberLocations,
	readAccessStatus: (userId) =>
		db.select({ accessStatus: users.accessStatus }).from(users).where(eq(users.id, userId)).limit(1),
	isAccessOpen,
	checkRateLimit,
	isBetaFeatureEnabled,
	isAdminUser,
	runAsSystem,
	runWithTenantContext,
	observe,
	captureException: (e, opts) => Sentry.captureException(e, opts),
	setSentryUser: (id) => Sentry.getCurrentScope().setUser({ id }),
	setSentryTag: (key, value) => Sentry.getCurrentScope().setTag(key, value),
};

async function resolveMembership(deps: RequestPolicyDeps, event: RequestEvent, user: NonNullable<App.Locals['user']>) {
	const activeCookie = event.cookies.get('active_restaurant');

	const [locations, accessRows, openFlag] = await withTimeout(
		'hooks/memberships',
		MEMBERSHIP_TIMEOUT_MS,
		() => Promise.all([
			deps.memberLocations(user.id),
			deps.readAccessStatus(user.id),
			deps.isAccessOpen(),
		]),
	).catch(e => {
		log.error('membership lookup failed', { requestId: event.locals.requestId, err: e });
		deps.captureException(e, { tags: { degraded: 'hooks/memberships' } });
		return [[], [], false] as [MemberLocation[], Array<{ accessStatus: string }>, boolean];
	});

	const ids = locations.filter(l => !l.locked).map(l => l.restaurantId);
	const preferred = activeCookie && ids.includes(activeCookie) ? activeCookie : ids[0];
	const restaurantId = preferred ?? null;

	return {
		userApproved: accessRows[0]?.accessStatus === 'approved',
		accessOpen:   openFlag,
		restaurantId,
		lockedRestaurantIds: locations.filter(l => l.locked).map(l => l.restaurantId),
	};
}

function enforceAccessDecision(decision: AccessDecision) {
	if (decision === 'deny-api') {
		return new Response(JSON.stringify({ error: 'Access not yet approved' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	if (decision === 'redirect-pending') {
		redirect(303, PENDING_PATH);
	}
	return null;
}

function enforceTenant(routeId: string | null, restaurantId: string | null) {
	if (restaurantId) return null;
	const decision = resolveTenantGate(routeId);
	if (decision === 'deny-api') {
		return json({ error: 'No active restaurant' }, { status: 409 });
	}
	if (decision === 'redirect-onboarding') {
		redirect(303, '/onboarding');
	}
	return null;
}

function enforceAuth(path: string, user: App.Locals['user']) {
	if (path === '/' && !user) {
		redirect(303, '/waitlist');
	}
	if (isPublicPath(path) || user) return;
	if (path.startsWith('/api/')) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	redirect(303, `/login?redirectTo=${encodeURIComponent(path)}`);
}

function isBypassPath(path: string): boolean {
	return path.startsWith('/_app/') || path === '/favicon.ico' ||
		path === '/sw.js' || path === '/manifest.webmanifest';
}

async function enforceApiRateLimit(
	deps: RequestPolicyDeps,
	event: RequestEvent,
	path: string,
	user: App.Locals['user']
): Promise<Response | null> {
	if (!(path.startsWith('/api/') && !API_RATE_LIMIT_EXEMPT.has(path) && API_GLOBAL_RATE_LIMIT > 0)) {
		return null;
	}
	const subject = user ? `u:${user.id}` : `ip:${event.getClientAddress()}`;
	if (!(await deps.checkRateLimit(`api-global:${subject}`, API_GLOBAL_RATE_LIMIT))) {
		return json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
	}
	return null;
}

async function applyLocalsForUser(
	deps: RequestPolicyDeps,
	event: RequestEvent,
	user: App.Locals['user']
): Promise<{ userApproved: boolean; accessOpen: boolean }> {
	let userApproved = false;
	let accessOpen   = false;

	if (user) {
		const { userApproved: approved, accessOpen: open, restaurantId, lockedRestaurantIds } = await resolveMembership(deps, event, user);
		userApproved = approved;
		accessOpen   = open;
		event.locals.restaurantId = restaurantId;
		event.locals.lockedRestaurantIds = lockedRestaurantIds;
	} else {
		event.locals.restaurantId = null;
		event.locals.lockedRestaurantIds = [];
	}

	event.locals.accessApproved = deps.isAdminUser(user) || accessOpen || userApproved;
	event.locals.entitlements = memoizeEntitlements(event.locals.restaurantId);
	event.locals.recipeGraphCache = null;

	return { userApproved, accessOpen };
}

function applySentryContext(deps: RequestPolicyDeps, user: App.Locals['user'], restaurantId: string | null, requestId: string): void {
	if (user) {
		deps.setSentryUser(user.id);
	}

	deps.setSentryTag('requestId', requestId);

	if (restaurantId) {
		deps.setSentryTag('restaurantId', restaurantId);
	}
}

function enforceAdminRedirect(deps: RequestPolicyDeps, path: string, user: App.Locals['user']): void {
	if ((path === '/admin' || path.startsWith('/admin/')) && !deps.isAdminUser(user)) {
		redirect(303, '/');
	}
}

const BETA_FEATURE_ROUTES: { prefix: string; flag: BetaFeatureKey }[] = [
	{ prefix: '/recipes', flag: 'recipes' },
	{ prefix: '/budgets', flag: 'budgets' },
	{ prefix: '/api/stock-levels', flag: 'stock' },
];

async function enforceFeatureFlag(deps: RequestPolicyDeps, path: string): Promise<Response | null> {
	const match = BETA_FEATURE_ROUTES.find(r => path === r.prefix || path.startsWith(`${r.prefix}/`));
	if (!match || (await deps.isBetaFeatureEnabled(match.flag))) return null;

	if (path.startsWith('/api/')) {
		return json({ error: 'feature_disabled' }, { status: 404 });
	}
	redirect(303, '/dashboard');
	return null;
}

function enforceUserAccess(
	deps: RequestPolicyDeps,
	event: RequestEvent,
	path: string,
	user: App.Locals['user'],
	userApproved: boolean,
	accessOpen: boolean
): Response | null {
	if (user) {
		const decision = resolveAccess({
			path,
			isAdmin: deps.isAdminUser(user),
			approved: userApproved,
			accessOpen,
		});
		const refused = enforceAccessDecision(decision);
		if (refused) return refused;

		return enforceTenant(event.route.id, event.locals.restaurantId);
	}
	return null;
}

async function resolveWithContext(
	deps: RequestPolicyDeps,
	event: RequestEvent,
	path: string,
	resolveEvent: (event: RequestEvent) => Response | Promise<Response>
): Promise<Response> {
	const isAdminPath = path === '/admin' || path.startsWith('/admin/');
	const runResolve = async () => resolveEvent(event);
	return isAdminPath || SYSTEM_CONTEXT_PATHS.has(path)
		? await deps.runAsSystem(runResolve)
		: await deps.runWithTenantContext(event.locals.restaurantId, runResolve);
}

export function applySecurityHeaders(path: string, response: Response, event: RequestEvent): Response {
	const isFramedByApp = path.startsWith('/api/upload/') || /^\/invoice\/[^/]+\/file$/.test(path);
	response.headers.set('X-Frame-Options', isFramedByApp ? 'SAMEORIGIN' : 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.sentry.io; object-src 'none'; base-uri 'self'; frame-ancestors 'self';");
	response.headers.set('X-Request-Id', event.locals.requestId);

	if (event.route.id !== null) applyPrivateCacheHeaders(response.headers);

	return response;
}

function applyLocale(event: RequestEvent): void {
	const { locale } = currentLocale();
	event.locals.locale = locale;
	if (requestedLocale(event.url)) rememberCurrentLocale(locale);
}

function isPublicPath(path: string): boolean {
	return (
		path === '/login'                       ||
		path === '/signup'                      ||
		path === '/forgot-password'             ||
		path === '/reset-password'              ||
		path === '/verify-email'                ||
		path === '/api/stripe-webhook'          ||
		path === '/api/whatsapp/webhook'        ||
		path === '/api/email-ingest/webhook'    ||
		isAlwaysReadablePath(path)
	);
}

export function createAppHandle(overrides: Partial<RequestPolicyDeps> = {}): Handle {
	const deps: RequestPolicyDeps = { ...defaultDeps, ...overrides };

	const routeApp: Handle = async ({ event, resolve }) => {
		const path = event.url.pathname;

		event.locals.requestId = resolveRequestId(event);

		applyLocale(event);

		const session = await event.locals.auth();
		const user: App.Locals['user'] = session?.user?.id
			? {
				id:    session.user.id,
				email: session.user.email ?? '',
				name:  session.user.name ?? null,
				image: session.user.image ?? null,
			}
			: null;
		event.locals.user = user;

		const rateLimited = await enforceApiRateLimit(deps, event, path, user);
		if (rateLimited) return applySecurityHeaders(path, rateLimited, event);

		const { userApproved, accessOpen } = await applyLocalsForUser(deps, event, user);

		applySentryContext(deps, user, event.locals.restaurantId, event.locals.requestId);

		enforceAdminRedirect(deps, path, user);

		const accessResponse = enforceUserAccess(deps, event, path, user, userApproved, accessOpen);
		if (accessResponse) return applySecurityHeaders(path, accessResponse, event);

		const authResponse = enforceAuth(path, event.locals.user);
		if (authResponse) return applySecurityHeaders(path, authResponse, event);

		const flagResponse = await enforceFeatureFlag(deps, path);
		if (flagResponse) return applySecurityHeaders(path, flagResponse, event);

		const resolveWithLocale = (e: RequestEvent) =>
			resolve(e, { transformPageChunk: ({ html }) => html.replace('%mep.lang%', e.locals.locale) });

		const response = await resolveWithContext(deps, event, path, resolveWithLocale);

		return applySecurityHeaders(path, response, event);
	};

	const appHandle: Handle = async (input) => {
		const { event, resolve } = input;
		if (isBypassPath(event.url.pathname)) return resolve(event);

		const startedAt = Date.now();
		try {
			return await routeApp(input);
		} finally {
			deps.observe(METRIC_ROUTE_LATENCY, Date.now() - startedAt, event.route.id ?? '(unmatched)');
		}
	};

	return appHandle;
}
