/**
 * The public /waitlist page must read its tier prices from the same source
 * of truth as /billing — `PROVISIONAL_PRICE` in `src/lib/billing-plans.ts`
 * (issue #439). Before this fix the page hardcoded 29/59/129 in five places:
 * the es and en `pricingTiers` arrays, and the es/en "how much does it cost"
 * FAQ prose. A whole-file digit scan is not safe here — the page is full of
 * unrelated numbers (CSS values like `clamp(40px,5.6vw,59.5px)`, spot counts,
 * bullet quotas) that collide with 29/59/129 — so this test scopes its
 * assertions to the exact constructs the issue names: the `pricingTiers`
 * array literals and the two FAQ "cost" answers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PROVISIONAL_PRICE } from '../src/lib/billing-plans';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/routes/waitlist/+page.svelte'), 'utf8');

const BARE_PRICE = /\b(29|59|129)\b/;

describe('billing-plans.ts stays the single price source (issue #439)', () => {
  it('exports PROVISIONAL_PRICE with the expected shape and values', () => {
    expect(PROVISIONAL_PRICE).toEqual({ starter: 29, pro: 59, business: 129 });
  });
});

describe('/waitlist reads prices from PROVISIONAL_PRICE, not hardcoded literals', () => {
  it('imports PROVISIONAL_PRICE from $lib/billing-plans', () => {
    expect(PAGE_SRC).toMatch(/import\s*\{\s*PROVISIONAL_PRICE\s*\}\s*from\s*'\$lib\/billing-plans';/);
  });

  it('has exactly two pricingTiers arrays (es + en), each reading PROVISIONAL_PRICE', () => {
    const blocks = [...PAGE_SRC.matchAll(/pricingTiers: \[([\s\S]*?)\n\s*\],\n/g)].map((m) => m[1]);
    expect(blocks).toHaveLength(2);

    for (const block of blocks) {
      // Every tier's `price:` field must reference PROVISIONAL_PRICE, never a literal.
      expect(block).toContain('price: PROVISIONAL_PRICE.starter');
      expect(block).toContain('price: PROVISIONAL_PRICE.pro');
      expect(block).toContain('price: PROVISIONAL_PRICE.business');
      expect(block).not.toMatch(/price:\s*\d/);
      // No stray hardcoded 29/59/129 anywhere else in the tier block either
      // (bullet counts like "100 albaranes" or "5 restaurantes" are fine —
      // they aren't prices and don't collide with the price boundary regex).
      expect(block).not.toMatch(BARE_PRICE);
    }
  });

  it('the es "cost" FAQ answer interpolates PROVISIONAL_PRICE, not literal figures', () => {
    const match = PAGE_SRC.match(/\{ q: '¿Cuánto cuesta\?', a: (`[\s\S]*?`) \},/);
    expect(match, 'es cost FAQ entry not found').toBeTruthy();
    const answer = match![1];
    expect(answer).toContain('${PROVISIONAL_PRICE.starter}');
    expect(answer).toContain('${PROVISIONAL_PRICE.pro}');
    expect(answer).toContain('${PROVISIONAL_PRICE.business}');
    expect(answer).not.toMatch(BARE_PRICE);
  });

  it('the en "cost" FAQ answer interpolates PROVISIONAL_PRICE, not literal figures', () => {
    const match = PAGE_SRC.match(/\{ q: 'How much does it cost\?', a: (`[\s\S]*?`) \},/);
    expect(match, 'en cost FAQ entry not found').toBeTruthy();
    const answer = match![1];
    expect(answer).toContain('${PROVISIONAL_PRICE.starter}');
    expect(answer).toContain('${PROVISIONAL_PRICE.pro}');
    expect(answer).toContain('${PROVISIONAL_PRICE.business}');
    expect(answer).not.toMatch(BARE_PRICE);
  });
});
