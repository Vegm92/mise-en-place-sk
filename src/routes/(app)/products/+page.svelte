<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { t, ti, tcat, locale } from '$lib/i18n';
  import { invalidateAll } from '$app/navigation';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import PeriodPills from '$lib/components/mep/PeriodPills.svelte';
  import TrendLineChart from '$lib/components/mep/TrendLineChart.svelte';
  import Search from '@lucide/svelte/icons/search';
  import Plus from '@lucide/svelte/icons/plus';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  const { data, form }: { data: PageData; form: ActionData } = $props();
  const { products, suggestions, categories, colors, period, trend, trendCategories, budget_pills } = $derived(data);

  function budgetBucketLabel(bucket: string): string {
    if (bucket === 'Comida') return $t('suptype.comida');
    if (bucket === 'Bebidas') return $t('suptype.bebidas');
    return $t('spend.other');
  }

  const BUDGET_STATUS_COLOR: Record<string, string> = {
    ok: 'var(--mep-pos)',
    near: 'var(--mep-warn)',
    over: 'var(--mep-neg)',
    none: 'var(--mep-fg-3)',
  };

  const PERIODS: Array<['day' | 'month' | 'year' | 'all', string]> = [
    ['day',   'inv.period.day'],
    ['month', 'inv.period.month'],
    ['year',  'inv.period.year'],
    ['all',   'inv.period.all'],
  ];

  const SERIES_PALETTE = [
    'var(--mep-acc)', 'var(--mep-acc-2)', 'var(--mep-series-1)', 'var(--mep-series-2)',
    'var(--mep-series-3)', 'var(--mep-series-4)', 'var(--mep-series-5)', 'var(--mep-series-other)',
  ];
  const trendFmt = $derived(new Intl.DateTimeFormat($locale === 'en' ? 'en-US' : 'es-ES', { month: 'short' }));
  // Month-grain buckets always show the year -- same rule as every other
  // trend chart in the app, so the format never shifts between screens.
  function formatTrendBucketLabel(bucket: string): string {
    if (bucket.length === 7) {
      const [y, m] = bucket.split('-').map(Number);
      return `${trendFmt.format(new Date(y, m - 1, 1))} ${String(y).slice(2)}`;
    }
    const [, , d] = bucket.split('-');
    return String(Number(d));
  }
  let selectedTrendCats = $state<string[]>(trendCategories.slice(0, 4));
  function toggleTrendCat(key: string) {
    selectedTrendCats = selectedTrendCats.includes(key) ? selectedTrendCats.filter(k => k !== key) : [...selectedTrendCats, key];
  }
  const trendChart = $derived.by(() => {
    const buckets = [...new Set(trend.map(r => r.bucket))].sort();
    const series = selectedTrendCats.map((cat, i) => {
      const byBucket = new Map<string, number>();
      for (const r of trend) if (r.category === cat) byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + r.amount);
      return { key: cat, label: $tcat(cat), color: SERIES_PALETTE[i % SERIES_PALETTE.length], values: buckets.map(b => byBucket.get(b) ?? 0) };
    });
    return { xLabels: buckets.map(formatTrendBucketLabel), series };
  });

  let tab = $state<'catalog' | 'suggestions'>('catalog');
  let search = $state('');
  let catFilter = $state('');
  let showAddForm = $state(false);
  const filteredProducts = $derived(
    products.filter(p => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || p.canonicalName.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q);
      const matchCat = !catFilter || p.category === catFilter;
      return matchSearch && matchCat;
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

  <div style="display:flex;flex-wrap:wrap;gap:8px;">
    {#each budget_pills as pill (pill.bucket)}
      {@const statusColor = BUDGET_STATUS_COLOR[pill.status]}
      <a href="/budgets" class="badge" style="
          text-decoration:none;display:inline-flex;align-items:center;gap:6px;
          border:1px solid {statusColor};
          background:color-mix(in oklab, {statusColor} 10%, transparent);
        ">
        <span style="width:7px;height:7px;border-radius:50%;background:{pill.color};flex-shrink:0;"></span>
        <span style="color:var(--mep-fg);">{budgetBucketLabel(pill.bucket)}</span>
        <span style="color:{statusColor};font-weight:600;">
          {pill.pct === null ? $t('prod.budget.none') : $ti('prod.budget.pct', { pct: pill.pct })}
        </span>
      </a>
    {/each}
  </div>

  <div style="display:flex;align-items:center;gap:12px;">
    <div class="search-field">
      <span class="search-icon"><Search size={14} /></span>
      <input class="input" placeholder={$t('prod.searchPlaceholder')} bind:value={search} />
    </div>
    <PeriodPills active={period} pills={PERIODS.map(([val, labelKey]) => ({ value: val, label: $t(labelKey), href: `?period=${val}` }))} />
  </div>

  <div class="grid grid-cols-2 gap-3 max-[700px]:grid-cols-1">
    <KpiCard
      label={$t('prod.kpi.total')}
      value={products.length}
      sub={$t('inv.kpi.totalSub')}
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

  <div class="card" style="padding:16px;">
    <div class="subtitle" style="margin-bottom:12px;">{$t('prod.trend.title')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
      {#each trendCategories as cat}
        {@const active = selectedTrendCats.includes(cat)}
        {@const color = SERIES_PALETTE[selectedTrendCats.indexOf(cat) % SERIES_PALETTE.length]}
        <button type="button" onclick={() => toggleTrendCat(cat)} class="badge" style="
            cursor:pointer;border:1px solid {active ? color : 'var(--mep-border)'};
            background:{active ? `color-mix(in oklab, ${color} 12%, transparent)` : 'transparent'};color:{active ? color : 'var(--mep-fg-3)'};
          ">
          {$tcat(cat)}
        </button>
      {/each}
      {#if !trendCategories.length}<span class="body" style="font-size:12px;color:var(--mep-fg-3);">{$t('spend.kpi.noData')}</span>{/if}
    </div>
    <TrendLineChart xLabels={trendChart.xLabels} series={trendChart.series} valueFormatter={(v) => String(v)} emptyLabel={$t('spend.noDataYet')} />
  </div>

  <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
    <div style="position:relative;">
      <select class="btn btn-secondary"
        style="height:32px;font-size:12.5px;appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:130px;"
        bind:value={catFilter}>
        <option value="">{$t('sup.filterAllCategories')}</option>
        {#each categories as cat}
          <option value={cat}>{$tcat(cat)}</option>
        {/each}
      </select>
      <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:10px;">▾</span>
    </div>
    <div style="flex:1;"></div>
    <button type="button" class="btn btn-secondary"
      style="height:32px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;"
      onclick={() => (showAddForm = !showAddForm)}>
      <Plus size={13} /> {$t('prod.new.add')}
    </button>
  </div>

  {#if showAddForm}
    <div class="card p-4">
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
  {/if}

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
                  <span class="badge" style="background:color-mix(in oklab, {colors[p.category]} 16%, transparent);color:{colors[p.category]};">{$tcat(p.category)}</span>
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
