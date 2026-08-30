import { getFlag, setFlag } from './app-flags';

export type BetaFeatureKey = 'recipes' | 'stock' | 'budgets' | 'multiLocation';

export interface BetaFeatureDef {
	key: BetaFeatureKey;
	nameKey: string;
	descriptionKey: string;
}

export const BETA_FEATURE_FLAGS: readonly BetaFeatureDef[] = [
	{ key: 'recipes', nameKey: 'admin.featureFlags.recipes.name', descriptionKey: 'admin.featureFlags.recipes.description' },
	{ key: 'stock', nameKey: 'admin.featureFlags.stock.name', descriptionKey: 'admin.featureFlags.stock.description' },
	{ key: 'budgets', nameKey: 'admin.featureFlags.budgets.name', descriptionKey: 'admin.featureFlags.budgets.description' },
	{ key: 'multiLocation', nameKey: 'admin.featureFlags.multiLocation.name', descriptionKey: 'admin.featureFlags.multiLocation.description' },
];

function betaFlagKey(key: BetaFeatureKey): string {
	return `beta_feature_${key}`;
}

export async function isBetaFeatureEnabled(key: BetaFeatureKey): Promise<boolean> {
	return (await getFlag(betaFlagKey(key))) === 'true';
}

export async function setBetaFeatureEnabled(key: BetaFeatureKey, enabled: boolean): Promise<void> {
	await setFlag(betaFlagKey(key), enabled ? 'true' : 'false');
}

export async function getBetaFeatureFlags(): Promise<Record<BetaFeatureKey, boolean>> {
	const entries = await Promise.all(
		BETA_FEATURE_FLAGS.map(async ({ key }) => [key, await isBetaFeatureEnabled(key)] as const)
	);
	return Object.fromEntries(entries) as Record<BetaFeatureKey, boolean>;
}
