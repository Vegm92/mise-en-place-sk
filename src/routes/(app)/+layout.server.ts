import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rawNotifs = db
		.select()
		.from(systemNotifications)
		.where(eq(systemNotifications.status, 'pending'))
		.orderBy(desc(systemNotifications.createdAt))
		.limit(20)
		.all();

	const notifications = rawNotifs.map((n) => ({
		...n,
		payload: n.payload ? JSON.parse(n.payload) : null,
	}));

	return {
		user: {
			id:    locals.user.id,
			name:  locals.user.name,
			email: locals.user.email,
		},
		notifications,
	};
};
