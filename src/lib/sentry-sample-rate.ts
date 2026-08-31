export function resolveTracesSampleRate(raw: string | undefined, isProduction: boolean): number {
	if (!isProduction) return 1.0;
	const trimmed = raw?.trim();
	const parsed = trimmed ? Number(trimmed) : NaN;
	return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1;
}
