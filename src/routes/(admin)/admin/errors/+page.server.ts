import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { getIssueSummary, isSentryConfigured, listUnresolvedIssues } from '$lib/server/sentry-api';
import { SENTRY_ORG, SENTRY_PROJECT } from '$lib/server/env';

export const load: PageServerLoad = async () => handleLoad('errors', async () => {
	if (!isSentryConfigured()) {
		return { title: 'admin.errors', configured: false as const };
	}

	const [summary, issues] = await Promise.all([
		getIssueSummary(),
		listUnresolvedIssues(20),
	]);

	return {
		title: 'admin.errors',
		configured: true as const,
		summary,
		issues,
		sentryOrg: SENTRY_ORG,
		sentryProject: SENTRY_PROJECT,
	};
});
