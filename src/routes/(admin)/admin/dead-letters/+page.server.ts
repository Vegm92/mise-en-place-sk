import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import {
	DEAD_LETTER_STATUSES,
	countDeadLetters,
	deadLetterQueueBreakdown,
	getDeadLetter,
	listDeadLetters,
	setDeadLetterStatus,
	type DeadLetterStatus,
} from '$lib/server/dead-letter';
import { markQueued } from '$lib/server/batch';
import { EXTRACTION_QUEUE, enqueueExtraction } from '$lib/server/queue';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const pageParam = parseInt(url.searchParams.get('page') ?? '1', 10);
	const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

	const statusParam = url.searchParams.get('status') ?? 'pending';
	const status = (DEAD_LETTER_STATUSES as readonly string[]).includes(statusParam) ? statusParam : '';
	const queue = (url.searchParams.get('queue') ?? '').slice(0, 100);

	return handleLoad('admin/dead-letters', async () => {
		const filter = { status, queue };
		const [total, entries, breakdown, pending] = await Promise.all([
			countDeadLetters(filter),
			listDeadLetters(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
			deadLetterQueueBreakdown(),
			countDeadLetters({ status: 'pending' }),
		]);

		return {
			title: 'Admin · Dead letters',
			entries: entries.map(e => ({
				id: e.id,
				queue: e.queue,
				restaurantName: e.restaurantName,
				sourceId: e.sourceId,
				jobId: e.jobId,
				errorClass: e.errorClass,
				errorMessage: e.errorMessage,
				payload: e.payload,
				attempt: e.attempt,
				occurrences: e.occurrences,
				status: e.status,
				firstSeenAt: new Date(e.firstSeenAt).toISOString(),
				lastSeenAt: new Date(e.lastSeenAt).toISOString(),
				reviewedBy: e.reviewedBy,
				replayable: e.queue === EXTRACTION_QUEUE && !!e.sourceId && !!e.restaurantId,
			})),
			breakdown,
			status,
			queue,
			page,
			total,
			pending,
			totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		};
	});
};

function entryId(formData: FormData): number {
	return parseInt((formData.get('id') as string) ?? '', 10);
}

export const actions: Actions = {
	setStatus: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = entryId(formData);
		const status = formData.get('status') as string;
		if (!Number.isInteger(id) || !(DEAD_LETTER_STATUSES as readonly string[]).includes(status)) {
			return fail(400, { error: 'invalidRequest' });
		}
		const updated = await setDeadLetterStatus(id, status as DeadLetterStatus, locals.user?.email ?? null);
		if (!updated) return fail(404, { error: 'notFound' });
		return { success: true };
	},

	replay: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = entryId(formData);
		if (!Number.isInteger(id)) return fail(400, { error: 'invalidRequest' });

		const entry = await getDeadLetter(id);
		if (!entry) return fail(404, { error: 'notFound' });
		if (entry.queue !== EXTRACTION_QUEUE || !entry.sourceId || !entry.restaurantId) {
			return fail(400, { error: 'notReplayable' });
		}

		const requeued = await markQueued(entry.sourceId);
		if (!requeued) return fail(409, { error: 'itemNotRequeueable' });

		const enqueued = await enqueueExtraction(entry.sourceId, entry.restaurantId);
		if (!enqueued) return fail(500, { error: 'enqueueFailed' });

		await setDeadLetterStatus(id, 'replayed', locals.user?.email ?? null);
		return { success: true };
	},
};
