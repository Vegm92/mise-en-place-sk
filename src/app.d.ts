// See https://svelte.dev/docs/kit/types#app.d.ts
import type { auth } from '$lib/server/auth';

type Session = typeof auth.$Infer.Session.session;
type User    = typeof auth.$Infer.Session.user;

declare global {
	namespace App {
		interface Locals {
			user:    User    | null;
			session: Session | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
