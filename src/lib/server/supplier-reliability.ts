import { db } from './db';
import { supplierMetrics, invoices, invoiceLineItems } from './schema';
import { sql, eq, and } from 'drizzle-orm';

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
	const prices = await db.execute<{ unit_price: number }>(sql`
		SELECT ili.unit_price
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		WHERE i.supplier_id = ${supplierId}
		  AND i.restaurant_id = ${restaurantId}
		  AND i.invoice_date >= ${sixMonthsAgo}
		  AND ili.description IN (${descParams})
		  AND ili.unit_price > 0
	`);

	if (prices.length < 2) return { score: 20, cv: null };

	const vals = prices.map((p) => Number(p.unit_price));
	const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
	if (mean === 0) return { score: 20, cv: null };

	const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
	const cv = (Math.sqrt(variance) / mean) * 100;

	return { score: cv < 5 ? 33 : cv <= 15 ? 20 : 0, cv };
}

async function computeFrequencyScore(supplierId: number, restaurantId: string): Promise<number> {
	const invoiceDates = await db
		.select({ invoice_date: invoices.invoiceDate })
		.from(invoices)
		.where(and(
			eq(invoices.supplierId, supplierId),
			eq(invoices.restaurantId, restaurantId),
			sql`${invoices.invoiceDate} IS NOT NULL`
		))
		.orderBy(invoices.invoiceDate);

	if (invoiceDates.length < 2) return 15;

	const dateObjs = invoiceDates
		.filter(r => r.invoice_date)
		.map(r => new Date(r.invoice_date!))
		.sort((a, b) => a.getTime() - b.getTime());

	const gaps: number[] = [];
	for (let i = 1; i < dateObjs.length; i++) {
		gaps.push((dateObjs[i]!.getTime() - dateObjs[i - 1]!.getTime()) / 86400000);
	}

	const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
	const threshold = avgGap <= 10 ? 10 : avgGap <= 20 ? 20 : 45;
	const lastDate = dateObjs[dateObjs.length - 1]!;
	const daysSinceLast = (Date.now() - lastDate.getTime()) / 86400000;
	const missedCount = gaps.filter(g => g > threshold * 1.5).length + (daysSinceLast > threshold * 1.5 ? 1 : 0);

	return missedCount === 0 ? 33 : missedCount <= 2 ? 15 : 0;
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
	`);

	const r = row[0];
	if (!r || Number(r.total) === 0) return 17;
	const onTimePct = (Number(r.paid) / Number(r.total)) * 100;
	return onTimePct >= 90 ? 34 : onTimePct >= 70 ? 20 : 0;
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
