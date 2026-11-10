import { eq, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { settings } from './schema';

export async function getSetting(restaurantId: string, key: string): Promise<string | null> {
	const [row] = await db
		.select({ value: settings.value })
		.from(settings)
		.where(forTenant(restaurantId).scope(settings.restaurantId, eq(settings.key, key)))
		.limit(1);
	return row?.value ?? null;
}

export async function putSetting(restaurantId: string, key: string, value: string): Promise<void> {
	await db
		.insert(settings)
		.values({ restaurantId, key, value })
		.onConflictDoUpdate({ target: [settings.restaurantId, settings.key], set: { value } });
}

export async function claimSetting(restaurantId: string, key: string, value: string): Promise<boolean> {
	const rows = await db
		.insert(settings)
		.values({ restaurantId, key, value })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value },
			setWhere: sql`${settings.value} <> ${value}`,
		})
		.returning({ value: settings.value });
	return rows.length > 0;
}
