import * as Sentry from '@sentry/sveltekit';
import { deadLetterGrowth, type DeadLetterGrowth } from './dead-letter';
import { ACCOUNT_CLEANUP_QUEUE } from './contracts/account-cleanup-contract.js';

export const DEAD_LETTER_ALERT_QUEUE = 'scheduled-dead-letter-alert';

export const DEAD_LETTER_ALERT_CRON = '5 * * * *';

export const DEAD_LETTER_ALERT_THRESHOLD = 10;

export const DEAD_LETTER_ZERO_TOLERANCE_QUEUES = [ACCOUNT_CLEANUP_QUEUE];

export interface DeadLetterAlert {
	level: 'error' | 'warning';
	reason: 'zeroTolerance' | 'threshold';
	queues: string[];
	pending: number;
}

export function deadLetterAlert(growth: DeadLetterGrowth): DeadLetterAlert | null {
	const critical = growth.byQueue.filter((q) => DEAD_LETTER_ZERO_TOLERANCE_QUEUES.includes(q.queue));
	if (critical.length > 0) {
		return {
			level: 'error',
			reason: 'zeroTolerance',
			queues: critical.map((q) => q.queue),
			pending: critical.reduce((sum, q) => sum + q.pending, 0),
		};
	}
	if (growth.pending > DEAD_LETTER_ALERT_THRESHOLD) {
		return {
			level: 'warning',
			reason: 'threshold',
			queues: growth.byQueue.map((q) => q.queue),
			pending: growth.pending,
		};
	}
	return null;
}

export function alertOnDeadLetter(queue: string): void {
	if (!DEAD_LETTER_ZERO_TOLERANCE_QUEUES.includes(queue)) return;
	Sentry.captureMessage('Dead-lettered account deletion', {
		level: 'error',
		fingerprint: ['dead-letter-zeroTolerance'],
		tags: { subsystem: 'dead-letter' },
		extra: { queue },
	});
}

export async function runDeadLetterAlertJob(): Promise<{ pending: number; alerted: boolean }> {
	const growth = await deadLetterGrowth();
	const alert = deadLetterAlert(growth);
	if (!alert) return { pending: growth.pending, alerted: false };

	const detail = `${alert.pending} pending in ${growth.windowHours} h (${alert.queues.join(', ')})`;
	console.error(`[scheduler] dead-letter alert (${alert.reason}): ${detail}`);
	Sentry.captureMessage(
		alert.reason === 'zeroTolerance'
			? 'Dead-lettered account deletion'
			: 'Dead-letter queue growing',
		{
			level: alert.level,
			fingerprint: [`dead-letter-${alert.reason}`],
			tags: { subsystem: 'dead-letter' },
			extra: { pending: alert.pending, windowHours: growth.windowHours, byQueue: growth.byQueue },
		},
	);
	return { pending: growth.pending, alerted: true };
}
