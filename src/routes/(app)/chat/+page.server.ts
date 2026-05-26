import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { chatSessions, chatMessages } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
	const sessionIdParam = url.searchParams.get('session');
	const sessions = db
		.select()
		.from(chatSessions)
		.orderBy(desc(chatSessions.updatedAt))
		.all();

	const activeId = sessionIdParam
		? parseInt(sessionIdParam, 10)
		: (sessions[0]?.id ?? null);

	const messages = activeId
		? db.select().from(chatMessages).where(eq(chatMessages.sessionId, activeId)).orderBy(chatMessages.id).all()
		: [];

	return {
		title: 'Asistente IA',
		sessions,
		activeSessionId: activeId,
		messages: messages.map(m => ({
			...m,
			actions: m.actions ? JSON.parse(m.actions) : undefined,
		})),
	};
};

export const actions: Actions = {
	deleteSession: async ({ request }) => {
		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);
		if (!id) return fail(400, { error: 'id required' });
		db.delete(chatSessions).where(eq(chatSessions.id, id)).run();
		return { success: true };
	},
};
