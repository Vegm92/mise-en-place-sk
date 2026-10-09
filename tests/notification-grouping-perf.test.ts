import { describe, test, expect } from 'vitest';
import { groupNotifications, type Notif } from '../src/lib/notification-display';

describe('groupNotifications performance and correctness', () => {
	test('correctly groups notifications across categories', () => {
		const items: Notif[] = [
			{ id: 1, notificationType: 'price_shock', message: 'Price increase', payload: null, createdAt: null },
			{ id: 2, notificationType: 'low_stock_forecast', message: 'Low stock', payload: null, createdAt: null },
			{ id: 3, notificationType: 'budget_overage', message: 'Over budget', payload: null, createdAt: null },
			{ id: 4, notificationType: 'supplier_uncategorized', message: 'Uncategorized', payload: null, createdAt: null },
			{ id: 5, notificationType: 'supplier_category_suggested', message: 'Suggested', payload: null, createdAt: null },
			{ id: 6, notificationType: 'custom_alert', message: 'Custom', payload: null, createdAt: null },
		];

		const groups = groupNotifications(items);
		expect(groups.priceShock).toHaveLength(1);
		expect(groups.priceShock[0]!.id).toBe(1);
		expect(groups.lowStock).toHaveLength(1);
		expect(groups.lowStock[0]!.id).toBe(2);
		expect(groups.budget).toHaveLength(1);
		expect(groups.budget[0]!.id).toBe(3);
		expect(groups.suppliers).toHaveLength(2);
		expect(groups.suppliers.map((s) => s.id)).toEqual([4, 5]);
		expect(groups.other).toHaveLength(1);
		expect(groups.other[0]!.id).toBe(6);
	});

	test('benchmarks groupNotifications performance', () => {
		const types = [
			'price_shock',
			'low_stock_forecast',
			'budget_overage',
			'supplier_uncategorized',
			'supplier_category_suggested',
			'unit_conversion_needed',
			'whatsapp_pending_save',
		];

		const items: Notif[] = Array.from({ length: 1000 }, (_, i) => ({
			id: i + 1,
			notificationType: types[i % types.length]!,
			message: `Notification ${i}`,
			payload: null,
			createdAt: null,
		}));

		const start = performance.now();
		const iterations = 10000;
		for (let i = 0; i < iterations; i++) {
			groupNotifications(items);
		}
		const elapsed = performance.now() - start;
		console.log(`groupNotifications benchmark (${iterations} ops x 1000 items): ${elapsed.toFixed(2)} ms`);
		expect(elapsed).toBeGreaterThan(0);
	});
});
