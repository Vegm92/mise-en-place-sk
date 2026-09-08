import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { apiError } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import * as Sentry from '@sentry/sveltekit';
import { db } from '$lib/server/db';
import { userRestaurants, subscriptions, invoices, batchItems, users } from '$lib/server/schema';
import { verifyCredentials } from '$lib/server/auth-credentials';
import { enqueueAccountCleanup } from '$lib/server/queue';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { explicitDeletionEntries, rootEntry } from '$lib/server/tenant-data-map';
import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
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
			for (const entry of explicitDeletionEntries()) {
				await tx.delete(entry.table).where(inArray(entry.scopeColumn, soleOwnedIds));
			}
			const root = rootEntry();
			await tx.delete(root.table).where(inArray(root.scopeColumn, soleOwnedIds));
		}
		await tx.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));
		await tx.delete(users).where(eq(users.id, user.id));
	});

	if (stripeSubscriptionIds.length > 0 || storageKeys.length > 0) {
		try {
			await enqueueAccountCleanup(user.id, soleOwnedIds[0] ?? null, stripeSubscriptionIds, storageKeys, locals.requestId);
		} catch (err) {
			console.error(`[account-delete] failed to enqueue post-commit cleanup for user=${user.id}:`, err);
			Sentry.captureException(err, { tags: { area: 'account-delete', op: 'enqueue_cleanup' } });
		}
	}

	cookies.delete('authjs.session-token', { path: '/' });
	cookies.delete('__Secure-authjs.session-token', { path: '/' });

	return json({ deleted: true });
};
