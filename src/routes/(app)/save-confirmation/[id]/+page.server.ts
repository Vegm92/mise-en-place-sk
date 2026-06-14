import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const invoiceId = parseInt(params.id, 10);
		const rid       = locals.restaurantId!;
		const tdb       = forTenant(rid);

		const rows = await db
			.select()
			.from(systemNotifications)
			.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.invoiceId, invoiceId)));

		const alerts = rows.map((row) => ({
			id: row.id,
			notificationType: row.notificationType,
			message: row.message,
			payload: row.payload ? JSON.parse(row.payload) : null,
		}));

		return { invoiceId, alerts };
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[save-confirmation] load failed', e);
		error(500, 'Failed to load save confirmation');
	}
};
