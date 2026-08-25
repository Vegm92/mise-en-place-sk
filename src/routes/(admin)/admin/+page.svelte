<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminKpiCard from '$lib/components/admin/AdminKpiCard.svelte';
  import AdminSystemBanner from '$lib/components/admin/AdminSystemBanner.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
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

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:14px;">

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

  <div>
    <div class="label" style="margin-bottom:10px;">{$t('admin.last7days')}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;">
      <AdminKpiCard
        label={$t('admin.invoicesSaved')}
        value={fmt(data.invoices7d)}
        sub={deltaPct === null
          ? $ti('admin.prevPeriod', { n: data.invoicesPrev7d })
          : $ti('admin.vsPrevPct', { pct: (deltaPct > 0 ? '+' : '') + deltaPct })}
        valueColor={delta < 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'} />
      <AdminKpiCard label={$t('admin.activeRestaurants')} value={fmt(data.activeRestaurants7d)}
        sub={$ti('admin.ofTotal', { n: data.totalRestaurants })} />
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

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));gap:14px;align-items:start;">

    <SectionCard title={$t('admin.recentActivity')} noPad
      href="/admin/events" actionLabel={$t('admin.viewAll')}>
      <AdminTableScroll>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tbody>
            {#each data.recentActivity as ev (ev.id)}
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <td style="padding:9px 16px;min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="num" style="
                      font-size:10px;padding:2px 6px;border-radius:4px;flex-shrink:0;
                      background:var(--mep-acc-soft);color:var(--mep-acc);
                      text-transform:uppercase;letter-spacing:0.04em;
                    ">{ev.notification_type.replace(/_/g, ' ')}</span>
                    {#if ev.restaurant_name}
                      <span style="font-size:11.5px;color:var(--mep-fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        {ev.restaurant_name}
                      </span>
                    {/if}
                  </div>
                  <div style="font-size:12px;color:var(--mep-fg-2);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {ev.message}
                  </div>
                </td>
                <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-3);font-size:11.5px;white-space:nowrap;vertical-align:top;">
                  {relative(ev.created_at)}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="2" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.noActivity')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </SectionCard>

    <SectionCard title={$t('admin.recentRestaurants')} noPad>
      <AdminTableScroll>
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
      </AdminTableScroll>
    </SectionCard>

  </div>

</div>
