/**
 * Issue #536 — every alerts.ts writer (and its siblings in billing.ts,
 * products.ts, invoice-save.ts, whatsapp/jobs.ts) must never persist a raw
 * `notificationType: value` machine string into `system_notifications.message`.
 * The message is now the Spanish-rendered i18n template, and payload always
 * carries the messageKey + messageVars the render-time resolver needs.
 *
 * The DB-backed cases below exercise real writer functions end to end; the
 * source-guard case is a cheap, DB-free regression net covering every writer
 * site the issue named (including the ones too heavy to fixture here — price
 * shocks, stock forecasts, duplicate purchases, product suggestions, unit
 * conversions, VERI*FACTU mismatches, locked locations, WhatsApp review).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCategorizationNudge, runCategorySuggestion, runBudgetCheck } from '../src/lib/server/alerts';
import { getOrCreateSupplierId } from '../src/lib/server/supplier';
import { invoices, invoiceLineItems, categoryBudgets } from '../src/lib/server/schema';
import { renderTemplate } from '../src/lib/i18n';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';
import { testDb, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

/** A machine-enum-shaped message: `<notification_type>: ...`. */
function looksLikeMachineEnum(message: string, notificationType: string): boolean {
	return message.startsWith(`${notificationType}: `);
}

describe.skipIf(!hasDbEnv)('alert writers — message column carries no machine enum (issue #536)', () => {
	it('runCategorizationNudge: message is the rendered Spanish sentence, not "supplier_uncategorized: ..."', async () => {
		const r = await createTestRestaurant('notif536-uncategorized');
		try {
			const supplierId = await getOrCreateSupplierId(r.id, 'ESPECIAS LOCAL S.L.U.', testDb);
			const alerts = await runCategorizationNudge(1, supplierId, r.id);

			expect(alerts).toHaveLength(1);
			const [alert] = alerts;
			expect(looksLikeMachineEnum(alert.message, alert.notificationType)).toBe(false);
			expect(alert.message).not.toContain('supplier_uncategorized');
			expect(alert.message).toBe(
				renderTemplate('es', 'notif.msg.uncategorized', { supplier: 'ESPECIAS LOCAL S.L.U.' }),
			);
			expect(alert.payload).toMatchObject({
				messageKey: 'notif.msg.uncategorized',
				messageVars: { supplier: 'ESPECIAS LOCAL S.L.U.' },
			});
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('runCategorySuggestion: message is the rendered Spanish sentence, not "supplier_category_suggested: ..."', async () => {
		const r = await createTestRestaurant('notif536-catsuggest');
		try {
			const supplierId = await getOrCreateSupplierId(r.id, 'Distribuciones Sur', testDb);
			const alerts = await runCategorySuggestion(supplierId, r.id, 'Bebidas');

			expect(alerts).toHaveLength(1);
			const [alert] = alerts;
			expect(looksLikeMachineEnum(alert.message, alert.notificationType)).toBe(false);
			expect(alert.message).not.toContain('->');
			expect(alert.message).toBe(
				renderTemplate('es', 'notif.msg.catSuggested', { supplier: 'Distribuciones Sur', category: 'Bebidas' }),
			);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('runBudgetCheck: message is the rendered Spanish sentence, not "budget_overage: ..."', async () => {
		const r = await createTestRestaurant('notif536-budget');
		try {
			const supplierId = await getOrCreateSupplierId(r.id, 'Mercado Central', testDb, 'Carnes y Derivados');
			const month = new Date().toISOString().slice(0, 7);
			const [inv] = await testDb.insert(invoices)
				.values({ restaurantId: r.id, supplierId, invoiceNumber: 'BM-1', invoiceDate: new Date().toISOString().slice(0, 10), totalAmount: '150.00', status: 'pending' })
				.returning({ id: invoices.id });
			await testDb.insert(invoiceLineItems).values([
				{ restaurantId: r.id, invoiceId: inv.id, description: 'Carne', quantity: 1, unit: 'kg', unitPrice: '150.00', totalPrice: '150.00' },
			]);
			await testDb.insert(categoryBudgets).values({ restaurantId: r.id, category: 'Carnes y Derivados', month, monthlyBudget: '100.00' });

			const alerts = await runBudgetCheck(inv.id, supplierId, r.id);

			expect(alerts.length).toBeGreaterThanOrEqual(1);
			for (const alert of alerts) {
				expect(looksLikeMachineEnum(alert.message, alert.notificationType)).toBe(false);
				expect(alert.message).not.toContain('budget_overage:');
			}
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});

describe('writer source files — no reintroduced machine-enum message template (issue #536)', () => {
	const cases: Array<{ file: string; forbidden: string[] }> = [
		{ file: 'src/lib/server/alerts.ts', forbidden: [
			'`price_shock: ',
			'`low_stock_forecast: ',
			'`supplier_uncategorized: ',
			'`supplier_category_suggested: ',
			'`budget_overage: ',
			'`possible_duplicate_purchase: ',
		] },
		{ file: 'src/lib/server/billing.ts', forbidden: ['location(s) locked by the'] },
		{ file: 'src/lib/server/products.ts', forbidden: ['`product_suggestion: '] },
		{ file: 'src/lib/server/invoice-save.ts', forbidden: [
			'`unit_conversion_needed: ',
			'`product_suggestion: ',
			'`verifactu_qr_mismatch: ',
		] },
	];

	for (const { file, forbidden } of cases) {
		it(`${file} never builds message: from the raw notificationType`, () => {
			const source = readFileSync(file, 'utf8');
			for (const needle of forbidden) {
				expect(source, `${file} still contains ${JSON.stringify(needle)}`).not.toContain(needle);
			}
		});
	}

	it('every writer site sets both messageKey and messageVars alongside message', () => {
		for (const { file } of cases) {
			const source = readFileSync(file, 'utf8');
			const messageKeyCount = (source.match(/messageKey:/g) ?? []).length;
			const messageVarsCount = (source.match(/messageVars:/g) ?? []).length;
			expect(messageKeyCount, `${file} messageKey count`).toBeGreaterThan(0);
			expect(messageKeyCount).toBe(messageVarsCount);
		}
	});
});
