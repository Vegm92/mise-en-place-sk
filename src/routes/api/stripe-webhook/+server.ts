import { error, json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { handleWebhookEvent, WebhookSignatureError } from '$lib/server/billing';

/** Stripe sends webhook events here. Configure the URL in the Stripe dashboard. */
export const POST: RequestHandler = async ({ request }) => {
	const body      = await request.text();
	const signature = request.headers.get('stripe-signature') ?? '';

	if (!signature) error(400, 'Missing stripe-signature header');

	try {
		await handleWebhookEvent(body, signature);
		return json({ received: true });
	} catch (err) {
		// Signature failures are expected noise (forged/misconfigured senders) and
		// un-retryable → 400. Everything else is a real handler failure (e.g. a DB
		// write for checkout.session.completed): report it and return 500 so
		// Stripe retries and its dashboard flags the endpoint (issue #253).
		if (err instanceof WebhookSignatureError) {
			error(400, 'Webhook signature verification failed');
		}
		console.error('[stripe-webhook] handler error:', err);
		Sentry.captureException(err);
		error(500, 'Webhook handler error');
	}
};
