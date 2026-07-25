import { fail, redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { restaurants, settings, subscriptions, userRestaurants } from '$lib/server/schema';
import { asc, eq } from 'drizzle-orm';
import { applyTierSettings, billingRestaurantId, getTierFeatures, TIERS, type PlanTier } from '$lib/server/billing';
import { randomBytes } from 'node:crypto';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';
import { checkRateLimit } from '$lib/server/rate-limiter';

const THRESHOLD_KEY   = 'budget_warning_threshold';
const PRICE_ALERT_KEY = 'price_alert_threshold';
const RESTAURANT_NAME_KEY = 'restaurant_name';

const MIN_PASSWORD_LENGTH = 8;

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('settings', async () => {
		const [row, priceRow, restaurantRow, membership, locationRows, features] = await Promise.all([
			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, THRESHOLD_KEY))),
			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, PRICE_ALERT_KEY))),
			db.select({ name: restaurants.name })
				.from(restaurants)
				.where(eq(restaurants.id, rid)),
			db.select({ role: userRestaurants.role })
				.from(userRestaurants)
				.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.userId, locals.user!.id)))
				.limit(1),
			// Locations this user belongs to (issue #290)
			db.select({ id: restaurants.id, name: restaurants.name })
				.from(userRestaurants)
				.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
				.where(eq(userRestaurants.userId, locals.user!.id))
				.orderBy(asc(restaurants.name)),
			getTierFeatures(rid),
		]);

		const billingRid = await billingRestaurantId(rid);
		const [subRow] = await db.select({ planTier: subscriptions.planTier })
			.from(subscriptions)
			.where(forTenant(billingRid).scope(subscriptions.restaurantId))
			.limit(1);
		const maxLocations = TIERS[(subRow?.planTier ?? 'trial') as PlanTier].maxLocations;

		return {
			title: 'nav.settings',
			threshold:      row[0]      ? parseInt(row[0].value, 10)          : 80,
			priceThreshold: priceRow[0] ? Math.round(parseFloat(priceRow[0].value) * 100) : 15,
			// Profile section (issue #293)
			profile: {
				name:  (locals.user!.user_metadata?.name as string | undefined) ?? '',
				email: locals.user!.email ?? '',
				// Google accounts have no password to change in this app.
				hasPassword: locals.user!.app_metadata?.provider === 'email',
			},
			restaurantName: restaurantRow[0]?.name ?? '',
			canRenameRestaurant: membership[0]?.role === 'owner',
			// Multi-location (issue #290)
			locations: locationRows,
			multiLocation: features.multiLocation,
			maxLocations,
			activeRestaurantId: rid,
		};
	});
};

export const actions: Actions = {
	saveThreshold: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const clamped = String(Math.max(1, Math.min(99, Number(data.get('value')) || 80)));

		await db.insert(settings)
			.values({ restaurantId: rid, key: THRESHOLD_KEY, value: clamped })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: clamped },
			});

		redirect(303, '/settings');
	},
	savePriceThreshold: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const stored = (Math.max(1, Math.min(99, Number(data.get('value')) || 15)) / 100).toFixed(2);

		await db.insert(settings)
			.values({ restaurantId: rid, key: PRICE_ALERT_KEY, value: stored })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: stored },
			});

		redirect(303, '/settings');
	},
	resetTutorial: async ({ locals }) => {
		const rid = locals.restaurantId!;
		await db.insert(settings)
			.values({ restaurantId: rid, key: 'tutorial_step', value: '1' })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: '1' },
			});
		redirect(303, '/');
	},

	// ── Profile (issue #293) ───────────────────────────────────────────────────

	/** Display name — stored in Supabase user_metadata, read by the layout. */
	saveName: async ({ request, locals }) => {
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(422, { section: 'name', error: 'set.profile.err.nameRequired' });
		if (name.length > 80) return fail(422, { section: 'name', error: 'set.profile.err.nameTooLong' });

		const { error } = await locals.supabase.auth.updateUser({ data: { name } });
		if (error) {
			console.error('[settings] name update failed:', error.message);
			return fail(400, { section: 'name', error: 'set.profile.err.generic' });
		}
		return { section: 'name', ok: 'set.profile.ok.name' };
	},

	/**
	 * Email change. Supabase sends a confirmation link to the *new* address (and,
	 * when "secure email change" is on, to the old one too); the address only
	 * changes once confirmed, so this reports "check your inbox", never "done".
	 */
	saveEmail: async ({ request, locals, url }) => {
		const data = await request.formData();
		const email = ((data.get('email') as string) ?? '').trim();
		if (!email) return fail(422, { section: 'email', error: 'set.profile.err.emailRequired' });
		if (email.toLowerCase() === (locals.user!.email ?? '').toLowerCase()) {
			return fail(422, { section: 'email', error: 'set.profile.err.emailUnchanged' });
		}

		const { error } = await locals.supabase.auth.updateUser(
			{ email },
			{ emailRedirectTo: `${url.origin}/auth/callback?next=/settings` },
		);
		if (error) {
			console.error('[settings] email update failed:', error.message);
			return fail(400, { section: 'email', error: 'set.profile.err.emailFailed' });
		}
		return { section: 'email', ok: 'set.profile.ok.email' };
	},

	/**
	 * Password change while signed in. The current password is re-verified first
	 * — an unattended session must not be enough to take over the account.
	 */
	changePassword: async ({ request, locals, getClientAddress }) => {
		const data = await request.formData();
		const current = (data.get('current') as string) ?? '';
		const next = (data.get('password') as string) ?? '';
		const confirm = (data.get('confirm') as string) ?? '';
		const email = locals.user!.email ?? '';

		if (!current || !next) return fail(422, { section: 'password', error: 'set.profile.err.passwordRequired' });
		if (next.length < MIN_PASSWORD_LENGTH) return fail(422, { section: 'password', error: 'set.profile.err.passwordShort' });
		if (next !== confirm) return fail(422, { section: 'password', error: 'set.profile.err.passwordMismatch' });

		// Same brute-force budget as the login form, keyed on the account.
		if (!(await checkRateLimit(`password-change:${locals.user!.id}`, 5))) {
			return fail(429, { section: 'password', error: 'set.profile.err.rateLimited' });
		}

		const { error: reauthError } = await locals.supabase.auth.signInWithPassword({ email, password: current });
		if (reauthError) {
			logAuthEvent('login_failed', { ipHash: hashIp(getClientAddress()), stage: 'password_change_reauth' });
			return fail(401, { section: 'password', error: 'set.profile.err.currentWrong' });
		}

		const { error } = await locals.supabase.auth.updateUser({ password: next });
		if (error) {
			console.error('[settings] password update failed:', error.message);
			return fail(400, { section: 'password', error: 'set.profile.err.passwordFailed' });
		}

		logAuthEvent('password_changed', { ipHash: hashIp(getClientAddress()) });
		return { section: 'password', ok: 'set.profile.ok.password' };
	},

	/**
	 * Add a location (issue #290). Business tier only, capped at the tier's
	 * maxLocations. The new restaurant is a child of the paying one, so it
	 * inherits the plan instead of starting its own trial, and the caller
	 * becomes its owner. Data stays fully separate — only billing is shared.
	 */
	addLocation: async ({ request, locals, cookies }) => {
		const rid = locals.restaurantId!;
		const userId = locals.user!.id;
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(422, { section: 'location', error: 'set.locations.err.nameRequired' });
		if (name.length > 120) return fail(422, { section: 'location', error: 'set.profile.err.restaurantTooLong' });

		const billingRid = await billingRestaurantId(rid);
		const [subRow] = await db.select({ planTier: subscriptions.planTier })
			.from(subscriptions)
			.where(forTenant(billingRid).scope(subscriptions.restaurantId))
			.limit(1);
		const tier = (subRow?.planTier ?? 'trial') as PlanTier;
		if (!TIERS[tier].features.multiLocation) {
			return fail(403, { section: 'location', error: 'set.locations.err.notAvailable' });
		}

		const existing = await db.select({ id: userRestaurants.restaurantId })
			.from(userRestaurants)
			.where(eq(userRestaurants.userId, userId));
		if (existing.length >= TIERS[tier].maxLocations) {
			return fail(403, { section: 'location', error: 'set.locations.err.limitReached' });
		}

		// Slug carries a random suffix for the same reason onboarding's does: two
		// restaurants may legitimately share a name.
		const slug = `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'local'}-${randomBytes(3).toString('hex')}`;

		const newId = await db.transaction(async (tx) => {
			const [created] = await tx.insert(restaurants)
				.values({ name, slug, parentId: billingRid })
				.returning({ id: restaurants.id });
			await tx.insert(userRestaurants).values({ userId, restaurantId: created.id, role: 'owner' });
			return created.id;
		});

		// Plan name/quota for the new location mirror the paying subscription.
		await applyTierSettings(newId, tier);

		// Switch to it — adding a location and then having to find the switcher
		// would be a strange place to stop.
		cookies.set('active_restaurant', newId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: 60 * 60 * 24 * 365,
		});
		redirect(303, '/');
	},

	/** Rename the restaurant. Owner-only; the slug stays fixed. */
	renameRestaurant: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(422, { section: 'restaurant', error: 'set.profile.err.restaurantRequired' });
		if (name.length > 120) return fail(422, { section: 'restaurant', error: 'set.profile.err.restaurantTooLong' });

		const tdb = forTenant(rid);
		const [membership] = await db.select({ role: userRestaurants.role })
			.from(userRestaurants)
			.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.userId, locals.user!.id)))
			.limit(1);
		if (membership?.role !== 'owner') {
			return fail(403, { section: 'restaurant', error: 'set.profile.err.notOwner' });
		}

		await db.update(restaurants).set({ name }).where(eq(restaurants.id, rid));
		// Keep the settings override in step so the header does not keep showing
		// the old name for tenants that have one.
		await db.update(settings)
			.set({ value: name })
			.where(tdb.scope(settings.restaurantId, eq(settings.key, RESTAURANT_NAME_KEY)));

		return { section: 'restaurant', ok: 'set.profile.ok.restaurant' };
	},
};
