import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const suppliersPage = readFileSync(
  new URL('../src/routes/(app)/suppliers/+page.svelte', import.meta.url),
  'utf-8',
);

/**
 * /suppliers rendered server-side (HTTP 200) but the client swapped the whole
 * page for the <svelte:boundary> fallback in (app)/+layout.svelte — "Este panel
 * no se pudo mostrar." — on any tenant with no spend-trend rows.
 *
 * The cause was a self-seeding effect:
 *
 *   let activeTrendKeys = $state<string[]>([]);
 *   $effect(() => {
 *     if (activeTrendKeys.length === 0) activeTrendKeys = data.trendData.series.map(s => s.key);
 *   });
 *
 * The effect reads activeTrendKeys and writes it. With a non-empty series that
 * settles after one write (length is no longer 0). With an empty series it
 * assigns a fresh [] on every run, so the reference changes, the effect is
 * dirty again, and Svelte re-runs it until it throws effect_update_depth_exceeded.
 *
 * data.trendData.series is empty whenever the tenant has no invoices joined to a
 * supplier in the last 6 months — a new account, which is exactly the case that
 * never shows up locally against seeded data.
 */
describe('suppliers trend-key selection cannot loop the effect scheduler', () => {
  it('derives the default selection instead of seeding it from an $effect', () => {
    expect(suppliersPage).toContain('const activeTrendKeys = $derived(');
    expect(suppliersPage).not.toContain(
      '$effect(() => { if (activeTrendKeys.length === 0) activeTrendKeys =',
    );
  });

  it('never assigns activeTrendKeys, so no effect can depend on its own write', () => {
    const assignments = suppliersPage.match(/^\s*activeTrendKeys\s*=/gm) ?? [];
    expect(assignments).toEqual([]);
  });

  it('falls back to every series key when nothing has been toggled', () => {
    expect(suppliersPage).toContain(
      'trendSelection.length ? trendSelection : data.trendData.series.map(s => s.key)',
    );
  });
});

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(full);
    return entry.name === '+page.svelte' ? [full] : [];
  });
}

const SELF_SEEDING_EFFECT = /\$effect\(\s*\(\)\s*=>\s*\{?\s*if\s*\(\s*(\w+)\.length\s*===\s*0\s*\)\s*\1\s*=/;

describe('no page re-seeds a state array from an $effect that reads it', () => {
  const routes = fileURLToPath(new URL('../src/routes', import.meta.url));

  it.each(pageFiles(routes))('%s', (file) => {
    expect(readFileSync(file, 'utf-8')).not.toMatch(SELF_SEEDING_EFFECT);
  });
});
