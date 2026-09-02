import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toCsv } from '$lib/reports';
import { buildRecipeSheet } from '$lib/server/recipes-sheet';
import { trackEvent } from '$lib/server/events';
import { contentDispositionHeader } from '$lib/server/content-disposition';

export const GET: RequestHandler = async ({ params, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');

	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'Not found');

	const doc = await buildRecipeSheet(rid, id, new Date());
	if (!doc) error(404, 'Not found');

	trackEvent('recipe_sheet_exported', rid, { recipeId: id });

	const body = toCsv(doc.csv.header, doc.csv.rows);
	const headers = new Headers();
	headers.set('Content-Type', 'text/csv; charset=utf-8');
	headers.set('Content-Disposition', contentDispositionHeader('attachment', doc.csv.filename));
	return new Response(body, { headers });
};
