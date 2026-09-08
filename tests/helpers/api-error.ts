import { expect } from 'vitest';

/**
 * Asserts the one JSON error envelope every `+server.ts` returns (#1005):
 * `{ error }` with the status on the Response, never a thrown HttpError and
 * never SvelteKit's `{ message }`.
 */
export async function expectApiError(result: unknown, status: number): Promise<{ error: string }> {
	const response = result as Response;
	expect(response).toBeInstanceOf(Response);
	expect(response.status).toBe(status);
	const body = await response.json() as { error?: unknown; message?: unknown };
	expect(typeof body.error).toBe('string');
	expect(body.message).toBeUndefined();
	return body as { error: string };
}
