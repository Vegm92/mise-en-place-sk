import { fail } from '@sveltejs/kit';
import { countWaitlistEmails, insertWaitlistEmail } from '$lib/server/waitlist-db';
import { publicFormAction } from '$lib/server/public-form-action';
import { trackAnonymousEvent } from '$lib/server/events';
import {
  ATTRIBUTION_COOKIE,
  hasAttributionSignal,
  parseAttribution,
  parseAttributionCookie,
  serializeAttribution,
} from '$lib/attribution';
import type { Actions, PageServerLoad } from './$types';

const EMAIL_RE = /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]*[^\s@]$/;
const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const load: PageServerLoad = async ({ url, request, cookies }) => {
  const spotTaken = await countWaitlistEmails();

  const incoming = parseAttribution(url, request.headers.get('referer'));
  const existing = cookies.get(ATTRIBUTION_COOKIE);
  if (!existing || hasAttributionSignal(incoming)) {
    cookies.set(ATTRIBUTION_COOKIE, serializeAttribution(incoming), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ATTRIBUTION_COOKIE_MAX_AGE,
    });
  }

  return { canonicalUrl: `${url.origin}/waitlist`, spotTaken };
};

export const actions: Actions = {
  join: publicFormAction(
    { limits: ({ ip }) => [{ key: `waitlist:${ip}`, max: 5 }], turnstile: true },
    async ({ form, event }) => {
      const email = (form.get('email') as string ?? '').trim().toLowerCase();

      if (!email) return fail(422, { error: 'required' });
      if (!EMAIL_RE.test(email)) return fail(422, { error: 'invalid' });

      const attribution = parseAttributionCookie(event.cookies.get(ATTRIBUTION_COOKIE));
      const inserted = await insertWaitlistEmail(email, attribution);

      if (!inserted) {
        return { success: true, alreadyRegistered: true };
      }

      trackAnonymousEvent('waitlist_joined', {
        source: attribution.source,
        campaign: attribution.campaign,
        variant: attribution.variant,
        segment: attribution.segment,
        referredBy: attribution.referredBy,
      });

      return { success: true };
    },
  ),
};
