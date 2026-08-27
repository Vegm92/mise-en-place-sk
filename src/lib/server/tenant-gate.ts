export type TenantGateDecision = 'allow' | 'redirect-onboarding' | 'deny-api';

export function resolveTenantGate(routeId: string | null): TenantGateDecision {
	if (!routeId || !routeId.startsWith('/(app)')) return 'allow';
	return routeId.startsWith('/(app)/api') ? 'deny-api' : 'redirect-onboarding';
}
