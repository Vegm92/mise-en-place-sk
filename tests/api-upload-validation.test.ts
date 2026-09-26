import { describe, it, expect, vi } from 'vitest';
import { GET } from '../src/routes/api/upload/[id]/[file]/+server';

vi.mock('$lib/server/rate-limit-scope', () => ({
	rateLimitScoped: vi.fn().mockResolvedValue(true),
}));

describe('GET /api/upload/[id]/[file]', () => {
	it('throws 400 Bad Request when id is not a valid UUID', async () => {
		const event = {
			params: { id: 'invalid-id-format', file: 'test.pdf' },
			locals: {
				user: { id: 'usr_123' },
				restaurantId: 'rest_123',
			},
		};

		await expect(GET(event as any)).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid item ID' },
		});
	});
});
