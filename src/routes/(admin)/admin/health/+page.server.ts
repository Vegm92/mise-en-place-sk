import type { PageServerLoad } from './$types';
import { runSystemChecks, tableRowCounts } from '$lib/server/system-health';

export const load: PageServerLoad = async () => {
	const [health, tableCounts] = await Promise.all([
		runSystemChecks(),
		tableRowCounts(),
	]);

	return {
		title: 'admin.systemHealth',
		overallStatus: health.overall,
		checks: health.checks,
		whatsapp: health.whatsapp,
		checkedAt: health.checkedAt,
		tableCounts,
	};
};
