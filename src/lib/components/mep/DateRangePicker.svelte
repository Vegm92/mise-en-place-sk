<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  const PERIODS = ['24h', '1w', '1m', '3m', '6m', '1y', 'all'] as const;

  let { active = '1m' }: { active?: string } = $props();
  let open = $state(false);

  function fromPeriod(p: string): [string, string] {
    const today = new Date();
    const to = today.toISOString().slice(0, 10)!;
    if (p === 'all') return ['2000-01-01', to];
    const days: Record<string, number> = { '24h': 0, '1w': 6, '1m': 29, '3m': 89, '6m': 179, '1y': 364 };
    const from = new Date(today.getTime() - (days[p] ?? 29) * 86400000).toISOString().slice(0, 10)!;
    return [from, to];
  }

  function pick(p: string) {
    const [from, to] = fromPeriod(p);
    const age = 30 * 24 * 3600;
    document.cookie = `mep_period=${p}; path=/; max-age=${age}; SameSite=Lax`;
    document.cookie = `mep_date_from=${from}; path=/; max-age=${age}; SameSite=Lax`;
    document.cookie = `mep_date_to=${to}; path=/; max-age=${age}; SameSite=Lax`;
    open = false;
    invalidateAll();
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
