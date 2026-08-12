import { SENTRY_AUTH_TOKEN, SENTRY_ORG } from './env';

const SENTRY_API_BASE = 'https://de.sentry.io/api/0';

export type SentryIssue = {
	id: string;
	shortId: string;
	title: string;
	culprit: string | null;
	level: string;
	count: number;
	userCount: number;
	firstSeen: string;
	lastSeen: string;
	permalink: string;
};

export type SentryIssueSummary = {
	unresolvedCount: number;
	criticalCount: number;
	usersAffected: number;
};

function isConfigured(): boolean {
	return Boolean(SENTRY_AUTH_TOKEN);
}

async function sentryFetch<T>(path: string): Promise<T> {
	const res = await fetch(`${SENTRY_API_BASE}${path}`, {
		headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
	});
	if (!res.ok) {
		throw new Error(`Sentry API request failed (${res.status}): ${await res.text()}`);
	}
	return res.json() as Promise<T>;
}

type RawSentryIssue = {
	id: string;
	shortId: string;
	title: string;
	culprit: string | null;
	level?: string;
	count?: string | number;
	userCount?: string | number;
	firstSeen: string;
	lastSeen: string;
	permalink: string;
};

function toIssue(raw: RawSentryIssue): SentryIssue {
	return {
		id: raw.id,
		shortId: raw.shortId,
		title: raw.title,
		culprit: raw.culprit ?? null,
		level: raw.level ?? 'error',
		count: Number(raw.count ?? 0),
		userCount: Number(raw.userCount ?? 0),
		firstSeen: raw.firstSeen,
		lastSeen: raw.lastSeen,
		permalink: raw.permalink,
	};
}

export async function listUnresolvedIssues(limit = 20): Promise<SentryIssue[]> {
	if (!isConfigured()) return [];
	const raw = await sentryFetch<RawSentryIssue[]>(
		`/organizations/${SENTRY_ORG}/issues/?query=is:unresolved&sort=freq&limit=${limit}`,
	);
	return raw.map(toIssue);
}

export async function getIssueSummary(): Promise<SentryIssueSummary | null> {
	if (!isConfigured()) return null;
	const issues = await listUnresolvedIssues(100);
	return {
		unresolvedCount: issues.length,
		criticalCount: issues.filter(i => i.level === 'fatal' || i.level === 'error').length,
		usersAffected: issues.reduce((sum, i) => sum + i.userCount, 0),
	};
}
