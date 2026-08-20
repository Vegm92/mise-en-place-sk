export type PeriodKey = 'day' | 'month' | 'year' | 'all';

export const PERIOD_KEYS: readonly PeriodKey[] = ['day', 'month', 'year', 'all'];

export function isPeriodKey(v: string): v is PeriodKey {
	return (PERIOD_KEYS as readonly string[]).includes(v);
}

export interface PeriodRange {
	/** Inicio del periodo actual. `null` = sin límite (histórico). */
	from: Date | null;
	/** Inicio del periodo anterior equivalente. `null` si no aplica (histórico). */
	prevFrom: Date | null;
	/** Fin (exclusivo) del periodo anterior equivalente — coincide con `from`. `null` si no aplica. */
	prevTo: Date | null;
}

/**
 * Calcula el rango del periodo actual y el rango equivalente del periodo
 * anterior, para poder comparar "este periodo vs. el anterior" con el mismo
 * criterio en cualquier pantalla de lista (Albaranes, Proveedores, Productos).
 */
export function periodRange(period: PeriodKey, now: Date = new Date()): PeriodRange {
	switch (period) {
		case 'day': {
			const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const prevFrom = new Date(from);
			prevFrom.setDate(prevFrom.getDate() - 1);
			return { from, prevFrom, prevTo: from };
		}
		case 'month': {
			const from = new Date(now.getFullYear(), now.getMonth(), 1);
			const prevFrom = new Date(from);
			prevFrom.setMonth(prevFrom.getMonth() - 1);
			return { from, prevFrom, prevTo: from };
		}
		case 'year': {
			const from = new Date(now.getFullYear(), 0, 1);
			const prevFrom = new Date(from);
			prevFrom.setFullYear(prevFrom.getFullYear() - 1);
			return { from, prevFrom, prevTo: from };
		}
		case 'all':
			return { from: null, prevFrom: null, prevTo: null };
	}
}

/** `null` si no hay periodo anterior con el que comparar, o si estaba a 0. */
export function deltaPct(current: number, previous: number): number | null {
	if (previous <= 0) return null;
	return ((current - previous) / previous) * 100;
}
