import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { getIssueSummary, listUnresolvedIssues } from '$lib/server/sentry-api';
import { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } from '$lib/server/env';

export const load: PageServerLoad = async () => handleLoad('errors', async () => {
	if (!SENTRY_AUTH_TOKEN) {
		return { configured: false as const };
	}

	const [summary, issues] = await Promise.all([
		getIssueSummary(),
		listUnresolvedIssues(20),
	]);

	return {
		configured: true as const,
		summary,
		issues,
		sentryOrg: SENTRY_ORG,
		sentryProject: SENTRY_PROJECT,
	};
});
