import { json, redirect, type Handle } from '@sveltejs/kit';
import type { RouteId } from '$app/types';
import type { AccessState, TierConfig } from './billing';

export type FeatureKey = keyof TierConfig['features'];

export type RoutePolicy = 'open' | { feature?: FeatureKey; access?: true };

export type EntitlementDecision =
	| { kind: 'allow' }
	| { kind: 'deny-feature'; feature: FeatureKey }
	| { kind: 'deny-access';  reason: 'trial' | 'inactive' };

export const UPGRADE_SLUG: Record<FeatureKey, string> = {
	weeklyDigest:    'digest',
	stockTracking:   'stock',
	supplierScores:  'prices',
	multiLocation:   'locations',
	prioritySupport: 'support',
	aiAssistant:     'assistant',
};

export const ROUTE_POLICY = {
	'/':                                 'open',
	'/(admin)':                          'open',
	'/(admin)/admin':                    'open',
	'/(admin)/admin/access':             'open',
	'/(admin)/admin/dead-letters':       'open',
	'/(admin)/admin/errors':             'open',
	'/(admin)/admin/events':             'open',
	'/(admin)/admin/health':             'open',
	'/(admin)/admin/revenue':            'open',
	'/(admin)/admin/whatsapp':           'open',
	'/(app)':                            'open',
	'/(app)/analytics':                  'open',
	'/(app)/analytics/extraction':       'open',
	'/(app)/analytics/prices':           { feature: 'supplierScores' },
	'/(app)/analytics/spend':            'open',
	'/(app)/api':                        'open',
	'/(app)/api/active-restaurant':      'open',
	'/(app)/api/chat':                   { feature: 'aiAssistant', access: true },
	'/(app)/api/notifications':          'open',
	'/(app)/api/product-aliases':        'open',
	'/(app)/api/sidebar':                'open',
	'/(app)/api/stock-levels':           { feature: 'stockTracking' },
	'/(app)/api/supplier-category':      'open',
	'/(app)/api/trend':                  'open',
	'/(app)/api/tutorial':               'open',
	'/(app)/api/unit-conversions':       'open',
	'/(app)/batch':                      'open',
	'/(app)/batch/[id]':                 'open',
	'/(app)/billing':                    'open',
	'/(app)/billing/confirm':              'open',
	'/(app)/budgets':                    'open',
	'/(app)/chat':                       'open',
	'/(app)/confirm':                    'open',
	'/(app)/confirm/[id]':               'open',
	'/(app)/dashboard':                  'open',
	'/(app)/digest':                     'open',
	'/(app)/extract':                    'open',
	'/(app)/extract/[id]':               'open',
	'/(app)/help':                       'open',
	'/(app)/invoice':                    'open',
	'/(app)/invoice/[id]':               'open',
	'/(app)/invoice/[id]/edit':          'open',
	'/(app)/invoice/[id]/file':          'open',
	'/(app)/invoices':                   'open',
	'/(app)/invoices/export':            'open',
	'/(app)/invoices/export/download':   'open',
	'/(app)/plantilla-lista':            'open',
	'/(app)/products':                   'open',
	'/(app)/products/[id]':              'open',
	'/(app)/reminders':                  'open',
	'/(app)/reports':                    { feature: 'weeklyDigest', access: true },
	'/(app)/reports/[type]':             { feature: 'weeklyDigest', access: true },
	'/(app)/reports/[type]/csv':         { feature: 'weeklyDigest', access: true },
	'/(app)/settings':                   'open',
	'/(app)/settings/confirm-email':     'open',
	'/(app)/suppliers':                  'open',
	'/(app)/suppliers/[id]':             'open',
	'/api':                              'open',
	'/api/auth':                         'open',
	'/api/auth/[...all]':                'open',
	'/api/batch-status':                 'open',
	'/api/batch-status/[id]':            'open',
	'/api/health':                       'open',
	'/api/stripe-webhook':               'open',
	'/api/upload':                       'open',
	'/api/upload/[id]':                  'open',
	'/api/upload/[id]/[file]':           'open',
	'/api/user':                         'open',
	'/api/user/delete':                  'open',
	'/api/user/export':                  'open',
	'/api/whatsapp':                     'open',
	'/api/whatsapp/webhook':             'open',
	'/forgot-password':                  'open',
	'/login':                            'open',
	'/logout':                           'open',
	'/onboarding':                       'open',
	'/pending':                          'open',
	'/privacy':                          'open',
	'/reset-password':                   'open',
	'/robots.txt':                       'open',
	'/signup':                           'open',
	'/sitemap.xml':                      'open',
	'/terms':                            'open',
	'/verify-email':                     'open',
	'/waitlist':                         'open',
} satisfies Record<RouteId, RoutePolicy>;

export const REDIRECT_TARGET_ROUTES: RouteId[] = [
	'/(app)/billing',
	'/pending',
	'/onboarding',
	'/logout',
	'/login',
	'/api/health',
	'/api/stripe-webhook',
	'/api/whatsapp/webhook',
];

export function policyFor(routeId: string | null): RoutePolicy | undefined {
	if (routeId === null) return undefined;
	return (ROUTE_POLICY as Record<string, RoutePolicy>)[routeId];
}

export function resolveEntitlement(input: {
	policy:   RoutePolicy;
	features: TierConfig['features'] | null;
	access:   Pick<AccessState, 'allowed' | 'trialExpired'> | null;
}): EntitlementDecision {
	const { policy, features, access } = input;

	if (policy === 'open') return { kind: 'allow' };

	if (!features || !access) return { kind: 'deny-access', reason: 'inactive' };

	if (policy.access && !access.allowed) {
		return { kind: 'deny-access', reason: access.trialExpired ? 'trial' : 'inactive' };
	}

	if (policy.feature && !features[policy.feature]) {
		return { kind: 'deny-feature', feature: policy.feature };
	}

	return { kind: 'allow' };
}

export type EntitlementRefusal =
	| { transport: 'api';  status: 402; body: { error: string; feature?: FeatureKey } }
	| { transport: 'page'; status: 303; location: string };

export function refusalFor(
	decision: EntitlementDecision,
	isApiPath: boolean,
): EntitlementRefusal | null {
	if (decision.kind === 'allow') return null;

	if (isApiPath) {
		return decision.kind === 'deny-feature'
			? { transport: 'api', status: 402, body: { error: 'plan_upgrade_required', feature: decision.feature } }
			: { transport: 'api', status: 402, body: { error: 'trial_expired' } };
	}

	const slug = decision.kind === 'deny-feature'
		? UPGRADE_SLUG[decision.feature]
		: decision.reason;

	return { transport: 'page', status: 303, location: `/billing?upgrade=${slug}` };
}

export const entitlementHandle: Handle = async ({ event, resolve }) => {
	const policy = policyFor(event.route.id);
	if (!policy || policy === 'open') return resolve(event);

	const entitlements = await event.locals.entitlements();

	const decision = resolveEntitlement({
		policy,
		features: entitlements?.features ?? null,
		access:   entitlements?.access   ?? null,
	});

	const refusal = refusalFor(decision, event.url.pathname.startsWith('/api/'));
	if (!refusal) return resolve(event);

	if (refusal.transport === 'api') return json(refusal.body, { status: refusal.status });

	redirect(refusal.status, refusal.location);
};
