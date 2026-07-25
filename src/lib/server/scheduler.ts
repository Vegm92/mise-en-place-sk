/**
 * Scheduled jobs (issue #288).
 *
 * Everything here used to depend on somebody opening the app: the weekly digest
 * was generated on a dashboard visit, and the overdue-invoice and trial-expiry
 * templates had no callers at all — which is backwards, because those messages
 * exist precisely for tenants who *stopped* opening the app.
 *
 * pg-boss (already in the stack for extraction) provides the cron. The worker
 * process registers these on boot; if the worker is not running, none of them
 * fire — same contract as invoice extraction.
 *
 * Every job is tenant-by-tenant best-effort: one restaurant's failure is logged
 * and the loop continues, so a single bad tenant can't stop the run. Each send
 * is claimed through a guarded upsert on `settings` before the email goes out,
 * so a retried job (or a second worker) cannot double-send.
 */
import type { PgBoss } from 'pg-boss';
import { and, eq, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { db, forTenant } from './db';
import { invoices, restaurants, settings, subscriptions, userRestaurants } from './schema';
import { createSupabaseAdminClient } from './supabase';
import { sendEmail, weeklyDigestEmail, overdueInvoiceEmail, trialExpiryEmail, trialExpiredEmail } from './email';
import { getOrGenerateWeeklyDigest, isoWeek } from './weekly-digest';
import { TIERS, type PlanTier } from './billing';
import { getStorage } from './storage';

export const DIGEST_QUEUE = 'scheduled-weekly-digest';
export const REMINDERS_QUEUE = 'scheduled-overdue-reminders';
export const TRIAL_QUEUE = 'scheduled-trial-notices';
export const PURGE_QUEUE = 'scheduled-file-purge';

/** Cron expressions are UTC. Spanish restaurants are UTC+1/+2, so 06:00 UTC lands early morning locally. */
const DIGEST_CRON = '0 6 * * 1';    // Mondays, with the week just closed
const REMINDERS_CRON = '30 6 * * *'; // daily
const TRIAL_CRON = '0 7 * * *';      // daily
const PURGE_CRON = '0 3 * * *';      // daily, off-peak

/** Days a soft-deleted invoice keeps its uploaded file before it is purged. */
export const DELETED_FILE_RETENTION_DAYS = 30;

/** Trial milestones (days remaining) that get an email. 0 = the day it lapsed. */
const TRIAL_MILESTONES = [7, 1, 0] as const;

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Claim a one-shot send for this tenant. Returns false when the value was
 * already stored, which is what makes every job in this file safe to retry.
 */
async function claimOnce(restaurantId: string, key: string, value: string): Promise<boolean> {
	const rows = await db.insert(settings)
		.values({ restaurantId, key, value })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value },
			setWhere: sql`${settings.value} <> ${value}`,
		})
		.returning({ value: settings.value });
	return rows.length > 0;
}

/** Owner's email address, or null when the restaurant has no reachable owner. */
async function ownerEmail(restaurantId: string): Promise<string | null> {
	const tdb = forTenant(restaurantId);
	const [owner] = await db.select({ userId: userRestaurants.userId })
		.from(userRestaurants)
		.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.role, 'owner')))
		.limit(1);
	if (!owner) return null;

	const { data } = await createSupabaseAdminClient().auth.admin.getUserById(owner.userId);
	return data?.user?.email ?? null;
}

/** Every tenant with its plan tier, trial end and name — one query per job run. */
async function allTenants(): Promise<Array<{
	id: string;
	name: string;
	planTier: PlanTier;
	status: string;
	trialEndsAt: Date | null;
}>> {
	const rows = await db.select({
		id: restaurants.id,
		name: restaurants.name,
		planTier: subscriptions.planTier,
		status: subscriptions.status,
		trialEndsAt: subscriptions.trialEndsAt,
	})
		.from(restaurants)
		// Join order avoids the `eq(*.restaurantId, …)` shape the tenant-scope
		// lint bans; this is a deliberate all-tenant scan, not a tenant filter.
		.leftJoin(subscriptions, eq(restaurants.id, subscriptions.restaurantId));

	return rows.map(r => ({
		id: r.id,
		name: r.name,
		planTier: (r.planTier ?? 'trial') as PlanTier,
		status: r.status ?? 'trialing',
		trialEndsAt: r.trialEndsAt ?? null,
	}));
}

function today(): string {
	return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function perTenant<T>(
	label: string,
	tenants: T[],
	fn: (tenant: T) => Promise<boolean>,
): Promise<{ considered: number; sent: number }> {
	let sent = 0;
	for (const tenant of tenants) {
		try {
			if (await fn(tenant)) sent++;
		} catch (err) {
			console.error(`[scheduler] ${label} failed for a tenant (continuing):`, err);
			Sentry.captureException(err, { tags: { job: label } });
		}
	}
	return { considered: tenants.length, sent };
}

// ── Jobs ───────────────────────────────────────────────────────────────────────

/**
 * Weekly digest: generate this week's text (the same claim-then-generate path
 * the dashboard uses, so a Monday visitor and this job never both pay Gemini)
 * and email it to the owner. Only tiers whose plan includes the digest.
 */
export async function runWeeklyDigestJob(): Promise<{ considered: number; sent: number }> {
	const week = isoWeek(new Date());
	const tenants = (await allTenants()).filter(t => TIERS[t.planTier].features.weeklyDigest);

	return await perTenant('weekly-digest', tenants, async (tenant) => {
		const digest = await getOrGenerateWeeklyDigest(tenant.id, week);
		if (!digest?.text) return false;

		// Claim after generating: a generation failure should not consume the
		// week's email slot.
		if (!(await claimOnce(tenant.id, 'weekly_digest_email_week', week))) return false;

		const email = await ownerEmail(tenant.id);
		if (!email) return false;

		const html = digest.text
			.split(/\n{2,}/)
			.map(p => `<p>${p.trim()}</p>`)
			.join('\n');
		await sendEmail(weeklyDigestEmail(email, tenant.name, html));
		return true;
	});
}

/**
 * Overdue invoices: one email per tenant per day, only when something is
 * actually overdue.
 */
export async function runOverdueRemindersJob(): Promise<{ considered: number; sent: number }> {
	const tenants = await allTenants();
	const day = today();

	return await perTenant('overdue-reminders', tenants, async (tenant) => {
		const tdb = forTenant(tenant.id);
		const [row] = await db.select({
			count: sql<number>`COUNT(*)::int`,
			total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)::float8`,
		})
			.from(invoices)
			.where(tdb.scope(invoices.restaurantId, and(
				isNull(invoices.deletedAt),
				ne(invoices.status, 'paid'),
				isNotNull(invoices.dueDate),
				sql`${invoices.dueDate} < ${day}`,
			)));

		const count = row?.count ?? 0;
		if (count === 0) return false;

		if (!(await claimOnce(tenant.id, 'overdue_reminder_sent_day', day))) return false;

		const email = await ownerEmail(tenant.id);
		if (!email) return false;

		const total = `${(row?.total ?? 0).toFixed(2)} €`;
		await sendEmail(overdueInvoiceEmail(email, tenant.name, count, total));
		return true;
	});
}

/** Days remaining in a trial, rounded up. Negative once it has lapsed. */
export function trialDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {
	return Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Which milestone a remaining-days count falls into, or null when the trial is
 * still too far out to be worth an email. The bands are deliberately wide so a
 * missed run (worker restart, outage) still sends the notice a day late instead
 * of skipping it: 7 covers 7…2 days out, 1 the final day, 0 the lapse.
 */
export function trialMilestoneFor(daysLeft: number): number | null {
	if (daysLeft > 7) return null;
	if (daysLeft <= 0) return 0;
	if (daysLeft === 1) return 1;
	return 7;
}

/**
 * Trial expiry notices at T-7, T-1 and on the day the trial lapses. The
 * milestone is stored, so moving between milestones sends exactly one email
 * each and a re-run sends none.
 */
export async function runTrialNoticesJob(): Promise<{ considered: number; sent: number }> {
	const tenants = (await allTenants()).filter(t => t.status === 'trialing' && t.trialEndsAt);

	return await perTenant('trial-notices', tenants, async (tenant) => {
		const daysLeft = trialDaysLeft(tenant.trialEndsAt!);
		const milestone = trialMilestoneFor(daysLeft);
		if (milestone === null) return false;

		// Keyed on the trial end date too, so a tenant that starts a fresh trial
		// gets the full sequence again instead of matching the old value.
		const claim = `${tenant.trialEndsAt!.toISOString().slice(0, 10)}:${milestone}`;
		if (!(await claimOnce(tenant.id, 'trial_notice_sent', claim))) return false;

		const email = await ownerEmail(tenant.id);
		if (!email) return false;

		await sendEmail(milestone === 0
			? trialExpiredEmail(email, tenant.name)
			: trialExpiryEmail(email, tenant.name, milestone));
		return true;
	});
}

/**
 * Retention purge (issue #289): a soft-deleted invoice keeps its uploaded file
 * for DELETED_FILE_RETENTION_DAYS so a mistaken delete can be undone, then the
 * file — supplier PII and financial data — is removed from storage and the row
 * stops pointing at it. The row itself stays for the audit log.
 */
export async function runFilePurgeJob(): Promise<{ purged: number; failed: number }> {
	const cutoff = new Date(Date.now() - DELETED_FILE_RETENTION_DAYS * 86_400_000);
	const rows = await db.select({
		id: invoices.id,
		restaurantId: invoices.restaurantId,
		sourceFile: invoices.sourceFile,
	})
		.from(invoices)
		.where(and(
			isNotNull(invoices.deletedAt),
			isNotNull(invoices.sourceFile),
			lt(invoices.deletedAt, cutoff),
		))
		.limit(500);

	let purged = 0;
	let failed = 0;
	for (const row of rows) {
		try {
			await getStorage().delete(row.sourceFile!);
			const tdb = forTenant(row.restaurantId);
			await db.update(invoices)
				.set({ sourceFile: null })
				.where(tdb.scope(invoices.restaurantId, eq(invoices.id, row.id)));
			purged++;
		} catch (err) {
			failed++;
			console.error(`[scheduler] file purge failed for invoice ${row.id} (continuing):`, err);
			Sentry.captureException(err, { tags: { job: 'file-purge' } });
		}
	}
	if (purged || failed) console.info(`[scheduler] file purge: ${purged} purged, ${failed} failed`);
	return { purged, failed };
}

// ── Registration ───────────────────────────────────────────────────────────────

interface ScheduledJob {
	queue: string;
	cron: string;
	run: () => Promise<unknown>;
}

const JOBS: ScheduledJob[] = [
	{ queue: DIGEST_QUEUE, cron: DIGEST_CRON, run: runWeeklyDigestJob },
	{ queue: REMINDERS_QUEUE, cron: REMINDERS_CRON, run: runOverdueRemindersJob },
	{ queue: TRIAL_QUEUE, cron: TRIAL_CRON, run: runTrialNoticesJob },
	{ queue: PURGE_QUEUE, cron: PURGE_CRON, run: runFilePurgeJob },
];

/**
 * Create the queues, register the cron schedules and start the consumers.
 * `schedule()` is idempotent per queue: re-registering on every worker boot
 * updates the cron rather than stacking duplicates, and pg-boss holds the
 * schedule in the database so exactly one worker fires each occurrence.
 */
export async function registerScheduledJobs(boss: PgBoss): Promise<void> {
	for (const job of JOBS) {
		await boss.createQueue(job.queue);
		await boss.schedule(job.queue, job.cron, {}, { tz: 'UTC' });
		await boss.work(job.queue, { batchSize: 1 }, async () => {
			const started = Date.now();
			const result = await job.run();
			console.info(`[scheduler] ${job.queue} finished in ${Date.now() - started}ms`, result);
		});
	}
	console.info(`[scheduler] ${JOBS.length} scheduled jobs registered (${JOBS.map(j => j.queue).join(', ')})`);
}
