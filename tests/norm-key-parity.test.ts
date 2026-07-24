/**
 * TS ↔ SQL parity for product-key normalization (issue #296).
 *
 * normalizeProductKey (src/lib/server/normalize.ts) and mep_norm_key
 * (drizzle/0018_product_key_normalization.sql) must produce identical keys —
 * cross-invoice matching compares TS-computed keys against SQL-computed ones.
 * Runs only when DATABASE_URL is set with migrations applied (CI does both).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { testSql, closeDb, hasDbEnv } from './helpers/test-db';

const GOLDEN = [
	'TOMATE PERA 5KG',
	'Tomate  Pera 5Kg',
	' aceite   de OLIVA virgen ',
	'Azúcar blanquilla',
	'Jamón Ibérico D.O.',
	'Ñora seca (bolsa)',
	'Café molido 100% arábica',
	'BERENJENA RAYADA',
	'Pescadilla 1ª',
	'agüita con diéresis',
];

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

describe.skipIf(!hasDbEnv)('mep_norm_key ↔ normalizeProductKey parity', () => {
	it('produces identical keys for realistic Spanish descriptions', async () => {
		for (const raw of GOLDEN) {
			const [row] = await testSql`SELECT mep_norm_key(${raw}) AS key`;
			expect((row as { key: string }).key, `SQL vs TS for ${JSON.stringify(raw)}`)
				.toBe(normalizeProductKey(raw));
		}
	});

	it('returns NULL for NULL input (RETURNS NULL ON NULL INPUT)', async () => {
		const [row] = await testSql`SELECT mep_norm_key(NULL) AS key`;
		expect((row as { key: string | null }).key).toBeNull();
	});
});
