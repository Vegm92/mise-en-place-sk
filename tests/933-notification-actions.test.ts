/**
 * Issue #933 — alerts with nothing to act on.
 *
 * #941 gave `NotificationItem` a fallback action ("ver detalle" for anything
 * carrying an invoice, "ver facturación" for the locked-locations notice), but
 * two gaps left the bell dropdown — the surface the issue reports — unchanged:
 * the layout load never selected `invoiceId`, so the fallback could not fire
 * anywhere, and the bell rendered its own row markup with a dismiss X and no
 * actions at all. Both surfaces now go through `NotificationItem`, and the
 * accept/decide/dismiss calls live in one shared module.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { translations } from '../src/lib/i18n-messages';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');

const bell = read('src/lib/components/mep/NotificationBell.svelte');
const item = read('src/lib/components/mep/NotificationItem.svelte');
const layoutServer = read('src/routes/(app)/+layout.server.ts');
const reminders = read('src/routes/(app)/reminders/+page.svelte');
const actions = read('src/lib/notification-actions.ts');

describe('issue #933 — every pending alert offers an action', () => {
	it('the layout load ships invoiceId so the "ver detalle" fallback can fire', () => {
		expect(layoutServer).toContain('invoiceId:        systemNotifications.invoiceId,');
	});

	it('the bell dropdown renders NotificationItem instead of a dismiss-only row', () => {
		expect(bell).toContain("import NotificationItem from '$lib/components/mep/NotificationItem.svelte';");
		expect(bell).toContain('<NotificationItem');
		expect(bell).toContain('onAcceptCategory={acceptCategory}');
		expect(bell).toContain('onDecideProduct={decideProduct}');
	});

	it('an alert with no type-specific action falls back to the invoice or billing link', () => {
		const fallback = item.slice(item.indexOf('{#if !hasSpecificAction}'));
		expect(fallback).toContain('href="/invoice/{notification.invoiceId}"');
		expect(fallback).toContain("t('notif.viewDetail')");
		expect(fallback).toContain("t('notif.viewBilling')");
	});

	for (const locale of ['es', 'en'] as const) {
		it(`notif.viewDetail and notif.viewBilling are defined in ${locale}`, () => {
			expect(translations[locale]['notif.viewDetail']).toBeTruthy();
			expect(translations[locale]['notif.viewBilling']).toBeTruthy();
		});
	}

	it('the bell and the reminders page share one set of notification calls', () => {
		for (const source of [bell, reminders]) {
			expect(source).toContain("from '$lib/notification-actions'");
			expect(source).not.toContain("fetch('/api/notifications'");
			expect(source).not.toContain("fetch('/api/supplier-category'");
			expect(source).not.toContain("fetch('/api/product-aliases'");
		}
		expect(actions).toContain("'/api/notifications'");
		expect(actions).toContain("'/api/supplier-category'");
		expect(actions).toContain("'/api/product-aliases'");
	});
});
