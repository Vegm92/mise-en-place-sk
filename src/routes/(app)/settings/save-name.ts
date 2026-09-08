import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const saveNameSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1, 'set.profile.err.nameRequired'), v.maxLength(80, 'set.profile.err.nameTooLong')),
});

export async function saveNameForUser(name: string, userId: string | undefined) {
	if (!userId) invalid('Unauthorized');
	await db.update(users).set({ name }).where(eq(users.id, userId!));
	return { ok: 'set.profile.ok.name' as const };
}
