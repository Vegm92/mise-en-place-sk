import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPORT_TYPES, DEFAULT_REPORT_TYPES } from '../src/lib/reports';
import { translations } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const LIFECYCLE_WORDING = [
	'pagad', 'vencid', 'accounts payable', 'cuentas a pagar',
	'outstanding', 'saldo pendiente', 'debt', 'deuda', 'informe de pagos', 'payables report',
];

describe('payables is an opt-in tool, not a default report (issue #1122)', () => {
	it('resolves as a report type but is absent from the default list', () => {
		expect(REPORT_TYPES).toContain('payables');
		expect(DEFAULT_REPORT_TYPES).not.toContain('payables');
		expect([...DEFAULT_REPORT_TYPES].every((t) => (REPORT_TYPES as readonly string[]).includes(t))).toBe(true);
	});

	it('the reports index renders the default list, not every type', () => {
		const page = read('src/routes/(app)/reports/+page.svelte');
		expect(page).toContain('DEFAULT_REPORT_TYPES');
		expect(page).not.toMatch(/\{#each REPORT_TYPES\b/);
	});

	for (const locale of ['es', 'en'] as const) {
		it(`${locale} copy frames due dates, never payment state`, () => {
			const table = translations[locale] as Record<string, string>;
			const copy = Object.entries(table)
				.filter(([k]) => k.startsWith('rep.payables.') || k === 'rep.kpi.overdue' || k === 'rep.kpi.outstanding' || k === 'rep.chart.ageing')
				.map(([, v]) => v.toLowerCase())
				.join(' | ');
			for (const banned of LIFECYCLE_WORDING) expect(copy).not.toContain(banned);
		});

		it(`${locale} copy says it is the opt-in exception and tracks no payment state`, () => {
			const table = translations[locale] as Record<string, string>;
			expect(table['rep.payables.eyebrow']).toBeTruthy();
			expect(table['rep.payables.subheading']!.toLowerCase()).toMatch(
				locale === 'es' ? /no sigue el estado de pago/ : /does not track payment state/,
			);
		});
	}
});
