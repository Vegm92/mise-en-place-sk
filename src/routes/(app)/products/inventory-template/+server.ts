import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireFeature } from '$lib/server/billing';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { listCatalogForExport } from '$lib/server/products';
import { buildInventoryWorkbook } from '$lib/server/inventory-template';
import { selectableCategoryNames } from '$lib/server/categories';
import { currentLocale } from '$lib/server/locale';
import { contentDispositionHeader } from '$lib/server/content-disposition';

export const GET: RequestHandler = async ({ locals }) => {
	const rid = locals.restaurantId!;

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'inventory-template', max: 10 }, { restaurantId: rid }))) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	await requireFeature('inventoryTemplate', locals);

	const [rows, categoryOrder] = await Promise.all([
		listCatalogForExport(db, rid),
		selectableCategoryNames(rid),
	]);
	const { locale } = currentLocale();
	const workbook = buildInventoryWorkbook(rows, locale, categoryOrder);
	const buffer = await workbook.xlsx.writeBuffer();

	const filename = `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`;

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': contentDispositionHeader('attachment', filename),
		},
	});
};
