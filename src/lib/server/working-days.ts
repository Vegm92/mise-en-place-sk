import { isoDate } from './dates';

const FIXED_HOLIDAYS: ReadonlyArray<readonly [month: number, day: number]> = [
	[1, 1],
	[1, 6],
	[5, 1],
	[8, 15],
	[10, 12],
	[11, 1],
	[12, 6],
	[12, 8],
	[12, 25],
];

const GOOD_FRIDAY: Readonly<Record<number, string>> = {
	2024: '2024-03-29',
	2025: '2025-04-18',
	2026: '2026-04-03',
	2027: '2027-03-26',
	2028: '2028-04-14',
	2029: '2029-04-18',
	2030: '2030-04-10',
};

export function isSpanishNationalHoliday(date: Date): boolean {
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const year = date.getFullYear();

	if (FIXED_HOLIDAYS.some(([m, d]) => m === month && d === day)) return true;

	const iso = isoDate(date);
	return GOOD_FRIDAY[year] === iso;
}

export function isSpanishWorkingDay(date: Date): boolean {
	const dow = date.getDay();
	if (dow === 0 || dow === 6) return false;
	return !isSpanishNationalHoliday(date);
}

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

export function workingDaysUntilDeadline(receivedAt: Date, today: Date, deadlineDays = 4): number {
	const deadline = addSpanishWorkingDays(receivedAt, deadlineDays);
	deadline.setHours(0, 0, 0, 0);
	const todayMid = new Date(today);
	todayMid.setHours(0, 0, 0, 0);

	if (todayMid >= deadline) {
		return -countSpanishWorkingDaysUntil(deadline, todayMid) || 0;
	}
	return countSpanishWorkingDaysUntil(todayMid, deadline);
}
