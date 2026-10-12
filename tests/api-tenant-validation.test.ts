import { describe, it, expect } from 'vitest';
import { POST as unitConversionsPost } from '../src/routes/(app)/api/unit-conversions/+server';
import { GET as stockLevelsGet, POST as stockLevelsPost } from '../src/routes/(app)/api/stock-levels/+server';
import { GET as trendGet } from '../src/routes/(app)/api/trend/+server';

describe('API Endpoints Tenant Context Validation', () => {
	it('unit-conversions POST returns 409 when restaurantId is missing', async () => {
		const res = await unitConversionsPost({
			request: new Request('http://localhost/api/unit-conversions', {
				method: 'POST',
				body: JSON.stringify({}),
			}),
			locals: { user: { id: 'u_1' }, restaurantId: null },
		} as unknown as Parameters<typeof unitConversionsPost>[0]);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('No active restaurant');
	});

	it('stock-levels GET returns 409 when restaurantId is missing', async () => {
		const res = await stockLevelsGet({
			locals: { user: { id: 'u_1' }, restaurantId: null },
		} as unknown as Parameters<typeof stockLevelsGet>[0]);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('No active restaurant');
	});

	it('stock-levels POST returns 409 when restaurantId is missing', async () => {
		const res = await stockLevelsPost({
			request: new Request('http://localhost/api/stock-levels', {
				method: 'POST',
				body: JSON.stringify({}),
			}),
			locals: { user: { id: 'u_1' }, restaurantId: null },
		} as unknown as Parameters<typeof stockLevelsPost>[0]);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('No active restaurant');
	});

	it('trend GET returns 409 when restaurantId is missing', async () => {
		const res = await trendGet({
			url: new URL('http://localhost/api/trend'),
			locals: { user: { id: 'u_1' }, restaurantId: null },
		} as unknown as Parameters<typeof trendGet>[0]);

		expect(res.status).toBe(409);
		const json = await res.json();
		expect(json.error).toBe('No active restaurant');
	});
});
