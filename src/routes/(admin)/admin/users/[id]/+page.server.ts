import { error } from '@sveltejs/kit';
import { handleLoad, safe } from '$lib/server/load-guard';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import {
	isSentryConfigured,
	listIssuesForUser,
	sentryUserReplaysUrl,
	sentryUserSearchUrl,
	type SentryIssue,
} from '$lib/server/sentry-api';

const SESSION_GAP_MS = 30 * 60 * 1000;
const EVENT_LIMIT = 400;

export type TimelineEvent = {
	id: number;
	notification_type: string;
	message: string;
	payload: string | null;
	status: string;
	created_at: string;
	restaurant_name: string | null;
};

export type ActivitySession = {
	startedAt: string;
	endedAt: string;
	events: TimelineEvent[];
};

export function groupIntoSessions(events: TimelineEvent[]): ActivitySession[] {
	const ascending = [...events].sort(
		(a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
	);
	const sessions: ActivitySession[] = [];

	for (const ev of ascending) {
		const at = Date.parse(ev.created_at);
		const open = sessions[sessions.length - 1];
		if (open && at - Date.parse(open.endedAt) <= SESSION_GAP_MS) {
			open.events.push(ev);
			open.endedAt = ev.created_at;
		} else {
			sessions.push({ startedAt: ev.created_at, endedAt: ev.created_at, events: [ev] });
		}
	}

	return sessions.reverse();
}

export const load: PageServerLoad = async ({ params }) => {
	const userId = params.id;

	return handleLoad('admin/users/[id]', async () => {
		const [userRow] = await db.execute(sql`
			SELECT
				u.id, u.name, u.email, u.access_status, u.founder, u.created_at,
				(SELECT string_agg(r.name, ', ' ORDER BY r.name)
					FROM user_restaurants ur
					JOIN restaurants r ON r.id = ur.restaurant_id
					WHERE ur.user_id = u.id) AS restaurants,
				(SELECT MAX(s.expires) FROM sessions s WHERE s.user_id = u.id) AS session_expires
			FROM users u
			WHERE u.id = ${userId}
		`) as unknown as Array<{
			id: string; name: string | null; email: string; access_status: string;
			founder: boolean; created_at: string; restaurants: string | null;
			session_expires: string | null;
		}>;

		if (!userRow) error(404, 'User not found');

		const eventRows = await db.execute(sql`
			SELECT
				sn.id, sn.notification_type, sn.message, sn.payload, sn.status, sn.created_at,
				r.name AS restaurant_name
			FROM system_notifications sn
			LEFT JOIN restaurants r ON r.id = sn.restaurant_id
			WHERE sn.user_id = ${userId}
			ORDER BY sn.created_at DESC
			LIMIT ${EVENT_LIMIT}
		`) as unknown as Array<Partial<TimelineEvent>>;

		const events = eventRows.map((r, i): TimelineEvent => ({
			id:                Number(r.id ?? i),
			notification_type: r.notification_type ?? '',
			message:           r.message ?? '',
			payload:           r.payload ?? null,
			status:            r.status ?? '',
			created_at:        r.created_at ?? new Date().toISOString(),
			restaurant_name:   r.restaurant_name ?? null,
		}));

		const issues = await safe(
			'admin/users/sentry',
			() => listIssuesForUser(userId),
			[] as SentryIssue[],
		);

		return {
			title: `Admin · ${userRow.email}`,
			user: {
				id:             userRow.id,
				name:           userRow.name,
				email:          userRow.email,
				accessStatus:   userRow.access_status,
				founder:        Boolean(userRow.founder),
				createdAt:      userRow.created_at,
				restaurants:    userRow.restaurants,
				sessionExpires: userRow.session_expires,
			},
			sessions: groupIntoSessions(events),
			eventCount: events.length,
			truncated: events.length === EVENT_LIMIT,
			sentryConfigured: isSentryConfigured(),
			issues,
			sentryIssuesUrl: sentryUserSearchUrl(userId),
			sentryReplaysUrl: sentryUserReplaysUrl(userId),
		};
	});
};
