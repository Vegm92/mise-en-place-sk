import * as Sentry from '@sentry/sveltekit';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from '$lib/server/auth';
import { cleanupStaleBatches } from '$lib/server/batch';
import { cleanupProcessedRequests, cleanupProcessedWhatsAppMessages } from '$lib/server/idempotency';
import { seedAdminUser } from '$lib/server/auth-seed';
import { isAdminUser } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { userRestaurants } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { isHttpError } from '@sveltejs/kit';
import { scrubSentryEvent } from '$lib/sentry-scrub';

const SENTRY_DSN = process.env['SENTRY_DSN'] ?? '';
const SENTRY_RELEASE = process.env['SENTRY_RELEASE'] || undefined;

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
	sendDefaultPii: false,
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

if (process.env['NODE_ENV'] === 'production' && !process.env['ADDRESS_HEADER']) {
	console.warn(
		'[hooks] ADDRESS_HEADER is not set — getClientAddress() returns the socket peer address. ' +
		'If a reverse proxy terminates TLS, set ADDRESS_HEADER=x-forwarded-for and XFF_DEPTH to the number of trusted proxies, ' +
		'or the IP-keyed rate limits on login/signup/waitlist share a single bucket.',
	);
}

cleanupStaleBatches().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] batch cleanup error:', e); });
cleanupProcessedRequests().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] idempotency cleanup error:', e); });
cleanupProcessedWhatsAppMessages().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] whatsapp dedup cleanup error:', e); });
seedAdminUser().catch(e => { if (!isNetworkUnreachable(e)) console.error('[hooks] seed error:', e); });

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

	if (user) {
		const activeCookie = event.cookies.get('active_restaurant');

		const memberships = await db
			.select({ restaurantId: userRestaurants.restaurantId })
			.from(userRestaurants)
			.where(eq(userRestaurants.userId, user.id));

		const ids = memberships.map(m => m.restaurantId);

		if (ids.length > 0) {
			event.locals.restaurantId = (activeCookie && ids.includes(activeCookie))
				? activeCookie
				: (ids[0] ?? null);
		} else {
			event.locals.restaurantId = null;
		}
	} else {
		event.locals.restaurantId = null;
	}

	if (event.locals.restaurantId) {
		Sentry.getCurrentScope().setTag('restaurantId', event.locals.restaurantId);
	}

	if ((path === '/admin' || path.startsWith('/admin/')) && !isAdminUser(event.locals.user)) {
		redirect(303, '/');
	}

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

	const response = await resolve(event);

	const isFramedByApp = path.startsWith('/api/upload/') || /^\/invoice\/[^/]+\/file$/.test(path);
	response.headers.set('X-Frame-Options', isFramedByApp ? 'SAMEORIGIN' : 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

	return response;
};

export const handle: Handle = sequence(Sentry.sentryHandle(), authHandle, appHandle);

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
