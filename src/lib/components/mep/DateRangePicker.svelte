<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';

  const PERIODS = ['24h', '1w', '1m', '3m', '6m', '1y', 'all'] as const;

  let { active = '1m' }: { active?: string } = $props();
  let open = $state(false);

  function pick(p: string) {
    open = false;
    const url = new URL(page.url);
    if (p === '1m') url.searchParams.delete('period');
    else url.searchParams.set('period', p);
    goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<div class="drp" style="flex-shrink:0;">
  <div class="drp-seg" role="group" aria-label={$t('dateRangePicker.label')}>
    {#each PERIODS as p}
      <button
        type="button"
        aria-pressed={p === active}
        aria-label={$t(`dateRangePicker.${p}`)}
        onclick={() => pick(p)}
        style="font-size:12px;font-weight:600;padding:4px 8px;border-radius:4px;border:none;background:{p === active ? 'var(--mep-acc)' : 'transparent'};color:{p === active ? 'var(--mep-acc-fg)' : 'var(--mep-fg-3)'};cursor:pointer;white-space:nowrap;"
      >{p}</button>
    {/each}
  </div>

  <button
    type="button"
    class="drp-trigger"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={$t('dateRangePicker.label')}
    onclick={() => open = !open}
    style="align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mep-acc-fg);background:var(--mep-acc);border:none;border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;"
  >
    {active}
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="opacity:.7;flex-shrink:0;">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
</div>

{#if open}
  <div role="presentation" class="drp-backdrop" onclick={() => open = false}></div>
  <div class="drp-sheet" role="dialog" aria-modal="true" aria-label={$t('dateRangePicker.label')}>
    <div class="drp-sheet-handle"></div>
    <div class="drp-sheet-title">{$t('dateRangePicker.label')}</div>
    {#each PERIODS as p}
      <button
        type="button"
        onclick={() => pick(p)}
        style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;font-size:14px;font-weight:{p === active ? '600' : '400'};padding:11px 14px;border-radius:8px;border:none;background:{p === active ? 'var(--mep-acc-soft)' : 'transparent'};color:{p === active ? 'var(--mep-fg)' : 'var(--mep-fg-2)'};cursor:pointer;"
      >
        <span>{$t(`dateRangePicker.${p}`)}</span>
        {#if p === active}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
            <path d="M20 6 9 17l-5-5"></path>
          </svg>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .drp-seg {
    display: none;
    align-items: center;
    gap: 2px;
    background: var(--mep-surface-2);
    border: 1px solid var(--mep-border-strong);
    border-radius: 6px;
    padding: 3px;
  }
  .drp-trigger { display: inline-flex; }
  @media (min-width: 768px) {
    .drp-seg { display: inline-flex; }
    .drp-trigger { display: none; }
  }
  .drp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: rgba(20, 24, 36, 0.32);
  }
  .drp-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    background: var(--mep-surface);
    border-top: 1px solid var(--mep-border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, .14);
    padding: 10px 8px 14px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
  }
  .drp-sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--mep-border-strong);
    margin: 0 auto 12px;
  }
  .drp-sheet-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: var(--mep-fg-4);
    padding: 0 14px 8px;
  }
</style>
