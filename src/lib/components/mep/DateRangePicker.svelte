<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

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

{#if open}
  <div role="presentation" style="position:fixed;inset:0;z-index:99;" onclick={() => open = false}></div>
{/if}

<div style="position:relative;display:inline-block;flex-shrink:0;">
  <button
    type="button"
    onclick={() => open = !open}
    style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mep-fg);background:var(--mep-surface-2);border:1px solid var(--mep-border-strong);border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;"
  >
    {active}
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="opacity:.5;flex-shrink:0;">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  {#if open}
    <div style="position:absolute;top:calc(100% + 6px);left:0;z-index:100;background:var(--mep-surface-2);border:1px solid var(--mep-border-strong);border-radius:var(--mep-r-card);padding:6px;display:flex;flex-direction:column;gap:2px;min-width:100px;box-shadow:0 4px 16px rgba(0,0,0,.15);">
      {#each PERIODS as p}
        <button
          type="button"
          onclick={() => pick(p)}
          style="text-align:left;font-size:13px;font-weight:{p === active ? '700' : '400'};padding:6px 10px;border-radius:4px;border:none;background:{p === active ? 'var(--mep-acc-soft)' : 'transparent'};color:{p === active ? 'var(--mep-fg)' : 'var(--mep-fg-2)'};cursor:pointer;white-space:nowrap;"
        >{p}</button>
      {/each}
    </div>
  {/if}
</div>
