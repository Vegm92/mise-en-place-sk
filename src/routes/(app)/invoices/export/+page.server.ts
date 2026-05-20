import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { suppliers } from '$lib/server/schema';

export const load: PageServerLoad = async () => {
	const supplierList = await db
		.select({ id: suppliers.id, name: suppliers.name })
		.from(suppliers)
		.orderBy(suppliers.name);

	return {
		title: 'Export CSV',
		suppliers: supplierList,
	};
};
