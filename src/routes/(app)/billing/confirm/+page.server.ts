import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { stripe, tierFromPriceId, TIERS } from '$lib/server/billing';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !locals.restaurantId) redirect(303, '/login');

	const sessionId = url.searchParams.get('session_id');

	const base = {
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
			subscription: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
			metadata: session.metadata,
			customer_email: session.customer_details?.email ?? session.customer_email ?? null,
			price_ids: (session.line_items?.data ?? []).map((li) => li.price?.id ?? null),
		});

		const metaRid = session.metadata?.restaurantId;
		if (metaRid && metaRid !== locals.restaurantId) return base;

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