import { FOUNDER_TRIAL_DAYS, TIERS } from './billing';
import { computePriceDeviations, type DeviationLine } from './price-deviations';
import { PAID_TIER_IDS, type LandingFacts, type LandingPlanFacts } from '$lib/landing-plans';
import {
	SAMPLE_ALERT_THRESHOLD,
	SAMPLE_DELIVERIES,
	SAMPLE_PERIOD,
	type SampleAlert,
	type SampleSupplier,
} from '$lib/landing-sample';
import type { TierId } from '$lib/billing-plans';

const SAMPLE_SUPPLIER_IDS: Record<SampleSupplier, number> = { A: 1, B: 2 };

function sampleDeviationLines(): DeviationLine[] {
	return SAMPLE_DELIVERIES.map((d) => ({
		productId: 1,
		description: 'sample',
		supplierId: SAMPLE_SUPPLIER_IDS[d.supplier],
		supplierName: d.supplier,
		invoiceDate: d.date,
		unit: 'l',
		unitPrice: d.pricePerLitre,
		normalizedUnitPrice: d.pricePerLitre,
		baseUnit: 'l',
		totalPrice: Math.round(d.litres * d.pricePerLitre * 100) / 100,
	}));
}

function sampleAlert(): SampleAlert | null {
	const [top] = computePriceDeviations(sampleDeviationLines(), SAMPLE_PERIOD.from, SAMPLE_PERIOD.to, SAMPLE_ALERT_THRESHOLD);
	if (!top) return null;
	return {
		supplier: top.supplierName as SampleSupplier,
		referencePrice: top.referencePrice,
		latestPrice: top.latestPrice,
		deviationPct: top.deviationPct,
		extraPaid: Math.round(top.extraPaid * 100) / 100,
		lastDate: top.lastDate,
		alternative: top.alternative
			? { supplier: top.alternative.supplierName as SampleSupplier, price: top.alternative.price, asOf: top.alternative.asOf }
			: null,
	};
}

export function landingFacts(): LandingFacts {
	const plans = Object.fromEntries(
		PAID_TIER_IDS.map((id): [TierId, LandingPlanFacts] => [
			id,
			{ quota: TIERS[id].monthlyInvoiceQuota, maxLocations: TIERS[id].maxLocations },
		]),
	) as Record<TierId, LandingPlanFacts>;
	return {
		plans,
		trial: { days: FOUNDER_TRIAL_DAYS, documents: TIERS.trial.monthlyInvoiceQuota },
		sampleAlert: sampleAlert(),
	};
}
