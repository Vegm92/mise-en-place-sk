import { asc, eq } from 'drizzle-orm';
import { db, forTenant, runAsSystem } from './db';
import { restaurants, userRestaurants, users } from './schema';
import { handleLoad } from './load-guard';
import { TIERS } from './billing';
import { listCategories } from './categories';
import { isBetaFeatureEnabled } from './feature-flags';
import { getSetting, putSetting } from './settings-store';
import { WHATSAPP_BOT_NUMBER, WHATSAPP_ENABLED, loadWhatsappPanel } from './whatsapp-settings';
import {
	ALERT_PREFERENCE_GROUPS,
	ALERT_PREFERENCE_TYPES,
	loadAlertPreferences,
	saveAlertPreferences,
} from './alert-preferences';
import { OPTIONAL_FIELDS, loadFieldVisibility, saveFieldVisibility } from './field-visibility';

const THRESHOLD_KEY   = 'budget_warning_threshold';
const PRICE_ALERT_KEY = 'price_alert_threshold';
const TUTORIAL_KEY    = 'tutorial_step';

const clampPercent = (value: number, fallback: number) =>
	Math.max(1, Math.min(99, Number.isFinite(value) && value ? value : fallback));

export function loadSettingsPage(locals: App.Locals) {
	const rid = locals.restaurantId!;
	const userId = locals.user!.id;
	const tdb = forTenant(rid);
	return handleLoad('settings', async () => {
		const [thresholdRaw, priceRaw, restaurantRow, membership, locationRows, entitlements, whatsapp, userRow, alertPreferences, multiLocationFlag, fieldVisibility, categoryRows] = await Promise.all([
			getSetting(rid, THRESHOLD_KEY),
			getSetting(rid, PRICE_ALERT_KEY),
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
				.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.userId, userId)))
				.limit(1),
			runAsSystem(() => db.select({ id: restaurants.id, name: restaurants.name })
				.from(userRestaurants)
				.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
				.where(eq(userRestaurants.userId, userId))
				.orderBy(asc(restaurants.name))),
			locals.entitlements(),
			loadWhatsappPanel(rid),
			db.select({ name: users.name, passwordHash: users.passwordHash, emailVerified: users.emailVerified })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1),
			loadAlertPreferences(rid),
			isBetaFeatureEnabled('multiLocation'),
			loadFieldVisibility(rid),
			listCategories(rid, { includeHidden: true }),
		]);

		const features     = entitlements?.features     ?? TIERS.trial.features;
		const maxLocations = entitlements?.maxLocations ?? TIERS.trial.maxLocations;
		const isOwner = membership[0]?.role === 'owner';

		return {
			threshold:      thresholdRaw !== null ? parseInt(thresholdRaw, 10)          : 80,
			priceThreshold: priceRaw     !== null ? Math.round(parseFloat(priceRaw) * 100) : 15,
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
			canRenameRestaurant: isOwner,
			categories: categoryRows.map((c) => ({ id: c.id, name: c.name, hidden: c.hidden, isDefault: c.isDefault })),
			canManageCategories: isOwner,
			locations: locationRows.map(loc => ({ ...loc, locked: locals.lockedRestaurantIds.includes(loc.id) })),
			multiLocation: features.multiLocation && multiLocationFlag,
			maxLocations,
			activeRestaurantId: rid,
			whatsappEnabled: WHATSAPP_ENABLED,
			whatsappContacts: whatsapp.contacts,
			canManageWhatsapp: isOwner,
			whatsappBotNumber: WHATSAPP_BOT_NUMBER,
			whatsappPairingCode: whatsapp.pairingCode,
		};
	});
}

export async function saveAlertSettings(restaurantId: string, form: FormData): Promise<void> {
	const prefs = Object.fromEntries(
		ALERT_PREFERENCE_TYPES.map(type => [type, form.has(`alert_${type}`)]),
	) as Record<(typeof ALERT_PREFERENCE_TYPES)[number], boolean>;

	await saveAlertPreferences(restaurantId, prefs);

	if (form.has('threshold')) {
		await putSetting(restaurantId, THRESHOLD_KEY, String(clampPercent(Number(form.get('threshold')), 80)));
	}
	if (form.has('priceThreshold')) {
		await putSetting(restaurantId, PRICE_ALERT_KEY, (clampPercent(Number(form.get('priceThreshold')), 15) / 100).toFixed(2));
	}
}

export async function saveFieldVisibilitySettings(restaurantId: string, form: FormData): Promise<void> {
	const prefs = Object.fromEntries(
		OPTIONAL_FIELDS.map(field => [field, form.has(`field_${field}`)]),
	) as Record<(typeof OPTIONAL_FIELDS)[number], boolean>;

	await saveFieldVisibility(restaurantId, prefs);
}

export async function restartTutorial(restaurantId: string): Promise<void> {
	await putSetting(restaurantId, TUTORIAL_KEY, '1');
}
