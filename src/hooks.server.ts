import * as Sentry from '@sentry/sveltekit';
import { json, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from '$lib/server/auth';
import { cleanupStaleBatches } from '$lib/server/batch';
import { seedAdminUser } from '$lib/server/auth-seed';
import { isAdminUser } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { userRestaurants, users } from '$lib/server/schema';
import { isAccessOpen } from '$lib/server/app-flags';
import { PENDING_PATH, resolveAccess, type AccessDecision } from '$lib/server/access-gate';
import { policyFor, refusalFor, resolveEntitlement } from '$lib/server/entitlements';
import { getEntitlements } from '$lib/server/billing';
import { eq } from 'drizzle-orm';
import { isHttpError } from '@sveltejs/kit';
import { scrubSentryEvent } from '$lib/sentry-scrub';
import { withTimeout } from '$lib/server/with-timeout';
import { applyPrivateCacheHeaders } from '$lib/server/response-cache';
import { assertProductionEnv } from '$lib/server/config';

assertProductionEnv();

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
const MEMBERSHIP_TIMEOUT_MS = parseInt(process.env.MEMBERSHIP_TIMEOUT_MS ?? '5000', 10);
const SENTRY_DSN = process.env.SENTRY_DSN ?? '';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || undefined;
const ADDRESS_HEADER = process.env.ADDRESS_HEADER ?? '';

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	environment: NODE_ENV === 'production' ? 'production' : 'development',
	tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
	sendDefaultPii: false,
	integrations: integrations => integrations.filter(i => i.name !== 'Http'),
	beforeSend(event) {
		if (event.exception?.values?.some(v => v.type === 'Redirect')) return null;
		return scrubSentryEvent(event);
	},
});

export const handleError = Sentry.handleErrorWithSentry(({ error }: { error: unknown }) => {
	if (isHttpError(error) && error.status < 500) return;
	console.error('[server error]', error);
});

function isNetworkUnreachable(e: unknown): boolean {
	const msg = String(e instanceof Error ? ((e as NodeJS.ErrnoException).code ?? (e.cause as Error | undefined)?.message ?? e.message) : e);
	return msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
}

if (NODE_ENV === 'production' && !ADDRESS_HEADER) {
	console.warn(
		'[hooks] ADDRESS_HEADER is not set — getClientAddress() returns the socket peer address. ' +
		'If a reverse proxy terminates TLS, set ADDRESS_HEADER=x-forwarded-for and XFF_DEPTH to the number of trusted proxies, ' +
		'or the IP-keyed rate limits on login/signup/waitlist share a single bucket.',
	);
}

cleanupStaleBatches().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] batch cleanup error:', e); });
seedAdminUser().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] seed error:', e); });

function entitlementsFor(restaurantId: string | null): App.Locals['entitlements'] {
	let cached: ReturnType<App.Locals['entitlements']> | null = null;
	return () => {
		if (!restaurantId) return Promise.resolve(null);
		cached ??= getEntitlements(restaurantId);
		return cached;
	};
}

async function resolveMembership(event: RequestEvent, user: NonNullable<App.Locals['user']>) {
	const activeCookie = event.cookies.get('active_restaurant');

	const [memberships, accessRows, openFlag] = await withTimeout(
		'hooks/memberships',
		MEMBERSHIP_TIMEOUT_MS,
		() => Promise.all([
			db
				.select({ restaurantId: userRestaurants.restaurantId })
				.from(userRestaurants)
				.where(eq(userRestaurants.userId, user.id)),
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
		return [[], [], false] as [Array<{ restaurantId: string }>, Array<{ accessStatus: string }>, boolean];
	});

	const ids = memberships.map(m => m.restaurantId);
	const preferred = activeCookie && ids.includes(activeCookie) ? activeCookie : ids[0];
	const restaurantId = preferred ?? null;

	return {
		userApproved: accessRows[0]?.accessStatus === 'approved',
		accessOpen:   openFlag,
		restaurantId,
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

const appHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (path.startsWith('/_app/') || path === '/favicon.ico' ||
	    path === '/sw.js' || path === '/manifest.webmanifest') {
		return resolve(event);
	}

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

	let userApproved = false;
	let accessOpen   = false;

	if (user) {
		const { userApproved: approved, accessOpen: open, restaurantId } = await resolveMembership(event, user);
		userApproved = approved;
		accessOpen   = open;
		event.locals.restaurantId = restaurantId;
	} else {
		event.locals.restaurantId = null;
	}

	event.locals.accessApproved = isAdminUser(user) || accessOpen || userApproved;
	event.locals.entitlements = entitlementsFor(event.locals.restaurantId);

	if (event.locals.restaurantId) {
		Sentry.getCurrentScope().setTag('restaurantId', event.locals.restaurantId);
	}

	if ((path === '/admin' || path.startsWith('/admin/')) && !isAdminUser(event.locals.user)) {
		redirect(303, '/');
	}

	if (user) {
		const decision = resolveAccess({
			path,
			isAdmin: isAdminUser(user),
			approved: userApproved,
			accessOpen,
		});
		const refused = enforceAccessDecision(decision);
		if (refused) return refused;
	}

	const authResponse = enforceAuth(path, event.locals.user);
	if (authResponse) return authResponse;

	const response = await resolve(event);

	const isFramedByApp = path.startsWith('/api/upload/') || /^\/invoice\/[^/]+\/file$/.test(path);
	response.headers.set('X-Frame-Options', isFramedByApp ? 'SAMEORIGIN' : 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

	if (event.route.id !== null) applyPrivateCacheHeaders(response.headers);

	return response;
};

const entitlementHandle: Handle = async ({ event, resolve }) => {
	const policy = policyFor(event.route.id);
	if (!policy || policy === 'open') return resolve(event);

	const entitlements = await event.locals.entitlements();

	const decision = resolveEntitlement({
		policy,
		features: entitlements?.features ?? null,
		access:   entitlements?.access   ?? null,
	});

	const refusal = refusalFor(decision, event.url.pathname.startsWith('/api/'));
	if (!refusal) return resolve(event);

	if (refusal.transport === 'api') return json(refusal.body, { status: refusal.status });

	redirect(refusal.status, refusal.location);
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
		path === '/api/stripe-webhook'          ||
		path === '/api/whatsapp/webhook'
	);
}
