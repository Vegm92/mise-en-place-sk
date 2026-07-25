import * as Sentry from '@sentry/sveltekit';
import { redirect, type Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { cleanupStaleBatches } from '$lib/server/batch';
import { cleanupProcessedRequests } from '$lib/server/idempotency';
import { seedAdminUser } from '$lib/server/auth-seed';
import { isAdminUser } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { userRestaurants } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { isHttpError } from '@sveltejs/kit';
import { scrubSentryEvent } from '$lib/sentry-scrub';

const SENTRY_DSN = process.env['SENTRY_DSN'] ?? '';

Sentry.init({
	dsn: SENTRY_DSN,
	tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
	sendDefaultPii: false,
	beforeSend(event) {
		// Drop intentional SvelteKit redirects — not errors
		if (event.exception?.values?.some(v => v.type === 'Redirect')) return null;
		// Strip live OAuth codes / tokens / emails from attached request URLs.
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

// adapter-node resolves getClientAddress() from the socket peer unless
// ADDRESS_HEADER names the header the proxy sets. Behind nginx/Caddy that means
// every visitor shares one rate-limit bucket, so the IP-keyed limits on
// login/signup/waitlist collapse into a global one (issue #223).
if (process.env['NODE_ENV'] === 'production' && !process.env['ADDRESS_HEADER']) {
	console.warn(
		'[hooks] ADDRESS_HEADER is not set — getClientAddress() returns the socket peer address. ' +
		'If a reverse proxy terminates TLS, set ADDRESS_HEADER=x-forwarded-for and XFF_DEPTH to the number of trusted proxies, ' +
		'or the IP-keyed rate limits on login/signup/waitlist share a single bucket.',
	);
}

cleanupStaleBatches().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] batch cleanup error:', e); });
cleanupProcessedRequests().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] idempotency cleanup error:', e); });
seedAdminUser().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] seed error:', e); });

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (path.startsWith('/_app/') || path === '/favicon.ico' ||
	    path === '/sw.js' || path === '/manifest.webmanifest') {
		return resolve(event);
	}

	// Attach Supabase server client (handles cookie-based session)
	event.locals.supabase = createSupabaseServerClient(event.cookies);

	// Resolve authenticated user (validates JWT, not just cookie).
	// Wrap in try-catch: Supabase auth-js retries on network failure and each
	// retry attempt surfaces as a TypeError; catching here silences the flood
	// in local dev when the remote Supabase project is unreachable.
	let user: App.Locals['user'] = null;
	try {
		({ data: { user } } = await event.locals.supabase.auth.getUser());
	} catch {
		// Network unreachable — treat as unauthenticated
	}
	event.locals.user = user;

	// Resolve active restaurant for this request
	if (user) {
		const activeCookie = event.cookies.get('active_restaurant');

		const memberships = await db
			.select({ restaurantId: userRestaurants.restaurantId })
			.from(userRestaurants)
			.where(eq(userRestaurants.userId, user.id));

		const ids = memberships.map(m => m.restaurantId);

		if (ids.length > 0) {
			// Use cookie preference if valid, else first restaurant
			event.locals.restaurantId = (activeCookie && ids.includes(activeCookie))
				? activeCookie
				: (ids[0] ?? null);
		} else {
			event.locals.restaurantId = null;
		}
	} else {
		event.locals.restaurantId = null;
	}

	// Request-level admin guard — defence in depth for the (admin) layout load,
	// which does not rerun on every child navigation.
	if ((path === '/admin' || path.startsWith('/admin/')) && !isAdminUser(event.locals.user)) {
		redirect(303, '/');
	}

	// Anonymous hit on the apex goes to the landing page, not the login wall
	// (issue #291). Deep links keep the redirectTo round-trip below.
	if (path === '/' && !event.locals.user) {
		redirect(303, '/waitlist');
	}

	if (!isPublicPath(path) && !event.locals.user) {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		redirect(303, `/login?redirectTo=${encodeURIComponent(path)}`);
	}

	const response = await resolve(event, {
		// Required for Supabase to propagate Set-Cookie headers
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version',
	});

	// Two routes are embedded in a same-origin <iframe> by the app itself —
	// the batch review PDF preview (/api/upload/[id]/[file]) and the saved
	// invoice detail PDF preview (/invoice/[id]/file). DENY would block the
	// browser from rendering the app's own preview on both.
	const isFramedByApp = path.startsWith('/api/upload/') || /^\/invoice\/[^/]+\/file$/.test(path);
	response.headers.set('X-Frame-Options', isFramedByApp ? 'SAMEORIGIN' : 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

	return response;
};

function isPublicPath(path: string): boolean {
	return (
		path === '/login'                       ||
		path === '/signup'                      ||
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
