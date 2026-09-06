import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const saveName = form(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.minLength(1, 'set.profile.err.nameRequired'), v.maxLength(80, 'set.profile.err.nameTooLong')),
	}),
	async ({ name }) => {
		const { locals } = getRequestEvent();
		if (!locals.user) invalid('Unauthorized');
		await db.update(users).set({ name }).where(eq(users.id, locals.user!.id));
		return { ok: 'set.profile.ok.name' as const };
	},
);
