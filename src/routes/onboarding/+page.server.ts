import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, runWithTenantContext } from '$lib/server/db';
import { restaurants, userRestaurants, subscriptions, users } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import { trialDaysFor, applyTierSettings } from '$lib/server/billing';
import { sendEmail, welcomeEmail } from '$lib/server/email';
import { hasConsent, recordConsent } from '$lib/server/consent';
import { claimRequest, isValidKey } from '$lib/server/idempotency';
import { isValidVenueType, isValidCategory } from '$lib/constants';
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '$lib/attribution';
import { venueTypeForLandingVariant } from '$lib/landing-variants';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) redirect(303, '/login');
	const preview = url.searchParams.get('preview') === '1';
	if (locals.restaurantId && !preview) redirect(303, '/');
	const needsConsent = !(await hasConsent(locals.user.id));
	const attribution = parseAttributionCookie(cookies.get(ATTRIBUTION_COOKIE));
	const prefillVenueType = venueTypeForLandingVariant(attribution.variant);
	return { preview, needsConsent, prefillVenueType };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');

		const data = await request.formData();
		const name = (data.get('name') as string ?? '').trim();

		if (!name) return fail(422, { error: 'El nombre del restaurante es obligatorio.' });
		if (name.length > 80) return fail(422, { error: 'El nombre no puede superar 80 caracteres.' });

		const venueTypeRaw = (data.get('venueType') as string ?? '').trim();
		const topCategoryRaw = (data.get('topCategory') as string ?? '').trim();
		const venueType = isValidVenueType(venueTypeRaw) ? venueTypeRaw : null;
		const topCategory = isValidCategory(topCategoryRaw) ? topCategoryRaw : null;

		const attribution = parseAttributionCookie(cookies.get(ATTRIBUTION_COOKIE));

		if (!(await hasConsent(locals.user.id))) {
			if (data.get('terms') !== 'on') {
				return fail(422, { error: 'Debes aceptar los Términos y la Política de Privacidad.' });
			}
			await recordConsent(locals.user.id, 'onboarding');
		}

		const idemKeyRaw = data.get('idempotency_key');
		const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;

		const userId = locals.user.id;
		const slug = name
			.toLowerCase()
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 60)
			+ '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 5);

		let newRestaurantId: string | null = null;
		await db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL app.admin = 'true'`);
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

			const existing = await tx
				.select({ restaurantId: userRestaurants.restaurantId })
				.from(userRestaurants)
				.where(eq(userRestaurants.userId, userId))
				.limit(1);
			if (existing.length > 0) return;

			if (idemKey && !(await claimRequest(idemKey, null, tx))) return;

			const [owner] = await tx
				.select({ founder: users.founder })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);
			const founder = owner?.founder ?? false;

			const [restaurant] = await tx
				.insert(restaurants)
				.values({
					name,
					slug,
					venueType,
					topCategory,
					acquisitionSource: attribution.source,
					acquisitionVariant: attribution.variant,
				})
				.returning({ id: restaurants.id });

			await tx.insert(userRestaurants).values({
				userId,
				restaurantId: restaurant.id,
				role: 'owner',
			});

			const trialEndsAt = new Date(Date.now() + trialDaysFor(founder) * 24 * 60 * 60 * 1000);
			await tx.insert(subscriptions)
				.values({ restaurantId: restaurant.id, status: 'trialing', trialEndsAt, founder })
				.onConflictDoUpdate({
					target: subscriptions.restaurantId,
					set: { updatedAt: new Date() },
				});

			newRestaurantId = restaurant.id;
		});

		if (newRestaurantId) {
			await runWithTenantContext(newRestaurantId, () => applyTierSettings(newRestaurantId!, 'trial'));

			if (locals.user.email) {
				sendEmail(welcomeEmail(locals.user.email, name, venueType)).catch(e =>
					console.error('[onboarding] welcome email failed:', e)
				);
			}
		}

		redirect(303, '/');
	},
};
