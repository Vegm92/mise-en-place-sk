import { auth } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	// Skip auth overhead for SvelteKit internals and static assets
	if (path.startsWith('/_app/') || path === '/favicon.ico') {
		return resolve(event);
	}

	const s = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user    = s?.user    ?? null;
	event.locals.session = s?.session ?? null;

	if (!isPublicPath(path) && !event.locals.user) {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		redirect(303, `/login?redirectTo=${encodeURIComponent(path)}`);
	}

	return resolve(event);
};

function isPublicPath(path: string): boolean {
	return (
		path === '/login'                        ||
		path.startsWith('/api/auth/')            ||
		path.startsWith('/waitlist')             ||
		path.startsWith('/pending/')             ||
		path.startsWith('/api/tpv/')             ||
		path.startsWith('/api/inference-status/')
	);
}
