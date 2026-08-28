export interface Attribution {
	source: string | null;
	campaign: string | null;
	variant: string | null;
	segment: string | null;
	referrer: string | null;
	landingPath: string | null;
	referredBy: string | null;
}

export const ATTRIBUTION_COOKIE = 'mep_attr';

const MAX_FIELD_LEN = 100;
const SAFE_CHARS_RE = /[^a-zA-Z0-9 _\-.:/]/g;

const QUERY_PARAM_MAP: Record<string, keyof Omit<Attribution, 'referrer' | 'landingPath'>> = {
	utm_source: 'source',
	utm_campaign: 'campaign',
	variant: 'variant',
	segment: 'segment',
	ref: 'referredBy',
};

export const EMPTY_ATTRIBUTION: Attribution = {
	source: null,
	campaign: null,
	variant: null,
	segment: null,
	referrer: null,
	landingPath: null,
	referredBy: null,
};

function clean(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const stripped = raw.replace(SAFE_CHARS_RE, '').trim();
	if (!stripped) return null;
	return stripped.slice(0, MAX_FIELD_LEN);
}

function cleanReferer(referer: string | null | undefined): string | null {
	if (!referer) return null;
	try {
		const parsed = new URL(referer);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
		return clean(`${parsed.protocol}//${parsed.host}${parsed.pathname}`);
	} catch {
		return null;
	}
}

export function parseAttribution(url: URL, referer?: string | null): Attribution {
	const result: Attribution = { ...EMPTY_ATTRIBUTION };
	for (const [param, field] of Object.entries(QUERY_PARAM_MAP)) {
		result[field] = clean(url.searchParams.get(param));
	}
	result.referrer = cleanReferer(referer ?? null);
	result.landingPath = clean(url.pathname);
	return result;
}

export function hasAttributionSignal(a: Attribution): boolean {
	return !!(a.source || a.campaign || a.variant || a.segment || a.referrer || a.referredBy);
}

export function serializeAttribution(a: Attribution): string {
	return JSON.stringify(a);
}

export function parseAttributionCookie(raw: string | null | undefined): Attribution {
	if (!raw) return { ...EMPTY_ATTRIBUTION };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ...EMPTY_ATTRIBUTION };
	}
	if (!parsed || typeof parsed !== 'object') return { ...EMPTY_ATTRIBUTION };
	const obj = parsed as Record<string, unknown>;
	return {
		source: clean(obj.source),
		campaign: clean(obj.campaign),
		variant: clean(obj.variant),
		segment: clean(obj.segment),
		referrer: clean(obj.referrer),
		landingPath: clean(obj.landingPath),
		referredBy: clean(obj.referredBy),
	};
}
