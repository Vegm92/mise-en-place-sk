import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/batch', () => ({
	getItem: vi.fn(async (id: string) => {
		if (id === 'item-1') {
			return { id: 'item-1', restaurantId: 'r1', displayName: 'factura.pdf', fileKey: 'uploads/factura.pdf' };
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
import type { RequestEvent } from '@sveltejs/kit';

describe('GET /api/upload/[id]/[file] path traversal guard', () => {
	it('throws 401 Unauthorized if locals.user is missing', async () => {
		const event = {
			params: { id: 'item-1', file: 'factura.pdf' },
			locals: { user: null },
		} as unknown as RequestEvent;

		await expect(GET(event)).rejects.toMatchObject({ status: 401 });
	});

	it('throws 403 if params.file contains path traversal sequences', async () => {
		const event = {
			params: { id: 'item-1', file: '../etc/passwd' },
			locals: {
				user: { id: 'u1' },
				restaurantId: 'r1',
			},
		} as unknown as RequestEvent;

		await expect(GET(event)).rejects.toMatchObject({ status: 403 });
	});

	it('serves file response for valid matching file parameter', async () => {
		const event = {
			params: { id: 'item-1', file: 'factura.pdf' },
			locals: {
				user: { id: 'u1' },
				restaurantId: 'r1',
			},
		} as unknown as RequestEvent;

		const response = await GET(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/pdf');
	});
});
