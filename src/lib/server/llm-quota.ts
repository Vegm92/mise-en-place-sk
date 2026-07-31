import { and, eq, gte, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { llmUsageLog, monthlyUsage, tenantLlmQuotas } from './schema';
import { estimateCostUsd, type LLMUsage } from './llm-provider';
import { getMonthlyQuota } from './billing';

function currentMonth(): string {
	return new Date().toISOString().slice(0, 7);
}

async function planQuotaLimit(restaurantId: string): Promise<number | null> {
	return await getMonthlyQuota(restaurantId);
}

export type ClaimResult =
	| { claimed: true }
	| { claimed: false; reason: 'monthly_plan_limit'; limit: number };

export async function claimMonthlyExtraction(restaurantId: string): Promise<ClaimResult> {
	const limit = await planQuotaLimit(restaurantId);
	if (limit === null) return { claimed: true };

	const month = currentMonth();
	const rows = await db.insert(monthlyUsage)
		.values({ restaurantId, month, used: 1 })
		.onConflictDoUpdate({
			target: [monthlyUsage.restaurantId, monthlyUsage.month],
			set: { used: sql`${monthlyUsage.used} + 1` },
			setWhere: sql`${monthlyUsage.used} < ${limit}`,
		})
		.returning({ used: monthlyUsage.used });

	return rows.length > 0 ? { claimed: true } : { claimed: false, reason: 'monthly_plan_limit', limit };
}

export async function releaseMonthlyExtraction(restaurantId: string): Promise<void> {
	try {
		const month = currentMonth();
		const tdb = forTenant(restaurantId);
		await db.update(monthlyUsage)
			.set({ used: sql`${monthlyUsage.used} - 1` })
			.where(tdb.scope(monthlyUsage.restaurantId, and(
				eq(monthlyUsage.month, month),
				sql`${monthlyUsage.used} > 0`,
			)));
	} catch (err) {
		console.error('[llm-quota] failed to release monthly slot (non-fatal):', err);
	}
}

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
