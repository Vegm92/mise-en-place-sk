import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/batch', () => ({
	UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
	getItem: vi.fn(async (id: string) => {
		if (id === '12345678-1234-1234-1234-1234567890ab') {
			return { id: '12345678-1234-1234-1234-1234567890ab', restaurantId: 'r1', displayName: 'factura.pdf', fileKey: 'uploads/factura.pdf' };
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
	it('throws 401 Unauthorized if locals.user is missing', async () => {
		const event = {
			params: { id: '12345678-1234-1234-1234-1234567890ab', file: 'factura.pdf' },
			locals: { user: null },
		} as unknown as RouteEvent;

		await expect(GET(event)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 403 if params.file contains path traversal sequences', async () => {
		const event = {
			params: { id: '12345678-1234-1234-1234-1234567890ab', file: '../etc/passwd' },
			locals: {
				user: { id: 'u1' },
				restaurantId: 'r1',
			},
		} as unknown as RouteEvent;

		await expect(GET(event)).rejects.toMatchObject({ status: 403 });
	});

	it('serves file response for valid matching file parameter', async () => {
		const event = {
			params: { id: '12345678-1234-1234-1234-1234567890ab', file: 'factura.pdf' },
			locals: {
				user: { id: 'u1' },
				restaurantId: 'r1',
			},
		} as unknown as RouteEvent;

		const response = await GET(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/pdf');
	});
});
