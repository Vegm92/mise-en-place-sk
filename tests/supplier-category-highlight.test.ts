import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const notificationItem = readFileSync(
	new URL('../src/lib/components/mep/NotificationItem.svelte', import.meta.url),
	'utf-8',
);
const supplierServer = readFileSync(
	new URL('../src/routes/(app)/suppliers/[id]/+page.server.ts', import.meta.url),
	'utf-8',
);
const supplierPage = readFileSync(
	new URL('../src/routes/(app)/suppliers/[id]/+page.svelte', import.meta.url),
	'utf-8',
);
const desktopDetail = readFileSync(
	new URL('../src/lib/components/desktop/DesktopSupplierDetail.svelte', import.meta.url),
	'utf-8',
);
const appCss = readFileSync(new URL('../src/app.css', import.meta.url), 'utf-8');

describe('supplier categorisation highlight (issue #574)', () => {
	it('the "clasificar" notification action carries ?highlight=category', () => {
		expect(notificationItem).toContain('href="/suppliers/{supplierId}?edit=1&highlight=category"');
	});

	it('the "pick another category" suggestion action also carries ?highlight=category', () => {
		expect(notificationItem).toContain('href="/suppliers/{p.supplierId}?edit=1&highlight=category"');
	});

	it('the server load parses ?highlight=category', () => {
		expect(supplierServer).toContain("url.searchParams.get('highlight') === 'category'");
		expect(supplierServer).toContain('initialHighlightCategory');
	});

	it('?highlight=category alone is enough to open the edit form', () => {
		expect(supplierServer).toContain(
			"const initialEditing = url.searchParams.get('edit') === '1' || initialHighlightCategory;",
		);
	});

	it('the load function forwards initialHighlightCategory to the page', () => {
		const returnBlock = supplierServer.slice(supplierServer.indexOf('return {'));
		expect(returnBlock).toContain('initialHighlightCategory,');
	});

	it('the mobile edit form seeds highlight state from the load data', () => {
		expect(supplierPage).toContain('let highlightCategory = $state(untrack(() => data.initialHighlightCategory));');
	});

	it('the mobile Category select reacts to the highlight state and clears it on interaction', () => {
		expect(supplierPage).toContain('class:mep-field-highlight={highlightCategory}');
		expect(supplierPage).toContain("onfocus={() => highlightCategory = false} onchange={() => highlightCategory = false}");
	});

	it('the mobile page scrolls the Category field into view and fades the highlight on a timeout', () => {
		expect(supplierPage).toContain("document.getElementById('m-edit-category')?.scrollIntoView({ block: 'center', behavior: 'smooth' });");
		expect(supplierPage).toContain('setTimeout(() => { highlightCategory = false; }, 4000);');
	});

	it('highlight state is passed down to the desktop supplier detail component', () => {
		expect(supplierPage).toContain('bind:highlightCategory');
		expect(desktopDetail).toContain('highlightCategory = $bindable(false),');
	});

	it('the desktop Category select reacts to the highlight state and clears it on interaction', () => {
		expect(desktopDetail).toContain('class:mep-field-highlight={highlightCategory}');
		expect(desktopDetail).toContain("onfocus={() => highlightCategory = false} onchange={() => highlightCategory = false}");
	});

	it('the Turno "assign category" worklist action also carries ?highlight=category', () => {
		const dashboardTurno = readFileSync(new URL('../src/lib/dashboard-turno.ts', import.meta.url), 'utf-8');
		expect(dashboardTurno).toContain('href: `/suppliers/${s.supplierId}?highlight=category`,');
	});

	it('the highlight styling reuses the existing --mep-acc-ring focus token', () => {
		expect(appCss).toContain('.input.mep-field-highlight');
		expect(appCss).toContain('var(--mep-acc-ring)');
	});

	it('the highlight animation is disabled under prefers-reduced-motion', () => {
		expect(appCss).toContain('@media (prefers-reduced-motion: reduce)');
		const reducedMotionBlock = appCss.slice(appCss.indexOf('@media (prefers-reduced-motion: reduce)'));
		expect(reducedMotionBlock).toContain('.mep-field-highlight');
		expect(reducedMotionBlock).toContain('animation: none;');
	});
});
