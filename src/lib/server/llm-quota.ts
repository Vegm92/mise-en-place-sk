/**
 * Per-tenant LLM cost quota enforcement and usage logging.
 *
 * quota rows are optional — if no row exists for a tenant the tenant is
 * treated as unlimited. Checks are advisory (best-effort) and never block
 * the extraction path on DB errors.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { llmUsageLog, monthlyUsage, settings, tenantLlmQuotas } from './schema';
import { estimateCostUsd, type LLMUsage } from './llm-provider';

function currentMonth(): string {
	return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Reads the tenant's plan invoice quota from settings. null = no configured
 * limit (treated as unlimited).
 */
async function planQuotaLimit(restaurantId: string): Promise<number | null> {
	const tdb = forTenant(restaurantId);
	const [row] = await db.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, 'plan_quota')));
	if (!row?.value) return null;
	const limit = Number(row.value);
	return Number.isFinite(limit) && limit > 0 ? limit : null;
}

export type ClaimResult =
	| { claimed: true }
	| { claimed: false; reason: 'monthly_plan_limit'; limit: number };

/**
 * Atomically claims one monthly extraction slot against the tenant's plan
 * quota (issue #244). A single INSERT … ON CONFLICT DO UPDATE … WHERE used <
 * limit RETURNING is race-safe: concurrent uploads serialise on the row, and
 * only those under the cap get a row back. Empty return → quota exhausted,
 * before any Gemini spend. No configured limit → always claimed.
 */
export async function claimMonthlyExtraction(restaurantId: string): Promise<ClaimResult> {
	const limit = await planQuotaLimit(restaurantId);
	if (limit === null) return { claimed: true };

	const month = currentMonth();
	// Seed at 1 on first insert; on conflict bump only while under the cap.
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

/**
 * Releases a previously claimed slot (extraction failed and shouldn't count
 * against the quota). Never drops below zero. Best-effort — a lost decrement
 * is self-correcting at month rollover.
 */
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
