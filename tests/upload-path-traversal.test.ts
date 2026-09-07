import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/batch', () => ({
	isUuid: vi.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
	getItem: vi.fn(async (id: string) => {
		if (id === '123e4567-e89b-12d3-a456-426614174000') {
			return { id, restaurantId: 'r1', displayName: 'factura.pdf', fileKey: 'uploads/factura.pdf' };
		}
		return null;
	}),
}));

vi.mock('$lib/server/storage', () => ({
	getStorage: vi.fn(() => ({
		read: vi.fn(async () => Buffer.from('test')),
	})),
}));

import { GET } from '../src/routes/api/upload/[id]/[file]/+server';

type RouteEvent = Parameters<typeof GET>[0];

describe('GET /api/upload/[id]/[file] path traversal guard', () => {
	function makeEvent(id: string, file: string, user: { id: string } | null = { id: 'u1' }) {
		return {
			params: { id, file },
			locals: { user, restaurantId: 'r1' },
		} as unknown as RouteEvent;
	}

	it('throws 401 Unauthorized if locals.user is missing', async () => {
		const event = makeEvent('123e4567-e89b-12d3-a456-426614174000', 'factura.pdf', null);
		await expect(GET(event)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 400 Bad Request if params.id is not a valid UUID', async () => {
		const event = makeEvent('invalid-uuid-format', 'factura.pdf');
		await expect(GET(event)).rejects.toMatchObject({ status: 400 });
	});

	it('throws 403 if params.file contains path traversal sequences', async () => {
		const event = makeEvent('123e4567-e89b-12d3-a456-426614174000', '../etc/passwd');
		await expect(GET(event)).rejects.toMatchObject({ status: 403 });
	});

	it('serves file response for valid matching file parameter', async () => {
		const event = makeEvent('123e4567-e89b-12d3-a456-426614174000', 'factura.pdf');
		const response = await GET(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/pdf');
	});
});
