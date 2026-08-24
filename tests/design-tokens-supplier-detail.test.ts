import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/lib/components/desktop/DesktopSupplierDetail.svelte', import.meta.url),
  'utf-8',
);

describe('DesktopSupplierDetail danger-button color token (issue #608)', () => {
  it('uses var(--mep-neg) for the delete-supplier button border/text', () => {
    expect(source).toContain(
      'height:32px;font-size:12.5px;color:var(--mep-neg);border-color:var(--mep-neg)',
    );
    expect(source).not.toContain('height:32px;font-size:12.5px;color:#E05555;border-color:#E05555');
  });

  it('uses var(--mep-neg) for the confirm-delete card left border', () => {
    expect(source).toContain('border-left:3px solid var(--mep-neg)');
    expect(source).not.toContain('border-left:3px solid #E05555');
  });

  it('uses var(--mep-neg) for the confirm-delete title text', () => {
    expect(source).toContain("style=\"color:var(--mep-neg);margin-bottom:8px;\">{$t('sup.confirmDelete.title')}");
    expect(source).not.toContain("style=\"color:#E05555;margin-bottom:8px;\">{$t('sup.confirmDelete.title')}");
  });

  it('uses var(--mep-neg) for the confirm-delete submit button background/border', () => {
    expect(source).toContain(
      'background:var(--mep-neg);color:var(--mep-neg-fg);border-color:var(--mep-neg)',
    );
    expect(source).not.toContain('background:#E05555;color:#fff;border-color:#E05555');
  });

  it('inks the confirm-delete submit button with var(--mep-neg-fg), not #fff', () => {
    // --mep-neg is #e16b6b on the dark ramp; white on it is 3.2:1, below AA.
    // --mep-neg-fg is white in light and near-black in dark, like --mep-acc-fg.
    expect(source).not.toContain('background:var(--mep-neg);color:#fff');
  });

  it('reliability-score coloring now goes through the shared getScoreColor helper (issue #605)', () => {
    expect(source).toContain("import { getScoreColor } from '$lib/status'");
    expect(source).not.toContain("return '#E05555';");
  });

  it('routes the conversion-row delete button through var(--mep-neg) too', () => {
    // Deferred by #608 as out of scope; the styling-consistency sweep finished
    // it, because #E05555 is a light-theme red that never flipped on dark.
    expect(source).toContain(
      'height:26px;font-size:11px;color:var(--mep-neg);border-color:var(--mep-neg);padding:0 8px;',
    );
  });

  it('leaves no hard-coded #E05555 anywhere in the component', () => {
    const totalHex = (source.match(/#E05555/g) ?? []).length;
    const totalToken = (source.match(/var\(--mep-neg\)/g) ?? []).length;
    expect(totalHex).toBe(0);
    // 6 from #608 + 2 from the conversion-row delete button.
    expect(totalToken).toBe(8);
  });
});
