import { and, eq, gte, sql, TransactionRollbackError, type SQL } from 'drizzle-orm';
import { db, forTenant } from './db';
import { llmUsageLog, monthlyUsage, tenantLlmQuotas, usageEvents } from './schema';
import { estimateCostUsd, type LLMUsage } from './llm-provider';
import { getMonthlyQuota } from './billing';

function currentMonth(): string {
	return new Date().toISOString().slice(0, 7);
}

async function planQuotaLimit(restaurantId: string): Promise<number | null> {
	return await getMonthlyQuota(restaurantId);
}

export async function getMonthlyUsage(restaurantId: string): Promise<number> {
	const tdb = forTenant(restaurantId);
	const [row] = await db
		.select({ used: monthlyUsage.used })
		.from(monthlyUsage)
		.where(tdb.scope(monthlyUsage.restaurantId, eq(monthlyUsage.month, currentMonth())));
	return row?.used ?? 0;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockItem(tx: Tx, batchItemId: string): Promise<void> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${batchItemId}, 0))`);
}

async function itemBalance(tx: Tx, batchItemId: string): Promise<number> {
	// tenant-scope-ok: keyed on a batch item id the caller already owns, and
	// returns only that item's own running total.
	const [row] = await tx
		.select({ balance: sql<number>`coalesce(sum(${usageEvents.delta}), 0)::int` })
		.from(usageEvents)
		.where(eq(usageEvents.batchItemId, batchItemId));
	return row?.balance ?? 0;
}

async function moveCounter(
	tx: Tx,
	restaurantId: string,
	month: string,
	delta: number,
	guard?: SQL,
): Promise<boolean> {
	await tx.insert(monthlyUsage)
		.values({ restaurantId, month, used: 0 })
		.onConflictDoNothing({ target: [monthlyUsage.restaurantId, monthlyUsage.month] });

	const rows = await tx.update(monthlyUsage)
		.set({ used: sql`${monthlyUsage.used} + ${delta}` })
		.where(forTenant(restaurantId).scope(
			monthlyUsage.restaurantId,
			guard ? and(eq(monthlyUsage.month, month), guard) : eq(monthlyUsage.month, month),
		))
		.returning({ used: monthlyUsage.used });
	return rows.length > 0;
}

function writeEvent(
	tx: Tx,
	restaurantId: string,
	month: string,
	row: { batchItemId: string | null; kind: 'claim' | 'release'; delta: number; reason: string },
) {
	return tx.insert(usageEvents).values({ restaurantId, month, ...row });
}

export type ClaimResult =
	| { claimed: true }
	| { claimed: false; reason: 'monthly_plan_limit'; limit: number };

export async function claimMonthlyExtraction(
	restaurantId: string,
	batchItemId?: string,
): Promise<ClaimResult> {
	const limit = await planQuotaLimit(restaurantId);
	const guard = limit === null ? undefined : sql`${monthlyUsage.used} < ${limit}`;
	const month = currentMonth();

	return await db.transaction(async (tx): Promise<ClaimResult> => {
		if (batchItemId) {
			await lockItem(tx, batchItemId);
			if (await itemBalance(tx, batchItemId) > 0) return { claimed: true };
		}

		await writeEvent(tx, restaurantId, month, {
			batchItemId: batchItemId ?? null, kind: 'claim', delta: 1, reason: 'extraction',
		});

		if (!(await moveCounter(tx, restaurantId, month, 1, guard))) {
			tx.rollback();
		}
		return { claimed: true };
	}).catch((err) => {
		if (err instanceof TransactionRollbackError) {
			return { claimed: false, reason: 'monthly_plan_limit', limit: limit ?? 0 } as const;
		}
		throw err;
	});
}

export type ReservationResult =
	| { reserved: true }
	| { reserved: false; remaining: number; limit: number };

export async function reserveMonthlyExtractions(
	restaurantId: string,
	count: number,
): Promise<ReservationResult> {
	const limit = await planQuotaLimit(restaurantId);
	const month = currentMonth();
	const guard = limit === null ? undefined : sql`${monthlyUsage.used} + ${count} <= ${limit}`;
	const used = limit === null ? 0 : await getMonthlyUsage(restaurantId);

	return await db.transaction(async (tx): Promise<ReservationResult> => {
		await writeEvent(tx, restaurantId, month, {
			batchItemId: null, kind: 'claim', delta: count, reason: `composite:${count}`,
		});
		if (!(await moveCounter(tx, restaurantId, month, count, guard))) {
			tx.rollback();
		}
		return { reserved: true };
	}).catch((err) => {
		if (err instanceof TransactionRollbackError) {
			return { reserved: false, remaining: Math.max(0, (limit ?? 0) - used), limit: limit ?? 0 } as const;
		}
		throw err;
	});
}

export async function attributeReservation(
	restaurantId: string,
	batchItemIds: string[],
	reason = 'composite-child',
): Promise<void> {
	if (batchItemIds.length === 0) return;
	const month = currentMonth();
	try {
		await db.transaction(async (tx) => {
			await tx.insert(usageEvents).values(batchItemIds.map((batchItemId) => ({
				restaurantId, month, batchItemId, kind: 'claim' as const, delta: 1, reason,
			})));
			await writeEvent(tx, restaurantId, month, {
				batchItemId: null,
				kind: 'release',
				delta: -batchItemIds.length,
				reason: 'composite-attributed',
			});
		});
	} catch (err) {
		console.error('[llm-quota] failed to attribute reservation (non-fatal):', err);
	}
}

export async function releaseMonthlyExtraction(
	restaurantId: string,
	batchItemId?: string,
	reason = 'failed',
): Promise<void> {
	const month = currentMonth();
	try {
		await db.transaction(async (tx) => {
			if (batchItemId) {
				await lockItem(tx, batchItemId);
				if (await itemBalance(tx, batchItemId) <= 0) return;
			}
			await writeEvent(tx, restaurantId, month, {
				batchItemId: batchItemId ?? null, kind: 'release', delta: -1, reason,
			});
			if (!(await moveCounter(tx, restaurantId, month, -1, sql`${monthlyUsage.used} > 0`))) {
				tx.rollback();
			}
		});
	} catch (err) {
		if (err instanceof TransactionRollbackError) return;
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
