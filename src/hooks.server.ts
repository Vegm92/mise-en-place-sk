import { redirect, type Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { cleanupStaleSessions } from '$lib/server/sessions';
import { seedAdminUser } from '$lib/server/auth-seed';
import { db } from '$lib/server/db';
import { userRestaurants } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

cleanupStaleSessions();
seedAdminUser().catch(e => console.error('[hooks] seed error:', e));

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (path.startsWith('/_app/') || path === '/favicon.ico') {
		return resolve(event);
	}

	// Attach Supabase server client (handles cookie-based session)
	event.locals.supabase = createSupabaseServerClient(event.cookies);

	// Resolve authenticated user (validates JWT, not just cookie)
	const { data: { user } } = await event.locals.supabase.auth.getUser();
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

	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	return response;
};

function isPublicPath(path: string): boolean {
	return (
		path === '/login'             ||
		path.startsWith('/auth/')     ||
		path.startsWith('/waitlist')  ||
		path.startsWith('/api/tpv/')
	);
}
