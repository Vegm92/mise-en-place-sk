import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { digestShares, restaurants } from './schema';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from './category-spend';
import { moneyToNumber } from './money';
import { isoWeekRange, pctDelta, shiftIsoWeek } from './reports/shared';
import { landingVariantForVenueType } from '../landing-variants';
import { isoWeek } from './weekly-digest';

const TOKEN_BYTES = 24;
const TOP_CATEGORY_MOVERS = 3;

export function generateShareToken(): string {
	return randomBytes(TOKEN_BYTES).toString('base64url');
}

export async function getOrCreateCurrentWeekShare(restaurantId: string): Promise<{ token: string; week: string }> {
	const week = isoWeek(new Date());
	const tdb = forTenant(restaurantId);
	const [existing] = await db
		.select({ token: digestShares.token })
		.from(digestShares)
		.where(tdb.scope(digestShares.restaurantId, and(eq(digestShares.week, week), isNull(digestShares.revokedAt))))
		.limit(1);
	if (existing) return { token: existing.token, week };

	const token = generateShareToken();
	await db.insert(digestShares).values({ restaurantId, week, token });
	return { token, week };
}

export interface ResolvedDigestShare {
	restaurantId: string;
	week: string;
}

export async function resolveShareToken(token: string): Promise<ResolvedDigestShare | null> {
	const [row] = await db
		.select({ restaurantId: digestShares.restaurantId, week: digestShares.week, revokedAt: digestShares.revokedAt })
		.from(digestShares)
		// tenant-scope-ok: the token itself is the tenant boundary — the caller
		// is anonymous and has no restaurantId until this lookup resolves it
		// (same shape as whatsapp-pairing.ts's redeemPairingCode).
		.where(eq(digestShares.token, token))
		.limit(1);
	if (!row || row.revokedAt) return null;
	return { restaurantId: row.restaurantId, week: row.week };
}

async function periodSpend(rid: string, start: string, end: string): Promise<number> {
	const rows = await db.execute<{ spend: string | null }>(sql`
		SELECT COALESCE(SUM(i.total_amount), 0) AS spend
		FROM invoices i
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND i.invoice_date BETWEEN ${start} AND ${end}
	`);
	return moneyToNumber(rows[0]?.spend ?? '0');
}

async function periodCategoryTotals(rid: string, start: string, end: string): Promise<Map<string, number>> {
	const rows = await db.execute<{ category: string; spend: string | null }>(sql`
		SELECT
			${lineCategoryExpr()} AS category,
			SUM(${lineAmountExpr()}) AS spend
		FROM invoice_line_items
		JOIN invoices i ON i.id = invoice_line_items.invoice_id
		JOIN suppliers ON suppliers.id = i.supplier_id
		${lineProductJoin()}
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND ${describedLine()}
		  AND i.invoice_date BETWEEN ${start} AND ${end}
		GROUP BY ${lineCategoryExpr()}
	`);
	return new Map(rows.map((r) => [String(r.category), moneyToNumber(r.spend)]));
}

export interface CategoryMover {
	category: string;
	deltaPct: number | null;
}

export interface PublicDigestPayload {
	week: string;
	weekStart: string;
	weekEnd: string;
	empty: boolean;
	spendChangePct: number | null;
	categoryMovers: CategoryMover[];
	venueType: string | null;
	ctaHref: string;
}

const WAITLIST_CTA = '/waitlist';

export async function buildPublicDigestPayload(restaurantId: string, week: string): Promise<PublicDigestPayload> {
	const { start, end } = isoWeekRange(week);
	const prevWeek = shiftIsoWeek(week, -1);
	const prev = isoWeekRange(prevWeek);

	const [currentSpend, previousSpend, currentCats, previousCats, restaurantRow] = await Promise.all([
		periodSpend(restaurantId, start, end),
		periodSpend(restaurantId, prev.start, prev.end),
		periodCategoryTotals(restaurantId, start, end),
		periodCategoryTotals(restaurantId, prev.start, prev.end),
		db.select({ venueType: restaurants.venueType }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1),
	]);

	const movers = [...currentCats.keys(), ...previousCats.keys()]
		.filter((category, index, all) => all.indexOf(category) === index)
		.map((category) => ({
			category,
			deltaPct: pctDelta(currentCats.get(category) ?? 0, previousCats.get(category) ?? 0),
		}))
		.filter((mover): mover is CategoryMover => mover.deltaPct !== null)
		.sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0))
		.slice(0, TOP_CATEGORY_MOVERS);

	const venueType = restaurantRow[0]?.venueType ?? null;

	return {
		week,
		weekStart: start,
		weekEnd: end,
		empty: currentCats.size === 0 && currentSpend === 0,
		spendChangePct: pctDelta(currentSpend, previousSpend),
		categoryMovers: movers,
		venueType,
		ctaHref: landingVariantForVenueType(venueType) ? `/l/${landingVariantForVenueType(venueType)}` : WAITLIST_CTA,
	};
}
