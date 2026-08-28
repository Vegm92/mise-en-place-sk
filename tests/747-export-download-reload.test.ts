/**
 * Issue #747 item 1 — the Excel export form.
 *
 * `/invoices/export` submits a plain GET form to `/invoices/export/download`,
 * a route with no +page.svelte. Without `data-sveltekit-reload`, SvelteKit's
 * client router intercepts the GET-form navigation as an in-app route change,
 * finds no page for it, and throws a client-side
 * `SvelteKitError: Not found: /invoices/export/download` before the browser's
 * native form submission (which does deliver the file) takes over. Forcing a
 * full-page navigation for this one form sidesteps the router entirely.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'src', 'routes', '(app)', 'invoices', 'export', '+page.svelte');
const source = readFileSync(FILE, 'utf8');

describe('issue #747 — /invoices/export download form does not route client-side', () => {
	it('submits to the download endpoint', () => {
		expect(source).toMatch(/action="\/invoices\/export\/download"/);
	});

	it('carries data-sveltekit-reload so SvelteKit does not intercept the GET navigation', () => {
		const formTag = source.slice(source.indexOf('<form'), source.indexOf('>', source.indexOf('<form')) + 1);
		expect(formTag).toContain('data-sveltekit-reload');
	});
});
