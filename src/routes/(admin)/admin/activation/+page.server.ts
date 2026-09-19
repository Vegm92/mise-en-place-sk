import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { activationMetrics } from '$lib/server/activation-metrics';

export const load: PageServerLoad = async () => {
	return handleLoad('admin/activation', async () => {
		const metrics = await activationMetrics();
		return {
			title: 'admin.activation.title',
			...metrics,
		};
	});
};
