import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { publicFormAction } from '$lib/server/public-form-action';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { sendVerificationEmail } from '$lib/server/verification-email';

export const ResendEmailForm = v.object({
	email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
});

export interface ResendVerificationOptions<T> {
	keyPrefix: string;
	shouldSend?: (email: string) => Promise<boolean>;
	result: (email: string, resent: boolean) => T;
}

export function resendVerificationAction<T>(options: ResendVerificationOptions<T>) {
	return publicFormAction({ schema: ResendEmailForm }, async ({ data, ip, event }) => {
		const email = data.email ?? '';
		if (!email) return fail(422, { error: 'missing' });

		if (!(await checkRateLimit(`${options.keyPrefix}:resend:${ip}`, 3))) {
			return options.result(email, false);
		}

		if (!options.shouldSend || (await options.shouldSend(email))) {
			await sendVerificationEmail(event.url, email);
		}

		return options.result(email, true);
	});
}
