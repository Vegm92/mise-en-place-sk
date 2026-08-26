import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isReportType } from '$lib/reports';
import { buildReport, periodOptions, reportCsv } from '$lib/server/reports';
import { getOrGenerateWeeklyDigest, isoWeek } from '$lib/server/weekly-digest';
import { trackEvent } from '$lib/server/events';
import { requireFeature } from '$lib/server/billing';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');
	await requireFeature('weeklyDigest', rid);

	const type = params.type;
	if (!isReportType(type)) error(404, 'Unknown report');

	const periods = periodOptions(type);
	const periodParam = url.searchParams.get('period');
	const period = periodParam && periods.includes(periodParam) ? periodParam : (periods[0] ?? null);

	const digest = type === 'weekly' && period === isoWeek(new Date())
		? await getOrGenerateWeeklyDigest(rid, period)
		: null;

	const doc = await buildReport(type, rid, period, digest);
	trackEvent('report_exported', rid, { type });

	return new Response(reportCsv(doc), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${doc.csv.filename}"`,
		},
	});
};
