import type { PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { suppliers } from '$lib/server/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const tdb = forTenant(locals.restaurantId!);
	const supplierList = await db
		.select({ id: suppliers.id, name: suppliers.name })
		.from(suppliers)
		.where(tdb.scope(suppliers.restaurantId))
		.orderBy(suppliers.name);

	return {
		title: 'export.title',
		suppliers: supplierList,
	};
};
