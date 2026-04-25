import { fail } from '@sveltejs/kit';
import { insertEmail } from '$lib/server/waitlist-db';
import type { Actions } from './$types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const actions: Actions = {
  join: async ({ request }) => {
    const data = await request.formData();
    const email = (data.get('email') as string ?? '').trim().toLowerCase();

    if (!email) return fail(422, { error: 'required' });
    if (!EMAIL_RE.test(email)) return fail(422, { error: 'invalid' });

    const result = insertEmail.run(email);

    if (result.changes === 0) {
      return { success: true, alreadyRegistered: true };
    }

    return { success: true };
  }
};
