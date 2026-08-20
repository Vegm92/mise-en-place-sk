import { SvelteKitAuth } from '@auth/sveltekit';
import Credentials from '@auth/sveltekit/providers/credentials';
import Google from '@auth/sveltekit/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb } from './db';
import { users, accounts, sessions, verificationTokens } from './schema/auth';
import { verifyCredentials } from './auth-credentials';
import { recordConsent } from './consent';
import { checkTokenVersion } from './token-version';

const AUTH_SECRET = process.env.AUTH_SECRET ?? '';
const AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID ?? '';
const AUTH_GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET ?? '';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const { handle, signIn, signOut } = SvelteKitAuth(async () => ({
	trustHost: true,
	secret:    AUTH_SECRET,
	adapter:   DrizzleAdapter(getDb(), {
		usersTable:              users,
		accountsTable:           accounts,
		sessionsTable:           sessions,
		verificationTokensTable: verificationTokens,
	}),
	session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
	providers: [
		Credentials({
			credentials: { email: {}, password: {} },
			authorize: async (credentials) => {
				return verifyCredentials(String(credentials?.email ?? ''), String(credentials?.password ?? ''));
			},
		}),
		Google({
			clientId:     AUTH_GOOGLE_ID,
			clientSecret: AUTH_GOOGLE_SECRET,
			authorization: { params: { prompt: 'select_account' } },
		}),
	],
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.sub    = user.id;
				token.name   = user.name;
				token.email  = user.email;
				token.picture = user.image;
			}
			if (!token.sub) return token;

			const claimed = typeof token.tokenVersion === 'number' ? token.tokenVersion : undefined;
			const version = await checkTokenVersion(token.sub, claimed);
			if (version === null) return null;

			token.tokenVersion = version;
			return token;
		},
		session({ session, token }) {
			if (session.user && token.sub) session.user.id = token.sub;
			return session;
		},
	},
	events: {
		async createUser({ user }) {
			if (user.id) {
				await recordConsent(user.id, 'oauth_signup').catch(e =>
					console.error('[auth] oauth consent record failed:', e)
				);
			}
		},
	},
	pages: {
		signIn: '/login',
	},
}));
