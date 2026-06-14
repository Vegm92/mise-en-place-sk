/**
 * Per-tenant LLM cost quota enforcement and usage logging.
 *
 * quota rows are optional — if no row exists for a tenant the tenant is
 * treated as unlimited. Checks are advisory (best-effort) and never block
 * the extraction path on DB errors.
 */
import { and, gte, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { llmUsageLog, tenantLlmQuotas } from './schema';
import { estimateCostUsd, type LLMUsage } from './llm-provider';

export type QuotaResult =
	| { allowed: true }
	| { allowed: false; reason: 'monthly_extraction_limit' | 'monthly_cost_limit'; limit: number; used: number };

export async function checkExtractionQuota(restaurantId: string): Promise<QuotaResult> {
	try {
		const tdb = forTenant(restaurantId);
		const quota = await db.query.tenantLlmQuotas.findFirst({
			where: tdb.scope(tenantLlmQuotas.restaurantId),
		});
		if (!quota) return { allowed: true };

		const monthStart = new Date();
		monthStart.setUTCDate(1);
		monthStart.setUTCHours(0, 0, 0, 0);

		if (quota.monthlyExtractions != null) {
			const [row] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(llmUsageLog)
				.where(and(
					tdb.scope(llmUsageLog.restaurantId),
					gte(llmUsageLog.createdAt, monthStart),
				));
			const used = row?.count ?? 0;
			if (used >= quota.monthlyExtractions) {
				return { allowed: false, reason: 'monthly_extraction_limit', limit: quota.monthlyExtractions, used };
			}
		}

		if (quota.monthlyCostLimitUsd != null) {
			const limit = Number(quota.monthlyCostLimitUsd);
			const [row] = await db
				.select({ total: sql<string>`coalesce(sum(estimated_cost_usd), '0')` })
				.from(llmUsageLog)
				.where(and(
					tdb.scope(llmUsageLog.restaurantId),
					gte(llmUsageLog.createdAt, monthStart),
				));
			const used = parseFloat(row?.total ?? '0');
			if (used >= limit) {
				return { allowed: false, reason: 'monthly_cost_limit', limit, used };
			}
		}

		return { allowed: true };
	} catch (err) {
		console.error('[llm-quota] quota check failed (allowing request):', err);
		return { allowed: true };
	}
}

export async function recordLlmUsage(
	restaurantId: string,
	usage: LLMUsage,
	callerContext?: string,
): Promise<void> {
	try {
		const cost = estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens);
		await db.insert(llmUsageLog).values({
			restaurantId,
			model: usage.model,
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
			estimatedCostUsd: cost.toFixed(8),
			callerContext: callerContext ?? null,
		});
	} catch (err) {
		console.error('[llm-quota] failed to record usage (non-fatal):', err);
	}
}
