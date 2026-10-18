import { PROVISIONAL_PRICE, type TierId } from './billing-plans';
import type { SampleAlert } from './landing-sample';

export interface LandingPlanFacts {
	quota: number | null;
	maxLocations: number;
}

export interface LandingFacts {
	plans: Record<TierId, LandingPlanFacts>;
	trial: { days: number; documents: number | null };
	sampleAlert: SampleAlert | null;
}

export interface LandingTier extends LandingPlanFacts {
	id: TierId;
	price: number;
	featured: boolean;
}

export const PAID_TIER_IDS: readonly TierId[] = ['starter', 'pro', 'business'];

export const ICP_TIER: TierId = 'business';
export const CALCULATOR_DEFAULT_TIER: TierId = 'pro';

export function landingTiers(plans: Record<TierId, LandingPlanFacts>): LandingTier[] {
	return PAID_TIER_IDS.map((id) => ({
		id,
		price: PROVISIONAL_PRICE[id],
		featured: id === ICP_TIER,
		quota: plans[id].quota,
		maxLocations: plans[id].maxLocations,
	}));
}
