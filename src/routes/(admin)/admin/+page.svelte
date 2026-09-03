<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminSystemBanner from '$lib/components/admin/AdminSystemBanner.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  type ChipStatus = 'ok' | 'warn' | 'error';

  function fmt(n: number) { return n.toLocaleString('en-US'); }

  function countStatus(count: number, errorAbove: number): ChipStatus {
    if (count > errorAbove) return 'error';
    if (count > 0) return 'warn';
    return 'ok';
  }

  function sentryStatus(sentry: PageData['sentry']): ChipStatus {
    if (!sentry.configured) return 'warn';
    if (sentry.critical > 0) return 'error';
    if (sentry.unresolved > 0) return 'warn';
    return 'ok';
  }

  const chips = $derived([
    {
      label: $t('admin.chip.errors'),
      value: data.sentry.configured ? data.sentry.unresolved : '—',
      status: sentryStatus(data.sentry),
      href: '/admin/errors',
    },
    {
      label: $t('admin.chip.dlq'),
      value: data.deadLetters.pending,
      status: countStatus(data.deadLetters.pending, 25),
      href: '/admin/dead-letters',
    },
    {
      label: $t('admin.chip.stuck'),
      value: data.queue.stuck,
      status: countStatus(data.queue.stuck, 10),
    },
    {
      label: $t('admin.chip.pendingNotifs'),
      value: data.pendingNotifs,
      status: (data.pendingNotifs > 0 ? 'warn' : 'ok') as ChipStatus,
      href: '/admin/events',
    },
  ]);

  const delta = $derived(data.invoices7d - data.invoicesPrev7d);
  const deltaPct = $derived(
    data.invoicesPrev7d === 0
      ? null
      : Math.round((delta / data.invoicesPrev7d) * 100),
  );

  function relative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return $t('admin.justNow');
    if (mins < 60) return $ti('admin.minsAgo', { n: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return $ti('admin.hoursAgo', { n: hours });
    return $ti('admin.daysAgo', { n: Math.round(hours / 24) });
  }
</script>

<AdminPageHead route="/admin" title={$t('admin.overview')} subtitle={$t('admin.overviewSubtitle')} />

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <AdminSystemBanner
    status={data.overall}
    checkedAt={data.checkedAt}
    caption={$t('admin.systemStatus')}
    {chips}
  />

  {#if data.degraded}
    <div class="card" style="padding:12px 16px;font-size:13px;color:var(--mep-neg);background:var(--mep-neg-soft);border-color:var(--mep-neg-soft);">
      {$t('admin.degradedNotice')}
    </div>
  {/if}

  <div class="hud-grid hud-grid-2">
    <HudPanel title={$t('admin.last7days')}>
      <div class="hud-kpi-row">
        <div class="hud-kpi">
          <span class="hud-kpi-label">{$t('admin.invoicesSaved')}</span>
          <span class="hud-kpi-value" class:warn={delta < 0}>{fmt(data.invoices7d)}</span>
          <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">
            {deltaPct === null
              ? $ti('admin.prevPeriod', { n: data.invoicesPrev7d })
              : $ti('admin.vsPrevPct', { pct: (deltaPct > 0 ? '+' : '') + deltaPct })}
          </span>
        </div>
        <div class="hud-kpi">
          <span class="hud-kpi-label">{$t('admin.activeRestaurants')}</span>
          <span class="hud-kpi-value">{fmt(data.activeRestaurants7d)}</span>
          <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">{$ti('admin.ofTotal', { n: data.totalRestaurants })}</span>
        </div>
        <div class="hud-kpi">
          <span class="hud-kpi-label">{$t('admin.pendingExtractions')}</span>
          <span class="hud-kpi-value" class:warn={data.pendingExtractions > 0}>{fmt(data.pendingExtractions)}</span>
        </div>
      </div>
    </HudPanel>

    <HudPanel title={$t('admin.allTimeTotals')}>
      <div class="hud-kpi-row">
        <div class="hud-kpi">
          <span class="hud-kpi-label">{$t('admin.restaurants')}</span>
          <span class="hud-kpi-value">{fmt(data.totalRestaurants)}</span>
        </div>
        <div class="hud-kpi">
          <span class="hud-kpi-label">{$t('admin.invoices')}</span>
          <span class="hud-kpi-value">{fmt(data.totalInvoices)}</span>
        </div>
        <div class="hud-kpi">
          <span class="hud-kpi-label">{$t('admin.suppliers')}</span>
          <span class="hud-kpi-value">{fmt(data.totalSuppliers)}</span>
        </div>
      </div>
    </HudPanel>
  </div>

  <div class="hud-grid hud-grid-2">

    <HudPanel title={$t('admin.recentActivity')}>
      <AdminTableScroll>
        <table class="hud-table">
          <tbody>
            {#each data.recentActivity as ev (ev.id)}
              <tr>
                <td style="max-width:420px;overflow:hidden;">
                  <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                    <span style="font-size:10px;padding:2px 6px;border-radius:4px;flex-shrink:0;background:rgba(56,189,248,0.12);color:#38bdf8;text-transform:uppercase;letter-spacing:0.04em;">
                      {ev.notification_type.replace(/_/g, ' ')}
                    </span>
                    {#if ev.restaurant_name}
                      <span style="font-size:11px;color:#5b6472;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">
                        {ev.restaurant_name}
                      </span>
                    {/if}
                  </div>
                  <div style="font-size:11.5px;color:#e7edf5;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {ev.message}
                  </div>
                </td>
                <td class="r dim nowrap">{relative(ev.created_at)}</td>
              </tr>
            {:else}
              <tr><td colspan="2" class="empty">{$t('admin.noActivity')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
      <div style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.08);text-align:right;">
        <a href="/admin/events" style="font-size:11px;color:#38bdf8;text-decoration:none;">{$t('admin.viewAll')}</a>
      </div>
    </HudPanel>

    <HudPanel title={$t('admin.recentRestaurants')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.colName')}</th>
              <th scope="col" class="r">{$t('admin.invoices')}</th>
              <th scope="col" class="r">{$t('admin.suppliers')}</th>
              <th scope="col" class="r">{$t('admin.colCreated')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.recentRestaurants as r}
              <tr>
                <td>{r.name}</td>
                <td class="num r dim">{fmt(Number(r.invoice_count))}</td>
                <td class="num r dim">{fmt(Number(r.supplier_count))}</td>
                <td class="num r dim nowrap">{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="empty">{$t('admin.noRestaurants')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>

  </div>

</div>
