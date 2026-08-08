<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminKpiCard from '$lib/components/admin/AdminKpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  let { data }: { data: PageData } = $props();

  function fmt(n: number) { return n.toLocaleString('en-US'); }
</script>

<AdminPageHead route="/admin" title={$t('admin.overview')} subtitle={$t('admin.overviewSubtitle')} />

<div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:14px;">

  <div>
    <div class="label" style="margin-bottom:10px;">{$t('admin.last7days')}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;">
      <AdminKpiCard label={$t('admin.invoicesSaved')} value={fmt(data.invoices7d)} />
      <AdminKpiCard label={$t('admin.activeRestaurants')} value={fmt(data.activeRestaurants7d)} />
      <AdminKpiCard label={$t('admin.pendingNotifs')} value={fmt(data.pendingNotifs)}
        valueColor={data.pendingNotifs > 0 ? 'var(--mep-neg)' : 'var(--mep-fg)'} />
      <AdminKpiCard label={$t('admin.pendingExtractions')} value={fmt(data.pendingExtractions)}
        valueColor={data.pendingExtractions > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'} />
    </div>
  </div>

  <div>
    <div class="label" style="margin-bottom:10px;">{$t('admin.allTimeTotals')}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;">
      <AdminKpiCard label={$t('admin.restaurants')} value={fmt(data.totalRestaurants)} />
      <AdminKpiCard label={$t('admin.invoices')} value={fmt(data.totalInvoices)} />
      <AdminKpiCard label={$t('admin.suppliers')} value={fmt(data.totalSuppliers)} />
    </div>
  </div>

  <SectionCard title={$t('admin.recentRestaurants')} noPad>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid var(--mep-divider);">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colName')}</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.invoices')}</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.suppliers')}</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colCreated')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.recentRestaurants as r}
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <td style="padding:9px 16px;font-weight:500;color:var(--mep-fg);">{r.name}</td>
            <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{fmt(Number(r.invoice_count))}</td>
            <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{fmt(Number(r.supplier_count))}</td>
            <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-3);font-size:12px;">
              {new Date(r.created_at).toLocaleDateString('en-GB')}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.noRestaurants')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </SectionCard>

  <section style="display:flex;gap:10px;flex-wrap:wrap;">
    <a href="/admin/revenue" class="btn btn-secondary" style="text-decoration:none;">
      {$t('admin.revenue')}
    </a>
    <a href="/admin/events" class="btn btn-secondary" style="text-decoration:none;">
      {$t('admin.viewEvents')}
    </a>
    <a href="/admin/health" class="btn btn-secondary" style="text-decoration:none;">
      {$t('admin.systemHealthLink')}
    </a>
  </section>

</div>
