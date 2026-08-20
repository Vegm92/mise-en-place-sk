import { db, forTenant } from './db';
import { supplierMetrics, invoices, invoiceLineItems } from './schema';
import { sql, eq, and, isNull } from 'drizzle-orm';

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

	if (!topItems.length) return { score: 30, cv: null };

	const descriptions = topItems.map((t) => t.description);

	const descParams = sql.join(descriptions.map(d => sql`${d}`), sql`, `);
	const prices = await db.execute<{ description: string; unit_price: number }>(sql`
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
		if (arr) arr.push(Number(p.unit_price)); else byDescription.set(p.description, [Number(p.unit_price)]);
	}

	const itemCvs: number[] = [];
	for (const vals of byDescription.values()) {
		if (vals.length < 2) continue;
		const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
		if (mean === 0) continue;
		const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
		itemCvs.push((Math.sqrt(variance) / mean) * 100);
	}

	if (itemCvs.length === 0) return { score: 30, cv: null };
	const cv = itemCvs.reduce((a, b) => a + b, 0) / itemCvs.length;

	return { score: cv < 5 ? 50 : cv <= 15 ? 30 : 0, cv };
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

	if (invoiceDates.length < 2) return 23;

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

	return missedCount === 0 ? 50 : missedCount <= 2 ? 23 : 0;
}

export async function computeAndCacheReliabilityScore(supplierId: number, restaurantId: string): Promise<ReliabilityResult> {
	const [{ score: priceStabilityScore, cv }, frequencyScore] = await Promise.all([
		computePriceStability(supplierId, restaurantId),
		computeFrequencyScore(supplierId, restaurantId),
	]);

	// La fiabilidad ya no incluye puntualidad de pago (dependía de fechas de
	// vencimiento que dejamos de pedir) — se mantiene la columna en BD por
	// compatibilidad, pero siempre en 0 y fuera de la suma de `score`.
	const timelinessScore = 0;
	const score = priceStabilityScore + frequencyScore;
	const computedAt = new Date();

	await db.insert(supplierMetrics)
		.values({ supplierId, restaurantId, score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt })
		.onConflictDoUpdate({
			target: supplierMetrics.supplierId,
			set: { score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt },
		});

	return { score, priceStabilityScore, frequencyScore, timelinessScore, priceStabilityCv: cv, computedAt };
}
