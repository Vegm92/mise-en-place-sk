import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readSession } from '$lib/server/sessions';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const session = await readSession(params.id);
	if (!session) return json({ error: 'not found' }, { status: 404 });

	const status = session.extractionStatus ?? 'queued';
	return json({ status, error: session.extractError ?? null });
};
