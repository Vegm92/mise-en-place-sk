export const WORK_KINDS = ['price', 'budget', 'review', 'missing', 'supplier'] as const;

export type WorkKind = (typeof WORK_KINDS)[number];

export type Severity = 'high' | 'med' | 'low';

export interface WorkItem {
	id: string;
	kind: WorkKind;
	severity: Severity;
	eur: number;
	urgencyRank: number;
	urgencyKey: string;
	urgencyVars: Record<string, string | number>;
	titleKey: string;
	titleVars: Record<string, string | number>;
	whyKey: string;
	whyVars: Record<string, string | number>;
	actionKey: string;
	href: string;
}

export interface PriceShockInput {
	id: number;
	ingredient: string;
	supplier: string;
	oldPrice: number;
	newPrice: number;
	deviationPct: number;
	monthSpend: number;
	daysAgo: number;
}

export interface MissingInput {
	supplier_name: string;
	days_late: number;
	frequency: string;
}

export interface UncategorizedInput {
	supplierId: number;
	supplierName: string;
}

export interface TurnoInput {
	isCurrentMonth: boolean;
	daysElapsed: number;
	daysInMonth: number;
	monthSpend: number;
	projectedEom: number;
	totalBudget: number;
	budgets: Record<string, number>;
	categorySpend: Record<string, number>;
	priceShocks: PriceShockInput[];
	review: { count: number; amount: number; incidencias: number };
	missing: MissingInput[];
	uncategorized: UncategorizedInput[];
}

export const MAX_WORK_ITEMS = 6;

const MISSING_FREQUENCIES: string[] = ['weekly', 'biweekly', 'monthly', 'periodic'];

const MAX_PRICE_ITEMS = 3;
const MAX_BUDGET_ITEMS = 2;

export function elapsedFraction(input: Pick<TurnoInput, 'isCurrentMonth' | 'daysElapsed' | 'daysInMonth'>): number {
	if (!input.isCurrentMonth) return 1;
	if (input.daysInMonth <= 0) return 1;
	return Math.min(1, Math.max(input.daysElapsed, 0) / input.daysInMonth);
}

export function planToDate(totalBudget: number, input: Pick<TurnoInput, 'isCurrentMonth' | 'daysElapsed' | 'daysInMonth'>): number {
	return totalBudget * elapsedFraction(input);
}

export function forecastFromRunRate(spent: number, input: Pick<TurnoInput, 'isCurrentMonth' | 'daysElapsed' | 'daysInMonth'>): number {
	const f = elapsedFraction(input);
	if (f <= 0) return spent;
	return spent / f;
}

export function priceShockImpact(shock: Pick<PriceShockInput, 'deviationPct' | 'monthSpend'>): number {
	const dev = shock.deviationPct / 100;
	if (dev <= 0) return 0;
	return shock.monthSpend * (dev / (1 + dev));
}

export interface CategoryRisk {
	category: string;
	spent: number;
	budget: number;
	planToDate: number;
	forecast: number;
	overrun: number;
}

export function buildCategoryRisk(input: TurnoInput): CategoryRisk[] {
	return Object.entries(input.budgets)
		.filter(([, budget]) => budget > 0)
		.map(([category, budget]) => {
			const spent = input.categorySpend[category] ?? 0;
			const forecast = forecastFromRunRate(spent, input);
			return {
				category,
				spent,
				budget,
				planToDate: planToDate(budget, input),
				forecast,
				overrun: forecast - budget,
			};
		})
		.sort((a, b) => b.overrun - a.overrun);
}

function priceItems(input: TurnoInput): WorkItem[] {
	return input.priceShocks
		.filter((s) => s.deviationPct > 0)
		.map((s) => ({ s, eur: priceShockImpact(s) }))
		.sort((a, b) => b.eur - a.eur)
		.slice(0, MAX_PRICE_ITEMS)
		.map(({ s, eur }) => ({
			id: `price-${s.id}`,
			kind: 'price' as const,
			severity: 'high' as const,
			eur,
			urgencyRank: 2 + s.daysAgo,
			urgencyKey: s.daysAgo <= 0 ? 'turno.when.today' : 'turno.when.daysAgo',
			urgencyVars: { n: s.daysAgo },
			titleKey: 'turno.price.title',
			titleVars: { ingredient: s.ingredient, pct: Math.round(s.deviationPct * 10) / 10 },
			whyKey: 'turno.price.why',
			whyVars: { supplier: s.supplier, from: s.oldPrice, to: s.newPrice },
			actionKey: 'turno.price.action',
			href: '/analytics/prices',
		}));
}

function budgetItems(input: TurnoInput): WorkItem[] {
	if (!input.isCurrentMonth) return [];
	const daysLeft = Math.max(0, input.daysInMonth - input.daysElapsed);
	return buildCategoryRisk(input)
		.filter((c) => c.overrun > 0)
		.slice(0, MAX_BUDGET_ITEMS)
		.map((c) => ({
			id: `budget-${c.category}`,
			kind: 'budget' as const,
			severity: c.spent > c.budget ? 'high' as const : 'med' as const,
			eur: c.overrun,
			urgencyRank: 10,
			urgencyKey: 'turno.when.thisWeek',
			urgencyVars: {},
			titleKey: 'turno.budget.title',
			titleVars: { category: c.category },
			whyKey: 'turno.budget.why',
			whyVars: { spent: Math.round(c.spent), budget: Math.round(c.budget), days: daysLeft },
			actionKey: 'turno.budget.action',
			href: '/budgets',
		}));
}

function reviewItems(input: TurnoInput): WorkItem[] {
	if (input.review.count <= 0) return [];
	const incidencias = input.review.incidencias;
	return [{
		id: 'review',
		kind: 'review',
		severity: incidencias > 0 ? 'med' : 'low',
		eur: input.review.amount,
		urgencyRank: 1,
		urgencyKey: 'turno.when.today',
		urgencyVars: { n: 0 },
		titleKey: input.review.count === 1 ? 'turno.review.title.one' : 'turno.review.title.other',
		titleVars: { n: input.review.count },
		whyKey: incidencias > 0 ? 'turno.review.whyIssues' : 'turno.review.why',
		whyVars: { n: incidencias },
		actionKey: 'turno.review.action',
		href: incidencias > 0 ? '/invoices?status=incidencia' : '/invoices?status=por_revisar',
	}];
}

function missingItems(input: TurnoInput): WorkItem[] {
	const m = input.missing[0];
	if (!m) return [];
	return [{
		id: `missing-${m.supplier_name}`,
		kind: 'missing',
		severity: 'med',
		eur: 0,
		urgencyRank: 90,
		urgencyKey: 'turno.when.whenYouCan',
		urgencyVars: {},
		titleKey: 'turno.missing.title',
		titleVars: { supplier: m.supplier_name, days: m.days_late },
		whyKey: `turno.missing.why.${MISSING_FREQUENCIES.includes(m.frequency) ? m.frequency : 'periodic'}`,
		whyVars: {},
		actionKey: 'turno.missing.action',
		href: '/suppliers',
	}];
}

function supplierItems(input: TurnoInput): WorkItem[] {
	const s = input.uncategorized[0];
	if (!s) return [];
	return [{
		id: `supplier-${s.supplierId}`,
		kind: 'supplier',
		severity: 'low',
		eur: 0,
		urgencyRank: 99,
		urgencyKey: 'turno.when.whenYouCan',
		urgencyVars: {},
		titleKey: 'turno.supplier.title',
		titleVars: { supplier: s.supplierName },
		whyKey: 'turno.supplier.why',
		whyVars: {},
		actionKey: 'turno.supplier.action',
		href: `/suppliers/${s.supplierId}`,
	}];
}

export function buildWorklist(input: TurnoInput): WorkItem[] {
	const items = [
		...priceItems(input),
		...budgetItems(input),
		...reviewItems(input),
		...missingItems(input),
		...supplierItems(input),
	];
	return sortWorklist(items, 'money').slice(0, MAX_WORK_ITEMS);
}

export type SortMode = 'money' | 'urgency';

export function sortWorklist(items: WorkItem[], mode: SortMode): WorkItem[] {
	if (mode === 'urgency') return [...items].sort((a, b) => a.urgencyRank - b.urgencyRank || b.eur - a.eur);
	return [...items].sort((a, b) => {
		if ((a.eur > 0) !== (b.eur > 0)) return a.eur > 0 ? -1 : 1;
		if (a.eur !== b.eur) return b.eur - a.eur;
		return a.urgencyRank - b.urgencyRank;
	});
}

export function atStake(items: WorkItem[]): number {
	return items.reduce((s, i) => s + i.eur, 0);
}

export interface PacePoint {
	day: number;
	actual: number | null;
	plan: number | null;
	forecast: number | null;
}

export function buildPaceCurve(
	sparkData: number[],
	input: Pick<TurnoInput, 'isCurrentMonth' | 'daysElapsed' | 'daysInMonth' | 'monthSpend' | 'totalBudget'>,
): PacePoint[] {
	const days = input.daysInMonth;
	const lastActualDay = input.isCurrentMonth ? Math.min(input.daysElapsed, days) : days;
	const rate = lastActualDay > 0 ? input.monthSpend / lastActualDay : 0;
	const points: PacePoint[] = [];
	let cum = 0;
	let cumAtToday = 0;
	for (let d = 1; d <= days; d++) {
		const isActual = d <= lastActualDay;
		if (isActual) cum += sparkData[d - 1] ?? 0;
		if (d === lastActualDay) cumAtToday = cum;
		points.push({
			day: d,
			actual: isActual ? cum : null,
			plan: input.totalBudget > 0 ? (input.totalBudget * d) / days : null,
			forecast: null,
		});
	}
	if (lastActualDay < days) {
		for (const p of points) {
			if (p.day < lastActualDay) continue;
			p.forecast = cumAtToday + rate * (p.day - lastActualDay);
		}
	}
	return points;
}
