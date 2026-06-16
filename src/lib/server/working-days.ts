/**
 * Spanish working-day calculator for the 4-day invoice acceptance clock
 * mandated by RD 238/2026 (Ley Crea y Crece B2B e-invoicing).
 *
 * "Días hábiles" = calendar days excluding Saturdays, Sundays, and
 * Spanish national public holidays (fiestas nacionales). Regional and
 * local holidays are NOT included — the legal clock runs on national ones.
 */

// Fixed national holidays (month and day, 1-indexed)
const FIXED_HOLIDAYS: ReadonlyArray<readonly [month: number, day: number]> = [
	[1, 1],   // Año Nuevo
	[1, 6],   // Epifanía del Señor (Reyes Magos)
	[5, 1],   // Fiesta del Trabajo
	[8, 15],  // Asunción de la Virgen
	[10, 12], // Fiesta Nacional de España
	[11, 1],  // Todos los Santos
	[12, 6],  // Día de la Constitución Española
	[12, 8],  // Inmaculada Concepción
	[12, 25], // Navidad del Señor
];

/**
 * Viernes Santo (Good Friday) dates for 2024-2030.
 * Source: calendar calculations (Easter Sunday - 2 days).
 * This is the only moveable national holiday in Spain.
 */
const GOOD_FRIDAY: Readonly<Record<number, string>> = {
	2024: '2024-03-29',
	2025: '2025-04-18',
	2026: '2026-04-03',
	2027: '2027-03-26',
	2028: '2028-04-14',
	2029: '2029-04-18',
	2030: '2030-04-10',
};

function toIso(d: Date): string {
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export function isSpanishNationalHoliday(date: Date): boolean {
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const year = date.getFullYear();

	if (FIXED_HOLIDAYS.some(([m, d]) => m === month && d === day)) return true;

	const iso = toIso(date);
	return GOOD_FRIDAY[year] === iso;
}

export function isSpanishWorkingDay(date: Date): boolean {
	const dow = date.getDay(); // 0=Sun, 6=Sat
	if (dow === 0 || dow === 6) return false;
	return !isSpanishNationalHoliday(date);
}

/**
 * Counts Spanish working days strictly between `from` (exclusive) and `to` (inclusive).
 * This matches the legal meaning: a 4-day clock started on a Monday counts
 * Tue, Wed, Thu, Fri as 4 working days (assuming no holidays).
 */
export function countSpanishWorkingDaysUntil(from: Date, to: Date): number {
	const start = new Date(from);
	start.setHours(0, 0, 0, 0);
	const end = new Date(to);
	end.setHours(0, 0, 0, 0);

	if (end <= start) return 0;

	let count = 0;
	const cur = new Date(start);
	while (cur < end) {
		cur.setDate(cur.getDate() + 1);
		if (isSpanishWorkingDay(cur)) count++;
	}
	return count;
}

/**
 * Returns the date that is `days` Spanish working days after `from`.
 * The deadline for invoice acceptance under RD 238/2026 is
 * `addSpanishWorkingDays(invoiceReceivedAt, 4)`.
 */
export function addSpanishWorkingDays(from: Date, days: number): Date {
	if (days <= 0) return new Date(from);
	const result = new Date(from);
	result.setHours(0, 0, 0, 0);
	let added = 0;
	while (added < days) {
		result.setDate(result.getDate() + 1);
		if (isSpanishWorkingDay(result)) added++;
	}
	return result;
}

/**
 * Returns the number of Spanish working days remaining until the 4-day
 * acceptance deadline, given when the invoice was received.
 * Negative means the deadline has passed.
 */
export function workingDaysUntilDeadline(receivedAt: Date, today: Date, deadlineDays = 4): number {
	const deadline = addSpanishWorkingDays(receivedAt, deadlineDays);
	deadline.setHours(0, 0, 0, 0);
	const todayMid = new Date(today);
	todayMid.setHours(0, 0, 0, 0);

	if (todayMid >= deadline) {
		// Past deadline — return negative count of overrun working days
		return -countSpanishWorkingDaysUntil(deadline, todayMid) || 0;
	}
	return countSpanishWorkingDaysUntil(todayMid, deadline);
}
