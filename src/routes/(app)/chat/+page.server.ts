import type { PageServerLoad, Actions } from './$types';
import { db, forTenant } from '$lib/server/db';
import { chatSessions, chatMessages } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { requireFeature } from '$lib/server/billing';

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/onboarding');
	await requireFeature('aiAssistant', rid);
	const tdb = forTenant(rid);
	const sessionIdParam = url.searchParams.get('session');

	const sessions = await db
		.select()
		.from(chatSessions)
		.where(tdb.scope(chatSessions.restaurantId))
		.orderBy(desc(chatSessions.updatedAt));

	const requestedId = sessionIdParam ? parseInt(sessionIdParam, 10) : NaN;
	const activeId = sessions.some(s => s.id === requestedId)
		? requestedId
		: (sessions[0]?.id ?? null);

	const messages = activeId
		? await db.select().from(chatMessages)
			.where(tdb.scope(chatMessages.restaurantId, eq(chatMessages.sessionId, activeId)))
			.orderBy(chatMessages.id)
		: [];

	return {
		title: 'nav.chat',
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
		const rid = locals.restaurantId;
		if (!rid) return fail(403, { error: 'no active restaurant' });
		const tdb = forTenant(rid);
		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);
		if (!id) return fail(400, { error: 'id required' });
		await db.delete(chatSessions).where(tdb.scope(chatSessions.restaurantId, eq(chatSessions.id, id)));
		return { success: true };
	},
};
