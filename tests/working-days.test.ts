/**
 * Tests for the Spanish working-day calculator (issue #112).
 * RD 238/2026 mandates invoice acceptance within 4 "días hábiles".
 */
import { describe, it, expect } from 'vitest';
import {
	isSpanishNationalHoliday,
	isSpanishWorkingDay,
	countSpanishWorkingDaysUntil,
	addSpanishWorkingDays,
	workingDaysUntilDeadline,
} from '../src/lib/server/working-days';

function d(iso: string): Date {
	return new Date(iso + 'T00:00:00Z');
}

// ── isSpanishNationalHoliday ──────────────────────────────────────────────────

describe('isSpanishNationalHoliday', () => {
	it('marks fixed national holidays', () => {
		expect(isSpanishNationalHoliday(d('2024-01-01'))).toBe(true);  // Año Nuevo
		expect(isSpanishNationalHoliday(d('2024-01-06'))).toBe(true);  // Reyes Magos
		expect(isSpanishNationalHoliday(d('2024-05-01'))).toBe(true);  // Día del Trabajo
		expect(isSpanishNationalHoliday(d('2024-08-15'))).toBe(true);  // Asunción
		expect(isSpanishNationalHoliday(d('2024-10-12'))).toBe(true);  // Fiesta Nacional
		expect(isSpanishNationalHoliday(d('2024-11-01'))).toBe(true);  // Todos los Santos
		expect(isSpanishNationalHoliday(d('2024-12-06'))).toBe(true);  // Constitución
		expect(isSpanishNationalHoliday(d('2024-12-08'))).toBe(true);  // Inmaculada
		expect(isSpanishNationalHoliday(d('2024-12-25'))).toBe(true);  // Navidad
	});

	it('marks Good Friday (Viernes Santo) as a holiday', () => {
		expect(isSpanishNationalHoliday(d('2024-03-29'))).toBe(true);  // 2024 Good Friday
		expect(isSpanishNationalHoliday(d('2025-04-18'))).toBe(true);  // 2025 Good Friday
		expect(isSpanishNationalHoliday(d('2026-04-03'))).toBe(true);  // 2026 Good Friday
	});

	it('does not mark regular working days as holidays', () => {
		expect(isSpanishNationalHoliday(d('2024-01-02'))).toBe(false);
		expect(isSpanishNationalHoliday(d('2024-06-16'))).toBe(false);
		expect(isSpanishNationalHoliday(d('2024-03-28'))).toBe(false); // Jueves Santo (regional, not national)
	});
});

// ── isSpanishWorkingDay ───────────────────────────────────────────────────────

describe('isSpanishWorkingDay', () => {
	it('returns false for Saturday and Sunday', () => {
		expect(isSpanishWorkingDay(d('2024-01-06'))).toBe(false); // Sat – also Reyes but Sat first
		expect(isSpanishWorkingDay(d('2024-06-15'))).toBe(false); // Sat
		expect(isSpanishWorkingDay(d('2024-06-16'))).toBe(false); // Sun
	});

	it('returns false for national holidays', () => {
		expect(isSpanishWorkingDay(d('2024-12-25'))).toBe(false); // Navidad (Wednesday)
		expect(isSpanishWorkingDay(d('2026-04-03'))).toBe(false); // Good Friday 2026 (Friday)
	});

	it('returns true for regular weekdays', () => {
		expect(isSpanishWorkingDay(d('2024-01-02'))).toBe(true);  // Tuesday after Año Nuevo
		expect(isSpanishWorkingDay(d('2024-06-17'))).toBe(true);  // Monday
		expect(isSpanishWorkingDay(d('2024-11-04'))).toBe(true);  // Monday (after Todos los Santos)
	});
});

// ── countSpanishWorkingDaysUntil ──────────────────────────────────────────────

describe('countSpanishWorkingDaysUntil', () => {
	it('counts Mon-Fri correctly with no holidays', () => {
		// Mon to Fri = 4 working days strictly between (Tue, Wed, Thu, Fri)
		expect(countSpanishWorkingDaysUntil(d('2024-01-08'), d('2024-01-12'))).toBe(4);
	});

	it('returns 0 when from === to', () => {
		expect(countSpanishWorkingDaysUntil(d('2024-06-17'), d('2024-06-17'))).toBe(0);
	});

	it('returns 0 when to is before from', () => {
		expect(countSpanishWorkingDaysUntil(d('2024-06-18'), d('2024-06-17'))).toBe(0);
	});

	it('skips weekends in the count', () => {
		// Friday (Jan 5) to Sunday (Jan 7) = 0 (Sat and Sun are not working)
		expect(countSpanishWorkingDaysUntil(d('2024-01-05'), d('2024-01-07'))).toBe(0);
		// Friday (Jan 5) to Monday (Jan 8) = 1 (Monday is included, is a working day)
		expect(countSpanishWorkingDaysUntil(d('2024-01-05'), d('2024-01-08'))).toBe(1);
		// Friday (Jan 5) to Tuesday (Jan 9) = 2 (Monday + Tuesday, Jan 6 = Reyes Magos but it's Sat)
		expect(countSpanishWorkingDaysUntil(d('2024-01-05'), d('2024-01-09'))).toBe(2);
	});

	it('skips national holidays in the count', () => {
		// Week of Christmas 2024: Mon 23 → Fri 27 (Dec 25 is holiday)
		// Tue 24, Thu 26, Fri 27 = 3 working days (Xmas excluded)
		expect(countSpanishWorkingDaysUntil(d('2024-12-23'), d('2024-12-27'))).toBe(3);
	});
});

// ── addSpanishWorkingDays ─────────────────────────────────────────────────────

describe('addSpanishWorkingDays', () => {
	it('adds 4 working days from a Monday', () => {
		// Mon Jan 8 + 4 = Fri Jan 12
		const result = addSpanishWorkingDays(d('2024-01-08'), 4);
		expect(result.toISOString().startsWith('2024-01-12')).toBe(true);
	});

	it('skips weekends when adding days', () => {
		// Thu Jan 11 + 4 = Wed Jan 17 (skipping Sat 13, Sun 14)
		const result = addSpanishWorkingDays(d('2024-01-11'), 4);
		expect(result.toISOString().startsWith('2024-01-17')).toBe(true);
	});

	it('skips national holidays when adding days', () => {
		// Dec 23 (Mon) + 4 working days, skipping Dec 25 (Xmas): Tue 24, Thu 26, Fri 27, Mon 30
		const result = addSpanishWorkingDays(d('2024-12-23'), 4);
		expect(result.toISOString().startsWith('2024-12-30')).toBe(true);
	});

	it('returns from date unchanged when 0 days are added', () => {
		const from = d('2024-06-17');
		const result = addSpanishWorkingDays(from, 0);
		expect(result.getTime()).toBe(from.getTime());
	});
});

// ── workingDaysUntilDeadline ──────────────────────────────────────────────────

describe('workingDaysUntilDeadline', () => {
	it('returns 4 when received today (deadline is 4 working days away)', () => {
		// Received Monday Jan 8, today is same day — deadline is Fri Jan 12 = 4 days left
		const receivedAt = d('2024-01-08');
		const today = d('2024-01-08');
		expect(workingDaysUntilDeadline(receivedAt, today, 4)).toBe(4);
	});

	it('returns 0 on the deadline day itself', () => {
		// Received Mon Jan 8, today is Fri Jan 12 (deadline = Fri Jan 12)
		const receivedAt = d('2024-01-08');
		const today = d('2024-01-12');
		expect(workingDaysUntilDeadline(receivedAt, today, 4)).toBe(0);
	});

	it('returns a negative value when deadline has passed', () => {
		// Received Mon Jan 8, deadline Fri Jan 12, today is Mon Jan 15 (1 day overrun)
		const receivedAt = d('2024-01-08');
		const today = d('2024-01-15');
		const result = workingDaysUntilDeadline(receivedAt, today, 4);
		expect(result).toBeLessThan(0);
	});

	it('correctly accounts for Good Friday in the deadline calculation', () => {
		// 2026 Good Friday is Apr 3 (Friday, holiday). Invoice received Mon Mar 30.
		// 4 working days: Tue Apr 1 (1), Wed Apr 2 (2), Apr 3 skipped (holiday),
		// Apr 4-5 weekend, Mon Apr 6 (3), Tue Apr 7 (4) → deadline Tue Apr 7? No:
		// After Good Friday Apr 3, next working: Mon Apr 6 (3), Tue Apr 7 (4)
		// Wait: Mar 31=Tue(1), Apr 1=Wed(2), Apr 2=Thu(3), Apr 3=Fri/holiday skip,
		//       Apr 4=Sat, Apr 5=Sun, Apr 6=Mon(4) → deadline Mon Apr 6
		const receivedAt = d('2026-03-30');
		const deadline = addSpanishWorkingDays(receivedAt, 4);
		expect(deadline.toISOString().startsWith('2026-04-06')).toBe(true);
	});
});
