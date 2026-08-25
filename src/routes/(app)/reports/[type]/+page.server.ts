import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isReportStyle, isReportType, type ReportStyle } from '$lib/reports';
import { buildReport, periodOptions } from '$lib/server/reports';
import { getOrGenerateWeeklyDigest, isoWeek } from '$lib/server/weekly-digest';
import { trackEvent } from '$lib/server/events';
import { requireFeature } from '$lib/server/billing';

const DEFAULT_STYLE: ReportStyle = 'executive';

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

	const digest = type === 'weekly' && period === isoWeek(new Date())
		? (await getOrGenerateWeeklyDigest(rid, period))?.text ?? null
		: null;

	const doc = await buildReport(type, rid, period, digest);
	trackEvent('report_viewed', rid, { type, style });

	return { title: 'rep.title', doc, style, periods };
};
