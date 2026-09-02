import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { userRestaurants } from '$lib/server/schema';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { exportableEntries } from '$lib/server/tenant-data-map';
import { eq, and, inArray } from 'drizzle-orm';
import { contentDispositionHeader } from '$lib/server/content-disposition';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'user', name: 'account-export', max: 5 }, { userId: user.id }))) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	const memberships = await db
		.select({ restaurantId: userRestaurants.restaurantId, role: userRestaurants.role })
		.from(userRestaurants)
		.where(eq(userRestaurants.userId, user.id));

	const restaurantIds = memberships.map(m => m.restaurantId);
	const entries = exportableEntries();

	const tableRows = restaurantIds.length > 0
		? await Promise.all(entries.map((entry) => {
			const scope = inArray(entry.scopeColumn, restaurantIds);
			const where = entry.exportFilter ? and(scope, entry.exportFilter()) : scope;
			return db.select().from(entry.table).where(where);
		}))
		: entries.map(() => []);

	const tables = Object.fromEntries(entries.map((entry, i) => [entry.exportKey as string, tableRows[i]]));

	const export_data = {
		exported_at: new Date().toISOString(),
		user: {
			id:    user.id,
			email: user.email,
		},
		memberships,
		...tables,
	};

	return new Response(JSON.stringify(export_data, null, 2), {
		headers: {
			'Content-Type':        'application/json',
			'Content-Disposition': contentDispositionHeader('attachment', `mise-en-place-data-${user.id}.json`),
		},
	});
};
