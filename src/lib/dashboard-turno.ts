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

export interface PriceAlternative {
	supplier: string;
	price: number;
	savingsPct: number;
	potentialSavings: number;
}

export interface PriceShockInput {
	id: number | string;
	ingredient: string;
	supplier: string;
	oldPrice: number;
	newPrice: number;
	deviationPct: number;
	extraPaid: number;
	daysAgo: number;
	productId?: number | null;
	alternative?: PriceAlternative | null;
}

export interface MissingInput {
	supplier_name: string;
	days_late: number;
	frequency: string;
	supplier_id?: number;
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
const MAX_MISSING_ITEMS = 3;

export type MonthProgressInput = Pick<TurnoInput, 'isCurrentMonth' | 'daysElapsed' | 'daysInMonth'>;

export function elapsedFraction(input: MonthProgressInput): number {
	if (!input.isCurrentMonth) return 1;
	if (input.daysInMonth <= 0) return 1;
	return Math.min(1, Math.max(input.daysElapsed, 0) / input.daysInMonth);
}

export function planToDate(totalBudget: number, input: MonthProgressInput): number {
	return totalBudget * elapsedFraction(input);
}

export function forecastFromRunRate(spent: number, input: MonthProgressInput): number {
	const f = elapsedFraction(input);
	if (f <= 0) return spent;
	return spent / f;
}

export function priceShockImpact(shock: Pick<PriceShockInput, 'deviationPct' | 'extraPaid'>): number {
	if (shock.deviationPct <= 0) return 0;
	return Math.max(0, shock.extraPaid);
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
		.map(({ s, eur }): WorkItem => ({
			id: `price-${s.id}`,
			kind: 'price',
			severity: 'high',
			eur,
			urgencyRank: 2 + s.daysAgo,
			urgencyKey: s.daysAgo <= 0 ? 'turno.when.today' : 'turno.when.daysAgo',
			urgencyVars: { n: s.daysAgo },
			titleKey: 'turno.price.title',
			titleVars: { ingredient: s.ingredient, pct: Math.round(s.deviationPct * 10) / 10 },
			whyKey: s.alternative ? 'turno.price.whyAlt' : 'turno.price.why',
			whyVars: priceWhyVars(s),
			actionKey: s.alternative ? 'turno.price.actionAlt' : 'turno.price.action',
			href: s.productId != null ? `/products/${s.productId}` : '/analytics/prices',
		}));
}

function priceWhyVars(s: PriceShockInput): Record<string, string | number> {
	const base: Record<string, string | number> = { supplier: s.supplier, from: s.oldPrice, to: s.newPrice };
	if (!s.alternative) return base;
	return {
		...base,
		alt: s.alternative.supplier,
		altPrice: Math.round(s.alternative.price * 100) / 100,
		savePct: Math.round(s.alternative.savingsPct * 100),
	};
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
	return input.missing.slice(0, MAX_MISSING_ITEMS).map((m, i) => ({
		id: `missing-${m.supplier_id ?? m.supplier_name}`,
		kind: 'missing' as const,
		severity: 'med' as const,
		eur: 0,
		urgencyRank: 90 + i,
		urgencyKey: 'turno.when.whenYouCan',
		urgencyVars: {},
		titleKey: 'turno.missing.title',
		titleVars: { supplier: m.supplier_name, days: m.days_late },
		whyKey: `turno.missing.why.${MISSING_FREQUENCIES.includes(m.frequency) ? m.frequency : 'periodic'}`,
		whyVars: {},
		actionKey: 'turno.missing.action',
		href: m.supplier_id != null ? `/suppliers/${m.supplier_id}` : '/suppliers',
	}));
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
		href: `/suppliers/${s.supplierId}?highlight=category`,
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
