import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Regression test for issue #578: the account-deletion section of the
// settings page must carry visible danger styling (red border + red-tinted
// background) plus a warning icon, on top of the existing type-to-confirm flow.
//
// The settings redesign folded the section into a collapsed "danger zone"
// disclosure, so the block is now located from the `{#if dangerOpen}` gate
// rather than from the `<hr>` that used to precede it. Every requirement the
// issue asked for is still asserted against the expanded state.
const SOURCE_PATH = 'src/routes/(app)/settings/+page.svelte';
const source = readFileSync(SOURCE_PATH, 'utf8');

function extractDeleteAccountBlock(src: string): string {
  const descIndex = src.indexOf("$t('set.deleteDesc')");
  expect(descIndex, `expected to find set.deleteDesc in ${SOURCE_PATH}`).toBeGreaterThan(-1);

  const gate = src.lastIndexOf('{#if dangerOpen}', descIndex);
  expect(gate, 'expected the dangerOpen disclosure guarding the delete-account section').toBeGreaterThan(-1);
  const wrapperStart = src.indexOf('<div', gate);
  expect(wrapperStart, 'expected the delete-account wrapper <div> inside the disclosure').toBeGreaterThan(-1);

  const errorMarker = "$t('set.deleteBtn')";
  const btnIndex = src.indexOf(errorMarker, descIndex);
  expect(btnIndex, 'expected the delete button label after set.deleteDesc').toBeGreaterThan(-1);

  const blockEnd = src.indexOf('</div>', btnIndex);
  expect(blockEnd, 'expected a closing </div> after the delete button').toBeGreaterThan(-1);

  return src.slice(wrapperStart, blockEnd);
}

describe('account deletion danger styling (issue #578)', () => {
  const block = extractDeleteAccountBlock(source);

  it('wraps the delete-account section in a red-bordered card', () => {
    expect(block).toMatch(/border[^"']*var\(--mep-neg\)/);
  });

  it('gives the delete-account card a red-tinted background', () => {
    expect(block).toMatch(/background[^"']*var\(--mep-neg-soft\)/);
  });

  it('imports the AlertTriangle warning icon from @lucide/svelte', () => {
    expect(source).toMatch(/import\s+AlertTriangle\s+from\s+['"]@lucide\/svelte\/icons\/alert-triangle['"]/);
  });

  it('renders the AlertTriangle icon inside the delete-account section', () => {
    expect(block).toMatch(/<AlertTriangle\b/);
  });

  it('keeps the existing type-to-confirm flow intact', () => {
    expect(block).toContain("bind:value={deleteConfirm}");
    expect(block).toContain("$t('set.deleteConfirmWord')");
  });

  it('keeps the delete button red via the existing --mep-neg token', () => {
    expect(block).toMatch(/background:var\(--mep-neg\)/);
  });
});
