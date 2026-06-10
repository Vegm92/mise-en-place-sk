import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleWebhookEvent } from '$lib/server/billing';

/** Stripe sends webhook events here. Configure the URL in the Stripe dashboard. */
export const POST: RequestHandler = async ({ request }) => {
	const body      = await request.text();
	const signature = request.headers.get('stripe-signature') ?? '';

	if (!signature) error(400, 'Missing stripe-signature header');

	try {
		await handleWebhookEvent(body, signature);
		return new Response(JSON.stringify({ received: true }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch {
		error(400, 'Webhook signature verification failed');
	}
};
