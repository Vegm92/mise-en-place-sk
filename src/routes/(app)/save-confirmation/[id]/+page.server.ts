import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('save-confirmation', async () => {
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
	});
};
