import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { insertWaitlistEmail, getReferralCode, resolveReferralOwnerEmail } from './waitlist-db';
import { publicFormAction } from './public-form-action';
import { trackAnonymousEvent } from './events';
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '$lib/attribution';

const EMAIL_RE = /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]*[^\s@]$/;

const JoinWaitlistForm = v.object({
	email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
});

export const joinWaitlistAction = publicFormAction(
	{ limits: ({ ip }) => [{ key: `waitlist:${ip}`, max: 5 }], turnstile: true, schema: JoinWaitlistForm },
	async ({ data, event }) => {
		const email = data.email ?? '';

		if (!email) return fail(422, { error: 'required' });
		if (!EMAIL_RE.test(email)) return fail(422, { error: 'invalid' });

		const attribution = parseAttributionCookie(event.cookies.get(ATTRIBUTION_COOKIE));
		const referrerEmail = attribution.referredBy ? await resolveReferralOwnerEmail(attribution.referredBy) : null;
		const selfReferred = referrerEmail !== null && referrerEmail.toLowerCase() === email;
		const attributionForInsert = selfReferred ? { ...attribution, referredBy: null } : attribution;

		const inserted = await insertWaitlistEmail(email, attributionForInsert);

		if (!inserted) {
			return { success: true, alreadyRegistered: true, referralCode: await getReferralCode(email) };
		}

		trackAnonymousEvent('waitlist_joined', {
			source: attribution.source,
			campaign: attribution.campaign,
			variant: attribution.variant,
			segment: attribution.segment,
			referredBy: attributionForInsert.referredBy,
		});

		return { success: true, referralCode: await getReferralCode(email) };
	},
);
