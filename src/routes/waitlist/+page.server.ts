import { countWaitlistEmails } from '$lib/server/waitlist-db';
import { captureAttribution } from '$lib/server/attribution-cookie';
import { joinWaitlistAction } from '$lib/server/waitlist-join-action';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request, cookies }) => {
  const spotTaken = await countWaitlistEmails();

  captureAttribution(cookies, url, request.headers.get('referer'));

  return { canonicalUrl: `${url.origin}/waitlist`, spotTaken };
};

export const actions: Actions = {
  join: joinWaitlistAction,
};
