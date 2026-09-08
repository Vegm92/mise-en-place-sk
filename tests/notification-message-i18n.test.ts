/**
 * Issue #536 — notification text must never leak the machine
 * `notificationType` enum to a user; it is always resolved from
 * `payload.messageKey` + `payload.messageVars` through i18n.
 *
 * These are pure unit tests: no DB, no Svelte store subscriptions — just the
 * plain server-safe `renderTemplate` helper (used by every alert writer to
 * populate the `message` column) and the `notificationMessage` render-time
 * resolver (used by every UI surface that lists notifications).
 */
import { describe, it, expect } from 'vitest';
import { renderTemplate, translations, type Locale } from '../src/lib/i18n-messages';
import { notificationMessage } from '../src/lib/notification-display';

/** Every `notif.msg.*` key an alert writer (alerts.ts and its siblings) uses. */
const NOTIF_MESSAGE_KEYS = [
	'notif.msg.uncategorized',
	'notif.msg.catSuggested',
	'notif.msg.priceShockUp',
	'notif.msg.priceShockDown',
	'notif.msg.lowStock',
	'notif.msg.unitConversion',
	'notif.msg.locationsLocked',
	'notif.msg.budgetExceeded',
	'notif.msg.budgetWarning',
	'notif.msg.productSuggestion',
	'notif.msg.productSuggestionAi',
	'notif.msg.verifactuMismatch',
	'notif.msg.possibleDuplicate',
	'notif.msg.whatsappPendingSave',
	'notif.msg.whatsappNeedsReview',
];

describe('renderTemplate (server-safe i18n, used to write system_notifications.message)', () => {
	it('interpolates vars into the Spanish (default) template', () => {
		const out = renderTemplate('es', 'notif.msg.uncategorized', { supplier: 'ESPECIAS LOCAL S.L.U.' });
		expect(out).toBe("Clasifica a 'ESPECIAS LOCAL S.L.U.' para incluir su gasto en presupuestos y análisis por categoría.");
	});

	it('interpolates vars into the English template', () => {
		const out = renderTemplate('en', 'notif.msg.uncategorized', { supplier: 'ESPECIAS LOCAL S.L.U.' });
		expect(out).toBe("Categorise 'ESPECIAS LOCAL S.L.U.' so its spend counts towards budgets and category analytics.");
	});

	it('substitutes every {var} placeholder, leaving none behind', () => {
		const out = renderTemplate('es', 'notif.msg.budgetExceeded', {
			category: 'Carnes', spent: '120.00', budget: '100.00', pct: 120,
		});
		expect(out).not.toMatch(/\{[a-zA-Z]+\}/);
	});

	it('falls back to the key itself for an unknown key, like the client t() store', () => {
		expect(renderTemplate('es', 'notif.msg.doesNotExist', {})).toBe('notif.msg.doesNotExist');
	});

	it('never contains the raw notificationType enum for a real alert message', () => {
		const out = renderTemplate('es', 'notif.msg.priceShockUp', {
			ingredient: 'Tomate', pct: 20, oldPrice: '1.00', newPrice: '1.20', unitSuffix: '',
		});
		expect(out).not.toContain('price_shock:');
		expect(out).not.toMatch(/^[a-z_]+:\s/);
	});

	describe.each(NOTIF_MESSAGE_KEYS)('key %s', (key) => {
		it.each<Locale>(['es', 'en'])('resolves to real prose in %s, not the raw key', (loc) => {
			const template = (translations[loc] as Record<string, string>)[key];
			expect(template, `${loc}/${key} must exist in translations`).toBeDefined();
			expect(template).not.toBe(key);
			expect(template!.length).toBeGreaterThan(0);
		});
	});
});

describe('notificationMessage (render-time resolver, notification-display.ts)', () => {
	const tivStub = (key: string, vars: Record<string, string | number>) =>
		`${key}::${JSON.stringify(vars)}`;

	it('resolves through the i18n key + vars when payload carries messageKey', () => {
		const n = {
			message: 'supplier_uncategorized: ESPECIAS LOCAL S.L.U.',
			payload: { messageKey: 'notif.msg.uncategorized', messageVars: { supplier: 'ESPECIAS LOCAL S.L.U.' } },
		};
		expect(notificationMessage(n, tivStub)).toBe(
			'notif.msg.uncategorized::{"supplier":"ESPECIAS LOCAL S.L.U."}',
		);
	});

	it('falls back to the stored message for a legacy row with no messageKey in payload', () => {
		const n = { message: 'ESPECIAS LOCAL S.L.U.', payload: { supplierId: 42 } };
		expect(notificationMessage(n, tivStub)).toBe('ESPECIAS LOCAL S.L.U.');
	});

	it('falls back to the stored message when payload is null', () => {
		const n = { message: 'a legacy plain-text alert', payload: null };
		expect(notificationMessage(n, tivStub)).toBe('a legacy plain-text alert');
	});

	it('defaults messageVars to {} when messageKey is present without vars', () => {
		const n = { message: 'fallback', payload: { messageKey: 'notif.msg.uncategorized' } };
		expect(notificationMessage(n, tivStub)).toBe('notif.msg.uncategorized::{}');
	});
});
