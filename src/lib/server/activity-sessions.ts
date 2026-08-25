const SESSION_GAP_MS = 30 * 60 * 1000;

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
