import { captureAttribution } from '$lib/server/attribution-cookie';
import { canonicalUrl } from '$lib/server/site-origin';
import { requestDemoAction } from '$lib/server/demo-request';
import { demoVideoPath } from '$lib/demo-funnel';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, request, cookies }) => {
	captureAttribution(cookies, url, request.headers.get('referer'));

	return {
		canonicalUrl: canonicalUrl(url, '/demo'),
		videoUrl: demoVideoPath(process.env.DEMO_VIDEO_URL),
		posterUrl: demoVideoPath(process.env.DEMO_VIDEO_POSTER_URL),
		requestedStep: url.searchParams.get('step'),
	};
};

export const actions: Actions = {
	request: requestDemoAction,
};
