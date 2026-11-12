import { describe, it, expect } from 'vitest';
import { periodAppliesToList } from '../src/lib/invoice-filters';

describe('periodAppliesToList', () => {
	const base = { saved: false, status: '', dateFrom: '', dateTo: '', periodParam: null };

	it('applies the default period to a plain list', () => {
		expect(periodAppliesToList(base)).toBe(true);
		expect(periodAppliesToList({ ...base, status: 'revisado' })).toBe(true);
	});

	it('drops the default period right after a save so a back-dated albarán stays visible', () => {
		expect(periodAppliesToList({ ...base, saved: true })).toBe(false);
	});

	it('drops the default period for the open review states the dashboard links to', () => {
		expect(periodAppliesToList({ ...base, status: 'por_revisar' })).toBe(false);
		expect(periodAppliesToList({ ...base, status: 'incidencia' })).toBe(false);
	});

	it('keeps explicit dates and an explicitly chosen period', () => {
		expect(periodAppliesToList({ ...base, saved: true, dateFrom: '2024-01-01' })).toBe(true);
		expect(periodAppliesToList({ ...base, status: 'por_revisar', dateTo: '2024-01-31' })).toBe(true);
		expect(periodAppliesToList({ ...base, status: 'incidencia', periodParam: '3m' })).toBe(true);
		expect(periodAppliesToList({ ...base, status: 'incidencia', periodParam: 'bogus' })).toBe(false);
	});
});
