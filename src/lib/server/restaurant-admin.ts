import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db, forTenant, runWithTenantContext } from './db';
import { restaurants, userRestaurants } from './schema';
import { type ActionOutcome, reject, succeed } from './action-outcome';
import { applyTierSettings, BILLING_PARENT, TIERS } from './billing';
import { seedDefaultCategories } from './categories';
import { isBetaFeatureEnabled } from './feature-flags';
import { isValidSpanishTaxId, normalizeTaxId } from '$lib/tax-id';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';

class LocationLimitReachedError extends Error {}

export async function requireOwner(restaurantId: string, userId: string): Promise<boolean> {
	const [membership] = await db.select({ role: userRestaurants.role })
		.from(userRestaurants)
		.where(forTenant(restaurantId).scope(userRestaurants.restaurantId, eq(userRestaurants.userId, userId)))
		.limit(1);
	return membership?.role === 'owner';
}

export async function addLocation(
	ctx: { restaurantId: string; userId: string; entitlements: App.Locals['entitlements'] },
	form: FormData,
	cookies: Cookies,
): Promise<ActionOutcome> {
	const { restaurantId: rid, userId } = ctx;
	const name = ((form.get('name') as string) ?? '').trim();
	if (!name) return reject(422, 'set.locations.err.nameRequired');
	if (name.length > 120) return reject(422, 'set.profile.err.restaurantTooLong');

	if (!(await requireOwner(rid, userId))) return reject(403, 'set.locations.err.notOwner');

	const entitlements = await ctx.entitlements();
	const { billingRestaurantId: billingRid, tier, features, maxLocations } = entitlements
		?? { billingRestaurantId: rid, tier: 'trial' as const, features: TIERS.trial.features, maxLocations: TIERS.trial.maxLocations };
	if (!features.multiLocation || !(await isBetaFeatureEnabled('multiLocation'))) {
		return reject(403, 'set.locations.err.notAvailable');
	}

	const slug = `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'local'}-${randomBytes(3).toString('hex')}`;

	let newId: string;
	try {
		newId = await db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL app.admin = 'true'`);
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'loc:' + billingRid}))`);

			const [cntRow] = await tx.select({ cnt: sql<number>`count(*)::int` })
				.from(restaurants)
				.where(eq(BILLING_PARENT, billingRid));
			if (Number(cntRow?.cnt ?? 0) >= maxLocations) throw new LocationLimitReachedError();

			const [created] = await tx.insert(restaurants)
				.values({ name, slug, parentId: billingRid })
				.returning({ id: restaurants.id });
			if (!created) throw new Error('insert restaurants returned no row');
			await tx.insert(userRestaurants).values({ userId, restaurantId: created.id, role: 'owner' });
			await seedDefaultCategories(created.id, tx);
			return created.id;
		});
	} catch (err) {
		if (err instanceof LocationLimitReachedError) return reject(403, 'set.locations.err.limitReached');
		throw err;
	}

	await runWithTenantContext(newId, () => applyTierSettings(newId, tier));

	cookies.set('active_restaurant', newId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 365,
	});
	return succeed('set.locations.ok.created');
}

export async function renameRestaurant(restaurantId: string, userId: string, form: FormData): Promise<ActionOutcome> {
	const name = ((form.get('name') as string) ?? '').trim();
	if (!name) return reject(422, 'set.profile.err.restaurantRequired');
	if (name.length > 120) return reject(422, 'set.profile.err.restaurantTooLong');

	if (!(await requireOwner(restaurantId, userId))) return reject(403, 'set.profile.err.notOwner');

	await db.update(restaurants).set({ name }).where(eq(restaurants.id, restaurantId));

	return succeed('set.profile.ok.restaurant');
}

export async function saveFiscalIdentity(restaurantId: string, userId: string, form: FormData): Promise<ActionOutcome> {
	if (!(await requireOwner(restaurantId, userId))) return reject(403, 'set.fiscal.err.notOwner');

	const legalName = ((form.get('legalName') as string) ?? '').trim();
	const tradeName = ((form.get('tradeName') as string) ?? '').trim();
	const fiscalAddress = ((form.get('fiscalAddress') as string) ?? '').trim();
	const cifNif = normalizeTaxId((form.get('cifNif') as string) ?? '');
	const phone = ((form.get('phone') as string) ?? '').trim();

	if (legalName.length > 200) return reject(422, 'set.fiscal.err.legalNameTooLong');
	if (tradeName.length > 200) return reject(422, 'set.fiscal.err.tradeNameTooLong');
	if (fiscalAddress.length > 300) return reject(422, 'set.fiscal.err.addressTooLong');
	if (cifNif && !isValidSpanishTaxId(cifNif)) return reject(422, 'set.fiscal.err.taxId');
	if (phone.length > 40) return reject(422, 'set.fiscal.err.phoneTooLong');

	await db.update(restaurants)
		.set({ legalName: legalName || null, tradeName: tradeName || null, cifNif, fiscalAddress: fiscalAddress || null, phone: phone || null })
		.where(eq(restaurants.id, restaurantId));

	return succeed('set.fiscal.ok.saved');
}
