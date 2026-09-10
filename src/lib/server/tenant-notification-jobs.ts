import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { invoices, settings, userRestaurants, users } from './schema';
import { sendEmail, weeklyDigestEmail, incidenciaDigestEmail, trialExpiryEmail, trialExpiredEmail } from './email';
import { getOrGenerateWeeklyDigest, isoWeek } from './weekly-digest';
import { TIERS, effectiveTier } from './billing';
import { isAlertEnabled } from './alert-preferences';
import { dispatchTenantJobs, type DispatchResult, type TenantJobData } from './tenant-fanout';
import type { PgBoss } from 'pg-boss';

export const DIGEST_QUEUE = 'scheduled-weekly-digest';
export const REMINDERS_QUEUE = 'scheduled-overdue-reminders';
export const TRIAL_QUEUE = 'scheduled-trial-notices';

export const DIGEST_TENANT_QUEUE = 'tenant-weekly-digest';
export const REMINDERS_TENANT_QUEUE = 'tenant-overdue-reminder';
export const TRIAL_TENANT_QUEUE = 'tenant-trial-notice';

export const TENANT_FANOUT_QUEUES = [DIGEST_TENANT_QUEUE, REMINDERS_TENANT_QUEUE, TRIAL_TENANT_QUEUE];

export const DIGEST_CRON = '0 6 * * 1';
export const REMINDERS_CRON = '30 6 * * *';
export const TRIAL_CRON = '0 7 * * *';

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

async function ownerEmail(restaurantId: string): Promise<string | null> {
	const tdb = forTenant(restaurantId);
	const [owner] = await db.select({ userId: userRestaurants.userId })
		.from(userRestaurants)
		.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.role, 'owner')))
		.limit(1);
	if (!owner) return null;

	const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, owner.userId)).limit(1);
	return row?.email ?? null;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export interface WeeklyDigestJobData extends TenantJobData {
	week: string;
}

export interface OverdueReminderJobData extends TenantJobData {
	day: string;
}

export interface TrialNoticeJobData extends TenantJobData {
	milestone: number;
	claim: string;
}

export async function runWeeklyDigestJob(boss: PgBoss): Promise<DispatchResult> {
	const week = isoWeek(new Date());

	return await dispatchTenantJobs<WeeklyDigestJobData>(boss, {
		queue: DIGEST_TENANT_QUEUE,
		label: 'weekly-digest',
		jobFor: (tenant) => TIERS[effectiveTier(tenant)].features.weeklyDigest
			? { data: { restaurantId: tenant.id, name: tenant.name, week }, singletonKey: `${tenant.id}:${week}` }
			: null,
	});
}

export async function sendWeeklyDigest(data: WeeklyDigestJobData): Promise<boolean> {
	if (!(await isAlertEnabled(data.restaurantId, 'weekly_digest'))) return false;

	const digest = await getOrGenerateWeeklyDigest(data.restaurantId, data.week);
	if (!digest) return false;

	if (!(await claimOnce(data.restaurantId, 'weekly_digest_email_week', data.week))) return false;

	const email = await ownerEmail(data.restaurantId);
	if (!email) return false;

	const html = digest
		.split(/\n{2,}/)
		.map(p => `<p>${p.trim()}</p>`)
		.join('\n');
	await sendEmail(weeklyDigestEmail(email, data.name, html));
	return true;
}

export async function runOverdueRemindersJob(boss: PgBoss): Promise<DispatchResult> {
	const day = today();

	return await dispatchTenantJobs<OverdueReminderJobData>(boss, {
		queue: REMINDERS_TENANT_QUEUE,
		label: 'overdue-reminders',
		jobFor: (tenant) => ({
			data: { restaurantId: tenant.id, name: tenant.name, day },
			singletonKey: `${tenant.id}:${day}`,
		}),
	});
}

export async function sendOverdueReminder(data: OverdueReminderJobData): Promise<boolean> {
	if (!(await isAlertEnabled(data.restaurantId, 'invoice_reminders'))) return false;

	const tdb = forTenant(data.restaurantId);
	const tenantWhere = and(
		isNull(invoices.deletedAt),
		eq(invoices.reviewState, 'incidencia'),
	);
	const cnt = await db.$count(invoices, tdb.scope(invoices.restaurantId, tenantWhere));
	if (cnt === 0) return false;

	const [totalRow] = await db.select({
		total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)::float8`,
	})
		.from(invoices)
		.where(tdb.scope(invoices.restaurantId, tenantWhere));
	const totalAmount = totalRow?.total ?? 0;

	if (!(await claimOnce(data.restaurantId, 'incidencia_digest_sent_day', data.day))) return false;

	const email = await ownerEmail(data.restaurantId);
	if (!email) return false;

	const total = `${Number(totalAmount ?? 0).toFixed(2)} €`;
	await sendEmail(incidenciaDigestEmail(email, data.name, cnt, total));
	return true;
}

export function trialDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {
	return Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000);
}

export function trialMilestoneFor(daysLeft: number): number | null {
	if (daysLeft > 7) return null;
	if (daysLeft <= 0) return 0;
	if (daysLeft === 1) return 1;
	return 7;
}

export async function runTrialNoticesJob(boss: PgBoss): Promise<DispatchResult> {
	return await dispatchTenantJobs<TrialNoticeJobData>(boss, {
		queue: TRIAL_TENANT_QUEUE,
		label: 'trial-notices',
		jobFor: (tenant) => {
			if (tenant.status !== 'trialing' || !tenant.trialEndsAt) return null;
			const milestone = trialMilestoneFor(trialDaysLeft(tenant.trialEndsAt));
			if (milestone === null) return null;
			const claim = `${tenant.trialEndsAt.toISOString().slice(0, 10)}:${milestone}`;
			return {
				data: { restaurantId: tenant.id, name: tenant.name, milestone, claim },
				singletonKey: `${tenant.id}:${claim}`,
			};
		},
	});
}

export async function sendTrialNotice(data: TrialNoticeJobData): Promise<boolean> {
	if (!(await claimOnce(data.restaurantId, 'trial_notice_sent', data.claim))) return false;

	const email = await ownerEmail(data.restaurantId);
	if (!email) return false;

	await sendEmail(data.milestone === 0
		? trialExpiredEmail(email, data.name)
		: trialExpiryEmail(email, data.name, data.milestone));
	return true;
}
