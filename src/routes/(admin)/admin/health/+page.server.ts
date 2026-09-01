import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions, PageServerLoad } from './$types';
import { runSystemChecks, stuckBatchItems, tableRowCounts } from '$lib/server/system-health';
import { requeueStalled } from '$lib/server/batch';
import { enqueueExtraction } from '$lib/server/queue';
import { parseForm } from '$lib/server/public-form-action';

export const load: PageServerLoad = async () => {
	const [health, tableCounts, stuckItems] = await Promise.all([
		runSystemChecks(),
		tableRowCounts(),
		stuckBatchItems(),
	]);

	return {
		title: 'admin.systemHealth',
		overallStatus: health.overall,
		checks: health.checks,
		whatsapp: health.whatsapp,
		checkedAt: health.checkedAt,
		tableCounts,
		stuckItems,
	};
};

const RetryForm = v.object({
	id: v.optional(v.pipe(v.string(), v.trim())),
	restaurantId: v.optional(v.pipe(v.string(), v.trim())),
});

export const actions: Actions = {
	retry: async ({ request }) => {
		const formData = await request.formData();
		const parsed = parseForm(RetryForm, formData);
		if (!parsed.success) return fail(400, { error: 'invalidRequest' });
		const id = parsed.output.id ?? '';
		const restaurantId = parsed.output.restaurantId ?? '';
		if (!id || !restaurantId) return fail(400, { error: 'invalidRequest' });

		const requeued = await requeueStalled(id);
		if (!requeued) return fail(409, { error: 'itemNotRequeueable' });

		const enqueued = await enqueueExtraction(id, restaurantId);
		if (!enqueued) return fail(500, { error: 'enqueueFailed' });

		return { success: true };
	},
};
