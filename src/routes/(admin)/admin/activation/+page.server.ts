import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { activationReport } from '$lib/server/activation-metrics';

export const load: PageServerLoad = async () => {
	return handleLoad('admin/activation', async () => {
		const report = await activationReport();
		return {
			title: 'admin.activation.title',
			...report,
		};
	});
};
