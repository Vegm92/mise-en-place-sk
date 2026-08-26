import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toCsv } from '$lib/reports';
import { buildRecipeSheet } from '$lib/server/recipes-sheet';
import { trackEvent } from '$lib/server/events';

export const GET: RequestHandler = async ({ params, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');

	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'Not found');

	const doc = await buildRecipeSheet(rid, id, new Date());
	if (!doc) error(404, 'Not found');

	trackEvent('recipe_sheet_exported', rid, { recipeId: id });

	return new Response(toCsv(doc.csv.header, doc.csv.rows), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${doc.csv.filename}"`,
		},
	});
};
