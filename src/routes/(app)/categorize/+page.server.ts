import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listUncategorizedLines, setLineCategory } from '$lib/server/category-spend';
import { selectableCategoryNames } from '$lib/server/categories';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	const [lines, categories] = await Promise.all([
		listUncategorizedLines(rid),
		selectableCategoryNames(rid),
	]);
	return {
		title: 'cat.lines.title',
		lines,
		categories: categories.filter((c) => c !== UNCATEGORIZED_CATEGORY),
	};
};

export const actions: Actions = {
	set: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const form = await request.formData();
		const lineId = Number(form.get('lineId'));
		const category = String(form.get('category') ?? '').trim();
		if (!Number.isInteger(lineId) || !category) return fail(400, { error: 'cat.lines.err' });
		if (!(await setLineCategory(rid, lineId, category))) return fail(400, { error: 'cat.lines.err' });
		return { success: true };
	},
};
