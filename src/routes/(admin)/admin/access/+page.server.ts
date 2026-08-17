import { fail } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, waitlist } from '$lib/server/schema';
import { isAdminUser } from '$lib/server/admin';
import { safe } from '$lib/server/load-guard';
import { isAccessOpen, setAccessOpen } from '$lib/server/app-flags';
import { sendEmail, accessApprovedEmail, waitlistInviteEmail } from '$lib/server/email';

type AccountRow = {
	id: string;
	email: string;
	access_status: string;
	founder: boolean;
	email_verified: string | null;
	created_at: string;
	restaurant_count: string;
};

type WaitlistRow = { email: string; created_at: string };

export const load: PageServerLoad = async () => {
	const [accessOpen, accounts, pendingInvites] = await Promise.all([
		safe('admin/access-flag', () => isAccessOpen(), false),
		safe<AccountRow[]>('admin/access-accounts', async () => await db.execute(sql`
			SELECT u.id, u.email, u.access_status, u.founder, u.email_verified, u.created_at,
				(SELECT COUNT(*) FROM user_restaurants ur WHERE ur.user_id = u.id) AS restaurant_count
			FROM ${users} u
			ORDER BY (u.access_status = 'pending') DESC, u.created_at DESC
			LIMIT 200
		`) as unknown as AccountRow[], []),
		safe<WaitlistRow[]>('admin/access-waitlist', async () => await db.execute(sql`
			SELECT w.email, w.created_at
			FROM ${waitlist} w
			WHERE NOT EXISTS (SELECT 1 FROM ${users} u WHERE u.email = w.email)
			ORDER BY w.created_at DESC
			LIMIT 200
		`) as unknown as WaitlistRow[], []),
	]);

	return { accessOpen, accounts, pendingInvites, founderCoupon: env.STRIPE_FOUNDER_COUPON_ID ?? null };
};

export const actions: Actions = {
	toggleAccess: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		await setAccessOpen(data.get('open') === 'true');
		return { success: true };
	},

	approve: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		const userId = (data.get('userId') as string ?? '').trim();
		if (!userId) return fail(422, { error: 'missing_user' });

		const founder = !(await isAccessOpen());

		const [updated] = await db
			.update(users)
			.set({ accessStatus: 'approved', ...(founder ? { founder: true } : {}) })
			.where(eq(users.id, userId))
			.returning({ email: users.email });

		if (!updated) return fail(404, { error: 'not_found' });

		await sendEmail(accessApprovedEmail(
			updated.email,
			founder ? (env.STRIPE_FOUNDER_COUPON_ID ?? undefined) : undefined,
		));

		return { success: true };
	},

	revoke: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		const userId = (data.get('userId') as string ?? '').trim();
		if (!userId) return fail(422, { error: 'missing_user' });

		await db.update(users).set({ accessStatus: 'pending' }).where(eq(users.id, userId));
		return { success: true };
	},

	invite: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		const email = (data.get('email') as string ?? '').trim().toLowerCase();
		if (!email) return fail(422, { error: 'missing_email' });

		await sendEmail(waitlistInviteEmail(email, env.STRIPE_FOUNDER_COUPON_ID ?? undefined));
		return { success: true };
	},
};
