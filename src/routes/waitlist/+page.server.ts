import { fail } from '@sveltejs/kit';
import { countWaitlistEmails, insertWaitlistEmail } from '$lib/server/waitlist-db';
import { publicFormAction } from '$lib/server/public-form-action';
import type { Actions, PageServerLoad } from './$types';

const EMAIL_RE = /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]*[^\s@]$/;

export const load: PageServerLoad = async ({ url }) => {
  const spotTaken = await countWaitlistEmails();
  return { canonicalUrl: `${url.origin}/waitlist`, spotTaken };
};

export const actions: Actions = {
  join: publicFormAction(
    { limits: ({ ip }) => [{ key: `waitlist:${ip}`, max: 5 }], turnstile: true },
    async ({ form }) => {
      const email = (form.get('email') as string ?? '').trim().toLowerCase();

      if (!email) return fail(422, { error: 'required' });
      if (!EMAIL_RE.test(email)) return fail(422, { error: 'invalid' });

      const inserted = await insertWaitlistEmail(email);

      if (!inserted) {
        return { success: true, alreadyRegistered: true };
      }

      return { success: true };
    },
  ),
};
