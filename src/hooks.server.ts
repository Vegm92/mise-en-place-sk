import * as Sentry from '@sentry/sveltekit';
import { json, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from '$lib/server/auth';
import { cleanupStaleBatches } from '$lib/server/batch';
import { seedAdminUser } from '$lib/server/auth-seed';
import { isAdminUser } from '$lib/server/admin';
import { db, runAsSystem, runWithTenantContext } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { isAccessOpen } from '$lib/server/app-flags';
import { PENDING_PATH, resolveAccess, type AccessDecision } from '$lib/server/access-gate';
import { resolveTenantGate } from '$lib/server/tenant-gate';
import { entitlementHandle } from '$lib/server/entitlements';
import { memoizeEntitlements } from '$lib/server/billing';
import { memberLocations, type MemberLocation } from '$lib/server/locations';
import { eq } from 'drizzle-orm';
import { scrubSentryEvent } from '$lib/sentry-scrub';
import { withTimeout } from '$lib/server/with-timeout';
import { applyPrivateCacheHeaders } from '$lib/server/response-cache';
import { assertProductionEnv, addressHeaderWarning, validateAdminSeedConfig } from '$lib/server/config';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { resolveLocale, rememberLocale, LOCALE_COOKIE } from '$lib/server/locale';
import { requestedLocale } from '$lib/locale-url';

assertProductionEnv();
validateAdminSeedConfig();

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
const MEMBERSHIP_TIMEOUT_MS = parseInt(process.env.MEMBERSHIP_TIMEOUT_MS ?? '5000', 10);
const API_GLOBAL_RATE_LIMIT = parseInt(process.env.API_GLOBAL_RATE_LIMIT ?? '300', 10);
const API_RATE_LIMIT_EXEMPT = new Set(['/api/health', '/api/stripe-webhook', '/api/whatsapp/webhook']);
const SYSTEM_CONTEXT_PATHS = new Set(['/api/stripe-webhook', '/api/whatsapp/webhook']);
const SENTRY_DSN = process.env.SENTRY_DSN ?? '';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || undefined;

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	environment: NODE_ENV === 'production' ? 'production' : 'development',
	tracesSampleRate: 1.0,
	sendDefaultPii: false,
	integrations: integrations => integrations.filter(i => i.name !== 'Http'),
	beforeSend(event) {
		if (event.exception?.values?.some(v => v.type === 'Redirect')) return null;
		return scrubSentryEvent(event);
	},
});

export const handleError = Sentry.handleErrorWithSentry(({ error, status }: { error: unknown; status: number }) => {
	if (status < 500) return;
	console.error('[server error]', error);
});

function isNetworkUnreachable(e: unknown): boolean {
	const msg = String(e instanceof Error ? ((e as NodeJS.ErrnoException).code ?? (e.cause as Error | undefined)?.message ?? e.message) : e);
	return msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
}

const addressWarning = addressHeaderWarning();
if (addressWarning) console.warn(addressWarning);

cleanupStaleBatches().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] batch cleanup error:', e); });
seedAdminUser().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] seed error:', e); });

async function resolveMembership(event: RequestEvent, user: NonNullable<App.Locals['user']>) {
	const activeCookie = event.cookies.get('active_restaurant');

	const [locations, accessRows, openFlag] = await withTimeout(
		'hooks/memberships',
		MEMBERSHIP_TIMEOUT_MS,
		() => Promise.all([
			memberLocations(user.id),
			db
				.select({ accessStatus: users.accessStatus })
				.from(users)
				.where(eq(users.id, user.id))
				.limit(1),
			isAccessOpen(),
		]),
	).catch(e => {
		console.error('[hooks] membership lookup failed', e);
		Sentry.captureException(e, { tags: { degraded: 'hooks/memberships' } });
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
	event: RequestEvent,
	path: string,
	user: App.Locals['user']
): Promise<Response | null> {
	if (!(path.startsWith('/api/') && !API_RATE_LIMIT_EXEMPT.has(path) && API_GLOBAL_RATE_LIMIT > 0)) {
		return null;
	}
	const subject = user ? `u:${user.id}` : `ip:${event.getClientAddress()}`;
	if (!(await checkRateLimit(`api-global:${subject}`, API_GLOBAL_RATE_LIMIT))) {
		return json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
	}
	return null;
}

async function applyLocalsForUser(
	event: RequestEvent,
	user: App.Locals['user']
): Promise<{ userApproved: boolean; accessOpen: boolean }> {
	let userApproved = false;
	let accessOpen   = false;

	if (user) {
		const { userApproved: approved, accessOpen: open, restaurantId, lockedRestaurantIds } = await resolveMembership(event, user);
		userApproved = approved;
		accessOpen   = open;
		event.locals.restaurantId = restaurantId;
		event.locals.lockedRestaurantIds = lockedRestaurantIds;
	} else {
		event.locals.restaurantId = null;
		event.locals.lockedRestaurantIds = [];
	}

	event.locals.accessApproved = isAdminUser(user) || accessOpen || userApproved;
	event.locals.entitlements = memoizeEntitlements(event.locals.restaurantId);
	event.locals.recipeGraphCache = null;

	return { userApproved, accessOpen };
}

function applySentryContext(user: App.Locals['user'], restaurantId: string | null): void {
	if (user) {
		Sentry.getCurrentScope().setUser({ id: user.id });
	}

	if (restaurantId) {
		Sentry.getCurrentScope().setTag('restaurantId', restaurantId);
	}
}

function enforceAdminRedirect(path: string, user: App.Locals['user']): void {
	if ((path === '/admin' || path.startsWith('/admin/')) && !isAdminUser(user)) {
		redirect(303, '/');
	}
}

function enforceUserAccess(
	event: RequestEvent,
	path: string,
	user: App.Locals['user'],
	userApproved: boolean,
	accessOpen: boolean
): Response | null {
	if (user) {
		const decision = resolveAccess({
			path,
			isAdmin: isAdminUser(user),
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
	event: RequestEvent,
	path: string,
	resolveEvent: (event: RequestEvent) => Response | Promise<Response>
): Promise<Response> {
	const isAdminPath = path === '/admin' || path.startsWith('/admin/');
	const runResolve = async () => resolveEvent(event);
	return isAdminPath || SYSTEM_CONTEXT_PATHS.has(path)
		? await runAsSystem(runResolve)
		: await runWithTenantContext(event.locals.restaurantId, runResolve);
}

function applySecurityHeaders(path: string, response: Response, event: RequestEvent): Response {
	const isFramedByApp = path.startsWith('/api/upload/') || /^\/invoice\/[^/]+\/file$/.test(path);
	response.headers.set('X-Frame-Options', isFramedByApp ? 'SAMEORIGIN' : 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

	if (event.route.id !== null) applyPrivateCacheHeaders(response.headers);

	return response;
}

function applyLocale(event: RequestEvent): void {
	const { locale } = resolveLocale(event.url, event.cookies.get(LOCALE_COOKIE));
	event.locals.locale = locale;
	if (requestedLocale(event.url)) rememberLocale(event.cookies, locale);
}

const appHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (isBypassPath(path)) {
		return resolve(event);
	}

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

	const rateLimited = await enforceApiRateLimit(event, path, user);
	if (rateLimited) return rateLimited;

	const { userApproved, accessOpen } = await applyLocalsForUser(event, user);

	applySentryContext(user, event.locals.restaurantId);

	enforceAdminRedirect(path, user);

	const accessResponse = enforceUserAccess(event, path, user, userApproved, accessOpen);
	if (accessResponse) return accessResponse;

	const authResponse = enforceAuth(path, event.locals.user);
	if (authResponse) return authResponse;

	const resolveWithLocale = (e: RequestEvent) =>
		resolve(e, { transformPageChunk: ({ html }) => html.replace('%mep.lang%', e.locals.locale) });

	const response = await resolveWithContext(event, path, resolveWithLocale);

	return applySecurityHeaders(path, response, event);
};

export const handle: Handle = sequence(Sentry.sentryHandle(), authHandle, appHandle, entitlementHandle);

function isPublicPath(path: string): boolean {
	return (
		path === '/login'                       ||
		path === '/signup'                      ||
		path === '/forgot-password'             ||
		path === '/reset-password'              ||
		path === '/verify-email'                ||
		path === '/privacy'                     ||
		path === '/terms'                       ||
		path === '/robots.txt'                  ||
		path === '/sitemap.xml'                 ||
		path === '/api/health'                  ||
		path.startsWith('/auth/')               ||
		path.startsWith('/waitlist')            ||
		path.startsWith('/l/')                  ||
		path.startsWith('/s/')                  ||
		path === '/api/stripe-webhook'          ||
		path === '/api/whatsapp/webhook'
	);
}
