import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { sqlRows } from '$lib/server/sql-rows';

export const AdminCountsRowSchema = v.object({
	invoices_7d: v.union([v.string(), v.number()]),
	invoices_prev_7d: v.union([v.string(), v.number()]),
	active_restaurants_7d: v.union([v.string(), v.number()]),
	pending_notifs: v.union([v.string(), v.number()]),
	total_invoices: v.union([v.string(), v.number()]),
	total_suppliers: v.union([v.string(), v.number()]),
	total_restaurants: v.union([v.string(), v.number()]),
	pending_extractions: v.union([v.string(), v.number()]),
});

export const AdminActivityRowSchema = v.object({
	id: v.union([v.number(), v.string()]),
	notification_type: v.nullable(v.string()),
	message: v.nullable(v.string()),
	created_at: v.nullable(v.string()),
	restaurant_name: v.nullable(v.string()),
});

export const AdminAccountRowSchema = v.object({
	id: v.string(),
	email: v.string(),
	access_status: v.string(),
	founder: v.boolean(),
	email_verified: v.nullable(v.string()),
	created_at: v.union([v.string(), v.instance(Date)]),
	restaurant_count: v.union([v.string(), v.number()]),
});

export const AdminWaitlistRowSchema = v.object({
	email: v.string(),
	created_at: v.union([v.string(), v.instance(Date)]),
});

describe('sqlRows validation for /admin routes', () => {
	it('parses counts rows correctly', () => {
		const raw = [
			{
				invoices_7d: '10',
				invoices_prev_7d: '5',
				active_restaurants_7d: '2',
				pending_notifs: '0',
				total_invoices: '100',
				total_suppliers: '15',
				total_restaurants: '3',
				pending_extractions: '1',
			},
		];
		const parsed = sqlRows(raw, AdminCountsRowSchema);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.invoices_7d).toBe('10');
	});

	it('parses activity rows correctly with nulls', () => {
		const raw = [
			{
				id: 1,
				notification_type: 'alert',
				message: 'Test message',
				created_at: '2026-09-09T00:00:00Z',
				restaurant_name: null,
			},
		];
		const parsed = sqlRows(raw, AdminActivityRowSchema);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.restaurant_name).toBeNull();
	});

	it('parses access account rows correctly', () => {
		const raw = [
			{
				id: 'usr_1',
				email: 'admin@example.com',
				access_status: 'approved',
				founder: true,
				email_verified: null,
				created_at: '2026-01-01',
				restaurant_count: '2',
			},
		];
		const parsed = sqlRows(raw, AdminAccountRowSchema);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.email).toBe('admin@example.com');
	});

	it('parses waitlist rows correctly', () => {
		const raw = [
			{
				email: 'waitlist@example.com',
				created_at: '2026-02-01',
			},
		];
		const parsed = sqlRows(raw, AdminWaitlistRowSchema);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.email).toBe('waitlist@example.com');
	});

	it('throws descriptive error on column mismatch', () => {
		const invalidRaw = [
			{
				id: 'usr_1',
				// missing email
				access_status: 'approved',
				founder: true,
				email_verified: null,
				created_at: '2026-01-01',
				restaurant_count: '2',
			},
		];
		expect(() => sqlRows(invalidRaw, AdminAccountRowSchema)).toThrowError(/sql row shape mismatch/);
	});
});
