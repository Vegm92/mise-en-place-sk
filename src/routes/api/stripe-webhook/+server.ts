import { error, json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { handleWebhookEvent, WebhookSignatureError } from '$lib/server/billing';

export const POST: RequestHandler = async ({ request }) => {
	const body      = await request.text();
	const signature = request.headers.get('stripe-signature') ?? '';

	if (!signature) error(400, 'Missing stripe-signature header');

	try {
		await handleWebhookEvent(body, signature);
		return json({ received: true });
	} catch (err) {
		if (err instanceof WebhookSignatureError) {
			error(400, 'Webhook signature verification failed');
		}
		console.error('[stripe-webhook] handler error:', err);
		Sentry.captureException(err);
		error(500, 'Webhook handler error');
	}
};
