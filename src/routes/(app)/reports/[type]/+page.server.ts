import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isReportStyle, isReportType, type ReportStyle } from '$lib/reports';
import { buildReport, periodOptions } from '$lib/server/reports';
import { getOrGenerateWeeklyDigest, isoWeek } from '$lib/server/weekly-digest';
import { trackEvent } from '$lib/server/events';
import { requireFeature } from '$lib/server/billing';
import { db, forTenant } from '$lib/server/db';
import { digestShares } from '$lib/server/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getOrCreateActiveShare } from '$lib/server/digest-share';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';

const DEFAULT_STYLE: ReportStyle = 'executive';

async function currentDigestShareToken(rid: string, week: string): Promise<string | null> {
	const tdb = forTenant(rid);
	const [row] = await db
		.select({ token: digestShares.token })
		.from(digestShares)
		.where(tdb.scope(digestShares.restaurantId, and(eq(digestShares.week, week), isNull(digestShares.revokedAt))))
		.limit(1);
	return row?.token ?? null;
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');
	await requireFeature('weeklyDigest', rid);

	const type = params.type;
	if (!isReportType(type)) error(404, 'Unknown report');

	const styleParam = url.searchParams.get('style');
	const style = isReportStyle(styleParam) ? styleParam : DEFAULT_STYLE;
	const periods = periodOptions(type);
	const periodParam = url.searchParams.get('period');
	const period = periodParam && periods.includes(periodParam) ? periodParam : (periods[0] ?? null);

	const isCurrentWeek = type === 'weekly' && period === isoWeek(new Date());
	const digest = isCurrentWeek ? await getOrGenerateWeeklyDigest(rid, period!) : null;
	if (digest) trackEvent('digest_viewed', rid, { week: period });

	const doc = await buildReport(type, rid, period, digest);
	trackEvent('report_viewed', rid, { type, style });

	const shareToken = isCurrentWeek ? await currentDigestShareToken(rid, period!) : null;

	return { title: 'rep.title', doc, style, periods, shareToken, shareWeek: isCurrentWeek ? period : null };
};

export const actions: Actions = {
	share: async ({ locals }) => {
		const rid = locals.restaurantId;
		if (!rid) return fail(401, { shareError: 'unauthorized' });

		if (!(await rateLimitScoped({ scope: 'tenant', name: 'digest-share-create', max: 20 }, { restaurantId: rid }))) {
			return fail(429, { shareError: 'rateLimited' });
		}

		// tenant-check-ok: rid is locals.restaurantId only, never client input.
		// getOrCreateActiveShare (digest-share.ts) tenant-scopes every read via
		// forTenant().scope() and resolves the create race through the partial
		// unique index on (restaurant_id, week) WHERE revoked_at IS NULL
		// (migration 0054) — see docs/03_features/digest.md Code notes.
		const week = isoWeek(new Date());
		const { token } = await getOrCreateActiveShare(rid, week);

		return { shareToken: token, shareWeek: week };
	},

	revokeShare: async ({ locals }) => {
		const rid = locals.restaurantId;
		if (!rid) return fail(401, { shareError: 'unauthorized' });

		if (!(await rateLimitScoped({ scope: 'tenant', name: 'digest-share-revoke', max: 20 }, { restaurantId: rid }))) {
			return fail(429, { shareError: 'rateLimited' });
		}

		const week = isoWeek(new Date());
		const tdb = forTenant(rid);
		await db
			.update(digestShares)
			.set({ revokedAt: new Date() })
			.where(tdb.scope(digestShares.restaurantId, and(eq(digestShares.week, week), isNull(digestShares.revokedAt))));

		return { shareRevoked: true, shareWeek: week };
	},
};
