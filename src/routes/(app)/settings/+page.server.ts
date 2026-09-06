import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant, runAsSystem, runWithTenantContext } from '$lib/server/db';
import { restaurants, settings, userRestaurants } from '$lib/server/schema';
import { users } from '$lib/server/schema';
import { asc, eq, sql } from 'drizzle-orm';
import { applyTierSettings, BILLING_PARENT, TIERS } from '$lib/server/billing';
import {
	createCategory,
	listCategories,
	renameCategory as renameCategoryRow,
	seedDefaultCategories,
	setCategoryHidden as setCategoryHiddenRow,
} from '$lib/server/categories';
import { isBetaFeatureEnabled } from '$lib/server/feature-flags';
import { randomBytes } from 'node:crypto';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { verifyCredentials } from '$lib/server/auth-credentials';
import { passwordPolicyError } from '$lib/server/password-policy';
import { createVerificationToken } from '$lib/server/verification-token';
import { issueSessionCookie } from '$lib/server/auth-session';
import { sendEmail, changeEmailAddress } from '$lib/server/email';
import { listContacts, removeContact } from '$lib/server/whatsapp-contacts';
import { WHATSAPP_ACCESS_TOKEN, WHATSAPP_DISPLAY_NUMBER, WHATSAPP_PHONE_NUMBER_ID } from '$lib/server/env';
import { formatPhoneNumber, normalizePhoneNumber, waMeLink } from '$lib/phone';
import { isValidSpanishTaxId, normalizeTaxId } from '$lib/tax-id';
import { renderQrSvg } from '$lib/server/qr-svg';
import { activePairingCode, generatePairingCode, revokePairingCodes } from '$lib/server/whatsapp-pairing';
import {
	ALERT_PREFERENCE_GROUPS,
	ALERT_PREFERENCE_TYPES,
	loadAlertPreferences,
	saveAlertPreferences as persistAlertPreferences,
} from '$lib/server/alert-preferences';
import {
	OPTIONAL_FIELDS,
	loadFieldVisibility,
	saveFieldVisibility as persistFieldVisibility,
} from '$lib/server/field-visibility';

const THRESHOLD_KEY   = 'budget_warning_threshold';
const PRICE_ALERT_KEY = 'price_alert_threshold';

const CATEGORY_ERRORS = {
	duplicate: 'set.categories.err.duplicate',
	invalid:   'set.categories.err.invalid',
	reserved:  'set.categories.err.reserved',
} as const;

const WHATSAPP_ENABLED = Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);

const WHATSAPP_BOT_NUMBER = (() => {
	if (!WHATSAPP_ENABLED || !WHATSAPP_DISPLAY_NUMBER) return null;
	const normalized = normalizePhoneNumber(WHATSAPP_DISPLAY_NUMBER);
	if (!normalized.ok) {
		console.warn(`[settings] WHATSAPP_DISPLAY_NUMBER is not a usable phone number (${normalized.reason}) — hiding the click-to-chat block`);
		return null;
	}
	const link = waMeLink(normalized.phone);
	return {
		display: formatPhoneNumber(normalized.phone),
		link,
		qrSvg: renderQrSvg(link),
	};
})();

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('settings', async () => {
		const [row, priceRow, restaurantRow, membership, locationRows, entitlements, whatsappContactRows, pairingCode, userRow, alertPreferences, multiLocationFlag, fieldVisibility, categoryRows] = await Promise.all([
			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, THRESHOLD_KEY))),
			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, PRICE_ALERT_KEY))),
			db.select({
				name: restaurants.name,
				legalName: restaurants.legalName,
				tradeName: restaurants.tradeName,
				cifNif: restaurants.cifNif,
				fiscalAddress: restaurants.fiscalAddress,
				phone: restaurants.phone,
			})
				.from(restaurants)
				.where(eq(restaurants.id, rid)),
			db.select({ role: userRestaurants.role })
				.from(userRestaurants)
				.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.userId, locals.user!.id)))
				.limit(1),
			runAsSystem(() => db.select({ id: restaurants.id, name: restaurants.name })
				.from(userRestaurants)
				.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
				.where(eq(userRestaurants.userId, locals.user!.id))
				.orderBy(asc(restaurants.name))),
			locals.entitlements(),
			WHATSAPP_ENABLED ? listContacts(rid) : Promise.resolve([]),
			WHATSAPP_ENABLED ? activePairingCode(rid) : Promise.resolve(null),
			db.select({ name: users.name, passwordHash: users.passwordHash, emailVerified: users.emailVerified })
				.from(users)
				.where(eq(users.id, locals.user!.id))
				.limit(1),
			loadAlertPreferences(rid),
			isBetaFeatureEnabled('multiLocation'),
			loadFieldVisibility(rid),
			listCategories(rid, { includeHidden: true }),
		]);

		const features     = entitlements?.features     ?? TIERS.trial.features;
		const maxLocations = entitlements?.maxLocations ?? TIERS.trial.maxLocations;

		return {
			title: 'nav.settings',
			threshold:      row[0]      ? parseInt(row[0].value, 10)          : 80,
			priceThreshold: priceRow[0] ? Math.round(parseFloat(priceRow[0].value) * 100) : 15,
			alertPreferences,
			alertGroups: ALERT_PREFERENCE_GROUPS.map(group => ({ id: group.id, types: [...group.types] })),
			fieldVisibility,
			optionalFields: [...OPTIONAL_FIELDS],
			profile: {
				name:  userRow[0]?.name ?? '',
				email: locals.user!.email,
				hasPassword: Boolean(userRow[0]?.passwordHash),
				emailVerified: Boolean(userRow[0]?.emailVerified),
			},
			restaurantName: restaurantRow[0]?.name ?? '',
			fiscalIdentity: {
				legalName: restaurantRow[0]?.legalName ?? '',
				tradeName: restaurantRow[0]?.tradeName ?? '',
				cifNif: restaurantRow[0]?.cifNif ?? '',
				fiscalAddress: restaurantRow[0]?.fiscalAddress ?? '',
				phone: restaurantRow[0]?.phone ?? '',
			},
			canRenameRestaurant: membership[0]?.role === 'owner',
			categories: categoryRows.map((c) => ({ id: c.id, name: c.name, hidden: c.hidden, isDefault: c.isDefault })),
			canManageCategories: membership[0]?.role === 'owner',
			locations: locationRows.map(loc => ({ ...loc, locked: locals.lockedRestaurantIds.includes(loc.id) })),
			multiLocation: features.multiLocation && multiLocationFlag,
			maxLocations,
			activeRestaurantId: rid,
			whatsappEnabled: WHATSAPP_ENABLED,
			whatsappContacts: whatsappContactRows,
			canManageWhatsapp: membership[0]?.role === 'owner',
			whatsappBotNumber: WHATSAPP_BOT_NUMBER,
			whatsappPairingCode: pairingCode,
		};
	});
};

const clampPercent = (value: number, fallback: number) =>
	Math.max(1, Math.min(99, Number.isFinite(value) && value ? value : fallback));

async function putSetting(restaurantId: string, key: string, value: string) {
	await db.insert(settings)
		.values({ restaurantId, key, value })
		.onConflictDoUpdate({ target: [settings.restaurantId, settings.key], set: { value } });
}

export const actions: Actions = {
	saveAlertPreferences: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const prefs = Object.fromEntries(
			ALERT_PREFERENCE_TYPES.map(type => [type, data.has(`alert_${type}`)]),
		) as Record<(typeof ALERT_PREFERENCE_TYPES)[number], boolean>;

		await persistAlertPreferences(rid, prefs);

		if (data.has('threshold')) {
			await putSetting(rid, THRESHOLD_KEY, String(clampPercent(Number(data.get('threshold')), 80)));
		}
		if (data.has('priceThreshold')) {
			await putSetting(rid, PRICE_ALERT_KEY, (clampPercent(Number(data.get('priceThreshold')), 15) / 100).toFixed(2));
		}

		redirect(303, '/settings');
	},
	saveFieldVisibility: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const prefs = Object.fromEntries(
			OPTIONAL_FIELDS.map(field => [field, data.has(`field_${field}`)]),
		) as Record<(typeof OPTIONAL_FIELDS)[number], boolean>;

		await persistFieldVisibility(rid, prefs);
		return { section: 'campos', ok: 'set.fields.saved' };
	},
	resetTutorial: async ({ locals }) => {
		const rid = locals.restaurantId!;
		await putSetting(rid, 'tutorial_step', '1');
		redirect(303, '/');
	},


	saveEmail: async ({ request, locals, url }) => {
		const data = await request.formData();
		const email = ((data.get('email') as string) ?? '').trim().toLowerCase();
		if (!email) return fail(422, { section: 'email', error: 'set.profile.err.emailRequired' });
		if (email === locals.user!.email.toLowerCase()) {
			return fail(422, { section: 'email', error: 'set.profile.err.emailUnchanged' });
		}

		if (!(await checkRateLimit(`email-change:user:${locals.user!.id}`, 5))) {
			return fail(429, { section: 'email', error: 'set.profile.err.rateLimited' });
		}
		if (!(await checkRateLimit(`email-change:address:${email}`, 5))) {
			return fail(429, { section: 'email', error: 'set.profile.err.rateLimited' });
		}

		const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
		if (taken) return fail(400, { section: 'email', error: 'set.profile.err.emailFailed' });

		const token = await createVerificationToken(`change-email:${locals.user!.id}:${email}`);
		const confirmUrl = `${url.origin}/settings/confirm-email?email=${encodeURIComponent(email)}&token=${token}`;
		await sendEmail(changeEmailAddress(email, confirmUrl));

		return { section: 'email', ok: 'set.profile.ok.email' };
	},

	changePassword: async ({ request, locals, getClientAddress, cookies, url }) => {
		const data = await request.formData();
		const current = (data.get('current') as string) ?? '';
		const next = (data.get('password') as string) ?? '';
		const confirm = (data.get('confirm') as string) ?? '';
		const email = locals.user!.email;

		if (!current || !next) return fail(422, { section: 'password', error: 'set.profile.err.passwordRequired' });
		const policyError = passwordPolicyError(next);
		if (policyError === 'tooShort') return fail(422, { section: 'password', error: 'set.profile.err.passwordShort' });
		if (policyError === 'tooLong') return fail(422, { section: 'password', error: 'set.profile.err.passwordLong' });
		if (next !== confirm) return fail(422, { section: 'password', error: 'set.profile.err.passwordMismatch' });

		if (!(await rateLimitScoped({ scope: 'user', name: 'password-change', max: 5 }, { userId: locals.user!.id }))) {
			return fail(429, { section: 'password', error: 'set.profile.err.rateLimited' });
		}

		const reauthed = await verifyCredentials(email, current);
		if (!reauthed) {
			logAuthEvent('login_failed', { ipHash: hashIp(getClientAddress()), stage: 'password_change_reauth' });
			return fail(401, { section: 'password', error: 'set.profile.err.currentWrong' });
		}

		const passwordHash = await bcrypt.hash(next, 12);
		await db.update(users)
			.set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` })
			.where(eq(users.id, locals.user!.id));

		await issueSessionCookie(cookies, url.protocol === 'https:', locals.user!);

		logAuthEvent('password_changed', { ipHash: hashIp(getClientAddress()) });
		return { section: 'password', ok: 'set.profile.ok.password' };
	},

	addLocation: async ({ request, locals, cookies }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		const userId = locals.user!.id;
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(422, { section: 'location', error: 'set.locations.err.nameRequired' });
		if (name.length > 120) return fail(422, { section: 'location', error: 'set.profile.err.restaurantTooLong' });

		if (!(await requireOwner(rid, userId))) {
			return fail(403, { section: 'location', error: 'set.locations.err.notOwner' });
		}

		const entitlements = await locals.entitlements();
		const { billingRestaurantId: billingRid, tier, features, maxLocations } = entitlements
			?? { billingRestaurantId: rid, tier: 'trial' as const, features: TIERS.trial.features, maxLocations: TIERS.trial.maxLocations };
		if (!features.multiLocation || !(await isBetaFeatureEnabled('multiLocation'))) {
			return fail(403, { section: 'location', error: 'set.locations.err.notAvailable' });
		}

		const slug = `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'local'}-${randomBytes(3).toString('hex')}`;

		let newId: string;
		try {
			newId = await db.transaction(async (tx) => {
				await tx.execute(sql`SET LOCAL app.admin = 'true'`);
				await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'loc:' + billingRid}))`);

				const [{ cnt }] = await tx.select({ cnt: sql<number>`count(*)::int` })
					.from(restaurants)
					.where(eq(BILLING_PARENT, billingRid));
				if (Number(cnt) >= maxLocations) throw new LocationLimitReachedError();

				const [created] = await tx.insert(restaurants)
					.values({ name, slug, parentId: billingRid })
					.returning({ id: restaurants.id });
				await tx.insert(userRestaurants).values({ userId, restaurantId: created.id, role: 'owner' });
				await seedDefaultCategories(created.id, tx);
				return created.id;
			});
		} catch (err) {
			if (err instanceof LocationLimitReachedError) {
				return fail(403, { section: 'location', error: 'set.locations.err.limitReached' });
			}
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
		redirect(303, '/');
	},

	renameRestaurant: async ({ request, locals }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(422, { section: 'restaurant', error: 'set.profile.err.restaurantRequired' });
		if (name.length > 120) return fail(422, { section: 'restaurant', error: 'set.profile.err.restaurantTooLong' });

		if (!(await requireOwner(rid, locals.user!.id))) {
			return fail(403, { section: 'restaurant', error: 'set.profile.err.notOwner' });
		}

		await db.update(restaurants).set({ name }).where(eq(restaurants.id, rid));

		return { section: 'restaurant', ok: 'set.profile.ok.restaurant' };
	},

	addCategory: withCategoryOwner(async (rid, data) => {
		const name = ((data.get('name') as string) ?? '').trim();
		const result = await createCategory(rid, name);
		if (!result.ok) return fail(422, { section: 'categorias', error: CATEGORY_ERRORS[result.reason] });

		return { section: 'categorias', ok: 'set.categories.ok.added' };
	}),

	renameCategory: withCategoryOwner(async (rid, data) => {
		const id = requiredCategoryId(data);
		if (id === null) return fail(422, { section: 'categorias', error: 'set.categories.err.invalid' });

		const name = ((data.get('name') as string) ?? '').trim();
		const result = await renameCategoryRow(rid, id, name);
		if (!result.ok) return fail(422, { section: 'categorias', error: CATEGORY_ERRORS[result.reason] });

		return { section: 'categorias', ok: 'set.categories.ok.renamed' };
	}),

	setCategoryHidden: withCategoryOwner(async (rid, data) => {
		const id = requiredCategoryId(data);
		if (id === null) return fail(422, { section: 'categorias', error: 'set.categories.err.invalid' });

		const hidden = data.get('hidden') === '1';
		await setCategoryHiddenRow(rid, id, hidden);
		return { section: 'categorias', ok: hidden ? 'set.categories.ok.hidden' : 'set.categories.ok.shown' };
	}),

	saveFiscalIdentity: async ({ request, locals }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		if (!(await requireOwner(rid, locals.user!.id))) {
			return fail(403, { section: 'fiscal', error: 'set.fiscal.err.notOwner' });
		}

		const data = await request.formData();
		const legalName = ((data.get('legalName') as string) ?? '').trim();
		const tradeName = ((data.get('tradeName') as string) ?? '').trim();
		const fiscalAddress = ((data.get('fiscalAddress') as string) ?? '').trim();
		const cifNif = normalizeTaxId((data.get('cifNif') as string) ?? '');
		const phone = ((data.get('phone') as string) ?? '').trim();

		if (legalName.length > 200) return fail(422, { section: 'fiscal', error: 'set.fiscal.err.legalNameTooLong' });
		if (tradeName.length > 200) return fail(422, { section: 'fiscal', error: 'set.fiscal.err.tradeNameTooLong' });
		if (fiscalAddress.length > 300) return fail(422, { section: 'fiscal', error: 'set.fiscal.err.addressTooLong' });
		if (cifNif && !isValidSpanishTaxId(cifNif)) return fail(422, { section: 'fiscal', error: 'set.fiscal.err.taxId' });
		if (phone.length > 40) return fail(422, { section: 'fiscal', error: 'set.fiscal.err.phoneTooLong' });

		await db.update(restaurants)
			.set({ legalName: legalName || null, tradeName: tradeName || null, cifNif, fiscalAddress: fiscalAddress || null, phone: phone || null })
			.where(eq(restaurants.id, rid));

		return { section: 'fiscal', ok: 'set.fiscal.ok.saved' };
	},

	addWhatsappContact: async ({ request, locals }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		if (!WHATSAPP_ENABLED) return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.disabled' });

		if (!(await requireOwner(rid, locals.user!.id))) {
			return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.notOwner' });
		}

		const data = await request.formData();
		const phone = ((data.get('phone') as string) ?? '').trim();
		const name  = ((data.get('name')  as string) ?? '').trim();
		if (!phone) return fail(422, { section: 'whatsapp', error: 'set.whatsapp.err.invalid' });
		if (name.length > 80) return fail(422, { section: 'whatsapp', error: 'set.whatsapp.err.nameTooLong' });

		const result = await generatePairingCode(rid, locals.user!.id, name, phone);
		if (!result.ok) {
			const errors = {
				invalid:     'set.whatsapp.err.invalid',
				tooShort:    'set.whatsapp.err.tooShort',
				tooLong:     'set.whatsapp.err.tooLong',
				rateLimited: 'set.whatsapp.err.pairRateLimited',
				error:       'set.whatsapp.err.pairFailed',
			} as const;
			return fail(result.reason === 'rateLimited' ? 429 : 422, { section: 'whatsapp', error: errors[result.reason] });
		}

		return { section: 'whatsapp', ok: 'set.whatsapp.ok.invited' };
	},

	removeWhatsappContact: async ({ request, locals }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		if (!WHATSAPP_ENABLED) return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.disabled' });

		if (!(await requireOwner(rid, locals.user!.id))) {
			return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.notOwner' });
		}

		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!Number.isInteger(id)) return fail(422, { section: 'whatsapp', error: 'set.whatsapp.err.invalid' });

		await removeContact(rid, id, locals.user!.id);
		return { section: 'whatsapp', ok: 'set.whatsapp.ok.removed' };
	},

	generateWhatsappPairingCode: async ({ request, locals }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		if (!WHATSAPP_ENABLED) return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.disabled' });

		if (!(await requireOwner(rid, locals.user!.id))) {
			return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.notOwner' });
		}

		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (name.length > 80) return fail(422, { section: 'whatsapp', error: 'set.whatsapp.err.nameTooLong' });

		const result = await generatePairingCode(rid, locals.user!.id, name);
		if (!result.ok) {
			return fail(result.reason === 'rateLimited' ? 429 : 500, {
				section: 'whatsapp',
				error: result.reason === 'rateLimited' ? 'set.whatsapp.err.pairRateLimited' : 'set.whatsapp.err.pairFailed',
			});
		}

		return { section: 'whatsapp', ok: 'set.whatsapp.ok.pairGenerated' };
	},

	revokeWhatsappPairingCode: async ({ locals }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		if (!WHATSAPP_ENABLED) return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.disabled' });

		if (!(await requireOwner(rid, locals.user!.id))) {
			return fail(403, { section: 'whatsapp', error: 'set.whatsapp.err.notOwner' });
		}

		await revokePairingCodes(rid);
		return { section: 'whatsapp', ok: 'set.whatsapp.ok.pairRevoked' };
	},
};

class LocationLimitReachedError extends Error {}

async function requireOwner(restaurantId: string, userId: string): Promise<boolean> {
	const [membership] = await db.select({ role: userRestaurants.role })
		.from(userRestaurants)
		.where(forTenant(restaurantId).scope(userRestaurants.restaurantId, eq(userRestaurants.userId, userId)))
		.limit(1);
	return membership?.role === 'owner';
}

function withCategoryOwner<T>(handler: (rid: string, data: FormData) => Promise<T>) {
	return async ({ request, locals }: { request: Request; locals: App.Locals }) => {
		const rid = locals.restaurantId;
		if (!rid) redirect(303, '/onboarding');
		if (!(await requireOwner(rid, locals.user!.id))) {
			return fail(403, { section: 'categorias', error: 'set.categories.err.notOwner' });
		}
		return handler(rid, await request.formData());
	};
}

function requiredCategoryId(data: FormData): number | null {
	const id = Number(data.get('id'));
	return Number.isInteger(id) ? id : null;
}
