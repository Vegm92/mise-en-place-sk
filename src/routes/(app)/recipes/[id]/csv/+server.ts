import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toCsv } from '$lib/reports';
import { buildRecipeSheet } from '$lib/server/recipes-sheet';
import { trackEvent } from '$lib/server/events';
import { contentDispositionHeader } from '$lib/server/content-disposition';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { requirePositiveIntId } from '$lib/server/route-params';

export const GET: RequestHandler = async ({ params, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'recipe-csv-export', max: 10 }, { restaurantId: rid }))) {
		throw error(429, 'Too many requests');
	}

	const id = requirePositiveIntId(params.id, 'recipe');

	const doc = await buildRecipeSheet(rid, id, new Date());
	if (!doc) error(404, 'Not found');

	trackEvent('recipe_sheet_exported', rid, { recipeId: id });

	const body = toCsv(doc.csv.header, doc.csv.rows);
	const headers = new Headers();
	headers.set('Content-Type', 'text/csv; charset=utf-8');
	headers.set('Content-Disposition', contentDispositionHeader('attachment', doc.csv.filename));
	return new Response(body, { headers });
};
