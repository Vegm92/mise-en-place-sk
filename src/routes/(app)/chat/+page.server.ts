import type { PageServerLoad, Actions } from './$types';
import { db, forTenant } from '$lib/server/db';
import { chatSessions, chatMessages } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	const sessionIdParam = url.searchParams.get('session');

	const sessions = await db
		.select()
		.from(chatSessions)
		.where(tdb.scope(chatSessions.restaurantId))
		.orderBy(desc(chatSessions.updatedAt));

	const activeId = sessionIdParam
		? parseInt(sessionIdParam, 10)
		: (sessions[0]?.id ?? null);

	const messages = activeId
		? await db.select().from(chatMessages).where(eq(chatMessages.sessionId, activeId)).orderBy(chatMessages.id)
		: [];

	return {
		title: 'Asistente IA',
		sessions,
		activeSessionId: activeId,
		messages: messages.map((m) => ({
			...m,
			actions: m.actions ? JSON.parse(m.actions) : undefined,
		})),
	};
};

export const actions: Actions = {
	deleteSession: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);
		if (!id) return fail(400, { error: 'id required' });
		await db.delete(chatSessions).where(tdb.scope(chatSessions.restaurantId, eq(chatSessions.id, id)));
		return { success: true };
	},
};
