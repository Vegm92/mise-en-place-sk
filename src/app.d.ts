import type { Entitlements } from '$lib/server/billing';

declare global {
	namespace App {
		interface Locals {
			user:           { id: string; email: string; name: string | null; image: string | null } | null;
			restaurantId:   string | null;
			lockedRestaurantIds: string[];
			accessApproved: boolean;
			entitlements:   () => Promise<Entitlements | null>;
		}
	}
}

export {};
