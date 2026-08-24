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
    expect(source).toContain('background:var(--mep-neg);color:#fff;border-color:var(--mep-neg)');
    expect(source).not.toContain('background:#E05555;color:#fff;border-color:#E05555');
  });

  it('leaves the reliability-score color scale function untouched (owned by issue #605)', () => {
    expect(source).toContain("return '#E05555';");
  });

  it('leaves the unrelated conversion-row delete button untouched (out of scope for #608)', () => {
    expect(source).toContain(
      'height:26px;font-size:11px;color:#E05555;border-color:#E05555;padding:0 8px;',
    );
  });

  it('replaces exactly the four in-scope danger-UI locations, no more, no less', () => {
    const totalHex = (source.match(/#E05555/g) ?? []).length;
    const totalToken = (source.match(/var\(--mep-neg\)/g) ?? []).length;
    expect(totalToken).toBe(6);
    expect(totalHex).toBe(3);
  });
});
