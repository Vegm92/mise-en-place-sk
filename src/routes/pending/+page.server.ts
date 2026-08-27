import { redirect } from '@sveltejs/kit';
import { and, count, eq, lt } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { safe } from '$lib/server/load-guard';
import { BETA_SEATS } from '$lib/constants';

type Queue = {
	position:   number | null;
	total:      number | null;
	seatsTaken: number | null;
	createdAt:  string | null;
};

const EMPTY_QUEUE: Queue = { position: null, total: null, seatsTaken: null, createdAt: null };

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	if (locals.accessApproved) redirect(303, '/');

	const userId = locals.user.id;

	const queue = await safe<Queue>('pending/queue', async () => {
		const [me] = await db
			.select({ createdAt: users.createdAt })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		const [waiting] = await db
			.select({ n: count() })
			.from(users)
			.where(eq(users.accessStatus, 'pending'));

		const [approved] = await db
			.select({ n: count() })
			.from(users)
			.where(eq(users.accessStatus, 'approved'));

		// Postgres stores created_at with microsecond precision, but Drizzle returns a JS
		// Date truncated to milliseconds. Comparing with lte() against the truncated value
		// can miss the user's own row (e.g. .374295 <= .374 is false), undercounting the
		// position by one. Counting strictly-earlier rows and adding one is immune to that
		// truncation.
		const [ahead] = me?.createdAt
			? await db
					.select({ n: count() })
					.from(users)
					.where(and(eq(users.accessStatus, 'pending'), lt(users.createdAt, me.createdAt)))
			: [undefined];

		return {
			position:   ahead ? Number(ahead.n) + 1 : null,
			total:      waiting ? Number(waiting.n) : null,
			seatsTaken: approved ? Number(approved.n) : null,
			createdAt:  me?.createdAt ? me.createdAt.toISOString() : null,
		};
	}, EMPTY_QUEUE);

	return {
		email:         locals.user.email,
		queuePosition: queue.position,
		queueTotal:    queue.total,
		seatsTaken:    queue.seatsTaken,
		seatsTotal:    BETA_SEATS,
		createdAt:     queue.createdAt,
	};
};
