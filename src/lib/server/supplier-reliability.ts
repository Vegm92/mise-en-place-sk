import { db } from './db';
import { supplierMetrics, invoices, invoiceLineItems } from './schema';
import { sql, eq } from 'drizzle-orm';

interface ReliabilityResult {
	score: number;
	priceStabilityScore: number;
	frequencyScore: number;
	timelinessScore: number;
	priceStabilityCv: number | null;
	computedAt: string;
}

function computePriceStability(supplierId: number): { score: number; cv: number | null } {
	const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	// Get top 5 most-ordered item descriptions from this supplier in last 6 months
	const topItems = db.all<{ description: string }>(sql`
		SELECT ili.description
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		WHERE i.supplier_id = ${supplierId}
		  AND i.invoice_date >= ${sixMonthsAgo}
		  AND ili.unit_price > 0
		  AND ili.description IS NOT NULL
		GROUP BY ili.description
		ORDER BY COUNT(*) DESC
		LIMIT 5
	`);

	if (!topItems.length) return { score: 20, cv: null };

	const descriptions = topItems.map((t) => t.description);
	const placeholders = descriptions.map(() => '?').join(',');

	const prices = db.all<{ unit_price: number }>(
		sql.raw(`
			SELECT ili.unit_price
			FROM invoice_line_items ili
			JOIN invoices i ON i.id = ili.invoice_id
			WHERE i.supplier_id = ${supplierId}
			  AND i.invoice_date >= '${sixMonthsAgo}'
			  AND ili.description IN (${descriptions.map((d) => `'${d.replace(/'/g, "''")}'`).join(',')})
			  AND ili.unit_price > 0
		`)
	);

	if (prices.length < 2) return { score: 20, cv: null };

	const vals = prices.map((p) => p.unit_price);
	const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
	if (mean === 0) return { score: 20, cv: null };

	const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
	const stdDev = Math.sqrt(variance);
	const cv = (stdDev / mean) * 100;

	let score: number;
	if (cv < 5) score = 33;
	else if (cv <= 15) score = 20;
	else score = 0;

	return { score, cv };
}

function computeFrequencyScore(supplierId: number): number {
	const invoiceDates = db.all<{ invoice_date: string }>(sql`
		SELECT invoice_date
		FROM invoices
		WHERE supplier_id = ${supplierId}
		  AND invoice_date IS NOT NULL
		ORDER BY invoice_date ASC
	`);

	if (invoiceDates.length < 2) return 15;

	const dateObjs = invoiceDates.map((r) => new Date(r.invoice_date)).sort((a, b) => a.getTime() - b.getTime());
	const gaps: number[] = [];
	for (let i = 1; i < dateObjs.length; i++) {
		gaps.push((dateObjs[i].getTime() - dateObjs[i - 1].getTime()) / 86400000);
	}

	const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

	// Determine cadence threshold
	let threshold: number;
	if (avgGap <= 10) threshold = 10;
	else if (avgGap <= 20) threshold = 20;
	else threshold = 45;

	// Count gaps that are more than 1.5x the threshold (missed invoices)
	const lastDate = dateObjs[dateObjs.length - 1];
	const daysSinceLast = (Date.now() - lastDate.getTime()) / 86400000;
	const missedCount = gaps.filter((g) => g > threshold * 1.5).length + (daysSinceLast > threshold * 1.5 ? 1 : 0);

	if (missedCount === 0) return 33;
	if (missedCount <= 2) return 15;
	return 0;
}

function computeTimelinessScore(supplierId: number): number {
	const today = new Date().toISOString().slice(0, 10);

	const row = db.get<{ paid: number; overdue: number; total: number }>(sql`
		SELECT
			COUNT(CASE WHEN status = 'paid' AND due_date IS NOT NULL THEN 1 END) AS paid,
			COUNT(CASE WHEN status = 'pending' AND due_date IS NOT NULL AND due_date < ${today} THEN 1 END) AS overdue,
			COUNT(CASE WHEN due_date IS NOT NULL THEN 1 END) AS total
		FROM invoices
		WHERE supplier_id = ${supplierId}
	`);

	if (!row || row.total === 0) return 17; // no due dates — neutral score

	const onTimePct = (row.paid / row.total) * 100;
	if (onTimePct >= 90) return 34;
	if (onTimePct >= 70) return 20;
	return 0;
}

export function computeAndCacheReliabilityScore(supplierId: number): ReliabilityResult {
	const { score: priceStabilityScore, cv } = computePriceStability(supplierId);
	const frequencyScore = computeFrequencyScore(supplierId);
	const timelinessScore = computeTimelinessScore(supplierId);
	const score = priceStabilityScore + frequencyScore + timelinessScore;
	const computedAt = new Date().toISOString();

	db.insert(supplierMetrics)
		.values({
			supplierId,
			score,
			priceStabilityScore,
			frequencyScore,
			timelinessScore,
			priceStabilityCv: cv,
			computedAt,
		})
		.onConflictDoUpdate({
			target: supplierMetrics.supplierId,
			set: { score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt },
		})
		.run();

	return { score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt };
}
