import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { ActionOutcome } from '$lib/server/action-outcome';
import { changePassword, requestEmailChange } from '$lib/server/account-security';
import { createCategory, renameCategory as renameCategoryRow, setCategoryHidden as setCategoryHiddenRow } from '$lib/server/categories';
import { addLocation, renameRestaurant, requireOwner, saveFiscalIdentity } from '$lib/server/restaurant-admin';
import { loadSettingsPage, restartTutorial, saveAlertSettings, saveFieldVisibilitySettings } from '$lib/server/settings-page';
import {
	inviteWhatsappContact,
	issuePairingCode,
	releaseWhatsappContact,
	revokePairingCode,
} from '$lib/server/whatsapp-settings';

const CATEGORY_ERRORS = {
	duplicate: 'set.categories.err.duplicate',
	invalid:   'set.categories.err.invalid',
	reserved:  'set.categories.err.reserved',
} as const;

const respond = (section: string, outcome: ActionOutcome) =>
	'error' in outcome
		? fail(outcome.status, { section, error: outcome.error })
		: { section, ok: outcome.ok };

const activeRestaurant = (locals: App.Locals) => locals.restaurantId ?? redirect(303, '/onboarding');

export const load: PageServerLoad = async ({ locals }) => ({
	title: 'nav.settings',
	...(await loadSettingsPage(locals)),
});

export const actions: Actions = {
	saveAlertPreferences: async ({ request, locals }) => {
		await saveAlertSettings(locals.restaurantId!, await request.formData());
		redirect(303, '/settings');
	},
	saveFieldVisibility: async ({ request, locals }) => {
		await saveFieldVisibilitySettings(locals.restaurantId!, await request.formData());
		return { section: 'campos', ok: 'set.fields.saved' };
	},
	resetTutorial: async ({ locals }) => {
		await restartTutorial(locals.restaurantId!);
		redirect(303, '/');
	},

	saveEmail: async ({ request, locals, url }) =>
		respond('email', await requestEmailChange(locals.user!, await request.formData(), url)),

	changePassword: async ({ request, locals, getClientAddress, cookies, url }) =>
		respond('password', await changePassword(locals.user!, await request.formData(), {
			clientAddress: getClientAddress(),
			cookies,
			isHttps: url.protocol === 'https:',
		})),

	addLocation: async ({ request, locals, cookies }) => {
		const rid = activeRestaurant(locals);
		const outcome = await addLocation(
			{ restaurantId: rid, userId: locals.user!.id, entitlements: locals.entitlements },
			await request.formData(),
			cookies,
		);
		if ('error' in outcome) return respond('location', outcome);
		redirect(303, '/');
	},

	renameRestaurant: async ({ request, locals }) =>
		respond('restaurant', await renameRestaurant(activeRestaurant(locals), locals.user!.id, await request.formData())),

	addCategory: withCategoryOwner(async (rid, data) => {
		const result = await createCategory(rid, ((data.get('name') as string) ?? '').trim());
		if (!result.ok) return fail(422, { section: 'categorias', error: CATEGORY_ERRORS[result.reason] });

		return { section: 'categorias', ok: 'set.categories.ok.added' };
	}),

	renameCategory: withCategoryOwner(async (rid, data) => {
		const id = requiredCategoryId(data);
		if (id === null) return fail(422, { section: 'categorias', error: 'set.categories.err.invalid' });

		const result = await renameCategoryRow(rid, id, ((data.get('name') as string) ?? '').trim());
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
		const rid = activeRestaurant(locals);
		return respond('fiscal', await saveFiscalIdentity(rid, locals.user!.id, await request.formData()));
	},

	addWhatsappContact: async ({ request, locals }) =>
		respond('whatsapp', await inviteWhatsappContact(activeRestaurant(locals), locals.user!.id, await request.formData())),

	removeWhatsappContact: async ({ request, locals }) =>
		respond('whatsapp', await releaseWhatsappContact(activeRestaurant(locals), locals.user!.id, await request.formData())),

	generateWhatsappPairingCode: async ({ request, locals }) =>
		respond('whatsapp', await issuePairingCode(activeRestaurant(locals), locals.user!.id, await request.formData())),

	revokeWhatsappPairingCode: async ({ locals }) =>
		respond('whatsapp', await revokePairingCode(activeRestaurant(locals), locals.user!.id)),
};

function withCategoryOwner<T>(handler: (rid: string, data: FormData) => Promise<T>) {
	return async ({ request, locals }: { request: Request; locals: App.Locals }) => {
		const rid = activeRestaurant(locals);
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
