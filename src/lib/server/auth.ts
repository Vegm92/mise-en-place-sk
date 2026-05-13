import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from '$env/dynamic/private';
import { db } from './db';
import * as schema from './schema';

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
	session: {
		expiresIn:  60 * 60 * 24 * 7,
		updateAge:  60 * 60 * 24,
		cookieCache: { enabled: true, maxAge: 5 * 60 },
	},
	trustedOrigins: [env.BETTER_AUTH_URL ?? 'http://localhost:5173'],
});
