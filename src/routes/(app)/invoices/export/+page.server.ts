import type { PageServerLoad } from './$types';
import { dbClient } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const suppliers = dbClient
		.prepare('SELECT id, name FROM suppliers ORDER BY name')
		.all() as { id: number; name: string }[];

	return {
		title: 'Export CSV',
		suppliers,
	};
};
