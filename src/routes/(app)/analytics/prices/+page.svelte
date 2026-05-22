<script lang="ts">
  import type { PageData } from './$types';
  import { truncate, fmt as fmtPrice } from '$lib/formatters';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-col gap-4 p-6">

  <!-- KPI: biggest increase / decrease -->
  <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">

    <div class="card p-4">
      <span class="label">{$t('prices.biggestIncrease')}</span>
      {#if data.top_increases.length}
        {@const top = data.top_increases[0]}
        <div class="num text-neg mt-1.5" style="font-size:20px;font-weight:700;">↑ {top.change_pct}%</div>
        <div class="body text-fg-2" style="font-size:12px;margin-top:3px;">{truncate(top.description, 32)}</div>
        <div class="body text-fg-3" style="font-size:12px;">{top.supplier_name}</div>
      {:else}
        <div class="num text-fg-3 mt-1.5" style="font-size:16px;font-weight:700;">—</div>
        <div class="body text-fg-3" style="font-size:12px;">{$t('prices.noData')}</div>
      {/if}
    </div>

    <div class="card p-4">
      <span class="label">{$t('prices.biggestDecrease')}</span>
      {#if data.top_decreases.length}
        {@const top = data.top_decreases[0]}
        <div class="num text-pos mt-1.5" style="font-size:20px;font-weight:700;">↓ {Math.abs(top.change_pct ?? 0).toFixed(1)}%</div>
        <div class="body text-fg-2" style="font-size:12px;margin-top:3px;">{truncate(top.description, 32)}</div>
        <div class="body text-fg-3" style="font-size:12px;">{top.supplier_name}</div>
      {:else}
        <div class="num text-fg-3 mt-1.5" style="font-size:16px;font-weight:700;">—</div>
        <div class="body text-fg-3" style="font-size:12px;">{$t('prices.noData')}</div>
      {/if}
    </div>

  </div>

  <!-- Filter -->
  <form method="get" action="/analytics/prices" class="flex gap-2 flex-wrap items-end">
    <div class="flex flex-col gap-1">
      <label class="label text-fg-3" style="font-size:10.5px;" for="supplier_id">{$t('inv.filter.supplier')}</label>
      <select id="supplier_id" name="supplier_id" class="input" style="height:32px;font-size:12.5px;padding:0 8px;">
        <option value="">{$t('inv.filter.all')}</option>
        {#each data.suppliers as s}
          <option value={s.id} selected={data.selected_supplier === s.id}>{s.name}</option>
        {/each}
      </select>
    </div>
    <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;">{$t('inv.filter.apply')}</button>
    {#if data.selected_supplier}
      <a href="/analytics/prices" class="btn btn-ghost" style="height:32px;font-size:12.5px;text-decoration:none;">{$t('inv.filter.clear')}</a>
    {/if}
  </form>

  <!-- Price history table -->
  <SectionCard title={$t('nav.analytics.prices')} sub="{data.items.length} {$t('prices.count')}" noPad>
    <div class="overflow-x-auto">
      {#if data.items.length}
        <table class="tbl" style="min-width:560px;">
          <thead>
            <tr>
              <th>{$t('tbl.desc')}</th>
              <th>{$t('tbl.supplier')}</th>
              <th>{$t('tbl.unit')}</th>
              <th class="num">{$t('tbl.latestPrice')}</th>
              <th class="num">{$t('tbl.prevPrice')}</th>
              <th class="num">{$t('tbl.change')}</th>
              <th>{$t('tbl.lastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.items as item}
              <tr class="row">
                <td class="body-strong">{item.description}</td>
                <td class="body text-fg-2" style="font-size:12px;">{item.supplier_name}</td>
                <td class="body text-fg-2" style="font-size:12px;">{item.unit ?? '—'}</td>
                <td class="num font-semibold">{fmtPrice(item.latest_price)} <span class="text-fg-3" style="font-size:11px;">EUR</span></td>
                <td class="num text-fg-2">{item.prev_price != null ? fmtPrice(item.prev_price) : '—'}</td>
                <td class="num">
                  {#if item.change_pct != null}
                    {#if item.change_pct > 0}
                      <span class="text-neg font-semibold">↑ {item.change_pct}%</span>
                    {:else if item.change_pct < 0}
                      <span class="text-pos font-semibold">↓ {Math.abs(item.change_pct).toFixed(1)}%</span>
                    {:else}
                      <span class="text-fg-3">→ 0%</span>
                    {/if}
                  {:else}
                    <span class="text-fg-3">—</span>
                  {/if}
                </td>
                <td class="body text-fg-2 whitespace-nowrap" style="font-size:12px;">{item.latest_date ?? '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="body text-center py-16">{$t('prices.noDataDesc')}</p>
      {/if}
    </div>
  </SectionCard>

</div>
