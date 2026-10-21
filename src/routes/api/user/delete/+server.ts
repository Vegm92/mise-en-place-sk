import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { apiError } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import * as Sentry from '@sentry/sveltekit';
import { db } from '$lib/server/db';
import { userRestaurants, subscriptions, invoices, batchItems, users, restaurants } from '$lib/server/schema';
import { verifyCredentials } from '$lib/server/auth-credentials';
import { enqueueAccountCleanup } from '$lib/server/queue';
import { sendEmail, ownershipTransferEmail } from '$lib/server/email';
import { logAuthEvent } from '$lib/server/auth-events';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { explicitDeletionEntries, rootEntry } from '$lib/server/tenant-data-map';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { userMemberships } from '$lib/server/locations';

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

interface OwnershipTransfer {
	restaurantId: string;
	restaurantName: string;
	toUserId: string;
	toEmail: string;
}

async function planOwnershipTransfers(userId: string, ownedIds: string[]): Promise<{
	soleOwnedIds: string[];
	transfers: OwnershipTransfer[];
}> {
	const others = await db
		.select({
			restaurantId: userRestaurants.restaurantId,
			restaurantName: restaurants.name,
			userId: userRestaurants.userId,
			email: users.email,
			role: userRestaurants.role,
			joinedAt: userRestaurants.createdAt,
		})
		.from(userRestaurants)
		.innerJoin(users, eq(users.id, userRestaurants.userId))
		.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
		.where(and(inArray(userRestaurants.restaurantId, ownedIds), ne(userRestaurants.userId, userId)));

	const joined = (m: { joinedAt: Date | null }) => m.joinedAt?.getTime() ?? Infinity;
	others.sort((a, b) => joined(a) - joined(b) || a.userId.localeCompare(b.userId));

	const soleOwnedIds: string[] = [];
	const transfers: OwnershipTransfer[] = [];
	for (const restaurantId of ownedIds) {
		const members = others.filter((m) => m.restaurantId === restaurantId);
		const successor = members[0];
		if (!successor) soleOwnedIds.push(restaurantId);
		else if (!members.some((m) => m.role === 'owner')) {
			transfers.push({ restaurantId, restaurantName: successor.restaurantName, toUserId: successor.userId, toEmail: successor.email });
		}
	}
	return { soleOwnedIds, transfers };
}

const DeleteBody = v.object({
	password: v.optional(v.string()),
	confirm: v.optional(v.string()),
});

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	const user = locals.user;
	if (!user) return apiError(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'user', name: 'account-delete', max: 3 }, { userId: user.id }))) {
		return apiError(429, 'Too many requests — please wait a moment before trying again');
	}

	const parsed = await parseJson(DeleteBody, request);
	const body: v.InferOutput<typeof DeleteBody> = parsed.success ? parsed.output : {};

	const [userRow] = await db
		.select({ passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);
	if (!userRow) return apiError(401, 'Unauthorized');

	if (userRow.passwordHash) {
		const password = body.password ?? '';
		if (!password) return apiError(400, 'Missing password confirmation. Send { "password": "…" }');
		const reauthed = await verifyCredentials(user.email, password);
		if (!reauthed) return apiError(401, 'Incorrect password');
	} else if (body.confirm !== 'DELETE_MY_ACCOUNT') {
		return apiError(400, 'Missing confirmation. Send { "confirm": "DELETE_MY_ACCOUNT" }');
	}

	const memberships = await userMemberships(user.id);

	const ownedIds = memberships
		.filter(m => m.role === 'owner')
		.map(m => m.restaurantId);

	let soleOwnedIds: string[] = [];
	let transfers: OwnershipTransfer[] = [];
	let stripeSubscriptionIds: string[] = [];
	let storageKeys: string[] = [];

	if (ownedIds.length > 0) {
		({ soleOwnedIds, transfers } = await planOwnershipTransfers(user.id, ownedIds));

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
		for (const t of transfers) {
			await tx.update(userRestaurants)
				.set({ role: 'owner' })
				.where(and(eq(userRestaurants.restaurantId, t.restaurantId), eq(userRestaurants.userId, t.toUserId)));
		}
		if (soleOwnedIds.length > 0) {
			for (const entry of explicitDeletionEntries()) {
				await tx.delete(entry.table).where(inArray(entry.scopeColumn, soleOwnedIds));
			}
			const root = rootEntry();
			await tx.delete(root.table).where(inArray(root.scopeColumn, soleOwnedIds));
		}
		await tx.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));
		await tx.delete(users).where(eq(users.id, user.id));

		if (stripeSubscriptionIds.length > 0 || storageKeys.length > 0) {
			await enqueueAccountCleanup(user.id, soleOwnedIds[0] ?? null, stripeSubscriptionIds, storageKeys, locals.requestId);
		}
	});

	for (const t of transfers) {
		logAuthEvent('ownership_transferred', { restaurantId: t.restaurantId, fromUserId: user.id, toUserId: t.toUserId });
		try {
			await sendEmail(ownershipTransferEmail(t.toEmail, t.restaurantName, locals.locale ?? 'es'));
		} catch (err) {
			console.error(`[account-delete] ownership email failed for restaurant=${t.restaurantId}:`, err);
			Sentry.captureException(err, { tags: { area: 'account-delete', op: 'ownership_email' } });
		}
	}

	cookies.delete('authjs.session-token', { path: '/' });
	cookies.delete('__Secure-authjs.session-token', { path: '/' });

	return json({ deleted: true });
};
