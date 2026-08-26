import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, globSync } from 'node:fs';

const ROUTE_DIR = 'src/routes/(app)/reports';
const OLD_ROUTE_DIR = 'src/routes/(app)/digest';

describe('issue #581 — route folder renamed from digest to reports', () => {
	it('the new route folder exists with a page component', () => {
		expect(existsSync(`${ROUTE_DIR}/+page.svelte`)).toBe(true);
	});

	it('the old digest route folder no longer contains the page implementation', () => {
		expect(existsSync(`${OLD_ROUTE_DIR}/+page.svelte`)).toBe(false);
	});

	it('the old /digest path still resolves to a redirect stub, not a 404', () => {
		expect(existsSync(`${OLD_ROUTE_DIR}/+page.server.ts`)).toBe(true);
		const src = readFileSync(`${OLD_ROUTE_DIR}/+page.server.ts`, 'utf-8');
		expect(src).toMatch(/redirect\(\s*30[178]\s*,\s*['"]\/reports['"]\s*\)/);
	});
});

describe('issue #581 — no dangling internal links to the old /digest path', () => {
	const SEARCH_GLOBS = ['src/**/*.svelte', 'src/**/*.ts'];
	const EXCLUDE = new Set([
		'src/routes/(app)/digest/+page.server.ts',
	]);

	const files = SEARCH_GLOBS.flatMap((pattern) => globSync(pattern)).filter(
		(f) => !EXCLUDE.has(f.replaceAll('\\', '/')),
	);

	it('no href/goto/redirect references the retired /digest route outside the redirect stub', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const normalized = file.replaceAll('\\', '/');
			const contents = readFileSync(normalized, 'utf-8');
			const patterns = [
				/href\s*=\s*["'`]\/digest(?!-)/,
				/goto\(\s*["'`]\/digest(?!-)/,
				/redirect\(\s*\d+\s*,\s*["'`]\/digest(?!-)/,
			];
			if (patterns.some((re) => re.test(contents))) {
				offenders.push(normalized);
			}
		}
		expect(offenders).toEqual([]);
	});
});
