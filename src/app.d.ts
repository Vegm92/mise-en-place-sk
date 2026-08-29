import type { Entitlements } from '$lib/server/billing';
import type { RecipeNode } from '$lib/server/recipes';
import type { Locale } from '$lib/i18n-messages';

declare global {
	namespace App {
		interface Locals {
			user:           { id: string; email: string; name: string | null; image: string | null } | null;
			restaurantId:   string | null;
			lockedRestaurantIds: string[];
			accessApproved: boolean;
			entitlements:   () => Promise<Entitlements | null>;
			recipeGraphCache: { rid: string; graph: Map<number, RecipeNode> } | null;
			locale:         Locale;
		}
	}
}

export {};
