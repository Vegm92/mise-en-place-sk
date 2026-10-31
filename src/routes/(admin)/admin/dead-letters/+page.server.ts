import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { isAdminUser } from '$lib/server/admin';
import { parseForm } from '$lib/server/public-form-action';
import {
	deadLetterQueueBreakdown,
	discardDeadLetter,
	listDeadLetters,
	retryDeadLetter,
	type DeadLetterActionResult,
} from '$lib/server/dead-letter';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const pageParam = parseInt(url.searchParams.get('page') ?? '1', 10);
	const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
	const queue = (url.searchParams.get('queue') ?? '').slice(0, 100);

	return handleLoad('admin/dead-letters', async () => {
		const [entries, breakdown] = await Promise.all([
			listDeadLetters(queue, PAGE_SIZE, (page - 1) * PAGE_SIZE),
			deadLetterQueueBreakdown(),
		]);
		const pending = breakdown.reduce((n, q) => n + q.failed, 0);
		const total = queue ? (breakdown.find((q) => q.queue === queue)?.failed ?? 0) : pending;

		return {
			title: 'admin.dlq.title',
			entries: entries.map((e) => ({
				...e,
				createdOn: e.createdOn.toISOString(),
				failedOn: e.failedOn.toISOString(),
			})),
			breakdown,
			queue,
			page,
			total,
			pending,
			totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		};
	});
};

const DeadLetterActionForm = v.object({
	queue: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	id: v.pipe(v.string(), v.trim(), v.uuid()),
});

async function act(
	request: Request,
	locals: App.Locals,
	run: (queue: string, id: string) => Promise<DeadLetterActionResult>,
) {
	if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });
	const parsed = parseForm(DeadLetterActionForm, await request.formData());
	if (!parsed.success) return fail(400, { error: 'invalidRequest' });
	const outcome = await run(parsed.output.queue, parsed.output.id);
	if (!outcome.ok) return fail(outcome.error === 'notFound' ? 404 : 409, { error: outcome.error });
	return { success: true };
}

export const actions: Actions = {
	retry: async ({ request, locals }) => act(request, locals, retryDeadLetter),
	discard: async ({ request, locals }) => act(request, locals, discardDeadLetter),
};
