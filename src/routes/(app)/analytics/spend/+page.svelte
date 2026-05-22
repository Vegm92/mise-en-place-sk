<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();

  const periods: Array<[string, string]> = [
    ['month',   'spend.period.month'],
    ['quarter', 'spend.period.quarter'],
    ['half',    'spend.period.half'],
    ['all',     'spend.period.all'],
  ];
</script>

<div class="flex flex-col gap-4 p-6">

  <!-- Period picker -->
  <div class="flex gap-2 flex-wrap">
    {#each periods as [val, key]}
      <a href="?period={val}"
        class="btn {data.period === val ? 'btn-primary' : 'btn-ghost'}"
        style="height:32px;font-size:12.5px;text-decoration:none;">
        {$t(key)}
      </a>
    {/each}
  </div>

  <!-- KPI strip -->
  <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
    <KpiCard label={$t('spend.totalSpend')} value="€{Math.round(data.kpis.total_items_spend ?? 0).toLocaleString()}" />
    <KpiCard label={$t('spend.lineItems')}  value={data.kpis.total_line_items} />
    <KpiCard label={$t('spend.uniqueItems')} value={data.kpis.unique_items} />
    <KpiCard label={$t('spend.avgItems')}
      value={data.kpis.avg_invoice_items != null ? data.kpis.avg_invoice_items.toFixed(1) : '—'} />
  </div>

  <!-- Charts row -->
  <div class="grid gap-3 max-md:grid-cols-1" style="grid-template-columns:3fr 2fr;">

    <SectionCard title={$t('spend.topItems')}>
      {#if !data.top_items.length}
        <p class="body">{$t('spend.noItems')}</p>
      {:else}
        <div class="flex flex-col gap-3">
          {#each data.top_items as item (item.description)}
            <div class="flex items-center gap-3">
              <span class="body-strong overflow-hidden text-ellipsis whitespace-nowrap flex-shrink-0"
                style="width:160px;font-size:13px;" title={item.description}>{item.description}</span>
              <div class="flex-1 bg-divider rounded-sm h-1.5 overflow-hidden">
                <div class="h-full rounded-sm bg-acc" style="width:{item.pct}%"></div>
              </div>
              <span class="num font-semibold flex-shrink-0" style="width:70px;text-align:right;font-size:13px;">
                €{Math.round(item.total_spend)}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </SectionCard>

    <SectionCard title={$t('spend.byCategory')}>
      {#if !data.category_spend.length}
        <p class="body">{$t('spend.noCategory')}</p>
      {:else}
        <div class="flex flex-col gap-3">
          {#each data.category_spend as cat (cat.category)}
            <div class="flex items-center gap-3">
              <span class="body-strong overflow-hidden text-ellipsis whitespace-nowrap flex-shrink-0"
                style="width:160px;font-size:13px;color:{cat.color};" title={cat.category}>{cat.category}</span>
              <div class="flex-1 bg-divider rounded-sm h-1.5 overflow-hidden">
                <div class="h-full rounded-sm" style="width:{cat.pct}%;background:{cat.color};"></div>
              </div>
              <span class="num font-semibold flex-shrink-0" style="width:70px;text-align:right;font-size:13px;">
                €{Math.round(cat.total)}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </SectionCard>

  </div>
</div>
