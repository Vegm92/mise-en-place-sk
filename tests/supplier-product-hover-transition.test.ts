import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const desktopDetail = readFileSync(
	new URL('../src/lib/components/desktop/DesktopSupplierDetail.svelte', import.meta.url),
	'utf-8',
);
const mobileSupplierPage = readFileSync(
	new URL('../src/routes/(app)/suppliers/[id]/+page.svelte', import.meta.url),
	'utf-8',
);

describe('supplier products hover-reveal transition (issue #568)', () => {
	it('the product legend detail row is always mounted and toggled via a visibility class, not #if-gated on hover', () => {
		expect(desktopDetail).toContain('{#if slice.totalQty != null}');
		expect(desktopDetail).toContain(
			'class="sup-product-detail text-[11px] text-fg-3" class:is-visible={hoveredSlice === i}',
		);
	});

	it('the hidden state starts at opacity 0 and translateY(4px)', () => {
		const styleBlock = desktopDetail.slice(desktopDetail.indexOf('<style>'));
		expect(styleBlock).toContain('.sup-product-detail {');
		expect(styleBlock).toContain('opacity: 0;');
		expect(styleBlock).toContain('transform: translateY(4px);');
	});

	it('the visible state fades/slides in over ~200ms ease with a ~100ms entry delay', () => {
		const styleBlock = desktopDetail.slice(desktopDetail.indexOf('<style>'));
		expect(styleBlock).toContain('transition: opacity 200ms ease, transform 200ms ease;');
		expect(styleBlock).toContain('.sup-product-detail.is-visible {');
		expect(styleBlock).toContain('opacity: 1;');
		expect(styleBlock).toContain('transform: translateY(0);');
		expect(styleBlock).toContain('transition-delay: 100ms;');
	});

	it('the detail row never captures pointer events, hidden or visible', () => {
		const styleBlock = desktopDetail.slice(desktopDetail.indexOf('<style>'));
		const baseRule = styleBlock.slice(
			styleBlock.indexOf('.sup-product-detail {'),
			styleBlock.indexOf('.sup-product-detail.is-visible {'),
		);
		expect(baseRule).toContain('pointer-events: none;');
	});

	it('the transition is disabled under prefers-reduced-motion', () => {
		expect(desktopDetail).toContain('@media (prefers-reduced-motion: reduce)');
		const reducedMotionBlock = desktopDetail.slice(
			desktopDetail.indexOf('@media (prefers-reduced-motion: reduce)'),
		);
		expect(reducedMotionBlock).toContain('.sup-product-detail {');
		expect(reducedMotionBlock).toContain('transition: none;');
	});

	it('the mobile supplier detail view does not gate product detail behind hover state (touch has no hover)', () => {
		expect(mobileSupplierPage).not.toContain('hoveredSlice');
	});
});
