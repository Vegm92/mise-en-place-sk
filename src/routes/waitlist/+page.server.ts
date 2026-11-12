import { countWaitlistEmails } from '$lib/server/waitlist-db';
import { captureAttribution } from '$lib/server/attribution-cookie';
import { canonicalUrl } from '$lib/server/site-origin';
import { joinWaitlistAction } from '$lib/server/waitlist-join-action';
import { landingFacts } from '$lib/server/landing-facts';
import { isBetaFeatureEnabled } from '$lib/server/feature-flags';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request, cookies }) => {
  const [spotTaken, multiLocation, recipes] = await Promise.all([
    countWaitlistEmails(),
    isBetaFeatureEnabled('multiLocation'),
    isBetaFeatureEnabled('recipes'),
  ]);

  captureAttribution(cookies, url, request.headers.get('referer'));

  return { canonicalUrl: canonicalUrl(url, '/waitlist'), spotTaken, facts: landingFacts(), planFlags: { multiLocation, recipes } };
};

export const actions: Actions = {
  join: joinWaitlistAction,
};
