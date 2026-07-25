import { fail, redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { restaurants, settings, userRestaurants } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
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
		const [row, priceRow, restaurantRow, membership] = await Promise.all([
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
		]);

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
