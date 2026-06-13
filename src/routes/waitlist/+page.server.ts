import { fail } from '@sveltejs/kit';
import { insertWaitlistEmail } from '$lib/server/waitlist-db';
import { checkRateLimit } from '$lib/server/rate-limiter';
import type { Actions, PageServerLoad } from './$types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = async ({ url }) => {
  return { canonicalUrl: `${url.origin}/waitlist` };
};

export const actions: Actions = {
  join: async ({ request, getClientAddress }) => {
    const data = await request.formData();

    // Honeypot: bots fill hidden fields, humans leave them empty
    if (data.get('_hp')) return fail(422, { error: 'invalid' });

    // Rate limit: 5 submissions per minute per IP
    const ip = getClientAddress();
    const allowed = await checkRateLimit(`waitlist:${ip}`, 5);
    if (!allowed) return fail(429, { error: 'rate_limited' });

    const email = (data.get('email') as string ?? '').trim().toLowerCase();

    if (!email) return fail(422, { error: 'required' });
    if (!EMAIL_RE.test(email)) return fail(422, { error: 'invalid' });

    const inserted = await insertWaitlistEmail(email);

    if (!inserted) {
      return { success: true, alreadyRegistered: true };
    }

    return { success: true };
  }
};
