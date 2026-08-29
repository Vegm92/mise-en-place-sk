import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { buildRecipeSheet } from '$lib/server/recipes-sheet';

export const load: PageServerLoad = async ({ params, locals }) => {
	const rid = locals.restaurantId!;
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'Not found');

	return handleLoad('recipe-cocina', async () => {
		const doc = await buildRecipeSheet(rid, id, new Date());
		if (!doc) error(404, 'Not found');
		return { title: 'rec.cocina.title', doc, recipeId: id };
	});
};
