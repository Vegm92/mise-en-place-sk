import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions, PageServerLoad } from './$types';
import { runSystemChecks, stuckBatchItems, tableRowCounts } from '$lib/server/system-health';
import { requeueStalled } from '$lib/server/batch';
import { enqueueExtraction } from '$lib/server/queue';
import { parseForm } from '$lib/server/public-form-action';
import { isAdminUser } from '$lib/server/admin';

const RETRY_ALL_LIMIT = 100;

export const load: PageServerLoad = async () => {
	const [health, tableCounts, stuckItems] = await Promise.all([
		runSystemChecks(),
		tableRowCounts(),
		stuckBatchItems(),
	]);

	return {
		title: 'admin.systemHealth',
		overallStatus: health.overall,
		gates: health.gates,
		checks: health.checks,
		whatsapp: health.whatsapp,
		checkedAt: health.checkedAt,
		worker: health.worker,
		dbRole: health.dbRole,
		migrations: health.migrations,
		queue: health.queue,
		extraction: health.extraction,
		jobs: health.jobs,
		sentry: health.sentry,
		deadLetters: health.deadLetters,
		access: health.access,
		stripeWebhooks: health.stripeWebhooks,
		tableCounts,
		stuckItems,
	};
};

const RetryForm = v.object({
	id: v.optional(v.pipe(v.string(), v.trim())),
	restaurantId: v.optional(v.pipe(v.string(), v.trim())),
});

async function retryItem(id: string, restaurantId: string, requestId?: string): Promise<'ok' | 'notRequeueable' | 'enqueueFailed'> {
	if (!(await requeueStalled(id))) return 'notRequeueable';
	if (!(await enqueueExtraction(id, restaurantId, requestId))) return 'enqueueFailed';
	return 'ok';
}

export const actions: Actions = {
	retry: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });
		const formData = await request.formData();
		const parsed = parseForm(RetryForm, formData);
		if (!parsed.success) return fail(400, { error: 'invalidRequest' });
		const id = parsed.output.id ?? '';
		const restaurantId = parsed.output.restaurantId ?? '';
		if (!id || !restaurantId) return fail(400, { error: 'invalidRequest' });

		const result = await retryItem(id, restaurantId, locals.requestId);
		if (result === 'notRequeueable') return fail(409, { error: 'itemNotRequeueable' });
		if (result === 'enqueueFailed') return fail(500, { error: 'enqueueFailed' });
		return { success: true, retried: 1 };
	},

	retryAll: async ({ locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });
		const items = await stuckBatchItems(RETRY_ALL_LIMIT);
		let retried = 0;
		for (const item of items) {
			if ((await retryItem(item.id, item.restaurantId, locals.requestId)) === 'ok') retried++;
		}
		return { success: true, retried };
	},
};
