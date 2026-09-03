/**
 * Regression test for issue #538.
 *
 * 1. CoachMark.svelte rendered a transparent, full-viewport click-catcher
 *    (`pointer-events` defaulting to `auto`, `z-index:110`) while a coach mark
 *    was showing. Any click anywhere on the page — the language toggle, the
 *    theme toggle, a nav link — landed on that catcher instead of its real
 *    target and only dismissed the tutorial, so the user's first click never
 *    did what they clicked for. The fix makes the backdrop
 *    `pointer-events:none` so clicks fall through to whatever is under the
 *    cursor; the tooltip already carries a real Skip button and Escape still
 *    dismisses, so no click-catcher is needed to close the tour.
 *
 * 2. The low-confidence-guard and duplicate-item modals on /batch/[id] used
 *    `role="dialog"` + `aria-modal="true"` on the panel (right) but never
 *    tied it to its title (`aria-labelledby`), never moved focus into the
 *    panel on open, never restored it to the trigger on close, and Escape
 *    only stopped the keydown from bubbling instead of closing the dialog.
 *    This mirrors the (app) layout's `upgradeModalOpen` dialog, the
 *    reference pattern named in the issue: backdrop stays
 *    `role="presentation"`, the panel gets `aria-labelledby` pointing at its
 *    title id, a mount-time focus action, and an Escape branch that closes
 *    instead of merely swallowing the key.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const COACH = read('src/lib/components/mep/CoachMark.svelte');
const BATCH = read('src/routes/(app)/batch/[id]/+page.svelte');

describe('CoachMark backdrop no longer swallows the first click (#538)', () => {
  it('renders the full-viewport backdrop with pointer-events:none', () => {
    const backdropStart = COACH.indexOf('{#if ready}');
    expect(backdropStart).toBeGreaterThan(-1);
    const spotlightStart = COACH.indexOf('aria-hidden="true"', backdropStart);
    const backdropBlock = COACH.slice(backdropStart, spotlightStart);
    expect(backdropBlock).toContain('z-index:110');
    expect(backdropBlock).toContain('pointer-events:none');
  });

  it('gives the backdrop no click handler — clicks fall through to their real target', () => {
    const backdropStart = COACH.indexOf('{#if ready}');
    const spotlightStart = COACH.indexOf('aria-hidden="true"', backdropStart);
    const backdropBlock = COACH.slice(backdropStart, spotlightStart);
    expect(backdropBlock).not.toContain('onclick');
    expect(backdropBlock).not.toContain('role="presentation"');
  });

  it('keeps a real, labelled Skip button in the tooltip as the dismiss affordance', () => {
    const tooltipStart = COACH.indexOf('role="dialog"');
    expect(tooltipStart).toBeGreaterThan(-1);
    const tooltipBlock = COACH.slice(tooltipStart);
    expect(tooltipBlock).toMatch(/<button[^>]*onclick=\{onSkip\}/);
    expect(tooltipBlock).toContain("{t('coach.skip')}");
  });

  it('still dismisses on Escape', () => {
    expect(COACH).toContain("if (e.key === 'Escape') onSkip();");
    expect(COACH).toContain('<svelte:window onkeydown={handleKey} />');
  });
});

describe('the batch/[id] low-confidence and duplicate modals are real dialogs (#538)', () => {
  const modals = [
    { name: 'low-confidence', open: 'showLowConfModal', titleId: 'lowconf-modal-title', close: 'closeLowConfModal' },
    { name: 'duplicate', open: 'showContentDuplicateModal', titleId: 'dup-modal-title', close: 'closeContentDuplicateModal' },
  ];

  for (const { name, open, titleId, close } of modals) {
    describe(`${name} modal`, () => {
      const blockStart = BATCH.indexOf(`{#if ${open}}`);
      const blockEnd = BATCH.indexOf('{/if}', blockStart);
      const block = BATCH.slice(blockStart, blockEnd);

      it('exists', () => {
        expect(blockStart).toBeGreaterThan(-1);
        expect(blockEnd).toBeGreaterThan(blockStart);
      });

      it('keeps the backdrop as role="presentation" and the panel as role="dialog"', () => {
        expect(block).toMatch(/role="presentation"/);
        expect(block).toMatch(/role="dialog"/);
      });

      it('marks the panel aria-modal and ties it to its title via aria-labelledby', () => {
        expect(block).toContain('aria-modal="true"');
        expect(block).toContain(`aria-labelledby="${titleId}"`);
        expect(block).toContain(`id="${titleId}"`);
      });

      it('is focusable and receives focus on mount', () => {
        expect(block).toContain('tabindex="-1"');
        expect(block).toContain('use:focusModalPanel');
      });

      it('closes on Escape via the same cancel action as the other dismiss controls', () => {
        expect(block).toMatch(new RegExp(`if \\(e\\.key === 'Escape'\\) ${close}\\(\\);`));
      });

      it('wires the backdrop click to the same cancel action', () => {
        expect(block).toMatch(new RegExp(`onclick=\\{${close}\\}[\\s\\S]{0,40}>`));
      });
    });
  }

  it('captures the trigger element before opening and restores focus to it on close', () => {
    expect(BATCH).toContain('let lowConfTriggerEl: HTMLElement | null = null;');
    expect(BATCH).toContain('let dupTriggerEl: HTMLElement | null = null;');
    expect(BATCH).toContain('lowConfTriggerEl = document.activeElement as HTMLElement | null;');
    expect(BATCH).toContain('dupTriggerEl = document.activeElement as HTMLElement | null;');

    const closeLowConf = BATCH.slice(
      BATCH.indexOf('function closeLowConfModal()'),
      BATCH.indexOf('function closeContentDuplicateModal()'),
    );
    expect(closeLowConf).toContain('showLowConfModal = false;');
    expect(closeLowConf).toContain('lowConfTriggerEl?.focus();');

    const closeDup = BATCH.slice(
      BATCH.indexOf('function closeContentDuplicateModal()'),
      BATCH.indexOf('function focusModalPanel('),
    );
    expect(closeDup).toContain('showContentDuplicateModal = false;');
    expect(closeDup).toContain('dupTriggerEl?.focus();');
  });

  it('does not trap focus — mirrors the (app) layout dialog pattern (mount-time focus only)', () => {
    const layout = read('src/routes/(app)/+layout.svelte');
    expect(layout).toContain('function focusEl(node: HTMLElement) { node.focus(); }');
    expect(BATCH).toContain('function focusModalPanel(node: HTMLElement) {');
    expect(BATCH).not.toMatch(/focus\s*trap/i);
  });

  it('also handles Escape for these modals at the window level as a defensive fallback', () => {
    expect(BATCH).toMatch(/if \(e\.key === 'Escape' && showLowConfModal\) \{\s*closeLowConfModal\(\);/);
    expect(BATCH).toMatch(/if \(e\.key === 'Escape' && showContentDuplicateModal\) \{\s*closeContentDuplicateModal\(\);/);
  });

  it('the reviewed-all action still submits the save form after closing through the same helper', () => {
    const btnStart = BATCH.indexOf("{t('batch.reviewedAll')}");
    expect(btnStart).toBeGreaterThan(-1);
    const before = BATCH.slice(BATCH.lastIndexOf('onclick={async () => {', btnStart), btnStart);
    expect(before).toContain('lowConfAck = true;');
    expect(before).toContain('closeLowConfModal();');
    expect(before).toContain("requestSubmit();");
  });
});
