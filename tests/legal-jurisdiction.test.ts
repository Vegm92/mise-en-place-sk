/**
 * The terms submitted to the courts of Madrid while every other statement of
 * where the business sits — the landing JSON-LD, the founder note, and the
 * aviso legal built from LEGAL_ENTITY — said Barcelona. Confirmed during the
 * flight-test QA pass that Barcelona is correct, so the clause was corrected.
 *
 * A jurisdiction clause that disagrees with the stated place of business is
 * the kind of drift nobody re-reads, so it is pinned here rather than left to
 * a future proofread: both locales of the clause, and the single source the
 * rest of the site derives its city from.
 *
 * `Europe/Madrid` is out of scope: that is the IANA identifier for Spanish
 * civil time, not a claim about where the company is.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LEGAL_ENTITY } from '../src/lib/legal-entity';

const ROOT = path.resolve(__dirname, '..');
const TERMS = readFileSync(path.join(ROOT, 'src/routes/terms/+page.svelte'), 'utf8');

const CLAUSE_12 = [...TERMS.matchAll(/^\s*p12:\s*'(.+)',$/gm)].map((m) => m[1]);

describe('governing-law clause names the city the business actually sits in', () => {
	it('finds the clause in both locales', () => {
		expect(CLAUSE_12).toHaveLength(2);
	});

	it('submits to Barcelona, matching LEGAL_ENTITY.city', () => {
		expect(LEGAL_ENTITY.city).toBe('Barcelona');
		for (const clause of CLAUSE_12) {
			expect(clause).toContain(LEGAL_ENTITY.city);
		}
	});

	it('no longer submits to Madrid', () => {
		for (const clause of CLAUSE_12) {
			expect(clause).not.toMatch(/\bMadrid\b/);
		}
	});

	it('still names Spanish law as the governing law', () => {
		expect(CLAUSE_12[0]).toMatch(/ley española/);
		expect(CLAUSE_12[1]).toMatch(/Spanish law/);
	});
});
