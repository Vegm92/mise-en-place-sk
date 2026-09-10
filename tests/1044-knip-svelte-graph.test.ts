/**
 * Issue #1044 — proves the knip-based route/Svelte-aware graph (the gap
 * Madge has: it doesn't parse .svelte, so it can't tell a component-only
 * consumer from a real orphan) actually resolves a component-to-module
 * import and still catches a genuine orphan. Fixture lives at
 * scripts/fixtures/knip-graph/: entry-component.svelte imports
 * used-module.ts, orphan-module.ts is never imported by anything.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('route/Svelte-aware dependency graph (issue #1044)', () => {
	it('finds the component-to-module dependency and the real orphan', () => {
		let stdout = '';
		try {
			stdout = execFileSync(
				process.execPath,
				[
					'node_modules/knip/bin/knip.js',
					'--directory', 'scripts/fixtures/knip-graph',
					'--include', 'files',
					'--reporter', 'json',
				],
				{ encoding: 'utf8' },
			);
		} catch (err) {
			const e = err as { stdout?: string };
			stdout = e.stdout ?? '';
		}

		const { issues } = JSON.parse(stdout.slice(stdout.indexOf('{"issues"'))) as {
			issues: Array<{ file: string }>;
		};
		const orphans = issues.map((i) => i.file);

		expect(orphans).toContain('src/orphan-module.ts');
		expect(orphans).not.toContain('src/used-module.ts');
	});
});
