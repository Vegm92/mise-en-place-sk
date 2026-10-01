import { db, forTenant } from './db';
import { supplierMetrics, invoices } from './schema';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { moneyToNumber } from './money';

interface ReliabilityResult {
	score: number;
	priceStabilityScore: number;
	frequencyScore: number;
	timelinessScore: number;
	priceStabilityCv: number | null;
	computedAt: Date;
}

async function computePriceStability(supplierId: number, restaurantId: string): Promise<{ score: number; cv: number | null }> {
	const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	const topItems = await db.execute<{ description: string }>(sql`
		SELECT ili.description
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		WHERE i.supplier_id = ${supplierId}
		  AND i.restaurant_id = ${restaurantId}
		  AND i.deleted_at IS NULL
		  AND i.invoice_date >= ${sixMonthsAgo}
		  AND ili.unit_price > 0
		  AND ili.description IS NOT NULL
		GROUP BY ili.description
		ORDER BY COUNT(*) DESC
		LIMIT 5
	`);

	if (!topItems.length) return { score: 20, cv: null };

	const descriptions = topItems.map((t) => t.description);

	const descParams = sql.join(descriptions.map(d => sql`${d}`), sql`, `);
	const prices = await db.execute<{ description: string; unit_price: string }>(sql`
		SELECT ili.description, ili.unit_price
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		WHERE i.supplier_id = ${supplierId}
		  AND i.restaurant_id = ${restaurantId}
		  AND i.deleted_at IS NULL
		  AND i.invoice_date >= ${sixMonthsAgo}
		  AND ili.description IN (${descParams})
		  AND ili.unit_price > 0
	`);

	if (prices.length < 2) return { score: 20, cv: null };

	const byDescription = new Map<string, number[]>();
	for (const p of prices) {
		const arr = byDescription.get(p.description);
		if (arr) arr.push(moneyToNumber(p.unit_price)); else byDescription.set(p.description, [moneyToNumber(p.unit_price)]);
	}

	const itemCvs: number[] = [];
	for (const vals of byDescription.values()) {
		if (vals.length < 2) continue;
		const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
		if (mean === 0) continue;
		const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
		itemCvs.push((Math.sqrt(variance) / mean) * 100);
	}

	if (itemCvs.length === 0) return { score: 20, cv: null };
	const cv = itemCvs.reduce((a, b) => a + b, 0) / itemCvs.length;

	if (cv < 5) return { score: 33, cv };
	if (cv <= 15) return { score: 20, cv };
	return { score: 0, cv };
}

async function computeFrequencyScore(supplierId: number, restaurantId: string): Promise<number> {
	const tdb = forTenant(restaurantId);
	const invoiceDates = await db
		.select({ invoice_date: invoices.invoiceDate })
		.from(invoices)
		.where(and(
			tdb.scope(invoices.restaurantId),
			eq(invoices.supplierId, supplierId),
			isNull(invoices.deletedAt),
			sql`${invoices.invoiceDate} IS NOT NULL`
		))
		.orderBy(invoices.invoiceDate);

	const timestamps: number[] = [];
	for (let i = 0; i < invoiceDates.length; i++) {
		const dStr = invoiceDates[i]!.invoice_date;
		if (!dStr) continue;
		const ts = Date.parse(dStr);
		if (!Number.isNaN(ts)) timestamps.push(ts);
	}

	if (timestamps.length < 2) return 15;

	let totalGap = 0;
	const gaps: number[] = [];
	for (let i = 1; i < timestamps.length; i++) {
		const gap = (timestamps[i]! - timestamps[i - 1]!) / 86400000;
		gaps.push(gap);
		totalGap += gap;
	}

	if (gaps.length === 0) return 15;

	const avgGap = totalGap / gaps.length;
	let threshold = 45;
	if (avgGap <= 10) threshold = 10;
	else if (avgGap <= 20) threshold = 20;
	const lastTs = timestamps[timestamps.length - 1]!;
	const daysSinceLast = (Date.now() - lastTs) / 86400000;
	const thresholdFactor = threshold * 1.5;
	let missedCount = daysSinceLast > thresholdFactor ? 1 : 0;
	for (let i = 0; i < gaps.length; i++) {
		if (gaps[i]! > thresholdFactor) missedCount++;
	}

	if (missedCount === 0) return 33;
	return missedCount <= 2 ? 15 : 0;
}

async function computeTimelinessScore(supplierId: number, restaurantId: string): Promise<number> {
	const today = new Date().toISOString().slice(0, 10);

	const row = await db.execute<{ paid: number; overdue: number; total: number }>(sql`
		SELECT
			COUNT(CASE WHEN status = 'paid' AND due_date IS NOT NULL THEN 1 END) AS paid,
			COUNT(CASE WHEN status = 'pending' AND due_date IS NOT NULL AND due_date < ${today} THEN 1 END) AS overdue,
			COUNT(CASE WHEN due_date IS NOT NULL THEN 1 END) AS total
		FROM invoices
		WHERE supplier_id = ${supplierId}
		  AND restaurant_id = ${restaurantId}
		  AND deleted_at IS NULL
	`);

	const r = row[0];
	if (!r || Number(r.total) === 0) return 17;
	const onTimePct = (Number(r.paid) / Number(r.total)) * 100;
	if (onTimePct >= 90) return 34;
	return onTimePct >= 70 ? 20 : 0;
}

export async function computeAndCacheReliabilityScore(supplierId: number, restaurantId: string): Promise<ReliabilityResult> {
	const [{ score: priceStabilityScore, cv }, frequencyScore, timelinessScore] = await Promise.all([
		computePriceStability(supplierId, restaurantId),
		computeFrequencyScore(supplierId, restaurantId),
		computeTimelinessScore(supplierId, restaurantId),
	]);

	const score = priceStabilityScore + frequencyScore + timelinessScore;
	const computedAt = new Date();

	await db.insert(supplierMetrics)
		.values({ supplierId, restaurantId, score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt })
		.onConflictDoUpdate({
			target: supplierMetrics.supplierId,
			set: { score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt },
		});

	return { score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt };
}
