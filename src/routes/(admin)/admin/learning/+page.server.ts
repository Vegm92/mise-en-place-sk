import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import {
	correctionsByField,
	correctionsByPromptVersion,
	correctionsBySupplier,
	correctionsByTenant,
	correctionsTrend,
	fuzzyMatchOutcomes,
	learningSummary,
	pendingFuzzyMatches,
	productMatchingStats,
} from '$lib/server/extraction-quality';
import { promptVersionStats, confidenceTrend } from '$lib/server/extraction-corpus';

export interface PromptVersionRow {
	promptVersion: string;
	documents: number;
	avgConfidence: number | null;
	totalMismatches: number;
	lastSeen: string | null;
	invoices: number;
	corrections: number;
	correctionRate: number | null;
}

export const load: PageServerLoad = async () => {
	return handleLoad('admin/learning', async () => {
		const [
			summary, byField, bySupplier, byTenant, trend,
			aliasStats, pendingFuzzy, fuzzyOutcomes,
			corpusStats, corrections, pulse,
		] = await Promise.all([
			learningSummary(),
			correctionsByField(),
			correctionsBySupplier(),
			correctionsByTenant(),
			correctionsTrend(),
			productMatchingStats(),
			pendingFuzzyMatches(),
			fuzzyMatchOutcomes(),
			promptVersionStats(),
			correctionsByPromptVersion(),
			confidenceTrend(),
		]);

		const correctionsByVersion = new Map(corrections.map(c => [c.promptVersion, c]));
		const byPromptVersion: PromptVersionRow[] = corpusStats
			.filter(s => s.runKind === 'live')
			.map(s => {
				const c = correctionsByVersion.get(s.promptVersion);
				return {
					promptVersion: s.promptVersion,
					documents: s.documents,
					avgConfidence: s.avgConfidence,
					totalMismatches: s.totalMismatches,
					lastSeen: s.lastSeen ? s.lastSeen.toISOString() : null,
					invoices: c?.invoices ?? 0,
					corrections: c?.corrections ?? 0,
					correctionRate: c?.correctionRate ?? null,
				};
			});

		return {
			title: 'admin.learning.title',
			summary,
			byField,
			bySupplier,
			byTenant,
			trend,
			aliasStats,
			pendingFuzzy,
			fuzzyOutcomes,
			byPromptVersion,
			pulse,
		};
	});
};
