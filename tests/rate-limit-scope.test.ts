/**
 * Issue #440 — checkRateLimit() call sites mixed user-id and restaurant-id
 * keys with no stated rule. rateLimitScoped() makes the identity explicit:
 * 'tenant' keys by restaurantId (paid capacity / shared quota), 'user' keys
 * by userId (per-person safety limits). These pin the key shape per scope
 * and the fail-closed behaviour when the identity a scope needs is missing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { checkRateLimitMock } = vi.hoisted(() => ({
	checkRateLimitMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: checkRateLimitMock }));

import { rateLimitScoped, scopedRateLimitKey } from '../src/lib/server/rate-limit-scope';

afterEach(() => {
	checkRateLimitMock.mockReset().mockResolvedValue(true);
});

describe('rateLimitScoped — key shape per scope', () => {
	it('tenant scope keys by restaurantId, ignoring a userId present on the identity', async () => {
		await rateLimitScoped(
			{ scope: 'tenant', name: 'chat', max: 20 },
			{ restaurantId: 'rest-1', userId: 'user-1' },
		);
		expect(checkRateLimitMock).toHaveBeenCalledWith('chat:rest-1', 20);
	});

	it('user scope keys by userId, ignoring a restaurantId present on the identity', async () => {
		await rateLimitScoped(
			{ scope: 'user', name: 'password-change', max: 5 },
			{ userId: 'user-1', restaurantId: 'rest-1' },
		);
		expect(checkRateLimitMock).toHaveBeenCalledWith('password-change:user-1', 5);
	});

	it('passes windowSeconds through only when the caller supplies one', async () => {
		await rateLimitScoped(
			{ scope: 'tenant', name: 'whatsapp-pair-gen', max: 10, windowSeconds: 3600 },
			{ restaurantId: 'rest-1' },
		);
		expect(checkRateLimitMock).toHaveBeenCalledWith('whatsapp-pair-gen:rest-1', 10, 3600);

		checkRateLimitMock.mockClear();
		await rateLimitScoped({ scope: 'user', name: 'trend', max: 60 }, { userId: 'user-1' });
		expect(checkRateLimitMock).toHaveBeenCalledWith('trend:user-1', 60);
		expect(checkRateLimitMock.mock.calls[0]).toHaveLength(2);
	});

	it('same name, different scope, different identity — produces distinct keys (the exact #440 confusion this replaces)', () => {
		const tenantKey = scopedRateLimitKey({ scope: 'tenant', name: 'chat', max: 20 }, { restaurantId: 'rest-1', userId: 'user-1' });
		const userKey = scopedRateLimitKey({ scope: 'user', name: 'chat', max: 20 }, { restaurantId: 'rest-1', userId: 'user-1' });
		expect(tenantKey).toBe('chat:rest-1');
		expect(userKey).toBe('chat:user-1');
		expect(tenantKey).not.toBe(userKey);
	});

	it('fails closed — throws rather than checking a rate limit keyed on "undefined" — when tenant scope has no restaurantId', async () => {
		await expect(
			rateLimitScoped({ scope: 'tenant', name: 'chat', max: 20 }, { userId: 'user-1' }),
		).rejects.toThrow(/missing tenant id/);
		expect(checkRateLimitMock).not.toHaveBeenCalled();
	});

	it('fails closed when user scope has no userId', async () => {
		await expect(
			rateLimitScoped({ scope: 'user', name: 'password-change', max: 5 }, { restaurantId: 'rest-1' }),
		).rejects.toThrow(/missing user id/);
		expect(checkRateLimitMock).not.toHaveBeenCalled();
	});

	it('returns exactly what the underlying limiter returns', async () => {
		checkRateLimitMock.mockResolvedValueOnce(false);
		expect(await rateLimitScoped({ scope: 'user', name: 'x', max: 1 }, { userId: 'u' })).toBe(false);

		checkRateLimitMock.mockResolvedValueOnce(true);
		expect(await rateLimitScoped({ scope: 'user', name: 'x', max: 1 }, { userId: 'u' })).toBe(true);
	});
});
