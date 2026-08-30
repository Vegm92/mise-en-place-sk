import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isAdminUser } from '$lib/server/admin';
import { safe } from '$lib/server/load-guard';
import {
	BETA_FEATURE_FLAGS,
	getBetaFeatureFlags,
	setBetaFeatureEnabled,
	type BetaFeatureKey,
} from '$lib/server/feature-flags';

const FLAG_KEYS = new Set<string>(BETA_FEATURE_FLAGS.map(f => f.key));

const ALL_DISABLED = Object.fromEntries(
	BETA_FEATURE_FLAGS.map(f => [f.key, false])
) as Record<BetaFeatureKey, boolean>;

export const load: PageServerLoad = async () => {
	const flags = await safe('admin/feature-flags', () => getBetaFeatureFlags(), ALL_DISABLED);

	return {
		title: 'admin.featureFlags.title',
		definitions: BETA_FEATURE_FLAGS,
		flags,
	};
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		const key = (data.get('key') as string ?? '').trim();
		if (!FLAG_KEYS.has(key)) return fail(422, { error: 'unknown_flag' });

		await setBetaFeatureEnabled(key as BetaFeatureKey, data.get('enabled') === 'true');
		return { success: true };
	},
};
