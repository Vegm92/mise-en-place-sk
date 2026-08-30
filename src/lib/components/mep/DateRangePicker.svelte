<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';

  let { from, to, baseUrl = '' }: { from: string; to: string; baseUrl?: string } = $props();

  let localFrom = $state(from);
  let localTo = $state(to);
  $effect(() => { localFrom = from; localTo = to; });

  function todayStr() {
    return new Date().toISOString().split('T')[0]!;
  }

  function navigate(f: string, t_: string) {
    const url = new URL(baseUrl || location.href, location.origin);
    url.searchParams.set('from', f);
    url.searchParams.set('to', t_);
    url.searchParams.delete('month');
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
    localFrom = f;
    localTo = t_;
    navigate(f, t_);
  }
</script>

<div class="drp" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
  <div class="drp-presets" style="display:flex;gap:4px;">
    {#each (['thisMonth','lastMonth','last7','last30'] as const) as preset}
      <button
        type="button"
        class="drp-pill"
        onclick={() => setPreset(preset)}
        style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--mep-border-strong);background:var(--mep-surface-2);color:var(--mep-fg-2);cursor:pointer;white-space:nowrap;"
      >{$t(`dateRange.${preset}`)}</button>
    {/each}
  </div>

  <div style="display:flex;align-items:center;gap:4px;">
    <span style="font-size:11px;color:var(--mep-fg-3);">{$t('dateRange.from')}</span>
    <input
      type="date"
      bind:value={localFrom}
      max={localTo}
      style="font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid var(--mep-border-strong);background:var(--mep-surface-2);color:var(--mep-fg-1);"
    />
    <span style="font-size:11px;color:var(--mep-fg-3);">{$t('dateRange.to')}</span>
    <input
      type="date"
      bind:value={localTo}
      min={localFrom}
      max={new Date().toISOString().split('T')[0]}
      style="font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid var(--mep-border-strong);background:var(--mep-surface-2);color:var(--mep-fg-1);"
    />
    <button
      type="button"
      onclick={applyLocal}
      style="font-size:11px;padding:3px 10px;border-radius:4px;border:1px solid var(--mep-accent);background:var(--mep-accent);color:#fff;cursor:pointer;"
    >{$t('dateRange.apply')}</button>
  </div>
</div>
