<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';

  let { from, to, label = '', baseUrl = '' }: { from: string; to: string; label?: string; baseUrl?: string } = $props();

  let localFrom = $state(from);
  let localTo = $state(to);
  let open = $state(false);
  $effect(() => { localFrom = from; localTo = to; });

  function todayStr() { return new Date().toISOString().split('T')[0]!; }

  function navigate(f: string, t_: string) {
    const url = new URL(baseUrl || location.href, location.origin);
    url.searchParams.set('from', f);
    url.searchParams.set('to', t_);
    url.searchParams.delete('month');
    open = false;
    goto(url.pathname + url.search);
  }

  function applyLocal() {
    if (localFrom && localTo && localFrom <= localTo) navigate(localFrom, localTo);
  }

  function setPreset(preset: 'thisMonth' | 'lastMonth' | 'last7' | 'last30') {
    const today = new Date();
    let f: string, t_: string;
    if (preset === 'thisMonth') {
      f = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      t_ = todayStr();
    } else if (preset === 'lastMonth') {
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      const lastY = last.getFullYear();
      const lastM = String(last.getMonth() + 1).padStart(2, '0');
      const lastD = String(last.getDate()).padStart(2, '0');
      f = `${lastY}-${lastM}-01`;
      t_ = `${lastY}-${lastM}-${lastD}`;
    } else if (preset === 'last7') {
      const d = new Date(today.getTime() - 6 * 86400000);
      f = d.toISOString().split('T')[0]!;
      t_ = todayStr();
    } else {
      const d = new Date(today.getTime() - 29 * 86400000);
      f = d.toISOString().split('T')[0]!;
      t_ = todayStr();
    }
    navigate(f, t_);
  }
</script>

{#if open}
  <div
    role="presentation"
    style="position:fixed;inset:0;z-index:99;"
    onclick={() => open = false}
  ></div>
{/if}

<div style="position:relative;display:inline-block;">
  <button
    type="button"
    onclick={() => open = !open}
    style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mep-fg);background:var(--mep-surface-2);border:1px solid var(--mep-border-strong);border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;"
  >
    {label || from}
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="opacity:.5;flex-shrink:0;">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  {#if open}
    <div style="position:absolute;top:calc(100% + 6px);left:0;z-index:100;background:var(--mep-surface-2);border:1px solid var(--mep-border-strong);border-radius:var(--mep-r-card);padding:12px;display:flex;flex-direction:column;gap:10px;min-width:260px;box-shadow:0 4px 16px rgba(0,0,0,.15);">
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        {#each (['thisMonth','lastMonth','last7','last30'] as const) as preset}
          <button
            type="button"
            onclick={() => setPreset(preset)}
            style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--mep-border-strong);background:var(--mep-surface-2);color:var(--mep-fg-2);cursor:pointer;white-space:nowrap;"
          >{$t(`dateRange.${preset}`)}</button>
        {/each}
      </div>

      <div style="display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px 8px;">
        <span style="font-size:11px;color:var(--mep-fg-3);">{$t('dateRange.from')}</span>
        <input
          type="date"
          bind:value={localFrom}
          max={localTo}
          style="font-size:16px;padding:3px 6px;border-radius:4px;border:1px solid var(--mep-border-strong);background:var(--mep-surface-2);color:var(--mep-fg);width:100%;"
        />
        <span style="font-size:11px;color:var(--mep-fg-3);">{$t('dateRange.to')}</span>
        <input
          type="date"
          bind:value={localTo}
          min={localFrom}
          max={new Date().toISOString().split('T')[0]}
          style="font-size:16px;padding:3px 6px;border-radius:4px;border:1px solid var(--mep-border-strong);background:var(--mep-surface-2);color:var(--mep-fg);width:100%;"
        />
      </div>

      <button
        type="button"
        onclick={applyLocal}
        style="font-size:13px;padding:5px 12px;border-radius:4px;border:none;background:var(--mep-acc);color:var(--mep-acc-fg);cursor:pointer;align-self:flex-end;"
      >{$t('dateRange.apply')}</button>
    </div>
  {/if}
</div>
