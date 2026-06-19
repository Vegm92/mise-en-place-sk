<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  let { data }: { data: PageData } = $props();

  function fmt(n: number) { return n.toLocaleString('en-US'); }
</script>

<div style="padding:28px 32px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:24px;">

  <h2 style="margin:0;font-size:22px;font-weight:600;color:#111;letter-spacing:-0.3px;">{$t('admin.overview')}</h2>

  <!-- 7-day KPIs -->
  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.last7days')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.invoicesSaved')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;">{fmt(data.invoices7d)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.activeRestaurants')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;">{fmt(data.activeRestaurants7d)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.pendingNotifs')}</div>
        <div style="font-size:26px;font-weight:700;color:{data.pendingNotifs > 0 ? '#dc2626' : '#111'};letter-spacing:-0.5px;">{fmt(data.pendingNotifs)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.pendingExtractions')}</div>
        <div style="font-size:26px;font-weight:700;color:{data.pendingExtractions > 0 ? '#d97706' : '#111'};letter-spacing:-0.5px;">{fmt(data.pendingExtractions)}</div>
      </div>
    </div>
  </section>

  <!-- Totals -->
  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.allTimeTotals')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.restaurants')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;">{fmt(data.totalRestaurants)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.invoices')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;">{fmt(data.totalInvoices)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.suppliers')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;">{fmt(data.totalSuppliers)}</div>
      </div>
    </div>
  </section>

  <!-- Recent restaurants -->
  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.recentRestaurants')}
    </div>
    <div class="card" style="overflow:hidden;padding:0;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colName')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.invoices')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.suppliers')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colCreated')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.recentRestaurants as r}
            <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
              <td style="padding:9px 16px;font-weight:500;color:#111;">{r.name}</td>
              <td style="padding:9px 16px;text-align:right;color:#555;" class="num">{fmt(Number(r.invoice_count))}</td>
              <td style="padding:9px 16px;text-align:right;color:#555;" class="num">{fmt(Number(r.supplier_count))}</td>
              <td style="padding:9px 16px;text-align:right;color:#888;font-size:12px;">
                {new Date(r.created_at).toLocaleDateString('en-GB')}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="4" style="padding:24px 16px;text-align:center;color:#aaa;">{$t('admin.noRestaurants')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Links -->
  <section style="display:flex;gap:10px;flex-wrap:wrap;">
    <a href="/admin/events" style="padding:8px 16px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
      {$t('admin.viewEvents')}
    </a>
    <a href="/admin/health" style="padding:8px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
      {$t('admin.systemHealthLink')}
    </a>
  </section>

</div>
