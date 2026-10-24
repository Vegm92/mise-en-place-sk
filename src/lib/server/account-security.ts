import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db';
import { users } from './schema';
import { type ActionOutcome, reject, succeed } from './action-outcome';
import { logAuthEvent, hashIp } from './auth-events';
import { checkRateLimit, RateLimitBackendUnavailableError } from './rate-limiter';
import { rateLimitScoped } from './rate-limit-scope';
import { verifyCredentials } from './auth-credentials';
import { passwordPolicyError } from './password-policy';
import { createVerificationToken } from './verification-token';
import { issueSessionCookie } from './auth-session';
import { sendEmail, changeEmailAddress } from './email';
import { siteOrigin } from './site-origin';

type SessionUser = NonNullable<App.Locals['user']>;

export async function requestEmailChange(user: SessionUser, form: FormData, url: URL): Promise<ActionOutcome> {
	const email = ((form.get('email') as string) ?? '').trim().toLowerCase();
	if (!email) return reject(422, 'set.profile.err.emailRequired');
	if (email === user.email.toLowerCase()) return reject(422, 'set.profile.err.emailUnchanged');

	try {
		if (!(await checkRateLimit(`email-change:user:${user.id}`, 5, undefined, { authCritical: true }))) {
			return reject(429, 'set.profile.err.rateLimited');
		}
		if (!(await checkRateLimit(`email-change:address:${email}`, 5, undefined, { authCritical: true }))) {
			return reject(429, 'set.profile.err.rateLimited');
		}
	} catch (e) {
		if (!(e instanceof RateLimitBackendUnavailableError)) throw e;
		return reject(503, 'set.profile.err.serviceUnavailable');
	}

	const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (taken) return reject(400, 'set.profile.err.emailFailed');

	const token = await createVerificationToken(`change-email:${user.id}:${email}`);
	const confirmUrl = `${siteOrigin(url)}/settings/confirm-email?email=${encodeURIComponent(email)}&token=${token}`;
	await sendEmail(changeEmailAddress(email, confirmUrl));

	return succeed('set.profile.ok.email');
}

export async function changePassword(
	user: SessionUser,
	form: FormData,
	ctx: { clientAddress: string; cookies: Cookies; isHttps: boolean },
): Promise<ActionOutcome> {
	const current = (form.get('current') as string) ?? '';
	const next = (form.get('password') as string) ?? '';
	const confirm = (form.get('confirm') as string) ?? '';

	if (!current || !next) return reject(422, 'set.profile.err.passwordRequired');
	const policyError = passwordPolicyError(next);
	if (policyError === 'tooShort') return reject(422, 'set.profile.err.passwordShort');
	if (policyError === 'tooLong') return reject(422, 'set.profile.err.passwordLong');
	if (next !== confirm) return reject(422, 'set.profile.err.passwordMismatch');

	if (!(await rateLimitScoped({ scope: 'user', name: 'password-change', max: 5 }, { userId: user.id }))) {
		return reject(429, 'set.profile.err.rateLimited');
	}

	const reauthed = await verifyCredentials(user.email, current);
	if (!reauthed) {
		logAuthEvent('login_failed', { ipHash: hashIp(ctx.clientAddress), stage: 'password_change_reauth' });
		return reject(401, 'set.profile.err.currentWrong');
	}

	const passwordHash = await bcrypt.hash(next, 12);
	await db.update(users)
		.set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` })
		.where(eq(users.id, user.id));

	await issueSessionCookie(ctx.cookies, ctx.isHttps, user);

	logAuthEvent('password_changed', { ipHash: hashIp(ctx.clientAddress) });
	return succeed('set.profile.ok.password');
}
