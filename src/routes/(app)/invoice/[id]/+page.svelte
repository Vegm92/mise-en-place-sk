<script lang="ts">
  import type { PageData } from './$types';
  import { locale, t } from '$lib/i18n';
  import MobileInvoiceDetail from '$lib/components/mobile/MobileInvoiceDetail.svelte';

  let { data }: { data: PageData } = $props();
  const { invoice, lineItems } = $derived(data);

  let confirmDelete = $state(false);

  function fmt(n: number | null | undefined) {
    if (n == null) return '—';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function fmtDate(s: Date | string | null | undefined) {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString($locale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const statusBadge: Record<string, string> = {
    confirmed: 'badge badge-confirmed',
    pending:   'badge badge-pending',
    exported:  'badge badge-exported',
    overdue:   'badge badge-overdue',
  };

  const timelineEvents = $derived([
    { labelKey: 'inv.detail.uploaded',  ts: invoice.created_at },
    { labelKey: 'inv.detail.extracted', ts: invoice.created_at },
    ...(invoice.status === 'confirmed' || invoice.status === 'exported'
      ? [{ labelKey: 'inv.detail.confirmed', ts: null }]
      : []),
  ]);
</script>

<!-- Mobile invoice detail -->
<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileInvoiceDetail {invoice} {lineItems} />
</div>

<!-- Desktop invoice detail -->
<div class="hidden md:block">
<div style="padding:24px;display:flex;flex-direction:column;gap:16px;max-width:1100px;margin:0 auto;">

  <!-- Breadcrumb -->
  <nav style="display:flex;align-items:center;gap:6px;">
    <a href="/invoices" class="body" style="color:var(--mep-fg-3);text-decoration:none;">
      {$t('nav.invoices')}
    </a>
    <span class="body" style="color:var(--mep-fg-4);">/</span>
    <span class="body-strong">{invoice.invoice_number ?? `#${invoice.id}`}</span>
  </nav>

  <!-- Main two-column panel -->
  <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">

    <!-- Left: doc viewer (45%) -->
    <div class="card" style="flex:0 0 44%;min-width:280px;overflow:hidden;">
      <!-- Filename header -->
      <div class="card-header">
        <div class="section-title">
          <span class="body-strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;">
            {invoice.source_file ?? 'invoice.pdf'}
          </span>
        </div>
        <!-- Zoom controls (decorative) -->
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost" style="width:28px;height:28px;padding:0;justify-content:center;font-size:15px;" title={$t('a11y.zoomOut')}>−</button>
          <span class="body" style="align-self:center;padding:0 4px;font-size:12px;">100%</span>
          <button class="btn btn-ghost" style="width:28px;height:28px;padding:0;justify-content:center;font-size:15px;" title={$t('a11y.zoomIn')}>+</button>
        </div>
      </div>

      <!-- Faux PDF area -->
      <div style="
        min-height:320px;
        background-image: radial-gradient(circle, var(--mep-border) 1px, transparent 1px);
        background-size: 20px 20px;
        background-color: var(--mep-surface-2);
        display:flex;align-items:center;justify-content:center;
        padding:32px;
      ">
        <div style="
          background:var(--mep-surface);
          border:1px solid var(--mep-border);
          border-radius:var(--mep-r-card);
          box-shadow:var(--mep-shadow-pop);
          width:100%;max-width:320px;
          padding:32px 24px;
          display:flex;flex-direction:column;gap:16px;
        ">
          <div style="font-size:15px;font-weight:600;color:var(--mep-fg);">{$t('inv.docTitle')}</div>
          <div class="divider"></div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div class="body"><span class="label">{$t('field.supplier')}: </span>{invoice.supplier_name ?? '—'}</div>
            <div class="body"><span class="label">{$t('tbl.invoice')}: </span>{invoice.invoice_number ?? '—'}</div>
            <div class="body"><span class="label">{$t('tbl.date')}: </span>{fmtDate(invoice.invoice_date)}</div>
          </div>
          <div class="divider"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="label">{$t('tbl.total')}</span>
            <span class="num" style="font-size:18px;font-weight:700;color:var(--mep-fg);">{fmt(invoice.total_amount)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: details + actions (55%) -->
    <div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:12px;">

      <!-- Fields card -->
      <div class="card p-4" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span class="title" style="font-size:18px;">{invoice.invoice_number ?? `Invoice #${invoice.id}`}</span>
          <span class={statusBadge[invoice.status ?? 'pending'] ?? 'badge badge-neutral'}>
            {$t(`status.${invoice.status}` as `status.pending`)}
          </span>
        </div>

        <div class="divider"></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.supplier')}</span>
            <span class="body-strong">{invoice.supplier_name ?? '—'}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.invoiceNum')}</span>
            <span class="body-strong">{invoice.invoice_number ?? '—'}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.invoiceDate')}</span>
            <span class="body-strong">{fmtDate(invoice.invoice_date)}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.dueDate')}</span>
            <span class="body-strong">{fmtDate(invoice.due_date)}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.totalAmount')}</span>
            <span class="num body-strong" style="font-size:17px;">{fmt(invoice.total_amount)}</span>
          </div>
        </div>

        {#if invoice.notes}
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('inv.detail.notes')}</span>
            <span class="body" style="line-height:1.5;">{invoice.notes}</span>
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a
          href="/invoice/{invoice.id}/edit"
          class="btn btn-primary"
          style="text-decoration:none;"
        >
          {$t('action.edit')}
        </a>
        {#if invoice.source_file}
          <a
            href="/invoice/{invoice.id}/file"
            class="btn btn-secondary"
            download
            style="text-decoration:none;"
          >
            {$t('inv.detail.downloadPdf')}
          </a>
        {/if}
        {#if !confirmDelete}
          <button
            class="btn btn-ghost"
            style="color:var(--mep-neg);"
            onclick={() => confirmDelete = true}
          >
            {$t('inv.detail.delete')}
          </button>
        {:else}
          <form method="post" action="?/delete" style="display:flex;gap:6px;align-items:center;">
            <span class="body" style="color:var(--mep-neg);font-size:12px;">{$t('inv.detail.sure')}</span>
            <button type="submit" class="btn btn-secondary" style="color:var(--mep-neg);border-color:var(--mep-neg);">
              {$t('inv.detail.confirmDelete')}
            </button>
            <button type="button" class="btn btn-ghost" onclick={() => confirmDelete = false}>
              {$t('edit.cancel')}
            </button>
          </form>
        {/if}
      </div>
    </div>
  </div>

  <!-- Line items -->
  {#if lineItems.length > 0}
    <div class="card" style="overflow:hidden;">
      <div class="card-header">
        <div class="section-title">
          <span class="subtitle">{$t('extract.lineItems')}</span>
        </div>
      </div>
      <table class="tbl">
        <thead>
          <tr>
            <th>{$t('tbl.desc')}</th>
            <th class="num">{$t('tbl.qty')}</th>
            <th>{$t('tbl.unit')}</th>
            <th class="num">{$t('tbl.unitPrice')}</th>
            <th class="num">{$t('tbl.total')}</th>
          </tr>
        </thead>
        <tbody>
          {#each lineItems as item}
            <tr>
              <td class="body-strong">{item.description ?? '—'}</td>
              <td class="num">{item.quantity ?? '—'}</td>
              <td class="body">{item.unit ?? '—'}</td>
              <td class="num">{fmt(item.unit_price)}</td>
              <td class="num">{fmt(item.total_price)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Activity timeline -->
  <div class="card p-4" style="display:flex;flex-direction:column;gap:12px;">
    <span class="subtitle" style="font-size:15px;">{$t('inv.detail.activity')}</span>
    <div style="display:flex;flex-direction:column;gap:0;">
      {#each timelineEvents as ev, i}
        <div style="display:flex;gap:12px;align-items:flex-start;{i < timelineEvents.length - 1 ? 'padding-bottom:14px;' : ''}">
          <!-- Dot + line -->
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:16px;">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--mep-acc);margin-top:4px;flex-shrink:0;"></div>
            {#if i < timelineEvents.length - 1}
              <div style="width:1px;flex:1;background:var(--mep-divider);margin-top:4px;min-height:20px;"></div>
            {/if}
          </div>
          <!-- Content -->
          <div style="display:flex;flex-direction:column;gap:1px;">
            <span class="body-strong" style="font-size:12.5px;">{$t(ev.labelKey)}</span>
            {#if ev.ts}
              <span class="body" style="font-size:11px;">{fmtDate(ev.ts)}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

</div>
</div><!-- end desktop wrapper -->
