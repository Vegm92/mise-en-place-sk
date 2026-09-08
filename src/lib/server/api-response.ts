import { json } from '@sveltejs/kit';
import type * as v from 'valibot';

export function apiError(status: number, message: string): Response {
	return json({ error: message }, { status });
}

export function invalidBody<TSchema extends v.GenericSchema>(
	result: v.SafeParseResult<TSchema>,
	status = 422,
	fallback = 'Invalid request body',
): Response {
	const issue = result.issues?.[0];
	return apiError(status, issue?.path?.length ? issue.message : fallback);
}
