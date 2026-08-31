import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { runSystemChecks, stuckBatchItems, tableRowCounts } from '$lib/server/system-health';
import { requeueStalled } from '$lib/server/batch';
import { enqueueExtraction } from '$lib/server/queue';

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

export const actions: Actions = {
	retry: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		const restaurantId = formData.get('restaurantId') as string;
		if (!id || !restaurantId) return fail(400, { error: 'invalidRequest' });

		const requeued = await requeueStalled(id);
		if (!requeued) return fail(409, { error: 'itemNotRequeueable' });

		const enqueued = await enqueueExtraction(id, restaurantId);
		if (!enqueued) return fail(500, { error: 'enqueueFailed' });

		return { success: true };
	},
};
