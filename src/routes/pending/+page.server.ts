import { redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { safe } from '$lib/server/load-guard';

type PositionRow = { position: string };

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	if (locals.accessApproved) redirect(303, '/');

	const userId = locals.user.id;

	const queuePosition = await safe<number | null>('pending/position', async () => {
		const rows = await db.execute(sql`
			SELECT COUNT(*) AS position
			FROM ${users}
			WHERE ${users.createdAt} <= (
				SELECT ${users.createdAt} FROM ${users} WHERE ${users.id} = ${userId}
			)
		`) as unknown as PositionRow[];
		const raw = rows[0]?.position;
		return raw ? Number(raw) : null;
	}, null);

	return { email: locals.user.email, queuePosition };
};
