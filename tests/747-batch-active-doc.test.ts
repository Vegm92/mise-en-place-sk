/**
 * Issue #747 item 3 — failed-extraction view named the wrong file.
 *
 * The mobile sticky header's `activeDoc` picked `data.review?.itemId` (only
 * set when the active item's extraction succeeded), then a queue item whose
 * status is `extracting`, then fell all the way back to `data.queue[0]` — the
 * first, already-confirmed file — whenever the active item had *failed*
 * extraction instead. `data.failedItem.itemId` (already computed
 * server-side by `pickActiveItem`) needs to be tried before that fallback so
 * the header names the failed file, matching the error card right below it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'src', 'routes', '(app)', 'batch', '[id]', '+page.svelte');
const source = readFileSync(FILE, 'utf8');

describe('issue #747 — batch review sticky header names the active/failed item', () => {
	it('activeDoc falls back to the failed item before the first queue entry', () => {
		const line = source.split('\n').find((l) => l.includes('const activeDoc = $derived('));
		expect(line, 'activeDoc derivation not found').toBeTruthy();
		expect(line).toMatch(/data\.review\?\.itemId\s*\?\?\s*data\.failedItem\?\.itemId/);
	});

	it('still falls back to an in-flight item, then the first queue entry, when nothing is active', () => {
		const line = source.split('\n').find((l) => l.includes('const activeDoc = $derived('));
		expect(line).toMatch(/status === 'extracting'/);
		expect(line).toMatch(/data\.queue\[0\]/);
	});
});
