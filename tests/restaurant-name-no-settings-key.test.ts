/**
 * Issue #515 — guards against restaurant_name settings-key usage creeping
 * back into src/.
 *
 * Other code legitimately spells the bare identifier `restaurant_name` (an
 * admin SQL column alias for restaurants.name, and an unrelated Drizzle
 * index name in schema.ts) — those are fine and untouched by this fix. What
 * must never come back is a quoted 'restaurant_name' / "restaurant_name"
 * string literal, the shape every settings.key read or write used.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('restaurant name settings key — removed for good (issue #515)', () => {
	it('no quoted restaurant_name string literal remains under src/', () => {
		let output = '';
		try {
			output = execFileSync(
				'grep', ['-rnE', "['\"]restaurant_name['\"]", 'src/'],
				{ encoding: 'utf8' },
			);
		} catch (err) {
			const e = err as { status?: number; stdout?: string };
			if (e.status === 1) {
				output = '';
			} else {
				throw err;
			}
		}
		expect(output.trim()).toBe('');
	});

	it('the migration file itself still carries the literal (sanity check the scan works)', () => {
		const output = execFileSync(
			'grep', ['-rnE', "['\"]restaurant_name['\"]", 'drizzle/0048_restaurant_name_backfill.sql'],
			{ encoding: 'utf8' },
		);
		expect(output.length).toBeGreaterThan(0);
	});
});
