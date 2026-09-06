<script lang="ts">
  import { page } from '$app/state';
  import { locale, t, ti } from '$lib/i18n';
  import { fmtEur as fmtEurBase } from '$lib/formatters';
  import ListPageTemplate from '$lib/components/mep/ListPageTemplate.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';

  type PeriodKey = 'day' | 'month' | 'year' | 'all';

  const PERIODS: Array<[PeriodKey, string]> = [
    ['day', 'tpl.demo.period.day'], ['month', 'tpl.demo.period.month'],
    ['year', 'tpl.demo.period.year'], ['all', 'tpl.demo.period.all'],
  ];

  const period = $derived.by((): PeriodKey => {
    const requested = page.url.searchParams.get('period');
    return PERIODS.some(([value]) => value === requested) ? (requested as PeriodKey) : 'month';
  });

  interface Category { key: string; labelKey: string; color: string }
  const CATEGORIES: Category[] = [
    { key: 'carnes',  labelKey: 'tpl.demo.category.carnes',  color: 'var(--mep-series-1)' },
    { key: 'pescado', labelKey: 'tpl.demo.category.pescado', color: 'var(--mep-series-2)' },
    { key: 'lacteos', labelKey: 'tpl.demo.category.lacteos', color: 'var(--mep-series-3)' },
    { key: 'bebidas', labelKey: 'tpl.demo.category.bebidas', color: 'var(--mep-series-4)' },
  ];

  interface Row { id: number; name: string; category: string; unit: string; monthSpend: number; trend: number[] }

  const ITEMS: Row[] = [
    { id: 1, name: 'Solomillo de ternera', category: 'carnes',  unit: 'kg', monthSpend: 812.4, trend: [40, 55, 48, 62, 70, 68] },
    { id: 2, name: 'Merluza fresca',       category: 'pescado', unit: 'kg', monthSpend: 430.1, trend: [30, 28, 35, 33, 31, 29] },
    { id: 3, name: 'Queso curado',         category: 'lacteos', unit: 'kg', monthSpend: 210.0, trend: [10, 12, 11, 14, 13, 15] },
    { id: 4, name: 'Vino tinto crianza',   category: 'bebidas', unit: 'ud', monthSpend: 380.6, trend: [20, 22, 19, 25, 27, 24] },
    { id: 5, name: 'Pollo entero',         category: 'carnes',  unit: 'kg', monthSpend: 265.9, trend: [18, 20, 22, 19, 21, 23] },
    { id: 6, name: 'Gamba roja',           category: 'pescado', unit: 'kg', monthSpend: 590.0, trend: [45, 50, 47, 53, 58, 60] },
  ];

  const PERIOD_FACTOR: Record<PeriodKey, number> = { day: 0.05, month: 1, year: 11.5, all: 20 };
  const scaled = $derived(ITEMS.map(i => ({ ...i, monthSpend: Math.round(i.monthSpend * PERIOD_FACTOR[period] * 100) / 100 })));

  let search = $state('');
  let categoryFilter = $state('');
  let view = $state<'list' | 'chart'>('list');
  let selectedId = $state<number | null>(null);
  $effect(() => { if (view === 'chart') selectedId = null; });

  const filtered = $derived(scaled.filter(r => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q);
    const matchCat = !categoryFilter || r.category === categoryFilter;
    return matchSearch && matchCat;
  }));

  const totalSpend = $derived(scaled.reduce((s, r) => s + r.monthSpend, 0));
  const selected = $derived(filtered.find(r => r.id === selectedId) ?? null);

  let activeCats = $state<string[]>(CATEGORIES.map(c => c.key));
  function toggleCat(key: string) {
    activeCats = activeCats.includes(key) ? activeCats.filter(k => k !== key) : [...activeCats, key];
  }

  const trendXLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
  const trendSeries = $derived(
    CATEGORIES.filter(c => activeCats.includes(c.key)).map(c => ({
      key: c.key,
      label: t(c.labelKey),
      color: c.color,
      values: ITEMS.filter(i => i.category === c.key)
        .reduce((acc, i) => acc.map((v, idx) => v + (i.trend[idx] ?? 0)), [0, 0, 0, 0, 0, 0]),
    }))
  );

  function categoryLabel(key: string) { return t(CATEGORIES.find(c => c.key === key)?.labelKey ?? key); }
  function categoryColor(key: string) { return CATEGORIES.find(c => c.key === key)?.color ?? 'var(--mep-fg-3)'; }
  function fmtEur(v: number) { return fmtEurBase(v, locale.current); }
</script>

<div class="p-6 flex flex-col gap-4">
  <div>
    <div class="title">{t('tpl.demo.title')}</div>
    <p class="body" style="max-width:640px;margin-top:4px;">{t('tpl.demo.desc')}</p>
  </div>

  <ListPageTemplate
    dataCoach="plantilla-lista-main"
    bind:search
    bind:view
    searchPlaceholder={t('tpl.demo.searchPlaceholder')}
    {period}
    periodPills={PERIODS.map(([val, labelKey]) => ({ value: val, label: t(labelKey), href: `?period=${val}` }))}
    viewLabels={{ list: t('tpl.view.list'), chart: t('tpl.view.chart') }}
    kpis={[
      { key: 'total',  label: t('tpl.demo.kpi.total'), value: scaled.length, sub: t('tpl.demo.kpi.totalSub') },
      { key: 'spend',  label: t('tpl.demo.kpi.spend'), value: fmtEur(totalSpend), delta: 4.2, deltaCtx: t('tpl.demo.kpi.spendCtx') },
      { key: 'review', label: t('tpl.demo.kpi.review'), value: 0, sub: t('tpl.demo.kpi.reviewSub') },
    ]}
    trendTitle={t('tpl.demo.trendTitle')}
    trendBadges={CATEGORIES.map(c => ({ key: c.key, label: t(c.labelKey), color: c.color, active: activeCats.includes(c.key) }))}
    onToggleTrendBadge={toggleCat}
    {trendXLabels}
    {trendSeries}
    trendValueFormatter={fmtEur}
    trendEmptyLabel={t('tpl.demo.trendEmpty')}
  >
    {#snippet filters()}
      <div style="position:relative;">
        <select class="btn btn-secondary" style="appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:150px;" bind:value={categoryFilter}>
          <option value="">{t('tpl.demo.filterAll')}</option>
          {#each CATEGORIES as c}<option value={c.key}>{t(c.labelKey)}</option>{/each}
        </select>
        <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:11px;">▾</span>
      </div>
      <div style="flex:1;"></div>
      <button type="button" class="btn btn-primary" style="font-size:12.5px;gap:5px;">
        <Plus size={13} /> {t('tpl.demo.add')}
      </button>
    {/snippet}

    {#snippet table()}
      <div class="card-header">
        {#if selected}
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" class="btn btn-ghost" style="height:28px;font-size:12px;padding:0 8px 0 4px;gap:4px;" onclick={() => (selectedId = null)}>
              <ArrowLeft size={14} /> {t('tpl.demo.back')}
            </button>
            <span class="subtitle">{ti('tpl.demo.detailTitle', { name: selected.name })}</span>
          </div>
        {:else}
          <div class="section-title">
            <span class="subtitle">{t('tpl.demo.tableTitle')}</span>
            <span class="body" style="font-size:12px;">{ti('tpl.demo.itemCount', { n: filtered.length })}</span>
          </div>
        {/if}
      </div>
      {#if selected}
        <div style="padding:16px;">
          <p class="body" style="font-size:12.5px;">
            {ti('tpl.demo.detailBody', { category: categoryLabel(selected.category), unit: selected.unit, spend: fmtEur(selected.monthSpend), id: selected.id })}
          </p>
        </div>
      {:else if !filtered.length}
        <div style="text-align:center;padding:48px 24px;">
          <span class="body">{t('tpl.demo.empty')}</span>
        </div>
      {:else}
        <table class="tbl tbl-stack">
          <thead>
            <tr>
              <th>{t('tpl.demo.col.name')}</th>
              <th>{t('tpl.demo.col.category')}</th>
              <th>{t('tpl.demo.col.unit')}</th>
              <th class="num">{t('tpl.demo.col.spend')}</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as r (r.id)}
              <tr class="row" onclick={() => (selectedId = r.id)}>
                <td class="body-strong tbl-stack-lead">{r.name}</td>
                <td>
                  <span class="badge" style="background:color-mix(in oklab, {categoryColor(r.category)} 16%, transparent);color:{categoryColor(r.category)};">
                    {categoryLabel(r.category)}
                  </span>
                </td>
                <td class="body" style="font-size:12px;" data-label={t('tpl.demo.col.unit')}>{r.unit}</td>
                <td class="num" data-label={t('tpl.demo.col.spend')}>{fmtEur(r.monthSpend)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/snippet}
  </ListPageTemplate>
</div>
