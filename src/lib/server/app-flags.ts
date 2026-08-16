import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { appFlags } from '$lib/server/schema';

export const ACCESS_OPEN_FLAG = 'access_open';

export async function getFlag(key: string): Promise<string | null> {
	const [row] = await db
		.select({ value: appFlags.value })
		.from(appFlags)
		.where(eq(appFlags.key, key))
		.limit(1);
	return row?.value ?? null;
}

export async function setFlag(key: string, value: string): Promise<void> {
	await db
		.insert(appFlags)
		.values({ key, value })
		.onConflictDoUpdate({
			target: appFlags.key,
			set: { value, updatedAt: new Date() },
		});
}

export async function isAccessOpen(): Promise<boolean> {
	return (await getFlag(ACCESS_OPEN_FLAG)) === 'true';
}

export async function setAccessOpen(open: boolean): Promise<void> {
	await setFlag(ACCESS_OPEN_FLAG, open ? 'true' : 'false');
}
