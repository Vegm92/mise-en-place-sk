import { checkRateLimit } from './rate-limiter';

export type RateLimitScope = 'tenant' | 'user';

export interface RateLimitIdentity {
	userId?: string | null;
	restaurantId?: string | null;
}

export interface ScopedRateLimitOptions {
	scope: RateLimitScope;
	name: string;
	max: number;
	windowSeconds?: number;
}

export function scopedRateLimitKey(options: ScopedRateLimitOptions, identity: RateLimitIdentity): string {
	const id = options.scope === 'tenant' ? identity.restaurantId : identity.userId;
	if (!id) {
		throw new Error(
			`rateLimitScoped: missing ${options.scope} id for rate limit "${options.name}"`,
		);
	}
	return `${options.name}:${id}`;
}

export async function rateLimitScoped(
	options: ScopedRateLimitOptions,
	identity: RateLimitIdentity,
): Promise<boolean> {
	const key = scopedRateLimitKey(options, identity);
	return options.windowSeconds !== undefined
		? checkRateLimit(key, options.max, options.windowSeconds)
		: checkRateLimit(key, options.max);
}
