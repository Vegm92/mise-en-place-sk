/**
 * Desktop upload queue scroll region (issue #807).
 *
 * The desktop queue grid in UploadPanel.svelte set grid-template-columns
 * but never grid-template-rows, so its implicit row grew with content
 * instead of being capped to the flex parent's height. With no defined
 * height on that row, the queue card's `overflow-y:auto` (further down
 * the same column) could never become a real scroll region — a long
 * queue just grew the whole layout downward, pushing "Extraer datos" far
 * below the viewport. The mobile view uses a real flexbox scroll region
 * instead and never had this bug.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const PANEL = readFileSync(path.join(ROOT, 'src/lib/components/UploadPanel.svelte'), 'utf8');

function firstMatchLine(source: string, pattern: RegExp): { line: string; index: number } {
	const index = source.search(pattern);
	expect(index, `expected UploadPanel.svelte to contain ${pattern}`).toBeGreaterThan(-1);
	const lineStart = source.lastIndexOf('\n', index) + 1;
	const lineEnd = source.indexOf('\n', index);
	return { line: source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd), index };
}

describe('upload queue desktop layout (issue #807)', () => {
	it('the desktop queue grid caps its row height instead of growing with content', () => {
		const { line } = firstMatchLine(
			PANEL,
			/display:grid;grid-template-columns:1\.6fr 1fr;/
		);
		expect(line).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
	});

	it('the queue card can shrink below its content height so it respects the grid row', () => {
		const { line } = firstMatchLine(
			PANEL,
			/<div class="card" style="padding:16px 16px 12px;display:flex;flex-direction:column;/
		);
		expect(line).toMatch(/min-height:0/);
	});

	it('the file list keeps its own internal scroll region', () => {
		expect(PANEL).toMatch(
			/flex-direction:column;gap:6px;flex:1;overflow-y:auto;min-height:0;/
		);
	});

	it('the extract button stays a sibling of the scrolling list, not pushed after it grows', () => {
		const gridStart = PANEL.indexOf('display:grid;grid-template-columns:1.6fr 1fr;');
		const queueSection = PANEL.slice(gridStart);
		const listOpen = queueSection.indexOf('overflow-y:auto;min-height:0;');
		const listCloseDiv = queueSection.indexOf('{:else}', listOpen);
		const extractButton = queueSection.indexOf('doUpload', listOpen);
		expect(listOpen).toBeGreaterThan(-1);
		expect(extractButton).toBeGreaterThan(listCloseDiv > -1 ? listCloseDiv : listOpen);
	});
});
