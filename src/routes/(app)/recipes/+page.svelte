<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { page } from '$app/state';
  import { t, ti } from '$lib/i18n';
  import { seriesColor } from '$lib/colors';
  import { fmtEur } from '$lib/formatters';
  import ListPageTemplate from '$lib/components/mep/ListPageTemplate.svelte';
  import MobileRecipes from '$lib/components/mobile/MobileRecipes.svelte';
  import PeriodPills from '$lib/components/mep/PeriodPills.svelte';
  import { PERIOD_PILLS } from '$lib/constants';
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  const { data, form }: { data: PageData; form: ActionData } = $props();
  const { recipes, sections, statuses } = $derived(data);

  let search        = $state('');
  let sectionFilter = $state('');
  let kindFilter    = $state('');
  let statusFilter  = $state('');
  let view          = $state<'list' | 'chart'>('list');

  const BADGE_CLASS: Record<string, string> = {
    draft: 'badge badge-pending',
    active: 'badge badge-confirmed',
    archived: 'badge badge-neutral',
  };

  const filtered = $derived(
    recipes.filter((r) => {
      const q = search.trim().toLowerCase();
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (sectionFilter && r.section !== sectionFilter) return false;
      if (kindFilter && r.kind !== kindFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    })
  );

  const quotaMax = $derived(form && 'max' in form ? Number(form.max) : 0);

  const quotaReached = $derived(
    data.maxRecipes !== null && data.usedRecipes >= data.maxRecipes
  );

  const kpis = $derived([
    {
      key: 'total',
      label: $t('rec.kpi.total'),
      value: String(recipes.length),
      sub: data.maxRecipes === null
        ? undefined
        : $ti('rec.kpi.quota', { used: data.usedRecipes, max: data.maxRecipes }),
    },
    {
      key: 'foodCost',
      label: $t('rec.kpi.avgFoodCost'),
      value: data.avgFoodCost === null ? '—' : `${data.avgFoodCost.toFixed(1)} %`,
      variant: (data.avgFoodCost !== null && data.avgFoodCost > 35 ? 'warn' : 'default') as 'warn' | 'default',
    },
    {
      key: 'margin',
      label: $t('rec.kpi.avgMargin'),
      value: data.avgMarginCents === null ? '—' : fmtEur(data.avgMarginCents / 100),
    },
    {
      key: 'missing',
      label: $t('rec.kpi.missingPrice'),
      value: String(data.missingPriceTotal),
      variant: (data.missingPriceTotal > 0 ? 'warn' : 'default') as 'warn' | 'default',
    },
  ]);

  const periodPills = $derived(PERIOD_PILLS.map((p) => {
    const params = new URLSearchParams(page.url.searchParams);
    params.set('period', p.value);
    return { value: p.value, label: $t(p.labelKey), href: `/recipes?${params.toString()}` };
  }));

  const trendSeries = $derived(
    data.trendData.series.map((s, i) => ({
      key: s.key, label: $t(s.label), color: seriesColor(i), values: s.values,
    }))
  );
</script>

<svelte:head><title>{$t('rec.title')}</title></svelte:head>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileRecipes recipes={recipes} sections={sections} statuses={statuses} />
</div>

<div class="hidden md:block">
<div class="flex flex-col gap-1 mb-4">
  <h1 class="title">{$t('rec.title')}</h1>
  <p class="body text-fg-3" style="font-size:13px;">{$t('rec.subtitle')}</p>
</div>

<ListPageTemplate
  bind:search
  bind:view
  searchPlaceholder={$t('rec.search')}
  {kpis}
  viewLabels={{ list: $t('tpl.view.list'), chart: $t('tpl.view.chart') }}
  trendTitle={$t('rec.trend.title')}
  trendXLabels={data.trendData.xLabels}
  trendSeries={trendSeries}
  trendEmptyLabel={$t('tpl.trend.empty')}
>
  {#snippet topBar()}
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div class="search-field">
        <span class="search-icon"><Search size={14} /></span>
        <input class="input" placeholder={$t('rec.search')} bind:value={search} />
      </div>
      <PeriodPills active={data.period} pills={periodPills} />
    </div>
  {/snippet}

  {#snippet filters()}
    <select class="input" style="padding:0 8px;max-width:170px;" bind:value={sectionFilter}
      aria-label={$t('rec.filter.section')}>
      <option value="">{$t('rec.filter.section')}: {$t('rec.filter.all')}</option>
      {#each sections as s}<option value={s}>{$t(`rec.section.${s}`)}</option>{/each}
    </select>
    <select class="input" style="padding:0 8px;max-width:150px;" bind:value={kindFilter}
      aria-label={$t('rec.filter.kind')}>
      <option value="">{$t('rec.filter.kind')}: {$t('rec.filter.all')}</option>
      <option value="plato">{$t('rec.kind.plato')}</option>
      <option value="elaboracion">{$t('rec.kind.elaboracion')}</option>
    </select>
    <select class="input" style="padding:0 8px;max-width:150px;" bind:value={statusFilter}
      aria-label={$t('rec.filter.status')}>
      <option value="">{$t('rec.filter.status')}: {$t('rec.filter.all')}</option>
      {#each statuses as s}<option value={s}>{$t(`rec.status.${s}`)}</option>{/each}
    </select>
  {/snippet}

  {#snippet table()}
    <div class="p-4 border-b border-divider">
      <form method="post" action="?/create" class="flex flex-wrap items-end gap-2">
        <div class="flex flex-col gap-1 min-w-[220px]">
          <label class="label text-fg-3" for="rec-name">{$t('rec.new.name')}</label>
          <input id="rec-name" name="name" required class="input" style="padding:0 8px;" />
        </div>
        <div class="flex flex-col gap-1 min-w-[150px]">
          <label class="label text-fg-3" for="rec-kind">{$t('rec.new.kind')}</label>
          <select id="rec-kind" name="kind" class="input" style="padding:0 8px;">
            <option value="plato">{$t('rec.kind.plato')}</option>
            <option value="elaboracion">{$t('rec.kind.elaboracion')}</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="font-size:13px;gap:5px;" disabled={quotaReached}>
          <Plus size={13} />
          {$t('rec.new.add')}
        </button>
      </form>

      {#if form?.error}
        <p class="body text-neg flex items-center gap-2" style="font-size:11px;margin-top:8px;">
          <span>
            {#if form.error === 'rec.err.quota'}
              {$ti('rec.err.quota', { max: quotaMax })}
            {:else}
              {$t(form.error)}
            {/if}
          </span>
          {#if form.error === 'rec.err.quota'}
            <a href="/billing?upgrade=escandallos" class="btn btn-secondary" style="font-size:11px;">
              {$t('rec.quota.upgrade')}
            </a>
          {/if}
        </p>
      {/if}

      {#if data.cycleCount > 0}
        <p class="body text-warn flex items-center gap-1" style="font-size:11px;margin-top:8px;">
          <AlertTriangle size={12} />
          {$ti('rec.warn.cycle', { n: data.cycleCount })}
        </p>
      {/if}
    </div>

    {#if recipes.length === 0}
      <p class="body text-center py-16">{$t('rec.empty')}</p>
    {:else if filtered.length === 0}
      <p class="body text-center py-16">{$t('rec.emptyFiltered')}</p>
    {:else}
      <table class="tbl tbl-stack">
        <thead>
          <tr>
            <th>{$t('rec.col.name')}</th>
            <th>{$t('rec.col.section')}</th>
            <th class="num">{$t('rec.col.portions')}</th>
            <th class="num">{$t('rec.col.costPerPortion')}</th>
            <th class="num">{$t('rec.col.price')}</th>
            <th class="num">{$t('rec.col.foodCost')}</th>
            <th class="num">{$t('rec.col.margin')}</th>
            <th>{$t('rec.col.status')}</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as r (r.id)}
            <tr class="row">
              <td class="tbl-stack-lead">
                <a href="/recipes/{r.id}" class="body-strong" style="text-decoration:none;color:inherit;">{r.name}</a>
                {#if r.kind === 'elaboracion'}
                  <span class="chip" style="margin-left:6px;">{$t('rec.kind.elaboracion')}</span>
                {/if}
                {#if r.missingPriceCount > 0}
                  <span class="text-warn" style="margin-left:6px;" title={$ti('rec.warn.noPrice', { n: r.missingPriceCount })}>
                    <AlertTriangle size={12} />
                  </span>
                {/if}
              </td>
              <td class="body text-fg-3" style="font-size:11px;" data-label={$t('rec.col.section')}>
                {r.section ? $t(`rec.section.${r.section}`) : '—'}
              </td>
              <td class="num" data-label={$t('rec.col.portions')}>{r.portions}</td>
              <td class="num" data-label={$t('rec.col.costPerPortion')}>{fmtEur(r.costPerPortionCents / 100)}</td>
              <td class="num" data-label={$t('rec.col.price')}>
                {r.grossPriceCents === null ? '—' : fmtEur(r.grossPriceCents / 100)}
              </td>
              <td class="num" data-label={$t('rec.col.foodCost')}>
                {r.foodCostPct === null ? '—' : `${r.foodCostPct.toFixed(1)} %`}
              </td>
              <td class="num" data-label={$t('rec.col.margin')}>
                {r.marginCents === null ? '—' : fmtEur(r.marginCents / 100)}
              </td>
              <td data-label={$t('rec.col.status')}>
                <span class={BADGE_CLASS[r.status] ?? 'badge badge-neutral'}>{$t(`rec.status.${r.status}`)}</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/snippet}
</ListPageTemplate>
</div>
