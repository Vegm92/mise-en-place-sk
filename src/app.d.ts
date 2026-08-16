declare global {
	namespace App {
		interface Locals {
			user:           { id: string; email: string; name: string | null; image: string | null } | null;
			restaurantId:   string | null;
			accessApproved: boolean;
		}
	}
}

export {};
