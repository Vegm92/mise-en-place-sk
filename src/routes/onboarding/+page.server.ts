import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { restaurants, userRestaurants, subscriptions } from '$lib/server/schema';
import { TRIAL_DAYS, applyTierSettings } from '$lib/server/billing';
import { sendEmail, welcomeEmail } from '$lib/server/email';
import { hasConsent, recordConsent } from '$lib/server/consent';
import { claimRequest, isValidKey } from '$lib/server/idempotency';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const preview = url.searchParams.get('preview') === '1';
	if (locals.restaurantId && !preview) redirect(303, '/');
	// Users who signed up via Google from the login page have no recorded
	// T&C acceptance yet — ask for it here, on first authenticated landing.
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

		// Idempotency key (issue #250) — claimed only after validation passes, so
		// a double-submit can't create two restaurants (#241) while a corrected
		// resubmit still goes through. A replay redirects to '/'.
		const idemKeyRaw = data.get('idempotency_key');
		const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;
		if (idemKey && !(await claimRequest(idemKey, null))) {
			redirect(303, '/');
		}

		const slug = name
			.toLowerCase()
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 60)
			+ '-' + Math.random().toString(36).slice(2, 7);

		const [restaurant] = await db
			.insert(restaurants)
			.values({ name, slug })
			.returning({ id: restaurants.id });

		await db.insert(userRestaurants).values({
			userId: locals.user.id,
			restaurantId: restaurant.id,
			role: 'owner',
		});

		// Start 30-day free trial for new restaurant
		const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
		await db.insert(subscriptions)
			.values({ restaurantId: restaurant.id, status: 'trialing', trialEndsAt })
			.onConflictDoUpdate({
				target: subscriptions.restaurantId,
				set: { updatedAt: new Date() },
			});

		// Persist plan_name / plan_quota so the trial counter and quota gate
		// have data from day one (layout otherwise falls back to tier defaults).
		await applyTierSettings(restaurant.id, 'trial');

		// Send welcome email (fire-and-forget)
		if (locals.user.email) {
			sendEmail(welcomeEmail(locals.user.email, name)).catch(e =>
				console.error('[onboarding] welcome email failed:', e)
			);
		}

		redirect(303, '/');
	},
};
