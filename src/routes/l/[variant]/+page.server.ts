import { error } from '@sveltejs/kit';
import { countWaitlistEmails } from '$lib/server/waitlist-db';
import { captureAttribution } from '$lib/server/attribution-cookie';
import { canonicalUrl } from '$lib/server/site-origin';
import { joinWaitlistAction } from '$lib/server/waitlist-join-action';
import { getLandingVariant } from '$lib/landing-variants';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, request, cookies }) => {
  const variant = getLandingVariant(params.variant);
  if (!variant) error(404, 'Not Found');

  const spotTaken = await countWaitlistEmails();

  captureAttribution(cookies, url, request.headers.get('referer'), { variant: params.variant });

  return {
    canonicalUrl: canonicalUrl(url, `/l/${params.variant}`),
    spotTaken,
    overrides: variant.overrides,
  };
};

export const actions: Actions = {
  join: joinWaitlistAction,
};
