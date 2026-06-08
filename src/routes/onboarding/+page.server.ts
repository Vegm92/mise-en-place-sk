import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { restaurants, userRestaurants } from '$lib/server/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const preview = url.searchParams.get('preview') === '1';
	if (locals.restaurantId && !preview) redirect(303, '/');
	return { preview };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');

		const data = await request.formData();
		const name = (data.get('name') as string ?? '').trim();

		if (!name) return fail(422, { error: 'El nombre del restaurante es obligatorio.' });
		if (name.length > 80) return fail(422, { error: 'El nombre no puede superar 80 caracteres.' });

		const slug = name
			.toLowerCase()
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 60)
			+ '-' + Math.random().toString(36).slice(2, 7);

		const [restaurant] = await db
			.insert(restaurants)
			.values({ name, slug })
			.returning({ id: restaurants.id });

		await db.insert(userRestaurants).values({
			userId: locals.user.id,
			restaurantId: restaurant.id,
			role: 'owner',
		});

		redirect(303, '/');
	},
};
