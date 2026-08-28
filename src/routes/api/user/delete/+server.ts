import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as Sentry from '@sentry/sveltekit';
import { db } from '$lib/server/db';
import { userRestaurants, restaurants, subscriptions, invoices, batchItems, users } from '$lib/server/schema';
import { verifyCredentials } from '$lib/server/auth-credentials';
import { enqueueAccountCleanup } from '$lib/server/queue';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';

async function collectTenantFileKeys(restaurantIds: string[]): Promise<string[]> {
	if (restaurantIds.length === 0) return [];

	const [invoiceFiles, batchFiles] = await Promise.all([
		db.select({ key: invoices.sourceFile }).from(invoices)
			.where(and(inArray(invoices.restaurantId, restaurantIds), isNotNull(invoices.sourceFile))),
		db.select({ key: batchItems.fileKey }).from(batchItems)
			.where(inArray(batchItems.restaurantId, restaurantIds)),
	]);

	const keys = new Set<string>();
	for (const row of [...invoiceFiles, ...batchFiles]) {
		if (row.key) keys.add(row.key);
	}
	return [...keys];
}

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	if (!(await checkRateLimit(`account-delete:${user.id}`, 3))) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	const body = await request.json().catch(() => ({}));

	const [userRow] = await db
		.select({ passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);
	if (!userRow) throw error(401, 'Unauthorized');

	if (userRow.passwordHash) {
		const password = typeof body?.password === 'string' ? body.password : '';
		if (!password) throw error(400, 'Missing password confirmation. Send { "password": "…" }');
		const reauthed = await verifyCredentials(user.email, password);
		if (!reauthed) throw error(401, 'Incorrect password');
	} else if (body?.confirm !== 'DELETE_MY_ACCOUNT') {
		throw error(400, 'Missing confirmation. Send { "confirm": "DELETE_MY_ACCOUNT" }');
	}

	const memberships = await db
		.select({ restaurantId: userRestaurants.restaurantId, role: userRestaurants.role })
		.from(userRestaurants)
		.where(eq(userRestaurants.userId, user.id));

	const ownedIds = memberships
		.filter(m => m.role === 'owner')
		.map(m => m.restaurantId);

	let soleOwnedIds: string[] = [];
	let stripeSubscriptionIds: string[] = [];
	let storageKeys: string[] = [];

	if (ownedIds.length > 0) {
		const otherMembers = await db
			.select({ restaurantId: userRestaurants.restaurantId })
			.from(userRestaurants)
			.where(and(
				inArray(userRestaurants.restaurantId, ownedIds),
				ne(userRestaurants.userId, user.id),
			));
		const shared = new Set(otherMembers.map(m => m.restaurantId));
		soleOwnedIds = ownedIds.filter(id => !shared.has(id));

		if (soleOwnedIds.length > 0) {
			const liveSubs = await db
				.select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
				.from(subscriptions)
				.where(and(
					inArray(subscriptions.restaurantId, soleOwnedIds),
					isNotNull(subscriptions.stripeSubscriptionId),
				));
			stripeSubscriptionIds = liveSubs
				.map(s => s.stripeSubscriptionId)
				.filter((id): id is string => id !== null);

			storageKeys = await collectTenantFileKeys(soleOwnedIds);
		}
	}

	await db.transaction(async (tx) => {
		if (soleOwnedIds.length > 0) {
			await tx.delete(subscriptions).where(inArray(subscriptions.restaurantId, soleOwnedIds));
			await tx.delete(restaurants).where(inArray(restaurants.id, soleOwnedIds));
		}
		await tx.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));
		await tx.delete(users).where(eq(users.id, user.id));
	});

	if (stripeSubscriptionIds.length > 0 || storageKeys.length > 0) {
		try {
			await enqueueAccountCleanup(user.id, soleOwnedIds[0] ?? null, stripeSubscriptionIds, storageKeys);
		} catch (err) {
			console.error(`[account-delete] failed to enqueue post-commit cleanup for user=${user.id}:`, err);
			Sentry.captureException(err, { tags: { area: 'account-delete', op: 'enqueue_cleanup' } });
		}
	}

	cookies.delete('authjs.session-token', { path: '/' });
	cookies.delete('__Secure-authjs.session-token', { path: '/' });

	return json({ deleted: true });
};
