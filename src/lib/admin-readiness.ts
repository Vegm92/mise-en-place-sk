import { t, ti } from '$lib/i18n';

export type ChipStatus = 'ok' | 'warn' | 'error';
export interface ReadinessChip { label: string; value: string | number; status: ChipStatus; href?: string }

export interface ReadinessInput {
	gates: { dbRole: ChipStatus; migrations: ChipStatus; worker: ChipStatus };
	worker: { state: 'alive' | 'stale' | 'unknown'; ageSeconds: number | null };
	dbRole: { role: string; scoped: boolean } | null;
	migrations: { readable: boolean; appliedCount: number; journalCount: number; pending: string[]; skipped: string[] } | null;
	queue: { stuck: number; depth: { items: number } | null };
	sentry: { configured: boolean; unresolved: number; critical: number; events24h: number };
	deadLetters: { pending: number };
	access: { pending: number };
}

export function formatAge(seconds: number | null): string {
	if (seconds === null) return '—';
	if (seconds < 90) return `${seconds}s`;
	if (seconds < 5400) return `${Math.round(seconds / 60)}min`;
	if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)}h`;
	return `${Math.round(seconds / 86_400)}d`;
}

export function countStatus(count: number, errorAbove: number): ChipStatus {
	if (count > errorAbove) return 'error';
	if (count > 0) return 'warn';
	return 'ok';
}

export function sentryStatus(sentry: ReadinessInput['sentry']): ChipStatus {
	if (!sentry.configured) return 'warn';
	if (sentry.critical > 0) return 'error';
	if (sentry.unresolved > 0) return 'warn';
	return 'ok';
}

function migrationValue(m: ReadinessInput['migrations']): string {
	if (!m) return '—';
	if (!m.readable) return t('admin.health.unreadable');
	return m.skipped.length > 0 ? `${m.skipped.length}!` : `${m.appliedCount}/${m.journalCount}`;
}

export function readinessChips(d: ReadinessInput): ReadinessChip[] {
	const workerValue = d.worker.state === 'alive' && d.worker.ageSeconds !== null
		? `${t('admin.worker.alive')} · ${formatAge(d.worker.ageSeconds)}`
		: t(`admin.worker.${d.worker.state}`);
	return [
		{ label: t('admin.chip.worker'), value: workerValue, status: d.gates.worker, href: '/admin/health' },
		{ label: t('admin.chip.migrations'), value: migrationValue(d.migrations), status: d.gates.migrations, href: '/admin/health' },
		{ label: t('admin.chip.dbRole'), value: d.dbRole?.role ?? '—', status: d.gates.dbRole, href: '/admin/health' },
		{ label: t('admin.chip.queue'), value: d.queue.depth?.items ?? '—', status: countStatus(d.queue.stuck, 10) },
		{ label: t('admin.chip.errors24h'), value: d.sentry.configured ? d.sentry.events24h : '—', status: sentryStatus(d.sentry), href: '/admin/errors' },
		{ label: t('admin.chip.dlq'), value: d.deadLetters.pending, status: countStatus(d.deadLetters.pending, 25), href: '/admin/dead-letters' },
		{ label: t('admin.chip.access'), value: d.access.pending, status: d.access.pending > 0 ? 'warn' : 'ok', href: '/admin/access' },
	];
}

export function pipelineOldest(ageSeconds: number | null): string {
	return ageSeconds === null ? '' : ti('admin.health.kpiOldest', { age: formatAge(ageSeconds) });
}
