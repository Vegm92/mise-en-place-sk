import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from '$env/dynamic/private';
import { db } from './db';
import * as schema from './schema';

const allowedEmails = env.AUTH_ALLOWED_EMAILS
	? env.AUTH_ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
	: [];

export const auth = betterAuth({
	secret:  env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:5173',
	database: drizzleAdapter(db, {
		provider: 'sqlite',
		schema: {
			user:         schema.user,
			session:      schema.session,
			verification: schema.verification,
			account:      schema.account,
		},
	}),
	emailAndPassword: {
		enabled:       true,
		autoSignIn:    false,
		disableSignUp: true,
	},
	socialProviders: {
		google: {
			clientId:     env.GOOGLE_CLIENT_ID     ?? '',
			clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
		},
	},
	// If AUTH_ALLOWED_EMAILS is set, block any account not on the list.
	// Applies to both Google OAuth and future social providers.
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					if (allowedEmails.length === 0) return;
					if (!allowedEmails.includes(user.email.toLowerCase())) {
						throw new Error('This email is not authorised to access this app.');
					}
				},
			},
		},
	},
	session: {
		expiresIn:  60 * 60 * 24 * 7,
		updateAge:  60 * 60 * 24,
		cookieCache: { enabled: true, maxAge: 5 * 60 },
	},
	trustedOrigins: [env.BETTER_AUTH_URL ?? 'http://localhost:5173'],
});
