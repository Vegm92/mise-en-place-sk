import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/lib/components/desktop/DesktopSupplierDetail.svelte', import.meta.url),
  'utf-8',
);

describe('DesktopSupplierDetail danger-button color token (issue #608)', () => {
  it('uses the neg token utilities for the delete-supplier button border/text', () => {
    expect(source).toContain(
      'class="btn text-[12.5px] text-neg border-neg inline-flex items-center gap-1.5"',
    );
    expect(source).not.toContain('color:#E05555;border-color:#E05555');
  });

  it('uses the neg token utility for the confirm-delete card left border', () => {
    expect(source).toContain('class="card p-3.5 border-l-[3px] border-l-neg mb-3.5"');
    expect(source).not.toContain('border-left:3px solid #E05555');
  });

  it('uses the neg token utility for the confirm-delete title text', () => {
    expect(source).toContain(
      'class="body-strong text-neg mb-2">{$t(\'sup.confirmDelete.title\')}',
    );
    expect(source).not.toContain("style=\"color:#E05555;margin-bottom:8px;\">{$t('sup.confirmDelete.title')}");
  });

  it('uses the neg/neg-fg token utilities for the confirm-delete submit button background/border', () => {
    expect(source).toContain('class="btn bg-neg text-neg-fg border-neg h-[30px] text-xs"');
    expect(source).not.toContain('background:#E05555;color:#fff;border-color:#E05555');
  });

  it('inks the confirm-delete submit button with the neg-fg token, not #fff', () => {
    // --mep-neg is #e16b6b on the dark ramp; white on it is 3.2:1, below AA.
    // --mep-neg-fg is white in light and near-black in dark, like --mep-acc-fg.
    expect(source).not.toContain('background:var(--mep-neg);color:#fff');
    expect(source).toContain('text-neg-fg');
  });

  it('reliability-score coloring now goes through the shared getScoreColor helper (issue #605)', () => {
    expect(source).toContain("import { getScoreColor } from '$lib/status'");
    expect(source).not.toContain("return '#E05555';");
  });

  it('routes the conversion-row delete button through the neg token too', () => {
    // Deferred by #608 as out of scope; the styling-consistency sweep finished
    // it, because #E05555 is a light-theme red that never flipped on dark.
    expect(source).toContain(
      'class="btn h-[26px] text-[11px] text-neg border-neg px-2 py-0"',
    );
  });

  it('leaves no hard-coded #E05555 anywhere in the component', () => {
    const totalHex = (source.match(/#E05555/g) ?? []).length;
    // 4 danger-button/card sites (delete-supplier button, confirm-delete card
    // border, title, submit button) + the conversion-row delete button = 5
    // places now carrying the neg/neg-fg Tailwind token utilities instead.
    const totalNegClass = (source.match(/\b(?:text|bg|border|border-l)-neg(?:-fg)?\b/g) ?? []).length;
    expect(totalHex).toBe(0);
    expect(totalNegClass).toBe(9);
  });
});
