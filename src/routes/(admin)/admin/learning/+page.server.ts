import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import {
	correctionsByField,
	correctionsBySupplier,
	correctionsByTenant,
	correctionsTrend,
	learningSummary,
	pendingFuzzyMatches,
	productMatchingStats,
} from '$lib/server/extraction-quality';

export const load: PageServerLoad = async () => {
	return handleLoad('admin/learning', async () => {
		const [summary, byField, bySupplier, byTenant, trend, aliasStats, pendingFuzzy] = await Promise.all([
			learningSummary(),
			correctionsByField(),
			correctionsBySupplier(),
			correctionsByTenant(),
			correctionsTrend(),
			productMatchingStats(),
			pendingFuzzyMatches(),
		]);

		return {
			title: 'admin.learning.title',
			summary,
			byField,
			bySupplier,
			byTenant,
			trend,
			aliasStats,
			pendingFuzzy,
		};
	});
};
