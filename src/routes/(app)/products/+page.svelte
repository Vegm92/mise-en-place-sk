<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { page } from '$app/stores';
  import { t, tcat, ti } from '$lib/i18n';
  import { invalidateAll } from '$app/navigation';
  import ListPageTemplate from '$lib/components/mep/ListPageTemplate.svelte';
  import { PERIOD_PILLS } from '$lib/constants';
  import Plus from '@lucide/svelte/icons/plus';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  type ConversionPrompt = PageData['conversionPrompts'][number];

  const { data, form }: { data: PageData; form: ActionData } = $props();
  const { products, suggestions, conversionPrompts, categories, colors } = $derived(data);

  let tab            = $state<'catalog' | 'suggestions'>('catalog');
  let search         = $state('');
  let catFilter      = $state('');
  let view           = $state<'list' | 'chart'>('list');
  let suggestionBusy = $state<Record<number, boolean>>({});
  let conversionBusy = $state<Record<number, boolean>>({});
  let conversionError = $state<Record<number, boolean>>({});

  const filteredProducts = $derived(
    products.filter(p => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || p.canonicalName.toLowerCase().includes(q);
      const matchCat = !catFilter || p.category === catFilter;
      return matchSearch && matchCat;
    })
  );

  const needsConversionCount = $derived(products.filter(p => p.needsConversion).length);
  const pendingCount         = $derived(suggestions.length + conversionPrompts.length);
  const categoryCount        = $derived(new Set(products.map(p => p.category).filter(Boolean)).size);

  const periodPills = $derived(PERIOD_PILLS.map(p => {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('period', p.value);
    return { value: p.value, label: $t(p.labelKey), href: `/products?${params.toString()}` };
  }));

  const trendSeries = $derived(
    data.trendData.series.map(s => ({ key: s.key, label: $t(s.label), color: s.color, values: s.values }))
  );

  async function saveConversion(prompt: ConversionPrompt, event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    conversionBusy = { ...conversionBusy, [prompt.notificationId]: true };
    conversionError = { ...conversionError, [prompt.notificationId]: false };
    try {
      const res = await fetch('/api/unit-conversions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          supplier_id:       prompt.supplierId,
          supplier_name:     prompt.supplierName,
          ingredient:        prompt.ingredient,
          purchase_unit:     prompt.purchaseUnit,
          canonical_unit:    String(fields.get('canonical_unit') ?? ''),
          conversion_factor: String(fields.get('conversion_factor') ?? ''),
        }),
      });
      if (!res.ok) {
        conversionError = { ...conversionError, [prompt.notificationId]: true };
        return;
      }
      await invalidateAll();
    } finally {
      conversionBusy = { ...conversionBusy, [prompt.notificationId]: false };
    }
  }

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

<div class="p-6">
  <ListPageTemplate
    dataCoach="products-main"
    bind:search
    bind:view
    searchPlaceholder={$t('prod.col.name')}
    period={data.period}
    {periodPills}
    viewLabels={{ list: $t('tpl.view.list'), chart: $t('tpl.view.chart') }}
    kpis={[
      { key: 'total',       label: $t('prod.kpi.total'),          value: products.length,       sub: $t('dsup.inTotal') },
      { key: 'conversion',  label: $t('prod.kpi.needsConversion'), value: needsConversionCount, variant: needsConversionCount > 0 ? 'warn' : 'default' },
      { key: 'suggestions', label: $t('prod.kpi.suggestions'),    value: suggestions.length,    variant: suggestions.length > 0 ? 'warn' : 'pos' },
      { key: 'categories',  label: $t('prod.kpi.categories'),     value: categoryCount },
    ]}
    trendTitle={$t('prod.trend.title')}
    trendBadges={data.trendData.series.map(s => ({ key: s.key, label: $t(s.label), color: s.color, active: true }))}
    trendXLabels={data.trendData.xLabels}
    {trendSeries}
    trendValueFormatter={(v) => String(v)}
    trendEmptyLabel={$t('tpl.trend.empty')}
  >
    {#snippet filters()}
      <div class="flex items-center gap-2">
        <button type="button" class="btn {tab === 'catalog' ? 'btn-primary' : 'btn-ghost'}"
          style="height:32px;font-size:12.5px;" onclick={() => (tab = 'catalog')}>
          {$t('prod.tab.catalog')}
        </button>
        <button type="button" class="btn {tab === 'suggestions' ? 'btn-primary' : 'btn-ghost'}"
          style="height:32px;font-size:12.5px;gap:6px;" onclick={() => (tab = 'suggestions')}>
          {$t('prod.tab.suggestions')}
          {#if pendingCount > 0}
            <span class="badge" style="background:var(--mep-warn-soft);color:var(--mep-warn);">{pendingCount}</span>
          {/if}
        </button>
      </div>
      {#if tab === 'catalog'}
        <div style="position:relative;">
          <select class="btn btn-secondary"
            style="height:32px;font-size:12.5px;appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:140px;"
            bind:value={catFilter}>
            <option value="">—</option>
            {#each categories as c}<option value={c}>{$tcat(c)}</option>{/each}
          </select>
          <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:10px;">▾</span>
        </div>
      {/if}
    {/snippet}

    {#snippet table()}
      {#if tab === 'catalog'}
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

        {#if filteredProducts.length === 0}
          <p class="body text-center py-16">{$t('prod.empty')}</p>
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
      {:else}
        {#if pendingCount === 0}
          <p class="body text-center py-16">{$t('prod.suggestions.empty')}</p>
        {:else}
          {#if conversionPrompts.length > 0}
            <div class="flex flex-col gap-3 p-4">
              <p class="label text-fg-3" style="font-size:10.5px;">{$t('prod.conv.heading')}</p>
              {#each conversionPrompts as c (c.notificationId)}
                <div class="border border-divider rounded-lg p-3 flex flex-col gap-2"
                  style="border-left:3px solid var(--mep-warn);">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="badge flex items-center gap-1"
                      style="background:var(--mep-warn-soft);color:var(--mep-warn);">
                      <AlertTriangle size={11} />
                      {$t('prod.conv.badge')}
                    </span>
                    <p class="body" style="font-size:13px;">
                      {$ti('prod.conv.ask', { unit: c.purchaseUnit, ingredient: c.ingredient, supplier: c.supplierName })}
                    </p>
                  </div>
                  <form class="flex flex-wrap items-end gap-2"
                    onsubmit={(e) => saveConversion(c, e)}>
                    <div class="flex flex-col gap-1 min-w-[110px]">
                      <label class="label text-fg-3" style="font-size:10.5px;" for="conv-unit-{c.notificationId}">{$t('prod.conv.canonicalUnit')}</label>
                      <input id="conv-unit-{c.notificationId}" name="canonical_unit" required
                        class="input" style="height:32px;font-size:12.5px;padding:0 8px;" placeholder={$t('sup.conv.ph.canonical')} />
                    </div>
                    <div class="flex flex-col gap-1 min-w-[110px]">
                      <label class="label text-fg-3" style="font-size:10.5px;" for="conv-factor-{c.notificationId}">{$t('prod.conv.factor')}</label>
                      <input id="conv-factor-{c.notificationId}" name="conversion_factor" type="number" min="0.001" step="any" required
                        class="input" style="height:32px;font-size:12.5px;padding:0 8px;" placeholder={$t('sup.conv.ph.factor')} />
                    </div>
                    <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;"
                      disabled={conversionBusy[c.notificationId]}>
                      {$t('prod.conv.save')}
                    </button>
                  </form>
                  {#if conversionError[c.notificationId]}
                    <p class="body text-neg" style="font-size:12px;">{$t('prod.conv.error')}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
          {#if suggestions.length > 0}
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
        {/if}
      {/if}
    {/snippet}
  </ListPageTemplate>
</div>
