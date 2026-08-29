import type { JobResult, JobWithMetadata, PgBoss } from 'pg-boss';
import { asc, eq, gt, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { db, runAsSystem, runWithTenantContext } from './db';
import { appFlags, restaurants, subscriptions } from './schema';
import type { PlanTier } from './billing';
import { SCHEDULED_FANOUT_CONCURRENCY } from './env';
import { deadLetterRefFromJob, recordDeadLetter, redactString } from './dead-letter';

export interface TenantSummary {
	id: string;
	name: string;
	planTier: PlanTier;
	status: string;
	trialEndsAt: Date | null;
}

export interface TenantJobData {
	restaurantId: string;
	name: string;
}

export interface TenantJob<D extends TenantJobData> {
	data: D;
	singletonKey: string;
}

export interface TenantFanoutSpec<D extends TenantJobData> {
	queue: string;
	label: string;
	jobFor: (tenant: TenantSummary) => TenantJob<D> | null;
	pageSize?: number;
}

export interface TenantFanoutHandler<D extends TenantJobData> {
	queue: string;
	label: string;
	run: (data: D) => Promise<boolean>;
}

export interface DispatchResult {
	scanned: number;
	considered: number;
	dispatched: number;
}

export interface JobRunSummary {
	label: string;
	at: string;
	scanned: number;
	considered: number;
	dispatched: number;
}

export const TENANT_PAGE_SIZE = 200;
export const TENANT_JOB_RETRY_LIMIT = 2;
export const TENANT_JOB_RETRY_DELAY_SECONDS = 120;
export const TENANT_JOB_EXPIRE_SECONDS = 600;
export const TENANT_JOB_RETENTION_SECONDS = 172_800;
const JOB_RUN_FLAG_PREFIX = 'job_run:';

export function tenantDeadLetterQueue(queue: string): string {
	return `${queue}-dead-letter`;
}

export async function tenantPage(
	afterId: string | null,
	pageSize: number = TENANT_PAGE_SIZE,
): Promise<TenantSummary[]> {
	const rows = await runAsSystem(() => db.select({
		id: restaurants.id,
		name: restaurants.name,
		planTier: subscriptions.planTier,
		status: subscriptions.status,
		trialEndsAt: subscriptions.trialEndsAt,
	})
		.from(restaurants)
		.leftJoin(subscriptions, eq(restaurants.id, subscriptions.restaurantId))
		.where(afterId ? gt(restaurants.id, afterId) : undefined)
		.orderBy(asc(restaurants.id))
		.limit(pageSize));

	return rows.map(r => ({
		id: r.id,
		name: r.name,
		planTier: (r.planTier ?? 'trial') as PlanTier,
		status: r.status ?? 'trialing',
		trialEndsAt: r.trialEndsAt ?? null,
	}));
}

export async function dispatchTenantJobs<D extends TenantJobData>(
	boss: PgBoss,
	spec: TenantFanoutSpec<D>,
): Promise<DispatchResult> {
	const pageSize = spec.pageSize ?? TENANT_PAGE_SIZE;
	const deadLetter = tenantDeadLetterQueue(spec.queue);
	let cursor: string | null = null;
	let scanned = 0;
	let considered = 0;
	let dispatched = 0;

	try {
		for (;;) {
			const page = await tenantPage(cursor, pageSize);
			if (page.length === 0) break;
			scanned += page.length;

			const jobs = page
				.map(spec.jobFor)
				.filter((job): job is TenantJob<D> => job !== null)
				.map(job => ({
					data: job.data,
					singletonKey: job.singletonKey,
					retryLimit: TENANT_JOB_RETRY_LIMIT,
					retryDelay: TENANT_JOB_RETRY_DELAY_SECONDS,
					expireInSeconds: TENANT_JOB_EXPIRE_SECONDS,
					deadLetter,
				}));
			considered += jobs.length;

			if (jobs.length > 0) {
				const ids = await boss.insert(spec.queue, jobs);
				dispatched += ids?.length ?? jobs.length;
			}

			cursor = page[page.length - 1].id;
			if (page.length < pageSize) break;
		}
	} finally {
		await recordJobRun(spec.label, { scanned, considered, dispatched });
		console.info(`[scheduler] ${spec.label} dispatched`, { scanned, considered, dispatched });
	}

	return { scanned, considered, dispatched };
}

export async function recordJobRun(label: string, result: DispatchResult): Promise<void> {
	const value = JSON.stringify({ at: new Date().toISOString(), ...result });
	try {
		await db.insert(appFlags)
			.values({ key: `${JOB_RUN_FLAG_PREFIX}${label}`, value })
			.onConflictDoUpdate({ target: appFlags.key, set: { value, updatedAt: new Date() } });
	} catch (err) {
		console.error(`[scheduler] could not record the ${label} run summary:`, err);
		Sentry.captureException(err, { tags: { job: label } });
	}
}

export async function lastJobRuns(): Promise<JobRunSummary[]> {
	const jobRunFlagLike = `${JOB_RUN_FLAG_PREFIX}%`;
	const rows = await db.select({ key: appFlags.key, value: appFlags.value })
		.from(appFlags)
		.where(sql`${appFlags.key} LIKE ${jobRunFlagLike}`);

	return rows.flatMap(row => {
		try {
			const parsed = JSON.parse(row.value) as Omit<JobRunSummary, 'label'>;
			return [{ label: row.key.slice(JOB_RUN_FLAG_PREFIX.length), ...parsed }];
		} catch {
			return [];
		}
	});
}

export async function registerTenantFanout<D extends TenantJobData>(
	boss: PgBoss,
	handler: TenantFanoutHandler<D>,
): Promise<void> {
	const deadLetter = tenantDeadLetterQueue(handler.queue);
	const options = {
		policy: 'short' as const,
		deadLetter,
		retryLimit: TENANT_JOB_RETRY_LIMIT,
		retryDelay: TENANT_JOB_RETRY_DELAY_SECONDS,
		expireInSeconds: TENANT_JOB_EXPIRE_SECONDS,
		retentionSeconds: TENANT_JOB_RETENTION_SECONDS,
	};
	await boss.createQueue(deadLetter);
	await boss.createQueue(handler.queue, options);

	await boss.work(
		handler.queue,
		{ batchSize: SCHEDULED_FANOUT_CONCURRENCY, includeMetadata: true, perJobResults: true },
		(jobs: JobWithMetadata<D>[]) => Promise.all(jobs.map(job => settleTenantJob(handler, job))),
	);

	await boss.work(
		deadLetter,
		{ batchSize: 10, includeMetadata: true },
		async (jobs: JobWithMetadata<Record<string, unknown>>[]) => {
			for (const job of jobs) {
				await recordDeadLetter({
					...deadLetterRefFromJob(handler.queue, {
						id: job.sourceId ?? job.id,
						data: job.data,
						retryCount: job.sourceRetryCount ?? 0,
						retryLimit: 0,
					}),
					restaurantId: tenantIdOf(job.data),
					sourceId: tenantIdOf(job.data),
					errorClass: 'scheduler.abandoned',
					error: new Error(`pg-boss dead-lettered a "${handler.queue}" job (expired, abandoned or out of retries)`),
					skipIfJobRecorded: true,
				});
			}
		},
	);
}

function tenantIdOf(data: unknown): string | null {
	const rid = (data as Record<string, unknown> | null)?.restaurantId;
	return typeof rid === 'string' ? rid : null;
}

async function settleTenantJob<D extends TenantJobData>(
	handler: TenantFanoutHandler<D>,
	job: JobWithMetadata<D>,
): Promise<JobResult<{ sent: boolean } | { error: string }>> {
	try {
		const sent = await runWithTenantContext(job.data.restaurantId, () => handler.run(job.data));
		return { id: job.id, status: 'completed', output: { sent } };
	} catch (err) {
		console.error(`[scheduler] ${handler.label} failed for ${job.data?.restaurantId ?? 'a tenant'}:`, err);
		Sentry.captureException(err, { tags: { job: handler.label } });
		return { id: job.id, status: 'failed', output: { error: redactString(String(err)) } };
	}
}
