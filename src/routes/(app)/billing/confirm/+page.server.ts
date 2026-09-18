import { redirect } from '@sveltejs/kit';
import type Stripe from 'stripe';
import type { PageServerLoad } from './$types';
import { stripe, stripeCustomerIdFor, tierFromPriceId, TIERS } from '$lib/server/billing';

async function belongsToTenant(session: Stripe.Checkout.Session, restaurantId: string): Promise<boolean> {
	const metaRid = session.metadata?.restaurantId ?? null;
	if (metaRid) return metaRid === restaurantId;

	const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
	if (!customerId) return false;

	const ownCustomerId = await stripeCustomerIdFor(restaurantId);
	return ownCustomerId !== null && ownCustomerId === customerId;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !locals.restaurantId) redirect(303, '/login');

	const sessionId = url.searchParams.get('session_id');

	const base = {
		title: 'billing.title',
		received: true,
		confirmed: false,
		sessionId,
		planNameKey: null as string | null,
		email: null as string | null,
	};

	if (!sessionId || !stripe) return base;

	try {
		const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });

		console.info('[billing/confirm] checkout session retrieved', {
			sessionId,
			payment_status: session.payment_status,
		});

		if (!(await belongsToTenant(session, locals.restaurantId))) return base;

		const priceId = session.line_items?.data?.[0]?.price?.id ?? null;
		const tier = priceId ? tierFromPriceId(priceId) : null;

		return {
			received: true,
			confirmed: session.payment_status === 'paid' || session.payment_status === 'no_payment_required',
			sessionId,
			planNameKey: tier ? TIERS[tier].nameKey : null,
			email: session.customer_details?.email ?? session.customer_email ?? null,
		};
	} catch (err) {
		console.error('[billing/confirm] failed to retrieve checkout session', err);
		return base;
	}
};
