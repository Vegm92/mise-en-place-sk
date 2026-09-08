import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { claimRequest, releaseRequest } from './idempotency';

export const idempotencyKeyField = v.optional(
	v.pipe(v.string('idempotency_key must be a UUID'), v.uuid('idempotency_key must be a UUID')),
);

export async function withIdempotency(
	key: string | undefined,
	restaurantId: string | null,
	run: () => Promise<Response>,
): Promise<Response> {
	if (!key) return run();
	if (!(await claimRequest(key, restaurantId))) return json({ ok: true, replay: true });

	try {
		const response = await run();
		if (!response.ok) await releaseRequest(key);
		return response;
	} catch (err) {
		await releaseRequest(key);
		throw err;
	}
}
