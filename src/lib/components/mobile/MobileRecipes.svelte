<script lang="ts">
  import { fmtEur } from '$lib/formatters';
  import { t, ti } from '$lib/i18n';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';

  interface Recipe {
    id: number;
    name: string;
    kind: string;
    status: string;
    section: string | null;
    portions: number;
    costPerPortionCents: number;
  }

  const BADGE_STYLE: Record<string, string> = {
    draft: 'background:var(--mep-warn-soft);color:var(--mep-warn);',
    active: 'background:var(--mep-pos-soft);color:var(--mep-pos);',
    archived: 'background:var(--mep-hover);color:var(--mep-fg-3);',
  };

  let {
    recipes,
    sections,
    statuses,
  }: {
    recipes: Recipe[];
    sections: readonly string[];
    statuses: readonly string[];
  } = $props();

  let search = $state('');
  let statusFilter = $state('');
  let sectionSheetOpen = $state(false);
  let kindSheetOpen = $state(false);
  let sectionFilter = $state('');
  let kindFilter = $state('');

  const KINDS = ['plato', 'elaboracion'];

  function chipClass(active: boolean) {
    return active ? 'chip active' : 'chip';
  }

  const filtered = $derived(recipes.filter(r => {
    const q = search.trim().toLowerCase();
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (sectionFilter && r.section !== sectionFilter) return false;
    if (kindFilter && r.kind !== kindFilter) return false;
    return true;
  }));
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; padding-top: 2px;">

  <div style="padding: 0 18px 10px; position: relative;">
    <span style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); color: var(--mep-fg-3); pointer-events: none;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    </span>
    <input
      class="input"
      style="width: 100%; height: 40px; padding-left: 36px; box-sizing: border-box;"
      placeholder={$t('rec.search')}
      bind:value={search}
    />
  </div>

  <ScrollStrip label={$t('rec.filter.status')} extraStyle="flex-shrink:0;">
    <button class={chipClass(!statusFilter)} onclick={() => statusFilter = ''}>{$t('rec.filter.all')}</button>
    {#each statuses as s}
      <button class={chipClass(statusFilter === s)} onclick={() => statusFilter = statusFilter === s ? '' : s}>{$t(`rec.status.${s}`)}</button>
    {/each}
    <button class={chipClass(!!sectionFilter)} aria-haspopup="dialog" onclick={() => sectionSheetOpen = true}>
      {sectionFilter ? $t(`rec.section.${sectionFilter}`) : $t('rec.filter.section')} ↕
    </button>
    <button class={chipClass(!!kindFilter)} aria-haspopup="dialog" onclick={() => kindSheetOpen = true}>
      {kindFilter ? $t(`rec.kind.${kindFilter}`) : $t('rec.filter.kind')} ↕
    </button>
  </ScrollStrip>

  {#if sectionSheetOpen}
    <button type="button" class="filter-sheet-backdrop" aria-label={$t('minv.sheet.close')} onclick={() => sectionSheetOpen = false}></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('rec.filter.section')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('rec.filter.section')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => sectionSheetOpen = false}>{$t('minv.sheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={!sectionFilter} onclick={() => { sectionFilter = ''; sectionSheetOpen = false; }}>
          <span>{$t('rec.filter.all')}</span>
        </button>
        {#each sections as s}
          <button type="button" class="filter-sheet-option" aria-pressed={sectionFilter === s} onclick={() => { sectionFilter = sectionFilter === s ? '' : s; sectionSheetOpen = false; }}>
            <span>{$t(`rec.section.${s}`)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if kindSheetOpen}
    <button type="button" class="filter-sheet-backdrop" aria-label={$t('minv.sheet.close')} onclick={() => kindSheetOpen = false}></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('rec.filter.kind')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('rec.filter.kind')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => kindSheetOpen = false}>{$t('minv.sheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={!kindFilter} onclick={() => { kindFilter = ''; kindSheetOpen = false; }}>
          <span>{$t('rec.filter.all')}</span>
        </button>
        {#each KINDS as k}
          <button type="button" class="filter-sheet-option" aria-pressed={kindFilter === k} onclick={() => { kindFilter = kindFilter === k ? '' : k; kindSheetOpen = false; }}>
            <span>{$t(`rec.kind.${k}`)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div style="flex: 1; overflow: auto; padding: 0 18px 16px; display: flex; flex-direction: column; gap: 8px;">
    {#if recipes.length === 0}
      <div style="padding: 40px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">{$t('rec.empty')}</div>
    {:else if filtered.length === 0}
      <div style="padding: 40px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">{$t('rec.emptyFiltered')}</div>
    {:else}
      {#each filtered as r (r.id)}
        <a href="/recipes/{r.id}" style="
          display: flex; align-items: flex-start; gap: 12px;
          padding: 13px 14px; border-radius: 10px;
          background: var(--mep-surface);
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        ">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
              <span style="font-size: 13px; font-weight: 500; color: var(--mep-fg);">{r.name}</span>
              <span style="border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; flex-shrink: 0; {BADGE_STYLE[r.status] ?? BADGE_STYLE.archived}">
                {$t(`rec.status.${r.status}`)}
              </span>
            </div>
            <div style="font-size: 11px; color: var(--mep-fg-3);">
              {r.section ? $t(`rec.section.${r.section}`) : '—'} · {$t(`rec.kind.${r.kind}`)} · {$ti('rec.mobile.portions', { n: r.portions })}
            </div>
            <div class="num" style="font-size: 11px; color: var(--mep-fg-3); margin-top: 3px;">
              {$t('rec.mobile.cost')}: <strong style="color: var(--mep-fg);">{fmtEur(r.costPerPortionCents / 100)}</strong>
            </div>
          </div>
          <ChevronRight size={14} style="color: var(--mep-fg-3); flex-shrink: 0; margin-top: 2px;" />
        </a>
      {/each}
      <div style="text-align: center; padding: 10px 0 4px; font-size: 11px; color: var(--mep-fg-3);">
        {$ti('rec.mobile.totalCount', { n: recipes.length })}
      </div>
    {/if}
  </div>
</div>
