import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { restaurants, userRestaurants, subscriptions } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import { TRIAL_DAYS, applyTierSettings } from '$lib/server/billing';
import { sendEmail, welcomeEmail } from '$lib/server/email';
import { hasConsent, recordConsent } from '$lib/server/consent';
import { claimRequest, isValidKey } from '$lib/server/idempotency';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const preview = url.searchParams.get('preview') === '1';
	if (locals.restaurantId && !preview) redirect(303, '/');
	const needsConsent = !(await hasConsent(locals.user.id));
	return { preview, needsConsent };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');

		const data = await request.formData();
		const name = (data.get('name') as string ?? '').trim();

		if (!name) return fail(422, { error: 'El nombre del restaurante es obligatorio.' });
		if (name.length > 80) return fail(422, { error: 'El nombre no puede superar 80 caracteres.' });

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
			+ '-' + Math.random().toString(36).slice(2, 7);

		let newRestaurantId: string | null = null;
		await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

			const existing = await tx
				.select({ restaurantId: userRestaurants.restaurantId })
				.from(userRestaurants)
				.where(eq(userRestaurants.userId, userId))
				.limit(1);
			if (existing.length > 0) return;

			if (idemKey && !(await claimRequest(idemKey, null, tx))) return;

			const [restaurant] = await tx
				.insert(restaurants)
				.values({ name, slug })
				.returning({ id: restaurants.id });

			await tx.insert(userRestaurants).values({
				userId,
				restaurantId: restaurant.id,
				role: 'owner',
			});

			const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
			await tx.insert(subscriptions)
				.values({ restaurantId: restaurant.id, status: 'trialing', trialEndsAt })
				.onConflictDoUpdate({
					target: subscriptions.restaurantId,
					set: { updatedAt: new Date() },
				});

			newRestaurantId = restaurant.id;
		});

		if (newRestaurantId) {
			await applyTierSettings(newRestaurantId, 'trial');

			if (locals.user.email) {
				sendEmail(welcomeEmail(locals.user.email, name)).catch(e =>
					console.error('[onboarding] welcome email failed:', e)
				);
			}
		}

		redirect(303, '/');
	},
};
