import type { PageServerLoad } from './$types';
import { SENTRY_ORG, SENTRY_PROJECT } from '$lib/server/env';

export const load: PageServerLoad = () => ({
	title: 'admin.errors',
	sentryUrl: SENTRY_ORG ? `https://${SENTRY_ORG}.sentry.io/issues/?project=${SENTRY_PROJECT}&query=is%3Aunresolved` : null,
});
