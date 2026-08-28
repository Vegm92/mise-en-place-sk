import { eq, sql } from 'drizzle-orm';
import { db, runAsSystem } from './db';
import { restaurants, subscriptions, userRestaurants } from './schema';
import { BILLING_PARENT, TIERS, effectiveTier } from './billing';

const LOCATION_RANK = sql<number>`(
	SELECT count(*)::int FROM restaurants sib
	WHERE COALESCE(sib.parent_id, sib.id) = COALESCE(${restaurants.parentId}, ${restaurants.id})
	  AND (COALESCE(sib.created_at, to_timestamp(0)), sib.id)
	    < (COALESCE(${restaurants.createdAt}, to_timestamp(0)), ${restaurants.id})
)`;

export interface MemberLocation {
	restaurantId: string;
	billingRestaurantId: string;
	locked: boolean;
}

interface AllowanceRow {
	planTier: string | null;
	status: string | null;
	trialEndsAt: Date | null;
	rank: number | null;
}

export function isRankLocked(rank: number, maxLocations: number): boolean {
	return rank >= maxLocations;
}

function lockedFromRow(row: AllowanceRow): boolean {
	const sub = row.planTier != null || row.status != null
		? { planTier: row.planTier ?? null, status: row.status ?? '', trialEndsAt: row.trialEndsAt ?? null }
		: undefined;
	return isRankLocked(row.rank ?? 0, TIERS[effectiveTier(sub)].maxLocations);
}

export async function memberLocations(userId: string): Promise<MemberLocation[]> {
	const rows = await runAsSystem(() => db.select({
		restaurantId: userRestaurants.restaurantId,
		billingRid:   BILLING_PARENT,
		planTier:     subscriptions.planTier,
		status:       subscriptions.status,
		trialEndsAt:  subscriptions.trialEndsAt,
		rank:         LOCATION_RANK,
	})
		.from(userRestaurants)
		.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
		.leftJoin(subscriptions, eq(BILLING_PARENT, subscriptions.restaurantId))
		.where(eq(userRestaurants.userId, userId)));

	return rows.map(row => ({
		restaurantId:        row.restaurantId,
		billingRestaurantId: row.billingRid ?? row.restaurantId,
		locked:              lockedFromRow(row),
	}));
}

export async function isLocationLocked(restaurantId: string): Promise<boolean> {
	const [row] = await runAsSystem(() => db.select({
		planTier:    subscriptions.planTier,
		status:      subscriptions.status,
		trialEndsAt: subscriptions.trialEndsAt,
		rank:        LOCATION_RANK,
	})
		.from(restaurants)
		.leftJoin(subscriptions, eq(BILLING_PARENT, subscriptions.restaurantId))
		.where(eq(restaurants.id, restaurantId))
		.limit(1));

	return row ? lockedFromRow(row) : false;
}
