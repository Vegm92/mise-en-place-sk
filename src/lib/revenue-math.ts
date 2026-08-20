export const HEALTHY_LTV_CAC_RATIO = 3;
export const WARN_LTV_CAC_RATIO = 1;
export const HEALTHY_PAYBACK_MONTHS = 12;
export const WARN_PAYBACK_MONTHS = 18;
export const HEALTHY_NRR = 1;
export const WARN_NRR = 0.9;
export const DEFAULT_LTV_HORIZON_MONTHS = 36;
export const DEFAULT_GROSS_MARGIN_PCT = 80;
export const COHORT_OFFSETS = [3, 6, 12] as const;

export type Health = 'good' | 'warn' | 'bad' | 'unknown';

export interface TenantMrr {
	restaurantId: string;
	mrrCents: number;
}

export interface MrrMovement {
	startCents: number;
	newCents: number;
	reactivationCents: number;
	expansionCents: number;
	contractionCents: number;
	churnedCents: number;
	endCents: number;
}

function total(rows: TenantMrr[]): number {
	return rows.reduce((sum, r) => sum + r.mrrCents, 0);
}

function byTenant(rows: TenantMrr[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const row of rows) map.set(row.restaurantId, (map.get(row.restaurantId) ?? 0) + row.mrrCents);
	return map;
}

function applyCurrent(
	acc: { newCents: number; reactivationCents: number; expansionCents: number; contractionCents: number; churnedCents: number },
	restaurantId: string,
	before: number,
	now: number,
	everPaidBefore: Set<string>,
): void {
	if (before === 0 && now > 0) {
		if (everPaidBefore.has(restaurantId)) acc.reactivationCents += now;
		else acc.newCents += now;
	} else if (now > before) {
		acc.expansionCents += now - before;
	} else if (now < before) {
		if (now === 0) acc.churnedCents += before;
		else acc.contractionCents += before - now;
	}
}

export function mrrMovement(
	previous: TenantMrr[],
	current: TenantMrr[],
	everPaidBefore: Set<string> = new Set(),
): MrrMovement {
	const prev = byTenant(previous);
	const curr = byTenant(current);

	const acc = {
		newCents: 0,
		reactivationCents: 0,
		expansionCents: 0,
		contractionCents: 0,
		churnedCents: 0,
	};

	for (const [restaurantId, now] of curr) {
		const before = prev.get(restaurantId) ?? 0;
		applyCurrent(acc, restaurantId, before, now, everPaidBefore);
	}

	for (const [restaurantId, before] of prev) {
		if (before > 0 && !curr.has(restaurantId)) acc.churnedCents += before;
	}

	return {
		startCents: total(previous),
		newCents: acc.newCents,
		reactivationCents: acc.reactivationCents,
		expansionCents: acc.expansionCents,
		contractionCents: acc.contractionCents,
		churnedCents: acc.churnedCents,
		endCents: total(current),
	};
}

export function netRetention(previous: TenantMrr[], current: TenantMrr[]): number | null {
	const prev = byTenant(previous);
	const curr = byTenant(current);
	let base = 0;
	let retained = 0;
	for (const [restaurantId, before] of prev) {
		if (before <= 0) continue;
		base += before;
		retained += curr.get(restaurantId) ?? 0;
	}
	return base > 0 ? retained / base : null;
}

export function grossRetention(previous: TenantMrr[], current: TenantMrr[]): number | null {
	const prev = byTenant(previous);
	const curr = byTenant(current);
	let base = 0;
	let retained = 0;
	for (const [restaurantId, before] of prev) {
		if (before <= 0) continue;
		base += before;
		retained += Math.min(curr.get(restaurantId) ?? 0, before);
	}
	return base > 0 ? retained / base : null;
}

export function logoChurnRate(startCustomers: number, churnedCustomers: number): number | null {
	return startCustomers > 0 ? churnedCustomers / startCustomers : null;
}

export function revenueChurnRate(startCents: number, churnedCents: number): number | null {
	return startCents > 0 ? churnedCents / startCents : null;
}

export function arpaCents(mrrCents: number, payingCustomers: number): number {
	return payingCustomers > 0 ? mrrCents / payingCustomers : 0;
}

export function acvCents(monthlyArpaCents: number): number {
	return monthlyArpaCents * 12;
}

export function cacCents(spendCents: number, newCustomers: number): number | null {
	return newCustomers > 0 ? spendCents / newCustomers : null;
}

export function marginRatio(grossMarginPct: number): number {
	return Math.min(Math.max(grossMarginPct, 0), 100) / 100;
}

export function expectedLifetimeMonths(
	monthlyChurnRate: number | null,
	horizonMonths: number = DEFAULT_LTV_HORIZON_MONTHS,
): number {
	if (monthlyChurnRate === null || monthlyChurnRate <= 0) return horizonMonths;
	return Math.min(1 / monthlyChurnRate, horizonMonths);
}

export function ltvCents(
	monthlyArpaCents: number,
	grossMarginPct: number,
	monthlyChurnRate: number | null,
	horizonMonths: number = DEFAULT_LTV_HORIZON_MONTHS,
): number {
	return monthlyArpaCents * marginRatio(grossMarginPct) * expectedLifetimeMonths(monthlyChurnRate, horizonMonths);
}

export function ltvCacRatio(ltv: number, cac: number | null): number | null {
	if (cac === null || cac <= 0) return null;
	return ltv / cac;
}

export function paybackMonths(
	cac: number | null,
	monthlyArpaCents: number,
	grossMarginPct: number,
): number | null {
	if (cac === null || cac <= 0) return null;
	const monthlyGrossProfit = monthlyArpaCents * marginRatio(grossMarginPct);
	if (monthlyGrossProfit <= 0) return null;
	return cac / monthlyGrossProfit;
}

export function ratioHealth(ratio: number | null): Health {
	if (ratio === null) return 'unknown';
	if (ratio >= HEALTHY_LTV_CAC_RATIO) return 'good';
	if (ratio >= WARN_LTV_CAC_RATIO) return 'warn';
	return 'bad';
}

export function paybackHealth(months: number | null): Health {
	if (months === null) return 'unknown';
	if (months <= HEALTHY_PAYBACK_MONTHS) return 'good';
	if (months <= WARN_PAYBACK_MONTHS) return 'warn';
	return 'bad';
}

export function retentionHealth(rate: number | null): Health {
	if (rate === null) return 'unknown';
	if (rate >= HEALTHY_NRR) return 'good';
	if (rate >= WARN_NRR) return 'warn';
	return 'bad';
}

export function churnHealth(rate: number | null): Health {
	if (rate === null) return 'unknown';
	if (rate <= 0.02) return 'good';
	if (rate <= 0.05) return 'warn';
	return 'bad';
}

export const MAX_ACQUISITION_AMOUNT_CENTS = 100_000_000 * 100;

export function parseAmountCents(raw: string): number | null {
	const cleaned = raw.trim().replace(/[\s€]/g, '');
	if (cleaned === '') return null;
	const normalized = cleaned.includes(',')
		? cleaned.replace(/\./g, '').replace(',', '.')
		: cleaned;
	const value = Number(normalized);
	if (!Number.isFinite(value) || value <= 0) return null;
	const cents = Math.round(value * 100);
	return cents > MAX_ACQUISITION_AMOUNT_CENTS ? null : cents;
}

export function monthKey(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, delta: number): string {
	const year = Number(month.slice(0, 4));
	const index = Number(month.slice(5, 7)) - 1 + delta;
	const shiftedYear = year + Math.floor(index / 12);
	const shiftedMonth = ((index % 12) + 12) % 12;
	return `${shiftedYear}-${String(shiftedMonth + 1).padStart(2, '0')}`;
}

export function monthsBetween(from: string, to: string): number {
	const fromIndex = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)) - 1;
	const toIndex = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - 1;
	return toIndex - fromIndex;
}

export function monthRange(from: string, to: string): string[] {
	const span = monthsBetween(from, to);
	if (span < 0) return [];
	return Array.from({ length: span + 1 }, (_, i) => addMonths(from, i));
}

export interface CohortRow {
	month: string;
	customers: number;
	startMrrCents: number;
	retention: Array<{ offset: number; rate: number | null; customers: number | null }>;
	revenueRetention: Array<{ offset: number; rate: number | null }>;
}

export function buildCohorts(
	cohortOf: Map<string, string>,
	payingMonths: Map<string, Map<string, number>>,
	latestMonth: string,
	offsets: readonly number[] = COHORT_OFFSETS,
): CohortRow[] {
	const members = new Map<string, string[]>();
	for (const [restaurantId, month] of cohortOf) {
		const list = members.get(month) ?? [];
		list.push(restaurantId);
		members.set(month, list);
	}

	return [...members.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([month, ids]) => {
			const mrrAt = (restaurantId: string, at: string) => payingMonths.get(restaurantId)?.get(at) ?? 0;
			const startMrrCents = ids.reduce((sum, id) => sum + mrrAt(id, month), 0);

			const retention = offsets.map((offset) => {
				const at = addMonths(month, offset);
				if (monthsBetween(at, latestMonth) < 0) return { offset, rate: null, customers: null };
				const alive = ids.filter((id) => mrrAt(id, at) > 0).length;
				return { offset, rate: ids.length > 0 ? alive / ids.length : null, customers: alive };
			});

			const revenueRetention = offsets.map((offset) => {
				const at = addMonths(month, offset);
				if (monthsBetween(at, latestMonth) < 0 || startMrrCents <= 0) return { offset, rate: null };
				const now = ids.reduce((sum, id) => sum + mrrAt(id, at), 0);
				return { offset, rate: now / startMrrCents };
			});

			return { month, customers: ids.length, startMrrCents, retention, revenueRetention };
		});
}
