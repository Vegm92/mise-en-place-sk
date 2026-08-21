<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { t, tcat } from '$lib/i18n';
  import { invalidateAll } from '$app/navigation';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import Search from '@lucide/svelte/icons/search';
  import Plus from '@lucide/svelte/icons/plus';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  const { data, form }: { data: PageData; form: ActionData } = $props();
  const { products, suggestions, categories, colors } = $derived(data);
  const needsConversionCount = $derived(products.filter(p => p.needsConversion).length);

  let tab = $state<'catalog' | 'suggestions'>('catalog');
  let search = $state('');
  const filteredProducts = $derived(
    products.filter(p => {
      const q = search.trim().toLowerCase();
      return !q || p.canonicalName.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q);
    })
  );

  let suggestionBusy = $state<Record<number, boolean>>({});

  async function respondSuggestion(id: number, action: 'confirm' | 'reject', description: string) {
    suggestionBusy = { ...suggestionBusy, [id]: true };
    try {
      await fetch('/api/product-aliases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description, action }),
      });
      await invalidateAll();
    } finally {
      suggestionBusy = { ...suggestionBusy, [id]: false };
    }
  }
</script>

<div class="flex flex-col gap-4 p-6" data-coach="products-main">

  <div style="display:flex;align-items:center;gap:12px;">
    <div class="search-field">
      <span class="search-icon"><Search size={14} /></span>
      <input class="input" placeholder={$t('prod.searchPlaceholder')} bind:value={search} />
    </div>
  </div>

  <div class="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
    <KpiCard
      label={$t('prod.kpi.total')}
      value={products.length}
      sub={$t('inv.kpi.totalSub')}
    />
    <KpiCard
      label={$t('prod.kpi.needsConversion')}
      value={needsConversionCount}
      variant={needsConversionCount > 0 ? 'warn' : 'default'}
      sub={$t('nav.products')}
    />
    <button type="button" onclick={() => (tab = 'suggestions')} style="text-align:left;border:none;background:none;padding:0;cursor:pointer;">
      <KpiCard
        label={$t('prod.tab.suggestions')}
        value={suggestions.length}
        variant={suggestions.length > 0 ? 'warn' : 'default'}
        sub={$t('nav.products')}
      />
    </button>
  </div>

  <div class="flex items-center gap-2">
    <button type="button" class="btn {tab === 'catalog' ? 'btn-primary' : 'btn-ghost'}"
      style="height:32px;font-size:12.5px;" onclick={() => (tab = 'catalog')}>
      {$t('prod.tab.catalog')}
    </button>
    <button type="button" class="btn {tab === 'suggestions' ? 'btn-primary' : 'btn-ghost'}"
      style="height:32px;font-size:12.5px;gap:6px;" onclick={() => (tab = 'suggestions')}>
      {$t('prod.tab.suggestions')}
      {#if suggestions.length > 0}
        <span class="badge" style="background:var(--mep-warn-soft);color:var(--mep-warn);">{suggestions.length}</span>
      {/if}
    </button>
  </div>

  {#if tab === 'catalog'}
    <SectionCard title={$t('prod.title')} sub={$t('prod.subtitle')} noPad>
      <div class="p-4 border-b border-divider">
        <form method="post" action="?/create" class="flex flex-wrap items-end gap-2">
          <div class="flex flex-col gap-1 min-w-[180px]">
            <label class="label text-fg-3" style="font-size:10.5px;" for="prod-name">{$t('prod.new.name')}</label>
            <input id="prod-name" name="canonicalName" required class="input" style="height:32px;font-size:12.5px;padding:0 8px;" />
          </div>
          <div class="flex flex-col gap-1 min-w-[160px]">
            <label class="label text-fg-3" style="font-size:10.5px;" for="prod-cat">{$t('prod.new.category')}</label>
            <select id="prod-cat" name="category" class="input" style="height:32px;font-size:12.5px;padding:0 8px;">
              <option value="">—</option>
              {#each categories as c}<option value={c}>{$tcat(c)}</option>{/each}
            </select>
          </div>
          <div class="flex flex-col gap-1 min-w-[100px]">
            <label class="label text-fg-3" style="font-size:10.5px;" for="prod-unit">{$t('prod.new.unit')}</label>
            <input id="prod-unit" name="canonicalUnit" class="input" style="height:32px;font-size:12.5px;padding:0 8px;" placeholder="kg" />
          </div>
          <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;gap:5px;">
            <Plus size={13} />
            {$t('prod.new.add')}
          </button>
        </form>
        {#if form?.error}
          <p class="body text-neg" style="font-size:12px;margin-top:6px;">{form.error}</p>
        {/if}
      </div>

      {#if products.length === 0}
        <p class="body text-center py-16">{$t('prod.empty')}</p>
      {:else if filteredProducts.length === 0}
        <p class="body text-center py-16" style="color:var(--mep-fg-3);">{$t('prod.noResults')}</p>
      {:else}
        <table class="tbl">
          <thead>
            <tr>
              <th>{$t('prod.col.name')}</th>
              <th>{$t('prod.col.category')}</th>
              <th>{$t('prod.col.unit')}</th>
              <th class="num">{$t('prod.col.suppliers')}</th>
              <th class="num">{$t('prod.col.aliases')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredProducts as p (p.id)}
              <tr class="row">
                <td>
                  <a href="/products/{p.id}" class="body-strong" style="text-decoration:none;color:inherit;">{p.canonicalName}</a>
                </td>
                <td>
                  <span class="badge" style="background:{colors[p.category]}22;color:{colors[p.category]};">{$tcat(p.category)}</span>
                </td>
                <td class="body text-fg-3" style="font-size:12px;">{p.canonicalUnit ?? '—'}</td>
                <td class="num">{p.supplierCount}</td>
                <td class="num">{p.aliasCount}</td>
                <td>
                  {#if p.needsConversion}
                    <span class="body text-warn flex items-center gap-1" style="font-size:11px;" title={$t('prod.badge.needsConversion')}>
                      <AlertTriangle size={12} />
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </SectionCard>
  {:else}
    <SectionCard title={$t('prod.tab.suggestions')} noPad>
      {#if suggestions.length === 0}
        <p class="body text-center py-16">{$t('prod.suggestions.empty')}</p>
      {:else}
        <div class="flex flex-col gap-3 p-4">
          {#each suggestions as s (s.id)}
            <div class="border border-divider rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
              <p class="body" style="font-size:13px;">{s.message}</p>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button type="button" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;"
                  disabled={suggestionBusy[s.id]}
                  onclick={() => respondSuggestion(s.id, 'confirm', s.description)}>
                  {$t('prod.suggestions.confirm')}
                </button>
                <button type="button" class="btn btn-ghost text-neg" style="height:28px;font-size:12px;"
                  disabled={suggestionBusy[s.id]}
                  onclick={() => respondSuggestion(s.id, 'reject', s.description)}>
                  {$t('prod.suggestions.reject')}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </SectionCard>
  {/if}

</div>
